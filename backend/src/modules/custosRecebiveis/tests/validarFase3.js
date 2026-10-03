'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  allocateMoney,
  buildProjectionRows,
  enrichTitlesWithPlanMacros,
  reprocessarRealizados,
  serializeAllocatedTitle,
  summarizeAllocatedTitles,
  titleIssueDate,
  totalTitulosEmitidosPorCompetencia,
  titleStatusGroup
} = require('../services/realizadoService');
const { createCsvBuffer } = require('../services/exportacaoService');

const moduleRoot = path.resolve(__dirname, '..');
const backendRoot = path.resolve(moduleRoot, '../../..');

function read(relativePath) {
  return fs.readFileSync(path.resolve(backendRoot, relativePath), 'utf8');
}

function validateRouteAndPermissionContracts() {
  const routes = read('src/modules/custosRecebiveis/routes/index.js');
  const service = read('src/modules/custosRecebiveis/services/realizadoService.js');
  const exportService = read('src/modules/custosRecebiveis/services/exportacaoService.js');
  const page = read('../frontend/src/modules/custosRecebiveis/pages/CustosRecebiveis.jsx');
  const realizedView = read('../frontend/src/modules/custosRecebiveis/components/CrRealizadoView.jsx');
  const constants = read('../frontend/src/modules/custosRecebiveis/constants/custosRecebiveis.js');

  [
    "'/obras/:obraId/realizados'",
    "'/obras/:obraId/realizados/reprocessar'",
    "'/realizados/:id/reconciliar'",
    "'/exportacoes/:tipo'"
  ].forEach((contract) => assert(routes.includes(contract), `Rota ausente: ${contract}`));

  [
    'REALIZADOS_VIEW',
    'REALIZADOS_UPDATE',
    'REALIZADOS_RECONCILE',
    'REPORT_EXPORT'
  ].forEach((permission) => assert(routes.includes(permission), `Permissao ausente: ${permission}`));

  assert(service.includes("status: ACTIVE_MOVEMENT_STATUS"));
  assert(service.includes("tipo_movimento: SETTLEMENT_MOVEMENT_TYPE"));
  assert(service.includes("where: { tipo: 'PAGAR' }"));
  assert(service.includes("evento: 'CR_REALIZADO_RECONCILIADO'"));
  assert(service.includes("motivo: 'BAIXA_INATIVA_OU_FORA_DA_FONTE'"));
  assert(exportService.includes('createWorkbookBuffer'));
  assert(exportService.includes('resolveWorks'));
  assert(constants.includes("id: 'realizado'"));
  // Fase 4 (29/09): Importacoes e Exportacoes viraram a aba 'arquivos'; o id
  // antigo segue como apelido para nao quebrar links.
  assert(constants.includes("id: 'arquivos'"));
  assert(constants.includes("exportacoes: 'arquivos'"));
  assert(page.includes('<CrRealizadoView'));
  assert(page.includes('<CrExportacoesView'));
  assert(realizedView.includes('Fonte exclusiva: títulos financeiros a pagar'));
  assert(realizedView.includes('Todos da obra'));
  assert(realizedView.includes('Emitidos na competência'));
  assert(realizedView.includes('data?.titulos || []'));
  // Agrupamento migrou para `agruparPor` da TabelaPadrao.
  assert(realizedView.includes('agruparPor={{'));
  assert(realizedView.includes('Rateado em mais de uma etapa macro'));
  assert(service.includes('etapas_macro: planContext.macros'));
  assert(!realizedView.includes('Cadeia operacional'));
  assert(!service.includes('deps.PedidoCompra.findAll'));
  assert(!service.includes('deps.SolicitacaoCompra.findAll'));
  assert(!service.includes('MovimentoFinanceiro.create'));
  assert(!service.includes('TituloFinanceiro.update'));
  assert(!service.includes('PedidoCompra.update'));
  assert(!service.includes('Apropriacao.update'));
}

function validateMacroGroupingWithoutDuplicatingTitles() {
  const planContext = {
    macros: [
      { codigo: '00.001', descricao: 'Administração', ordem: 1 },
      { codigo: '00.002', descricao: 'Estrutura', ordem: 2 }
    ],
    planItemsByAppropriation: new Map([
      [7, [{ etapa_macro_codigo: '00.001' }]],
      [8, [{ etapa_macro_codigo: '00.002' }]]
    ])
  };
  const [single, shared] = enrichTitlesWithPlanMacros([{
    id: 1,
    valor_alocado: 100,
    apropriacoes: [{ id: 7, codigo: '01.001' }]
  }, {
    id: 2,
    valor_alocado: 250,
    apropriacoes: [{ id: 7 }, { id: 8 }]
  }], planContext);
  assert.deepStrictEqual(single.etapas_macro, [{
    codigo: '00.001',
    descricao: 'Administração'
  }]);
  assert.strictEqual(shared.etapas_macro.length, 2);
  assert.strictEqual([single, shared].reduce((sum, item) => sum + item.valor_alocado, 0), 350);
}

function validateFinancialTitleLedger() {
  assert.strictEqual(titleStatusGroup('ABERTO'), 'ABERTO');
  assert.strictEqual(titleStatusGroup('PARCIAL'), 'PARCIAL');
  assert.strictEqual(titleStatusGroup('QUITADO'), 'QUITADO');
  assert.strictEqual(titleStatusGroup('PREVISAO'), 'PREVISAO');
  assert.strictEqual(titleStatusGroup('CANCELADO'), 'INATIVO');

  const direct = serializeAllocatedTitle({
    id: 10,
    codigo: 'FIN-0010',
    obra_id: 3,
    possui_rateio: false,
    status: 'ABERTO',
    descricao: 'Custo direto',
    valor_original: 1000,
    valor_baixado: 0,
    valor_saldo: 1000,
    data_emissao: '2026-08-20',
    data_vencimento: '2026-10-20',
    rateios: []
  }, 3, '2026-08');
  assert.strictEqual(direct.valor_alocado, 1000);
  assert.strictEqual(direct.valor_pago, 0);
  assert.strictEqual(direct.valor_saldo, 1000);
  assert.strictEqual(direct.em_competencia, true);

  const shared = serializeAllocatedTitle({
    id: 11,
    codigo: 'FIN-0011',
    obra_id: 4,
    possui_rateio: true,
    status: 'PARCIAL',
    descricao: 'Custo rateado',
    valor_original: 1000,
    valor_baixado: 400,
    valor_saldo: 600,
    data_emissao: '2026-07-10',
    data_vencimento: '2026-09-10',
    rateios: [
      { obra_id: 3, valor_rateio: 250, apropriacao: { id: 7, codigo: '00.001' } },
      { obra_id: 4, valor_rateio: 750, apropriacao: { id: 8, codigo: '00.002' } }
    ]
  }, 3, '2026-08');
  assert.strictEqual(shared.valor_alocado, 250);
  assert.strictEqual(shared.valor_pago, 100);
  assert.strictEqual(shared.valor_saldo, 150);
  assert.strictEqual(shared.em_competencia, false);
  assert.strictEqual(shared.apropriacoes[0].codigo, '00.001');

  const canceled = serializeAllocatedTitle({
    id: 12,
    obra_id: 3,
    possui_rateio: false,
    status: 'CANCELADO',
    descricao: 'Título cancelado',
    valor_original: 300,
    valor_baixado: 0,
    valor_saldo: 300,
    data_emissao: '2026-08-25',
    data_vencimento: '2026-08-25',
    rateios: []
  }, 3, '2026-08');
  const summary = summarizeAllocatedTitles([direct, shared, canceled]);
  assert.strictEqual(summary.titulos, 3);
  assert.strictEqual(summary.titulos_ativos, 2);
  assert.strictEqual(summary.total_alocado, 1250);
  assert.strictEqual(summary.total_pago, 100);
  assert.strictEqual(summary.saldo_aberto, 1150);
  assert.strictEqual(summary.valor_emitido_competencia, 1000);
  assert.strictEqual(summary.saldo_emitido_competencia, 1000);
  assert.strictEqual(summary.titulos_emitidos_abertos_competencia, 1);
  assert.strictEqual(summary.status.aberto, 1);
  assert.strictEqual(summary.status.parcial, 1);
  assert.strictEqual(summary.status.inativos, 1);

  assert.strictEqual(
    titleIssueDate({ data_emissao: null, createdAt: '2026-08-31T15:00:00.000Z' }),
    '2026-08-31'
  );
}

async function validateIssuedTitlesDriveMonthlyCost() {
  const titles = [
    {
      id: 20,
      obra_id: 3,
      possui_rateio: false,
      status: 'ABERTO',
      valor_original: 100,
      valor_saldo: 100,
      valor_baixado: 0,
      data_emissao: '2026-08-05',
      data_vencimento: '2026-12-10',
      rateios: []
    },
    {
      id: 21,
      obra_id: 3,
      possui_rateio: false,
      status: 'QUITADO',
      valor_original: 60,
      valor_saldo: 0,
      valor_baixado: 60,
      data_emissao: '2026-08-05',
      data_vencimento: '2026-09-10',
      grupo_parcelamento_id: 'PARCELADO-1',
      numero_parcela: 1,
      total_parcelas: 2,
      rateios: []
    },
    {
      id: 22,
      obra_id: 3,
      possui_rateio: false,
      status: 'PARCIAL',
      valor_original: 40,
      valor_saldo: 20,
      valor_baixado: 20,
      data_emissao: '2026-08-05',
      data_vencimento: '2026-10-10',
      grupo_parcelamento_id: 'PARCELADO-1',
      numero_parcela: 2,
      total_parcelas: 2,
      rateios: []
    },
    {
      id: 23,
      obra_id: 4,
      possui_rateio: true,
      status: 'ABERTO',
      valor_original: 1000,
      valor_saldo: 1000,
      valor_baixado: 0,
      data_emissao: null,
      createdAt: '2026-07-15T15:00:00.000Z',
      data_vencimento: '2027-01-10',
      rateios: [
        { obra_id: 3, valor_rateio: 250 },
        { obra_id: 4, valor_rateio: 750 }
      ]
    },
    {
      id: 24,
      obra_id: 3,
      possui_rateio: false,
      status: 'CANCELADO',
      valor_original: 900,
      valor_saldo: 900,
      valor_baixado: 0,
      data_emissao: '2026-08-07',
      data_vencimento: '2026-08-20',
      rateios: []
    }
  ];
  const totals = await totalTitulosEmitidosPorCompetencia(
    3,
    ['2026-07', '2026-08'],
    'PAGAR',
    {
      TituloFinanceiroRateio: {
        findAll: async () => [{ titulo_financeiro_id: 23 }]
      },
      TituloFinanceiro: {
        findAll: async () => titles
      }
    }
  );
  assert.strictEqual(totals.get('2026-07'), 250);
  assert.strictEqual(totals.get('2026-08'), 200);
}

function validateAllocationRounding() {
  const allocated = allocateMoney(100, [
    { valor_rateio: 60 },
    { valor_rateio: 40 }
  ]);
  assert.deepStrictEqual(allocated.map((item) => item.valor), [60, 40]);

  const cents = allocateMoney(10, [
    { percentual: 33.3333 },
    { percentual: 33.3333 },
    { percentual: 33.3334 }
  ]);
  assert.strictEqual(cents.reduce((sum, item) => sum + item.valor, 0), 10);
}

function activeMovement(overrides = {}) {
  return {
    id: 7,
    status: 'ATIVO',
    tipo_movimento: 'BAIXA',
    valor: 100,
    valor_quitacao: 100,
    titulo: {
      id: 9,
      tipo: 'PAGAR',
      obra_id: 3,
      apropriacao_id: 11,
      apropriacao: { id: 11, obra_id: 3, codigo: '00.001' },
      rateios: [],
      solicitacao: null
    },
    ...overrides
  };
}

function validateOnlyActiveSettlementsBecomeRealized() {
  const mapping = new Map([[11, [{
    id: 21,
    codigo: 'MICRO-1',
    etapa_macro_codigo: '00.001'
  }]]]);
  const active = buildProjectionRows({
    movement: activeMovement(),
    obraId: 3,
    planItemsByAppropriation: mapping
  });
  assert.strictEqual(active.length, 1);
  assert.strictEqual(active[0].plano_item_id, 21);
  assert.strictEqual(active[0].valor, 100);
  assert.strictEqual(active[0].estado, 'BAIXA_ATIVA');

  assert.deepStrictEqual(buildProjectionRows({
    movement: activeMovement({ status: 'ESTORNADO' }),
    obraId: 3,
    planItemsByAppropriation: mapping
  }), []);
  assert.deepStrictEqual(buildProjectionRows({
    movement: activeMovement({ tipo_movimento: 'TARIFA_BANCARIA' }),
    obraId: 3,
    planItemsByAppropriation: mapping
  }), []);
  assert.deepStrictEqual(buildProjectionRows({
    movement: activeMovement({
      titulo: { ...activeMovement().titulo, tipo: 'RECEBER' }
    }),
    obraId: 3,
    planItemsByAppropriation: mapping
  }), []);
}

function validateRateioAndNonMappedPreservation() {
  const movement = activeMovement({
    valor_quitacao: 150,
    titulo: {
      id: 9,
      tipo: 'PAGAR',
      obra_id: 3,
      apropriacao_id: null,
      rateios: [
        {
          obra_id: 3,
          apropriacao_id: 11,
          valor_rateio: 60,
          apropriacao: { id: 11, obra_id: 3, codigo: '00.001' }
        },
        {
          obra_id: 4,
          apropriacao_id: 12,
          valor_rateio: 40,
          apropriacao: { id: 12, obra_id: 4, codigo: '00.002' }
        }
      ],
      solicitacao: null
    }
  });
  const rows = buildProjectionRows({
    movement,
    obraId: 3,
    planItemsByAppropriation: new Map()
  });
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].valor, 90);
  assert.strictEqual(rows[0].estado, 'NAO_MAPEADO');
  assert.strictEqual(rows[0].plano_item_id, null);
}

function transactionHarness() {
  return {
    transaction: async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } })
  };
}

async function validateReversalCorrectionIsIdempotent() {
  let auditWrites = 0;
  const projection = {
    id: 31,
    competencia_id: 5,
    obra_id: 3,
    movimento_financeiro_id: 7,
    plano_item_id: 21,
    etapa_macro_codigo: '00.001',
    valor: 100,
    estado: 'BAIXA_ATIVA',
    async update(payload) {
      Object.assign(this, payload);
    }
  };
  const overrides = {
    sequelize: transactionHarness(),
    resolverEscopoObras: async () => ({ todas: true, obraIds: null }),
    Obra: {
      findByPk: async () => ({ id: 3, codigo: '03', nome: 'Obra teste' })
    },
    CrCompetencia: {
      findOne: async () => ({ id: 5, obra_id: 3, competencia: '2026-08' })
    },
    CrPlanoObra: { findOne: async () => null },
    CrPlanoItem: { findAll: async () => [] },
    CrPlanoMacroVinculo: { findAll: async () => [] },
    TituloFinanceiroRateio: { findAll: async () => [] },
    TituloFinanceiro: { findAll: async () => [] },
    MovimentoFinanceiro: { findAll: async () => [] },
    CrRealizado: { findAll: async () => [projection] },
    CrAuditoria: {
      findAll: async () => [],
      create: async () => { auditWrites += 1; }
    }
  };
  const first = await reprocessarRealizados({ id: 2 }, 3, '2026-08', overrides);
  assert.strictEqual(first.correcoes, 1);
  assert.strictEqual(first.idempotente, false);
  assert.strictEqual(projection.valor, 0);
  assert.strictEqual(auditWrites, 1);

  const second = await reprocessarRealizados({ id: 2 }, 3, '2026-08', overrides);
  assert.strictEqual(second.correcoes, 0);
  assert.strictEqual(second.idempotente, true);
  assert.strictEqual(auditWrites, 1);
}

function validateCsvFormulaProtection() {
  const csv = createCsvBuffer([
    ['Nome', 'Valor'],
    ['=HYPERLINK("https://example.com")', 10]
  ]).toString('utf8');
  assert(csv.includes(`"'=HYPERLINK`));
}

async function run() {
  validateRouteAndPermissionContracts();
  validateAllocationRounding();
  validateFinancialTitleLedger();
  await validateIssuedTitlesDriveMonthlyCost();
  validateMacroGroupingWithoutDuplicatingTitles();
  validateOnlyActiveSettlementsBecomeRealized();
  validateRateioAndNonMappedPreservation();
  await validateReversalCorrectionIsIdempotent();
  validateCsvFormulaProtection();
  console.log('Fase 3 de Custos e Recebiveis validada com sucesso.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
