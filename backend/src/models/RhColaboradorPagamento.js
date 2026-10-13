module.exports = (sequelize, DataTypes) => sequelize.define(
  'RhColaboradorPagamento',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    colaborador_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    favorecido_nome: {
      type: DataTypes.STRING(180),
      allowNull: true
    },
    favorecido_documento: {
      type: DataTypes.STRING(20),
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
    tipo_conta: {
      type: DataTypes.STRING(30),
      allowNull: true
    },
    chave_pix: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    chave_pix_secundaria: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    chave_pix_variavel: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    observacoes: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  },
  {
    tableName: 'rh_colaborador_pagamentos',
    timestamps: true
  }
);
