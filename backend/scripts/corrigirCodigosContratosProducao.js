'use strict';

// Correcao pontual aprovada em 03/10/2026. Nao executa migrations nem altera vinculos.
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');

const TARGET = Object.freeze({
  host: 'gestao-solicitacoes-db.cn820k66sdx7.us-east-2.rds.amazonaws.com',
  database: 'gestao_solicitacoes',
  user: 'admin',
  account: 'admin@%',
  uuid: '5ed4b970-009f-11f1-809c-0ad0e0c90c53'
});
const CODE = 'CT/ADM001-33';
const INACTIVE_IDS = [715, 716, 717, 718];
const ALL_IDS = [...INACTIVE_IDS, 719];
const codeFor = (id) => `${CODE}-LEGADO-${id}`;

function assertRows(rows, updated) {
  if (rows.length !== ALL_IDS.length || rows.some((row, index) => {
    const id = Number(row.id);
    return id !== ALL_IDS[index] || Number(row.obra_id) !== 23 ||
      row.codigo !== (updated && id !== 719 ? codeFor(id) : CODE) ||
      Number(row.valor_total) !== 50000 ||
      Number(row.ativo) !== (id === 719 ? 1 : 0) ||
      Number(row.solicitacoes) !== (id === 719 ? 2 : 0) ||
      Number(row.apropriacoes) !== 1;
  })) {
    throw new Error('Contratos ou vinculos divergiram da auditoria; operacao recusada.');
  }
}

async function readRows(connection) {
  const [rows] = await connection.query(`
    SELECT c.id, c.obra_id, c.codigo, c.ativo, c.valor_total,
           (SELECT COUNT(*) FROM solicitacoes s WHERE s.contrato_id = c.id) AS solicitacoes,
           (SELECT COUNT(*) FROM contrato_apropriacoes a WHERE a.contrato_id = c.id) AS apropriacoes
      FROM contratos c
     WHERE c.obra_id = 23 AND (c.codigo = ? OR c.id IN (715, 716, 717, 718, 719))
     ORDER BY c.id FOR UPDATE
  `, [CODE]);
  return rows;
}

async function main() {
  const caFile = process.env.PROD_CORRECTION_RDS_CA_FILE;
  const password = process.env.PROD_CORRECTION_DB_PASSWORD;
  if (process.argv.length !== 3 ||
      process.argv[2] !== '--confirmar-quatro-codigos-producao' ||
      !password || !caFile || !path.isAbsolute(caFile)) {
    throw new Error('Confirmacao, senha administrativa ou CA absoluto ausente; nada foi conectado.');
  }

  const connection = await mysql.createConnection({
    host: TARGET.host,
    port: 3306,
    database: TARGET.database,
    user: TARGET.user,
    password,
    ssl: { ca: fs.readFileSync(caFile), rejectUnauthorized: true },
    connectTimeout: 10000,
    multipleStatements: false
  });
  let transactionOpen = false;
  let commitAttempted = false;
  try {
    const [[identity]] = await connection.query(
      'SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco, CURRENT_USER() AS conta'
    );
    const [[ssl]] = await connection.query("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
    if (identity.uuid !== TARGET.uuid || identity.banco !== TARGET.database ||
        identity.conta !== TARGET.account || !ssl?.Value) {
      throw new Error('UUID, banco, conta administrativa ou TLS nao conferem.');
    }

    await connection.query('SET SESSION innodb_lock_wait_timeout = 5');
    await connection.beginTransaction();
    transactionOpen = true;

    const before = await readRows(connection);
    assertRows(before, false);
    const [occupied] = await connection.query(
      'SELECT id FROM contratos WHERE obra_id = 23 AND codigo IN (?) LIMIT 1 FOR UPDATE',
      [INACTIVE_IDS.map(codeFor)]
    );
    if (occupied.length) throw new Error('Um dos codigos de destino ja esta em uso.');
    console.log(JSON.stringify({ etapa: 'antes', uuid: identity.uuid, banco: identity.banco, tls: ssl.Value, contratos: before }));

    for (const id of INACTIVE_IDS) {
      const [result] = await connection.execute(`
        UPDATE contratos SET codigo = ?, updatedAt = UTC_TIMESTAMP()
         WHERE id = ? AND obra_id = 23 AND codigo = ? AND ativo = 0
      `, [codeFor(id), id, CODE]);
      if (result.affectedRows !== 1) {
        throw new Error(`ID ${id} nao foi atualizado exatamente uma vez.`);
      }
    }

    const after = await readRows(connection);
    assertRows(after, true);
    console.log(JSON.stringify({ etapa: 'conferido_antes_do_commit', contratos: after }));
    commitAttempted = true;
    await connection.commit();
    transactionOpen = false;
    console.log('COMMIT_CONFIRMADO: somente os codigos dos contratos inativos 715-718 foram alterados.');
  } catch (error) {
    if (transactionOpen && !commitAttempted) {
      await connection.rollback();
      console.error('ROLLBACK_CONFIRMADO: nenhuma alteracao desta execucao foi gravada.');
    }
    if (commitAttempted) {
      console.error('Resultado do COMMIT incerto: nao repetir o script antes de consulta somente leitura.');
    }
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('Correcao recusada ou falhou:', error.message);
  process.exitCode = 1;
});
