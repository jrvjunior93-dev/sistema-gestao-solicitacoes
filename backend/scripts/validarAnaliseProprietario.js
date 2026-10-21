'use strict';

// Executa os servicos reais com modelos em memoria. Nao carrega .env,
// Sequelize, conexao de banco, S3, Redis ou clientes externos.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const Op = { in: '$in', notIn: '$notIn', gt: '$gt', and: '$and' };
const PREPARE = 'financeiro.autorizacoes_pagamento.preparar';
const QUEUE = 'financeiro.fila_pagamentos.preparar';
const DECIDE = 'financeiro.autorizacoes_pagamento.decidir';
const user = { id: 2, grants: [PREPARE, QUEUE] };
const req = { user, headers: {}, ip: '127.0.0.1' };
let state, scope = null, auditFails = false, eventFails = false, serial = false, challenge = null, pushFails = false, pushes = 0, avisosAtivos = true;
let transactionTail = Promise.resolve();
const locks = [];
const selectionChallenges = new Map();
const webauthnMetrics = { generate: 0, verify: 0, invalid: false };
const env = { paymentOwnerApprovalMode: 'PILOT', paymentOwnerApprovalTtlHours: 24, webauthnRpId: 'qa.invalid', webauthnOrigins: ['https://qa.invalid'] };
const models = {};
const names = ['ConfiguracaoSistema', 'TituloFinanceiro', 'Solicitacao', 'Historico', 'StatusArea', 'SecurityEventLog',
  'PagamentoManualFilaItem', 'PagamentoAutorizacaoItem', 'PagamentoAutorizacaoLote', 'PagamentoAutorizacaoEvento',
  'TituloCompartilhadoOrigem',
  'Anexo', 'PagamentoAutorizacaoDocumento', 'PagamentoAutorizador', 'WebauthnCredential', 'PaymentIntent',
  'FormaPagamentoFinanceira', 'CartaoFinanceiro', 'ChequeTerceiro', 'ContaBancaria', 'ContratoParcela', 'Contrato',
  'ContratoMedicao', 'MedicaoParcela', 'TituloRenegociacaoAlocacao', 'User', 'Notificacao', 'NotificacaoDestinatario'];
function matches(row, where = {}) {
  if (where.val?.includes('pagamento_autorizacao_itens nova')) return !state.PagamentoAutorizacaoItem.some(i => i.titulo_financeiro_id === row.titulo_financeiro_id && i.id > row.id);
  if (where.val?.includes('pagamentos_manuais_fila ativa')) return !state.PagamentoManualFilaItem.some(i => i.titulo_financeiro_id === row.titulo_financeiro_id && ['PENDENTE','NAO_PAGO','DIVERGENTE','EM_EDICAO'].includes(i.status));
  if (where.$and && !where.$and.every(w => matches(row, w))) return false;
  where = Object.fromEntries(Object.entries(where).filter(([k]) => k !== '$and'));
  return Object.entries(where).every(([key, value]) => value && typeof value === 'object' && !(value instanceof Date)
    ? Object.entries(value).every(([op, candidate]) => op === '$in' ? candidate.includes(row[key])
      : op === '$notIn' ? !candidate.includes(row[key]) : op === '$gt' ? new Date(row[key]) > candidate : false)
    : row[key] === value);
}
function instance(row) {
  return { ...row, toJSON() { return { ...row }; }, async update(values, options) {
    assert(options.transaction, 'Toda mutacao critica usa transacao');
    Object.assign(row, values); Object.assign(this, values); return this;
  } };
}
for (const name of names) models[name] = {
  async findAll(options = {}) {
    if (options.lock) locks.push(name);
    const rows = state[name].filter((row) => matches(row, options.where));
    if (options.order) rows.sort((a, b) => {
      for (const [field, direction] of options.order) {
        const delta = a[field] === b[field] ? 0 : (a[field] < b[field] ? -1 : 1);
        if (delta) return direction === 'DESC' ? -delta : delta;
      }
      return 0;
    });
    return rows.map(row => name === 'ContratoParcela' && options.include
      ? { ...instance(row), contrato: state.Contrato.find(c => c.id === row.contrato_id) }
      : instance(row));
  },
  async findOne(options) { return (await this.findAll(options))[0] || null; },
  async findByPk(id, options = {}) {
    if (options.lock) locks.push(name);
    const row = state[name].find((item) => item.id === Number(id)); return row ? instance(row) : null;
  },
  async count(options) { return (await this.findAll(options)).length; },
  async create(values, options) {
    assert(options.transaction, `${name} sem transacao`);
    if (name === 'SecurityEventLog' && auditFails) throw new Error('Auditoria indisponivel');
    if (name === 'PagamentoAutorizacaoEvento' && eventFails) throw new Error('Evento indisponivel');
    const row = { id: state[name].length + 1, ...values }; state[name].push(row); return instance(row);
  },
  async update(values, options) {
    assert(options.transaction); state[name].filter((row) => matches(row, options.where)).forEach((row) => Object.assign(row, values));
  }
};
models.sequelize = { async transaction(callback) {
  let liberar;
  if (serial) {
    const anterior = transactionTail;
    transactionTail = new Promise(resolve => { liberar = resolve; });
    await anterior;
  }
  const before = structuredClone(state), afterCommit = [];
  let result;
  try { result = await callback({ LOCK: { UPDATE: 'UPDATE' }, afterCommit: fn => afterCommit.push(fn) }); }
  catch (error) { state = before; throw error; }
  finally { liberar?.(); }
  for (const fn of afterCommit) await fn();
  return result;
} };
const services = new Map();
const stubs = {
  './pagamentoAutorizacaoSituacao': { projetarLotesAtuais: async lotes => lotes.map(l =>
    require('../src/services/pagamentoAutorizacaoSituacao').projetarLote({ ...l.toJSON(),
      itens: state.PagamentoAutorizacaoItem.filter(i => Number(i.lote_id) === Number(l.id))
        .map(i => ({ ...i, titulo: state.TituloFinanceiro.find(t => t.id === i.titulo_financeiro_id) })) })) },
  '../utils/fileName': require('../src/utils/fileName'),
  sequelize: { Op, literal: val => ({ val }) }, '../models': models, '../config/env': { env }, crypto,
  './authorizationService': { getFinanceiroObraScopeIds: async () => scope,
    userHasNominalAreaPermission: async (actor, keys) => keys.every((key) => actor.grants.includes(key)) },
  './tituloFinanceiroService': {}, './tituloBloqueioRetornoObraService': { assertTituloDisponivelParaBaixa(title) {
    require('../src/services/tituloBloqueioRetornoObraPolicy').assertTituloDisponivelParaBaixa(title);
    if (title.bloqueio_retorno_obra) throw Object.assign(new Error('Retorno pendente'), { statusCode: 409 });
  } }, './s3': { copyStorageObject: async (source, prefix) => `${prefix}/qa-copia-${source}` }, './fileAccessService': {},
  './faturaCartaoFinanceiroService': {},
  './securityLogService': { registrarEventoSeguranca: async () => {}, getRequestIp: () => req.ip },
  './webauthnChallengeStore': {
    saveChallenge: async (ctx, value) => { if (ctx.purpose === 'authorize-selection') selectionChallenges.set(JSON.stringify(ctx), value); else challenge = value; },
    consumeChallenge: async () => { const value = challenge; challenge = null; return value; },
    consumeChallengeAtomic: async ctx => { const key = JSON.stringify(ctx), value = selectionChallenges.get(key);selectionChallenges.delete(key);return value; }
  },
  './webPushService': { isConfigured: () => false, hasActiveSubscription: async () => false, sendPendingAuthorizationNotification: async () => {},
    sendQueueRetryNotification: async () => { pushes++; if (pushFails) throw Error('Provedor indisponivel QA'); } },
  './notificacoes': { async criarNotificacaoDireta(dados) {
    if (!avisosAtivos) return null;
    assert.equal(dados.created_by, null, 'Nao suprimir o alerta do proprio proprietario');
    assert.equal(dados.tipo, 'PAGAMENTO_AUTORIZADO_ENVIO_PENDENTE');
    const row = await models.Notificacao.create({ mensagem: dados.mensagem, metadata: dados.metadata }, { transaction: dados.transaction });
    for (const id of dados.destinatarios) await models.NotificacaoDestinatario.create({ notificacao_id: row.id, usuario_id: id }, { transaction: dados.transaction });
    return row;
  } },
  './setorCapabilityService': { findSetorByCapability: async () => ({}), resolveSetorPersistenciaValue: (_, fallback) => fallback }
};
function load(name) {
  if (services.has(name)) return services.get(name);
  const sandbox = { module: { exports: {} }, console, Date, Buffer, Uint8Array, structuredClone,
    __webauthn: {
      generateAuthenticationOptions: async () => { webauthnMetrics.generate++; return { challenge: 'qa' }; },
      verifyAuthenticationResponse: async () => { webauthnMetrics.verify++; return { verified: !webauthnMetrics.invalid, authenticationInfo: { newCounter: 1 } }; }
    },
    require(dependency) {
    if (Object.hasOwn(stubs, dependency)) return stubs[dependency];
    if (dependency.startsWith('./')) return load(dependency.slice(2));
    throw new Error(`Dependencia nao simulada: ${dependency}`);
  } };
  let source = fs.readFileSync(path.join(root, 'src/services', `${name}.js`), 'utf8');
  // Somente transporte/verificador biometrico simulado; regras da decisao sao reais.
  if (name === 'pagamentoAutorizacaoService') {
    assert(source.includes("return import('@simplewebauthn/server');"));
    source = source.replace("return import('@simplewebauthn/server');", 'return __webauthn;');
  }
  vm.runInNewContext(source, sandbox, { filename: name });
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
  state = Object.fromEntries(names.map((name) => [name, []])); scope = null; auditFails = false; eventFails = false;
  serial = false; challenge = null; pushFails = false; pushes = 0; avisosAtivos = true; locks.length = 0; env.paymentOwnerApprovalMode = 'PILOT';
  selectionChallenges.clear();
  Object.assign(webauthnMetrics, { generate: 0, verify: 0, invalid: false });
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
function contratoComDuasMedicoes(aprovada = true) {
  reset();
  state.Contrato = [{ id: 1, fluxo_novo: true, obra_id: 7, solicitacao_id: 6 }];
  state.ContratoMedicao = [1, 2].map(id => ({ id, numero: id, contrato_id: 1,
    aprovada_em: id === 1 || aprovada ? '2026-10-01' : null }));
  state.ContratoParcela = [1, 2].map(id => ({ id, contrato_id: 1, titulo_financeiro_id: id }));
  state.MedicaoParcela = [1, 2].map(id => ({ id, medicao_id: id, contrato_parcela_id: id, devolvido_em: null }));
  state.Solicitacao[0].status_global = aprovada ? 'LIBERADO' : 'NEC. DE MEDICAO';
}
async function testarMedicoesIndependentes() {
  for (const aprovada of [false, true]) {
    contratoComDuasMedicoes(aprovada);
    const statusInicial = state.Solicitacao[0].status_global;
    await internal.atribuirStatusInternoPagar(user, [1], analysisStatus);
    assert.equal(state.TituloFinanceiro[0].status_interno_pagar, analysisStatus);
    assert.equal(state.Solicitacao[0].status_global, statusInicial, 'Analise antiga nao domina M2.');
    await queue.enfileirarTitulos(req, { titulo_ids: [1], idempotency_key: `old-${aprovada}` });
    assert.equal(state.PagamentoManualFilaItem.length, 1);
    assert.equal(state.Solicitacao[0].status_global, statusInicial);
    assert.equal(state.Solicitacao[0].area_responsavel, 'GEO');
    assert(state.Historico.some(h => h.setor === 'FINANCEIRO' && JSON.parse(h.metadata || '{}').fluxo_atual_preservado));
    const quantidadeHistorico = state.Historico.length;
    await queue.enfileirarTitulos(req, { titulo_ids: [1], idempotency_key: `old-retry-${aprovada}` });
    assert.equal(state.Historico.length, quantidadeHistorico, 'Retry nao repete registro financeiro antigo.');
  }
  contratoComDuasMedicoes();
  await internal.atribuirStatusInternoPagar(user, [1, 2], analysisStatus);
  assert.equal(state.Solicitacao[0].status_global, analysisStatus);
  await models.sequelize.transaction(transaction => analysis.registrarAnaliseRecusada({ tituloId: 1,
    usuarioId: 31, motivo: 'Corrigir M1.', resultado: 'REJEITADO', transaction }));
  assert.equal(state.TituloFinanceiro[0].status_interno_pagar, 'AGUARDANDO AJUSTE DE PAGAMENTO');
  assert.equal(state.Solicitacao[0].status_global, analysisStatus, 'Rejeicao antiga nao recusa M2.');
  assert(state.Historico.some(h => h.acao === 'AUTORIZACAO_PAGAMENTO_REJEITADA' && h.observacao.includes('Corrigir M1.')),
    'Motivo da medicao antiga nao se perde mesmo sem mudar o fluxo atual');
  await models.sequelize.transaction(transaction => analysis.registrarAnaliseRecusada({ tituloId: 2,
    usuarioId: 31, motivo: 'Corrigir M2.', resultado: 'REJEITADO', transaction }));
  assert.equal(state.Solicitacao[0].status_global, 'AGUARDANDO AJUSTE');
  contratoComDuasMedicoes();
  await send();
  assert.equal(state.PagamentoManualFilaItem.length, 2, 'Lote misto envia as duas medicoes sem duplicar.');
  assert.equal(state.Solicitacao[0].status_global, 'ENVIADO PARA PAGAMENTO');
  assert.equal(state.Solicitacao[0].area_responsavel, 'OBRA');

  contratoComDuasMedicoes(false);
  const lote = await digital.createBatch(req, { titulo_ids: [1], idempotency_key: 'digital-old-measurement' });
  assert.equal(state.Solicitacao[0].status_global, 'NEC. DE MEDICAO');
  state.PagamentoAutorizacaoItem[0].status = 'AUTORIZADO'; state.PagamentoAutorizacaoLote[0].status = 'AUTORIZADO';
  await digital.enqueueAuthorizedItems(req, lote.id);
  assert.equal(state.PagamentoAutorizacaoItem[0].status, 'ENFILEIRADO');
  assert.equal(state.Solicitacao[0].status_global, 'NEC. DE MEDICAO');
  assert.equal(state.Solicitacao[0].area_responsavel, 'GEO');
  await digital.enqueueAuthorizedItems(req, lote.id);
  assert.equal(state.PagamentoManualFilaItem.length, 1, 'Reprocessar antigo nao exige outra autorizacao nem duplica fila.');
}

(async () => {
  await testarMedicoesIndependentes();
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

  // Contrato legado: fallback somente de leitura, com aprovacao/fila reais.
  reset();
  state.TituloFinanceiro[0].solicitacao_id = null;
  state.Solicitacao[0].obra_id = 7;
  state.Contrato = [{ id: 1, fluxo_novo: true, obra_id: 7, solicitacao_id: 6 }];
  state.ContratoParcela = [{ id: 1, contrato_id: 1, titulo_financeiro_id: 1 }];
  await internal.atribuirStatusInternoPagar(user, [1], analysisStatus);
  assert.equal(state.Solicitacao[0].status_global, analysisStatus);
  assert.equal(state.TituloFinanceiro[0].solicitacao_id, null, 'Operacao nao faz backfill automatico');
  const filasAntes = state.PagamentoManualFilaItem.length;
  await queue.enfileirarTitulos(req, { titulo_ids: [1], idempotency_key: 'legacy-contract' });
  assert.equal(state.PagamentoManualFilaItem.length, filasAntes + 1);
  assert.equal(state.Solicitacao[0].status_global, 'ENVIADO PARA PAGAMENTO');
  assert.equal(state.Solicitacao[0].area_responsavel, 'OBRA');
  assert(state.Historico.some(h => h.observacao === 'De FINANCEIRO para OBRA'));
  assert.equal(state.TituloFinanceiro[0].solicitacao_id, 6, 'Novo envio persiste vinculo para baixa e comprovantes futuros');
  const historicoAposEnvio = state.Historico.length;
  await queue.enfileirarTitulos(req, { titulo_ids: [1], idempotency_key: 'legacy-contract-retry' });
  assert.equal(state.PagamentoManualFilaItem.length, filasAntes + 1);
  assert.equal(state.Historico.length, historicoAposEnvio, 'Reprocessamento nao repete encaminhamento');

  reset();
  state.TituloFinanceiro[0].solicitacao_id = null; state.Solicitacao[0].obra_id = 7;
  state.Contrato = [{ id: 1, fluxo_novo: true, obra_id: 7, solicitacao_id: 6 }];
  state.ContratoParcela = [{ id: 1, contrato_id: 1, titulo_financeiro_id: 1 }];
  const loteLegado = await digital.createBatch(req, { titulo_ids: [1], idempotency_key: 'digital-legacy-contract' });
  assert.equal(state.Solicitacao[0].status_global, analysisStatus);
  const snapshotLegado = JSON.stringify(state.PagamentoAutorizacaoItem[0].snapshot_json);
  state.PagamentoAutorizacaoItem[0].status = 'AUTORIZADO'; state.PagamentoAutorizacaoLote[0].status = 'AUTORIZADO';
  await digital.enqueueAuthorizedItems(req, loteLegado.id);
  assert.equal(state.TituloFinanceiro[0].solicitacao_id, 6);
  assert.equal(state.TituloFinanceiro[0].status, 'ABERTO');
  assert.equal(state.Solicitacao[0].area_responsavel, 'OBRA');
  assert.equal(state.Solicitacao[0].status_global, 'ENVIADO PARA PAGAMENTO');
  assert.equal(state.PagamentoAutorizacaoItem[0].status, 'ENFILEIRADO');
  assert.equal(JSON.stringify(state.PagamentoAutorizacaoItem[0].snapshot_json), snapshotLegado, 'Snapshot original nao e reescrito');
  await digital.enqueueAuthorizedItems(req, loteLegado.id);
  assert.equal(state.PagamentoManualFilaItem.length, 1, 'Autorizacao anterior nao pede segunda decisao');

  reset(); state.TituloFinanceiro[0].juros = 10; state.TituloFinanceiro[0].multa = 3;
  await digital.createBatch(req, { titulo_ids: [1], idempotency_key: 'encargos' });
  assert.equal(state.PagamentoAutorizacaoLote[0].valor_total, 113);
  assert.equal(state.PagamentoAutorizacaoItem[0].valor_snapshot, 113);
  assert.equal(state.PagamentoAutorizacaoItem[0].snapshot_json.valor_saldo, 100);
  assert.equal(state.PagamentoAutorizacaoItem[0].snapshot_json.juros, 10);
  await queue.enfileirarTitulos(req, { titulo_ids: [1], idempotency_key: 'encargos-fila' });
  assert.equal(state.PagamentoManualFilaItem[0].valor_previsto, 100);
  assert.equal(state.PagamentoManualFilaItem[0].juros, 10); assert.equal(state.PagamentoManualFilaItem[0].multa, 3);
  reset(); const lot = await digital.createBatch(req, { titulo_ids: [1, 2], idempotency_key: 'digital-1' });
  assert(!Object.hasOwn(state.PagamentoAutorizacaoItem[0].snapshot_json, 'juros'), 'Zeros preservam formato/hash legado');
  assert.equal(lot.codigo, `LOTE-${lot.id}`, 'Codigo gerado pelo ID unico na transacao');
  assert.equal(state.PagamentoAutorizacaoLote[0].codigo, 'LOTE-1');
  assert(lot.id); assert.equal(state.Solicitacao[0].status_global, analysisStatus); assert.equal(state.PagamentoAutorizacaoItem.length, 2);
  await digital.createBatch(req, { titulo_ids: [1, 2], idempotency_key: 'digital-1' });
  assert.equal(state.PagamentoAutorizacaoLote.length, 1); assert.equal(state.Historico.length, 1);
  assert.equal(state.PagamentoAutorizacaoLote[0].codigo, 'LOTE-1', 'Replay nao renumera');
  await send(); assert.equal(state.PagamentoManualFilaItem.length, 2);
  assert.equal(state.PagamentoAutorizacaoLote[0].status, 'CONCLUIDO');
  assert(state.PagamentoAutorizacaoItem.every(item => item.status === 'ENFILEIRADO' && item.fila_item_id));
  assert(!state.PagamentoAutorizacaoLote[0].decidido_por, 'Envio direto nao fabrica decisao do proprietario');
  const nextLot = await digital.createBatch(req, { titulo_ids: [3], idempotency_key: 'digital-2' });
  assert.equal(nextLot.codigo, 'LOTE-2');
  assert.notEqual(nextLot.codigo, lot.codigo);
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

  // Dois titulos da mesma solicitacao: cada recusa tem motivo proprio.
  reset();
  await internal.atribuirStatusInternoPagar(user, [1, 2], analysisStatus);
  for (const tituloId of [1, 2]) await models.sequelize.transaction(transaction => analysis.registrarAnaliseRecusada({
    tituloId, usuarioId: 31, motivo: `Corrigir titulo ${tituloId}.`, resultado: 'REJEITADO', transaction }));
  const motivosHistorico = state.Historico.filter(h => JSON.parse(h.metadata || '{}').origem === 'AUTORIZACAO_DIGITAL');
  assert.equal(motivosHistorico.length, 2);
  assert.deepEqual(motivosHistorico.map(h => h.observacao), ['Analise digital de pagamento rejeitada: Corrigir titulo 1.',
    'Analise digital de pagamento rejeitada: Corrigir titulo 2.']);
  assert.equal(motivosHistorico[0].acao, 'STATUS_ALTERADO');
  assert.equal(motivosHistorico[1].acao, 'AUTORIZACAO_PAGAMENTO_REJEITADA');
  assert.equal(state.Solicitacao[0].status_global, 'AGUARDANDO AJUSTE');
  const antesReplay = state.Historico.length;
  await models.sequelize.transaction(transaction => analysis.registrarAnaliseRecusada({ tituloId: 2,
    usuarioId: 31, motivo: 'Replay', resultado: 'REJEITADO', transaction }));
  assert.equal(state.Historico.length, antesReplay, 'Retry nao duplica o motivo');

  reset(); await internal.atribuirStatusInternoPagar(user, [1], analysisStatus);
  const criarHistorico = models.Historico.create;
  const historicoAntesFalha = state.Historico.length;
  models.Historico.create = async () => { throw new Error('Historico indisponivel'); };
  try {
    await assert.rejects(models.sequelize.transaction(transaction => analysis.registrarAnaliseRecusada({
      tituloId: 1, usuarioId: 31, motivo: 'Nao perder motivo', resultado: 'REJEITADO', transaction })), /Historico indisponivel/);
    assert.equal(state.TituloFinanceiro[0].status_interno_pagar, analysisStatus);
    assert.equal(state.Solicitacao[0].status_global, analysisStatus);
    assert.equal(state.Historico.length, historicoAntesFalha, 'Falha no registro reverte a recusa inteira');
  } finally { models.Historico.create = criarHistorico; }

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
    const replay = await send(user, 'direct-nova');
    assert.equal(replay.criados, 0); assert.equal(replay.ja_na_fila, 2);
    assert.equal(state.PagamentoManualFilaItem.length, 2);
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

  reset();
  let lote = await digital.createBatch(req, { titulo_ids: [1, 2] });
  let result = await queue.enfileirarTitulos(req, { titulo_ids: [1], idempotency_key: 'primeiro' });
  assert.equal(result.criados, 1); assert.equal(state.PagamentoAutorizacaoLote[0].status, 'AGUARDANDO');
  assert.equal(state.PagamentoAutorizacaoItem[0].status, 'ENFILEIRADO');
  assert.equal(state.PagamentoAutorizacaoItem[1].status, 'PENDENTE');
  result = await send(user, 'misto'); assert.equal(result.criados, 1); assert.equal(result.ja_na_fila, 1);
  assert.equal(state.PagamentoAutorizacaoLote[0].status, 'CONCLUIDO');
  assert.equal(state.PagamentoAutorizacaoEvento.filter(event => event.tipo === 'ITEM_ENFILEIRADO').length, 2);
  assert.equal(state.PagamentoAutorizacaoEvento[1].dados_json.origem, 'ENVIO_DIRETO');
  await send(user, 'terceiro'); assert.equal(state.PagamentoAutorizacaoEvento.length, 3, 'Reenvio nao duplica eventos do dossie');
  let hashAnterior = null;
  for (const event of state.PagamentoAutorizacaoEvento) {
    assert.equal(event.hash_anterior, hashAnterior);
    const material = { lote_id: Number(event.lote_id), item_id: event.item_id ? Number(event.item_id) : null,
      usuario_id: event.usuario_id ? Number(event.usuario_id) : null, tipo: event.tipo, dados: event.dados_json,
      criado_em: new Date(event.createdAt).toISOString(), hash_anterior: hashAnterior };
    assert.equal(event.evento_hash, digital.sha256(material), 'Extracao do helper preserva o contrato de hash dos eventos');
    hashAnterior = event.evento_hash;
  }
  scope = [8]; await assert.rejects(send(user, 'terceiro'), { statusCode: 403 });
  assert.equal(state.PagamentoManualFilaItem.length, 2, 'Replay respeita escopo atual');

  reset(); lote = await digital.createBatch(req, { titulo_ids: [1, 2] });
  state.PagamentoAutorizacaoItem.forEach(item => { item.status = 'AUTORIZADO'; });
  state.PagamentoAutorizacaoLote[0].status = 'AUTORIZADO';
  await digital.enqueueAuthorizedItems(req, lote.id);
  result = await send(user, 'depois-digital');
  assert.equal(result.criados, 0); assert.equal(result.ja_na_fila, 2);
  assert.equal(state.PagamentoManualFilaItem.length, 2);
  assert(state.PagamentoAutorizacaoEvento.filter(event => event.tipo === 'ITEM_ENFILEIRADO').every(event => event.dados_json.origem === 'AUTORIZACAO_DIGITAL'));

  // Simula a janela legada: fila existe, item continua AUTORIZADO.
  state.PagamentoAutorizacaoItem[0].status = 'AUTORIZADO';
  state.PagamentoAutorizacaoLote[0].status = 'AUTORIZADO';
  await digital.enqueueAuthorizedItems(req, lote.id);
  assert.equal(state.PagamentoManualFilaItem.length, 2);
  assert.equal(state.PagamentoAutorizacaoItem[0].status, 'ENFILEIRADO');
  assert.equal(state.PagamentoAutorizacaoLote[0].status, 'CONCLUIDO');

  reset(); lote = await digital.createBatch(req, { titulo_ids: [1, 2] }); eventFails = true;
  await assert.rejects(send(), /Evento/);
  assert.equal(state.PagamentoManualFilaItem.length, 0, 'Falha de evento reverte criacao de fila');
  assert(state.PagamentoAutorizacaoItem.every(item => item.status === 'PENDENTE'));
  assert.equal(state.PagamentoAutorizacaoLote[0].status, 'AGUARDANDO');
  eventFails = false; await send();
  const fila = state.PagamentoManualFilaItem[0];
  fila.status = 'BAIXADO'; fila.comprovante_hash = 'preservar'; state.TituloFinanceiro[0].status = 'QUITADO';
  result = await send(); assert.equal(result.ja_processados, 1); assert.equal(result.criados, 0);
  assert.equal(state.PagamentoManualFilaItem[0].comprovante_hash, 'preservar');
  assert.equal(state.PagamentoManualFilaItem[0].status, 'BAIXADO');

  reset(); await digital.createBatch(req, { titulo_ids: [1, 2] });
  await assert.rejects(queue.enfileirarTitulosAutorizados(req, { titulo_ids: [1] }, 1), { statusCode: 409 });
  assert.equal(state.PagamentoManualFilaItem.length, 0, 'Pendencia nao e autorizacao digital');
  serial = true;
  const parallel = await Promise.all([send(user, 'concorrente-1'), send(user, 'concorrente-2')]);
  assert.equal(parallel.reduce((sum, value) => sum + value.criados, 0), 2);
  assert.equal(state.PagamentoManualFilaItem.length, 2, 'Chamadas simultaneas com transacoes serializadas nao duplicam');

  // Um titulo agora, outros do MESMO lote depois, inclusive com metadado
  // expira_em antigo. A projecao financeira nunca fecha a decisao pendente.
  {
    reset(); const parcial = await digital.createBatch(req, { titulo_ids: [1, 2] });
    state.PagamentoAutorizador.push({ id: 1, usuario_id: 31, ativo: true });
    state.WebauthnCredential.push({ id: 1, usuario_id: 31, credential_id: 'qa-key', public_key: 'AA==', ativo: true, counter: 0 });
    state.PagamentoAutorizacaoLote[0].expira_em = new Date('2000-01-01T00:00:00Z');
    const assinaturaOriginal = state.PagamentoAutorizacaoLote[0].dossie_hash;
    const ator = { user: { id: 31, grants: [DECIDE] }, headers: {} };
    for (const item_id of [1, 2]) {
      const decisoesParciais = [{ item_id, decisao: 'AUTORIZAR', motivo: null }];
      await digital.authenticationOptions(ator, parcial.id, decisoesParciais);
      await digital.decideBatch(ator, parcial.id, { decisoes: decisoesParciais, credential: { id: 'qa-key' } });
      assert.equal(state.PagamentoAutorizacaoItem[item_id - 1].status, 'ENFILEIRADO');
      assert.equal(state.PagamentoAutorizacaoLote[0].dossie_hash, assinaturaOriginal);
      assert.equal(state.PagamentoManualFilaItem.length, item_id);
      if (item_id === 1) { assert.equal(state.PagamentoAutorizacaoItem[1].status, 'PENDENTE'); assert.equal(state.PagamentoAutorizacaoLote[0].status, 'AGUARDANDO'); }
    }
    assert.equal(state.PagamentoAutorizacaoLote[0].status, 'CONCLUIDO');
  }
  // Decisao real com biometria/challenge simulados, incluindo ordem dos locks.
  reset(); lote = await digital.createBatch(req, { titulo_ids: [1, 2] });
  state.PagamentoAutorizador.push({ id: 1, usuario_id: 31, ativo: true });
  state.WebauthnCredential.push({ id: 1, usuario_id: 31, credential_id: 'qa-key', public_key: 'AA==', ativo: true, counter: 0 });
  const diretor = { user: { id: 31, grants: [DECIDE] }, headers: {} };
  const decisoes = [{ item_id: 1, decisao: 'AUTORIZAR', motivo: null }, { item_id: 2, decisao: 'REJEITAR', motivo: 'Ajustar' }];
  state.PagamentoAutorizacaoLote[0].expira_em = new Date('2000-01-01T00:00:00Z');
  await assert.rejects(digital.authenticationOptions({ user: { id: 31, grants: [] } }, lote.id, decisoes), { statusCode: 403 });
  const authentication = await digital.authenticationOptions(diretor, lote.id, decisoes);
  assert.equal(authentication.challenge, 'qa', 'Lote legado vencido aceita nova confirmacao');
  challenge = null; // Redis nao retorna challenges vencidos.
  await assert.rejects(digital.decideBatch(diretor, lote.id, { decisoes, credential: { id: 'qa-key' } }), /Desafio expirado/);
  assert.equal(state.PagamentoAutorizacaoLote[0].status, 'AGUARDANDO');
  assert.equal(state.PagamentoManualFilaItem.length, 0, 'Challenge vencido nao autoriza ou cria fila');
  await digital.authenticationOptions(diretor, lote.id, decisoes);
  locks.length = 0;
  await digital.decideBatch(diretor, lote.id, { decisoes, credential: { id: 'qa-key' } });
  assert(locks.indexOf('TituloFinanceiro') < locks.indexOf('PagamentoAutorizacaoLote'), 'Decisao trava titulo antes do lote');
  assert.equal(state.PagamentoManualFilaItem.length, 1);
  assert.equal(state.PagamentoAutorizacaoItem[0].status, 'ENFILEIRADO');
  assert.equal(state.PagamentoAutorizacaoItem[1].status, 'REJEITADO');
  assert.equal(state.PagamentoAutorizacaoLote[0].status, 'CONCLUIDO');
  assert.equal(state.PagamentoAutorizacaoLote[0].expira_em.toISOString(), '2000-01-01T00:00:00.000Z', 'Nao reescreve metadado legado');
  await assert.rejects(digital.decideBatch(diretor, lote.id, { decisoes, credential: { id: 'qa-key' } }), /Desafio expirado/);
  await assert.rejects(digital.authenticationOptions(diretor, lote.id, decisoes), { statusCode: 409 });
  result = await queue.enfileirarTitulos(req, { titulo_ids: [1], idempotency_key: 'direto-apos-decisao' });
  assert.equal(result.criados, 0); assert.equal(state.PagamentoManualFilaItem.length, 1);

  // Sem prazo do lote, alteracao material ainda invalida o snapshot antes da fila.
  reset(); lote = await digital.createBatch(req, { titulo_ids: [1] });
  state.PagamentoAutorizador.push({ id: 1, usuario_id: 31, ativo: true });
  state.WebauthnCredential.push({ id: 1, usuario_id: 31, credential_id: 'qa-key', public_key: 'AA==', ativo: true, counter: 0 });
  state.PagamentoAutorizacaoLote[0].expira_em = new Date('2000-01-01T00:00:00Z');
  const autorizar = [{ item_id: 1, decisao: 'AUTORIZAR', motivo: null }];
  await digital.authenticationOptions(diretor, lote.id, autorizar);
  state.TituloFinanceiro[0].valor_saldo = 90;
  await digital.decideBatch(diretor, lote.id, { decisoes: autorizar, credential: { id: 'qa-key' } });
  assert.equal(state.PagamentoAutorizacaoItem[0].status, 'INVALIDADO');
  assert.equal(state.PagamentoManualFilaItem.length, 0, 'Lote antigo nao dispensa revalidacao material');

  // Encargos alterados tambem sao mudanca material; nao usar decisao obsoleta.
  reset(); state.TituloFinanceiro[0].juros = 10; state.TituloFinanceiro[0].multa = 3;
  lote = await digital.createBatch(req, { titulo_ids: [1] });
  state.PagamentoAutorizador.push({ id: 1, usuario_id: 31, ativo: true });
  state.WebauthnCredential.push({ id: 1, usuario_id: 31, credential_id: 'qa-key', public_key: 'AA==', ativo: true, counter: 0 });
  await digital.authenticationOptions(diretor, lote.id, autorizar);
  state.TituloFinanceiro[0].juros = 15;
  await digital.decideBatch(diretor, lote.id, { decisoes: autorizar, credential: { id: 'qa-key' } });
  assert.equal(state.PagamentoAutorizacaoItem[0].status, 'INVALIDADO');
  assert.equal(state.PagamentoManualFilaItem.length, 0, 'Encargos corrigidos exigem snapshot atual');

  // Challenge obtido antes do envio direto nao pode decidir um item ja enfileirado.
  reset(); lote = await digital.createBatch(req, { titulo_ids: [1, 2] });
  state.PagamentoAutorizador.push({ id: 1, usuario_id: 31, ativo: true });
  state.WebauthnCredential.push({ id: 1, usuario_id: 31, credential_id: 'qa-key', public_key: 'AA==', ativo: true, counter: 0 });
  await queue.enfileirarTitulos(req, { titulo_ids: [1] });
  const antiga = [{ item_id: 1, decisao: 'AUTORIZAR', motivo: null }];
  challenge = { challenge: 'qa', decisions_hash: digital.sha256(antiga), dossie_hash: lote.dossie_hash };
  await assert.rejects(digital.decideBatch(diretor, lote.id, { decisoes: antiga, credential: { id: 'qa-key' } }), { statusCode: 409 });
  assert.equal(state.PagamentoManualFilaItem.length, 1);
  assert.equal(state.PagamentoAutorizacaoItem[0].status, 'ENFILEIRADO');
  assert.equal(state.PagamentoAutorizacaoEvento.filter(event => event.tipo === 'ITEM_AUTORIZADO').length, 0);

  // Revogacao assinada do lote/item: retira fila, preserva dossie e exige nova decisao.
  async function prepararRevogacao() {
    reset();
    state.TituloFinanceiro[1].status = 'ABERTO';
    const lot = await digital.createBatch(req, { titulo_ids: [1, 2] });
    state.PagamentoAutorizador.push({ id: 1, usuario_id: 31, ativo: true });
    state.WebauthnCredential.push({ id: 1, usuario_id: 31, credential_id: 'qa-key', public_key: 'AA==', ativo: true, counter: 0 });
    await send(); return lot;
  }
  const revoke = async (lot, ids = [1], actor = diretor, revisao = Number(state.PagamentoAutorizacaoLote[0].revisao_autorizacao || 0)) => {
    const decisions = ids.map(item_id => ({ item_id, decisao: 'REVOGAR', motivo: 'Revisar pagamento' }));
    challenge = { challenge: 'qa', decisions_hash: digital.sha256(decisions), dossie_hash: lot.dossie_hash,
      revisao_autorizacao: revisao };
    return digital.decideBatch(actor, lot.id, { decisoes: decisions, credential: { id: 'qa-key' } });
  };
  lote = await prepararRevogacao();
  await revoke(lote);
  assert.equal(state.PagamentoAutorizacaoItem[0].status, 'PENDENTE');
  assert.equal(state.PagamentoAutorizacaoItem[0].fila_item_id, null);
  assert.equal(state.PagamentoAutorizacaoItem[1].status, 'ENFILEIRADO');
  assert.equal(state.PagamentoManualFilaItem[0].status, 'RESOLVIDO');
  assert.equal(state.PagamentoAutorizacaoLote[0].status, 'AGUARDANDO');
  assert.equal(state.PagamentoAutorizacaoLote[0].revisao_autorizacao, 1);
  assert.equal(state.PagamentoAutorizacaoLote[0].dossie_hash, lote.dossie_hash, 'Dossie assinado preservado');
  assert(state.PagamentoAutorizacaoEvento.some(event => event.tipo === 'ITEM_AUTORIZACAO_REVOGADA'));
  await digital.enqueueAuthorizedItems(req, lote.id);
  assert.equal(state.PagamentoManualFilaItem.length, 2, 'Pendente nao e reenfileirado automaticamente');
  await assert.rejects(revoke(lote, [2], diretor, 0), /Autorizacao alterada/);
  const reautorizar = [{ item_id: 1, decisao: 'AUTORIZAR', motivo: null }];
  challenge = { challenge: 'qa', decisions_hash: digital.sha256(reautorizar), dossie_hash: lote.dossie_hash, revisao_autorizacao: 1 };
  await digital.decideBatch(diretor, lote.id, { decisoes: reautorizar, credential: { id: 'qa-key' } });
  assert.equal(state.PagamentoManualFilaItem.length, 3, 'Novo ciclo cria fila diferente do registro revogado');
  assert.equal(state.PagamentoManualFilaItem[2].status, 'PENDENTE');
  await assert.rejects(queue.enfileirarTitulosAutorizados(req, { titulo_ids: [2], idempotency_key: 'rev-velha' }, lote.id, 0), /revogada ou alterada/);
  lote = await prepararRevogacao(); await revoke(lote, [1, 2]);
  assert(state.PagamentoAutorizacaoItem.every(item => item.status === 'PENDENTE'));
  assert(state.PagamentoManualFilaItem.every(item => item.status === 'RESOLVIDO'));
  for (const bloqueio of ['BAIXADO', 'PARCIAL', 'MOVIMENTO', 'BANCARIO', 'CICLO_RECENTE', 'AUDITORIA', 'SEM_PERMISSAO', 'TESTAR']) {
    lote = await prepararRevogacao();
    if (bloqueio === 'BAIXADO') state.TituloFinanceiro[1].status = 'QUITADO';
    if (bloqueio === 'PARCIAL') state.TituloFinanceiro[1].valor_baixado = 1;
    if (bloqueio === 'MOVIMENTO') state.PagamentoManualFilaItem[1].movimento_financeiro_id = 88;
    if (bloqueio === 'BANCARIO') state.PaymentIntent.push({ titulo_financeiro_id: 2, status: 'ENVIADO' });
    if (bloqueio === 'CICLO_RECENTE') state.PagamentoAutorizacaoItem.push({ id: 9, titulo_financeiro_id: 2, lote_id: 9, status: 'ENFILEIRADO' });
    if (bloqueio === 'AUDITORIA') eventFails = true;
    const actor = bloqueio === 'SEM_PERMISSAO' ? { user: { id: 31, grants: [] } }
      : bloqueio === 'TESTAR' ? { ...diretor, dev_user_switch: true } : diretor;
    await assert.rejects(revoke(lote, [1, 2], actor));
    assert(state.PagamentoAutorizacaoItem.every(item => item.status === 'ENFILEIRADO'), `Atomicidade ${bloqueio}`);
    assert(state.PagamentoManualFilaItem.every(item => item.status === 'PENDENTE'));
  }

  // Rejeicao de saldo em fila: mesma ACL/passkey, sem estornar parciais.
  const rejeitarFila = async (lot, ids = [1], actor = diretor) => {
    const decisoes = ids.map(item_id => ({ item_id, decisao: 'REJEITAR_FILA', motivo: 'Saldo nao autorizado' }));
    await digital.authenticationOptions(actor, lot.id, decisoes);
    return digital.decideBatch(actor, lot.id, { decisoes, credential: { id: 'qa-key' } });
  };
  for (const mode of ['PILOT', 'ENFORCED']) {
    lote = await prepararRevogacao(); env.paymentOwnerApprovalMode = mode;
    Object.assign(state.TituloFinanceiro[0], { status: 'PARCIAL', valor_baixado: 30, valor_saldo: 70 });
    Object.assign(state.PagamentoManualFilaItem[0], { status: 'DIVERGENTE', movimento_financeiro_id: 123, comprovante_url: 'qa.pdf' });
    await rejeitarFila(lote);
    let title = state.TituloFinanceiro[0];
    assert.deepEqual([title.status, title.valor_baixado, title.valor_saldo], ['PARCIAL', 30, 70]);
    assert.equal(title.bloqueio_pagamento_proprietario.saldo, 70);
    assert.equal(state.PagamentoAutorizacaoItem[0].status, 'REJEITADO');
    assert.equal(state.PagamentoAutorizacaoItem[1].status, 'ENFILEIRADO');
    assert.equal(state.PagamentoManualFilaItem[0].status, 'RESOLVIDO');
    assert.equal(state.PagamentoManualFilaItem[0].movimento_financeiro_id, 123);
    assert.equal(state.PagamentoManualFilaItem[0].comprovante_url, 'qa.pdf');
    assert.equal(state.PagamentoAutorizacaoLote[0].dossie_hash, lote.dossie_hash);
    assert(state.PagamentoAutorizacaoEvento.some(e => e.tipo === 'ITEM_REJEITADO_NA_FILA'));
    await assert.rejects(rejeitarFila(lote), { statusCode: 409 });
    env.paymentOwnerApprovalMode = 'OFF';
    await assert.rejects(queue.enfileirarTitulos(req, { titulo_ids: [1], idempotency_key: 'bypass-off' }), { code: 'TITULO_REJEITADO_PROPRIETARIO' });
    title = state.TituloFinanceiro[0]; // O fixture restaura objetos apos rollback.
    env.paymentOwnerApprovalMode = mode;
    // Apenas novo material, nova decisao e passkey liberam o saldo, nao preparar.
    // Bloqueio novo da fila direta nao possui item digital anterior (id=0),
    // mas deve exigir o mesmo ciclo real para liberar, sem bypass pelo envio.
    if(mode==='ENFORCED') Object.assign(title.bloqueio_pagamento_proprietario,{origem:'FILA_DIRETA',item_id:0,lote_id:null});
    const novo = await digital.createBatch(req, { titulo_ids: [1], idempotency_key: 'novo-saldo' });
    assert(title.bloqueio_pagamento_proprietario);
    const novoItem = state.PagamentoAutorizacaoItem.at(-1);
    const decisoes = [{ item_id: novoItem.id, decisao: 'AUTORIZAR', motivo: null }];
    await digital.authenticationOptions(diretor, novo.id, decisoes);
    await digital.decideBatch(diretor, novo.id, { decisoes, credential: { id: 'qa-key' } });
    assert.equal(title.bloqueio_pagamento_proprietario, null);
    assert.equal(state.PagamentoManualFilaItem.at(-1).status, 'PENDENTE');
    assert.equal(state.PagamentoManualFilaItem[0].status, 'RESOLVIDO');
    assert.equal(title.valor_baixado, 30);
    assert(state.PagamentoAutorizacaoEvento.some(e => e.tipo === 'SALDO_REAUTORIZADO'));
  }
  for (const tipo of ['QUITADO', 'BANCARIO', 'CICLO_RECENTE', 'EDICAO_DP', 'AUDITORIA', 'SEM_PERMISSAO', 'TESTAR']) {
    lote = await prepararRevogacao();
    if (tipo === 'QUITADO') Object.assign(state.TituloFinanceiro[1], { status: 'QUITADO', valor_saldo: 0 });
    if (tipo === 'BANCARIO') state.PaymentIntent.push({ titulo_financeiro_id: 2, status: 'ENVIADO' });
    if (tipo === 'CICLO_RECENTE') state.PagamentoAutorizacaoItem.push({ id: 9, titulo_financeiro_id: 2, lote_id: 9, status: 'PENDENTE' });
    if (tipo === 'EDICAO_DP') state.PagamentoManualFilaItem[1].status = 'EM_EDICAO';
    if (tipo === 'AUDITORIA') eventFails = true;
    const actor = tipo === 'SEM_PERMISSAO' ? { user: { id: 31, grants: [] } } : tipo === 'TESTAR' ? { ...diretor, dev_user_switch: true } : diretor;
    const antes = JSON.stringify(state);
    await assert.rejects(rejeitarFila(lote, [1, 2], actor));
    assert.equal(JSON.stringify(state), antes, `Rollback integral ${tipo}`);
  }
  lote = await prepararRevogacao();
  await assert.rejects(digital.authenticationOptions(diretor, lote.id, [{ item_id: 1, decisao: 'REJEITAR_FILA', motivo: '' }]), { statusCode: 400 });
  await assert.rejects(digital.authenticationOptions(diretor, lote.id, [{ item_id: 1, decisao: 'REJEITAR_FILA', motivo: 'x' }, { item_id: 2, decisao: 'AUTORIZAR' }]), { statusCode: 400 });

  // Rejeitados sao uma projecao somente leitura, sem criar pagamento executavel.
  reset();
  state.PagamentoAutorizacaoItem.push({ id: 1, titulo_financeiro_id: 1, lote_id: 1, status: 'REJEITADO',
    motivo_decisao: 'Documento incorreto', titulo: state.TituloFinanceiro[0] });
  models.sequelize.fn = () => null; models.sequelize.col = () => null;
  let rejected = await queue.listarFilaPagamentos(req, { status: 'NAO_PAGO' });
  assert.equal(rejected.data[0].motivo, 'Documento incorreto');
  assert.equal(rejected.data[0].somente_consulta, true); assert(rejected.data[0].id < 0);
  assert.equal(state.PagamentoManualFilaItem.length, 0);
  state.PagamentoAutorizacaoItem.push({ id: 2, titulo_financeiro_id: 1, status: 'PENDENTE', titulo: state.TituloFinanceiro[0] });
  rejected = await queue.listarFilaPagamentos(req, { status: 'NAO_PAGO' }); assert.equal(rejected.data.length, 0);
  // A forma prevista de cartao sem fatura deixou de ser impedimento para entrada.
  reset(); state.TituloFinanceiro[0].formaPagamento = { exige_cartao: true, gera_fatura: true };
  await send(); assert.equal(state.PagamentoManualFilaItem.length, 2);
  reset(); state.TituloFinanceiro[0].fatura_cartao_id = 9;
  // Fatura inexistente nao pode ser tratada como previsao corrigivel.
  models.FaturaCartaoFinanceiro = { findByPk: async () => null };
  await assert.rejects(send(), /fatura prevista nao esta aberta/); assert.equal(state.PagamentoManualFilaItem.length, 0);
  // Commit da assinatura confirmado; somente a segunda transacao (fila) falha.
  reset(); lote = await digital.createBatch(req, { titulo_ids: [1, 2] });
  const dono = { user: { id: 31, grants: [DECIDE] }, headers: {} };
  state.PagamentoAutorizador.push({ id: 1, usuario_id: 31, ativo: true }, { id: 2, usuario_id: 32, ativo: true }, { id: 3, usuario_id: 33, ativo: false });
  state.User.push({ id: 31, ativo: true, grants: [DECIDE] }, { id: 32, ativo: true, grants: [] }, { id: 33, ativo: true, grants: [DECIDE] });
  state.WebauthnCredential.push({ id: 1, usuario_id: 31, credential_id: 'qa-key', public_key: 'AA==', ativo: true, counter: 0 });
  const somenteUm = [{ item_id: 1, decisao: 'AUTORIZAR', motivo: null }];
  await digital.authenticationOptions(dono, lote.id, somenteUm);
  scope = [999]; pushFails = true;
  const assinada = await digital.decideBatch(dono, lote.id, { decisoes: somenteUm, credential: { id: 'qa-key' } });
  assert.equal(assinada.envio_pendente, true);
  assert.equal(state.PagamentoAutorizacaoItem[0].status, 'AUTORIZADO');
  assert.equal(state.PagamentoAutorizacaoItem[1].status, 'PENDENTE');
  assert.equal(state.PagamentoManualFilaItem.length, 0);
  assert.equal(state.Notificacao.length, 1, 'Push indisponivel nao perde notificacao persistida');
  assert.deepEqual(state.NotificacaoDestinatario.map(n => n.usuario_id), [31], 'Somente autorizador nominal ativo com granular');
  assert.equal(pushes, 1);
  assert.equal(state.Notificacao[0].metadata.rota, '/financeiro/autorizacoes-pagamento?reenvio=1');
  const hashAssinado = state.PagamentoAutorizacaoItem[0].snapshot_hash;
  serial = true; pushFails = false;
  await Promise.all([1, 2].map(() => assert.rejects(digital.enqueueAuthorizedItems(dono, lote.id, { itemIds: [1] }), { statusCode: 403 })));
  assert.equal(state.Notificacao.length, 1, 'Falhas repetidas/concorrentes nao duplicam alerta');
  assert.equal(pushes, 1);
  for (const ator of [{ user: { id: 90, grants: [] } }, { user: { id: 33, grants: [DECIDE] } }, { ...dono, dev_user_switch: true }]) {
    await assert.rejects(digital.enqueueAuthorizedItems(ator, lote.id, { itemIds: [1] }), { statusCode: 403 });
  }
  for (const itemIds of [[], [1, 1], ['1'], [-1], [0], Array(201).fill(1)]) {
    await assert.rejects(digital.enqueueAuthorizedItems(dono, lote.id, { itemIds }), { statusCode: 400 });
  }
  await assert.rejects(digital.enqueueAuthorizedItems(dono, lote.id, { itemIds: [2] }), { statusCode: 409 });
  await assert.rejects(digital.enqueueAuthorizedItems(dono, lote.id + 1, { itemIds: [1] }), { statusCode: 409 });
  env.paymentOwnerApprovalMode = 'PAUSED';
  await assert.rejects(digital.enqueueAuthorizedItems(dono, lote.id, { itemIds: [1] }), { statusCode: 423 });
  env.paymentOwnerApprovalMode = 'PILOT'; scope = null;
  const chavesAntes = state.WebauthnCredential[0].counter;
  await digital.enqueueAuthorizedItems(dono, lote.id, { itemIds: [1] });
  assert.equal(state.PagamentoManualFilaItem.length, 1);
  assert.equal(state.PagamentoAutorizacaoItem[0].status, 'ENFILEIRADO');
  assert.equal(state.PagamentoAutorizacaoItem[1].status, 'PENDENTE', 'Reenvio individual nao envia o resto do lote');
  assert.equal(state.PagamentoAutorizacaoItem[0].snapshot_hash, hashAssinado);
  assert.equal(state.WebauthnCredential[0].counter, chavesAntes, 'Reenvio nao consome outra passkey');
  await assert.rejects(digital.enqueueAuthorizedItems(dono, lote.id, { itemIds: [1] }), { statusCode: 409 });
  assert.equal(state.PagamentoManualFilaItem.length, 1, 'Replay nao duplica fila');
  assert.equal(state.PagamentoAutorizacaoEvento.filter(e => e.tipo === 'ITEM_AUTORIZADO').length, 1);
  state.PagamentoAutorizacaoItem[1].status = 'AUTORIZADO';
  avisosAtivos = false;
  await load('pagamentoAutorizacaoReenvioService').notificarEnvioPendente(dono, lote.id);
  assert.equal(state.Notificacao.length, 1, 'Configuracao de notificacao desativada respeitada');
  avisosAtivos = true; eventFails = true;
  const antesAvisoFalho = JSON.stringify(state);
  await assert.rejects(load('pagamentoAutorizacaoReenvioService').notificarEnvioPendente(dono, lote.id));
  assert.equal(JSON.stringify(state), antesAvisoFalho, 'Alerta/evento transacionais sem escrita parcial');
  eventFails = false;
  await load('pagamentoAutorizacaoReenvioService').notificarEnvioPendente(dono, lote.id);
  assert.equal(state.Notificacao.length, 2, 'Nova pendencia de outro item no mesmo lote gera aviso proprio');
  assert.equal(pushes, 2);
  await require('./validarAutorizacaoSelecao')({ digital, queue, models, reset, req, user, env, locks, webauthnMetrics,
    getState: () => state, scope: value => { scope = value; }, serial: () => { serial = true; } });
  console.log('OK: analise/locks/escopo, decisao commitada com envio pendente, alerta nominal deduplicado/concorrente, push falho, ACL/PAUSED, reenvio individual/replay sem nova passkey e demais protecoes. Sem banco/rede.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
