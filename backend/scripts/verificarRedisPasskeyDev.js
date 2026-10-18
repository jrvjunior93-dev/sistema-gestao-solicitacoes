'use strict';
// Inspecao exclusiva DEV. Apenas SELECT, PING e COMMAND INFO; nao usa SET,
// GETDEL, SCAN ou qualquer chave real. A assinatura/passkey real e teste humano.
const path = require('node:path');
const BACKEND = '/home/ubuntu/sistema-gestao-solicitacoes-dev/backend';
const HOST = 'fluxy-staging.cn820k66sdx7.us-east-2.rds.amazonaws.com';
const UUID = '60f043e9-4025-11f1-9a61-06d8a063012d';
async function executar({ modo, cwd, env, runtimeEnv, db, schema, execFileSync, createClient, log = console.log }) {
  if (modo !== '--verificar' || cwd !== BACKEND || env.deploymentEnvironment !== 'development'
    || Number(env.port) !== 8001 || env.dbHost !== HOST || env.dbName !== 'gestao_solicitacoes') throw Error('EXCLUSIVO_DEV: nenhuma verificacao Redis executada.');
  const processos = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8' })).filter(p => p.name === 'backend-dev');
  const p = processos[0]?.pm2_env;
  if (processos.length !== 1 || path.posix.normalize(p?.pm_exec_path || '') !== `${BACKEND}/server.js`
    || Number(p.PORT || env.port) !== 8001 || (p.watch && (!Array.isArray(p.watch) || p.watch.length))) throw Error('PROCESSO_DEV_DIFERENTE: confira processo/porta/watch.');
  for (const key of ['DB_HOST','DB_NAME','DB_PORT','DB_USER','DB_PASSWORD','DB_PASS','DB_SSL_CA_FILE','DEPLOYMENT_ENV',
    'REDIS_URL','REDIS_KEY_PREFIX','WEBAUTHN_RP_ID','WEBAUTHN_ORIGINS','PAYMENT_OWNER_APPROVAL_MODE']) {
    if (p[key] !== undefined && String(p[key]) !== String(runtimeEnv[key] ?? '')) throw Error(`Configuracao ${key} diverge do PM2 DEV. Nao compartilhe segredos.`);
  }
  if ([p.ALLOW_SCHEMA_MIGRATIONS,runtimeEnv.ALLOW_SCHEMA_MIGRATIONS].some(v=>String(v).toLowerCase()==='true')) throw Error('ALLOW_SCHEMA_MIGRATIONS nao pode ficar habilitado.');
  if (env.paymentOwnerApprovalMode !== 'PILOT') throw Error('PILOT DEV nao confirmado. Nenhum modo sera alterado automaticamente.');
  if (!env.redisUrl || !env.webauthnRpId || !Array.isArray(env.webauthnOrigins) || !env.webauthnOrigins.length) throw Error('Redis/passkey DEV sem configuracao completa. Nenhuma configuracao alterada.');
  for(const origem of env.webauthnOrigins) {
    let u;try { u=new URL(origem); } catch { throw Error('Origem WebAuthn invalida.'); }
    if (u.protocol !== 'https:' || u.origin !== origem || !(u.hostname === env.webauthnRpId || u.hostname.endsWith('.'+env.webauthnRpId))) throw Error('Origem/RP WebAuthn incoerentes. Nenhuma configuracao alterada.');
  }
  const [rows] = await db.query('SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco');
  if (rows[0]?.uuid !== UUID || rows[0]?.banco !== 'gestao_solicitacoes') throw Error('BANCO_DEV_DIFERENTE: Redis nao foi conectado.');
  await schema.assertMigrationsUpToDate();
  // Cliente separado para nao imprimir mensagens que possam conter a URL.
  const client=createClient({url:env.redisUrl,socket:{connectTimeout:4000,reconnectStrategy:false}});
  client.on('error',()=>{});
  try {
    await client.connect();
    if(await client.ping()!=='PONG') throw Error('PING');
    const info=await client.sendCommand(['COMMAND','INFO','GETDEL']);
    if(!Array.isArray(info)||!Array.isArray(info[0])||String(info[0][0]).toLowerCase()!=='getdel') throw Error('GETDEL');
  } catch {
    throw Error('Redis DEV nao confirmou PING/COMMAND INFO GETDEL. Confira conectividade, suporte GETDEL (Redis 6.2+) e permissao de inspecao; nao altere ACL/configuracao automaticamente.');
  } finally { if(client.isOpen) client.destroy(); }
  log('Redis DEV: PING e suporte GETDEL confirmados somente por inspecao; nenhuma chave criada, lida ou removida.');
  log('Configuracao passkey DEV: RP/origens HTTPS coerentes e alinhados ao PM2. Assinatura real deve ser testada no PWA com autorizador nominal, fora de Testar usuario.');
}
if(require.main===module) {
  const fs=require('node:fs'),{env}=require('../src/config/env'),db=require('../src/database');
  executar({modo:process.argv[2],cwd:fs.realpathSync(process.cwd()),env,runtimeEnv:process.env,db,
    schema:require('../src/database/runMigrations'),execFileSync:require('node:child_process').execFileSync,createClient:require('redis').createClient})
    .catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.close());
}
module.exports={executar,BACKEND,HOST,UUID};
