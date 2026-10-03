'use strict';

/**
 * Auditoria estritamente de leitura para o indice unico (codigo, obra_id).
 *
 * Este arquivo nao corrige, exclui, insere nem atualiza dados. Os grupos encontrados devem ser
 * tratados pelo usuario na interface de Gestao de Contratos antes da migration estrutural.
 */

require('dotenv').config();

const { sequelize } = require('../src/models');

async function run() {
  const [grupos] = await sequelize.query(`
    SELECT c.codigo, c.obra_id, COUNT(*) AS total
    FROM contratos c
    GROUP BY c.codigo, c.obra_id
    HAVING COUNT(*) > 1
    ORDER BY c.obra_id, c.codigo
  `);

  const relatorio = [];

  for (const grupo of grupos) {
    const [contratos] = await sequelize.query(
      `SELECT c.id,
              c.codigo,
              c.obra_id,
              c.valor_total,
              c.createdAt,
              (SELECT COUNT(*) FROM solicitacoes s WHERE s.contrato_id = c.id) AS solicitacoes,
              (SELECT COUNT(*) FROM contrato_apropriacoes ca WHERE ca.contrato_id = c.id) AS apropriacoes
       FROM contratos c
       WHERE c.codigo = :codigo AND c.obra_id = :obraId
       ORDER BY c.id`,
      { replacements: { codigo: grupo.codigo, obraId: grupo.obra_id } }
    );

    relatorio.push({
      codigo: grupo.codigo,
      obra_id: grupo.obra_id,
      total: Number(grupo.total),
      contratos: contratos.map((contrato) => ({
        id: contrato.id,
        valor_total: contrato.valor_total,
        criado_em: contrato.createdAt,
        solicitacoes: Number(contrato.solicitacoes),
        apropriacoes: Number(contrato.apropriacoes)
      }))
    });
  }

  console.log(JSON.stringify({ grupos: relatorio, total_grupos: relatorio.length }, null, 2));

  if (relatorio.length > 0) {
    process.exitCode = 2;
    console.error(
      'Existem contratos duplicados. Corrija-os pela interface de Gestao de Contratos; ' +
      'nenhuma alteracao foi feita por esta auditoria.'
    );
  }
}

run()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close().catch(() => {});
  });
