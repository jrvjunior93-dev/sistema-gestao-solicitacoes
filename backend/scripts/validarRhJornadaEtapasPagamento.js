'use strict';

process.env.NODE_ENV = 'test';

const assert = require('assert');
const {
  CategoriaFinanceira, RhApuracaoEvento, RhApuracaoEventoItem, RhColaboradorCalculoHistorico,
  RhFechamento, TituloFinanceiroRateio
} = require('../src/models');
const apuracaoService = require('../src/services/rhApuracaoService');
const calculoHistoricoService = require('../src/services/rhCalculoHistoricoService');
const { normalizarPeriodo, registrarJornadaGerencial } = require('../src/services/rhJornadaFormularioService');
const { __test: fechamentoTest } = require('../src/services/rhFechamentoService');

const colaborador = {
  id: 91,
  nome: 'Mensal de teste',
  tipo_vinculo: 'CLT',
  salario_base: 3000,
  forma_calculo_gerencial: 'MENSAL',
  pagamento_automatico_40_60: true
};

function calcular({ dias = 15, adicionais = 0, descontos = 0 } = {}) {
  return apuracaoService.calcularItemApuracaoParaTeste({
    colaborador,
    jornada: { dias_trabalhados: dias, adicionais, descontos_informados: descontos },
    creditos: 0,
    debitos: 0,
    observacoes: new Set(),
    importacao_ids: new Set([1]),
    eventos: []
  }, 30);
}

async function validar() {
  const flagGerencialOriginal = process.env.RH_JORNADA_GERENCIAL_V2;
  try {
    process.env.RH_JORNADA_GERENCIAL_V2 = 'OFF';
    await assert.rejects(registrarJornadaGerencial({}), /nao esta habilitado/);
    process.env.RH_JORNADA_GERENCIAL_V2 = 'ON';
    await assert.rejects(registrarJornadaGerencial({
      idempotency_key: '1234567890abcdef',
      linhas: [{ colaborador_id: 1, intencao_pagamento: 'PROPORCIONAL' },
        { colaborador_id: 1, intencao_pagamento: 'DIARIA' }]
    }), /apenas uma vez/);
  } finally {
    if (flagGerencialOriginal === undefined) delete process.env.RH_JORNADA_GERENCIAL_V2;
    else process.env.RH_JORNADA_GERENCIAL_V2 = flagGerencialOriginal;
  }
  assert.deepStrictEqual(
    [normalizarPeriodo({ modo_gerencial_v2: true }, '2026-10', 'ADIANTAMENTO_40').inicio,
      normalizarPeriodo({ modo_gerencial_v2: true }, '2026-10', 'ADIANTAMENTO_40').fim],
    ['2026-10-01', '2026-10-31']
  );
  assert.strictEqual(normalizarPeriodo({}, '2026-10', 'ADIANTAMENTO_40').fim, '2026-10-15');
  const jornadaGerencial = apuracaoService.calcularItemApuracaoParaTeste({
    colaborador,
    jornada: { modo_gerencial_v2: true, dias_trabalhados: 15,
      total_dias_competencia: 30, total_obras_competencia: 2 },
    creditos: 0, debitos: 0, observacoes: new Set(),
    importacao_ids: new Set([10]), eventos: []
  }, 30);
  assert.strictEqual(jornadaGerencial.valor_bruto, 3000);
  const mensalMultiobra = apuracaoService.__test.combinarItensMultiobra([
    { obra: { id: 10, nome: 'A' }, item: jornadaGerencial },
    { obra: { id: 20, nome: 'B' }, item: { ...jornadaGerencial,
      detalhes_json: { ...jornadaGerencial.detalhes_json, importacao_ids: [11] } } }
  ], colaborador);
  assert.strictEqual(mensalMultiobra.valor_bruto, 3000);
  assert.strictEqual(mensalMultiobra.valor_liquido, 3000);
  assert.strictEqual(mensalMultiobra.detalhes_json.resumo.valor_proporcional, 3000);
  assert.strictEqual(apuracaoService.__test.diasProporcionaisComAdiantamentos({
    dias_trabalhados: 15, detalhes_json: {}
  }, 20, [{ dias_trabalhados: 15, apuracao: { obra_id: 10 } }]), 30);
  assert.strictEqual(apuracaoService.__test.diasProporcionaisComAdiantamentos({
    dias_trabalhados: 15, detalhes_json: {}
  }, 10, [{ dias_trabalhados: 10, apuracao: { obra_id: 10 } }]), 15);
  const categoriasFindAll = CategoriaFinanceira.findAll;
  const categoriaSalarios = {
    id: 17, nome: '2.01.02.01 - Salários e Ordenados', tipo: 'PAGAR',
    ativo: true, considera_dre: true, dre_grupo: 'Custos com pessoal'
  };
  try {
    CategoriaFinanceira.findAll = async ({ where }) => {
      assert.strictEqual(where.nome[require('sequelize').Op.like], '2.01.02.01 - %');
      return [categoriaSalarios];
    };
    assert.strictEqual(await fechamentoTest.ensureCategoriaFinanceiraPagar(), categoriaSalarios);
    CategoriaFinanceira.findAll = async () => [];
    await assert.rejects(fechamentoTest.ensureCategoriaFinanceiraPagar(), /categoria financeira ativa/);
  } finally {
    CategoriaFinanceira.findAll = categoriasFindAll;
  }
  const historicoFindAllBanco = RhColaboradorCalculoHistorico.findAll;
  RhColaboradorCalculoHistorico.findAll = async () => [];
  assert.strictEqual(calculoHistoricoService.proporcionalMensalAteMudanca(3000, 19), 1900);
  assert.strictEqual(calculoHistoricoService.proporcionalMensalAteMudanca(3000, 30), 3000);
  assert.strictEqual(calculoHistoricoService.proporcionalMensalAteMudanca(3000, 31), 3000);
  const acertoPositivo = apuracaoService.__test.calcularAcertoConversao({
    diariaLiquida: 300, mensalDevido: 1900, mensalPago: 1200,
    ajustesPendentes: 0, creditoAnterior: 0, primeiroEnvio: true
  });
  assert.strictEqual(acertoPositivo.valor_a_pagar, 1000);
  assert.strictEqual(acertoPositivo.credito_restante, 0);
  const saldoMensalJaFechado = apuracaoService.__test.calcularAcertoConversao({
    diariaLiquida: 1500, mensalDevido: 1900, mensalPago: 2900,
    ajustesPendentes: -100, creditoAnterior: 0, primeiroEnvio: true
  });
  assert.strictEqual(saldoMensalJaFechado.ajuste_mensal, -1100);
  assert.strictEqual(saldoMensalJaFechado.valor_a_pagar, 400);
  const primeiraComCredito = apuracaoService.__test.calcularAcertoConversao({
    diariaLiquida: 200, mensalDevido: 600, mensalPago: 1200,
    ajustesPendentes: 0, creditoAnterior: 0, primeiroEnvio: true
  });
  assert.strictEqual(primeiraComCredito.valor_a_pagar, 0);
  assert.strictEqual(primeiraComCredito.credito_restante, 400);
  const segundaComCredito = apuracaoService.__test.calcularAcertoConversao({
    diariaLiquida: 250, mensalDevido: 600, mensalPago: 1200,
    ajustesPendentes: 0, creditoAnterior: 400, primeiroEnvio: false
  });
  assert.strictEqual(segundaComCredito.valor_a_pagar, 0);
  assert.strictEqual(segundaComCredito.credito_restante, 150);
  const terceiraComCredito = apuracaoService.__test.calcularAcertoConversao({
    diariaLiquida: 200, mensalDevido: 600, mensalPago: 1200,
    ajustesPendentes: 0, creditoAnterior: 150, primeiroEnvio: false
  });
  assert.strictEqual(terceiraComCredito.valor_a_pagar, 50);
  assert.strictEqual(terceiraComCredito.credito_restante, 0);

  const historicoFindAllOriginal = RhColaboradorCalculoHistorico.findAll;
  const eventoFindAllOriginal = RhApuracaoEvento.findAll;
  RhColaboradorCalculoHistorico.findAll = async () => [
    { forma_calculo: 'MENSAL', vigencia_inicio: '2026-10-01', vigencia_fim: '2026-10-06' },
    { forma_calculo: 'DIARIA', vigencia_inicio: '2026-10-07', vigencia_fim: null }
  ];
  const diariaCompensada = {
    colaborador_id: 91,
    valor_bruto: 200,
    valor_descontos: 0,
    valor_liquido: 200,
    detalhes_json: { resumo: {} },
    async update(patch) { Object.assign(this, patch); }
  };
  RhApuracaoEvento.findAll = async ({ where }) => where.apuracao_id
    ? [diariaCompensada]
    : [{
        id: 12, valor_base_calculo: 3000, valor_liquido: 1200,
        detalhes_json: { resumo: {} },
        apuracao: { etapa_pagamento: 'ADIANTAMENTO_40', fechamentoRh: { status: 'FECHADO' } }
      }];
  try {
    await apuracaoService.__test.aplicarAcertoConversaoNaApuracao({
      id: 13, competencia: '2026-10', etapa_pagamento: 'DIARIA'
    });
    assert.strictEqual(diariaCompensada.valor_liquido, 0);
    assert.strictEqual(diariaCompensada.detalhes_json.resumo.acerto_conversao.mensal_devido, 600);
    assert.strictEqual(diariaCompensada.detalhes_json.resumo.acerto_conversao.credito_restante, 400);
  } finally {
    RhColaboradorCalculoHistorico.findAll = historicoFindAllOriginal;
    RhApuracaoEvento.findAll = eventoFindAllOriginal;
  }
  const primeiro = await apuracaoService.__test.ajustarItemParaEtapa(
    calcular(), { competencia: '2026-10', etapa_pagamento: 'ADIANTAMENTO_40' }
  );
  assert.strictEqual(Number(primeiro.valor_liquido), 1200);
  assert.strictEqual(Number(primeiro.valor_descontos), 0);
  RhColaboradorCalculoHistorico.findAll = async () => [
    { forma_calculo: 'MENSAL', vigencia_inicio: '2026-10-01', vigencia_fim: '2026-10-19' },
    { forma_calculo: 'DIARIA', vigencia_inicio: '2026-10-20', vigencia_fim: null }
  ];
  const findMensalParaConversao = RhApuracaoEvento.findAll;
  RhApuracaoEvento.findAll = async () => [{ valor_liquido: 1200, detalhes_json: { resumo: {} } }];
  try {
    const saldoProporcional = await apuracaoService.__test.ajustarItemParaEtapa(
      calcular(), { competencia: '2026-10', etapa_pagamento: 'SALDO_60' }
    );
    assert.strictEqual(Number(saldoProporcional.valor_liquido), 700);
    assert.strictEqual(Number(saldoProporcional.detalhes_json.resumo.valor_mensal_devido_ate_mudanca), 1900);
  } finally {
    RhApuracaoEvento.findAll = findMensalParaConversao;
    RhColaboradorCalculoHistorico.findAll = async () => [];
  }
  assert.deepStrictEqual(
    fechamentoTest.buildParcelasColaborador(
      { ...primeiro, colaborador },
      { competencia: '2026-10', etapa_pagamento: 'ADIANTAMENTO_40' }
    ).map((parcela) => [parcela.numeroSufixo, parcela.valor]),
    [['40', 1200]]
  );

  const findAllOriginal = RhApuracaoEvento.findAll;
  RhApuracaoEvento.findAll = async () => [{ valor_liquido: 1200 }];
  try {
    const segundo = await apuracaoService.__test.ajustarItemParaEtapa(
      calcular({ adicionais: 100, descontos: 50 }),
      { competencia: '2026-10', etapa_pagamento: 'SALDO_60' }
    );
    assert.strictEqual(Number(segundo.valor_liquido), 1850);
    assert.strictEqual(Number(segundo.detalhes_json.resumo.adiantamento_40_anterior), 1200);
    assert.deepStrictEqual(
      fechamentoTest.buildParcelasColaborador(
        { ...segundo, colaborador },
        { competencia: '2026-10', etapa_pagamento: 'SALDO_60' }
      ).map((parcela) => [parcela.numeroSufixo, parcela.valor]),
      [['60', 1850]]
    );
  } finally {
    RhApuracaoEvento.findAll = findAllOriginal;
  }

  const itemGerencial = (dias) => apuracaoService.calcularItemApuracaoParaTeste({
    colaborador: { ...colaborador, tipo_vinculo: 'NAO_CLT',
      valor_contratual: 0, pagamento_automatico_40_60: false },
    jornada: { modo_gerencial_v2: true, dias_trabalhados: dias },
    creditos: 0, debitos: 0, observacoes: new Set(),
    importacao_ids: new Set([30]), eventos: []
  }, 30);
  RhApuracaoEvento.findAll = async () => [];
  try {
    const quarentaGerencial = await apuracaoService.__test.ajustarItemParaEtapa(
      itemGerencial(15), { competencia: '2026-10', etapa_pagamento: 'ADIANTAMENTO_40' }
    );
    assert.strictEqual(Number(quarentaGerencial.valor_liquido), 1200);
    assert.strictEqual(fechamentoTest.buildParcelasColaborador(
      { ...quarentaGerencial, colaborador: { ...colaborador, pagamento_automatico_40_60: false } },
      { competencia: '2026-10', etapa_pagamento: 'ADIANTAMENTO_40' }
    )[0].numeroSufixo, '40');
    const proporcional = await apuracaoService.__test.ajustarItemParaEtapa(
      itemGerencial(15), { competencia: '2026-10', etapa_pagamento: 'PROPORCIONAL', obra_id: 10 }
    );
    assert.strictEqual(Number(proporcional.valor_liquido), 1500);
    assert.strictEqual(proporcional.detalhes_json.resumo.divisor_gerencial, 30);
    assert.strictEqual(fechamentoTest.buildParcelasColaborador(
      { ...proporcional, colaborador: { ...colaborador, pagamento_automatico_40_60: false } },
      { competencia: '2026-10', etapa_pagamento: 'PROPORCIONAL' }
    )[0].numeroSufixo, 'PROP');
    RhApuracaoEvento.findAll = async () => [{
      valor_liquido: 1200, dias_trabalhados: 15, detalhes_json: { resumo: {} },
      apuracao: { obra_id: 10, fechamentoRh: { status: 'FECHADO' } }
    }];
    const aposQuarenta = await apuracaoService.__test.ajustarItemParaEtapa(
      itemGerencial(20), { competencia: '2026-10', etapa_pagamento: 'PROPORCIONAL', obra_id: 10 }
    );
    assert.strictEqual(Number(aposQuarenta.valor_liquido), 800);
    RhApuracaoEvento.findAll = async () => [{
      valor_liquido: 1200, dias_trabalhados: 15, detalhes_json: { resumo: {} },
      apuracao: { obra_id: 10, fechamentoRh: { status: 'FECHADO' } }
    }];
    const proporcionalNaOutraObra = await apuracaoService.__test.ajustarItemParaEtapa(
      itemGerencial(15), { competencia: '2026-10', etapa_pagamento: 'PROPORCIONAL', obra_id: 20 }
    );
    assert.strictEqual(Number(proporcionalNaOutraObra.valor_liquido), 1800);
    assert.strictEqual(proporcionalNaOutraObra.detalhes_json.resumo.dias_reconhecidos, 30);
    RhApuracaoEvento.findAll = async () => [];
    const fevereiroIntegral = await apuracaoService.__test.ajustarItemParaEtapa(
      itemGerencial(28), { competencia: '2027-02', etapa_pagamento: 'PROPORCIONAL', obra_id: 10 }
    );
    assert.strictEqual(Number(fevereiroIntegral.valor_liquido), 3000);
  } finally {
    RhApuracaoEvento.findAll = findAllOriginal;
  }

  const primeiroComAjustes = await apuracaoService.__test.ajustarItemParaEtapa(
    calcular({ adicionais: 100, descontos: 50 }),
    { competencia: '2026-10', etapa_pagamento: 'ADIANTAMENTO_40' }
  );
  assert.strictEqual(Number(primeiroComAjustes.valor_liquido), 1200);
  assert.strictEqual(Number(primeiroComAjustes.detalhes_json.resumo.ajuste_credito_pendente_40), 100);
  assert.strictEqual(Number(primeiroComAjustes.detalhes_json.resumo.ajuste_debito_pendente_40), 50);
  RhApuracaoEvento.findAll = async () => [primeiroComAjustes];
  try {
    const saldoComAjustes = await apuracaoService.__test.ajustarItemParaEtapa(
      calcular({ adicionais: 200, descontos: 20 }),
      { competencia: '2026-10', etapa_pagamento: 'SALDO_60' }
    );
    assert.strictEqual(Number(saldoComAjustes.valor_liquido), 2030);
  } finally {
    RhApuracaoEvento.findAll = findAllOriginal;
  }

  const diaria = {
    colaborador: { ...colaborador, forma_calculo_gerencial: 'DIARIA', pagamento_automatico_40_60: false },
    valor_liquido: 420,
    detalhes_json: { forma_calculo_gerencial: 'DIARIA' }
  };
  const primeiraDiaria = fechamentoTest.buildParcelasColaborador(
    diaria, { competencia: '2026-10', etapa_pagamento: 'DIARIA', importacao_id: 10 }
  );
  const segundaDiaria = fechamentoTest.buildParcelasColaborador(
    diaria, { competencia: '2026-10', etapa_pagamento: 'DIARIA', importacao_id: 11 }
  );
  assert.strictEqual(primeiraDiaria[0].numeroSufixo, 'DIARIA-10');
  assert.strictEqual(segundaDiaria[0].numeroSufixo, 'DIARIA-11');

  assert.deepStrictEqual(fechamentoTest.ratearValorEntreObras(1200, [
    { obraId: 10, peso: 10 }, { obraId: 20, peso: 20 }
  ]), [
    { obraId: 10, valor: 400 }, { obraId: 20, valor: 800 }
  ]);

  const diasDoMes = fechamentoTest.juntarDiasPorObra(
    [{ obraId: 10, peso: 15 }],
    [{ obraId: 20, peso: 15 }]
  );
  assert.deepStrictEqual(fechamentoTest.juntarDiasProporcionaisPorObra(
    [{ obraId: 10, peso: 10 }],
    [{ obraId: 10, peso: 15 }, { obraId: 20, peso: 15 }]
  ), [{ obraId: 10, peso: 15 }, { obraId: 20, peso: 15 }]);
  assert.deepStrictEqual(fechamentoTest.ratearValorEntreObras(1200, diasDoMes), [
    { obraId: 10, valor: 600 }, { obraId: 20, valor: 600 }
  ]);
  assert.deepStrictEqual(fechamentoTest.ratearValorEntreObras(1800, diasDoMes), [
    { obraId: 10, valor: 900 }, { obraId: 20, valor: 900 }
  ]);

  const rateioExistente = {
    obra_id: 10,
    valor_rateio: 1200,
    observacoes: 'Rateio inicial',
    async update(patch) { Object.assign(this, patch); },
    async destroy() { this.removido = true; }
  };
  const criados = [];
  const rateiosEmMemoria = [rateioExistente];
  const findRateiosOriginal = TituloFinanceiroRateio.findAll;
  const createRateioOriginal = TituloFinanceiroRateio.create;
  TituloFinanceiroRateio.findAll = async () => rateiosEmMemoria.filter((rateio) => !rateio.removido);
  TituloFinanceiroRateio.create = async (payload) => {
    const rateio = {
      ...payload,
      async update(patch) { Object.assign(this, patch); },
      async destroy() { this.removido = true; }
    };
    criados.push(rateio);
    rateiosEmMemoria.push(rateio);
    return rateio;
  };
  try {
    const titulo40 = {
      id: 30,
      valor_original: 1200,
      observacoes: 'Titulo RH',
      async update(patch) { Object.assign(this, patch); }
    };
    const anteriores = await fechamentoTest.reclassificarRateiosTitulo(
      titulo40,
      fechamentoTest.ratearValorEntreObras(1200, diasDoMes),
      'Auditoria da competencia 2026-10',
      7,
      { LOCK: { UPDATE: 'UPDATE' } }
    );
    assert.deepStrictEqual(anteriores, [{ obraId: 10, valor: 1200 }]);
    assert.strictEqual(rateioExistente.valor_rateio, 600);
    assert.deepStrictEqual(criados.map((rateio) => [rateio.obra_id, rateio.valor_rateio]), [[20, 600]]);
    assert.match(titulo40.observacoes, /antes=.*1200.*depois=/);
    await fechamentoTest.reclassificarRateiosTitulo(
      titulo40, anteriores,
      'Restauracao auditada dos 40%', 7,
      { LOCK: { UPDATE: 'UPDATE' } }
    );
    assert.strictEqual(rateioExistente.valor_rateio, 1200);
    assert.strictEqual(criados[0].removido, true);
    assert.match(titulo40.observacoes, /Restauracao auditada dos 40%/);
  } finally {
    TituloFinanceiroRateio.findAll = findRateiosOriginal;
    TituloFinanceiroRateio.create = createRateioOriginal;
  }

  const findEventosOriginal = RhApuracaoEvento.findAll;
  const findRecorrenteOriginal = RhApuracaoEventoItem.findOne;
  const findFechamentoOriginal = RhFechamento.findOne;
  RhApuracaoEvento.findAll = async () => [{ colaborador_id: 91 }];
  RhApuracaoEventoItem.findOne = async () => ({ evento: { apuracao: { id: 22 } } });
  RhFechamento.findOne = async () => ({ id: 23, status: 'FECHADO' });
  try {
    await apuracaoService.__test.aplicarRecorrentesNaApuracao({
      id: 24, competencia: '2026-10', etapa_pagamento: 'DIARIA'
    });
    RhFechamento.findOne = async () => null;
    await assert.rejects(
      apuracaoService.__test.aplicarRecorrentesNaApuracao({
        id: 25, competencia: '2026-10', etapa_pagamento: 'DIARIA'
      }),
      /Conclua o fechamento da apuracao #22/
    );
  } finally {
    RhApuracaoEvento.findAll = findEventosOriginal;
    RhApuracaoEventoItem.findOne = findRecorrenteOriginal;
    RhFechamento.findOne = findFechamentoOriginal;
  }

  const creditoProporcional = {
    valor_bruto: -200,
    valor_descontos: 0,
    valor_liquido: -200,
    ajuste_credito_manual: 0,
    ajuste_debito_manual: 0,
    detalhes_json: { resumo: { mensal_proporcional: 1000, adiantamento_anterior: 1200 } },
    async update(patch) { Object.assign(this, patch); }
  };
  RhApuracaoEvento.findAll = async () => [creditoProporcional];
  try {
    await apuracaoService.__test.guardarCreditoProporcionalParaDp({
      id: 26, etapa_pagamento: 'PROPORCIONAL'
    });
    assert.strictEqual(creditoProporcional.valor_bruto, 0);
    assert.strictEqual(creditoProporcional.valor_liquido, 0);
    assert.strictEqual(creditoProporcional.detalhes_json.resumo.credito_para_acerto_dp, 200);
    assert.strictEqual(creditoProporcional.detalhes_json.resumo.proporcional_saldo_antes_acerto_dp.liquido, -200);
  } finally {
    RhApuracaoEvento.findAll = findEventosOriginal;
  }

  console.log('Etapas RH/DP 40%, 60% e diarias independentes validadas sem banco.');
  RhColaboradorCalculoHistorico.findAll = historicoFindAllBanco;
}

validar().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
