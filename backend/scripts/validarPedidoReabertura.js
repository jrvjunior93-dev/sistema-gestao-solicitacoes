'use strict';
// Servico/controller reais em memoria e SQL MySQL gerado sem conexao.
// Nao importa env/models do app, nao consulta nem escreve banco real.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Sequelize = require('sequelize');
const { Op, fn, col, DataTypes } = Sequelize;
const raiz = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(raiz, 'src/services/pedidoCompraService.js'), 'utf8');
const controller = fs.readFileSync(path.join(raiz, 'src/controllers/PedidoCompraController.js'), 'utf8');
const nomes = [...source.match(/const \{([^}]*?)\} = require\('\.\.\/models'\)/)[1].matchAll(/\b[A-Z]\w*/g)].map(m => m[0]);
const statuses = [
  { codigo: 'ABERTO', ativo: true, bloqueia_edicao: false },
  { codigo: 'FECHADO_FORNECEDOR', ativo: true, bloqueia_edicao: true },
  { codigo: 'CANCELADO', ativo: true, bloqueia_edicao: true }
];

function fixture(consultarTitulos = null) {
  const estado = { pedido: { id: 271, solicitacao_compra_id: 295, fornecedor_compra_id: 10,
    fechamento_id: 3, status: 'FECHADO_FORNECEDOR', encerrado_em: '2026-10-20',
    financeiro_fluxo_versao: 1, status_financeiro: 'AGUARDANDO_PREVISAO', valor_total: 6745.65 },
    compra: { id: 295, status: 'ENCERRADO', encerrado_em: '2026-10-20', solicitacao_principal_id: 5093 },
    principal: { id: 5093, status_global: 'FECHADO_FORNECEDOR', area_responsavel: 'COMPRAS' },
    logs: [], historicos: [], sincronizacoesFinanceiras: 0 };
  const options = { vinculos: 0, alocacoesTitulo: 0, fretesTitulo: 0, entrega: true, falhaHistorico: false, aprovacaoGeo: true };
  let tx;
  const consultas = [];
  function conferir(opt) { assert.equal(opt?.transaction, tx); }
  const pedido = new Proxy({}, { get(_, key) {
    if (key === 'update') return async (dados, opt) => { conferir(opt); Object.assign(estado.pedido, dados); };
    if (key === 'toJSON') return () => structuredClone(estado.pedido);
    return estado.pedido[key];
  } });
  const compra = new Proxy({}, { get(_, key) {
    if (key === 'update') return async (dados, opt) => { conferir(opt); Object.assign(estado.compra, dados); };
    if (key === 'itens') return [{ id: 1, quantidade: 26 }];
    if (key === 'itensManuais') return [{ id: 2, quantidade: 10 }];
    if (key === 'alocacoes') return [
      { status: 'ATIVA', item_tipo: 'CADASTRADO', solicitacao_compra_item_id: 1, quantidade_alocada: 26 },
      { status: 'ATIVA', item_tipo: 'MANUAL', solicitacao_compra_item_manual_id: 2, quantidade_alocada: 10 },
      { status: 'CANCELADA', item_tipo: 'MANUAL', solicitacao_compra_item_manual_id: 2, quantidade_alocada: 100 }];
    if (key === 'pedidos') return [pedido, { id: 272, status: 'CANCELADO' }];
    return estado.compra[key];
  } });
  const models = Object.fromEntries(nomes.map(name => [name, { name }]));
  models.PedidoCompra.findByPk = async (id, opt) => {
    consultas.push({ model: 'PedidoCompra', opt });
    if (opt?.include) return null; // Capturar o plano de leitura sem montar um DTO falso.
    conferir(opt); assert.equal(opt.lock, tx.LOCK.UPDATE); return Number(id) === 271 ? pedido : null;
  };
  models.SolicitacaoCompra.findByPk = async (id, opt) => { conferir(opt); consultas.push({ model: 'SolicitacaoCompra', opt }); return compra; };
  models.SolicitacaoCompraFornecedor.update = async (_, opt) => { conferir(opt); return [0]; };
  models.Solicitacao.findByPk = async (_, opt) => ({ ...estado.principal,
    update: async (dados, opts) => { conferir(opts); Object.assign(estado.principal, dados); } });
  models.PedidoCompraTitulo.count = async opt => { conferir(opt); return options.vinculos; };
  models.SolicitacaoCompraAlocacao.count = async opt => { conferir(opt); return options.alocacoesTitulo; };
  models.PedidoCompraFrete.count = async opt => { conferir(opt); return options.fretesTitulo; };
  models.PedidoCompraReabertura.findOne = async opt => { conferir(opt); return options.aprovacaoGeo ? { id: 8 } : null; };
  models.Historico.create = async (dados, opt) => { conferir(opt); if (options.falhaHistorico) throw Error('QA_HISTORICO'); estado.historicos.push(dados); };
  const deps = {
    sequelize: { Op, fn, col }, '../models': models,
    './comprasCotacao': { isSolicitacaoCompraCancelada: s => s === 'CANCELADO',
      registrarLogSolicitacaoCompra: async dados => { conferir(dados); const { transaction, ...log } = dados; estado.logs.push(log); } },
    './pedidoCompraStatusConfig': { getPedidoCompraStatusConfig: async () => statuses,
      findPedidoCompraStatusConfig: async s => statuses.find(x => x.codigo === s),
      isPedidoCompraStatusLocked: async s => !!statuses.find(x => x.codigo === s)?.bloqueia_edicao,
      normalizeStatusCode: s => String(s).toUpperCase() },
    './pedidoCompraFreteService': {}, './comprasDelegacaoService': {}, './pedidoCompraTotaisService': {},
    './comprasDisponibilidadeService': {},
    './setorCapabilityService': { findSetorByCapability: async () => ({}), resolveSetorPersistenciaValue: () => 'COMPRAS' },
    './pedidoEntregaService': { assertPrevisaoConfirmada: async (_, opt) => { assert.equal(opt, tx); if (!options.entrega) throw Error('Confirme a previsao de entrega.'); } },
    './pedidoCompraFinanceiroService': { buscarTitulosPedido: async (id, opt) => {
      conferir(opt); assert.equal(id, 271); assert.equal(opt.incluirLegados, true);
      if (consultarTitulos) return consultarTitulos(id, opt);
      return Array.from({ length: options.vinculos + options.alocacoesTitulo + options.fretesTitulo }, (_, i) => ({ titulo: { id: i + 1, status: 'ABERTO' } }));
    }, sincronizarPedidoFinanceiroAoFechar: async args => {
      conferir(args); estado.sincronizacoesFinanceiras++; // Nao cria/recalcula titulo.
    } }
  };
  const module = { exports: {} };
  vm.runInNewContext(source + '\nmodule.exports.__qa = { carregarSolicitacaoPedidos, sincronizarStatusSolicitacaoCompraPorSaldo };',
    { module, require(id) { assert(Object.hasOwn(deps, id), id); return deps[id]; } });
  async function transacao(fn) {
    const antes = structuredClone(estado);
    tx = { LOCK: { UPDATE: 'UPDATE_QA' } };
    try { const result = await fn(tx); tx.finished = 'commit'; return result; }
    catch (e) { Object.assign(estado, antes); tx.finished = 'rollback'; throw e; }
  }
  return { estado, options, consultas, models, service: module.exports, transacao, pedido };
}

async function validarServico() {
  const f = fixture();
  const reabrir = transaction => f.service.reabrirPedidoParaCotacao({ pedidoId: 271, usuarioId: 7, motivo: 'Ajustar negociacao', transaction });
  await f.transacao(reabrir);
  assert.equal(f.estado.pedido.status, 'ABERTO');
  assert.equal(f.estado.compra.status, 'FECHAMENTO_PARCIAL');
  assert.equal(f.estado.pedido.valor_total, 6745.65);
  assert.equal(f.estado.historicos.filter(h => h.acao === 'PEDIDO_COMPRA_REABERTO').length, 1);
  assert.match(f.estado.historicos[0].descricao, /Ajustar negociacao/);
  const logs = f.estado.logs.length, historicos = f.estado.historicos.length;
  await f.transacao(reabrir); // Retry nao duplica log/historico.
  assert.equal(f.estado.logs.length, logs); assert.equal(f.estado.historicos.length, historicos);
  const fechar = transaction => f.service.atualizarStatusPedido({ pedidoId: 271, status: 'FECHADO_FORNECEDOR', usuarioId: 7, transaction });
  f.options.entrega = false;
  await assert.rejects(f.transacao(fechar), /previsao de entrega/);
  assert.equal(f.estado.pedido.status, 'ABERTO');
  f.options.entrega = true;
  f.options.falhaHistorico = true;
  await assert.rejects(f.transacao(fechar), /QA_HISTORICO/);
  assert.equal(f.estado.pedido.status, 'ABERTO'); assert.equal(f.estado.sincronizacoesFinanceiras, 0);
  f.options.falhaHistorico = false;
  await f.transacao(fechar);
  assert.equal(f.estado.pedido.status, 'FECHADO_FORNECEDOR');
  assert.equal(f.estado.compra.status, 'ENCERRADO');
  assert.equal(f.estado.sincronizacoesFinanceiras, 1);
  const eventos = f.estado.historicos.length;
  await f.transacao(fechar);
  assert.equal(f.estado.historicos.length, eventos); assert.equal(f.estado.sincronizacoesFinanceiras, 1);
  for (const nome of ['vinculos', 'alocacoesTitulo', 'fretesTitulo']) {
    const g = fixture(); g.options[nome] = 1;
    await assert.rejects(g.transacao(transaction => g.service.reabrirPedidoParaCotacao({ pedidoId: 271, motivo: 'Teste', transaction })), /GEO/);
    assert.equal(g.estado.pedido.status, 'FECHADO_FORNECEDOR'); assert.equal(g.estado.historicos.length, 0);
  }
  const geo = fixture(); geo.options.vinculos = 1; geo.options.aprovacaoGeo = false;
  await assert.rejects(geo.transacao(transaction => geo.service.reabrirPedidoParaCotacao({ pedidoId: 271, motivo: 'Teste', aprovacaoGeoId: 8, transaction })), /GEO/);
  geo.options.aprovacaoGeo = true;
  await geo.transacao(transaction => geo.service.reabrirPedidoParaCotacao({ pedidoId: 271, motivo: 'Teste GEO', aprovacaoGeoId: 8, transaction }));
  assert.equal(geo.estado.pedido.status, 'ABERTO');
  for (const status of ['CANCELADO', 'FECHADO_FORNECEDOR']) {
    const g = fixture(); g.estado.pedido.status = status; g.options.falhaHistorico = true;
    await assert.rejects(g.transacao(transaction => g.service.reabrirPedidoParaCotacao({ pedidoId: 271, motivo: 'Teste', transaction })), status === 'CANCELADO' ? /cancelado/ : /QA_HISTORICO/);
    assert.equal(g.estado.pedido.status, status); assert.equal(g.estado.historicos.length, 0);
  }
  const g = fixture();
  await g.transacao(transaction => g.service.__qa.carregarSolicitacaoPedidos(295, transaction));
  await g.transacao(transaction => g.service.__qa.carregarSolicitacaoPedidos(295, transaction, { incluirPedidos: false }));
  await g.service.obterPedidoDetalhe(271);
  const planos = [...g.consultas];
  planos.push(...f.consultas.filter(x => x.opt.include));
  const lean = planos.find(x => x.opt.attributes && x.opt.include);
  assert(lean && !lean.opt.include.some(x => x.as === 'fornecedores' || x.as === 'obra'));
  assert.equal(lean.opt.include.find(x => x.as === 'pedidos').include, undefined);
  validarSql(planos, g.models);
}

function validarSql(planos, modelos) {
  const sequelize = new Sequelize('qa', 'qa', 'qa', { dialect: 'mysql', logging: false });
  // Modelos/associacoes registrados localmente, sem instanciar app/configuracao.
  const db = Object.fromEntries(Object.keys(modelos).map(name => [name,
    sequelize.define(name, { id: { type: DataTypes.INTEGER, primaryKey: true } }, { timestamps: false })]));
  const index = fs.readFileSync(path.join(raiz, 'src/models/index.js'), 'utf8');
  for (const m of index.matchAll(/db\.(\w+)\.(hasMany|belongsTo|hasOne)\(db\.(\w+),\s*\{([\s\S]*?)\}\);/g)) {
    const [, origem, tipo, alvo, campos] = m;
    if (!db[origem] || !db[alvo]) continue;
    const as = campos.match(/as:\s*'([^']+)'/)?.[1], foreignKey = campos.match(/foreignKey:\s*'([^']+)'/)?.[1];
    if (as && foreignKey) db[origem][tipo](db[alvo], { as, foreignKey, constraints: false });
  }
  function validar(model, opt) {
    const includes = (opt.include || []).map(copiar);
    function copiar(inc) { const out = { ...inc, model: db[inc.model.name] || inc.model };
      if (inc.include?.length) out.include = inc.include.map(copiar); else delete out.include;
      return out; }
    const options = { attributes: ['id'], include: includes, model };
    model._validateIncludedElements(options);
    for (const inc of includes) {
      if (inc.association.isMultiAssociation) assert.equal(inc.separate, true, `${model.name}.${inc.as} precisa separar colecao`);
      if (inc.include?.length) validar(inc.model, inc);
    }
    const sql = sequelize.dialect.queryGenerator.selectQuery(model.getTableName(), options, model);
    for (const inc of includes.filter(x => x.separate)) assert(!sql.includes(` AS \`${inc.as}\``), sql);
  }
  for (const p of planos) validar(db[p.model], p.opt);
  assert(sequelize.dialect.queryGenerator.selectQuery(db.PedidoCompra.getTableName(),
    { attributes: ['id'], where: { id: 271 }, lock: 'UPDATE' }, db.PedidoCompra).includes('FOR UPDATE'));
  // 32 itens x 3 fornecedores x 32 respostas x 26 alocacoes x 3 pedidos x 26 itens
  // passavam pelo mesmo JOIN. O plano novo separa todos, sem truncar colecoes.
  assert(32 * 3 * 32 * 26 * 3 * 26 > 6_000_000);
}

async function validarController() {
  for (const acao of ['reabrirCotacao', 'updateStatus']) {
    for (const modo of ['ok', 'leitura', 'escrita', 'permissao', 'escopo', 'commit-incerto']) {
      const estados = { commit: 0, rollback: 0, writes: 0 };
      const transaction = { async commit() { estados.commit++; this.finished = 'commit'; if (modo === 'commit-incerto') throw Error('QA_COMMIT_INCERTO'); },
        async rollback() { assert(!this.finished); estados.rollback++; this.finished = 'rollback'; } };
      const mutar = async () => { estados.writes++; if (modo === 'escrita') throw Error('QA_ESCRITA'); return { id: 271, status: 'ABERTO' }; };
      const deps = {
        '../observability/pedidoCompraOperacao': { iniciarOperacaoPedido: args =>
          require('../src/observability/pedidoCompraOperacao').iniciarOperacaoPedido({ ...args, logger() {} }) },
        '../models': { PedidoCompra: { sequelize: { transaction: async () => transaction } },
          User: { findByPk: async () => ({ id: 7 }) }, SolicitacaoCompra: {} },
        '../services/pedidoCompraService': { reabrirPedidoParaCotacao: mutar, atualizarStatusPedido: mutar,
          obterPedidoDetalhe: async () => { if (modo === 'leitura') throw Error('QA_LEITURA'); return { id: 271, status: 'ABERTO', itens: [] }; } },
        '../services/authorizationService': new Proxy({}, { get: (_, key) => key === 'getUserObraScopeIds' ? async () => [1]
          : key === 'getComprasVisibilityScope' ? async () => modo === 'escopo' ? 'NENHUM' : 'TODOS'
          : key === 'canViewComprasPedidos' || key === 'canManageComprasPedidos' ? async () => true
          : async () => modo !== 'permissao' }),
        '../services/comprasRealtimeService': { publishComprasRealtimeEventSafe: async () => null },
        '../utils/controllerError': { responderErroController: (res, e) => res.status(400).json({ error: e.message }) }
      };
      deps['../models'].PedidoCompra.findByPk = async () => ({ id: 271, solicitacao: { id: 295 } });
      const module = { exports: {} };
      vm.runInNewContext(controller, { module, console: { error() {} }, require(id) {
        if (deps[id]) return deps[id];
        assert(['../services/solicitacaoAtencaoService', '../services/pedidoCompraFreteService', '../services/pedidoCompraPdf',
          '../services/pedidoCompraPdfPuppeteer', '../services/fileAccessService', '../services/comprasDelegacaoService'].includes(id), id);
        return {};
      } });
      const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
      await module.exports[acao]({ user: { id: 7 }, params: { id: 271 }, body: { motivo: 'Ajustar negociacao', status: 'ABERTO' } }, res);
      if (modo === 'commit-incerto') {
        assert.equal(estados.commit, 1); assert.equal(estados.rollback, 0); assert.equal(res.code, 503);
      } else if (modo === 'ok' || modo === 'leitura') {
        assert.equal(estados.commit, 1); assert.equal(estados.rollback, 0);
        assert.equal(res.code, modo === 'ok' ? 200 : 202);
        if (modo === 'leitura') assert.equal(res.body.operacao_confirmada, true);
      } else {
        assert.equal(estados.commit, 0); assert.equal(estados.rollback, 1);
        assert.equal(res.code, modo === 'escrita' ? 400 : 403);
        if (modo !== 'escrita') assert.equal(estados.writes, 0);
      }
    }
  }
}

module.exports = { fixture };
if (require.main === module) (async () => {
  await validarServico(); await validarController();
  const { iniciarOperacaoPedido, classificarErro } = require('../src/observability/pedidoCompraOperacao');
  const logs = [];
  const obs = iniciarOperacaoPedido({ acao: 'REABRIR', pedidoId: 271, logger: linha => logs.push(linha) });
  obs.etapa('SINCRONIZAR_SALDOS');
  obs.falha({ name: 'SequelizeDatabaseError', original: { code: 'ER_LOCK_DEADLOCK', sql: 'SENHA_SQL' },
    message: 'SEGREDO_CNPJ_TOKEN', stack: 'SEGREDO_STACK', code: 'SEGREDO_CODE' });
  obs.finalizar();
  assert(logs.every(linha => !/SENHA|SEGREDO|sql|stack/.test(linha)));
  assert(logs.some(linha => linha.includes('ER_LOCK_DEADLOCK') && linha.includes('SINCRONIZAR_SALDOS')));
  assert(logs.every(linha => linha.includes(obs.id) && linha.includes('271') && linha.includes('heap_usado_mb')));
  const ruim = iniciarOperacaoPedido({ acao: 'STATUS', pedidoId: 271, logger() { throw Error('LOG_INDISPONIVEL'); } });
  assert.doesNotThrow(() => { ruim.etapa('COMMIT'); ruim.confirmar(); ruim.falha(Error('teste')); ruim.finalizar(); });
  assert.equal(classificarErro({ code: 'APROVACAO_GEO_INVALIDA' }), 'APROVACAO_GEO_INVALIDA');
  console.log('Pedido: reabertura/novo fechamento, GEO/entrega/ACL/escopo, historico/rollback/replay, lock UPDATE, leitura pos-commit202 e planos SQL MySQL sem produto cartesiano aprovados. Sem banco/rede.');
})().catch(error => { console.error(error); process.exitCode = 1; });
