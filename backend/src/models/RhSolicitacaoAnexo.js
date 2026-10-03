module.exports = (sequelize, DataTypes) => sequelize.define(
  'RhSolicitacaoAnexo',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    solicitacao_id: { type: DataTypes.INTEGER, allowNull: false },
    // Nulo = anexo avulso, sem classificacao. A conferencia do que falta ignora estes.
    documento_tipo_id: { type: DataTypes.INTEGER, allowNull: true },
    nome_original: { type: DataTypes.STRING(255), allowNull: false },
    arquivo_url: { type: DataTypes.TEXT, allowNull: false },
    mimetype: { type: DataTypes.STRING(120), allowNull: true },
    tamanho_bytes: { type: DataTypes.INTEGER, allowNull: true },
    validade: { type: DataTypes.DATEONLY, allowNull: true },
    observacoes: { type: DataTypes.TEXT, allowNull: true },
    // Para qual `rh_documentos` este anexo virou na aprovacao. Nulo enquanto nao virou.
    // PENDENTE | VALIDADO | RECUSADO — o DP atesta antes de o documento entrar na pasta.
    situacao: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'PENDENTE' },
    // QUEM e QUANDO atestou, e nao um booleano: e declaracao de responsabilidade.
    validado_por: { type: DataTypes.INTEGER, allowNull: true },
    validado_em: { type: DataTypes.DATE, allowNull: true },
    motivo_recusa: { type: DataTypes.TEXT, allowNull: true },
    observacao_validacao: { type: DataTypes.TEXT, allowNull: true },
    documento_gerado_id: { type: DataTypes.INTEGER, allowNull: true },
    criado_por: { type: DataTypes.INTEGER, allowNull: true }
  },
  { tableName: 'rh_solicitacao_anexos', timestamps: true }
);
