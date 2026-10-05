'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PERMISSOES_ROTAS_FINANCEIRAS, resolverPermissoesRotaFinanceira } = require('../src/services/financeiroRotaPermissoesService');
const { MODULO_PERMISSION_GROUPS } = require('../src/constants/moduloPermissoes');
const { operacaoSujeitaAoControle } = require('../src/middlewares/controleDiarioFinanceiro');
const { dataOperacionalHoje } = require('../src/services/caixaDiarioConfigService');

const routes = fs.readFileSync(path.join(__dirname, '../src/routes.js'), 'utf8');
const bankingRoutes = fs.readFileSync(path.join(__dirname, '../src/modules/banking/routes/index.js'), 'utf8');
const routePattern = /router\.(get|post|patch|put|delete)\('([^']+)',\s*allowFinanceiro[,)]/g;
const bankingPattern = /router\.(get|post|patch|put|delete)\('([^']+)'/g;
const mapped = new Set();

for (const [, method, route] of routes.matchAll(routePattern)) {
  const key = `${method.toUpperCase()} ${route}`;
  assert.ok(PERMISSOES_ROTAS_FINANCEIRAS[key]?.length, `Rota financeira sem permissão granular: ${key}`);
  mapped.add(key);
}
for (const [, method, route] of bankingRoutes.matchAll(bankingPattern)) {
  const key = `${method.toUpperCase()} /financeiro/bancos${route}`;
  assert.ok(PERMISSOES_ROTAS_FINANCEIRAS[key]?.length, `Rota bancária sem permissão granular: ${key}`);
  mapped.add(key);
}
assert.deepEqual(
  [...Object.keys(PERMISSOES_ROTAS_FINANCEIRAS)].sort(),
  [...mapped].sort(),
  'Tabela de permissões financeiras possui rota obsoleta ou não auditada'
);

const registry = new Set(MODULO_PERMISSION_GROUPS.flatMap((group) =>
  (group.areas || []).flatMap((area) => (area.permissoes || []).map((permission) => permission.key))
));
for (const [route, keys] of Object.entries(PERMISSOES_ROTAS_FINANCEIRAS)) {
  for (const key of keys) assert.ok(registry.has(key), `Chave ausente no registro (${route}): ${key}`);
}

assert.deepEqual(resolverPermissoesRotaFinanceira({ method: 'POST', route: { path: '/financeiro/titulos/:id/baixas' } }), ['financeiro.titulos.baixar']);
assert.deepEqual(resolverPermissoesRotaFinanceira({ method: 'GET', route: { path: '/financeiro/titulos/:id' } }), ['financeiro.titulos.visualizar']);
assert.deepEqual(resolverPermissoesRotaFinanceira({ method: 'POST', path: '/financeiro/bancos/caixa-pagamentos/remessas/42/download' }), []);
assert.deepEqual(resolverPermissoesRotaFinanceira({ method: 'GET', path: '/financeiro/bancos/caixa-pagamentos/remessas/42/download' }), ['financeiro.bancos.remessas']);
assert.deepEqual(resolverPermissoesRotaFinanceira({ method: 'GET', baseUrl: '/api/financeiro/bancos', path: '/dashboard' }), ['financeiro.bancos.visualizar']);
assert.deepEqual(resolverPermissoesRotaFinanceira({ method: 'POST', baseUrl: '/api/financeiro/bancos', path: '/caixa-pagamentos/remessas' }), ['financeiro.pagamentos.preparar']);
for (const [method, route] of [
  ['GET', '/cheques-terceiros'],
  ['POST', '/cheques-terceiros/123/depositar'],
  ['POST', '/fila-pagamentos/baixar'],
  ['POST', '/fila-pagamentos/aprovar-divergencias'],
  ['POST', '/fila-pagamentos/42/resolver']
]) {
  assert.equal(operacaoSujeitaAoControle({ method, path: route }), true, `Controle diario ausente: ${method} ${route}`);
}
for (const [method, route] of [
  ['GET', '/fila-pagamentos'],
  ['POST', '/fila-pagamentos/comprovantes/vincular'],
  ['POST', '/conciliacoes/importar-ofx'],
  ['GET', '/titulos']
]) {
  assert.equal(operacaoSujeitaAoControle({ method, path: route }), false, `Controle diario excessivo: ${method} ${route}`);
}
assert.equal(dataOperacionalHoje(new Date('2026-10-05T02:30:00.000Z')), '2026-10-04');
console.log(`${mapped.size} rotas legadas do Financeiro mapeadas para permissões granulares.`);
