'use strict';
const { tableExists, resolveTableName } = require('../src/database/schemaUtils');

module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (!await tableExists(sequelize, 'solicitacoes_favorecidos')) {
    const solicitacoes = await resolveTableName(sequelize, ['Solicitacoes', 'solicitacoes'], 'solicitacoes');
    const parceiros = await resolveTableName(sequelize, ['Parceiros', 'parceiros'], 'parceiros');
    await queryInterface.createTable('solicitacoes_favorecidos', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      solicitacao_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: solicitacoes, key: 'id' } },
      medicao_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'contrato_medicoes', key: 'id' } },
      contrato_parcela_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'contrato_parcelas', key: 'id' } },
      ordem: { type: DataTypes.INTEGER, allowNull: false },
      favorecido_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: parceiros, key: 'id' } },
      nome_favorecido: { type: DataTypes.STRING(255), allowNull: false },
      cpf_cnpj: { type: DataTypes.STRING(30), allowNull: true },
      forma_pagamento_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'financeiro_formas_pagamento', key: 'id' } },
      forma_pagamento_nome: { type: DataTypes.STRING(120), allowNull: false },
      forma_pagamento_tipo: { type: DataTypes.STRING(60), allowNull: true },
      valor: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      favorecido_chave_pix: { type: DataTypes.TEXT, allowNull: true },
      dados_pagamento: { type: DataTypes.TEXT, allowNull: true },
      boleto_nomes: { type: DataTypes.JSON, allowNull: true },
      titulo_financeiro_id: { type: DataTypes.INTEGER, allowNull: true, unique: true, references: { model: 'titulos_financeiros', key: 'id' } },
      criado_por: { type: DataTypes.INTEGER, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
    });
    }
    const indices = new Set((await queryInterface.showIndex('solicitacoes_favorecidos')).map(i => i.name));
    if (!indices.has('sol_fav_solicitacao_medicao')) await queryInterface.addIndex('solicitacoes_favorecidos', ['solicitacao_id', 'medicao_id'], { name: 'sol_fav_solicitacao_medicao' });
    if (!indices.has('sol_fav_parcela')) await queryInterface.addIndex('solicitacoes_favorecidos', ['contrato_parcela_id'], { name: 'sol_fav_parcela' });
    // Nao converte registros historicos nem cria titulos/filas/baixas.
  },
  async down() { throw new Error('Preservar instrucoes e vinculos financeiros. Rollback exige plano especifico.'); }
};
