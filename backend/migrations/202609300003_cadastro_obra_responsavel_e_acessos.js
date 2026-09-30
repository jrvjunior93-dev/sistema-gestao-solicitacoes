'use strict';

const {
  columnExists,
  resolveTableName,
  tableExists
} = require('../src/database/schemaUtils');

const DADOS_TABLE = 'solicitacao_cadastro_obra_dados';

module.exports = {
  async up({ queryInterface, DataTypes, sequelize }) {
    const obrasTableName = await resolveTableName(sequelize, ['Obras', 'obras'], 'Obras');

    if (await tableExists(sequelize, DADOS_TABLE)) {
      if (!(await columnExists(sequelize, DADOS_TABLE, 'responsavel_tecnico'))) {
        await queryInterface.addColumn(DADOS_TABLE, 'responsavel_tecnico', {
          type: DataTypes.STRING(160),
          allowNull: true
        });
      }

      // O ID permanece para leitura dos registros legados. Novas solicitacoes gravam o nome
      // textual e separam os usuarios com acesso na tabela de vinculos ja existente.
      if (await columnExists(sequelize, DADOS_TABLE, 'responsavel_tecnico_id')) {
        await queryInterface.changeColumn(DADOS_TABLE, 'responsavel_tecnico_id', {
          type: DataTypes.INTEGER,
          allowNull: true
        });
      }
    }

    if (!(await columnExists(sequelize, obrasTableName, 'responsavel_tecnico'))) {
      await queryInterface.addColumn(obrasTableName, 'responsavel_tecnico', {
        type: DataTypes.STRING(160),
        allowNull: true
      });
    }
  },

  async down({ queryInterface, sequelize }) {
    const obrasTableName = await resolveTableName(sequelize, ['Obras', 'obras'], 'Obras');
    if (await columnExists(sequelize, obrasTableName, 'responsavel_tecnico')) {
      await queryInterface.removeColumn(obrasTableName, 'responsavel_tecnico');
    }
    if (await tableExists(sequelize, DADOS_TABLE)
      && await columnExists(sequelize, DADOS_TABLE, 'responsavel_tecnico')) {
      await queryInterface.removeColumn(DADOS_TABLE, 'responsavel_tecnico');
    }
    // A coluna legada continua anulavel no rollback para nao invalidar solicitacoes criadas
    // depois da separacao entre responsavel tecnico e usuarios com acesso.
  }
};
