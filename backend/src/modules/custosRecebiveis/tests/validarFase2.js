'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  assertCompetenciaNovoMes,
  consolidarMedicao,
  dashboardCompetencias,
  finalizarCompetencia,
  findPrivateSources,
  monthRange,
  normalizeDashboardCompetencias,
  normalizeCompetencia,
  pesquisarItensPlano,
  salvarCustos,
  salvarRecebiveis,
  statusComparativo,
  summarizeDashboardRows,
  summarizeDashboardWorkRows
} = require('../services/planejamentoService');
const {
  TYPES: PLANNING_SHEET_TYPES,
  validarLinhasPlanejamento
} = require('../services/planejamentoPlanilhaService');

const moduleRoot = path.resolve(__dirname, '..');
const backendRoot = path.resolve(moduleRoot, '../../..');

function read(relativePath) {
  return fs.readFileSync(path.resolve(backendRoot, relativePath), 'utf8');
}

function validateComparisonStates() {
  assert.strictEqual(statusComparativo(0, 0), 'NEUTRO');
  assert.strictEqual(statusComparativo(0, 10), 'SEM_PREVISAO');
  assert.strictEqual(statusComparativo(10, 0), 'A_REALIZAR');
  assert.strictEqual(statusComparativo(10, 10), 'DENTRO');
  assert.strictEqual(statusComparativo(10, 9.99), 'DENTRO');
  assert.strictEqual(statusComparativo(10, 10.01), 'ESTOURO');
}

function validateCompetenciaBoundaries() {
  assert.strictEqual(normalizeCompetencia('2026-08'), '2026-08');
  assert.deepStrictEqual(monthRange('2026-12'), {
    first: '2026-12-01',
    nextMonth: '2027-01-01'
  });
  assert.throws(() => normalizeCompetencia('08/2026'), /Competencia invalida/);
  assert.deepStrictEqual(
    assertCompetenciaNovoMes('2026-08', new Date('2026-07-15T12:00:00-03:00')),
    ['2026-07', '2026-08']
  );
  assert.throws(
    () => assertCompetenciaNovoMes('2026-09', new Date('2026-07-15T12:00:00-03:00')),
    /Novo mes permite somente/
  );
  assert.deepStrictEqual(
    dashboardCompetencias('2026-02'),
    ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']
  );
  assert.deepStrictEqual(
    normalizeDashboardCompetencias('2026-07,2026-08', '2026-07'),
    ['2026-07', '2026-08']
  );
  assert.deepStrictEqual(
    normalizeDashboardCompetencias(['2026-08', '2026-07', '2026-08'], '2026-07'),
    ['2026-07', '2026-08']
  );
  assert.deepStrictEqual(
    summarizeDashboardRows([{
      custo_planejado: 100,
      custo_realizado: 120,
      recebivel_previsto: 180,
      recebivel_reconhecido: 150,
      medicao_aprovada: 150,
      receita_recebida: 90,
      glosa: 30,
      movimentos_sem_mapeamento: 2,
      recebiveis_vencidos: 1
    }]),
    {
      custo_planejado: 100,
      custo_realizado: 120,
      desvio_custo: 20,
      percentual_custo: 120,
      recebivel_previsto: 180,
      recebivel_reconhecido: 150,
      medicao_aprovada: 150,
      receita_recebida: 90,
      saldo_receber: 60,
      glosa: 30,
      tem_medicao_aprovada: true,
      obras_com_custo_acima: 1,
      movimentos_sem_mapeamento: 2,
      recebiveis_vencidos: 1
    }
  );

  const workSummaries = summarizeDashboardWorkRows([
    {
      obra: { id: 1, nome: 'Obra sem alerta' },
      competencia: '2026-08',
      competencia_id: 10,
      estado_competencia: 'FINALIZADA',
      custo_planejado: 100,
      custo_realizado: 80,
      recebivel_previsto: 150,
      recebivel_reconhecido: 140,
      medicao_aprovada: 140,
      receita_recebida: 100,
      glosa: 10
    },
    {
      obra: { id: 2, nome: 'Obra com alerta' },
      competencia: '2026-08',
      competencia_id: 11,
      estado_competencia: 'ABERTA',
      custo_planejado: 100,
      custo_realizado: 125,
      recebivel_previsto: 160,
      recebivel_reconhecido: 120,
      medicao_aprovada: 120,
      receita_recebida: 20,
      glosa: 40
    }
  ], [{ obra_id: 2 }, { obra_id: 2 }]);
  assert.strictEqual(workSummaries[0].obra.id, 2);
  assert.strictEqual(workSummaries[0].alertas, 2);
  assert.strictEqual(workSummaries[0].desvio_custo, 25);
  assert.strictEqual(workSummaries[0].saldo_receber, 100);
}

function validateBackendContracts() {
  const service = read('src/modules/custosRecebiveis/services/planejamentoService.js');
  const routes = read('src/modules/custosRecebiveis/routes/index.js');
  const controller = read('src/modules/custosRecebiveis/controllers/CustosRecebiveisController.js');
  const migration = read('migrations/202608030002_custos_recebiveis_subitens_mensais.js');
  const spreadsheetService = read('src/modules/custosRecebiveis/services/planejamentoPlanilhaService.js');

  [
    "'/dashboard'",
    "'/obras/:obraId/competencias'",
    "'/obras/:obraId/plano/itens'",
    "'/obras/:obraId/competencias/:competencia'",
    "'/obras/:obraId/competencias/:competencia/custos'",
    "'/obras/:obraId/competencias/:competencia/receitas'",
    "'/obras/:obraId/competencias/:competencia/finalizar'",
    "'/obras/:obraId/competencias/:competencia/medicao'",
    "'/obras/:obraId/competencias/:competencia/planilhas/:tipo/modelo'",
    "'/obras/:obraId/competencias/:competencia/planilhas/:tipo/validar-arquivo'",
    "'/obras/:obraId/competencias/:competencia/planilhas/:tipo/validar-itens'",
    "'/obras/:obraId/comparativo'",
    "'/competencias/:competenciaId/reabertura'",
    "'/reaberturas/:reaberturaId/aprovar'"
  ].forEach((contract) => assert(routes.includes(contract), `Rota ausente: ${contract}`));

  [
    'DASHBOARD_VIEW',
    'PLANEJAMENTO_VIEW',
    'PLANEJAMENTO_COSTS',
    'PLANEJAMENTO_RECEIVABLES',
    'PLANEJAMENTO_FINISH',
    'MEDICAO_CONSOLIDATE',
    'COMPARATIVO_VIEW',
    'REOPEN_REQUEST',
    'REOPEN_APPROVE'
  ].forEach((permission) => assert(routes.includes(permission), `Permissao ausente: ${permission}`));

  assert(service.includes("estado === 'FINALIZADA'"));
  assert(service.includes('CR_COMPETENCIA_IMUTAVEL'));
  assert(service.includes("situacao: 'APROVADA'"));
  assert(service.includes("expira_em: { [Op.gt]: new Date() }"));
  assert(service.includes('Idempotency-Key e obrigatoria'));
  assert(service.includes('transaction.LOCK.UPDATE'));
  assert(service.includes("origem_exibicao: linkedTitleIsReceivable ? 'TITULO' : 'PARCELA_CONTRATUAL'"));
  assert(service.includes("String(obra.classificacao).toUpperCase() !== 'PUBLICA'"));
  assert(service.includes('CrAuditoria.create'));
  assert(!service.includes('Apropriacao.update'));
  assert(!service.includes('Apropriacao.destroy'));
  assert(controller.includes("req.get('Idempotency-Key')"));
  assert(controller.includes('req.query.obra_id'));
  assert(controller.includes('req.query.competencias'));
  assert(service.includes("tipo: selectedObraId ? 'OBRA' : 'CARTEIRA'"));
  assert(service.includes('macros: selectedObraId ? macros : []'));
  assert(service.includes('obras_resumo: workSummaries'));
  assert(service.includes('summarizeDashboardWorkRows(rows, alerts)'));
  assert(service.includes('recebiveis_vencidos: row.recebiveis_vencidos'));
  assert(service.includes("tipo_centro_custo: 'OBRA'"));
  assert(service.includes("'classificacao', 'tipo_centro_custo'"));
  assert(service.includes('alertas: alerts'));
  assert(service.includes("attributes: ['codigo', 'descricao']"));
  assert(service.includes('macroNameByCode'));
  assert(service.includes('buildPlanMacros'));
  assert(service.includes('linhas_medicao: measurementResult'));
  assert(service.includes("origem: 'MEDICAO'"));
  assert(service.includes("estado = 'AGUARDANDO_APROVACAO'"));
  assert(service.includes('previsao_custo_id'));
  assert(service.includes('CR_CUSTO_DESATUALIZADO'));
  assert(service.includes('etapa_macro_codigo: macroCode'));
  assert(migration.includes("const COSTS = 'cr_previsoes_custo'"));
  assert(migration.includes("'chave_local'"));
  assert(migration.includes("'previsao_custo_id'"));
  assert(migration.includes('fk_cr_receitas_previsao_custo'));
  assert(migration.includes('fk_cr_medicoes_previsao_custo'));
  assert(spreadsheetService.includes("worksheet.protect('FluxyPlanejamento'"));
  assert(spreadsheetService.includes("workbook.addWorksheet('_METADADOS')"));
  assert(spreadsheetService.includes("metadata.state = 'veryHidden'"));
  assert(spreadsheetService.includes("['escopo', 'UNIVERSAL']"));
  assert(spreadsheetService.includes("'modelo-custos-planejados-geral.xlsx'"));
  assert(spreadsheetService.includes("? ['descricao_servico', 'unidade', 'quantidade', 'valor_unitario']"));
  assert(spreadsheetService.includes('Formulas nao sao permitidas'));
  assert(spreadsheetService.includes('saldo_disponivel'));
  assert(spreadsheetService.includes("header: 'quantidade_ja_medida'"));
  assert(spreadsheetService.includes('quantidade_ja_medida: item.quantidade_anterior'));
  assert(spreadsheetService.includes('legacyMeasurementModel'));
  assert(spreadsheetService.includes('quantity === 0'));
  assert(spreadsheetService.includes('previousRows = await db.CrMedicaoConsolidada.findAll'));
}

function validateFrontendContracts() {
  const constants = read('../frontend/src/modules/custosRecebiveis/constants/custosRecebiveis.js');
  const page = read('../frontend/src/modules/custosRecebiveis/pages/CustosRecebiveis.jsx');
  const planning = read('../frontend/src/modules/custosRecebiveis/components/CrPlanejamentoView.jsx');
  const planningDraft = read(
    '../frontend/src/modules/custosRecebiveis/utils/planningDraftStorage.js'
  );
  const monthlyPlanning = read(
    '../frontend/src/modules/custosRecebiveis/components/CrPlanejamentoMensalView.jsx'
  );
  const monthlySummary = read(
    '../frontend/src/modules/custosRecebiveis/components/CrMonthlySummaryCard.jsx'
  );
  const monthlyDetail = read(
    '../frontend/src/modules/custosRecebiveis/components/CrMonthlyDetailView.jsx'
  );
  const worksView = read('../frontend/src/modules/custosRecebiveis/components/CrObrasView.jsx');
  const dashboard = read('../frontend/src/modules/custosRecebiveis/components/CrDashboardView.jsx');
  const frontendService = read(
    '../frontend/src/modules/custosRecebiveis/services/custosRecebiveis.js'
  );
  const executiveFilters = read(
    '../frontend/src/modules/custosRecebiveis/components/CrExecutiveFilters.jsx'
  );
  const comparison = read('../frontend/src/modules/custosRecebiveis/components/CrComparativoView.jsx');
  const planningImport = read('../frontend/src/modules/custosRecebiveis/components/CrPlanningImportModal.jsx');

  ['visao-geral', 'planejamento', 'comparativo'].forEach((tab) => (
    assert(constants.includes(`id: '${tab}'`), `Aba ausente: ${tab}`)
  ));
  assert(page.includes('<CrDashboardView'));
  assert(page.includes('<CrExecutiveFilters'));
  assert(page.includes('<CrPlanejamentoMensalView'));
  assert(page.includes('<CrComparativoView'));
  assert(page.includes("activeTab !== 'obras'"));
  assert(page.includes('cardMode={isObraUser}'));
  assert(page.includes('onEditPlanning={handleEditPlanning}'));
  assert(page.includes('onRequestReopen={handleRequestReopening}'));
  assert(worksView.includes('Editar planejamento'));
  assert(worksView.includes('Solicitar reabertura'));
  assert(worksView.includes('cr-period-card cr-work-card'));
  assert(planning.includes('PUBLIC_STEPS'));
  assert(planning.includes('PRIVATE_STEPS'));
  assert(planning.includes("label: 'Custos planejados'"));
  assert(planning.includes("label: 'Medição prevista'"));
  assert(planning.includes("viewMode = 'planning'"));
  assert(planning.includes("viewMode === 'approved'"));
  assert(planning.includes("label: 'Recebíveis do período'"));
  assert(planning.includes('Etapa {step} de {steps.length}'));
  assert(planning.includes('Fonte automática: contratos e títulos do Financeiro'));
  assert(!planning.includes('checked={Boolean(item.confirmado)}'));
  assert(planning.includes('Custos planejados no mês'));
  assert(planning.includes('Adicionar linha'));
  assert(planning.includes('Não é necessário escolher item ou etapa macro'));
  assert(planning.includes('previsao_custo_id'));
  assert(planning.includes('Qtd. orçada'));
  assert(planning.includes('Math.min('));
  assert(planning.includes('item.item?.quantidade_aprovada_anterior'));
  assert(planning.includes('Qtd. medida'));
  assert(planning.includes('Pesquisar subitem desta etapa'));
  assert(planning.includes('usePlanItemSearch'));
  assert(planning.includes('etapaMacroCodigo: macroCode'));
  assert(planning.includes('Pesquisar subitem aprovado'));
  assert(planning.includes('addApprovedMeasurement'));
  assert(planning.includes('disabled={Boolean(saving)}'));
  assert(planning.includes('Registrar medição aprovada'));
  assert(planning.includes('justificativa_glosa'));
  assert(planning.includes('Rascunho salvo neste dispositivo'));
  assert(planning.includes("window.addEventListener('pagehide', flushPlanningDrafts)"));
  assert(planning.includes("'medicao-prevista'"));
  assert(planningDraft.includes("fluxy_cr_planning_draft_v1"));
  assert(planningDraft.includes('PLANNING_DRAFT_TTL_MS'));
  assert(planningDraft.includes('plano_versao'));
  assert(planningDraft.includes('window.localStorage.removeItem'));
  assert(monthlyPlanning.includes('Novo mês'));
  assert(monthlyPlanning.includes("obra?.classificacao === 'PUBLICA'"));
  assert(monthlyPlanning.includes('<CrMonthlySummaryCard'));
  assert(monthlyPlanning.includes('<CrMonthlyDetailView'));
  assert(monthlyPlanning.includes('cr-planning-deadline'));
  assert(monthlySummary.includes('Custo planejado'));
  assert(monthlySummary.includes('Recebível previsto'));
  assert(monthlySummary.includes('Desvio de custo'));
  assert(monthlySummary.includes('Saldo a receber'));
  assert(monthlySummary.includes('className="cr-icon-button"'));
  assert(monthlySummary.includes('aria-label={`${approvedLabel} de ${title}`}'));
  assert(monthlyDetail.includes('aria-label="Editar planejamento"'));
  assert(monthlyDetail.includes('aria-label="Voltar aos meses"'));
  assert(dashboard.includes('Pontos de atenção'));
  assert(dashboard.includes('Evolução de custos'));
  assert(dashboard.includes('Evolução de recebíveis'));
  assert(dashboard.includes('Planejamento mensal por obra'));
  assert(dashboard.includes('visibleWorkSummaries'));
  assert(dashboard.includes('filteredPortfolio'));
  assert(dashboard.includes('competenciasParam'));
  assert(frontendService.includes("query.set('competencias'"));
  assert(dashboard.includes("const isWorkContext = data?.escopo?.tipo === 'OBRA'"));
  assert(dashboard.includes('obra(s) no recorte executivo'));
  assert(dashboard.includes('label="Medição aprovada"'));
  assert(dashboard.includes("tipo_centro_custo || '').toUpperCase() === 'OBRA'"));
  assert(dashboard.includes('item.obra.nome'));
  assert(dashboard.includes('Custos por macro'));
  assert(dashboard.includes("item.nome || 'Macro sem descrição'"));
  assert(!dashboard.includes('Status das etapas'));
  assert(executiveFilters.includes('Todas as obras do seu escopo'));
  assert(executiveFilters.includes('Marcar seis meses'));
  assert(executiveFilters.includes('type="checkbox"'));
  assert(executiveFilters.includes('value="PUBLICA"'));
  assert(executiveFilters.includes('value="PRIVADA"'));
  assert(executiveFilters.includes('cr-operational-period'));
  assert(executiveFilters.includes('Todas as minhas obras'));
  assert(worksView.includes('obra.contrato'));
  assert(worksView.includes('obra.valor_orcado'));
  assert(worksView.includes('obra.responsavel'));
  assert(worksView.includes('Editar planejamento'));
  assert(!worksView.includes('<th>Contrato</th>'));
  assert(!worksView.includes('<dt>Contrato</dt>'));
  assert(!worksView.includes('Remover'));
  assert(monthlyDetail.includes('<CostDetail'));
  assert(monthlyDetail.includes('<MeasurementDetail'));
  assert(monthlyDetail.includes('<CrRealizadoView'));
  assert(monthlyDetail.includes('<CrComparativoView'));
  assert(page.includes('canOpenPlanning={canOpenPlanning}'));
  assert(page.includes('onOpenArea={handleOpenDashboardArea}'));
  assert(comparison.includes('COMPARATIVO_ESTADO_LABELS'));
  assert(planning.includes("'custos',\n              permissions.costs"));
  assert(planning.includes("renderPlanningSheetActions('medicao-prevista'"));
  assert(planning.includes("renderPlanningSheetActions('medicao-aprovada'"));
  assert(planningImport.includes('Confirmar importação'));
  assert(planningImport.includes('onConfirm(tipo, result.itens)'));
  assert(monthlyPlanning.includes("openDetail(selectedCompetencia, 'approved')"));
  assert(!monthlyPlanning.includes('<CrRealizadoView'));
  assert(!monthlyPlanning.includes('<CrComparativoView'));
  assert(monthlyPlanning.includes("realized: 'realized'"));
  assert(monthlyPlanning.includes("comparison: 'comparison'"));
  assert(comparison.includes('Comparativo operacional por item'));
  assert(comparison.includes('<th>Medição prevista</th>'));
  assert(comparison.includes('<th>Medição aprovada</th>'));
  assert(comparison.includes('data?.linhas_medicao || []'));
  assert(planningImport.includes('Validar novamente'));
}

function validatePlanningSpreadsheetPreview() {
  const baseContext = {
    type: PLANNING_SHEET_TYPES.MEDICAO_PREVISTA,
    obra: { id: 7, codigo: '28', nome: 'ESCOLA' },
    competencia: '2026-08',
    plan: { id: 3, versao: 1 },
    macros: [{ codigo: '00.001', descricao: 'Administracao', ordem: 1 }],
    items: [{
      plano_item_id: 9,
      etapa_macro_codigo: '00.001',
      etapa_macro_descricao: 'Administracao',
      item_codigo: '00.001.01',
      descricao: 'Engenheiro residente',
      unidade: 'mes',
      quantidade_orcada: 12,
      valor_unitario: 100,
      saldo_disponivel: 4
    }]
  };
  const valid = validarLinhasPlanejamento(baseContext, [
    { item_codigo: '00.001.01', quantidade: 0 },
    { item_codigo: '00.001.01', descricao: 'Dado adulterado', quantidade: 3 }
  ]);
  assert.strictEqual(valid.itens.length, 1);
  assert.strictEqual(valid.itens[0].descricao, 'Engenheiro residente');
  assert.strictEqual(valid.resumo.valido, true);
  const overBudget = validarLinhasPlanejamento(baseContext, [
    { item_codigo: '00.001.01', quantidade: 5 }
  ]);
  assert.strictEqual(overBudget.resumo.valido, false);
  assert(overBudget.erros.some((message) => message.includes('saldo disponivel')));

  const freeCosts = validarLinhasPlanejamento({
    ...baseContext,
    type: PLANNING_SHEET_TYPES.CUSTOS,
    plan: null,
    macros: [],
    items: []
  }, [{
    descricao_servico: 'Equipe de campo',
    unidade: 'mes',
    valor_unitario: 2500,
    quantidade: 2
  }]);
  assert.strictEqual(freeCosts.resumo.valido, true);
  assert.strictEqual(freeCosts.itens[0].etapa_macro_codigo, null);
  assert.strictEqual(freeCosts.itens[0].etapa_macro_descricao, null);
  assert.deepStrictEqual(freeCosts.catalogo, []);
  assert.strictEqual(freeCosts.plano, null);
  assert.strictEqual(freeCosts.resumo.valor_total, 5000);
}

function transactionHarness() {
  return {
    transaction: async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } })
  };
}

function commonScope() {
  return async () => ({ todas: true, obraIds: null });
}

async function validatePlanSearchByMacro() {
  let capturedQuery = null;
  const result = await pesquisarItensPlano(
    { id: 1 },
    7,
    {
      competencia: '2026-08',
      etapa_macro_codigo: '00.003',
      q: 'concreto',
      limit: 50
    },
    {
      resolverEscopoObras: commonScope(),
      CrCompetencia: {
        findOne: async () => ({ plano_versao_snapshot: 2 }),
        findAll: async () => []
      },
      CrPlanoObra: {
        findOne: async () => ({ id: 3, versao: 2 })
      },
      CrPlanoItem: {
        findAndCountAll: async (query) => {
          capturedQuery = query;
          return { rows: [], count: 0 };
        }
      }
    }
  );
  assert.strictEqual(capturedQuery.where.etapa_macro_codigo, '00.003');
  assert.strictEqual(capturedQuery.limit, 50);
  assert.strictEqual(result.pagination.total, 0);
}

async function validatePrivateAntiDoubleCount() {
  const sources = await findPrivateSources(7, '2026-08', {
    ContratoComercialParcela: {
      findAll: async () => [{
        id: 91,
        descricao: 'Parcela 1',
        data_vencimento: '2026-08-10',
        valor_original: 1000,
        contrato: { id: 12, numero: 'CT-12', obra_id: 7, status: 'ATIVO' },
        tituloFinanceiro: {
          id: 33,
          codigo: 'REC-33',
          descricao: 'Titulo da parcela',
          tipo: 'RECEBER',
          status: 'ABERTO',
          valor_original: 1250,
          data_vencimento: '2026-08-12'
        }
      }]
    },
    ContratoComercial: {},
    TituloFinanceiro: {}
  });
  assert.strictEqual(sources.length, 1);
  assert.strictEqual(sources[0].key, 'titulo:33');
  assert.strictEqual(sources[0].origem_exibicao, 'TITULO');
  assert.strictEqual(sources[0].status_financeiro, 'ABERTO');
  assert.strictEqual(sources[0].valor_previsto, 1250);
}

async function validatePrivateReceiptsSyncOnFinalization() {
  let persistedReceipts = [];
  let auditPayload = null;
  const competencia = {
    id: 51,
    obra_id: 11,
    competencia: '2099-08',
    estado: 'ABERTA',
    plano_versao_snapshot: 1,
    total_custo_previsto: 0,
    total_receita_prevista: 0,
    update: async function update(values) {
      Object.assign(this, values);
      return this;
    }
  };
  const result = await finalizarCompetencia(
    { id: 1 },
    11,
    '2099-08',
    {},
    'private-finish-1',
    {
      sequelize: transactionHarness(),
      resolverEscopoObras: commonScope(),
      Obra: {
        findByPk: async () => ({
          id: 11,
          codigo: '11',
          nome: 'Obra privada',
          classificacao: 'PRIVADA'
        })
      },
      CrPlanoObra: {
        findOne: async () => ({ id: 4, versao: 1, situacao: 'PUBLICADA' })
      },
      CrCompetencia: {
        findOne: async () => competencia
      },
      CrPrevisaoCusto: {
        findAll: async () => [{ valor_previsto: 100 }]
      },
      CrPrevisaoReceita: {
        destroy: async () => {
          persistedReceipts = [];
        },
        bulkCreate: async (rows) => {
          persistedReceipts = rows;
          return rows;
        },
        findAll: async () => persistedReceipts
      },
      ContratoComercialParcela: {
        findAll: async () => [{
          id: 92,
          descricao: 'Parcela agosto',
          data_vencimento: '2099-08-10',
          valor_original: 500,
          contrato: {
            id: 13,
            numero: 'CT-13',
            obra_id: 11,
            status: 'ATIVO'
          },
          tituloFinanceiro: {
            id: 34,
            codigo: 'REC-34',
            descricao: 'Recebivel de agosto',
            tipo: 'RECEBER',
            status: 'ABERTO',
            valor_original: 500,
            data_vencimento: '2099-08-10'
          }
        }]
      },
      CrReabertura: { findOne: async () => null },
      CrAuditoria: {
        create: async (payload) => {
          auditPayload = payload.payload_json;
        }
      }
    }
  );
  assert.strictEqual(result.idempotente, false);
  assert.strictEqual(persistedReceipts.length, 1);
  assert.strictEqual(persistedReceipts[0].titulo_financeiro_id, 34);
  assert.strictEqual(competencia.total_receita_prevista, 500);
  assert.strictEqual(auditPayload.recebiveis_automaticos, true);
}

async function validateFinalizationIdempotency() {
  let writes = 0;
  const finalized = {
    id: 41,
    obra_id: 7,
    competencia: '2026-08',
    estado: 'FINALIZADA',
    total_custo_previsto: 100,
    total_receita_prevista: 200
  };
  const overrides = {
    sequelize: transactionHarness(),
    resolverEscopoObras: commonScope(),
    Obra: { findByPk: async () => ({ id: 7, nome: 'Obra', classificacao: 'PUBLICA' }) },
    CrPlanoObra: { findOne: async () => ({ id: 3, versao: 2, situacao: 'PUBLICADA' }) },
    CrCompetencia: {
      findOne: async () => finalized,
      create: async () => { writes += 1; }
    },
    CrAuditoria: { create: async () => { writes += 1; } }
  };
  const first = await finalizarCompetencia(
    { id: 1 },
    7,
    '2026-08',
    {},
    'same-key',
    overrides
  );
  const second = await finalizarCompetencia(
    { id: 1 },
    7,
    '2026-08',
    {},
    'same-key',
    overrides
  );
  assert.strictEqual(first.idempotente, true);
  assert.strictEqual(second.idempotente, true);
  assert.strictEqual(writes, 0);
}

async function validateFinalizedCompetencyIsImmutable() {
  let replacedRows = 0;
  const finalized = {
    id: 41,
    obra_id: 7,
    competencia: '2026-08',
    estado: 'FINALIZADA'
  };
  await assert.rejects(
    () => salvarCustos(
      { id: 1 },
      7,
      '2026-08',
      { itens: [] },
      {
        sequelize: transactionHarness(),
        resolverEscopoObras: commonScope(),
        Obra: { findByPk: async () => ({ id: 7, nome: 'Obra', classificacao: 'PUBLICA' }) },
        CrPlanoObra: { findOne: async () => ({ id: 3, versao: 2, situacao: 'PUBLICADA' }) },
        CrPlanoItem: { findAll: async () => [] },
        CrCompetencia: { findOne: async () => finalized },
        CrReabertura: { findOne: async () => null },
        CrPrevisaoCusto: {
          destroy: async () => { replacedRows += 1; },
          bulkCreate: async () => { replacedRows += 1; }
        }
      }
    ),
    (error) => error?.code === 'CR_COMPETENCIA_IMUTAVEL'
  );
  assert.strictEqual(replacedRows, 0);
}

async function validatePrivateWorkRejectsMeasurement() {
  await assert.rejects(
    () => consolidarMedicao(
      { id: 1 },
      7,
      '2026-08',
      { itens: [] },
      {
        sequelize: transactionHarness(),
        resolverEscopoObras: commonScope(),
        Obra: {
          findByPk: async () => ({ id: 7, nome: 'Obra privada', classificacao: 'PRIVADA' })
        }
      }
    ),
    (error) => error?.code === 'CR_MEDICAO_APENAS_OBRA_PUBLICA'
  );
}

async function validateMonthlyMacroSubitemsAndForecastMeasurement() {
  let savedCosts = [];
  let savedReceipts = [];
  const competencia = {
    id: 71,
    obra_id: 7,
    competencia: '2099-08',
    estado: 'ABERTA',
    plano_versao_snapshot: 1,
    total_custo_previsto: 0,
    total_receita_prevista: 0,
    update: async function update(values) {
      Object.assign(this, values);
      return this;
    }
  };
  const planItems = [
    {
      id: 100,
      plano_id: 3,
      codigo: '01',
      descricao: 'Serviços preliminares',
      somadora: true,
      item_pai_id: null,
      ordem: 1,
      valor_total: 1000
    },
    {
      id: 101,
      plano_id: 3,
      codigo: '01.01',
      descricao: 'Referência orçamentária',
      somadora: false,
      etapa_macro_codigo: '01',
      ordem: 2,
      quantidade: 10,
      custo_unitario: 100,
      valor_total: 1000
    }
  ];
  const baseOverrides = {
    sequelize: transactionHarness(),
    resolverEscopoObras: commonScope(),
    Obra: {
      findByPk: async () => ({ id: 7, nome: 'Obra pública', classificacao: 'PUBLICA' })
    },
    CrPlanoObra: {
      findOne: async () => ({ id: 3, versao: 1, situacao: 'PUBLICADA' })
    },
    CrPlanoItem: { findAll: async () => planItems },
    CrCompetencia: {
      findOne: async () => competencia,
      findAll: async () => []
    },
    CrReabertura: { findOne: async () => null },
    CrAuditoria: { create: async (payload) => payload }
  };

  const costResult = await salvarCustos(
    { id: 1 },
    7,
    '2099-08',
    {
      itens: [{
        chave_local: 'local-subitem-1',
        descricao: 'Mobilização da equipe',
        unidade: 'mês',
        ordem: 1,
        quantidade: 2,
        custo_unitario: 150
      }]
    },
    {
      ...baseOverrides,
      CrPrevisaoCusto: {
        findAll: async () => savedCosts,
        create: async (payload) => {
          const created = {
            id: 501,
            ...payload,
            update: async function update(values) {
              Object.assign(this, values);
              return this;
            }
          };
          savedCosts.push(created);
          return created;
        },
        destroy: async () => 0
      }
    }
  );
  assert.strictEqual(costResult.total, 300);
  assert.strictEqual(savedCosts[0].plano_item_id, null);
  assert.strictEqual(savedCosts[0].etapa_macro_codigo, null);
  assert.strictEqual(savedCosts[0].descricao, 'Mobilização da equipe');

  const receiptResult = await salvarRecebiveis(
    { id: 1 },
    7,
    '2099-08',
    {
      itens: [{ previsao_custo_id: 501, quantidade_prevista: 1.5 }]
    },
    {
      ...baseOverrides,
      CrPrevisaoCusto: { findAll: async () => savedCosts },
      CrPrevisaoReceita: {
        findAll: async () => [],
        destroy: async () => { savedReceipts = []; },
        bulkCreate: async (rows) => {
          savedReceipts = rows;
          return rows;
        }
      }
    }
  );
  assert.strictEqual(receiptResult.total, 225);
  assert.strictEqual(savedReceipts[0].previsao_custo_id, 501);
  assert.strictEqual(savedReceipts[0].plano_item_id, null);
  assert.strictEqual(savedReceipts[0].valor_previsto, 225);
}

async function validateApprovedMeasurementAndGlosa() {
  let createdMeasurement = null;
  let auditPayload = null;
  const competencia = {
    id: 41,
    obra_id: 7,
    competencia: '2026-08',
    estado: 'FINALIZADA',
    total_custo_previsto: 0,
    total_receita_prevista: 100
  };
  const overrides = {
    sequelize: transactionHarness(),
    resolverEscopoObras: commonScope(),
    Obra: {
      findByPk: async () => ({ id: 7, nome: 'Obra publica', classificacao: 'PUBLICA' })
    },
    CrPlanoObra: {
      findOne: async () => ({ id: 3, versao: 2, situacao: 'PUBLICADA' })
    },
    CrPlanoItem: {
      findAll: async () => [{
        id: 9,
        plano_id: 3,
        codigo: '01.01',
        descricao: 'Servico',
        somadora: false,
        quantidade: 20,
        custo_unitario: 10
      }, {
        id: 10,
        plano_id: 3,
        codigo: '01.02',
        descricao: 'Servico aprovado diferente',
        somadora: false,
        quantidade: 8,
        custo_unitario: 25
      }]
    },
    CrCompetencia: {
      findOne: async () => competencia,
      findAll: async () => []
    },
    CrPrevisaoReceita: {
      findAll: async () => [{
        competencia_id: 41,
        origem: 'MEDICAO',
        plano_item_id: 9,
        quantidade_prevista: 10,
        valor_previsto: 100
      }]
    },
    CrPrevisaoCusto: { findAll: async () => [] },
    CrMedicaoConsolidada: {
      findAll: async () => [],
      destroy: async () => 0,
      bulkCreate: async (rows) => {
        [createdMeasurement] = rows;
        return rows;
      }
    },
    CrAuditoria: {
      findOne: async () => null,
      create: async (payload) => {
        auditPayload = payload.payload_json;
      }
    }
  };
  const result = await consolidarMedicao(
    { id: 1 },
    7,
    '2026-08',
    {
      idempotency_key: 'medicao-1',
      justificativa_glosa_geral: 'Glosa registrada pelo orgao.',
      itens: [{
        plano_item_id: 9,
        quantidade_medida: 6,
        valor_medido: 60,
        justificativa_glosa: 'Glosa registrada pelo orgao.'
      }]
    },
    overrides
  );
  assert.strictEqual(result.valor_total, 60);
  assert.strictEqual(result.valor_glosa, 40);
  assert.strictEqual(createdMeasurement.valor_glosa, 40);
  assert.strictEqual(auditPayload.idempotency_key, 'medicao-1');

  await assert.rejects(
    () => consolidarMedicao(
      { id: 1 },
      7,
      '2026-08',
      {
        idempotency_key: 'medicao-2',
        itens: [{
          plano_item_id: 9,
          quantidade_medida: 21,
          valor_medido: 210,
          justificativa_glosa: null
        }]
      },
      overrides
    ),
    (error) => error?.code === 'CR_MEDICAO_SUPERA_ORCAMENTO'
  );

  const independentResult = await consolidarMedicao(
    { id: 1 },
    7,
    '2026-08',
    {
      idempotency_key: 'medicao-3',
      justificativa_glosa_geral: 'Composicao aprovada diferente da previsao.',
      itens: [{
        plano_item_id: 10,
        quantidade_medida: 2,
        valor_medido: 1
      }]
    },
    overrides
  );
  assert.strictEqual(independentResult.valor_total, 50);
  assert.strictEqual(createdMeasurement.plano_item_id, 10);
  assert.strictEqual(createdMeasurement.valor_medido, 50);
}

async function run() {
  validateComparisonStates();
  validateCompetenciaBoundaries();
  validateBackendContracts();
  validateFrontendContracts();
  validatePlanningSpreadsheetPreview();
  await validatePlanSearchByMacro();
  await validatePrivateAntiDoubleCount();
  await validatePrivateReceiptsSyncOnFinalization();
  await validateMonthlyMacroSubitemsAndForecastMeasurement();
  await validateFinalizationIdempotency();
  await validateFinalizedCompetencyIsImmutable();
  await validatePrivateWorkRejectsMeasurement();
  await validateApprovedMeasurementAndGlosa();
  console.log('Fase 2 de Custos e Recebiveis validada com sucesso.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
