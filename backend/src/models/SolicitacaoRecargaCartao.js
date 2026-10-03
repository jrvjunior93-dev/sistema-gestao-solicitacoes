module.exports = (sequelize, DataTypes) => sequelize.define('SolicitacaoRecargaCartao', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  solicitacao_id: { type: DataTypes.INTEGER, allowNull: false },
  cartao_recarga_id: { type: DataTypes.INTEGER, allowNull: false },
  titulo_financeiro_id: { type: DataTypes.INTEGER, allowNull: false },
  valor_solicitado: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
  valor_efetivo: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
  valor_nao_recarregado: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
  status_ciclo: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'PENDENTE' },
  criado_por: { type: DataTypes.INTEGER, allowNull: false },
  atualizado_por: { type: DataTypes.INTEGER, allowNull: true }
}, {
  tableName: 'solicitacoes_recarga_cartao',
  timestamps: true
});
