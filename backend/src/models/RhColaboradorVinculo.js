module.exports = (sequelize, DataTypes) => sequelize.define(
  'RhColaboradorVinculo',
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
    obra_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    setor_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    vigencia_inicio: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    // Nulo = vinculo aberto: o colaborador esta nesta obra hoje.
    vigencia_fim: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    // CARGA_INICIAL | ADMISSAO | TROCA_OBRA | DEMISSAO | AJUSTE
    motivo: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'AJUSTE'
    },
    solicitacao_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    observacoes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    criado_por: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  },
  {
    tableName: 'rh_colaborador_vinculos',
    timestamps: true
  }
);
