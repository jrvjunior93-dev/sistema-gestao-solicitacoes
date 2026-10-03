module.exports = (sequelize, DataTypes) => sequelize.define(
  'SolicitacaoPedidoRetorno',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    solicitacao_id: { type: DataTypes.INTEGER, allowNull: false },
    solicitado_por: { type: DataTypes.INTEGER, allowNull: false },
    setor_solicitante: { type: DataTypes.STRING(80), allowNull: false },
    setor_atual_pedido: { type: DataTypes.STRING(80), allowNull: false },
    motivo: { type: DataTypes.TEXT, allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'PENDENTE' },
    decidido_por: { type: DataTypes.INTEGER, allowNull: true },
    decidido_em: { type: DataTypes.DATE, allowNull: true },
    motivo_decisao: { type: DataTypes.TEXT, allowNull: true }
  },
  {
    tableName: 'solicitacao_pedidos_retorno',
    timestamps: true
  }
);
