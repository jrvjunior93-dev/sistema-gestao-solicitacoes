const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const {
  Obra, TituloFinanceiro, TituloFinanceiroRateio,
  ObraCustoHistorico, UnidadeComercial
} = require('../src/models');
const controller = require('../src/controllers/ResultadoObrasController');

const original = {
  obras: Obra.findAll,
  titulos: TituloFinanceiro.findAll,
  rateios: TituloFinanceiroRateio.findAll,
  historicos: ObraCustoHistorico.findAll,
  unidades: UnidadeComercial.findAll
};

async function main() {
  Obra.findAll = async () => [
    { id: 1, classificacao: 'PRIVADA', vgv: null, margem_custo_esperada: 20 },
    { id: 2, classificacao: 'PRIVADA', vgv: '1000000.00' },
    { id: 3, classificacao: 'PRIVADA', vgv: '0.00' },
    { id: 4, classificacao: 'PUBLICA', planilha_geral: '800000.00' }
  ];
  UnidadeComercial.findAll = async (options) => {
    assert.equal(options.where.ativo, true);
    assert.equal(options.where.excluido_em, null);
    assert.equal(options.include[0].where.ativo, true);
    assert.deepEqual(options.include[0].where.obra_id[Op.in], [1, 3]);
    assert.equal(options.where.situacao, undefined, 'Unidades vendidas tambem compoem o VGV');
    return [
      { valor_base_venda: '300000.15', empreendimento: { obra_id: 1 } },
      { valor_base_venda: '400000.25', empreendimento: { obra_id: 1 } },
      { valor_base_venda: '500000.00', empreendimento: { obra_id: 3 } },
      { valor_base_venda: null, empreendimento: { obra_id: 3 } }
    ];
  };
  TituloFinanceiro.findAll = async () => [
    { obra_id: 1, tipo: 'RECEBER', total_valor_original: '600000.00', total_valor_baixado: '200000.00', total_valor_saldo: '400000.00', quantidade: 1 },
    { obra_id: 3, tipo: 'RECEBER', total_valor_original: '100000.00', total_valor_baixado: '20000.00', total_valor_saldo: '80000.00', quantidade: 1 }
  ];
  TituloFinanceiroRateio.findAll = async () => [];
  ObraCustoHistorico.findAll = async () => [];

  let resultado;
  await controller.index({}, {
    json(payload) { resultado = payload; return this; },
    status(code) { throw new Error(`Status inesperado: ${code}`); }
  });

  assert.equal(resultado[0].vgv, null, 'O cadastro nao e sobrescrito');
  assert.equal(resultado[0].vgv_efetivo, 700000.40);
  assert.equal(resultado[0].vgv_origem, 'UNIDADES');
  assert.equal(resultado[0].vgv_unidades_total, 2);
  assert.equal(resultado[0].falta_receber, 500000.4);
  assert.ok(Math.abs(resultado[0].orcamento - 560000.32) < 0.001);

  assert.equal(resultado[1].vgv_efetivo, 1000000);
  assert.equal(resultado[1].vgv_origem, 'CADASTRO');
  assert.equal(resultado[2].vgv_efetivo, 0, 'Soma parcial nao deve virar VGV');
  assert.equal(resultado[2].vgv_origem, 'UNIDADES_INCOMPLETAS');
  assert.equal(resultado[2].vgv_unidades_sem_valor, 1);
  assert.equal(resultado[2].falta_receber, 80000, 'Sem VGV completo, prevalece o saldo dos titulos');
  assert.equal(resultado[3].planilha_geral, 800000);
  assert.equal(resultado[3].falta_receber, 800000);
  console.log('VGV privado: base de venda de unidades ativas, sem soma parcial nem alteracao do cadastro.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  Obra.findAll = original.obras;
  TituloFinanceiro.findAll = original.titulos;
  TituloFinanceiroRateio.findAll = original.rateios;
  ObraCustoHistorico.findAll = original.historicos;
  UnidadeComercial.findAll = original.unidades;
});
