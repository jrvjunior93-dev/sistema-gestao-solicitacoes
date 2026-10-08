'use strict';
// Validadores, migration e fatura reais com fronteiras simuladas. Nenhuma conexao.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { validateManualPaymentQueueProcessBody: validate } = require('../src/validators/paymentValidators');
const base = { fila_id: 1, data_baixa: '2026-10-08', conta_bancaria_id: 5, valor_pago: 200 };
const validated = validate({ itens: [{ ...base, forma_pagamento_id: 1, cartao_id: 10 }] });
assert.equal(validated.itens[0].cartao_id, 10);
for (const item of [{ ...base, titulo_id: 1 }, { ...base, fila_id: -7 }, { ...base, cartao_id: 'abc' },
  { ...base, cheque_numero: '0'.repeat(61) }, { ...base, titular_documento: '12345678901' }]) {
  assert.throws(() => validate({ itens: [item] }));
}
assert.throws(() => validate({ itens: [base, base] }), /mais de uma vez/);
const locks = [];
const fatura = { id: 1, status: 'ABERTA', cartao_id: 10 };
const models = {
  TituloFinanceiro: { findAll: async options => [{ valor_original: options.lock ? 400 : 200 }] },
  FaturaCartaoTitulo: { findOrCreate: async () => [{ id: 1 }] },
  CartaoFinanceiro: { findByPk: async () => ({ id: 10, ativo: true, tipo: 'CREDITO', dia_fechamento: 15, dia_vencimento: 25 }) },
  FaturaCartaoFinanceiro: { update: async data => Object.assign(fatura, data), findOrCreate: async () => [fatura], findByPk: async (id, options) => {
    if (options.lock) locks.push('fatura'); return fatura;
  } }
};
const deps = { '../models': models, './authorizationService': {}, './financeiroCaixaSessionHelper': {},
  './securityLogService': {}, '../constants/intercompany': {}, './solicitacaoFinanceiroStatusService': {}, './comercialService': {} };
const mod = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/services/faturaCartaoFinanceiroService.js'), 'utf8'), {
  module: mod, Date, Intl, console, require(id) { if (!(id in deps)) throw Error(`Dependencia nao isolada ${id}`); return deps[id]; }
});
(async () => {
  const input = { cartaoId: 10, dataCompra: '2026-10-08', novaCompraFila: true, transaction: { LOCK: { UPDATE: 'UPDATE' } } };
  await mod.exports.obterOuCriarFaturaCartao(input); assert.equal(locks.length, 1);
  for (const status of ['FECHADA', 'PAGA', 'PARCIAL']) {
    fatura.status = status;
    await assert.rejects(mod.exports.obterOuCriarFaturaCartao(input), /fatura desta compra nao esta aberta/);
  }
  // API legada permanece com sua semantica; trava adicional e especifica da fila.
  await mod.exports.obterOuCriarFaturaCartao({ ...input, novaCompraFila: false });
  await mod.exports.vincularTituloAFatura({ titulo: { id: 2, update: async () => {} }, fatura,
    transaction: input.transaction, leituraCorrente: true });
  assert.equal(fatura.valor_total, 400, 'Recalculo da fila usa leitura corrente, nao snapshot anterior de outra compra.');
  const migration = require('../migrations/202610080001_fila_pagamentos_instrumento');
  const columns = new Set(), added = [];
  const fake = { DataTypes: { JSON: 'JSON', INTEGER: 'INTEGER' },
    sequelize: { query: async (sql, options) => {
      assert.match(sql, /^SELECT/); const key = options.replacements.join('.');
      return [[{ total: columns.has(key) ? 1 : 0 }]];
    } }, queryInterface: { addColumn: async (table, column, definition) => {
      const key = `${table}.${column}`; columns.add(key); added.push({ key, definition });
    } }
  };
  await migration.up(fake); await migration.up(fake);
  assert.equal(added.length, 2); assert.equal(added[0].definition.allowNull, true);
  assert.equal(added[1].definition.defaultValue, 0);
  await assert.rejects(migration.down(), /Preservar instrumentos/);
  console.log('OK: payloads estritos, rejeicao de ids virtuais/duplicados, fatura aberta com lock, migration estrutural repetivel. Sem banco.');
})().catch(error => { console.error(error); process.exitCode = 1; });
