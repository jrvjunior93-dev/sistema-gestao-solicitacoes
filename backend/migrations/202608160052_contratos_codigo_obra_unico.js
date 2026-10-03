'use strict';

const { indexExists, tableExists } = require('../src/database/schemaUtils');

const TABELA = 'contratos';
const INDICE = 'idx_contratos_codigo_obra';

/**
 * Indice unico de (codigo, obra_id).
 *
 * Fica separado da migration de colunas por um motivo especifico: o runner registra a
 * migration em `schema_migrations` sempre que `up()` termina sem lancar. Se esta
 * verificacao apenas avisasse e seguisse, a migration seria marcada como aplicada, nunca
 * mais rodaria, e o indice jamais existiria — uma falha silenciosa justamente na trava
 * que impede codigo duplicado.
 *
 * Por isso ela LANCA quando ha duplicados. O boot para com mensagem clara, a migration
 * NAO e registrada, e a proxima subida tenta de novo. Falhar alto e melhor do que ficar
 * sem a protecao sem ninguem perceber.
 *
 * Pre-requisito de deploy: auditar duplicados e corrigi-los pela interface de Gestao
 * de Contratos ANTES de autorizar esta migration. Ver MIGRACAO-PARA-PRODUCAO.md.
 *
 * Unicidade por obra, nao global: o codigo "GEN" e usado legitimamente em obras
 * diferentes, uma vez em cada.
 */
module.exports = {
  async up({ queryInterface, sequelize }) {
    if (!(await tableExists(sequelize, TABELA))) return;
    if (await indexExists(sequelize, TABELA, INDICE)) return;

    const [duplicados] = await sequelize.query(`
      SELECT codigo, obra_id, COUNT(*) AS total
      FROM ${TABELA}
      GROUP BY codigo, obra_id
      HAVING COUNT(*) > 1
    `);

    if (duplicados.length > 0) {
      const listagem = duplicados
        .map((d) => `${d.codigo} (obra ${d.obra_id}): ${d.total}`)
        .join(' | ');

      throw new Error(
        `Nao foi possivel criar o indice unico ${INDICE}: existem ${duplicados.length} ` +
        `grupo(s) de contrato com codigo repetido na mesma obra. ` +
        `Rode "node scripts/auditarContratosDuplicados.js" somente para revisar e ` +
        `corrija os registros pela interface de Gestao de Contratos antes de tentar novamente. ` +
        `Grupos: ${listagem}`
      );
    }

    await queryInterface.addIndex(TABELA, ['codigo', 'obra_id'], {
      name: INDICE,
      unique: true
    });
  },

  async down() {
    // Sem rollback destrutivo: remover o indice reabriria a porta para codigo duplicado.
  }
};
