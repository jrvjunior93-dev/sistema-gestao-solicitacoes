module.exports = (sequelize, DataTypes) => sequelize.define(
  'RhDocumento',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    colaborador_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    obra_origem_id: { type: DataTypes.INTEGER, allowNull: true },
    chave_envio_obra: { type: DataTypes.STRING(140), allowNull: true },
    documento_tipo_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    documento_anterior_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    nome_original: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    arquivo_url: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    mimetype: {
      type: DataTypes.STRING(120),
      allowNull: true
    },
    tamanho_bytes: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    validade: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'ENVIADO'
    },
    observacoes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    ativo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    criado_por: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    atualizado_por: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  },
  {
    tableName: 'rh_documentos',
    timestamps: true
  }
);
