module.exports = (sequelize, DataTypes) => sequelize.define(
  'InsumoCodigoSequencia',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    chave: {
      type: DataTypes.STRING(80),
      allowNull: false,
      unique: true
    },
    ultimo_numero: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    }
  },
  {
    tableName: 'insumo_codigo_sequencias',
    timestamps: true
  }
);
