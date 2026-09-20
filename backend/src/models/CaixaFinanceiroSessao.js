module.exports = (sequelize, DataTypes) => sequelize.define(
  'CaixaFinanceiroSessao',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    empresa_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    conta_bancaria_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    data_abertura: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    data_fechamento: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'ABERTO'
    },
    saldo_abertura: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0
    },
    total_entradas: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0
    },
    total_saidas: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0
    },
    saldo_sistema: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0
    },
    saldo_informado: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true
    },
    diferenca: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true
    },
    observacoes_abertura: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    observacoes_fechamento: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    aberto_por: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    fechado_por: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    fechado_em: {
      type: DataTypes.DATE,
      allowNull: true
    },
    divergencia_status: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    divergencia_solicitada_por: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    divergencia_solicitada_em: {
      type: DataTypes.DATE,
      allowNull: true
    },
    divergencia_decidida_por: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    divergencia_decidida_em: {
      type: DataTypes.DATE,
      allowNull: true
    },
    divergencia_decisao_observacao: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  },
  {
    tableName: 'financeiro_caixa_sessoes',
    timestamps: true
  }
);
