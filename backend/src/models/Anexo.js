module.exports = (sequelize, DataTypes) => {
  const Anexo = sequelize.define('Anexo', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },

    solicitacao_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    tipo: {
      type: DataTypes.ENUM(
        'SOLICITACAO',
        'CONTRATO',
        'COMPROVANTE'
      ),
      allowNull: false
    },

    nome_original: {
      type: DataTypes.STRING,
      allowNull: false
    },

    caminho_arquivo: {
      type: DataTypes.STRING,
      allowNull: false
    },

    area_origem: {
      type: DataTypes.STRING,
      allowNull: false
    },

    uploaded_by: {
      type: DataTypes.INTEGER,
      allowNull: false
    }

  }, {
    tableName: 'anexos',
    timestamps: true
  });

  return Anexo;
};
