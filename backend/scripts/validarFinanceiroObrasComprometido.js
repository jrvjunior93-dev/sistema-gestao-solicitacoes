const assert = require('node:assert/strict');
const {
  MovimentoFinanceiro,
  ObraCustoHistorico,
  PedidoCompraFrete,
  TituloFinanceiro
} = require('../src/models');
const { gerarRelatorioFinanceiroObras } = require('../src/services/relatorioFinanceiroService');

const original = {
  movimentos: MovimentoFinanceiro.findAll,
  historicos: ObraCustoHistorico.findAll,
  fretes: PedidoCompraFrete.findAll,
  titulos: TituloFinanceiro.findAll
};

const tituloParcial = {
  id: 1, codigo: 'TIT-1', tipo: 'PAGAR', status: 'PARCIAL', obra_id: 3,
  valor_original: '100.00', valor_baixado: '70.00', valor_saldo: '30.00',
  data_vencimento: '2026-09-20', obra: { id: 3, nome: 'Edificio Italia', codigo: '7' }
};
const tituloAberto = {
  id: 2, codigo: 'TIT-2', tipo: 'RECEBER', status: 'ABERTO', obra_id: 3,
  valor_original: '50.00', valor_baixado: '0.00', valor_saldo: '50.00',
  data_vencimento: '2026-09-21', obra: { id: 3, nome: 'Edificio Italia', codigo: '7' }
};
const historico = {
  id: 21, obra_id: 3, tipo: 'PAGAR', valor: '20.00',
  data_pagamento: '2026-09-09', parceiro_nome: 'Fornecedor legado',
  obra: { id: 3, nome: 'Edificio Italia', codigo: '7' }
};
const filtros = {
  data_inicial: '2026-09-01', data_final: '2026-09-30', obra_id: '3',
  incluir_historico: '1'
};
const req = { user: { perfil: 'SUPERADMIN' } };
let somenteHistorico = false;

async function verificar() {
  MovimentoFinanceiro.findAll = async (options) => {
    assert.equal(options.where.status, 'ATIVO');
    assert.equal(options.include[0].where.obra_id, 3);
    return somenteHistorico ? [] : [{
      id: 11, titulo: tituloParcial, valor: '70.00', valor_quitacao: '70.00',
      data_movimento: '2026-09-10', status: 'ATIVO'
    }];
  };
  ObraCustoHistorico.findAll = async (options) => {
    assert.equal(options.where.ativo, true);
    assert.equal(options.where.obra_id, 3);
    return [historico];
  };
  TituloFinanceiro.findAll = async (options) => {
    assert.equal(options.where.obra_id, 3);
    assert.ok(options.where.data_vencimento);
    return somenteHistorico ? [] : [tituloParcial, tituloAberto];
  };
  PedidoCompraFrete.findAll = async () => [];

  const realizado = await gerarRelatorioFinanceiroObras(req, { ...filtros, analise: 'REALIZADO' });
  const aRealizar = await gerarRelatorioFinanceiroObras(req, { ...filtros, analise: 'A_REALIZAR' });
  const comprometido = await gerarRelatorioFinanceiroObras(req, { ...filtros, analise: 'COMPROMETIDO' });

  assert.equal(realizado.resumo.debito_total, 90);
  assert.equal(aRealizar.resumo.debito_total, 30);
  assert.equal(aRealizar.resumo.credito_total, 50);
  assert.equal(comprometido.resumo.debito_total, 120);
  assert.equal(comprometido.resumo.credito_total, 50);
  assert.equal(comprometido.resumo.debito_total,
    realizado.resumo.debito_total + aRealizar.resumo.debito_total);
  assert.equal(comprometido.resumo.historicos, 1);
  assert.equal(comprometido.resumo.movimentos, 1);
  assert.equal(comprometido.resumo.titulos, 2);
  assert.equal(comprometido.linhas.length, 4);
  assert.equal(comprometido.filtros.analise, 'COMPROMETIDO');
  assert.equal(comprometido.linhas.at(-1).saldo, -70);

  const semHistorico = await gerarRelatorioFinanceiroObras(req, {
    ...filtros, analise: 'COMPROMETIDO', incluir_historico: '0'
  });
  assert.equal(semHistorico.resumo.debito_total, 100);
  assert.equal(semHistorico.resumo.historicos, 0);

  somenteHistorico = true;
  const apenasPlanilha = await gerarRelatorioFinanceiroObras(req, {
    ...filtros, analise: 'COMPROMETIDO'
  });
  assert.equal(apenasPlanilha.resumo.debito_total, 20);
  assert.equal(apenasPlanilha.resumo.historicos, 1);
  assert.equal(apenasPlanilha.linhas.length, 1);

  console.log('Financeiro de Obras: comprometido = realizado + a realizar, sem duplicidade e com historico legado.');
}

verificar().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  MovimentoFinanceiro.findAll = original.movimentos;
  ObraCustoHistorico.findAll = original.historicos;
  PedidoCompraFrete.findAll = original.fretes;
  TituloFinanceiro.findAll = original.titulos;
});
