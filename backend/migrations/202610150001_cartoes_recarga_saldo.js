'use strict';
const { tableExists, columnExists, indexExists } = require('../src/database/schemaUtils');
module.exports = {
  async up({ queryInterface: qi, sequelize, DataTypes: D }) {
    for (const campo of ['valor_despesas', 'saldo_disponivel_envio', 'saldo_remanescente']) {
      if (!(await columnExists(sequelize, 'cartoes_recarga_prestacoes', campo))) {
        await qi.addColumn('cartoes_recarga_prestacoes', campo, { type: D.DECIMAL(15, 2), allowNull: true });
      }
    }
    if (!(await tableExists(sequelize, 'cartoes_recarga_saldo_ajustes'))) {
      await qi.createTable('cartoes_recarga_saldo_ajustes', {
        id: { type: D.INTEGER, primaryKey: true, autoIncrement: true },
        cartao_recarga_id: { type: D.INTEGER, allowNull: false },
        solicitacao_id: { type: D.INTEGER, allowNull: false },
        chave_idempotencia: { type: D.STRING(80), allowNull: false },
        saldo_anterior: { type: D.DECIMAL(15, 2), allowNull: false },
        saldo_informado: { type: D.DECIMAL(15, 2), allowNull: false },
        valor_ajuste: { type: D.DECIMAL(15, 2), allowNull: false },
        motivo: { type: D.TEXT, allowNull: false },
        anexo_id: { type: D.INTEGER, allowNull: false },
        criado_por: { type: D.INTEGER, allowNull: false },
        createdAt: { type: D.DATE, allowNull: false, defaultValue: D.NOW },
        updatedAt: { type: D.DATE, allowNull: false, defaultValue: D.NOW }
      });
    }
    for (const [name, campos, unique] of [
      ['uq_cartao_saldo_ajuste_chave', ['chave_idempotencia'], true],
      ['idx_cartao_saldo_ajuste_cartao', ['cartao_recarga_id', 'id'], false]
    ]) {
      if (!(await indexExists(sequelize, 'cartoes_recarga_saldo_ajustes', name))) {
        await qi.addIndex('cartoes_recarga_saldo_ajustes', campos, { name, unique });
      }
    }
  },
  // Sem down automatico: os ajustes constituem trilha de auditoria financeira.
  async down() { throw new Error('Rollback do saldo exige preservacao da auditoria e autorizacao explicita.'); }
};
