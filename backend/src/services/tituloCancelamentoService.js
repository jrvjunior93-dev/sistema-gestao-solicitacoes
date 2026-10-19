'use strict';
const crypto = require('node:crypto');
const { Op } = require('sequelize');
const db = require('../models');
const { canCancelTitulosFinanceiros, getFinanceiroObraScopeIds } = require('./authorizationService');
const { carregarTituloPorId } = require('./tituloFinanceiroService');
const { getRequestIp } = require('./securityLogService');
const { validateTituloCancelamentoBody } = require('../validators/tituloCancelamentoValidator');
const auditoria = require('./tituloCancelamentoAuditoriaService');
function falhar(statusCode, mensagem) { throw Object.assign(Error(mensagem), { statusCode }); }

async function cancelarTitulo(req, tituloId, raw) {
  if (!await canCancelTitulosFinanceiros(req.user)) falhar(403, 'Permissao especifica de cancelar titulos obrigatoria.');
  const body = validateTituloCancelamentoBody(raw);
  const id = Number(tituloId);
  if (!Number.isSafeInteger(id) || id <= 0) falhar(400, 'Titulo invalido.');
  const hash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
  return db.sequelize.transaction(async transaction => {
    // A mesma linha e travada pelos fluxos canonicos de baixa/envio. Validar
    // operacoes so depois do lock evita cancelar com uma baixa concorrente.
    const lock = await db.TituloFinanceiro.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!lock) falhar(404, 'Titulo nao encontrado ou excluido.');
    const titulo = await carregarTituloPorId(req, id, { transaction });
    const rateios = await db.TituloFinanceiroRateio.findAll({ where: { titulo_financeiro_id: id },
      attributes: ['obra_id'], transaction });
    const escopo = await getFinanceiroObraScopeIds(req.user);
    if (escopo !== null && rateios.some(r => !escopo.includes(Number(r.obra_id)))) {
      falhar(403, 'Sem acesso a todas as obras do rateio deste titulo.');
    }
    const anterior = await auditoria.buscarCancelamento(id, transaction);
    if (anterior) {
      if (titulo.status !== 'CANCELADO' || anterior.idempotency_key !== body.idempotency_key
        || anterior.request_hash !== hash || Number(anterior.usuario.id) !== Number(req.user.id)) {
        falhar(409, 'Titulo ja cancelado ou operacao alterada. Atualize e confira o historico.');
      }
      return { titulo_id: id, status: 'CANCELADO', idempotente: true };
    }
    if (!titulo.updatedAt || new Date(titulo.updatedAt).toISOString() !== body.versao) {
      falhar(409, 'O titulo mudou depois da consulta. Atualize e confira antes de cancelar.');
    }
    if (!['PAGAR', 'RECEBER'].includes(titulo.tipo)) falhar(409, 'Tipo financeiro invalido. Confira o cadastro.');
    if (!['ABERTO', 'PREVISAO'].includes(titulo.status) || Number(titulo.valor_baixado) !== 0
      || titulo.data_quitacao || !Number.isFinite(Number(titulo.valor_saldo)) || Number(titulo.valor_saldo) <= 0) {
      falhar(409, 'Somente titulos abertos ou em previsao, com saldo e sem pagamento, podem ser cancelados.');
    }
    require('./rhPagamentoRevisaoPolicy').assertSemRevisaoDp(titulo);
    if (titulo.compartilhamento_id) falhar(409, 'Titulo compartilhado: utilize Cancelar lote compartilhado.');
    if (titulo.renegociacao_id || titulo.renegociado_por_id || titulo.medicao_pagamento || titulo.medicao_pagamento_origem_id
      || titulo.intercompany || titulo.intercompany_group_id || titulo.tipo_intercompany || titulo.transferencia_interna
      || Number(titulo.valor_impostos || 0) > 0 || titulo.bloqueado_retorno_obra
      || !['MANUAL', 'SOLICITACAO', 'BAIXA_MASSA_PARCELADA'].includes(titulo.origem_titulo)) {
      falhar(409, 'Titulo com fluxo especializado. Regularize pelo contrato, pedido, DP, recarga, negociacao ou fluxo de origem.');
    }
    if (titulo.cartao_id || titulo.fatura_cartao_id) falhar(409, 'Titulo vinculado a cartao/fatura. Regularize o vinculo antes de cancelar.');
    if (!['NAO_APLICAVEL', 'PENDENTE_EMISSAO', 'CANCELADO'].includes(titulo.status_cobranca || 'NAO_APLICAVEL')) {
      falhar(409, 'Cobranca emitida ou em andamento. Regularize a cobranca antes de cancelar o titulo.');
    }
    const vinculo = { titulo_financeiro_id: id };
    const bloqueios = [
      ['MovimentoFinanceiro', { ...vinculo, status: 'ATIVO' }, 'Titulo com baixa ativa. Nao e possivel cancelar.'],
      ['PaymentIntent', { ...vinculo, status: { [Op.notIn]: ['CANCELADO', 'REJEITADO', 'REJEITADO_BANCO'] } }, 'Pagamento bancario em andamento ou sem confirmacao de cancelamento. Regularize no fluxo bancario.'],
      ['PagamentoManualFilaItem', { ...vinculo, status: { [Op.notIn]: ['CANCELADO', 'ESTORNADO', 'RESOLVIDO'] } }, 'Titulo na fila de pagamento. Retire e regularize a fila antes de cancelar.'],
      ['PagamentoAutorizacaoItem', { ...vinculo, status: { [Op.in]: ['PENDENTE', 'AUTORIZADO', 'ENFILEIRADO'] } }, 'Titulo com autorizacao em andamento. Regularize a autorizacao antes de cancelar.'],
      ['FaturaCartaoTitulo', vinculo, 'Titulo vinculado a fatura. Regularize no fluxo de cartao.'],
      ['PedidoCompraTitulo', vinculo, 'Titulo de pedido de compra. Regularize no pedido para preservar os vinculos.'],
      ['ContratoParcela', vinculo, 'Titulo de contrato/medicao. Regularize pelo contrato para preservar seu saldo.'],
      ['ContratoComercialParcela', vinculo, 'Titulo de contrato comercial. Regularize pelo contrato.'],
      ['FinanciamentoBancarioParcela', vinculo, 'Titulo de financiamento. Regularize pelo financiamento.'],
      ['SolicitacaoAdiantamento', vinculo, 'Titulo de adiantamento. Regularize pela prestacao de contas.'],
      ['SolicitacaoRecargaCartao', vinculo, 'Titulo de recarga. Regularize pela recarga.'],
      ['RhFechamentoTitulo', vinculo, 'Titulo de fechamento DP. Regularize pelo Departamento Pessoal.'],
      ['BoletoCaixa', vinculo, 'Titulo com boleto emitido. Regularize pelo fluxo de boletos.'],
      ['FinanceiroDdaBoleto', vinculo, 'Titulo vinculado ao DDA. Regularize esse vinculo antes de cancelar.'],
      ['ChequeTerceiro', vinculo, 'Titulo vinculado a cheque. Regularize pela carteira de cheques.'],
      ['ConciliacaoBancaria', vinculo, 'Titulo vinculado a conciliacao. Regularize a conciliacao antes de cancelar.'],
      ['IntegracaoSiengeFila', vinculo, 'Titulo com integracao externa. Regularize a integracao antes de cancelar.'],
      ['TituloRenegociacaoAlocacao', { [Op.or]: [{ titulo_origem_id: id }, { titulo_destino_id: id }] }, 'Titulo vinculado a negociacao. Regularize pela negociacao.']
    ];
    // Leituras de bloqueio veem o estado mais recente mesmo em REPEATABLE READ.
    // Falta de modelo/tabela ou erro de consulta aborta tudo (nao liberar em falha).
    for (const [model, where, mensagem] of bloqueios) {
      if (await db[model].findOne({ where, attributes: ['id'], transaction, lock: transaction.LOCK.UPDATE })) falhar(409, mensagem);
    }
    if (body.substituicao) await require('./tituloRegularizacaoDomain').conferirReferencia(db, titulo, body.substituicao, transaction);
    const dados = { ...body, request_hash: hash, cancelado_em: new Date().toISOString(),
      usuario: { id: req.user.id, nome: String(req.user.nome || `Usuario #${req.user.id}`).slice(0, 160) },
      antes: { status: titulo.status, valor_original: String(titulo.valor_original), valor_saldo: String(titulo.valor_saldo),
        valor_baixado: String(titulo.valor_baixado), solicitacao_id: titulo.solicitacao_id, codigo: titulo.codigo },
      depois: { status: 'CANCELADO', valor_saldo: '0.00' },
      ...(req.dev_user_switch ? { dev_user_switch: req.dev_user_switch } : {}) };
    await titulo.update({ status: 'CANCELADO', valor_saldo: 0, atualizado_por: req.user.id }, { transaction });
    await auditoria.registrarCancelamento(req, id, dados, transaction);
    await db.SecurityEventLog.create({ usuario_id: req.user.id, tipo_evento: auditoria.EVENTO,
      recurso_tipo: 'TITULO_FINANCEIRO', recurso_id: String(id), status: 'SUCCESS',
      descricao: 'Titulo cancelado sem excluir registros ou registrar pagamento', metadata: dados,
      ip_origem: getRequestIp(req), user_agent: String(req.headers?.['user-agent'] || '').slice(0, 255)
    }, { transaction });
    return { titulo_id: id, status: 'CANCELADO', idempotente: false };
  });
}
module.exports = { cancelarTitulo };
