const assert = require('node:assert/strict');
const { Obra, TituloFinanceiro, TituloFinanceiroRateio, ObraCustoHistorico, ContratoComercial } = require('../src/models');
const controller = require('../src/controllers/ResultadoObrasController');

const original = {
  obras: Obra.findAll,
  titulos: TituloFinanceiro.findAll,
  rateios: TituloFinanceiroRateio.findAll,
  historicos: ObraCustoHistorico.findAll,
  contratos: ContratoComercial.findAll
};

async function main() {
  Obra.findAll = async () => [
    { id: 1, codigo: '1', nome: 'Obra A', classificacao: 'PRIVADA', vgv: 500 },
    { id: 2, codigo: '2', nome: 'Obra B', classificacao: 'PUBLICA', planilha_geral: 300 }
  ];
  ContratoComercial.findAll = async () => [];
  TituloFinanceiro.findAll = async (options) => {
    if (!options.group) return []; // Nenhuma parcela de negociação nesta fixture de legado.
    assert.equal(options.where.renegociacao_id, null, 'Agregado direto não pode duplicar parcelas rateadas');
    return [
    { obra_id: 1, tipo: 'PAGAR', total_valor_original: '100.00', total_valor_baixado: '60.00', total_valor_saldo: '40.00', quantidade: '1' },
    { obra_id: 1, tipo: 'RECEBER', total_valor_original: '200.00', total_valor_baixado: '100.00', total_valor_saldo: '100.00', quantidade: '1' }
    ];
  };
  TituloFinanceiroRateio.findAll = async () => [{
    obra_id: 2,
    valor_rateio: '50.00',
    tituloFinanceiro: { tipo: 'PAGAR', valor_original: '100.00', valor_baixado: '50.00' }
  }];
  ObraCustoHistorico.findAll = async (options) => {
    assert.equal(options.where.ativo, true, 'Historico inativo nao pode entrar no resultado');
    assert.deepEqual(options.group, ['obra_id', 'tipo']);
    return [
      { obra_id: 1, tipo: 'PAGAR', valor_total: '30.00', quantidade: '2' },
      { obra_id: 1, tipo: 'RECEBER', valor_total: '20.00', quantidade: '1' },
      { obra_id: 2, tipo: 'PAGAR', valor_total: '10.00', quantidade: '1' }
    ];
  };

  let resultado;
  const res = {
    json(payload) { resultado = payload; return this; },
    status(code) { throw new Error(`Status inesperado: ${code}`); }
  };
  await controller.index({}, res);
  assert.equal(resultado.length, 2);
  assert.deepEqual(
    [resultado[0].pagar.total, resultado[0].pagar.executado, resultado[0].pagar.saldo, resultado[0].pagar.quantidade],
    [130, 90, 40, 3]
  );
  assert.deepEqual(resultado[0].pagar.historico, { valor: 30, quantidade: 2 });
  assert.deepEqual(
    [resultado[0].receber.total, resultado[0].receber.recebido, resultado[0].receber.saldo, resultado[0].lucro_prejuizo],
    [220, 120, 100, 30]
  );
  assert.deepEqual(resultado[0].receber.historico, { valor: 20, quantidade: 1 });
  assert.deepEqual(
    [resultado[1].pagar.total, resultado[1].pagar.executado, resultado[1].pagar.saldo, resultado[1].pagar.historico.valor],
    [60, 35, 25, 10]
  );
  assert.equal(resultado[1].receber.recebido, 0);
  console.log('Resultado de Obras: historico importado computado no realizado sem gerar baixas nem saldos pendentes.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  Obra.findAll = original.obras;
  TituloFinanceiro.findAll = original.titulos;
  TituloFinanceiroRateio.findAll = original.rateios;
  ObraCustoHistorico.findAll = original.historicos;
  ContratoComercial.findAll = original.contratos;
});
