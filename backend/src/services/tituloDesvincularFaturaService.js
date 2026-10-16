'use strict';
const crypto = require('crypto');
const { Op } = require('sequelize');
const { sequelize, TituloFinanceiro, PaymentIntent, PagamentoManualFilaItem,
  PagamentoAutorizacaoItem, SecurityEventLog } = require('../models');
const { userHasAreaPermission } = require('./authorizationService');
const { carregarTituloPorId } = require('./tituloFinanceiroService');
const { assertTituloDisponivelParaBaixa } = require('./tituloBloqueioRetornoObraService');
const { desvincularPrevisaoCartao } = require('./pagamentoFilaPrevisaoCartaoService');
const { getRequestIp } = require('./securityLogService');
const { validateTituloDesvincularFaturaBody } = require('../validators/tituloDesvincularFaturaValidator');
const { EVENTO, buscarRecibo, registrarRecibo } = require('./tituloDesvincularFaturaAuditoriaService');

function falhar(statusCode, message) { throw Object.assign(new Error(message), { statusCode }); }

async function desvincularFaturaTitulo(req, tituloId, raw) {
  if (!await userHasAreaPermission(req.user, ['financeiro.titulos.editar'])) falhar(403, 'Permissao de editar titulos obrigatoria.');
  const body = validateTituloDesvincularFaturaBody(raw);
  if (!Number.isSafeInteger(Number(tituloId)) || Number(tituloId) <= 0) falhar(400, 'Titulo invalido.');
  const hash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
  return sequelize.transaction(async transaction => {
    const lock = await TituloFinanceiro.findByPk(tituloId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!lock) falhar(404, 'Titulo nao encontrado.');
    // ACL canonica, inclusive renegociacoes/compartilhados, antes de qualquer
    // replay ou consulta de fatura. A permissao da fila nao dispensa esta ACL.
    const titulo = await carregarTituloPorId(req, tituloId, { includeMovimentos: true, transaction });
    const anterior = await buscarRecibo(titulo.id, body.idempotency_key, transaction);
    if (anterior) {
      const metadata = anterior.metadata;
      if (metadata.request_hash !== hash || Number(anterior.row.usuario_id) !== Number(req.user.id)) {
        falhar(409, 'Chave ja utilizada por outra operacao. Atualize o titulo.');
      }
      return { titulo_id: titulo.id, fatura_anterior_id: body.fatura_cartao_id, idempotente: true };
    }
    if (String(titulo.tipo).toUpperCase() !== 'PAGAR' || String(titulo.status).toUpperCase() !== 'ABERTO'
      || Number(titulo.valor_baixado || 0) !== 0 || Number(titulo.valor_saldo || 0) <= 0) {
      falhar(409, 'Somente titulo a pagar aberto, com saldo e sem baixa pode ser desvinculado.');
    }
    if (titulo.compartilhamento_id || titulo.renegociacao_id || titulo.renegociado_por_id
      || ['ADIANTAMENTO', 'DEVOLUCAO_ADIANTAMENTO', 'RH_DP', 'RECARGA_CARTAO'].includes(titulo.origem_titulo)) {
      falhar(409, 'Este titulo possui fluxo especializado. Corrija pelo seu fluxo de origem.');
    }
    assertTituloDisponivelParaBaixa(titulo);
    if (Number(titulo.fatura_cartao_id) !== body.fatura_cartao_id) {
      falhar(409, 'O vinculo com a fatura mudou ou ja foi retirado. Atualize o titulo.');
    }
    const [intent, fila, autorizacao] = await Promise.all([
      PaymentIntent.findOne({ where: { titulo_financeiro_id: titulo.id,
        status: { [Op.notIn]: ['CANCELADO', 'REJEITADO', 'REJEITADO_BANCO', 'FALHA_INTEGRACAO'] } }, transaction, lock: transaction.LOCK.UPDATE }),
      PagamentoManualFilaItem.findOne({ where: { titulo_financeiro_id: titulo.id,
        status: { [Op.in]: ['PENDENTE', 'NAO_PAGO', 'DIVERGENTE', 'EM_EDICAO'] } }, transaction, lock: transaction.LOCK.UPDATE }),
      PagamentoAutorizacaoItem.findOne({ where: { titulo_financeiro_id: titulo.id,
        status: { [Op.in]: ['PENDENTE', 'AUTORIZADO'] } }, transaction, lock: transaction.LOCK.UPDATE })
    ]);
    if (intent || fila || autorizacao) falhar(409,
      'Retire o titulo da fila e regularize autorizacoes ou pagamentos bancarios ativos antes de corrigir a previsao.');
    const previsao = await desvincularPrevisaoCartao(titulo, req.user.id, transaction);
    if (!previsao) falhar(409, 'Titulo sem vinculo com fatura. Atualize o registro.');
    const metadata = { idempotency_key: body.idempotency_key, request_hash: hash, motivo: body.motivo,
      antes: previsao, depois: { cartao_id: null, fatura_cartao_id: null },
      ...(req.dev_user_switch ? { dev_user_switch: req.dev_user_switch } : {}) };
    await registrarRecibo(req, titulo.id, metadata, transaction);
    await SecurityEventLog.create({ usuario_id: req.user.id, tipo_evento: EVENTO,
      recurso_tipo: 'TITULO_FINANCEIRO', recurso_id: String(titulo.id), status: 'SUCCESS',
      descricao: 'Previsao de cartao desvinculada antes da correcao do titulo',
      ip_origem: getRequestIp(req), user_agent: String(req.headers?.['user-agent'] || '').slice(0, 255), metadata
    }, { transaction });
    // Nao criar Historico da solicitacao: autoria/interacao nessa tabela pode
    // ampliar visibilidade. O evento fica na auditoria financeira ja existente.
    // Nenhum saldo/valor/parcelamento, pagamento ou status da solicitacao muda.
    return { titulo_id: titulo.id, fatura_anterior_id: body.fatura_cartao_id, idempotente: false };
  });
}
module.exports = { desvincularFaturaTitulo };
