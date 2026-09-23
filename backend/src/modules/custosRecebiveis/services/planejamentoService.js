'use strict';

const { Op } = require('sequelize');
const db = require('../../../models');
const { createBusinessError } = require('./planoMicroService');
const { resolverEscopoObras } = require('../policies/obraScopePolicy');
const {
  listarMinhasObrigacoes,
  prazoCompetencia
} = require('./obrigacaoService');
const { totalTitulosEmitidosPorCompetencia } = require('./realizadoService');

const VALID_COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;
const CONTRACT_ACTIVE_STATUSES = ['RASCUNHO', 'ATIVO', 'INADIMPLENTE', 'QUITADO'];

function dependencies(overrides = {}) {
  return {
    sequelize: db.sequelize,
    Obra: db.Obra,
    Apropriacao: db.Apropriacao,
    CrPlanoObra: db.CrPlanoObra,
    CrPlanoItem: db.CrPlanoItem,
    CrCompetencia: db.CrCompetencia,
    CrPrevisaoCusto: db.CrPrevisaoCusto,
    CrPrevisaoReceita: db.CrPrevisaoReceita,
    CrMedicaoConsolidada: db.CrMedicaoConsolidada,
    CrRealizado: db.CrRealizado,
    CrReabertura: db.CrReabertura,
    CrAuditoria: db.CrAuditoria,
    ContratoComercial: db.ContratoComercial,
    ContratoComercialParcela: db.ContratoComercialParcela,
    TituloFinanceiro: db.TituloFinanceiro,
    TituloFinanceiroRateio: db.TituloFinanceiroRateio,
    MovimentoFinanceiro: db.MovimentoFinanceiro,
    User: db.User,
    listarMinhasObrigacoes,
    resolverEscopoObras,
    ...overrides
  };
}

function plain(value) {
  return value?.toJSON ? value.toJSON() : { ...(value || {}) };
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value) {
  return Math.round((number(value) + Number.EPSILON) * 100) / 100;
}

function positiveId(value, label = 'Identificador') {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createBusinessError(400, 'CR_INVALID_ID', `${label} invalido.`);
  }
  return parsed;
}

function normalizeCompetencia(value) {
  const normalized = String(value || '').trim();
  if (!VALID_COMPETENCIA.test(normalized)) {
    throw createBusinessError(400, 'CR_COMPETENCIA_INVALIDA', 'Competencia invalida. Use AAAA-MM.');
  }
  return normalized;
}

function monthRange(competencia) {
  const [year, month] = normalizeCompetencia(competencia).split('-').map(Number);
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextMonth = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  return { first, nextMonth };
}

function competenciaAtual(now = new Date()) {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return `${year}-${month}`;
}

function dataAtualSaoPaulo(now = new Date()) {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

function competenciaSeguinte(competencia) {
  const [year, month] = normalizeCompetencia(competencia).split('-').map(Number);
  return month === 12
    ? `${year + 1}-01`
    : `${year}-${String(month + 1).padStart(2, '0')}`;
}

function assertCompetenciaNovoMes(competencia, now = new Date()) {
  const atual = competenciaAtual(now);
  const permitidas = [atual, competenciaSeguinte(atual)];
  if (!permitidas.includes(competencia)) {
    throw createBusinessError(
      422,
      'CR_COMPETENCIA_FORA_JANELA',
      `Novo mes permite somente as competencias ${permitidas.join(' ou ')}.`
    );
  }
  return permitidas;
}

function normalizeText(value, maxLength = 2000) {
  return String(value || '').trim().slice(0, maxLength);
}

function serializeObra(value) {
  const item = plain(value);
  return {
    id: Number(item.id),
    codigo: item.codigo || null,
    nome: item.nome,
    classificacao: item.classificacao || null,
    tipo_centro_custo: item.tipo_centro_custo || null
  };
}

function serializeItem(value) {
  const item = plain(value);
  return {
    id: Number(item.id),
    codigo: item.codigo,
    descricao: item.descricao,
    unidade: item.unidade || null,
    quantidade_orcada: number(item.quantidade),
    custo_unitario_orcado: number(item.custo_unitario),
    valor_orcado: money(item.valor_total),
    etapa_macro_codigo: item.etapa_macro_codigo || null,
    somadora: Boolean(item.somadora),
    ordem: number(item.ordem)
  };
}

function serializeCompetencia(value) {
  if (!value) return null;
  const item = plain(value);
  return {
    id: Number(item.id),
    obra_id: Number(item.obra_id),
    competencia: item.competencia,
    estado: item.estado,
    plano_versao_snapshot: item.plano_versao_snapshot == null
      ? null
      : Number(item.plano_versao_snapshot),
    total_custo_previsto: money(item.total_custo_previsto),
    total_receita_prevista: money(item.total_receita_prevista),
    finalizado_por: item.finalizado_por ? Number(item.finalizado_por) : null,
    finalizado_em: item.finalizado_em || null,
    updatedAt: item.updatedAt || null
  };
}

function isMeaningfulCost(value) {
  const item = plain(value);
  return number(item.quantidade) > 0 || money(item.valor_previsto) !== 0;
}

function isMeaningfulReceipt(value) {
  const item = plain(value);
  return number(item.quantidade_prevista) > 0 || money(item.valor_previsto) !== 0;
}

function isMeaningfulMeasurement(value) {
  const item = plain(value);
  return number(item.quantidade_medida) > 0
    || money(item.valor_medido) !== 0
    || money(item.valor_glosa) !== 0;
}

function serializeReabertura(value) {
  if (!value) return null;
  const item = plain(value);
  return {
    id: Number(item.id),
    competencia_id: Number(item.competencia_id),
    motivo: item.motivo,
    situacao: item.situacao,
    solicitado_por: Number(item.solicitado_por),
    solicitante: item.solicitadoPor
      ? { id: Number(item.solicitadoPor.id), nome: item.solicitadoPor.nome }
      : null,
    aprovado_por: item.aprovado_por ? Number(item.aprovado_por) : null,
    decisor: item.aprovadoPor
      ? { id: Number(item.aprovadoPor.id), nome: item.aprovadoPor.nome }
      : null,
    aprovado_em: item.aprovado_em || null,
    expira_em: item.expira_em || null,
    createdAt: item.createdAt || null
  };
}

function isLeaf(item) {
  return !Boolean(plain(item).somadora);
}

function statusComparativo(previstoValue, realizadoValue) {
  const previsto = money(previstoValue);
  const realizado = money(realizadoValue);
  if (previsto === 0 && realizado === 0) return 'NEUTRO';
  if (previsto === 0 && realizado > 0) return 'SEM_PREVISAO';
  if (previsto > 0 && realizado === 0) return 'A_REALIZAR';
  if (realizado <= previsto) return 'DENTRO';
  return 'ESTOURO';
}

async function findObra(obraId, deps, options = {}) {
  const obra = await deps.Obra.findByPk(obraId, {
    attributes: ['id', 'codigo', 'nome', 'classificacao', 'tipo_centro_custo'],
    transaction: options.transaction,
    lock: options.lock
  });
  if (!obra) throw createBusinessError(404, 'CR_OBRA_NOT_FOUND', 'Obra nao encontrada.');
  return obra;
}

async function findPublishedPlan(obraId, deps, options = {}) {
  const plan = await deps.CrPlanoObra.findOne({
    where: { obra_id: obraId, situacao: 'PUBLICADA' },
    order: [['versao', 'DESC']],
    transaction: options.transaction,
    lock: options.lock
  });
  if (!plan) {
    throw createBusinessError(
      409,
      'CR_PLANO_PUBLICADO_REQUIRED',
      'Publique uma versao da estrutura micro antes de planejar a competencia.'
    );
  }
  return plan;
}

async function findPlanItems(planId, deps, options = {}) {
  const items = await deps.CrPlanoItem.findAll({
    where: { plano_id: planId },
    order: [['ordem', 'ASC'], ['codigo', 'ASC']],
    transaction: options.transaction
  });
  return items.filter(isLeaf);
}

async function findPlanStructure(planId, deps, options = {}) {
  return deps.CrPlanoItem.findAll({
    where: { plano_id: planId },
    order: [['ordem', 'ASC'], ['codigo', 'ASC']],
    transaction: options.transaction
  });
}

function buildPlanMacros(values = []) {
  const items = values.map((value) => plain(value));
  const byCode = new Map(items.map((item) => [String(item.codigo), item]));
  const grouped = new Map();

  items.filter((item) => !Boolean(item.somadora)).forEach((item) => {
    const code = String(item.etapa_macro_codigo || '').trim();
    if (!code) return;
    const macroItem = byCode.get(code);
    const current = grouped.get(code) || {
      codigo: code,
      descricao: macroItem?.descricao || code,
      valor_orcado: 0,
      ordem: number(macroItem?.ordem, number(item.ordem))
    };
    current.valor_orcado = money(current.valor_orcado + number(item.valor_total));
    current.ordem = Math.min(current.ordem, number(macroItem?.ordem, number(item.ordem)));
    grouped.set(code, current);
  });

  if (!grouped.size) {
    items.filter((item) => Boolean(item.somadora) && !item.item_pai_id).forEach((item) => {
      grouped.set(String(item.codigo), {
        codigo: String(item.codigo),
        descricao: item.descricao || item.codigo,
        valor_orcado: money(item.valor_total),
        ordem: number(item.ordem)
      });
    });
  }

  return [...grouped.values()].sort((a, b) => (
    a.ordem - b.ordem || a.codigo.localeCompare(b.codigo)
  ));
}

function serializeMonthlyCost(value, item = null) {
  const cost = plain(value);
  const planItem = item ? serializeItem(item) : null;
  return {
    id: Number(cost.id),
    chave_local: cost.chave_local || null,
    plano_item_id: cost.plano_item_id ? Number(cost.plano_item_id) : null,
    etapa_macro_codigo: cost.etapa_macro_codigo || planItem?.etapa_macro_codigo || null,
    descricao: cost.descricao || planItem?.descricao || 'Subitem sem descricao',
    unidade: cost.unidade || planItem?.unidade || null,
    ordem: number(cost.ordem),
    quantidade: number(cost.quantidade),
    custo_unitario: number(cost.custo_unitario),
    valor_previsto: money(cost.valor_previsto),
    parceiro_id: cost.parceiro_id ? Number(cost.parceiro_id) : null,
    item: planItem
  };
}

function planningReferenceKey(value) {
  const item = plain(value);
  if (item.previsao_custo_id) return `custo:${Number(item.previsao_custo_id)}`;
  if (item.plano_item_id) return `plano:${Number(item.plano_item_id)}`;
  return null;
}

async function findPrivateSources(obraId, competencia, deps, options = {}) {
  const { first, nextMonth } = monthRange(competencia);
  const rows = await deps.ContratoComercialParcela.findAll({
    where: {
      data_vencimento: {
        [Op.gte]: first,
        [Op.lt]: nextMonth
      }
    },
    include: [
      {
        model: deps.ContratoComercial,
        as: 'contrato',
        attributes: ['id', 'numero', 'obra_id', 'status'],
        where: {
          obra_id: obraId,
          status: { [Op.in]: CONTRACT_ACTIVE_STATUSES }
        },
        required: true
      },
      {
        model: deps.TituloFinanceiro,
        as: 'tituloFinanceiro',
        attributes: [
          'id',
          'codigo',
          'descricao',
          'tipo',
          'status',
          'valor_original',
          'data_vencimento'
        ],
        required: false
      }
    ],
    order: [['data_vencimento', 'ASC'], ['id', 'ASC']],
    transaction: options.transaction
  });

  return rows.map((row) => {
    const item = plain(row);
    const titulo = item.tituloFinanceiro ? plain(item.tituloFinanceiro) : null;
    const contrato = plain(item.contrato);
    const linkedTitleIsReceivable = titulo && String(titulo.tipo || '').toUpperCase() === 'RECEBER';
    return {
      key: linkedTitleIsReceivable ? `titulo:${titulo.id}` : `parcela:${item.id}`,
      origem_exibicao: linkedTitleIsReceivable ? 'TITULO' : 'PARCELA_CONTRATUAL',
      contrato_parcela_id: Number(item.id),
      titulo_financeiro_id: linkedTitleIsReceivable ? Number(titulo.id) : null,
      contrato: {
        id: Number(contrato.id),
        numero: contrato.numero
      },
      descricao: linkedTitleIsReceivable
        ? titulo.descricao
        : item.descricao,
      documento: linkedTitleIsReceivable ? titulo.codigo : null,
      status_financeiro: linkedTitleIsReceivable
        ? String(titulo.status || 'ABERTO').toUpperCase()
        : 'PREVISTO_CONTRATO',
      data_prevista: linkedTitleIsReceivable
        ? titulo.data_vencimento
        : item.data_vencimento,
      valor_previsto: money(linkedTitleIsReceivable ? titulo.valor_original : item.valor_original)
    };
  });
}

async function findCompetencia(obraId, competencia, deps, options = {}) {
  return deps.CrCompetencia.findOne({
    where: { obra_id: obraId, competencia },
    transaction: options.transaction,
    lock: options.lock
  });
}

async function findPlanForCompetencia(obraId, competencia, deps, options = {}) {
  const saved = await findCompetencia(obraId, competencia, deps, options);
  if (!saved?.plano_versao_snapshot) {
    return {
      saved,
      plan: await findPublishedPlan(obraId, deps, options)
    };
  }
  const plan = await deps.CrPlanoObra.findOne({
    where: {
      obra_id: obraId,
      versao: saved.plano_versao_snapshot
    },
    transaction: options.transaction,
    lock: options.lock
  });
  if (!plan) {
    throw createBusinessError(
      409,
      'CR_PLANO_SNAPSHOT_NOT_FOUND',
      'A versao do plano vinculada a competencia nao foi encontrada.'
    );
  }
  return { saved, plan };
}

async function getOrCreateCompetencia(obraId, competencia, deps, transaction) {
  let record = await findCompetencia(obraId, competencia, deps, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (record) return record;
  try {
    record = await deps.CrCompetencia.create(
      { obra_id: obraId, competencia, estado: 'ABERTA' },
      { transaction }
    );
  } catch (error) {
    if (error?.name !== 'SequelizeUniqueConstraintError') throw error;
    record = await findCompetencia(obraId, competencia, deps, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
  }
  return record;
}

async function assertEditable(competencia, deps, transaction) {
  if (!competencia) return;
  const expired = prazoCompetencia(competencia.competencia) <= new Date();
  if (competencia.estado === 'FINALIZADA' || expired) {
    const validReopening = await deps.CrReabertura.findOne({
      where: {
        competencia_id: competencia.id,
        situacao: 'APROVADA',
        expira_em: { [Op.gt]: new Date() }
      },
      order: [['aprovado_em', 'DESC']],
      transaction,
      lock: transaction?.LOCK?.UPDATE
    });
    if (validReopening) return;
    throw createBusinessError(
      409,
      expired ? 'CR_COMPETENCIA_VENCIDA' : 'CR_COMPETENCIA_IMUTAVEL',
      expired
        ? 'O prazo da competencia venceu. Solicite e aprove uma reabertura antes de editar.'
        : 'A competencia esta finalizada. Solicite e aprove uma reabertura antes de editar.'
    );
  }
  if (competencia.estado === 'REABERTA') {
    throw createBusinessError(
      409,
      'CR_REABERTURA_EXPIRADA',
      'A janela aprovada de reabertura expirou. Solicite uma nova reabertura.'
    );
  }
}

async function audit(deps, transaction, {
  obraId,
  competenciaId = null,
  userId,
  event,
  description,
  payload = null
}) {
  await deps.CrAuditoria.create({
    obra_id: obraId,
    competencia_id: competenciaId,
    usuario_id: userId || null,
    evento: event,
    descricao: description,
    payload_json: payload,
    origem: 'web'
  }, { transaction });
}

async function assertScope(user, obraId, deps) {
  const scope = await deps.resolverEscopoObras(user);
  if (!scope.todas && !scope.obraIds.includes(obraId)) {
    throw createBusinessError(403, 'CR_OBRA_FORA_ESCOPO', 'Acesso negado para esta obra.');
  }
}

function rateioWeight(value) {
  const item = plain(value);
  const fixed = Math.abs(number(item.valor_rateio));
  if (fixed > 0) return fixed;
  return Math.abs(number(item.percentual));
}

async function totalBaixasFinanceirasPorCompetencia(obraId, competencias, tipo, deps) {
  const months = [...new Set((competencias || []).map(normalizeCompetencia))].sort();
  if (!months.length) return new Map();
  const { first } = monthRange(months[0]);
  const { nextMonth } = monthRange(months[months.length - 1]);
  const workRateios = await deps.TituloFinanceiroRateio.findAll({
    where: { obra_id: obraId },
    attributes: ['titulo_financeiro_id'],
    raw: true
  });
  const rateioTitleIds = [...new Set(workRateios
    .map((item) => Number(item.titulo_financeiro_id))
    .filter((id) => id > 0))];
  const titles = await deps.TituloFinanceiro.findAll({
    where: {
      tipo,
      [Op.or]: [
        { obra_id: obraId },
        ...(rateioTitleIds.length ? [{ id: { [Op.in]: rateioTitleIds } }] : [])
      ]
    },
    attributes: ['id', 'obra_id'],
    include: [
      {
        model: deps.TituloFinanceiroRateio,
        as: 'rateios',
        required: false,
        attributes: ['obra_id', 'valor_rateio', 'percentual']
      },
      {
        model: deps.MovimentoFinanceiro,
        as: 'movimentos',
        required: true,
        attributes: ['id', 'valor', 'valor_quitacao', 'data_movimento'],
        where: {
          status: 'ATIVO',
          tipo_movimento: 'BAIXA',
          data_movimento: { [Op.gte]: first, [Op.lt]: nextMonth }
        }
      }
    ]
  });

  const totals = new Map(months.map((month) => [month, 0]));
  titles.forEach((titleValue) => {
    const title = plain(titleValue);
    const rateios = Array.isArray(title.rateios) ? title.rateios : [];
    const totalWeight = rateios.reduce((sum, item) => sum + rateioWeight(item), 0);
    const workWeight = rateios
      .filter((item) => Number(item.obra_id) === Number(obraId))
      .reduce((sum, item) => sum + rateioWeight(item), 0);
    const factor = rateios.length
      ? (totalWeight > 0 ? workWeight / totalWeight : 0)
      : (Number(title.obra_id) === Number(obraId) ? 1 : 0);
    (title.movimentos || []).forEach((movement) => {
      const month = String(movement.data_movimento || '').slice(0, 7);
      if (!totals.has(month)) return;
      const received = Math.abs(number(movement.valor_quitacao || movement.valor));
      totals.set(month, money(number(totals.get(month)) + (received * factor)));
    });
  });
  return totals;
}

async function listarCompetencias(user, obraIdValue, overrides = {}) {
  const deps = dependencies(overrides);
  const obraId = positiveId(obraIdValue, 'Obra');
  await assertScope(user, obraId, deps);
  const obra = await findObra(obraId, deps);
  const rows = await deps.CrCompetencia.findAll({
    where: { obra_id: obraId },
    order: [['competencia', 'DESC'], ['id', 'DESC']]
  });
  const ids = rows.map((item) => Number(item.id));
  const [measurements, costsByMonth, receivedByMonth, reopenings] = ids.length
    ? await Promise.all([
      deps.CrMedicaoConsolidada.findAll({
        where: { competencia_id: { [Op.in]: ids } }
      }),
      totalTitulosEmitidosPorCompetencia(
        obraId,
        rows.map((item) => item.competencia),
        'PAGAR',
        deps
      ),
      totalBaixasFinanceirasPorCompetencia(
        obraId,
        rows.map((item) => item.competencia),
        'RECEBER',
        deps
      ),
      deps.CrReabertura.findAll({
        where: {
          competencia_id: { [Op.in]: ids },
          situacao: { [Op.in]: ['SOLICITADA', 'APROVADA'] }
        }
      )
    ])
    : [[], new Map(), new Map(), []];
  const measurementByCompetency = new Map();
  const competenciesWithMeasurement = new Set();
  measurements.forEach((item) => measurementByCompetency.set(
    Number(item.competencia_id),
    money(number(measurementByCompetency.get(Number(item.competencia_id)))
      + number(item.valor_medido))
  ));
  measurements.forEach((item) => competenciesWithMeasurement.add(Number(item.competencia_id)));
  const now = new Date();
  const reopeningStateByCompetency = new Map();
  reopenings.forEach((reopeningValue) => {
    const reopening = plain(reopeningValue);
    const competenciaId = Number(reopening.competencia_id);
    if (reopening.situacao === 'SOLICITADA') {
      reopeningStateByCompetency.set(competenciaId, 'SOLICITADA');
      return;
    }
    if (
      !reopeningStateByCompetency.has(competenciaId)
      && reopening.situacao === 'APROVADA'
      && reopening.expira_em
      && new Date(reopening.expira_em) > now
    ) {
      reopeningStateByCompetency.set(competenciaId, 'APROVADA');
    }
  });
  const items = rows.map((rowValue) => {
    const row = plain(rowValue);
    const presented = money(row.total_receita_prevista);
    const approved = money(measurementByCompetency.get(Number(row.id)));
    const hasApprovedMeasurement = competenciesWithMeasurement.has(Number(row.id));
    const reopeningState = reopeningStateByCompetency.get(Number(row.id)) || null;
    return {
      ...serializeCompetencia(row),
      medicao_apresentada: presented,
      medicao_aprovada: hasApprovedMeasurement ? approved : null,
      glosa: hasApprovedMeasurement ? money(Math.max(0, presented - approved)) : null,
      custo_realizado: money(costsByMonth.get(row.competencia)),
      receita_recebida: money(receivedByMonth.get(row.competencia)),
      reabertura_situacao: reopeningState,
      reabertura_permitida: !reopeningState && (
        row.estado === 'FINALIZADA' || prazoCompetencia(row.competencia) <= now
      )
    };
  });
  const atual = competenciaAtual();
  return {
    obra: serializeObra(obra),
    items,
    competencias_permitidas: [atual, competenciaSeguinte(atual)]
  };
}

async function criarCompetencia(
  user,
  obraIdValue,
  payload = {},
  idempotencyKey = null,
  overrides = {}
) {
  const deps = dependencies(overrides);
  const obraId = positiveId(obraIdValue, 'Obra');
  const competenciaCode = normalizeCompetencia(payload.competencia);
  const key = normalizeText(idempotencyKey, 180);
  if (!key) {
    throw createBusinessError(
      400,
      'CR_IDEMPOTENCY_REQUIRED',
      'Idempotency-Key e obrigatoria para criar a competencia.'
    );
  }
  assertCompetenciaNovoMes(competenciaCode);
  await assertScope(user, obraId, deps);

  return deps.sequelize.transaction(async (transaction) => {
    await findObra(obraId, deps, { transaction, lock: transaction.LOCK.UPDATE });
    const existingCompetencia = await findCompetencia(obraId, competenciaCode, deps, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const plan = existingCompetencia?.plano_versao_snapshot
      ? await deps.CrPlanoObra.findOne({
        where: {
          obra_id: obraId,
          versao: existingCompetencia.plano_versao_snapshot
        },
        transaction,
        lock: transaction.LOCK.UPDATE
      })
      : await findPublishedPlan(obraId, deps, {
        transaction,
        lock: transaction.LOCK.UPDATE
      });
    if (!plan) {
      throw createBusinessError(
        409,
        'CR_PLANO_SNAPSHOT_NOT_FOUND',
        'A versao do plano vinculada a competencia nao foi encontrada.'
      );
    }
    if (existingCompetencia) {
      return {
        idempotente: true,
        competencia: serializeCompetencia(existingCompetencia)
      };
    }
    let record;
    try {
      record = await deps.CrCompetencia.create({
        obra_id: obraId,
        competencia: competenciaCode,
        estado: 'ABERTA',
        plano_versao_snapshot: Number(plan.versao)
      }, { transaction });
    } catch (error) {
      if (error?.name !== 'SequelizeUniqueConstraintError') throw error;
      record = await findCompetencia(obraId, competenciaCode, deps, {
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (record) {
        return { idempotente: true, competencia: serializeCompetencia(record) };
      }
      throw error;
    }
    await audit(deps, transaction, {
      obraId,
      competenciaId: record.id,
      userId: user?.id,
      event: 'CR_COMPETENCIA_CRIADA',
      description: 'Competencia mensal criada pelo fluxo Novo mes.',
      payload: {
        competencia: competenciaCode,
        plano_versao_snapshot: Number(plan.versao),
        idempotency_key: key
      }
    });
    return { idempotente: false, competencia: serializeCompetencia(record) };
  });
}

async function pesquisarItensPlano(
  user,
  obraIdValue,
  query = {},
  overrides = {}
) {
  const deps = dependencies(overrides);
  const obraId = positiveId(obraIdValue, 'Obra');
  const competenciaCode = normalizeCompetencia(query.competencia);
  await assertScope(user, obraId, deps);
  const saved = await findCompetencia(obraId, competenciaCode, deps);
  const plan = saved?.plano_versao_snapshot
    ? await deps.CrPlanoObra.findOne({
      where: { obra_id: obraId, versao: saved.plano_versao_snapshot }
    })
    : await findPublishedPlan(obraId, deps);
  if (!plan) {
    throw createBusinessError(409, 'CR_PLANO_SNAPSHOT_NOT_FOUND', 'Plano da competencia nao encontrado.');
  }
  const term = normalizeText(query.q, 120);
  const macroCode = normalizeText(query.etapa_macro_codigo, 80);
  const limit = Math.min(50, Math.max(1, number(query.limit, 20)));
  const page = Math.max(1, Math.floor(number(query.page, 1)));
  const where = {
    plano_id: plan.id,
    somadora: false,
    ...(macroCode ? { etapa_macro_codigo: macroCode } : {})
  };
  if (term) {
    const like = `%${term}%`;
    where[Op.or] = [
      { codigo: { [Op.like]: like } },
      { descricao: { [Op.like]: like } },
      { etapa_macro_codigo: { [Op.like]: like } }
    ];
  }
  const result = await deps.CrPlanoItem.findAndCountAll({
    where,
    order: [['ordem', 'ASC'], ['codigo', 'ASC']],
    limit,
    offset: (page - 1) * limit
  });
  const serialized = result.rows.map(serializeItem);
  const itemIds = serialized.map((item) => item.id);
  const previousCompetencies = await deps.CrCompetencia.findAll({
    where: {
      obra_id: obraId,
      competencia: { [Op.lt]: competenciaCode }
    },
    attributes: ['id']
  });
  const previousIds = previousCompetencies.map((item) => Number(item.id));
  const [receipts, measurements] = itemIds.length && previousIds.length
    ? await Promise.all([
      deps.CrPrevisaoReceita.findAll({
        where: {
          competencia_id: { [Op.in]: previousIds },
          plano_item_id: { [Op.in]: itemIds }
        }
      }),
      deps.CrMedicaoConsolidada.findAll({
        where: {
          competencia_id: { [Op.in]: previousIds },
          plano_item_id: { [Op.in]: itemIds }
        }
      })
    ])
    : [[], []];
  const receiptTotals = new Map();
  receipts.forEach((item) => receiptTotals.set(
    Number(item.plano_item_id),
    number(receiptTotals.get(Number(item.plano_item_id))) + number(item.quantidade_prevista)
  ));
  const measurementTotals = new Map();
  measurements.forEach((item) => measurementTotals.set(
    Number(item.plano_item_id),
    number(measurementTotals.get(Number(item.plano_item_id))) + number(item.quantidade_medida)
  ));
  return {
    items: serialized.map((item) => ({
      ...item,
      quantidade_apresentada_anterior: number(receiptTotals.get(item.id)),
      quantidade_aprovada_anterior: number(measurementTotals.get(item.id))
    })),
    pagination: {
      page,
      limit,
      total: Number(result.count),
      pages: Math.max(1, Math.ceil(Number(result.count) / limit))
    },
    plano: { id: Number(plan.id), versao: Number(plan.versao) }
  };
}

async function obterPlanejamento(user, obraIdValue, competenciaValue, overrides = {}) {
  const deps = dependencies(overrides);
  const obraId = positiveId(obraIdValue, 'Obra');
  const competenciaCode = normalizeCompetencia(competenciaValue);
  await assertScope(user, obraId, deps);
  const [obra, saved] = await Promise.all([
    findObra(obraId, deps),
    findCompetencia(obraId, competenciaCode, deps)
  ]);
  const plan = saved?.plano_versao_snapshot
    ? await deps.CrPlanoObra.findOne({
      where: { obra_id: obraId, versao: saved.plano_versao_snapshot }
    })
    : await findPublishedPlan(obraId, deps);
  if (!plan) {
    throw createBusinessError(
      409,
      'CR_PLANO_SNAPSHOT_NOT_FOUND',
      'A versao do plano vinculada a competencia nao foi encontrada.'
    );
  }
  const planStructure = await findPlanStructure(plan.id, deps);
  const [rawCosts, rawReceipts, rawMeasurements, reopenings, privateSources] = await Promise.all([
    saved
      ? deps.CrPrevisaoCusto.findAll({ where: { competencia_id: saved.id } })
      : [],
    saved
      ? deps.CrPrevisaoReceita.findAll({ where: { competencia_id: saved.id } })
      : [],
    saved
      ? deps.CrMedicaoConsolidada.findAll({ where: { competencia_id: saved.id } })
      : [],
    saved
      ? deps.CrReabertura.findAll({
        where: { competencia_id: saved.id },
        include: [
          { model: deps.User, as: 'solicitadoPor', attributes: ['id', 'nome'], required: false },
          { model: deps.User, as: 'aprovadoPor', attributes: ['id', 'nome'], required: false }
        ],
        order: [['createdAt', 'DESC']]
      })
      : [],
    String(obra.classificacao).toUpperCase() === 'PRIVADA'
      ? findPrivateSources(obraId, competenciaCode, deps)
      : []
  ]);
  const costs = rawCosts.filter(isMeaningfulCost);
  const receipts = rawReceipts.filter((item) => (
    String(obra.classificacao).toUpperCase() === 'PRIVADA' || isMeaningfulReceipt(item)
  ));
  const measurements = rawMeasurements.filter(isMeaningfulMeasurement);
  const selectedItemIds = [...new Set([
    ...costs.map((item) => Number(item.plano_item_id)),
    ...receipts.map((item) => Number(item.plano_item_id)).filter(Boolean),
    ...measurements.map((item) => Number(item.plano_item_id))
  ].filter((itemId) => Number.isInteger(itemId) && itemId > 0))];
  const items = selectedItemIds.length
    ? await deps.CrPlanoItem.findAll({
      where: {
        plano_id: plan.id,
        id: { [Op.in]: selectedItemIds },
        somadora: false
      },
      order: [['ordem', 'ASC'], ['codigo', 'ASC']]
    })
    : [];
  const previousCompetencies = selectedItemIds.length
    ? await deps.CrCompetencia.findAll({
      where: {
        obra_id: obraId,
        competencia: { [Op.lt]: competenciaCode }
      },
      attributes: ['id']
    })
    : [];
  const previousIds = previousCompetencies.map((item) => Number(item.id));
  const [previousReceipts, previousMeasurements] = previousIds.length
    ? await Promise.all([
      deps.CrPrevisaoReceita.findAll({
        where: {
          competencia_id: { [Op.in]: previousIds },
          plano_item_id: { [Op.in]: selectedItemIds }
        }
      }),
      deps.CrMedicaoConsolidada.findAll({
        where: {
          competencia_id: { [Op.in]: previousIds },
          plano_item_id: { [Op.in]: selectedItemIds }
        }
      })
    ])
    : [[], []];
  const previousReceiptByItem = new Map();
  previousReceipts.forEach((item) => previousReceiptByItem.set(
    Number(item.plano_item_id),
    number(previousReceiptByItem.get(Number(item.plano_item_id)))
      + number(item.quantidade_prevista)
  ));
  const previousMeasurementByItem = new Map();
  previousMeasurements.forEach((item) => previousMeasurementByItem.set(
    Number(item.plano_item_id),
    number(previousMeasurementByItem.get(Number(item.plano_item_id)))
      + number(item.quantidade_medida)
  ));
  const serializePlanningItem = (value) => {
    const item = serializeItem(value);
    return {
      ...item,
      quantidade_apresentada_anterior: number(previousReceiptByItem.get(item.id)),
      quantidade_aprovada_anterior: number(previousMeasurementByItem.get(item.id))
    };
  };

  const itemById = new Map(items.map((value) => [Number(value.id), value]));
  const serializedCosts = costs
    .map((value) => serializeMonthlyCost(value, itemById.get(Number(value.plano_item_id))))
    .sort((a, b) => (
      a.ordem - b.ordem
      || a.id - b.id
    ));
  const costById = new Map(serializedCosts.map((value) => [Number(value.id), value]));
  const receiptByPrivateSource = new Map(receipts.map((value) => {
    const item = plain(value);
    const key = item.titulo_financeiro_id
      ? `titulo:${item.titulo_financeiro_id}`
      : `parcela:${item.contrato_parcela_id}`;
    return [key, item];
  }));
  const validReopening = reopenings.some((item) => (
    item.situacao === 'APROVADA' && item.expira_em && new Date(item.expira_em) > new Date()
  ));
  const expired = prazoCompetencia(competenciaCode) <= new Date();

  const publicReceipts = receipts.map((savedValue) => {
    const savedReceipt = plain(savedValue);
    const cost = savedReceipt.previsao_custo_id
      ? costById.get(Number(savedReceipt.previsao_custo_id))
      : null;
    const planItemValue = savedReceipt.plano_item_id
      ? itemById.get(Number(savedReceipt.plano_item_id))
      : null;
    const item = planItemValue ? serializePlanningItem(planItemValue) : null;
    return {
      id: Number(savedReceipt.id),
      previsao_custo_id: cost?.id || null,
      plano_item_id: item?.id || null,
      etapa_macro_codigo: cost?.etapa_macro_codigo || item?.etapa_macro_codigo || null,
      descricao: cost?.descricao || item?.descricao || 'Subitem sem descricao',
      unidade: cost?.unidade || item?.unidade || null,
      quantidade_base: cost?.quantidade ?? item?.quantidade_orcada ?? 0,
      custo_unitario: cost?.custo_unitario ?? item?.custo_unitario_orcado ?? 0,
      valor_base: cost?.valor_previsto ?? item?.valor_orcado ?? 0,
      item,
      quantidade_prevista: number(savedReceipt.quantidade_prevista),
      valor_previsto: money(savedReceipt.valor_previsto),
      data_prevista: savedReceipt.data_prevista || null
    };
  });

  return {
    obra: serializeObra(obra),
    plano: {
      id: Number(plan.id),
      versao: Number(plan.versao),
      total_micro: money(plan.total_micro)
    },
    macros: buildPlanMacros(planStructure),
    competencia: saved
      ? serializeCompetencia(saved)
      : {
        id: null,
        obra_id: obraId,
        competencia: competenciaCode,
        estado: 'ABERTA',
        plano_versao_snapshot: null,
        total_custo_previsto: 0,
        total_receita_prevista: 0,
        finalizado_por: null,
        finalizado_em: null
      },
    custos: serializedCosts,
    recebiveis: String(obra.classificacao).toUpperCase() === 'PUBLICA'
      ? publicReceipts
      : privateSources.map((source) => ({
        ...source,
        automatico: true,
        registrado_competencia: receiptByPrivateSource.has(source.key),
        valor_previsto: money(
          receiptByPrivateSource.get(source.key)?.valor_previsto ?? source.valor_previsto
        )
      })),
    medicoes: String(obra.classificacao).toUpperCase() === 'PUBLICA'
      ? measurements.map((savedValue) => {
        const savedMeasurement = plain(savedValue);
        const cost = savedMeasurement.previsao_custo_id
          ? costById.get(Number(savedMeasurement.previsao_custo_id))
          : null;
        const planItemValue = savedMeasurement.plano_item_id
          ? itemById.get(Number(savedMeasurement.plano_item_id))
          : null;
        const item = planItemValue ? serializePlanningItem(planItemValue) : null;
        return {
          previsao_custo_id: cost?.id || null,
          plano_item_id: item?.id || null,
          etapa_macro_codigo: cost?.etapa_macro_codigo || item?.etapa_macro_codigo || null,
          descricao: cost?.descricao || item?.descricao || 'Subitem sem descricao',
          unidade: cost?.unidade || item?.unidade || null,
          quantidade_base: cost?.quantidade ?? item?.quantidade_orcada ?? 0,
          custo_unitario: cost?.custo_unitario ?? item?.custo_unitario_orcado ?? 0,
          valor_base: cost?.valor_previsto ?? item?.valor_orcado ?? 0,
          item,
          quantidade_medida: number(savedMeasurement.quantidade_medida),
          valor_medido: money(savedMeasurement.valor_medido),
          valor_glosa: money(savedMeasurement.valor_glosa),
          justificativa_glosa: savedMeasurement.justificativa_glosa || null,
          data_medicao: savedMeasurement.data_medicao || null,
          numero_medicao: savedMeasurement.numero_medicao || null
        };
      })
      : [],
    reaberturas: reopenings.map(serializeReabertura),
    regras: {
      exige_medicao: String(obra.classificacao).toUpperCase() === 'PUBLICA',
      recebivel_origem: String(obra.classificacao).toUpperCase() === 'PUBLICA'
        ? 'MEDICAO'
        : 'CONTRATO',
      vencida: expired,
      exige_reabertura: Boolean((
        saved?.estado === 'FINALIZADA'
        || expired
        || saved?.estado === 'REABERTA'
      ) && !validReopening),
      editavel: ((!saved && !expired) || (
        saved
        &&
        saved.estado !== 'FINALIZADA'
        && saved.estado !== 'REABERTA'
        && !expired
      )) || validReopening
    }
  };
}

function validateCostRows(rows, allowedItems) {
  if (!Array.isArray(rows)) {
    throw createBusinessError(400, 'CR_CUSTOS_INVALIDOS', 'Informe a lista de custos planejados.');
  }
  const seen = new Set();
  return rows.map((row, index) => {
    const recordId = row?.id ? positiveId(row.id, `Custo da linha ${index + 1}`) : null;
    const itemId = row?.plano_item_id
      ? positiveId(row.plano_item_id, `Item da linha ${index + 1}`)
      : null;
    const planItem = itemId ? allowedItems.get(itemId) : null;
    // Custos mensais novos sao linhas gerais e nao dependem da estrutura macro.
    // O codigo antigo e preservado somente ao editar um registro legado ou um
    // item explicitamente vinculado ao plano, evitando apagar historico.
    const macroCode = normalizeText(
      planItem?.etapa_macro_codigo || (recordId ? row?.etapa_macro_codigo : null),
      80
    );
    const localKey = normalizeText(row?.chave_local, 80);
    const identity = recordId
      ? `id:${recordId}`
      : (itemId ? `plano:${itemId}` : `chave:${localKey}`);
    if (
      (itemId && !planItem)
      || (!itemId && !recordId && !localKey)
      || seen.has(identity)
    ) {
      throw createBusinessError(
        400,
        'CR_CUSTO_ITEM_INVALIDO',
        `Subitem invalido ou duplicado na linha ${index + 1}.`
      );
    }
    seen.add(identity);
    const description = normalizeText(row?.descricao || planItem?.descricao, 500);
    const unit = normalizeText(row?.unidade || planItem?.unidade, 30);
    const quantidade = number(row.quantidade, NaN);
    const unitCost = number(row.custo_unitario, NaN);
    if (
      description.length < 2
      || !unit
      || !Number.isFinite(quantidade)
      || quantidade <= 0
      || !Number.isFinite(unitCost)
      || unitCost < 0
    ) {
      throw createBusinessError(
        400,
        'CR_CUSTO_VALOR_INVALIDO',
        `Informe descricao, unidade, quantidade positiva e valor unitario valido na linha ${index + 1}.`
      );
    }
    return {
      id: recordId,
      plano_item_id: itemId,
      etapa_macro_codigo: macroCode || null,
      descricao: description,
      unidade: unit,
      ordem: Number.isInteger(Number(row.ordem)) ? Number(row.ordem) : index + 1,
      chave_local: itemId ? null : localKey,
      quantidade,
      custo_unitario: unitCost,
      valor_previsto: money(quantidade * unitCost),
      parceiro_id: row.parceiro_id ? positiveId(row.parceiro_id, 'Parceiro') : null
    };
  });
}

async function salvarCustos(user, obraIdValue, competenciaValue, payload = {}, overrides = {}) {
  const deps = dependencies(overrides);
  const obraId = positiveId(obraIdValue, 'Obra');
  const competenciaCode = normalizeCompetencia(competenciaValue);
  await assertScope(user, obraId, deps);

  return deps.sequelize.transaction(async (transaction) => {
    await findObra(obraId, deps, { transaction, lock: transaction.LOCK.UPDATE });
    const { saved, plan } = await findPlanForCompetencia(obraId, competenciaCode, deps, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const structure = await findPlanStructure(plan.id, deps, { transaction });
    const allowed = new Map(
      structure.filter(isLeaf).map((item) => [Number(item.id), plain(item)])
    );
    const rows = validateCostRows(payload.itens, allowed);
    const competencia = saved
      || await getOrCreateCompetencia(obraId, competenciaCode, deps, transaction);
    await assertEditable(competencia, deps, transaction);
    const existingRows = await deps.CrPrevisaoCusto.findAll({
      where: { competencia_id: competencia.id },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const existingById = new Map(existingRows.map((item) => [Number(item.id), item]));
    const existingByKey = new Map(existingRows
      .filter((item) => item.chave_local)
      .map((item) => [String(item.chave_local), item]));
    const keptIds = [];
    for (const row of rows) {
      const existing = (row.id ? existingById.get(row.id) : null)
        || (row.chave_local ? existingByKey.get(row.chave_local) : null);
      if (row.id && !existing) {
        throw createBusinessError(
          409,
          'CR_CUSTO_DESATUALIZADO',
          `O subitem ${row.id} nao pertence mais a esta competencia. Atualize a tela.`
        );
      }
      const values = { ...row };
      delete values.id;
      if (existing) {
        await existing.update(values, { transaction });
        keptIds.push(Number(existing.id));
      } else {
        const created = await deps.CrPrevisaoCusto.create({
          ...values,
          competencia_id: competencia.id
        }, { transaction });
        keptIds.push(Number(created.id));
      }
    }
    await deps.CrPrevisaoCusto.destroy({
      where: {
        competencia_id: competencia.id,
        ...(keptIds.length ? { id: { [Op.notIn]: keptIds } } : {})
      },
      transaction
    });
    const total = money(rows.reduce((sum, row) => sum + row.valor_previsto, 0));
    await competencia.update({
      estado: competencia.estado === 'REABERTA' ? 'REABERTA' : 'EM_PREENCHIMENTO',
      total_custo_previsto: total
    }, { transaction });
    await audit(deps, transaction, {
      obraId,
      competenciaId: competencia.id,
      userId: user?.id,
      event: 'CR_PLANEJAMENTO_CUSTOS_SALVO',
      description: 'Custos planejados da competencia atualizados.',
      payload: { competencia: competenciaCode, quantidade_itens: rows.length, total }
    });
    return { competencia: serializeCompetencia(competencia), total };
  });
}

function validatePublicReceiptRows(
  rows,
  allowedItems,
  allowedCosts = new Map(),
  previousQuantities = new Map()
) {
  if (!Array.isArray(rows)) {
    throw createBusinessError(400, 'CR_RECEBIVEIS_INVALIDOS', 'Informe a lista de recebiveis.');
  }
  const seen = new Set();
  return rows.map((row, index) => {
    const costId = row?.previsao_custo_id
      ? positiveId(row.previsao_custo_id, `Subitem da linha ${index + 1}`)
      : null;
    const itemId = row?.plano_item_id
      ? positiveId(row.plano_item_id, `Item da linha ${index + 1}`)
      : null;
    const cost = costId ? allowedCosts.get(costId) : null;
    const planItem = itemId ? allowedItems.get(itemId) : null;
    const identity = costId ? `custo:${costId}` : `plano:${itemId}`;
    if ((!cost && !planItem) || seen.has(identity)) {
      throw createBusinessError(
        400,
        'CR_RECEBIVEL_ITEM_INVALIDO',
        `Subitem invalido ou duplicado na linha ${index + 1}.`
      );
    }
    seen.add(identity);
    const quantity = number(row.quantidade_prevista, NaN);
    if (!Number.isFinite(quantity) || quantity < 0) {
      throw createBusinessError(
        400,
        'CR_RECEBIVEL_VALOR_INVALIDO',
        `Quantidade prevista invalida na linha ${index + 1}.`
      );
    }
    const baseQuantity = cost ? number(cost.quantidade) : number(planItem.quantidade);
    const accumulated = cost
      ? quantity
      : number(previousQuantities.get(itemId)) + quantity;
    if (accumulated > baseQuantity + 0.0001) {
      throw createBusinessError(
        422,
        'CR_MEDICAO_SUPERA_ORCAMENTO',
        `A quantidade acumulada supera o orcamento na linha ${index + 1}.`
      );
    }
    return {
      origem: 'MEDICAO',
      plano_item_id: itemId,
      previsao_custo_id: costId,
      contrato_parcela_id: null,
      titulo_financeiro_id: null,
      quantidade_prevista: quantity,
      valor_previsto: money(quantity * number(cost?.custo_unitario ?? planItem?.custo_unitario)),
      data_prevista: row.data_prevista || null
    };
  }).filter(isMeaningfulReceipt);
}

async function buildPrivateReceiptRows(obraId, competencia, rows, deps, transaction) {
  const sources = await findPrivateSources(obraId, competencia, deps, { transaction });
  const allowed = new Map(sources.map((source) => [source.key, source]));
  const requestedRows = Array.isArray(rows)
    ? rows
    : sources.map((source) => ({ key: source.key }));
  const seen = new Set();
  return requestedRows.map((row, index) => {
    const sourceKey = normalizeText(row?.key, 100);
    const source = allowed.get(sourceKey);
    if (!source || seen.has(sourceKey)) {
      throw createBusinessError(
        400,
        'CR_RECEBIVEL_ORIGEM_INVALIDA',
        `Origem contratual invalida ou duplicada na linha ${index + 1}.`
      );
    }
    seen.add(sourceKey);
    return {
      origem: 'CONTRATO',
      plano_item_id: null,
      previsao_custo_id: null,
      contrato_parcela_id: source.contrato_parcela_id,
      titulo_financeiro_id: source.titulo_financeiro_id,
      quantidade_prevista: null,
      valor_previsto: source.valor_previsto,
      data_prevista: source.data_prevista
    };
  });
}

async function salvarRecebiveis(user, obraIdValue, competenciaValue, payload = {}, overrides = {}) {
  const deps = dependencies(overrides);
  const obraId = positiveId(obraIdValue, 'Obra');
  const competenciaCode = normalizeCompetencia(competenciaValue);
  await assertScope(user, obraId, deps);

  return deps.sequelize.transaction(async (transaction) => {
    const obra = await findObra(obraId, deps, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const { saved, plan } = await findPlanForCompetencia(obraId, competenciaCode, deps, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const items = await findPlanItems(plan.id, deps, { transaction });
    const allowed = new Map(items.map((item) => [Number(item.id), plain(item)]));
    const isPublic = String(obra.classificacao).toUpperCase() === 'PUBLICA';
    const previousQuantities = new Map();
    if (isPublic) {
      const previousCompetencies = await deps.CrCompetencia.findAll({
        where: {
          obra_id: obraId,
          competencia: { [Op.lt]: competenciaCode }
        },
        attributes: ['id'],
        transaction
      });
      const previousIds = previousCompetencies.map((item) => Number(item.id));
      const previousMeasurements = previousIds.length
        ? await deps.CrMedicaoConsolidada.findAll({
          where: {
            competencia_id: { [Op.in]: previousIds },
            plano_item_id: { [Op.ne]: null }
          },
          transaction
        })
        : [];
      previousMeasurements.forEach((item) => previousQuantities.set(
        Number(item.plano_item_id),
        number(previousQuantities.get(Number(item.plano_item_id)))
          + number(item.quantidade_medida)
      ));
    }
    const currentCosts = isPublic && saved
      ? await deps.CrPrevisaoCusto.findAll({
        where: { competencia_id: saved.id },
        transaction,
        lock: transaction.LOCK.UPDATE
      })
      : [];
    const allowedCosts = new Map(currentCosts.map((item) => [Number(item.id), plain(item)]));
    const rows = isPublic
      ? validatePublicReceiptRows(payload.itens, allowed, allowedCosts, previousQuantities)
      : await buildPrivateReceiptRows(
        obraId,
        competenciaCode,
        null,
        deps,
        transaction
      );
    const competencia = saved
      || await getOrCreateCompetencia(obraId, competenciaCode, deps, transaction);
    await assertEditable(competencia, deps, transaction);

    await deps.CrPrevisaoReceita.destroy({
      where: { competencia_id: competencia.id },
      transaction
    });
    if (rows.length) {
      await deps.CrPrevisaoReceita.bulkCreate(
        rows.map((row) => ({ ...row, competencia_id: competencia.id })),
        { transaction, validate: true }
      );
    }
    const total = money(rows.reduce((sum, row) => sum + row.valor_previsto, 0));
    await competencia.update({
      estado: competencia.estado === 'REABERTA' ? 'REABERTA' : 'EM_PREENCHIMENTO',
      total_receita_prevista: total
    }, { transaction });
    await audit(deps, transaction, {
      obraId,
      competenciaId: competencia.id,
      userId: user?.id,
      event: 'CR_PLANEJAMENTO_RECEBIVEIS_SALVO',
      description: isPublic
        ? 'Medicao prevista da competencia atualizada.'
        : 'Recebiveis privados sincronizados automaticamente com as fontes oficiais.',
      payload: {
        competencia: competenciaCode,
        classificacao_obra: obra.classificacao,
        quantidade_itens: rows.length,
        total
      }
    });
    return { competencia: serializeCompetencia(competencia), total };
  });
}

async function finalizarCompetencia(
  user,
  obraIdValue,
  competenciaValue,
  payload = {},
  idempotencyKey = null,
  overrides = {}
) {
  const deps = dependencies(overrides);
  const obraId = positiveId(obraIdValue, 'Obra');
  const competenciaCode = normalizeCompetencia(competenciaValue);
  const key = normalizeText(idempotencyKey, 180);
  if (!key) {
    throw createBusinessError(
      400,
      'CR_IDEMPOTENCY_REQUIRED',
      'Idempotency-Key e obrigatoria para finalizar a competencia.'
    );
  }
  await assertScope(user, obraId, deps);

  return deps.sequelize.transaction(async (transaction) => {
    const obra = await findObra(obraId, deps, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const plan = await findPublishedPlan(obraId, deps, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const competencia = await getOrCreateCompetencia(obraId, competenciaCode, deps, transaction);
    if (competencia.estado === 'FINALIZADA') {
      return { idempotente: true, competencia: serializeCompetencia(competencia) };
    }
    await assertEditable(competencia, deps, transaction);
    if (String(obra.classificacao).toUpperCase() === 'PRIVADA') {
      const automaticReceipts = await buildPrivateReceiptRows(
        obraId,
        competenciaCode,
        null,
        deps,
        transaction
      );
      await deps.CrPrevisaoReceita.destroy({
        where: { competencia_id: competencia.id },
        transaction
      });
      if (automaticReceipts.length) {
        await deps.CrPrevisaoReceita.bulkCreate(
          automaticReceipts.map((row) => ({
            ...row,
            competencia_id: competencia.id
          })),
          { transaction, validate: true }
        );
      }
    }
    const [costs, receipts] = await Promise.all([
      deps.CrPrevisaoCusto.findAll({
        where: { competencia_id: competencia.id },
        transaction,
        lock: transaction.LOCK.UPDATE
      }),
      deps.CrPrevisaoReceita.findAll({
        where: { competencia_id: competencia.id },
        transaction,
        lock: transaction.LOCK.UPDATE
      })
    ]);
    const totalCosts = money(costs.reduce((sum, row) => sum + number(row.valor_previsto), 0));
    const totalReceipts = money(
      receipts.reduce((sum, row) => sum + number(row.valor_previsto), 0)
    );
    if (totalCosts === 0 && !normalizeText(payload.justificativa_sem_custos)) {
      throw createBusinessError(
        422,
        'CR_JUSTIFICATIVA_CUSTOS_REQUIRED',
        'Informe a justificativa para finalizar sem custos planejados.'
      );
    }
    if (totalReceipts === 0 && !normalizeText(payload.justificativa_sem_receitas)) {
      throw createBusinessError(
        422,
        'CR_JUSTIFICATIVA_RECEITAS_REQUIRED',
        'Informe a justificativa para finalizar sem recebiveis previstos.'
      );
    }
    await competencia.update({
      estado: 'FINALIZADA',
      plano_versao_snapshot: competencia.plano_versao_snapshot || plan.versao,
      finalizado_por: user?.id || null,
      finalizado_em: new Date(),
      total_custo_previsto: totalCosts,
      total_receita_prevista: totalReceipts
    }, { transaction });
    await audit(deps, transaction, {
      obraId,
      competenciaId: competencia.id,
      userId: user?.id,
      event: 'CR_COMPETENCIA_FINALIZADA',
      description: 'Competencia finalizada e congelada para edicao.',
      payload: {
        competencia: competenciaCode,
        classificacao_obra: obra.classificacao,
        recebiveis_automaticos: String(obra.classificacao).toUpperCase() === 'PRIVADA',
        idempotency_key: key,
        plano_versao_snapshot: Number(competencia.plano_versao_snapshot),
        total_custo_previsto: totalCosts,
        total_receita_prevista: totalReceipts,
        justificativa_sem_custos: normalizeText(payload.justificativa_sem_custos) || null,
        justificativa_sem_receitas: normalizeText(payload.justificativa_sem_receitas) || null
      }
    });
    return { idempotente: false, competencia: serializeCompetencia(competencia) };
  });
}

async function consolidarMedicao(user, obraIdValue, competenciaValue, payload = {}, overrides = {}) {
  const deps = dependencies(overrides);
  const obraId = positiveId(obraIdValue, 'Obra');
  const competenciaCode = normalizeCompetencia(competenciaValue);
  await assertScope(user, obraId, deps);

  return deps.sequelize.transaction(async (transaction) => {
    const obra = await findObra(obraId, deps, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (String(obra.classificacao).toUpperCase() !== 'PUBLICA') {
      throw createBusinessError(
        409,
        'CR_MEDICAO_APENAS_OBRA_PUBLICA',
        'Obras privadas usam recebiveis contratuais e nao possuem medicao.'
      );
    }
    const idempotencyKey = normalizeText(payload.idempotency_key, 180);
    if (!idempotencyKey) {
      throw createBusinessError(
        400,
        'CR_IDEMPOTENCY_REQUIRED',
        'Idempotency-Key e obrigatoria para registrar a medicao aprovada.'
      );
    }
    const existingCompetencia = await findCompetencia(obraId, competenciaCode, deps, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const plan = existingCompetencia?.plano_versao_snapshot
      ? await deps.CrPlanoObra.findOne({
        where: {
          obra_id: obraId,
          versao: existingCompetencia.plano_versao_snapshot
        },
        transaction,
        lock: transaction.LOCK.UPDATE
      })
      : await findPublishedPlan(obraId, deps, {
        transaction,
        lock: transaction.LOCK.UPDATE
      });
    if (!plan) {
      throw createBusinessError(
        409,
        'CR_PLANO_SNAPSHOT_NOT_FOUND',
        'A versao do plano vinculada a competencia nao foi encontrada.'
      );
    }
    const items = await findPlanItems(plan.id, deps, { transaction });
    const allowed = new Map(items.map((item) => [Number(item.id), plain(item)]));
    const previousCompetencies = await deps.CrCompetencia.findAll({
      where: {
        obra_id: obraId,
        competencia: { [Op.lt]: competenciaCode }
      },
      attributes: ['id'],
      transaction
    });
    const previousIds = previousCompetencies.map((item) => Number(item.id));
    const previousMeasurements = previousIds.length
      ? await deps.CrMedicaoConsolidada.findAll({
        where: {
          competencia_id: { [Op.in]: previousIds },
          plano_item_id: { [Op.ne]: null }
        },
        transaction
      })
      : [];
    const previousApprovedByItem = new Map();
    previousMeasurements.forEach((item) => previousApprovedByItem.set(
      Number(item.plano_item_id),
      number(previousApprovedByItem.get(Number(item.plano_item_id)))
        + number(item.quantidade_medida)
    ));
    if (!Array.isArray(payload.itens)) {
      throw createBusinessError(400, 'CR_MEDICAO_INVALIDA', 'Informe os itens da medicao.');
    }
    const competencia = existingCompetencia
      || await getOrCreateCompetencia(obraId, competenciaCode, deps, transaction);
    const previousAudit = await deps.CrAuditoria.findOne({
      where: {
        obra_id: obraId,
        competencia_id: competencia.id,
        evento: 'CR_MEDICAO_CONSOLIDADA'
      },
      order: [['criado_em', 'DESC']],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const previousPayloadRaw = plain(previousAudit).payload_json;
    let previousPayload = previousPayloadRaw || {};
    if (typeof previousPayloadRaw === 'string') {
      try {
        previousPayload = JSON.parse(previousPayloadRaw);
      } catch {
        previousPayload = {};
      }
    }
    if (previousPayload.idempotency_key === idempotencyKey) {
      return {
        idempotente: true,
        competencia: serializeCompetencia(competencia),
        quantidade_itens: number(previousPayload.quantidade_itens),
        valor_total: money(previousPayload.valor_total),
        valor_glosa: money(previousPayload.valor_glosa)
      };
    }
    const presentedRows = await deps.CrPrevisaoReceita.findAll({
      where: {
        competencia_id: competencia.id,
        origem: 'MEDICAO'
      },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const monthlyCosts = await deps.CrPrevisaoCusto.findAll({
      where: { competencia_id: competencia.id },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const costById = new Map(monthlyCosts.map((item) => [Number(item.id), plain(item)]));
    const presentedByReference = new Map(
      presentedRows.map((item) => [planningReferenceKey(item), plain(item)])
    );
    const seen = new Set();
    const rows = payload.itens.map((row, index) => {
      const costId = row?.previsao_custo_id
        ? positiveId(row.previsao_custo_id, `Subitem da linha ${index + 1}`)
        : null;
      const itemId = row?.plano_item_id
        ? positiveId(row.plano_item_id, `Item da linha ${index + 1}`)
        : null;
      const cost = costId ? costById.get(costId) : null;
      const item = itemId ? allowed.get(itemId) : null;
      const reference = costId ? `custo:${costId}` : `plano:${itemId}`;
      const quantity = number(row.quantidade_medida, NaN);
      const presented = presentedByReference.get(reference);
      if ((!cost && !item) || seen.has(reference) || !Number.isFinite(quantity) || quantity < 0) {
        throw createBusinessError(
          400,
          'CR_MEDICAO_ITEM_INVALIDO',
          `Item ou quantidade invalida na linha ${index + 1}.`
        );
      }
      seen.add(reference);
      const baseQuantity = number(cost?.quantidade ?? item?.quantidade);
      const previousApproved = itemId ? number(previousApprovedByItem.get(itemId)) : 0;
      const approvedValue = money(
        quantity * number(cost?.custo_unitario ?? item?.custo_unitario)
      );
      if (
        quantity + previousApproved > baseQuantity + 0.0001
        || !Number.isFinite(approvedValue)
        || approvedValue < 0
      ) {
        throw createBusinessError(
          422,
          'CR_MEDICAO_SUPERA_ORCAMENTO',
          `A quantidade aprovada acumulada supera a quantidade orcada na linha ${index + 1}.`
        );
      }
      const glosa = money(Math.max(0, money(presented?.valor_previsto) - approvedValue));
      return {
        plano_item_id: itemId,
        previsao_custo_id: costId,
        quantidade_medida: quantity,
        valor_medido: approvedValue,
        valor_glosa: glosa,
        justificativa_glosa: normalizeText(row.justificativa_glosa) || null,
        data_medicao: row.data_medicao || null,
        numero_medicao: normalizeText(row.numero_medicao, 80) || null,
        registrado_por: user?.id
      };
    }).filter(isMeaningfulMeasurement);
    const predictedTotal = money(
      presentedRows.reduce((sum, row) => sum + number(row.valor_previsto), 0)
    );
    const approvedTotal = money(rows.reduce((sum, row) => sum + row.valor_medido, 0));
    const overallGlosa = money(Math.max(0, predictedTotal - approvedTotal));
    const generalGlosaReason = normalizeText(payload.justificativa_glosa_geral);
    if (overallGlosa > 0 && generalGlosaReason.length < 5) {
      throw createBusinessError(
        422,
        'CR_GLOSA_JUSTIFICATIVA_REQUIRED',
        'Informe a justificativa da diferença entre a medicao prevista e a aprovada.'
      );
    }
    if (generalGlosaReason) {
      rows.forEach((row) => {
        row.justificativa_glosa = generalGlosaReason;
      });
    }
    await deps.CrMedicaoConsolidada.destroy({
      where: { competencia_id: competencia.id },
      transaction
    });
    if (rows.length) {
      await deps.CrMedicaoConsolidada.bulkCreate(
        rows.map((row) => ({ ...row, competencia_id: competencia.id })),
        { transaction, validate: true }
      );
    }
    await audit(deps, transaction, {
      obraId,
      competenciaId: competencia.id,
      userId: user?.id,
      event: 'CR_MEDICAO_CONSOLIDADA',
      description: 'Medicao da competencia consolidada.',
      payload: {
        competencia: competenciaCode,
        quantidade_itens: rows.length,
        valor_total: approvedTotal,
        valor_glosa: overallGlosa,
        justificativa_glosa_geral: generalGlosaReason || null,
        idempotency_key: idempotencyKey
      }
    });
    return {
      idempotente: false,
      competencia: serializeCompetencia(competencia),
      quantidade_itens: rows.length,
      valor_total: approvedTotal,
      valor_glosa: overallGlosa
    };
  });
}

async function buildComparison(obraId, competenciaCode, deps) {
  const { saved: competencia, plan } = await findPlanForCompetencia(
    obraId,
    competenciaCode,
    deps
  );
  const items = await findPlanItems(plan.id, deps);
  const [costs, actuals, presentedRows, approvedRows, receivedByMonth] = await Promise.all([
    competencia
      ? deps.CrPrevisaoCusto.findAll({ where: { competencia_id: competencia.id } })
      : [],
    competencia
      ? deps.CrRealizado.findAll({
        where: {
          competencia_id: competencia.id,
          valor: { [Op.ne]: 0 },
          estado: { [Op.in]: ['BAIXA_ATIVA', 'NAO_MAPEADO'] }
        },
        include: [{
          model: deps.MovimentoFinanceiro,
          as: 'movimentoFinanceiro',
          attributes: [],
          required: true,
          where: { status: 'ATIVO' }
        }]
      })
      : [],
    competencia
      ? deps.CrPrevisaoReceita.findAll({
        where: { competencia_id: competencia.id, origem: 'MEDICAO' }
      })
      : [],
    competencia
      ? deps.CrMedicaoConsolidada.findAll({ where: { competencia_id: competencia.id } })
      : [],
    totalBaixasFinanceirasPorCompetencia(
      obraId,
      [competenciaCode],
      'RECEBER',
      deps
    )
  ]);
  const itemById = new Map(items.map((item) => [Number(item.id), serializeItem(item)]));
  const rows = new Map();
  costs.forEach((cost) => {
    const item = itemById.get(Number(cost.plano_item_id));
    const monthlyCost = serializeMonthlyCost(cost, item);
    const key = item ? `item:${item.id}` : `custo:${monthlyCost.id}`;
    rows.set(key, {
      key,
      plano_item_id: item?.id || null,
      previsao_custo_id: item ? null : monthlyCost.id,
      etapa_macro_codigo: monthlyCost.etapa_macro_codigo,
      codigo: item?.codigo || monthlyCost.etapa_macro_codigo || '-',
      descricao: monthlyCost.descricao,
      previsto: money(cost.valor_previsto),
      realizado: 0
    });
  });
  actuals.forEach((actual) => {
    const itemId = actual.plano_item_id ? Number(actual.plano_item_id) : null;
    const item = itemId ? itemById.get(itemId) : null;
    const key = item ? `item:${item.id}` : `nao-mapeado:${actual.etapa_macro_codigo || 'sem-macro'}`;
    const current = rows.get(key) || {
      key,
      plano_item_id: item?.id || null,
      etapa_macro_codigo: item?.etapa_macro_codigo || actual.etapa_macro_codigo || null,
      codigo: item?.codigo || '-',
      descricao: item?.descricao || 'Movimento nao mapeado',
      previsto: 0,
      realizado: 0
    };
    current.realizado = money(current.realizado + number(actual.valor));
    rows.set(key, current);
  });
  const result = [...rows.values()].map((row) => {
    const delta = money(row.realizado - row.previsto);
    return {
      ...row,
      delta,
      percentual_execucao: row.previsto > 0
        ? Math.round((row.realizado / row.previsto) * 10000) / 100
        : null,
      estado: statusComparativo(row.previsto, row.realizado)
    };
  }).sort((a, b) => (
    String(a.etapa_macro_codigo || '').localeCompare(String(b.etapa_macro_codigo || ''))
    || String(a.codigo).localeCompare(String(b.codigo))
  ));
  const costById = new Map(costs.map((cost) => [Number(cost.id), plain(cost)]));
  const measurementRows = new Map();
  const ensureMeasurementRow = (sourceValue) => {
    const source = plain(sourceValue);
    const key = planningReferenceKey(source);
    if (!key) return null;
    const item = source.plano_item_id
      ? itemById.get(Number(source.plano_item_id))
      : null;
    const monthlyCost = source.previsao_custo_id
      ? serializeMonthlyCost(costById.get(Number(source.previsao_custo_id)))
      : null;
    const current = measurementRows.get(key) || {
      key,
      plano_item_id: item?.id || null,
      previsao_custo_id: monthlyCost?.id || null,
      etapa_macro_codigo: item?.etapa_macro_codigo || monthlyCost?.etapa_macro_codigo || null,
      codigo: item?.codigo || monthlyCost?.etapa_macro_codigo || '-',
      descricao: item?.descricao || monthlyCost?.descricao || 'Item sem descricao',
      previsto: 0,
      aprovado: 0,
      tem_aprovacao: false
    };
    measurementRows.set(key, current);
    return current;
  };
  presentedRows.forEach((row) => {
    const current = ensureMeasurementRow(row);
    if (current) current.previsto = money(current.previsto + number(row.valor_previsto));
  });
  approvedRows.forEach((row) => {
    const current = ensureMeasurementRow(row);
    if (!current) return;
    current.aprovado = money(current.aprovado + number(row.valor_medido));
    current.tem_aprovacao = true;
  });
  const measurementResult = [...measurementRows.values()].map((row) => {
    const difference = money(row.aprovado - row.previsto);
    const glosa = money(Math.max(0, row.previsto - row.aprovado));
    let estado = 'AGUARDANDO_APROVACAO';
    if (row.tem_aprovacao && row.previsto === 0 && row.aprovado > 0) estado = 'SEM_PREVISAO';
    else if (row.tem_aprovacao && row.aprovado > row.previsto) estado = 'ACIMA_PREVISTO';
    else if (row.tem_aprovacao && glosa > 0) estado = 'APROVADO_PARCIAL';
    else if (row.tem_aprovacao) estado = 'APROVADO_INTEGRAL';
    return {
      ...row,
      diferenca: difference,
      glosa,
      percentual_aprovacao: row.previsto > 0
        ? Math.round((row.aprovado / row.previsto) * 10000) / 100
        : null,
      estado
    };
  }).sort((a, b) => (
    String(a.etapa_macro_codigo || '').localeCompare(String(b.etapa_macro_codigo || ''))
    || String(a.codigo).localeCompare(String(b.codigo))
  ));
  const measurementPresented = money(
    presentedRows.reduce((sum, row) => sum + number(row.valor_previsto), 0)
  );
  const hasApprovedMeasurement = approvedRows.length > 0;
  const measurementApproved = money(
    approvedRows.reduce((sum, row) => sum + number(row.valor_medido), 0)
  );
  return {
    competencia: serializeCompetencia(competencia),
    plano: { id: Number(plan.id), versao: Number(plan.versao) },
    linhas: result,
    linhas_medicao: measurementResult,
    resumo: {
      previsto: money(result.reduce((sum, row) => sum + row.previsto, 0)),
      realizado: money(result.reduce((sum, row) => sum + row.realizado, 0)),
      estouros: result.filter((row) => row.estado === 'ESTOURO').length,
      sem_previsao: result.filter((row) => row.estado === 'SEM_PREVISAO').length
    },
    recebiveis: {
      medicao_apresentada: measurementPresented,
      medicao_aprovada: hasApprovedMeasurement ? measurementApproved : null,
      glosa: hasApprovedMeasurement
        ? money(Math.max(0, measurementPresented - measurementApproved))
        : null,
      receita_recebida: money(receivedByMonth.get(competenciaCode))
    }
  };
}

async function obterComparativo(user, obraIdValue, competenciaValue, overrides = {}) {
  const deps = dependencies(overrides);
  const obraId = positiveId(obraIdValue, 'Obra');
  const competenciaCode = normalizeCompetencia(competenciaValue);
  await assertScope(user, obraId, deps);
  const obra = await findObra(obraId, deps);
  return {
    obra: serializeObra(obra),
    ...(await buildComparison(obraId, competenciaCode, deps))
  };
}

function competenciaAnterior(competencia) {
  const [year, month] = normalizeCompetencia(competencia).split('-').map(Number);
  return month === 1
    ? `${year - 1}-12`
    : `${year}-${String(month - 1).padStart(2, '0')}`;
}

function dashboardCompetencias(endValue, total = 6) {
  const end = normalizeCompetencia(endValue);
  const result = [end];
  while (result.length < total) result.unshift(competenciaAnterior(result[0]));
  return result;
}

function normalizeDashboardCompetencias(value, referenceValue) {
  const reference = normalizeCompetencia(referenceValue);
  if (value == null || value === '') return dashboardCompetencias(reference);
  const rawValues = Array.isArray(value) ? value : String(value).split(',');
  const competencias = [...new Set(
    rawValues
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .map(normalizeCompetencia)
  )].sort();
  if (!competencias.length) return dashboardCompetencias(reference);
  if (competencias.length > 12) {
    throw createBusinessError(
      422,
      'CR_DASHBOARD_COMPETENCIAS_LIMIT',
      'Selecione no maximo 12 competencias para o dashboard.'
    );
  }
  return competencias;
}

function summarizeDashboardRows(rows) {
  const custoPlanejado = money(rows.reduce((sum, row) => sum + row.custo_planejado, 0));
  const custoRealizado = money(rows.reduce((sum, row) => sum + row.custo_realizado, 0));
  const recebivelPrevisto = money(rows.reduce((sum, row) => sum + row.recebivel_previsto, 0));
  const recebivelReconhecido = money(
    rows.reduce((sum, row) => sum + row.recebivel_reconhecido, 0)
  );
  const medicaoAprovada = money(
    rows.reduce((sum, row) => sum + number(row.medicao_aprovada), 0)
  );
  const receitaRecebida = money(rows.reduce((sum, row) => sum + row.receita_recebida, 0));
  const glosa = money(rows.reduce((sum, row) => sum + row.glosa, 0));
  return {
    custo_planejado: custoPlanejado,
    custo_realizado: custoRealizado,
    desvio_custo: money(custoRealizado - custoPlanejado),
    percentual_custo: custoPlanejado > 0
      ? Math.round((custoRealizado / custoPlanejado) * 10000) / 100
      : null,
    recebivel_previsto: recebivelPrevisto,
    recebivel_reconhecido: recebivelReconhecido,
    medicao_aprovada: medicaoAprovada,
    receita_recebida: receitaRecebida,
    saldo_receber: money(Math.max(0, recebivelReconhecido - receitaRecebida)),
    glosa,
    tem_medicao_aprovada: rows.some((row) => row.medicao_aprovada != null),
    obras_com_custo_acima: rows.filter(
      (row) => row.custo_planejado > 0 && row.custo_realizado > row.custo_planejado
    ).length,
    movimentos_sem_mapeamento: rows.reduce(
      (sum, row) => sum + row.movimentos_sem_mapeamento,
      0
    ),
    recebiveis_vencidos: rows.reduce((sum, row) => sum + row.recebiveis_vencidos, 0)
  };
}

function summarizeDashboardWorkRows(rows, alerts = []) {
  const alertCountByWork = new Map();
  alerts.forEach((item) => {
    const obraId = Number(item.obra_id);
    alertCountByWork.set(obraId, Number(alertCountByWork.get(obraId) || 0) + 1);
  });

  return rows.map((row) => ({
    obra: row.obra,
    competencia: row.competencia,
    competencia_id: row.competencia_id,
    estado_competencia: row.estado_competencia,
    custo_planejado: row.custo_planejado,
    custo_realizado: row.custo_realizado,
    desvio_custo: money(row.custo_realizado - row.custo_planejado),
    percentual_custo: row.custo_planejado > 0
      ? Math.round((row.custo_realizado / row.custo_planejado) * 10000) / 100
      : null,
    recebivel_previsto: row.recebivel_previsto,
    recebivel_reconhecido: row.recebivel_reconhecido,
    medicao_aprovada: row.medicao_aprovada,
    receita_recebida: row.receita_recebida,
    saldo_receber: money(Math.max(0, row.recebivel_reconhecido - row.receita_recebida)),
    glosa: row.glosa,
    recebiveis_vencidos: row.recebiveis_vencidos,
    alertas: Number(alertCountByWork.get(Number(row.obra.id)) || 0)
  })).sort((a, b) => (
    b.alertas - a.alertas
    || Number(b.desvio_custo > 0) - Number(a.desvio_custo > 0)
    || String(a.obra.nome || '').localeCompare(String(b.obra.nome || ''), 'pt-BR')
  ));
}

async function mapWithConcurrency(items, limit, mapper) {
  const result = [];
  const safeLimit = Math.max(1, Number(limit) || 1);
  for (let index = 0; index < items.length; index += safeLimit) {
    const batch = items.slice(index, index + safeLimit);
    result.push(...await Promise.all(batch.map(mapper)));
  }
  return result;
}

async function buildDashboardRows(obras, competencias, deps) {
  const obraIds = obras.map((obra) => Number(obra.id));
  if (!obraIds.length) return [];
  const competenciaRows = await deps.CrCompetencia.findAll({
    where: {
      obra_id: { [Op.in]: obraIds },
      competencia: { [Op.between]: [competencias[0], competencias[competencias.length - 1]] }
    }
  });
  const competenciaIds = competenciaRows.map((item) => Number(item.id));
  const [actualMappings, approvedMeasurements, costEntries, receivedEntries] = await Promise.all([
    competenciaIds.length
      ? deps.CrRealizado.findAll({
        where: {
          competencia_id: { [Op.in]: competenciaIds },
          valor: { [Op.ne]: 0 },
          estado: { [Op.in]: ['BAIXA_ATIVA', 'NAO_MAPEADO'] }
        },
        include: [{
          model: deps.MovimentoFinanceiro,
          as: 'movimentoFinanceiro',
          attributes: [],
          required: true,
          where: { status: 'ATIVO' }
        }]
      })
      : [],
    competenciaIds.length
      ? deps.CrMedicaoConsolidada.findAll({
        where: { competencia_id: { [Op.in]: competenciaIds } }
      })
      : [],
    mapWithConcurrency(obras, 5, async (obra) => [
      Number(obra.id),
      await totalTitulosEmitidosPorCompetencia(
        Number(obra.id),
        competencias,
        'PAGAR',
        deps
      )
    ]),
    mapWithConcurrency(obras, 5, async (obra) => [
      Number(obra.id),
      await totalBaixasFinanceirasPorCompetencia(
        Number(obra.id),
        competencias,
        'RECEBER',
        deps
      )
    ])
  ]);

  const competenciaByKey = new Map(competenciaRows.map((record) => {
    const item = plain(record);
    return [`${Number(item.obra_id)}:${item.competencia}`, item];
  }));
  const mappingByCompetencia = new Map();
  actualMappings.forEach((record) => {
    const item = plain(record);
    const id = Number(item.competencia_id);
    const current = mappingByCompetencia.get(id) || { unmapped: 0 };
    if (item.estado === 'NAO_MAPEADO' || !item.plano_item_id) current.unmapped += 1;
    mappingByCompetencia.set(id, current);
  });
  const approvedByCompetencia = new Map();
  approvedMeasurements.forEach((record) => {
    const item = plain(record);
    const id = Number(item.competencia_id);
    const current = approvedByCompetencia.get(id) || { total: 0, exists: false };
    current.total = money(current.total + number(item.valor_medido));
    current.exists = true;
    approvedByCompetencia.set(id, current);
  });
  const costByWork = new Map(costEntries);
  const receivedByWork = new Map(receivedEntries);
  const today = dataAtualSaoPaulo();
  const settledStatuses = new Set([
    'BAIXADO',
    'CONCILIADO',
    'PAGO',
    'QUITADO',
    'CANCELADO',
    'ESTORNADO'
  ]);
  const overduePrivateReceivables = new Map();
  await mapWithConcurrency(
    obras.filter((obra) => String(obra.classificacao || '').toUpperCase() === 'PRIVADA'),
    5,
    async (obra) => {
      const sources = await findPrivateSources(
        Number(obra.id),
        competencias[competencias.length - 1],
        deps
      );
      overduePrivateReceivables.set(
        Number(obra.id),
        sources.filter((source) => (
          source.data_prevista
          && String(source.data_prevista).slice(0, 10) < today
          && !settledStatuses.has(String(source.status_financeiro || '').toUpperCase())
        )).length
      );
      return null;
    }
  );

  const rows = [];
  obras.forEach((obraValue) => {
    const obra = serializeObra(obraValue);
    const isPublic = String(obra.classificacao || '').toUpperCase() === 'PUBLICA';
    competencias.forEach((competencia) => {
      const saved = competenciaByKey.get(`${obra.id}:${competencia}`) || null;
      const actual = saved
        ? (mappingByCompetencia.get(Number(saved.id)) || { unmapped: 0 })
        : { unmapped: 0 };
      const approved = saved
        ? (approvedByCompetencia.get(Number(saved.id)) || null)
        : null;
      const expected = money(saved?.total_receita_prevista);
      const recognized = isPublic
        ? (approved?.exists ? money(approved.total) : 0)
        : expected;
      rows.push({
        obra,
        competencia,
        competencia_id: saved?.id ? Number(saved.id) : null,
        estado_competencia: saved?.estado || 'NAO_INICIADA',
        custo_planejado: money(saved?.total_custo_previsto),
        custo_realizado: money(costByWork.get(obra.id)?.get(competencia)),
        recebivel_previsto: expected,
        recebivel_reconhecido: recognized,
        medicao_aprovada: isPublic && approved?.exists ? money(approved.total) : null,
        glosa: isPublic && approved?.exists
          ? money(Math.max(0, expected - number(approved.total)))
          : 0,
        receita_recebida: money(receivedByWork.get(obra.id)?.get(competencia)),
        movimentos_sem_mapeamento: actual.unmapped,
        recebiveis_vencidos: competencia === competencias[competencias.length - 1]
          ? number(overduePrivateReceivables.get(obra.id))
          : 0
      });
    });
  });
  return rows;
}

function buildDashboardAlerts(currentRows, overdueObligations = []) {
  const alerts = [];
  const push = (row, type, tone, title, description, destination, priority = 50) => {
    alerts.push({
      id: `${type}:${row.obra.id}:${row.competencia}`,
      tipo: type,
      tom: tone,
      prioridade: priority,
      titulo: title,
      descricao: description,
      obra: row.obra,
      obra_id: row.obra.id,
      competencia: row.competencia,
      destino: destination
    });
  };
  currentRows.forEach((row) => {
    const obraLabel = `${row.obra.codigo || row.obra.id} · ${row.obra.nome}`;
    if (!row.competencia_id) {
      push(
        row,
        'PLANEJAMENTO_AUSENTE',
        'warning',
        'Planejamento não iniciado',
        `${obraLabel} ainda não possui planejamento para a competência.`,
        'planejamento',
        70
      );
    }
    if (row.custo_planejado > 0 && row.custo_realizado > row.custo_planejado) {
      push(
        row,
        'CUSTO_ACIMA',
        'negative',
        'Custo acima do planejado',
        `${obraLabel} está ${money(row.custo_realizado - row.custo_planejado).toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL'
        })} acima do planejamento.`,
        'comparativo',
        100
      );
    }
    if (row.glosa > 0) {
      push(
        row,
        'GLOSA',
        'negative',
        'Glosa registrada',
        `${obraLabel} possui glosa de ${row.glosa.toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL'
        })}.`,
        'comparativo',
        95
      );
    }
    if (row.movimentos_sem_mapeamento > 0) {
      push(
        row,
        'SEM_MAPEAMENTO',
        'warning',
        'Movimento sem mapeamento',
        `${obraLabel} possui ${row.movimentos_sem_mapeamento} movimento(s) sem item micro.`,
        'realizado',
        90
      );
    }
    if (
      String(row.obra.classificacao || '').toUpperCase() === 'PUBLICA'
      && row.recebivel_previsto > 0
      && row.medicao_aprovada == null
    ) {
      push(
        row,
        'MEDICAO_AGUARDANDO_APROVACAO',
        'info',
        'Medição aguardando aprovação',
        `${obraLabel} possui medição prevista ainda sem aprovação do órgão.`,
        'planejamento',
        60
      );
    }
    if (
      String(row.obra.classificacao || '').toUpperCase() === 'PUBLICA'
      && row.recebivel_reconhecido > row.receita_recebida
    ) {
      push(
        row,
        'RECEBIMENTO_PENDENTE',
        'warning',
        'Medição aprovada a receber',
        `${obraLabel} possui ${money(row.recebivel_reconhecido - row.receita_recebida).toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL'
        })} reconhecido e ainda não recebido.`,
        'realizado',
        82
      );
    }
    if (row.recebiveis_vencidos > 0) {
      push(
        row,
        'RECEBIVEL_VENCIDO',
        'negative',
        'Recebível vencido',
        `${obraLabel} possui ${row.recebiveis_vencidos} recebível(is) contratual(is) vencido(s).`,
        'realizado',
        98
      );
    }
  });
  const currentByWork = new Map(currentRows.map((row) => [Number(row.obra.id), row]));
  const overdueByWork = new Map();
  overdueObligations.forEach((item) => {
    const obraId = Number(item.obra_id);
    const current = overdueByWork.get(obraId) || {
      quantidade: 0,
      competencia: item.competencia
    };
    current.quantidade += 1;
    if (item.competencia < current.competencia) current.competencia = item.competencia;
    overdueByWork.set(obraId, current);
  });
  overdueByWork.forEach((value, obraId) => {
    const row = currentByWork.get(obraId);
    if (!row) return;
    push(
      { ...row, competencia: value.competencia },
      'OBRIGACAO_VENCIDA',
      'negative',
      'Obrigação mensal vencida',
      `${row.obra.codigo || row.obra.id} · ${row.obra.nome} possui ${value.quantidade} obrigação(ões) vencida(s).`,
      'planejamento',
      110
    );
  });
  return alerts
    .sort((a, b) => b.prioridade - a.prioridade || a.titulo.localeCompare(b.titulo))
    .slice(0, 12);
}

async function obterDashboard(
  user,
  competenciaValue,
  obraIdValue = null,
  competenciasValue = null,
  classificacaoValue = null,
  overrides = {}
) {
  if (
    competenciasValue
    && typeof competenciasValue === 'object'
    && !Array.isArray(competenciasValue)
  ) {
    overrides = competenciasValue;
    competenciasValue = null;
  }
  if (
    classificacaoValue
    && typeof classificacaoValue === 'object'
    && !Array.isArray(classificacaoValue)
  ) {
    overrides = classificacaoValue;
    classificacaoValue = null;
  }
  const deps = dependencies(overrides);
  const competenciaCode = normalizeCompetencia(competenciaValue);
  const competencias = normalizeDashboardCompetencias(
    competenciasValue,
    competenciaCode
  );
  const selectedObraId = obraIdValue == null || obraIdValue === ''
    ? null
    : positiveId(obraIdValue, 'Obra');
  const selectedClassification = normalizeText(classificacaoValue, 20).toUpperCase();
  if (selectedClassification && !['PUBLICA', 'PRIVADA'].includes(selectedClassification)) {
    throw createBusinessError(
      400,
      'CR_CLASSIFICACAO_INVALIDA',
      'Classificacao deve ser PUBLICA ou PRIVADA.'
    );
  }
  const scope = await deps.resolverEscopoObras(user);
  if (selectedObraId) await assertScope(user, selectedObraId, deps);
  if (!selectedObraId && !scope.todas && scope.obraIds.length === 0) {
    return {
      competencia: competenciaCode,
      escopo: { tipo: 'CARTEIRA', obra: null, total_obras: 0 },
      cards: summarizeDashboardRows([]),
      historico: [],
      macros: [],
      alertas: [],
      obras: [],
      obras_resumo: []
    };
  }

  const obraWhere = {
    ativo: true,
    tipo_centro_custo: 'OBRA',
    ...(selectedClassification ? { classificacao: selectedClassification } : {}),
    ...(selectedObraId ? { id: selectedObraId } : {})
  };
  if (!selectedObraId && !scope.todas) obraWhere.id = { [Op.in]: scope.obraIds };
  const obras = await deps.Obra.findAll({
    where: obraWhere,
    attributes: ['id', 'codigo', 'nome', 'classificacao', 'tipo_centro_custo'],
    order: [['nome', 'ASC']]
  });
  if (selectedObraId && !obras.length) {
    throw createBusinessError(404, 'CR_OBRA_NOT_FOUND', 'Obra nao encontrada.');
  }

  const rows = await buildDashboardRows(obras, competencias, deps);
  const currentRows = rows.filter((row) => row.competencia === competenciaCode);
  const historico = competencias.map((competencia) => ({
    competencia,
    ...summarizeDashboardRows(rows.filter((row) => row.competencia === competencia))
  }));

  let macros = [];
  if (selectedObraId) {
    try {
      const comparison = await buildComparison(selectedObraId, competenciaCode, deps);
      const macroMap = new Map();
      comparison.linhas
        .filter((line) => number(line.previsto) !== 0 || number(line.realizado) !== 0)
        .forEach((line) => {
          const key = line.etapa_macro_codigo || 'SEM_MACRO';
          const current = macroMap.get(key) || {
            codigo: key,
            previsto: 0,
            realizado: 0,
            itens: 0
          };
          current.previsto = money(current.previsto + line.previsto);
          current.realizado = money(current.realizado + line.realizado);
          current.itens += 1;
          macroMap.set(key, current);
        });
      const macroCodes = [...macroMap.keys()].filter((code) => code !== 'SEM_MACRO');
      const macroReferences = macroCodes.length
        ? await deps.Apropriacao.findAll({
          where: {
            obra_id: selectedObraId,
            codigo: { [Op.in]: macroCodes }
          },
          attributes: ['codigo', 'descricao'],
          raw: true
        })
        : [];
      const macroNameByCode = new Map(
        macroReferences.map((item) => [String(item.codigo), item.descricao || null])
      );
      macros = [...macroMap.values()].map((row) => ({
        ...row,
        nome: row.codigo === 'SEM_MACRO'
          ? 'Sem macro vinculada'
          : (macroNameByCode.get(String(row.codigo)) || 'Macro sem descrição'),
        delta: money(row.realizado - row.previsto),
        percentual_execucao: row.previsto > 0
          ? Math.round((row.realizado / row.previsto) * 10000) / 100
          : null,
        estado: statusComparativo(row.previsto, row.realizado)
      }));
    } catch (error) {
      if (error?.code !== 'CR_PLANO_PUBLICADO_REQUIRED') throw error;
    }
  }

  let overdueObligations = [];
  try {
    const obligationData = await deps.listarMinhasObrigacoes(user);
    const workIds = new Set(obras.map((obra) => Number(obra.id)));
    const competenceSet = new Set(competencias.map(String));
    overdueObligations = (obligationData?.items || []).filter((item) => (
      item.situacao === 'VENCIDA'
      && workIds.has(Number(item.obra_id))
      && competenceSet.has(String(item.competencia))
    ));
  } catch (error) {
    overdueObligations = [];
  }

  const alerts = buildDashboardAlerts(rows, overdueObligations);
  const workSummaries = summarizeDashboardWorkRows(rows, alerts);

  return {
    competencia: competenciaCode,
    escopo: {
      tipo: selectedObraId ? 'OBRA' : 'CARTEIRA',
      obra: selectedObraId ? serializeObra(obras[0]) : null,
      total_obras: obras.length
    },
    cards: summarizeDashboardRows(currentRows),
    historico,
    macros: selectedObraId ? macros : [],
    alertas: alerts,
    obras: obras.map(serializeObra),
    obras_resumo: workSummaries
  };
}

async function resolverObraIdPorCompetencia(competenciaIdValue, overrides = {}) {
  const deps = dependencies(overrides);
  const id = positiveId(competenciaIdValue, 'Competencia');
  const record = await deps.CrCompetencia.findByPk(id, { attributes: ['obra_id'] });
  return record ? Number(record.obra_id) : null;
}

async function resolverObraIdPorReabertura(reaberturaIdValue, overrides = {}) {
  const deps = dependencies(overrides);
  const id = positiveId(reaberturaIdValue, 'Reabertura');
  const record = await deps.CrReabertura.findByPk(id, {
    include: [{
      model: deps.CrCompetencia,
      as: 'competencia',
      attributes: ['obra_id'],
      required: true
    }]
  });
  return record?.competencia ? Number(record.competencia.obra_id) : null;
}

async function solicitarReabertura(user, competenciaIdValue, payload = {}, overrides = {}) {
  const deps = dependencies(overrides);
  const competenciaId = positiveId(competenciaIdValue, 'Competencia');
  const motivo = normalizeText(payload.motivo);
  if (motivo.length < 10) {
    throw createBusinessError(
      422,
      'CR_REABERTURA_MOTIVO_REQUIRED',
      'Informe um motivo com pelo menos 10 caracteres.'
    );
  }
  const obraId = await resolverObraIdPorCompetencia(competenciaId, overrides);
  if (!obraId) throw createBusinessError(404, 'CR_COMPETENCIA_NOT_FOUND', 'Competencia nao encontrada.');
  await assertScope(user, obraId, deps);

  return deps.sequelize.transaction(async (transaction) => {
    const competencia = await deps.CrCompetencia.findByPk(competenciaId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const expired = competencia && prazoCompetencia(competencia.competencia) <= new Date();
    if (!competencia || (competencia.estado !== 'FINALIZADA' && !expired)) {
      throw createBusinessError(
        409,
        'CR_REABERTURA_ESTADO_INVALIDO',
        'Somente competencias finalizadas ou vencidas podem solicitar reabertura.'
      );
    }
    const existing = await deps.CrReabertura.findOne({
      where: {
        competencia_id: competenciaId,
        [Op.or]: [
          { situacao: 'SOLICITADA' },
          { situacao: 'APROVADA', expira_em: { [Op.gt]: new Date() } }
        ]
      },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (existing) return { idempotente: true, reabertura: serializeReabertura(existing) };
    const record = await deps.CrReabertura.create({
      competencia_id: competenciaId,
      solicitado_por: user?.id,
      motivo,
      situacao: 'SOLICITADA'
    }, { transaction });
    await audit(deps, transaction, {
      obraId,
      competenciaId,
      userId: user?.id,
      event: 'CR_REABERTURA_SOLICITADA',
      description: 'Reabertura de competencia solicitada.',
      payload: { motivo }
    });
    return { idempotente: false, reabertura: serializeReabertura(record) };
  });
}

async function solicitarReaberturaPorObraCompetencia(
  user,
  obraIdValue,
  competenciaValue,
  payload = {},
  overrides = {}
) {
  const deps = dependencies(overrides);
  const obraId = positiveId(obraIdValue, 'Obra');
  const competenciaCode = normalizeCompetencia(competenciaValue);
  await assertScope(user, obraId, deps);
  const competencia = await deps.sequelize.transaction(async (transaction) => {
    await findObra(obraId, deps, { transaction, lock: transaction.LOCK.UPDATE });
    await findPublishedPlan(obraId, deps, { transaction, lock: transaction.LOCK.UPDATE });
    return getOrCreateCompetencia(obraId, competenciaCode, deps, transaction);
  });
  return solicitarReabertura(user, competencia.id, payload, overrides);
}

async function decidirReabertura(user, reaberturaIdValue, payload = {}, overrides = {}) {
  const deps = dependencies(overrides);
  const reaberturaId = positiveId(reaberturaIdValue, 'Reabertura');
  const decisao = String(payload.decisao || '').trim().toUpperCase();
  if (!['APROVADA', 'NEGADA'].includes(decisao)) {
    throw createBusinessError(400, 'CR_REABERTURA_DECISAO_INVALIDA', 'Decisao invalida.');
  }
  const expiraEm = decisao === 'APROVADA' ? new Date(payload.expira_em) : null;
  if (decisao === 'APROVADA' && (!payload.expira_em || Number.isNaN(expiraEm.getTime()) || expiraEm <= new Date())) {
    throw createBusinessError(
      422,
      'CR_REABERTURA_EXPIRACAO_INVALIDA',
      'Informe uma data futura para o encerramento da reabertura.'
    );
  }
  const obraId = await resolverObraIdPorReabertura(reaberturaId, overrides);
  if (!obraId) throw createBusinessError(404, 'CR_REABERTURA_NOT_FOUND', 'Reabertura nao encontrada.');
  await assertScope(user, obraId, deps);

  return deps.sequelize.transaction(async (transaction) => {
    const record = await deps.CrReabertura.findByPk(reaberturaId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!record) throw createBusinessError(404, 'CR_REABERTURA_NOT_FOUND', 'Reabertura nao encontrada.');
    if (record.situacao !== 'SOLICITADA') {
      return { idempotente: true, reabertura: serializeReabertura(record) };
    }
    const competencia = await deps.CrCompetencia.findByPk(record.competencia_id, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    await record.update({
      situacao: decisao,
      aprovado_por: user?.id,
      aprovado_em: new Date(),
      expira_em: expiraEm
    }, { transaction });
    if (decisao === 'APROVADA') {
      await competencia.update({ estado: 'REABERTA' }, { transaction });
    }
    await audit(deps, transaction, {
      obraId,
      competenciaId: competencia.id,
      userId: user?.id,
      event: decisao === 'APROVADA' ? 'CR_REABERTURA_APROVADA' : 'CR_REABERTURA_NEGADA',
      description: decisao === 'APROVADA'
        ? 'Janela temporaria de reabertura aprovada.'
        : 'Solicitacao de reabertura negada.',
      payload: {
        reabertura_id: reaberturaId,
        expira_em: expiraEm,
        observacao: normalizeText(payload.observacao) || null
      }
    });
    return { idempotente: false, reabertura: serializeReabertura(record) };
  });
}

module.exports = {
  CONTRACT_ACTIVE_STATUSES,
  assertCompetenciaNovoMes,
  competenciaAtual,
  competenciaSeguinte,
  consolidarMedicao,
  criarCompetencia,
  dashboardCompetencias,
  normalizeDashboardCompetencias,
  decidirReabertura,
  findPrivateSources,
  finalizarCompetencia,
  monthRange,
  normalizeCompetencia,
  obterComparativo,
  obterDashboard,
  obterPlanejamento,
  listarCompetencias,
  pesquisarItensPlano,
  resolverObraIdPorCompetencia,
  resolverObraIdPorReabertura,
  salvarCustos,
  salvarRecebiveis,
  solicitarReabertura,
  solicitarReaberturaPorObraCompetencia,
  statusComparativo,
  summarizeDashboardRows,
  summarizeDashboardWorkRows
};
