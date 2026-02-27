module.exports = (sequelize, DataTypes) => {
  return sequelize.define('ConversaInternaAnexo', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },

    conversa_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    mensagem_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    nome_arquivo: {
      type: DataTypes.STRING,
      allowNull: false
    },

    caminho: {
      type: DataTypes.TEXT,
      allowNull: false
    },

    mime_type: {
      type: DataTypes.STRING,
      allowNull: true
    },

    tamanho_bytes: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    tableName: 'conversas_internas_anexos',
    timestamps: true
  });
};
