module.exports = (sequelize, DataTypes) => {
  const Categoria = sequelize.define(
    'Categoria',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      nome: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
      },
      ativo: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      }
    },
    {
      tableName: 'categorias',
      timestamps: true
    }
  );

  return Categoria;
};
