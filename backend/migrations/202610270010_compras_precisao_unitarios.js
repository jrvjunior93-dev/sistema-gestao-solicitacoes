'use strict';
// Preparada apenas; nao executada pelo agente. Nenhum backfill/recalculo de pedidos.
module.exports = {
  async up({ queryInterface, DataTypes }) {
    for (const table of ['pedido_compra_itens', 'solicitacao_compra_alocacoes']) {
      const columns = await queryInterface.describeTable(table);
      const type = String(columns.preco_unitario?.type || '').replace(/\s/g, '').toUpperCase();
      if (!type) throw new Error(`Coluna ${table}.preco_unitario ausente.`);
      if (type === 'DECIMAL(22,10)') continue;
      if (type !== 'DECIMAL(14,2)') throw new Error(`Precisao inesperada em ${table}: ${type}`);
      await queryInterface.changeColumn(table, 'preco_unitario', {
        type: DataTypes.DECIMAL(22,10), allowNull: false, defaultValue: 0
      });
    }
  },
  async down() { throw new Error('Reducao de precisao descartaria historico; rollback exige revisao explicita.'); }
};
