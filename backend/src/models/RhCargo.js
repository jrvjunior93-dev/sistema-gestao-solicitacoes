module.exports = (sequelize, DataTypes) => sequelize.define(
  'RhCargo',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    codigo: { type: DataTypes.STRING(80), allowNull: false },
    nome: { type: DataTypes.STRING(120), allowNull: false },
    cbo: { type: DataTypes.STRING(10), allowNull: true },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
  },
  {
    tableName: 'rh_cargos',
    timestamps: true
  }
);
