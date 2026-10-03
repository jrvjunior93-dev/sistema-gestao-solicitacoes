'use strict';

const { Anexo, Comprovante, Contrato, ContratoParcela, Solicitacao, TituloFinanceiro } = require('../models');
const { getFinanceiroObraScopeIds } = require('./authorizationService');

/**
 * OS ARQUIVOS DE UMA LINHA DO RELATORIO FINANCEIRO DE OBRAS (item 22 do lote de 23/08).
 *
 * Pedido do cliente: *"cada linha e um pagamento; clicando na linha, da para ver os arquivos
 * vinculados aquele titulo e/ou a solicitacao vinculada a ele."*
 *
 * A segunda metade da frase e a que manda, e foi confirmada no banco: **nem `anexos` nem
 * `comprovantes` apontam para o titulo** — as duas apontam para a SOLICITACAO. Entao "os arquivos
 * daquele titulo" sao, na pratica, os da solicitacao vinculada a ele.
 *
 * Consequencia que a tela precisa mostrar em vez de esconder: titulo SEM solicitacao (importado do
 * historico, lancado a mao) nao tem arquivo nenhum. A resposta diz isso com `motivo`, para a tela
 * poder explicar em vez de abrir uma janela vazia.
 *
 * ROTA PROPRIA, E NAO `/solicitacoes/:id/anexos`. Aquela e do modulo de solicitacoes e cobra a
 * permissao DE LA: quem le o relatorio financeiro pode nao ter acesso a solicitacao, e tomaria 403
 * clicando numa linha do proprio relatorio.
 *
 * E por isso esta funcao e estreita de proposito:
 *
 * - recebe o **titulo**, nao a solicitacao. Quem chama nao escolhe qual solicitacao ler;
 * - confere que o titulo esta no ESCOPO DE OBRAS do usuario, com a mesma funcao que o relatorio usa;
 * - so LE, e devolve apenas nome, caminho e data.
 *
 * Sem essas tres, ela viraria um caminho lateral para ler anexo de qualquer solicitacao passando um
 * id qualquer — que e exatamente o buraco que a rota separada existe para nao abrir.
 */
const erro = (mensagem, statusCode = 400) => Object.assign(new Error(mensagem), { statusCode });

/**
 * A solicitacao de um titulo que e PARCELA DE CONTRATO.
 *
 * Achado ao construir o item 22: os titulos do contrato do fluxo novo tem `solicitacao_id` NULO. Eles
 * nascem por `criarTituloManual` na aprovacao, e essa chamada nunca passou o campo — entao o titulo
 * de um contrato, justamente o caso central deste lote, respondia "nao veio de uma solicitacao".
 *
 * O elo existe por outro caminho: `contrato_parcelas.titulo_financeiro_id` -> `contratos.solicitacao_id`.
 *
 * Preencher `titulos_financeiros.solicitacao_id` na aprovacao seria o dado mais correto, e nao foi
 * feito aqui de proposito: essa coluna e consultada por varias telas do Financeiro, e mudar quais
 * titulos elas passam a enxergar e uma alteracao de alcance desconhecido — grande demais para entrar
 * de carona num item sobre abrir arquivo. Fica registrado como pendencia com mapa proprio.
 */
async function solicitacaoPelaParcelaDoContrato(tituloId) {
  const parcela = await ContratoParcela.findOne({
    where: { titulo_financeiro_id: Number(tituloId) },
    attributes: ['id', 'contrato_id']
  });
  if (!parcela) return null;

  const contrato = await Contrato.findByPk(parcela.contrato_id, { attributes: ['id', 'solicitacao_id'] });
  return contrato?.solicitacao_id || null;
}

async function listarArquivosDoTitulo(req, tituloId) {
  const id = Number(tituloId);
  if (!Number.isInteger(id) || id <= 0) throw erro('Titulo invalido.');

  const titulo = await TituloFinanceiro.findByPk(id, {
    attributes: ['id', 'codigo', 'obra_id', 'solicitacao_id']
  });
  if (!titulo) throw erro('Titulo nao encontrado.', 404);

  // O MESMO escopo do relatorio. `null` significa "todas as obras" para este usuario.
  const obrasPermitidas = await getFinanceiroObraScopeIds(req.user);
  if (obrasPermitidas !== null) {
    if (!obrasPermitidas.length || !obrasPermitidas.includes(Number(titulo.obra_id))) {
      throw erro('Acesso negado: este titulo nao pertence a uma obra do seu acesso.', 403);
    }
  }

  const solicitacaoId = titulo.solicitacao_id || await solicitacaoPelaParcelaDoContrato(titulo.id);

  if (!solicitacaoId) {
    return {
      titulo_id: titulo.id,
      titulo_codigo: titulo.codigo,
      solicitacao_id: null,
      arquivos: [],
      // Nao e erro: e o estado normal de um titulo importado ou lancado a mao. A tela mostra isto.
      motivo: 'Este titulo nao veio de uma solicitacao, entao nao ha arquivos vinculados a ele.'
    };
  }

  const solicitacao = await Solicitacao.findByPk(solicitacaoId, {
    attributes: ['id', 'codigo']
  });

  const [anexos, comprovantes] = await Promise.all([
    Anexo.findAll({
      where: { solicitacao_id: solicitacaoId, deleted_at: null },
      attributes: ['id', 'nome_original', 'caminho_arquivo', 'tipo', 'createdAt'],
      order: [['createdAt', 'DESC']]
    }),
    Comprovante.findAll({
      where: { solicitacao_id: solicitacaoId, deleted_at: null },
      attributes: ['id', 'nome_original', 'caminho_arquivo', 'valor', 'status', 'createdAt'],
      order: [['createdAt', 'DESC']]
    })
  ]);

  return {
    titulo_id: titulo.id,
    titulo_codigo: titulo.codigo,
    solicitacao_id: solicitacaoId,
    solicitacao_codigo: solicitacao?.codigo || null,
    arquivos: [
      ...anexos.map((a) => ({
        id: `anexo-${a.id}`,
        origem: 'ANEXO',
        nome: a.nome_original,
        caminho: a.caminho_arquivo,
        tipo: a.tipo || null,
        criado_em: a.createdAt
      })),
      ...comprovantes.map((c) => ({
        id: `comprovante-${c.id}`,
        origem: 'COMPROVANTE',
        nome: c.nome_original,
        caminho: c.caminho_arquivo,
        tipo: c.status || null,
        criado_em: c.createdAt
      }))
    ]
  };
}

module.exports = { listarArquivosDoTitulo };
