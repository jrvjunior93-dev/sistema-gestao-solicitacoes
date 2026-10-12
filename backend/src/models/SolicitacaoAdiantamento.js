module.exports = (sequelize, DataTypes) => sequelize.define('SolicitacaoAdiantamento', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  solicitacao_id: { type: DataTypes.INTEGER, allowNull: false },
  solicitacao_favorecido_id: { type: DataTypes.INTEGER, allowNull: true, unique: true },
  titulo_financeiro_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  titulo_devolucao_id: { type: DataTypes.INTEGER, allowNull: true },
  valor_solicitado: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
  valor_prestado: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
  status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'AGUARDANDO_PAGAMENTO' },
  prestacao: { type: DataTypes.JSON, allowNull: true },
  motivo_rejeicao: { type: DataTypes.TEXT, allowNull: true },
  enviado_por: { type: DataTypes.INTEGER, allowNull: true },
  enviado_em: { type: DataTypes.DATE, allowNull: true },
  validado_por: { type: DataTypes.INTEGER, allowNull: true },
  validado_em: { type: DataTypes.DATE, allowNull: true }
}, { tableName: 'solicitacoes_adiantamento', timestamps: true });
