module.exports = (sequelize, D) => sequelize.define('TituloRenegociacaoAlocacao', {
  id: { type: D.INTEGER, primaryKey: true, autoIncrement: true },
  negociacao_id: D.INTEGER, titulo_origem_id: D.INTEGER, titulo_destino_id: D.INTEGER,
  obra_id: D.INTEGER, apropriacao_id: D.INTEGER, categoria_financeira_id: D.INTEGER, solicitacao_id: D.INTEGER,
  considera_dre: D.BOOLEAN,
  valor: D.DECIMAL(14,2), principal: D.DECIMAL(14,2), juros: D.DECIMAL(14,2), multa: D.DECIMAL(14,2)
}, { tableName: 'titulo_renegociacao_alocacoes', timestamps: true });
