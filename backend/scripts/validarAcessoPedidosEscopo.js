'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ConfiguracaoSistema } = require('../src/models');
const auth = require('../src/services/authorizationService');

const usuario = { id: 33, perfil: 'USUARIO', setor_id: 4, setor: { id: 4, codigo: 'GEO' } };
const originalFindOne = ConfiguracaoSistema.findOne;
let configuracao = null;
ConfiguracaoSistema.findOne = async () => configuracao && { valor: JSON.stringify(configuracao) };

async function comPermissoes(permissoes, callback) {
  configuracao = permissoes === null ? null : { usuarios: { [usuario.id]: permissoes } };
  auth.invalidatePermissoesAreasCache();
  await callback();
}

async function validarAutorizacao() {
  await comPermissoes(null, async () => {
    assert.equal(await auth.canViewComprasPedidos(usuario), false, 'Legado sem permissao nao abre pedidos');
  });
  await comPermissoes(['compras.relatorios.pedidos'], async () => {
    assert.equal(await auth.canViewComprasPedidos(usuario), false, 'Relatorio nao abre a pagina de pedidos');
  });
  await comPermissoes(['compras.pedidos.visualizar'], async () => {
    assert.equal(await auth.canViewComprasPedidos(usuario), true);
    assert.equal(await auth.getComprasVisibilityScope(usuario), 'NENHUM');
  });
  await comPermissoes(['compras.pedidos.visualizar', 'compras.escopo.minhas_atribuidas'], async () => {
    assert.equal(await auth.getComprasVisibilityScope(usuario), 'ATRIBUIDAS');
  });
  await comPermissoes(['compras.pedidos.visualizar', 'compras.escopo.setor'], async () => {
    assert.equal(await auth.getComprasVisibilityScope(usuario), 'SETOR');
  });
  await comPermissoes(['compras.pedidos.visualizar', 'compras.delegacao.gerenciar'], async () => {
    assert.equal(await auth.getComprasVisibilityScope(usuario), 'NENHUM', 'Delegacao nao eleva escopo');
  });
  await comPermissoes(['financeiro.fila_pagamentos.visualizar'], async () => {
    assert.equal(await auth.canAccessFinanceiro(usuario), true);
    assert.equal(await auth.userHasAreaPermission(usuario, ['financeiro.titulos.visualizar']), false,
      'Acesso a fila nao libera resultados de titulos na busca');
  });
  await comPermissoes(['obras.cadastro.visualizar'], async () => {
    assert.equal(await auth.canViewCadastroObras(usuario), true);
  });
}

function carregarResourceAccessIsolado() {
  const arquivo = path.join(__dirname, '../src/middlewares/resourceAccess.js');
  const source = fs.readFileSync(arquivo, 'utf8');
  let buscasPedido = 0;
  const sandbox = {
    module: { exports: {} },
    require(id) {
      if (id === '../models') return {
        Contrato: {}, SolicitacaoCompra: {},
        PedidoCompra: { findByPk: async (pedidoId) => { buscasPedido += 1; return { id: pedidoId, obra_id: 3 }; } }
      };
      if (id === '../services/authorizationService') return {
        buildUserScopeTokens: async () => [],
        canAccessContratosGlobal: async () => false,
        getComprasVisibilityScope: async (user) => user.escopo,
        getUserObraScopeIds: async (user) => user.obras,
        isBusinessAdmin: () => false,
        userCanCreateInAllObras: async () => false,
        userHasAreaPermission: async () => false
      };
      if (id === '../services/setorCapabilityService') return { userHasSetorCapability: async () => false };
      if (id === '../services/securityLogService') return { registrarEventoSeguranca: async () => {} };
      throw new Error(`Dependencia inesperada: ${id}`);
    }
  };
  vm.runInNewContext(source, sandbox, { filename: arquivo });
  return { ...sandbox.module.exports, buscasPedido: () => buscasPedido };
}

function resposta() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

async function validarMiddleware() {
  const middleware = carregarResourceAccessIsolado();
  let nextCalls = 0;
  const next = () => { nextCalls += 1; };
  const semEscopo = { user: { id: 33, escopo: 'NENHUM', obras: [3] }, params: { id: 9 }, method: 'GET' };
  const bloqueio = resposta();
  await middleware.requirePedidoCompraAccess(semEscopo, bloqueio, next);
  assert.equal(bloqueio.statusCode, 403);
  assert.equal(middleware.buscasPedido(), 0, 'Pedido nem deve ser carregado sem escopo');
  assert.equal(nextCalls, 0);

  const permitido = resposta();
  await middleware.requirePedidoCompraAccess({ ...semEscopo, user: { ...semEscopo.user, escopo: 'ATRIBUIDAS' } }, permitido, next);
  assert.equal(permitido.statusCode, 200);
  assert.equal(nextCalls, 1);

  const obraExplicita = resposta();
  await middleware.scopeCompraListAccess({ user: { id: 33, obras: [] }, query: { obra_id: '3' } }, obraExplicita, next);
  assert.equal(obraExplicita.statusCode, 403, 'Filtro por obra nao pode escapar de escopo vazio');

  const reqLista = { user: { id: 33, obras: [] }, query: {} };
  await middleware.scopeCompraListAccess(reqLista, resposta(), next);
  assert.equal(reqLista.compraScopeObraIds.length, 0);
}

(async () => {
  try {
    await validarAutorizacao();
    await validarMiddleware();
    const controller = fs.readFileSync(path.join(__dirname, '../src/controllers/PedidoCompraController.js'), 'utf8');
    assert.match(controller, /if \(await getComprasVisibilityScope\(usuario\) === 'NENHUM'\) \{\s*return res\.json\(\[\]\);/);
    const busca = fs.readFileSync(path.join(__dirname, '../src/controllers/BuscaController.js'), 'utf8');
    assert.match(busca, /async function grupoObras[\s\S]*?if \(!podeVerLista\) return null;/);
    assert.match(busca, /async function grupoTitulos[\s\S]*?userHasAreaPermission\(req\.user, \['financeiro\.titulos\.visualizar'\]\)/);
    assert.match(busca, /async function grupoColaboradores[\s\S]*?isModuleEnabled\('RH_DP'\)/);
    assert.match(busca, /podeVerContratos \? \[\{ rotulo: 'ver contratos'/,
      'Atalho de contratos da obra requer permissao de contratos');
    assert.match(busca, /podeVerTitulos \? \[\{ rotulo: 'ver títulos'/,
      'Atalho de titulos do parceiro requer permissao financeira');
    console.log('Acesso a busca e pedidos: permissao de pagina, escopo vazio e protecao de URL/API validados.');
  } finally {
    ConfiguracaoSistema.findOne = originalFindOne;
    auth.invalidatePermissoesAreasCache();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
