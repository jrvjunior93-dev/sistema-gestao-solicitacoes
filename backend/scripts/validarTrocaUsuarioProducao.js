'use strict';
// Auth/CSRF/MFA/controlador/servico reais. Modelos em memoria, HTTP loopback.
// Nao importa app/database/env reais; nenhuma escrita em banco ou rede externa.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const { Op } = require('sequelize');
const root = path.resolve(__dirname, '..');
function load(file, stubs) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), {
    module, exports: module.exports, console,
    require(name) {
      if (Object.hasOwn(stubs, name)) return stubs[name];
      throw Error('Import nao isolado: ' + file + ' -> ' + name);
    }
  });
  return module.exports;
}
const env = { deploymentEnvironment: 'production', devUserSwitchEnabled: false,
  productionUserSwitchEnabled: true, jwtSecret: 'segredo-ficticio-qa-sem-uso-real',
  jwtExpiresIn: '8h', mfaChallengeExpiresIn: '5m', authCookieName: 'qa_auth', csrfCookieName: 'qa_csrf',
  csrfHeaderName: 'x-csrf-token', authCookieSecure: false };
const users = new Map([
  [1, { id: 1, nome: 'Ator QA', perfil: 'SUPERADMIN', ativo: true, token_version: 3 }],
  [2, { id: 2, nome: 'Usuario QA', perfil: 'USUARIO', ativo: true, token_version: 4, setor_id: 7,
    setor: { id: 7, codigo: 'OBRA' }, permissions: ['solicitacoes.solicitacoes.visualizar_minhas'] }],
  [3, { id: 3, nome: 'Admin QA', perfil: 'ADMIN', ativo: true, token_version: 0 }],
  [4, { id: 4, nome: 'Fora da lista QA', perfil: 'USUARIO', ativo: true, token_version: 0 }],
  [5, { id: 5, nome: 'Outro QA', perfil: 'COMPRAS', ativo: true, token_version: 1,
    permissions: ['compras.pedidos_compra.visualizar'] }],
  [6, { id: 6, nome: 'Inativo QA', perfil: 'USUARIO', ativo: false, token_version: 0 }]
]);
let ids = [2, 5], configWrites = 0, failAudit = false;
const events = [];
const wrap = user => user && { ...user, get: () => ({ ...user }) };
const models = { Setor: {}, User: {
  increment: async (field, { by, where }) => { users.get(where.id)[field] += by; },
  findByPk: async id => wrap(users.get(Number(id))),
  findOne: async ({ where, attributes }) => {
    assert(attributes.exclude.includes('senha'));
    assert(attributes.exclude.includes('mfa_totp_secret'));
    const user = users.get(Number(where.id));
    return user?.ativo ? wrap(user) : null;
  },
  findAll: async ({ where }) => [...users.values()]
    .filter(u => u.ativo && (!where.id || where.id[Op.in].includes(u.id))).map(wrap)
}, ConfiguracaoSistema: {
  findOne: async () => ({ valor: JSON.stringify({ user_ids: ids }),
    update: async ({ valor }) => { ids = JSON.parse(valor).user_ids; configWrites++; } })
} };
const audit = { registrarEventoSeguranca: async event => {
  if (failAudit) return null;
  events.push(event); return { id: events.length };
} };
const service = load('src/services/devUserSwitchService.js', {
  sequelize: { Op }, '../models': models, '../config/env': { env }
});
const auth = load('src/middlewares/auth.js', {
  jsonwebtoken: jwt, '../config/env': { env }, '../models': models,
  '../services/devUserSwitchService': service, '../services/securityLogService': audit,
  '../services/userActivityService': { marcarAtividadeUsuario: async () => {} },
  '../services/authorizationService': {
    canAccessFinanceiro: async u => u.perfil === 'SUPERADMIN',
    getRhDpCapabilitiesForUser: async () => [],
    getAreaPermissionStateForUser: async u => ({ configured: true,
      bypass: u.perfil === 'SUPERADMIN', permissions: u.permissions || [] })
  }
});
const session = load('src/services/authSessionService.js', {
  crypto, jsonwebtoken: jwt, '../config/env': { env }
});
const controller = load('src/controllers/DevUserSwitchController.js', {
  '../models': models, './AuthController': { buildSessionUser: async u => ({
    id: u.id, perfil: u.perfil, setor_id: u.setor_id, areas_permissoes: u.permissions || []
  }) }, '../services/authSessionService': session,
  '../services/securityLogService': audit, '../services/devUserSwitchService': service,
  '../config/env': { env }
});
const csrf = load('src/middlewares/csrf.js', {
  '../config/env': { env }, '../services/securityLogService': audit
});
const mfa = load('src/middlewares/requireMfaCompletion.js', {});
const authControllerSource = fs.readFileSync(path.join(root, 'src/controllers/AuthController.js'), 'utf8');
const logoutSource = authControllerSource.match(/async logout\(req, res\) \{[\s\S]*?\n  \},/);
assert(logoutSource);
const logout = vm.runInNewContext('({' + logoutSource[0].slice(0, -1) + '}).logout', {
  console, User: models.User, clearAuthCookies: session.clearAuthCookies,
  registrarEventoSeguranca: audit.registrarEventoSeguranca
});
const routes = fs.readFileSync(path.join(root, 'src/routes.js'), 'utf8');
assert(routes.indexOf('router.use(auth)') < routes.indexOf("router.post('/auth/dev-user-switch/assume'"));
assert(routes.indexOf('router.use(csrfProtection)') < routes.indexOf("router.post('/auth/dev-user-switch/assume'"));
assert.match(routes, /dev-user-switch\/assume', requireMfaCompletion, requireCustosRecebiveisCompletion, criticalRateLimit/);
assert.match(routes, /configuracoes\/dev-user-switch', permit\(\['SUPERADMIN'\]\)/);
const app = express();
app.use(express.json(), cookieParser(), auth, csrf);
app.get('/auth/dev-user-switch', mfa, controller.status);
app.post('/auth/dev-user-switch/assume', mfa, controller.assume);
app.post('/auth/dev-user-switch/restore', controller.restore);
app.post('/auth/logout', logout);
app.get('/configuracoes/dev-user-switch', mfa, controller.config);
app.patch('/configuracoes/dev-user-switch', mfa, controller.updateConfig);
app.get('/qa/identity', (req, res) => res.json({ id: req.user.id,
  perfil: req.user.perfil, permissions: req.user.areas_permissoes }));
const sign = (id, extra = {}) => jwt.sign({ id, token_version: users.get(id).token_version,
  mfa_setup_pending: false, ...extra }, env.jwtSecret, { expiresIn: '5m' });
async function main() {
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const url = 'http://127.0.0.1:' + server.address().port;
  const request = async (p, token, body, options = {}) => {
    const headers = { 'content-type': 'application/json', ...options.headers };
    if (token) headers.authorization = 'Bearer ' + token;
    const r = await fetch(url + p, { method: options.method || (body ? 'POST' : 'GET'),
      headers, ...(body && { body: JSON.stringify(body) }) });
    assert.match(r.headers.get('content-type') || '', /json/, 'Resposta nao JSON: ' + p + ' status ' + r.status);
    const data = await r.json(); return { status: r.status, data, headers: r.headers };
  };
  try {
    const actor = sign(1), ordinary = sign(2);
    const challenge = session.buildMfaChallengeToken(users.get(1));
    if (process.argv.includes('--baseline')) {
      const result = await request('/qa/identity', challenge);
      assert.equal(result.status, 200, 'Confirmar defeito anterior antes da correcao');
      console.log('REPRODUZIDO: token provisório de MFA foi aceito como sessao no codigo anterior. Somente QA local.');
      return;
    }
    assert.equal((await request('/qa/identity', challenge)).status, 401);
    assert.equal((await request('/auth/dev-user-switch/assume', challenge, { user_id: 2 })).status, 401);
    assert.equal(session.verifyMfaChallengeToken(challenge).purpose, 'MFA_CHALLENGE', 'Desafio permanece valido apenas no fluxo MFA');
    assert.equal((await request('/auth/dev-user-switch')).status, 401);
    const forged = ordinary.split('.');
    forged[1] = Buffer.from(JSON.stringify({ id: 1, token_version: 3 })).toString('base64url');
    assert.equal((await request('/qa/identity', forged.join('.'))).status, 401);
    for (const id of [2, 3, 4, 5]) {
      const token = sign(id, { perfil: 'SUPERADMIN' });
      assert.equal((await request('/auth/dev-user-switch', token)).data.enabled, false);
      assert.equal((await request('/auth/dev-user-switch/assume', token, { user_id: 2, actor_id: 1 })).status, 403);
      assert.equal((await request('/configuracoes/dev-user-switch', token)).status, 403);
      assert.equal((await request('/configuracoes/dev-user-switch', token, { user_ids: [4] }, { method: 'PATCH' })).status, 403);
      assert.equal((await request('/auth/dev-user-switch/restore', token, {})).status, 409);
    }
    assert.equal(configWrites, 0, 'Negativas nao modificam configuracao');
    assert.equal((await request('/auth/dev-user-switch/assume', sign(1, { mfa_setup_pending: true }), { user_id: 2 })).status, 403);
    for (const user_id of [1, 4, 6, 999, '2abc', -1]) {
      assert.equal((await request('/auth/dev-user-switch/assume', actor, { user_id })).status, 404);
    }
    const originalIds = [...ids];
    assert.equal((await request('/configuracoes/dev-user-switch', actor, { user_ids: [1] }, { method: 'PATCH' })).status, 400);
    assert.deepEqual(ids, originalIds);
    let result = await request('/auth/dev-user-switch/assume', null, { user_id: 2 }, {
      headers: { cookie: 'qa_auth=' + actor + '; qa_csrf=qa-value' }
    });
    assert.equal(result.status, 403, 'Cookie sem CSRF nao permite assumir');
    result = await request('/auth/dev-user-switch/assume', null, { user_id: 2 }, {
      headers: { cookie: 'qa_auth=' + actor + '; qa_csrf=qa-value', 'x-csrf-token': 'qa-value' }
    });
    assert.equal(result.status, 200, 'Cookie com CSRF valido permite fluxo legitimo');
    failAudit = true;
    assert.equal((await request('/auth/dev-user-switch/assume', actor, { user_id: 2 })).status, 503,
      'Producao nao emite sessao assumida se registro de auditoria falhar');
    failAudit = false;
    result = await request('/auth/dev-user-switch/assume', actor, { user_id: 2 });
    assert.equal(result.status, 200);
    const assumed = result.data.token, payload = jwt.verify(assumed, env.jwtSecret);
    assert.equal(payload.id, 2); assert.equal(payload.perfil, 'USUARIO');
    assert.equal(payload.dev_user_switch.actor_id, 1);
    assert.equal(payload.dev_user_switch.actor_token_version, 3);
    assert.equal(result.data.user.id, 2);
    assert.deepEqual(result.data.user.areas_permissoes, users.get(2).permissions);
    assert.equal(result.data.dev_user_switch.production, true);
    assert(result.headers.get('set-cookie').includes('HttpOnly'));
    result = await request('/qa/identity', assumed);
    assert.deepEqual(result.data, { id: 2, perfil: 'USUARIO', permissions: users.get(2).permissions });
    assert.equal((await request('/configuracoes/dev-user-switch', assumed)).status, 403);
    assert.equal((await request('/auth/dev-user-switch/assume', assumed, { user_id: 2 })).status, 409);
    result = await request('/auth/dev-user-switch/assume', assumed, { user_id: 5 });
    assert.equal(result.status, 200); assert.equal(jwt.verify(result.data.token, env.jwtSecret).dev_user_switch.actor_id, 1);
    result = await request('/auth/dev-user-switch/restore', assumed, {});
    assert.equal(result.status, 200); assert.equal(result.data.user.id, 1);
    assert.equal(jwt.verify(result.data.token, env.jwtSecret).dev_user_switch, undefined);
    assert.equal((await request('/auth/logout', assumed, {})).status, 200);
    assert.equal(users.get(2).token_version, 4, 'Logout assumido nao revoga sessoes legitimas do alvo');
    assert.equal(users.get(1).token_version, 3, 'Logout assumido preserva sessao original');
    for (const mutation of [() => { users.get(1).ativo = false; },
      () => { users.get(1).perfil = 'ADMIN'; }, () => { users.get(1).token_version = 9; },
      () => { users.get(2).ativo = false; }, () => { users.get(2).token_version = 9; },
      () => { users.get(2).perfil = 'SUPERADMIN'; }]) {
      mutation(); assert.equal((await request('/qa/identity', assumed)).status, 401);
      Object.assign(users.get(1), { ativo: true, perfil: 'SUPERADMIN', token_version: 3 });
      Object.assign(users.get(2), { ativo: true, token_version: 4, perfil: 'USUARIO' });
    }
    env.productionUserSwitchEnabled = false;
    assert.equal((await request('/qa/identity', assumed)).status, 401);
    assert.equal((await request('/auth/dev-user-switch/assume', actor, { user_id: 2 })).status, 404);
    assert.equal((await request('/auth/dev-user-switch', actor)).data.enabled, false);
    assert.equal((await request('/qa/identity', ordinary)).status, 200, 'Kill switch nao revoga sessoes normais');
    assert.equal((await request('/auth/logout', ordinary, {})).status, 200);
    assert.equal((await request('/qa/identity', ordinary)).status, 401, 'Logout normal continua revogando sessao normal');
    assert(events.some(e => e.tipoEvento === 'DEV_USER_SWITCH_STARTED' && e.usuarioId === 1 && e.recursoId === 2));
    assert(events.some(e => e.tipoEvento === 'DEV_USER_SWITCH_ENDED' && e.usuarioId === 1));
    console.log('OK producao HTTP: SUPERADMIN real, negacoes/forja, MFA, CSRF, whitelist, auditoria, alvo/ACL, retorno, revogacao e kill switch. Sem banco/EC2.');
  } finally { await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
