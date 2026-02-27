module.exports = (sequelize, DataTypes) => {
  return sequelize.define('ConversaInternaMensagem', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },

    conversa_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    usuario_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    mensagem: {
      type: DataTypes.TEXT,
      allowNull: false
    },

    editada_em: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'conversas_internas_mensagens',
    timestamps: true
  });
};
