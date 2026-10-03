'use strict';

const assert = require('assert');
const {
  competenciaAlvoPlanejamento,
  competenciasLiberadas,
  janelaPlanejamento,
  prazoMedicaoAprovada,
  resumirPrazosObra
} = require('../services/prazoService');
const {
  assertEditable,
  criarCompetencia,
  listarCompetencias,
  salvarCustos,
  solicitarReabertura
} = require('../services/planejamentoService');

const at = (value) => new Date(value);
const {
  decidirDilatacao,
  salvarPrazosObra,
  solicitarDilatacao
} = require('../services/prazoGestaoService');

function validateWindows() {
  const janela = janelaPlanejamento('2026-10');
  assert.strictEqual(janela.abre_em.toISOString(), '2026-09-25T03:00:00.000Z');
  assert.strictEqual(janela.fecha_em.toISOString(), '2026-10-06T02:59:59.999Z');
  // Janeiro abre em 25 de dezembro do ano anterior.
  assert.strictEqual(janelaPlanejamento('2027-01').abre_em.toISOString(), '2026-12-25T03:00:00.000Z');
  // Marco: 1o/03 + 40 dias = 10/04, ate 23:59:59 de Brasilia.
  assert.strictEqual(prazoMedicaoAprovada('2026-03').toISOString(), '2026-04-11T02:59:59.999Z');

  assert.strictEqual(competenciaAlvoPlanejamento(at('2026-09-24T23:59:00-03:00')), '2026-09');
  assert.strictEqual(competenciaAlvoPlanejamento(at('2026-09-25T00:00:00-03:00')), '2026-10');
  assert.strictEqual(competenciaAlvoPlanejamento(at('2026-12-26T10:00:00-03:00')), '2027-01');
}

function validateSummaries() {
  const base = {
    classificacao: 'PUBLICA',
    temPlanoPublicado: true,
    inicio: '2026-09',
    competencias: [
      { competencia: '2026-09', estado: 'FINALIZADA', finalizado_em: '2026-09-03', tem_medicao_aprovada: false }
    ]
  };

  const aberto = resumirPrazosObra({ ...base, now: at('2026-09-29T12:00:00-03:00') });
  assert.strictEqual(aberto.planejamento.situacao, 'ABERTO');
  assert.strictEqual(aberto.planejamento.competencia, '2026-10');
  assert.strictEqual(aberto.planejamento.dias, 6);
  assert.strictEqual(aberto.medicao.situacao, 'ABERTO');
  assert.strictEqual(aberto.medicao.competencia, '2026-09');
  assert.strictEqual(aberto.medicao.dias, 12);
  assert.strictEqual(aberto.travada, false);

  const ultimoInstante = resumirPrazosObra({ ...base, now: at('2026-10-05T23:59:59-03:00') });
  assert.strictEqual(ultimoInstante.planejamento.situacao, 'ABERTO');
  assert.strictEqual(ultimoInstante.planejamento.dias, 0);

  const vencido = resumirPrazosObra({ ...base, now: at('2026-10-07T12:00:00-03:00') });
  assert.strictEqual(vencido.planejamento.situacao, 'VENCIDO');
  assert.strictEqual(vencido.planejamento.dias, 2);

  // Mes reaberto para correcao continua entregue: nao volta a ser pendencia
  // nem trava a obra (decisao de 29/09).
  const reaberto = resumirPrazosObra({
    ...base,
    competencias: [
      { competencia: '2026-09', estado: 'FINALIZADA', finalizado_em: 'x', tem_medicao_aprovada: true },
      { competencia: '2026-10', estado: 'REABERTA', finalizado_em: 'x', tem_medicao_aprovada: true }
    ],
    now: at('2026-10-10T12:00:00-03:00')
  });
  assert.strictEqual(reaberto.planejamento.situacao, 'AGUARDANDO_JANELA');
  assert.strictEqual(reaberto.planejamento.competencia, '2026-11');

  const emDia = resumirPrazosObra({
    ...base,
    competencias: [
      { competencia: '2026-09', estado: 'FINALIZADA', finalizado_em: 'x', tem_medicao_aprovada: true },
      { competencia: '2026-10', estado: 'FINALIZADA', finalizado_em: 'x', tem_medicao_aprovada: true }
    ],
    now: at('2026-10-10T12:00:00-03:00')
  });
  assert.strictEqual(emDia.planejamento.situacao, 'AGUARDANDO_JANELA');
  assert.strictEqual(emDia.planejamento.competencia, '2026-11');
  assert.strictEqual(emDia.planejamento.dias, 15);
  assert.strictEqual(emDia.medicao.situacao, 'EM_DIA');
  assert.strictEqual(emDia.medicao.competencia, '2026-11');

  // Mes antigo com dilatacao longa nao esconde os meses seguintes vencidos.
  const dilatadoLongo = resumirPrazosObra({
    classificacao: 'PUBLICA',
    temPlanoPublicado: true,
    inicio: '2026-01',
    competencias: [
      { competencia: '2026-01', estado: 'FINALIZADA', dilatacao_prazo: at('2026-06-30T23:59:59-03:00') },
      { competencia: '2026-02', estado: 'FINALIZADA' },
      { competencia: '2026-03', estado: 'FINALIZADA' },
      { competencia: '2026-04', estado: 'FINALIZADA' },
      { competencia: '2026-05', estado: 'FINALIZADA' }
    ],
    now: at('2026-04-15T12:00:00-03:00')
  });
  assert.strictEqual(dilatadoLongo.medicao.situacao, 'VENCIDO');
  assert.strictEqual(dilatadoLongo.medicao.competencia, '2026-02');

  const semEstrutura = resumirPrazosObra({ ...base, temPlanoPublicado: false });
  assert.strictEqual(semEstrutura.planejamento.situacao, 'SEM_ESTRUTURA');
  assert.strictEqual(semEstrutura.medicao, null);

  const privada = resumirPrazosObra({ ...base, classificacao: 'PRIVADA', now: at('2026-09-29T12:00:00-03:00') });
  assert.strictEqual(privada.medicao, null);

  const futura = resumirPrazosObra({ ...base, inicio: '2026-12', competencias: [], now: at('2026-09-29T12:00:00-03:00') });
  assert.strictEqual(futura.planejamento.situacao, 'AGUARDANDO_JANELA');
  assert.strictEqual(futura.planejamento.competencia, '2026-12');
}

function validateReleasedMonths() {
  const now = at('2026-09-29T12:00:00-03:00');
  assert.deepStrictEqual(competenciasLiberadas({
    temPlanoPublicado: true,
    inicio: '2026-08',
    competencias: [{ competencia: '2026-09' }],
    now
  }), ['2026-08', '2026-10']);
  assert.deepStrictEqual(competenciasLiberadas({
    temPlanoPublicado: true,
    competencias: [],
    now: at('2026-09-10T12:00:00-03:00')
  }), ['2026-09']);
  assert.deepStrictEqual(competenciasLiberadas({ temPlanoPublicado: false, now }), []);
  assert.deepStrictEqual(competenciasLiberadas({ temPlanoPublicado: true, inicio: '2026-12', now }), []);
}

const tx = { transaction: async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } }) };
const scope = async () => ({ todas: true, obraIds: null });

async function validateEditRules() {
  const reopened = { id: 7, competencia: '2026-08', estado: 'REABERTA' };
  const withReopening = { CrReabertura: { findOne: async () => ({ id: 1 }) } };
  const withoutReopening = { CrReabertura: { findOne: async () => null } };
  // Reaberta com reabertura vigente: editavel, mesmo com prazo vencido.
  await assertEditable(reopened, withReopening);
  await assert.rejects(() => assertEditable(reopened, withoutReopening), (error) => error.code === 'CR_REABERTURA_EXPIRADA');
  // Finalizada nunca e editavel, nem com reabertura ainda vigente.
  await assert.rejects(
    () => assertEditable({ ...reopened, estado: 'FINALIZADA' }, withReopening),
    (error) => error.code === 'CR_COMPETENCIA_IMUTAVEL'
  );
  // Planejamento atrasado e nunca finalizado: editavel sem reabertura.
  await assertEditable({ ...reopened, competencia: '2020-01', estado: 'EM_PREENCHIMENTO' }, withoutReopening);
  await assertEditable({ ...reopened, competencia: '2020-01', estado: 'ABERTA' }, withoutReopening);
}

async function validateNewMonthIdempotency() {
  const existing = { id: 5, obra_id: 7, competencia: '2026-10', estado: 'ABERTA', plano_versao_snapshot: 2 };
  let created = 0;
  const deps = {
    sequelize: tx,
    resolverEscopoObras: scope,
    Obra: { findByPk: async () => ({ id: 7, classificacao: 'PUBLICA' }) },
    CrPlanoObra: { findOne: async () => ({ id: 3, versao: 2 }) },
    CrCompetencia: { findOne: async () => existing, create: async () => { created += 1; } },
    CrAuditoria: { create: async () => null },
    competenciasLiberadasObra: async () => []
  };
  // O mes ja existe e saiu das liberadas: repetir o pedido devolve o registro.
  const result = await criarCompetencia({ id: 1 }, 7, { competencia: '2026-10' }, 'k1', deps);
  assert.strictEqual(result.idempotente, true);
  assert.strictEqual(created, 0);
  // Mes inexistente fora da janela continua recusado.
  await assert.rejects(
    () => criarCompetencia({ id: 1 }, 7, { competencia: '2027-06' }, 'k2', {
      ...deps,
      CrCompetencia: { findOne: async () => null, create: async () => { created += 1; } }
    }),
    (error) => error.code === 'CR_COMPETENCIA_FORA_JANELA'
  );
  assert.strictEqual(created, 0);
}

async function validateSaveCannotCreateFutureMonth() {
  let created = 0;
  await assert.rejects(
    () => salvarCustos({ id: 1 }, 7, '2027-06', { itens: [] }, {
      sequelize: tx,
      resolverEscopoObras: scope,
      Obra: { findByPk: async () => ({ id: 7, classificacao: 'PUBLICA' }) },
      CrPlanoObra: { findOne: async () => ({ id: 3, versao: 2, situacao: 'PUBLICADA' }) },
      CrPlanoItem: { findAll: async () => [] },
      CrCompetencia: { findOne: async () => null, create: async () => { created += 1; } },
      competenciasLiberadasObra: async () => ['2026-10']
    }),
    (error) => error.code === 'CR_COMPETENCIA_FORA_JANELA'
  );
  assert.strictEqual(created, 0);
}

async function validateReopeningEligibility() {
  const base = {
    sequelize: tx,
    resolverEscopoObras: scope,
    CrReabertura: { findOne: async () => null, create: async (values) => ({ id: 9, ...values }) },
    CrAuditoria: { create: async () => null }
  };
  const locked = async () => new Map([[7, {
    competencias: [{ competencia: '2026-08', tem_medicao_aprovada: true }]
  }]]);
  base.Obra = { findByPk: async () => ({ id: 7, classificacao: 'PUBLICA' }) };
  base.carregarContextoPrazos = async () => new Map();
  const request = (estado, overrides = {}) => solicitarReabertura(
    { id: 1 },
    41,
    { motivo: 'Corrigir quantidade do aço' },
    {
      ...base,
      CrCompetencia: {
        findByPk: async () => ({ id: 41, obra_id: 7, competencia: '2026-08', estado }),
        findOne: async () => ({ id: 41, obra_id: 7 })
      },
      ...overrides
    }
  );
  assert.strictEqual((await request('FINALIZADA')).idempotente, false);
  // Reaberta cuja janela expirou pode pedir de novo.
  assert.strictEqual((await request('REABERTA')).idempotente, false);
  // Mes em preenchimento (mesmo atrasado) nao precisa de reabertura.
  await assert.rejects(() => request('EM_PREENCHIMENTO'), (error) => error.code === 'CR_REABERTURA_ESTADO_INVALIDO');
  // ...salvo para corrigir medicao aprovada ja encerrada pelo prazo.
  assert.strictEqual((await request('EM_PREENCHIMENTO', { carregarContextoPrazos: locked })).idempotente, false);
}

async function validateMonthListFlags() {
  const month = (id, competencia, estado) => ({ id, obra_id: 7, competencia, estado });
  const response = await listarCompetencias({ id: 1 }, 7, {
    resolverEscopoObras: scope,
    Obra: { findByPk: async () => ({ id: 7, classificacao: 'PUBLICA' }) },
    CrCompetencia: {
      findAll: async ({ where } = {}) => (where?.estado === 'REABERTA'
        ? []
        : [
          month(1, '2020-01', 'EM_PREENCHIMENTO'),
          month(2, '2020-02', 'FINALIZADA'),
          month(3, '2020-03', 'REABERTA')
        ])
    },
    CrMedicaoConsolidada: { findAll: async () => [] },
    TituloFinanceiro: { findAll: async () => [] },
    TituloFinanceiroRateio: { findAll: async () => [] },
    MovimentoFinanceiro: { findAll: async () => [] },
    CrReabertura: { findAll: async () => [] },
    CrMedicaoSemRegistro: { findAll: async () => [{ competencia_id: 2 }] },
    carregarContextoPrazos: async () => new Map(),
    competenciasLiberadasObra: async () => ['2026-10']
  });
  const byMonth = new Map(response.items.map((item) => [item.competencia, item]));
  assert.strictEqual(byMonth.get('2020-01').planejamento_editavel, true);
  assert.strictEqual(byMonth.get('2020-01').vencida, true);
  assert.strictEqual(byMonth.get('2020-01').reabertura_permitida, false);
  assert.strictEqual(byMonth.get('2020-02').planejamento_editavel, false);
  assert.strictEqual(byMonth.get('2020-02').reabertura_permitida, true);
  assert.strictEqual(byMonth.get('2020-03').planejamento_editavel, false);
  assert.strictEqual(byMonth.get('2020-03').reabertura_permitida, true);
  assert.deepStrictEqual(response.competencias_permitidas, ['2026-10']);
  assert.strictEqual(byMonth.get('2020-02').sem_medicao, true);
  assert.strictEqual(byMonth.get('2020-01').sem_medicao, false);
}

async function validateConfiguredWindows() {
  const config = { planejamento_dia_abertura: 20, planejamento_dia_fechamento: 10, medicao_prazo_dias: 30 };
  const janela = janelaPlanejamento('2026-10', config);
  assert.strictEqual(janela.abre_em.toISOString(), '2026-09-20T03:00:00.000Z');
  assert.strictEqual(janela.fecha_em.toISOString(), '2026-10-11T02:59:59.999Z');
  assert.strictEqual(prazoMedicaoAprovada('2026-03', config).toISOString(), '2026-04-01T02:59:59.999Z');
  // Valor fora do limite cai no padrao, nao quebra o calculo.
  assert.strictEqual(
    janelaPlanejamento('2026-10', { planejamento_dia_abertura: 40 }).abre_em.toISOString(),
    '2026-09-25T03:00:00.000Z'
  );
  const resumo = resumirPrazosObra({
    classificacao: 'PUBLICA',
    temPlanoPublicado: true,
    inicio: '2026-09',
    config,
    competencias: [{ competencia: '2026-09', estado: 'FINALIZADA', tem_medicao_aprovada: false, dilatacao_prazo: at('2026-10-05T23:59:59-03:00') }],
    now: at('2026-10-03T12:00:00-03:00')
  });
  // 1o/09 + 30 = 01/10; a dilatacao aprovada ate 05/10 prevalece.
  assert.strictEqual(resumo.medicao.situacao, 'ABERTO');
  assert.strictEqual(resumo.medicao.dias, 2);
  assert.strictEqual(resumo.medicao.dilatado, true);
  assert.strictEqual(resumo.planejamento.competencia, '2026-10');
  assert.strictEqual(resumo.planejamento.dias, 7);
}

async function validateConfigSave() {
  const audits = [];
  let row = null;
  const deps = {
    sequelize: tx,
    resolverEscopoObras: scope,
    Obra: { findByPk: async () => ({ id: 7 }) },
    CrPrazoObra: {
      findOne: async () => row,
      create: async (values) => {
        row = { ...values, update: async (next) => Object.assign(row, next), destroy: async () => { row = null; } };
        return row;
      }
    },
    CrAuditoria: { create: async (values) => audits.push(values) }
  };
  await assert.rejects(
    () => salvarPrazosObra({ id: 1 }, 7, { planejamento_dia_abertura: 30, planejamento_dia_fechamento: 5, medicao_prazo_dias: 40 }, deps),
    (error) => error.code === 'CR_PRAZOS_INVALIDOS'
  );
  const saved = await salvarPrazosObra({ id: 1 }, 7, { planejamento_dia_abertura: 20, planejamento_dia_fechamento: 8, medicao_prazo_dias: 45 }, deps);
  assert.strictEqual(saved.personalizado, true);
  assert.strictEqual(saved.medicao_prazo_dias, 45);
  assert.strictEqual(audits.length, 1);
  const repeated = await salvarPrazosObra({ id: 1 }, 7, { planejamento_dia_abertura: 20, planejamento_dia_fechamento: 8, medicao_prazo_dias: 45 }, deps);
  assert.strictEqual(repeated.idempotente, true);
  assert.strictEqual(audits.length, 1);
  const reset = await salvarPrazosObra({ id: 1 }, 7, { padrao: true }, deps);
  assert.strictEqual(reset.personalizado, false);
  assert.strictEqual(reset.planejamento_dia_abertura, 25);
  assert.strictEqual(row, null);
}

async function validateDilatacao() {
  const created = [];
  let pending = null;
  const now = at('2026-10-15T12:00:00-03:00');
  const context = (extra = {}) => async () => new Map([[7, {
    config: null,
    competencias: [{ competencia: '2026-09', tem_medicao_aprovada: false, ...extra }]
  }]]);
  const deps = {
    sequelize: tx,
    resolverEscopoObras: scope,
    now: () => now,
    Obra: { findByPk: async () => ({ id: 7, classificacao: 'PUBLICA' }) },
    CrCompetencia: { findOne: async () => ({ id: 41, competencia: '2026-09' }) },
    CrDilatacao: {
      findOne: async () => pending,
      create: async (values) => { const row = { id: 90, ...values }; created.push(row); return row; }
    },
    CrAuditoria: { create: async () => null },
    carregarContextoPrazos: context(),
    competenciasLiberadasObra: async () => []
  };
  const ask = (payload, overrides = {}) => solicitarDilatacao({ id: 3 }, 7, '2026-09', payload, { ...deps, ...overrides });
  await assert.rejects(() => ask({ dias: 1, motivo: 'Fiscal atrasou a visita' }), (e) => e.code === 'CR_DILATACAO_DIAS_INVALIDOS');
  await assert.rejects(() => ask({ dias: 6, motivo: 'Fiscal atrasou a visita' }), (e) => e.code === 'CR_DILATACAO_DIAS_INVALIDOS');
  await assert.rejects(() => ask({ dias: 3, motivo: 'curto' }), (e) => e.code === 'CR_DILATACAO_MOTIVO_REQUIRED');
  await assert.rejects(
    () => ask({ dias: 3, motivo: 'Fiscal atrasou a visita' }, { Obra: { findByPk: async () => ({ id: 7, classificacao: 'PRIVADA' }) } }),
    (e) => e.code === 'CR_MEDICAO_APENAS_OBRA_PUBLICA'
  );
  await assert.rejects(
    () => ask({ dias: 3, motivo: 'Fiscal atrasou a visita' }, { carregarContextoPrazos: context({ tem_medicao_aprovada: true }) }),
    (e) => e.code === 'CR_DILATACAO_MEDICAO_REGISTRADA'
  );
  await assert.rejects(
    () => solicitarDilatacao({ id: 3 }, 7, '2026-11', { dias: 3, motivo: 'Fiscal atrasou a visita' }, deps),
    (e) => e.code === 'CR_DILATACAO_MES_FUTURO'
  );
  // Com o prazo ainda correndo (setembro vence em 11/10) nao ha pedido.
  await assert.rejects(
    () => ask({ dias: 3, motivo: 'Fiscal atrasou a visita' }, { now: () => at('2026-10-11T20:00:00-03:00') }),
    (e) => e.code === 'CR_DILATACAO_PRAZO_EM_ABERTO'
  );
  // Depois do vencimento o pedido e aceito.
  const first = await ask({ dias: 3, motivo: 'Fiscal atrasou a visita' });
  assert.strictEqual(first.idempotente, false);
  assert.strictEqual(new Date(created[0].prazo_anterior).toISOString(), '2026-10-12T02:59:59.999Z');
  pending = created[0];
  const again = await ask({ dias: 5, motivo: 'Outro pedido enquanto pende' });
  assert.strictEqual(again.idempotente, true);
  assert.strictEqual(created.length, 1);

  // Decisao: prazo vencido -> conta da aprovacao (15/10) + 3 = 18/10 23:59.
  const record = { id: 90, obra_id: 7, competencia_id: 41, dias: 3, situacao: 'SOLICITADA', update: async function update(values) { Object.assign(this, values); } };
  const decideDeps = {
    ...deps,
    CrDilatacao: { findByPk: async () => ({ ...record, competencia: { competencia: '2026-09' } }) }
  };
  decideDeps.CrDilatacao.findByPk = async (id, options) => (options?.include ? { ...record, competencia: { competencia: '2026-09' } } : record);
  await assert.rejects(() => decidirDilatacao({ id: 1 }, 90, { decisao: 'TALVEZ' }, decideDeps), (e) => e.code === 'CR_DILATACAO_DECISAO_INVALIDA');
  // Medicao registrada depois do pedido: nao aprova (reabriria a edicao).
  await assert.rejects(
    () => decidirDilatacao({ id: 1 }, 90, { decisao: 'APROVADA' }, { ...decideDeps, carregarContextoPrazos: context({ tem_medicao_aprovada: true }) }),
    (e) => e.code === 'CR_DILATACAO_MEDICAO_REGISTRADA'
  );
  const approved = await decidirDilatacao({ id: 1 }, 90, { decisao: 'APROVADA' }, decideDeps);
  assert.strictEqual(approved.dilatacao.situacao, 'APROVADA');
  assert.strictEqual(new Date(record.prazo_novo).toISOString(), '2026-10-19T02:59:59.999Z');
  assert.strictEqual((await decidirDilatacao({ id: 1 }, 90, { decisao: 'APROVADA' }, decideDeps)).idempotente, true);
  await assert.rejects(() => decidirDilatacao({ id: 1 }, 90, { decisao: 'NEGADA' }, decideDeps), (e) => e.code === 'CR_DILATACAO_JA_DECIDIDA');

  // Conta da aprovacao: pedido 10/10, aprovado 14/10 + 2 = 16/10 23:59.
  const late = { id: 92, obra_id: 7, competencia_id: 41, dias: 2, situacao: 'SOLICITADA', update: async function update(values) { Object.assign(this, values); } };
  await decidirDilatacao({ id: 1 }, 92, { decisao: 'APROVADA' }, {
    ...deps,
    now: () => at('2026-10-14T09:00:00-03:00'),
    CrDilatacao: { findByPk: async (id, options) => (options?.include ? { ...late, competencia: { competencia: '2026-09' } } : late) }
  });
  assert.strictEqual(new Date(late.prazo_novo).toISOString(), '2026-10-17T02:59:59.999Z');

  // Aprovada cedo (02/10 + 2 = 04/10) nao encurta o prazo vigente de 11/10.
  const early = { id: 91, obra_id: 7, competencia_id: 41, dias: 2, situacao: 'SOLICITADA', update: async function update(values) { Object.assign(this, values); } };
  await decidirDilatacao({ id: 1 }, 91, { decisao: 'APROVADA' }, {
    ...deps,
    now: () => at('2026-10-02T12:00:00-03:00'),
    CrDilatacao: { findByPk: async (id, options) => (options?.include ? { ...early, competencia: { competencia: '2026-09' } } : early) }
  });
  assert.strictEqual(new Date(early.prazo_novo).toISOString(), '2026-10-12T02:59:59.999Z');
}

async function validateRealizedAutoSync() {
  const { sincronizarRealizadosAoConsultar } = require('../services/realizadoService');
  let calls = 0;
  let now = at('2026-09-29T12:00:00-03:00');
  const deps = (exists = true, fail = false) => ({
    now: () => now,
    CrCompetencia: { findOne: async () => (exists ? { id: 1 } : null) },
    reprocessarRealizados: async () => { calls += 1; if (fail) throw new Error('falhou'); }
  });
  assert.strictEqual((await sincronizarRealizadosAoConsultar({ id: 1 }, 55, '2026-10', deps())).motivo, 'MES_FUTURO');
  assert.strictEqual((await sincronizarRealizadosAoConsultar({ id: 1 }, 55, '2026-09', deps(false))).motivo, 'SEM_COMPETENCIA');
  assert.strictEqual((await sincronizarRealizadosAoConsultar({ id: 1 }, 55, '2026-09', deps())).sincronizado, true);
  assert.strictEqual((await sincronizarRealizadosAoConsultar({ id: 1 }, 55, '2026-09', deps())).motivo, 'RECENTE');
  now = at('2026-09-29T12:06:00-03:00');
  assert.strictEqual((await sincronizarRealizadosAoConsultar({ id: 1 }, 55, '2026-09', deps())).sincronizado, true);
  assert.strictEqual(calls, 2);
  const failed = await sincronizarRealizadosAoConsultar({ id: 1 }, 56, '2026-08', deps(true, true));
  assert.strictEqual(failed.motivo, 'FALHA');
  // Falha nao conta para o intervalo: a proxima consulta tenta de novo.
  assert.strictEqual((await sincronizarRealizadosAoConsultar({ id: 1 }, 56, '2026-08', deps())).sincronizado, true);
}

async function validateReopeningWindow() {
  const {
    REABERTURA_HORAS,
    decidirReabertura,
    fecharReaberturasExpiradas
  } = require('../services/planejamentoService');
  const { MAX_BYPASS_HOURS } = require('../services/obrigacaoService');
  assert.strictEqual(REABERTURA_HORAS, 24);
  assert.strictEqual(MAX_BYPASS_HOURS, 48);

  // Aprovar reabertura ignora data informada: vale 24h.
  const reopening = { id: 5, competencia_id: 41, situacao: 'SOLICITADA', update: async function update(values) { Object.assign(this, values); } };
  const competencia = { id: 41, obra_id: 7, estado: 'FINALIZADA', update: async function update(values) { Object.assign(this, values); } };
  const before = Date.now();
  await decidirReabertura({ id: 1 }, 5, { decisao: 'APROVADA', expira_em: '2099-01-01T00:00:00Z' }, {
    sequelize: tx,
    resolverEscopoObras: scope,
    CrReabertura: {
      findByPk: async (id, options) => (options?.include ? { ...reopening, competencia: { obra_id: 7 } } : reopening),
      findOne: async () => null
    },
    CrCompetencia: { findByPk: async () => competencia, findOne: async () => ({ id: 41, obra_id: 7 }) },
    CrAuditoria: { create: async () => null }
  });
  const hours = (new Date(reopening.expira_em).getTime() - before) / 3600000;
  assert(hours > 23.9 && hours < 24.1, `reabertura deveria valer 24h, vale ${hours}`);
  assert.strictEqual(competencia.estado, 'REABERTA');

  // Janela vencida: o mes volta a FINALIZADA; com reabertura vigente, fica.
  const expired = { id: 41, competencia: '2026-08', estado: 'REABERTA', update: async function update(values) { Object.assign(this, values); } };
  const stillOpen = { id: 42, competencia: '2026-09', estado: 'REABERTA', update: async function update(values) { Object.assign(this, values); } };
  const byId = { 41: expired, 42: stillOpen };
  const audits = [];
  const closeDeps = {
    sequelize: tx,
    Obra: { findByPk: async () => ({ id: 7, classificacao: 'PUBLICA' }) },
    CrCompetencia: { findAll: async () => [{ id: 41 }, { id: 42 }], findByPk: async (id) => byId[id] },
    CrReabertura: { findOne: async ({ where }) => (where.competencia_id === 42 ? { id: 9 } : null) },
    CrPrevisaoCusto: { findAll: async ({ where }) => (where.competencia_id === 41 ? [] : [{ valor_previsto: 10 }]) },
    CrPrevisaoReceita: { findAll: async () => [{ valor_previsto: 50 }] },
    CrAuditoria: { create: async (values) => audits.push(values) }
  };
  await fecharReaberturasExpiradas(7, closeDeps);
  assert.strictEqual(expired.estado, 'FINALIZADA');
  assert.strictEqual(expired.total_receita_prevista, 50);
  assert.strictEqual(stillOpen.estado, 'REABERTA');
  assert.strictEqual(audits.length, 1);
  // Fechou sem custos: sinalizado na auditoria.
  assert.strictEqual(audits[0].payload_json.sem_custos, true);
  // Segunda leitura: ja FINALIZADA, nao fecha nem audita de novo.
  await fecharReaberturasExpiradas(7, closeDeps);
  assert.strictEqual(audits.length, 1);
}

function validateMigration() {
  const migration = require('../../../../migrations/202609290001_custos_recebiveis_prazos_dilatacao');
  const db = require('../../../models');
  assert.strictEqual(typeof migration.up, 'function');
  assert.strictEqual(db.CrPrazoObra.getTableName(), 'cr_prazos_obra');
  assert.strictEqual(db.CrDilatacao.getTableName(), 'cr_dilatacoes');
  assert.strictEqual(db.CrMedicaoSemRegistro.getTableName(), 'cr_medicao_sem_registro');
}

async function run() {
  validateWindows();
  validateSummaries();
  validateReleasedMonths();
  await validateEditRules();
  await validateNewMonthIdempotency();
  await validateSaveCannotCreateFutureMonth();
  await validateReopeningEligibility();
  await validateMonthListFlags();
  await validateConfiguredWindows();
  await validateConfigSave();
  await validateDilatacao();
  await validateRealizedAutoSync();
  await validateReopeningWindow();
  validateMigration();
  console.log('Prazos de Custos e Recebiveis validados com sucesso.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
