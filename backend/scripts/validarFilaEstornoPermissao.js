'use strict';

// Autorizacao, middleware e registro das rotas reais. Modelos e auditoria isolados;
// nao carrega database/.env nem conecta banco, EC2 ou rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
function isolated(source, dependencies) {
  const context = { module: { exports: {} }, console, Date,
    require(name) {
      assert(Object.hasOwn(dependencies, name), `Dependencia nao isolada: ${name}`);
      return dependencies[name];
    } };
  vm.runInNewContext(source, context);
  return context.module.exports;
}
const auth = isolated(read('services/authorizationService.js'), {
  '../models': {
    ConfiguracaoSistema: { findOne: async () => null },
    Setor: { findByPk: async () => { throw Error('Consulta de setor inesperada'); } },
    UsuarioObra: {}
  },
  './setorCapabilityService': { userHasSetorCapability: async (user, key) =>
    key === 'eh_setor_financeiro' && user?.setor?.codigo === 'FINANCEIRO' },
  '../constants/rhDpPermissions': require('../src/constants/rhDpPermissions'),
  '../constants/moduloPermissoes': require('../src/constants/moduloPermissoes')
});
const denied = [];
const permit = isolated(read('middlewares/permissions.js'), {
  '../services/authorizationService': auth,
  '../services/securityLogService': { registrarEventoSeguranca: async event => denied.push(event) }
});
const { resolverPermissoesRotaFinanceira } = require('../src/services/financeiroRotaPermissoesService');
const routes = read('routes.js');
const captured = new Map();
const noop = (req, res, next) => next();
const context = {
  permit, canAccessFinanceiro: auth.canAccessFinanceiro,
  userHasAreaPermission: auth.userHasAreaPermission,
  canResolverFilaPagamentos: auth.canResolverFilaPagamentos,
  resolverPermissoesRotaFinanceira,
  router: { post: (url, ...handlers) => captured.set(url, handlers) },
  criticalRateLimit: noop, validateRequest: () => noop, validateNumericIdParam: () => noop,
  validateManualPaymentQueueReverseBody: noop,
  validateManualPaymentQueueResolveBody: noop,
  validateManualPaymentQueueApproveBody: noop,
  PagamentoManualFilaController: {
    estornar: req => { req.executado = true; },
    resolver: req => { req.executado = true; },
    aprovarDivergencias: req => { req.executado = true; }
  }
};
function section(start, end) {
  const begin = routes.indexOf(start), finish = routes.indexOf(end, begin);
  assert(begin >= 0 && finish > begin, `Trecho nao localizado: ${start}`);
  return routes.slice(begin, finish);
}
vm.runInNewContext([
  section('const allowFinanceiro = permit(', 'const allowTituloImportar ='),
  section('function allowPaymentAction(', 'const allowPagamentosRead ='),
  section('const allowFilaPagamentosResolver =', 'const allowFavorecidosRead ='),
  ...routes.split(/\r?\n/).filter(line => /^router\.post\('\/financeiro\/fila-pagamentos\/(?:aprovar-divergencias|:id\/(?:estornar|resolver))'/.test(line))
].join('\n'), context);
const reverse = '/financeiro/fila-pagamentos/:id/estornar';
const resolve = '/financeiro/fila-pagamentos/:id/resolver';
const approve = '/financeiro/fila-pagamentos/aprovar-divergencias';
assert.equal(captured.size, 3);
async function call(url, user) {
  const req = { user, method: 'POST', route: { path: url }, originalUrl: url, params: { id: '1' } };
  let status = 200;
  const res = { status(code) { status = code; return this; }, json() { return this; } };
  const handlers = captured.get(url);
  async function run(index) {
    if (index < handlers.length) await handlers[index](req, res, () => run(index + 1));
  }
  await run(0);
  assert.equal(Boolean(req.executado), status === 200, 'Bloqueio deve impedir o controller');
  return status;
}
const user = keys => ({ id: 17, perfil: 'USUARIO', setor: { id: 4, codigo: 'FINANCEIRO' },
  areas_permissoes_configuradas: true, areas_permissoes: keys });
(async () => {
  const onlyReverse = user(['financeiro.titulos.estornar']);
  assert.equal(await call(reverse, onlyReverse), 200);
  assert.equal(await call(resolve, onlyReverse), 403);
  assert.equal(await call(approve, onlyReverse), 403);
  const onlyResolve = user(['financeiro.fila_pagamentos.resolver']);
  assert.equal(await call(reverse, onlyResolve), 403);
  assert.equal(await call(resolve, onlyResolve), 200);
  assert.equal(await call(approve, onlyResolve), 200);
  assert.equal(await call(reverse, user(['financeiro.fila_pagamentos.visualizar'])), 403);
  assert.equal(await call(reverse, user(['financeiro.fila_pagamentos.baixar'])), 403);
  assert.equal(await call(reverse, user([])), 403);
  assert.equal(await call(reverse, null), 401);
  for (const perfil of ['SUPERADMIN', 'ADMINISTRADOR']) {
    assert.equal(await call(reverse, { ...user([]), perfil }), 200);
  }
  assert.equal(await call(reverse, { id: 17, perfil: 'FINANCEIRO', setor: { codigo: 'FINANCEIRO' } }), 200,
    'Compatibilidade financeira legada preservada');
  assert(denied.length >= 6, 'Negativas continuam auditadas');
  console.log('OK: estorno exige apenas estornar movimento; resolver/aprovar separados, 401/403, bypass e legado preservados. Sem banco/rede.');
})().catch(error => { console.error(error); process.exitCode = 1; });
