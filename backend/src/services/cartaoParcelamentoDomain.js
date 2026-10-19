'use strict';
const { createHash } = require('node:crypto');
function erro(message, statusCode = 400) { throw Object.assign(new Error(message), { statusCode }); }
function validarDataCompra(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1900) erro('Data da compra invalida.');
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) erro('Data da compra invalida.');
  return value;
}
function validarParcelamentoCartao(value, { exigirChave = false } = {}) {
  if (value == null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['data_compra', 'quantidade_parcelas', 'chave_idempotencia', 'calendario'].includes(key))) erro('Parcelamento do cartao invalido.');
  if (!['number', 'string'].includes(typeof value.quantidade_parcelas) || !/^\d+$/.test(String(value.quantidade_parcelas))) erro('Quantidade de parcelas do cartao invalida.');
  const count = Number(value.quantidade_parcelas);
  if (!Number.isInteger(count) || count < 1 || count > 60) erro('Informe de 1 a 60 parcelas do cartao.');
  const chave = value.chave_idempotencia;
  if ((exigirChave || chave != null) && (typeof chave !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(chave))) erro('Chave de idempotencia do cartao invalida. Atualize o formulario.');
  let calendario;
  if (value.calendario != null) {
    const info = value.calendario;
    if (typeof info !== 'object' || Array.isArray(info) || Object.keys(info).some(key => !['dia_fechamento', 'dia_vencimento'].includes(key))
      || ![info.dia_fechamento, info.dia_vencimento].every(day => typeof day === 'number' && Number.isInteger(day) && day >= 1 && day <= 31)) erro('Calendario do cartao invalido. Atualize a consulta.');
    calendario = { dia_fechamento: info.dia_fechamento, dia_vencimento: info.dia_vencimento };
  }
  return { data_compra: validarDataCompra(value.data_compra), quantidade_parcelas: count, ...(calendario ? { calendario } : {}), ...(chave ? { chave_idempotencia: chave } : {}) };
}
function hashCompra(req, tituloId, payload, options) {
  // Payload validado/normalizado; nao persistir credenciais ou informacao de sessao.
  return createHash('sha256').update(JSON.stringify({ usuario: req.user.id, tituloId: Number(tituloId),
    principal: Number(payload.valor), juros: Number(payload.juros || 0), multa: Number(payload.multa || 0),
    desconto: Number(payload.desconto || 0), data: payload.data_movimento, cartao: Number(payload.cartao_id),
    empresa: Number(payload.empresa_id), conta: Number(payload.conta_bancaria_id || 0),
    forma: payload.forma_pagamento_id || payload.forma_recebimento, observacoes: payload.observacoes || null,
    intercompany: Boolean(payload.intercompany), natureza: payload.natureza_intercompany_baixa || null,
    tipo: payload.tipo_intercompany || null, motivo: payload.motivo_intercompany || null,
    elimina: payload.elimina_consolidado !== false, transferencia: payload.transferencia_interna !== false,
    compra: payload.parcelamento_cartao.data_compra, parcelas: payload.parcelamento_cartao.quantidade_parcelas,
    calendario: payload.parcelamento_cartao.calendario || null,
    fila: options.filaLiquidacaoId || null })).digest('hex');
}
function dividirEmCentavos(total, count) {
  const cents = Math.round(Number(total) * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents < count) erro('Valor insuficiente para a quantidade de parcelas do cartao.');
  const base = Math.floor(cents / count), resto = cents % count;
  return Array.from({ length: count }, (_, i) => (base + (i < resto ? 1 : 0)) / 100);
}
module.exports = { validarParcelamentoCartao, validarDataCompra, dividirEmCentavos, hashCompra };
