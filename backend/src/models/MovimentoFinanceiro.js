module.exports = (sequelize, DataTypes) => sequelize.define(
  'MovimentoFinanceiro',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    titulo_financeiro_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    fatura_cartao_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    cartao_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    categoria_financeira_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    conta_bancaria_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    empresa_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    intercompany_group_id: {
      type: DataTypes.STRING(80),
      allowNull: true
    },
    empresa_origem_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    empresa_destino_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    tipo_intercompany: {
      type: DataTypes.STRING(40),
      allowNull: true
    },
    motivo_intercompany: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    elimina_consolidado: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    transferencia_interna: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    caixa_sessao_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    conciliacao_bancaria_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    movimento_origem_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    baixa_grupo_id: { type: DataTypes.INTEGER, allowNull: true },
    baixa_componente_id: { type: DataTypes.INTEGER, allowNull: true },
    forma_recebimento: {
      type: DataTypes.STRING(30),
      allowNull: true
    },
    forma_pagamento_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    tipo_permuta: {
      type: DataTypes.STRING(80),
      allowNull: true
    },
    categoria_bem: {
      type: DataTypes.STRING(30),
      allowNull: true
    },
    descricao_bem: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    valor_referencia_bem: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true
    },
    documento_referencia: {
      type: DataTypes.STRING(120),
      allowNull: true
    },
    comprovante_url: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    comprovante_nome: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    cheque_numero: { type: DataTypes.STRING(60), allowNull: true },
    cheque_emitente: { type: DataTypes.STRING(160), allowNull: true },
    cheque_titular_documento: { type: DataTypes.STRING(40), allowNull: true },
    cheque_banco: { type: DataTypes.STRING(120), allowNull: true },
    cheque_agencia: { type: DataTypes.STRING(40), allowNull: true },
    cheque_conta: { type: DataTypes.STRING(60), allowNull: true },
    cheque_data_emissao: { type: DataTypes.DATEONLY, allowNull: true },
    cheque_data_vencimento: { type: DataTypes.DATEONLY, allowNull: true },
    tipo_movimento: {
      type: DataTypes.STRING(40),
      allowNull: false
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'ATIVO'
    },
    valor: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false
    },
    juros: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0
    },
    multa: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0
    },
    desconto: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0
    },
    valor_quitacao: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false
    },
    data_movimento: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    observacoes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    criado_por: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    estornado_por: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    estornado_em: {
      type: DataTypes.DATE,
      allowNull: true
    }
  },
  {
    tableName: 'movimentos_financeiros',
    timestamps: true
  }
);
