'use strict';
// Servicos reais em VM, persistencia/locks serializados em memoria. Sem DB/rede.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { Op } = require('sequelize');
const root = path.resolve(__dirname, '..');
const ler = f => fs.readFileSync(path.join(root, f), 'utf8');
const copy = v => JSON.parse(JSON.stringify(v));
let state, count, allowed, deniedTitle, failAudit, failSync, tail = Promise.resolve();
const req = { user: { id: 7 } };
function row(data) { return { ...data, async update(patch, options) {
  assert(options?.transaction?.LOCK.UPDATE); Object.assign(this, patch); this.updatedAt = `qa-${++count}`; return this;
} }; }
function iniciar() {
  count = 0; allowed = new Set(['financeiro.baixas_compostas.visualizar', 'financeiro.baixas_compostas.estornar', 'financeiro.cheques.devolver']); deniedTitle = 0; failAudit = false; failSync = false;
  state = { grupos: [row({ id: 1, codigo: 'BC-QA', tipo: 'RECEBIMENTO', status: 'CONFIRMADO', valor_principal: '97557.58', valor_quitacao: '97557.58', estornos_cheques: null })],
    titulos: [8745,8746,8747].map(id => row({ id, codigo: id === 8746 ? 'TIT-007520' : `TIT-QA-${id}`, tipo: 'RECEBER', status: 'QUITADO', obra_id: 3,
      parceiro_id: 1, empresa_id: 1, valor_original: '41666.67', valor_baixado: '41666.67', valor_saldo: '0.00', data_quitacao: '2026-09-18', solicitacao_id: id })),
    componentes: [], alocacoes: [], movimentos: [], cheques: [], eventos: [], audit: [], historicos: [], conciliacoes: [] };
  const valores = [6520,4108,4109.81,842.86,2596.13,10765,984.78,8000,3690,8838,8000,8838,4999,4990,2600,8838,8838];
  let movId = 5422;
  valores.forEach((valor, i) => {
    const ordem = i + 1;
    state.componentes.push(row({ id: ordem, baixa_grupo_id: 1, ordem, empresa_id: 1, forma_recebimento: 'CHEQUE', valor, juros: 0, multa: 0, desconto: 0 }));
    const alocs = ordem < 5 ? [[8745, valor]] : ordem < 11 ? [[8746, valor]] : ordem === 11 ? [[8746,6792.76],[8747,1207.24]] : [[8747, valor]];
    const entrada = movId + 1;
    for (const [titulo, parte] of alocs) {
      const id = ++movId;
      state.movimentos.push(row({ id, titulo_financeiro_id: titulo, baixa_grupo_id: 1, baixa_componente_id: ordem,
        status: 'ATIVO', tipo_movimento: 'BAIXA', forma_recebimento: 'CHEQUE', valor: parte, juros: 0, multa: 0, desconto: 0, valor_quitacao: parte }));
      state.alocacoes.push(row({ id: state.alocacoes.length + 1, baixa_grupo_id: 1, componente_id: ordem, titulo_financeiro_id: titulo, movimento_financeiro_id: id, valor: parte }));
    }
    state.cheques.push(row({ id: 77 + ordem, codigo: `CHQ-QA-${ordem}`, numero_cheque: ordem === 8 ? '000488' : `QA-${ordem}`,
      valor, empresa_id: 1, titulo_financeiro_id: alocs[0][0], movimento_entrada_id: entrada, movimento_financeiro_id: entrada,
      status: 'EM_CARTEIRA', data_entrada: '2026-09-18' }));
  });
}
const match = (r, w = {}) => Reflect.ownKeys(w).every(k => {
  const v = w[k];
  if (k === Op.or) return v.some(c => match(r, c));
  if (v && typeof v === 'object' && v[Op.in]) return v[Op.in].map(Number).includes(Number(r[k]));
  return v == null ? r[k] == null : String(r[k]) === String(v);
});
function model(name) { return {
  async findAll(o = {}) { return state[name].filter(r => match(r, o.where)); },
  async findOne(o) { return state[name].find(r => match(r, o.where)); },
  async findByPk(id) { return state[name].find(r => Number(r.id) === Number(id)); },
  async create(data, options) { assert(options?.transaction); if (name === 'audit' && failAudit) throw Error('AUDIT_TEST_FAIL');
    const r = row({ id: state[name].length + 1, ...data }); state[name].push(r); return r; },
  async update(data, o) { for (const r of state[name].filter(r => match(r, o.where))) await r.update(data, o); }
}; }
async function transaction(cb) {
  let release; const previous = tail; tail = new Promise(r => { release = r; }); await previous;
  const before = copy(state), beforeCount = count;
  const tx = { LOCK: { UPDATE: 'UPDATE' }, async commit() { release(); }, async rollback() {
    state = Object.fromEntries(Object.entries(before).map(([k, rows]) => [k, rows.map(row)])); count = beforeCount; release();
  } };
  if (!cb) return tx;
  try { const r = await cb(tx); await tx.commit(); return r; } catch (e) { await tx.rollback(); throw e; }
}
const models = { sequelize: { transaction }, Op };
for (const [key, name] of Object.entries({ BaixaFinanceiraGrupo: 'grupos', TituloFinanceiro: 'titulos', BaixaFinanceiraAlocacao: 'alocacoes', BaixaFinanceiraComponente: 'componentes',
  MovimentoFinanceiro: 'movimentos', ChequeTerceiro: 'cheques', ChequeTerceiroMovimento: 'eventos', SecurityEventLog: 'audit', Historico: 'historicos', ConciliacaoBancaria: 'conciliacoes' })) models[key] = model(name);
const sync = async () => { if (failSync) throw Error('SYNC_TEST_FAIL'); };
const auth = { canAccessFinanceiro: async () => allowed.has('financeiro'), userHasAreaPermission: async (u, keys) => keys.some(k => allowed.has(k)) };
const escopo = async (r, t) => { if (t.id === deniedTitle) throw Object.assign(Error('ESCOPO_TEST_NEGADO'), { statusCode: 403 }); };
let service;
const requerer = name => {
  if (name === '../models') return models;
  if (name === './authorizationService') return auth;
  if (name === './pedidoEntregaDomain') return { hojeBrasil: () => '2026-10-22' };
  if (name === './tituloCompartilhadoLeitura' || name === './tituloRenegociacaoService') return { assertEscopo: escopo, assertEscopoTitulo: escopo };
  if (name === './tituloFinanceiroService') return { sincronizarRealizacaoCompraPorTitulo: sync, sincronizarStatusSolicitacaoPorBaixaTitulos: sync };
  if (name === './comercialService') return { sincronizarContratoComercialPorTituloFinanceiro: sync };
  if (name === './tituloRenegociacaoSincronizacao') return { sincronizarDestinos: sync };
  if (name === './baixaCompostaChequeEstornoService') return service;
  if (name === 'sequelize' || name === 'node:crypto') return require(name);
  throw Error('Importacao nao permitida: ' + name);
};
const modulo = { exports: {} };
vm.runInNewContext(ler('src/services/baixaCompostaChequeEstornoService.js'), { require: requerer, module: modulo, exports: modulo.exports, console, Date, Map, Set }); service = modulo.exports;
const source = ler('src/services/chequeTerceiroService.js');
const full = vm.runInNewContext(source.slice(source.indexOf('async function estornarBaixaComposta('), source.indexOf('\nmodule.exports =')) + '\nestornarBaixaComposta;', {
  ...models, require: requerer, texto: v => String(v || '').trim(), round: v => Math.round(Number(v) * 100) / 100,
  httpError: (statusCode, message) => Object.assign(Error(message), { statusCode }),
  sincronizarContratoComercialPorTituloFinanceiro: sync, sincronizarRealizacaoCompraPorTitulo: sync, sincronizarStatusSolicitacaoPorBaixaTitulos: sync,
  registrarEventoCheque: async (c, evento, transaction) => { assert(transaction); state.eventos.push(row({ cheque_terceiro_id: c.id, ...evento })); }, hoje: () => '2026-10-22',
  reabrirConciliacoesPorMovimentos: async () => [], registrarEventoSeguranca: async () => {}, obterBaixaComposta: async () => state.grupos[0]
});
const payload = (cheque_ids = [85]) => ({ cheque_ids, motivo: 'Substituicao recebida por outra forma - QA', motivo_bancario: '22', data_devolucao: '2026-10-22' });
function reset() { iniciar(); allowed.add('financeiro'); }
const confirmar = async (body = payload(), key = 'QA-DEVOLUCAO-0001') => { const p = await service.preview(req, 1, body); return service.confirmar(req, 1, { ...body, preview_hash: p.preview_hash }, key); };
async function negativo(mudar, body = payload(), status) {
  reset(); mudar?.(); const before = JSON.stringify(state);
  await assert.rejects(confirmar(body), e => !status || e.statusCode === status);
  assert.equal(JSON.stringify(state), before, 'Negativa nao pode escrever');
}
async function main() {
  reset(); const before = JSON.stringify(state), p = await service.preview(req, 1, payload()); assert.equal(JSON.stringify(state), before);
  assert.equal(p.titulos[0].saldo_depois, '8000.00'); assert.equal(p.titulos[0].baixado_depois, '33666.67');
  assert.equal(p.movimento_ids.join(','), '5430');
  const untouched = copy(state.movimentos.filter(m => m.id !== 5430)), checks = copy(state.cheques.filter(c => c.id !== 85));
  const body = { ...payload(), preview_hash: p.preview_hash };
  await service.confirmar(req, 1, body, 'QA-RETORNO-REAL');
  assert.equal(state.grupos[0].status, 'PARCIAL_ESTORNADO'); assert.equal(state.cheques.find(c => c.id === 85).status, 'DEVOLVIDO');
  assert.equal(state.titulos.find(t => t.id === 8746).valor_saldo, '8000.00');
  assert.deepEqual(copy(state.movimentos.filter(m => m.id !== 5430)), untouched); assert.deepEqual(copy(state.cheques.filter(c => c.id !== 85)), checks);
  const saved = JSON.stringify(state); assert((await service.confirmar(req, 1, body, 'QA-RETORNO-REAL')).idempotente); assert.equal(JSON.stringify(state), saved);
  await assert.rejects(service.confirmar(req, 1, body, 'OUTRA-CHAVE-0001'), e => e.statusCode === 409);
  await assert.rejects(service.confirmar({ user: { id: 8 } }, 1, body, 'QA-RETORNO-REAL'), e => e.statusCode === 409);
  const lista = await service.listar(req, 1); assert(!lista.cheques.find(c => c.id === 85).disponivel); assert(lista.cheques.find(c => c.id === 88).disponivel);
  await confirmar(payload([83,88]), 'SEGUNDA-DEVOLUCAO'); assert.equal(state.eventos.length, 3); // 2 cheques, componente11 rateado em 2 titulos.
  assert.equal(state.titulos.find(t => t.id === 8746).valor_saldo, '25557.76');
  assert.equal(state.titulos.find(t => t.id === 8747).valor_saldo, '1207.24');
  await full(req, 1, { motivo: 'Estorno do restante QA' });
  assert.equal(state.grupos[0].status, 'ESTORNADO'); assert.equal(state.titulos.find(t => t.id === 8746).valor_baixado, 0);
  assert.equal(Number(state.titulos.find(t => t.id === 8746).valor_saldo), 41666.67);
  assert.equal(state.cheques.find(c => c.id === 85).status, 'DEVOLVIDO');
  reset(); await full(req, 1, { motivo: 'Estorno integral antigo QA' }); assert.equal(state.grupos[0].status, 'ESTORNADO');
  reset(); await confirmar(payload(state.cheques.map(c => c.id))); assert.equal(state.grupos[0].status, 'ESTORNADO');
  reset(); const concurrent = await service.preview(req, 1, payload());
  const outcomes = await Promise.all([1,2].map(() => service.confirmar(req, 1, { ...payload(), preview_hash: concurrent.preview_hash }, 'CONCORRENTE-0001')));
  assert.equal(outcomes.filter(r => r.idempotente).length, 1); assert.equal(state.eventos.length, 1);
  reset(); const stale = await service.preview(req, 1, payload()); state.titulos[1].updatedAt = 'outro';
  await assert.rejects(service.confirmar(req, 1, { ...payload(), preview_hash: stale.preview_hash }, 'STALE-0001'), e => e.statusCode === 409); assert.equal(state.audit.length, 0);
  for (const perm of ['financeiro', 'financeiro.baixas_compostas.visualizar', 'financeiro.baixas_compostas.estornar', 'financeiro.cheques.devolver']) await negativo(() => allowed.delete(perm), payload(), 403);
  await negativo(() => { deniedTitle = 8747; }, payload(), 403);
  for (const patch of [{ status: 'DEPOSITADO' }, { status: 'COMPENSADO' }, { status: 'UTILIZADO' }, { status: 'DEVOLVIDO' }, { movimento_saida_id: 22 },
    { movimento_deposito_id: 24 }, { conciliacao_deposito_id: 5 }, { data_compensacao: '2026-10-20' }, { empresa_id: 2 }, { valor: 1 }, { movimento_financeiro_id: 12 }]) {
    await negativo(() => Object.assign(state.cheques.find(c => c.id === 85), patch), payload(), 409);
  }
  await negativo(() => { state.conciliacoes.push(row({ id: 1, movimento_financeiro_id: 5430, deleted_at: null })); }, payload(), 409);
  await negativo(() => { state.movimentos.find(m => m.id === 5430).juros = 1; }, payload(), 409);
  await negativo(() => { state.alocacoes.find(a => a.componente_id === 8).valor = 2; }, payload(), 409);
  await negativo(() => { state.titulos[1].renegociado_por_id = 3; }, payload(), 409);
  await negativo(() => { state.titulos[1].valor_baixado = 7000; }, payload(), 409);
  await negativo(() => { state.grupos[0].tipo = 'PAGAMENTO'; }, payload(), 409);
  await negativo(() => { failAudit = true; }); await negativo(() => { failSync = true; });
  await negativo(null, payload([85,85]), 400); await negativo(null, payload([999]), 409);
  await negativo(null, { ...payload(), data_devolucao: '2026-02-30' }, 400);
  await negativo(null, { ...payload(), data_devolucao: '2026-10-23' }, 400);
  await negativo(null, { ...payload(), data_devolucao: '2026-01-01' }, 400);
  await negativo(null, { ...payload(), valor: 1 }, 400); await negativo(null, { ...payload(), motivo_bancario: '' }, 400);
  // Um bloqueado invalida a selecao inteira; cheque distinto com mesmo valor nao e confundido.
  await negativo(() => { state.cheques.find(c => c.id === 88).status = 'COMPENSADO'; }, payload([85,88]), 409);
  reset(); state.cheques.find(c => c.id === 88).status = 'COMPENSADO'; await confirmar(); assert.equal(state.cheques.find(c => c.id === 88).status, 'COMPENSADO');
  await negativo(() => { state.cheques.find(c => c.id === 88).numero_cheque = '488'; }, payload([85]), 409);
  reset(); state.cheques.find(c => c.id === 88).numero_cheque = '488'; await confirmar(payload([85,88])); assert.equal(state.eventos.length, 2);
  reset(); state.cheques.find(c => c.id === 85).movimento_entrada_id = null; await confirmar(); assert.equal(state.eventos[0].movimento_financeiro_id, 5430);
  // Falha tardia do restante nao desfaz a devolucao anterior nem duplica saldo.
  reset(); await confirmar(); state.cheques.find(c => c.id === 88).status = 'COMPENSADO';
  const parcial = JSON.stringify(state); await assert.rejects(full(req, 1, { motivo: 'Restante bloqueado QA' })); assert.equal(JSON.stringify(state), parcial);
  // Outra chave concorrente nao pode estornar o mesmo documento novamente.
  reset(); const concorrente = await service.preview(req, 1, payload());
  const tentativas = await Promise.allSettled(['CHAVE-A-0001','CHAVE-B-0001'].map(k => service.confirmar(req, 1, { ...payload(), preview_hash: concorrente.preview_hash }, k)));
  assert.equal(tentativas.filter(t => t.status === 'fulfilled').length, 1); assert.equal(state.eventos.length, 1);
  // Acesso/negacao tambem na consulta; somente retornos de recebimentos.
  reset(); allowed.delete('financeiro.cheques.devolver'); await assert.rejects(service.listar(req, 1), e => e.statusCode === 403);
  reset(); state.titulos[1].compartilhamento_id = 1; deniedTitle = 8746; await assert.rejects(service.preview(req, 1, payload()), e => e.statusCode === 403);
  const migrationSource = ler('migrations/202610220002_baixa_composta_estornos_cheques.js');
  const runner = { exports: {} };
  vm.runInNewContext(ler('src/database/runMigrations.js'), { module: runner, exports: runner.exports, __dirname: path.join(root,'src/database'), console,
    require: name => name === './index' ? {} : name === '../config/env' ? { validateRequiredEnv() {} } : require(name) });
  runner.exports.assertMigrationSourceIsSchemaOnly('202610220002_baixa_composta_estornos_cheques.js', migrationSource);
  const migration = require('../migrations/202610220002_baixa_composta_estornos_cheques'); let existe = false, adds = 0;
  const sequelize = { query: async sql => sql.includes('information_schema.TABLES') ? [[{ TABLE_NAME: 'baixas_financeiras_grupos' }]] : [[{ total: existe ? 1 : 0 }]] };
  const args = { sequelize, DataTypes: { JSON: 'JSON' }, queryInterface: { addColumn: async (t, c, d) => { assert.equal(t, 'baixas_financeiras_grupos'); assert.equal(c, 'estornos_cheques'); assert.equal(d.allowNull, true); existe = true; adds++; } } };
  await migration.up(args); await migration.up(args); assert.equal(adds, 1); await assert.rejects(migration.down());
  console.log('OK: servicos reais, caso8000/TIT-007520, varios cheques, mesmo valor distinto, rateio multi-titulo, devolucoes sucessivas, estorno restante/integral, replay/concorrencia serializada, ACL/escopo, stale, rollback auditoria/sync, ciclo bancario e migration aditiva idempotente. Sem banco/rede.');
}
if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 1; });
module.exports = { main };
