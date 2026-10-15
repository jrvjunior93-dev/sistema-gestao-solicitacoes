'use strict';
const { Op } = require('sequelize');
const { TituloFinanceiro, PagamentoManualFilaItem, MovimentoFinanceiro, PaymentIntent, SecurityEventLog } = require('../models');
const { ValidationError } = require('../middlewares/validation');
const { dinheiro } = require('./rhPagamentoSolicitacaoDomain');
const { STATUS_REVISAO_DP } = require('./rhPagamentoRevisaoPolicy');

function snapshot(titulo, filas) {
  return { status: titulo.status, status_interno_pagar: titulo.status_interno_pagar || null,
    valor_original: titulo.valor_original, valor_saldo: titulo.valor_saldo,
    juros: titulo.juros || 0, multa: titulo.multa || 0,
    data_vencimento: titulo.data_vencimento, payment_beneficiary_id: titulo.payment_beneficiary_id || null,
    filas: filas.map(f => ({ id: f.id, status: f.status, valor_previsto: f.valor_previsto,
      valor_informado: f.valor_informado || null, motivo: f.motivo || null })) };
}

// Auditoria financeira e historico RH participam da mesma transacao, inclusive no rollback.
async function auditar(registros, s, req, transaction, acao, motivo) {
  for (const r of registros) await SecurityEventLog.create({ usuario_id: req.user.id,
    tipo_evento: `RH_PAYMENT_${acao}`, recurso_tipo: 'TITULO_FINANCEIRO', recurso_id: String(r.titulo.id),
    status: 'SUCCESS', descricao: `${s.codigo}: ${acao}. ${motivo || ''}`,
    metadata: { rh_solicitacao_id: s.id, motivo: motivo || null,
      referencia_anterior: r.referenciaAnterior, anterior: r.anterior, atual: snapshot(r.titulo, r.filas) } }, { transaction });
}

// Mesmo ordenamento da baixa canonica: todos os titulos, depois todos os itens.
// O lock do titulo serializa tambem baixa direta, conciliacao e pagamento bancario.
async function travar(s, dados, colaboradoresIds, transaction, { permitirEstornoConcluido = false } = {}) {
  const ids = new Set(colaboradoresIds.map(Number));
  const refs = dados.titulos.filter(t => !t.cancelado && (t.tipo === 'SALARIO'
    ? ids.has(Number(t.colaborador_id)) : t.origens?.some(o => ids.has(Number(o.colaborador_id)))));
  const titulosIds = refs.map(t => Number(t.id)).sort((a, b) => a - b);
  if (!titulosIds.length) return [];
  const titulos = await TituloFinanceiro.findAll({ where: { id: { [Op.in]: titulosIds } },
    transaction, lock: transaction.LOCK.UPDATE, order: [['id', 'ASC']] });
  if (titulos.length !== titulosIds.length) throw new ValidationError('Titulo do pagamento nao encontrado. Reabra a solicitacao.', 409);
  for (const t of titulos) {
    if (t.origem_titulo !== 'RH_DP' || Number(t.obra_id) !== Number(s.obra_id)
      || !String(t.numero_documento || '').includes(`-SOL-${s.id}-`)
      || t.status !== 'ABERTO' || Number(t.valor_baixado || 0) > 0 || t.deleted_at
      || t.renegociacao_id || t.renegociado_por_id || t.bloqueado_retorno_obra) {
      throw new ValidationError(`O titulo ${t.codigo || t.id} nao permite revisao/cancelamento. Verifique baixas e bloqueios.`, 409);
    }
  }
  const filas = await PagamentoManualFilaItem.findAll({ where: { titulo_financeiro_id: { [Op.in]: titulosIds } },
    transaction, lock: transaction.LOCK.UPDATE, order: [['id', 'ASC']] });
  const estornada = f => permitirEstornoConcluido && f.status === 'RESOLVIDO'
    && Number.isSafeInteger(Number(f.instrumento_pagamento_json?.estorno?.reaberto_id))
    && Number(f.instrumento_pagamento_json?.estorno?.reaberto_id) > 0;
  if (filas.some(f => !estornada(f) && (f.movimento_financeiro_id || ['BAIXADO', 'RESOLVIDO'].includes(f.status)))) {
    throw new ValidationError('Pagamento processado: nao pode ser revisado ou cancelado pelo DP.', 409);
  }
  if (await MovimentoFinanceiro.count({ where: { titulo_financeiro_id: { [Op.in]: titulosIds },
    ...(permitirEstornoConcluido ? { status: { [Op.ne]: 'ESTORNADO' } } : {}) }, transaction })) {
    throw new ValidationError('Ha baixa registrada, inclusive parcial/estornada. Revisao e cancelamento nao permitidos.', 409);
  }
  if (await PaymentIntent.count({ where: { titulo_financeiro_id: { [Op.in]: titulosIds },
    status: { [Op.notIn]: ['CANCELADO', 'REJEITADO', 'REJEITADO_BANCO', 'FALHA_INTEGRACAO'] } }, transaction })) {
    throw new ValidationError('Ha pagamento bancario ativo. Resolva o envio bancario antes de revisar.', 409);
  }
  return refs.map(ref => {
    const titulo = titulos.find(t => Number(t.id) === Number(ref.id));
    const ativas = filas.filter(f => Number(f.titulo_financeiro_id) === Number(ref.id) && f.status !== 'CANCELADO' && !estornada(f));
    return { ref, titulo, filas: ativas, anterior: snapshot(titulo, ativas), referenciaAnterior: JSON.parse(JSON.stringify(ref)) };
  });
}

async function bloquear(registros, req, transaction) {
  for (const { titulo, filas } of registros) {
    if (!filas.length) throw new ValidationError('Pagamento sem item ativo na fila. Reabra a solicitacao.', 409);
    await titulo.update({ status_interno_pagar: STATUS_REVISAO_DP, atualizado_por: req.user.id }, { transaction });
    for (const fila of filas) await fila.update({ status: 'EM_EDICAO',
      motivo: `Em edicao pelo DP (${req.user.nome || req.user.id}).` }, { transaction });
  }
}

async function sincronizarFila(registro, req, transaction, { cancelar = false, manterBloqueio = false } = {}) {
  const { titulo, filas } = registro;
  await titulo.update({ status_interno_pagar: cancelar ? 'CANCELADO' : manterBloqueio ? STATUS_REVISAO_DP : 'ENVIADO PARA PAGAMENTO',
    atualizado_por: req.user.id, ...(cancelar ? { status: 'CANCELADO', valor_saldo: 0 } : {}) }, { transaction });
  for (const fila of filas) await fila.update({ status: cancelar ? 'CANCELADO' : manterBloqueio ? 'EM_EDICAO' : 'PENDENTE',
    valor_previsto: dinheiro(titulo.valor_saldo), data_vencimento_prevista: titulo.data_vencimento,
    juros: dinheiro(titulo.juros || 0), multa: dinheiro(titulo.multa || 0),
    // Exigir nova conferencia financeira, conservando todos os comprovantes e auditoria.
    valor_informado: null, data_baixa: null, conta_bancaria_id: null, instrumento_pagamento_json: null,
    processado_por: null, processado_em: null, idempotency_key: null,
    motivo: cancelar ? 'Pagamento cancelado pelo DP.' : manterBloqueio ? 'Em edicao pelo DP.' : null }, { transaction });
}

async function cancelar(registros, dados, colaboradorId, req, transaction) {
  const id = Number(colaboradorId);
  for (const registro of registros) {
    const { ref, titulo } = registro;
    if (ref.tipo === 'SALARIO') {
      ref.cancelado = true;
      await sincronizarFila(registro, req, transaction, { cancelar: true });
    } else {
      const origens = ref.origens.filter(o => Number(o.colaborador_id) !== id);
      const valor = dinheiro(origens.reduce((s, o) => s + Number(o.valor), 0));
      ref.origens = origens; ref.valor = valor; ref.cancelado = valor === 0;
      if (valor > 0) await titulo.update({ valor_original: valor, valor_saldo: valor,
        valor_bruto: valor, valor_liquido: valor,
        observacoes: `Solicitacao RH: ${dados.codigo || ''}. Reembolso ajustado por cancelamento.\n${origens.map(o => `${o.nome}: R$ ${o.valor}`).join('\n')}` }, { transaction });
      await sincronizarFila(registro, req, transaction, { cancelar: valor === 0,
        manterBloqueio: origens.some(o => dados.linhas.find(l => Number(l.colaborador_id) === Number(o.colaborador_id))?.pagamento_estado === 'EM_EDICAO') });
    }
  }
}
module.exports = { travar, bloquear, sincronizarFila, cancelar, auditar };
