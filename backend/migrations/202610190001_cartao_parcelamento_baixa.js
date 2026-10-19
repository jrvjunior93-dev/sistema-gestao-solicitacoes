'use strict';
const { tableExists, columnExists, indexExists } = require('../src/database/schemaUtils');
module.exports = {
  async up({ queryInterface: qi, sequelize, DataTypes: D }) {
    for (const [name, type] of [['cartao_baixa_chave', D.STRING(80)], ['cartao_baixa_hash', D.STRING(64)]]) {
      if (!await columnExists(sequelize, 'movimentos_financeiros', name)) await qi.addColumn('movimentos_financeiros', name, { type, allowNull: true });
    }
    if (!await indexExists(sequelize, 'movimentos_financeiros', 'uq_mov_cartao_baixa_chave')) await qi.addIndex('movimentos_financeiros', ['cartao_baixa_chave'], { unique: true, name: 'uq_mov_cartao_baixa_chave' });
    const table = 'financeiro_cartao_baixa_parcelas';
    const fk = model => ({ type: D.INTEGER, allowNull: false, references: { model, key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'RESTRICT' });
    if (!await tableExists(sequelize, table)) await qi.createTable(table, {
      id: { type: D.INTEGER, primaryKey: true, autoIncrement: true },
      movimento_financeiro_id: fk('movimentos_financeiros'), titulo_financeiro_id: fk('titulos_financeiros'),
      fatura_cartao_id: fk('financeiro_faturas_cartao'),
      numero_parcela: { type: D.INTEGER, allowNull: false }, quantidade_parcelas: { type: D.INTEGER, allowNull: false },
      data_compra: { type: D.DATEONLY, allowNull: false }, valor: { type: D.DECIMAL(14, 2), allowNull: false },
      status: { type: D.STRING(20), allowNull: false, defaultValue: 'ATIVA' }, criado_por: fk('users'),
      estornado_por: { type: D.INTEGER, allowNull: true }, estornado_em: { type: D.DATE, allowNull: true },
      createdAt: { type: D.DATE, allowNull: false }, updatedAt: { type: D.DATE, allowNull: false }
    });
    for (const [name, fields, unique] of [
      ['uq_cbc_mov_parcela', ['movimento_financeiro_id', 'numero_parcela'], true],
      ['idx_cbc_fatura_status', ['fatura_cartao_id', 'status', 'id'], false],
      ['idx_cbc_titulo', ['titulo_financeiro_id', 'id'], false]
    ]) if (!await indexExists(sequelize, table, name)) await qi.addIndex(table, fields, { name, unique });
  },
  async down() { throw Error('Parcelas financeiras e historico exigem revisao explicita antes de remover o schema.'); }
};
