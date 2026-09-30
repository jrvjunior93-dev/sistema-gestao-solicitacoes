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
    // Termo aditivo dono do documento, quando o anexo for uma negociacao detalhada de aditivo.
    // Continua nulo nos anexos gerais e nos documentos do contrato criados antes desta regra.
    aditivo_id: {
      type: DataTypes.INTEGER,
      allowNull: true
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
    },
    // Papel do arquivo no contrato. NULL = anexo avulso, que e o caso de todos os existentes.
    // `NEGOCIACAO_DETALHADA` e o documento que a aprovacao exige acima do limite do Juridico.
    tipo: {
      type: DataTypes.STRING(40),
      allowNull: true
    }
  }, {
    tableName: 'contrato_anexos',
    timestamps: true
  });

  return ContratoAnexo;
};
