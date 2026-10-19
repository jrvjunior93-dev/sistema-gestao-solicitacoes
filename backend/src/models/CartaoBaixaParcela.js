module.exports = (sequelize, D) => sequelize.define('CartaoBaixaParcela', {
  id: { type: D.INTEGER, primaryKey: true, autoIncrement: true },
  movimento_financeiro_id: { type: D.INTEGER, allowNull: false },
  titulo_financeiro_id: { type: D.INTEGER, allowNull: false },
  fatura_cartao_id: { type: D.INTEGER, allowNull: false },
  numero_parcela: { type: D.INTEGER, allowNull: false },
  quantidade_parcelas: { type: D.INTEGER, allowNull: false },
  data_compra: { type: D.DATEONLY, allowNull: false },
  valor: { type: D.DECIMAL(14, 2), allowNull: false },
  status: { type: D.STRING(20), allowNull: false, defaultValue: 'ATIVA' },
  criado_por: { type: D.INTEGER, allowNull: false },
  estornado_por: { type: D.INTEGER, allowNull: true },
  estornado_em: { type: D.DATE, allowNull: true }
}, { tableName: 'financeiro_cartao_baixa_parcelas', timestamps: true });
