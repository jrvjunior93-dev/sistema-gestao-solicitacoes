'use strict';

const crypto = require('crypto');
const { Op, fn, col, literal } = require('sequelize');
const {
  GovernancaEventoOperacional,
  Setor,
  User
} = require('../../../models');

const MAX_RANGE_DAYS = 90;
const MAX_EXPORT_ROWS = 10000;
const DEFAULT_RETENTION_DAYS = 365;
const MIN_RETENTION_DAYS = 90;
const MAX_RETENTION_DAYS = 3650;
const SENSITIVE_KEY = /(senha|password|token|authorization|cookie|secret|mfa|chave|pix|cpf|cnpj|conta|agencia|documento|arquivo|anexo|conteudo|body)/i;

function clampText(value, maxLength) {
  const normalized = String(value == null ? '' : value).replace(/[\r\n\t]+/g, ' ').trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizeResourceId(value) {
  const normalized = String(value || '');
  return /^\d{1,18}$/.test(normalized) ? normalized : null;
}

function normalizeResourceCode(value) {
  const normalized = clampText(value, 120);
  if (!normalized || !/^[a-z0-9][a-z0-9._/-]{0,119}$/i.test(normalized)) return null;
  return normalized;
}

function buildSessionReference(value) {
  const normalized = clampText(value, 80);
  if (!normalized) return null;
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 10).toUpperCase();
}

function extractResponseResource(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;

  const queue = [{ value: payload, depth: 0 }];
  while (queue.length) {
    const current = queue.shift();
    const value = current.value;
    const id = normalizeResourceId(value?.id);
    if (id) {
      return { id, code: normalizeResourceCode(value.codigo) };
    }
    if (current.depth >= 2) continue;
    Object.values(value).forEach((item) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        queue.push({ value: item, depth: current.depth + 1 });
      }
    });
  }
  return null;
}

function sanitizeMetadata(value, depth = 0) {
  if (depth > 2 || value == null) return null;
  if (Array.isArray(value)) return value.slice(0, 10).map((item) => sanitizeMetadata(item, depth + 1));
  if (typeof value === 'object') {
    return Object.entries(value).reduce((safe, [key, item]) => {
      if (!SENSITIVE_KEY.test(key)) safe[key] = sanitizeMetadata(item, depth + 1);
      return safe;
    }, {});
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return clampText(value, 240);
}

function extractChangedFieldNames(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.keys(value)
    .filter((key) => !SENSITIVE_KEY.test(key))
    .map((key) => clampText(key, 60))
    .filter(Boolean)
    .slice(0, 30);
}

function normalizeRoute(rawPath) {
  const path = String(rawPath || '/')
    .split('?')[0]
    .replace(/^\/api(?=\/|$)/i, '')
    .replace(/\/+$/, '') || '/';
  return path
    .split('/')
    .map((segment) => {
      if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)) return ':uuid';
      if (segment.length >= 28 && /^[a-z0-9_-]+$/i.test(segment)) return ':token';
      if (/^\d+$/.test(segment)) return ':id';
      return segment;
    })
    .join('/');
}

function inferModule(route) {
  const root = String(route || '/').split('/').filter(Boolean)[0] || 'painel';
  const map = {
    auth: 'AUTENTICACAO', solicitacoes: 'SOLICITACOES', compras: 'COMPRAS',
    'solicitacoes-compra': 'COMPRAS', financeiro: 'FINANCEIRO', comprovantes: 'FINANCEIRO',
    contratos: 'CONTRATOS', comercial: 'COMERCIAL', 'provisoes-financeiras': 'PROVISIONAMENTO',
    rh: 'RH_DP', sst: 'SST', fiscal: 'FISCAL', crm: 'CRM',
    'custos-recebiveis': 'CUSTOS_RECEBIVEIS', governanca: 'GOVERNANCA',
    treinamento: 'TREINAMENTO', 'arquivos-modelos': 'BIBLIOTECA',
    'conversas-internas': 'COMUNICACAO', usuarios: 'ADMINISTRACAO', configuracoes: 'CONFIGURACOES'
  };
  return map[root] || root.replace(/[^a-z0-9]+/gi, '_').toUpperCase().slice(0, 80) || 'SISTEMA';
}

function inferEventType(method, route) {
  const value = String(route || '').toLowerCase();
  const keywordMap = [
    [/estorn|reverter/, 'REVERSE'], [/concili/, 'RECONCILE'], [/aprova/, 'APPROVE'],
    [/rejeit|recus/, 'REJECT'], [/reabr/, 'REOPEN'], [/encerr|finaliz|fechar/, 'CLOSE'],
    [/status/, 'STATUS_CHANGE'], [/deleg|atribui|assum|enviar-setor|encaminh/, 'ASSIGN'], [/coment|mensag/, 'COMMENT'],
    [/import/, 'IMPORT'], [/export|relatorio|pdf/, 'EXPORT'], [/upload|anexo/, 'UPLOAD'],
    [/download|baixar-modelo|presign/, 'DOWNLOAD']
  ];
  const keyword = keywordMap.find(([pattern]) => pattern.test(value));
  if (keyword) return keyword[1];
  if (method === 'POST') return 'CREATE';
  if (method === 'PATCH' || method === 'PUT') return 'UPDATE';
  if (method === 'DELETE') return 'DELETE';
  return 'ACTION';
}

const PAGE_NAMES = [
  [/^\/$/, 'Painel'],
  [/^\/solicitacoes\/:id$/, 'Detalhe da solicitacao'],
  [/^\/solicitacoes\/relatorios\/operacional$/, 'Relatorio operacional de solicitacoes'],
  [/^\/solicitacoes\/relatorios$/, 'Relatorios de solicitacoes'],
  [/^\/solicitacoes-arquivadas$/, 'Solicitacoes arquivadas'],
  [/^\/solicitacoes$/, 'Solicitacoes'],
  [/^\/nova-solicitacao$/, 'Nova solicitacao'],
  [/^\/solicitacoes-compra\/:id\/cotacao$/, 'Cotacao da solicitacao de compra'],
  [/^\/solicitacoes-compra\/finalizada\/:id$/, 'Solicitacao de compra finalizada'],
  [/^\/solicitacoes-compra\/nova$/, 'Nova solicitacao de compra'],
  [/^\/solicitacoes-compra\/revisar$/, 'Revisao da solicitacao de compra'],
  [/^\/solicitacoes-compra\/:id$/, 'Detalhe da solicitacao de compra'],
  [/^\/solicitacoes-compra$/, 'Solicitacoes de compra'],
  [/^\/solicitacoes-compra-direta\/nova$/, 'Nova compra direta'],
  [/^\/solicitacoes-compra-direta\/revisar$/, 'Revisao da compra direta'],
  [/^\/pedidos-compra\/:id$/, 'Detalhe do pedido de compra'],
  [/^\/pedidos-compra$/, 'Pedidos de compra'],
  [/^\/gestao-fornecedores$/, 'Fornecedores de compras'],
  [/^\/cotacoes$/, 'Cotacoes'],
  [/^\/compras\/delegacao$/, 'Delegacao de compras'],
  [/^\/financeiro\/contas-a-pagar$/, 'Contas a pagar'],
  [/^\/financeiro\/contas-a-receber$/, 'Contas a receber'],
  [/^\/financeiro\/titulos\/novo$/, 'Novo titulo financeiro'],
  [/^\/financeiro\/titulos\/:id\/editar$/, 'Edicao do titulo financeiro'],
  [/^\/financeiro\/titulos\/:id$/, 'Detalhe do titulo financeiro'],
  [/^\/financeiro\/conciliacao$/, 'Conciliacao bancaria'],
  [/^\/financeiro\/relatorios(?:\/.*)?$/, 'Relatorios financeiros'],
  [/^\/financeiro\/baixas$/, 'Baixas realizadas'],
  [/^\/financeiro\/cheques-terceiros$/, 'Cheques de terceiros'],
  [/^\/financeiro\/baixas-compostas$/, 'Baixas com multiplas fontes'],
  [/^\/custos-recebiveis$/, 'Custos e Recebiveis'],
  [/^\/governanca\/auditoria-operacional$/, 'Auditoria Operacional'],
  [/^\/usuarios\/:id\/editar$/, 'Edicao do usuario'],
  [/^\/usuarios\/:id$/, 'Detalhe do usuario'],
  [/^\/usuarios\/novo$/, 'Novo usuario'],
  [/^\/usuarios$/, 'Usuarios'],
  [/^\/obras\/:id$/, 'Gestao da obra'],
  [/^\/obras$/, 'Obras']
];

function humanizeRouteSegment(value) {
  const normalized = String(value || '').replace(/^:/, '').replace(/[-_]+/g, ' ').trim();
  if (!normalized) return 'Pagina do sistema';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function inferPageName(route) {
  const normalized = normalizeRoute(route);
  const known = PAGE_NAMES.find(([pattern]) => pattern.test(normalized));
  if (known) return known[1];
  const segments = normalized.split('/').filter((segment) => segment && segment !== ':id');
  return humanizeRouteSegment(segments[segments.length - 1]);
}

function extractLinkedResource(type, body = {}) {
  if (type !== 'UPLOAD') return null;
  const candidates = [
    ['solicitacao_id', 'solicitacoes'],
    ['solicitacao_compra_id', 'solicitacoes-compra'],
    ['pedido_compra_id', 'pedidos-compra'],
    ['titulo_financeiro_id', 'financeiro.titulos'],
    ['titulo_id', 'financeiro.titulos']
  ];
  for (const [field, resourceType] of candidates) {
    const id = normalizeResourceId(body?.[field]);
    if (id) return { id, type: resourceType };
  }
  return null;
}

function buildOperationalContext(req, type, normalizedRoute) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const metadata = {};
  let summary = null;

  if (type === 'STATUS_CHANGE') {
    const status = clampText(body.status, 120);
    if (status) {
      metadata.status_destino = status;
      metadata.interacao_tipo = 'Status alterado';
      summary = `Alterou o status para ${status}`;
    }
  } else if (type === 'ASSIGN' && /enviar-setor|encaminh/i.test(normalizedRoute)) {
    const sector = clampText(body.setor_destino, 120);
    if (sector) {
      metadata.setor_destino = sector;
      metadata.interacao_tipo = 'Envio para outro setor';
      summary = `Enviou o registro para o setor ${sector}`;
    }
  } else if (type === 'COMMENT') {
    metadata.interacao_tipo = /mensag/i.test(normalizedRoute) ? 'Mensagem enviada' : 'Comentario registrado';
    summary = metadata.interacao_tipo;
  } else if (type === 'UPLOAD') {
    const fileCount = Array.isArray(req.files) ? req.files.length : (req.file ? 1 : 0);
    metadata.interacao_tipo = 'Arquivo anexado';
    if (fileCount) metadata.quantidade_itens = fileCount;
    summary = fileCount > 1 ? `Enviou ${fileCount} arquivos` : 'Enviou um arquivo';
  }

  return { metadata, summary };
}

function eventSummary(type, moduleName, result) {
  const labels = {
    CREATE: 'Criou um registro', UPDATE: 'Alterou um registro', DELETE: 'Excluiu um registro',
    STATUS_CHANGE: 'Alterou um status', APPROVE: 'Aprovou um registro', REJECT: 'Rejeitou um registro',
    REOPEN: 'Reabriu um registro', CLOSE: 'Encerrou um registro', ASSIGN: 'Delegou ou assumiu um registro',
    COMMENT: 'Registrou uma interacao', IMPORT: 'Executou uma importacao', EXPORT: 'Gerou uma exportacao',
    UPLOAD: 'Enviou um arquivo', DOWNLOAD: 'Baixou um arquivo', RECONCILE: 'Executou uma conciliacao',
    REVERSE: 'Executou um estorno', PAGE_VIEW: 'Acessou uma pagina', ACTION: 'Executou uma acao'
  };
  const suffix = result === 'SUCCESS' ? '' : result === 'DENIED' ? ' (acesso negado)' : ' (falhou)';
  return `${labels[type] || labels.ACTION} em ${moduleName}${suffix}`;
}

function hashIp(req) {
  const raw = String(req?.headers?.['x-forwarded-for'] || req?.ip || '').split(',')[0].trim();
  if (!raw) return null;
  const pepper = process.env.AUDIT_IP_HASH_SECRET || process.env.JWT_SECRET || 'fluxy-audit';
  return crypto.createHash('sha256').update(`${pepper}:${raw}`).digest('hex');
}

function extractResource(route) {
  const segments = String(route || '').split('?')[0].split('/').filter(Boolean);
  const id = [...segments].reverse().find((part) => /^\d+$/.test(part)) || null;
  const normalized = normalizeRoute(route);
  const pieces = normalized.split('/').filter(Boolean);
  return { id, type: clampText(pieces.slice(0, 3).join('.'), 120) };
}

async function recordEvent(payload) {
  try {
    const metadata = sanitizeMetadata(payload.metadata || {});
    return await GovernancaEventoOperacional.create({
      evento_uuid: clampText(payload.evento_uuid || crypto.randomUUID(), 64),
      ocorrido_em: payload.ocorrido_em || new Date(),
      usuario_id: payload.usuario_id || null,
      setor_id: payload.setor_id || null,
      perfil_snapshot: clampText(payload.perfil_snapshot, 80),
      sessao_id: clampText(payload.sessao_id, 80),
      categoria: clampText(payload.categoria || 'OPERACAO', 40),
      tipo_evento: clampText(payload.tipo_evento || 'ACTION', 80),
      modulo: clampText(payload.modulo || 'SISTEMA', 80),
      pagina_chave: clampText(payload.pagina_chave, 120),
      rota_padrao: clampText(payload.rota_padrao, 255),
      recurso_tipo: clampText(payload.recurso_tipo, 120),
      recurso_id: clampText(payload.recurso_id, 120),
      recurso_codigo: clampText(payload.recurso_codigo, 120),
      empresa_id: payload.empresa_id || null,
      obra_id: payload.obra_id || null,
      acao_chave: clampText(payload.acao_chave, 160),
      resumo: clampText(payload.resumo || 'Evento operacional registrado', 500),
      resultado: clampText(payload.resultado || 'SUCCESS', 40),
      origem: clampText(payload.origem || 'BACKEND', 40),
      request_id: clampText(payload.request_id, 80),
      ip_hash: clampText(payload.ip_hash, 64),
      user_agent_resumo: clampText(payload.user_agent_resumo, 160),
      metadata_json: metadata ? JSON.stringify(metadata) : null
    });
  } catch (error) {
    if (error?.name !== 'SequelizeUniqueConstraintError') {
      console.error('Falha nao bloqueante ao registrar auditoria operacional:', error.message);
    }
    return null;
  }
}

function recordHttpEvent(req, statusCode, responseResource = null) {
  const route = req.originalUrl || req.url || '/';
  const normalized = normalizeRoute(route);
  const moduleName = inferModule(normalized);
  const type = inferEventType(req.method, normalized);
  const routeResource = extractResource(route);
  const linkedResource = extractLinkedResource(type, req.body);
  const responseId = statusCode < 400 ? normalizeResourceId(responseResource?.id) : null;
  const resource = {
    id: routeResource.id || responseId || linkedResource?.id,
    type: linkedResource?.type || routeResource.type,
    code: routeResource.id ? null : normalizeResourceCode(responseResource?.code)
  };
  const result = statusCode < 400 ? 'SUCCESS' : [401, 403].includes(statusCode) ? 'DENIED' : 'FAILED';
  const changedFields = extractChangedFieldNames(req.body);
  const fieldsMetadataKey = req.method === 'POST'
    ? 'campos_informados'
    : ['PATCH', 'PUT'].includes(req.method) ? 'campos_alterados' : null;
  const fieldsMetadata = changedFields.length && fieldsMetadataKey
    ? { [fieldsMetadataKey]: changedFields }
    : {};
  const operationalContext = buildOperationalContext(req, type, normalized);
  return recordEvent({
    usuario_id: req.user?.id,
    setor_id: req.user?.setor_id,
    perfil_snapshot: req.user?.perfil,
    sessao_id: req.headers?.['x-audit-session-id'],
    categoria: result === 'SUCCESS' ? 'OPERACAO' : 'SEGURANCA',
    tipo_evento: type,
    modulo: moduleName,
    pagina_chave: normalized,
    rota_padrao: normalized,
    recurso_tipo: resource.type,
    recurso_id: resource.id,
    recurso_codigo: resource.code,
    empresa_id: req.body?.empresa_id || req.body?.empresa_pagadora_id || null,
    obra_id: req.body?.obra_id || null,
    acao_chave: `${req.method}:${normalized}`,
    resumo: result === 'SUCCESS' && operationalContext.summary
      ? `${operationalContext.summary} em ${moduleName}`
      : eventSummary(type, moduleName, result),
    resultado: result,
    origem: 'BACKEND',
    request_id: req.headers?.['x-request-id'],
    ip_hash: hashIp(req),
    user_agent_resumo: clampText(req.headers?.['user-agent'], 160),
    metadata: {
      method: req.method,
      status_code: statusCode,
      rota: normalized,
      ...(req.dev_user_switch ? {
        dev_user_switch: true,
        actor_id: Number(req.dev_user_switch.actor_id) || null,
        target_id: Number(req.dev_user_switch.target_id) || null
      } : {}),
      ...fieldsMetadata,
      ...operationalContext.metadata
    }
  });
}

async function recordNavigation(req, body = {}) {
  const normalized = normalizeRoute(body.rota || '/');
  const moduleName = clampText(body.modulo, 80) || inferModule(normalized);
  const resourceId = normalizeResourceId(body.recurso_id);
  const pageName = inferPageName(normalized);
  return recordEvent({
    evento_uuid: body.evento_uuid,
    usuario_id: req.user?.id,
    setor_id: req.user?.setor_id,
    perfil_snapshot: req.user?.perfil,
    sessao_id: body.sessao_id || req.headers?.['x-audit-session-id'],
    categoria: 'NAVEGACAO',
    tipo_evento: 'PAGE_VIEW',
    modulo: moduleName,
    pagina_chave: clampText(body.pagina_chave, 120) || normalized,
    rota_padrao: normalized,
    recurso_tipo: resourceId ? clampText(body.recurso_tipo, 120) : null,
    recurso_id: resourceId,
    resumo: `Acessou ${pageName}`,
    resultado: 'SUCCESS',
    origem: 'FRONTEND',
    ip_hash: hashIp(req),
    user_agent_resumo: clampText(req.headers?.['user-agent'], 160),
    metadata: {
      pagina_nome: pageName,
      ...(req.dev_user_switch ? {
        dev_user_switch: true,
        actor_id: Number(req.dev_user_switch.actor_id) || null,
        target_id: Number(req.dev_user_switch.target_id) || null
      } : {})
    }
  });
}

function parseDate(value, endOfDay = false) {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : null;
  if (!normalized) return null;
  return new Date(`${normalized}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`);
}

function normalizeFilters(query = {}, maxLimit = 100) {
  const today = new Date();
  const defaultStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = parseDate(query.data_inicio) || defaultStart;
  const end = parseDate(query.data_fim, true) || new Date(defaultStart.getTime() + 86400000 - 1);
  if (end < start) throw Object.assign(new Error('Periodo de auditoria invalido.'), { statusCode: 400 });
  if ((end - start) / 86400000 > MAX_RANGE_DAYS) {
    throw Object.assign(new Error(`O periodo maximo de consulta e ${MAX_RANGE_DAYS} dias.`), { statusCode: 400 });
  }
  return {
    start,
    end,
    usuario_id: Number(query.usuario_id) || null,
    setor_id: Number(query.setor_id) || null,
    modulo: clampText(query.modulo, 80),
    categoria: clampText(query.categoria, 40),
    resultado: clampText(query.resultado, 40),
    tipo_evento: clampText(query.tipo_evento, 80),
    page: Math.max(1, Number(query.page) || 1),
    limit: Math.min(maxLimit, Math.max(10, Number(query.limit) || 30))
  };
}

function buildWhere(filters) {
  const where = { ocorrido_em: { [Op.between]: [filters.start, filters.end] } };
  ['usuario_id', 'setor_id', 'modulo', 'categoria', 'resultado', 'tipo_evento'].forEach((key) => {
    if (filters[key]) where[key] = filters[key];
  });
  return where;
}

async function getSummary(query) {
  const filters = normalizeFilters(query);
  const where = buildWhere(filters);
  const [
    total, usuarios, navegacoes, operacoes, falhas, criacoes, alteracoes, conclusoes,
    modules, days
  ] = await Promise.all([
    GovernancaEventoOperacional.count({ where }),
    GovernancaEventoOperacional.count({ where, distinct: true, col: 'usuario_id' }),
    GovernancaEventoOperacional.count({ where: { ...where, tipo_evento: 'PAGE_VIEW' } }),
    GovernancaEventoOperacional.count({ where: { ...where, categoria: 'OPERACAO' } }),
    GovernancaEventoOperacional.count({ where: { ...where, resultado: { [Op.ne]: 'SUCCESS' } } }),
    GovernancaEventoOperacional.count({ where: { ...where, tipo_evento: 'CREATE' } }),
    GovernancaEventoOperacional.count({ where: { ...where, tipo_evento: 'UPDATE' } }),
    GovernancaEventoOperacional.count({ where: { ...where, tipo_evento: { [Op.in]: ['CLOSE', 'APPROVE', 'RECONCILE'] } } }),
    GovernancaEventoOperacional.findAll({
      where,
      attributes: [
        'modulo',
        [fn('COUNT', col('id')), 'eventos'],
        [literal("SUM(CASE WHEN categoria = 'OPERACAO' THEN 1 ELSE 0 END)"), 'operacoes'],
        [literal("SUM(CASE WHEN resultado <> 'SUCCESS' THEN 1 ELSE 0 END)"), 'falhas']
      ],
      group: ['modulo'],
      order: [[literal('eventos'), 'DESC']],
      raw: true
    }),
    GovernancaEventoOperacional.findAll({
      where,
      attributes: [
        [fn('DATE', col('ocorrido_em')), 'data'],
        [fn('COUNT', col('id')), 'eventos'],
        [literal("SUM(CASE WHEN categoria = 'OPERACAO' THEN 1 ELSE 0 END)"), 'operacoes'],
        [literal("COUNT(DISTINCT usuario_id)"), 'usuarios']
      ],
      group: [fn('DATE', col('ocorrido_em'))],
      order: [[fn('DATE', col('ocorrido_em')), 'ASC']],
      raw: true
    })
  ]);
  return {
    total, usuarios, navegacoes, operacoes, falhas, criacoes, alteracoes, conclusoes,
    por_modulo: modules.map((item) => ({
      modulo: item.modulo,
      eventos: Number(item.eventos || 0),
      operacoes: Number(item.operacoes || 0),
      falhas: Number(item.falhas || 0)
    })),
    por_dia: days.map((item) => ({
      data: item.data,
      eventos: Number(item.eventos || 0),
      operacoes: Number(item.operacoes || 0),
      usuarios: Number(item.usuarios || 0)
    }))
  };
}

async function getUsers(query) {
  const filters = normalizeFilters(query);
  const where = buildWhere(filters);
  const rows = await GovernancaEventoOperacional.findAll({
    where,
    attributes: [
      'usuario_id',
      [fn('MIN', col('ocorrido_em')), 'primeira_atividade'],
      [fn('MAX', col('ocorrido_em')), 'ultima_atividade'],
      [fn('COUNT', col('GovernancaEventoOperacional.id')), 'eventos'],
      [literal("SUM(CASE WHEN tipo_evento = 'PAGE_VIEW' THEN 1 ELSE 0 END)"), 'navegacoes'],
      [literal("SUM(CASE WHEN categoria = 'OPERACAO' THEN 1 ELSE 0 END)"), 'operacoes'],
      [literal("SUM(CASE WHEN tipo_evento = 'CREATE' THEN 1 ELSE 0 END)"), 'criacoes'],
      [literal("SUM(CASE WHEN tipo_evento = 'UPDATE' THEN 1 ELSE 0 END)"), 'alteracoes'],
      [literal("SUM(CASE WHEN tipo_evento IN ('CLOSE','APPROVE','RECONCILE') THEN 1 ELSE 0 END)"), 'conclusoes'],
      [literal('COUNT(DISTINCT modulo)'), 'modulos'],
      [literal('COUNT(DISTINCT sessao_id)'), 'sessoes_observadas']
    ],
    include: [{ model: User, as: 'usuario', attributes: ['id', 'nome', 'email', 'perfil'], required: false }],
    group: ['usuario_id', 'usuario.id', 'usuario.nome', 'usuario.email', 'usuario.perfil'],
    order: [[literal('ultima_atividade'), 'DESC']],
    raw: true,
    nest: true
  });
  return rows.filter((row) => row.usuario_id).map((row) => ({
    ...row,
    eventos: Number(row.eventos || 0), navegacoes: Number(row.navegacoes || 0),
    operacoes: Number(row.operacoes || 0), criacoes: Number(row.criacoes || 0),
    alteracoes: Number(row.alteracoes || 0), conclusoes: Number(row.conclusoes || 0),
    modulos: Number(row.modulos || 0),
    sessoes_observadas: Number(row.sessoes_observadas || 0)
  }));
}

async function getEvents(query, options = {}) {
  const filters = normalizeFilters(query, options.maxLimit || 100);
  const where = buildWhere(filters);
  const { rows, count } = await GovernancaEventoOperacional.findAndCountAll({
    where,
    include: [
      { model: User, as: 'usuario', attributes: ['id', 'nome', 'email', 'perfil'], required: false },
      { model: Setor, as: 'setor', attributes: ['id', 'nome', 'codigo'], required: false }
    ],
    order: [['ocorrido_em', 'DESC'], ['id', 'DESC']],
    limit: filters.limit,
    offset: (filters.page - 1) * filters.limit
  });
  return {
    rows: rows.map((row) => {
      const plain = row.get({ plain: true });
      try { plain.metadata = plain.metadata_json ? JSON.parse(plain.metadata_json) : null; } catch { plain.metadata = null; }
      plain.sessao_ref = buildSessionReference(plain.sessao_id);
      delete plain.metadata_json;
      delete plain.ip_hash;
      delete plain.sessao_id;
      return plain;
    }),
    total: Number(count || 0), page: filters.page, limit: filters.limit,
    pages: Math.max(1, Math.ceil(Number(count || 0) / filters.limit))
  };
}

async function getOptions(query) {
  const filters = normalizeFilters(query);
  const where = buildWhere(filters);
  const [modules, users, sectors] = await Promise.all([
    GovernancaEventoOperacional.findAll({ where, attributes: [[fn('DISTINCT', col('modulo')), 'modulo']], order: [['modulo', 'ASC']], raw: true }),
    User.findAll({ attributes: ['id', 'nome', 'email', 'perfil', 'setor_id'], where: { ativo: true }, order: [['nome', 'ASC']], raw: true }),
    Setor.findAll({ attributes: ['id', 'nome', 'codigo'], order: [['nome', 'ASC']], raw: true })
  ]);
  return { modulos: modules.map((item) => item.modulo).filter(Boolean), usuarios: users, setores: sectors };
}

function csvCell(value) {
  return `"${String(value == null ? '' : value).replace(/"/g, '""')}"`;
}

function normalizeRetentionDays(value) {
  const parsed = Number(value == null || value === '' ? DEFAULT_RETENTION_DAYS : value);
  if (!Number.isInteger(parsed) || parsed < MIN_RETENTION_DAYS || parsed > MAX_RETENTION_DAYS) {
    throw Object.assign(
      new Error(`A retencao deve estar entre ${MIN_RETENTION_DAYS} e ${MAX_RETENTION_DAYS} dias.`),
      { statusCode: 400 }
    );
  }
  return parsed;
}

function buildRetentionCutoff(retentionDays, now = new Date()) {
  const days = normalizeRetentionDays(retentionDays);
  const reference = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(reference.getTime())) throw new Error('Data de referencia da retencao invalida.');
  return new Date(reference.getTime() - (days * 86400000));
}

async function purgeExpiredEvents({ retentionDays, confirm = false, now = new Date() } = {}) {
  const days = normalizeRetentionDays(retentionDays ?? process.env.AUDITORIA_OPERACIONAL_RETENCAO_DIAS);
  const cutoff = buildRetentionCutoff(days, now);
  const where = { ocorrido_em: { [Op.lt]: cutoff } };
  const candidates = await GovernancaEventoOperacional.count({ where });
  const removed = confirm && candidates
    ? await GovernancaEventoOperacional.destroy({ where })
    : 0;
  return {
    modo: confirm ? 'APLICADO' : 'SIMULACAO',
    retencao_dias: days,
    data_corte: cutoff.toISOString(),
    candidatos: Number(candidates || 0),
    removidos: Number(removed || 0)
  };
}

async function exportCsv(query) {
  const result = await getEvents({ ...query, page: 1, limit: MAX_EXPORT_ROWS }, { maxLimit: MAX_EXPORT_ROWS });
  const header = ['Data/hora', 'Usuario', 'Setor', 'Modulo', 'Categoria', 'Evento', 'Resultado', 'Resumo', 'Rota', 'Metodo', 'Campos', 'Sessao', 'Recurso', 'ID', 'Codigo'];
  const lines = result.rows.map((item) => [
    item.ocorrido_em, item.usuario?.nome, item.setor?.nome, item.modulo, item.categoria,
    item.tipo_evento, item.resultado, item.resumo, item.rota_padrao, item.metadata?.method,
    (item.metadata?.campos_alterados || item.metadata?.campos_informados || []).join(', '),
    item.sessao_ref, item.recurso_tipo, item.recurso_id, item.recurso_codigo
  ].map(csvCell).join(';'));
  return `\ufeff${header.map(csvCell).join(';')}\n${lines.join('\n')}`;
}

module.exports = {
  DEFAULT_RETENTION_DAYS,
  MAX_RETENTION_DAYS,
  MAX_RANGE_DAYS,
  MIN_RETENTION_DAYS,
  buildRetentionCutoff,
  buildSessionReference,
  buildWhere,
  exportCsv,
  extractChangedFieldNames,
  extractResponseResource,
  getEvents,
  getOptions,
  getSummary,
  getUsers,
  inferPageName,
  inferEventType,
  inferModule,
  normalizeFilters,
  normalizeRetentionDays,
  normalizeResourceCode,
  normalizeResourceId,
  normalizeRoute,
  recordEvent,
  recordHttpEvent,
  recordNavigation,
  purgeExpiredEvents,
  sanitizeMetadata
};
