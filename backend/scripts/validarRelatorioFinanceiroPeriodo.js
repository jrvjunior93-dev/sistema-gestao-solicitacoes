'use strict';

const assert = require('node:assert/strict');
const {
  isFluxoCaixaPermuta,
  limitarDataFinalRealizados,
  resolvePeriodo
} = require('../src/services/relatorioFinanceiroService');
const {
  validateFinanceFluxoCaixaQuery
} = require('../src/validators/financialValidators');

function run() {
  const hojeTeste = '2026-09-29';
  const ultimos7Dias = resolvePeriodo({ periodo: 'ULTIMOS_7_DIAS' }, { hoje: hojeTeste });
  const ultimos30Dias = resolvePeriodo({ periodo: 'ULTIMOS_30_DIAS' }, { hoje: hojeTeste });
  const ultimos90Dias = resolvePeriodo({ periodo: 'ULTIMOS_90_DIAS' }, { hoje: hojeTeste });
  const mesAnterior = resolvePeriodo({ periodo: 'MES_ANTERIOR' }, { hoje: hojeTeste });
  const proximos30Dias = resolvePeriodo({ periodo: '30_DIAS' }, { hoje: hojeTeste });

  assert.deepEqual(
    [ultimos7Dias.data_inicial, ultimos7Dias.data_final],
    ['2026-09-23', '2026-09-29']
  );
  assert.deepEqual(
    [ultimos30Dias.data_inicial, ultimos30Dias.data_final],
    ['2026-08-31', '2026-09-29']
  );
  assert.deepEqual(
    [ultimos90Dias.data_inicial, ultimos90Dias.data_final, ultimos90Dias.agrupamento],
    ['2026-07-02', '2026-09-29', 'MES']
  );
  assert.deepEqual(
    [mesAnterior.data_inicial, mesAnterior.data_final],
    ['2026-08-01', '2026-08-31']
  );
  assert.deepEqual(
    [proximos30Dias.data_inicial, proximos30Dias.data_final],
    ['2026-09-29', '2026-10-28']
  );
  assert.equal(
    validateFinanceFluxoCaixaQuery({ periodo: 'ULTIMOS_30_DIAS' }).periodo,
    'ULTIMOS_30_DIAS'
  );
  assert.equal(
    validateFinanceFluxoCaixaQuery({ periodo: 'MES_ANTERIOR' }).periodo,
    'MES_ANTERIOR'
  );

  const periodoLongo = resolvePeriodo({
    periodo: 'PERSONALIZADO',
    data_inicial: '2026-01-01',
    data_final: '2100-12-31'
  });

  assert.equal(periodoLongo.data_inicial, '2026-01-01');
  assert.equal(periodoLongo.data_final, '2100-12-31');
  assert.equal(periodoLongo.agrupamento, 'MES');

  assert.throws(
    () => resolvePeriodo({
      periodo: 'PERSONALIZADO',
      data_inicial: '2026-12-31',
      data_final: '2026-01-01'
    }),
    /Data inicial nao pode ser maior/
  );

  assert.throws(
    () => resolvePeriodo({
      periodo: 'PERSONALIZADO',
      data_inicial: '2026-01-01',
      data_final: '2028-01-01'
    }, { maxDays: 366 }),
    /periodo maximo do relatorio/
  );

  assert.equal(limitarDataFinalRealizados({ data_final: '2100-12-31' }, '2026-09-08'), '2026-09-08');
  assert.equal(limitarDataFinalRealizados({ data_final: '2026-08-31' }, '2026-09-08'), '2026-08-31');
  assert.equal(isFluxoCaixaPermuta({ forma_recebimento: 'PERMUTA' }), true);
  assert.equal(isFluxoCaixaPermuta({
    titulo: {
      parcelasComerciais: [{ periodicidade: 'PERMUTA' }]
    }
  }), true);
  assert.equal(isFluxoCaixaPermuta({
    forma_recebimento: 'PIX',
    titulo: { parcelasComerciais: [] }
  }), false);

  console.log('Validacao de periodo dos relatorios financeiros concluida com sucesso.');
}

run();
