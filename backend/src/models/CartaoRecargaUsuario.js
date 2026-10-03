module.exports = (sequelize, DataTypes) => sequelize.define('CartaoRecargaUsuario', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  cartao_recarga_id: { type: DataTypes.INTEGER, allowNull: false },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  criado_por: { type: DataTypes.INTEGER, allowNull: true }
}, {
  tableName: 'cartoes_recarga_usuarios',
  timestamps: true
});
