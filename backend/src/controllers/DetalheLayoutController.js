// =====================================================================
// LAYOUT DO DETALHE DA SOLICITAÇÃO POR SETOR
// ---------------------------------------------------------------------
// Camada do ADMINISTRADOR do layout configurável: por setor, a ordem e a
// visibilidade dos blocos do detalhe. `config` é JSON
// `[{ bloco, visivel, posicao }]` sobre o catálogo FIXO de blocos do
// frontend (frontend/src/pages/SolicitacaoDetalhe/blocosDetalhe.js) —
// só ordena/oculta o que a tela já tem; permissões e condições de tipo
// continuam decidindo se um bloco pode aparecer. A camada do USUÁRIO
// sobrepõe esta (usuario_lista_preferencias, lista 'detalhe-solicitacao')
// e, sem nenhuma configuração, vale o layout atual da tela.
// Leitura liberada para autenticados; escrita gateada nas rotas.
// =====================================================================
const { SetorDetalheLayout } = require('../models');

// Blocos aceitos POR TELA — espelho dos catálogos do frontend
// (blocosDetalhe.js e blocosHome.js). Nome fora daqui é rejeitado para
// a config nunca referenciar bloco inexistente.
// ⚠️ Espelho de frontend/src/pages/SolicitacaoDetalhe/blocosDetalhe.js e
// frontend/src/navigation/blocosHome.js — mudou lá, muda AQUI TAMBÉM.
// frontend/scripts/validarNavegacao.mjs compara os dois lados e FALHA na
// divergência (registro em docs/MIGRACAO-PARA-OFICIAL.md). No porte para
// o oficial os cards Pagamentos e Pedido saíram do detalhe e o de
// Aditivos entrou (decisões do próprio oficial, preservadas na onda 2).
const BLOCOS_POR_TELA = {
  'detalhe-solicitacao': new Set([
    'itens_compra_direta',
    'apropriacoes',
    'rateio_contrato',
    'aditivos_contrato',
    'aprovacao_diretoria',
    'acoes_contrato',
    'financeiro',
    'conversa',
    'historico',
    'auditoria'
  ]),
  home: new Set([
    'pendencias',
    'resolver',
    'atalhos',
    'modulos',
    'obras_resumo',
    // Blocos opcionais (nascem desligados; o admin pode ligar por setor)
    'ultimas_tocadas',
    'aguardando_resposta',
    'minhas_criadas',
    'mudou_hoje',
    'grafico_pagar',
    'calendario_vencimentos',
    'saldo_caixas',
    'gasto_mes',
    'contratos_medir',
    'compras_pendentes',
    'avisos',
    'indicadores_executivos'
  ])
};
const BLOCOS_VALIDOS = BLOCOS_POR_TELA['detalhe-solicitacao'];

function normalizarTela(valor) {
  const tela = String(valor || 'detalhe-solicitacao').trim().toLowerCase();
  return BLOCOS_POR_TELA[tela] ? tela : null;
}

const TAMANHO_MAXIMO_CONFIG = 16 * 1024;

function validarConfig(bruto, blocosValidos) {
  if (!Array.isArray(bruto)) return { erro: 'config deve ser uma lista de blocos' };
  const vistos = new Set();
  const config = [];
  for (const item of bruto) {
    const bloco = String(item?.bloco || '').trim();
    if (!blocosValidos.has(bloco)) {
      return { erro: `Bloco invalido: ${bloco || '(vazio)'}. Validos: ${Array.from(blocosValidos).join(', ')}` };
    }
    if (vistos.has(bloco)) return { erro: `Bloco repetido: ${bloco}` };
    vistos.add(bloco);
    config.push({
      bloco,
      visivel: item?.visivel === undefined ? true : Boolean(item.visivel),
      posicao: Number.isFinite(Number(item?.posicao)) ? Number(item.posicao) : config.length
    });
  }
  const texto = JSON.stringify(config);
  if (texto.length > TAMANHO_MAXIMO_CONFIG) return { erro: 'config grande demais' };
  return { config, texto };
}

module.exports = {
  BLOCOS_VALIDOS,

  async index(req, res) {
    try {
      const tela = normalizarTela(req.query.tela);
      if (!tela) return res.status(400).json({ error: 'Tela invalida' });
      const where = { tela };
      const setor = String(req.query.setor || '').trim().toUpperCase();
      if (setor) where.setor = setor;
      const linhas = await SetorDetalheLayout.findAll({ where, order: [['setor', 'ASC']] });
      return res.json(linhas.map((linha) => ({
        id: linha.id,
        tela: linha.tela,
        setor: linha.setor,
        config: JSON.parse(linha.config),
        updatedAt: linha.updatedAt
      })));
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao carregar layouts do detalhe' });
    }
  },

  // Upsert por (tela, setor): um layout por combinação, substituído por
  // inteiro. Sem `?tela=`, vale o detalhe — chamadas antigas seguem OK.
  async upsert(req, res) {
    try {
      const tela = normalizarTela(req.query.tela);
      if (!tela) return res.status(400).json({ error: 'Tela invalida' });
      const setor = String(req.params.setor || '').trim().toUpperCase().slice(0, 120);
      if (!setor) return res.status(400).json({ error: 'Informe o setor' });

      const { erro, texto } = validarConfig(req.body?.config, BLOCOS_POR_TELA[tela]);
      if (erro) return res.status(400).json({ error: erro });

      const [linha] = await SetorDetalheLayout.findOrCreate({
        where: { tela, setor },
        defaults: { tela, setor, config: texto }
      });
      if (linha.config !== texto) await linha.update({ config: texto });
      return res.json({ id: linha.id, tela: linha.tela, setor: linha.setor, config: JSON.parse(linha.config) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar layout do detalhe' });
    }
  },

  async destroy(req, res) {
    try {
      const tela = normalizarTela(req.query.tela);
      if (!tela) return res.status(400).json({ error: 'Tela invalida' });
      const setor = String(req.params.setor || '').trim().toUpperCase();
      const removidos = setor
        ? await SetorDetalheLayout.destroy({ where: { tela, setor } })
        : 0;
      if (!removidos) return res.status(404).json({ error: 'Layout nao encontrado' });
      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao excluir layout do detalhe' });
    }
  }
};
