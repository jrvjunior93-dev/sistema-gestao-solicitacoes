module.exports = (sequelize, DataTypes) => sequelize.define(
  'PedidoCompraDocumentoFinanceiro',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    pedido_compra_id: { type: DataTypes.INTEGER, allowNull: false },
    tipo: { type: DataTypes.STRING(30), allowNull: false },
    numero_documento: { type: DataTypes.STRING(120), allowNull: true },
    arquivo_url: { type: DataTypes.TEXT, allowNull: true },
    arquivo_nome: { type: DataTypes.STRING(255), allowNull: true },
    observacoes: { type: DataTypes.TEXT, allowNull: true },
    idempotency_key: { type: DataTypes.STRING(100), allowNull: true },
    criado_por: { type: DataTypes.INTEGER, allowNull: false }
  },
  { tableName: 'pedido_compra_documentos_financeiros', timestamps: true }
);
