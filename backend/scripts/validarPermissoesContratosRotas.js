'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ConfiguracaoSistema } = require('../src/models');
const auth = require('../src/services/authorizationService');

const usuario = { id: 33, perfil: 'USUARIO', setor_id: 4, setor: { id: 4, codigo: 'OBRA' } };
const originalFindOne = ConfiguracaoSistema.findOne;
let permissoes = [];
ConfiguracaoSistema.findOne = async () => ({ valor: JSON.stringify({ usuarios: { [usuario.id]: permissoes } }) });

async function conferir(keys, esperado) {
  permissoes = keys;
  auth.invalidatePermissoesAreasCache();
  assert.deepEqual([
    await auth.canViewContratos(usuario),
    await auth.canCreateContratos(usuario),
    await auth.canViewContratosRelatorios(usuario)
  ], esperado);
}

(async () => {
  try {
    await conferir([], [false, false, false]);
    await conferir(['contratos.geral.criar'], [false, true, false]);
    await conferir(['contratos.geral.visualizar'], [true, false, false]);
    await conferir(['contratos.relatorios.visualizar'], [false, false, true]);

    const controller = fs.readFileSync(path.join(__dirname, '../src/controllers/ContratoController.js'), 'utf8');
    assert.match(controller, /async relatorioOperacional[\s\S]*?canViewContratosRelatorios\(req\.user\)/);
    assert.match(controller, /async index[\s\S]*?canViewContratos\(req\.user\)/);
    console.log('API de Contratos separa leitura, criacao e relatorios por permissao.');
  } finally {
    ConfiguracaoSistema.findOne = originalFindOne;
    auth.invalidatePermissoesAreasCache();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
