'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('fiscal_document_links');
    if (!columns.purchase_link_key) await queryInterface.addColumn('fiscal_document_links', 'purchase_link_key', { type: Sequelize.STRING(100), allowNull: true });
    if (!columns.allocated_value) await queryInterface.addColumn('fiscal_document_links', 'allocated_value', { type: Sequelize.DECIMAL(14,2), allowNull: true });
    const indices = await queryInterface.showIndex('fiscal_document_links');
    if (!indices.some(i => i.name === 'ux_fiscal_purchase_link')) await queryInterface.addIndex('fiscal_document_links', ['fiscal_dfe_document_id','purchase_link_key'], { name: 'ux_fiscal_purchase_link', unique: true });
  },
  async down() { throw new Error('Preservar vinculos e historico fiscal; reversao exige migracao revisada.'); }
};
