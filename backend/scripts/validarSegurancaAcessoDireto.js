'use strict';
// Runtime real de auth/Express e funcoes reais em VM, com modelos em memoria.
// Nao importa app, env ou models; nenhuma conexao a banco/S3/EC2.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const express = require('express');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { solicitacaoIndisponivel } = require('../src/services/solicitacaoDisponibilidade');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const controller = read('src/controllers/SolicitacaoController.js');
const routes = read('src/routes.js');
const retorno = read('src/services/solicitacaoRetornoService.js');
function declaration(source, name) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert(start >= 0, name);
  const tail = source.slice(start);
  const next = /\n(?:async )?function |\nconst |\nclass |\nmodule\.exports/.exec(tail);
  assert(next, name);
  return tail.slice(0, next.index);
}
function load(file, stubs) {
  const module = { exports: {} };
  vm.runInNewContext(read(file), { module, exports: module.exports, console,
    require(name) {
      if (Object.hasOwn(stubs, name)) return stubs[name];
      throw Error(`Import nao isolado: ${file} -> ${name}`);
    } });
  return module.exports;
}
function response() {
  return { code: 200, status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; } };
}
async function visibilityParity() {
  let flags = {};
  const sandbox = {
    Op, Notificacao: {}, NotificacaoDestinatario: { findOne: async () => flags.mencao ? {} : null },
    Historico: { findOne: async () => flags.historico ? {} : null, findAll: async () => [] },
    obterAreaUsuario: async req => req.user.area,
    expandirTokensComAliasesGeo: tokens => tokens,
    obterTokensSetorPrincipalUsuario: async req => [req.user.area],
    isAdministrativoToken: area => area === 'ADMINISTRATIVO',
    isSetorObraGeral: async req => req.user.area === 'OBRA',
    obterSetoresExtrasVisiveisUsuario: async () => [],
    userHasConfiguredAreaPermissions: async () => flags.configurada,
    PERMISSAO_SOLICITACOES_VISUALIZAR_MINHAS: 'minhas',
    PERMISSAO_SOLICITACOES_VISUALIZAR_SETOR: 'setor',
    PERMISSAO_SOLICITACOES_VISUALIZAR_TODAS: 'todas',
    userHasAreaPermission: async (user, keys) => Boolean(flags[keys[0]]),
    podeVisualizarSolicitacaoPelaFila: async () => flags.fila,
    validarAcessoObra: async req => req.user.perfil === 'SUPERADMIN' || flags.obra,
    setorPertenceAoUsuario: (tokens, area) => tokens.includes(area),
    solicitacaoPertenceASetoresVisiveis: async () => flags.extra,
    isUsuarioSetorGeo: async req => req.user.area === 'GEO',
    obterModoRecebimentoPorSetorETipo: async () => 'ADMIN_PRIMEIRO',
    isGeoToken: area => area === 'GEO', ACOES_ENCAMINHAMENTO_SETOR: [],
    solicitacaoAtendeEscopoOperacionalUsuario: async () => flags.escopo
  };
  const currentSource = declaration(controller, 'verificarAcessoDetalheSolicitacao');
  const prefix = /  if \(!solicitacao \|\| solicitacao.cancelada === true \|\| solicitacao.cancelada === 1\) \{\r?\n    return \{ allowed: false, status: 404, error: 'Solicitacao nao encontrada' \};\r?\n  \}\r?\n/;
  assert(prefix.test(currentSource), 'Guarda de exclusao deve vir antes dos bypasses');
  const current = vm.runInNewContext(`(${currentSource})`, sandbox);
  const previous = vm.runInNewContext(`(${currentSource.replace(prefix, '')})`, sandbox);
  let comparisons = 0;
  for (const perfil of ['SUPERADMIN', 'ADMIN', 'USUARIO']) {
    for (const area of ['OBRA', 'GEO', 'COMPRAS', 'ADMINISTRATIVO', 'FINANCEIRO', 'DP']) {
      for (let mask = 0; mask < 64; mask++) {
        flags = { configurada: Boolean(mask & 1), obra: Boolean(mask & 2),
          minhas: Boolean(mask & 4), setor: Boolean(mask & 8), todas: Boolean(mask & 16),
          mencao: Boolean(mask & 32), historico: Boolean(mask & 4), extra: Boolean(mask & 8),
          fila: Boolean(mask & 16), escopo: Boolean(mask & 2) };
        const req = { user: { id: 5, perfil, area } };
        const row = { id: 70, criado_por: mask & 4 ? 5 : 9, area_responsavel: 'COMPRAS', cancelada: false };
        for (const permitirLeituraGlobal of [false, true]) {
          assert.equal(JSON.stringify(await current(req, row, { permitirLeituraGlobal })),
            JSON.stringify(await previous(req, row, { permitirLeituraGlobal })));
          comparisons++;
          assert.equal((await current(req, { ...row, cancelada: true }, { permitirLeituraGlobal })).status, 404);
        }
      }
    }
  }
  const context = vm.runInNewContext(`(${declaration(controller, 'avaliarContextoInteracaoSolicitacao')})`, sandbox);
  assert.equal((await context({ user: { perfil: 'SUPERADMIN' } }, { cancelada: true }, { allowed: true })).status, 404);
  console.log(`OK ${comparisons} comparacoes de visibilidade ativa; exclusao prevalece sobre todas as excecoes.`);
}
async function sharedAssertions() {
  let row, acl = { allowed: true, estaNoSetorUsuario: true };
  const sandbox = { solicitacaoIndisponivel,
    erro: (message, statusCode) => Object.assign(new Error(message), { statusCode }),
    Solicitacao: { findByPk: async (id, options) => {
      assert(options.attributes.includes('cancelada')); return row;
    } },
    avaliarInteracao: async () => acl,
    require: name => {
      assert.equal(name, '../controllers/SolicitacaoController');
      return { _verificarAcessoDetalheSolicitacao: async () => acl };
    }
  };
  for (const name of ['assertPodeInteragirSolicitacao', 'assertPodeVisualizarSolicitacao']) {
    const fn = vm.runInNewContext(`(${declaration(retorno, name)})`, sandbox);
    for (row of [null, { id: 70, cancelada: true }, { id: 70, cancelada: 1 }]) {
      await assert.rejects(() => fn({ user: { perfil: 'SUPERADMIN' } }, 70), err => err.statusCode === 404);
      if (row) await assert.rejects(() => fn({}, row), err => err.statusCode === 404);
      await assert.rejects(() => fn({}, { id: 70 }), err => err.statusCode === 404,
        'Objeto parcial deve reler a flag no banco simulado');
    }
    row = { id: 70, cancelada: false };
    acl = { allowed: true, estaNoSetorUsuario: true };
    assert.equal((await fn({}, 70)).solicitacao.id, 70);
    acl = { allowed: false, status: 403, error: 'Negado' };
    await assert.rejects(() => fn({}, 70), err => err.statusCode === 403);
  }
  const files = read('src/services/fileAccessService.js');
  let fila = false;
  const fileAccess = vm.runInNewContext(`(${declaration(files, 'canAccessSolicitacaoFile')})`, {
    Solicitacao: { findByPk: async (id, options) => {
      assert(options.attributes.includes('cancelada')); return { id: 70, cancelada: true };
    } }, podeVisualizarSolicitacaoPelaFila: async () => fila,
    isBusinessAdmin: () => { throw Error('Bypass nao deve preceder exclusao'); }
  });
  assert.equal((await fileAccess({ user: { perfil: 'SUPERADMIN' } }, 70)).status, 404);
  fila = true;
  assert.equal((await fileAccess({ user: {} }, 70)).consultaFinanceira, true);
  const anexos = read('src/controllers/AnexoController.js');
  const mutationAccess = vm.runInNewContext(`(${declaration(anexos, 'validarAcessoSolicitacao')})`, {
    canAccessSolicitacaoFile: async () => { throw Error('Consulta financeira nao libera upload/remocao'); }
  });
  assert.equal((await mutationAccess({}, { id: 70, cancelada: true })).status, 404);
  console.log('OK services por ID/objeto, ACL negativas, anexos e consulta financeira somente leitura.');
}
async function userResourceGuards() {
  const source = read('src/controllers/UsuarioController.js');
  const safe = source.match(/const SAFE_USER_MANAGEMENT_ATTRIBUTES = (\[[\s\S]*?\]);/);
  assert(safe);
  const attributes = vm.runInNewContext(safe[1]);
  for (const name of ['senha', 'token_version', 'mfa_totp_secret', 'mfa_totp_temp_secret']) {
    assert(!attributes.includes(name), `Dado de seguranca nao pode ser retornado: ${name}`);
  }
  const sandbox = { isPerfilSuperadmin: value => String(value).trim().toUpperCase() === 'SUPERADMIN' };
  const protectTarget = vm.runInNewContext(`(${declaration(source, 'podeGerenciarUsuarioAlvo')})`, sandbox);
  const protectRole = vm.runInNewContext(`(${declaration(source, 'podeDefinirPerfilSuperadmin')})`, sandbox);
  for (const perfil of ['USUARIO', 'ADMIN', 'SUPERADMIN']) {
    const req = { user: { id: 5, perfil } };
    assert.equal(protectTarget(req, { id: 9, perfil: 'SUPERADMIN' }), perfil === 'SUPERADMIN');
    assert.equal(protectRole(req, 'SUPERADMIN'), perfil === 'SUPERADMIN');
  }
  let queries = 0;
  const canManageUsers = vm.runInNewContext(`(${declaration(read('src/services/authorizationService.js'), 'canManageUsers')})`, {
    isBusinessAdmin: user => user.perfil === 'SUPERADMIN',
    userHasConfiguredAreaPermissions: async () => true,
    userHasAreaPermission: async user => Boolean(user.gerenciaAutorizada),
    CONFIGURACOES_AREA_PERMISSION_KEYS: { usuarios: ['configuracoes.usuarios.visualizar'] }
  });
  const permit = load('src/middlewares/permissions.js', {
    '../services/authorizationService': { hasAnyProfile: (user, profiles) => profiles.includes(user.perfil) },
    '../services/securityLogService': { registrarEventoSeguranca: async () => {} }
  });
  const guardSource = routes.match(/const allowGestaoUsuarios = (permit\(\{[\s\S]*?\}\));/);
  assert(guardSource);
  const routeGuard = vm.runInNewContext(guardSource[1], { permit, canManageUsers });
  const match = source.match(/async show\(req, res\) \{[\s\S]*?\n  \},/);
  assert(match);
  const show = vm.runInNewContext(`({${match[0].slice(0, -1)}}).show`, {
    console, SAFE_USER_MANAGEMENT_ATTRIBUTES: attributes, Cargo: {}, Setor: {}, UsuarioObra: {}, Obra: {},
    podeGerenciarUsuarioAlvo: protectTarget,
    User: { findByPk: async (id, options) => { queries++;
      assert.equal(options.attributes, attributes); return { id: Number(id), perfil: 'SUPERADMIN' };
    } }
  });
  for (const [perfil, gerenciaAutorizada, expected] of [
    ['USUARIO', false, 403], ['ADMIN', false, 403], ['ADMIN', true, 404], ['SUPERADMIN', false, 200]
  ]) {
    const req = { params: { id: '9' }, user: { id: 5, perfil, gerenciaAutorizada } };
    const originalIdentity = JSON.stringify(req.user); const res = response(); const before = queries;
    await routeGuard(req, res, () => show(req, res));
    assert.equal(res.code, expected); assert.equal(JSON.stringify(req.user), originalIdentity);
    if (expected === 403) assert.equal(queries, before);
    assert(!res.body?.token, 'Consulta de usuario nao emite sessao');
  }
  assert(routes.includes("router.get('/usuarios/:id', allowGestaoUsuarios"));
  assert(routes.includes("router.put('/usuarios/:id', allowGestaoUsuarios"));
  console.log('OK gestao de usuarios real: ACL, alvo SUPERADMIN, atribuicao de perfil e identidade imutavel.');
}
async function resourceScopeGuards() {
  const model = { findByPk: async id => Number(id) === 999 ? null : {
    id: Number(id), obra_id: Number(id) === 1 ? 7 : 8, solicitante_id: 50, solicitacao_id: 70
  } };
  const access = load('src/middlewares/resourceAccess.js', {
    '../models': { Contrato: model, PedidoCompra: model, SolicitacaoCompra: model },
    '../services/authorizationService': {
      buildUserScopeTokens: async user => [user.perfil],
      canAccessContratosGlobal: async () => false,
      getComprasVisibilityScope: async user => user.semEscopo ? 'NENHUM' : 'SETOR',
      getUserObraScopeIds: async user => user.perfil === 'SUPERADMIN' ? null : [7],
      isBusinessAdmin: user => user.perfil === 'SUPERADMIN',
      userCanCreateInAllObras: async () => false,
      userHasAreaPermission: async user => Boolean(user.leituraGlobal)
    }, '../services/setorCapabilityService': { userHasSetorCapability: async () => false },
    '../services/securityLogService': { registrarEventoSeguranca: async () => {} }
  });
  let cases = 0;
  for (const name of ['requireCompraAccess', 'requireContratoAccess', 'requirePedidoCompraAccess']) {
    for (const method of ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE']) {
      for (const [id, perfil, expected] of [[1, 'USUARIO', 200], [2, 'USUARIO', 403],
        [999, 'USUARIO', 404], [2, 'SUPERADMIN', 200]]) {
        const req = { method, params: { id }, query: { obra_id: 7, user_id: 9 },
          body: { obra_id: 7, perfil: 'SUPERADMIN' }, user: { id: 5, perfil } };
        const res = response(); let next = false;
        await access[name](req, res, () => { next = true; });
        assert.equal(next, expected === 200, `${name} ${method} ${id}`);
        assert.equal(res.code, expected); assert.equal(req.user.id, 5);
        cases++;
      }
    }
  }
  for (const method of ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE']) {
    const req = { method, params: { id: 2 }, user: { id: 5, perfil: 'USUARIO', leituraGlobal: true } };
    const res = response();
    await access.requireContratoAccess(req, res, () => {});
    assert.equal(res.code, ['GET', 'HEAD'].includes(method) ? 200 : 403);
  }
  const res = response();
  await access.requirePedidoCompraAccess({ method: 'GET', params: { id: 1 },
    user: { id: 5, perfil: 'USUARIO', semEscopo: true } }, res, () => { throw Error('Nao deve liberar'); });
  assert.equal(res.code, 403);
  console.log(`OK ${cases + 6} casos de escopo por ID em Compras/Contratos/Pedidos; leitura ampla nao autoriza escrita.`);
}
async function identityAndHttp() {
  const secret = 'segredo-ficticio-exclusivo-de-testes-sem-uso-em-ambientes';
  let runtimeDev = false, reads = 0, writes = 0, failRead = false;
  const users = new Map([[5, { id: 5, perfil: 'USUARIO', ativo: true, token_version: 2,
    setor: { codigo: 'OBRA' } }], [9, { id: 9, perfil: 'SUPERADMIN', ativo: true, token_version: 3 }]]);
  const userModel = { findByPk: async id => {
    const data = users.get(Number(id)); return data && { ...data, get: () => ({ ...data }) };
  } };
  const auth = load('src/middlewares/auth.js', {
    jsonwebtoken: jwt, '../config/env': { env: { jwtSecret: secret, authCookieName: 'qa' } },
    '../models': { User: userModel, Setor: {} },
    '../services/authorizationService': { canAccessFinanceiro: async () => false,
      getRhDpCapabilitiesForUser: async () => [],
      getAreaPermissionStateForUser: async () => ({ permissions: [], configured: true }) },
    '../services/securityLogService': { registrarEventoSeguranca: async () => {} },
    '../services/userActivityService': { marcarAtividadeUsuario: async () => {} },
    '../services/devUserSwitchService': { isDevUserSwitchRuntimeEnabled: () => runtimeDev,
      isSuperadmin: user => user.perfil === 'SUPERADMIN' }
  });
  const sign = payload => jwt.sign(payload, secret, { expiresIn: '5m' });
  const authenticate = async token => {
    const req = { method: 'GET', headers: token ? { authorization: `Bearer ${token}` } : {},
      params: { id: '9' }, query: { user_id: '9', perfil: 'SUPERADMIN' },
      body: { user_id: 9, perfil: 'SUPERADMIN' } };
    const res = response(); let passed = false;
    await auth(req, res, () => { passed = true; }); return { req, res, passed };
  };
  const ordinary = sign({ id: 5, token_version: 2, perfil: 'SUPERADMIN' });
  let result = await authenticate(ordinary);
  assert(result.passed); assert.equal(result.req.user.id, 5); assert.equal(result.req.user.perfil, 'USUARIO');
  const parts = ordinary.split('.');
  parts[1] = Buffer.from(JSON.stringify({ id: 9, token_version: 3 })).toString('base64url');
  for (const token of [null, parts.join('.'), sign({ id: 99 }), sign({ id: 5, token_version: 1 })]) {
    result = await authenticate(token); assert.equal(result.passed, false); assert.equal(result.res.code, 401);
  }
  users.get(5).ativo = false;
  assert.equal((await authenticate(ordinary)).res.code, 401); users.get(5).ativo = true;
  const switchPayload = { id: 5, token_version: 2, dev_user_switch: { actor_id: 9, actor_token_version: 3, target_id: 5 } };
  assert.equal((await authenticate(sign(switchPayload))).res.code, 401);
  runtimeDev = true;
  result = await authenticate(sign(switchPayload)); assert(result.passed); assert.equal(result.req.user.perfil, 'USUARIO');
  for (const meta of [{ ...switchPayload.dev_user_switch, actor_id: 5 },
    { ...switchPayload.dev_user_switch, target_id: 9 }, { ...switchPayload.dev_user_switch, actor_token_version: 2 }]) {
    assert.equal((await authenticate(sign({ ...switchPayload, dev_user_switch: meta }))).res.code, 401);
  }
  const rows = new Map([[70, { id: 70, codigo: 'SOL-QA70', obra_id: 7, cancelada: false }],
    [71, { id: 71, codigo: 'SOL-QA71', obra_id: 7, cancelada: true }]]);
  const audit = [], titles = [{ id: 1, saldo: 100 }, { id: 2, saldo: 0 }];
  const titlesBefore = JSON.stringify(titles);
  for (const row of rows.values()) row.update = async (values, { transaction }) => {
    transaction.pending = () => Object.assign(row, values);
  };
  const deletion = controller.match(/async excluir\(req, res\) \{[\s\S]*?\n  \},/);
  assert(deletion);
  const deleteHandler = vm.runInNewContext(`({${deletion[0].slice(0, -1)}}).excluir`, {
    console, isSetorGeo: async () => false, validarAcessoObra: async () => true,
    Solicitacao: { findByPk: async id => rows.get(Number(id)), sequelize: {
      transaction: async () => ({ LOCK: { UPDATE: 'UPDATE' }, rollback: async () => {},
        async commit() { this.pending?.(); if (this.audit) audit.push(this.audit); } })
    } }, TituloFinanceiro: { count: async () => titles.length },
    LogExclusao: { create: async (data, { transaction }) => { transaction.audit = data; } },
    publishSolicitacaoRealtimeEvent: async () => {}
  });
  const guard = load('src/middlewares/solicitacaoDisponivel.js', {
    '../models': { Solicitacao: { findByPk: async (id, options) => {
      reads++; assert.deepEqual(Array.from(options.attributes), ['id', 'cancelada']);
      if (failRead) throw Error('Falha simulada'); return rows.get(Number(id));
    } } }, '../services/solicitacaoDisponibilidade': { solicitacaoIndisponivel }
  });
  const mounts = routes.match(/router\.use\((\[[\s\S]*?\]), require\('\.\/middlewares\/solicitacaoDisponivel'\)\);/);
  assert(mounts); assert(routes.indexOf(mounts[0]) > routes.indexOf('router.use(auth)'));
  const app = express(), router = express.Router();
  router.use(auth); router.use(vm.runInNewContext(mounts[1]), guard);
  // Todas as rotas reais que usam o ID da principal; handlers sentinela:
  // se o bloqueio falhar, uma escrita seria contada antes de devolver 200.
  const paths = [...routes.matchAll(/router\.(get|post|patch|delete|put)\(\s*['"]([^'"]+)['"]/g)]
    .filter(([, , p]) => /^\/solicitacoes\/:id(?:\/|$)/.test(p)
      || /^\/(?:adiantamentos|recargas-cartao)\/solicitacoes\/:id/.test(p)
      || /^\/compras\/solicitacoes(?:-diretas)?\/por-solicitacao\/:solicitacaoId/.test(p));
  for (const [, method, route] of paths) router[method](route, (req, res) => {
    if (method === 'delete' && route === '/solicitacoes/:id') return deleteHandler(req, res);
    if (req.user.perfil !== 'SUPERADMIN') return res.status(403).json({ error: 'ACL original sentinela' });
    if (method !== 'get') writes++;
    return res.json({ ok: true });
  });
  router.get('/solicitacoes/filtros/obras', (req, res) => res.json({ ok: true }));
  router.get('/rh/solicitacoes/:id', (req, res) => res.json({ ok: true }));
  app.use('/api', router);
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const superToken = sign({ id: 9, token_version: 3 });
  const request = (p, method = 'GET', token = superToken) => fetch(url + '/api' + p,
    { method, headers: { authorization: `Bearer ${token}` } });
  try {
    for (const [, method, route] of paths) {
      const p = route.replace(/:(?:solicitacaoId|id)(?=\/|$)/, '71').replace(/:[A-Za-z]+/g, '1');
      const repeatDelete = method === 'delete' && route === '/solicitacoes/:id';
      assert.equal((await request(p, method.toUpperCase())).status, repeatDelete ? 204 : 404, p);
    }
    assert.equal(writes, 0, 'Nenhuma escrita operacional chega ao handler');
    assert.equal((await request('/solicitacoes/70')).status, 200);
    assert.equal((await request('/solicitacoes/70/status', 'PATCH', ordinary)).status, 403);
    assert.equal((await request('/solicitacoes/999')).status, 404);
    assert.equal((await request('/solicitacoes/%37%31')).status, 404, 'ID codificado nao contorna bloqueio');
    for (const id of ['71abc', '71.0', '7.1e1', '0', '-71', '999999999999999999']) {
      assert.equal((await request(`/solicitacoes/${id}/anexos`)).status, 400);
    }
    const before = reads;
    assert.equal((await request('/solicitacoes/filtros/obras')).status, 200);
    assert.equal((await request('/rh/solicitacoes/71')).status, 200);
    assert.equal(reads, before, 'Sem consultas para filtros e IDs de outros dominios');
    failRead = true; assert.equal((await request('/solicitacoes/70')).status, 500);
    failRead = false;
    assert.equal((await request('/solicitacoes/70', 'DELETE')).status, 204);
    assert.equal((await request('/solicitacoes/70')).status, 404, 'DELETE real -> GET nao pode reabrir');
    assert.equal((await request('/solicitacoes/70/comentarios', 'POST')).status, 404);
    assert.equal((await request('/solicitacoes/70', 'DELETE')).status, 204);
    assert.equal(audit.length, 1, 'Auditoria de exclusao unica');
    assert.equal(JSON.stringify(titles), titlesBefore, 'Titulos e saldos preservados');
    assert.equal(writes, 0);
  } finally { await new Promise(resolve => server.close(resolve)); }
  console.log(`OK auth real/token assinado, adulteracao, revogacao, DEV switch e ${paths.length} rotas operacionais HTTP. Sem banco/rede externa.`);
}
(async () => { await visibilityParity(); await sharedAssertions(); await userResourceGuards(); await resourceScopeGuards(); await identityAndHttp(); })()
  .catch(error => { console.error(error); process.exitCode = 1; });
