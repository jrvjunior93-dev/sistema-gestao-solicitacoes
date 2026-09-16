const assert = require('node:assert/strict');
const { MovimentoFinanceiro, ObraCustoHistorico, PedidoCompraFrete } = require('../src/models');
const { gerarRelatorioFinanceiroObras } = require('../src/services/relatorioFinanceiroService');

const originals = [MovimentoFinanceiro.findAll, ObraCustoHistorico.findAll, PedidoCompraFrete.findAll];
const linhas = Array.from({ length: 3201 }, (_, index) => ({
  id: index + 1,
  obra_id: 1,
  data_pagamento: '2025-05-01',
  valor: '1.00',
  tipo: 'PAGAR',
  parceiro_nome: 'Fornecedor legado'
}));

async function verificar() {
  MovimentoFinanceiro.findAll = async (options) => {
    assert.equal(options.limit, undefined);
    return [];
  };
  ObraCustoHistorico.findAll = async (options) => {
    assert.equal(options.where.ativo, true);
    assert.equal(options.limit, undefined);
    return linhas;
  };
  PedidoCompraFrete.findAll = async (options) => {
    assert.equal(options.limit, undefined);
    return [];
  };
  const report = await gerarRelatorioFinanceiroObras(
    { user: { perfil: 'SUPERADMIN' } },
    { analise: 'REALIZADO', data_inicial: '2025-05-01', data_final: '2025-05-31', obra_id: '1' }
  );
  assert.equal(report.linhas.length, 3201);
  assert.equal(report.resumo.historicos, 3201);
  assert.equal(report.resumo.debito_total, 3201);
  assert.equal(report.resumo.movimentos, 0);
  assert.equal(report.linhas[0].saldo, -1);
  assert.equal(report.linhas.at(-1).saldo, -3201);
  console.log('Financeiro de Obras: recorte completo sem limite silencioso nem movimento bancario.');
}

verificar().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  [MovimentoFinanceiro.findAll, ObraCustoHistorico.findAll, PedidoCompraFrete.findAll] = originals;
});
