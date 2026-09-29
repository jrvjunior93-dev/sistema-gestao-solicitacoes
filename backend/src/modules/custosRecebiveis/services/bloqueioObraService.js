'use strict';

const { Op } = require('sequelize');
const db = require('../../../models');
const { isModuleEnabled } = require('../../../services/moduleConfigService');
const { isSuperadmin } = require('../../../services/authorizationService');
const {
  CUSTOS_RECEBIVEIS_MODULE_KEY,
  CUSTOS_RECEBIVEIS_PERMISSIONS
} = require('../constants/custosRecebiveisConstants');
const { resolveExplicitCustosRecebiveisPermissions } = require('../policies/permissionPolicy');
const { carregarContextoPrazos, resumirPrazosObra } = require('./prazoService');

// Liberacao temporaria vale no maximo 48h, inclusive as concedidas antes do
// limite novo (29/09): na leitura, conta o menor entre expira_em e concedido+48h.
const BYPASS_MAX_MS = 48 * 3600000;

/*
  BLOQUEIO POR ATRASO (reforma de 29/09/2026, Fase 3, revisto no mesmo dia).

  Quando: planejamento vencido e nao entregue, ou medicao aprovada vencida
  (prazo com dilatacao) sem registro nem "sem medicao", em obra que tem
  engenheiro RESPONSAVEL/SUBSTITUTO vigente com permissao para regularizar.
  Pedido de dilatacao aguardando decisao NAO destrava. Mes reaberto para
  correcao nao trava.
  O que impede: a OBRA nao recebe solicitacao NOVA, de ninguem (geral, compra,
  compra direta, contrato pela abertura, RH). Solicitacoes ja existentes,
  titulos, pagamentos, baixas e compras em andamento seguem normais para
  todos. Dentro de Custos e Recebiveis o engenheiro responsavel so ve o que
  regulariza.
  Excecao unica: liberacao temporaria do administrador (ate 48h), que libera a
  obra para todos. Sem excecao fixa para SUPERADMIN (decisao do proprietario).
  Modo: `CR_GUARD_MODE=enforce` bloqueia; `observe` (padrao) so avisa.
*/

const CACHE_TTL_MS = 30 * 1000;
const cache = new Map();
const cacheObras = new Map();

function guardMode(value = process.env.CR_GUARD_MODE) {
  return String(value || 'observe').trim().toLowerCase() === 'enforce' ? 'enforce' : 'observe';
}

function dependencies(overrides = {}) {
  return {
    Obra: db.Obra,
    User: db.User,
    Setor: db.Setor,
    CrResponsavelObra: db.CrResponsavelObra,
    CrGuardBypass: db.CrGuardBypass,
    RhColaborador: db.RhColaborador,
    carregarContextoPrazos,
    isModuleEnabled,
    isSuperadmin,
    resolveExplicitPermissions: resolveExplicitCustosRecebiveisPermissions,
    now: () => new Date(),
    ...overrides
  };
}

function dateKeyBrasilia(now) {
  return new Date(now.getTime() - 3 * 3600000).toISOString().slice(0, 10);
}

function pendencias(prazos, capabilities) {
  const result = [];
  if (capabilities.planning && prazos?.planejamento?.situacao === 'VENCIDO') {
    result.push({
      tipo: 'PLANEJAMENTO',
      competencia: prazos.planejamento.competencia,
      dias: prazos.planejamento.dias,
      prazo_em: prazos.planejamento.prazo_em
    });
  }
  if (capabilities.measurement && prazos?.medicao?.situacao === 'VENCIDO') {
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

// So conta quem consegue se regularizar: sem a permissao de preencher o
// planejamento (ou de registrar a medicao) a pendencia nao trava a obra.
async function capacidadesDoUsuario(user, deps) {
  if (deps.isSuperadmin(user)) return { planning: true, measurement: true };
  const permissions = new Set((await deps.resolveExplicitPermissions(user))
    .map((permission) => String(permission || '').trim().toLowerCase()));
  const access = permissions.has(CUSTOS_RECEBIVEIS_PERMISSIONS.MODULE_ACCESS);
  return {
    planning: access && (
      permissions.has(CUSTOS_RECEBIVEIS_PERMISSIONS.PLANEJAMENTO_COSTS)
      || permissions.has(CUSTOS_RECEBIVEIS_PERMISSIONS.PLANEJAMENTO_RECEIVABLES)
    ),
    measurement: access && permissions.has(CUSTOS_RECEBIVEIS_PERMISSIONS.MEDICAO_CONSOLIDATE)
  };
}

function responsaveisVigentes(where, deps, now, includeUser = false) {
  const today = dateKeyBrasilia(now);
  const include = [{
    model: deps.Obra,
    as: 'obra',
    attributes: ['id', 'codigo', 'nome', 'classificacao', 'ativo'],
    where: { ativo: true },
    required: true
  }];
  if (includeUser) {
    // Responsavel com usuario desativado nao consegue regularizar: nao conta.
    include.push({
      model: deps.User,
      as: 'usuario',
      attributes: ['id', 'perfil', 'setor_id'],
      where: { ativo: true },
      required: true,
      include: deps.Setor ? [{ model: deps.Setor, as: 'setor', attributes: ['id', 'codigo', 'nome'] }] : []
    });
  }
  return deps.CrResponsavelObra.findAll({
    where: {
      ...where,
      ativo: true,
      papel: { [Op.in]: ['RESPONSAVEL', 'SUBSTITUTO'] },
      vigencia_inicio: { [Op.lte]: today },
      [Op.or]: [{ vigencia_fim: null }, { vigencia_fim: { [Op.gte]: today } }]
    },
    include
  });
}

// Liberacao temporaria vale para a OBRA (qualquer que seja o usuario a quem
// foi concedida); a antiga "todas as obras" (obra_id nulo) vale para as obras
// do proprio usuario.
async function liberacoesVigentes(obraIds, userIds, deps, now) {
  const rows = await deps.CrGuardBypass.findAll({
    where: {
      revogado_em: null,
      expira_em: { [Op.gt]: now },
      [Op.or]: [
        { obra_id: { [Op.in]: obraIds } },
        ...(userIds.length ? [{ obra_id: null, user_id: { [Op.in]: userIds } }] : [])
      ]
    },
    attributes: ['obra_id', 'user_id', 'expira_em', 'concedido_em'],
    raw: true
  });
  return rows
    .map((item) => {
      const limite = item.concedido_em ? new Date(item.concedido_em).getTime() + BYPASS_MAX_MS : Infinity;
      return { ...item, expira_em: new Date(Math.min(new Date(item.expira_em).getTime(), limite)) };
    })
    .filter((item) => item.expira_em > now);
}

function avaliarObra({ obra, entry, capabilities, liberacao, now, mode }) {
  if (!entry) return null;
  const prazos = resumirPrazosObra({ classificacao: obra.classificacao, ...entry, now });
  const itens = pendencias(prazos, capabilities);
  if (!itens.length) return null;
  return {
    obra_id: Number(obra.id),
    obra: { id: Number(obra.id), codigo: obra.codigo || null, nome: obra.nome },
    pendencias: itens,
    liberada_ate: liberacao ? new Date(liberacao.expira_em).toISOString() : null,
    modo: mode,
    // Trava de fato so em enforce e sem liberacao vigente; em observe a
    // tela avisa ("seria travada") sem impedir nada.
    bloqueando: mode === 'enforce' && !liberacao
  };
}

async function moduloLigado(options, deps) {
  return options.moduleEnabled === undefined
    ? deps.isModuleEnabled(CUSTOS_RECEBIVEIS_MODULE_KEY)
    : Boolean(options.moduleEnabled);
}

// Obras travadas em que o usuario e o engenheiro responsavel/substituto: e o
// que a faixa global e os cards de obra mostram a ele.
async function calcularObrasTravadas(user, options = {}, overrides = {}) {
  const deps = dependencies(overrides);
  if (!user?.id) return [];
  if (!(await moduloLigado(options, deps))) return [];
  const capabilities = await capacidadesDoUsuario(user, deps);
  if (!capabilities.planning && !capabilities.measurement) return [];
  const now = options.now || deps.now();
  const responsaveis = await responsaveisVigentes({ user_id: Number(user.id) }, deps, now);
  const obras = new Map();
  responsaveis.forEach((record) => {
    const item = record?.toJSON ? record.toJSON() : record;
    if (item?.obra && !obras.has(Number(item.obra.id))) obras.set(Number(item.obra.id), item.obra);
  });
  if (!obras.size) return [];
  const context = await deps.carregarContextoPrazos([...obras.keys()]);
  const liberacoes = await liberacoesVigentes([...obras.keys()], [Number(user.id)], deps, now);
  const mode = guardMode(options.mode);
  const result = [];
  obras.forEach((obra, obraId) => {
    const liberacao = liberacoes.find((item) => item.obra_id == null || Number(item.obra_id) === obraId) || null;
    const item = avaliarObra({ obra, entry: context.get(obraId), capabilities, liberacao, now, mode });
    if (item) result.push(item);
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

// Situacao de cada obra (independe de quem pergunta): usada para barrar a
// abertura de solicitacao nova. Retorna Map obra_id -> item (so obras com
// pendencia vencida).
async function calcularTravaDasObras(obraIds, options = {}, overrides = {}) {
  const deps = dependencies(overrides);
  const ids = [...new Set(toIds(obraIds))];
  const result = new Map();
  if (!ids.length || !(await moduloLigado(options, deps))) return result;
  const now = options.now || deps.now();
  const responsaveis = await responsaveisVigentes({ obra_id: { [Op.in]: ids } }, deps, now, true);
  const porObra = new Map();
  for (const record of responsaveis) {
    const item = record?.toJSON ? record.toJSON() : record;
    if (!item?.obra) continue;
    const obraId = Number(item.obra.id);
    const atual = porObra.get(obraId) || { obra: item.obra, userIds: [], capabilities: { planning: false, measurement: false } };
    const user = item.usuario || { id: item.user_id };
    const capabilities = await capacidadesDoUsuario(user, deps);
    atual.capabilities.planning = atual.capabilities.planning || capabilities.planning;
    atual.capabilities.measurement = atual.capabilities.measurement || capabilities.measurement;
    atual.userIds.push(Number(item.user_id));
    porObra.set(obraId, atual);
  }
  if (!porObra.size) return result;
  const context = await deps.carregarContextoPrazos([...porObra.keys()]);
  const allUserIds = [...new Set([...porObra.values()].flatMap((item) => item.userIds))];
  const liberacoes = await liberacoesVigentes([...porObra.keys()], allUserIds, deps, now);
  const mode = guardMode(options.mode);
  porObra.forEach((dados, obraId) => {
    const liberacao = liberacoes.find((item) => (
      Number(item.obra_id) === obraId
      || (item.obra_id == null && dados.userIds.includes(Number(item.user_id)))
    )) || null;
    const item = avaliarObra({ obra: dados.obra, entry: context.get(obraId), capabilities: dados.capabilities, liberacao, now, mode });
    if (item) result.set(obraId, item);
  });
  return result;
}

async function travaDasObras(obraIds, options = {}, overrides = {}) {
  const ids = [...new Set(toIds(obraIds))];
  const nowMs = Date.now();
  const result = new Map();
  const faltando = [];
  ids.forEach((id) => {
    const cached = cacheObras.get(id);
    if (!options.semCache && cached && cached.expires > nowMs) {
      if (cached.value) result.set(id, cached.value);
    } else {
      faltando.push(id);
    }
  });
  if (faltando.length) {
    const calculado = await calcularTravaDasObras(faltando, options, overrides);
    faltando.forEach((id) => {
      const value = calculado.get(id) || null;
      cacheObras.set(id, { value, expires: nowMs + CACHE_TTL_MS });
      if (value) result.set(id, value);
    });
  }
  return result;
}

// Chamado depois de toda gravacao que pode destravar (ou travar) uma obra:
// finalizar, medicao, dilatacao, reabertura, prazos, responsaveis, bypass.
function invalidarObrasTravadas(userId = null) {
  cacheObras.clear();
  if (userId == null) cache.clear();
  else cache.delete(Number(userId));
}

/* ------------------------------------------ abertura de solicitacao nova */

// Rotas que ABREM solicitacao nova para uma obra (decisao de 29/09). Contrato
// entra porque a "Nova solicitacao" abre contrato por esta rota; transferencia
// de RH e cotacao avulsa com obra tambem sao pedidos novos para a obra.
// Ficam FORA (continuidade/folha, decisao registrada): jornada e tickets de
// RH, aditivo de contrato existente. Comparacao sem diferenca de caixa, como
// o roteador do Express.
const ROTAS_SOLICITACAO_NOVA = [
  /^\/solicitacoes\/?$/i,
  /^\/compras\/solicitacoes\/?$/i,
  /^\/compras\/solicitacoes-diretas\/?$/i,
  /^\/compras\/cotacoes\/avulsa\/?$/i,
  /^\/contratos\/fluxo-novo\/?$/i,
  /^\/rh\/solicitacoes\/?$/i,
  /^\/rh\/transferencias\/?$/i
];

function toIds(values) {
  return (Array.isArray(values) ? values : [values])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);
}

function ehAberturaDeSolicitacao(req) {
  if (String(req.method || '').toUpperCase() !== 'POST') return false;
  const path = String(req.path || '').split('?')[0];
  return ROTAS_SOLICITACAO_NOVA.some((re) => re.test(path));
}

async function obrasDaAbertura(req, overrides = {}) {
  const deps = dependencies(overrides);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const ids = new Set();
  const add = (values) => toIds(values).forEach((id) => ids.add(id));
  add(body.obra_id);
  add(body.dados?.obra_id);
  add(body.obra_origem_id);
  add(body.obra_destino_id);
  // Distribuicao do centro de custo: a tela manda { criterio, todas, itens: [] }.
  // "todas as obras" e custo do centro de custo, nao pedido de uma obra: nao
  // entra (decisao registrada); obras listadas uma a uma entram.
  ['distribuicoes', 'rateios', 'centros_custo', 'distribuicao_centro_custo', 'distribuicao_centros_custo'].forEach((key) => {
    const value = body[key];
    const linhas = Array.isArray(value)
      ? value
      : [value?.itens, value?.linhas].find(Array.isArray) || [];
    linhas.forEach((item) => add(item?.obra_id));
  });
  if (body.colaborador_id && deps.RhColaborador) {
    const colaborador = await deps.RhColaborador.findByPk(Number(body.colaborador_id), { attributes: ['obra_id'], raw: true });
    add(colaborador?.obra_id);
  }
  return [...ids];
}

// Dentro de Custos e Recebiveis a obra travada so oferece ao engenheiro o que
// regulariza: consultas do mes (comparativo, realizado), auditoria, estrutura
// e exportacao ficam fechadas ate a liberacao.
function rotaRegularizacaoBloqueada(req, obrasBloqueadas) {
  const path = String(req.path || '').split('?')[0];
  const match = path.match(/^\/custos-recebiveis\/obras\/(\d+)\/(comparativo|realizados|auditoria|plano(?:\/modelo|\/importar.*)?$)/i);
  if (match && obrasBloqueadas.has(Number(match[1]))) return Number(match[1]);
  if (/^\/custos-recebiveis\/exportacoes\//i.test(path)) {
    const obraId = Number(req.query?.obra_id);
    if (!obraId) return obrasBloqueadas.size ? [...obrasBloqueadas][0] : null;
    if (obrasBloqueadas.has(obraId)) return obraId;
  }
  return null;
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// Mensagens vao direto para a tela (campo da obra, faixa): portugues com
// acento e mes por extenso.
function mesPorExtenso(competencia) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(competencia || ''));
  return match ? `${MESES[Number(match[2]) - 1]} de ${match[1]}` : String(competencia || '');
}

function descreverPendencias(item) {
  return item.pendencias.map((pendencia) => (pendencia.tipo === 'PLANEJAMENTO'
    ? `planejamento de ${mesPorExtenso(pendencia.competencia)} vencido`
    : `medição aprovada de ${mesPorExtenso(pendencia.competencia)} vencida`)).join(' e ');
}

function nomeObra(item) {
  return `${item.obra.codigo ? `${item.obra.codigo} - ` : ''}${item.obra.nome}`;
}

function mensagemTravada(item) {
  return `A obra ${nomeObra(item)} está travada (${descreverPendencias(item)}). Regularize em Custos e Recebíveis para liberar.`;
}

function mensagemSolicitacaoNova(item) {
  return `A obra ${nomeObra(item)} não recebe solicitação nova até o engenheiro responsável regularizar Custos e Recebíveis (${descreverPendencias(item)}). Solicitações já abertas seguem normalmente; o administrador pode conceder liberação temporária de até 48 horas.`;
}

module.exports = {
  CACHE_TTL_MS,
  ROTAS_SOLICITACAO_NOVA,
  calcularObrasTravadas,
  calcularTravaDasObras,
  ehAberturaDeSolicitacao,
  guardMode,
  invalidarObrasTravadas,
  mensagemSolicitacaoNova,
  mensagemTravada,
  obrasDaAbertura,
  obrasTravadasDoUsuario,
  rotaRegularizacaoBloqueada,
  travaDasObras
};
