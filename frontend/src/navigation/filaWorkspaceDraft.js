export const revisaoFila = row => JSON.stringify([
  row.id, row.status, row.somente_consulta, row.movimento_financeiro_id,
  row.titulo?.status, row.titulo?.status_financeiro, row.titulo?.valor_saldo, row.valor_informado, row.juros, row.multa,
  row.conta_bancaria_id, row.data_baixa, row.titulo?.forma_pagamento_id,
  row.instrumento_pagamento_json
]);
// Lista explicita de inputs, nao comprovantes, URLs, DTOs ou permissoes.
const campos = ['data_baixa', 'conta_bancaria_id', 'valor_pago', 'motivo', 'forma_pagamento_id',
  'juros', 'multa', 'cartao_id', 'usar_cheque_terceiro', 'cheque_terceiro_id',
  'cheque_numero', 'cheque_emitente', 'titular_documento', 'cheque_banco', 'cheque_agencia', 'cheque_conta',
  'data_emissao', 'data_vencimento'];
export const camposFila = draft => Object.fromEntries(campos.filter(key => key in draft)
  .map(key => [key, draft[key]]));
