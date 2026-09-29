'use strict';

const { Op } = require('sequelize');
const db = require('../../../models');
const { isModuleEnabled } = require('../../../services/moduleConfigService');
const { isSuperadmin } = require('../../../services/authorizationService');
const { CUSTOS_RECEBIVEIS_MODULE_KEY } = require('../constants/custosRecebiveisConstants');
const { carregarContextoPrazos, resumirPrazosObra } = require('./prazoService');

/*
  BLOQUEIO POR ATRASO (reforma de 29/09/2026, Fase 3).

  Quem: o engenheiro RESPONSAVEL ou SUBSTITUTO vigente da obra. Os demais
  usuarios operam a obra normalmente; as outras obras dele seguem livres.
  Quando: planejamento vencido e nao entregue, ou medicao aprovada vencida
  (prazo com dilatacao) sem registro nem "sem medicao". Pedido de dilatacao
  aguardando decisao NAO destrava. Mes reaberto para correcao nao trava.
  Liberacao temporaria (bypass) do administrador, ate 48h, suspende.
  O que impede: qualquer requisicao (leitura ou escrita) ligada a obra, fora
  do proprio modulo Custos e Recebiveis, onde ele se regulariza.
  Modo: `CR_GUARD_MODE=enforce` bloqueia; `observe` (padrao) so avisa.
*/

const CACHE_TTL_MS = 30 * 1000;
const cache = new Map();

function guardMode(value = process.env.CR_GUARD_MODE) {
  return String(value || 'observe').trim().toLowerCase() === 'enforce' ? 'enforce' : 'observe';
}

function dependencies(overrides = {}) {
  return {
    Obra: db.Obra,
    CrResponsavelObra: db.CrResponsavelObra,
    CrGuardBypass: db.CrGuardBypass,
    carregarContextoPrazos,
    isModuleEnabled,
    isSuperadmin,
    now: () => new Date(),
    ...overrides
  };
}

function dateKeyBrasilia(now) {
  return new Date(now.getTime() - 3 * 3600000).toISOString().slice(0, 10);
}

function pendencias(prazos) {
  const result = [];
  if (prazos?.planejamento?.situacao === 'VENCIDO') {
    result.push({
      tipo: 'PLANEJAMENTO',
      competencia: prazos.planejamento.competencia,
      dias: prazos.planejamento.dias,
      prazo_em: prazos.planejamento.prazo_em
    });
  }
  if (prazos?.medicao?.situacao === 'VENCIDO') {
    result.push({
      tipo: 'MEDICAO_APROVADA',
      competencia: prazos.medicao.competencia,
      dias: prazos.medicao.dias,
      prazo_em: prazos.medicao.prazo_em,
      dilatacao_pendente: Boolean(prazos.medicao.dilatacao_pendente)
    });
  }
  return result;
}

async function calcularObrasTravadas(user, options = {}, overrides = {}) {
  const deps = dependencies(overrides);
  if (!user?.id || deps.isSuperadmin(user)) return [];
  const enabled = options.moduleEnabled === undefined
    ? await deps.isModuleEnabled(CUSTOS_RECEBIVEIS_MODULE_KEY)
    : Boolean(options.moduleEnabled);
  if (!enabled) return [];
  const now = options.now || deps.now();
  const today = dateKeyBrasilia(now);
  const responsaveis = await deps.CrResponsavelObra.findAll({
    where: {
      user_id: Number(user.id),
      ativo: true,
      papel: { [Op.in]: ['RESPONSAVEL', 'SUBSTITUTO'] },
      vigencia_inicio: { [Op.lte]: today },
      [Op.or]: [{ vigencia_fim: null }, { vigencia_fim: { [Op.gte]: today } }]
    },
    include: [{
      model: deps.Obra,
      as: 'obra',
      attributes: ['id', 'codigo', 'nome', 'classificacao', 'ativo'],
      where: { ativo: true },
      required: true
    }]
  });
  const obras = new Map();
  responsaveis.forEach((record) => {
    const item = record?.toJSON ? record.toJSON() : record;
    if (item?.obra && !obras.has(Number(item.obra.id))) obras.set(Number(item.obra.id), item.obra);
  });
  if (!obras.size) return [];
  const context = await deps.carregarContextoPrazos([...obras.keys()]);
  const bypasses = await deps.CrGuardBypass.findAll({
    where: {
      user_id: Number(user.id),
      revogado_em: null,
      expira_em: { [Op.gt]: now }
    },
    attributes: ['obra_id', 'expira_em'],
    raw: true
  });
  const mode = guardMode(options.mode);
  const result = [];
  obras.forEach((obra, obraId) => {
    const entry = context.get(obraId);
    if (!entry) return;
    const prazos = resumirPrazosObra({ classificacao: obra.classificacao, ...entry, now });
    const itens = pendencias(prazos);
    if (!itens.length) return;
    const bypass = bypasses.find((item) => item.obra_id == null || Number(item.obra_id) === obraId) || null;
    result.push({
      obra_id: obraId,
      obra: { id: obraId, codigo: obra.codigo || null, nome: obra.nome },
      pendencias: itens,
      liberada_ate: bypass ? new Date(bypass.expira_em).toISOString() : null,
      modo: mode,
      // Trava de fato so em enforce e sem liberacao vigente; em observe a
      // tela avisa ("seria travada") sem impedir nada.
      bloqueando: mode === 'enforce' && !bypass
    });
  });
  return result;
}

async function obrasTravadasDoUsuario(user, options = {}, overrides = {}) {
  if (!user?.id) return [];
  const key = Number(user.id);
  const cached = cache.get(key);
  const nowMs = Date.now();
  if (!options.semCache && cached && cached.expires > nowMs) return cached.value;
  const value = await calcularObrasTravadas(user, options, overrides);
  cache.set(key, { value, expires: nowMs + CACHE_TTL_MS });
  return value;
}

// Chamado depois de toda gravacao que pode destravar (ou travar) uma obra:
// finalizar, medicao, dilatacao, reabertura, prazos, responsaveis, bypass.
function invalidarObrasTravadas(userId = null) {
  if (userId == null) cache.clear();
  else cache.delete(Number(userId));
}

/* ------------------------------------------------ obra da requisicao */

const ENTITY_ROUTES = [
  { re: /^\/solicitacoes\/(\d+)(?:\/|$)/, model: 'Solicitacao' },
  { re: /^\/compras\/solicitacoes\/(\d+)(?:\/|$)/, model: 'SolicitacaoCompra' },
  { re: /^\/compras\/pedidos\/(\d+)(?:\/|$)/, model: 'PedidoCompra' },
  { re: /^\/financeiro\/(?:boletos\/)?titulos\/(\d+)(?:\/|$)/, model: 'TituloFinanceiro', rateios: true },
  { re: /^\/contratos\/(?:fluxo-novo\/)?(\d+)(?:\/|$)/, model: 'Contrato' },
  { re: /^\/contratos\/medicoes\/(\d+)(?:\/|$)/, model: 'ContratoMedicao', viaContrato: true },
  { re: /^\/contratos\/aditivos\/(\d+)(?:\/|$)/, model: 'ContratoAditivo', viaContrato: true },
  { re: /^\/rh\/solicitacoes\/(\d+)(?:\/|$)/, model: 'RhSolicitacao' },
  { re: /^\/rh\/colaboradores\/(\d+)(?:\/|$)/, model: 'RhColaborador' },
  { re: /^\/rh\/apuracoes\/(\d+)(?:\/|$)/, model: 'RhApuracao' },
  { re: /^\/apropriacoes\/(\d+)(?:\/|$)/, model: 'Apropriacao' },
  { re: /^\/comprovantes\/(\d+)(?:\/|$)/, model: 'Comprovante' },
  { re: /^\/obras\/(\d+)(?:\/|$)/, model: null }
];

function toIds(values) {
  return (Array.isArray(values) ? values : [values])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);
}

async function obraDaEntidade(modelName, id, route) {
  const model = db[modelName];
  if (!model) return [];
  const record = await model.findByPk(id, { raw: true });
  if (!record) return [];
  const ids = [];
  if (record.obra_id) ids.push(Number(record.obra_id));
  if (route?.viaContrato && record.contrato_id) {
    const contrato = await db.Contrato.findByPk(Number(record.contrato_id), { attributes: ['obra_id'], raw: true });
    if (contrato?.obra_id) ids.push(Number(contrato.obra_id));
  }
  if (route?.rateios && db.TituloFinanceiroRateio) {
    const rateios = await db.TituloFinanceiroRateio.findAll({
      where: { titulo_financeiro_id: id },
      attributes: ['obra_id'],
      raw: true
    });
    rateios.forEach((item) => { if (item.obra_id) ids.push(Number(item.obra_id)); });
  }
  return ids;
}

async function obrasDaRequisicao(req) {
  const path = String(req.path || '').split('?')[0];
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const query = req.query || {};
  const ids = new Set();
  const add = (values) => toIds(values).forEach((id) => ids.add(id));

  add(body.obra_id);
  add(body.obra_ids || []);
  add(body.obra_origem_id);
  add(body.obra_destino_id);
  add(query.obra_id);
  add(String(query.obra_ids || '').split(',').filter(Boolean));
  ['distribuicoes', 'rateios', 'centros_custo', 'distribuicao_centros_custo'].forEach((key) => {
    if (Array.isArray(body[key])) body[key].forEach((item) => add(item?.obra_id));
  });

  for (const route of ENTITY_ROUTES) {
    const match = path.match(route.re);
    if (!match) continue;
    if (!route.model) add(match[1]);
    else (await obraDaEntidade(route.model, Number(match[1]), route)).forEach((id) => ids.add(id));
    break;
  }
  const solicitacaoIds = toIds([...toIds(body.solicitacao_ids || []), ...toIds(body.solicitacao_id || [])]);
  if (solicitacaoIds.length) {
    const rows = await db.Solicitacao.findAll({
      where: { id: { [Op.in]: solicitacaoIds } },
      attributes: ['obra_id'],
      raw: true
    });
    rows.forEach((row) => add(row.obra_id));
  }
  if (body.medicao_id) {
    (await obraDaEntidade('ContratoMedicao', Number(body.medicao_id), { viaContrato: true }))
      .forEach((id) => ids.add(id));
  }
  return [...ids];
}

function mensagemTravada(item) {
  const partes = item.pendencias.map((pendencia) => (pendencia.tipo === 'PLANEJAMENTO'
    ? `planejamento de ${pendencia.competencia} vencido`
    : `medicao aprovada de ${pendencia.competencia} vencida`));
  const obra = `${item.obra.codigo ? `${item.obra.codigo} - ` : ''}${item.obra.nome}`;
  return `A obra ${obra} esta travada (${partes.join(' e ')}). Regularize em Custos e Recebiveis para liberar.`;
}

module.exports = {
  CACHE_TTL_MS,
  calcularObrasTravadas,
  guardMode,
  invalidarObrasTravadas,
  mensagemTravada,
  obrasDaRequisicao,
  obrasTravadasDoUsuario
};
