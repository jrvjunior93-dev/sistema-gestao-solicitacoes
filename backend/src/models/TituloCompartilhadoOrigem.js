module.exports = (sequelize, D) => sequelize.define('TituloCompartilhadoOrigem', {
  id: { type: D.INTEGER, primaryKey: true, autoIncrement: true },
  ...Object.fromEntries(['lote_id', 'titulo_financeiro_id', 'solicitacao_id', 'obra_id', 'empresa_id', 'categoria_financeira_id']
    .map(c => [c, { type: D.INTEGER, allowNull: false }])),
  pedido_compra_id: { type: D.INTEGER, allowNull: true }, apropriacao_id: { type: D.INTEGER, allowNull: true },
  considera_dre: { type: D.BOOLEAN, allowNull: false }, valor: { type: D.DECIMAL(14, 2), allowNull: false }
}, { tableName: 'titulos_compartilhados_origens', timestamps: true });
