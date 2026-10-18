'use strict';
// Dados bancarios/favorecido continuam vindo do snapshot servidor, nao da nota.
function comInstrucao(observacao, instrucao) {
  return [...new Set([instrucao, observacao].map(v => String(v || '').trim()).filter(Boolean))].join('\n') || null;
}
module.exports = { comInstrucao };
