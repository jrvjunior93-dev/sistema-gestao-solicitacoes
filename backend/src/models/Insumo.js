module.exports = (sequelize, DataTypes) => {
  const Insumo = sequelize.define(
    'Insumo',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      nome: {
        type: DataTypes.STRING,
        allowNull: false
      },
      codigo: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true
      },
      descricao: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      unidade_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      categoria_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      ativo: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      }
    },
    {
      tableName: 'insumos',
      timestamps: true
    }
  );

  return Insumo;
};
