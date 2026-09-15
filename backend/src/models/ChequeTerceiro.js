module.exports = (sequelize, DataTypes) => sequelize.define(
  'ChequeTerceiro',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    codigo: {
      type: DataTypes.STRING(40),
      allowNull: true
    },
    titulo_financeiro_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    movimento_financeiro_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    parceiro_entregou_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    titular_parceiro_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    empresa_id: { type: DataTypes.INTEGER, allowNull: true },
    obra_origem_id: { type: DataTypes.INTEGER, allowNull: true },
    movimento_entrada_id: { type: DataTypes.INTEGER, allowNull: true },
    movimento_saida_id: { type: DataTypes.INTEGER, allowNull: true },
    movimento_deposito_id: { type: DataTypes.INTEGER, allowNull: true },
    conciliacao_deposito_id: { type: DataTypes.INTEGER, allowNull: true },
    movimento_devolucao_id: { type: DataTypes.INTEGER, allowNull: true },
    conciliacao_devolucao_id: { type: DataTypes.INTEGER, allowNull: true },
    origem_tipo: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'RECEBIMENTO_TITULO' },
    motivo_origem: { type: DataTypes.STRING(255), allowNull: true },
    data_entrada: { type: DataTypes.DATEONLY, allowNull: true },
    data_saida: { type: DataTypes.DATEONLY, allowNull: true },
    data_deposito: { type: DataTypes.DATEONLY, allowNull: true },
    data_compensacao: { type: DataTypes.DATEONLY, allowNull: true },
    data_devolucao: { type: DataTypes.DATEONLY, allowNull: true },
    chave_importacao: { type: DataTypes.STRING(160), allowNull: true },
    deposito_idempotency_key: { type: DataTypes.STRING(160), allowNull: true, unique: true },
    cliente_nome: {
      type: DataTypes.STRING(180),
      allowNull: true
    },
    titular_nome: {
      type: DataTypes.STRING(180),
      allowNull: true
    },
    titular_documento: {
      type: DataTypes.STRING(30),
      allowNull: true
    },
    banco: {
      type: DataTypes.STRING(80),
      allowNull: true
    },
    agencia: {
      type: DataTypes.STRING(30),
      allowNull: true
    },
    conta: {
      type: DataTypes.STRING(40),
      allowNull: true
    },
    numero_cheque: {
      type: DataTypes.STRING(60),
      allowNull: true
    },
    valor: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0
    },
    data_emissao: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    data_vencimento: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'EM_CARTEIRA'
    },
    arquivo_url: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    observacoes: {
      type: DataTypes.TEXT,
      allowNull: true
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
    tableName: 'cheques_terceiros',
    timestamps: true
  }
);
