'use strict';

process.env.NODE_ENV = 'test';

const assert = require('assert');
const { __test } = require('../src/services/rhFechamentoService');
const { __test: apuracaoTest } = require('../src/services/rhApuracaoService');

const apuracao = { competencia: '2026-08' };
const colaboradorMensal = {
  id: 1,
  nome: 'Colaborador mensal',
  tipo_vinculo: 'CLT',
  salario_base: 3000,
  forma_calculo_gerencial: 'MENSAL',
  pagamento_automatico_40_60: true
};
const itemMensal = {
  colaborador: colaboradorMensal,
  valor_base_calculo: 3000,
  valor_liquido: 2700,
  detalhes_json: { resumo: { valor_proporcional: 3000 } }
};

const parcelas = __test.buildParcelasColaborador(itemMensal, apuracao, {});
assert.deepStrictEqual(parcelas.map((item) => item.valor), [1200, 1500]);
assert.strictEqual(parcelas[0].dataVencimento, '2026-08-14');
assert.strictEqual(parcelas[1].dataVencimento, '2026-08-31');

const ajustadas = __test.buildParcelasColaborador(itemMensal, apuracao, {}, {
  valor_40: 1100,
  valor_60: 1600,
  observacao: 'Ajuste acordado para a competencia'
});
assert.deepStrictEqual(ajustadas.map((item) => item.valor), [1100, 1600]);

assert.throws(
  () => __test.buildParcelasColaborador(itemMensal, apuracao, {}, {
    valor_40: 1000,
    valor_60: 1600,
    observacao: 'Total incorreto'
  }),
  /deve totalizar o liquido/
);
assert.throws(
  () => __test.buildParcelasColaborador(itemMensal, apuracao, {}, {
    valor_40: 1100,
    valor_60: 1600,
    observacao: ''
  }),
  /Informe a observacao/
);

const diaria = __test.buildParcelasColaborador({
  colaborador: {
    id: 2,
    nome: 'Colaborador diarista',
    forma_calculo_gerencial: 'DIARIA',
    pagamento_automatico_40_60: false
  },
  valor_liquido: 880
}, apuracao, {});
assert.deepStrictEqual(diaria.map((item) => [item.tipoTitulo, item.valor]), [['DIARIAS', 880]]);

const filtrosClt = apuracaoTest.filtrosRecortesImportacoesConfirmadas({
  competencia: '2026-09',
  empresa_grupo_id: 2,
  tipo_vinculo: 'CLT'
});
assert.strictEqual(filtrosClt.importacaoWhere.tipo_vinculo, undefined,
  'o tipo de vinculo nao pode filtrar o cabecalho de uma jornada mista');
assert.strictEqual(filtrosClt.colaboradorWhere.tipo_vinculo, 'CLT',
  'o tipo de vinculo deve filtrar o colaborador da linha');
assert.strictEqual(filtrosClt.importacaoWhere.competencia, '2026-09');
assert.strictEqual(filtrosClt.importacaoWhere.empresa_grupo_id, 2);

assert.deepStrictEqual(apuracaoTest.whereApuracaoRecorte({
  competencia: '2026-09',
  empresa_grupo_id: 2,
  obra_id: 3,
  tipo_vinculo: 'CLT'
}, 'CONFERIDA'), {
  competencia: '2026-09',
  empresa_grupo_id: 2,
  obra_id: 3,
  tipo_vinculo: 'CLT',
  status: 'CONFERIDA'
});

console.log('Validacao das regras gerenciais de pagamento RH/DP concluida com sucesso.');
