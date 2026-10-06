module.exports = (sequelize, D) => sequelize.define('ObrigacaoOperacional', {
  id: { type: D.INTEGER, primaryKey: true, autoIncrement: true },
  chave: { type: D.STRING(160), allowNull: false, unique: true },
  tipo: { type: D.STRING(50), allowNull: false },
  setor: { type: D.STRING(50), allowNull: false },
  obra_id: { type: D.INTEGER, allowNull: false },
  solicitacao_id: D.INTEGER, pedido_id: D.INTEGER, referencia_id: D.INTEGER,
  inicio_em: { type: D.DATE, allowNull: false }, prazo_em: { type: D.DATE, allowNull: false },
  limite_em: { type: D.DATE, allowNull: false }, regra_snapshot: { type: D.JSON, allowNull: false },
  status: { type: D.STRING(30), allowNull: false, defaultValue: 'PENDENTE' },
  encerrada_em: D.DATE, usuario_id: D.INTEGER, motivo: D.STRING(2000)
}, { tableName: 'obrigacoes_operacionais', timestamps: true });
