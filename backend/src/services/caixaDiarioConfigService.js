const { Op } = require('sequelize');
const { CaixaFinanceiroSessao, ConfiguracaoSistema, ContaBancaria, User } = require('../models');

const CHAVE_CAIXA_DIARIO_CONFIG = 'FINANCEIRO_CAIXA_DIARIO_CONFIG';
const DEFAULT_CAIXA_DIARIO_CONFIG = Object.freeze({
  bloqueio_ativo: false,
  responsaveis_usuario_ids: [],
  aprovadores_usuario_ids: []
});

let cache = null;
let cacheExpiresAt = 0;

function normalizeIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0))];
}

function normalizeConfig(value = {}) {
  return {
    bloqueio_ativo: value?.bloqueio_ativo === true,
    responsaveis_usuario_ids: normalizeIds(value?.responsaveis_usuario_ids),
    aprovadores_usuario_ids: normalizeIds(value?.aprovadores_usuario_ids)
  };
}

function parseConfig(raw) {
  if (!raw) return normalizeConfig(DEFAULT_CAIXA_DIARIO_CONFIG);
  try {
    return normalizeConfig(JSON.parse(raw));
  } catch (_) {
    return normalizeConfig(DEFAULT_CAIXA_DIARIO_CONFIG);
  }
}

function invalidateCaixaDiarioConfigCache() {
  cache = null;
  cacheExpiresAt = 0;
}

async function obterCaixaDiarioConfig({ useCache = true } = {}) {
  if (useCache && cache && Date.now() < cacheExpiresAt) return { ...cache };

  const registro = await ConfiguracaoSistema.findOne({
    where: { chave: CHAVE_CAIXA_DIARIO_CONFIG },
    order: [['id', 'DESC']]
  });
  cache = parseConfig(registro?.valor);
  cacheExpiresAt = Date.now() + 10_000;
  return { ...cache };
}

async function validarUsuariosAtivos(ids) {
  const normalizados = normalizeIds(ids);
  if (normalizados.length === 0) return normalizados;

  const usuarios = await User.findAll({
    where: { id: { [Op.in]: normalizados }, ativo: { [Op.ne]: false } },
    attributes: ['id']
  });
  const validos = new Set(usuarios.map((usuario) => Number(usuario.id)));
  const invalidos = normalizados.filter((id) => !validos.has(id));
  if (invalidos.length > 0) {
    const error = new Error(`Usuario(s) inativo(s) ou inexistente(s): ${invalidos.join(', ')}.`);
    error.statusCode = 400;
    throw error;
  }
  return normalizados;
}

async function salvarCaixaDiarioConfig(payload = {}) {
  const config = normalizeConfig(payload);
  config.responsaveis_usuario_ids = await validarUsuariosAtivos(config.responsaveis_usuario_ids);
  config.aprovadores_usuario_ids = await validarUsuariosAtivos(config.aprovadores_usuario_ids);

  if (config.bloqueio_ativo && config.responsaveis_usuario_ids.length === 0) {
    const error = new Error('Selecione ao menos um usuario responsavel antes de ativar o bloqueio.');
    error.statusCode = 400;
    throw error;
  }

  const [registro] = await ConfiguracaoSistema.findOrCreate({
    where: { chave: CHAVE_CAIXA_DIARIO_CONFIG },
    defaults: { valor: JSON.stringify(config) }
  });
  await registro.update({ valor: JSON.stringify(config) });
  invalidateCaixaDiarioConfigCache();
  return config;
}

function isSuperadmin(user) {
  return String(user?.perfil || '').trim().toUpperCase() === 'SUPERADMIN';
}

async function usuarioPodeOperarCaixa(user) {
  if (isSuperadmin(user)) return true;
  const config = await obterCaixaDiarioConfig();
  // Compatibilidade segura: antes de o superadmin configurar a rotina,
  // preserva o acesso financeiro que ja existia. A primeira selecao passa
  // a ser a fonte explicita de quem pode operar.
  if (config.responsaveis_usuario_ids.length === 0) return true;
  return config.responsaveis_usuario_ids.includes(Number(user?.id));
}

async function usuarioPodeAprovarDivergencia(user) {
  if (isSuperadmin(user)) return true;

  // A permissao granular e a fonte de verdade para usuarios que ja usam a matriz nova. A lista
  // antiga de aprovadores continua somente como compatibilidade para cadastros ainda nao migrados.
  // Sem esta bifurcacao, marcar `financeiro.caixas.decidir_divergencia` na tela de permissoes nao
  // produzia efeito: o painel escondia o botao por causa de uma segunda autorizacao silenciosa.
  const {
    userHasAreaPermission,
    userHasConfiguredAreaPermissions
  } = require('./authorizationService');
  if (await userHasConfiguredAreaPermissions(user)) {
    return userHasAreaPermission(user, ['financeiro.caixas.decidir_divergencia']);
  }

  const config = await obterCaixaDiarioConfig();
  return config.aprovadores_usuario_ids.includes(Number(user?.id));
}

async function usuarioEstaSujeitoAoBloqueio(user) {
  if (isSuperadmin(user)) return false;
  const config = await obterCaixaDiarioConfig();
  return config.bloqueio_ativo && config.responsaveis_usuario_ids.includes(Number(user?.id));
}

function dataOperacionalHoje(now = new Date()) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const valor = (tipo) => partes.find((parte) => parte.type === tipo)?.value;
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

async function obterEstadoBloqueioDiario(user, { transaction = null } = {}) {
  const sujeito = await usuarioEstaSujeitoAoBloqueio(user);
  if (!sujeito) return { bloqueado: false, total_contas: 0, contas_pendentes: 0 };

  const contas = await ContaBancaria.findAll({
    where: {
      ativo: { [Op.ne]: false },
      exige_abertura_fechamento: true
    },
    attributes: ['id'],
    transaction
  });
  const ids = contas.map((conta) => Number(conta.id));
  if (ids.length === 0) return { bloqueado: false, total_contas: 0, contas_pendentes: 0 };

  const hoje = dataOperacionalHoje();
  const [sessoes, sessoesAnterioresPendentes] = await Promise.all([CaixaFinanceiroSessao.findAll({
    where: {
      conta_bancaria_id: { [Op.in]: ids },
      status: 'ABERTO',
      data_abertura: hoje
    },
    attributes: ['conta_bancaria_id'],
    transaction
  }), CaixaFinanceiroSessao.findAll({
    where: {
      conta_bancaria_id: { [Op.in]: ids },
      data_abertura: { [Op.lt]: hoje },
      status: { [Op.in]: ['ABERTO', 'AGUARDANDO_APROVACAO'] }
    },
    attributes: ['conta_bancaria_id'],
    transaction
  })]);
  const semFechamentoAnterior = new Set(sessoesAnterioresPendentes.map((sessao) => Number(sessao.conta_bancaria_id)));
  const prontas = new Set(sessoes.map((sessao) => Number(sessao.conta_bancaria_id)));
  const totalProntas = ids.filter((id) => prontas.has(id) && !semFechamentoAnterior.has(id)).length;
  return {
    bloqueado: totalProntas < ids.length,
    total_contas: ids.length,
    contas_prontas: totalProntas,
    contas_pendentes: ids.length - totalProntas,
    contas_sem_fechamento_anterior: semFechamentoAnterior.size,
    data_referencia: hoje
  };
}

module.exports = {
  CHAVE_CAIXA_DIARIO_CONFIG,
  DEFAULT_CAIXA_DIARIO_CONFIG,
  invalidateCaixaDiarioConfigCache,
  normalizeConfig,
  obterCaixaDiarioConfig,
  salvarCaixaDiarioConfig,
  obterEstadoBloqueioDiario,
  dataOperacionalHoje,
  usuarioEstaSujeitoAoBloqueio,
  usuarioPodeAprovarDivergencia,
  usuarioPodeOperarCaixa
};
