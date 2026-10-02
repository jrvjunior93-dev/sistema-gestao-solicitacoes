module.exports = (sequelize, DataTypes) => sequelize.define(
  'RhImportacao',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    tipo: {
      type: DataTypes.STRING(30),
      allowNull: false
    },
    // PLANILHA | FORMULARIO | INDIVIDUAL — o unico rastro que distingue as origens depois que os
    // dados se encontram na mesma estrutura (ver a migration 202608260054).
    origem: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'PLANILHA'
    },
    competencia: {
      type: DataTypes.STRING(7),
      allowNull: false
    },
    periodicidade: {
      type: DataTypes.STRING(15),
      allowNull: true
    },
    periodo_inicio: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    periodo_fim: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    etapa_pagamento: { type: DataTypes.STRING(20), allowNull: true },
    idempotency_key: { type: DataTypes.STRING(80), allowNull: true },
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
      defaultValue: 'PREVIEW'
    },
    nome_arquivo: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    total_linhas: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    total_validas: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    total_erros: {
      type: DataTypes.INTEGER,
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
    confirmado_por: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    confirmado_em: {
      type: DataTypes.DATE,
      allowNull: true
    }
  },
  {
    tableName: 'rh_importacoes',
    timestamps: true
  }
);
