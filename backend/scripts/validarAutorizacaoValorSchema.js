'use strict';
const assert = require('node:assert/strict'), { test } = require('node:test');
const migration = require('../migrations/202610260001_pagamento_autorizacao_valor');
test('schema aditivo, repetivel, sem dados/backfill/down destrutivo', async () => {
  const schemas = { pagamento_autorizacao_itens: {}, pagamentos_manuais_fila: {} }, adicionadas = [];
  const context = { DataTypes: { JSON: 'JSON' }, queryInterface: {
    describeTable: async tabela => schemas[tabela],
    addColumn: async (tabela, coluna, definicao) => {
      assert.equal(coluna, 'autorizacao_valor_json'); assert.deepEqual(definicao, { type: 'JSON', allowNull: true });
      schemas[tabela][coluna] = definicao; adicionadas.push(tabela);
    }
  } };
  await migration.up(context); await migration.up(context);
  assert.equal(adicionadas.length, 2);
  await assert.rejects(migration.down(), /destrutiva nao permitida/);
});
test('schema incompleto interrompe antes do primeiro addColumn', async () => {
  let writes = 0;
  await assert.rejects(migration.up({ DataTypes: { JSON: 'JSON' }, queryInterface: {
    describeTable: async t => { if (t === 'pagamentos_manuais_fila') throw Error('Tabela ausente'); return {}; },
    addColumn: async () => { writes++; }
  } }), /Tabela ausente/);
  assert.equal(writes, 0);
});
