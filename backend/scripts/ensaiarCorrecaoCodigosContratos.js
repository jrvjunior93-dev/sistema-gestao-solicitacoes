'use strict';

// Apenas na copia restaurada do RDS staging. Nao e saneamento de producao.
const { env, validateRequiredEnv } = require('../src/config/env');
const sequelize = require('../src/database');

const TARGET = Object.freeze({
  host: 'fluxy-staging.cn820k66sdx7.us-east-2.rds.amazonaws.com',
  database: 'fluxy_restore_20261003',
  user: 'fluxy_restore_20261003',
  uuid: '60f043e9-4025-11f1-9a61-06d8a063012d'
});
const CODE = 'CT/ADM001-33';
const INACTIVE_IDS = [715, 716, 717, 718];
const ALL_IDS = [...INACTIVE_IDS, 719];
const codeFor = (id) => `${CODE}-LEGADO-${id}`;

function assertConfig() {
  validateRequiredEnv();
  if (process.argv[2] !== '--confirmar-ensaio' || env.nodeEnv !== 'development' ||
      env.dbHost !== TARGET.host || env.dbName !== TARGET.database ||
      env.dbUser !== TARGET.user || !env.dbSslCaFile) {
    throw new Error('Correcao de ensaio recusada: confirmacao, destino ou TLS incorretos.');
  }
}

function assertRows(rows) {
  if (rows.length !== 5 || rows.some((row, index) => Number(row.id) !== ALL_IDS[index] ||
      Number(row.obra_id) !== 23 || row.codigo !== CODE ||
      Number(row.valor_total) !== 50000 ||
      Number(row.ativo) !== (Number(row.id) === 719 ? 1 : 0) ||
      Number(row.solicitacoes) !== (Number(row.id) === 719 ? 2 : 0) ||
      Number(row.apropriacoes) !== 1)) {
    throw new Error('Dados dos cinco contratos divergiram da auditoria; nenhuma alteracao foi confirmada.');
  }
}

async function main() {
  assertConfig();
  const [identityRows] = await sequelize.query(
    'SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco, CURRENT_USER() AS conta'
  );
  const identity = identityRows[0] || {};
  const [sslRows] = await sequelize.query("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
  if (identity.uuid !== TARGET.uuid || identity.banco !== TARGET.database ||
      !String(identity.conta).startsWith(`${TARGET.user}@`) || !sslRows[0]?.Value) {
    throw new Error('Identidade do RDS staging, schema, conta ou TLS nao conferem.');
  }

  await sequelize.transaction(async (transaction) => {
    const [rows] = await sequelize.query(`
      SELECT c.id, c.obra_id, c.codigo, c.ativo, c.valor_total,
             (SELECT COUNT(*) FROM solicitacoes s WHERE s.contrato_id = c.id) AS solicitacoes,
             (SELECT COUNT(*) FROM contrato_apropriacoes a WHERE a.contrato_id = c.id) AS apropriacoes
        FROM contratos c
       WHERE c.obra_id = 23 AND (c.codigo = :codigo OR c.id IN (715, 716, 717, 718, 719))
       ORDER BY c.id FOR UPDATE
    `, { replacements: { codigo: CODE }, transaction });
    assertRows(rows);

    const [occupied] = await sequelize.query(`
      SELECT id FROM contratos
       WHERE obra_id = 23 AND codigo IN (:candidateCodes)
       LIMIT 1
    `, { replacements: { candidateCodes: INACTIVE_IDS.map(codeFor) }, transaction });
    if (occupied.length) throw new Error('Um dos codigos candidatos ja existe; nenhuma alteracao foi confirmada.');

    for (const id of INACTIVE_IDS) {
      await sequelize.query(`
        UPDATE contratos SET codigo = :novoCodigo, updatedAt = UTC_TIMESTAMP()
         WHERE id = :id AND obra_id = 23 AND codigo = :codigo AND ativo = 0
      `, { replacements: { id, codigo: CODE, novoCodigo: codeFor(id) }, transaction });
    }

    const [after] = await sequelize.query(`
      SELECT id, codigo, ativo FROM contratos
       WHERE id IN (715, 716, 717, 718, 719) ORDER BY id FOR UPDATE
    `, { transaction });
    if (after.length !== 5 || after.some((row) =>
      row.codigo !== (Number(row.id) === 719 ? CODE : codeFor(Number(row.id))))) {
      throw new Error('Verificacao apos a atualizacao falhou; transacao revertida.');
    }
  });

  console.log('Somente a copia staging foi ajustada: IDs 715-718 receberam sufixo LEGADO-ID.');
  console.log('Contrato ativo 719, solicitacoes e apropriacoes foram preservados.');
}

main()
  .catch((error) => {
    console.error('Ensaio de saneamento reprovado:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
