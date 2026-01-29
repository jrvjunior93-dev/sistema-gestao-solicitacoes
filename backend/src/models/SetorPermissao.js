module.exports = (sequelize, DataTypes) => {
  const SetorPermissao = sequelize.define('SetorPermissao', {
    setor: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },

    usuario_pode_assumir: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },

    usuario_pode_atribuir: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }

  }, {
    tableName: 'setor_permissoes'
  });

  return SetorPermissao;
};
