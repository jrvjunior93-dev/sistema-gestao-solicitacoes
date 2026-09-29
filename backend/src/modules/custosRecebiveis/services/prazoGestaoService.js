'use strict';

const { Op } = require('sequelize');
const db = require('../../../models');
const { createBusinessError } = require('./planoMicroService');
const { resolverEscopoObras } = require('../policies/obraScopePolicy');
const {
  LIMITES_PRAZOS,
  PRAZOS_PADRAO,
  carregarContextoPrazos,
  competenciaNoInstante,
  competenciasLiberadasObra,
  fimDoDiaBrasilia,
  prazoMedicaoEfetivo,
  isMissingTableError,
  resolverConfig
} = require('./prazoService');
const { getOrCreateCompetencia, normalizeCompetencia } = require('./planejamentoService');

/*
  Gestao dos prazos do ciclo mensal (reforma de 29/09/2026, Fase 2):
  - prazos por obra (administrador, Configuracoes);
  - dilatacao do prazo da medicao aprovada: o engenheiro pede de 2 a 5 dias
    quando o fiscal atrasa (somente depois do vencimento, sem limite de
    pedidos, um pendente por vez); o administrador aprova ou nega.
    Aprovada, os dias contam a partir da APROVACAO (decisao de 29/09) e vao
    ate o fim do dia (Brasilia); a dilatacao nunca encurta o prazo vigente.
*/
const DILATACAO_DIAS = Object.freeze({ min: 2, max: 5 });

function dependencies(overrides = {}) {
  return {
    sequelize: db.sequelize,
    Obra: db.Obra,
    User: db.User,
    CrCompetencia: db.CrCompetencia,
    CrPlanoObra: db.CrPlanoObra,
    CrPrazoObra: db.CrPrazoObra,
    CrDilatacao: db.CrDilatacao,
    CrAuditoria: db.CrAuditoria,
    resolverEscopoObras,
    carregarContextoPrazos,
    competenciasLiberadasObra,
    now: () => new Date(),
    ...overrides
  };
}

function plain(value) {
  return value?.toJSON ? value.toJSON() : { ...(value || {}) };
}

function positiveId(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createBusinessError(400, 'CR_INVALID_ID', `${label} invalido.`);
  }
  return parsed;
}

function text(value, max = 2000) {
  return String(value ?? '').trim().slice(0, max);
}

async function assertScope(user, obraId, deps) {
  const scope = await deps.resolverEscopoObras(user);
  if (!scope.todas && !scope.obraIds.includes(obraId)) {
    throw createBusinessError(403, 'CR_OBRA_FORA_ESCOPO', 'Acesso negado para esta obra.');
  }
  return scope;
}

async function audit(deps, transaction, values) {
  await deps.CrAuditoria.create({
    obra_id: values.obraId,
    competencia_id: values.competenciaId || null,
    usuario_id: values.userId || null,
    evento: values.event,
    descricao: values.description,
    payload_json: values.payload || null,
    origem: 'web'
  }, { transaction });
}

/* ------------------------------------------------------------ prazos */

function serializeConfig(row) {
  const item = row ? plain(row) : null;
  return {
    personalizado: Boolean(item),
    ...resolverConfig(item || {}),
    atualizado_em: item?.updatedAt || null
  };
}

async function listarPrazosObras(user, overrides = {}) {
  const deps = dependencies(overrides);
  const scope = await deps.resolverEscopoObras(user);
  if (!scope.todas && !scope.obraIds.length) return { padrao: PRAZOS_PADRAO, limites: LIMITES_PRAZOS, items: [] };
  const obras = await deps.Obra.findAll({
    where: {
      ativo: true,
      tipo_centro_custo: 'OBRA',
      ...(scope.todas ? {} : { id: { [Op.in]: scope.obraIds } })
    },
    attributes: ['id', 'codigo', 'nome', 'classificacao'],
    order: [['nome', 'ASC']]
  });
  const ids = obras.map((obra) => Number(obra.id));
  const rows = ids.length
    ? await deps.CrPrazoObra.findAll({ where: { obra_id: { [Op.in]: ids } } })
    : [];
  const byObra = new Map(rows.map((row) => [Number(row.obra_id), row]));
  return {
    padrao: PRAZOS_PADRAO,
    limites: LIMITES_PRAZOS,
    items: obras.map((obraValue) => {
      const obra = plain(obraValue);
      return {
        obra: {
          id: Number(obra.id),
          codigo: obra.codigo || null,
          nome: obra.nome,
          classificacao: obra.classificacao || null
        },
        ...serializeConfig(byObra.get(Number(obra.id)))
      };
    })
  };
}

function validarConfig(payload = {}) {
  const values = {};
  const errors = [];
  const rotulos = {
    planejamento_dia_abertura: 'Dia de abertura do planejamento',
    planejamento_dia_fechamento: 'Dia de fechamento do planejamento',
    medicao_prazo_dias: 'Prazo da medicao aprovada (dias)'
  };
  Object.entries(LIMITES_PRAZOS).forEach(([key, [min, max]]) => {
    const value = Number(payload[key]);
    if (!Number.isInteger(value) || value < min || value > max) {
      errors.push(`${rotulos[key]}: informe um numero inteiro de ${min} a ${max}.`);
    }
    values[key] = value;
  });
  if (errors.length) {
    throw createBusinessError(422, 'CR_PRAZOS_INVALIDOS', errors.join(' '));
  }
  return values;
}

async function salvarPrazosObra(user, obraIdValue, payload = {}, overrides = {}) {
  const deps = dependencies(overrides);
  const obraId = positiveId(obraIdValue, 'Obra');
  await assertScope(user, obraId, deps);
  const restaurarPadrao = payload.padrao === true;
  const values = restaurarPadrao ? null : validarConfig(payload);
  return deps.sequelize.transaction(async (transaction) => {
    const obra = await deps.Obra.findByPk(obraId, { attributes: ['id'], transaction });
    if (!obra) throw createBusinessError(404, 'CR_OBRA_NOT_FOUND', 'Obra nao encontrada.');
    const current = await deps.CrPrazoObra.findOne({
      where: { obra_id: obraId },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const antes = serializeConfig(current);
    let saved = null;
    if (restaurarPadrao) {
      if (current) await current.destroy({ transaction });
    } else if (current) {
      saved = await current.update({ ...values, atualizado_por: user?.id || null }, { transaction });
    } else {
      saved = await deps.CrPrazoObra.create({
        obra_id: obraId,
        ...values,
        atualizado_por: user?.id || null
      }, { transaction });
    }
    const depois = serializeConfig(saved);
    const changed = ['personalizado', ...Object.keys(PRAZOS_PADRAO)]
      .some((key) => antes[key] !== depois[key]);
    if (changed) {
      await audit(deps, transaction, {
        obraId,
        userId: user?.id,
        event: 'CR_PRAZOS_OBRA_ALTERADOS',
        description: restaurarPadrao ? 'Prazos da obra restaurados ao padrao.' : 'Prazos da obra alterados.',
        payload: { antes, depois }
      });
    }
    return { idempotente: !changed, obra_id: obraId, ...depois };
  });
}

/* --------------------------------------------------------- dilatacao */

function serializeDilatacao(value) {
  const item = plain(value);
  return {
    id: Number(item.id),
    obra_id: Number(item.obra_id),
    obra: item.obra ? { id: Number(item.obra.id), codigo: item.obra.codigo || null, nome: item.obra.nome } : null,
    competencia_id: Number(item.competencia_id),
    competencia: item.competencia?.competencia || item.competencia_codigo || null,
    dias: Number(item.dias),
    motivo: item.motivo,
    situacao: item.situacao,
    solicitado_por: Number(item.solicitado_por),
    solicitante: item.solicitadoPor ? { id: Number(item.solicitadoPor.id), nome: item.solicitadoPor.nome } : null,
    solicitado_em: item.createdAt || null,
    decidido_por: item.decidido_por ? Number(item.decidido_por) : null,
    decisor: item.decididoPor ? { id: Number(item.decididoPor.id), nome: item.decididoPor.nome } : null,
    decidido_em: item.decidido_em || null,
    observacao_decisao: item.observacao_decisao || null,
    prazo_anterior: item.prazo_anterior || null,
    prazo_novo: item.prazo_novo || null
  };
}

function dilatacaoIncludes(deps) {
  return [
    { model: deps.Obra, as: 'obra', attributes: ['id', 'codigo', 'nome'], required: false },
    { model: deps.CrCompetencia, as: 'competencia', attributes: ['id', 'competencia'], required: false },
    { model: deps.User, as: 'solicitadoPor', attributes: ['id', 'nome'], required: false },
    { model: deps.User, as: 'decididoPor', attributes: ['id', 'nome'], required: false }
  ];
}

async function contextoMedicao(obraId, competencia, deps) {
  const context = (await deps.carregarContextoPrazos([obraId])).get(obraId) || {};
  const registro = (context.competencias || []).find((item) => item.competencia === competencia) || null;
  return { context, registro };
}

async function solicitarDilatacao(user, obraIdValue, competenciaValue, payload = {}, overrides = {}) {
  const deps = dependencies(overrides);
  const obraId = positiveId(obraIdValue, 'Obra');
  const competencia = normalizeCompetencia(competenciaValue);
  const dias = Number(payload.dias);
  const motivo = text(payload.motivo);
  if (!Number.isInteger(dias) || dias < DILATACAO_DIAS.min || dias > DILATACAO_DIAS.max) {
    throw createBusinessError(
      422,
      'CR_DILATACAO_DIAS_INVALIDOS',
      `Informe de ${DILATACAO_DIAS.min} a ${DILATACAO_DIAS.max} dias.`
    );
  }
  if (motivo.length < 10) {
    throw createBusinessError(422, 'CR_DILATACAO_MOTIVO_REQUIRED', 'Informe um motivo com pelo menos 10 caracteres.');
  }
  await assertScope(user, obraId, deps);
  const now = deps.now();
  if (competencia > competenciaNoInstante(now)) {
    throw createBusinessError(409, 'CR_DILATACAO_MES_FUTURO', 'A medicao deste mes ainda nao esta em prazo.');
  }
  const obra = await deps.Obra.findByPk(obraId, { attributes: ['id', 'classificacao'] });
  if (!obra) throw createBusinessError(404, 'CR_OBRA_NOT_FOUND', 'Obra nao encontrada.');
  if (String(obra.classificacao || '').toUpperCase() !== 'PUBLICA') {
    throw createBusinessError(409, 'CR_MEDICAO_APENAS_OBRA_PUBLICA', 'Dilatacao de medicao existe somente em obra publica.');
  }
  const { context, registro } = await contextoMedicao(obraId, competencia, deps);
  if (registro?.tem_medicao_aprovada) {
    throw createBusinessError(409, 'CR_DILATACAO_MEDICAO_REGISTRADA', 'A medicao aprovada deste mes ja foi registrada.');
  }
  const prazoVigente = prazoMedicaoEfetivo(competencia, context.config, registro?.dilatacao_prazo);
  // Decisao de 29/09: so se pede dilatacao com o prazo ja vencido (obra
  // travada por ele); com prazo correndo nao ha o que dilatar.
  if (prazoVigente > now) {
    throw createBusinessError(409, 'CR_DILATACAO_PRAZO_EM_ABERTO', 'A dilatacao so pode ser pedida depois que o prazo da medicao aprovada vencer.');
  }

  return deps.sequelize.transaction(async (transaction) => {
    const competenciaRecord = await getOrCreateCompetencia(obraId, competencia, deps, transaction);
    const pending = await deps.CrDilatacao.findOne({
      where: { competencia_id: competenciaRecord.id, situacao: 'SOLICITADA' },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (pending) return { idempotente: true, dilatacao: serializeDilatacao(pending) };
    const record = await deps.CrDilatacao.create({
      obra_id: obraId,
      competencia_id: Number(competenciaRecord.id),
      dias,
      motivo,
      situacao: 'SOLICITADA',
      solicitado_por: user?.id,
      prazo_anterior: prazoVigente
    }, { transaction });
    await audit(deps, transaction, {
      obraId,
      competenciaId: competenciaRecord.id,
      userId: user?.id,
      event: 'CR_DILATACAO_SOLICITADA',
      description: 'Dilatacao do prazo da medicao aprovada solicitada.',
      payload: { dias, motivo, prazo_vigente: prazoVigente }
    });
    return {
      idempotente: false,
      dilatacao: serializeDilatacao({ ...plain(record), competencia_codigo: competencia })
    };
  });
}

async function decidirDilatacao(user, dilatacaoIdValue, payload = {}, overrides = {}) {
  const deps = dependencies(overrides);
  const dilatacaoId = positiveId(dilatacaoIdValue, 'Dilatacao');
  const decisao = text(payload.decisao || payload.situacao, 20).toUpperCase();
  if (!['APROVADA', 'NEGADA'].includes(decisao)) {
    throw createBusinessError(422, 'CR_DILATACAO_DECISAO_INVALIDA', 'Informe APROVADA ou NEGADA.');
  }
  const observacao = text(payload.observacao) || null;
  const existing = await deps.CrDilatacao.findByPk(dilatacaoId, {
    include: [{ model: deps.CrCompetencia, as: 'competencia', attributes: ['id', 'competencia'] }]
  });
  if (!existing) throw createBusinessError(404, 'CR_DILATACAO_NOT_FOUND', 'Pedido de dilatacao nao encontrado.');
  const obraId = Number(existing.obra_id);
  await assertScope(user, obraId, deps);
  const competencia = existing.competencia?.competencia;
  const now = deps.now();

  return deps.sequelize.transaction(async (transaction) => {
    const record = await deps.CrDilatacao.findByPk(dilatacaoId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (record.situacao !== 'SOLICITADA') {
      if (record.situacao === decisao) return { idempotente: true, dilatacao: serializeDilatacao(record) };
      throw createBusinessError(409, 'CR_DILATACAO_JA_DECIDIDA', 'Este pedido ja foi decidido.');
    }
    const values = {
      situacao: decisao,
      decidido_por: user?.id || null,
      decidido_em: now,
      observacao_decisao: observacao
    };
    if (decisao === 'APROVADA') {
      const { context, registro } = await contextoMedicao(obraId, competencia, deps);
      // Medicao registrada depois do pedido: aprovar reabriria a edicao sem
      // reabertura. O administrador nega (o pedido perdeu o objeto).
      if (registro?.tem_medicao_aprovada) {
        throw createBusinessError(
          409,
          'CR_DILATACAO_MEDICAO_REGISTRADA',
          'A medicao aprovada deste mes ja foi registrada; negue o pedido de dilatacao.'
        );
      }
      const vigente = prazoMedicaoEfetivo(competencia, context.config, registro?.dilatacao_prazo);
      const daAprovacao = fimDoDiaBrasilia(now, Number(record.dias));
      values.prazo_anterior = vigente;
      values.prazo_novo = daAprovacao > vigente ? daAprovacao : vigente;
    }
    await record.update(values, { transaction });
    await audit(deps, transaction, {
      obraId,
      competenciaId: record.competencia_id,
      userId: user?.id,
      event: decisao === 'APROVADA' ? 'CR_DILATACAO_APROVADA' : 'CR_DILATACAO_NEGADA',
      description: decisao === 'APROVADA'
        ? 'Dilatacao do prazo da medicao aprovada concedida.'
        : 'Dilatacao do prazo da medicao aprovada negada.',
      payload: {
        dilatacao_id: dilatacaoId,
        dias: Number(record.dias),
        prazo_anterior: values.prazo_anterior || null,
        prazo_novo: values.prazo_novo || null,
        observacao
      }
    });
    return { idempotente: false, dilatacao: serializeDilatacao({ ...plain(record), competencia_codigo: competencia }) };
  });
}

async function listarDilatacoes(user, query = {}, overrides = {}) {
  const deps = dependencies(overrides);
  const scope = await deps.resolverEscopoObras(user);
  const where = {};
  if (query.obra_id) where.obra_id = positiveId(query.obra_id, 'Obra');
  if (!scope.todas) {
    if (where.obra_id && !scope.obraIds.includes(where.obra_id)) {
      throw createBusinessError(403, 'CR_OBRA_FORA_ESCOPO', 'Acesso negado para esta obra.');
    }
    if (!where.obra_id) where.obra_id = { [Op.in]: scope.obraIds };
  }
  const situacao = text(query.situacao, 20).toUpperCase();
  if (['SOLICITADA', 'APROVADA', 'NEGADA'].includes(situacao)) where.situacao = situacao;
  // Sem a migration 202609290001 (tabela ausente) a lista vem vazia, sem 500.
  const rows = await deps.CrDilatacao.findAll({
    where,
    include: dilatacaoIncludes(deps),
    // Fila por ordem de pedido; historico tambem em ordem cronologica. A tela
    // pede a fila (situacao=SOLICITADA) e o historico por obra (obra_id)
    // separados, entao o limite nao corta pendentes nem o periodo da obra.
    order: [['createdAt', 'ASC'], ['id', 'ASC']],
    limit: 2000
  }).catch((error) => {
    if (isMissingTableError(error)) return [];
    throw error;
  });
  return { items: rows.map(serializeDilatacao) };
}

async function resolverObraIdPorDilatacao(dilatacaoId) {
  const record = await db.CrDilatacao.findByPk(Number(dilatacaoId), { attributes: ['obra_id'] });
  return record ? Number(record.obra_id) : null;
}

module.exports = {
  DILATACAO_DIAS,
  decidirDilatacao,
  listarDilatacoes,
  listarPrazosObras,
  resolverObraIdPorDilatacao,
  salvarPrazosObra,
  solicitarDilatacao,
  validarConfig
};
