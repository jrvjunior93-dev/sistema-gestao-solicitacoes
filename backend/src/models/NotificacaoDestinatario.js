module.exports = (sequelize, DataTypes) => {
  return sequelize.define('NotificacaoDestinatario', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },

    notificacao_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    usuario_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    lida_em: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'notificacao_destinatarios',
    timestamps: true
  });
};
