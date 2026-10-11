'use strict';
const { columnExists, tableExists, resolveTableName } = require('../src/database/schemaUtils');
const { QueryTypes } = require('sequelize');
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
    // Somente cadastros aditivos; IDs resolvidos no ambiente. Nao reinterpreta
    // subtipos antigos nem cria categorias financeiras automaticamente.
    const { tipoPermiteAdiantamento } = require('../src/services/adiantamentoDomain');
    const { normalizeTipoSolicitacaoBehavior } = require('../src/services/tipoSolicitacaoBehaviorService');
    await sequelize.transaction(async transaction => {
      const tipos = await sequelize.query('SELECT id, nome, codigo_interno, comportamento FROM tipo_solicitacao WHERE ativo = 1 ORDER BY id FOR UPDATE', { type: QueryTypes.SELECT, transaction });
      for (const tipo of tipos.filter(tipo => {
        const behavior = normalizeTipoSolicitacaoBehavior(tipo);
        return tipoPermiteAdiantamento(tipo) && !behavior.usa_fluxo_contrato_novo && !behavior.usa_fluxo_cadastro_obra && !behavior.mostrar_periodo_medicao && !behavior.somente_sistema;
      })) {
        const existentes = await sequelize.query('SELECT id FROM tipos_sub_contrato WHERE tipo_macro_id = :id AND usa_fluxo_adiantamento = 1', { replacements: { id: tipo.id }, type: QueryTypes.SELECT, transaction });
        let id = existentes[0]?.id;
        if (!id) {
          const [resultado] = await sequelize.query('INSERT INTO tipos_sub_contrato (tipo_macro_id, nome, usa_fluxo_recarga_cartao, usa_fluxo_adiantamento, ativo, createdAt, updatedAt) VALUES (:id, :nome, 0, 1, 1, NOW(), NOW())', { replacements: { id: tipo.id, nome: 'ADIANTAMENTO' }, transaction });
          id = resultado;
        }
        await sequelize.query('INSERT IGNORE INTO tipos_sub_contrato_tipos_solicitacao (tipo_sub_contrato_id, tipo_solicitacao_id, createdAt, updatedAt) VALUES (:sub, :tipo, NOW(), NOW())', { replacements: { sub: id, tipo: tipo.id }, transaction });
      }
    });
  },
  async down() { throw new Error('Preservar adiantamentos, prestacoes e devolucoes auditaveis. Rollback requer plano especifico.'); }
};
