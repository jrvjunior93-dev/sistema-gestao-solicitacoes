module.exports = (sequelize, DataTypes) => {
  const Historico = sequelize.define('Historico', {

    solicitacao_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    usuario_responsavel_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },

    setor: {
      type: DataTypes.STRING,
      allowNull: false
    },

    acao: {
      type: DataTypes.STRING,
      allowNull: false
    },

    status_anterior: {
      type: DataTypes.STRING,
      allowNull: true
    },

    status_novo: {
      type: DataTypes.STRING,
      allowNull: true
    },

    observacao: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    descricao: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    metadata: {
      type: DataTypes.TEXT
    }    

  }, {
    tableName: 'historicos',
    timestamps: true
  });

  return Historico;
};
