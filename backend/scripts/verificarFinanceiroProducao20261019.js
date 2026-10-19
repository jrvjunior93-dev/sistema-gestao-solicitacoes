'use strict';
// Exclusivo PRODUCAO, somente leitura. Nenhuma autorizacao/runner de DDL.
const assert = require('node:assert/strict');
const { conferirSchema } = require('./verificarCartaoParcelamentoMySqlDev');
const { UUID } = require('./preflightFinanceiroProducao20261019');

function mensagemSegura(erro) {
  // Nao ecoar mensagens arbitrarias do driver (podem incluir SQL/credenciais).
  const mensagem = String(erro?.message || '');
  if (/^Pendencias fora do pacote: (?:[0-9]{12}_[a-z0-9_]+\.js(?:, )?)*$/.test(mensagem)) return mensagem;
  if (mensagem === 'Atualizacao ainda tem migrations pendentes. Nao reinicie.') return mensagem;
  return 'Confira schema/identidade/configuracao/conectividade sem compartilhar segredos. Nada aplicado.';
}

async function verificar({ conexao, log = console.log }) {
  const [ids] = await conexao.query('SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco');
  assert(ids[0]?.uuid === UUID && ids[0]?.banco === 'gestao_solicitacoes', 'BANCO_PRODUCAO_DIFERENTE');
  const [tls] = await conexao.query("SHOW SESSION STATUS WHERE Variable_name IN ('Ssl_cipher','Ssl_version')");
  assert(tls.length === 2 && tls.every(r => r.Value), 'TLS_NAO_CONFIRMADO');
  await conferirSchema({ conexao, log });
  log('FINANCEIRO PRODUCAO CONFERIDO: schema previamente aplicado, SQL somente leitura. Nenhuma migration, baixa, cancelamento ou regularizacao executada.');
}

if (require.main === module) {
  (async () => {
    if (process.argv.length !== 3 || process.argv[2] !== '--verificar') throw Error('Use --verificar. Somente leitura.');
    const fs = require('node:fs'), cp = require('node:child_process');
    const { env, validateRequiredEnv } = require('../src/config/env');
    const db = require('../src/database');
    try {
      await require('./promoverSchemaProducao20261018').executar({ modo: '--concluido',
        cwd: fs.realpathSync(process.cwd()), env, validateRequiredEnv, db,
        schema: require('../src/database/runMigrations'), execFileSync: cp.execFileSync });
    } finally { await db.close(); }
    // Verifica tambem o TLS e a identidade desta conexao independente.
    const conexao = await require('mysql2/promise').createConnection({ host: env.dbHost, port: env.dbPort,
      user: env.dbUser, password: env.dbPassword, database: env.dbName, dateStrings: true,
      connectTimeout: 8000, multipleStatements: false,
      ssl: { ca: fs.readFileSync(env.dbSslCaFile), rejectUnauthorized: true, verifyIdentity: true } });
    try { await verificar({ conexao }); } finally { await conexao.end(); }
  })().catch(e => { console.error('VERIFICACAO PRODUCAO INTERROMPIDA:', e.code || e.name,
    mensagemSegura(e)); process.exitCode = 1; });
}
module.exports = { verificar, mensagemSegura };
