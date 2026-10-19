'use strict';

// Services e controller reais com modelos em memoria. Sem .env, banco ou rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const behavior = require('../src/services/tipoSolicitacaoBehaviorService');
const centroCusto = require('../src/constants/centroCusto');
const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const Op = { in: Symbol('in'), or: Symbol('or'), ne: Symbol('ne') };

function fixture() {
  const types = [
    [1, 'DESPESA_DE_MARKETING', 'DESPESA DE MARKETING'],
    [2, 'DESPESA_COMERCIAL', 'DESPESA COMERCIAL'],
    [3, 'DESPESA_ADMINISTRATIVA', 'DESPESA ADMINISTRATIVA'],
    [4, 'CADASTRO_DE_OBRA', 'CADASTRO DE OBRA'],
    [5, 'SOLICITACAO_DE_COMPRA', 'Solicitação de Compra'],
    [6, 'COMPRA_DIRETA', 'Compra Direta'],
    [7, 'MEDICAO', 'Medição']
  ].map(([id, codigo_interno, nome]) => {
    const tipo = { id, codigo_interno, nome, ativo: true, disponivel_para_obras: id >= 4,
      comportamento: behavior.serializeTipoSolicitacaoBehavior(id <= 3 ? { mostrar_subtipo: true } :
        behavior.normalizeTipoSolicitacaoBehavior({ codigo_interno, nome })), subtiposVinculados: [] };
    tipo.get = () => ({ ...tipo });
    tipo.update = () => { throw Error('Cadastro nao pode ser alterado por este teste'); };
    return tipo;
  });
  const destinos = ['ADMINISTRATIVO ESCRITORIO', 'MARKETING', 'COMERCIAL', 'ALMOXARIFADO'].map((nome, i) => {
    const d = { id: i + 40, codigo: String(i + 40), nome, ativo: true, tipo_centro_custo: 'CENTRO_CUSTO' };
    d.get = () => ({ ...d }); return d;
  });
  const models = {
    Obra: { findByPk: async id => destinos.find(d => d.id === Number(id)), findAll: async () => destinos },
    TipoSolicitacao: { findAll: async ({ where = {} } = {}) => types.filter(t => {
      if (where[Op.or]) return where[Op.or].some(w => Object.entries(w).some(([k, v]) =>
        typeof v === 'object' ? v[Op.in]?.includes(t[k]) : v === t[k]));
      if (where.id && (typeof where.id === 'object' ? !where.id[Op.in].includes(t.id) : where.id !== t.id)) return false;
      return Object.entries(where).filter(([k]) => k !== 'id').every(([k, v]) => t[k] === v);
    }), create: () => { throw Error('Nao criar tipo'); } },
    CentroCustoTipoSolicitacao: { findAll: async () => [], findOne: async () => null },
    TipoSubContrato: {}, sequelize: {}
  };
  const sandbox = { module: { exports: {} }, require(name) {
    if (name === 'sequelize') return { Op };
    if (name === '../models') return models;
    if (name === '../constants/centroCusto') return centroCusto;
    if (name === './tipoSolicitacaoBehaviorService') return behavior;
    throw Error(`Import nao simulado: ${name}`);
  } };
  vm.runInNewContext(read('src/services/tipoSolicitacaoDisponibilidadeService.js'), sandbox);
  return { service: sandbox.module.exports, types, destinos };
}

const controller = read('src/controllers/SolicitacaoCompraController.js');
const start = controller.indexOf('  async create(req, res) {');
const end = controller.indexOf('  async integrar(req, res) {', start);
assert(start > 0 && end > start);
const createMethod = controller.slice(start, end);

async function persistir(f, destino, direta, { permitido = true, pendencia = false } = {}) {
  const writes = { compra: [], principal: [], historico: [], status: [], commits: 0, rollbacks: 0 };
  const transaction = { commit: async () => writes.commits++, rollback: async () => writes.rollbacks++ };
  const noop = async () => {};
  const make = key => ({ create: async data => {
    if (writes[key]) writes[key].push(data);
    return { id: key === 'principal' ? 200 : 100, ...data, update: noop };
  }, bulkCreate: noop });
  const boleto = { id: 1, nome: 'Boleto', codigo: 'BOLETO', ativo: true };
  const fluxo = async () => ({ areaResponsavel: 'GEO', usaFluxoDiretoria: false });
  const sandbox = {
    Op, SolicitacaoCompra: { ...make('compra'), sequelize: { transaction: async () => transaction } },
    Solicitacao: make('principal'), Historico: make('historico'), StatusArea: make('status'),
    SolicitacaoCompraItem: make('item'), SolicitacaoCompraItemManual: make('manual'),
    SolicitacaoCompraItemApropriacao: make('rateio'), SolicitacaoCompraItemManualApropriacao: make('rateio'),
    Obra: { findByPk: async () => destino }, Insumo: { findAll: async () => [] },
    FormaPagamentoFinanceira: { findAll: async () => [boleto] },
    validarAcesso: async (_req, res) => permitido ? { id: 991 } :
      (res.status(403).json({ error: 'Acesso negado' }), null),
    normalizeTextCompra: v => String(v || '').trim().toUpperCase(),
    carregarMapaApropriacoes: async () => new Map(),
    prepararItemCompraPayload: ({ item }) => ({ manual: true, item: { ...item }, rateios: [] }),
    arredondarMoeda: v => Math.round(Number(v) * 100) / 100, parseValorMonetario: v => Number(v || 0),
    ratearValorMonetario: (_valor, itens) => itens.map(() => 0),
    isFormaPagamentoFopag: () => false, isFormaPagamentoBoleto: () => true,
    isAnexoBoletoCompraDireta: a => a.tipo_documento === 'BOLETO', formatarFormaPagamentoResumo: forma => forma.nome,
    buscarTipoSolicitacaoCompra: async () => f.types[4], buscarTipoSolicitacaoCompraDireta: async () => f.types[5],
    assertTipoCompraDisponivelNoDestino: f.service.assertTipoCompraDisponivelNoDestino,
    montarFluxoAprovacaoCompra: fluxo, montarFluxoAprovacaoCompraDireta: fluxo,
    gerarCodigoSolicitacao: async () => 'SOL-TESTE', formatCurrencyPdf: v => Number(v).toFixed(2),
    registrarLogSolicitacaoCompra: noop, publishComprasRealtimeEventSafe: noop,
    anexarPdfNaSolicitacaoPrincipal: async () => false, anexarArquivosCabecalhoSolicitacao: async () => 1,
    require(name) {
      assert.equal(name, '../services/pedidoEntregaService');
      return { assertObraPodeCriarCompra: async () => {
        if (pendencia) throw Object.assign(Error('Entrega pendente'), { statusCode: 409, code: 'COMPRA_ENTREGA_PENDENTE' });
      } };
    }, console: { error: error => { if (!error.statusCode) throw error; } }
  };
  const api = vm.runInNewContext(`({${createMethod}})`, sandbox);
  const body = { obra_id: destino?.id || 40, necessario_para: '2026-10-30',
    itens: [{ nome_manual: 'Material', quantidade: 1, valor_unitario: 10, valor_total: 10 }],
    ...(direta ? { origem: 'COMPRA_DIRETA', forma_pagamento_ids: [1],
      anexos_cabecalho: [{ tipo_documento: 'BOLETO', arquivo: '/simulado/boleto.pdf' }] } : {}) };
  const res = { status(code) { this.code = code; return this; }, json(data) { this.body = data; return this; } };
  await api.create({ body }, res);
  return { ...writes, res };
}

async function main() {
  const f = fixture();
  for (const destino of f.destinos) {
    for (const codigo of ['SOLICITACAO_DE_COMPRA', 'COMPRAS', 'COMPRA_DIRETA']) {
      assert.equal(await f.service.assertTipoCompraDisponivelNoDestino(destino, { ...f.types[4], codigo_interno: codigo }), true);
    }
    for (const direta of [false, true]) {
      const r = await persistir(f, destino, direta);
      assert.equal(r.res.code, 201); assert.equal(r.commits, 1); assert.equal(r.rollbacks, 0);
      assert.equal(r.compra.length, 1); assert.equal(r.principal.length, 1);
      assert.equal(r.historico.length, 1); assert.equal(r.status.length, 1);
      assert.equal(r.principal[0].obra_id, destino.id);
      assert.equal(r.principal[0].tipo_solicitacao_id, direta ? 6 : 5);
      assert.equal(r.principal[0].area_responsavel, 'GEO');
      assert.equal(r.principal[0].status_global, 'PENDENTE');
    }
  }
  console.log('OK compras normais/diretas nos centros automaticos e configuraveis; transacao, vinculos e historico.');

  for (const destino of f.destinos.slice(0, 3)) {
    const lista = await f.service.listarTiposDisponiveis(destino.id);
    assert.equal(lista.tipo_automatico, true); assert.equal(lista.tipos.length, 1);
    assert.equal(lista.tipos[0].id, destino.nome.startsWith('ADMINISTRATIVO') ? 3 : destino.nome === 'MARKETING' ? 1 : 2);
    for (const tipo of [f.types[4], f.types[5]]) {
      await assert.rejects(() => f.service.assertTipoDisponivelNoDestino(destino, tipo), /somente o tipo automatico/);
    }
  }
  const config = await f.service.obterConfiguracao();
  for (const destino of f.destinos.slice(0, 3)) assert.equal(config.tipos_por_centro_custo[destino.id].length, 1);
  assert.equal((await f.service.listarTiposDisponiveis(f.destinos[3].id)).tipos.length, 0);
  console.log('OK tipo fixo/catalogo/configuracao intactos; Nova Solicitacao nao ganhou compras.');

  for (const tipo of [{ ...f.types[4], ativo: false },
    { ...f.types[4], comportamento: behavior.serializeTipoSolicitacaoBehavior({ somente_sistema: true }) }]) {
    await assert.rejects(() => f.service.assertTipoCompraDisponivelNoDestino(f.destinos[0], tipo), /indisponivel/);
  }
  await assert.rejects(() => f.service.assertTipoCompraDisponivelNoDestino({ ...f.destinos[0], ativo: false }, f.types[4]), /inativo/);
  await assert.rejects(() => f.service.assertTipoCompraDisponivelNoDestino(null, f.types[4]), /nao encontrado/);
  await assert.rejects(() => f.service.assertTipoCompraDisponivelNoDestino(f.destinos[0], null), /indisponivel/);
  await assert.rejects(() => f.service.assertTipoCompraDisponivelNoDestino(f.destinos[0], f.types[6]), /somente o tipo automatico/);
  await assert.rejects(() => f.service.assertTipoCompraDisponivelNoDestino(f.destinos[3], f.types[6]), /nao permitido/);
  const obra = { ...f.destinos[0], tipo_centro_custo: 'OBRA' };
  assert.equal(await f.service.assertTipoCompraDisponivelNoDestino(obra, f.types[4]), true);
  await assert.rejects(() => f.service.assertTipoCompraDisponivelNoDestino(obra, { ...f.types[4], disponivel_para_obras: false }), /nao permitido para Obras/);
  // Tipo personalizado ja permitido continua permitido no seu proprio fluxo.
  assert.equal(await f.service.assertTipoCompraDisponivelNoDestino(f.destinos[0], f.types[2]), true);
  for (const direta of [false, true]) {
    for (const [destino, options, status] of [
      [f.destinos[0], { permitido: false }, 403], [f.destinos[0], { pendencia: true }, 409],
      [{ ...f.destinos[0], ativo: false }, {}, 404], [null, {}, 400]
    ]) {
      const r = await persistir(f, destino, direta, options);
      assert.equal(r.res.code, status); assert.equal(r.commits, 0); assert.equal(r.rollbacks, 1);
      assert.equal(r.compra.length + r.principal.length + r.historico.length, 0);
    }
  }
  console.log('OK negativas, tipos internos/inativos, regras de obras, entrega e rollback.');

  const routes = read('src/routes.js');
  for (const endpoint of ['/compras/solicitacoes', '/compras/solicitacoes-diretas']) {
    const route = routes.split(/\r?\n/).find(line => line.startsWith(`router.post('${endpoint}',`));
    assert(route.includes('allowCompraSolicitacoesCreate'));
    assert(route.includes('requireCompraBodyObraAccess'));
    assert(route.includes('validateRequest({ body:'));
    assert(route.indexOf('allowCompraSolicitacoesCreate') < route.indexOf('requireCompraBodyObraAccess'));
  }
  assert(!read('src/controllers/SolicitacaoController.js').includes('assertTipoCompraDisponivelNoDestino'));
  assert(!read('src/services/contratoFluxoNovoService.js').includes('assertTipoCompraDisponivelNoDestino'));
  const tela = read('../frontend/src/pages/TiposSolicitacaoPorDestino.jsx');
  assert(tela.includes('disabled={!ativo || centroCustoAutomatico}'));
  assert(read('../frontend/src/modules/solicitacao-compra/pages/NovaSolicitacaoCompra.jsx').includes("getMinhasObras({ modo: 'CRIACAO' })"));
  console.log('OK excecao so nas compras; guardas funcionais e escopo por usuario preservados. Sem banco/rede.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
