const { Op } = require('sequelize');
const {
  TreinamentoConteudo,
  TreinamentoLeituraUsuario,
  User
} = require('../models');
const { getPresignedUrl, uploadToS3 } = require('./s3');

const TIPOS = new Set(['FAQ', 'VIDEO', 'GUIA']);
const STATUS = new Set(['RASCUNHO', 'PUBLICADO', 'ARQUIVADO']);

function normalizeUpper(value, fallback = '') {
  return String(value || fallback || '').trim().toUpperCase();
}

function normalizeTipo(value) {
  const tipo = normalizeUpper(value, 'GUIA');
  return TIPOS.has(tipo) ? tipo : 'GUIA';
}

function normalizeStatus(value, fallback = 'RASCUNHO') {
  const status = normalizeUpper(value, fallback);
  return STATUS.has(status) ? status : fallback;
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeTags(value) {
  const source = Array.isArray(value)
    ? value
    : String(value || '')
        .split(',')
        .map((item) => item.trim());

  return [...new Set(source.map((item) => String(item || '').trim()).filter(Boolean))].slice(0, 12);
}

function sanitizeText(value, max = 5000) {
  const raw = String(value || '').trim();
  return raw ? raw.slice(0, max) : null;
}

function serializeConteudo(item, extras = {}) {
  if (!item) return null;
  const plain = typeof item.get === 'function' ? item.get({ plain: true }) : item;
  const tags = normalizeTags(parseJson(plain.tags_json, []));

  return {
    ...plain,
    tags,
    tags_json: undefined,
    criadoPor: plain.criadoPor || undefined,
    atualizadoPor: plain.atualizadoPor || undefined,
    publicadoPor: plain.publicadoPor || undefined,
    ...extras
  };
}

function buildWhere(query = {}, canManage = false) {
  const where = {};
  const tipo = normalizeUpper(query.tipo);
  const status = normalizeUpper(query.status);
  const modulo = String(query.modulo || '').trim();
  const busca = String(query.busca || '').trim();

  if (tipo && TIPOS.has(tipo)) where.tipo = tipo;
  if (!canManage) {
    where.status = 'PUBLICADO';
  } else if (status && STATUS.has(status)) {
    where.status = status;
  } else if (query.incluir_arquivados !== 'true') {
    where.status = { [Op.ne]: 'ARQUIVADO' };
  }
  if (modulo) where.modulo = modulo;
  if (busca) {
    where[Op.or] = [
      { titulo: { [Op.like]: `%${busca}%` } },
      { pergunta: { [Op.like]: `%${busca}%` } },
      { descricao: { [Op.like]: `%${busca}%` } },
      { conteudo: { [Op.like]: `%${busca}%` } },
      { tags_json: { [Op.like]: `%${busca}%` } }
    ];
  }

  return where;
}

function normalizePayload(payload = {}, current = {}) {
  const tipo = normalizeTipo(payload.tipo || current.tipo);
  const status = normalizeStatus(payload.status || current.status || 'RASCUNHO', current.status || 'RASCUNHO');
  const tags = normalizeTags(payload.tags ?? parseJson(current.tags_json, []));

  return {
    tipo,
    modulo: sanitizeText(payload.modulo ?? current.modulo, 60),
    publico_alvo: sanitizeText(payload.publico_alvo ?? current.publico_alvo, 120),
    titulo: sanitizeText(payload.titulo ?? current.titulo, 180),
    pergunta: sanitizeText(payload.pergunta ?? current.pergunta, 2000),
    resposta: sanitizeText(payload.resposta ?? current.resposta, 8000),
    descricao: sanitizeText(payload.descricao ?? current.descricao, 4000),
    conteudo: sanitizeText(payload.conteudo ?? current.conteudo, 50000),
    tags_json: JSON.stringify(tags),
    status,
    ordem: Number.isFinite(Number(payload.ordem ?? current.ordem))
      ? Math.trunc(Number(payload.ordem ?? current.ordem))
      : 0,
    thumbnail_url: sanitizeText(payload.thumbnail_url ?? current.thumbnail_url, 1000),
    duracao_minutos: payload.duracao_minutos === '' || payload.duracao_minutos === null || payload.duracao_minutos === undefined
      ? null
      : Math.max(0, Math.trunc(Number(payload.duracao_minutos) || 0))
  };
}

async function listarConteudos({ query = {}, canManage = false } = {}) {
  const where = buildWhere(query, canManage);
  const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 500);
  const offset = Math.max(Number(query.offset) || 0, 0);

  const { rows, count } = await TreinamentoConteudo.findAndCountAll({
    where,
    limit,
    offset,
    order: [
      ['ordem', 'ASC'],
      ['updatedAt', 'DESC'],
      ['id', 'DESC']
    ],
    include: [
      { model: User, as: 'criadoPor', attributes: ['id', 'nome'] },
      { model: User, as: 'publicadoPor', attributes: ['id', 'nome'] }
    ]
  });

  return {
    total: count,
    items: rows.map((item) => serializeConteudo(item))
  };
}

async function resumoConteudos({ canManage = false } = {}) {
  const where = canManage ? { status: { [Op.ne]: 'ARQUIVADO' } } : { status: 'PUBLICADO' };
  const rows = await TreinamentoConteudo.findAll({
    attributes: ['tipo', 'status', 'modulo'],
    where
  });

  const resumo = {
    total: rows.length,
    publicados: 0,
    rascunhos: 0,
    videos: 0,
    faqs: 0,
    guias: 0,
    modulos: {}
  };

  rows.forEach((row) => {
    const item = row.get({ plain: true });
    if (item.status === 'PUBLICADO') resumo.publicados += 1;
    if (item.status === 'RASCUNHO') resumo.rascunhos += 1;
    if (item.tipo === 'VIDEO') resumo.videos += 1;
    if (item.tipo === 'FAQ') resumo.faqs += 1;
    if (item.tipo === 'GUIA') resumo.guias += 1;
    const modulo = item.modulo || 'GERAL';
    resumo.modulos[modulo] = (resumo.modulos[modulo] || 0) + 1;
  });

  return resumo;
}

async function obterConteudo(id, { canManage = false } = {}) {
  const where = { id: Number(id) };
  if (!canManage) where.status = 'PUBLICADO';

  const item = await TreinamentoConteudo.findOne({
    where,
    include: [
      { model: User, as: 'criadoPor', attributes: ['id', 'nome'] },
      { model: User, as: 'atualizadoPor', attributes: ['id', 'nome'] },
      { model: User, as: 'publicadoPor', attributes: ['id', 'nome'] }
    ]
  });
  if (!item) {
    const error = new Error('Conteudo de treinamento nao encontrado.');
    error.statusCode = 404;
    throw error;
  }

  return serializeConteudo(item);
}

async function criarConteudo(payload, userId) {
  const data = normalizePayload(payload);
  if (!data.titulo) {
    const error = new Error('Titulo do conteudo e obrigatorio.');
    error.statusCode = 400;
    throw error;
  }

  if (data.status === 'PUBLICADO') {
    data.publicado_em = new Date();
    data.publicado_por = userId || null;
  }

  const item = await TreinamentoConteudo.create({
    ...data,
    criado_por: userId || null,
    atualizado_por: userId || null
  });

  return obterConteudo(item.id, { canManage: true });
}

async function atualizarConteudo(id, payload, userId) {
  const item = await TreinamentoConteudo.findByPk(Number(id));
  if (!item) {
    const error = new Error('Conteudo de treinamento nao encontrado.');
    error.statusCode = 404;
    throw error;
  }

  const current = item.get({ plain: true });
  const data = normalizePayload(payload, current);
  if (!data.titulo) {
    const error = new Error('Titulo do conteudo e obrigatorio.');
    error.statusCode = 400;
    throw error;
  }

  if (data.status === 'PUBLICADO' && current.status !== 'PUBLICADO') {
    data.publicado_em = new Date();
    data.publicado_por = userId || null;
  }
  if (data.status !== 'PUBLICADO') {
    data.publicado_em = null;
    data.publicado_por = null;
  }

  await item.update({
    ...data,
    atualizado_por: userId || null
  });

  return obterConteudo(item.id, { canManage: true });
}

async function arquivarConteudo(id, userId) {
  const item = await TreinamentoConteudo.findByPk(Number(id));
  if (!item) {
    const error = new Error('Conteudo de treinamento nao encontrado.');
    error.statusCode = 404;
    throw error;
  }
  await item.update({
    status: 'ARQUIVADO',
    atualizado_por: userId || null
  });
  return serializeConteudo(item);
}

async function uploadConteudoArquivo(id, file, tipoArquivo, userId) {
  if (!file) {
    const error = new Error('Arquivo de treinamento obrigatorio.');
    error.statusCode = 400;
    throw error;
  }

  const item = await TreinamentoConteudo.findByPk(Number(id));
  if (!item) {
    const error = new Error('Conteudo de treinamento nao encontrado.');
    error.statusCode = 404;
    throw error;
  }

  const tipo = normalizeUpper(tipoArquivo, item.tipo === 'VIDEO' ? 'VIDEO' : 'DOCUMENTO');
  if (!['VIDEO', 'DOCUMENTO'].includes(tipo) || (tipo === 'VIDEO'
    && !/\.(mp4|webm)$/i.test(String(file.originalname || '')))) {
    const error = new Error('Selecione um MP4 ou WebM para o video, ou um tipo de arquivo valido.');
    error.statusCode = 400;
    throw error;
  }
  const folder = tipo === 'VIDEO' ? 'treinamento/videos' : 'treinamento/documentos';
  const url = await uploadToS3(file, folder);
  const payload = {
    atualizado_por: userId || null
  };

  if (tipo === 'VIDEO') {
    payload.video_url = url;
    payload.video_s3_key = url;
  } else {
    payload.documento_url = url;
    payload.documento_s3_key = url;
  }

  await item.update(payload);
  return obterConteudo(item.id, { canManage: true });
}

async function assinarArquivo(id, tipoArquivo, { canManage = false } = {}) {
  const item = await obterConteudo(id, { canManage });
  const tipo = normalizeUpper(tipoArquivo, 'DOCUMENTO');
  const target = tipo === 'VIDEO'
    ? (item.video_s3_key || item.video_url)
    : (item.documento_s3_key || item.documento_url);

  if (!target) {
    const error = new Error('Arquivo nao encontrado para este conteudo.');
    error.statusCode = 404;
    throw error;
  }

  const url = await getPresignedUrl(target, 15 * 60);
  return { url };
}

async function marcarLeitura(conteudoId, userId, concluido = false) {
  const id = Number(conteudoId);
  if (!Number.isInteger(id) || id <= 0 || !userId) {
    const error = new Error('Leitura invalida.');
    error.statusCode = 400;
    throw error;
  }

  const [item] = await TreinamentoLeituraUsuario.findOrCreate({
    where: { conteudo_id: id, usuario_id: Number(userId) },
    defaults: {
      conteudo_id: id,
      usuario_id: Number(userId),
      concluido: Boolean(concluido),
      concluido_em: concluido ? new Date() : null
    }
  });

  await item.update({
    visualizado_em: new Date(),
    concluido: Boolean(concluido || item.concluido),
    concluido_em: concluido ? new Date() : item.concluido_em
  });

  return item.get({ plain: true });
}

module.exports = {
  arquivarConteudo,
  assinarArquivo,
  atualizarConteudo,
  criarConteudo,
  listarConteudos,
  marcarLeitura,
  obterConteudo,
  resumoConteudos,
  uploadConteudoArquivo
};
