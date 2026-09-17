module.exports = (sequelize, DataTypes) => sequelize.define('SolicitacaoAtencaoUsuario', {
  solicitacao_id: { type: DataTypes.INTEGER, primaryKey: true },
  usuario_id: { type: DataTypes.INTEGER, primaryKey: true },
  tipo: { type: DataTypes.STRING(40), allowNull: false },
  resumo: { type: DataTypes.STRING(255), allowNull: true },
  evento_em: { type: DataTypes.DATE, allowNull: false },
  lido_em: { type: DataTypes.DATE, allowNull: true }
}, {
  tableName: 'solicitacao_atencoes_usuario',
  timestamps: true
});
