'use strict';
const { columnExists, indexExists, tableExists, resolveTableName } = require('../src/database/schemaUtils');

module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    const obras = await resolveTableName(sequelize, ['Obras', 'obras'], 'Obras');
    if (!(await tableExists(sequelize, 'cartoes_recarga_obras'))) {
      await queryInterface.createTable('cartoes_recarga_obras', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        cartao_recarga_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'cartoes_recarga', key: 'id' } },
        obra_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: obras, key: 'id' } },
        ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        criado_por: { type: DataTypes.INTEGER, allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
      });
    }
    if (!(await indexExists(sequelize, 'cartoes_recarga_obras', 'cr_origem_cartao_uq'))) {
      await queryInterface.addIndex('cartoes_recarga_obras', ['cartao_recarga_id', 'obra_id'], { name: 'cr_origem_cartao_uq', unique: true });
    }
    if (!(await indexExists(sequelize, 'cartoes_recarga_obras', 'cr_origem_ativo_idx'))) {
      await queryInterface.addIndex('cartoes_recarga_obras', ['obra_id', 'ativo'], { name: 'cr_origem_ativo_idx' });
    }
    if (!(await columnExists(sequelize, 'tipos_sub_contrato', 'usa_fluxo_recarga_cartao'))) {
      await queryInterface.addColumn('tipos_sub_contrato', 'usa_fluxo_recarga_cartao', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
    }
    await queryInterface.changeColumn('cartoes_recarga_prestacao_rateios', 'apropriacao_id', { type: DataTypes.INTEGER, allowNull: true });
    // Adicionar o novo indice ANTES de remover o antigo preserva o suporte da FK.
    if (!(await indexExists(sequelize, 'solicitacoes_recarga_cartao', 'cr_sol_cartao_uq'))) {
      await queryInterface.addIndex('solicitacoes_recarga_cartao', ['solicitacao_id', 'cartao_recarga_id'], { name: 'cr_sol_cartao_uq', unique: true });
    }
    if (await indexExists(sequelize, 'solicitacoes_recarga_cartao', 'cr_sol_solicitacao_uq')) {
      await queryInterface.removeIndex('solicitacoes_recarga_cartao', 'cr_sol_solicitacao_uq');
    }
    // Nenhum cartao, usuario, subtipo ou recarga e criado/alterado por esta migration.
  },
  async down() { throw new Error('Rollback automatico indisponivel: preservar recargas, prestacoes e vinculos auditaveis.'); }
};
