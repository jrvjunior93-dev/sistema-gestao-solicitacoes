module.exports = (sequelize, DataTypes) => {
  const Cargo = sequelize.define('Cargo', {
    nome: {
      type: DataTypes.STRING,
      allowNull: false
    },
    codigo: {
      type: DataTypes.STRING,
      allowNull: false
    },
    ativo: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
    }, {
    tableName: 'cargos',
    timestamps: false
  });


  return Cargo;
};
