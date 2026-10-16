'use strict';
const { tableExists, columnExists, indexExists, resolveTableName } = require('../src/database/schemaUtils');
module.exports = {
  async up({ queryInterface: qi, sequelize, DataTypes: D }) {
    const titulos = await resolveTableName(sequelize, ['titulos_financeiros', 'TitulosFinanceiros']);
    const solicitacoes = await resolveTableName(sequelize, ['solicitacoes', 'Solicitacoes']);
    const pedidos = await resolveTableName(sequelize, ['pedido_compras', 'PedidoCompras']);
    const inteiro = () => ({ type: D.INTEGER, allowNull: false });
    const fk = model => ({ ...inteiro(), references: { model, key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'RESTRICT' });
    const datas = () => ({ createdAt: { type: D.DATE, allowNull: false }, updatedAt: { type: D.DATE, allowNull: false } });
    if (!await tableExists(sequelize, 'titulos_compartilhados_lotes')) await qi.createTable('titulos_compartilhados_lotes', {
      id: { type: D.INTEGER, primaryKey: true, autoIncrement: true },
      chave: { type: D.STRING(100), allowNull: false }, hash: { type: D.STRING(64), allowNull: false },
      criado_por: inteiro(), snapshot: { type: D.JSON, allowNull: false }, resultado: { type: D.JSON, allowNull: true }, ...datas()
    });
    if (!await columnExists(sequelize, titulos, 'compartilhamento_id')) await qi.addColumn(titulos, 'compartilhamento_id', {
      type: D.INTEGER, allowNull: true, references: { model: 'titulos_compartilhados_lotes', key: 'id' }, onDelete: 'RESTRICT'
    });
    if (!await tableExists(sequelize, 'titulos_compartilhados_origens')) await qi.createTable('titulos_compartilhados_origens', {
      id: { type: D.INTEGER, primaryKey: true, autoIncrement: true },
      lote_id: fk('titulos_compartilhados_lotes'), titulo_financeiro_id: fk(titulos),
      solicitacao_id: fk(solicitacoes), pedido_compra_id: { type: D.INTEGER, allowNull: true, references: { model: pedidos, key: 'id' }, onDelete: 'RESTRICT' },
      // obra e empresa preservam a identidade original, mesmo após mudança cadastral.
      obra_id: inteiro(), empresa_id: inteiro(), apropriacao_id: { type: D.INTEGER, allowNull: true },
      categoria_financeira_id: inteiro(), considera_dre: { type: D.BOOLEAN, allowNull: false },
      valor: { type: D.DECIMAL(14, 2), allowNull: false }, ...datas()
    });
    for (const [t, name, campos, unique] of [
      ['titulos_compartilhados_lotes', 'uq_tc_lote_chave', ['chave'], true],
      [titulos, 'idx_tc_titulo_lote', ['compartilhamento_id'], false],
      ['titulos_compartilhados_origens', 'idx_tc_origem_titulo', ['titulo_financeiro_id', 'id'], false],
      ['titulos_compartilhados_origens', 'idx_tc_origem_solicitacao', ['solicitacao_id', 'titulo_financeiro_id'], false],
      ['titulos_compartilhados_origens', 'idx_tc_origem_pedido', ['pedido_compra_id', 'titulo_financeiro_id'], false],
      ['titulos_compartilhados_origens', 'idx_tc_origem_empresa', ['empresa_id', 'titulo_financeiro_id'], false],
      ['titulos_compartilhados_origens', 'idx_tc_origem_obra', ['obra_id', 'titulo_financeiro_id'], false]
    ]) if (!await indexExists(sequelize, t, name)) await qi.addIndex(t, campos, { name, unique });
  },
  async down() { throw new Error('O lote e suas participacoes sao auditoria financeira; rollback exige plano especifico.'); }
};
