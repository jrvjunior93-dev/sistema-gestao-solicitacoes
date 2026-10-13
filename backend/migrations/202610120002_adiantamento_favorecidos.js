'use strict';
module.exports = {
  async up({ DataTypes, queryInterface }) {
    const table = 'solicitacoes_adiantamento';
    const schema = await queryInterface.describeTable(table);
    if (!schema.solicitacao_favorecido_id) await queryInterface.addColumn(table, 'solicitacao_favorecido_id', {
      type: DataTypes.INTEGER, allowNull: true, references: { model: 'solicitacoes_favorecidos', key: 'id' }
    });
    const indices = await queryInterface.showIndex(table);
    if (!indices.some(i => i.name === 'adiantamento_favorecido_unico')) await queryInterface.addIndex(table,
      ['solicitacao_favorecido_id'], { name: 'adiantamento_favorecido_unico', unique: true });
    // Primeiro preserva indice da FK, depois remove SOMENTE a unicidade antiga.
    if (!indices.some(i => i.name === 'adiantamento_solicitacao')) await queryInterface.addIndex(table,
      ['solicitacao_id'], { name: 'adiantamento_solicitacao' });
    for (const index of indices) {
      if (index.unique && !index.primary && index.fields.length === 1 && index.fields[0].attribute === 'solicitacao_id') {
        await queryInterface.removeIndex(table, index.name);
      }
    }
    // Ciclos existentes ficam com favorecido_id nulo. Nenhuma baixa e recalculada.
  },
  async down() { throw new Error('Preservar ciclos financeiros; rollback exige plano especifico.'); }
};
