'use strict';

const { indexExists, resolveTableName } = require('../src/database/schemaUtils');

/**
 * ÍNDICES PARA A BUSCA UNIVERSAL (Ctrl+K) — pacote B2 da reforma do
 * frontend (docs/PROPOSTA-BACKEND.md, item 4).
 *
 * Os campos de CÓDIGO já são consultados por prefixo (`LIKE 'termo%'`),
 * que usa índice B-tree. Estes índices cobrem os campos de nome/documento
 * mais consultados. Consultas com curinga à esquerda (`%termo%`) não usam
 * B-tree — a proteção ali é o LIMIT por grupo e o mínimo de caracteres,
 * mas o prefixo (caso comum ao digitar) se beneficia.
 *
 * O nome físico da tabela de obras VARIA entre ambientes (`Obras` no
 * servidor oficial, `obras` em ambientes locais) — resolvido em runtime
 * via resolveTableName, o mesmo desenho do commit f58e030.
 */
module.exports = {
  async up({ queryInterface, sequelize }) {
    const obrasTableName = await resolveTableName(sequelize, ['Obras', 'obras'], 'Obras');

    const indices = [
      { tabela: obrasTableName, colunas: ['nome'], nome: 'idx_obras_nome' },
      { tabela: 'parceiros', colunas: ['nome'], nome: 'idx_parceiros_nome' },
      { tabela: 'parceiros', colunas: ['cpf_cnpj'], nome: 'idx_parceiros_cpf_cnpj' }
    ];
    for (const indice of indices) {
      if (!(await indexExists(sequelize, indice.tabela, indice.nome))) {
        await queryInterface.addIndex(indice.tabela, indice.colunas, { name: indice.nome });
      }
    }
  },

  async down() {
    // Migration aditiva: rollback destrutivo somente de forma assistida.
  }
};
