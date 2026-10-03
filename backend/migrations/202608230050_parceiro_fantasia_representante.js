'use strict';

const { columnExists } = require('../src/database/schemaUtils');

/**
 * Nome fantasia e representante legal em `parceiros` (Fase 1 do lote de 23/08).
 *
 * Duas lacunas do cadastro que o fluxo de contratos precisa:
 *
 * 1. **Nome fantasia** nao existia. A razao social identifica a empresa no papel, mas quem trabalha
 *    na obra conhece o fornecedor pelo nome de fachada — e sem o campo as duas informacoes brigavam
 *    dentro de `nome`.
 *
 * 2. **Representante legal**. Numa PJ quem assina o contrato e uma pessoa DIFERENTE do parceiro, e
 *    nao havia onde guardar os dados dela. A qualificacao do parceiro pessoa fisica ja existe
 *    (`nacionalidade`, `estado_civil`, `profissao`, `rg`...), criada para o Comercial — os campos do
 *    representante repetem esse mesmo vocabulario, para as duas partes do sistema falarem a mesma
 *    lingua.
 *
 * `regime_bens` do representante ficou de fora de proposito: regime de bens importa para quem e
 * PARTE no contrato, nao para quem apenas representa a empresa.
 *
 * TODAS anulaveis. A tabela tem milhares de parceiros sem esses dados; coluna nova obrigatoria em
 * tabela cheia nao sobe, e `server.js` roda as migrations antes de abrir a porta — o backend inteiro
 * ficaria fora do ar. A exigencia mora na CRIACAO, no servico, e nao no schema.
 *
 * Faixa 0050+ conforme `CONVENCAO-MIGRATIONS.md`.
 */
const COLUNAS = {
  nome_fantasia: 180,
  representante_nome: 180,
  representante_cpf: 20,
  representante_rg: 40,
  representante_cargo: 80,
  representante_nacionalidade: 60,
  representante_estado_civil: 40,
  representante_profissao: 80
};

module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    for (const [coluna, tamanho] of Object.entries(COLUNAS)) {
      // eslint-disable-next-line no-await-in-loop
      if (await columnExists(sequelize, 'parceiros', coluna)) continue;

      // eslint-disable-next-line no-await-in-loop
      await queryInterface.addColumn('parceiros', coluna, {
        type: DataTypes.STRING(tamanho),
        allowNull: true
      });
    }
  },

  async down() {
    // Sem rollback destrutivo.
  }
};
