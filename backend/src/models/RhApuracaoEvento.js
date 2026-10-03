module.exports = (sequelize, DataTypes) => sequelize.define(
  'RhApuracaoEvento',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    apuracao_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    colaborador_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'PENDENTE'
    },
    regra_aplicada: {
      type: DataTypes.STRING(60),
      allowNull: true
    },
    valor_base_calculo: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0
    },
    dias_trabalhados: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    },
    faltas: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    },
    horas_extras: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    },
    valor_bruto: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0
    },
    valor_descontos: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0
    },
    ajuste_credito_manual: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0
    },
    ajuste_debito_manual: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0
    },
    // Fase 12 (27/08): os quatro adicionais do item 11 do escopo, separados de proposito — sao
    // naturezas legais diferentes, e a planilha-resumo precisa conferir cada uma.
    adicional_noturno: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
    adicional_insalubridade: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
    adicional_periculosidade: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
    bonificacoes: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
    valor_liquido: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0
    },
    observacoes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    detalhes_json: {
      type: DataTypes.JSON,
      allowNull: true
    },
    ajustado_por: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    ajustado_em: {
      type: DataTypes.DATE,
      allowNull: true
    }
  },
  {
    tableName: 'rh_apuracao_eventos',
    timestamps: true
  }
);
