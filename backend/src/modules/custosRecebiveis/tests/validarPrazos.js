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

  const emDia = resumirPrazosObra({
    ...base,
    competencias: [
      { competencia: '2026-09', estado: 'FINALIZADA', finalizado_em: 'x', tem_medicao_aprovada: true },
      { competencia: '2026-10', estado: 'REABERTA', finalizado_em: 'x', tem_medicao_aprovada: true }
    ],
    now: at('2026-10-10T12:00:00-03:00')
  });
  assert.strictEqual(emDia.planejamento.situacao, 'AGUARDANDO_JANELA');
  assert.strictEqual(emDia.planejamento.competencia, '2026-11');
  assert.strictEqual(emDia.planejamento.dias, 15);
  assert.strictEqual(emDia.medicao.situacao, 'EM_DIA');
  assert.strictEqual(emDia.medicao.competencia, '2026-11');

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
}

async function validateMonthListFlags() {
  const month = (id, competencia, estado) => ({ id, obra_id: 7, competencia, estado });
  const response = await listarCompetencias({ id: 1 }, 7, {
    resolverEscopoObras: scope,
    Obra: { findByPk: async () => ({ id: 7, classificacao: 'PUBLICA' }) },
    CrCompetencia: {
      findAll: async () => [
        month(1, '2020-01', 'EM_PREENCHIMENTO'),
        month(2, '2020-02', 'FINALIZADA'),
        month(3, '2020-03', 'REABERTA')
      ]
    },
    CrMedicaoConsolidada: { findAll: async () => [] },
    TituloFinanceiro: { findAll: async () => [] },
    TituloFinanceiroRateio: { findAll: async () => [] },
    MovimentoFinanceiro: { findAll: async () => [] },
    CrReabertura: { findAll: async () => [] },
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
  console.log('Prazos de Custos e Recebiveis validados com sucesso.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
