module.exports = (sequelize, DataTypes) => sequelize.define(
  'PedidoCompraTitulo',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    pedido_compra_id: { type: DataTypes.INTEGER, allowNull: false },
    titulo_financeiro_id: { type: DataTypes.INTEGER, allowNull: false },
    numero_parcela: { type: DataTypes.INTEGER, allowNull: true },
    total_parcelas: { type: DataTypes.INTEGER, allowNull: true },
    valor: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    data_vencimento: { type: DataTypes.DATEONLY, allowNull: false },
    status_liberacao: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'PREVISAO' },
    origem: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'NOVO_FLUXO' },
    idempotency_key: { type: DataTypes.STRING(100), allowNull: true },
    criado_por: { type: DataTypes.INTEGER, allowNull: true },
    liberado_por: { type: DataTypes.INTEGER, allowNull: true },
    liberado_em: { type: DataTypes.DATE, allowNull: true },
    cancelado_por: { type: DataTypes.INTEGER, allowNull: true },
    cancelado_em: { type: DataTypes.DATE, allowNull: true },
    motivo_cancelamento: { type: DataTypes.TEXT, allowNull: true }
  },
  { tableName: 'pedido_compra_titulos', timestamps: true }
);
