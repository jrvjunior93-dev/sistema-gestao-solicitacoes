module.exports = (sequelize, DataTypes) => sequelize.define('CartaoRecarga', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  nome: { type: DataTypes.STRING(120), allowNull: false },
  identificador: { type: DataTypes.STRING(80), allowNull: false },
  ultimos_quatro: { type: DataTypes.STRING(4), allowNull: false },
  parceiro_id: { type: DataTypes.INTEGER, allowNull: false },
  empresa_id: { type: DataTypes.INTEGER, allowNull: true },
  categoria_financeira_id: { type: DataTypes.INTEGER, allowNull: true },
  ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  observacoes: { type: DataTypes.TEXT, allowNull: true },
  criado_por: { type: DataTypes.INTEGER, allowNull: true },
  atualizado_por: { type: DataTypes.INTEGER, allowNull: true }
}, {
  tableName: 'cartoes_recarga',
  timestamps: true
});
