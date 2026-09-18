'use strict';

const { columnExists, tableExists } = require('../src/database/schemaUtils');

module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    const tabela = 'solicitacao_compras';
    if (!(await tableExists(sequelize, tabela))) return;

    if (!(await columnExists(sequelize, tabela, 'formas_pagamento_json'))) {
      await queryInterface.addColumn(tabela, 'formas_pagamento_json', {
        type: DataTypes.JSON, allowNull: true
      });
    }
    if (!(await columnExists(sequelize, tabela, 'dados_pagamento'))) {
      await queryInterface.addColumn(tabela, 'dados_pagamento', {
        type: DataTypes.TEXT, allowNull: true
      });
    }

    if (!(await columnExists(sequelize, tabela, 'frete_forma_pagamento_id'))) {
      await queryInterface.addColumn(tabela, 'frete_forma_pagamento_id', {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'financeiro_formas_pagamento', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }
    if (!(await columnExists(sequelize, tabela, 'frete_favorecido_id'))) {
      await queryInterface.addColumn(tabela, 'frete_favorecido_id', {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'parceiros', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }
    if (!(await columnExists(sequelize, tabela, 'frete_favorecido_chave_pix'))) {
      await queryInterface.addColumn(tabela, 'frete_favorecido_chave_pix', {
        type: DataTypes.STRING(255),
        allowNull: true
      });
    }
  },
  async down() {
    // Dados de pagamento do frete integram a auditoria da compra direta.
  }
};
