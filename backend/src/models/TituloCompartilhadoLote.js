module.exports = (sequelize, D) => sequelize.define('TituloCompartilhadoLote', {
  id: { type: D.INTEGER, primaryKey: true, autoIncrement: true },
  chave: { type: D.STRING(100), allowNull: false, unique: true },
  hash: { type: D.STRING(64), allowNull: false }, criado_por: { type: D.INTEGER, allowNull: false },
  snapshot: { type: D.JSON, allowNull: false }, resultado: { type: D.JSON, allowNull: true }
}, { tableName: 'titulos_compartilhados_lotes', timestamps: true });
