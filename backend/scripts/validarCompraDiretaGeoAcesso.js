'use strict';

// Executa as funcoes e handlers reais em VM, sem carregar models/env ou acessar banco.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const controller = fs.readFileSync(path.join(root, 'backend/src/controllers/SolicitacaoCompraController.js'), 'utf8');
const authorization = fs.readFileSync(path.join(root, 'backend/src/services/authorizationService.js'), 'utf8');
const routes = fs.readFileSync(path.join(root, 'backend/src/routes.js'), 'utf8');

function declaration(source, name) {
  const start = source.indexOf(`async function ${name}(`);
  assert.ok(start >= 0, `Funcao nao encontrada: ${name}`);
  const tail = source.slice(start);
  const next = /\n(?:async )?function |\nmodule\.exports/.exec(tail);
  assert.ok(next, `Fim de funcao nao encontrado: ${name}`);
  return tail.slice(0, next.index);
}

function handler(name) {
  const start = controller.indexOf(`  async ${name}(req, res) {`);
  assert.ok(start >= 0, `Handler nao encontrado: ${name}`);
  const tail = controller.slice(start);
  const next = /\n  async \w+\(req, res\)/.exec(tail);
  assert.ok(next);
  return tail.slice(0, next.index).trim().replace(/,$/, '');
}

const permissoesLiz = [
  'compras.solicitacoes.visualizar', 'compras.escopo.minhas_atribuidas',
  'compras.compra_direta.editar_apropriacoes_itens', 'compras.insumos.catalogar_itens_manuais'
];
let usuario;
let principal;
let compra;
let titulos;
let ultimoLock;
const transaction = { LOCK: { UPDATE: 'UPDATE' }, rollback: async () => {}, commit: async () => {} };
const sandbox = {
  console: { error() {} },
  isBusinessAdmin: user => ['SUPERADMIN', 'ADMINISTRADOR'].includes(user.perfil),
  userHasConfiguredAreaPermissions: async () => true,
  userHasAreaPermissionWhenConfigured: async (user, keys) => keys.some(key => user.permissoes.includes(key)),
  userHasAreaPermission: async (user, keys) => keys.some(key => user.permissoes.includes(key)),
  COMPRAS_ESCOPO_TODAS_KEYS: ['compras.escopo.todas'],
  COMPRAS_ESCOPO_SETOR_KEYS: ['compras.escopo.setor'],
  canViewCompraSolicitacoes: async user => user.permissoes.includes('compras.solicitacoes.visualizar'),
  canEditarItensSolicitacaoCompra: async user => user.permissoes.includes('compras.solicitacoes.editar_itens'),
  canEncaminharCompraSolicitacoes: async () => false,
  canEditarApropriacoesItemCompraDireta: async user => user.permissoes.includes('compras.compra_direta.editar_apropriacoes_itens'),
  canEditarApropriacoesItemSolicitacaoCompra: async () => false,
  userHasSetorCapability: async user => user.geo === true,
  isSolicitacaoCompraDireta: value => value?.origem === 'COMPRA_DIRETA',
  normalizeFluxoTokenCompra: value => String(value || '').trim().toUpperCase().replace(/\s+/g, '_'),
  isGeoToken: value => ['GEO', 'GERENCIA_DE_PROCESSOS'].includes(String(value || '').trim().toUpperCase().replace(/\s+/g, '_')),
  buscarSetorGerenciaProcessos: async () => 'GEO',
  isStatusSolicitacaoCompraAguardandoRevisaoGeo: status => status === 'PENDENTE_GEO',
  assertPodeInteragirSolicitacao: async ({ user }, value) => {
    if (!user.visivel) throw Object.assign(new Error('Acesso negado'), { statusCode: 403 });
    if (user.setorPrincipal !== value.area_responsavel) {
      throw Object.assign(new Error('Fora do setor principal'), { statusCode: 409 });
    }
  },
  validarAcesso: async () => usuario,
  carregarSolicitacaoCompra: async () => compra,
  Solicitacao: { findByPk: async (id, options) => {
    ultimoLock = options.lock;
    return Number(id) === principal?.id ? principal : null;
  } },
  SolicitacaoCompra: {
    findOne: async () => ({ id: compra.id }),
    findByPk: async () => compra,
    sequelize: { transaction: async () => transaction }
  },
  TituloFinanceiro: { count: async () => titulos },
  SolicitacaoCompraItem: { findOne: async () => null },
  SolicitacaoCompraItemManual: { findOne: async () => null },
  SolicitacaoCompraItemApropriacao: {}, SolicitacaoCompraItemManualApropriacao: {}
};
vm.createContext(sandbox);
for (const name of ['getComprasVisibilityScope', 'canViewAllComprasScope', 'canAccessSolicitacaoCompraByScope']) {
  vm.runInContext(declaration(authorization, name), sandbox);
}
for (const name of ['podeGerenciarCompraNaFilaGeo', 'podeAcessarCompraDiretaNaFilaGeo', 'validarEscopoSolicitacaoCompra']) {
  vm.runInContext(declaration(controller, name), sandbox);
}
vm.runInContext(`handlers = { ${[
  'showCompraDiretaPorSolicitacao', 'showPorSolicitacaoPrincipal',
  'atualizarApropriacoesItem', 'cadastrarUnidadeItem'
].map(handler).join(',\n')} };`, sandbox);

function reset() {
  usuario = { id: 2, perfil: 'ADMIN', geo: true, setorPrincipal: 'GEO', visivel: true, permissoes: [...permissoesLiz] };
  principal = { id: 6275, codigo: 'SOL-6240', obra_id: 51, area_responsavel: 'GEO', criado_por: 6 };
  compra = { id: 584, origem: 'COMPRA_DIRETA', status: 'ENVIADO', solicitacao_principal_id: 6275,
    solicitante_id: 6, comprador_responsavel_id: null, itens: [], itensManuais: [{ id: 1 }, { id: 2 }] };
  titulos = 0;
  ultimoLock = null;
}

function resposta() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}
async function escopo(options) {
  const res = resposta();
  return sandbox.validarEscopoSolicitacaoCompra(usuario, compra, res, null, options);
}
async function executar(name) {
  const res = resposta();
  await sandbox.handlers[name]({ user: usuario, params: { id: '584', solicitacaoId: '6275', itemId: '1' }, body: { item_tipo: 'MANUAL' } }, res);
  return res;
}

(async () => {
  reset();
  assert.equal(await sandbox.getComprasVisibilityScope(usuario), 'ATRIBUIDAS');
  assert.equal(await escopo(), false, 'O escopo geral permanece somente atribuidas');
  assert.equal(await escopo({ permitirCompraDiretaGeo: true }), true, 'GEO pode tratar a Compra Direta recebida');
  for (const name of ['showCompraDiretaPorSolicitacao', 'showPorSolicitacaoPrincipal']) {
    const res = await executar(name);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.itensManuais.length, 2, 'Os dois itens chegam ao detalhe');
  }
  principal.area_responsavel = 'GERENCIA DE PROCESSOS'; usuario.setorPrincipal = principal.area_responsavel;
  assert.equal(await escopo({ permitirCompraDiretaGeo: true }), true, 'Alias legado de GEO permanece valido');

  for (const mutate of [
    () => { usuario.permissoes = []; },
    () => { usuario.geo = false; },
    () => { usuario.visivel = false; },
    () => { usuario.setorPrincipal = 'FINANCEIRO'; },
    () => { principal.area_responsavel = 'FINANCEIRO'; compra.solicitacaoPrincipal = { area_responsavel: 'GEO' }; },
    () => { compra.solicitacao_principal_id = null; },
    () => { principal = null; }
  ]) {
    reset(); mutate();
    assert.equal(await escopo({ permitirCompraDiretaGeo: true }), false);
    assert.equal((await executar('showPorSolicitacaoPrincipal')).statusCode, 403);
  }

  reset(); compra.origem = 'NORMAL';
  assert.equal(await escopo({ permitirCompraDiretaGeo: true }), false, 'Nao libera outra compra');
  compra.status = 'PENDENTE_GEO'; usuario.permissoes.push('compras.solicitacoes.editar_itens');
  assert.equal(await escopo(), true, 'Revisao normal de GEO permanece funcional');

  reset(); usuario.permissoes = ['compras.solicitacoes.visualizar'];
  assert.equal((await executar('atualizarApropriacoesItem')).statusCode, 403, 'Leitura nao autoriza apropriacoes');
  assert.equal((await executar('cadastrarUnidadeItem')).statusCode, 403, 'Leitura nao autoriza unidade');
  reset(); titulos = 1;
  const financeiro = await executar('atualizarApropriacoesItem');
  assert.equal(financeiro.statusCode, 400);
  assert.match(financeiro.body.error, /titulo financeiro ja criado/);
  assert.equal(ultimoLock, 'UPDATE', 'Setor principal protegido na transacao da escrita');
  reset();
  assert.equal((await executar('atualizarApropriacoesItem')).statusCode, 404, 'Permissao e escopo passam; item inexistente continua bloqueado');
  assert.equal((await executar('cadastrarUnidadeItem')).statusCode, 404);
  reset(); principal.area_responsavel = 'FINANCEIRO';
  assert.equal((await executar('atualizarApropriacoesItem')).statusCode, 403);

  // Exatamente estes quatro pontos optam pela nova excecao; nenhuma lista/pedido/cotacao.
  assert.equal((controller.match(/permitirCompraDiretaGeo: true/g) || []).length, 4);
  assert.match(routes, /itens-manuais\/:itemId\/catalogar'[\s\S]*?allowComprasCatalogarItensManuais[\s\S]*?requireCompraAccess/);
  assert.match(controller, /if \(totalTitulos > 0\)/);
  console.log('Compra Direta GEO: leitura de dois itens, escopo restrito, permissoes de acao, setor atual e bloqueio financeiro validados. Sem banco ou servicos externos.');
})().catch(error => { console.error(error); process.exitCode = 1; });
