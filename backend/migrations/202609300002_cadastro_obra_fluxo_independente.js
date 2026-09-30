'use strict';

const { columnExists, indexExists, tableExists } = require('../src/database/schemaUtils');

const DADOS_TABLE = 'solicitacao_cadastro_obra_dados';

module.exports = {
  async up({ queryInterface, DataTypes, sequelize }) {
    await queryInterface.changeColumn('solicitacoes', 'obra_id', {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'obras', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    });

    const colunasObra = {
      fase_obra: { type: DataTypes.STRING(30), allowNull: true },
      valor_obra: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
      responsavel_tecnico_id: { type: DataTypes.INTEGER, allowNull: true },
      documentacao_pendente: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      solicitacao_cadastro_origem_id: { type: DataTypes.INTEGER, allowNull: true }
    };
    for (const [nome, definicao] of Object.entries(colunasObra)) {
      if (!(await columnExists(sequelize, 'obras', nome))) {
        // eslint-disable-next-line no-await-in-loop
        await queryInterface.addColumn('obras', nome, definicao);
      }
    }

    if (!(await tableExists(sequelize, DADOS_TABLE))) {
      await queryInterface.createTable(DADOS_TABLE, {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        solicitacao_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'solicitacoes', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        tipo_obra: { type: DataTypes.STRING(20), allowNull: false },
        fase_obra: { type: DataTypes.STRING(30), allowNull: false },
        valor_obra: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
        responsavel_tecnico_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE'
        },
        endereco: { type: DataTypes.TEXT, allowNull: false },
        documentacao_pendente: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        obra_cadastrada_id: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: 'obras', key: 'id' },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE'
        },
        obra_cadastrada_por: { type: DataTypes.INTEGER, allowNull: true },
        obra_cadastrada_em: { type: DataTypes.DATE, allowNull: true },
        criado_por: { type: DataTypes.INTEGER, allowNull: false },
        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') }
      });
    }

    if (!(await indexExists(sequelize, DADOS_TABLE, 'uq_solicitacao_cadastro_obra_dados'))) {
      await queryInterface.addIndex(DADOS_TABLE, ['solicitacao_id'], {
        name: 'uq_solicitacao_cadastro_obra_dados',
        unique: true
      });
    }
    if (!(await indexExists(sequelize, DADOS_TABLE, 'uq_solicitacao_cadastro_obra_cadastrada'))) {
      await queryInterface.addIndex(DADOS_TABLE, ['obra_cadastrada_id'], {
        name: 'uq_solicitacao_cadastro_obra_cadastrada',
        unique: true
      });
    }
  },

  async down({ queryInterface, DataTypes, sequelize }) {
    if (await tableExists(sequelize, DADOS_TABLE)) await queryInterface.dropTable(DADOS_TABLE);
    for (const nome of [
      'solicitacao_cadastro_origem_id',
      'documentacao_pendente',
      'responsavel_tecnico_id',
      'valor_obra',
      'fase_obra'
    ]) {
      if (await columnExists(sequelize, 'obras', nome)) {
        // eslint-disable-next-line no-await-in-loop
        await queryInterface.removeColumn('obras', nome);
      }
    }
    await queryInterface.changeColumn('solicitacoes', 'obra_id', {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'obras', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    });
  }
};
