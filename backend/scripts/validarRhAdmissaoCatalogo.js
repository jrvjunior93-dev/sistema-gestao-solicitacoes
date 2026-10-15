'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let consultas = 0;
const sandbox = { module: { exports: {} }, require(name) {
  if (name === '../models') return { RhEmpresaGrupo: { findAll: async options => {
    consultas++; assert.equal(JSON.stringify(options.attributes), JSON.stringify(['id', 'nome', 'cnpj']));
    assert.equal(options.where.ativo, true); assert.equal(options.raw, true);
    return [{ id: 1, nome: 'Empresa A', cnpj: '111', segredo: 'nao retornar' }, { id: 2, nome: 'Empresa B', cnpj: '222' }];
  } } };
  if (name === '../services/authorizationService') return { userHasAreaPermission: async user => user.perfil === 'SUPERADMIN' || user.permissoes?.includes('rh_dp.solicitacoes.abrir') };
  if (name === '../utils/controllerError') return require('../src/utils/controllerError');
  throw new Error(name);
} };
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/controllers/RhAdmissaoCatalogoController.js'), 'utf8'), sandbox);
async function consulta(user) {
  const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await sandbox.module.exports.empresas({ user, query: { ativo: false, attributes: '*', include: 'todos' } }, res); return res;
}
(async () => {
  assert.equal((await consulta(null)).code, 401);
  assert.equal((await consulta({ permissoes: ['rh_dp.empresas.gerenciar'] })).code, 403); assert.equal(consultas, 0);
  const res = await consulta({ perfil: 'USUARIO', setor: 'OBRA', permissoes: ['rh_dp.solicitacoes.abrir'] });
  assert.equal(res.body.length, 2); assert.equal(res.body[0].segredo, undefined); assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal((await consulta({ perfil: 'SUPERADMIN' })).body.length, 2);
  const routes = fs.readFileSync(path.resolve(__dirname, '../src/routes.js'), 'utf8');
  assert.match(routes, /router\.get\('\/rh\/solicitacoes\/empresas-admissao', allowRhDpSolicitacaoAbrir,/);
  assert.ok(routes.indexOf("'/rh/solicitacoes/empresas-admissao'") < routes.indexOf("'/rh/solicitacoes/:id'"));
  assert.match(routes, /router\.get\('\/rh\/empresas-grupo', allowRhDpEmpresasManage,/);
  console.log('Admissao: catalogo minimo de empresas ativas para OBRA autorizada; sem gestao, escrita ou ampliacao por query. Sem banco/rede.');
})().catch(error => { console.error(error); process.exitCode = 1; });
