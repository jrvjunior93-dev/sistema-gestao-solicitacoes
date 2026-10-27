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
    const safe = String(result.stderr || '').split(/\r?\n/).find(line => /^(?:REORG|FISCAL|NSDOCS)_[A-Z0-9_]{1,95}$/.test(line));
    if (safe) throw Error(safe);
  }
  check(!result.error && result.status === 0,
    `COMANDO_FALHOU_${path.basename(bin).toUpperCase().replace(/[^A-Z0-9]/g, '_')}_${result.status ?? 'SEM_SAIDA'}`);
  return Buffer.isBuffer(result.stdout) ? result.stdout : result.stdout.trim();
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

function assertTransition(before,after,restarted){
 check(isDeepStrictEqual(before.infrastructure,after.infrastructure),'CARTAO_REPETIDO_DEV_DAEMON_DUMPS_SYSTEMD_MUDOU');
 const next=after.apps.find(p=>p.name==='backend-dev');
 const expected=before.apps.map(p=>p.name==='backend-dev'&&restarted?{...p,pid:next?.pid,uptime:next?.uptime,restarts:p.restarts+1}:p);
 check(isDeepStrictEqual(expected,after.apps),'CARTAO_REPETIDO_DEV_PROCESSO_NODE_AMBIENTE_MUDOU');
 if(restarted)check(next.pid!==before.apps.find(p=>p.name==='backend-dev').pid,'CARTAO_REPETIDO_DEV_RESTART_NAO_CONFERIDO');
}
function snapshot(){
 const apps=snapshotProcesses(list()),daemon=Number(fs.readFileSync('/home/ubuntu/.pm2/pm2.pid','utf8').trim());
 const dumps=['dump.pm2','dump.pm2.bak'].map(name=>{
   const file='/home/ubuntu/.pm2/'+name,s=fs.lstatSync(file);
   check(s.isFile()&&!s.isSymbolicLink()&&s.uid===1000&&(s.mode&0o777)===0o600,'CARTAO_REPETIDO_DEV_DUMP_PRIVADO_DIVERGENTE');
   return{name,sha:fileHash(file),mode:s.mode&0o777};
 });
 const unit=hash(run('/usr/bin/systemctl',['--system','show','pm2-ubuntu.service','--property=FragmentPath,DropInPaths,Environment,ExecStart,ExecStop,ExecReload,UnitFileState,MainPID','--no-pager']));
 return{apps,infrastructure:{daemon,daemonExecutable:fs.readlinkSync(`/proc/${daemon}/exe`),dumps,unit}};
}
function privateDirectory(){
 const parent=fs.lstatSync('/home/ubuntu/.config');check(parent.isDirectory()&&!parent.isSymbolicLink()&&parent.uid===1000,'CARTAO_REPETIDO_DEV_CONFIG_PRIVADA_INVALIDA');
 if(!fs.existsSync(PRIVATE))fs.mkdirSync(PRIVATE,{mode:0o700});
 const s=fs.lstatSync(PRIVATE);check(s.isDirectory()&&!s.isSymbolicLink()&&s.uid===1000&&(s.mode&0o777)===0o700,'CARTAO_REPETIDO_DEV_DIRETORIO_PRIVADO_INVALIDO');
}
function readState(file){
 if(!fs.existsSync(file))return null;
 const s=fs.lstatSync(file);check(s.isFile()&&!s.isSymbolicLink()&&s.uid===1000&&s.nlink===1&&(s.mode&0o777)===0o600&&s.size<2*1024*1024,'CARTAO_REPETIDO_DEV_ESTADO_PRIVADO_INVALIDO');
 return JSON.parse(fs.readFileSync(file,'utf8'));
}
function writeState(file,value){
 readState(file);const tmp=file+'.tmp.'+process.pid,fd=fs.openSync(tmp,'wx',0o600);
 try{fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);
}
function preflightEnvironment(env){
 const code=`const fs=require('node:fs');const stored=require('dotenv').parse(fs.readFileSync('.env'));
 for(const e of[stored,process.env]){for(const k of['NSDOCS_V2_ENABLED','NSDOCS_V2_FIXTURES_ENABLED'])if(e[k]!==undefined&&e[k]!==''&&e[k]!=='false')process.exit(70);
 if(/^(true|1|yes|on)$/i.test(String(e.ALLOW_SCHEMA_MIGRATIONS||'').trim())||e.NODE_TLS_REJECT_UNAUTHORIZED==='0')process.exit(71);}
 const {env,validateRequiredEnv}=require('./src/config/env');validateRequiredEnv();
 if(env.deploymentEnvironment!=='development'||Number(env.port)!==8001||env.dbHost!=='fluxy-staging.cn820k66sdx7.us-east-2.rds.amazonaws.com'||env.dbName!=='gestao_solicitacoes')process.exit(72);
 const s=require('./src/modules/fiscal/services/fiscalS3Service').getFiscalS3Config();
 if(s.bucket!=='fluxy-fiscal-dev'||s.region!=='us-east-2'||!/^dev(?:\\/|$)/.test(s.prefix))process.exit(73);`;
 run(NODE,['-e',code],{cwd:BACKEND,env});
}

const BASE='b620379f605620603faf4e5f2bc04be11296bb0f',PREVIOUS_BACKEND='6618f6ca7a613331535f46c946608265c4a9b3ef';
const PRIVATE='/home/ubuntu/.config/fluxy-cartao-repetido-dev-20261027';
const SELF='ops/deploy/atualizar-dev-cartao-repetido-20261027.cjs';
const TEST=SELF.replace('.cjs','.test.cjs');
const MANIFEST='ops/deploy/cartao-repetido-dev-20261027.manifest.json';
const PATHS=['backend/package.json','backend/scripts/validarFilaCartaoRepetido.js',
 'backend/src/services/pagamentoFilaLiquidacaoService.js',
 'docs/handoffs/2026-10-27-cartao-repetido-dev.md',
 'ops/deploy/README-cartao-repetido-dev-20261027.md',SELF,TEST];
const DEPLOY=['backend/package.json','backend/scripts/validarFilaCartaoRepetido.js',
 'backend/src/services/pagamentoFilaLiquidacaoService.js',SELF,TEST,MANIFEST];
function validateStartingHead(head,version){
 check([BASE,PREVIOUS_BACKEND,version].includes(head),'CARTAO_REPETIDO_DEV_HEAD_NAO_REVISADO');
}
function validateInventory(m,paths,read){
 check(m.base===BASE&&m.previous_backend===PREVIOUS_BACKEND&&Array.isArray(m.files),'CARTAO_REPETIDO_DEV_MANIFESTO_INVALIDO');
 check(isDeepStrictEqual([...paths].sort(),[...PATHS,MANIFEST].sort())&&
  isDeepStrictEqual(m.files.map(f=>f.path).sort(),[...PATHS].sort()),'CARTAO_REPETIDO_DEV_INVENTARIO_DIVERGENTE');
 for(const f of m.files)check(/^[a-f0-9]{64}$/.test(f.sha256)&&hash(read(f.path))===f.sha256,'CARTAO_REPETIDO_DEV_HASH_DIVERGENTE');
}
function verifyVersion(version){
 check(git(['rev-parse',version+'^'])===BASE,'CARTAO_REPETIDO_DEV_BASE_DIVERGENTE');
 const read=p=>run('/usr/bin/git',['show',version+':'+p],{encoding:null});
 const m=JSON.parse(read(MANIFEST));
 validateInventory(m,git(['diff','--name-only',BASE,version]).split(/\r?\n/).filter(Boolean),read);
 const before=JSON.parse(run('/usr/bin/git',['show',BASE+':backend/package.json']));
 const after=JSON.parse(read('backend/package.json'));
 check(after.scripts['test:cartao-parcelamento-baixa']==='node scripts/validarCartaoParcelamentoBaixa.js && node scripts/validarFilaCartaoRepetido.js','CARTAO_REPETIDO_DEV_SCRIPT_QA_DIVERGENTE');
 delete before.scripts['test:cartao-parcelamento-baixa'];delete after.scripts['test:cartao-parcelamento-baixa'];
 check(isDeepStrictEqual(before,after),'CARTAO_REPETIDO_DEV_DEPENDENCIAS_DIVERGENTES');
 // O hash anterior vem do objeto Git revisado, nunca de um valor livre do manifesto.
 for(const f of m.files){
  const exists=git(['ls-tree','--name-only',BASE,'--',f.path])===f.path;
  const old=exists?hash(run('/usr/bin/git',['show',BASE+':'+f.path],{encoding:null})):null;
  check(f.previous_sha256===old,'CARTAO_REPETIDO_DEV_BASE_ARQUIVO_DIVERGENTE');
 }
 return{manifest:m,read};
}
function safeFile(relative){
 check(DEPLOY.includes(relative),'CARTAO_REPETIDO_DEV_CAMINHO_NAO_PERMITIDO');
 const file=path.join(ROOT,relative);let dir=path.dirname(file);
 while(dir!==ROOT){const s=fs.lstatSync(dir);check(s.isDirectory()&&!s.isSymbolicLink(),'CARTAO_REPETIDO_DEV_DIRETORIO_DIVERGENTE');dir=path.dirname(dir);}
 let s;try{s=fs.lstatSync(file);}catch(error){if(error.code!=='ENOENT')throw error;}
 if(s)check(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&s.uid===1000,'CARTAO_REPETIDO_DEV_ARQUIVO_DIVERGENTE');
 return file;
}
function validateFiles(m,read,finished=false){
 check(!git(['diff','--cached','--name-only']),'CARTAO_REPETIDO_DEV_INDEX_ALTERADO');
 for(const changed of git(['diff','--name-only']).split(/\r?\n/).filter(Boolean))check(DEPLOY.includes(changed),'CARTAO_REPETIDO_DEV_OUTRO_ARQUIVO_ALTERADO');
 for(const relative of DEPLOY){
  const file=safeFile(relative),actual=fs.existsSync(file)?fileHash(file):null;
  const target=hash(read(relative)),previous=m.files.find(f=>f.path===relative)?.previous_sha256??null;
  check(actual===target||!finished&&actual===previous,'CARTAO_REPETIDO_DEV_CONTEUDO_LOCAL_DIVERGENTE');
 }
}
function backupFiles(){
 return DEPLOY.map((relative,index)=>{
  const file=safeFile(relative),exists=fs.existsSync(file),backup=PRIVATE+'/arquivo-'+index+'.bak';
  const original={path:relative,existed:exists};
  if(exists){const s=fs.statSync(file);original.sha256=fileHash(file);original.mode=s.mode&0o777;
   const fd=fs.openSync(backup,'wx',0o600);try{fs.writeFileSync(fd,fs.readFileSync(file));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
  return original;
 });
}
function installFiles(read,originals){
 for(const relative of DEPLOY){
  const file=safeFile(relative),data=read(relative);if(fs.existsSync(file)&&fileHash(file)===hash(data))continue;
  const temp=file+'.cartao-repetido-'+process.pid;
  const fd=fs.openSync(temp,'wx',originals.find(f=>f.path===relative)?.mode||0o644);
  try{fs.writeFileSync(fd,data);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  fs.renameSync(temp,file);
 }
}
function qa(){
 const scripts=['validarCartaoParcelamentoBaixa.js','validarFilaCartaoRepetido.js','validarFilaLiquidacaoRateada.js',
  'validarFilaBaixaComposta.js','validarCarteiraChequesBaixaComposta.js','validarFilaInstrumentos.js'];
 for(const name of scripts){run(NODE,['--require','./scripts/helpers/semRedeQa.js','scripts/'+name],
  {cwd:BACKEND,env:R.cleanEnv(),timeout:120000});console.log('QA aprovado: '+name);}
 run(NODE,['--test',path.join(ROOT,TEST)],{env:R.cleanEnv(),timeout:120000});console.log('QA aprovado: aplicador DEV');
}
async function finish(s,io){
 if(s.phase==='prepared'){
  io.assert(s.before,io.snapshot(),false);await io.install();await io.qa();
  io.assert(s.before,io.snapshot(),false);s={...s,phase:'files_ready'};io.save(s);
 }
 if(s.phase==='files_ready'){
  io.assert(s.before,io.snapshot(),false);s={...s,phase:'restarting'};io.save(s);await io.restart();
 }
 // Retomada de restarting verifica a transicao; nunca dispara outro restart.
 const after=await io.ready(s.before);io.assert(s.before,after,true);
 s={...s,phase:'done',after};io.save(s);return s;
}
async function ready(before){
 const until=Date.now()+45000;let consecutive=0;
 while(Date.now()<until){
  const ps=list();for(const peer of before.apps.filter(p=>p.name!=='backend-dev'))
   check(ps.some(p=>p.name===peer.name&&p.pid===peer.pid&&p.pm2_env?.status==='online'),'CARTAO_REPETIDO_DEV_PAR_MUDOU');
  if(ps.find(p=>p.name==='backend-dev')?.pm2_env?.status==='online'){
   const after=snapshot();assertTransition(before,after,true);
   if(await health(8000)&&await health(8001)){if(++consecutive>=3)return after;}else consecutive=0;
  }await new Promise(resolve=>setTimeout(resolve,1000));
 }throw Error('CARTAO_REPETIDO_DEV_HEALTH_NAO_ESTABILIZOU');
}
async function main(mode,version){
 check(process.platform==='linux'&&process.arch==='x64'&&process.getuid()===1000&&process.version==='v24.22.1'
  &&fs.realpathSync(process.execPath)===NODE&&!process.env.NODE_OPTIONS&&['--backend','--conferir'].includes(mode)
  &&/^[a-f0-9]{40}$/.test(version||''),'CARTAO_REPETIDO_DEV_RUNTIME_ARGUMENTOS_INVALIDOS');
 check(fs.realpathSync(process.cwd())===ROOT&&git(['rev-parse','--show-toplevel'])===ROOT&&
  git(['branch','--show-current'])==='refactor/frontend','CARTAO_REPETIDO_DEV_CHECKOUT_DIVERGENTE');
 if(mode==='--backend')check(process.env.CONFIRM_DEV_BACKUP==='SIM'&&process.env.CONFIRM_CARTAO_REPETIDO_DEV==='SIM','CARTAO_REPETIDO_DEV_CONFIRMACAO_OBRIGATORIA');
 if(mode==='--backend')git(['fetch','origin','refactor/frontend']);
 git(['merge-base','--is-ancestor',version,'origin/refactor/frontend']);
 const head=git(['rev-parse','HEAD']);validateStartingHead(head,version);
 const {manifest,read}=verifyVersion(version);
 privateDirectory();const lock=PRIVATE+'/.operacao.lock';try{fs.mkdirSync(lock,{mode:0o700});}catch{throw Error('CARTAO_REPETIDO_DEV_OPERACAO_OCUPADA');}
 try{
  const file=PRIVATE+'/backend.json';let s=readState(file);
  if(s)check(s.version===version&&s.starting_head===head&&['prepared','files_ready','restarting','done'].includes(s.phase),'CARTAO_REPETIDO_DEV_ESTADO_DIVERGENTE');
  const current=snapshot(),env=effectiveEnv({pid:current.apps.find(p=>p.name==='backend-dev').pid});
  R.validateFlags(env);preflightEnvironment(env);check(await health(8000)&&await health(8001),'CARTAO_REPETIDO_DEV_HEALTH_INICIAL_FALHOU');
  validateFiles(manifest,read,Boolean(s&&s.phase!=='prepared'));
  if(mode==='--conferir'){
   check(s?.phase==='done','CARTAO_REPETIDO_DEV_BACKEND_NAO_CONCLUIDO');assertTransition(s.before,current,true);
  }else{
   if(!s){s={version,starting_head:head,phase:'prepared',before:current,originals:backupFiles()};writeState(file,s);}
   assertTransition(s.before,current,['restarting','done'].includes(s.phase));
   if(s.phase!=='done')s=await finish(s,{assert:assertTransition,snapshot,save:value=>writeState(file,value),
    install:()=>installFiles(read,s.originals),qa,
    restart:()=>{console.log('Reiniciando SOMENTE backend-dev, com Node isolado e ambiente preservado.');run(PM2_NODE,[PM2_CLI,'restart','backend-dev']);},ready});
  }
  validateFiles(manifest,read,true);check(git(['rev-parse','HEAD'])===head,'CARTAO_REPETIDO_DEV_HEAD_MUDOU');
  console.log(JSON.stringify({outcome:'CARTAO_REPETIDO_BACKEND_DEV_PRONTO',commit:version,node_dev:NODE,
   runtime_files:1,git_head_preservado:true,producao_experience_daemon_nodes_env_dumps_preservados:true,
   migrations:0,financial_data_writes:0,external_integrations:0,automatico_nsdocs_desligado:true,frontend_liberado:false}));
  console.log('Envie esta saida antes de publicar o frontend. Sem install, migrations gerais ou PM2 save/update/resurrect/update-env.');
 }finally{fs.rmdirSync(lock);}
}
module.exports={BASE,PREVIOUS_BACKEND,PATHS,DEPLOY,SELF,TEST,MANIFEST,validateStartingHead,validateInventory,assertTransition,finish,main};
if(require.main===module||process.argv[1]==='-')main(process.argv[2],process.argv[3]).catch(error=>{
 console.error(/^(?:CARTAO_REPETIDO_DEV|CONSULTAS|FISCAL|NSDOCS|COMANDO)_[A-Z0-9_]{1,110}$/.test(error.message||'')?error.message:'CARTAO_REPETIDO_DEV_INTERROMPIDO_SEM_SEGREDOS');
 console.error('Preserve estado e locks; nao force Git nem publique frontend. Envie somente esta saida.');process.exitCode=1;
});
