'use strict';

// Executa os services/middlewares reais com models em memoria. Nao carrega .env ou banco.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const rhPermissions = require('../src/constants/rhDpPermissions');
const moduloPermissions = require('../src/constants/moduloPermissoes');

function load(relative, imports) {
  const filename = path.join(__dirname, relative);
  const sandbox = { module: { exports: {} }, console, require(name) {
    if (!Object.hasOwn(imports, name)) throw new Error(`Import nao simulado: ${name}`);
    return imports[name];
  } };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename });
  return sandbox.module.exports;
}

function fixture() {
  const state = { config: { setores: ['COMERCIAL'] }, obras: [], denied: [], writes: 0, failConfig: false };
  const setor = { id: 12, codigo: 'COMERCIAL', nome: 'Comercial' };
  const user = { id: 80, perfil: 'USUARIO', setor_id: 12, areas_permissoes_configuradas: true,
    areas_permissoes: ['compras.solicitacoes.criar'] };
  const compra = { id: 8, obra_id: 22, solicitante_id: 90 };
  const capabilities = { userHasSetorCapability: async (u, capability) => u?.capabilities?.includes(capability) || false };
  const models = {
    ConfiguracaoSistema: { findOne: async ({ where }) => {
      if (where.chave === 'SETORES_CRIACAO_TODAS_OBRAS') {
        if (state.failConfig) throw new Error('Falha simulada ao consultar configuracao');
        return state.config == null ? null : { valor: typeof state.config === 'string' ? state.config : JSON.stringify(state.config) };
      }
      return null;
    } },
    Setor: { findByPk: async () => setor },
    UsuarioObra: { findAll: async () => state.obras.map(obra_id => ({ obra_id })), create: async () => { state.writes++; } },
    SolicitacaoCompra: { findByPk: async () => compra },
    PedidoCompra: { findByPk: async () => ({ id: 9, obra_id: 22 }) },
    Contrato: { findByPk: async () => ({ id: 10, obra_id: 22 }) }
  };
  const auth = load('../src/services/authorizationService.js', {
    '../models': models, './setorCapabilityService': capabilities,
    '../constants/rhDpPermissions': rhPermissions, '../constants/moduloPermissoes': moduloPermissions
  });
  const access = load('../src/middlewares/resourceAccess.js', {
    '../models': models, '../services/authorizationService': auth,
    '../services/setorCapabilityService': capabilities,
    '../services/securityLogService': { registrarEventoSeguranca: async event => { state.denied.push(event); } }
  });
  return { state, user, compra, auth, access };
}
async function invoke(middleware, user, extra = {}) {
  const req = { user, body: { obra_id: 22 }, query: {}, params: { id: 8 }, method: 'POST', ...extra };
  const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  let next = 0;
  await middleware(req, res, () => { next++; });
  return { req, res, next };
}
let count = 0;
async function test(name, run) { await run(); count++; console.log(`OK ${name}`); }

async function main() {
  await test('Comercial marcado cria sem vinculo e sem gravar UsuarioObra', async () => {
    const f = fixture();
    assert.equal(await f.auth.canCreateCompraSolicitacao(f.user), true);
    assert.equal((await invoke(f.access.requireCompraBodyObraAccess, f.user)).next, 1);
    assert.equal(f.state.writes, 0); assert.equal(f.state.denied.length, 0);
    assert.equal(await f.auth.userHasAllObrasAccess(f.user), false);
  });
  await test('vinculo com outra obra nao anula a autorizacao exclusiva de criacao', async () => {
    const f = fixture(); f.state.obras = [11];
    assert.equal((await invoke(f.access.requireCompraBodyObraAccess, f.user)).next, 1);
    assert.deepEqual(Array.from(await f.auth.getUserObraScopeIds(f.user)), [11]);
  });
  await test('ausente, invalida, vazia ou de outro setor mantem bloqueio', async () => {
    for (const config of [null, '{invalido', { setores: [] }, { setores: 'COMERCIAL' }, { setores: ['OBRA'] }]) {
      const f = fixture(); f.state.config = config;
      const result = await invoke(f.access.requireCompraBodyObraAccess, f.user);
      assert.equal(result.next, 0); assert.equal(result.res.code, 403);
      assert.equal(f.state.denied[0].tipoEvento, 'AUTHZ_DENIED');
    }
  });
  await test('desmarcar Comercial revoga a excecao na proxima chamada', async () => {
    const f = fixture();
    assert.equal((await invoke(f.access.requireCompraBodyObraAccess, f.user)).next, 1);
    f.state.config = { setores: [] };
    assert.equal((await invoke(f.access.requireCompraBodyObraAccess, f.user)).res.code, 403);
  });
  await test('configuracao indisponivel nao permite prosseguir', async () => {
    const f = fixture(); f.state.failConfig = true;
    await assert.rejects(() => invoke(f.access.requireCompraBodyObraAccess, f.user), /Falha simulada/);
  });
  await test('perfil e payload nao podem forjar setor autorizado', async () => {
    const f = fixture(); f.state.config = { setores: ['ADMIN'] };
    assert.equal(await f.auth.userCanCreateInAllObras({ ...f.user, perfil: 'ADMIN' }), false);
    f.state.config = { setores: ['GEO'] };
    assert.equal((await invoke(f.access.requireCompraBodyObraAccess, f.user, { body: { obra_id: 22, area: 'GEO', setor_id: 1 } })).res.code, 403);
    assert.equal(await f.auth.userCanCreateInAllObras(null), false);
  });
  await test('setor normalizado e SUPERADMIN preservados; obra invalida permanece 400', async () => {
    const f = fixture(); f.state.config = { setores: [' comercial '] };
    assert.equal(await f.auth.userCanCreateInAllObras(f.user), true);
    f.state.config = null;
    assert.equal((await invoke(f.access.requireCompraBodyObraAccess, { ...f.user, perfil: 'SUPERADMIN' })).next, 1);
    assert.equal((await invoke(f.access.requireCompraBodyObraAccess, f.user, { body: { obra_id: -1 } })).res.code, 400);
  });
  await test('vinculo normal continua valido quando setor nao esta marcado', async () => {
    const f = fixture(); f.state.config = null; f.state.obras = [22];
    assert.equal((await invoke(f.access.requireCompraBodyObraAccess, f.user)).next, 1);
    f.state.obras = [11];
    assert.equal((await invoke(f.access.requireCompraBodyObraAccess, f.user)).res.code, 403);
  });
  await test('escopo de listagem nao e ampliado pela permissao de criar', async () => {
    const f = fixture();
    let result = await invoke(f.access.scopeCompraListAccess, f.user, { method: 'GET' });
    assert.deepEqual(Array.from(result.req.compraScopeObraIds), []);
    f.state.obras = [11];
    result = await invoke(f.access.scopeCompraListAccess, f.user, { method: 'GET' });
    assert.deepEqual(Array.from(result.req.compraScopeObraIds), [11]);
    assert.equal((await invoke(f.access.scopeCompraListAccess, f.user, { method: 'GET', query: { obra_id: 22 } })).res.code, 403);
  });
  await test('compras de terceiros seguem protegidas para consulta e alteracao', async () => {
    const f = fixture();
    for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
      assert.equal((await invoke(f.access.requireCompraAccess, f.user, { method })).res.code, 403);
    }
    f.compra.solicitante_id = f.user.id;
    assert.equal((await invoke(f.access.requireCompraAccess, f.user, { method: 'GET' })).next, 1);
  });
  await test('excecao nao autoriza contratos ou pedidos existentes', async () => {
    const f = fixture();
    for (const middleware of [f.access.requireContratoBodyObraAccess, f.access.requireContratoOptionalBodyObraAccess, f.access.requirePedidoCompraAccess]) {
      assert.equal((await invoke(middleware, f.user)).res.code, 403);
    }
  });
  await test('modelo XLSX usa obra da query e escopo de criacao', async () => {
    const f = fixture();
    assert.equal((await invoke(f.access.requireCompraQueryObraCreationAccess, f.user, { method: 'GET', query: { obra_id: 22 } })).next, 1);
    assert.equal((await invoke(f.access.requireCompraQueryObraCreationAccess, f.user, { method: 'GET' })).res.code, 400);
    f.state.config = null;
    assert.equal((await invoke(f.access.requireCompraQueryObraCreationAccess, f.user, { method: 'GET', query: { obra_id: 22 } })).res.code, 403);
  });
  await test('autorizacao de obra nao substitui permissao funcional de criar', async () => {
    const f = fixture(); f.user.areas_permissoes = [];
    assert.equal(await f.auth.userCanCreateInAllObras(f.user), true);
    assert.equal(await f.auth.canCreateCompraSolicitacao(f.user), false);
  });
  await test('rotas de criacao, importacao e modelo mantem guarda funcional antes da obra', async () => {
    const routes = fs.readFileSync(path.join(__dirname, '../src/routes.js'), 'utf8');
    for (const endpoint of ['/compras/solicitacoes', '/compras/solicitacoes-diretas']) {
      const route = routes.split(/\r?\n/).find(line => line.startsWith(`router.post('${endpoint}',`));
      assert.ok(route.indexOf('allowCompraSolicitacoesCreate') < route.indexOf('requireCompraBodyObraAccess'));
      assert.ok(route.includes('validateRequest({ body:'));
    }
    const modelRoute = routes.split(/\r?\n/).find(line => line.startsWith("router.get('/compras/solicitacoes/modelo-itens-xlsx',"));
    assert.ok(modelRoute.includes('allowCompraSolicitacoesCreate, requireCompraQueryObraCreationAccess'));
    assert.match(routes, /'\/compras\/solicitacoes\/importar-itens-xlsx',[\s\S]*?allowCompraSolicitacoesCreate,[\s\S]*?requireCompraBodyObraAccess,[\s\S]*?SolicitacaoCompraController\.importarSolicitacaoCompraXlsx/);
  });
  console.log(`Compras/criacao em todas as obras: ${count} cenarios aprovados; sem banco ou rede.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
