module.exports = (sequelize, DataTypes) => {
  const Apropriacao = sequelize.define(
    'Apropriacao',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      obra_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      codigo: {
        type: DataTypes.STRING,
        allowNull: false
      },
      descricao: {
        type: DataTypes.STRING,
        allowNull: true
      },
      ativo: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      }
    },
    {
      tableName: 'apropriacoes',
      timestamps: true
    }
  );

  return Apropriacao;
};
