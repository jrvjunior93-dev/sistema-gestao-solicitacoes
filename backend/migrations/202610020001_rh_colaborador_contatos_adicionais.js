'use strict';

const { columnExists } = require('../src/database/schemaUtils');

const TABELA = 'rh_colaboradores';
const CAMPOS = {
  telefone_secundario: 30,
  endereco_secundario: 255,
  numero_secundario: 50,
  complemento_secundario: 120,
  bairro_secundario: 120,
  municipio_secundario: 120,
  estado_secundario: 2,
  cep_secundario: 20
};

module.exports = {
  async up({ queryInterface, DataTypes, sequelize }) {
    for (const [campo, tamanho] of Object.entries(CAMPOS)) {
      // eslint-disable-next-line no-await-in-loop
      if (!(await columnExists(sequelize, TABELA, campo))) {
        // eslint-disable-next-line no-await-in-loop
        await queryInterface.addColumn(TABELA, campo, { type: DataTypes.STRING(tamanho), allowNull: true });
      }
    }
  },

  async down({ queryInterface, sequelize }) {
    for (const campo of Object.keys(CAMPOS).reverse()) {
      // eslint-disable-next-line no-await-in-loop
      if (await columnExists(sequelize, TABELA, campo)) {
        // eslint-disable-next-line no-await-in-loop
        await queryInterface.removeColumn(TABELA, campo);
      }
    }
  }
};
