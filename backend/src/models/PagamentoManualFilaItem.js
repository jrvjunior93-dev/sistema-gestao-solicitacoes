module.exports = (sequelize, DataTypes) => sequelize.define(
  'PagamentoManualFilaItem',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    titulo_financeiro_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'PENDENTE'
    },
    valor_previsto: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false
    },
    valor_informado: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true
    },
    data_vencimento_prevista: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    data_baixa: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    conta_bancaria_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    movimento_financeiro_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    motivo: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    selecionado_por: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    selecionado_em: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    processado_por: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    processado_em: {
      type: DataTypes.DATE,
      allowNull: true
    },
    resolvido_por: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    resolvido_em: {
      type: DataTypes.DATE,
      allowNull: true
    },
    idempotency_key: {
      type: DataTypes.STRING(120),
      allowNull: true,
      unique: true
    }
  },
  {
    tableName: 'pagamentos_manuais_fila',
    timestamps: true
  }
);
