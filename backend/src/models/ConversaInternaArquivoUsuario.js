module.exports = (sequelize, DataTypes) => {
  return sequelize.define('ConversaInternaArquivoUsuario', {
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
    arquivada_em: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'conversas_internas_arquivo_usuario',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['conversa_id', 'usuario_id']
      }
    ]
  });
};
