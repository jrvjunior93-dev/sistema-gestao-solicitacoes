module.exports = (sequelize, DataTypes) => {
  return sequelize.define('ConversaInternaParticipante', {
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

    adicionado_por_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    tableName: 'conversas_internas_participantes',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['conversa_id', 'usuario_id']
      }
    ]
  });
};
