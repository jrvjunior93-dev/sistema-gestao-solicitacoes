module.exports = (sequelize, D) => sequelize.define('ObrigacaoOperacionalLiberacao', {
  id: { type: D.INTEGER, primaryKey: true, autoIncrement: true },
  chave: { type: D.STRING(100), allowNull: false, unique: true },
  obra_id: { type: D.INTEGER, allowNull: false }, setor: { type: D.STRING(50), allowNull: false },
  ate: { type: D.DATE, allowNull: false }, usuario_id: { type: D.INTEGER, allowNull: false },
  motivo: { type: D.STRING(2000), allowNull: false }
}, { tableName: 'obrigacoes_operacionais_liberacoes', timestamps: true });
