'use strict';
const INSTRUMENT_FIELDS = ['forma_pagamento_id', 'cartao_id', 'parcelamento_cartao', 'usar_cheque_terceiro', 'cheque_terceiro_id',
  'cheque_numero', 'cheque_emitente', 'titular_documento', 'cheque_banco', 'cheque_agencia',
  'cheque_conta', 'data_emissao', 'data_vencimento', 'parcelas_cheque',
  'valor_permuta', 'empresa_permuta_id', 'documento_referencia', 'categoria_bem', 'descricao_bem'];
function tipoInstrumento(forma) {
  const text = `${forma?.tipo || ''} ${forma?.codigo || ''} ${forma?.nome || ''}`
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (forma?.exige_cartao || forma?.gera_fatura || /CARTAO|CREDITO|DEBITO/.test(text)) return 'CARTAO';
  if (text.includes('CHEQUE')) return 'CHEQUE';
  if (/\bPERMUTA\b/.test(text)) return 'PERMUTA';
  return 'CONTA';
}
function instrumentoPayload(payload) {
  return Object.fromEntries(INSTRUMENT_FIELDS.filter(key => payload[key] != null && payload[key] !== '')
    .map(key => [key, payload[key]]));
}
module.exports = { INSTRUMENT_FIELDS, tipoInstrumento, instrumentoPayload };
