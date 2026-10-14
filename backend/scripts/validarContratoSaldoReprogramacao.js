'use strict';
// Servico real, modelos em memoria, transacao/locks simulados. Sem .env/banco/rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { Op } = require('sequelize');
const moedas = require('../src/services/contratoParcelasService');
const copia = v => JSON.parse(JSON.stringify(v));
let state, fila = Promise.resolve(), falhar = '';
const user = { id: 1, permite: true, obras: [7] };
function reset() {
  falhar = '';
  state = { contrato: { id: 4, codigo: 'CT-0004', obra_id: 7, ativo: true, status_contrato: 'ATIVO',
    fluxo_novo: true, solicitacao_id: 100, categoria_financeira_id: 8, valor_total: 44100, valor_aditivos: 0 },
    parcelas: [{ id: 1, numero: 1, valor: 9999.68, valor_previsto: 9999.68, parceiro_id: 5, status: 'APROVADA', titulo_financeiro_id: 1 },
      { id: 2, numero: 2, valor: 10000, valor_previsto: 34100.32, parceiro_id: 5, status: 'APROVADA', titulo_financeiro_id: 2 }],
    medidas: [{ contrato_parcela_id: 1, valor_medido: 9999.68 }, { contrato_parcela_id: 2, valor_medido: 10000 }],
    titulos: [{ id: 1, status: 'QUITADO', valor: 9999.68 }, { id: 2, status: 'QUITADO', valor: 10000 }], historicos: [] };
}
const instance = data => ({ ...data, async update(p, options) {
  assert.ok(options.transaction); Object.assign(data, p); Object.assign(this, p); return this;
} });
const models = {
  sequelize: { async transaction(fn) {
    const anterior = fila;
    let liberar; fila = new Promise(r => { liberar = r; });
    await anterior; const snapshot = copia(state);
    try { return await fn({ LOCK: { UPDATE: 'UPDATE' } }); }
    catch (e) { state = snapshot; throw e; }
    finally { liberar(); }
  } },
  Contrato: { async findByPk(id, options) {
    if (options.transaction) assert.equal(options.lock, 'UPDATE');
    return Number(id) === 4 ? instance(state.contrato) : null;
  } },
  ContratoParcela: { async findAll(options) {
    assert.equal(options.where.contrato_id, 4);
    if (options.transaction) assert.equal(options.lock, 'UPDATE');
    return state.parcelas.map(instance);
  }, async create(data, options) {
    assert.ok(options.transaction);
    const row = { id: Math.max(...state.parcelas.map(p => p.id)) + 1, ...data };
    state.parcelas.push(row); return instance(row);
  } },
  MedicaoParcela: { async findAll(options) {
    assert.equal(options.where.devolvido_em, null);
    assert.equal(options.include[0].required, true);
    assert.deepEqual(copia(options.include[0].where.status_global[Op.notIn]), ['CANCELADA', 'CANCELADO']);
    return state.medidas;
  } },
  Solicitacao: {}, ContratoCredor: { async findAll() { return [{ parceiro_id: 5 }]; } },
  ContratoApropriacao: { async findAll() { return [{ apropriacao_id: 10, percentual: 60 }, { apropriacao_id: 11, percentual: 40 }]; } },
  Historico: { async findOne({ where }) { return state.historicos.find(h => Object.entries(where).every(([k, v]) => h[k] === v)); },
    async create(data, options) { assert.ok(options.transaction); if (falhar === 'historico') throw new Error('FALHA_AUDITORIA');
      state.historicos.push(copia(data)); return data; } }
};
const deps = {
  'node:crypto': require('node:crypto'), sequelize: { Op }, '../models': models,
  './authorizationService': { async getUserObraScopeIds(u) { return u.obras; },
    async canAccessContratosGlobal(u) { return Boolean(u.global); },
    async userHasAreaPermission(u, keys) { assert.deepEqual(copia(keys), ['solicitacoes.acoes.criar']); return Boolean(u.criar); },
    async userHasStrictAreaPermission(u, keys) { assert.deepEqual(copia(keys), ['contratos.geral.editar']); return Boolean(u.permite); } },
  './setorCapabilityService': { async userHasSetorCapability(u, key) { assert.equal(key, 'eh_setor_obra'); return Boolean(u.obra); } },
  './medicaoContratoService': { async calcularSaldoDoContrato(id, tx) {
    const total = moedas.paraCentavos(state.contrato.valor_total) + moedas.paraCentavos(state.contrato.valor_aditivos);
    const comprometido = state.medidas.reduce((s, m) => s + moedas.paraCentavos(m.valor_medido), 0);
    return { total_cent: total, comprometido_cent: comprometido, saldo_cent: total - comprometido };
  } }, './contratoParcelasService': moedas,
  './tituloFinanceiroService': { async criarTituloManual(req, payload, options) {
    assert.ok(options.transaction); assert.equal(options.origemTitulo, 'CONTRATO');
    assert.equal(options.registrarSeguranca, false); assert.equal(payload.status, 'PREVISAO');
    assert.equal(payload.solicitacao_id, 100); assert.equal(payload.obra_id, 7);
    assert.equal(payload.categoria_financeira_id, 8);
    assert.equal(payload.rateios.reduce((s, r) => s + moedas.paraCentavos(r.valor), 0), moedas.paraCentavos(payload.valor));
    if (falhar === 'titulo' && state.titulos.length === 3) throw new Error('FALHA_TITULO');
    const titulo = { id: state.titulos.length + 1, ...copia(payload) }; state.titulos.push(titulo); return { titulo };
  } }, '../utils/codigoDoSetor': { codigoDoSetor: () => 'GEO' }
};
const sandbox = { module: { exports: {} }, console, Date, Set, Map, require(k) {
  if (k in deps) return deps[k]; throw new Error('Dependencia nao simulada: ' + k);
} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/services/contratoSaldoReprogramacaoService.js'), 'utf8'), sandbox);
const service = sandbox.module.exports;
const rejeita = (fn, status) => assert.rejects(fn, e => e.statusCode === status);

(async () => {
  reset();
  let resumo = await service.consultar(4, user);
  assert.equal(resumo.saldo_disponivel, 24100.32); assert.equal(resumo.pode_reprogramar, true);
  assert.equal((await service.consultar(4, { ...user, permite: false })).pode_reprogramar, false);
  assert.equal((await service.consultar(4, { ...user, permite: false, obra: true, criar: true })).pode_reprogramar, true, 'OBRA nao exige Editar contratos');
  assert.equal((await service.consultar(4, { ...user, permite: false, obra: true, criar: false })).pode_reprogramar, false);
  await rejeita(() => service.consultar(4, { ...user, obras: [8] }), 403);
  const payload = { referencia: resumo.referencia, justificativa: 'Continuar os servicos previstos',
    parcelas: [{ valor: 8000, vencimento: '2026-10-30' }, { valor: 8000, vencimento: '2026-11-30' }, { valor: 8100.32, vencimento: '2026-12-30' }] };
  await rejeita(() => service.reprogramar(4, payload, { usuario: { ...user, permite: false } }), 403);
  await rejeita(() => service.reprogramar(4, { ...payload, justificativa: '' }, { usuario: user }), 400);
  await rejeita(() => service.reprogramar(4, { ...payload, parcelas: [{ valor: 24101, vencimento: '2026-10-30' }] }, { usuario: user }), 409);
  await rejeita(() => service.reprogramar(4, { ...payload, parcelas: [{ valor: 24100.32, vencimento: '2026-02-30' }] }, { usuario: user }), 400);
  await rejeita(() => service.reprogramar(4, { ...payload, referencia: 'a'.repeat(64) }, { usuario: user }), 409);
  const original = copia({ contrato: state.contrato, parcelas: state.parcelas, titulos: state.titulos, medidas: state.medidas });
  const [a, b] = await Promise.all([service.reprogramar(4, payload, { usuario: user }), service.reprogramar(4, payload, { usuario: user })]);
  assert.equal(a.parcelas.length, 3); assert.equal(b.repetido, true);
  assert.equal(state.parcelas.length, 5); assert.equal(state.titulos.length, 5); assert.equal(state.historicos.length, 1);
  assert.deepEqual(state.contrato, original.contrato); assert.deepEqual(state.medidas, original.medidas);
  assert.deepEqual(state.parcelas.slice(0, 2), original.parcelas); assert.deepEqual(state.titulos.slice(0, 2), original.titulos);
  assert.equal((await service.consultar(4, user)).saldo_disponivel, 0);
  await rejeita(() => service.reprogramar(4, payload, { usuario: { ...user, permite: false } }), 403);
  for (const falha of ['titulo', 'historico']) {
    reset(); falhar = falha; const antes = copia(state); resumo = await service.consultar(4, user);
    await assert.rejects(() => service.reprogramar(4, { ...payload, referencia: resumo.referencia }, { usuario: user }));
    assert.deepEqual(state, antes, 'Falha deve reverter toda criacao, incluindo parcelas, titulos e auditoria');
  }
  reset(); state.parcelas.push({ id: 3, numero: 3, valor: 20000, status: 'APROVADA' });
  assert.equal((await service.consultar(4, user)).saldo_disponivel, 4100.32, 'Nao duplicar dinheiro que ja tem parcela');
  reset(); state.contrato.status_contrato = 'ENCERRADO'; assert.equal((await service.consultar(4, user)).pode_reprogramar, false);
  reset(); state.contrato.fluxo_novo = false; assert.equal((await service.consultar(4, user)).pode_reprogramar, false);
  reset();
  for (let i = 3; i <= 24; i++) state.parcelas.push({ id: i, numero: i, valor: 0, status: 'APROVADA' });
  assert.equal((await service.consultar(4, user)).pode_reprogramar, false, 'Limite do cronograma preservado');
  await rejeita(() => service.reprogramar(4, payload, { usuario: user }), 409);
  reset(); state.contrato.solicitacao_id = null;
  await rejeita(() => service.reprogramar(4, payload, { usuario: user }), 409);
  reset(); resumo = await service.consultar(4, { ...user, permite: false, obra: true, criar: true });
  await service.reprogramar(4, { ...payload, referencia: resumo.referencia }, { usuario: { ...user, permite: false, obra: true, criar: true } });
  assert.equal(state.titulos.length, 5, 'OBRA cria apenas previsoes, com ACL e fluxo normal de medicao');
  const rotas = fs.readFileSync(path.join(__dirname, '../src/routes.js'), 'utf8').split(/\r?\n/).filter(l => l.includes("'/contratos/:id/saldo-reprogramacao'"));
  assert.equal(rotas.length, 2);
  for (const rota of rotas) { assert.ok(rota.includes("requireEnabledModule('CONTRATOS')")); assert.ok(rota.includes('requireContratoAccess')); }
  console.log('Saldo remanescente: centavos, ACL/obra, cronograma, previsao, historico, replay concorrente, rollback e pagamentos intactos aprovados. Sem banco/rede.');
})().catch(e => { console.error(e); process.exitCode = 1; });
