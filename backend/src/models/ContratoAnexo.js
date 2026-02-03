module.exports = (sequelize, DataTypes) => {
  const ContratoAnexo = sequelize.define('ContratoAnexo', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    contrato_id: {
      type: DataTypes.INTEGER,
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
    uploaded_by: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    tableName: 'contrato_anexos',
    timestamps: true
  });

  return ContratoAnexo;
};
