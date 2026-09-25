'use strict';

process.env.NODE_ENV = 'test';

const assert = require('assert');
const { __test } = require('../src/services/rhFechamentoService');
const apuracaoService = require('../src/services/rhApuracaoService');
const { vencimentoPadrao } = require('../src/services/rhTicketService');
const { __test: apuracaoTest } = apuracaoService;

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

const itemMensalComDecimoPrimeiraQuinzena = {
  ...itemMensal,
  colaborador: { ...colaboradorMensal, data_nascimento: '1990-08-12' },
  valor_liquido: 5700,
  detalhes_json: {
    resumo: { valor_proporcional: 3000 },
    jornada: { decimo_terceiro: 3000 }
  }
};
assert.deepStrictEqual(
  __test.buildParcelasColaborador(itemMensalComDecimoPrimeiraQuinzena, apuracao, {}).map((item) => item.valor),
  [4200, 1500],
  'o 13o deve entrar inteiro no titulo da quinzena do aniversario'
);

function agrupadoParaCalculo({ colaborador, jornada }) {
  return {
    colaborador,
    jornada,
    creditos: 0,
    debitos: 0,
    observacoes: new Set(),
    importacao_ids: new Set([1]),
    eventos: []
  };
}

const mensalSemDescontoDeFalta = apuracaoService.calcularItemApuracaoParaTeste(agrupadoParaCalculo({
  colaborador: colaboradorMensal,
  jornada: { dias_trabalhados: 10, faltas: 5, adicionais: 100, descontos_informados: 50 }
}), 30);
assert.strictEqual(Number(mensalSemDescontoDeFalta.valor_bruto), 3100);
assert.strictEqual(Number(mensalSemDescontoDeFalta.valor_liquido), 3050);
assert.strictEqual(mensalSemDescontoDeFalta.detalhes_json.resumo.faltas_apenas_informativas, true);

const mensalRateadoEntreObras = apuracaoService.calcularItemApuracaoParaTeste(agrupadoParaCalculo({
  colaborador: colaboradorMensal,
  jornada: {
    dias_trabalhados: 10,
    faltas: 0,
    adicionais: 0,
    descontos_informados: 0,
    total_dias_competencia: 25,
    total_obras_competencia: 2
  }
}), 30);
assert.strictEqual(Number(mensalRateadoEntreObras.valor_liquido), 1200,
  'o salario mensal deve ser rateado pelos dias entre obras, sem virar desconto por falta');
assert.strictEqual(mensalRateadoEntreObras.detalhes_json.resumo.rateio_multiobra, true);

assert.deepStrictEqual(
  __test.ratearValorEntreObras(3000, [
    { obraId: 10, peso: 1000 },
    { obraId: 20, peso: 2000 }
  ], 10),
  [
    { obraId: 10, valor: 1000 },
    { obraId: 20, valor: 2000 }
  ],
  'o titulo unico deve preservar o valor calculado em cada obra'
);
assert.strictEqual(
  __test.ratearValorEntreObras(100, [
    { obraId: 10, peso: 1 },
    { obraId: 20, peso: 1 },
    { obraId: 30, peso: 1 }
  ], 10).reduce((total, parte) => total + Math.round(parte.valor * 100), 0),
  10000,
  'o rateio em centavos nao pode perder nem criar valor'
);

const consolidadoMultiobra = apuracaoTest.combinarItensMultiobra([
  {
    obra: { id: 10, codigo: 'A', nome: 'Obra A' },
    item: mensalRateadoEntreObras
  },
  {
    obra: { id: 20, codigo: 'B', nome: 'Obra B' },
    item: {
      ...mensalRateadoEntreObras,
      dias_trabalhados: 15,
      valor_bruto: 1800,
      valor_liquido: 1800,
      detalhes_json: {
        ...mensalRateadoEntreObras.detalhes_json,
        importacao_ids: [2],
        resumo: { ...mensalRateadoEntreObras.detalhes_json.resumo, valor_proporcional: 1800 }
      }
    }
  }
], colaboradorMensal);
assert.strictEqual(consolidadoMultiobra.regra_aplicada, 'MULTIOBRA_CONSOLIDADA');
assert.strictEqual(Number(consolidadoMultiobra.valor_liquido), 3000);
assert.strictEqual(consolidadoMultiobra.detalhes_json.distribuicao_obras.length, 2);
assert.deepStrictEqual(consolidadoMultiobra.detalhes_json.importacao_ids, [1, 2]);

const mensalNaoClt = apuracaoService.calcularItemApuracaoParaTeste(agrupadoParaCalculo({
  colaborador: {
    ...colaboradorMensal,
    tipo_vinculo: 'NAO_CLT',
    salario_base: null,
    valor_contratual: 2400,
    forma_calculo_gerencial: 'MENSAL'
  },
  jornada: { dias_trabalhados: 8, faltas: 3, adicionais: 100, descontos_informados: 50 }
}), 30);
assert.strictEqual(mensalNaoClt.regra_aplicada, 'MENSAL_SIMPLIFICADA');
assert.strictEqual(Number(mensalNaoClt.valor_liquido), 2450,
  'mensalista nao CLT tambem recebe a base integral; faltas permanecem informativas');

const diariaCalculada = apuracaoService.calcularItemApuracaoParaTeste(agrupadoParaCalculo({
  colaborador: { ...colaboradorMensal, forma_calculo_gerencial: 'DIARIA', valor_diaria: 120 },
  jornada: { dias_trabalhados: 11, faltas: 2, adicionais: 80, descontos_informados: 30 }
}), 15);
assert.strictEqual(Number(diariaCalculada.valor_liquido), 1370);

const empreitadaCalculada = apuracaoService.calcularItemApuracaoParaTeste(agrupadoParaCalculo({
  colaborador: colaboradorMensal,
  jornada: {
    regime_pagamento: 'EMPREITADA',
    valor_empreitada: 5000,
    decimo_terceiro: 300,
    adicionais: 100,
    descontos_informados: 50,
    servicos_executados: ['Alvenaria do bloco A']
  }
}), 30);
assert.strictEqual(empreitadaCalculada.regra_aplicada, 'EMPREITADA');
assert.strictEqual(Number(empreitadaCalculada.valor_liquido), 5350);

assert.strictEqual(vencimentoPadrao('2026-09'), '2026-09-10');
assert.strictEqual(vencimentoPadrao('2026-10'), '2026-10-09', 'dia 10 no sabado deve antecipar para sexta');

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
