'use strict';

const { columnExists, indexExists } = require('../src/database/schemaUtils');

/**
 * Cadastro rapido de favorecido na Nova Solicitacao.
 *
 * O favorecido operacional continua sendo um `parceiro`: solicitacoes, medicoes e titulos ja
 * apontam para essa tabela. O cadastro simplificado, porem, nasce apenas com nome, telefone e PIX;
 * por isso documento e tipo de pessoa precisam aceitar NULL. Os cadastros completos continuam
 * exigindo esses dados na camada de servico — esta migration nao afrouxa a regra dos credores.
 *
 * `pix_chave_canonica` protege contra dois cliques concorrentes no cadastro rapido sem executar
 * backfill. Registros antigos continuam intactos e seguem localizados pelas tres colunas PIX.
 */
module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (await columnExists(sequelize, 'parceiros', 'cpf_cnpj')) {
      await queryInterface.changeColumn('parceiros', 'cpf_cnpj', {
        type: DataTypes.STRING(20),
        allowNull: true
      });
    }

    if (await columnExists(sequelize, 'parceiros', 'tipo_pessoa')) {
      await queryInterface.changeColumn('parceiros', 'tipo_pessoa', {
        type: DataTypes.STRING(1),
        allowNull: true
      });
    }

    if (!await columnExists(sequelize, 'parceiros', 'cadastro_simplificado_favorecido')) {
      await queryInterface.addColumn('parceiros', 'cadastro_simplificado_favorecido', {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }

    if (!await columnExists(sequelize, 'parceiros', 'pix_chave_canonica')) {
      await queryInterface.addColumn('parceiros', 'pix_chave_canonica', {
        type: DataTypes.STRING(300),
        allowNull: true
      });
    }

    if (!await indexExists(sequelize, 'parceiros', 'uq_parceiro_pix_canonica')) {
      await queryInterface.addIndex('parceiros', ['pix_chave_canonica'], {
        name: 'uq_parceiro_pix_canonica',
        unique: true
      });
    }
  },

  async down() {
    // Migration aditiva e compativel com registros antigos; rollback destrutivo apenas assistido.
  }
};
