'use strict';
const { protegido, erro } = require('./medicaoPagamentoDomain');
function validar(row, changes, options = {}) {
  if (!protegido(row) || options.operacaoMedicaoPagamento) return;
  if (Number(changes.valor_baixado || 0) > Number(row.valor_original)) throw erro('A baixa nao pode ultrapassar o principal autorizado desta medicao.', 409);
  const estruturais = ['valor_original', 'valor_bruto', 'valor_liquido', 'valor_impostos', 'deleted_at', 'renegociacao_id', 'renegociado_por_id',
    'compartilhamento_id', 'medicao_pagamento', 'medicao_pagamento_origem_id', 'obra_id', 'empresa_id', 'parceiro_id', 'solicitacao_id', 'tipo'];
  if (Object.hasOwn(changes, 'medicao_pagamento') || estruturais.some(k => Object.hasOwn(changes, k) && String(changes[k] ?? '') !== String(row[k] ?? ''))
    || ['CANCELADO', 'ESTORNADO', 'EXCLUIDO', 'PREVISAO', 'RENEGOCIADO'].includes(changes.status)
    || (row.status === 'PREVISAO' && (changes.status && changes.status !== 'PREVISAO' || Number(changes.valor_baixado || 0) > 0))) {
    throw erro('Titulo com ajuste de medicao protegido. Use o fluxo de valor autorizado, sem cancelar ou liberar a diferenca por outra tela.', 409);
  }
}
module.exports = { validar };
