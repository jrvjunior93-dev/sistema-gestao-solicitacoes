module.exports = (sequelize, DataTypes) => {
  return sequelize.define('Notificacao', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },

    solicitacao_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },

    tipo: {
      type: DataTypes.STRING,
      allowNull: false
    },

    mensagem: {
      type: DataTypes.STRING,
      allowNull: false
    },

    metadata: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    tableName: 'notificacoes',
    timestamps: true
  });
};
