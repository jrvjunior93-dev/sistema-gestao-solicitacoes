'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  classificarStatusOperacional,
  valoresBase
} = require('../src/services/contratoResumoOperacionalService');
const { decidirTituloNaRescisao } = require('../src/services/contratoFluxoNovoService');

const cenarios = [
  [{ contratado: 1000, medido: 400, movimentado: 200, rescindido: false }, 'ATIVO'],
  [{ contratado: 1000, medido: 1000, movimentado: 600, rescindido: false }, 'TOTALMENTE_MEDIDO'],
  [{ contratado: 1000, medido: 1000, movimentado: 1000, rescindido: false }, 'CONCLUIDO'],
  [{ contratado: 1000, medido: 400, movimentado: 200, rescindido: true }, 'RESCINDIDO']
];

for (const [entrada, esperado] of cenarios) {
  assert.strictEqual(classificarStatusOperacional(entrada), esperado);
}

assert.deepStrictEqual(
  valoresBase({ valor_total: '1000.00', valor_aditivos: '200.00', ajuste_solicitado: '50.00' }),
  { valor_base: 1000, valor_aditivos: 200, ajustes_legados: 50, contratado: 1250 }
);

assert.strictEqual(
  decidirTituloNaRescisao({ titulo: { id: 10, status: 'ABERTO', valor_baixado: 0 }, possuiMedicaoAtiva: true }).preservar,
  true,
  'Titulo de medicao aprovada deve permanecer exigivel apos a rescisao.'
);
assert.strictEqual(
  decidirTituloNaRescisao({ titulo: { id: 11, status: 'ABERTO', valor_baixado: 25 }, possuiMedicaoAtiva: false }).preservar,
  true,
  'Titulo com movimento financeiro deve ser preservado mesmo sem medicao ativa.'
);
assert.deepStrictEqual(
  decidirTituloNaRescisao({ titulo: { id: 12, status: 'ABERTO', valor_baixado: 0 }, possuiMedicaoAtiva: false }),
  { preservar: false, possuiMovimentoFinanceiro: false, podeExcluir: true },
  'Somente previsao futura sem medicao nem pagamento pode ser excluida.'
);

const migrationPath = path.join(
  __dirname,
  '..',
  'migrations',
  '202609290002_contrato_rescisao_rastreabilidade.js'
);
const migration = fs.readFileSync(migrationPath, 'utf8');
assert(!/sequelize\.query\s*\(\s*[`'"]\s*UPDATE\b/i.test(migration), 'Migration nao pode atualizar contratos existentes.');
assert(!/bulkUpdate\s*\(/i.test(migration), 'Migration nao pode executar backfill por bulkUpdate.');
assert(!/queryInterface\.bulkInsert\s*\(/i.test(migration), 'Migration nao pode classificar contratos por bulkInsert.');

console.log('Gestao operacional de contratos validada: status dinamicos e migration sem classificacao de dados.');
