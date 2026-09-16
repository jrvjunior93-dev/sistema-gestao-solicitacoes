'use strict';

const assert = require('node:assert/strict');
const { resolvePeriodo } = require('../src/services/relatorioFinanceiroService');

function run() {
  const periodoLongo = resolvePeriodo({
    periodo: 'PERSONALIZADO',
    data_inicial: '2026-01-01',
    data_final: '2100-12-31'
  });
  assert.equal(periodoLongo.data_inicial, '2026-01-01');
  assert.equal(periodoLongo.data_final, '2100-12-31');
  assert.equal(periodoLongo.agrupamento, 'MES');

  assert.throws(() => resolvePeriodo({
    periodo: 'PERSONALIZADO',
    data_inicial: '2026-12-31',
    data_final: '2026-01-01'
  }), /Data inicial nao pode ser maior/);

  assert.throws(() => resolvePeriodo({
    periodo: 'PERSONALIZADO',
    data_inicial: '2026-01-01',
    data_final: '2028-01-01'
  }, { maxDays: 366 }), /periodo maximo do relatorio/);

  console.log('Periodo livre em relatorios financeiros validado.');
}

run();
