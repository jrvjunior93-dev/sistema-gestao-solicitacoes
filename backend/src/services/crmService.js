const { Op, fn, col } = require('sequelize');
const {
  CrmConversation,
  CrmInteraction,
  CrmLead,
  CrmPipeline,
  CrmPipelineStage,
  CrmLossReason,
  CrmAuditLog,
  Notificacao,
  NotificacaoDestinatario,
  User
} = require('../models');
const { dispararEventoAutomacaoCrm } = require('./crmAutomationRuntimeService');
const { canReceiveCrmLeadAssignment } = require('./authorizationService');
const { notificacaoEventoAtivo } = require('./notificacaoConfigService');
const { onlyDigits, isValidCpfCnpj } = require('../utils/cpfCnpj');

const LEAD_EXPORT_MAX_ROWS = 5000;
const CSV_FORMULA_REGEX = /^[=+\-@]/;
const CRM_LEAD_BACKLOG_STATUSES = ['NOVO', 'CONTATO', 'QUALIFICADO', 'OPORTUNIDADE'];

function normalizeLeadDocument(value) {
  if (value == null || String(value).trim() === '') return null;
  if (!isValidCpfCnpj(value)) {
    throw Object.assign(new Error('CPF/CNPJ do lead invalido.'), { status: 400, statusCode: 400 });
  }
  return onlyDigits(value);
}
const CSV_DATE_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
});

// -------------------------------------------------------
// Audit
// -------------------------------------------------------
async function registrarAuditCrm({
  leadId,
  userId,
  eventType,
  fieldChanged,
  oldValue,
  newValue,
  metadata,
  req,
  resourceType = 'LEAD',
  resourceId = null
}) {
  try {
    await CrmAuditLog.create({
      lead_id: leadId || null,
      user_id: userId || null,
      event_type: eventType,
      resource_type: resourceType,
      resource_id: resourceId != null ? resourceId : leadId || null,
      field_changed: fieldChanged || null,
      old_value: oldValue != null ? String(oldValue) : null,
      new_value: newValue != null ? String(newValue) : null,
      metadata: metadata || null,
      ip_address: req?.ip || null
    });
  } catch (err) {
    console.error('[CRM Audit] Erro ao registrar audit:', err);
  }
}

function toPositiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function sanitizeMotivoRedistribuicao(value) {
  const text = String(value || '').trim();
  return text ? text.slice(0, 500) : null;
}

async function criarNotificacaoCrm({ tipo, mensagem, metadata, destinatarios, createdBy }) {
  const tipoNormalizado = String(tipo || '').trim().toUpperCase();
  if (!(await notificacaoEventoAtivo(tipoNormalizado))) {
    return null;
  }

  const usuarios = [
    ...new Set(
      (Array.isArray(destinatarios) ? destinatarios : [])
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0)
    )
  ];

  if (!usuarios.length) {
    return null;
  }

  const notificacao = await Notificacao.create({
    solicitacao_id: null,
    tipo: tipoNormalizado,
    mensagem,
    metadata: metadata ? JSON.stringify(metadata) : null,
    created_by: createdBy || null
  });

  await NotificacaoDestinatario.bulkCreate(
    usuarios.map((usuarioId) => ({
      notificacao_id: notificacao.id,
      usuario_id: usuarioId
    }))
  );

  return notificacao;
}

async function listarCandidatosRedistribuicao() {
  const usuariosAtivos = await User.findAll({
    where: { ativo: true },
    attributes: ['id', 'nome', 'email', 'perfil'],
    order: [['nome', 'ASC']]
  });
  const usuarios = [];

  for (const usuario of usuariosAtivos) {
    if (await canReceiveCrmLeadAssignment(usuario)) {
      usuarios.push(usuario);
    }
  }

  const ids = usuarios.map((usuario) => Number(usuario.id)).filter(Boolean);
  if (!ids.length) {
    return [];
  }

  const counts = await CrmLead.findAll({
    where: {
      archived_at: null,
      lifecycle_status: { [Op.in]: CRM_LEAD_BACKLOG_STATUSES },
      assigned_user_id: { [Op.in]: ids }
    },
    attributes: ['assigned_user_id', [fn('COUNT', col('id')), 'total']],
    group: ['assigned_user_id'],
    raw: true
  });

  const countsMap = new Map(
    counts.map((row) => [Number(row.assigned_user_id), Number(row.total || 0)])
  );

  return usuarios.map((usuario) => ({
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    perfil: usuario.perfil,
    backlog_aberto: countsMap.get(Number(usuario.id)) || 0
  }));
}

async function resolverUsuarioRedistribuicao({ assignedUserId, currentAssignedUserId } = {}) {
  const candidatos = await listarCandidatosRedistribuicao();
  const destinoInformado = toPositiveInteger(assignedUserId);

  if (destinoInformado) {
    const candidato = candidatos.find((usuario) => Number(usuario.id) === destinoInformado);
    if (!candidato) {
      throw Object.assign(new Error('Usuario informado nao esta elegivel para redistribuicao CRM.'), { status: 400 });
    }
    return candidato;
  }

  const candidatosDisponiveis = candidatos.filter((usuario) => Number(usuario.id) !== Number(currentAssignedUserId));
  if (!candidatosDisponiveis.length) {
    throw Object.assign(new Error('Nao existem usuarios elegiveis para redistribuir este lead.'), { status: 400 });
  }

  return [...candidatosDisponiveis].sort((a, b) => {
    if (Number(a.backlog_aberto || 0) !== Number(b.backlog_aberto || 0)) {
      return Number(a.backlog_aberto || 0) - Number(b.backlog_aberto || 0);
    }
    return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
  })[0];
}

// -------------------------------------------------------
// Dedup
// -------------------------------------------------------
async function verificarDuplicata(dados) {
  const or = [];
  if (dados.telefone) or.push({ telefone: dados.telefone });
  if (dados.email) or.push({ email: dados.email });
  if (dados.documento) or.push({ documento: dados.documento });
  if (dados.external_source_id) or.push({ external_source_id: dados.external_source_id });
  if (!or.length) return null;

  const existente = await CrmLead.findOne({
    where: {
      [Op.or]: or,
      archived_at: null
    },
    attributes: ['id', 'nome', 'lifecycle_status', 'createdAt']
  });
  return existente;
}

// -------------------------------------------------------
// Leads
// -------------------------------------------------------
function buildLeadWhere(query = {}) {
  const { q, status, temperatura, stage_id, pipeline_id, assigned_user_id, source_type } = query;

  const where = { archived_at: null };

  if (status) where.lifecycle_status = String(status).toUpperCase();
  if (temperatura) where.temperatura = String(temperatura).toUpperCase();
  if (stage_id) where.pipeline_stage_id = Number(stage_id);
  if (pipeline_id) where.pipeline_id = Number(pipeline_id);
  if (assigned_user_id) where.assigned_user_id = Number(assigned_user_id);
  if (source_type) where.source_type = String(source_type).toUpperCase();

  if (q) {
    where[Op.or] = [
      { nome: { [Op.like]: `%${q}%` } },
      { email: { [Op.like]: `%${q}%` } },
      { telefone: { [Op.like]: `%${q}%` } },
      { empreendimento_interesse: { [Op.like]: `%${q}%` } }
    ];
  }

  return where;
}

function buildLeadListInclude() {
  return [
    { model: CrmPipelineStage, as: 'etapa', attributes: ['id', 'nome', 'cor', 'is_won', 'is_lost'] },
    { model: CrmPipeline, as: 'pipeline', attributes: ['id', 'nome'] },
    { model: User, as: 'responsavel', attributes: ['id', 'nome', 'perfil'] },
    { model: CrmLossReason, as: 'motivoPerda', attributes: ['id', 'nome'] }
  ];
}

function formatCsvCell(value) {
  if (value == null) {
    return '""';
  }

  let text = value;
  if (Array.isArray(text)) {
    text = text.join(' | ');
  } else if (typeof text === 'object') {
    text = JSON.stringify(text);
  }

  text = String(text).replace(/\r\n|\r|\n/g, ' ').trim();
  if (CSV_FORMULA_REGEX.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

function formatCsvDate(value) {
  if (!value) return '';

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return CSV_DATE_FORMATTER.format(date);
}

function buildLeadExportHeaders() {
  return [
    'ID',
    'Nome',
    'Telefone',
    'Email',
    'Documento',
    'Status',
    'Temperatura',
    'Pipeline',
    'Etapa',
    'Responsavel',
    'Origem',
    'Fonte',
    'Campanha',
    'Empreendimento interesse',
    'Produto interesse',
    'Faixa valor',
    'Cidade',
    'Estado',
    'Score',
    'Proximo follow-up',
    'Ultima interacao',
    'Primeiro contato',
    'Convertido em',
    'Motivo perda',
    'Observacoes',
    'Criado em'
  ];
}

function mapLeadToExportRow(lead) {
  return [
    lead.id,
    lead.nome,
    lead.telefone,
    lead.email,
    lead.documento,
    lead.lifecycle_status,
    lead.temperatura,
    lead.pipeline?.nome,
    lead.etapa?.nome,
    lead.responsavel?.nome,
    lead.source_type,
    lead.source_name,
    lead.campaign_name,
    lead.empreendimento_interesse,
    lead.produto_interesse,
    lead.faixa_valor,
    lead.cidade,
    lead.estado,
    lead.score,
    formatCsvDate(lead.proximo_followup_at),
    formatCsvDate(lead.ultima_interacao_at),
    formatCsvDate(lead.primeiro_contato_at),
    formatCsvDate(lead.convertido_at),
    lead.motivoPerda?.nome || lead.motivo_perda_obs,
    lead.observacoes,
    formatCsvDate(lead.createdAt)
  ];
}

async function listarLeads(query = {}) {
  const { page = 1, limit = 50 } = query;
  const where = buildLeadWhere(query);
  const offset = (Number(page) - 1) * Number(limit);

  const { count, rows } = await CrmLead.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: Number(limit),
    offset,
    include: buildLeadListInclude()
  });

  return { total: count, page: Number(page), leads: rows };
}

async function exportarLeadsCsv(query = {}, userId, req) {
  const where = buildLeadWhere(query);
  const totalEncontrado = await CrmLead.count({ where });
  const exportados = await CrmLead.findAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: LEAD_EXPORT_MAX_ROWS,
    include: buildLeadListInclude()
  });

  const headers = buildLeadExportHeaders().map(formatCsvCell).join(';');
  const rows = exportados.map((lead) => mapLeadToExportRow(lead).map(formatCsvCell).join(';'));
  const csv = [headers, ...rows].join('\r\n');
  const truncado = totalEncontrado > exportados.length;
  const filtrosAplicados = Object.entries(query || {}).reduce((acc, [key, value]) => {
    if (value === undefined || value === null || value === '') {
      return acc;
    }
    acc[key] = value;
    return acc;
  }, {});

  await registrarAuditCrm({
    userId,
    eventType: 'LEADS_EXPORTED',
    resourceType: 'CRM_LEADS',
    metadata: {
      filtros: filtrosAplicados,
      total_encontrado: totalEncontrado,
      total_exportado: exportados.length,
      truncado,
      limite_maximo: LEAD_EXPORT_MAX_ROWS
    },
    req
  });

  return {
    csv,
    totalEncontrado,
    totalExportado: exportados.length,
    truncado
  };
}

async function obterLead(id) {
  const lead = await CrmLead.findByPk(id, {
    include: [
      { model: CrmPipelineStage, as: 'etapa' },
      { model: CrmPipeline, as: 'pipeline' },
      { model: User, as: 'responsavel', attributes: ['id', 'nome', 'perfil', 'email'] },
      { model: CrmLossReason, as: 'motivoPerda' },
      { model: User, as: 'criadoPor', attributes: ['id', 'nome'] },
      { model: User, as: 'atualizadoPor', attributes: ['id', 'nome'] },
      {
        model: CrmAuditLog,
        as: 'auditLogs',
        limit: 50,
        order: [['createdAt', 'DESC']],
        include: [{ model: User, as: 'usuario', attributes: ['id', 'nome'] }]
      }
    ]
  });
  if (!lead) throw Object.assign(new Error('Lead nao encontrado'), { status: 404 });
  return lead;
}

async function criarLead(dados, userId, req) {
  const normalizedData = {
    ...dados,
    documento: normalizeLeadDocument(dados.documento)
  };
  const dup = await verificarDuplicata(normalizedData);
  if (dup) {
    throw Object.assign(
      new Error(`Lead duplicado: ja existe lead com id ${dup.id} (${dup.nome})`),
      { status: 409, duplicateId: dup.id }
    );
  }

  // Busca pipeline/etapa padrão se não informado
  let pipelineId = normalizedData.pipeline_id || null;
  let stageId = normalizedData.pipeline_stage_id || null;

  if (!pipelineId) {
    const pipeline = await CrmPipeline.findOne({ where: { is_default: true, ativo: true } });
    if (pipeline) {
      pipelineId = pipeline.id;
      const initialStage = await CrmPipelineStage.findOne({
        where: { pipeline_id: pipeline.id, is_initial: true, ativo: true }
      });
      if (initialStage) {
        stageId = initialStage.id;
      } else {
        const firstStage = await CrmPipelineStage.findOne({
          where: { pipeline_id: pipeline.id, ativo: true },
          order: [['ordem', 'ASC'], ['id', 'ASC']]
        });
        if (firstStage) stageId = firstStage.id;
      }
    }
  }

  const lead = await CrmLead.create({
    ...normalizedData,
    pipeline_id: pipelineId,
    pipeline_stage_id: stageId,
    lifecycle_status: 'NOVO',
    criado_por: userId,
    atualizado_por: userId
  });

  await registrarAuditCrm({
    leadId: lead.id,
    userId,
    eventType: 'LEAD_CREATED',
    metadata: { source_type: lead.source_type, nome: lead.nome },
    req
  });

  await dispararEventoAutomacaoCrm('LEAD_CREATED', {
    leadId: lead.id,
    actorUserId: userId || null,
    req,
    metadata: { source_type: lead.source_type, nome: lead.nome }
  });

  return lead;
}

async function atualizarLead(id, dados, userId, req) {
  const lead = await CrmLead.findByPk(id);
  if (!lead) throw Object.assign(new Error('Lead nao encontrado'), { status: 404 });

  const camposPermitidos = [
    'nome', 'telefone', 'email', 'documento', 'cidade', 'estado',
    'empreendimento_interesse', 'produto_interesse', 'faixa_valor',
    'observacoes', 'tags', 'score', 'temperatura', 'proximo_followup_at',
    'source_name', 'source_detail', 'campaign_name', 'utm_source', 'utm_medium',
    'utm_campaign', 'utm_content', 'utm_term'
  ];

  const updates = {};
  for (const campo of camposPermitidos) {
    if (dados[campo] !== undefined) updates[campo] = dados[campo];
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'documento')) {
    updates.documento = normalizeLeadDocument(updates.documento);
  }
  updates.atualizado_por = userId;
  updates.ultima_interacao_at = new Date();

  await lead.update(updates);

  await registrarAuditCrm({
    leadId: id,
    userId,
    eventType: 'LEAD_UPDATED',
    metadata: { campos: Object.keys(updates) },
    req
  });

  return lead.reload();
}

async function alterarEtapa(id, stageId, userId, req) {
  const lead = await CrmLead.findByPk(id);
  if (!lead) throw Object.assign(new Error('Lead nao encontrado'), { status: 404 });

  const etapa = await CrmPipelineStage.findByPk(stageId);
  if (!etapa) throw Object.assign(new Error('Etapa nao encontrada'), { status: 404 });

  const oldStageId = lead.pipeline_stage_id;

  const updates = {
    pipeline_stage_id: stageId,
    pipeline_id: etapa.pipeline_id,
    atualizado_por: userId,
    ultima_interacao_at: new Date()
  };

  if (etapa.is_won) {
    updates.lifecycle_status = 'CONVERTIDO';
    updates.convertido_at = new Date();
  } else if (etapa.is_lost) {
    updates.lifecycle_status = 'PERDIDO';
  } else if (['CONVERTIDO', 'PERDIDO'].includes(lead.lifecycle_status)) {
    updates.lifecycle_status = 'OPORTUNIDADE';
  }

  if (!lead.primeiro_contato_at && etapa.ordem > 1) {
    updates.primeiro_contato_at = new Date();
  }

  await lead.update(updates);

  await registrarAuditCrm({
    leadId: id,
    userId,
    eventType: 'LEAD_STAGE_CHANGED',
    fieldChanged: 'pipeline_stage_id',
    oldValue: oldStageId,
    newValue: stageId,
    metadata: { etapa_nome: etapa.nome },
    req
  });

  await dispararEventoAutomacaoCrm('STAGE_CHANGED', {
    leadId: id,
    actorUserId: userId || null,
    oldStageId,
    newStageId: stageId,
    req,
    metadata: { etapa_nome: etapa.nome }
  });

  return lead.reload({ include: [{ model: CrmPipelineStage, as: 'etapa' }] });
}

async function registrarPerda(id, motivoId, obs, userId, req) {
  const lead = await CrmLead.findByPk(id);
  if (!lead) throw Object.assign(new Error('Lead nao encontrado'), { status: 404 });

  const lostStage = await CrmPipelineStage.findOne({
    where: { pipeline_id: lead.pipeline_id || 1, is_lost: true, ativo: true }
  });

  await lead.update({
    lifecycle_status: 'PERDIDO',
    motivo_perda_id: motivoId || null,
    motivo_perda_obs: obs || null,
    pipeline_stage_id: lostStage?.id || lead.pipeline_stage_id,
    atualizado_por: userId,
    ultima_interacao_at: new Date()
  });

  await registrarAuditCrm({
    leadId: id,
    userId,
    eventType: 'LEAD_LOST',
    fieldChanged: 'lifecycle_status',
    oldValue: 'OPORTUNIDADE',
    newValue: 'PERDIDO',
    metadata: { motivo_id: motivoId, obs },
    req
  });

  await dispararEventoAutomacaoCrm('LEAD_REFUSED', {
    leadId: id,
    actorUserId: userId || null,
    lossReasonId: motivoId || null,
    req,
    metadata: { motivo_id: motivoId, obs }
  });

  return lead.reload();
}

async function registrarConversao(id, userId, req) {
  const lead = await CrmLead.findByPk(id);
  if (!lead) throw Object.assign(new Error('Lead nao encontrado'), { status: 404 });

  const wonStage = await CrmPipelineStage.findOne({
    where: { pipeline_id: lead.pipeline_id || 1, is_won: true, ativo: true }
  });

  await lead.update({
    lifecycle_status: 'CONVERTIDO',
    convertido_at: new Date(),
    pipeline_stage_id: wonStage?.id || lead.pipeline_stage_id,
    atualizado_por: userId,
    ultima_interacao_at: new Date()
  });

  await registrarAuditCrm({
    leadId: id,
    userId,
    eventType: 'LEAD_CONVERTED',
    fieldChanged: 'lifecycle_status',
    oldValue: lead.lifecycle_status,
    newValue: 'CONVERTIDO',
    req
  });

  return lead.reload();
}

async function arquivarLead(id, userId, req) {
  const lead = await CrmLead.findByPk(id);
  if (!lead) throw Object.assign(new Error('Lead nao encontrado'), { status: 404 });

  await lead.update({
    archived_at: new Date(),
    lifecycle_status: 'ARQUIVADO',
    atualizado_por: userId
  });

  await registrarAuditCrm({ leadId: id, userId, eventType: 'LEAD_ARCHIVED', req });
  return lead;
}

async function redistribuirLead(id, dados = {}, userId, req) {
  const lead = await CrmLead.findByPk(id, {
    include: [{ model: User, as: 'responsavel', attributes: ['id', 'nome', 'email', 'perfil'] }]
  });
  if (!lead) throw Object.assign(new Error('Lead nao encontrado'), { status: 404 });
  if (lead.archived_at || lead.lifecycle_status === 'ARQUIVADO') {
    throw Object.assign(new Error('Lead arquivado nao pode ser redistribuido.'), { status: 400 });
  }

  const motivo = sanitizeMotivoRedistribuicao(dados.motivo);
  const usuarioDestino = await resolverUsuarioRedistribuicao({
    assignedUserId: dados.assigned_user_id,
    currentAssignedUserId: lead.assigned_user_id
  });

  const oldUserId = lead.assigned_user_id || null;
  if (oldUserId && Number(oldUserId) === Number(usuarioDestino.id)) {
    throw Object.assign(new Error('Lead ja esta atribuido para o usuario informado.'), { status: 400 });
  }

  const oldUser = oldUserId
    ? await User.findByPk(oldUserId, { attributes: ['id', 'nome', 'email', 'perfil'] })
    : null;

  await lead.update({
    assigned_user_id: usuarioDestino.id,
    owner_type: 'INDIVIDUAL',
    atualizado_por: userId || null
  });

  await CrmConversation.update(
    { assigned_user_id: usuarioDestino.id },
    {
      where: {
        lead_id: lead.id,
        status: { [Op.in]: ['OPEN', 'PENDING'] }
      }
    }
  );

  await CrmInteraction.create({
    lead_id: lead.id,
    user_id: userId || null,
    interaction_type: 'SYSTEM_EVENT',
    title: 'Lead redistribuido',
    content: [
      `Responsavel anterior: ${oldUser?.nome || 'sem responsavel'}.`,
      `Novo responsavel: ${usuarioDestino.nome}.`,
      motivo ? `Motivo: ${motivo}` : null
    ].filter(Boolean).join(' '),
    metadata_json: {
      old_assigned_user_id: oldUserId,
      new_assigned_user_id: usuarioDestino.id,
      motivo
    }
  });

  await registrarAuditCrm({
    leadId: lead.id,
    userId,
    eventType: 'LEAD_REDISTRIBUTED',
    fieldChanged: 'assigned_user_id',
    oldValue: oldUserId,
    newValue: usuarioDestino.id,
    metadata: {
      old_assigned_user_id: oldUserId,
      old_assigned_user_name: oldUser?.nome || null,
      new_assigned_user_id: usuarioDestino.id,
      new_assigned_user_name: usuarioDestino.nome,
      motivo
    },
    req
  });

  await criarNotificacaoCrm({
    tipo: 'CRM_LEAD_REDISTRIBUIDO',
    mensagem: `Lead ${lead.nome} redistribuido para ${usuarioDestino.nome}.`,
    metadata: {
      lead_id: lead.id,
      old_assigned_user_id: oldUserId,
      new_assigned_user_id: usuarioDestino.id,
      motivo
    },
    destinatarios: [oldUserId, usuarioDestino.id].filter(Boolean),
    createdBy: userId || null
  });

  return obterLead(lead.id);
}

// -------------------------------------------------------
// Pipelines
// -------------------------------------------------------
async function listarPipelines() {
  return CrmPipeline.findAll({
    where: { ativo: true },
    include: [{
      model: CrmPipelineStage,
      as: 'etapas',
      where: { ativo: true },
      separate: true,
      order: [['ordem', 'ASC'], ['id', 'ASC']]
    }],
    order: [['is_default', 'DESC'], ['nome', 'ASC']]
  });
}

function sanitizeStagePayload(dados = {}, { partial = false } = {}) {
  const payload = {};

  if (dados.nome !== undefined || !partial) {
    const nome = String(dados.nome || '').trim();
    if (!nome) {
      throw Object.assign(new Error('Nome da etapa e obrigatorio.'), { status: 400 });
    }
    payload.nome = nome.slice(0, 120);
  }

  if (dados.cor !== undefined) {
    const cor = String(dados.cor || '').trim();
    payload.cor = /^#[0-9a-fA-F]{6}$/.test(cor) ? cor : '#6366f1';
  }

  if (dados.ordem !== undefined) {
    const ordem = Number(dados.ordem);
    if (!Number.isInteger(ordem) || ordem < 0) {
      throw Object.assign(new Error('Ordem da etapa invalida.'), { status: 400 });
    }
    payload.ordem = ordem;
  }

  if (dados.sla_minutes !== undefined) {
    if (dados.sla_minutes === '' || dados.sla_minutes === null) {
      payload.sla_minutes = null;
    } else {
      const sla = Number(dados.sla_minutes);
      if (!Number.isInteger(sla) || sla < 0) {
        throw Object.assign(new Error('SLA da etapa invalido.'), { status: 400 });
      }
      payload.sla_minutes = sla;
    }
  }

  if (dados.requires_followup !== undefined) {
    payload.requires_followup = dados.requires_followup === true || dados.requires_followup === 'true' || dados.requires_followup === 1 || dados.requires_followup === '1';
  }

  if (dados.requires_loss_reason !== undefined) {
    payload.requires_loss_reason = dados.requires_loss_reason === true || dados.requires_loss_reason === 'true' || dados.requires_loss_reason === 1 || dados.requires_loss_reason === '1';
  }

  return payload;
}

async function criarEtapaPipeline(pipelineId, dados = {}, userId, req) {
  const id = toPositiveInteger(pipelineId);
  if (!id) throw Object.assign(new Error('Pipeline invalido.'), { status: 400 });

  const pipeline = await CrmPipeline.findOne({ where: { id, ativo: true } });
  if (!pipeline) throw Object.assign(new Error('Pipeline nao encontrado.'), { status: 404 });

  const payload = sanitizeStagePayload(dados);
  if (payload.ordem === undefined) {
    const ultimaEtapa = await CrmPipelineStage.findOne({
      where: { pipeline_id: id, ativo: true },
      order: [['ordem', 'DESC'], ['id', 'DESC']]
    });
    payload.ordem = Number(ultimaEtapa?.ordem || 0) + 1;
  }

  const etapa = await CrmPipelineStage.create({
    pipeline_id: id,
    cor: '#6366f1',
    ativo: true,
    ...payload
  });

  await registrarAuditCrm({
    userId,
    eventType: 'PIPELINE_STAGE_CREATED',
    resourceType: 'CRM_PIPELINE_STAGE',
    resourceId: etapa.id,
    metadata: { pipeline_id: id, nome: etapa.nome },
    req
  });

  return etapa;
}

async function atualizarEtapaPipeline(stageId, dados = {}, userId, req) {
  const id = toPositiveInteger(stageId);
  if (!id) throw Object.assign(new Error('Etapa invalida.'), { status: 400 });

  const etapa = await CrmPipelineStage.findByPk(id);
  if (!etapa || !etapa.ativo) throw Object.assign(new Error('Etapa nao encontrada.'), { status: 404 });

  const payload = sanitizeStagePayload(dados, { partial: true });
  if (!Object.keys(payload).length) {
    throw Object.assign(new Error('Nenhuma alteracao informada para a etapa.'), { status: 400 });
  }

  const valoresAnteriores = Object.keys(payload).reduce((acc, campo) => {
    acc[campo] = etapa[campo];
    return acc;
  }, {});

  await etapa.update(payload);

  await registrarAuditCrm({
    userId,
    eventType: 'PIPELINE_STAGE_UPDATED',
    resourceType: 'CRM_PIPELINE_STAGE',
    resourceId: etapa.id,
    metadata: {
      pipeline_id: etapa.pipeline_id,
      antes: valoresAnteriores,
      depois: payload
    },
    req
  });

  return etapa.reload();
}

async function removerEtapaPipeline(stageId, userId, req) {
  const id = toPositiveInteger(stageId);
  if (!id) throw Object.assign(new Error('Etapa invalida.'), { status: 400 });

  const etapa = await CrmPipelineStage.findByPk(id);
  if (!etapa || !etapa.ativo) throw Object.assign(new Error('Etapa nao encontrada.'), { status: 404 });

  const leadsVinculados = await CrmLead.count({
    where: {
      pipeline_stage_id: id,
      archived_at: null
    }
  });

  if (leadsVinculados > 0) {
    throw Object.assign(new Error('Nao e possivel remover uma etapa com leads vinculados.'), { status: 400 });
  }

  const etapasRestantes = await CrmPipelineStage.findAll({
    where: {
      pipeline_id: etapa.pipeline_id,
      ativo: true,
      id: { [Op.ne]: etapa.id }
    },
    order: [['ordem', 'ASC'], ['id', 'ASC']]
  });

  if (!etapasRestantes.length) {
    throw Object.assign(new Error('O pipeline precisa manter pelo menos uma etapa ativa.'), { status: 400 });
  }

  if (etapa.is_initial && !etapasRestantes.some((item) => item.is_initial)) {
    await etapasRestantes[0].update({ is_initial: true });
  }

  await etapa.update({ ativo: false });

  await registrarAuditCrm({
    userId,
    eventType: 'PIPELINE_STAGE_DELETED',
    resourceType: 'CRM_PIPELINE_STAGE',
    resourceId: etapa.id,
    metadata: { pipeline_id: etapa.pipeline_id, nome: etapa.nome },
    req
  });

  return { ok: true };
}

async function listarMotivosPerda() {
  return CrmLossReason.findAll({ where: { ativo: true }, order: [['ordem', 'ASC']] });
}

// -------------------------------------------------------
// Kanban — leads agrupados por etapa
// -------------------------------------------------------
async function kanbanLeads(pipelineId, query = {}) {
  const pipeline = await CrmPipeline.findByPk(pipelineId || 1, {
    include: [{
      model: CrmPipelineStage,
      as: 'etapas',
      where: { ativo: true },
      required: false,
      separate: true,
      order: [['ordem', 'ASC'], ['id', 'ASC']]
    }]
  });
  if (!pipeline) throw Object.assign(new Error('Pipeline nao encontrado'), { status: 404 });

  const baseWhere = { pipeline_id: pipeline.id, archived_at: null };
  if (query.assigned_user_id) baseWhere.assigned_user_id = Number(query.assigned_user_id);
  if (query.temperatura) baseWhere.temperatura = String(query.temperatura).toUpperCase();

  const leads = await CrmLead.findAll({
    where: baseWhere,
    include: [
      { model: User, as: 'responsavel', attributes: ['id', 'nome'] },
      { model: CrmLossReason, as: 'motivoPerda', attributes: ['id', 'nome'] }
    ],
    order: [['ultima_interacao_at', 'DESC'], ['createdAt', 'DESC']]
  });

  const leadsMap = {};
  for (const lead of leads) {
    const key = lead.pipeline_stage_id || 0;
    if (!leadsMap[key]) leadsMap[key] = [];
    leadsMap[key].push(lead);
  }

  const colunas = (pipeline.etapas || []).map((etapa) => ({
    etapa,
    leads: leadsMap[etapa.id] || []
  }));

  return { pipeline, colunas };
}

module.exports = {
  listarLeads,
  exportarLeadsCsv,
  obterLead,
  criarLead,
  atualizarLead,
  alterarEtapa,
  registrarPerda,
  registrarConversao,
  arquivarLead,
  redistribuirLead,
  listarCandidatosRedistribuicao,
  listarPipelines,
  criarEtapaPipeline,
  atualizarEtapaPipeline,
  removerEtapaPipeline,
  listarMotivosPerda,
  kanbanLeads,
  registrarAuditCrm
};
