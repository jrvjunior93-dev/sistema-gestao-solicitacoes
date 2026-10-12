'use strict';
const { Op } = require('sequelize');
const { normalizarFavorecidos, resumirTitulosDivididos } = require('./solicitacaoFavorecidosDomain');
const { formaPagamentoEhPix, formaPagamentoEhBoleto } = require('./formasPagamentoMedicaoService');
const erro = (mensagem, statusCode = 400) => Object.assign(new Error(mensagem), { statusCode });

async function validarFavorecidos(lista, { valorTotal, parcelas, formas, anexosPendentes = [], transaction } = {}) {
  const linhas = normalizarFavorecidos(lista, { valorTotal, parcelas });
  if (!linhas.length) return [];
  const { Parceiro } = require('../models');
  const parceiros = await Parceiro.findAll({
    where: { id: { [Op.in]: [...new Set(linhas.map(l => l.favorecido_id))] }, ativo: true },
    attributes: ['id', 'nome', 'cpf_cnpj'], transaction
  });
  const porId = new Map(parceiros.map(p => [Number(p.id), p]));
  return linhas.map((linha, ordem) => {
    const parceiro = porId.get(linha.favorecido_id);
    const forma = (formas || []).find(f => Number(f.id) === linha.forma_pagamento_id);
    if (!parceiro) throw erro(`Pagamento ${ordem + 1}: favorecido inexistente ou inativo.`);
    if (!forma) throw erro(`Pagamento ${ordem + 1}: forma nao ativa/liberada neste fluxo.`);
    if (formaPagamentoEhPix(forma) && !linha.favorecido_chave_pix) throw erro(`Pagamento ${ordem + 1}: informe a chave PIX.`);
    if (formaPagamentoEhBoleto(forma) && (!linha.boleto_nomes.length || linha.boleto_nomes.some(nome => !anexosPendentes.includes(nome)))) {
      throw erro(`Pagamento ${ordem + 1}: anexe os boletos deste favorecido.`);
    }
    if (!formaPagamentoEhPix(forma) && !formaPagamentoEhBoleto(forma) && !linha.dados_pagamento) throw erro(`Pagamento ${ordem + 1}: informe os dados para pagamento.`);
    return { ...linha, ordem: ordem + 1, nome_favorecido: parceiro.nome, cpf_cnpj: parceiro.cpf_cnpj || null,
      forma_pagamento_nome: forma.nome, forma_pagamento_tipo: forma.tipo || forma.codigo || null,
      favorecido_chave_pix: formaPagamentoEhPix(forma) ? linha.favorecido_chave_pix : null,
      dados_pagamento: !formaPagamentoEhPix(forma) && !formaPagamentoEhBoleto(forma) ? linha.dados_pagamento : null };
  });
}

async function registrarFavorecidos(linhas, { solicitacaoId, medicaoId = null, usuarioId, transaction } = {}) {
  if (!linhas?.length) return [];
  if (!transaction || !(Number(solicitacaoId) > 0)) throw erro('Registro de favorecidos exige solicitacao e transacao.', 500);
  const { SolicitacaoFavorecido, Historico, Solicitacao } = require('../models');
  const registros = await SolicitacaoFavorecido.bulkCreate(linhas.map(l => ({
    ...l, solicitacao_id: solicitacaoId, medicao_id: medicaoId, criado_por: usuarioId || null
  })), { transaction });
  const principal = await Solicitacao.findByPk(solicitacaoId, { attributes: ['id', 'area_responsavel'], transaction });
  // Um evento por parte: TEXT do historico tem limite por registro. Uma
  // lista unica de varios PIX Copia e Cola poderia excede-lo e impedir o envio.
  await Historico.bulkCreate(registros.map((registro, index) => {
    const l = linhas[index];
    return { solicitacao_id: solicitacaoId, medicao_id: medicaoId, usuario_responsavel_id: usuarioId || null,
      setor: principal?.area_responsavel || '-', acao: 'DADOS_PAGAMENTO_REGISTRADOS',
      descricao: `Favorecido ${index + 1}: ${l.nome_favorecido} - R$ ${Number(l.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} - ${l.forma_pagamento_nome}`
        + (l.contrato_parcela_id ? ` - Parcela ID ${l.contrato_parcela_id}` : '')
        + (l.favorecido_chave_pix ? `\nPIX: ${l.favorecido_chave_pix}` : l.dados_pagamento ? `\nDados para pagamento: ${l.dados_pagamento}` : '')
        + (l.boleto_nomes.length ? `\nBoletos: ${l.boleto_nomes.join(', ')}` : ''),
      metadata: JSON.stringify({ origem: 'DIVISAO_FAVORECIDOS', solicitacao_favorecido_id: registro.id,
        favorecido_id: l.favorecido_id, contrato_parcela_id: l.contrato_parcela_id,
        valor: l.valor, forma_pagamento_id: l.forma_pagamento_id }) };
  }), { transaction });
  return registros;
}

async function listarFavorecidos(solicitacaoId, { medicaoId = null, transaction, lock = false } = {}) {
  const { SolicitacaoFavorecido } = require('../models');
  // Fixtures legadas podem nao registrar o novo model. Em runtime ele e obrigatorio.
  if (!SolicitacaoFavorecido) return [];
  return SolicitacaoFavorecido.findAll({ where: { solicitacao_id: Number(solicitacaoId), medicao_id: medicaoId },
    order: [['ordem', 'ASC'], ['id', 'ASC']], transaction, lock: lock ? transaction?.LOCK?.UPDATE : undefined });
}

// Nenhuma ACL nova: chamadores ja autorizam o contrato/solicitacao antes de
// projetar. Recorte por parcela em uma consulta, sem varrer titulos globais.
async function carregarDivisoesDasParcelas(parcelas, transaction, { lock = false } = {}) {
  const { SolicitacaoFavorecido, TituloFinanceiro, MedicaoParcela } = require('../models');
  const mapa = new Map();
  if (!SolicitacaoFavorecido || !parcelas.length) return mapa;
  const vinculos = await MedicaoParcela.findAll({
    where: { contrato_parcela_id: { [Op.in]: parcelas.map(p => Number(p.id)) }, devolvido_em: null },
    attributes: ['contrato_parcela_id', 'medicao_id'], transaction,
    lock: lock ? transaction?.LOCK?.UPDATE : undefined
  });
  const ativos = new Set(vinculos.map(v => `${Number(v.contrato_parcela_id)}:${Number(v.medicao_id)}`));
  const linhas = await SolicitacaoFavorecido.findAll({
    where: { contrato_parcela_id: { [Op.in]: parcelas.map(p => Number(p.id)) } },
    order: [['contrato_parcela_id', 'ASC'], ['ordem', 'ASC']], transaction,
    lock: lock ? transaction?.LOCK?.UPDATE : undefined
  });
  const correntes = linhas.filter(l => ativos.has(`${Number(l.contrato_parcela_id)}:${Number(l.medicao_id)}`));
  const ids = correntes.map(l => Number(l.titulo_financeiro_id)).filter(Boolean);
  const titulos = ids.length ? await (TituloFinanceiro.unscoped?.() || TituloFinanceiro).findAll({ where: { id: { [Op.in]: ids } }, order: [['id', 'ASC']],
    transaction, lock: lock ? transaction?.LOCK?.UPDATE : undefined }) : [];
  const porId = new Map(titulos.map(t => [Number(t.id), t]));
  const projetados = await require('./tituloRenegociacaoVinculos').projetarOrigens(titulos, { transaction });
  const porIdLeitura = new Map(projetados.map(t => [Number(t.id), t]));
  for (const linha of correntes) {
    const id = Number(linha.contrato_parcela_id);
    if (!mapa.has(id)) mapa.set(id, { pagamentos: [], titulos: [], titulos_leitura: [] });
    const grupo = mapa.get(id);
    grupo.pagamentos.push(linha);
    const titulo = porId.get(Number(linha.titulo_financeiro_id));
    if (titulo) grupo.titulos.push(titulo);
    if (titulo) grupo.titulos_leitura.push(porIdLeitura.get(Number(titulo.id)));
  }
  for (const grupo of mapa.values()) grupo.resumo = resumirTitulosDivididos(grupo.titulos_leitura);
  return mapa;
}

async function projetarDivisoesNasParcelas(parcelas, transaction, options) {
  const mapa = await carregarDivisoesDasParcelas(parcelas, transaction, options);
  for (const parcela of parcelas) {
    const grupo = mapa.get(Number(parcela.id));
    if (!grupo?.resumo) continue; // Instrucoes ainda sem titulos: previsao original intacta.
    parcela.divisao_favorecidos = grupo;
    const titulo = { ...(parcela.titulo?.toJSON ? parcela.titulo.toJSON() : parcela.titulo), ...grupo.resumo,
      renegociado_por_id: grupo.titulos_leitura.find(t => t.renegociado_por_id)?.renegociado_por_id || null,
      renegociacao_titulos: grupo.titulos_leitura.flatMap(t => t.renegociacao_titulos || []) };
    if (parcela.setDataValue) parcela.setDataValue('titulo', titulo);
    else parcela.titulo = titulo;
  }
  return mapa;
}

module.exports = { validarFavorecidos, registrarFavorecidos, listarFavorecidos, carregarDivisoesDasParcelas, projetarDivisoesNasParcelas };
