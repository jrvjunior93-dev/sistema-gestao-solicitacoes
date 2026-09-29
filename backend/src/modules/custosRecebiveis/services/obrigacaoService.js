'use strict';

const { Op } = require('sequelize');
const db = require('../../../models');
const { isModuleEnabled } = require('../../../services/moduleConfigService');
const { isSuperadmin } = require('../../../services/authorizationService');
const { createBusinessError } = require('./planoMicroService');
const { resolverEscopoObras } = require('../policies/obraScopePolicy');
const {
  CUSTOS_RECEBIVEIS_MODULE_KEY,
  CUSTOS_RECEBIVEIS_PERMISSIONS
} = require('../constants/custosRecebiveisConstants');
const {
  resolveExplicitCustosRecebiveisPermissions
} = require('../policies/permissionPolicy');
const {
  carregarContextoPrazos,
  competenciaNoInstante,
  janelaPlanejamento,
  prazoMedicaoEfetivo
} = require('./prazoService');

const VALID_COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;
const OBRIGACAO_TYPES = Object.freeze({
  CUSTO_PREVISTO: 'CUSTO_PREVISTO',
  MEDICAO_APRESENTADA: 'RECEITA_PREVISTA',
  MEDICAO_APROVADA: 'MEDICAO_CONSOLIDADA'
});
const ACTIVE_OBLIGATION_STATES = Object.freeze(['PENDENTE', 'VENCIDA']);
// Liberacao temporaria do bloqueio: no maximo 48 horas (decisao de 29/09).
const MAX_BYPASS_HOURS = 48;
const MAX_BYPASS_DAYS = MAX_BYPASS_HOURS / 24;

function dependencies(overrides = {}) {
  return {
    sequelize: db.sequelize,
    Obra: db.Obra,
    User: db.User,
    CrPlanoObra: db.CrPlanoObra,
    CrCompetencia: db.CrCompetencia,
    CrResponsavelObra: db.CrResponsavelObra,
    CrObrigacaoUsuario: db.CrObrigacaoUsuario,
    CrReabertura: db.CrReabertura,
    CrGuardBypass: db.CrGuardBypass,
    CrAuditoria: db.CrAuditoria,
    carregarContextoPrazos,
    isModuleEnabled,
    isSuperadmin,
    resolveExplicitPermissions: resolveExplicitCustosRecebiveisPermissions,
    resolverEscopoObras,
    now: () => new Date(),
    ...overrides
  };
}

function plain(value) {
  return value?.toJSON ? value.toJSON() : { ...(value || {}) };
}

function positiveId(value, label = 'Identificador') {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createBusinessError(400, 'CR_INVALID_ID', `${label} invalido.`);
  }
  return parsed;
}

function normalizeText(value, maxLength = 2000) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeCompetencia(value) {
  const normalized = String(value || '').trim();
  if (!VALID_COMPETENCIA.test(normalized)) {
    throw createBusinessError(400, 'CR_COMPETENCIA_INVALIDA', 'Competencia invalida. Use AAAA-MM.');
  }
  return normalized;
}

// Mes corrente em Brasilia (mesma regua de prazoService), e nao no fuso do
// servidor: na EC2 em UTC a virada vinha 3 horas antes.
function competenciaAtual(now = new Date()) {
  return competenciaNoInstante(now);
}

function addMonth(competencia, amount = 1) {
  const [year, month] = normalizeCompetencia(competencia).split('-').map(Number);
  const date = new Date(year, month - 1 + amount, 1, 12, 0, 0, 0);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function listCompetencias(startValue, endValue) {
  const start = normalizeCompetencia(startValue);
  const end = normalizeCompetencia(endValue);
  if (start > end) return [];
  const result = [];
  for (let cursor = start; cursor <= end; cursor = addMonth(cursor)) {
    result.push(cursor);
    if (result.length > 240) break;
  }
  return result;
}

function normalizeHolidaySet(value = process.env.CR_FERIADOS) {
  const values = Array.isArray(value) ? value : String(value || '').split(',');
  return new Set(values
    .map((item) => String(item || '').trim())
    .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item)));
}

function prazoCompetencia(competencia, holidaysValue) {
  const [year, month] = normalizeCompetencia(competencia).split('-').map(Number);
  const deadline = new Date(year, month, 0, 18, 0, 0, 0);
  const holidays = normalizeHolidaySet(holidaysValue);
  const dateKey = () => (
    `${deadline.getFullYear()}-${String(deadline.getMonth() + 1).padStart(2, '0')}-${String(deadline.getDate()).padStart(2, '0')}`
  );
  while (deadline.getDay() === 0 || deadline.getDay() === 6 || holidays.has(dateKey())) {
    deadline.setDate(deadline.getDate() - 1);
  }
  return deadline;
}

function guardMode(value = process.env.CR_GUARD_MODE) {
  return String(value || 'observe').trim().toLowerCase() === 'enforce'
    ? 'enforce'
    : 'observe';
}

function alertLevel(deadlineValue, nowValue = new Date()) {
  const deadline = new Date(deadlineValue);
  const now = new Date(nowValue);
  if (deadline <= now) return 'VENCIDO';
  const days = Math.ceil((deadline.getTime() - now.getTime()) / 86400000);
  if (days <= 1) return 'D-1';
  if (days <= 3) return 'D-3';
  if (days <= 7) return 'D-7';
  return 'NO_PRAZO';
}

function serializeObligation(value, context = {}) {
  const item = plain(value);
  const deadline = new Date(item.prazo_em);
  return {
    id: item.id ? Number(item.id) : null,
    user_id: Number(item.user_id),
    obra_id: Number(item.obra_id),
    obra: item.obra ? {
      id: Number(item.obra.id),
      codigo: item.obra.codigo || null,
      nome: item.obra.nome
    } : context.obra || null,
    competencia: item.competencia,
    tipo: item.tipo,
    prazo_em: deadline.toISOString(),
    situacao: item.situacao,
    cumprida_em: item.cumprida_em || null,
    alerta: alertLevel(deadline, context.now),
    reabertura_ativa: Boolean(context.reaberturaAtiva),
    // Planejamento atrasado e registrado sem reabertura (decisao de 29/09).
    exige_reabertura: false
  };
}

function serializeBypass(value, context = {}) {
  const item = plain(value);
  return {
    id: Number(item.id),
    user_id: Number(item.user_id),
    usuario: item.usuario ? {
      id: Number(item.usuario.id),
      nome: item.usuario.nome,
      email: item.usuario.email || null
    } : null,
    obra_id: item.obra_id ? Number(item.obra_id) : null,
    obra: item.obra ? {
      id: Number(item.obra.id),
      codigo: item.obra.codigo || null,
      nome: item.obra.nome
    } : null,
    motivo: item.motivo,
    concedido_por: Number(item.concedido_por),
    concedido_por_usuario: item.concedidoPor ? {
      id: Number(item.concedidoPor.id),
      nome: item.concedidoPor.nome
    } : null,
    concedido_em: item.concedido_em,
    expira_em: item.expira_em,
    revogado_por: item.revogado_por ? Number(item.revogado_por) : null,
    revogado_em: item.revogado_em || null,
    ativo: !item.revogado_em && new Date(item.expira_em) > new Date(context.now || Date.now()),
    recorrente: Boolean(context.recorrente)
  };
}

async function resolveObligationCapabilities(user, deps) {
  if (deps.isSuperadmin(user)) {
    return {
      moduleAccess: true,
      costs: true,
      receivables: true,
      measurement: true
    };
  }
  const permissions = new Set(
    (await deps.resolveExplicitPermissions(user))
      .map((permission) => String(permission || '').trim().toLowerCase())
  );
  return {
    moduleAccess: permissions.has(CUSTOS_RECEBIVEIS_PERMISSIONS.MODULE_ACCESS),
    costs: permissions.has(CUSTOS_RECEBIVEIS_PERMISSIONS.PLANEJAMENTO_COSTS),
    receivables: permissions.has(CUSTOS_RECEBIVEIS_PERMISSIONS.PLANEJAMENTO_RECEIVABLES),
    measurement: permissions.has(CUSTOS_RECEBIVEIS_PERMISSIONS.MEDICAO_CONSOLIDATE)
  };
}

function obligationTypesForWork(classificationValue, capabilities) {
  if (!capabilities?.moduleAccess) return [];
  const types = [];
  if (capabilities.costs) types.push(OBRIGACAO_TYPES.CUSTO_PREVISTO);
  if (
    String(classificationValue || '').trim().toUpperCase() === 'PUBLICA'
    && capabilities.receivables
  ) {
    types.push(OBRIGACAO_TYPES.MEDICAO_APRESENTADA);
  }
  if (
    String(classificationValue || '').trim().toUpperCase() === 'PUBLICA'
    && capabilities.measurement
  ) {
    types.push(OBRIGACAO_TYPES.MEDICAO_APROVADA);
  }
  return types;
}

async function findExpectedObligations(user, deps, options = {}) {
  const now = options.now || deps.now();
  const today = now.toISOString().slice(0, 10);
  const current = competenciaAtual(now);
  const capabilities = await resolveObligationCapabilities(user, deps);
  if (!capabilities.moduleAccess) return [];
  const scope = await deps.resolverEscopoObras(user);
  if (!scope.todas && !scope.obraIds.length) return [];

  const responsaveis = await deps.CrResponsavelObra.findAll({
    where: {
      user_id: Number(user.id),
      ativo: true,
      papel: { [Op.in]: ['RESPONSAVEL', 'SUBSTITUTO'] },
      vigencia_inicio: { [Op.lte]: today },
      ...(scope.todas ? {} : { obra_id: { [Op.in]: scope.obraIds } }),
      [Op.or]: [
        { vigencia_fim: null },
        { vigencia_fim: { [Op.gte]: today } }
      ]
    },
    include: [{
      model: deps.Obra,
      as: 'obra',
      attributes: ['id', 'codigo', 'nome', 'ativo', 'classificacao'],
      where: { ativo: true },
      required: true
    }],
    order: [['obra_id', 'ASC'], ['vigencia_inicio', 'DESC']]
  });
  if (!responsaveis.length) return [];

  const uniqueByObra = new Map();
  responsaveis.forEach((record) => {
    const item = plain(record);
    if (!uniqueByObra.has(Number(item.obra_id))) uniqueByObra.set(Number(item.obra_id), item);
  });
  const obraIds = [...uniqueByObra.keys()];
  const plans = await deps.CrPlanoObra.findAll({
    where: { obra_id: { [Op.in]: obraIds }, situacao: 'PUBLICADA' },
    attributes: ['id', 'obra_id', 'versao'],
    order: [['obra_id', 'ASC'], ['versao', 'DESC']]
  });
  const plannedObras = new Set(plans.map((item) => Number(item.obra_id)));

  const responsibleValues = [...uniqueByObra.values()];
  const starts = responsibleValues
    .map((item) => item.competencia_inicial)
    .filter((value) => VALID_COMPETENCIA.test(String(value || '')));
  const firstCompetencyByObra = new Map();
  if (starts.length !== responsibleValues.length) {
    const firstCompetencies = await deps.CrCompetencia.findAll({
      where: { obra_id: { [Op.in]: obraIds } },
      attributes: ['id', 'obra_id', 'competencia'],
      order: [['obra_id', 'ASC'], ['competencia', 'ASC']]
    });
    firstCompetencies.forEach((record) => {
      const item = plain(record);
      const obraId = Number(item.obra_id);
      if (!firstCompetencyByObra.has(obraId) && VALID_COMPETENCIA.test(item.competencia)) {
        firstCompetencyByObra.set(obraId, item.competencia);
        starts.push(item.competencia);
      }
    });
  }
  const earliest = starts.sort()[0] || current;
  // Planejamento do mes seguinte ja e cobrado quando a janela dele abre (dia
  // 25, no padrao): a busca vai ate o mes seguinte.
  const competencies = await deps.CrCompetencia.findAll({
    where: {
      obra_id: { [Op.in]: obraIds },
      competencia: { [Op.between]: [earliest, addMonth(current)] }
    }
  });
  const prazosContext = await deps.carregarContextoPrazos(obraIds);
  const competencyByKey = new Map(competencies.map((record) => {
    const item = plain(record);
    return [`${Number(item.obra_id)}:${item.competencia}`, item];
  }));
  const competencyIds = competencies.map((item) => Number(item.id));
  const reopenings = competencyIds.length
    ? await deps.CrReabertura.findAll({
      where: {
        competencia_id: { [Op.in]: competencyIds },
        situacao: 'APROVADA',
        expira_em: { [Op.gt]: now }
      },
      order: [['aprovado_em', 'DESC']]
    })
    : [];
  const reopeningByCompetency = new Set(reopenings.map((item) => Number(item.competencia_id)));

  const result = [];
  for (const [obraId, responsible] of uniqueByObra.entries()) {
    if (!plannedObras.has(obraId)) continue;
    const obligationTypes = obligationTypesForWork(
      responsible.obra?.classificacao,
      capabilities
    );
    if (!obligationTypes.length) continue;
    const start = VALID_COMPETENCIA.test(String(responsible.competencia_inicial || ''))
      ? responsible.competencia_inicial
      : (firstCompetencyByObra.get(obraId) || current);
    const prazoObra = prazosContext.get(obraId) || {};
    const medicaoByCompetencia = new Map(
      (prazoObra.competencias || []).map((item) => [item.competencia, item])
    );
    const obraRef = {
      id: obraId,
      codigo: responsible.obra?.codigo || null,
      nome: responsible.obra?.nome || `Obra ${obraId}`,
      classificacao: responsible.obra?.classificacao || null
    };
    const planningTarget = janelaPlanejamento(addMonth(current), prazoObra.config).abre_em <= now
      ? addMonth(current)
      : current;
    for (const competencia of listCompetencias(start, planningTarget)) {
      const competency = competencyByKey.get(`${obraId}:${competencia}`) || null;
      const base = {
        user_id: Number(user.id),
        obra_id: obraId,
        obra: obraRef,
        competencia,
        competencia_id: competency?.id ? Number(competency.id) : null,
        reabertura_ativa: Boolean(competency?.id && reopeningByCompetency.has(Number(competency.id)))
      };
      // Planejamento (custos + medicao prevista): janela da obra, cumprido
      // ao finalizar. Mes reaberto para correcao continua cumprido (29/09).
      const complete = ['FINALIZADA', 'REABERTA'].includes(competency?.estado);
      const planningDeadline = janelaPlanejamento(competencia, prazoObra.config).fecha_em;
      const planningState = complete ? 'CUMPRIDA' : (planningDeadline <= now ? 'VENCIDA' : 'PENDENTE');
      for (const type of obligationTypes.filter((item) => item !== OBRIGACAO_TYPES.MEDICAO_APROVADA)) {
        result.push({
          ...base,
          tipo: type,
          prazo_em: planningDeadline,
          situacao: planningState,
          cumprida_em: complete ? (competency.finalizado_em || competency.updatedAt || now) : null
        });
      }
      // Medicao aprovada: so para meses ja iniciados; prazo com dilatacao.
      if (obligationTypes.includes(OBRIGACAO_TYPES.MEDICAO_APROVADA) && competencia <= current) {
        const medicao = medicaoByCompetencia.get(competencia) || null;
        const registered = Boolean(medicao?.tem_medicao_aprovada);
        const measurementDeadline = prazoMedicaoEfetivo(competencia, prazoObra.config, medicao?.dilatacao_prazo);
        result.push({
          ...base,
          tipo: OBRIGACAO_TYPES.MEDICAO_APROVADA,
          prazo_em: measurementDeadline,
          situacao: registered ? 'CUMPRIDA' : (measurementDeadline <= now ? 'VENCIDA' : 'PENDENTE'),
          cumprida_em: registered ? (medicao.medicao_registrada_em || now) : null
        });
      }
    }
  }
  return result;
}

async function persistObligations(expected, deps) {
  if (!expected.length) return;
  await deps.sequelize.transaction(async (transaction) => {
    const competencyByKey = new Map();
    for (const item of expected) {
      const competencyKey = `${item.obra_id}:${item.competencia}`;
      // Obrigacao do mes seguinte (janela ja aberta) nao cria a competencia:
      // o mes nasce pelo "Novo mes", com o snapshot do plano.
      if (!item.competencia_id && !competencyByKey.has(competencyKey)
        && item.competencia <= competenciaAtual(deps.now())) {
        const [record] = await deps.CrCompetencia.findOrCreate({
          where: { obra_id: item.obra_id, competencia: item.competencia },
          defaults: { estado: 'ABERTA' },
          transaction
        });
        competencyByKey.set(competencyKey, Number(record.id));
      }
      item.competencia_id = item.competencia_id || competencyByKey.get(competencyKey) || null;

      const where = {
        user_id: item.user_id,
        obra_id: item.obra_id,
        competencia: item.competencia,
        tipo: item.tipo
      };
      const values = {
        prazo_em: item.prazo_em,
        situacao: item.situacao,
        cumprida_em: item.cumprida_em
      };
      const [existing, created] = await deps.CrObrigacaoUsuario.findOrCreate({
        where,
        defaults: values,
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!created) {
        const current = plain(existing);
        const changed = String(current.situacao) !== String(values.situacao)
          // DATETIME do banco nao guarda milissegundos (prazo termina em
          // 23:59:59.999): comparar em segundos evita regravar a cada leitura.
          || Math.floor(new Date(current.prazo_em).getTime() / 1000)
            !== Math.floor(new Date(values.prazo_em).getTime() / 1000)
          || String(current.cumprida_em || '') !== String(values.cumprida_em || '');
        if (changed) await existing.update(values, { transaction });
      }
      item.id = Number(existing.id);
    }
  });
}

async function findActiveBypasses(userId, deps, now) {
  return deps.CrGuardBypass.findAll({
    where: {
      user_id: Number(userId),
      revogado_em: null,
      expira_em: { [Op.gt]: now }
    },
    include: [
      { model: deps.Obra, as: 'obra', attributes: ['id', 'codigo', 'nome'], required: false },
      { model: deps.User, as: 'concedidoPor', attributes: ['id', 'nome'], required: false }
    ],
    order: [['expira_em', 'ASC']]
  });
}

function bypassCoversObligation(bypass, obligation) {
  const item = plain(bypass);
  return item.obra_id == null || Number(item.obra_id) === Number(obligation.obra_id);
}

async function calcularEstadoGuardUsuario(user, options = {}, overrides = {}) {
  const deps = dependencies(overrides);
  const mode = guardMode(options.mode);
  const enabled = options.moduleEnabled === undefined
    ? await deps.isModuleEnabled(CUSTOS_RECEBIVEIS_MODULE_KEY)
    : Boolean(options.moduleEnabled);
  if (!enabled || !user?.id) {
    return {
      habilitado: enabled,
      modo: mode,
      bloqueado: false,
      pendencia_detectada: false,
      obra_id: null,
      competencia: null,
      motivo: null
    };
  }

  const now = options.now || deps.now();
  const expected = await findExpectedObligations(user, deps, { now });
  if (options.persistir) await persistObligations(expected, deps);
  // Ate a Fase 3 (bloqueio por obra) o guard considera so o planejamento; a
  // medicao aprovada vencida aparece nas obrigacoes, mas nao bloqueia.
  const overdue = expected.filter((item) => (
    item.situacao === 'VENCIDA'
    && !item.reabertura_ativa
    && item.tipo !== OBRIGACAO_TYPES.MEDICAO_APROVADA
  ));
  const bypasses = overdue.length ? await findActiveBypasses(user.id, deps, now) : [];
  const uncovered = overdue.filter((item) => (
    !bypasses.some((bypass) => bypassCoversObligation(bypass, item))
  ));
  const first = uncovered[0] || overdue[0] || null;
  const isAdmin = deps.isSuperadmin(user);
  const shouldBlock = mode === 'enforce' && !isAdmin && uncovered.length > 0;

  return {
    habilitado: true,
    modo: mode,
    bloqueado: shouldBlock,
    pendencia_detectada: overdue.length > 0,
    quantidade_vencidas: overdue.length,
    quantidade_sem_bypass: uncovered.length,
    obra_id: first?.obra_id || null,
    competencia: first?.competencia || null,
    motivo: first
      ? 'Existe planejamento mensal vencido e ainda nao finalizado.'
      : null
  };
}

async function listarMinhasObrigacoes(user, overrides = {}) {
  const deps = dependencies(overrides);
  const now = deps.now();
  const expected = await findExpectedObligations(user, deps, { now });
  await persistObligations(expected, deps);
  const bypasses = await findActiveBypasses(user.id, deps, now);
  const items = expected.map((item) => serializeObligation(item, {
    obra: item.obra,
    now,
    reaberturaAtiva: item.reabertura_ativa
  }));
  const guard = await calcularEstadoGuardUsuario(
    user,
    { now, moduleEnabled: true, persistir: false },
    overrides
  );
  return {
    server_time: now.toISOString(),
    guard,
    resumo: {
      total: items.length,
      pendentes: items.filter((item) => ACTIVE_OBLIGATION_STATES.includes(item.situacao)).length,
      vencidas: items.filter((item) => item.situacao === 'VENCIDA').length,
      cumpridas: items.filter((item) => item.situacao === 'CUMPRIDA').length
    },
    bypasses_ativos: bypasses.map((item) => serializeBypass(item, { now })),
    items
  };
}

function distinctMonths(values) {
  return [...new Set(values
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()))
    .map((value) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`))]
    .sort()
    .reverse();
}

function hasConsecutiveMonths(values) {
  const months = distinctMonths(values);
  if (months.length < 2) return false;
  return months.some((month, index) => index < months.length - 1 && addMonth(month, -1) === months[index + 1]);
}

async function listarBypasses(user, overrides = {}) {
  const deps = dependencies(overrides);
  const now = deps.now();
  const scope = await deps.resolverEscopoObras(user);
  const where = scope.todas
    ? {}
    : { obra_id: { [Op.in]: scope.obraIds } };
  const records = await deps.CrGuardBypass.findAll({
    where,
    include: [
      { model: deps.User, as: 'usuario', attributes: ['id', 'nome', 'email'], required: true },
      { model: deps.User, as: 'concedidoPor', attributes: ['id', 'nome'], required: false },
      { model: deps.Obra, as: 'obra', attributes: ['id', 'codigo', 'nome'], required: false }
    ],
    order: [['concedido_em', 'DESC']]
  });
  const historyByUser = new Map();
  records.forEach((record) => {
    const item = plain(record);
    const list = historyByUser.get(Number(item.user_id)) || [];
    list.push(item.concedido_em);
    historyByUser.set(Number(item.user_id), list);
  });

  const responsibleWhere = {
    ativo: true,
    user_id: { [Op.ne]: Number(user.id) },
    vigencia_inicio: { [Op.lte]: now.toISOString().slice(0, 10) },
    [Op.or]: [
      { vigencia_fim: null },
      { vigencia_fim: { [Op.gte]: now.toISOString().slice(0, 10) } }
    ],
    ...(scope.todas ? {} : { obra_id: { [Op.in]: scope.obraIds } })
  };
  const responsibleRecords = await deps.CrResponsavelObra.findAll({
    where: responsibleWhere,
    include: [
      { model: deps.User, as: 'usuario', attributes: ['id', 'nome', 'email', 'ativo'], where: { ativo: true }, required: true },
      { model: deps.Obra, as: 'obra', attributes: ['id', 'codigo', 'nome', 'ativo'], where: { ativo: true }, required: true }
    ],
    order: [['obra_id', 'ASC'], ['user_id', 'ASC']]
  });
  const eligibleMap = new Map();
  responsibleRecords.forEach((record) => {
    const item = plain(record);
    const key = `${Number(item.user_id)}:${Number(item.obra_id)}`;
    if (!eligibleMap.has(key)) {
      eligibleMap.set(key, {
        user_id: Number(item.user_id),
        usuario: {
          id: Number(item.usuario.id),
          nome: item.usuario.nome,
          email: item.usuario.email || null
        },
        obra_id: Number(item.obra_id),
        obra: {
          id: Number(item.obra.id),
          codigo: item.obra.codigo || null,
          nome: item.obra.nome
        }
      });
    }
  });
  return {
    server_time: now.toISOString(),
    items: records.map((record) => {
      const item = plain(record);
      return serializeBypass(item, {
        now,
        recorrente: hasConsecutiveMonths(historyByUser.get(Number(item.user_id)) || [])
      });
    }),
    usuarios_elegiveis: [...eligibleMap.values()]
  };
}

async function concederBypass(user, payload = {}, idempotencyKey = null, overrides = {}) {
  const deps = dependencies(overrides);
  const targetUserId = positiveId(payload.user_id, 'Usuario');
  const obraId = payload.obra_id == null || payload.obra_id === ''
    ? null
    : positiveId(payload.obra_id, 'Obra');
  const reason = normalizeText(payload.motivo);
  const key = normalizeText(idempotencyKey, 180);
  if (!key) {
    throw createBusinessError(400, 'CR_IDEMPOTENCY_REQUIRED', 'Idempotency-Key e obrigatoria para conceder bypass.');
  }
  if (Number(user?.id) === targetUserId) {
    throw createBusinessError(422, 'CR_BYPASS_SELF_FORBIDDEN', 'Ninguem pode conceder bypass para si mesmo.');
  }
  if (reason.length < 10) {
    throw createBusinessError(422, 'CR_BYPASS_REASON_REQUIRED', 'Informe uma justificativa com pelo menos 10 caracteres.');
  }
  const expiresAt = new Date(payload.expira_em);
  const now = deps.now();
  const maxExpiration = new Date(now.getTime() + (MAX_BYPASS_HOURS * 3600000));
  if (!payload.expira_em || Number.isNaN(expiresAt.getTime()) || expiresAt <= now || expiresAt > maxExpiration) {
    throw createBusinessError(
      422,
      'CR_BYPASS_EXPIRATION_INVALID',
      `A expiracao deve ser futura e limitada a ${MAX_BYPASS_HOURS} horas.`
    );
  }
  const scope = await deps.resolverEscopoObras(user);
  if (!scope.todas && (!obraId || !scope.obraIds.includes(obraId))) {
    throw createBusinessError(403, 'CR_BYPASS_SCOPE_FORBIDDEN', 'Informe uma obra dentro do seu escopo.');
  }

  return deps.sequelize.transaction(async (transaction) => {
    const target = await deps.User.findByPk(targetUserId, {
      attributes: ['id', 'nome', 'email', 'ativo'],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!target || target.ativo === false) {
      throw createBusinessError(404, 'CR_BYPASS_USER_NOT_FOUND', 'Usuario ativo nao encontrado.');
    }
    if (obraId) {
      const responsibility = await deps.CrResponsavelObra.findOne({
        where: { user_id: targetUserId, obra_id: obraId, ativo: true },
        transaction
      });
      if (!responsibility) {
        throw createBusinessError(422, 'CR_BYPASS_RESPONSIBILITY_REQUIRED', 'O usuario nao possui responsabilidade ativa nessa obra.');
      }
    }
    const existing = await deps.CrGuardBypass.findOne({
      where: {
        user_id: targetUserId,
        obra_id: obraId,
        revogado_em: null,
        expira_em: { [Op.gt]: now }
      },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (existing) {
      return { idempotente: true, bypass: serializeBypass(existing, { now }) };
    }
    const record = await deps.CrGuardBypass.create({
      user_id: targetUserId,
      obra_id: obraId,
      motivo: reason,
      concedido_por: Number(user.id),
      concedido_em: now,
      expira_em: expiresAt
    }, { transaction });
    await deps.CrAuditoria.create({
      obra_id: obraId,
      competencia_id: null,
      usuario_id: Number(user.id),
      evento: 'CR_GUARD_BYPASS_CONCEDIDO',
      descricao: 'Bypass temporario de obrigacao concedido.',
      payload_json: {
        bypass_id: Number(record.id),
        user_id: targetUserId,
        motivo: reason,
        expira_em: expiresAt,
        idempotency_key: key
      },
      origem: 'web'
    }, { transaction });
    return { idempotente: false, bypass: serializeBypass(record, { now }) };
  });
}

async function revogarBypass(user, bypassIdValue, idempotencyKey = null, overrides = {}) {
  const deps = dependencies(overrides);
  const bypassId = positiveId(bypassIdValue, 'Bypass');
  const key = normalizeText(idempotencyKey, 180);
  if (!key) {
    throw createBusinessError(400, 'CR_IDEMPOTENCY_REQUIRED', 'Idempotency-Key e obrigatoria para revogar bypass.');
  }
  const scope = await deps.resolverEscopoObras(user);
  return deps.sequelize.transaction(async (transaction) => {
    const record = await deps.CrGuardBypass.findByPk(bypassId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!record) throw createBusinessError(404, 'CR_BYPASS_NOT_FOUND', 'Bypass nao encontrado.');
    if (!scope.todas && (!record.obra_id || !scope.obraIds.includes(Number(record.obra_id)))) {
      throw createBusinessError(403, 'CR_BYPASS_SCOPE_FORBIDDEN', 'Bypass fora do seu escopo.');
    }
    if (record.revogado_em) {
      return { idempotente: true, bypass: serializeBypass(record, { now: deps.now() }) };
    }
    const now = deps.now();
    await record.update({
      revogado_por: Number(user.id),
      revogado_em: now
    }, { transaction });
    await deps.CrAuditoria.create({
      obra_id: record.obra_id || null,
      competencia_id: null,
      usuario_id: Number(user.id),
      evento: 'CR_GUARD_BYPASS_REVOGADO',
      descricao: 'Bypass temporario de obrigacao revogado.',
      payload_json: {
        bypass_id: bypassId,
        user_id: Number(record.user_id),
        idempotency_key: key
      },
      origem: 'web'
    }, { transaction });
    return { idempotente: false, bypass: serializeBypass(record, { now }) };
  });
}

module.exports = {
  ACTIVE_OBLIGATION_STATES,
  MAX_BYPASS_DAYS,
  MAX_BYPASS_HOURS,
  OBRIGACAO_TYPES,
  addMonth,
  alertLevel,
  calcularEstadoGuardUsuario,
  competenciaAtual,
  concederBypass,
  guardMode,
  hasConsecutiveMonths,
  listCompetencias,
  listarBypasses,
  listarMinhasObrigacoes,
  normalizeHolidaySet,
  obligationTypesForWork,
  prazoCompetencia,
  revogarBypass
};
