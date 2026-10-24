module.exports = (sequelize, DataTypes) => sequelize.define(
  'FiscalDocumentLink',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    fiscal_dfe_document_id: { type: DataTypes.INTEGER, allowNull: false },
    purchase_link_key: { type: DataTypes.STRING(100), allowNull: true },
    allocated_value: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
    solicitacao_id: { type: DataTypes.INTEGER, allowNull: true },
    solicitacao_compra_id: { type: DataTypes.INTEGER, allowNull: true },
    pedido_id: { type: DataTypes.INTEGER, allowNull: true },
    pedido_item_id: { type: DataTypes.INTEGER, allowNull: true },
    financeiro_titulo_id: { type: DataTypes.INTEGER, allowNull: true },
    obra_id: { type: DataTypes.INTEGER, allowNull: true },
    centro_custo_id: { type: DataTypes.INTEGER, allowNull: true },
    apropriacao_id: { type: DataTypes.INTEGER, allowNull: true },
    plano_financeiro_id: { type: DataTypes.INTEGER, allowNull: true },
    fornecedor_id: { type: DataTypes.INTEGER, allowNull: true },
    link_status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'suggested' },
    confidence_score: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
    matched_by: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'manual' },
    matched_reason: { type: DataTypes.TEXT, allowNull: true },
    created_by: { type: DataTypes.INTEGER, allowNull: true },
    confirmed_by: { type: DataTypes.INTEGER, allowNull: true },
    confirmed_at: { type: DataTypes.DATE, allowNull: true }
  },
  {
    tableName: 'fiscal_document_links',
    timestamps: true
  }
);
