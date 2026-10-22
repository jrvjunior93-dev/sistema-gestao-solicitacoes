'use strict';
// Executa o resolver e os handlers reais com persistencia em memoria. Sem DB/rede/.env.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const source = read('src/controllers/SolicitacaoCompraController.js');
let config = { regras: {} }, falhaConfig = false;
const moduloCampos = { exports: {} };
vm.runInNewContext(read('src/services/novaSolicitacaoCamposConfig.js'), {
  module: moduloCampos,
  require(name) {
    assert.equal(name, '../models');
    return { ConfiguracaoSistema: { findOne: async () => {
      if (falhaConfig) throw new Error('Falha de leitura QA');
      return { valor: JSON.stringify(config) };
    } } };
  }
});
const behavior = require('../src/services/tipoSolicitacaoBehaviorService');
const setor = { id: 3, codigo: 'GEO', nome: 'GERENCIA DE PROCESSOS' };
const moduloRegra = { exports: {} };
vm.runInNewContext(read('src/services/compraDiretaCredorRegraService.js'), {
  module: moduloRegra,
  require(name) {
    if (name === './novaSolicitacaoCamposConfig') return moduloCampos.exports;
    if (name === './tipoSolicitacaoBehaviorService') return behavior;
    if (name === './tipoSolicitacaoDisponibilidadeService') return { obterAreasConfiguracaoCamposDestino: obra => obra.areas || [] };
    if (name === './setorCapabilityService') return {
      findSetorByCapability: async () => setor,
      resolveSetorPersistenciaValue: (s, fallback) => s?.nome || fallback
    };
    throw new Error(`Dependencia inesperada: ${name}`);
  }
});
const resolverRegraCredorCompraDireta = moduloRegra.exports.resolverRegraCredorCompraDireta;
const tipo = { id: 76, nome: 'Compra Direta', codigo_interno: 'COMPRA_DIRETA', ativo: true };
const obra = { id: 7, nome: 'Obra QA' };
function definirRegra(obrigatorio, area = '__GLOBAL__', id = 76, visivel = true) {
  config = { regras: { [area]: { tipos: { [id]: { campos: { credor: { visivel, obrigatorio } } } } } } };
}
function funcao(nome) {
  const inicio = source.search(new RegExp(`(?:async )?function ${nome}\\(`));
  assert(inicio >= 0, nome);
  return source.slice(inicio, source.indexOf('\n}', inicio) + 2);
}
function metodo(nome) {
  const inicio = source.indexOf(`  async ${nome}(req, res) {`);
  assert(inicio >= 0, nome);
  return source.slice(inicio, source.indexOf('\n  },', inicio) + 4);
}
let writes, tx, permitido = true, parceiros, types = [tipo];
const registro = nome => ({ create: async data => {
  writes.push([nome, structuredClone(data)]);
  return { ...data, id: 91, update: async update => writes.push([`${nome}.update`, update]) };
}, bulkCreate: async data => writes.push([nome, structuredClone(data)]) });
const sandbox = {
  console: { error() {} }, Op: { in: Symbol('in') },
  SolicitacaoCompra: { ...registro('compra'), sequelize: { transaction: async () => tx } },
  Solicitacao: registro('solicitacao'), SolicitacaoCompraItem: registro('item'),
  SolicitacaoCompraItemApropriacao: registro('rateio'),
  SolicitacaoCompraItemManual: registro('manual'), SolicitacaoCompraItemManualApropriacao: registro('rateioManual'),
  Historico: registro('historico'), StatusArea: registro('status'),
  validarAcesso: async (_, res) => permitido ? { id: 2 } : (res.status(403).json({ error: 'Acesso negado' }), null),
  Obra: { findByPk: async id => Number(id) === 7 ? obra : null },
  TipoSolicitacao: { findByPk: async id => types.find(t => t.id === Number(id)), findAll: async () => types,
    create: async () => { throw new Error('GET nao pode criar tipo'); } },
  Parceiro: { findByPk: async id => parceiros.find(p => p.id === Number(id)) },
  FormaPagamentoFinanceira: { findAll: async () => [{ id: 1, nome: 'PIX', codigo: 'PIX', ativo: true }] },
  Insumo: { findAll: async () => [{ id: 1, nome: 'Material QA' }] },
  carregarMapaApropriacoes: async () => ({}),
  prepararItemCompraPayload: ({ item }) => ({ item: { ...item }, rateios: [{ apropriacao_id: 4, quantidade_apropriada: item.quantidade }] }),
  resolverRegraCredorCompraDireta, normalizeTipoSolicitacaoCodigo: behavior.normalizeTipoSolicitacaoCodigo,
  normalizeTipoSolicitacaoBehavior: behavior.normalizeTipoSolicitacaoBehavior,
  normalizeTextCompra: s => String(s || '').toUpperCase(),
  assertTipoCompraDisponivelNoDestino: async () => {},
  montarFluxoAprovacaoCompraDireta: async () => ({ usaFluxoDiretoria: false, areaResponsavel: 'GERENCIA DE PROCESSOS' }),
  buscarTipoSolicitacaoCompra: async () => ({ id: 4 }),
  montarFluxoAprovacaoCompra: async () => ({ usaFluxoDiretoria: false, areaResponsavel: 'GERENCIA DE PROCESSOS' }),
  gerarCodigoSolicitacao: async () => 'SOL-QA',
  registrarLogSolicitacaoCompra: async data => writes.push(['log', data]),
  publishComprasRealtimeEventSafe: async () => {}, anexarPdfNaSolicitacaoPrincipal: async () => true,
  anexarArquivosCabecalhoSolicitacao: async () => 0,
  responderErroController: require('../src/utils/controllerError').responderErroController,
  require(name) {
    assert.equal(name, '../services/pedidoEntregaService');
    return { assertObraPodeCriarCompra: async () => {} };
  }
};
vm.createContext(sandbox);
for (const nome of ['buscarTipoSolicitacaoCompraDireta', 'parseValorMonetario', 'arredondarMoeda',
  'ratearValorMonetario', 'formatCurrencyPdf', 'isFormaPagamentoBoleto', 'isFormaPagamentoPix',
  'isFormaPagamentoFopag', 'formatarFormaPagamentoResumo']) vm.runInContext(funcao(nome), sandbox);
const controller = vm.runInContext(`({${metodo('create')},${metodo('regraCredorCompraDireta')}})`, sandbox);
const base = { origem: 'COMPRA_DIRETA', obra_id: 7, necessario_para: '2026-10-30', tipo_solicitacao_id: 76,
  forma_pagamento_ids: [1], favorecido_id: 9, favorecido_chave_pix: 'pix-qa', desconto_total: 10,
  frete_tipo: 'EMBUTIDO', frete_valor: 5,
  itens: [{ insumo_id: 1, unidade_id: 1, apropriacao_id: 4, quantidade: 2, valor_unitario: 50, valor_total: 100 }] };
const validar = require('../src/validators/operationalValidators').validateCompraDiretaCreateBody;
const res = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
async function enviar(extra = {}, { ativo = true } = {}) {
  writes = []; tx = { commit: async () => { tx.committed = true; }, rollback: async () => { tx.rolledBack = true; } };
  parceiros = [{ id: 8, nome: 'Credor QA', ativo: true, fornecedor: true }, { id: 9, nome: 'Favorecido QA', ativo: true }];
  parceiros[0].ativo = ativo;
  const response = res();
  const body = structuredClone({ ...base, ...extra });
  await controller.create({ body: body.origem === 'NORMAL' ? body : validar(body), user: { id: 2 } }, response);
  return response;
}
(async () => {
  config = { regras: {} };
  tipo.comportamento = JSON.stringify({ exige_credor: true });
  assert.equal((await resolverRegraCredorCompraDireta({ tipo, obra })).obrigatorio, true, 'Comportamento padrao do tipo');
  definirRegra(false);
  assert.equal((await resolverRegraCredorCompraDireta({ tipo, obra })).obrigatorio, false, 'Regra explicita prevalece sobre padrao');
  delete tipo.comportamento;
  definirRegra(true);
  assert.equal((await resolverRegraCredorCompraDireta({ tipo, obra })).obrigatorio, true);
  for (const parceiro_id of [undefined, null, '']) {
    assert.equal((await enviar({ parceiro_id })).code, 400);
    assert.match((await enviar({ parceiro_id })).body.error, /Selecione o credor/);
    assert.equal(writes.length, 0); assert(tx.rolledBack); assert(!tx.committed);
  }
  assert.equal((await enviar({ parceiro_id: 8 })).code, 201);
  assert(tx.committed);
  const principal = writes.find(([n]) => n === 'solicitacao')[1];
  assert.equal(principal.parceiro_id, 8); assert.equal(principal.favorecido_id, 9);
  assert.equal(principal.valor, 95); // 100 - 10 + 5, sem recalcular qualquer regra nova.
  const historico = JSON.parse(writes.find(([n]) => n === 'historico')[1].metadata);
  assert.equal(historico.parceiro_id, 8); assert.equal(historico.desconto_total, 10);
  assert.equal(historico.formas_pagamento[0].favorecido_id, 9);
  for (const parceiro_id of [9, 999]) { // nao fornecedor e inexistente
    assert.equal((await enviar({ parceiro_id })).code, 400); assert.equal(writes.length, 0);
  }
  assert.equal((await enviar({ parceiro_id: 8 }, { ativo: false })).code, 400);
  assert.equal(writes.length, 0);
  definirRegra(false);
  assert.equal((await enviar()).code, 201, 'Configuracao opcional continua opcional');
  definirRegra(true, 'GEO');
  assert.equal((await enviar()).code, 400, 'Regra por codigo GEO');
  definirRegra(true, 'GERENCIA DE PROCESSOS');
  assert.equal((await enviar()).code, 400, 'Regra por nome GEO');
  definirRegra(true, 'ADMINISTRATIVO'); obra.areas = ['ADMINISTRATIVO'];
  assert.equal((await enviar()).code, 400, 'Regra por destino administrativo');
  obra.areas = [];
  definirRegra(true, '__GLOBAL__', 77);
  types = [{ ...tipo, id: 77 }];
  assert.equal((await enviar({ tipo_solicitacao_id: 77 })).code, 400, 'Tipo selecionado tem regra propria');
  types = [tipo];
  definirRegra(true, '__GLOBAL__', 76, false);
  assert.equal((await enviar()).code, 201, 'Campo configurado oculto nao se torna obrigatorio');
  definirRegra(true); falhaConfig = true;
  assert.equal((await enviar({ parceiro_id: 8 })).code, 500); assert.equal(writes.length, 0); assert(tx.rolledBack);
  falhaConfig = false; permitido = false;
  assert.equal((await enviar({ parceiro_id: 8 })).code, 403); assert.equal(writes.length, 0);
  permitido = true;
  assert.equal((await enviar({ origem: 'NORMAL', forma_pagamento_ids: [], frete_tipo: 'SEM_FRETE' })).code, 201, 'Compra normal nao exige credor');
  const r = res(); writes = [];
  await controller.regraCredorCompraDireta({ query: { obra_id: '7' } }, r);
  assert.equal(r.code, 200); assert.equal(r.body.credor.obrigatorio, true); assert.equal(writes.length, 0);
  types = [{ ...tipo, ativo: false, update: async () => { throw new Error('GET nao pode reativar tipo'); } }];
  await controller.regraCredorCompraDireta({ query: { obra_id: '7' } }, res());
  types = [];
  const semTipo = res(); await controller.regraCredorCompraDireta({ query: { obra_id: '7' } }, semTipo);
  assert.equal(semTipo.code, 200, 'Referencia somente leitura nao cria tipo ausente');
  for (const query of [{}, { obra_id: 'abc' }, { obra_id: '7', tipo_solicitacao_id: 'abc' }, { obra_id: '999' }]) {
    const invalid = res(); await controller.regraCredorCompraDireta({ query }, invalid); assert.equal(invalid.code, 400);
  }
  const rota = read('src/routes.js').split('\n').find(l => l.includes("'/compras/solicitacoes-diretas/regra-credor'"));
  assert(rota.includes('allowCompraSolicitacoesCreate, requireCompraQueryObraCreationAccess'));
  for (const legado of [false, true]) {
    types = [tipo];
    definirRegra(legado);
    assert.equal((await enviar({ parceiro_id: 8 })).code, 201, 'Regra lida novamente no envio');
  }
  console.log('OK: regra real global/area/tipo, create real, rollback sem escrita, credor/favorecido, desconto/frete/historico, opcional/oculto, compra normal, permissoes e GET sem mutacoes. Sem DB/rede.');
})().catch(error => { console.error(error); process.exitCode = 1; });
