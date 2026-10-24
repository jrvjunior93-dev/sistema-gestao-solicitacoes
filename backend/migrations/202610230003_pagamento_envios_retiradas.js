'use strict';
const { tableExists } = require('../src/database/schemaUtils');
module.exports = {
  async up({ sequelize, queryInterface, DataTypes }) {
    if (await tableExists(sequelize, 'pagamento_envios_retiradas')) {
      const colunas = await queryInterface.describeTable('pagamento_envios_retiradas');
      const indices = await queryInterface.showIndex('pagamento_envios_retiradas');
      if (['id', 'usuario_id', 'chave', 'pedido_hash', 'resultado', 'createdAt', 'updatedAt'].some(c => !colunas[c])
        || !indices.some(i => i.unique && i.fields.map(f => f.attribute).join(',') === 'usuario_id,chave')) {
        throw Error('Tabela de retiradas existente incompativel; conferir schema sem apagar historico.');
      }
      return;
    }
    await queryInterface.createTable('pagamento_envios_retiradas', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      usuario_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
      chave: { type: DataTypes.STRING(64), allowNull: false },
      pedido_hash: { type: DataTypes.STRING(64), allowNull: false },
      resultado: { type: DataTypes.JSON, allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false }, updatedAt: { type: DataTypes.DATE, allowNull: false }
    }, { uniqueKeys: { pagamento_retirada_usuario_chave: { fields: ['usuario_id', 'chave'] } } });
  },
  async down() { throw Error('Reversao automatica bloqueada: preservar auditoria e idempotencia das retiradas.'); }
};
