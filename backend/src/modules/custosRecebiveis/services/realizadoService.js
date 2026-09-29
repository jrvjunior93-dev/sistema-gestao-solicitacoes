'use strict';

const { Op } = require('sequelize');
const db = require('../../../models');
const { createBusinessError } = require('./planoMicroService');
const { resolverEscopoObras } = require('../policies/obraScopePolicy');

const VALID_COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;
const ACTIVE_MOVEMENT_STATUS = 'ATIVO';
const SETTLEMENT_MOVEMENT_TYPE = 'BAIXA';

function dependencies(overrides = {}) {
  return {
    sequelize: db.sequelize,
    Obra: db.Obra,
    Apropriacao: db.Apropriacao,
    Parceiro: db.Parceiro,
    Solicitacao: db.Solicitacao,
    SolicitacaoApropriacao: db.SolicitacaoApropriacao,
    TituloFinanceiro: db.TituloFinanceiro,
    TituloFinanceiroRateio: db.TituloFinanceiroRateio,
    CategoriaFinanceira: db.CategoriaFinanceira,
    MovimentoFinanceiro: db.MovimentoFinanceiro,
    CrPlanoObra: db.CrPlanoObra,
    CrPlanoItem: db.CrPlanoItem,
    CrPlanoMacroVinculo: db.CrPlanoMacroVinculo,
    CrCompetencia: db.CrCompetencia,
    CrRealizado: db.CrRealizado,
    CrAuditoria: db.CrAuditoria,
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
  return {
    first: `${year}-${String(month).padStart(2, '0')}-01`,
    nextMonth: month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, '0')}-01`
  };
}

function dateOnlySaoPaulo(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(parsed);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return year && month && day ? `${year}-${month}-${day}` : null;
}

function titleIssueDate(titleValue) {
  const title = plain(titleValue);
  return dateOnlySaoPaulo(title.data_emissao) || dateOnlySaoPaulo(title.createdAt);
}

async function assertScope(user, obraId, deps) {
  const scope = await deps.resolverEscopoObras(user);
  if (!scope.todas && !scope.obraIds.includes(Number(obraId))) {
    throw createBusinessError(403, 'CR_FORA_DE_ESCOPO', 'A obra informada esta fora do seu escopo.');
  }
}

function allocationWeight(item, fallback = 0) {
  const value = number(item.valor_rateio);
  if (value > 0) return value;
  const percentage = number(item.percentual);
  if (percentage > 0) return percentage;
  const quantity = number(item.quantidade);
  if (quantity > 0) return quantity;
  return fallback;
}

function allocateMoney(totalValue, allocations) {
  if (!allocations.length) return [];
  const weights = allocations.map((item) => Math.max(0, allocationWeight(item, 1)));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || allocations.length;
  let allocated = 0;
  return allocations.map((item, index) => {
    const value = index === allocations.length - 1
      ? money(totalValue - allocated)
      : money(totalValue * ((weights[index] || 1) / totalWeight));
    allocated = money(allocated + value);
    return { ...item, valor: value };
  });
}

function normalizeSourceAllocation(item, fallbackObraId = null) {
  const source = plain(item);
  const appropriation = plain(source.apropriacao);
  return {
    obra_id: Number(source.obra_id || appropriation.obra_id || fallbackObraId) || null,
    apropriacao_id: Number(source.apropriacao_id || appropriation.id) || null,
    etapa_macro_codigo: appropriation.codigo || source.etapa_macro_codigo || null,
    valor_rateio: source.valor_rateio,
    percentual: source.percentual,
    quantidade: source.quantidade
  };
}

function resolveNaturalAllocations(movementValue, titleValue) {
  const movement = plain(movementValue);
  const title = plain(titleValue || movement.titulo);
  const request = plain(title.solicitacao);
  const titleAllocations = (title.rateios || []).map((item) => (
    normalizeSourceAllocation(item, title.obra_id)
  ));
  if (titleAllocations.length) {
    return allocateMoney(money(Math.abs(number(movement.valor_quitacao || movement.valor))), titleAllocations);
  }

  if (Number(title.apropriacao_id) > 0) {
    return [{
      obra_id: Number(title.obra_id) || Number(request.obra_id) || null,
      apropriacao_id: Number(title.apropriacao_id),
      etapa_macro_codigo: plain(title.apropriacao).codigo || null,
      valor: money(Math.abs(number(movement.valor_quitacao || movement.valor)))
    }];
  }

  const requestAllocations = (request.apropriacoes || []).map((item) => (
    normalizeSourceAllocation(item, request.obra_id || title.obra_id)
  ));
  if (requestAllocations.length) {
    return allocateMoney(money(Math.abs(number(movement.valor_quitacao || movement.valor))), requestAllocations);
  }

  if (Number(request.apropriacao_id) > 0) {
    return [{
      obra_id: Number(request.obra_id) || Number(title.obra_id) || null,
      apropriacao_id: Number(request.apropriacao_id),
      etapa_macro_codigo: plain(request.apropriacao).codigo || null,
      valor: money(Math.abs(number(movement.valor_quitacao || movement.valor)))
    }];
  }

  return [{
    obra_id: Number(title.obra_id) || Number(request.obra_id) || null,
    apropriacao_id: null,
    etapa_macro_codigo: null,
    valor: money(Math.abs(number(movement.valor_quitacao || movement.valor)))
  }];
}

function buildProjectionRows({
  movement,
  obraId,
  planItemsByAppropriation = new Map(),
  manualPlanItem = null
}) {
  const source = plain(movement);
  const title = plain(source.titulo);
  if (String(source.status || '').toUpperCase() !== ACTIVE_MOVEMENT_STATUS) return [];
  if (String(source.tipo_movimento || '').toUpperCase() !== SETTLEMENT_MOVEMENT_TYPE) return [];
  if (String(title.tipo || '').toUpperCase() !== 'PAGAR') return [];

  const allocations = resolveNaturalAllocations(source, title)
    .filter((item) => Number(item.obra_id) === Number(obraId) && money(item.valor) !== 0);
  const workValue = money(allocations.reduce((sum, item) => sum + number(item.valor), 0));
  if (!workValue) return [];

  if (manualPlanItem) {
    return [{
      plano_item_id: Number(manualPlanItem.id),
      etapa_macro_codigo: manualPlanItem.etapa_macro_codigo || null,
      valor: workValue,
      estado: 'BAIXA_ATIVA'
    }];
  }

  const grouped = new Map();
  allocations.forEach((allocation) => {
    const candidates = planItemsByAppropriation.get(Number(allocation.apropriacao_id)) || [];
    const planItem = candidates.length === 1 ? candidates[0] : null;
    const key = planItem ? `item:${planItem.id}` : 'nao-mapeado';
    const current = grouped.get(key) || {
      plano_item_id: planItem ? Number(planItem.id) : null,
      etapa_macro_codigo: planItem?.etapa_macro_codigo
        || allocation.etapa_macro_codigo
        || null,
      valor: 0,
      estado: planItem ? 'BAIXA_ATIVA' : 'NAO_MAPEADO'
    };
    current.valor = money(current.valor + number(allocation.valor));
    if (!planItem && current.etapa_macro_codigo !== allocation.etapa_macro_codigo) {
      current.etapa_macro_codigo = null;
    }
    grouped.set(key, current);
  });
  return [...grouped.values()];
}

async function findPlanContext(obraId, competencia, deps, transaction) {
  const competency = await deps.CrCompetencia.findOne({
    where: { obra_id: obraId, competencia },
    transaction
  });
  const planWhere = { obra_id: obraId };
  if (competency?.plano_versao_snapshot) {
    planWhere.versao = competency.plano_versao_snapshot;
  } else {
    planWhere.situacao = 'PUBLICADA';
  }
  const plan = await deps.CrPlanoObra.findOne({
    where: planWhere,
    order: [['versao', 'DESC']],
    transaction
  });
  if (!plan) {
    return {
      competency,
      plan: null,
      items: [],
      macros: [],
      planItemsByAppropriation: new Map()
    };
  }
  const structure = await deps.CrPlanoItem.findAll({
    where: { plano_id: plan.id },
    order: [['ordem', 'ASC'], ['codigo', 'ASC']],
    transaction
  });
  const plainStructure = structure.map(plain);
  const items = plainStructure.filter((item) => !Boolean(item.somadora));
  const macroCodes = new Set(items
    .map((item) => String(item.etapa_macro_codigo || '').trim())
    .filter(Boolean));
  const macros = plainStructure
    .filter((item) => macroCodes.has(String(item.codigo || '').trim()))
    .map((item) => ({
      codigo: item.codigo,
      descricao: item.descricao || item.codigo,
      ordem: number(item.ordem)
    }));
  const itemIds = items.map((item) => Number(item.id));
  const links = itemIds.length
    ? await deps.CrPlanoMacroVinculo.findAll({
      where: { plano_item_id: { [Op.in]: itemIds } },
      transaction
    })
    : [];
  const itemById = new Map(items.map((item) => [Number(item.id), item]));
  const planItemsByAppropriation = new Map();
  links.forEach((linkValue) => {
    const link = plain(linkValue);
    const item = itemById.get(Number(link.plano_item_id));
    if (!item) return;
    const list = planItemsByAppropriation.get(Number(link.apropriacao_id)) || [];
    list.push(item);
    planItemsByAppropriation.set(Number(link.apropriacao_id), list);
  });
  return {
    competency,
    plan: plain(plan),
    items: [...itemById.values()],
    macros,
    planItemsByAppropriation
  };
}

function enrichTitlesWithPlanMacros(titles = [], planContext = {}) {
  const macroByCode = new Map((planContext.macros || []).map((macro) => (
    [String(macro.codigo), macro]
  )));
  return titles.map((title) => {
    const macroCodes = new Set();
    (title.apropriacoes || []).forEach((appropriation) => {
      const linkedItems = planContext.planItemsByAppropriation?.get(Number(appropriation.id)) || [];
      linkedItems.forEach((item) => {
        if (item.etapa_macro_codigo) macroCodes.add(String(item.etapa_macro_codigo));
      });
      if (!linkedItems.length && macroByCode.has(String(appropriation.codigo || ''))) {
        macroCodes.add(String(appropriation.codigo));
      }
    });
    const etapas = [...macroCodes]
      .map((code) => macroByCode.get(code) || { codigo: code, descricao: code, ordem: 0 })
      .sort((a, b) => number(a.ordem) - number(b.ordem) || String(a.codigo).localeCompare(String(b.codigo)));
    return {
      ...title,
      etapas_macro: etapas.map((macro) => ({
        codigo: macro.codigo,
        descricao: macro.descricao || macro.codigo
      }))
    };
  });
}

async function getOrCreateCompetency(obraId, competencia, plan, deps, transaction) {
  const existing = await deps.CrCompetencia.findOne({
    where: { obra_id: obraId, competencia },
    transaction,
    lock: transaction?.LOCK?.UPDATE
  });
  if (existing) return existing;
  return deps.CrCompetencia.create({
    obra_id: obraId,
    competencia,
    estado: 'ABERTA',
    plano_versao_snapshot: plan?.versao || null,
    total_custo_previsto: 0,
    total_receita_prevista: 0
  }, { transaction });
}

function sourceIncludes(deps) {
  return [{
    model: deps.TituloFinanceiro,
    as: 'titulo',
    required: true,
    where: { tipo: 'PAGAR' },
    include: [
      {
        model: deps.TituloFinanceiroRateio,
        as: 'rateios',
        required: false,
        include: [{
          model: deps.Apropriacao,
          as: 'apropriacao',
          required: false,
          attributes: ['id', 'obra_id', 'codigo', 'descricao']
        }]
      },
      {
        model: deps.Apropriacao,
        as: 'apropriacao',
        required: false,
        attributes: ['id', 'obra_id', 'codigo', 'descricao']
      },
      {
        model: deps.Solicitacao,
        as: 'solicitacao',
        required: false,
        include: [
          {
            model: deps.SolicitacaoApropriacao,
            as: 'apropriacoes',
            required: false,
            include: [{
              model: deps.Apropriacao,
              as: 'apropriacao',
              required: false,
              attributes: ['id', 'obra_id', 'codigo', 'descricao']
            }]
          },
          {
            model: deps.Apropriacao,
            as: 'apropriacao',
            required: false,
            attributes: ['id', 'obra_id', 'codigo', 'descricao']
          }
        ]
      }
    ]
  }];
}

async function findManualOverrides(obraId, movementIds, items, deps, transaction) {
  if (!movementIds.length) return new Map();
  const itemById = new Map(items.map((item) => [Number(item.id), item]));
  const auditRows = await deps.CrAuditoria.findAll({
    where: {
      obra_id: obraId,
      evento: 'CR_REALIZADO_RECONCILIADO'
    },
    order: [['criado_em', 'ASC'], ['id', 'ASC']],
    transaction
  });
  const movementSet = new Set(movementIds.map(Number));
  const overrides = new Map();
  auditRows.forEach((rowValue) => {
    const rawPayload = plain(rowValue).payload_json;
    let payload = rawPayload || {};
    if (typeof rawPayload === 'string') {
      try {
        payload = JSON.parse(rawPayload);
      } catch {
        payload = {};
      }
    }
    const movementId = Number(payload.movimento_financeiro_id);
    const item = itemById.get(Number(payload.plano_item_id));
    if (movementSet.has(movementId) && item) overrides.set(movementId, item);
  });
  return overrides;
}

function sameProjection(existingValue, desired) {
  const existing = plain(existingValue);
  return Number(existing.plano_item_id || 0) === Number(desired.plano_item_id || 0)
    && String(existing.etapa_macro_codigo || '') === String(desired.etapa_macro_codigo || '')
    && money(existing.valor) === money(desired.valor)
    && existing.estado === desired.estado;
}

async function reprocessarRealizados(user, obraIdValue, competenciaValue, overrides = {}) {
  const deps = dependencies(overrides);
  const obraId = positiveId(obraIdValue, 'Obra');
  const competencia = normalizeCompetencia(competenciaValue);
  await assertScope(user, obraId, deps);
  const { first, nextMonth } = monthRange(competencia);

  return deps.sequelize.transaction(async (transaction) => {
    const obra = await deps.Obra.findByPk(obraId, {
      attributes: ['id', 'codigo', 'nome'],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!obra) throw createBusinessError(404, 'CR_OBRA_NOT_FOUND', 'Obra nao encontrada.');

    const planContext = await findPlanContext(obraId, competencia, deps, transaction);
    const competency = await getOrCreateCompetency(
      obraId,
      competencia,
      planContext.plan,
      deps,
      transaction
    );
    const workRateios = await deps.TituloFinanceiroRateio.findAll({
      where: { obra_id: obraId },
      attributes: ['titulo_financeiro_id'],
      raw: true,
      transaction
    });
    const rateioTitleIds = [...new Set(workRateios
      .map((item) => Number(item.titulo_financeiro_id))
      .filter((id) => id > 0))];
    const titleWhere = {
      tipo: 'PAGAR',
      [Op.or]: [
        { obra_id: obraId },
        ...(rateioTitleIds.length ? [{ id: { [Op.in]: rateioTitleIds } }] : [])
      ]
    };
    const candidateTitles = await deps.TituloFinanceiro.findAll({
      where: titleWhere,
      attributes: ['id'],
      raw: true,
      transaction
    });
    const candidateTitleIds = candidateTitles.map((item) => Number(item.id));
    const movements = candidateTitleIds.length
      ? await deps.MovimentoFinanceiro.findAll({
        where: {
          titulo_financeiro_id: { [Op.in]: candidateTitleIds },
          status: ACTIVE_MOVEMENT_STATUS,
          tipo_movimento: SETTLEMENT_MOVEMENT_TYPE,
          data_movimento: { [Op.gte]: first, [Op.lt]: nextMonth }
        },
        include: sourceIncludes(deps),
        order: [['id', 'ASC']],
        transaction
      })
      : [];
    const movementIds = movements.map((item) => Number(item.id));
    const movementById = new Map(movements.map((item) => [Number(item.id), plain(item)]));
    const manualOverrides = await findManualOverrides(
      obraId,
      movementIds,
      planContext.items,
      deps,
      transaction
    );
    const desiredByMovement = new Map();
    movements.forEach((movement) => {
      const rows = buildProjectionRows({
        movement,
        obraId,
        planItemsByAppropriation: planContext.planItemsByAppropriation,
        manualPlanItem: manualOverrides.get(Number(movement.id)) || null
      });
      if (rows.length) desiredByMovement.set(Number(movement.id), rows);
    });

    const existingRows = await deps.CrRealizado.findAll({
      where: { obra_id: obraId, competencia_id: competency.id },
      order: [['id', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const existingByMovement = new Map();
    existingRows.forEach((row) => {
      const list = existingByMovement.get(Number(row.movimento_financeiro_id)) || [];
      list.push(row);
      existingByMovement.set(Number(row.movimento_financeiro_id), list);
    });

    let created = 0;
    let updated = 0;
    let corrected = 0;
    const changed = [];
    for (const [movementId, desiredRows] of desiredByMovement.entries()) {
      const candidates = existingByMovement.get(movementId) || [];
      const used = new Set();
      for (const desired of desiredRows) {
        const exact = candidates.find((row) => (
          !used.has(Number(row.id))
          && Number(row.plano_item_id || 0) === Number(desired.plano_item_id || 0)
        ));
        const reusable = exact || candidates.find((row) => (
          !used.has(Number(row.id)) && money(row.valor) === 0
        ));
        const payload = {
          competencia_id: competency.id,
          obra_id: obraId,
          titulo_financeiro_id: Number(
            movementById.get(movementId)?.titulo_financeiro_id
          ) || null,
          movimento_financeiro_id: movementId,
          processado_em: new Date(),
          ...desired
        };
        if (reusable) {
          used.add(Number(reusable.id));
          if (!sameProjection(reusable, desired)) {
            const previous = plain(reusable);
            await reusable.update(payload, { transaction });
            updated += 1;
            changed.push({ tipo: 'ATUALIZADO', id: Number(reusable.id), anterior: previous, atual: payload });
          }
        } else {
          const record = await deps.CrRealizado.create(payload, { transaction });
          created += 1;
          used.add(Number(record.id));
          changed.push({ tipo: 'CRIADO', id: Number(record.id), atual: payload });
        }
      }
      for (const row of candidates) {
        if (!used.has(Number(row.id)) && money(row.valor) !== 0) {
          const previous = plain(row);
          await row.update({ valor: 0, processado_em: new Date() }, { transaction });
          corrected += 1;
          changed.push({
            tipo: 'CORRECAO',
            id: Number(row.id),
            motivo: 'PROJECAO_SUBSTITUIDA',
            anterior: previous,
            atual: { valor: 0 }
          });
        }
      }
    }

    for (const [movementId, rows] of existingByMovement.entries()) {
      if (desiredByMovement.has(movementId)) continue;
      for (const row of rows) {
        if (money(row.valor) !== 0) {
          const previous = plain(row);
          await row.update({ valor: 0, processado_em: new Date() }, { transaction });
          corrected += 1;
          changed.push({
            tipo: 'CORRECAO',
            id: Number(row.id),
            motivo: 'BAIXA_INATIVA_OU_FORA_DA_FONTE',
            anterior: previous,
            atual: { valor: 0 }
          });
        }
      }
    }

    if (changed.length) {
      await deps.CrAuditoria.create({
        obra_id: obraId,
        competencia_id: competency.id,
        usuario_id: user?.id || null,
        evento: 'CR_REALIZADOS_REPROCESSADOS',
        descricao: 'Projecao de baixas financeiras reprocessada de forma idempotente.',
        payload_json: {
          competencia,
          criados: created,
          atualizados: updated,
          correcoes: corrected,
          alteracoes: changed
        },
        origem: 'web',
        criado_em: new Date()
      }, { transaction });
    }

    return {
      obra: { id: obraId, codigo: obra.codigo || null, nome: obra.nome },
      competencia,
      competencia_id: Number(competency.id),
      movimentos_analisados: movements.length,
      criados: created,
      atualizados: updated,
      correcoes: corrected,
      idempotente: changed.length === 0
    };
  });
}

function serializeRealized(rowValue, chain = {}) {
  const row = plain(rowValue);
  const movement = plain(row.movimentoFinanceiro);
  const title = plain(row.tituloFinanceiro);
  const request = plain(title.solicitacao);
  const item = plain(row.planoItem);
  const partner = plain(title.parceiro);
  const active = String(movement.status || '').toUpperCase() === ACTIVE_MOVEMENT_STATUS;
  return {
    id: Number(row.id),
    competencia_id: Number(row.competencia_id),
    obra_id: Number(row.obra_id),
    movimento_financeiro_id: Number(row.movimento_financeiro_id),
    titulo_financeiro_id: Number(row.titulo_financeiro_id) || null,
    plano_item_id: Number(row.plano_item_id) || null,
    etapa_macro_codigo: row.etapa_macro_codigo || null,
    valor: money(row.valor),
    estado: active ? row.estado : 'ESTORNADO',
    ativo: active,
    data_movimento: movement.data_movimento || null,
    processado_em: row.processado_em || null,
    item_micro: item.id ? {
      id: Number(item.id),
      codigo: item.codigo,
      descricao: item.descricao
    } : null,
    parceiro: partner.id ? {
      id: Number(partner.id),
      nome: partner.nome,
      cpf_cnpj: partner.cpf_cnpj || null
    } : null,
    solicitacao: request.id ? {
      id: Number(request.id),
      codigo: request.codigo || null
    } : null,
    pedido: chain.pedido || null,
    titulo: title.id ? {
      id: Number(title.id),
      codigo: title.codigo || null,
      descricao: title.descricao,
      status: title.status
    } : null
  };
}

const TITLE_SETTLED_STATUSES = new Set([
  'BAIXADO',
  'CONCILIADO',
  'PAGO',
  'PAGA',
  'QUITADO',
  'QUITADA'
]);
const TITLE_INACTIVE_STATUSES = new Set(['CANCELADO', 'CANCELADA', 'ESTORNADO', 'ESTORNADA']);

function titleStatusGroup(statusValue) {
  const status = String(statusValue || '').trim().toUpperCase();
  if (TITLE_SETTLED_STATUSES.has(status)) return 'QUITADO';
  if (status === 'PARCIAL') return 'PARCIAL';
  if (status === 'ABERTO' || status === 'ABERTA') return 'ABERTO';
  if (status === 'PREVISAO' || status === 'PREVISÃO') return 'PREVISAO';
  if (TITLE_INACTIVE_STATUSES.has(status)) return 'INATIVO';
  return 'OUTRO';
}

function serializeAllocatedTitle(titleValue, obraId, competencia) {
  const title = plain(titleValue);
  const rateios = (title.rateios || []).map(plain);
  const workAllocations = rateios.filter((item) => Number(item.obra_id) === Number(obraId));
  const hasAuthoritativeAllocations = Boolean(title.possui_rateio) || rateios.length > 0;
  const originalTitleValue = money(title.valor_original);
  const allocatedValue = hasAuthoritativeAllocations
    ? money(workAllocations.reduce((sum, item) => sum + number(item.valor_rateio), 0))
    : (Number(title.obra_id) === Number(obraId) ? originalTitleValue : 0);
  if (allocatedValue <= 0) return null;

  const allocationRatio = originalTitleValue > 0
    ? Math.min(1, allocatedValue / originalTitleValue)
    : 0;
  const paidValue = money(Math.min(
    allocatedValue,
    Math.max(0, number(title.valor_baixado)) * allocationRatio
  ));
  const balanceValue = money(Math.min(
    allocatedValue,
    Math.max(0, number(title.valor_saldo)) * allocationRatio
  ));
  const status = String(title.status || '').trim().toUpperCase() || 'SEM_STATUS';
  const statusGroup = titleStatusGroup(status);
  const issueDate = titleIssueDate(title);
  const dueDate = title.data_vencimento || null;
  const { first, nextMonth } = monthRange(competencia);
  const directAppropriation = plain(title.apropriacao);
  const allocationAppropriations = workAllocations
    .map((item) => plain(item.apropriacao))
    .filter((item) => item.id);
  const appropriations = allocationAppropriations.length
    ? allocationAppropriations
    : (directAppropriation.id ? [directAppropriation] : []);
  const partner = plain(title.parceiro);
  const category = plain(title.categoriaFinanceira);

  return {
    id: Number(title.id),
    codigo: title.codigo || null,
    descricao: title.descricao,
    numero_documento: title.numero_documento || null,
    status,
    grupo_status: statusGroup,
    origem_titulo: title.origem_titulo || null,
    data_emissao: title.data_emissao || null,
    data_referencia_custo: issueDate,
    origem_data_referencia: title.data_emissao ? 'DATA_EMISSAO' : 'DATA_CADASTRO',
    data_vencimento: dueDate,
    data_quitacao: title.data_quitacao || null,
    valor_alocado: allocatedValue,
    valor_pago: paidValue,
    valor_saldo: balanceValue,
    em_competencia: Boolean(issueDate && issueDate >= first && issueDate < nextMonth),
    ativo_no_custo: statusGroup !== 'INATIVO',
    parceiro: partner.id ? {
      id: Number(partner.id),
      nome: partner.nome,
      cpf_cnpj: partner.cpf_cnpj || null
    } : null,
    categoria: category.id ? {
      id: Number(category.id),
      nome: category.nome
    } : null,
    apropriacoes: appropriations.map((item) => ({
      id: Number(item.id),
      codigo: item.codigo || null,
      nome: item.descricao || null
    }))
  };
}

function summarizeAllocatedTitles(items = []) {
  const active = items.filter((item) => item.ativo_no_custo);
  const byGroup = (group) => active.filter((item) => item.grupo_status === group);
  const inCompetence = active.filter((item) => item.em_competencia);
  const openInCompetence = inCompetence.filter((item) => number(item.valor_saldo) > 0);
  const issuedValue = money(
    inCompetence.reduce((sum, item) => sum + number(item.valor_alocado), 0)
  );
  const openIssuedBalance = money(
    openInCompetence.reduce((sum, item) => sum + number(item.valor_saldo), 0)
  );
  return {
    titulos: items.length,
    titulos_ativos: active.length,
    total_alocado: money(active.reduce((sum, item) => sum + number(item.valor_alocado), 0)),
    total_pago: money(active.reduce((sum, item) => sum + number(item.valor_pago), 0)),
    saldo_aberto: money(active.reduce((sum, item) => sum + number(item.valor_saldo), 0)),
    valor_emitido_competencia: issuedValue,
    titulos_emitidos_competencia: inCompetence.length,
    saldo_emitido_competencia: openIssuedBalance,
    titulos_emitidos_abertos_competencia: openInCompetence.length,
    // Compatibilidade temporaria com clientes anteriores: a competencia agora e de emissao.
    vencimento_competencia: issuedValue,
    titulos_competencia: inCompetence.length,
    saldo_vencimento_competencia: openIssuedBalance,
    titulos_abertos_competencia: openInCompetence.length,
    status: {
      aberto: byGroup('ABERTO').length,
      parcial: byGroup('PARCIAL').length,
      quitado: byGroup('QUITADO').length,
      previsao: byGroup('PREVISAO').length,
      outros: byGroup('OUTRO').length,
      inativos: items.filter((item) => item.grupo_status === 'INATIVO').length
    }
  };
}

async function listarTitulosFinanceirosAlocados(obraId, competencia, deps) {
  const allocationRows = await deps.TituloFinanceiroRateio.findAll({
    where: { obra_id: obraId },
    attributes: ['titulo_financeiro_id'],
    raw: true
  });
  const allocatedTitleIds = [...new Set(
    allocationRows.map((item) => Number(item.titulo_financeiro_id)).filter((id) => id > 0)
  )];
  const workConditions = [{ obra_id: obraId }];
  if (allocatedTitleIds.length) {
    workConditions.push({ id: { [Op.in]: allocatedTitleIds } });
  }
  const titles = await deps.TituloFinanceiro.findAll({
    where: {
      tipo: 'PAGAR',
      [Op.or]: workConditions
    },
    attributes: [
      'id',
      'codigo',
      'obra_id',
      'apropriacao_id',
      'possui_rateio',
      'parceiro_id',
      'categoria_financeira_id',
      'origem_titulo',
      'status',
      'descricao',
      'numero_documento',
      'valor_original',
      'valor_saldo',
      'valor_baixado',
      'data_emissao',
      'data_vencimento',
      'data_quitacao',
      'createdAt'
    ],
    include: [
      {
        model: deps.Parceiro,
        as: 'parceiro',
        required: false,
        attributes: ['id', 'nome', 'cpf_cnpj']
      },
      {
        model: deps.CategoriaFinanceira,
        as: 'categoriaFinanceira',
        required: false,
        attributes: ['id', 'nome']
      },
      {
        model: deps.Apropriacao,
        as: 'apropriacao',
        required: false,
        attributes: ['id', 'codigo', 'descricao']
      },
      {
        model: deps.TituloFinanceiroRateio,
        as: 'rateios',
        required: false,
        attributes: ['id', 'obra_id', 'apropriacao_id', 'valor_rateio'],
        include: [{
          model: deps.Apropriacao,
          as: 'apropriacao',
          required: false,
          attributes: ['id', 'codigo', 'descricao']
        }]
      }
    ],
    order: [['data_emissao', 'DESC'], ['createdAt', 'DESC'], ['id', 'DESC']]
  });
  return titles
    .map((title) => serializeAllocatedTitle(title, obraId, competencia))
    .filter(Boolean)
    .sort((a, b) => (
      Number(b.em_competencia) - Number(a.em_competencia)
      || String(b.data_referencia_custo || '').localeCompare(String(a.data_referencia_custo || ''))
      || b.id - a.id
    ));
}

async function totalTitulosEmitidosPorCompetencia(obraId, competencias, tipo, depsValue) {
  const deps = dependencies(depsValue);
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
  const workConditions = [{ obra_id: obraId }];
  if (rateioTitleIds.length) workConditions.push({ id: { [Op.in]: rateioTitleIds } });
  const titles = await deps.TituloFinanceiro.findAll({
    where: {
      tipo,
      [Op.and]: [
        { [Op.or]: workConditions },
        {
          [Op.or]: [
            { data_emissao: { [Op.gte]: first, [Op.lt]: nextMonth } },
            {
              data_emissao: null,
              createdAt: { [Op.gte]: first, [Op.lt]: nextMonth }
            }
          ]
        }
      ]
    },
    attributes: [
      'id',
      'obra_id',
      'possui_rateio',
      'status',
      'valor_original',
      'valor_saldo',
      'valor_baixado',
      'data_emissao',
      'createdAt'
    ],
    include: [{
      model: deps.TituloFinanceiroRateio,
      as: 'rateios',
      required: false,
      attributes: ['obra_id', 'valor_rateio']
    }]
  });
  const totals = new Map(months.map((month) => [month, 0]));
  titles.forEach((titleValue) => {
    const issueDate = titleIssueDate(titleValue);
    const month = String(issueDate || '').slice(0, 7);
    if (!totals.has(month)) return;
    const allocated = serializeAllocatedTitle(titleValue, obraId, month);
    if (!allocated?.ativo_no_custo) return;
    totals.set(month, money(number(totals.get(month)) + number(allocated.valor_alocado)));
  });
  return totals;
}

async function listarRealizados(user, obraIdValue, competenciaValue, overrides = {}) {
  const deps = dependencies(overrides);
  const obraId = positiveId(obraIdValue, 'Obra');
  const competencia = normalizeCompetencia(competenciaValue);
  await assertScope(user, obraId, deps);
  const [obra, competency, planContext, allocatedTitles] = await Promise.all([
    deps.Obra.findByPk(obraId, { attributes: ['id', 'codigo', 'nome', 'classificacao'] }),
    deps.CrCompetencia.findOne({ where: { obra_id: obraId, competencia } }),
    findPlanContext(obraId, competencia, deps),
    listarTitulosFinanceirosAlocados(obraId, competencia, deps)
  ]);
  if (!obra) throw createBusinessError(404, 'CR_OBRA_NOT_FOUND', 'Obra nao encontrada.');
  const enrichedTitles = enrichTitlesWithPlanMacros(allocatedTitles, planContext);
  const titleSummary = summarizeAllocatedTitles(enrichedTitles);
  if (!competency) {
    return {
      obra: plain(obra),
      competencia,
      resumo: {
        realizado: titleSummary.valor_emitido_competencia,
        nao_mapeado: 0,
        baixas_ativas: 0,
        estornos: 0,
        ...titleSummary
      },
      itens_plano: planContext.items,
      etapas_macro: planContext.macros,
      titulos: enrichedTitles,
      contextos: [],
      items: []
    };
  }
  const rows = await deps.CrRealizado.findAll({
    where: { obra_id: obraId, competencia_id: competency.id },
    include: [
      {
        model: deps.MovimentoFinanceiro,
        as: 'movimentoFinanceiro',
        required: true,
        attributes: ['id', 'status', 'tipo_movimento', 'data_movimento', 'valor', 'valor_quitacao']
      },
      {
        model: deps.TituloFinanceiro,
        as: 'tituloFinanceiro',
        required: false,
        attributes: ['id', 'codigo', 'descricao', 'status', 'solicitacao_id', 'parceiro_id'],
        include: [{
          model: deps.Parceiro,
          as: 'parceiro',
          required: false,
          attributes: ['id', 'nome', 'cpf_cnpj']
        }]
      },
      {
        model: deps.CrPlanoItem,
        as: 'planoItem',
        required: false,
        attributes: ['id', 'codigo', 'descricao']
      }
    ],
    order: [
      [{ model: deps.MovimentoFinanceiro, as: 'movimentoFinanceiro' }, 'data_movimento', 'DESC'],
      ['id', 'DESC']
    ]
  });
  const items = rows.map((row) => serializeRealized(row));
  const activeItems = items.filter((item) => item.ativo && item.valor !== 0);
  return {
    obra: plain(obra),
    competencia,
    competencia_id: Number(competency.id),
    resumo: {
      realizado: titleSummary.valor_emitido_competencia,
      nao_mapeado: money(activeItems
        .filter((item) => item.estado === 'NAO_MAPEADO')
        .reduce((sum, item) => sum + item.valor, 0)),
      baixas_ativas: activeItems.length,
      estornos: items.filter((item) => item.estado === 'ESTORNADO').length,
      ...titleSummary
    },
    itens_plano: planContext.items.map((item) => ({
      id: Number(item.id),
      codigo: item.codigo,
      descricao: item.descricao,
      etapa_macro_codigo: item.etapa_macro_codigo || null
    })),
    etapas_macro: planContext.macros,
    titulos: enrichedTitles,
    contextos: [],
    items
  };
}

async function resolverObraIdPorRealizado(realizadoIdValue, overrides = {}) {
  const deps = dependencies(overrides);
  const id = positiveId(realizadoIdValue, 'Realizado');
  const record = await deps.CrRealizado.findByPk(id, { attributes: ['obra_id'] });
  return record ? Number(record.obra_id) : null;
}

async function reconciliarRealizado(user, realizadoIdValue, payload = {}, overrides = {}) {
  const deps = dependencies(overrides);
  const realizadoId = positiveId(realizadoIdValue, 'Realizado');
  const planItemId = positiveId(payload.plano_item_id, 'Item micro');
  const motivo = String(payload.motivo || '').trim();
  if (motivo.length < 5) {
    throw createBusinessError(400, 'CR_RECONCILIACAO_MOTIVO_REQUIRED', 'Informe o motivo da reconciliacao.');
  }
  const obraId = await resolverObraIdPorRealizado(realizadoId, deps);
  if (!obraId) throw createBusinessError(404, 'CR_REALIZADO_NOT_FOUND', 'Realizado nao encontrado.');
  await assertScope(user, obraId, deps);

  return deps.sequelize.transaction(async (transaction) => {
    const record = await deps.CrRealizado.findByPk(realizadoId, {
      include: [{
        model: deps.MovimentoFinanceiro,
        as: 'movimentoFinanceiro',
        required: true,
        attributes: ['id', 'status']
      }],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!record) throw createBusinessError(404, 'CR_REALIZADO_NOT_FOUND', 'Realizado nao encontrado.');
    if (String(plain(record.movimentoFinanceiro).status || '').toUpperCase() !== ACTIVE_MOVEMENT_STATUS) {
      throw createBusinessError(409, 'CR_REALIZADO_ESTORNADO', 'Uma baixa estornada nao pode ser reconciliada.');
    }
    const competency = await deps.CrCompetencia.findByPk(record.competencia_id, { transaction });
    const context = await findPlanContext(obraId, competency.competencia, deps, transaction);
    const item = context.items.find((candidate) => Number(candidate.id) === planItemId);
    if (!item) {
      throw createBusinessError(400, 'CR_PLANO_ITEM_INVALIDO', 'O item micro nao pertence ao plano da obra.');
    }
    if (Number(record.plano_item_id) === planItemId && record.estado === 'BAIXA_ATIVA') {
      return { idempotente: true, realizado: serializeRealized(record) };
    }
    const previous = plain(record);
    const duplicate = await deps.CrRealizado.findOne({
      where: {
        movimento_financeiro_id: record.movimento_financeiro_id,
        plano_item_id: planItemId,
        id: { [Op.ne]: record.id }
      },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (duplicate) {
      await duplicate.update({
        valor: money(number(duplicate.valor) + number(record.valor)),
        etapa_macro_codigo: item.etapa_macro_codigo || null,
        estado: 'BAIXA_ATIVA',
        processado_em: new Date()
      }, { transaction });
      await record.update({ valor: 0, processado_em: new Date() }, { transaction });
    } else {
      await record.update({
        plano_item_id: planItemId,
        etapa_macro_codigo: item.etapa_macro_codigo || null,
        estado: 'BAIXA_ATIVA',
        processado_em: new Date()
      }, { transaction });
    }
    await deps.CrAuditoria.create({
      obra_id: obraId,
      competencia_id: record.competencia_id,
      usuario_id: user?.id || null,
      evento: 'CR_REALIZADO_RECONCILIADO',
      descricao: 'Baixa financeira vinculada manualmente a item micro.',
      payload_json: {
        realizado_id: realizadoId,
        movimento_financeiro_id: Number(record.movimento_financeiro_id),
        plano_item_anterior_id: Number(previous.plano_item_id) || null,
        plano_item_id: planItemId,
        valor: money(previous.valor),
        motivo
      },
      origem: 'web',
      criado_em: new Date()
    }, { transaction });
    const finalRecord = duplicate || record;
    return { idempotente: false, realizado: serializeRealized(finalRecord) };
  });
}

/*
  Custo realizado automatico no Comparativo (decisao de 29/09): antes as
  baixas so eram projetadas quando alguem clicava em "Reprocessar". Agora a
  consulta do Comparativo/Realizado sincroniza a competencia antes de ler.
  - so para mes que ja existe e ja comecou (reprocessar cria a competencia
    quando falta, e isso faria surgir mes "Aberto" sozinho);
  - no maximo uma vez a cada 5 minutos por obra/mes neste processo;
  - falha na sincronizacao nao impede a consulta (registra no log).
*/
const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const lastAutoSync = new Map();

async function sincronizarRealizadosAoConsultar(user, obraIdValue, competenciaValue, overrides = {}) {
  const deps = dependencies(overrides);
  const obraId = Number(obraIdValue);
  let competencia;
  try {
    competencia = normalizeCompetencia(competenciaValue);
  } catch {
    return { sincronizado: false, motivo: 'COMPETENCIA_INVALIDA' };
  }
  const now = typeof deps.now === 'function' ? deps.now() : new Date();
  const current = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' })
    .format(now).slice(0, 7);
  if (!Number.isInteger(obraId) || obraId <= 0 || competencia > current) {
    return { sincronizado: false, motivo: 'MES_FUTURO' };
  }
  const key = `${obraId}:${competencia}`;
  const last = lastAutoSync.get(key);
  if (last && now.getTime() - last < AUTO_SYNC_INTERVAL_MS) {
    return { sincronizado: false, motivo: 'RECENTE' };
  }
  const existing = await deps.CrCompetencia.findOne({
    where: { obra_id: obraId, competencia },
    attributes: ['id']
  });
  if (!existing) return { sincronizado: false, motivo: 'SEM_COMPETENCIA' };
  lastAutoSync.set(key, now.getTime());
  try {
    await (overrides.reprocessarRealizados || reprocessarRealizados)(user, obraId, competencia, overrides);
    return { sincronizado: true };
  } catch (error) {
    lastAutoSync.delete(key);
    console.error('[custos-recebiveis] sincronizacao automatica do realizado falhou:', error.message);
    return { sincronizado: false, motivo: 'FALHA' };
  }
}

module.exports = {
  AUTO_SYNC_INTERVAL_MS,
  sincronizarRealizadosAoConsultar,
  allocateMoney,
  buildProjectionRows,
  dependencies,
  enrichTitlesWithPlanMacros,
  listarRealizados,
  listarTitulosFinanceirosAlocados,
  monthRange,
  normalizeCompetencia,
  reconciliarRealizado,
  reprocessarRealizados,
  resolveNaturalAllocations,
  resolverObraIdPorRealizado,
  serializeAllocatedTitle,
  summarizeAllocatedTitles,
  titleIssueDate,
  totalTitulosEmitidosPorCompetencia,
  titleStatusGroup
};
