module.exports = (sequelize, DataTypes) => sequelize.define(
  'InsumoAlias',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    insumo_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    alias: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    alias_normalizado: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true
    },
    origem_item_manual_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    ativo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    }
  },
  {
    tableName: 'insumo_aliases',
    timestamps: true
  }
);
