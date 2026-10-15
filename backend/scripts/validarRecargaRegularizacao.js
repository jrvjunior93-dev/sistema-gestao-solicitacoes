'use strict';
// Servico/controller reais, modelos em memoria. Nunca carrega .env, banco ou rede.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const Op = { in: Symbol('in'), lt: Symbol('lt') };
const source = fs.readFileSync(path.resolve(__dirname, '../src/services/recargaCartaoRegularizacaoService.js'), 'utf8');
const geo = { id: 1, perfil: 'USUARIO', area: 'GEO', scope: [19] };
function ambiente() {
  const w = { reads: 0, writes: 0, locks: [], failAudit: false,
    data: { Solicitacao: [{ id: 31, codigo: 'SOL-31', obra_id: 19, cancelada: true, status_global: 'PENDENTE', area_responsavel: 'OBRA' }],
      SolicitacaoRecargaCartao: [{ id: 7, solicitacao_id: 31, cartao_recarga_id: 1, titulo_financeiro_id: 80, valor_solicitado: 100, valor_efetivo: 0, status_ciclo: 'AGUARDANDO_PAGAMENTO' }],
      CartaoRecarga: [{ id: 1, nome: 'Joao', ultimos_quatro: '1234' }],
      TituloFinanceiro: [{ id: 80, solicitacao_id: 31, origem_titulo: 'RECARGA_CARTAO', tipo: 'PAGAR', status: 'ABERTO', valor_original: 100, valor_baixado: 0, valor_saldo: 100 }],
      CartaoRecargaPrestacao: [], Historico: [], MovimentoFinanceiro: [], PaymentIntent: [], PagamentoManualFilaItem: [],
      PagamentoAutorizacaoItem: [], IntegracaoSiengeFila: [], CaixaPagamentoRemessaItem: [], Obra: [] } };
  function matches(row, where = {}) {
    return Reflect.ownKeys(where).every(k => {
      const value = where[k];
      if (value && typeof value === 'object') {
        if (Op.in in value) return value[Op.in].includes(row[k]);
        if (Op.lt in value) return row[k] < value[Op.lt];
      }
      return row[k] === value;
    });
  }
  function row(name, data) {
    if (!data) return null;
    Object.defineProperty(data, 'update', { configurable: true, enumerable: false, value: async (values, opts) => {
      assert(opts?.transaction, 'toda escrita precisa de transacao'); w.writes++; Object.assign(data, values); return data;
    } });
    return data;
  }
  const models = {};
  for (const name of Object.keys(w.data)) models[name] = {
    unscoped() { return this; },
    async findByPk(id, opts = {}) { w.reads++; if (opts.lock) w.locks.push(name + ':' + id); return row(name, w.data[name].find(r => r.id === Number(id))); },
    async findAll(opts = {}) {
      w.reads++;
      let rows = w.data[name].filter(r => matches(r, opts.where));
      if (name === 'Solicitacao' && opts.include) rows = rows.filter(s => w.data.SolicitacaoRecargaCartao.some(r => r.solicitacao_id === s.id)).map(s => ({ ...s,
        recargasCartao: w.data.SolicitacaoRecargaCartao.filter(r => r.solicitacao_id === s.id).map(r => ({ ...r, cartao: w.data.CartaoRecarga.find(c => c.id === r.cartao_recarga_id) })), obra: { nome: 'Obra QA' } }));
      if (opts.order?.[0]?.[1] === 'DESC') rows.sort((a, b) => b.id - a.id);
      if (opts.limit) rows = rows.slice(0, opts.limit);
      return rows.map(r => row(name, r));
    },
    async findOne(opts) { return (await this.findAll(opts))[0] || null; },
    async create(values, opts) {
      assert(opts?.transaction); if (name === 'Historico' && w.failAudit) throw Error('falha auditada');
      w.writes++; const data = { id: w.data[name].length + 1, ...values }; w.data[name].push(data); return row(name, data);
    },
    async findOrCreate(opts) { const atual = await this.findOne(opts); return atual ? [atual, false] : [await this.create({ ...opts.where, ...opts.defaults }, opts), true]; }
  };
  let fila = Promise.resolve();
  models.sequelize = { transaction(executar) {
    const result = fila.then(async () => {
      const antes = structuredClone(w.data), writes = w.writes;
      try { return await executar({ LOCK: { UPDATE: 'UPDATE' } }); }
      catch (e) { w.data = antes; w.writes = writes; throw e; }
    }); fila = result.catch(() => {}); return result;
  } };
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, console, require(name) {
    if (name === 'node:crypto') return require(name);
    if (name === 'sequelize') return { Op };
    if (name === '../models') return models;
    if (name === './authorizationService') return {
      hasObraAccess: async (u, id) => u.perfil === 'SUPERADMIN' || u.scope?.includes(Number(id)),
      getUserObraScopeIds: async u => u.perfil === 'SUPERADMIN' ? null : u.scope || []
    };
    if (name === './cartaoRecargaSaldoService') return { bloquearCartao: async (id, transaction) => {
      assert(transaction); w.locks.push('Cartao:' + id); if (!w.data.CartaoRecarga.some(c => c.id === id)) throw Error('Cartao ausente');
    } };
    if (name === './setorCapabilityService') return { findSetorByCapability: async () => ({ codigo: 'GEO' }), resolveSetorPersistenciaValue: s => s.codigo };
    throw Error('Dependencia nao simulada: ' + name);
  } });
  w.service = module.exports; return w;
}
function pago(w, status = null) {
  Object.assign(w.data.TituloFinanceiro[0], { status: 'QUITADO', valor_baixado: 100, valor_saldo: 0 });
  Object.assign(w.data.SolicitacaoRecargaCartao[0], { valor_efetivo: 100, status_ciclo: 'PRESTACAO_PENDENTE' });
  if (status) w.data.CartaoRecargaPrestacao.push({ id: 21, solicitacao_recarga_id: 7, valor_base: 100, status, valor_despesas: 30, observacoes: 'Preservar', validado_por: 9 });
}
const payload = ctx => ({ motivo: 'Conferencia da exclusao de teste', revisao: ctx.revisao, chave_idempotencia: 'regularizacao-teste-20261015' });
async function rejeita(w, modify, regex) {
  if (modify) modify(w);
  const ctx = await w.service.consultar(31, geo);
  assert.equal(ctx.pode_regularizar, false);
  assert.match(ctx.impedimento, regex);
  await assert.rejects(() => w.service.regularizar(31, payload(ctx), geo), regex);
  assert.equal(w.writes, 0);
}
(async () => {
  {
    const w = ambiente(), ctx = await w.service.consultar(31, geo); assert.equal(w.writes, 0);
    assert.equal(ctx.acao, 'ENCERRAR_SEM_PAGAMENTO'); assert.equal(ctx.pode_regularizar, true);
    const p = payload(ctx); const r = await w.service.regularizar(31, p, geo);
    assert.equal(r.recuperada, false); assert.equal(w.data.Solicitacao[0].cancelada, true);
    assert.equal(w.data.TituloFinanceiro[0].status, 'CANCELADO'); assert.equal(w.data.TituloFinanceiro[0].valor_saldo, 0);
    assert.equal(w.data.TituloFinanceiro[0].valor_original, 100); assert.equal(w.data.SolicitacaoRecargaCartao[0].status_ciclo, 'CANCELADA');
    assert.equal(w.data.CartaoRecargaPrestacao.length, 0); assert.equal(w.data.Historico.length, 1);
    const audit = JSON.parse(w.data.Historico[0].metadata); assert.equal(audit.antes[0].titulo_status, 'ABERTO'); assert.equal(audit.antes[0].valor_saldo, 100);
    const writes = w.writes; assert.equal((await w.service.regularizar(31, p, geo)).replay, true); assert.equal(w.writes, writes);
    await assert.rejects(() => w.service.regularizar(31, { ...p, motivo: 'Motivo diferente apos repetir' }, geo), /dados diferentes/);
    assert.equal(w.locks[0], 'Cartao:1'); assert.equal(w.locks[1], 'Solicitacao:31');
  }
  for (const status of [null, 'PENDENTE', 'REJEITADA', 'ENVIADA', 'VALIDADA']) {
    const w = ambiente(); pago(w, status);
    const titulo = JSON.stringify(w.data.TituloFinanceiro), prestacao = JSON.stringify(w.data.CartaoRecargaPrestacao);
    const ctx = await w.service.consultar(31, geo); const p = payload(ctx);
    const r = await w.service.regularizar(31, p, geo);
    assert.equal(r.recuperada, true); assert.equal(w.data.Solicitacao[0].cancelada, false); assert.equal(w.data.Solicitacao[0].area_responsavel, 'GEO');
    assert.equal(JSON.stringify(w.data.TituloFinanceiro), titulo, 'titulo pago nunca e reescrito');
    if (status) assert.equal(JSON.stringify(w.data.CartaoRecargaPrestacao), prestacao, 'prestacao existente nunca e resetada');
    else { assert.equal(w.data.CartaoRecargaPrestacao.length, 1); assert.equal(w.data.CartaoRecargaPrestacao[0].valor_base, 100); }
    assert.equal((await w.service.regularizar(31, p, geo)).replay, true); assert.equal(w.data.Historico.length, 1);
  }
  {
    const w = ambiente(); pago(w, 'ENVIADA');
    w.data.CartaoRecarga.push({ id: 2, nome: 'Segundo', ultimos_quatro: '9876' });
    w.data.SolicitacaoRecargaCartao.push({ id: 8, solicitacao_id: 31, cartao_recarga_id: 2, titulo_financeiro_id: 81, valor_solicitado: 50, valor_efetivo: 0, status_ciclo: 'AGUARDANDO_PAGAMENTO' });
    w.data.TituloFinanceiro.push({ id: 81, solicitacao_id: 31, origem_titulo: 'RECARGA_CARTAO', tipo: 'PAGAR', status: 'PREVISAO', valor_original: 50, valor_baixado: 0, valor_saldo: 50 });
    const ctx = await w.service.consultar(31, geo); assert.equal(ctx.recargas.length, 2);
    await w.service.regularizar(31, payload(ctx), geo);
    assert.equal(w.data.TituloFinanceiro[0].status, 'QUITADO'); assert.equal(w.data.TituloFinanceiro[1].status, 'CANCELADO');
    assert.equal(w.data.Solicitacao[0].status_global, 'ATENDIDO'); assert.equal(w.data.CartaoRecargaPrestacao.length, 1);
    assert.equal(w.data.SolicitacaoRecargaCartao[1].status_ciclo, 'CANCELADA');
  }
  for (const [model, status] of [['PaymentIntent', 'ENVIADO_AO_BANCO'], ['PagamentoManualFilaItem', 'PENDENTE'], ['PagamentoAutorizacaoItem', 'AUTORIZADO'], ['IntegracaoSiengeFila', 'PENDENTE'], ['CaixaPagamentoRemessaItem', 'GERADO']]) {
    await rejeita(ambiente(), w => w.data[model].push({ id: 1, titulo_financeiro_id: 80, status }), /processamento/);
  }
  await rejeita(ambiente(), w => w.data.TituloFinanceiro.splice(0), /Vinculo financeiro/);
  await rejeita(ambiente(), w => { w.data.TituloFinanceiro[0].origem_titulo = 'MANUAL'; }, /Vinculo financeiro/);
  await rejeita(ambiente(), w => { w.data.TituloFinanceiro[0].renegociacao_id = 5; }, /protegido/);
  await rejeita(ambiente(), w => { w.data.SolicitacaoRecargaCartao[0].valor_efetivo = 100; }, /divergente/);
  await rejeita(ambiente(), w => w.data.MovimentoFinanceiro.push({ id: 1, titulo_financeiro_id: 80, status: 'ATIVO' }), /movimento financeiro/);
  await rejeita(ambiente(), w => { pago(w, 'VALIDANDO'); }, /processada/);
  await rejeita(ambiente(), w => { pago(w, 'PENDENTE'); w.data.TituloFinanceiro[0].deleted_at = '2026-10-15'; }, /divergente/);
  await rejeita(ambiente(), w => { pago(w, 'PENDENTE'); w.data.CartaoRecargaPrestacao[0].valor_base = 200; }, /divergentes/);
  {
    const w = ambiente(); pago(w, 'PENDENTE');
    for (const [name, status] of [['PaymentIntent', 'BAIXADO'], ['PagamentoManualFilaItem', 'BAIXADO'], ['IntegracaoSiengeFila', 'SUCESSO']]) w.data[name].push({ id: 1, titulo_financeiro_id: 80, status });
    const ctx = await w.service.consultar(31, geo); assert.equal(ctx.pode_regularizar, true);
    await w.service.regularizar(31, payload(ctx), geo);
  }
  {
    const w = ambiente(); const ctx = await w.service.consultar(31, geo); pago(w);
    await assert.rejects(() => w.service.regularizar(31, payload(ctx), geo), /mudou/); assert.equal(w.writes, 0);
  }
  {
    const w = ambiente(); const ctx = await w.service.consultar(31, geo);
    w.data.TituloFinanceiro[0].valor_original = 500;
    await assert.rejects(() => w.service.regularizar(31, payload(ctx), geo), /mudou/); assert.equal(w.writes, 0);
  }
  {
    const w = ambiente(); const ctx = await w.service.consultar(31, geo);
    await w.service.regularizar(31, { ...payload(ctx), titulo_id: 999, valor_pago: 900, acao: 'RECUPERAR_PRESTACAO', obra_id: 99 }, geo);
    assert.equal(w.data.Solicitacao[0].cancelada, true); assert.equal(w.data.TituloFinanceiro[0].valor_baixado, 0);
    assert.equal(w.data.TituloFinanceiro[0].id, 80); assert.equal(w.data.Solicitacao[0].obra_id, 19);
  }
  {
    const w = ambiente(); pago(w); w.data.Solicitacao[0].cancelada = false;
    await assert.rejects(() => w.service.consultar(31, geo), /ja esta ativa/);
    await assert.rejects(() => w.service.regularizar(31, { ...payload({ revisao: 'a'.repeat(64) }) }, geo), /ja esta ativa/);
    assert.equal(w.writes, 0);
  }
  {
    const w = ambiente(); const ctx = await w.service.consultar(31, geo); const p = payload(ctx);
    await assert.rejects(() => w.service.regularizar(31, { ...p, motivo: '' }, geo), /Informe motivo/);
    await assert.rejects(() => w.service.regularizar(31, { ...p, chave_idempotencia: '' }, geo), /Informe motivo/);
    await assert.rejects(() => w.service.consultar('31abc', geo), /invalida/); assert.equal(w.writes, 0);
  }
  {
    const w = ambiente(); const ctx = await w.service.consultar(31, geo); w.failAudit = true;
    const antes = JSON.stringify(w.data); await assert.rejects(() => w.service.regularizar(31, payload(ctx), geo), /falha auditada/);
    assert.equal(JSON.stringify(w.data), antes); assert.equal(w.writes, 0);
  }
  {
    const w = ambiente(); const ctx = await w.service.consultar(31, geo); const p = payload(ctx);
    const ambos = await Promise.all([w.service.regularizar(31, p, geo), w.service.regularizar(31, p, geo)]);
    assert.equal(ambos.filter(r => r.replay).length, 1); assert.equal(w.data.Historico.length, 1);
  }
  for (const user of [{ id: 2, area: 'OBRA' }, { id: 3, area: 'DEPARTAMENTO PESSOAL' }, { id: 4, perfil: 'ADMIN', area: 'FINANCEIRO' }]) {
    const w = ambiente(); await assert.rejects(() => w.service.listar(user), /Somente GEO/);
    await assert.rejects(() => w.service.consultar(31, user), /Somente GEO/);
    await assert.rejects(() => w.service.regularizar(31, {}, user), /Somente GEO/); assert.equal(w.reads, 0);
  }
  {
    const w = ambiente(); await assert.rejects(() => w.service.consultar(31, { ...geo, scope: [] }), /Acesso negado/);
    assert.equal((await w.service.listar({ ...geo, scope: [] })).items.length, 0); assert.equal(w.writes, 0);
    assert.equal((await w.service.listar(geo)).items.length, 1);
    assert.equal((await w.service.listar(geo, { codigo: 'SOL-404' })).items.length, 0);
    assert.equal((await w.service.listar(geo, { antes_de: 31 })).items.length, 0);
    const ctx = await w.service.consultar(31, { id: 5, perfil: 'SUPERADMIN' }); await w.service.regularizar(31, payload(ctx), { id: 5, perfil: 'SUPERADMIN' });
  }
  const routes = fs.readFileSync(path.resolve(__dirname, '../src/routes.js'), 'utf8');
  assert.match(routes, /router\.post\('\/recargas-cartao\/regularizacao\/:id', criticalRateLimit/);
  assert.match(routes, /'\/recargas-cartao\/solicitacoes\/:solicitacaoOperacionalId'/);
  const controllerModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/controllers/RecargaCartaoRegularizacaoController.js'), 'utf8'), {
    module: controllerModule, require() { return {
      listar: async user => { assert.equal(user.area, 'OBRA'); throw Object.assign(Error('negado'), { statusCode: 403 }); },
      consultar: async () => { throw Error('segredo interno'); }, regularizar: async (id, p, user) => ({ id, p, user })
    }; }
  });
  const response = () => ({ codigo: 200, body: null, status(n) { this.codigo = n; return this; }, json(b) { this.body = b; return this; } });
  let res = response(); await controllerModule.exports.listar({ user: { area: 'OBRA' }, query: {}, body: { area: 'GEO' } }, res);
  assert.equal(res.codigo, 403); res = response(); await controllerModule.exports.consultar({ params: { id: 31 } }, res);
  assert.equal(res.codigo, 500); assert(!res.body.error.includes('segredo'));
  const prazosModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/services/prazosOperacionaisRotaService.js'), 'utf8'), {
    module: prazosModule, require(name) { if (name === 'sequelize') return { Op }; if (name === '../models') return {}; throw Error(name); }
  });
  const prazos = prazosModule.exports;
  const obras = await prazos.obrasDaOperacao({ path: '/recargas-cartao/regularizacao/31', body: {}, method: 'POST' }, { Solicitacao: { findAll: async () => [{ id: 31, obra_id: 19 }] } });
  assert.equal(JSON.stringify(obras), '[19]');
  console.log('Regularizacao: ACL/escopo, consulta sem escrita, encerramento sem baixa, recuperacao paga/mista, prestacoes e titulos preservados, filas protegidas, replay/concorrencia, revisao e rollback auditado aprovados. Sem banco/rede.');
})().catch(e => { console.error(e); process.exitCode = 1; });
