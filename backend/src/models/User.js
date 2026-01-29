module.exports = (sequelize, DataTypes) => {
  return sequelize.define('User', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },

    nome: {
      type: DataTypes.STRING,
      allowNull: false
    },

    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },

    senha: {
      type: DataTypes.STRING,
      allowNull: false
    },

    perfil: {
      type: DataTypes.STRING,
      allowNull: false
    },

    cargo_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    setor_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    ativo: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    tableName: 'users',
    timestamps: true
  });
};
