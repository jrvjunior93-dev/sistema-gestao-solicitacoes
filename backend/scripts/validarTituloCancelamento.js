'use strict';
// Codigo real e persistencia transacional em memoria; sem .env/banco/rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const { validateTituloCancelamentoBody: validate } = require('../src/validators/tituloCancelamentoValidator');
const Op = { in: Symbol('in'), notIn: Symbol('notIn'), or: Symbol('or') };
function load(file, imports) {
  const mod = { exports: {} };
  vm.runInNewContext(read(file), { module: mod, console, Date, require(name) {
    if (!Object.hasOwn(imports, name)) throw Error(`Dependencia nao simulada: ${name}`);
    return imports[name];
  } }, { filename: file });
  return mod.exports;
}
const authSource = read('src/services/authorizationService.js');
const authMethod = authSource.match(/async function canCancelTitulosFinanceiros\(user\) \{[\s\S]*?\n\}/)[0];
const canCancel = vm.runInNewContext(`(${authMethod})`, {
  isBusinessAdmin: u => ['SUPERADMIN', 'ADMINISTRADOR'].includes(u?.perfil),
  userHasAreaPermissionWhenConfigured: async (u, keys) => Boolean(u?.configurada && keys.some(k => u.permissoes?.includes(k)))
});
const body = { motivo: 'Lancamento duplicado conferido', idempotency_key: 'cancelamento-qa-0001', versao: '2026-10-19T12:00:00.000Z' };
const permission = 'financeiro.titulos.cancelar';
function fixture() {
  let state = { titulo: { id: 10, codigo: 'TIT-QA', tipo: 'PAGAR', status: 'ABERTO', origem_titulo: 'MANUAL',
    obra_id: 1, valor_original: '120.00', valor_saldo: '120.00', valor_baixado: '0.00', updatedAt: body.versao,
    juros: '3.00', multa: '2.00', deleted_at: null }, rateios: [], logs: [], events: [], blockers: {}, updates: 0,
    referencias: [], destinos: [] };
  const req = { user: { id: 99, nome: 'Operador QA', perfil: 'USUARIO', configurada: true, permissoes: [permission], scope: [1] }, headers: {} };
  let failLog = false, failEvent = false, failQuery = false, commits = 0, rollbacks = 0;
  const matches = (row, where) => Reflect.ownKeys(where).every(key => {
    if (key === Op.or) return where[key].some(w => matches(row, w));
    const v = where[key];
    return v && typeof v === 'object' ? Reflect.ownKeys(v).every(op =>
      op === Op.in ? v[op].includes(row[key]) : op === Op.notIn ? !v[op].includes(row[key]) : false) : row[key] === v;
  });
  function titulo() { return { ...state.titulo, update: async (data, options) => {
    assert(options.transaction); Object.assign(state.titulo, data); state.updates++;
  } }; }
  let tail = Promise.resolve();
  const db = { sequelize: { transaction(callback) {
    const result = tail.then(async () => {
      const before = structuredClone(state), transaction = { LOCK: { UPDATE: 'UPDATE' } };
      try { const value = await callback(transaction); commits++; return value; }
      catch (error) { state = before; rollbacks++; throw error; }
    }); tail = result.catch(() => {}); return result;
  } }, TituloFinanceiro: { findByPk: async (id, options) => {
    assert(options.lock && options.transaction); return Number(id) === 10 && !state.titulo.deleted_at ? titulo() : state.destinos.find(t => t.id === Number(id)) || null;
  } }, TituloFinanceiroRateio: { findAll: async () => state.rateios },
  LogExclusao: { findOne: async ({ where }) => state.logs.find(l => matches(l, where)) || null,
    create: async (data, options) => { assert(options.transaction); if (failLog) throw Error('Log indisponivel'); state.logs.push(data); } },
  SecurityEventLog: { create: async (data, options) => { assert(options.transaction); if (failEvent) throw Error('Evento indisponivel'); state.events.push(data); } } };
  const blockedModels = ['MovimentoFinanceiro','PaymentIntent','PagamentoManualFilaItem','PagamentoAutorizacaoItem',
    'FaturaCartaoTitulo','PedidoCompraTitulo','ContratoParcela','ContratoComercialParcela','FinanciamentoBancarioParcela',
    'SolicitacaoAdiantamento','SolicitacaoRecargaCartao','RhFechamentoTitulo','BoletoCaixa','FinanceiroDdaBoleto','ChequeTerceiro',
    'ConciliacaoBancaria','IntegracaoSiengeFila','TituloRenegociacaoAlocacao'];
  for (const model of blockedModels) db[model] = { findOne: async options => {
    assert(options.transaction && options.lock); if (failQuery) throw Error('Consulta indisponivel');
    return (state.blockers[model] || []).find(row => matches(row, options.where)) || null;
  } };
  const referencias = async ({ where }) => state.referencias.filter(r => matches(r, where));
  db.TituloCompartilhadoOrigem = { findAll: referencias };
  db.TituloRenegociacaoAlocacao.findAll = referencias;
  const auditoria = load('src/services/tituloCancelamentoAuditoriaService.js', { '../models': db });
  const service = load('src/services/tituloCancelamentoService.js', {
    'node:crypto': crypto, sequelize: { Op }, '../models': db,
    './authorizationService': { canCancelTitulosFinanceiros: canCancel, getFinanceiroObraScopeIds: async u => u.scope },
    './tituloFinanceiroService': { carregarTituloPorId: async (r, id, options) => {
      assert(options.transaction); if (r.user.financeiro === false || (r.user.scope !== null && !r.user.scope.includes(state.titulo.obra_id))) {
        throw Object.assign(Error('Escopo negado'), { statusCode: 403 });
      } return titulo();
    } }, './securityLogService': { getRequestIp: () => '127.0.0.1' },
    '../validators/tituloCancelamentoValidator': { validateTituloCancelamentoBody: validate },
    './tituloCancelamentoAuditoriaService': auditoria,
    './tituloRegularizacaoDomain': require('../src/services/tituloRegularizacaoDomain'),
    './rhPagamentoRevisaoPolicy': { assertSemRevisaoDp: t => {
      if (t.status_interno_pagar === 'EM EDICAO DP') throw Object.assign(Error('Revisao DP'), { statusCode: 409 });
    } }
  });
  return { req, auditoria, service, blockedModels, get state() { return state; },
    call: (data = body, id = 10) => service.cancelarTitulo(req, id, data),
    fail: kind => { failLog = kind === 'log'; failEvent = kind === 'evento'; failQuery = kind === 'consulta'; },
    get commits() { return commits; }, get rollbacks() { return rollbacks; } };
}
async function main() {
  for (const substituicao of [null, [], { tipo: 'NEGOCIACAO', id: '3' }, { tipo: 'NEGOCIACAO', id: -1 },
    { tipo: 'OUTRO', id: 3 }, { tipo: 'NEGOCIACAO', id: 3, status: 'ABERTO' }]) assert.throws(() => validate({ ...body, substituicao }));
  for (const tipo of ['NEGOCIACAO', 'LOTE_COMPARTILHADO']) {
    const f = fixture(); f.state.titulo.solicitacao_id = 100; f.state.titulo.parceiro_id = 7;
    const substituicao = { tipo, id: 3 }, lote = tipo === 'LOTE_COMPARTILHADO';
    const row = { solicitacao_id: 100, [lote ? 'lote_id' : 'negociacao_id']: 3, [lote ? 'titulo_financeiro_id' : 'titulo_destino_id']: 20 };
    f.state.referencias.push(row);
    f.state.destinos.push({ id: 20, tipo: 'PAGAR', parceiro_id: 7, status: 'ABERTO', [lote ? 'compartilhamento_id' : 'renegociacao_id']: 3 });
    const request = { ...body, substituicao };
    row.solicitacao_id = 101; await assert.rejects(f.call(request), /substituto/);
    f.state.referencias[0].solicitacao_id = 100;
    f.state.destinos[0].status = 'CANCELADO'; await assert.rejects(f.call(request), /substituto/);
    f.state.destinos[0].status = 'ABERTO';
    f.state.destinos[0].parceiro_id = 8; await assert.rejects(f.call(request), /substituto/);
    f.state.destinos[0].parceiro_id = 7;
    const antes = JSON.stringify(f.state.destinos);
    await f.call(request);
    assert.equal(JSON.stringify(f.state.destinos), antes, 'O substituto não é alterado');
    assert.equal(JSON.stringify((await f.auditoria.resumoCancelamento(10)).substituicao), JSON.stringify(substituicao));
    assert.equal((await f.call(request)).idempotente, true);
    await assert.rejects(f.call({ ...request, substituicao: { tipo, id: 4 } }), /ja cancelado/);
    assert.equal(f.state.updates, 1); assert.equal(f.state.logs.length, 1);
  }
  for (const patch of [{ motivo: '' }, { motivo: 'ab' }, { motivo: {} }, { motivo: 123 }, { motivo: 'x'.repeat(1001) },
    { idempotency_key: '' }, { versao: '' }, { versao: '2026-99-40' }, { status: 'QUITADO' }, { autorizadoInternamente: true }]) {
    assert.throws(() => validate({ ...body, ...patch }));
  }
  for (const user of [{ perfil: 'FINANCEIRO' }, { perfil: 'ADMIN' }, { configurada: true, permissoes: ['financeiro.titulos.editar', 'financeiro.titulos.excluir'] }]) {
    assert.equal(await canCancel(user), false);
  }
  for (const user of [{ perfil: 'SUPERADMIN' }, { perfil: 'ADMINISTRADOR' }, { configurada: true, permissoes: [permission] }]) assert.equal(await canCancel(user), true);
  for (const tipo of ['PAGAR', 'RECEBER']) for (const status of ['ABERTO', 'PREVISAO']) {
    const f = fixture(); Object.assign(f.state.titulo, { tipo, status }); const antes = { ...f.state.titulo };
    const result = await f.call(); assert.equal(result.status, 'CANCELADO'); assert.equal(f.commits, 1);
    assert.equal(f.state.titulo.valor_saldo, 0); assert.equal(f.state.titulo.status, 'CANCELADO');
    for (const k of ['valor_original','valor_baixado','juros','multa','deleted_at','obra_id']) assert.equal(f.state.titulo[k], antes[k]);
    assert.equal(f.state.logs.length, 1); assert.equal(f.state.events.length, 1); assert.equal(f.state.logs[0].solicitacao_id, null);
    const resumo = await f.auditoria.resumoCancelamento(10); assert.equal(resumo.motivo, body.motivo); assert.equal(resumo.usuario.id, 99);
    f.state.events = []; // Retencao do log nao apaga historico nem idempotencia.
    assert.equal((await f.auditoria.listarEventos(10)).length, 1);
    assert.equal((await f.call()).idempotente, true); assert.equal(f.state.updates, 1); assert.equal(f.state.logs.length, 1);
    await assert.rejects(f.call({ ...body, motivo: 'Outro motivo' }), /ja cancelado/);
    f.req.user.id = 100; await assert.rejects(f.call(), /ja cancelado/); f.req.user.id = 99;
    f.req.user.permissoes = []; await assert.rejects(f.call(), /Permissao/); f.req.user.permissoes = [permission];
    f.req.user.scope = [2]; await assert.rejects(f.call(), /Escopo/);
  }
  console.log('OK PAGAR/RECEBER, ABERTO/PREVISAO, permissao nominal, trilha permanente e replay sem duplicidade.');
  const patches = [
    { status: 'QUITADO' }, { status: 'PARCIAL' }, { status: 'RENEGOCIADO' }, { status: 'CANCELADO' },
    { valor_baixado: 1 }, { valor_saldo: 0 }, { data_quitacao: '2026-10-19' }, { updatedAt: '2026-10-19T13:00:00.000Z' },
    { compartilhamento_id: 3 }, { renegociacao_id: 3 }, { renegociado_por_id: 3 }, { cartao_id: 1 }, { fatura_cartao_id: 1 },
    { intercompany: true }, { tipo_intercompany: 'RATEIO' }, { transferencia_interna: true }, { valor_impostos: 10 },
    { bloqueado_retorno_obra: true }, { medicao_pagamento: {} }, { medicao_pagamento_origem_id: 1 }, { status_interno_pagar: 'EM EDICAO DP' },
    ...['RH_DP','CONTRATO','COMERCIAL','RECARGA_CARTAO','ADIANTAMENTO','DEVOLUCAO_ADIANTAMENTO','COMPRA_DIRETA_FRETE'].map(origem_titulo => ({ origem_titulo })),
    { status_cobranca: 'EMITIDO' }, { deleted_at: '2026-10-19' }
  ];
  for (const patch of patches) {
    const f = fixture(); Object.assign(f.state.titulo, patch); const antes = JSON.stringify(f.state);
    await assert.rejects(f.call()); assert.equal(JSON.stringify(f.state), antes); assert.equal(f.commits, 0);
  }
  for (const model of fixture().blockedModels) {
    const f = fixture(); f.state.blockers[model] = [{ id: 1, titulo_financeiro_id: 10, titulo_origem_id: 10,
      status: model === 'MovimentoFinanceiro' ? 'ATIVO' : model === 'PagamentoAutorizacaoItem' ? 'ENFILEIRADO' : 'PENDENTE' }];
    const antes = JSON.stringify(f.state); await assert.rejects(f.call()); assert.equal(JSON.stringify(f.state), antes);
  }
  for (const status of ['FALHA_INTEGRACAO','BAIXADO','DESCONHECIDO']) {
    const f = fixture(); f.state.blockers.PaymentIntent = [{ id: 1, titulo_financeiro_id: 10, status }];
    await assert.rejects(f.call(), /bancario/);
  }
  const rateio = fixture(); rateio.state.rateios = [{ obra_id: 2 }]; await assert.rejects(rateio.call(), /rateio/);
  for (const kind of ['log','evento','consulta']) {
    const f = fixture(); f.fail(kind); const antes = JSON.stringify(f.state);
    await assert.rejects(f.call(), /indisponivel/); assert.equal(JSON.stringify(f.state), antes); assert.equal(f.rollbacks, 1);
  }
  const f = fixture(); await Promise.all([f.call(), f.call()]);
  assert.equal(f.state.updates, 1); assert.equal(f.state.logs.length, 1); assert.equal(f.state.events.length, 1);
  f.state.logs[0].payload_json = '{}'; await assert.rejects(f.call(), /inconsistente/);
  console.log('OK bloqueios de baixa/operacoes/origens, consulta falha fechada, versao obsoleta, escopo, rollback e lock serial simulado.');
  const routes = read('src/routes.js');
  const route = routes.split(/\r?\n/).find(l => l.startsWith("router.post('/financeiro/titulos/:id/cancelar',"));
  for (const guard of ['allowFinanceiro','criticalRateLimit','validateNumericIdParam','validateTituloCancelamentoBody']) assert(route.includes(guard));
  const keys = require('../src/services/financeiroRotaPermissoesService').PERMISSOES_ROTAS_FINANCEIRAS;
  assert.deepEqual(keys['POST /financeiro/titulos/:id/cancelar'], [permission]);
  assert(require('../src/constants/moduloPermissoes').ALL_PERMISSION_KEYS.has(permission));
  assert(read('src/controllers/TituloFinanceiroController.js').includes('resumoCancelamento(titulo.id)'));
  assert(read('src/services/tituloFinanceiroService.js').includes('FINANCIAL_TITLE_CANCELLED'));
  const h = require('./validarCartaoOpcionalSolicitacao');
  h.reset(); const titulo = await h.gerar([h.pagamento(3)]);
  titulo.status = 'CANCELADO'; titulo.valor_saldo = 0;
  await assert.rejects(h.isolated.exports.baixarTitulo(h.req, titulo.id, { valor: 200, conta_bancaria_id: 5, data_baixa: '2026-10-19' }));
  await assert.rejects(h.queueModule.exports.enfileirarTitulos(h.req, { titulo_ids: [titulo.id] }));
  assert.equal(h.state.movimentos.length, 0); assert.equal(h.state.fila.length, 0);
  const leitura = fixture(); await leitura.call();
  const controller = load('src/controllers/TituloFinanceiroController.js', {
    '../services/tituloFinanceiroService': { carregarTituloPorId: async () => leitura.state.titulo },
    '../services/pagamentoFilaDestinatarioService': { anexarDetalheTitulo: async () => {} },
    '../services/tituloFinanceiroRelatorioPdfService': {}, '../validators/financialValidators': {},
    '../services/authorizationService': { userHasAreaPermission: async () => true }, '../utils/controllerError': {},
    '../services/tituloCancelamentoAuditoriaService': leitura.auditoria
  });
  let resposta;
  await controller.show({ ...leitura.req, params: { id: 10 } }, { json: data => { resposta = data; } });
  assert.equal(resposta.cancelamento.motivo, body.motivo);
  assert.equal(resposta.cancelamento.usuario.id, 99);
  assert(!Object.hasOwn(resposta.cancelamento, 'request_hash'));
  titulo.id = 10;
  h.dependencies['./tituloDesvincularFaturaAuditoriaService'] = { listarEventos: async () => [] };
  h.dependencies['./favorecidoEdicaoAuditoriaService'] = { listarEventos: async () => [] };
  h.dependencies['./tituloCancelamentoAuditoriaService'] = leitura.auditoria;
  h.models.SecurityEventLog.findAll = async () => leitura.state.events;
  let eventos = await h.isolated.exports.listarAuditoriaTitulo(h.req, 10);
  assert.equal(eventos.length, 1); assert.equal(eventos[0].label, 'Título cancelado');
  assert.equal(eventos[0].metadata.motivo, body.motivo);
  leitura.state.events.length = 0;
  eventos = await h.isolated.exports.listarAuditoriaTitulo(h.req, 10);
  assert.equal(eventos.length, 1); assert.equal(eventos[0].usuario.id, 99);
  console.log('OK show real entrega resumo; baixa/envio canonicos recusam CANCELADO sem criar movimentos/fila.');
  console.log('OK rota, registro central, leitura e auditoria. Nenhum banco, rede ou dado real acessado.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
