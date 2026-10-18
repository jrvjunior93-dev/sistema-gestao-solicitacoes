'use strict';
// Controller/ACL reais, models em memoria. Nao carrega .env, banco ou conta real.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Op } = require('sequelize');
const root = path.resolve(__dirname, '..');
const obras = [{ id: 1, nome: 'Obra QA', tipo_centro_custo: 'OBRA' },
  { id: 2, nome: 'Administrativo QA', tipo_centro_custo: 'CENTRO_CUSTO' }];
let vinculos = [], globais = 0;
const models = {
  Obra: { findAll: async ({ where }) => {
    globais++;
    assert.equal(where.tipo_centro_custo, undefined, 'TODOS nao exclui centros de custo');
    return obras;
  } },
  UsuarioObra: { findAll: async () => vinculos.map(obra => ({ obra })),
    findOne: async () => null },
  Setor: { findByPk: async () => null },
  ConfiguracaoSistema: { findOne: async () => null }
};
function carregar(file, imports) {
  const context = { module: { exports: {} }, console, require(name) {
    if (!Object.hasOwn(imports, name)) throw Error('Dependencia nao simulada: ' + name);
    return imports[name];
  } };
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  return context.module.exports;
}
const auth = carregar('src/services/authorizationService.js', {
  '../models': models,
  './setorCapabilityService': { userHasSetorCapability: async () => false },
  '../constants/rhDpPermissions': require('../src/constants/rhDpPermissions'),
  '../constants/moduloPermissoes': require('../src/constants/moduloPermissoes')
});
const controller = carregar('src/controllers/ObraController.js', {
  '../models': models, sequelize: { Op },
  '../services/authorizationService': auth,
  '../modules/custosRecebiveis/services/bloqueioObraService': { guardMode: () => 'off' },
  '../services/obraGestaoService': {}, '../services/obraTipoApropriacaoPadraoService': {},
  '../services/apropriacaoSelecaoService': {}, '../constants/centroCusto': require('../src/constants/centroCusto')
});
async function listar(user, query) {
  const res = { status(code) { throw Error('HTTP inesperado: ' + code); }, json(data) { this.data = data; return this; } };
  await controller.minhas({ user, query }, res);
  return Array.from(res.data, o => o.id);
}
(async () => {
  const financeiro = { id: 801, perfil: 'USUARIO', areas_permissoes_configuradas: true,
    areas_permissoes: ['financeiro.conciliacao.conciliar'] };
  const semFinanceiro = { ...financeiro, id: 802, areas_permissoes: ['solicitacoes.lista.visualizar_minhas'] };
  assert.equal(await auth.canAccessFinanceiro(financeiro), true);
  assert.equal(await auth.canAccessFinanceiro(semFinanceiro), false);
  assert.deepEqual(await listar(financeiro, { escopo: 'TODOS' }), [], 'Reproduz modal antigo sem modo, usuario sem vinculos');
  assert.deepEqual(await listar({ ...financeiro, perfil: 'SUPERADMIN' }, { escopo: 'TODOS' }), [1, 2], 'Explica por que SUPERADMIN funciona');
  assert.deepEqual(await listar(financeiro, { modo: 'FINANCEIRO', escopo: 'TODOS' }), [1, 2], 'Financeiro lista todas as obras/centros sem UsuarioObra');
  const antes = globais;
  assert.deepEqual(await listar(semFinanceiro, { modo: 'FINANCEIRO', escopo: 'TODOS' }), []);
  assert.equal(globais, antes, 'modo no query nao concede acesso financeiro');
  vinculos = [obras[0]];
  assert.deepEqual(await listar(semFinanceiro, { modo: 'FINANCEIRO', escopo: 'TODOS' }), [1]);
  assert.deepEqual(await listar(financeiro, { escopo: 'TODOS' }), [1], 'Consulta comum continua limitada aos vinculos');
  assert.deepEqual(await listar(financeiro, { modo: 'FINANCEIRO', escopo: 'TODOS' }), [1, 2]);
  console.log('OK: causa reproduzida sem modo; SUPERADMIN, financeiro granular com todas as obras/centros e nao-financeiro restrito. Sem banco, usuario real ou escrita.');
})().catch(error => { console.error(error); process.exitCode = 1; });
