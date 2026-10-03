module.exports = (sequelize, DataTypes) => sequelize.define(
  'RhSolicitacao',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    codigo: { type: DataTypes.STRING(30), allowNull: true, unique: true },
    // Nulo na ADMISSAO: o colaborador so passa a existir quando o DP aprova.
    colaborador_id: { type: DataTypes.INTEGER, allowNull: true },
    // ADMISSAO | DEMISSAO | MOVIMENTACAO | PAGAMENTO_MAO_DE_OBRA | EVENTO_RECORRENTE | JORNADA
    tipo: { type: DataTypes.STRING(30), allowNull: false },
    /**
     * Fase 10 (27/08). Em MOVIMENTACAO e o tipo do evento (atestado, ferias, transferencia...);
     * em DEMISSAO e o MOTIVO do desligamento — porque e o motivo que muda a papelada exigida.
     */
    subtipo: { type: DataTypes.STRING(40), allowNull: true },
    // ABERTA | APROVADA | REJEITADA | CANCELADA
    situacao: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'ABERTA' },
    obra_id: { type: DataTypes.INTEGER, allowNull: true },
    setor_origem: { type: DataTypes.STRING(60), allowNull: true },
    dados_json: { type: DataTypes.JSON, allowNull: true },
    justificativa: { type: DataTypes.TEXT, allowNull: true },
    motivo_rejeicao: { type: DataTypes.TEXT, allowNull: true },
    criada_por: { type: DataTypes.INTEGER, allowNull: true },
    decidida_por: { type: DataTypes.INTEGER, allowNull: true },
    decidida_em: { type: DataTypes.DATE, allowNull: true }
  },
  { tableName: 'rh_solicitacoes', timestamps: true }
);
