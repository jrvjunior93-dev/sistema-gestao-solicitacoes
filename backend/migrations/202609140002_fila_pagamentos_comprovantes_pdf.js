'use strict';

const { columnExists, foreignKeyExists, indexExists, tableExists } = require('../src/database/schemaUtils');

const TABELA = 'pagamentos_manuais_fila';

const COLUNAS = {
  comprovante_nome: { type: 'STRING', length: 255 },
  comprovante_url: { type: 'TEXT' },
  comprovante_hash: { type: 'STRING', length: 64 },
  comprovante_banco: { type: 'STRING', length: 40 },
  comprovante_tipo: { type: 'STRING', length: 40 },
  comprovante_identificador: { type: 'STRING', length: 160 },
  comprovante_dados_json: { type: 'JSON' },
  comprovante_vinculado_por: { type: 'INTEGER' },
  comprovante_vinculado_em: { type: 'DATE' }
};

function definition(DataTypes, config) {
  if (config.type === 'STRING') return { type: DataTypes.STRING(config.length), allowNull: true };
  return { type: DataTypes[config.type], allowNull: true };
}

module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (!(await tableExists(sequelize, TABELA))) return;

    for (const [column, config] of Object.entries(COLUNAS)) {
      if (!(await columnExists(sequelize, TABELA, column))) {
        await queryInterface.addColumn(TABELA, column, definition(DataTypes, config));
      }
    }

    if (!(await foreignKeyExists(sequelize, TABELA, 'pmf_comprovante_usuario_fk'))) {
      await queryInterface.addConstraint(TABELA, {
        fields: ['comprovante_vinculado_por'],
        type: 'foreign key',
        name: 'pmf_comprovante_usuario_fk',
        references: { table: 'users', field: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }

    if (!(await indexExists(sequelize, TABELA, 'pmf_comprovante_hash_uk'))) {
      await queryInterface.addIndex(TABELA, ['comprovante_hash'], {
        name: 'pmf_comprovante_hash_uk',
        unique: true
      });
    }
    if (!(await indexExists(sequelize, TABELA, 'pmf_comprovante_identificador_idx'))) {
      await queryInterface.addIndex(TABELA, ['comprovante_banco', 'comprovante_identificador'], {
        name: 'pmf_comprovante_identificador_idx'
      });
    }
  },

  async down() {
    // Sem rollback destrutivo: os comprovantes integram a trilha da baixa financeira.
  }
};
