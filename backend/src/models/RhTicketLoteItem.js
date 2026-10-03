module.exports = (sequelize, DataTypes) => sequelize.define('RhTicketLoteItem', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  lote_id: { type: DataTypes.INTEGER, allowNull: false },
  colaborador_id: { type: DataTypes.INTEGER, allowNull: false },
  obra_id: { type: DataTypes.INTEGER, allowNull: false },
  valor_ticket: { type: DataTypes.DECIMAL(14, 2), allowNull: false }
}, { tableName: 'rh_ticket_lote_itens', timestamps: true });
