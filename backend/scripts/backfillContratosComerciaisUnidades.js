'use strict';

require('dotenv').config();

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../src/models');

async function localizarPendencias(transaction = null) {
  return sequelize.query(`
    SELECT c.id AS contrato_id,
           c.unidade_comercial_id,
           c.valor_total,
           u.codigo AS unidade_codigo,
           COALESCE(u.valor_base_venda, u.valor_tabela) AS valor_cadastro_referencia
      FROM contratos_comerciais c
      JOIN unidades_comerciais u ON u.id = c.unidade_comercial_id
 LEFT JOIN contrato_comercial_unidades cu ON cu.contrato_comercial_id = c.id
     WHERE c.status <> 'EXCLUIDO'
       AND c.unidade_comercial_id IS NOT NULL
       AND cu.id IS NULL
  ORDER BY c.id
  `, { type: QueryTypes.SELECT, transaction });
}

async function executar() {
  const confirmar = process.argv.includes('--confirm');
  const pendencias = await localizarPendencias();

  console.table(pendencias.map((item) => ({
    contrato_id: item.contrato_id,
    unidade_id: item.unidade_comercial_id,
    unidade: item.unidade_codigo,
    valor_contrato: item.valor_total,
    valor_cadastro: item.valor_cadastro_referencia
  })));

  if (!confirmar) {
    console.log(`Simulacao concluida: ${pendencias.length} contrato(s) legado(s) receberia(m) o vinculo multiunidade. Use --confirm para aplicar.`);
    return;
  }

  await sequelize.transaction(async (transaction) => {
    const atuais = await localizarPendencias(transaction);
    for (const item of atuais) {
      await sequelize.query(`
        INSERT INTO contrato_comercial_unidades
          (contrato_comercial_id, unidade_comercial_id, ordem, principal,
           valor_cadastro_referencia, valor_atribuido, confirmado_por, confirmado_em,
           createdAt, updatedAt)
        VALUES
          (:contratoId, :unidadeId, 1, 1, :valorReferencia, :valorAtribuido,
           NULL, NOW(), NOW(), NOW())
      `, {
        replacements: {
          contratoId: item.contrato_id,
          unidadeId: item.unidade_comercial_id,
          valorReferencia: item.valor_cadastro_referencia,
          valorAtribuido: item.valor_total
        },
        transaction
      });
    }
  });

  console.log(`Backfill concluido: ${pendencias.length} contrato(s) legado(s) vinculado(s).`);
}

executar()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close().catch(() => {});
  });
