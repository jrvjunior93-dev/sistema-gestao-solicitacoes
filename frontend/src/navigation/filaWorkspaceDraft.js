export const revisaoFila = row => JSON.stringify([
  row.id, row.status, row.somente_consulta, row.movimento_financeiro_id,
  row.titulo?.status, row.titulo?.status_financeiro, row.titulo?.valor_saldo, row.valor_informado, row.juros, row.multa,
  row.conta_bancaria_id, row.data_baixa, row.titulo?.forma_pagamento_id,
  row.titulo?.cartao_id, row.titulo?.fatura_cartao_id,
  row.instrumento_pagamento_json
]);
// Lista explicita de inputs, nao comprovantes, URLs, DTOs ou permissoes.
const campos = ['data_baixa', 'conta_bancaria_id', 'valor_pago', 'motivo', 'forma_pagamento_id',
  'desconto', 'juros', 'multa', 'parcelas_cheque', 'parcelas_cartao', 'cartao_id', 'origem_cheque', 'usar_cheque_terceiro', 'cheque_terceiro_id',
  'cheque_numero', 'cheque_emitente', 'titular_documento', 'cheque_banco', 'cheque_agencia', 'cheque_conta',
  'data_emissao', 'data_vencimento','valor_permuta','empresa_permuta_id','documento_referencia','categoria_bem','descricao_bem'];
export const camposFila = draft => Object.fromEntries(campos.filter(key => key in draft)
  .map(key => [key, key === 'parcelas_cheque' && Array.isArray(draft[key])
    ? draft[key].slice(0, 60).map(parcela => Object.fromEntries(campos
      .filter(campo => campo === 'valor_pago' || campo.startsWith('cheque_')
        || ['origem_cheque', 'usar_cheque_terceiro', 'titular_documento', 'data_emissao', 'data_vencimento'].includes(campo))
      .filter(campo => campo in parcela).map(campo => [campo, parcela[campo]])))
    : key === 'parcelas_cartao' && Array.isArray(draft[key]) ? draft[key].slice(0, 20).map(item => ({ cartao_id: item.cartao_id, valor_pago: item.valor_pago })) : draft[key]]));
