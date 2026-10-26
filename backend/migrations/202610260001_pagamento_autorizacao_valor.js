'use strict';
module.exports = {
  async up({ queryInterface, DataTypes }) {
    const tabelas = ['pagamento_autorizacao_itens', 'pagamentos_manuais_fila'];
    const schemas = await Promise.all(tabelas.map(t => queryInterface.describeTable(t)));
    for (const [indice, tabela] of tabelas.entries()) {
      if (!schemas[indice].autorizacao_valor_json) await queryInterface.addColumn(tabela, 'autorizacao_valor_json', { type: DataTypes.JSON, allowNull: true });
    }
  },
  async down() { throw new Error('Migration de auditoria financeira: reversao destrutiva nao permitida. Preserve os registros.'); }
};
