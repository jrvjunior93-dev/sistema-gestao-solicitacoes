module.exports = (sequelize, DataTypes) => {
  const Obra = sequelize.define('Obra', {
    codigo: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: false
    },
    cidade: {
      type: DataTypes.STRING,
      allowNull: true
    },
    nome: {
      type: DataTypes.STRING,
      allowNull: false
    },
    ativo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    }
  });

  return Obra;
};
