'use strict';
// Fluxo real, transações/constraints SQLite em memória e adaptador Sequelize.
// Não carrega .env, modelos runtime nem acessa banco/serviço externo.
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const { Op, Sequelize, DataTypes } = require('sequelize');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { criarServico, normalizar, PERMISSOES } = require('../src/services/pagamentoEnvioRetiradaService');
const { assertSemRevisaoDp } = require('../src/services/rhPagamentoRevisaoPolicy');
const req = { user: { id: 31 } };
function fixture() {
  const sql = new DatabaseSync(':memory:');
  const tabelas = ['TituloFinanceiro', 'TituloFinanceiroRateio', 'PagamentoAutorizacaoLote', 'PagamentoAutorizacaoItem', 'PagamentoManualFilaItem', 'PaymentIntent', 'SecurityEventLog', 'PagamentoAutorizacaoEvento'];
  for (const t of tabelas) sql.exec(`CREATE TABLE ${t}(id INTEGER PRIMARY KEY AUTOINCREMENT, dados TEXT NOT NULL)`);
  sql.exec('CREATE TABLE PagamentoEnvioRetirada(id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER, chave TEXT, dados TEXT NOT NULL, UNIQUE(usuario_id,chave))');
  let serial = Promise.resolve(); const locks = [], writes = [];
  const ctx = { scope: null, allowed: Object.values(PERMISSOES), env: { paymentOwnerApprovalMode: 'PILOT' }, failAudit: false, failAccess: false, sharedDeny: false };
  const db = {};
  function modelo(t) {
    const encode = o => JSON.stringify(Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v !== 'function')));
    const wrap = o => Object.assign(o, { async update(patch, options) {
      assert(options.transaction, 'Toda escrita participa da transacao'); writes.push([t, this.id, patch]);
      Object.assign(this, patch); sql.prepare(`UPDATE ${t} SET dados=? WHERE id=?`).run(encode(this), this.id); return this;
    } });
    function matches(r, w) { return Reflect.ownKeys(w || {}).every(k => {
      const v = w[k];
      if (v && typeof v === 'object') return Reflect.ownKeys(v).every(op => op === Op.in ? v[op].includes(r[k]) : op === Op.notIn ? !v[op].includes(r[k]) : assert.fail('Operador não coberto'));
      return r[k] === v;
    }); }
    return {
      async findAll(o = {}) { assert(o.transaction); if (o.lock) locks.push(t); return sql.prepare(`SELECT id,dados FROM ${t} ORDER BY id`).all()
        .map(r => ({ ...JSON.parse(r.dados), id: r.id })).filter(r => matches(r, o.where)).slice(0, o.limit || Infinity).map(wrap); },
      async findOne(o) { return (await this.findAll(o))[0] || null; },
      async create(o, options) {
        assert(options.transaction); writes.push([t, null, o]); if (t === 'SecurityEventLog' && ctx.failAudit) throw Error('Falha auditoria QA');
        const result = t === 'PagamentoEnvioRetirada' ? sql.prepare(`INSERT INTO ${t}(usuario_id,chave,dados) VALUES(?,?,?)`).run(o.usuario_id, o.chave, encode(o))
          : sql.prepare(`INSERT INTO ${t}(dados) VALUES(?)`).run(encode(o));
        return wrap({ ...o, id: Number(result.lastInsertRowid) });
      }
    };
  }
  for (const t of [...tabelas, 'PagamentoEnvioRetirada']) db[t] = modelo(t);
  db.sequelize = { transaction(fn) {
    const run = async () => { sql.exec('BEGIN'); try { const r = await fn({ LOCK: { UPDATE: 'UPDATE' } }); sql.exec('COMMIT'); return r; } catch (e) { sql.exec('ROLLBACK'); throw e; } };
    const p = serial.then(run); serial = p.catch(() => {}); return p;
  } };
  // Executa o encadeador de eventos real com modelo isolado, sem importar runtime.
  const mod = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/services/pagamentoAutorizacaoEventosService.js'), 'utf8'), {
    module: mod, require: p => p === '../models' ? db : require(p), Date
  });
  const service = criarServico({ db, env: ctx.env, auth: {
    userHasNominalAreaPermission: async (_u, keys) => keys.every(k => ctx.allowed.includes(k)), getFinanceiroObraScopeIds: async () => ctx.scope
  }, recordEvent: mod.exports.recordEvent, assertSemRevisaoDp,
  assertEscopoCompartilhado: async () => { if (ctx.sharedDeny) throw Object.assign(Error('Escopo compartilhado'), { statusCode: 403 }); },
  assertTituloAccess: async () => { if (ctx.failAccess) throw Object.assign(Error('Acesso financeiro'), { statusCode: 403 }); } });
  async function seed(model, value) { return db.sequelize.transaction(tx => db[model].create(value, { transaction: tx })); }
  async function title(id, extra = {}) { await seed('TituloFinanceiro', { id, codigo: `TIT-${id}`, tipo: 'PAGAR', status: 'ABERTO', obra_id: 1, valor_saldo: 100, valor_baixado: 0, updatedAt: '2026-10-23', ...extra }); }
  async function digital(id, status = 'PENDENTE') {
    const lot = await seed('PagamentoAutorizacaoLote', { status: status === 'ENFILEIRADO' ? 'CONCLUIDO' : 'AGUARDANDO', revisao_autorizacao: 3, dossie_hash: 'imutavel' });
    return seed('PagamentoAutorizacaoItem', { lote_id: lot.id, titulo_financeiro_id: id, status, snapshot_hash: 'assinado', snapshot_json: { documento: 'historico' } });
  }
  async function queue(id, extra = {}) { return seed('PagamentoManualFilaItem', { titulo_financeiro_id: id, status: 'PENDENTE', updatedAt: '2026-10-23', instrumento_pagamento_json: { boleto: 'inalterado' }, comprovante_key: 's3-original', ...extra }); }
  const rows = t => sql.prepare(`SELECT id,dados FROM ${t} ORDER BY id`).all().map(r => ({ ...JSON.parse(r.dados), id: r.id }));
  const envio = (id, origem, ref) => ({ titulo_id: id, origem, referencia_id: ref });
  const body = async itens => ({ itens, motivo: 'Retirar encaminhamento duplicado', referencia: (await service.preview(req, { itens })).referencia, idempotency_key: randomUUID() });
  return { db, ctx, sql, locks, writes, service, seed, title, digital, queue, rows, envio, body };
}
const denies = (fn, code) => assert.rejects(fn, e => !code || e.statusCode === code);
async function run() {
  for (const body of [null, {}, { itens: [] }, { itens: Array(51).fill({}) }, { itens: [null] }, { itens: [{ titulo_id: '1', referencia_id: 1, origem: 'FILA' }] },
    { itens: [{ titulo_id: 1, referencia_id: 1, origem: 'FILA', valor: 0 }] }, { itens: [{ titulo_id: 1, referencia_id: 1, origem: 'FILA' }], titulo: 2 }]) assert.throws(() => normalizar(body));
  const f = fixture();
  await f.title(1); await f.title(2, { status: 'PARCIAL', valor_baixado: 40, valor_saldo: 60 });
  const a = await f.digital(1), b = await f.digital(2, 'ENFILEIRADO');
  const q = await f.queue(2, { status: 'DIVERGENTE', movimento_financeiro_id: 88, motivo: 'Pagamento parcial', valor_pago: 40 });
  await f.db.sequelize.transaction(async transaction => (await f.db.PagamentoAutorizacaoItem.findOne({ where: { id: b.id }, transaction })).update({ fila_item_id: q.id }, { transaction }));
  const originalTitles = f.rows('TituloFinanceiro'), originalSnapshot = f.rows('PagamentoAutorizacaoItem').map(i => [i.snapshot_hash, i.snapshot_json]);
  const itens = [f.envio(2, 'FILA', q.id), f.envio(1, 'AUTORIZACAO', a.id)];
  f.writes.length = 0; const preview = await f.service.preview(req, { itens }); assert.equal(preview.saldo_total, 160); assert.equal(f.writes.length, 0);
  const body = await f.body(itens); f.locks.length = 0;
  const result = await f.service.confirmar(req, body); assert.equal(result.retirados.length, 2);
  assert.deepEqual(f.rows('TituloFinanceiro'), originalTitles, 'Nenhum valor/status financeiro alterado');
  assert.deepEqual(f.rows('PagamentoAutorizacaoItem').map(i => [i.snapshot_hash, i.snapshot_json]), originalSnapshot);
  assert(f.rows('PagamentoAutorizacaoItem').every(i => i.status === 'RETIRADO'));
  const fila = f.rows('PagamentoManualFilaItem')[0];
  assert.equal(fila.status, 'RESOLVIDO'); assert.equal(fila.movimento_financeiro_id, 88); assert.equal(fila.valor_pago, 40); assert.equal(fila.comprovante_key, 's3-original'); assert.equal(fila.instrumento_pagamento_json.boleto, 'inalterado');
  assert.equal(f.rows('PagamentoAutorizacaoItem')[1].fila_item_id, q.id, 'Vinculo historico da baixa preservado');
  assert(f.rows('PagamentoAutorizacaoLote').every(l => l.status === 'CANCELADO' && l.revisao_autorizacao === 4));
  assert.equal(f.rows('SecurityEventLog').length, 2); assert.equal(f.rows('PagamentoAutorizacaoEvento').length, 2);
  assert(f.locks.indexOf('TituloFinanceiro') < f.locks.indexOf('PagamentoAutorizacaoLote'));
  assert(f.locks.indexOf('PagamentoAutorizacaoLote') < f.locks.indexOf('PagamentoAutorizacaoItem'));
  const count = f.writes.length; assert.equal((await f.service.confirmar(req, body)).idempotente, true); assert.equal(count, f.writes.length);
  await denies(() => f.service.confirmar(req, { ...body, motivo: 'Outro corpo' }), 409);
  await denies(() => f.service.confirmar(req, { ...body, idempotency_key: randomUUID() }), 409);
  // Uma nova aprovacao e um novo envio preservam o historico retirado.
  const novo = await f.digital(1); assert.equal((await f.service.preview(req, { itens: [f.envio(1, 'AUTORIZACAO', novo.id)] })).itens.length, 1);
  await denies(() => f.service.preview(req, { itens: [f.envio(1, 'AUTORIZACAO', a.id)] }), 409);
  f.sql.close();
  // Matriz de bloqueios e atomicidade: segundo titulo invalido nao altera primeiro.
  for (const caso of ['permissao', 'escopo', 'rateio', 'compartilhado', 'acesso', 'quitado', 'banco', 'dp', 'duas-filas', 'edicao', 'ciclo-novo', 'saldo-mudou', 'auditoria']) {
    const f = fixture(); await f.title(1); await f.title(2); const a = await f.digital(1); const q = await f.queue(2);
    const itens = [f.envio(1, 'AUTORIZACAO', a.id), f.envio(2, 'FILA', q.id)]; const body = await f.body(itens);
    if (caso === 'permissao') f.ctx.allowed = [PERMISSOES.AUTORIZACAO];
    if (caso === 'escopo') f.ctx.scope = [2];
    if (caso === 'rateio') { f.ctx.scope = [1]; await f.seed('TituloFinanceiroRateio', { titulo_financeiro_id: 2, obra_id: 2 }); }
    if (caso === 'compartilhado') f.ctx.sharedDeny = true;
    if (caso === 'acesso') f.ctx.failAccess = true;
    if (caso === 'banco') await f.seed('PaymentIntent', { titulo_financeiro_id: 2, status: 'ENVIADO' });
    if (caso === 'duas-filas') await f.queue(2);
    if (caso === 'ciclo-novo') await f.digital(2);
    if (caso === 'auditoria') f.ctx.failAudit = true;
    await f.db.sequelize.transaction(async transaction => {
      const title = await f.db.TituloFinanceiro.findOne({ where: { id: 2 }, transaction });
      if (caso === 'quitado') await title.update({ status: 'QUITADO', valor_saldo: 0 }, { transaction });
      if (caso === 'saldo-mudou') await title.update({ valor_saldo: 90 }, { transaction });
      if (caso === 'dp') await title.update({ origem_titulo: 'RH_DP', status_interno_pagar: 'EM EDICAO DP' }, { transaction });
      if (caso === 'compartilhado') await title.update({ compartilhamento_id: 1 }, { transaction });
      if (caso === 'edicao') await (await f.db.PagamentoManualFilaItem.findOne({ where: { id: q.id }, transaction })).update({ status: 'EM_EDICAO' }, { transaction });
    });
    const antes = f.rows('PagamentoAutorizacaoItem'); const filasAntes = f.rows('PagamentoManualFilaItem');
    await denies(() => f.service.confirmar(req, body));
    assert.deepEqual(f.rows('PagamentoAutorizacaoItem'), antes, caso); assert.deepEqual(f.rows('PagamentoManualFilaItem'), filasAntes, caso);
    assert.equal(f.rows('PagamentoEnvioRetirada').length, 0, caso); assert.equal(f.rows('SecurityEventLog').length, 0, caso); f.sql.close();
  }
  // Fila direta e duas chamadas simultaneas: apenas um recibo/um evento.
  const g = fixture(); await g.title(1); const q1 = await g.queue(1); const pedido = await g.body([g.envio(1, 'FILA', q1.id)]);
  const [r1, r2] = await Promise.all([g.service.confirmar(req, pedido), g.service.confirmar(req, pedido)]);
  assert.equal(r1.retirada_id, r2.retirada_id); assert.equal(g.rows('PagamentoEnvioRetirada').length, 1); assert.equal(g.rows('SecurityEventLog').length, 1); assert.equal(g.rows('PagamentoAutorizacaoLote').length, 0);
  g.ctx.allowed = []; await denies(() => g.service.confirmar(req, pedido), 403); g.sql.close();
  // Retirada parcial de um lote: outros itens permanecem ativos. Evento
  // encadeado adicional preserva a trilha preexistente do lote.
  const h = fixture(); await h.title(1); await h.title(2);
  const itemH = await h.digital(1);
  const sibling = await h.seed('PagamentoAutorizacaoItem', { lote_id:itemH.lote_id,titulo_financeiro_id:2,status:'PENDENTE',snapshot_hash:'outro-assinado' });
  await h.seed('PagamentoAutorizacaoEvento',{lote_id:itemH.lote_id,evento_hash:'evento-anterior'});
  const hBody = await h.body([h.envio(1,'AUTORIZACAO',itemH.id)]); await h.service.confirmar(req,hBody);
  assert.equal(h.rows('PagamentoAutorizacaoLote')[0].status,'AGUARDANDO');
  assert.equal(h.rows('PagamentoAutorizacaoItem').find(i=>i.id===sibling.id).status,'PENDENTE');
  assert.equal(h.rows('PagamentoAutorizacaoEvento').at(-1).hash_anterior,'evento-anterior');
  h.sql.close();
  // SQL real da migration: composite unique e FK sem alterar tabelas financeiras.
  const sequelize = new Sequelize('qa', 'qa', 'qa', { dialect: 'mysql', logging: false }); const queries = [];
  sequelize.query = async sql => { queries.push(sql); return [[{ total: 0 }]]; };
  const migration = require('../migrations/202610230003_pagamento_envios_retiradas');
  await migration.up({ sequelize, queryInterface: sequelize.getQueryInterface(), DataTypes });
  assert(queries.some(sql => /CREATE TABLE.*pagamento_envios_retiradas/.test(sql) && /UNIQUE[^]*`usuario_id`, `chave`/.test(sql) && /REFERENCES `users`/.test(sql)));
  const schemaCols=Object.fromEntries(['id','usuario_id','chave','pedido_hash','resultado','createdAt','updatedAt'].map(k=>[k,{}]));
  const existing={sequelize:{query:async()=>[[{total:1}]]},queryInterface:{describeTable:async()=>schemaCols,showIndex:async()=>[{unique:true,fields:[{attribute:'usuario_id'},{attribute:'chave'}]}]},DataTypes};
  await migration.up(existing);
  await assert.rejects(migration.up({...existing,queryInterface:{...existing.queryInterface,showIndex:async()=>[]}}),/incompativel/);
  const model=require('../src/models/PagamentoEnvioRetirada')(sequelize,DataTypes);
  assert(model.options.indexes.some(i=>i.unique&&i.fields.join(',')==='usuario_id,chave'));
  await assert.rejects(migration.down); await sequelize.close();
  console.log('OK: retirada isolada, aprovacao/fila direta/digital/parcial, snapshots e baixas preservados; permissoes/escopos/DP/banco, concorrencia serializada, idempotencia, rollback de auditoria e DDL MySQL. Nenhum banco real acessado.');
}
module.exports = { fixture };
if (require.main === module) run().catch(e => { console.error(e); process.exitCode = 1; });
