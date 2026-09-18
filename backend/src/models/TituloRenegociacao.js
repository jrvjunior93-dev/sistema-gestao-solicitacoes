module.exports = (sequelize, D) => sequelize.define('TituloRenegociacao', {
  id: { type: D.INTEGER, primaryKey: true, autoIncrement: true },
  chave: { type: D.STRING(100), allowNull: false, unique: true },
  payload_hash: { type: D.STRING(64), allowNull: false }, usuario_id: { type: D.INTEGER, allowNull: false },
  motivo: { type: D.STRING(1000), allowNull: false }, principal: D.DECIMAL(14,2), juros: D.DECIMAL(14,2), multa: D.DECIMAL(14,2),
  snapshot: { type: D.JSON, allowNull: false }, resultado: D.JSON
}, { tableName: 'titulo_renegociacoes', timestamps: true });
