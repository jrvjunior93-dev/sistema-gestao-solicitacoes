'use strict';
// Suite isolada: não carrega dotenv, não abre conexão e não escreve em banco.
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const { centavos } = require('../src/services/tituloRenegociacaoDomain');
const mock = (path, value) => { require.cache[require.resolve(path)] = { exports: value, loaded: true }; };
let state, permitir, obras, falharCriacao, bancario;
const clone = value => structuredClone(value);
function reset() {
  state = { titulos: [
    { id: 1, codigo: 'TIT-1', tipo: 'PAGAR', status: 'PARCIAL', parceiro_id: 7, empresa_id: 8, obra_id: 3,
      solicitacao_id: 11, categoria_financeira_id: 6, considera_dre: true,
      valor_original: '150.00', valor_baixado: '50.00', valor_saldo: '100.00' },
    { id: 2, codigo: 'TIT-2', tipo: 'PAGAR', status: 'ABERTO', parceiro_id: 7, empresa_id: 8, obra_id: 4,
      solicitacao_id: 12, categoria_financeira_id: 9, considera_dre: false,
      valor_original: '200.00', valor_baixado: '0.00', valor_saldo: '200.00' }
  ], negociacoes: [], alocacoes: [], rateios: [], auditoria: [], historico: [], sync: [] };
  permitir = true; obras = null; falharCriacao = false; bancario = false;
}
const instance = row => row && { ...row, toJSON: () => clone(row), update: async values => { Object.assign(row, values); } };
const model = name => ({
  create: async (value, { transaction }) => {
    assert.ok(transaction, `${name} sem transação`);
    const row = { ...clone(value), id: state[name].length + 1 };
    state[name].push(row); return instance(row);
  },
  findAll: async ({ where }) => state[name].filter(r => Reflect.ownKeys(where).every(k =>
    typeof where[k] === 'object' ? where[k][Op.in]?.includes(r[k]) : r[k] === where[k])).map(instance)
});
let fila = Promise.resolve();
const db = {
  sequelize: { transaction: async callback => {
    const anterior = fila; let liberar;
    fila = new Promise(resolve => { liberar = resolve; });
    await anterior;
    const snapshot = clone(state);
    try { return await callback({ LOCK: { UPDATE: 'UPDATE' } }); }
    catch (error) { state = snapshot; throw error; }
    finally { liberar(); }
  } },
  TituloFinanceiro: {
    findByPk: async (id, options) => {
      assert.equal(options?.lock, 'UPDATE');
      return instance(state.titulos.find(t => t.id === id));
    },
    create: async (value, { transaction }) => {
      assert.ok(transaction);
      if (falharCriacao && state.titulos.length === 3) throw new Error('Falha simulada na segunda parcela');
      const row = { ...clone(value), id: state.titulos.length + 1, codigo: `TIT-${state.titulos.length + 1}` };
      state.titulos.push(row); return instance(row);
    }
  },
  TituloRenegociacao: { ...model('negociacoes'), findOne: async ({ where }) => instance(state.negociacoes.find(n => n.chave === where.chave)) },
  TituloRenegociacaoAlocacao: model('alocacoes'), TituloFinanceiroRateio: model('rateios'),
  SecurityEventLog: model('auditoria'), Historico: model('historico'),
  PaymentIntent: { findOne: async () => bancario ? { id: 1 } : null },
  PagamentoManualFilaItem: { findOne: async () => null }
};
mock('../src/models', db);
mock('../src/services/authorizationService', {
  userHasAreaPermission: async () => permitir, getFinanceiroObraScopeIds: async () => obras
});
mock('../src/services/tituloRenegociacaoSincronizacao', {
  sincronizarOrigens: async (ids, options) => { assert.ok(options.transaction); state.sync.push(ids); }
});
const service = require('../src/services/tituloRenegociacaoService');
const req = { user: { id: 99 } };
const payload = { titulo_ids: [2, 1], motivo: 'Acordo com fornecedor', primeiro_vencimento: '2090-01-31', quantidade_parcelas: 3,
  juros: { tipo: 'PERCENTUAL', valor: '2.50' }, multa: { tipo: 'VALOR', valor: '10.00' } };
const preparar = async () => ({ ...payload, preview_hash: (await service.preview(req, payload)).preview_hash });
const chave = 'teste-idempotencia-00001';

async function main() {
  reset(); const preview = await service.preview(req, payload);
  assert.equal(preview.total, '317.50'); assert.equal(state.negociacoes.length, 0);
  const body = { ...payload, preview_hash: preview.preview_hash };
  const resultados = await Promise.all([service.confirmar(req, body, chave), service.confirmar(req, body, chave)]);
  assert.deepEqual(resultados[0], resultados[1]);
  assert.equal(state.negociacoes.length, 1); assert.equal(state.titulos.length, 5);
  assert.equal(state.titulos[0].valor_baixado, '50.00');
  assert.equal(state.titulos[0].status, 'RENEGOCIADO'); assert.equal(state.titulos[0].solicitacao_id, 11);
  assert.equal(state.titulos[0].valor_saldo, 0);
  assert.equal(state.titulos[2].categoria_financeira_id, null);
  assert.equal(state.alocacoes.reduce((s, a) => s + centavos(a.valor), 0), 31750);
  assert.deepEqual([...new Set(state.alocacoes.map(a => a.solicitacao_id))], [11, 12]);
  assert.equal(state.auditoria.length, 5); assert.equal(state.historico.length, 2);
  assert.deepEqual(state.sync, [[1, 2]]);
  await assert.rejects(service.confirmar(req, { ...body, motivo: 'Outro acordo' }, chave), /chave/);

  reset(); const stale = await preparar(); state.titulos[0].valor_saldo = '99.00';
  await assert.rejects(service.confirmar(req, stale, chave), /mudaram/); assert.equal(state.negociacoes.length, 0);
  reset(); const falha = await preparar(); falharCriacao = true;
  await assert.rejects(service.confirmar(req, falha, chave), /Falha simulada/);
  assert.equal(state.titulos.length, 2); assert.equal(state.alocacoes.length, 0); assert.equal(state.negociacoes.length, 0);
  assert.equal(state.titulos[0].status, 'PARCIAL');
  reset(); const concorrente = await preparar();
  const tentativas = await Promise.allSettled([service.confirmar(req, concorrente, chave), service.confirmar(req, concorrente, `${chave}-outra`)]);
  assert.equal(tentativas.filter(r => r.status === 'fulfilled').length, 1); assert.equal(state.titulos.length, 5);
  reset(); permitir = false; await assert.rejects(service.preview(req, payload), /permissão/);
  reset(); obras = [3]; await assert.rejects(service.preview(req, payload), /todas as obras/);
  reset(); state.titulos[1].parceiro_id = 10; await assert.rejects(service.preview(req, payload), /parceiro/);
  reset(); bancario = true; await assert.rejects(service.preview(req, payload), /bancário/);
  reset(); state.titulos[0].status = 'QUITADO'; await assert.rejects(service.preview(req, payload), /saldo/);
  console.log('OK: prévia sem escrita, confirmação atômica simulada, rollback, idempotência, corrida simulada, escopo, parceiro, auditoria e vínculos. Não substitui teste MySQL.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
