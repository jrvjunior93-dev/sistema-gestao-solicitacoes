'use strict';

/**
 * "Olho" do Painel do Gestor (contrato de 29/09/2026).
 *
 * - Estado por usuario em ConfiguracaoSistema, chave `PAINEL_GESTOR_OLHO_FECHADO:<userId>`
 *   (valor JSON { fechado: true, fechado_em }). Ausente = aberto. Sem migration.
 * - PIN unico do sistema em ConfiguracaoSistema `PAINEL_GESTOR_PIN` (valor JSON
 *   { hash, atualizado_em, atualizado_por }). O hash (bcryptjs) nunca sai deste modulo.
 * - Limite de tentativas de abrir: em memoria do processo (janela deslizante), por usuario
 *   (5 erradas em 15 min) e por IP (20 erradas em 15 min). Reinicio do processo zera os
 *   contadores; com varios processos cada um conta os seus. Suficiente para impedir a
 *   varredura das 10.000 combinacoes (5 a cada 15 min = ~20 dias por usuario).
 * - Cache curto (3 s) do estado por usuario, invalidado no proprio processo ao fechar/abrir.
 * - `mascararValores` troca por null todo valor financeiro de uma resposta do painel.
 *   Usado SO pelo PainelGestorController: as outras telas que usam os mesmos servicos
 *   (Financeiro > Resultado de Obras, modulo Custos e Recebiveis) nao sao afetadas.
 */

const CHAVE_PIN = 'PAINEL_GESTOR_PIN';
const PREFIXO_CHAVE_OLHO = 'PAINEL_GESTOR_OLHO_FECHADO:';
const PIN_REGEX = /^\d{4}$/;
const BCRYPT_ROUNDS = 10;
const CACHE_TTL_MS = 3000;
const JANELA_TENTATIVAS_MS = 15 * 60 * 1000;
const MAX_TENTATIVAS_USUARIO = 5;
const MAX_TENTATIVAS_IP = 20;
const MAX_CHAVES_LIMITADOR = 10000;

function businessError(statusCode, code, message, extra = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  Object.assign(error, extra);
  return error;
}

function chaveOlho(userId) {
  return `${PREFIXO_CHAVE_OLHO}${Number(userId)}`;
}

function parseJson(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Mascaramento
// ---------------------------------------------------------------------------

/**
 * Chaves numericas que NAO sao dinheiro (contagens, ids, prioridade) e continuam visiveis,
 * mesmo que o nome contenha um termo financeiro (ex.: `recebiveis_vencidos` e contagem).
 */
const CHAVES_NAO_FINANCEIRAS = new Set([
  'id',
  'itens',
  'alertas',
  'prioridade',
  'total_obras',
  'contas_informadas',
  'contas_total',
  'contas_pendentes',
  'vgv_unidades_total',
  'vgv_unidades_sem_valor',
  'obras_com_custo_acima',
  'movimentos_sem_mapeamento',
  'recebiveis_vencidos'
]);

/** Lista negra explicita (campos reais das 3 respostas do painel). */
const CHAVES_FINANCEIRAS = new Set([
  // Resultado de Obras
  'vgv', 'vgv_efetivo', 'planilha_geral', 'planilha_geral_efetiva',
  'margem_custo_esperada', 'orcamento',
  'valor_referencia_resultado', 'valor_total_resultado', 'falta_receber', 'valor_vendido',
  'falta_vender', 'lucro_prejuizo', 'total', 'executado', 'executado_acumulado_ate', 'saldo',
  'recebido', 'recebido_acumulado_ate', 'valor',
  // Custos e Recebiveis
  'custo_planejado', 'custo_realizado', 'desvio_custo', 'percentual_custo', 'recebivel_previsto',
  'recebivel_reconhecido', 'medicao_aprovada', 'receita_recebida', 'saldo_receber', 'glosa',
  'previsto', 'realizado', 'delta', 'percentual_execucao',
  // Saldos e Contas
  'saldo_informado', 'saldo_anterior', 'saldo_novo', 'saldo_inicial', 'saldo_disponivel'
]);

/** Regra generica de seguranca: qualquer numero em chave com estes termos e financeiro. */
const REGEX_CHAVE_FINANCEIRA = /valor|saldo|custo|receita|recebid|executad|previst|planejad|realizad|medicao|glosa|vgv|lucro|prejuizo|resultado|total|falta|orcad|orcament|empenh|pag|receb|vend|desvio|montante|preco|delta|percent|margem|planilha/i;

/** Valor monetario formatado dentro de texto (ex.: "R$ 1.234,56", "-R$ 10,00"). */
const REGEX_DINHEIRO_EM_TEXTO = /-?\s?R\$[\s ]*-?[\d.,]+/g;
const TEXTO_OCULTO = '••••••';
const REGEX_NUMERICO = /^\s*-?[\d.,]+\s*$/;

function chaveNaoFinanceira(key) {
  const normalized = String(key || '').toLowerCase();
  return CHAVES_NAO_FINANCEIRAS.has(normalized)
    || normalized.endsWith('_id')
    || normalized.startsWith('quantidade');
}

function chaveFinanceira(key) {
  if (key == null) return false;
  const normalized = String(key).toLowerCase();
  if (chaveNaoFinanceira(normalized)) return false;
  return CHAVES_FINANCEIRAS.has(normalized) || REGEX_CHAVE_FINANCEIRA.test(normalized);
}

function mascararTexto(value) {
  if (!value.includes('R$')) return value;
  const substituido = value.replace(REGEX_DINHEIRO_EM_TEXTO, ` ${TEXTO_OCULTO}`).replace(/\s{2,}/g, ' ');
  return substituido.includes('R$') ? null : substituido;
}

function mascararNo(value, key) {
  if (value == null) return value;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && typeof value.toJSON === 'function' && !Array.isArray(value)) {
    return mascararNo(value.toJSON(), key);
  }
  if (Array.isArray(value)) {
    // Itens de lista herdam a chave do pai (ex.: [1, 2] em `valores` continua financeiro).
    return value.map((item) => mascararNo(item, key));
  }
  if (typeof value === 'object') {
    const result = {};
    Object.keys(value).forEach((childKey) => {
      result[childKey] = mascararNo(value[childKey], childKey);
    });
    return result;
  }
  const financeira = chaveFinanceira(key);
  if (typeof value === 'number' || typeof value === 'bigint') {
    return financeira ? null : value;
  }
  if (typeof value === 'string') {
    if (financeira && REGEX_NUMERICO.test(value)) return null;
    return mascararTexto(value);
  }
  return value;
}

/**
 * Devolve uma COPIA do payload com a mesma estrutura e todo valor financeiro = null.
 * Preserva ids, nomes, situacao/estado, datas, competencias, contagens e booleanos.
 * Percentuais financeiros (percentual_custo, percentual_execucao, margem) tambem sao
 * ocultados: revelam proporcao entre valores. Textos com "R$ <numero>" tem o numero
 * trocado por "••••••" (alertas do Custos e Recebiveis).
 */
function mascararValores(payload) {
  return mascararNo(payload, null);
}

// ---------------------------------------------------------------------------
// Limitador de tentativas (memoria)
// ---------------------------------------------------------------------------

function criarLimitador({ janelaMs = JANELA_TENTATIVAS_MS, now = () => Date.now() } = {}) {
  const falhas = new Map();

  function recentes(key) {
    const limite = now() - janelaMs;
    const lista = (falhas.get(key) || []).filter((ts) => ts > limite);
    if (lista.length) falhas.set(key, lista);
    else falhas.delete(key);
    return lista;
  }

  function podar() {
    if (falhas.size <= MAX_CHAVES_LIMITADOR) return;
    [...falhas.keys()].forEach((key) => recentes(key));
    // Se mesmo assim estourar, descarta as chaves mais antigas (IPs), nunca as de usuario.
    if (falhas.size > MAX_CHAVES_LIMITADOR) {
      [...falhas.keys()]
        .filter((key) => key.startsWith('ip:'))
        .slice(0, falhas.size - MAX_CHAVES_LIMITADOR)
        .forEach((key) => falhas.delete(key));
    }
  }

  return {
    bloqueio(key, max) {
      const lista = recentes(key);
      if (lista.length < max) return null;
      const liberaEm = lista[lista.length - max] + janelaMs;
      return { restanteMs: Math.max(0, liberaEm - now()), liberaEm };
    },
    registrar(key) {
      const lista = recentes(key);
      const ts = now();
      lista.push(ts);
      falhas.set(key, lista);
      podar();
      return ts;
    },
    remover(key, ts) {
      const lista = falhas.get(key) || [];
      const index = lista.lastIndexOf(ts);
      if (index >= 0) lista.splice(index, 1);
      if (lista.length) falhas.set(key, lista);
      else falhas.delete(key);
    },
    limpar(key) {
      falhas.delete(key);
    },
    contar(key) {
      return recentes(key).length;
    }
  };
}

// ---------------------------------------------------------------------------
// Servico
// ---------------------------------------------------------------------------

function criarPainelGestorOlhoService(overrides = {}) {
  const deps = {
    ConfiguracaoSistema: overrides.ConfiguracaoSistema || null,
    bcrypt: overrides.bcrypt || null,
    registrarEventoSeguranca: overrides.registrarEventoSeguranca || null,
    now: overrides.now || (() => Date.now()),
    cacheTtlMs: overrides.cacheTtlMs ?? CACHE_TTL_MS,
    maxTentativasUsuario: overrides.maxTentativasUsuario ?? MAX_TENTATIVAS_USUARIO,
    maxTentativasIp: overrides.maxTentativasIp ?? MAX_TENTATIVAS_IP,
    janelaMs: overrides.janelaMs ?? JANELA_TENTATIVAS_MS
  };
  // Carregamento tardio: o teste injeta tudo e nao precisa do banco.
  const model = () => deps.ConfiguracaoSistema || require('../models').ConfiguracaoSistema;
  const bcrypt = () => deps.bcrypt || require('bcryptjs');
  const auditar = (payload) => {
    const fn = deps.registrarEventoSeguranca
      || require('./securityLogService').registrarEventoSeguranca;
    return Promise.resolve()
      .then(() => fn({ recursoTipo: 'PAINEL_GESTOR', ...payload }))
      .catch(() => null);
  };

  const cache = new Map();
  const limitador = criarLimitador({ janelaMs: deps.janelaMs, now: deps.now });

  function userIdDe(user) {
    const id = Number(user?.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw businessError(401, 'NAO_AUTENTICADO', 'Usuario nao autenticado.');
    }
    return id;
  }

  function ipDe(req) {
    // req.ip respeita o `trust proxy` do app (nao confia em X-Forwarded-For forjado).
    return String(req?.ip || req?.socket?.remoteAddress || 'desconhecido');
  }

  async function buscarRegistro(chave) {
    return model().findOne({ where: { chave }, order: [['id', 'DESC']] });
  }

  async function lerFechadoDoBanco(userId) {
    const registro = await buscarRegistro(chaveOlho(userId));
    const valor = parseJson(registro?.valor);
    return valor?.fechado === true;
  }

  async function estaFechado(userValue) {
    const userId = typeof userValue === 'object' ? userIdDe(userValue) : Number(userValue);
    const agora = deps.now();
    const emCache = cache.get(userId);
    if (emCache && emCache.expira > agora) return emCache.fechado;
    const fechado = await lerFechadoDoBanco(userId);
    cache.set(userId, { fechado, expira: agora + deps.cacheTtlMs });
    if (cache.size > MAX_CHAVES_LIMITADOR) cache.clear();
    return fechado;
  }

  async function lerPin() {
    const registro = await buscarRegistro(CHAVE_PIN);
    const valor = parseJson(registro?.valor);
    if (!valor || typeof valor.hash !== 'string' || !valor.hash) return null;
    return {
      hash: valor.hash,
      atualizado_em: valor.atualizado_em || (registro.updatedAt ? new Date(registro.updatedAt).toISOString() : null)
    };
  }

  async function obterEstado(user) {
    const userId = userIdDe(user);
    const [fechado, pin] = await Promise.all([estaFechado(userId), lerPin()]);
    return { fechado, pin_configurado: Boolean(pin) };
  }

  async function fechar(user, req = null) {
    const userId = userIdDe(user);
    const chave = chaveOlho(userId);
    const registro = await buscarRegistro(chave);
    const atual = parseJson(registro?.valor);
    if (atual?.fechado === true) {
      cache.set(userId, { fechado: true, expira: deps.now() + deps.cacheTtlMs });
      return { fechado: true };
    }
    const valor = JSON.stringify({ fechado: true, fechado_em: new Date(deps.now()).toISOString() });
    if (registro) await registro.update({ valor });
    else await model().create({ chave, valor });
    cache.set(userId, { fechado: true, expira: deps.now() + deps.cacheTtlMs });
    void auditar({
      req,
      usuarioId: userId,
      tipoEvento: 'PAINEL_GESTOR_OLHO_FECHADO',
      recursoId: userId,
      status: 'SUCCESS',
      descricao: 'Valores do Painel do Gestor ocultados pelo usuario'
    });
    return { fechado: true };
  }

  function erroBloqueio(bloqueio) {
    const segundos = Math.max(1, Math.ceil(bloqueio.restanteMs / 1000));
    return businessError(
      429,
      'PIN_BLOQUEADO',
      `Muitas tentativas incorretas. Tente novamente em ${Math.ceil(segundos / 60)} minuto(s).`,
      {
        tempo_restante_segundos: segundos,
        bloqueado_ate: new Date(bloqueio.liberaEm).toISOString()
      }
    );
  }

  async function abrir(user, pinValue, req = null) {
    const userId = userIdDe(user);
    if (!(await lerFechadoDoBanco(userId))) {
      cache.set(userId, { fechado: false, expira: deps.now() + deps.cacheTtlMs });
      return { fechado: false };
    }

    const chaveUsuario = `user:${userId}`;
    const chaveIp = `ip:${ipDe(req)}`;
    const bloqueio = limitador.bloqueio(chaveUsuario, deps.maxTentativasUsuario)
      || limitador.bloqueio(chaveIp, deps.maxTentativasIp);
    if (bloqueio) {
      void auditar({
        req,
        usuarioId: userId,
        tipoEvento: 'PAINEL_GESTOR_PIN_BLOQUEADO',
        recursoId: userId,
        status: 'DENIED',
        descricao: 'Tentativa de abrir o Painel do Gestor durante bloqueio por excesso de tentativas',
        metadata: { tempo_restante_segundos: Math.ceil(bloqueio.restanteMs / 1000) }
      });
      throw erroBloqueio(bloqueio);
    }

    const pin = await lerPin();
    if (!pin) {
      throw businessError(
        409,
        'PIN_NAO_CONFIGURADO',
        'A senha do Painel do Gestor ainda nao foi configurada. Procure o administrador.'
      );
    }

    // Reserva a tentativa ANTES de comparar: requisicoes paralelas nao furam o limite.
    limitador.registrar(chaveUsuario);
    const tsIp = limitador.registrar(chaveIp);
    const pinTexto = typeof pinValue === 'string' ? pinValue : '';
    const valido = PIN_REGEX.test(pinTexto) && await bcrypt().compare(pinTexto, pin.hash);

    if (valido) {
      limitador.limpar(chaveUsuario);
      limitador.remover(chaveIp, tsIp);
      await model().destroy({ where: { chave: chaveOlho(userId) } });
      cache.set(userId, { fechado: false, expira: deps.now() + deps.cacheTtlMs });
      void auditar({
        req,
        usuarioId: userId,
        tipoEvento: 'PAINEL_GESTOR_OLHO_ABERTO',
        recursoId: userId,
        status: 'SUCCESS',
        descricao: 'Valores do Painel do Gestor exibidos apos senha correta'
      });
      return { fechado: false };
    }

    const falhasUsuario = limitador.contar(chaveUsuario);
    const restantes = Math.max(0, deps.maxTentativasUsuario - falhasUsuario);
    void auditar({
      req,
      usuarioId: userId,
      tipoEvento: 'PAINEL_GESTOR_PIN_INVALIDO',
      recursoId: userId,
      status: 'DENIED',
      descricao: 'Senha incorreta ao abrir o Painel do Gestor',
      metadata: { tentativas_na_janela: falhasUsuario }
    });
    const novoBloqueio = limitador.bloqueio(chaveUsuario, deps.maxTentativasUsuario)
      || limitador.bloqueio(chaveIp, deps.maxTentativasIp);
    if (novoBloqueio) {
      void auditar({
        req,
        usuarioId: userId,
        tipoEvento: 'PAINEL_GESTOR_PIN_BLOQUEADO',
        recursoId: userId,
        status: 'DENIED',
        descricao: 'Abertura do Painel do Gestor bloqueada por excesso de tentativas',
        metadata: { tempo_restante_segundos: Math.ceil(novoBloqueio.restanteMs / 1000) }
      });
      throw erroBloqueio(novoBloqueio);
    }
    throw businessError(403, 'PIN_INVALIDO', 'Senha incorreta.', { tentativas_restantes: restantes });
  }

  async function obterConfiguracaoPin() {
    const pin = await lerPin();
    return { configurado: Boolean(pin), atualizado_em: pin?.atualizado_em || null };
  }

  async function definirPin(user, pinValue, req = null) {
    const userId = userIdDe(user);
    if (typeof pinValue !== 'string' || !PIN_REGEX.test(pinValue)) {
      throw businessError(400, 'PIN_FORMATO_INVALIDO', 'A senha deve ter exatamente 4 digitos numericos.');
    }
    const hash = await bcrypt().hash(pinValue, BCRYPT_ROUNDS);
    const atualizadoEm = new Date(deps.now()).toISOString();
    const valor = JSON.stringify({ hash, atualizado_em: atualizadoEm, atualizado_por: userId });
    const registro = await buscarRegistro(CHAVE_PIN);
    if (registro) await registro.update({ valor });
    else await model().create({ chave: CHAVE_PIN, valor });
    void auditar({
      req,
      usuarioId: userId,
      tipoEvento: 'PAINEL_GESTOR_PIN_ALTERADO',
      recursoId: 'PAINEL_GESTOR_PIN',
      status: 'SUCCESS',
      descricao: 'Senha do Painel do Gestor definida/alterada'
    });
    return { configurado: true };
  }

  return {
    estaFechado,
    obterEstado,
    fechar,
    abrir,
    obterConfiguracaoPin,
    definirPin,
    _limitador: limitador,
    _cache: cache
  };
}

const servicoPadrao = criarPainelGestorOlhoService();

module.exports = {
  ...servicoPadrao,
  CHAVE_PIN,
  PREFIXO_CHAVE_OLHO,
  chaveOlho,
  chaveFinanceira,
  criarPainelGestorOlhoService,
  criarLimitador,
  mascararValores,
  REGEX_CHAVE_FINANCEIRA
};
