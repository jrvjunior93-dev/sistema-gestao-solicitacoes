module.exports = (sequelize, DataTypes) => {
  return sequelize.define('MensagemSetor', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },

    solicitacao_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    setor: {
      type: DataTypes.STRING,
      allowNull: false
    },

    usuario_responsavel_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    mensagem: {
      type: DataTypes.TEXT,
      allowNull: false
    }
  }, {
    tableName: 'mensagens_setor',
    timestamps: true
  });
};
