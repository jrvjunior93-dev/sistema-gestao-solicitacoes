module.exports = (sequelize, DataTypes) => sequelize.define('SolicitacaoInteracaoUsuario', {
  solicitacao_id: { type: DataTypes.INTEGER, allowNull: false },
  usuario_id: { type: DataTypes.INTEGER, primaryKey: true },
  historico_id: { type: DataTypes.INTEGER, primaryKey: true },
  tipo: { type: DataTypes.STRING(40), allowNull: false },
  evento_em: { type: DataTypes.DATE, allowNull: false },
  lido_em: { type: DataTypes.DATE }
}, { tableName: 'solicitacao_interacoes_usuario', timestamps: true });
