'use strict';
// Roteiro do operador. Backend/migration primeiro; nenhum frontend publicado aqui.
const fs = require('node:fs'), cp = require('node:child_process'), path = require('node:path');
const crypto = require('node:crypto'), http = require('node:http'), os = require('node:os');
const ROOT = '/home/ubuntu/sistema-gestao-solicitacoes-main', BACKEND = `${ROOT}/backend`;
const PROD_RUNTIME = '/home/ubuntu/fluxy-node24-prod', DEV_RUNTIME = '/home/ubuntu/fluxy-node24-dev';
const BASE = '62456b21ab90a47d71c0508da544cbe63299b18d';
const OLDEST = '455adc61508ff32b4e0463ee0227291471b86f1f';
const MANIFEST = 'ops/deploy/retirada-envios-backend-prod-20261024.json';
const MIGRATION = '202610230003_pagamento_envios_retiradas.js';
const NODE = `${PROD_RUNTIME}/node-v24.22.1-linux-${process.arch}/bin/node`;
const DEVNODE = `${DEV_RUNTIME}/node-v24.22.1-linux-${process.arch}/bin/node`;
function check(ok, code) { if (!ok) throw Error(code); }
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const fileHash = file => hash(fs.readFileSync(file));
function equal(a, b, code) { check(canonical(a) === canonical(b), code); }
function cleanEnvironment(env) {
  const e = { ...env }; for (const k of ['NODE_CHANNEL_FD','NODE_CHANNEL_SERIALIZATION_MODE','NODE_UNIQUE_ID']) delete e[k]; return e;
}
function run(bin, args, options = {}) {
  const r = cp.spawnSync(bin, args, { cwd: ROOT, encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore','pipe','pipe'], ...options });
  check(!r.error && r.status === 0, `COMANDO_FALHOU_${path.basename(bin).replace(/[^a-z0-9]/gi, '_')}`);
  return r.stdout.trim(); // Nunca imprimir stderr, ambiente ou JSON PM2 bruto.
}
const git = args => run('git', args);
const list = () => JSON.parse(run('pm2', ['jlist'], { env: { ...cleanEnvironment(process.env), PM2_HOME: '/home/ubuntu/.pm2' } }));
function runtime(p) {
  check(Number.isSafeInteger(p.pid) && p.pid > 0, 'PID_INVALIDO');
  return { executable: fs.readlinkSync(`/proc/${p.pid}/exe`), version: run(`/proc/${p.pid}/exe`, ['--version']) };
}
function validateProcesses(ps) {
  for (const [name,cwd,bin] of [['backend-solicitacoes',BACKEND,NODE],['backend-dev','/home/ubuntu/sistema-gestao-solicitacoes-dev/backend',DEVNODE]]) {
    const a = ps.filter(p => p.name === name); check(a.length === 1, 'PROCESSO_NAO_UNICO');
    const p = a[0], e = p.pm2_env;
    check(Number.isSafeInteger(p.pm_id) && p.pm_id >= 0 && e.status === 'online' && e.pm_cwd === cwd &&
      e.pm_exec_path === `${cwd}/server.js` && e.exec_mode === 'fork_mode' && (!e.watch || Array.isArray(e.watch) && !e.watch.length), 'PROCESSO_OU_CAMINHO_DIFERENTE');
    check(e.exec_interpreter === bin && runtime(p).executable === bin && runtime(p).version === 'v24.22.1', 'NODE_ISOLADO_DIFERENTE');
  }
  return ps.find(p => p.name === 'backend-solicitacoes');
}
function effectiveEnvironment(p) {
  return cleanEnvironment(Object.fromEntries(fs.readFileSync(`/proc/${p.pid}/environ`, 'utf8').split('\0').filter(Boolean)
    .map(v => { const i = v.indexOf('='); check(i > 0, 'AMBIENTE_INVALIDO'); return [v.slice(0,i),v.slice(i+1)]; })));
}
function policy(p) {
  const e = p.pm2_env, keys = ['args','node_args','exec_mode','watch','ignore_watch','cron_restart','max_memory_restart','autorestart',
    'min_uptime','max_restarts','restart_delay','exp_backoff_restart_delay','kill_timeout','wait_ready','listen_timeout','namespace',
    'merge_logs','time','log_date_format','pm_out_log_path','pm_err_log_path','pm_pid_path','instance_var','filter_env','exec_interpreter'];
  return hash(canonical(Object.fromEntries(keys.filter(k => e[k] !== undefined).map(k => [k,e[k]]))));
}
function peers(ps) {
  return ps.filter(p => p.name !== 'backend-solicitacoes').map(p => {
    const e = p.pm2_env, config = Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith('axm_') &&
      !['pm_uptime','restart_time','unstable_restarts','exit_code','prev_restart_delay','_tree_pids'].includes(k)));
    return { name: p.name, id: p.pm_id, pid: p.pid, uptime: e.pm_uptime, restarts: e.restart_time,
      config: hash(canonical(config)), runtime: p.pid > 0 ? runtime(p) : null,
      envFile: e.pm_cwd && fs.existsSync(`${e.pm_cwd}/.env`) ? fileHash(`${e.pm_cwd}/.env`) : null };
  }).sort((a,b) => a.id - b.id);
}
function persisted() {
  const files = ['/usr/bin/node',NODE,DEVNODE,`${BACKEND}/.env`,
    `${PROD_RUNTIME}/retorno.json`,`${DEV_RUNTIME}/retorno.json`,
    `${PROD_RUNTIME}/persistencia-20261024/estado.json`,`${DEV_RUNTIME}/persistencia-20261024/estado.json`,
    '/home/ubuntu/.pm2/dump.pm2','/home/ubuntu/.pm2/dump.pm2.bak'];
  for (const file of files.slice(-2)) {
    const s = fs.lstatSync(file); check(s.isFile() && !s.isSymbolicLink() && s.nlink === 1 && !(s.mode & 0o077), 'DUMP_PM2_INSEGURO');
    const a = JSON.parse(fs.readFileSync(file,'utf8'));
    for (const [name,bin] of [['backend-solicitacoes',NODE],['backend-dev',DEVNODE]]) {
      const selected = a.filter(e => e.name === name); check(selected.length === 1 && selected[0].exec_interpreter === bin, 'NODE_PERSISTIDO_DIFERENTE');
    }
  }
  const pid = Number(fs.readFileSync('/home/ubuntu/.pm2/pm2.pid','utf8').trim());
  check(Number.isSafeInteger(pid) && pid > 0, 'DAEMON_PM2_INVALIDO');
  return { files: Object.fromEntries(files.map(file => [file,fileHash(file)])), daemon: runtime({pid}), pid };
}
function probe(p, mode = 'old') {
  const code = `
    const fs = require('node:fs'), cp = require('node:child_process'), crypto = require('node:crypto');
    const canonical = ${canonical.toString()};
    const { env, validateRequiredEnv } = require('./src/config/env'), db = require('./src/database');
    (async () => { try {
      const ctx = { cwd: fs.realpathSync(process.cwd()), env, validateRequiredEnv, db,
        schema: require('./src/database/runMigrations'), execFileSync: cp.execFileSync };
      if (${JSON.stringify(mode)} === 'old') {
        await require('./scripts/promoverSchemaProducao20261018').conferirProducao(ctx);
        await ctx.schema.assertMigrationsUpToDate();
      } else await require('./scripts/aplicarMigrationRetiradaEnviosProducao20261024').executar({ ...ctx, modo: ${JSON.stringify(mode)} });
      const file = require('dotenv').parse(fs.readFileSync('.env','utf8'));
      if (Object.keys(file).some(k => String(file[k]) !== String(process.env[k] ?? ''))) throw Error('ENV_DIFERENTE');
      const skip = new Set(['PWD','OLDPWD','SHLVL','SSH_CLIENT','SSH_CONNECTION','SSH_TTY','XDG_SESSION_ID','XDG_RUNTIME_DIR',
        'DBUS_SESSION_BUS_ADDRESS','TERM','COLORTERM','PM2_HOME','PM2_USAGE','PM2_JSON_PROCESSING',
        'CONFIRM_PROD_BACKUP','CONFIRM_PROD_BACKUP_TIMER','CONFIRM_PROD_MAINTENANCE']);
      const keys = new Set([...Object.keys(file),...Object.keys(process.env).filter(k => /^[A-Z][A-Z0-9_]*$/.test(k) && !skip.has(k))]);
      const vars = Object.fromEntries([...keys].sort().map(k => [k,process.env[k] ?? null]));
      console.log('PROD_CONFIG_PROBE:' + crypto.createHash('sha256').update(canonical({ env,vars })).digest('hex'));
    } finally { await db.close(); } })().catch(() => { console.error('PROBE_PRODUCAO_FALHOU'); process.exitCode=1; });`;
  const e = effectiveEnvironment(p);
  // Confirmacoes so no filho aplicador. Nunca entram no ambiente PM2 ou .env.
  if (mode === '--aplicar') for (const k of ['CONFIRM_PROD_BACKUP','CONFIRM_PROD_BACKUP_TIMER','CONFIRM_PROD_MAINTENANCE']) e[k] = process.env[k];
  const output = run(NODE, ['-e',code], { cwd: BACKEND, env: e, timeout: 120000 });
  const result = output.split(/\r?\n/).find(l => /^PROD_CONFIG_PROBE:[a-f0-9]{64}$/.test(l));
  check(result, 'PROBE_SEM_RESULTADO'); return result.split(':')[1];
}
function validateInventory(m, diff, packageBefore, packageAfter) {
  check(m.base === BASE && m.source === '84b9aef43fe2f3192bdcf0e415dd794289b0f751', 'MANIFESTO_BASE_FONTE_DIFERENTE');
  equal([...m.arquivos].sort(),[...diff].sort(),'INVENTARIO_FORA_DO_ESCOPO');
  check(diff.every(line => !line.split('\t')[1]?.startsWith('frontend/')), 'FRONTEND_LIBERADO_ANTES_DO_BACKEND');
  const after = structuredClone(packageAfter);
  check(after.scripts['test:retirada-envios'] === 'node scripts/validarRetiradaEnvios.js && node scripts/validarRetiradaEnviosHttp.js && node scripts/validarAnaliseProprietario.js && node scripts/validarPainelAutorizacoesSqlLocal.js', 'SCRIPT_QA_DIFERENTE');
  delete after.scripts['test:retirada-envios']; equal(after,packageBefore,'DEPENDENCIAS_OU_PACKAGE_FORA_DO_ESCOPO');
}
function health(port) { return new Promise(resolve => {
  const req = http.get({host:'127.0.0.1',port,path:'/health',timeout:3000}, res => {
    let body=''; res.setEncoding('utf8'); res.on('data', b => {body+=b;if(body.length>4096)req.destroy();});
    res.on('end',()=>{try{resolve(res.statusCode===200&&JSON.parse(body).ok===true);}catch{resolve(false);}});
    res.on('error',()=>resolve(false));
  }); req.on('timeout',()=>req.destroy());req.on('error',()=>resolve(false));
}); }
async function main(version) {
  check(process.platform === 'linux' && ['x64','arm64'].includes(process.arch) && /^[a-f0-9]{40}$/.test(version || ''), 'EXIGE_LINUX_SHA_COMPLETO');
  check(os.userInfo().username === 'ubuntu' && process.getuid() !== 0 &&
    (!process.env.PM2_HOME || process.env.PM2_HOME === '/home/ubuntu/.pm2'), 'USUARIO_OU_PM2_HOME_DIFERENTE');
  check(process.cwd() === ROOT && fs.realpathSync(ROOT) === ROOT && git(['branch','--show-current']) === 'main', 'CHECKOUT_PRODUCAO_DIFERENTE');
  check(!git(['status','--porcelain','--untracked-files=no']), 'CHECKOUT_PRODUCAO_ALTERADO');
  for (const key of ['CONFIRM_PROD_BACKUP','CONFIRM_PROD_BACKUP_TIMER','CONFIRM_PROD_MAINTENANCE']) check(process.env[key] === 'SIM', 'BACKUP_TIMER_JANELA_NAO_CONFIRMADOS');
  // Nao iniciar daemon implicitamente via jlist se ele estiver indisponivel.
  run('systemctl',['is-active','--quiet','pm2-ubuntu.service']);
  const locks = [];
  try {
    for (const lock of [`${PROD_RUNTIME}/.operacao.lock`,`${DEV_RUNTIME}/.operacao.lock`,
      path.resolve(ROOT,git(['rev-parse','--git-path','retirada-envios-prod-operacao.lock']))]) {
      fs.mkdirSync(lock,{mode:0o700}); locks.push(lock);
    }
    run('systemctl',['is-active','--quiet','fluxy-prod-db-backup.timer']);
    const saved = persisted(), ps = list(), p = validateProcesses(ps), protectedPeers = peers(ps), originalPolicy = policy(p);
    check(await health(8000) && await health(8001), 'HEALTH_INICIAL_FALHOU');
    function unchanged() {
      equal(persisted(),saved,'NODE_DUMP_ESTADO_ENV_OU_DAEMON_MUDOU');
      equal(peers(list()),protectedPeers,'DEV_OU_OUTRO_PROCESSO_MUDOU');
    }
    git(['fetch','origin','main']); check(git(['rev-parse','origin/main']) === version, 'REMOTO_MAIN_AVANCOU');
    const head = git(['rev-parse','HEAD']);
    git(['merge-base','--is-ancestor',OLDEST,head]); git(['merge-base','--is-ancestor',head,version]);
    check(head === version || [OLDEST,'cc791403','62456b21'].some(allowed => head.startsWith(allowed)), 'HEAD_PRODUCAO_FORA_DAS_BASES_CONFERIDAS');
    validateInventory(JSON.parse(git(['show',`${version}:${MANIFEST}`])),
      git(['diff','--name-status',BASE,version]).split(/\r?\n/).filter(Boolean),
      JSON.parse(git(['show',`${BASE}:backend/package.json`])),JSON.parse(git(['show',`${version}:backend/package.json`])));
    equal(git(['diff','--name-status',BASE,version,'--','backend/migrations']),`A\tbackend/migrations/${MIGRATION}`,'MIGRATION_FORA_DO_PACOTE003');
    check(!git(['diff','--name-only',BASE,version,'--','backend/package-lock.json','frontend']), 'DEPENDENCIA_OU_FRONTEND_NA_ETAPA_BACKEND');
    const config = probe(p, head === version ? '--verificar' : 'old'); unchanged();
    git(['merge','--ff-only',version]); check(git(['rev-parse','HEAD']) === version, 'COMMIT_APLICADO_DIFERENTE');
    for (const qa of ['validarRetiradaEnvios.js','validarRetiradaEnviosHttp.js','validarAnaliseProprietario.js',
      'validarPainelAutorizacoesSqlLocal.js','validarDownloadAnexoMedicao.js',
      'validarRemocaoAnexosHistorico.js','validarAcessoAnexosSolicitacoes.js','validarDeployRetiradaEnviosProducao20261024.js']) {
      run(NODE,[`scripts/${qa}`],{cwd:BACKEND,timeout:120000}); console.log(`QA aprovado: ${qa}`);
    }
    unchanged(); equal(probe(p,'--verificar'),config,'CONFIGURACAO_PRODUCAO_MUDOU');
    equal(probe(p,'--aplicar'),config,'CONFIGURACAO_MUDOU_DURANTE_SCHEMA');
    equal(probe(p,'--concluido'),config,'SCHEMA_NAO_CONFIRMADO'); unchanged();
    const current = validateProcesses(list()); check(current.pid === p.pid && current.pm_id === p.pm_id, 'PRODUCAO_MUDOU_DURANTE_PREFLIGHT');
    equal(policy(current),originalPolicy,'POLITICA_PM2_PRODUCAO_MUDOU');
    run('systemctl',['is-active','--quiet','fluxy-prod-db-backup.timer']);
    const restartEnv = cleanEnvironment(process.env);
    for (const k of Object.keys(restartEnv)) if (k.startsWith('CONFIRM_PROD_') || k === 'ALLOW_SCHEMA_MIGRATIONS') delete restartEnv[k];
    console.log('Reiniciando SOMENTE backend-solicitacoes com seu Node24.22.1 isolado.');
    run('pm2',['restart',String(p.pm_id)],{env:restartEnv});
    let good=0,lastPid,ready;
    for (let i=0;i<25;i++) {
      unchanged(); const next = validateProcesses(list());
      if (next.pid !== p.pid && await health(8000)) { good = next.pid === lastPid ? good+1 : 1;lastPid=next.pid;ready=next; }
      else good=0;
      if (good>=6) break; await new Promise(resolve=>setTimeout(resolve,2000));
    }
    check(ready && good>=6,'PRODUCAO_NAO_ESTABILIZOU');
    equal(policy(ready),originalPolicy,'POLITICA_PM2_PRODUCAO_MUDOU');
    equal(probe(ready,'--concluido'),config,'CONFIGURACAO_APLICACAO_MUDOU');
    unchanged(); check(await health(8001),'HEALTH_DEV_FALHOU');
    run('systemctl',['is-active','--quiet','fluxy-prod-db-backup.timer']);
    const proof = { etapa:'BACKEND_RETIRADA_ENVIOS_PRODUCAO_PRONTO',commit:version,migration:MIGRATION,
      node_producao:runtime(ready),pid_producao:ready.pid,pid_dev:protectedPeers.find(p=>p.name==='backend-dev').pid,
      dev_preservado:true,nodes_e_persistencia_preservados:true,frontend_novo_publicado:false };
    const proofPath = path.resolve(ROOT,git(['rev-parse','--git-path','retirada-envios-prod-backend-pronto.json']));
    fs.writeFileSync(proofPath,JSON.stringify(proof,null,2)+'\n',{mode:0o600,flush:true}); console.log(JSON.stringify(proof));
    console.log('Envie esta saida antes de liberar o frontend. Sem PM2 save/update/--update-env, npm ou troca de Node.');
  } finally { for (const lock of locks.reverse()) fs.rmdirSync(lock); }
}
module.exports = { main,canonical,cleanEnvironment,validateInventory,validateProcesses,policy,peers,persisted,probe,
  ROOT,BACKEND,BASE,OLDEST,NODE,DEVNODE,MIGRATION,MANIFEST };
if (require.main === module || process.argv[1] === '-') main(process.argv[2]).catch(e => {
  const c = String(e.code || e.message || 'FALHA'); console.error('ATUALIZACAO_PROD_INTERROMPIDA:' + (/^[A-Z0-9_]+$/.test(c)?c:'FALHA_VALIDACAO_OU_COMANDO'));
  console.error('Pare e envie a saida sem segredos. Nao publique frontend, force Git, altere dumps ou reinicie DEV/todos os processos.');process.exitCode=1;
});
