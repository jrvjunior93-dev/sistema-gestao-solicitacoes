module.exports = (sequelize, D) => sequelize.define('CartaoRecargaSaldoAjuste', {
  id: { type: D.INTEGER, primaryKey: true, autoIncrement: true },
  cartao_recarga_id: { type: D.INTEGER, allowNull: false },
  solicitacao_id: { type: D.INTEGER, allowNull: false },
  chave_idempotencia: { type: D.STRING(80), allowNull: false, unique: true },
  saldo_anterior: { type: D.DECIMAL(15, 2), allowNull: false },
  saldo_informado: { type: D.DECIMAL(15, 2), allowNull: false },
  valor_ajuste: { type: D.DECIMAL(15, 2), allowNull: false },
  motivo: { type: D.TEXT, allowNull: false },
  anexo_id: { type: D.INTEGER, allowNull: false },
  criado_por: { type: D.INTEGER, allowNull: false }
}, { tableName: 'cartoes_recarga_saldo_ajustes', timestamps: true });
