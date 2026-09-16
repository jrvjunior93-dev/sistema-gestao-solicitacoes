const assert = require('node:assert/strict');
const { Obra, TituloFinanceiro, ObraCustoHistorico } = require('../src/models');
const controller = require('../src/controllers/ResultadoObrasController');

const originals = [Obra.findAll, TituloFinanceiro.findAll, ObraCustoHistorico.findAll];

async function verificar() {
  Obra.findAll = async () => [{ id: 1, nome: 'Obra teste', classificacao: 'PRIVADA', vgv: 500 }];
  TituloFinanceiro.findAll = async () => [
    { obra_id: 1, tipo: 'PAGAR', total_valor_original: '100.00', total_valor_baixado: '60.00', total_valor_saldo: '40.00', quantidade: '1' },
    { obra_id: 1, tipo: 'RECEBER', total_valor_original: '200.00', total_valor_baixado: '100.00', total_valor_saldo: '100.00', quantidade: '1' }
  ];
  ObraCustoHistorico.findAll = async (options) => {
    assert.equal(options.where.ativo, true);
    assert.deepEqual(options.group, ['obra_id', 'tipo']);
    return [
      { obra_id: 1, tipo: 'PAGAR', valor_total: '30.00', quantidade: '2' },
      { obra_id: 1, tipo: 'RECEBER', valor_total: '20.00', quantidade: '1' }
    ];
  };
  let result;
  await controller.index({}, {
    json(value) { result = value; },
    status(code) { throw new Error(`Erro HTTP ${code}`); }
  });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].pagar, { total: 130, executado: 90, saldo: 40, quantidade: 3, historico: { valor: 30, quantidade: 2 } });
  assert.deepEqual(result[0].receber, { total: 220, recebido: 120, saldo: 100, quantidade: 2, historico: { valor: 20, quantidade: 1 } });
  assert.equal(result[0].lucro_prejuizo, 30);
  console.log('Historico importado no realizado do Resultado de Obras, sem alterar saldo aberto.');
}

verificar().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  [Obra.findAll, TituloFinanceiro.findAll, ObraCustoHistorico.findAll] = originals;
});
