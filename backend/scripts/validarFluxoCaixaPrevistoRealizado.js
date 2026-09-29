'use strict';

const assert = require('node:assert/strict');
const {
  acumularSerie,
  createBuckets,
  montarResumo,
  valorPlanejadoTitulo
} = require('../src/services/relatorioFinanceiroService');

function titulo({ id, tipo, status, vencimento, original, saldo, baixado = 0 }) {
  return {
    id,
    tipo,
    status,
    data_vencimento: vencimento,
    valor_original: original,
    valor_saldo: saldo,
    valor_baixado: baixado
  };
}

function movimento({ id, tipo, data, valor }) {
  return {
    id,
    data_movimento: data,
    valor_quitacao: valor,
    juros: 0,
    multa: 0,
    desconto: 0,
    titulo: { tipo }
  };
}

function run() {
  const dataLimiteRealizado = '2026-10-03';
  const periodo = {
    data_inicial: '2026-10-01',
    data_final: '2026-10-05',
    agrupamento: 'DIA'
  };
  const previstos = [
    titulo({
      id: 1,
      tipo: 'RECEBER',
      status: 'QUITADO',
      vencimento: '2026-10-01',
      original: 100,
      saldo: 0,
      baixado: 100
    }),
    titulo({
      id: 2,
      tipo: 'PAGAR',
      status: 'PARCIAL',
      vencimento: '2026-10-02',
      original: 200,
      saldo: 80,
      baixado: 120
    }),
    titulo({
      id: 3,
      tipo: 'RECEBER',
      status: 'ABERTO',
      vencimento: '2026-10-04',
      original: 300,
      saldo: 300
    }),
    titulo({
      id: 4,
      tipo: 'PAGAR',
      status: 'QUITADO',
      vencimento: '2026-10-05',
      original: 400,
      saldo: 0,
      baixado: 400
    })
  ];
  const realizados = [
    movimento({ id: 10, tipo: 'RECEBER', data: '2026-10-01', valor: 100 }),
    movimento({ id: 11, tipo: 'PAGAR', data: '2026-10-02', valor: 120 })
  ];

  assert.equal(valorPlanejadoTitulo(previstos[0], dataLimiteRealizado), 100);
  assert.equal(valorPlanejadoTitulo(previstos[1], dataLimiteRealizado), 200);
  assert.equal(valorPlanejadoTitulo(previstos[2], dataLimiteRealizado), 300);
  assert.equal(valorPlanejadoTitulo(previstos[3], dataLimiteRealizado), 0);
  assert.equal(valorPlanejadoTitulo({ ...previstos[0], status: 'CANCELADO' }, dataLimiteRealizado), 0);

  const serie = acumularSerie({
    buckets: createBuckets(periodo),
    previstos,
    realizados,
    agrupamento: periodo.agrupamento,
    dataLimiteRealizado
  });

  assert.equal(serie[0].entradas_previstas, 100);
  assert.equal(serie[1].saidas_previstas, 200);
  assert.equal(serie[3].entradas_previstas, 300);
  assert.equal(serie[2].saldo_previsto_comparavel_acumulado, -100);
  assert.equal(serie[2].saldo_realizado_acumulado, -20);
  assert.equal(serie[3].realizado_disponivel, false);
  assert.equal(serie[3].saldo_realizado, null);
  assert.equal(serie[3].saldo_realizado_acumulado, null);
  assert.equal(serie[3].saldo_previsto_comparavel, null);

  const resumo = montarResumo({ previstos, realizados, serie, dataLimiteRealizado });
  assert.equal(resumo.entradas_previstas, 400);
  assert.equal(resumo.saidas_previstas, 200);
  assert.equal(resumo.saldo_previsto, 200);
  assert.equal(resumo.saldo_previsto_ate_data, -100);
  assert.equal(resumo.saldo_realizado, -20);
  assert.equal(resumo.variacao_realizado_vs_previsto, 80);
  assert.equal(resumo.entradas_previstas_futuras, 300);
  assert.equal(resumo.saidas_previstas_futuras, 0);
  assert.equal(resumo.saldo_projecao_restante, 300);
  assert.equal(resumo.titulos_previstos, 3);

  console.log('Fluxo de caixa previsto x realizado validado com sucesso.');
}

run();
