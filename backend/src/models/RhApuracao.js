module.exports = (sequelize, DataTypes) => sequelize.define(
  'RhApuracao',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    competencia: {
      type: DataTypes.STRING(7),
      allowNull: false
    },
    etapa_pagamento: { type: DataTypes.STRING(20), allowNull: true },
    importacao_id: { type: DataTypes.INTEGER, allowNull: true },
    empresa_grupo_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    obra_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    tipo_vinculo: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'RASCUNHO'
    },
    dias_base: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 30
    },
    // Fase 12: o periodo e a data prevista moram na APURACAO, e nao so no `dados_json` do pedido.
    // Quem e consultado depois — relatorio, conferencia, fechamento — e a apuracao; deixar a data
    // so no pedido faria todo relatorio abrir o pedido para saber quando aquilo seria pago.
    periodo_inicio: { type: DataTypes.DATEONLY, allowNull: true },
    periodo_fim: { type: DataTypes.DATEONLY, allowNull: true },
    data_prevista_pagamento: { type: DataTypes.DATEONLY, allowNull: true },
    solicitacao_id: { type: DataTypes.INTEGER, allowNull: true },
    total_colaboradores: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    total_bruto: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0
    },
    total_descontos: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0
    },
    total_liquido: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0
    },
    observacoes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    resumo_json: {
      type: DataTypes.JSON,
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
    tableName: 'rh_apuracoes',
    timestamps: true
  }
);
