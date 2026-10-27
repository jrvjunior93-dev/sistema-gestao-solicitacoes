'use strict';
const fs=require('node:fs'),path=require('node:path'),{isDeepStrictEqual}=require('node:util');
const R=(()=>{const module={exports:{}};
'use strict';
// Leitura dos runtimes existentes; nao executa main nem inicializa PM2 ausente.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),http=require('node:http');
const {isDeepStrictEqual}=require('node:util');
const ROOT='/home/ubuntu/sistema-gestao-solicitacoes-dev',BACKEND=ROOT+'/backend';
const NODE='/home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node';
const PM2_NODE='/opt/fluxy-node24-pm2/node-v24.22.1-linux-x64/bin/node',PM2_CLI='/usr/lib/node_modules/pm2/bin/pm2';
function check(ok, code) { if (!ok) throw Error(code); }
const cleanEnv = () => ({ PATH: '/usr/sbin:/usr/bin:/sbin:/bin', HOME: '/home/ubuntu',
  USER: 'ubuntu', LOGNAME: 'ubuntu', LANG: 'C', PM2_HOME: '/home/ubuntu/.pm2' });
function run(bin, args, options = {}) {
  const result = cp.spawnSync(bin, args, { cwd: ROOT, env: cleanEnv(), encoding: 'utf8', timeout: 45000,
    maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], ...options });
  if (result.status !== 0) {
    const safe = String(result.stderr || '').split(/\r?\n/).find(line => /^(?:FISCAL|NSDOCS)_[A-Z0-9_]{1,95}$/.test(line));
    if (safe) throw Error(safe);
  }
  check(!result.error && result.status === 0,
    `COMANDO_FALHOU_${path.basename(bin).toUpperCase().replace(/[^A-Z0-9]/g, '_')}_${result.status ?? 'SEM_SAIDA'}`);
  return result.stdout.trim();
}
const git = args => run('/usr/bin/git', args);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const fileHash = file => hash(fs.readFileSync(file));
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function validateFlags(env) {
  for (const key of ['NSDOCS_V2_ENABLED', 'NSDOCS_V2_FIXTURES_ENABLED']) {
    check(env[key] === undefined || env[key] === '' || env[key] === 'false', 'NSDOCS_AUTOMATICO_DEVE_CONTINUAR_DESLIGADO');
  }
}

function list() {
  const pid = Number(fs.readFileSync('/home/ubuntu/.pm2/pm2.pid', 'utf8').trim());
  check(pid > 1 && fs.readlinkSync(`/proc/${pid}/exe`) === PM2_NODE, 'DAEMON_ISOLADO_INDISPONIVEL');
  // Unico comando PM2 permitido neste operador: leitura, com daemon ja existente.
  return JSON.parse(run(PM2_NODE, [PM2_CLI, 'jlist']));
}
function snapshotProcesses(processes) {
  const expected = {
    'backend-dev': [BACKEND, NODE, 'server.js'],
    'backend-solicitacoes': ['/home/ubuntu/sistema-gestao-solicitacoes-main/backend', '/home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node', 'server.js'],
    'fluxy-experience-api': ['/home/ubuntu/fluxy-experience/api', '/home/ubuntu/fluxy-node24-experience/node-v24.22.1-linux-x64/bin/node', 'src/server.js']
  };
  check(processes.length === 3 && Object.keys(expected).every(name => processes.filter(p => p.name === name).length === 1), 'INVENTARIO_PM2_DIFERENTE');
  return processes.map(p => {
    const e = p.pm2_env || {}, [cwd, node, script] = expected[p.name];
    check(p.pid > 0 && e.status === 'online' && e.pm_cwd === cwd && e.pm_exec_path === `${cwd}/${script}` &&
      e.exec_interpreter === node && e.exec_mode === 'fork_mode' && (!e.watch || Array.isArray(e.watch) && e.watch.length === 0), 'POLITICA_PROCESSO_DIVERGENTE');
    check(fs.readlinkSync(`/proc/${p.pid}/exe`) === node && run(`/proc/${p.pid}/exe`, ['--version']) === 'v24.22.1', 'NODE_ISOLADO_DIVERGENTE');
    if (p.name === 'backend-dev') { validateFlags(e); validateFlags(e.env || {}); }
    return { name: p.name, id: p.pm_id, pid: p.pid, cwd, script: e.pm_exec_path, node,
      uptime: e.pm_uptime, restarts: e.restart_time,
      env: hash(JSON.stringify(stable(e.env || {}))), envFile: fileHash(`${cwd}/.env`),
      initialEnvironment: hash(JSON.stringify(stable(processEnvironmentForComparison(effectiveEnv(p),e.env||{},p.name==='backend-dev')))) };
  }).sort((a, b) => a.id - b.id);
}
function assertPreserved(before, after) {
  check(isDeepStrictEqual(before, after), 'PROCESSO_OU_AMBIENTE_MUDOU');
}
function effectiveEnv(p) {
  const env = Object.fromEntries(fs.readFileSync(`/proc/${p.pid}/environ`, 'utf8').split('\0').filter(Boolean)
    .map(pair => { const index = pair.indexOf('='); return [pair.slice(0, index), pair.slice(index + 1)]; }));
  for (const key of ['NODE_CHANNEL_FD', 'NODE_CHANNEL_SERIALIZATION_MODE', 'NODE_UNIQUE_ID']) delete env[key];
  return env;
}
function processEnvironmentForComparison(initial,configured,dev){
  const out={...initial};
  // PM2 6.0.14 ForkMode passa pm2_env inteiro ao spawn. Estes campos sao
  // contadores/telemetria do gerenciador, nao configuracao do aplicativo.
  // Origem: Unitech/pm2 v6.0.14 lib/God.js e lib/God/ForkMode.js.
  const runtime=['pm_uptime','restart_time','unstable_restarts','exit_code','prev_restart_delay',
    'status','created_at','node_version','version','vizion_running','versioning',
    'axm_actions','axm_monitor','axm_options','axm_dynamic'];
  if(dev)for(const key of runtime)if(!Object.hasOwn(configured,key))delete out[key];
  return out;
}

function health(port) {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port, path: '/health', timeout: 2000 }, res => {
      let body = ''; res.setEncoding('utf8');
      res.on('data', value => { body += value; if (body.length > 4096) req.destroy(); });
      res.on('error', () => resolve(false));
      res.on('end', () => { try { resolve(res.statusCode === 200 && JSON.parse(body).ok === true); } catch { resolve(false); } });
    });
    req.on('timeout', () => req.destroy()); req.on('error', () => resolve(false));
  });
}

module.exports={ROOT,BACKEND,NODE,PM2_NODE,PM2_CLI,check,cleanEnv,run,git,hash,fileHash,stable,validateFlags,list,snapshotProcesses,assertPreserved,effectiveEnv,processEnvironmentForComparison,health};



return module.exports;})();
const {ROOT,BACKEND,NODE,PM2_NODE,PM2_CLI,check,run,git,hash,fileHash,stable,list,snapshotProcesses,effectiveEnv,health}=R;
const BASE='2830ccb5af35669965ac2f21ca70e9bd37d1fc17';
const PRIVATE='/home/ubuntu/.config/fluxy-fiscal-vinculos-dev';
const CHANGESET=[
 'M\tbackend/package.json','M\tbackend/src/modules/fiscal/models/FiscalDocumentLink.js',
 'M\tbackend/src/modules/fiscal/routes/index.js','M\tbackend/src/modules/fiscal/services/fiscalDocumentService.js',
 'M\tbackend/src/modules/fiscal/services/fiscalMatchingService.js','M\tbackend/src/services/pedidoCompraFinanceiroService.js',
 'M\tdocs/modulos/fiscal/README.md',
 ...['migrations/202610240002_fiscal_vinculos_pedidos.js','scripts/fixtures/vinculosNfeDbFixture.cjs',
 'scripts/validarTitulosPorPedido.js','scripts/validarVinculosNfePedidos.js','scripts/fiscalVinculosDevSchema.js',
 'scripts/validarFiscalVinculosDevSchema.js','src/modules/fiscal/controllers/FiscalPurchaseLinkController.js',
 'src/modules/fiscal/services/fiscalPurchaseLinkDomain.js','src/modules/fiscal/services/fiscalPurchaseLinkService.js'].map(p=>'A\tbackend/'+p),
 'A\tdocs/handoffs/2026-10-24-vinculos-nfe-pedidos-titulos-dev.md',
 'A\tdocs/modulos/fiscal/NFE_VINCULOS_PEDIDOS_TITULOS_DEV.md',
 ...['atualizar-dev-fiscal-vinculos-20261024.cjs','atualizar-dev-fiscal-vinculos-20261024.test.cjs','README-fiscal-vinculos-dev-20261024.md'].map(p=>'A\tops/deploy/'+p)
];
const QA={
 'test:fiscal-vinculos-pedidos':'node --test scripts/validarVinculosNfePedidos.js && node scripts/validarTitulosPorPedido.js && node scripts/validarPedidoBoletoOpcional.js && node scripts/validarSobreposicaoTitulos.js',
 'test:deploy-fiscal-vinculos-dev':'node --test scripts/validarFiscalVinculosDevSchema.js ../ops/deploy/atualizar-dev-fiscal-vinculos-20261024.test.cjs'
};
function validateInventory(diff){check(isDeepStrictEqual([...diff].sort(),[...CHANGESET].sort()),'FISCAL_INVENTARIO_BACKEND_DIVERGENTE');}
function validatePackage(before,after){const candidate=structuredClone(after);for(const[k,v]of Object.entries(QA)){check(!before.scripts[k]&&candidate.scripts[k]===v,'FISCAL_QA_SCRIPT_DIVERGENTE');delete candidate.scripts[k];}check(isDeepStrictEqual(before,candidate),'FISCAL_DEPENDENCIAS_OU_SCRIPTS_FORA_DO_ESCOPO');}
function assertTransition(before,after,restarted){
  check(isDeepStrictEqual(before.infrastructure,after.infrastructure),'FISCAL_DAEMON_DUMPS_OU_SYSTEMD_MUDOU');
  const expected=before.apps.map(p=>p.name==='backend-dev'&&restarted ? {...p,pid:after.apps.find(a=>a.name===p.name)?.pid,uptime:after.apps.find(a=>a.name===p.name)?.uptime,restarts:p.restarts+1}:p);
  check(isDeepStrictEqual(expected,after.apps),'FISCAL_PROCESSO_NODE_OU_AMBIENTE_MUDOU');
  if(restarted)check(after.apps.find(p=>p.name==='backend-dev').pid!==before.apps.find(p=>p.name==='backend-dev').pid,'FISCAL_RESTART_NAO_CONFERIDO');
}
function snapshot(){
  const apps=snapshotProcesses(list());
  const daemon=Number(fs.readFileSync('/home/ubuntu/.pm2/pm2.pid','utf8').trim());
  const dumps=['dump.pm2','dump.pm2.bak'].map(name=>{
    const file='/home/ubuntu/.pm2/'+name,s=fs.lstatSync(file);
    check(s.isFile()&&!s.isSymbolicLink()&&s.uid===1000&&(s.mode&0o777)===0o600,'FISCAL_DUMP_PRIVADO_DIVERGENTE');
    return {name,sha:fileHash(file),mode:s.mode&0o777};
  });
  const unit=hash(run('/usr/bin/systemctl',['--system','show','pm2-ubuntu.service','--property=FragmentPath,DropInPaths,Environment,ExecStart,ExecStop,ExecReload,UnitFileState,MainPID','--no-pager']));
  return {apps,infrastructure:{daemon,daemonExecutable:fs.readlinkSync(`/proc/${daemon}/exe`),dumps,unit}};
}
function privateDirectory(){
  const parent=fs.lstatSync('/home/ubuntu/.config');check(parent.isDirectory()&&!parent.isSymbolicLink()&&parent.uid===1000,'FISCAL_CONFIG_PRIVADA_INVALIDA');
  if(!fs.existsSync(PRIVATE))fs.mkdirSync(PRIVATE,{mode:0o700});
  const stat=fs.lstatSync(PRIVATE);check(stat.isDirectory()&&!stat.isSymbolicLink()&&stat.uid===1000&&(stat.mode&0o777)===0o700,'FISCAL_DIRETORIO_PRIVADO_INVALIDO');
}
function readState(file){
  if(!fs.existsSync(file))return null;
  const s=fs.lstatSync(file);check(s.isFile()&&!s.isSymbolicLink()&&s.uid===1000&&s.nlink===1&&(s.mode&0o777)===0o600&&s.size<2*1024*1024,'FISCAL_ESTADO_PRIVADO_INVALIDO');
  return JSON.parse(fs.readFileSync(file,'utf8'));
}
function writeState(file,value){
  readState(file);const temp=file+'.tmp.'+process.pid,fd=fs.openSync(temp,'wx',0o600);
  try{fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  fs.renameSync(temp,file);
}
function safeEnv(app){
  const env=effectiveEnv({pid:app.pid});R.validateFlags(env);
  return env;
}
function preflightEnvironment(env){
  const code=`const fs=require('node:fs');const stored=require('dotenv').parse(fs.readFileSync('.env'));
  for(const e of[stored,process.env]){for(const k of['NSDOCS_V2_ENABLED','NSDOCS_V2_FIXTURES_ENABLED'])if(e[k]!==undefined&&e[k]!==''&&e[k]!=='false')process.exit(70);
  if(/^(true|1|yes|on)$/i.test(String(e.ALLOW_SCHEMA_MIGRATIONS||'').trim())||e.NODE_TLS_REJECT_UNAUTHORIZED==='0')process.exit(71);}
  const {env,validateRequiredEnv}=require('./src/config/env');validateRequiredEnv();
  if(env.deploymentEnvironment!=='development'||Number(env.port)!==8001||env.dbHost!=='fluxy-staging.cn820k66sdx7.us-east-2.rds.amazonaws.com'||env.dbName!=='gestao_solicitacoes')process.exit(72);`;
  run(NODE,['-e',code],{cwd:BACKEND,env});
}
function doctor(mode,env){
  let output;
  try{output=run(NODE,['scripts/fiscalVinculosDevSchema.js',mode],{cwd:BACKEND,env});}
  catch(error){throw Error(/^(?:FISCAL|NSDOCS)_[A-Z0-9_]{1,100}$/.test(error.message||'')?error.message:'FISCAL_CONFERENCIA_OU_MIGRATION_DEV_FALHOU');}
  let result;try{result=JSON.parse(output.split(/\r?\n/).at(-1));}catch{throw Error('FISCAL_DIAGNOSTICO_SCHEMA_INVALIDO');}
  check(result.outcome==='FISCAL_VINCULOS_SCHEMA_DEV'&&result.chamadas_externas===0,'FISCAL_DIAGNOSTICO_SCHEMA_INVALIDO');return result;
}
function qa(){
  const scripts=[['validarVinculosNfePedidos.js'],['validarTitulosPorPedido.js'],['validarPedidoBoletoOpcional.js'],['validarSobreposicaoTitulos.js'],
    ['validarCompraEtapasResumoPedido.js'],['validarPedidoCompraFinanceiroGeo.js'],['validarFiscalDfeProcessor.js'],['validarFilaEstornoPermissao.js'],
    ['auditarPermissoesGranulares.js','--check'],['validarFiscalVinculosDevSchema.js']];
  for(const[name,...args]of scripts){
    const guard=`for(const[n,ms]of[['node:http',['get','request']],['node:https',['get','request']],['node:net',['connect','createConnection']],['node:tls',['connect']]])for(const m of ms)require(n)[m]=()=>{throw Error('REDE_PROIBIDA_QA')};
    const file=process.argv[1];process.argv=[process.execPath,file,...process.argv.slice(2)];require(file);`;
    run(NODE,['-e',guard,path.join(BACKEND,'scripts',name),...args],{cwd:BACKEND});console.log('QA aprovado: '+name);
  }
  run(NODE,['--test',path.join(ROOT,'ops/deploy/atualizar-dev-fiscal-vinculos-20261024.test.cjs')]);
  console.log('QA aprovado: operador de deploy DEV');
}
async function finish(state,io){
  if(state.phase==='prepared'){
    io.assert(state.before,await io.snapshot(),false);
    const schema=await io.migrate();check(schema.applied&&schema.structure_ok,'FISCAL_SCHEMA_NAO_PRONTO');
    state={...state,phase:'schema_ready'};io.save(state);
  }
  if(state.phase==='schema_ready'){
    io.assert(state.before,await io.snapshot(),false);
    state={...state,phase:'restarting'};io.save(state);await io.restart();
  }
  const after=await io.ready(state.before);io.assert(state.before,after,true);
  state={...state,phase:'done',after};io.save(state);return state;
}
async function main(mode,version){
  check(process.platform==='linux'&&process.getuid()===1000&&['--backend','--conferir'].includes(mode)&&/^[0-9a-f]{40}$/.test(version||''),'FISCAL_EXIGE_UBUNTU_MODO_E_SHA');
  check(fs.realpathSync(process.cwd())===ROOT&&git(['rev-parse','--show-toplevel'])===ROOT&&git(['branch','--show-current'])==='refactor/frontend','FISCAL_CHECKOUT_DEV_DIVERGENTE');
  check(!git(['status','--porcelain','--untracked-files=no']),'FISCAL_DEV_TRACKED_ALTERADO');
  check([BASE,version].includes(git(['rev-parse','HEAD'])),'FISCAL_HEAD_DEV_FORA_DA_ETAPA');
  git(['fetch','origin','refactor/frontend']);git(['merge-base','--is-ancestor',version,'origin/refactor/frontend']);
  check(git(['rev-parse',version+'^'])===BASE,'FISCAL_BASE_DEV_DIVERGENTE');
  validateInventory(git(['diff','--name-status',BASE,version]).split(/\r?\n/).filter(Boolean));
  validatePackage(JSON.parse(git(['show',BASE+':backend/package.json'])),JSON.parse(git(['show',version+':backend/package.json'])));
  check(!git(['diff',BASE,version,'--','frontend','backend/package-lock.json','package.json','package-lock.json']),'FISCAL_FRONTEND_OU_LOCK_ALTERADO_NA_ETAPA_BACKEND');
  privateDirectory();const lock=PRIVATE+'/.operacao.lock';
  try{fs.mkdirSync(lock,{mode:0o700});}catch{throw Error('FISCAL_OPERACAO_JA_EM_ANDAMENTO');}
  try{
    const stateFile=PRIVATE+'/backend.json';let state=readState(stateFile);
    if(state)check(state.version===version&&['prepared','schema_ready','restarting','done'].includes(state.phase),'FISCAL_ESTADO_DE_OUTRA_OPERACAO');
    const current=snapshot();
    if(mode==='--conferir'){
      check(state?.phase==='done'&&git(['rev-parse','HEAD'])===version,'FISCAL_ETAPA_BACKEND_AINDA_NAO_CONCLUIDA');
      assertTransition(state.before,current,true);check(await health(8000)&&await health(8001),'FISCAL_HEALTH_FALHOU');
      const schema=doctor('--conferir',safeEnv(current.apps.find(p=>p.name==='backend-dev')));check(schema.applied&&schema.structure_ok,'FISCAL_SCHEMA_NAO_PRONTO');
    }else{
      check(process.env.CONFIRM_DEV_BACKUP==='SIM'&&process.env.CONFIRM_FISCAL_VINCULOS_DEV_SCHEMA==='SIM','FISCAL_EXIGE_BACKUP_DEV_E_CONFIRMACAO');
      if(!state){state={version,phase:'prepared',before:current};writeState(stateFile,state);}
      if(state.phase==='prepared'||state.phase==='schema_ready')assertTransition(state.before,current,false);else assertTransition(state.before,current,true);
      check(await health(8000)&&await health(8001),'FISCAL_HEALTH_INICIAL_FALHOU');
      const env=safeEnv(current.apps.find(p=>p.name==='backend-dev'));preflightEnvironment(env);
      git(['merge','--ff-only',version]);qa();
      state=await finish(state,{
        assert:assertTransition,snapshot,save:s=>writeState(stateFile,s),
        migrate:()=>doctor('--aplicar',{...env,CONFIRM_DEV_BACKUP:'SIM',CONFIRM_FISCAL_VINCULOS_DEV_SCHEMA:'SIM'}),
        restart:()=>{console.log('Reiniciando SOMENTE backend-dev com Node isolado e ambiente preservado.');run(PM2_NODE,[PM2_CLI,'restart','backend-dev']);},
        ready:async before=>{
          const until=Date.now()+45000;
          while(Date.now()<until){
            const live=list();
            for(const old of before.apps.filter(p=>p.name!=='backend-dev'))check(live.some(p=>p.name===old.name&&p.pid===old.pid&&p.pm2_env?.status==='online'),'FISCAL_PROCESSO_PROTEGIDO_MUDOU');
            if(live.find(p=>p.name==='backend-dev')?.pm2_env?.status==='online'){
              const next=snapshot();assertTransition(before,next,true);
              if(await health(8001)&&await health(8000))return next;
            }
            await new Promise(resolve=>setTimeout(resolve,500));
          }throw Error('FISCAL_BACKEND_DEV_NAO_FICOU_SAUDAVEL');
        }
      });
      const schema=doctor('--conferir',safeEnv(state.after.apps.find(p=>p.name==='backend-dev')));check(schema.applied&&schema.structure_ok,'FISCAL_SCHEMA_FINAL_DIVERGENTE');
    }
    console.log(JSON.stringify({etapa:'FISCAL_VINCULOS_BACKEND_DEV_PRONTO',commit:version,migration:'202610240002_fiscal_vinculos_pedidos.js',
      node_dev:NODE,producao_experience_daemon_e_dumps_preservados:true,frontend_novo_publicado:false,automatico_nsdocs_desligado:true}));
    console.log('Envie esta saida antes de liberar o frontend. Sem npm install, PM2 save/update/resurrect/update-env ou troca de Node.');
  }finally{fs.rmdirSync(lock);}
}
module.exports={BASE,CHANGESET,QA,validateInventory,validatePackage,assertTransition,finish,main,processEnvironmentForComparison:R.processEnvironmentForComparison};
if(require.main===module||process.argv[1]==='-')main(process.argv[2],process.argv[3]).catch(error=>{
  console.error(/^FISCAL_[A-Z0-9_]{1,100}$/.test(error.message||'')?error.message:'FISCAL_ATUALIZACAO_DEV_INTERROMPIDA');
  console.error('Nao contorne protecoes. Envie a saida sem segredos. Nao publique o frontend ainda.');process.exitCode=1;
});
