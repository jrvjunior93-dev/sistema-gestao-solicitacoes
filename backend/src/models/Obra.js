module.exports = (sequelize, DataTypes) => {
  const Obra = sequelize.define('Obra', {
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
