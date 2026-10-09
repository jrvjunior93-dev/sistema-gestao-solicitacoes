'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Op } = require('sequelize');
const { calcularValoresFila, calcularTotalComEncargos } = require('../src/services/pagamentoFilaValoresDomain');
const { validateManualPaymentQueueProcessBody } = require('../src/validators/paymentValidators');
const { validateFinanceTituloUpdateBody } = require('../src/validators/financialValidators');
const base = { fila_id: 1, valor_pago: 213, conta_bancaria_id: 1, data_baixa: '2026-10-08', juros: 10, multa: 3 };
assert.equal(validateManualPaymentQueueProcessBody({ itens: [base] }).itens[0].juros, 10);
for (const campo of ['juros', 'multa']) for (const valor of [-1, Infinity, 'invalido']) {
  assert.throws(() => validateManualPaymentQueueProcessBody({ itens: [{ ...base, [campo]: valor }] }));
}
const edit = { tipo: 'PAGAR', obra_id: 1, parceiro_id: 1, valor: 200, data_vencimento: '2026-10-10',
  descricao: 'QA', categoria_financeira_id: 1, competencia_data: '2026-10-08', juros: 10, multa: 3 };
assert.equal(validateFinanceTituloUpdateBody(edit).multa, 3);
assert.throws(() => validateFinanceTituloUpdateBody({ ...edit, juros: -1 }));
assert.deepEqual(calcularValoresFila(213, 200, base), { principal: 200, juros: 10, multa: 3, totalEsperado: 213, divergencia: '' });
assert.equal(calcularValoresFila(163, 200, base).divergencia, 'PARCIAL');
assert.equal(calcularValoresFila(263, 200, base).divergencia, 'ACIMA_SALDO');
assert.equal(calcularValoresFila(.33, .3, { juros: .01, multa: .02 }).divergencia, '');
assert.equal(calcularTotalComEncargos(0).totalEsperado, 0, 'Edicao preserva titulo com retencao integral');
assert.throws(() => calcularTotalComEncargos(999999999999.99, { juros: 1 }), /Total previsto/);
assert.throws(() => calcularValoresFila(13, 200, base), /maior que a soma/);
const rows = ['PENDENTE', 'NAO_PAGO', 'DIVERGENTE', 'BAIXADO', 'RESOLVIDO', 'DIVERGENTE'].map((status, index) => ({
  id: index + 1, status, valor_previsto: 200, motivo: 'Preservar', valor_informado: 263,
  movimento_financeiro_id: index >= 3 ? 100 : null,
  async update(data, options) { assert(options.transaction); Object.assign(this, data); }
}));
const moduleSaldo = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/services/pagamentoFilaSaldoService.js'), 'utf8'), {
  module: moduleSaldo, require(id) {
    if (id === 'sequelize') return { Op };
    if (id === '../models') return { PagamentoManualFilaItem: { findAll: async options => {
      assert(options.lock); return rows;
    } } };
    if (id === './pagamentoFilaValoresDomain') return require('../src/services/pagamentoFilaValoresDomain');
    throw Error(`Dependencia nao isolada: ${id}`);
  }
});
(async () => {
  const tx = { LOCK: { UPDATE: 'UPDATE' } };
  await moduleSaldo.exports.sincronizarSaldoFilaAposEdicao({ id: 1, valor_saldo: 250, juros: 10, multa: 3, data_vencimento: '2026-11-01' }, tx);
  rows.forEach((row, index) => {
    assert.equal(row.valor_previsto, index < 3 ? 250 : 200);
    assert.equal(row.motivo, 'Preservar'); assert.equal(row.valor_informado, 263);
    assert.equal(row.juros, index < 3 ? 10 : undefined);
  });
  await assert.rejects(moduleSaldo.exports.sincronizarSaldoFilaAposEdicao({}, null), /transacao/);
  const migration = require('../migrations/202610080002_fila_pagamentos_juros_multa');
  const columns = new Set(), added = [];
  const context = { DataTypes: { DECIMAL: (p, s) => { assert.equal(p, 14); assert.equal(s, 2); return 'DECIMAL'; } },
    sequelize: { query: async (sql, options) => { assert.match(sql, /^SELECT/); return [[{ total: columns.has(options.replacements.join('.')) ? 1 : 0 }]]; } },
    queryInterface: { addColumn: async (table, column, definition) => {
      columns.add(`${table}.${column}`); added.push(definition); assert.equal(definition.defaultValue, 0);
      assert.equal(definition.allowNull, false);
    } } };
  await migration.up(context); await migration.up(context); assert.equal(added.length, 4);
  await assert.rejects(migration.down(), /Preservar encargos/);
  console.log('OK: campos separados, centavos, validacoes, sincronizacao sem reescrever baixas, migration estrutural repetivel. Sem banco/rede.');
})().catch(error => { console.error(error); process.exitCode = 1; });
