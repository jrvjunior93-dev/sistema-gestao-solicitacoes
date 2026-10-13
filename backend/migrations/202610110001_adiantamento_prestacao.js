'use strict';
const { columnExists, tableExists, resolveTableName } = require('../src/database/schemaUtils');
module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (!await columnExists(sequelize, 'tipos_sub_contrato', 'usa_fluxo_adiantamento')) {
      await queryInterface.addColumn('tipos_sub_contrato', 'usa_fluxo_adiantamento', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
    }
    const titulos = await resolveTableName(sequelize, ['titulos_financeiros'], 'titulos_financeiros');
    const solicitacoes = await resolveTableName(sequelize, ['Solicitacoes', 'solicitacoes'], 'Solicitacoes');
    if (!await columnExists(sequelize, titulos, 'valor_despesa_prestacao')) await queryInterface.addColumn(titulos, 'valor_despesa_prestacao', { type: DataTypes.DECIMAL(15, 2), allowNull: true });
    if (!await tableExists(sequelize, 'solicitacoes_adiantamento')) await queryInterface.createTable('solicitacoes_adiantamento', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      solicitacao_id: { type: DataTypes.INTEGER, allowNull: false, unique: true, references: { model: solicitacoes, key: 'id' } },
      titulo_financeiro_id: { type: DataTypes.INTEGER, allowNull: false, unique: true, references: { model: titulos, key: 'id' } },
      titulo_devolucao_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: titulos, key: 'id' } },
      valor_solicitado: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
      valor_prestado: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
      status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'AGUARDANDO_PAGAMENTO' },
      prestacao: { type: DataTypes.JSON, allowNull: true }, motivo_rejeicao: { type: DataTypes.TEXT, allowNull: true },
      enviado_por: { type: DataTypes.INTEGER, allowNull: true }, enviado_em: { type: DataTypes.DATE, allowNull: true },
      validado_por: { type: DataTypes.INTEGER, allowNull: true }, validado_em: { type: DataTypes.DATE, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }, updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
    });
    // Somente estrutura. Subtipos e vinculos sao configurados pela interface
    // apos a migration; nenhum cadastro existente e reinterpretado.
  },
  async down() { throw new Error('Preservar adiantamentos, prestacoes e devolucoes auditaveis. Rollback requer plano especifico.'); }
};
