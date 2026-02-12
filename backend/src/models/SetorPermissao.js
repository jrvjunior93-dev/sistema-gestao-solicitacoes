module.exports = (sequelize, DataTypes) => {
  const SetorPermissao = sequelize.define('SetorPermissao', {
    setor: {
      type: DataTypes.STRING,
      allowNull: false
    },

    usuario_pode_assumir: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },

    usuario_pode_atribuir: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },

    modo_recebimento: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'TODOS_VISIVEIS'
    }

  }, {
    tableName: 'setor_permissoes'
  });

  return SetorPermissao;
};
