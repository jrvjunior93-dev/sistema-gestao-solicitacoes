'use strict';

const { Op, col, fn, where: sqlWhere } = require('sequelize');
const db = require('../../../models');
const { createBusinessError } = require('./planoMicroService');
const { resolverEscopoObras } = require('../policies/obraScopePolicy');
const {
  guardMode,
  mensagemTravada,
  obrasTravadasDoUsuario
} = require('./bloqueioObraService');

/*
  Consultas gerais do administrador (reforma 2026-09, Fase 4): Auditoria,
  Importacoes (planos), Configuracoes (responsaveis) e Obrigacoes sem escolher
  obra antes. Tudo somente leitura e sempre recortado pelo escopo de obras do
  usuario (resolverEscopoObras, o mesmo das rotas por obra).
*/

const PAGINACAO = Object.freeze({ padrao: 50, maximo: 200 });
const VALID_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const SITUACOES_OBRIGACAO = Object.freeze([
  'PENDENTE',
  'VENCIDA',
  'CUMPRIDA',
  'CUMPRIDA_COM_ATRASO'
]);

function dependencies(overrides = {}) {
  return {
    Obra: db.Obra,
    User: db.User,
    CrAuditoria: db.CrAuditoria,
    CrCompetencia: db.CrCompetencia,
    CrPlanoObra: db.CrPlanoObra,
    CrPlanoItem: db.CrPlanoItem,
    CrImportacao: db.CrImportacao,
    CrResponsavelObra: db.CrResponsavelObra,
    CrObrigacaoUsuario: db.CrObrigacaoUsuario,
    resolverEscopoObras,
    obrasTravadasBloqueando,
    now: () => new Date(),
    ...overrides
  };
}

/*
  Fase 3 (bloqueio por obra): o engenheiro responsavel pela obra travada nao
  ve auditoria nem estrutura dela ate regularizar (as rotas por obra sao
  barradas em requireCustosRecebiveisCompletion). As consultas gerais de
  auditoria e planos repetem a regra: a obra travada sai do resultado e o
  filtro direto por ela responde 403. So em CR_GUARD_MODE=enforce; falha
  inesperada e fail-open, como o middleware.
*/
async function obrasTravadasBloqueando(user) {
  if (guardMode() !== 'enforce') return [];
  try {
    return (await obrasTravadasDoUsuario(user)).filter((item) => item.bloqueando);
  } catch (error) {
    console.error('Falha segura ao avaliar bloqueio de obra (consulta geral):', error.message);
    return [];
  }
}

function plain(value) {
  return value?.toJSON ? value.toJSON() : { ...(value || {}) };
}

function iso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function obraRef(value, extra = []) {
  if (!value) return null;
  const item = plain(value);
  const ref = { id: Number(item.id), codigo: item.codigo || null, nome: item.nome || null };
  extra.forEach((key) => { ref[key] = item[key] ?? null; });
  return ref;
}

function usuarioRef(value) {
  if (!value) return null;
  const item = plain(value);
  return { id: Number(item.id), nome: item.nome || null };
}

// limit padrao 50, maximo 200; offset >= 0. Valor invalido cai no padrao.
function normalizarPaginacao(query = {}) {
  const rawLimit = Number.parseInt(query.limit, 10);
  const rawOffset = Number.parseInt(query.offset, 10);
  const limit = Number.isInteger(rawLimit) && rawLimit > 0
    ? Math.min(rawLimit, PAGINACAO.maximo)
    : PAGINACAO.padrao;
  const offset = Number.isInteger(rawOffset) && rawOffset > 0 ? rawOffset : 0;
  return { limit, offset };
}

function obraIdOpcional(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createBusinessError(400, 'CR_INVALID_ID', 'Obra invalida.');
  }
  return parsed;
}

/*
  Recorte de obras da consulta. Devolve:
  - vazio: true quando o usuario nao enxerga nenhuma obra (resposta vazia);
  - obraIds: null para "todas" ou a lista de obras permitidas.
  obra_id fora do escopo responde 403, como nas rotas por obra.
*/
async function resolverRecorteObras(user, obraIdValue, deps, options = {}) {
  const obraId = obraIdOpcional(obraIdValue);
  const scope = await deps.resolverEscopoObras(user);
  const travadas = options.respeitarTrava ? await deps.obrasTravadasBloqueando(user) : [];
  const ocultas = [...new Set(travadas.map((item) => Number(item.obra_id)))];
  if (obraId) {
    if (!scope.todas && !scope.obraIds.includes(obraId)) {
      throw createBusinessError(403, 'CR_OBRA_FORA_ESCOPO', 'Acesso negado para esta obra.');
    }
    const travada = travadas.find((item) => Number(item.obra_id) === obraId);
    if (travada) {
      throw createBusinessError(403, 'OBRA_TRAVADA_CUSTOS_RECEBIVEIS', mensagemTravada(travada));
    }
    return { vazio: false, obraIds: [obraId], todas: false, ocultas: [] };
  }
  if (scope.todas) return { vazio: false, obraIds: null, todas: true, ocultas };
  const obraIds = [...new Set((scope.obraIds || []).map(Number).filter(Number.isInteger))]
    .filter((id) => !ocultas.includes(id));
  return { vazio: obraIds.length === 0, obraIds, todas: false, ocultas };
}

// permitirSemObra: com escopo total, eventos sem obra continuam visiveis
// (NOT IN descartaria o NULL).
function whereObras(recorte, field = 'obra_id', options = {}) {
  if (recorte.obraIds) return { [field]: { [Op.in]: recorte.obraIds } };
  if (!recorte.ocultas?.length) return {};
  const notIn = { [field]: { [Op.notIn]: recorte.ocultas } };
  return options.permitirSemObra ? { [Op.or]: [{ [field]: null }, notIn] } : notIn;
}

async function obrasDoEscopo(user, deps, extraAttributes = [], options = {}) {
  const recorte = await resolverRecorteObras(user, null, deps, options);
  if (recorte.vazio) return [];
  const rows = await deps.Obra.findAll({
    where: {
      ativo: true,
      tipo_centro_custo: 'OBRA',
      ...whereObras(recorte, 'id')
    },
    attributes: ['id', 'codigo', 'nome', ...extraAttributes],
    order: [['nome', 'ASC'], ['id', 'ASC']]
  });
  return rows.map(plain);
}

/* ---------------------------------------------------------- auditoria */

function inicioDoDiaBrasilia(value) {
  return new Date(`${value}T00:00:00.000-03:00`);
}

function dataFiltro(value, label) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (!VALID_DATE.test(text) || Number.isNaN(inicioDoDiaBrasilia(text).getTime())) {
    throw createBusinessError(400, 'CR_DATA_INVALIDA', `Data "${label}" invalida. Use AAAA-MM-DD.`);
  }
  return text;
}

async function listarAuditoriaGeral(user, query = {}, overrides = {}) {
  const deps = dependencies(overrides);
  const { limit, offset } = normalizarPaginacao(query);
  const de = dataFiltro(query.de, 'de');
  const ate = dataFiltro(query.ate, 'ate');
  if (de && ate && de > ate) {
    throw createBusinessError(400, 'CR_PERIODO_INVALIDO', 'A data inicial deve ser anterior ou igual a data final.');
  }
  const acao = String(query.acao || '').trim().slice(0, 120);
  const recorte = await resolverRecorteObras(user, query.obra_id, deps, { respeitarTrava: true });
  if (recorte.vazio) return { items: [], total: 0, acoes: [], limit, offset };

  // Usuario sem escopo total nao ve eventos sem obra (ex.: bypass global).
  const scopeWhere = whereObras(recorte, 'obra_id', { permitirSemObra: true });
  const where = { ...scopeWhere };
  if (acao) where.evento = acao;
  if (de || ate) {
    where.criado_em = {};
    if (de) where.criado_em[Op.gte] = inicioDoDiaBrasilia(de);
    if (ate) {
      const fim = inicioDoDiaBrasilia(ate);
      fim.setUTCDate(fim.getUTCDate() + 1);
      where.criado_em[Op.lt] = fim;
    }
  }

  const [result, acoesRows] = await Promise.all([
    deps.CrAuditoria.findAndCountAll({
      where,
      include: [
        { model: deps.Obra, as: 'obra', attributes: ['id', 'codigo', 'nome'], required: false },
        { model: deps.CrCompetencia, as: 'competencia', attributes: ['id', 'competencia'], required: false },
        { model: deps.User, as: 'usuario', attributes: ['id', 'nome'], required: false }
      ],
      order: [['criado_em', 'DESC'], ['id', 'DESC']],
      limit,
      offset,
      distinct: true
    }),
    deps.CrAuditoria.findAll({
      where: scopeWhere,
      attributes: ['evento'],
      group: ['evento'],
      order: [['evento', 'ASC']],
      raw: true
    })
  ]);

  return {
    items: (result.rows || []).map((record) => {
      const item = plain(record);
      return {
        id: Number(item.id),
        criado_em: iso(item.criado_em),
        obra: obraRef(item.obra),
        competencia: item.competencia?.competencia || null,
        acao: item.evento,
        descricao: item.descricao || null,
        usuario: usuarioRef(item.usuario)
      };
    }),
    total: Number(result.count) || 0,
    acoes: [...new Set(acoesRows.map((row) => row.evento).filter(Boolean))].sort(),
    limit,
    offset
  };
}

/* ------------------------------------------------------------- planos */

async function listarPlanosGeral(user, query = {}, overrides = {}) {
  const deps = dependencies(overrides);
  const obras = await obrasDoEscopo(user, deps, ['classificacao'], { respeitarTrava: true });
  if (!obras.length) return { items: [] };
  const obraIds = obras.map((obra) => Number(obra.id));

  const [planos, importacoes] = await Promise.all([
    deps.CrPlanoObra.findAll({
      where: { obra_id: { [Op.in]: obraIds } },
      attributes: ['id', 'obra_id', 'versao', 'situacao', 'publicado_em', 'createdAt'],
      order: [['obra_id', 'ASC'], ['versao', 'DESC'], ['id', 'DESC']],
      raw: true
    }),
    deps.CrImportacao.findAll({
      where: { obra_id: { [Op.in]: obraIds } },
      attributes: ['obra_id', [fn('MAX', col('createdAt')), 'ultima_importacao_em']],
      group: ['obra_id'],
      raw: true
    })
  ]);

  const planosPorObra = new Map();
  planos.forEach((plano) => {
    const list = planosPorObra.get(Number(plano.obra_id)) || [];
    list.push(plano);
    planosPorObra.set(Number(plano.obra_id), list);
  });
  const vigentes = new Map();
  planosPorObra.forEach((list, obraId) => {
    const vigente = list.find((plano) => plano.situacao === 'PUBLICADA');
    if (vigente) vigentes.set(obraId, vigente);
  });
  const vigenteIds = [...vigentes.values()].map((plano) => Number(plano.id));
  const contagens = vigenteIds.length
    ? await deps.CrPlanoItem.findAll({
      where: { plano_id: { [Op.in]: vigenteIds } },
      attributes: ['plano_id', [fn('COUNT', col('id')), 'total_itens']],
      group: ['plano_id'],
      raw: true
    })
    : [];
  const itensPorPlano = new Map(contagens.map((row) => [Number(row.plano_id), Number(row.total_itens) || 0]));
  const importacaoPorObra = new Map(importacoes.map((row) => [Number(row.obra_id), row.ultima_importacao_em]));

  return {
    items: obras.map((obra) => {
      const obraId = Number(obra.id);
      const list = planosPorObra.get(obraId) || [];
      const vigente = vigentes.get(obraId) || null;
      return {
        obra: obraRef(obra, ['classificacao']),
        vigente: vigente ? {
          id: Number(vigente.id),
          versao: Number(vigente.versao),
          publicado_em: iso(vigente.publicado_em),
          total_itens: itensPorPlano.get(Number(vigente.id)) || 0
        } : null,
        rascunhos: list
          .filter((plano) => plano.situacao === 'RASCUNHO')
          .map((plano) => ({ id: Number(plano.id), versao: Number(plano.versao), criado_em: iso(plano.createdAt) })),
        total_versoes: list.length,
        ultima_importacao_em: iso(importacaoPorObra.get(obraId))
      };
    })
  };
}

/* -------------------------------------------------------- responsaveis */

async function listarResponsaveisGeral(user, query = {}, overrides = {}) {
  const deps = dependencies(overrides);
  const obras = await obrasDoEscopo(user, deps);
  if (!obras.length) return { items: [] };
  const obraIds = obras.map((obra) => Number(obra.id));
  const rows = await deps.CrResponsavelObra.findAll({
    where: { obra_id: { [Op.in]: obraIds } },
    include: [{ model: deps.User, as: 'usuario', attributes: ['id', 'nome'], required: false }],
    order: [['obra_id', 'ASC'], ['ativo', 'DESC'], ['papel', 'ASC'], ['vigencia_inicio', 'DESC'], ['id', 'DESC']]
  });
  const porObra = new Map();
  rows.forEach((record) => {
    const item = plain(record);
    const list = porObra.get(Number(item.obra_id)) || [];
    list.push({
      id: Number(item.id),
      usuario: usuarioRef(item.usuario) || { id: Number(item.user_id), nome: null },
      papel: item.papel,
      vigencia_inicio: item.vigencia_inicio || null,
      vigencia_fim: item.vigencia_fim || null,
      ativo: Boolean(item.ativo)
    });
    porObra.set(Number(item.obra_id), list);
  });
  return {
    items: obras.map((obra) => ({
      obra: obraRef(obra),
      responsaveis: porObra.get(Number(obra.id)) || []
    }))
  };
}

/* ---------------------------------------------------------- obrigacoes */

/*
  Mesma nocao da tela de obrigacoes (CrObrigacoesView) e do calculo em
  obrigacaoService: cumprida depois do prazo = "cumprida com atraso"; e uma
  pendente cujo prazo ja passou e vencida mesmo antes de o responsavel abrir
  a tela (a situacao gravada so e recalculada quando ele consulta).
*/
function situacaoObrigacao(item, now) {
  const prazo = item.prazo_em ? new Date(item.prazo_em) : null;
  if (item.situacao === 'CUMPRIDA') {
    const cumprida = item.cumprida_em ? new Date(item.cumprida_em) : null;
    return cumprida && prazo && cumprida > prazo ? 'CUMPRIDA_COM_ATRASO' : 'CUMPRIDA';
  }
  if (item.situacao === 'PENDENTE' && prazo && prazo <= now) return 'VENCIDA';
  return item.situacao;
}

function whereSituacaoObrigacao(situacao, now) {
  const cumpridaEm = col('CrObrigacaoUsuario.cumprida_em');
  const prazoEm = col('CrObrigacaoUsuario.prazo_em');
  switch (situacao) {
    case 'PENDENTE':
      return { situacao: 'PENDENTE', prazo_em: { [Op.gt]: now } };
    case 'VENCIDA':
      return {
        [Op.or]: [
          { situacao: 'VENCIDA' },
          { situacao: 'PENDENTE', prazo_em: { [Op.lte]: now } }
        ]
      };
    case 'CUMPRIDA':
      return {
        situacao: 'CUMPRIDA',
        [Op.or]: [{ cumprida_em: null }, sqlWhere(cumpridaEm, Op.lte, prazoEm)]
      };
    case 'CUMPRIDA_COM_ATRASO':
      return {
        situacao: 'CUMPRIDA',
        [Op.and]: [sqlWhere(cumpridaEm, Op.gt, prazoEm)]
      };
    default:
      return {};
  }
}

function situacaoFiltro(value) {
  const text = String(value || '').trim().toUpperCase();
  if (!text) return null;
  if (!SITUACOES_OBRIGACAO.includes(text)) {
    throw createBusinessError(
      400,
      'CR_SITUACAO_INVALIDA',
      `Situacao invalida. Use ${SITUACOES_OBRIGACAO.join(', ')}.`
    );
  }
  return text;
}

async function listarObrigacoesGeral(user, query = {}, overrides = {}) {
  const deps = dependencies(overrides);
  const { limit, offset } = normalizarPaginacao(query);
  const situacao = situacaoFiltro(query.situacao);
  const recorte = await resolverRecorteObras(user, query.obra_id, deps);
  if (recorte.vazio) return { items: [], total: 0, limit, offset };
  const now = deps.now();
  const where = { [Op.and]: [whereObras(recorte), whereSituacaoObrigacao(situacao, now)] };

  const result = await deps.CrObrigacaoUsuario.findAndCountAll({
    where,
    include: [
      { model: deps.Obra, as: 'obra', attributes: ['id', 'codigo', 'nome'], required: false },
      { model: deps.User, as: 'usuario', attributes: ['id', 'nome'], required: false }
    ],
    order: [['prazo_em', 'DESC'], ['id', 'DESC']],
    limit,
    offset,
    distinct: true
  });

  return {
    items: (result.rows || []).map((record) => {
      const item = plain(record);
      return {
        id: Number(item.id),
        tipo: item.tipo,
        obra: obraRef(item.obra) || { id: Number(item.obra_id), codigo: null, nome: null },
        competencia: item.competencia,
        usuario: usuarioRef(item.usuario) || { id: Number(item.user_id), nome: null },
        prazo_em: iso(item.prazo_em),
        cumprida_em: iso(item.cumprida_em),
        situacao: situacaoObrigacao(item, now)
      };
    }),
    total: Number(result.count) || 0,
    limit,
    offset
  };
}

module.exports = {
  PAGINACAO,
  SITUACOES_OBRIGACAO,
  iso,
  listarAuditoriaGeral,
  listarObrigacoesGeral,
  listarPlanosGeral,
  listarResponsaveisGeral,
  normalizarPaginacao,
  obraRef,
  obrasTravadasBloqueando,
  plain,
  resolverRecorteObras,
  situacaoObrigacao,
  usuarioRef,
  whereObras,
  whereSituacaoObrigacao
};
