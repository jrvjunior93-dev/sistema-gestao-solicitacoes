'use strict';
const { centavos, dinheiro } = require('./tituloRenegociacaoDomain');
const erro = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
function estado(titulo) {
  const value = titulo?.medicao_pagamento;
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value) || value.versao !== 1
    || !Number.isSafeInteger(value.revisao) || value.revisao < 1) throw erro('Estado do ajuste inconsistente. Consulte a auditoria.', 409);
  return value;
}
function validar(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)
    || Object.keys(raw).some(k => !['titulo_id', 'acao', 'valor_autorizado', 'valor_anterior', 'destino', 'motivo', 'revisao', 'idempotency_key', 'desvincular_fatura'].includes(k))) throw erro('Ajuste invalido.');
  if (!Number.isSafeInteger(raw.titulo_id) || raw.titulo_id <= 0 || !Number.isSafeInteger(raw.revisao) || raw.revisao < 0
    || !['REDUZIR', 'LIBERAR_PENDENTE'].includes(raw.acao)) throw erro('Titulo, acao ou revisao invalidos.');
  if (typeof raw.idempotency_key !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(raw.idempotency_key)) throw erro('Chave de idempotencia invalida.');
  if (typeof raw.motivo !== 'string' || !raw.motivo.trim() || raw.motivo.trim().length > 2000) throw erro('Informe o motivo, com ate 2000 caracteres.');
  if (raw.desvincular_fatura != null && typeof raw.desvincular_fatura !== 'boolean') throw erro('Confirme explicitamente a desvinculacao da fatura.');
  const anterior = centavos(raw.valor_anterior, 'Valor anterior');
  if (!anterior) throw erro('Valor anterior invalido.');
  let autorizado = anterior;
  if (raw.acao === 'REDUZIR') {
    autorizado = centavos(raw.valor_autorizado, 'Valor autorizado');
    if (autorizado <= 0 || autorizado >= anterior || !['FUTURO', 'DEFINITIVO'].includes(raw.destino)) throw erro('Informe um valor positivo menor que o atual e o destino da diferenca.');
  } else if (raw.destino != null || raw.valor_autorizado != null || raw.desvincular_fatura) throw erro('Liberacao de pendencia nao altera valor ou destino.');
  return { ...raw, motivo: raw.motivo.trim(), valor_anterior: dinheiro(anterior),
    ...(raw.acao === 'REDUZIR' ? { valor_autorizado: dinheiro(autorizado) } : {}),
    diferenca: dinheiro(anterior - autorizado) };
}
function repartir(total, pesos) {
  if (!Number.isSafeInteger(total) || total < 0 || !pesos.length || pesos.some(p => !Number.isSafeInteger(p) || p < 0)) throw erro('Rateio invalido.', 409);
  const soma = pesos.reduce((a, b) => a + b, 0);
  if (!soma) throw erro('Rateio sem base.', 409);
  const valores = pesos.map(p => Number(BigInt(p) * BigInt(total) / BigInt(soma)));
  let sobra = total - valores.reduce((a, b) => a + b, 0);
  const ordem = pesos.map((p, i) => ({ i, resto: BigInt(p) * BigInt(total) % BigInt(soma) }))
    .sort((a, b) => a.resto === b.resto ? a.i - b.i : a.resto > b.resto ? -1 : 1);
  for (const { i } of ordem) { if (!sobra) break; valores[i]++; sobra--; }
  return valores;
}
function protegido(titulo) { return Boolean(titulo?.medicao_pagamento || titulo?.medicao_pagamento_origem_id); }
function impedirEdicaoGenerica(titulo) {
  if (protegido(titulo)) throw erro('Titulo com valor autorizado de medicao: use o ajuste de pagamento na medicao para preservar a diferenca e o historico.', 409);
}
module.exports = { erro, estado, validar, repartir, protegido, impedirEdicaoGenerica, centavos, dinheiro };
