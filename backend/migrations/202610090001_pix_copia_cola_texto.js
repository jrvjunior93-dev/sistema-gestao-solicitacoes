'use strict';
// Apenas expansao de capacidade. Nenhuma chave ou tipo existente e reescrito.
const CAMPOS = {
  payment_beneficiaries: ['pix_chave'],
  parceiros: ['pix_chave_fixa_1', 'pix_chave_fixa_2', 'pix_chave_variavel'],
  rh_colaboradores: ['pix_chave'],
  rh_colaborador_pagamentos: ['chave_pix', 'chave_pix_secundaria', 'chave_pix_variavel'],
  rh_eventos_recorrentes: ['beneficiario_chave_pix'],
  solicitacoes: ['favorecido_chave_pix'],
  solicitacao_compras: ['frete_favorecido_chave_pix'],
  contrato_medicoes: ['favorecido_chave_pix']
};
module.exports = {
  async up({ DataTypes, queryInterface }) {
    for (const [tabela, campos] of Object.entries(CAMPOS)) {
      const estrutura = await queryInterface.describeTable(tabela);
      for (const campo of campos) {
        if (!estrutura[campo]) throw new Error(`Coluna Pix ausente: ${tabela}.${campo}`);
        if (String(estrutura[campo].type).toUpperCase().includes('TEXT')) continue;
        // MySQL exige prefixo em indice de TEXT. Preservar o indice existente.
        if (tabela === 'payment_beneficiaries') {
          const indices = await queryInterface.showIndex(tabela);
          if (indices.some((indice) => indice.name === 'idx_payment_beneficiaries_pix')) {
            await queryInterface.removeIndex(tabela, 'idx_payment_beneficiaries_pix');
          }
        }
        await queryInterface.changeColumn(tabela, campo, {
          type: DataTypes.TEXT,
          allowNull: estrutura[campo].allowNull
        });
      }
      if (tabela === 'payment_beneficiaries') {
        const indices = await queryInterface.showIndex(tabela);
        if (!indices.some((indice) => indice.name === 'idx_payment_beneficiaries_pix')) {
          await queryInterface.addIndex(tabela, {
            name: 'idx_payment_beneficiaries_pix',
            fields: ['pix_tipo_chave', { name: 'pix_chave', length: 255 }]
          });
        }
      }
    }
  },
  async down() {
    throw new Error('Nao reduzir campos Pix: codigos Copia e Cola podem ultrapassar o tamanho anterior.');
  }
};
