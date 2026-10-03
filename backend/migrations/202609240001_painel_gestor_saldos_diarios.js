const { foreignKeyExists, indexExists, tableExists } = require('../src/database/schemaUtils');

module.exports = {
  async up({ queryInterface, sequelize, DataTypes }) {
    const Sequelize = DataTypes;

    if (!(await tableExists(sequelize, 'painel_gestor_saldos_diarios'))) {
      await queryInterface.createTable('painel_gestor_saldos_diarios', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        conta_bancaria_id: { type: Sequelize.INTEGER, allowNull: false },
        empresa_id: { type: Sequelize.INTEGER, allowNull: true },
        data_referencia: { type: Sequelize.DATEONLY, allowNull: false },
        saldo_disponivel: { type: Sequelize.DECIMAL(18, 2), allowNull: false },
        corrigido: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        ultima_justificativa: { type: Sequelize.TEXT, allowNull: true },
        informado_por: { type: Sequelize.INTEGER, allowNull: true },
        atualizado_por: { type: Sequelize.INTEGER, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
      });
    }

    if (!(await indexExists(sequelize, 'painel_gestor_saldos_diarios', 'uq_painel_gestor_saldo_conta_data'))) {
      await queryInterface.addIndex('painel_gestor_saldos_diarios', ['conta_bancaria_id', 'data_referencia'], {
        name: 'uq_painel_gestor_saldo_conta_data',
        unique: true
      });
    }
    if (!(await indexExists(sequelize, 'painel_gestor_saldos_diarios', 'idx_painel_gestor_saldo_empresa_data'))) {
      await queryInterface.addIndex('painel_gestor_saldos_diarios', ['empresa_id', 'data_referencia'], {
        name: 'idx_painel_gestor_saldo_empresa_data'
      });
    }

    const saldoForeignKeys = [
      ['fk_painel_gestor_saldo_conta', ['conta_bancaria_id'], 'contas_bancarias', 'id', 'RESTRICT'],
      ['fk_painel_gestor_saldo_empresa', ['empresa_id'], 'empresas_grupo', 'id', 'SET NULL'],
      ['fk_painel_gestor_saldo_informado_por', ['informado_por'], 'users', 'id', 'SET NULL'],
      ['fk_painel_gestor_saldo_atualizado_por', ['atualizado_por'], 'users', 'id', 'SET NULL']
    ];
    for (const [name, fields, table, field, onDelete] of saldoForeignKeys) {
      if (!(await foreignKeyExists(sequelize, 'painel_gestor_saldos_diarios', name))) {
        await queryInterface.addConstraint('painel_gestor_saldos_diarios', {
          fields,
          type: 'foreign key',
          name,
          references: { table, field },
          onDelete,
          onUpdate: 'CASCADE'
        });
      }
    }

    if (!(await tableExists(sequelize, 'painel_gestor_saldos_historicos'))) {
      await queryInterface.createTable('painel_gestor_saldos_historicos', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        saldo_diario_id: { type: Sequelize.INTEGER, allowNull: false },
        conta_bancaria_id: { type: Sequelize.INTEGER, allowNull: false },
        data_referencia: { type: Sequelize.DATEONLY, allowNull: false },
        saldo_anterior: { type: Sequelize.DECIMAL(18, 2), allowNull: true },
        saldo_novo: { type: Sequelize.DECIMAL(18, 2), allowNull: false },
        acao: { type: Sequelize.STRING(20), allowNull: false },
        justificativa: { type: Sequelize.TEXT, allowNull: true },
        usuario_id: { type: Sequelize.INTEGER, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
      });
    }

    if (!(await indexExists(sequelize, 'painel_gestor_saldos_historicos', 'idx_painel_gestor_saldo_hist_registro'))) {
      await queryInterface.addIndex('painel_gestor_saldos_historicos', ['saldo_diario_id', 'createdAt'], {
        name: 'idx_painel_gestor_saldo_hist_registro'
      });
    }

    const historicoForeignKeys = [
      ['fk_painel_gestor_saldo_hist_saldo', ['saldo_diario_id'], 'painel_gestor_saldos_diarios', 'id', 'CASCADE'],
      ['fk_painel_gestor_saldo_hist_conta', ['conta_bancaria_id'], 'contas_bancarias', 'id', 'RESTRICT'],
      ['fk_painel_gestor_saldo_hist_usuario', ['usuario_id'], 'users', 'id', 'SET NULL']
    ];
    for (const [name, fields, table, field, onDelete] of historicoForeignKeys) {
      if (!(await foreignKeyExists(sequelize, 'painel_gestor_saldos_historicos', name))) {
        await queryInterface.addConstraint('painel_gestor_saldos_historicos', {
          fields,
          type: 'foreign key',
          name,
          references: { table, field },
          onDelete,
          onUpdate: 'CASCADE'
        });
      }
    }
  },

  async down({ queryInterface, sequelize }) {
    if (await tableExists(sequelize, 'painel_gestor_saldos_historicos')) {
      await queryInterface.dropTable('painel_gestor_saldos_historicos');
    }
    if (await tableExists(sequelize, 'painel_gestor_saldos_diarios')) {
      await queryInterface.dropTable('painel_gestor_saldos_diarios');
    }
  }
};
