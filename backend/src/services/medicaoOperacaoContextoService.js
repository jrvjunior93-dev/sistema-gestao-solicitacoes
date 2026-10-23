'use strict';
const { Op } = require('sequelize');
const db = require('../models');
const auth = require('./authorizationService');
const { userHasSetorCapability } = require('./setorCapabilityService');
const erro = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const plain = v => v?.toJSON ? v.toJSON() : v;
const opts = transaction => ({ transaction, ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}) });

async function contexto(req, id, transaction) {
  if (!req.user?.id || !await auth.canViewContratos(req.user)) throw erro('Acesso negado aos contratos.', 403);
  const inicial = await db.ContratoMedicao.findByPk(Number(id), { transaction });
  if (!inicial) throw erro('Medicao nao encontrada.', 404);
  // A criacao/reprogramacao tambem bloqueiam o contrato primeiro.
  const contrato = await db.Contrato.findByPk(inicial.contrato_id, opts(transaction));
  const scope = await auth.getUserObraScopeIds(req.user);
  if (!contrato || !(scope === null || scope.includes(Number(contrato.obra_id))
    || (!scope.length && await auth.canAccessContratosGlobal(req.user)))) throw erro('Contrato fora do seu escopo.', 403);
  const medicao = await db.ContratoMedicao.findByPk(Number(id), opts(transaction));
  if (Number(medicao.contrato_id) !== Number(contrato.id) || !contrato.fluxo_novo
    || Number(medicao.solicitacao_id) !== Number(contrato.solicitacao_id)) throw erro('Vinculo da medicao inconsistente.', 409);
  const solicitacao = await db.Solicitacao.findByPk(contrato.solicitacao_id, opts(transaction));
  await require('./solicitacaoRetornoService').assertPodeVisualizarSolicitacao(req, solicitacao);
  if (transaction) {
    if (!contrato.ativo || contrato.status_contrato !== 'ATIVO' || contrato.rescindido_em || solicitacao?.cancelada) throw erro('Contrato/solicitacao inativo.', 409);
  }
  const vinculos = await db.MedicaoParcela.findAll({ where: { medicao_id: medicao.id, devolvido_em: null }, ...opts(transaction) });
  const parcelas = vinculos.length ? await db.ContratoParcela.findAll({ where: { contrato_id: contrato.id,
    id: { [Op.in]: vinculos.map(v => v.contrato_parcela_id) } }, order: [['id', 'ASC']], ...opts(transaction) }) : [];
  if (parcelas.length !== vinculos.length) throw erro('Parcelas da medicao inconsistentes.', 409);
  const partes = await db.SolicitacaoFavorecido.findAll({ where: { medicao_id: medicao.id }, order: [['ordem', 'ASC'], ['id', 'ASC']], ...opts(transaction) });
  const ids = [...new Set([...parcelas.map(p => p.titulo_financeiro_id), ...partes.map(p => p.titulo_financeiro_id)].map(Number).filter(Boolean))];
  const titulos = ids.length ? await db.TituloFinanceiro.findAll({ where: { id: { [Op.in]: ids } }, order: [['id', 'ASC']], ...opts(transaction) }) : [];
  if (titulos.some(t => Number(t.obra_id) !== Number(contrato.obra_id)
    || Number(t.solicitacao_id) !== Number(solicitacao.id))) throw erro('Titulo fora da obra ou solicitacao da medicao. Confira os vinculos.', 409);
  const rateios = ids.length ? await db.TituloFinanceiroRateio.findAll({ where: { titulo_financeiro_id: { [Op.in]: ids } }, transaction }) : [];
  if (rateios.some(r => Number(r.obra_id) !== Number(contrato.obra_id))) throw erro('Rateio de titulo fora da obra do contrato. Regularize antes de alterar.', 409);
  if (ids.length !== titulos.length || (!medicao.rejeicao && partes.some(p => !parcelas.some(cp => Number(cp.id) === Number(p.contrato_parcela_id))
    || Number(p.solicitacao_id) !== Number(solicitacao.id)))) throw erro('Titulos/favorecidos fora da medicao.', 409);
  return { contrato, medicao, solicitacao, vinculos, parcelas, partes, titulos };
}
async function pode(usuario, chave) {
  return Boolean(usuario?.id) && (auth.isSuperadmin(usuario) || (await userHasSetorCapability(usuario, 'eh_setor_geo')
    && await auth.userHasStrictAreaPermission(usuario, [chave])));
}
async function assertTitulosSemOperacoes(titulos, transaction) {
  for (const titulo of titulos) {
    if (titulo.tipo !== 'PAGAR' || !['PREVISAO', 'ABERTO'].includes(titulo.status) || Number(titulo.valor_baixado) !== 0
      || titulo.data_quitacao || !Number.isFinite(Number(titulo.valor_saldo)) || Number(titulo.valor_saldo) <= 0
      || Number(titulo.valor_saldo) !== Number(titulo.valor_original) || titulo.renegociacao_id || titulo.renegociado_por_id
      || titulo.compartilhamento_id || titulo.intercompany || titulo.intercompany_group_id || titulo.transferencia_interna
      || titulo.medicao_pagamento || titulo.medicao_pagamento_origem_id || titulo.cartao_id || titulo.fatura_cartao_id
      || titulo.bloqueado_retorno_obra || titulo.bloqueio_pagamento_proprietario
      || titulo.linha_digitavel || titulo.codigo_barras || titulo.nosso_numero || titulo.boleto_emitido_em
      || !['NAO_APLICAVEL', 'PENDENTE_EMISSAO', 'CANCELADO'].includes(titulo.status_cobranca || 'NAO_APLICAVEL')) {
      throw erro(`Titulo ${titulo.codigo || titulo.id} possui baixa, bloqueio ou vinculo especializado. Regularize antes de alterar.`, 409);
    }
    const vinculo = { titulo_financeiro_id: titulo.id };
    for (const [model, where] of [
      ['MovimentoFinanceiro', { ...vinculo, status: 'ATIVO' }],
      ['PaymentIntent', { ...vinculo, status: { [Op.notIn]: ['CANCELADO', 'REJEITADO', 'REJEITADO_BANCO'] } }],
      ['PagamentoManualFilaItem', { ...vinculo, status: { [Op.notIn]: ['CANCELADO', 'ESTORNADO', 'RESOLVIDO', 'REJEITADO', 'EXCLUIDO'] } }],
      ['PagamentoAutorizacaoItem', { ...vinculo, status: { [Op.in]: ['PENDENTE', 'AUTORIZADO', 'ENFILEIRADO'] } }],
      ...['FaturaCartaoTitulo', 'BoletoCaixa', 'FinanceiroDdaBoleto', 'ChequeTerceiro', 'ConciliacaoBancaria', 'IntegracaoSiengeFila',
        'PedidoCompraTitulo', 'RhFechamentoTitulo', 'SolicitacaoRecargaCartao', 'SolicitacaoAdiantamento', 'ContratoComercialParcela',
        'FinanciamentoBancarioParcela'].map(model => [model, vinculo]),
      ['TituloRenegociacaoAlocacao', { [Op.or]: [{ titulo_origem_id: titulo.id }, { titulo_destino_id: titulo.id }] }]
    ]) {
      if (await db[model].findOne({ where, attributes: ['id'], ...opts(transaction) })) throw erro(`Titulo ${titulo.codigo || titulo.id} possui operacao vinculada (${model}). Regularize antes de alterar.`, 409);
    }
  }
}
module.exports = { contexto, pode, assertTitulosSemOperacoes, erro, plain, opts };
