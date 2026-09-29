'use strict';

const { Op } = require('sequelize');
const db = require('../../../models');
const { createBusinessError } = require('./planoMicroService');
const { resolverEscopoObras } = require('../policies/obraScopePolicy');
const {
  carregarContextoPrazos,
  prazoMedicaoEfetivo,
  readOptional
} = require('./prazoService');
const {
  iso,
  normalizarPaginacao,
  obraRef,
  plain,
  resolverRecorteObras,
  usuarioRef
} = require('./consultaAdminService');

/*
  Fila de decisoes do administrador (reforma 2026-09, Fase 4): reaberturas e
  dilatacoes aguardando decisao, e a lista geral de reaberturas. Somente
  leitura. A decisao continua nas rotas existentes:
  - POST /reaberturas/:id/aprovar  { decisao: 'APROVADA'|'NEGADA', observacao }
  - POST /dilatacoes/:id/decidir   { decisao: 'APROVADA'|'NEGADA', observacao }
  cr_dilatacoes pode nao existir (migration 202609290001 pendente): a fila
  segue so com as reaberturas.
*/

const SITUACOES_REABERTURA = Object.freeze(['SOLICITADA', 'APROVADA', 'NEGADA']);
const EVENTOS_DECISAO_REABERTURA = Object.freeze(['CR_REABERTURA_APROVADA', 'CR_REABERTURA_NEGADA']);

function dependencies(overrides = {}) {
  return {
    Obra: db.Obra,
    User: db.User,
    CrAuditoria: db.CrAuditoria,
    CrCompetencia: db.CrCompetencia,
    CrDilatacao: db.CrDilatacao,
    CrReabertura: db.CrReabertura,
    resolverEscopoObras,
    carregarContextoPrazos,
    readOptional,
    ...overrides
  };
}

function competenciaInclude(deps, recorte, required = true) {
  return {
    model: deps.CrCompetencia,
    as: 'competencia',
    attributes: ['id', 'obra_id', 'competencia', 'estado'],
    required,
    ...(recorte.obraIds ? { where: { obra_id: { [Op.in]: recorte.obraIds } } } : {}),
    include: [{ model: deps.Obra, as: 'obra', attributes: ['id', 'codigo', 'nome'], required: false }]
  };
}

function obraDaCompetencia(item) {
  const competencia = item.competencia || {};
  return obraRef(competencia.obra) || (competencia.obra_id
    ? { id: Number(competencia.obra_id), codigo: null, nome: null }
    : null);
}

function ordemFila(a, b) {
  const ta = a.solicitado_em ? new Date(a.solicitado_em).getTime() : 0;
  const tb = b.solicitado_em ? new Date(b.solicitado_em).getTime() : 0;
  if (ta !== tb) return ta - tb;
  if (a.tipo !== b.tipo) return a.tipo < b.tipo ? -1 : 1;
  return a.id - b.id;
}

async function prazosVigentes(dilatacoes, deps) {
  const obraIds = [...new Set(dilatacoes.map((item) => Number(item.obra_id)))];
  if (!obraIds.length) return new Map();
  const contexto = await deps.carregarContextoPrazos(obraIds);
  const result = new Map();
  dilatacoes.forEach((item) => {
    const competencia = item.competencia?.competencia;
    const obraContexto = contexto.get(Number(item.obra_id));
    if (!competencia || !obraContexto) return;
    const registro = (obraContexto.competencias || []).find((row) => row.competencia === competencia) || null;
    result.set(Number(item.id), prazoMedicaoEfetivo(competencia, obraContexto.config, registro?.dilatacao_prazo));
  });
  return result;
}

async function listarDecisoesPendentes(user, query = {}, overrides = {}) {
  const deps = dependencies(overrides);
  const { limit, offset } = normalizarPaginacao(query);
  const recorte = await resolverRecorteObras(user, query.obra_id, deps);
  if (recorte.vazio) return { items: [], total: 0, limit, offset };

  const [reaberturas, dilatacoes] = await Promise.all([
    deps.CrReabertura.findAll({
      where: { situacao: 'SOLICITADA' },
      include: [
        competenciaInclude(deps, recorte),
        { model: deps.User, as: 'solicitadoPor', attributes: ['id', 'nome'], required: false }
      ],
      order: [['createdAt', 'ASC'], ['id', 'ASC']]
    }),
    deps.readOptional(() => deps.CrDilatacao.findAll({
      where: {
        situacao: 'SOLICITADA',
        ...(recorte.obraIds ? { obra_id: { [Op.in]: recorte.obraIds } } : {})
      },
      include: [
        { model: deps.Obra, as: 'obra', attributes: ['id', 'codigo', 'nome'], required: false },
        { model: deps.CrCompetencia, as: 'competencia', attributes: ['id', 'competencia'], required: false },
        { model: deps.User, as: 'solicitadoPor', attributes: ['id', 'nome'], required: false }
      ],
      order: [['createdAt', 'ASC'], ['id', 'ASC']]
    }))
  ]);

  const dilatacoesPlain = dilatacoes.map(plain);
  const prazos = await prazosVigentes(dilatacoesPlain, deps);

  const items = [
    ...reaberturas.map((record) => {
      const item = plain(record);
      return {
        tipo: 'REABERTURA',
        id: Number(item.id),
        obra: obraDaCompetencia(item),
        competencia: item.competencia?.competencia || null,
        motivo: item.motivo,
        dias: null,
        prazo_vigente: null,
        solicitado_por: usuarioRef(item.solicitadoPor) || { id: Number(item.solicitado_por), nome: null },
        solicitado_em: iso(item.createdAt)
      };
    }),
    ...dilatacoesPlain.map((item) => ({
      tipo: 'DILATACAO',
      id: Number(item.id),
      obra: obraRef(item.obra) || { id: Number(item.obra_id), codigo: null, nome: null },
      competencia: item.competencia?.competencia || null,
      motivo: item.motivo,
      dias: Number(item.dias),
      prazo_vigente: iso(prazos.get(Number(item.id)) || item.prazo_anterior),
      solicitado_por: usuarioRef(item.solicitadoPor) || { id: Number(item.solicitado_por), nome: null },
      solicitado_em: iso(item.createdAt)
    }))
  ].sort(ordemFila);

  return {
    items: items.slice(offset, offset + limit),
    total: items.length,
    limit,
    offset
  };
}

function situacaoReaberturaFiltro(value) {
  const text = String(value || '').trim().toUpperCase();
  if (!text) return null;
  if (!SITUACOES_REABERTURA.includes(text)) {
    throw createBusinessError(
      400,
      'CR_SITUACAO_INVALIDA',
      `Situacao invalida. Use ${SITUACOES_REABERTURA.join(', ')}.`
    );
  }
  return text;
}

function payloadJson(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) || {};
    } catch (error) {
      return {};
    }
  }
  return value;
}

// A justificativa da decisao nao tem coluna em cr_reaberturas: fica no
// payload (observacao) do evento de auditoria da decisao.
async function justificativasDecisao(reaberturas, deps) {
  const decididas = reaberturas.filter((item) => item.situacao !== 'SOLICITADA');
  if (!decididas.length) return new Map();
  const ids = new Set(decididas.map((item) => Number(item.id)));
  const eventos = await deps.CrAuditoria.findAll({
    where: {
      evento: { [Op.in]: EVENTOS_DECISAO_REABERTURA },
      competencia_id: { [Op.in]: [...new Set(decididas.map((item) => Number(item.competencia_id)))] }
    },
    attributes: ['id', 'payload_json', 'criado_em'],
    order: [['criado_em', 'ASC'], ['id', 'ASC']],
    raw: true
  });
  const result = new Map();
  eventos.forEach((evento) => {
    const payload = payloadJson(evento.payload_json);
    const id = Number(payload.reabertura_id);
    if (!ids.has(id)) return;
    const texto = String(payload.observacao || payload.justificativa || '').trim();
    if (texto) result.set(id, texto);
  });
  return result;
}

async function listarReaberturasGeral(user, query = {}, overrides = {}) {
  const deps = dependencies(overrides);
  const { limit, offset } = normalizarPaginacao(query);
  const situacao = situacaoReaberturaFiltro(query.situacao);
  const recorte = await resolverRecorteObras(user, query.obra_id, deps);
  if (recorte.vazio) return { items: [], total: 0, limit, offset };

  const result = await deps.CrReabertura.findAndCountAll({
    where: situacao ? { situacao } : {},
    include: [
      competenciaInclude(deps, recorte),
      { model: deps.User, as: 'solicitadoPor', attributes: ['id', 'nome'], required: false },
      { model: deps.User, as: 'aprovadoPor', attributes: ['id', 'nome'], required: false }
    ],
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit,
    offset,
    distinct: true
  });
  const rows = (result.rows || []).map(plain);
  const justificativas = await justificativasDecisao(rows, deps);

  return {
    items: rows.map((item) => ({
      id: Number(item.id),
      obra: obraDaCompetencia(item),
      competencia: item.competencia?.competencia || null,
      motivo: item.motivo,
      situacao: item.situacao,
      solicitado_por: usuarioRef(item.solicitadoPor) || { id: Number(item.solicitado_por), nome: null },
      solicitado_em: iso(item.createdAt),
      decidido_por: usuarioRef(item.aprovadoPor)
        || (item.aprovado_por ? { id: Number(item.aprovado_por), nome: null } : null),
      decidido_em: iso(item.aprovado_em),
      justificativa: justificativas.get(Number(item.id)) || null,
      expira_em: iso(item.expira_em)
    })),
    total: Number(result.count) || 0,
    limit,
    offset
  };
}

module.exports = {
  SITUACOES_REABERTURA,
  listarDecisoesPendentes,
  listarReaberturasGeral,
  ordemFila
};
