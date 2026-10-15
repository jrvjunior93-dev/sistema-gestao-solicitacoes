'use strict';

const { tableExists } = require('../src/database/schemaUtils');

module.exports = {
  async up({ queryInterface, sequelize }) {
    const fila = 'pagamentos_manuais_fila';
    const anexos = 'pagamentos_manuais_fila_comprovantes';
    for (const tabela of [fila, anexos]) {
      if (!await tableExists(sequelize, tabela)) throw new Error(`Tabela obrigatoria ausente: ${tabela}`);
    }
    // Criar a protecao por destino ANTES de retirar a unicidade global.
    // Nao regrava PDFs, historicos, pagamentos ou linhas de negocio.
    let indices = await queryInterface.showIndex(anexos);
    const composto = indices.find(i => i.name === 'pmfc_fila_hash_uk');
    if (composto && (!composto.unique || composto.fields.map(f => f.attribute).join(',') !== 'fila_id,hash')) {
      throw new Error('Indice pmfc_fila_hash_uk divergente; conferir schema antes de prosseguir.');
    }
    if (!composto) await queryInterface.addIndex(anexos, ['fila_id', 'hash'], { name: 'pmfc_fila_hash_uk', unique: true });
    for (const [tabela, coluna, indice] of [[fila, 'comprovante_hash', 'pmf_comprovante_hash_idx'], [anexos, 'hash', 'pmfc_hash_idx']]) {
      indices = await queryInterface.showIndex(tabela);
      if (!indices.some(i => i.name === indice)) await queryInterface.addIndex(tabela, [coluna], { name: indice });
      // Cobre nomes gerados pelo Sequelize e o indice explicito de versoes anteriores.
      for (const i of indices.filter(i => i.unique && !i.primary
        && i.fields.length === 1 && i.fields[0].attribute === coluna)) {
        await queryInterface.removeIndex(tabela, i.name);
      }
    }
  },
  async down() {
    // Nao restabelecer unicidade global: arquivos podem estar legitimamente
    // vinculados a varios destinos. Nao excluir vinculos para permitir rollback.
  }
};
