module.exports = (sequelize, DataTypes) => {
  return sequelize.define('UsuarioObra', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },

    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    obra_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    perfil: {
      type: DataTypes.STRING,
      allowNull: false
    }
  }, {
    tableName: 'usuarios_obras',
    timestamps: true
  });
};
