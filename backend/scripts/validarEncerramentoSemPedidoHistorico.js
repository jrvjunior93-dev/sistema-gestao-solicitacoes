'use strict';
// Servico e metodo do controller reais, com modelos/transacao em memoria.
// Nao importa env/database/models reais, nao acessa banco ou rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Op, fn, col } = require('sequelize');
const { validateCompraEncerrarSemPedidoBody } = require('../src/validators/operationalValidators');
const raiz = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(raiz, 'src/services/pedidoCompraService.js'), 'utf8');
const controller = fs.readFileSync(path.join(raiz, 'src/controllers/SolicitacaoCompraController.js'), 'utf8');
const metodo = controller.slice(controller.indexOf('  async encerrarSemPedido(req, res) {'), controller.indexOf('  async pdf(req, res) {'));
const justificativa = '  Compra dispensada pela obra.\nMaterial remanejado: ação, "estoque" e <teste>.  ';

function fixture({ falhaHistorico = false, fonte = source } = {}) {
  const estado = { status: 'EM_COTACAO', encerrado_em: null, fechamentos: [], historicos: [], logs: [], fornecedores: [] };
  const compra = { id: 70, solicitacao_principal_id: 500, origem: 'SOLICITACAO_COMPRA',
    itens: [{ id: 1, quantidade: 10, insumo: { nome: 'Material' } }],
    itensManuais: [{ id: 2, quantidade: 2, nome_manual: 'Manual' }],
    alocacoes: [{ item_tipo: 'CADASTRADO', solicitacao_compra_item_id: 1, quantidade_alocada: 4, status: 'ATIVA' }],
    fornecedores: [{ id: 3, status: 'RESPONDIDO' }], pedidos: [{ id: 9, status: 'ABERTO' }, { id: 10, status: 'CANCELADO' }],
    get status() { return estado.status; },
    async update(dados, options) { conferir(options); Object.assign(estado, dados); },
    toJSON() { return { id: this.id, status: this.status }; } };
  let transaction;
  function conferir(options) { assert.equal(options?.transaction, transaction, 'Gravacoes usam a mesma transacao'); }
  const models = {
    SolicitacaoCompra: { findByPk: async (id, options) => { conferir(options); assert.equal(Number(id), 70); return compra; } },
    SolicitacaoCompraFechamento: {
      findOne: async options => { conferir(options); return options.where.idempotency_key
        ? estado.fechamentos.find(f => f.idempotency_key === options.where.idempotency_key) : estado.fechamentos.at(-1); },
      create: async (dados, options) => { conferir(options); const f = { id: 100, ...dados }; estado.fechamentos.push(f); return f; }
    },
    SolicitacaoCompraFornecedor: { update: async (dados, options) => { conferir(options); estado.fornecedores.push(dados); } },
    Historico: { create: async (dados, options) => { conferir(options); if (falhaHistorico) throw Error('QA_HISTORICO'); estado.historicos.push(dados); return dados; } }
  };
  const deps = {
    sequelize: { Op, fn, col }, '../models': models,
    './comprasCotacao': { registrarLogSolicitacaoCompra: async dados => { conferir(dados); const { transaction: tx, ...log } = dados; estado.logs.push(log); } },
    './pedidoCompraStatusConfig': {}, './pedidoCompraFreteService': {}, './comprasDelegacaoService': {},
    './setorCapabilityService': {}, './pedidoCompraTotaisService': {}, './comprasDisponibilidadeService': {}
  };
  const module = { exports: {} };
  vm.runInNewContext(fonte, { module, require(id) { assert(Object.hasOwn(deps, id), id); return deps[id]; } });
  const servico = module.exports.encerrarSaldoSolicitacaoCompraSemPedido;
  async function iniciar() {
    const antes = structuredClone(estado);
    transaction = { LOCK: { UPDATE: 'QA_UPDATE' }, finished: false,
      async commit() { this.finished = 'commit'; },
      async rollback() { Object.assign(estado, antes); this.finished = 'rollback'; } };
    return transaction;
  }
  const api = vm.runInNewContext(`({${metodo}})`, {
    console: { error() {} },
    SolicitacaoCompra: { ...models.SolicitacaoCompra, sequelize: { transaction: iniciar } },
    validarAcesso: async req => req.user,
    canEncerrarSemPedidoComprasCotacoes: async user => user.permitido,
    carregarSolicitacaoCompra: async () => compra,
    isSolicitacaoCompraDireta: () => false, isCompraAguardandoDiretoria: () => false,
    podeAcompanharCompraAntesLiberacao: async () => true,
    validarEscopoSolicitacaoCompra: async (user, solicitacao, res) => { if (user.escopo === false) { res.status(403).json({ error: 'Escopo negado' }); return false; } return true; },
    encerrarSaldoSolicitacaoCompraSemPedido: servico
  });
  return { estado, compra, async chamar({ motivo = justificativa, key = 'QA-SEM-PEDIDO', permitido = true, escopo = true } = {}) {
    const res = { statusCode: 200, headers: {}, status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; }, setHeader(k, v) { this.headers[k] = v; } };
    await api.encerrarSemPedido({ params: { id: 70 }, user: { id: 7, permitido, escopo }, body: { justificativa: motivo }, get: () => key }, res);
    return { res, transaction };
  } };
}

(async () => {
  const marcador = 'descricao: fechamento.justificativa,';
  assert(source.includes(marcador));
  const antigo = fixture({ fonte: source.replace(marcador,
    'descricao: `Cotacao encerrada sem gerar novos pedidos. Saldo nao comprado: ${saldoTotal}.`,') });
  const prova = await antigo.chamar();
  assert.equal(prova.res.statusCode, 200);
  assert.equal(JSON.parse(antigo.estado.historicos[0].metadata).justificativa, justificativa.trim());
  assert(!antigo.estado.historicos[0].descricao.includes(justificativa.trim()), 'Reproduz o motivo salvo apenas em metadados, invisivel no texto');
  for (const motivo of [justificativa, 'ã'.repeat(2000)]) {
    const validado = validateCompraEncerrarSemPedidoBody({ confirmado: true, justificativa: motivo });
    const f = fixture();
    const pedidosAntes = JSON.stringify(f.compra.pedidos);
    const { res, transaction } = await f.chamar({ motivo: validado.justificativa });
    assert.equal(res.statusCode, 200); assert.equal(transaction.finished, 'commit');
    assert.equal(f.estado.status, 'ENCERRADO');
    assert.equal(f.estado.historicos.length, 1); assert.equal(f.estado.logs.length, 1);
    const h = f.estado.historicos[0], meta = JSON.parse(h.metadata);
    assert.equal(h.acao, 'COTACAO_ENCERRADA_SEM_PEDIDO');
    assert.equal(h.solicitacao_id, 500); assert.equal(h.usuario_responsavel_id, 7); assert.equal(h.setor, 'COMPRAS');
    assert.equal(h.status_anterior, 'EM_COTACAO'); assert.equal(h.status_novo, 'ENCERRADO');
    assert.equal(h.descricao, validado.justificativa, 'Texto do evento mostra exclusivamente o motivo informado');
    assert.equal(h.observacao, h.descricao); assert.equal(meta.justificativa, validado.justificativa);
    assert.equal(meta.quantidade_nao_comprada, 8); assert.equal(meta.pedidos_preservados, 1);
    assert.equal(f.estado.fechamentos[0].justificativa, validado.justificativa);
    assert.equal(f.estado.logs[0].metadados.justificativa, validado.justificativa);
    assert.equal(JSON.stringify(f.compra.pedidos), pedidosAntes, 'Pedidos existentes intactos');
    const replay = await f.chamar({ motivo: validado.justificativa });
    assert.equal(replay.res.headers['X-Idempotent-Replay'], 'true');
    assert.equal(f.estado.historicos.length, 1); assert.equal(f.estado.fechamentos.length, 1); assert.equal(f.estado.logs.length, 1);
    const outraChave = await f.chamar({ key: 'QA-OUTRA-CHAVE' });
    assert.equal(outraChave.res.statusCode, 409); assert.equal(f.estado.historicos.length, 1);
  }
  for (const acesso of [{ permitido: false }, { escopo: false }]) {
    const f = fixture(), { res, transaction } = await f.chamar(acesso);
    assert.equal(res.statusCode, 403); assert.equal(transaction.finished, 'rollback');
    assert.equal(f.estado.status, 'EM_COTACAO'); assert.equal(f.estado.historicos.length, 0); assert.equal(f.estado.fechamentos.length, 0);
  }
  const falha = fixture({ falhaHistorico: true });
  const resultado = await falha.chamar();
  assert.equal(resultado.res.statusCode, 400); assert.equal(resultado.transaction.finished, 'rollback');
  assert.equal(falha.estado.status, 'EM_COTACAO');
  for (const lista of ['historicos', 'fechamentos', 'logs', 'fornecedores']) assert.equal(falha.estado[lista].length, 0);
  for (const body of [{ confirmado: false, justificativa }, { confirmado: true, justificativa: 'Curto' },
    { confirmado: true, justificativa: 'a'.repeat(2001) }]) assert.throws(() => validateCompraEncerrarSemPedidoBody(body));
  const routes = fs.readFileSync(path.join(raiz, 'src/routes.js'), 'utf8');
  assert(routes.includes("requireEnabledModule('COTACOES'), allowComprasCotacoesEncerrarSemPedido, criticalRateLimit, validateRequest({ params: validateNumericIdParam('id', 'Solicitacao de compra'), body: validateCompraEncerrarSemPedidoBody }), requireCompraAccess, SolicitacaoCompraController.encerrarSemPedido"));
  const timeline = fs.readFileSync(path.join(raiz, '../frontend/src/pages/SolicitacaoDetalhe/Timeline.jsx'), 'utf8');
  assert(timeline.includes('{h.descricao}</p>'), 'Texto persistido aparece no historico existente como texto React');
  console.log('Encerramento sem pedido: motivo visivel no historico, autor/status/metadados, acentos/multilinha/2000 caracteres, pedidos/saldos preservados, replay sem duplicacao, ACL/escopo e rollback de auditoria aprovados. Sem banco/rede.');
})().catch(error => { console.error(error); process.exitCode = 1; });
