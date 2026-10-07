'use strict';

// Executa os servicos reais com modelos em memoria. Nao carrega .env,
// Sequelize, conexao de banco, S3, Redis ou clientes externos.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const Op = { in: '$in', notIn: '$notIn', gt: '$gt' };
const PREPARE = 'financeiro.autorizacoes_pagamento.preparar';
const QUEUE = 'financeiro.fila_pagamentos.preparar';
const user = { id: 2, grants: [PREPARE, QUEUE] };
const req = { user, headers: {}, ip: '127.0.0.1' };
let state, scope = null, auditFails = false;
const env = { paymentOwnerApprovalMode: 'PILOT', paymentOwnerApprovalTtlHours: 24 };
const models = {};
const names = ['ConfiguracaoSistema', 'TituloFinanceiro', 'Solicitacao', 'Historico', 'StatusArea', 'SecurityEventLog',
  'PagamentoManualFilaItem', 'PagamentoAutorizacaoItem', 'PagamentoAutorizacaoLote', 'PagamentoAutorizacaoEvento',
  'Anexo', 'PagamentoAutorizador', 'WebauthnCredential', 'PaymentIntent'];
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => value && typeof value === 'object' && !(value instanceof Date)
    ? Object.entries(value).every(([op, candidate]) => op === '$in' ? candidate.includes(row[key])
      : op === '$notIn' ? !candidate.includes(row[key]) : op === '$gt' ? new Date(row[key]) > candidate : false)
    : row[key] === value);
}
function instance(row) {
  return { ...row, async update(values, options) {
    assert(options.transaction, 'Toda mutacao critica usa transacao');
    Object.assign(row, values); Object.assign(this, values); return this;
  } };
}
for (const name of names) models[name] = {
  async findAll(options = {}) { return state[name].filter((row) => matches(row, options.where)).map(instance); },
  async findOne(options) { return (await this.findAll(options))[0] || null; },
  async findByPk(id) { const row = state[name].find((item) => item.id === Number(id)); return row ? instance(row) : null; },
  async count(options) { return (await this.findAll(options)).length; },
  async create(values, options) {
    assert(options.transaction, `${name} sem transacao`);
    if (name === 'SecurityEventLog' && auditFails) throw new Error('Auditoria indisponivel');
    const row = { id: state[name].length + 1, ...values }; state[name].push(row); return instance(row);
  },
  async update(values, options) {
    assert(options.transaction); state[name].filter((row) => matches(row, options.where)).forEach((row) => Object.assign(row, values));
  }
};
models.sequelize = { async transaction(callback) {
  const before = structuredClone(state);
  try { return await callback({ LOCK: { UPDATE: 'UPDATE' } }); }
  catch (error) { state = before; throw error; }
} };
const services = new Map();
const stubs = {
  sequelize: { Op }, '../models': models, '../config/env': { env }, crypto,
  './authorizationService': { getFinanceiroObraScopeIds: async () => scope,
    userHasNominalAreaPermission: async (actor, keys) => keys.every((key) => actor.grants.includes(key)) },
  './tituloFinanceiroService': {}, './tituloBloqueioRetornoObraService': { assertTituloDisponivelParaBaixa(title) {
    if (title.bloqueio_retorno_obra) throw Object.assign(new Error('Retorno pendente'), { statusCode: 409 });
  } }, './s3': {}, './fileAccessService': {},
  './securityLogService': { registrarEventoSeguranca: async () => {}, getRequestIp: () => req.ip },
  './webauthnChallengeStore': {},
  './webPushService': { isConfigured: () => false, hasActiveSubscription: async () => false, sendPendingAuthorizationNotification: async () => {} },
  './setorCapabilityService': { findSetorByCapability: async () => ({}), resolveSetorPersistenciaValue: (_, fallback) => fallback }
};
function load(name) {
  if (services.has(name)) return services.get(name);
  const sandbox = { module: { exports: {} }, console, Date, Buffer, Uint8Array, require(dependency) {
    if (Object.hasOwn(stubs, dependency)) return stubs[dependency];
    if (dependency.startsWith('./')) return load(dependency.slice(2));
    throw new Error(`Dependencia nao simulada: ${dependency}`);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'src/services', `${name}.js`), 'utf8'), sandbox, { filename: name });
  services.set(name, sandbox.module.exports); return sandbox.module.exports;
}
const analysis = load('analiseProprietarioService');
const internal = load('statusInternoContasPagarService');
const queue = load('pagamentoManualFilaService');
const digital = load('pagamentoAutorizacaoService');
const policy = load('paymentOwnerApprovalPolicy');
const { validateManualPaymentQueueCreateBody } = require('../src/validators/paymentValidators');
const analysisStatus = analysis.STATUS_ANALISE_PROPRIETARIO;
function reset() {
  state = Object.fromEntries(names.map((name) => [name, []])); scope = null; auditFails = false; env.paymentOwnerApprovalMode = 'PILOT';
  state.TituloFinanceiro = [
    { id: 1, codigo: 'TIT-1', tipo: 'PAGAR', status: 'ABERTO', obra_id: 7, valor_saldo: 100, solicitacao_id: 6 },
    { id: 2, codigo: 'TIT-2', tipo: 'PAGAR', status: 'PARCIAL', obra_id: 7, valor_saldo: 50, solicitacao_id: 6 },
    { id: 3, codigo: 'TIT-3', tipo: 'PAGAR', status: 'ABERTO', obra_id: 8, valor_saldo: 20, solicitacao_id: null }
  ];
  state.Solicitacao = [{ id: 6, status_global: 'TITULO_CADASTRADO', area_responsavel: 'GEO' }];
}
const send = (actor = user, key = 'direct-1') => queue.enfileirarTitulos({ ...req, user: actor }, {
  titulo_ids: [1, 2], idempotency_key: key
});

(async () => {
  assert.equal(validateManualPaymentQueueCreateBody({ titulo_ids: [1] }).titulo_ids[0], 1);
  assert.throws(() => validateManualPaymentQueueCreateBody({ titulo_ids: [1], directQueuePermission: true }), { statusCode: 400 });
  assert.throws(() => validateManualPaymentQueueCreateBody({ titulo_ids: [1], autorizacaoInterna: true }), { statusCode: 400 });
  reset(); const options = await internal.listarStatusInternosPagar();
  assert(options.includes(analysisStatus)); assert.equal(state.ConfiguracaoSistema.length, 0, 'Opcao nativa sem seed');
  await assert.rejects(internal.criarStatusInternoPagar('em analise do proprietario'), { statusCode: 409 });
  await internal.atribuirStatusInternoPagar(user, [1, 2, 3], analysisStatus);
  assert.equal(state.TituloFinanceiro[0].status, 'ABERTO'); assert.equal(state.TituloFinanceiro[1].status, 'PARCIAL');
  assert.equal(state.TituloFinanceiro[2].status_interno_pagar, analysisStatus, 'Titulo avulso tambem recebe status');
  assert.equal(state.Solicitacao[0].status_global, analysisStatus); assert.equal(state.Solicitacao[0].area_responsavel, 'GEO');
  assert.equal(state.Historico.length, 1); assert.equal(state.StatusArea.length, 1); assert.equal(state.SecurityEventLog.length, 1);
  await internal.atribuirStatusInternoPagar(user, [1, 2, 3], analysisStatus);
  assert.equal(state.Historico.length, 1, 'Marcacao repetida nao duplica historico');
  state.Solicitacao[0].status_global = 'TITULO_CADASTRADO';
  await internal.atribuirStatusInternoPagar(user, [1, 2], analysisStatus);
  assert.equal(state.Solicitacao[0].status_global, analysisStatus, 'Reaplicar corrige uma solicitacao anteriormente dessincronizada');
  reset(); scope = [7]; await assert.rejects(internal.atribuirStatusInternoPagar(user, [1, 3], analysisStatus), { statusCode: 400 });
  assert.equal(state.SecurityEventLog.length, 0);
  reset(); state.TituloFinanceiro[1].status = 'QUITADO'; await assert.rejects(internal.atribuirStatusInternoPagar(user, [1, 2], analysisStatus), { statusCode: 409 });
  assert.equal(state.TituloFinanceiro[0].status_interno_pagar, undefined);
  reset(); state.PagamentoManualFilaItem.push({ titulo_financeiro_id: 1, status: 'PENDENTE' });
  await assert.rejects(internal.atribuirStatusInternoPagar(user, [1], analysisStatus), { statusCode: 409 });
  reset(); auditFails = true; await assert.rejects(internal.atribuirStatusInternoPagar(user, [1], analysisStatus), /Auditoria/);
  assert.equal(state.Historico.length, 0); assert.equal(state.Solicitacao[0].status_global, 'TITULO_CADASTRADO');
  reset(); state.Solicitacao[0].status_global = 'CANCELADA'; await internal.atribuirStatusInternoPagar(user, [1], analysisStatus);
  assert.equal(state.Solicitacao[0].status_global, 'CANCELADA');

  reset(); const lot = await digital.createBatch(req, { titulo_ids: [1, 2], idempotency_key: 'digital-1' });
  assert(lot.id); assert.equal(state.Solicitacao[0].status_global, analysisStatus); assert.equal(state.PagamentoAutorizacaoItem.length, 2);
  await digital.createBatch(req, { titulo_ids: [1, 2], idempotency_key: 'digital-1' });
  assert.equal(state.PagamentoAutorizacaoLote.length, 1); assert.equal(state.Historico.length, 1);
  await assert.rejects(send(), { statusCode: 409 }); assert.equal(state.PagamentoManualFilaItem.length, 0);
  reset(); scope = [8]; await assert.rejects(digital.createBatch(req, { titulo_ids: [1] }), { statusCode: 403 });
  assert.equal(state.PagamentoAutorizacaoLote.length, 0);
  reset(); await digital.createBatch({ ...req, user: { id: 4, grants: [PREPARE] } }, { titulo_ids: [1] });
  assert.equal(state.PagamentoAutorizacaoLote.length, 1, 'Preparacao digital nao exige permissao da fila');
  reset(); auditFails = true; await assert.rejects(digital.createBatch(req, { titulo_ids: [1] }), /Auditoria/);
  assert.equal(state.PagamentoAutorizacaoLote.length, 0); assert.equal(state.PagamentoAutorizacaoItem.length, 0);
  for (const resultado of ['REJEITADO', 'INVALIDADO']) {
    reset(); await internal.atribuirStatusInternoPagar(user, [1], analysisStatus);
    await models.sequelize.transaction((transaction) => analysis.registrarAnaliseRecusada({ tituloId: 1, usuarioId: 31,
      motivo: 'Documento precisa ser corrigido.', resultado, transaction }));
    assert.equal(state.TituloFinanceiro[0].status_interno_pagar, 'AGUARDANDO AJUSTE DE PAGAMENTO');
    assert.equal(state.TituloFinanceiro[0].status, 'ABERTO');
    assert.equal(state.Solicitacao[0].status_global, 'AGUARDANDO AJUSTE'); assert.equal(state.Solicitacao[0].area_responsavel, 'GEO');
    const count = state.Historico.length;
    await models.sequelize.transaction((transaction) => analysis.registrarAnaliseRecusada({ tituloId: 1, usuarioId: 31,
      motivo: 'Documento precisa ser corrigido.', resultado, transaction }));
    assert.equal(state.Historico.length, count);
  }

  for (const mode of ['OFF', 'PILOT', 'ENFORCED', 'PAUSED']) {
    reset(); env.paymentOwnerApprovalMode = mode;
    await internal.atribuirStatusInternoPagar(user, [1, 2], analysisStatus);
    const result = await send(); assert.equal(result.quantidade, 2);
    assert.equal(state.Solicitacao[0].area_responsavel, 'FINANCEIRO'); assert.equal(state.Solicitacao[0].status_global, 'ENVIADO PARA PAGAMENTO');
    assert.equal(state.TituloFinanceiro[0].status_interno_pagar, 'ENVIADO PARA PAGAMENTO'); assert.equal(state.TituloFinanceiro[0].status, 'ABERTO');
    const audit = state.SecurityEventLog.find((event) => event.tipo_evento === 'MANUAL_PAYMENT_QUEUE_PREPARED');
    assert.equal(audit.usuario_id, 2); assert.equal(audit.metadata.modo, mode); assert.equal(audit.metadata.titulos[0].saldo, 100);
    assert.equal(audit.metadata.origem, 'ENVIO_DIRETO');
    await send(); assert.equal(state.PagamentoManualFilaItem.length, 2); assert.equal(state.SecurityEventLog.length, 2);
    await assert.rejects(send(user, 'direct-nova'), { statusCode: 409 });
    for (const grants of [[PREPARE], []]) {
      await assert.rejects(send({ id: 3, grants }), { statusCode: 403 });
    }
    reset(); env.paymentOwnerApprovalMode = mode;
    const onlyQueue = { id: 3, grants: [QUEUE] };
    await send(onlyQueue);
    assert.equal(state.PagamentoManualFilaItem.length, 2, 'Somente permissao da fila basta em qualquer modo');
    await assert.rejects(digital.createBatch({ ...req, user: onlyQueue }, { titulo_ids: [3] }));
  }
  reset(); auditFails = true; await assert.rejects(send(), /Auditoria/);
  assert.equal(state.PagamentoManualFilaItem.length, 0); assert.equal(state.Historico.length, 0);
  reset(); scope = [8]; await assert.rejects(send(), { statusCode: 403 }); assert.equal(state.PagamentoManualFilaItem.length, 0);
  reset(); state.TituloFinanceiro[0].bloqueio_retorno_obra = true; await assert.rejects(send(), { statusCode: 409 });
  reset(); env.paymentOwnerApprovalMode = 'ENFORCED';
  await assert.rejects(queue.enfileirarTitulos({ ...req, user: { id: 3, grants: [PREPARE] } }, { titulo_ids: [1] }), { statusCode: 403 });
  for (const mode of ['OFF', 'PILOT', 'ENFORCED', 'PAUSED']) {
    assert.equal(policy.resolvePaymentQueueGate({ mode, pilotParticipant: true, directQueuePermission: true }), 'MANUAL_QUEUE_ALLOWED');
  }
  assert.equal(policy.resolvePaymentQueueGate({ mode: 'PILOT', pilotParticipant: true }), 'AUTHORIZATION_REQUIRED');
  console.log('OK: analise manual/digital, setor preservado, titulo avulso, fila em quatro modos, permissoes independentes, escopo, auditoria atomica e idempotencia. Sem banco ou rede.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
