module.exports = (sequelize, DataTypes) => {
  const Unidade = sequelize.define(
    'Unidade',
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
      sigla: {
        type: DataTypes.STRING,
        allowNull: false
      },
      ativo: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      }
    },
    {
      tableName: 'unidades',
      timestamps: true
    }
  );

  return Unidade;
};
