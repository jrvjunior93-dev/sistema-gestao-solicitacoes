module.exports = (sequelize, DataTypes) => {
  const Setor = sequelize.define(
    'Setor',
    {
      nome: {
        type: DataTypes.STRING,
        allowNull: false
      },

      codigo: {
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
      tableName: 'setores',
      timestamps: true
    }
  );

  return Setor;
};
