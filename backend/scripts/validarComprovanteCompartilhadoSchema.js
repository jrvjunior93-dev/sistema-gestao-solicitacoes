'use strict';
// Migration real e models, sem conectar em banco ou carregar .env.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Sequelize, DataTypes } = require('sequelize');
const root = path.resolve(__dirname, '..');
const moduleFake = { exports: {} };
let ausente = false;
vm.runInNewContext(fs.readFileSync(path.join(root, 'migrations/202610150002_comprovante_compartilhado_fila.js'), 'utf8'), {
  module: moduleFake, require(id) {
    assert.equal(id, '../src/database/schemaUtils'); return { tableExists: async () => !ausente };
  }
});
const migration = moduleFake.exports;
const idx = (name, campos, unique) => ({ name, unique, fields: campos.map(attribute => ({ attribute })) });
let indices = {
  pagamentos_manuais_fila: [idx('PRIMARY', ['id'], true), idx('pmf_comprovante_hash_uk', ['comprovante_hash'], true),
    idx('comprovante_hash', ['comprovante_hash'], true), idx('idempotency_key', ['idempotency_key'], true)],
  pagamentos_manuais_fila_comprovantes: [idx('PRIMARY', ['id'], true), idx('hash', ['hash'], true)]
};
const operations = [];
const queryInterface = {
  showIndex: async t => indices[t],
  addIndex: async (t, fields, o) => { indices[t].push(idx(o.name, fields, !!o.unique)); operations.push(['add', t, o.name]); },
  removeIndex: async (t, name) => { indices[t] = indices[t].filter(i => i.name !== name); operations.push(['remove', t, name]); }
};
(async () => {
  await migration.up({ queryInterface, sequelize: {} });
  const composto = indices.pagamentos_manuais_fila_comprovantes.find(i => i.name === 'pmfc_fila_hash_uk');
  assert(composto.unique); assert.equal(composto.fields.map(f => f.attribute).join(','), 'fila_id,hash');
  assert.equal(operations[0][2], 'pmfc_fila_hash_uk', 'Protecao por destino precede retirada da global');
  assert(!indices.pagamentos_manuais_fila.some(i => i.unique && i.fields[0].attribute === 'comprovante_hash'));
  assert(!indices.pagamentos_manuais_fila_comprovantes.some(i => i.unique && i.fields.length === 1 && i.fields[0].attribute === 'hash'));
  assert(indices.pagamentos_manuais_fila.some(i => i.name === 'idempotency_key' && i.unique));
  const snapshot = JSON.stringify(indices), count = operations.length;
  await migration.up({ queryInterface, sequelize: {} }); await migration.down();
  assert.equal(operations.length, count); assert.equal(JSON.stringify(indices), snapshot);
  ausente = true; await assert.rejects(migration.up({ queryInterface, sequelize: {} }), /obrigatoria ausente/); ausente = false;
  composto.unique = false; await assert.rejects(migration.up({ queryInterface, sequelize: {} }), /divergente/);
  const sequelize = new Sequelize('qa', 'qa', 'qa', { dialect: 'mysql', logging: false });
  const model = require('../src/models/PagamentoManualFilaComprovante')(sequelize, DataTypes);
  const fila = require('../src/models/PagamentoManualFilaItem')(sequelize, DataTypes);
  assert(!model.rawAttributes.hash.unique); assert(!fila.rawAttributes.comprovante_hash.unique);
  assert(model.options.indexes.some(i => i.name === 'pmfc_fila_hash_uk' && i.unique && i.fields.join(',') === 'fila_id,hash'));
  await sequelize.close();
  const routes = fs.readFileSync(path.join(root, 'src/routes.js'), 'utf8');
  for (const acao of ['remover-colaborador', 'cancelar']) {
    const linha = routes.split('\n').find(l => l.includes(`/rh/pagamentos-solicitacao/:id/${acao}'`));
    assert(linha.includes('allowRhDpPagamentoWrite, criticalRateLimit, validateRequest('));
  }
  const lote = routes.split('\n').find(l => l.includes("/financeiro/fila-pagamentos/comprovantes/compartilhar'"));
  assert(lote.includes("allowFilaPagamentosBaixa, uploadRateLimit, uploadComprovantesPagamento.single('file')"));
  console.log('Schema compartilhado: migration idempotente/sem dados, protecao fila/hash, nomes legados, model alinhado e rollback nao destrutivo aprovados. Sem banco/rede.');
})().catch(e => { console.error(e); process.exitCode = 1; });
