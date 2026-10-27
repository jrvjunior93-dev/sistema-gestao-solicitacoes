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
const BASE='f05705e3ffdd5e4998328c062049f4934f44c188',PREVIOUS_BACKEND='a78a5b1b0660366f030b1cb320907d199d1dcec6';
const PRIVATE='/home/ubuntu/.config/fluxy-autorizacao-valor-dev-20261026';
const MANIFEST='ops/deploy/autorizacao-valor-dev-20261026.manifest.json';
const PATHS=[
 "backend/scripts/validarAutorizacaoSelecao.js",
 "backend/scripts/validarCartaoOpcionalSolicitacao.js",
 "backend/scripts/validarFilaBaixaComposta.js",
 "backend/scripts/validarFilaBaixaEstorno.js",
 "backend/scripts/validarFilaComprovantePendente.js",
 "backend/scripts/validarFilaJurosMulta.js",
 "backend/scripts/validarFilaPaginacao.js",
 "backend/scripts/validarPainelAutorizacoesSqlLocal.js",
 "backend/src/models/PagamentoAutorizacaoItem.js",
 "backend/src/models/PagamentoManualFilaItem.js",
 "backend/src/services/filaBaixaCompostaService.js",
 "backend/src/services/pagamentoAutorizacaoConsultaService.js",
 "backend/src/services/pagamentoAutorizacaoSelecaoService.js",
 "backend/src/services/pagamentoAutorizacaoService.js",
 "backend/src/services/pagamentoFilaSaldoService.js",
 "backend/src/services/pagamentoManualFilaService.js",
 "backend/migrations/202610260001_pagamento_autorizacao_valor.js",
 "backend/scripts/autorizacaoValorDevSchema.js",
 "backend/scripts/validarAutorizacaoValorDevSchema.js",
 "backend/scripts/validarAutorizacaoValorParcial.js",
 "backend/scripts/validarAutorizacaoValorSchema.js",
 "backend/scripts/validarFilaValorParcial.js",
 "backend/src/services/pagamentoAutorizacaoValorDomain.js",
 "ops/deploy/atualizar-dev-autorizacao-valor-20261026.cjs",
 "ops/deploy/atualizar-dev-autorizacao-valor-20261026.test.cjs",
 "ops/deploy/README-autorizacao-valor-dev-20261026.md",
 "docs/handoffs/2026-10-26-autorizacao-valor-parcial.md",
 "docs/workspace/OWNERSHIP_ATIVO.md"
];
const BACKLOG_HASH='b397cccd0433da8762069767791767b593eb7424eb0858d9630d43dd28196efa';
function assertTransition(before,after,restarted){
 check(isDeepStrictEqual(before.infrastructure,after.infrastructure),'CONSULTAS_DAEMON_DUMPS_SYSTEMD_MUDOU');
 const next=after.apps.find(p=>p.name==='backend-dev');
 const expected=before.apps.map(p=>p.name==='backend-dev'&&restarted?{...p,pid:next?.pid,uptime:next?.uptime,restarts:p.restarts+1}:p);
 check(isDeepStrictEqual(expected,after.apps),'CONSULTAS_PROCESSO_NODE_AMBIENTE_MUDOU');
 if(restarted)check(next.pid!==before.apps.find(p=>p.name==='backend-dev').pid,'CONSULTAS_RESTART_NAO_CONFERIDO');
}
function snapshot(){
 const apps=snapshotProcesses(list()),daemon=Number(fs.readFileSync('/home/ubuntu/.pm2/pm2.pid','utf8').trim());
 const dumps=['dump.pm2','dump.pm2.bak'].map(name=>{
   const file='/home/ubuntu/.pm2/'+name,s=fs.lstatSync(file);
   check(s.isFile()&&!s.isSymbolicLink()&&s.uid===1000&&(s.mode&0o777)===0o600,'CONSULTAS_DUMP_PRIVADO_DIVERGENTE');
   return{name,sha:fileHash(file),mode:s.mode&0o777};
 });
 const unit=hash(run('/usr/bin/systemctl',['--system','show','pm2-ubuntu.service','--property=FragmentPath,DropInPaths,Environment,ExecStart,ExecStop,ExecReload,UnitFileState,MainPID','--no-pager']));
 return{apps,infrastructure:{daemon,daemonExecutable:fs.readlinkSync(`/proc/${daemon}/exe`),dumps,unit}};
}
function privateDirectory(){
 const parent=fs.lstatSync('/home/ubuntu/.config');check(parent.isDirectory()&&!parent.isSymbolicLink()&&parent.uid===1000,'CONSULTAS_CONFIG_PRIVADA_INVALIDA');
 if(!fs.existsSync(PRIVATE))fs.mkdirSync(PRIVATE,{mode:0o700});
 const s=fs.lstatSync(PRIVATE);check(s.isDirectory()&&!s.isSymbolicLink()&&s.uid===1000&&(s.mode&0o777)===0o700,'CONSULTAS_DIRETORIO_PRIVADO_INVALIDO');
}
function readState(file){
 if(!fs.existsSync(file))return null;
 const s=fs.lstatSync(file);check(s.isFile()&&!s.isSymbolicLink()&&s.uid===1000&&s.nlink===1&&(s.mode&0o777)===0o600&&s.size<2*1024*1024,'CONSULTAS_ESTADO_PRIVADO_INVALIDO');
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
function validateInventory(m,paths,read){
 check(m.base===BASE&&m.previous_backend===PREVIOUS_BACKEND&&Array.isArray(m.files),'VALOR_DEV_MANIFESTO_INVALIDO');
 check(isDeepStrictEqual([...paths].sort(),[...PATHS,MANIFEST].sort())&&isDeepStrictEqual(m.files.map(f=>f.path).sort(),[...PATHS].sort()),'VALOR_DEV_INVENTARIO_DIVERGENTE');
 for(const f of m.files)check(/^[a-f0-9]{64}$/.test(f.sha256)&&hash(read(f.path))===f.sha256,'VALOR_DEV_HASH_DIVERGENTE');
}
function verifyVersion(version){
 check(git(['rev-parse',version+'^'])===BASE,'VALOR_DEV_BASE_DIVERGENTE');
 const read=p=>run('/usr/bin/git',['show',version+':'+p],{encoding:null});
 const m=JSON.parse(read(MANIFEST));
 validateInventory(m,git(['diff','--name-only',BASE,version]).split(/\r?\n/).filter(Boolean),read);
 check(!git(['diff',BASE,version,'--','frontend','backend/package.json','backend/package-lock.json','package.json','package-lock.json']),'VALOR_DEV_FRONTEND_OU_DEPENDENCIAS_NA_ETAPA_BACKEND');
 return m;
}
function validateStartingHead(head,version,diff=''){
 check([BASE,PREVIOUS_BACKEND,version].includes(head),'VALOR_DEV_HEAD_FORA_DA_BASE');
 if(head===PREVIOUS_BACKEND)check(hash(diff)===BACKLOG_HASH,'VALOR_DEV_BACKLOG_DIVERGENTE');
}
function doctor(mode,env){
 const out=run(NODE,['scripts/autorizacaoValorDevSchema.js',mode],{cwd:BACKEND,env});
 let r;try{r=JSON.parse(out.split(/\r?\n/).at(-1));}catch{throw Error('VALOR_DEV_DIAGNOSTICO_INVALIDO');}
 check(r.outcome==='AUTORIZACAO_VALOR_SCHEMA_DEV'&&r.external_calls===0&&r.financial_data_writes===0,'VALOR_DEV_DIAGNOSTICO_INVALIDO');
 if(mode==='--aplicar')check(r.applied&&r.structure_ok&&!r.pending.length,'VALOR_DEV_SCHEMA_NAO_PRONTO');
 return r;
}
function qa(){
 const scripts=['validarAnaliseProprietario.js','validarAutorizacaoValorSchema.js','validarAutorizacaoValorDevSchema.js',
  'validarFilaBaixaEstorno.js','validarFilaBaixaComposta.js','validarFilaJurosMulta.js','validarFilaLiquidacaoRateada.js',
  'validarPainelAutorizacoes.js','validarPainelAutorizacoesSqlLocal.js','validarFilaEstornoPermissao.js','validarFilaPaginacao.js',
  'validarVinculosNfePedidos.js','validarFiscalDocumentosPaginacao.js','validarNsdocsV2.js','validarNsdocsEmitenteCpf.js'];
 const guard=`for(const[n,ms]of[['node:http',['get','request']],['node:https',['get','request']],['node:net',['connect','createConnection']],['node:tls',['connect']]])for(const m of ms)require(n)[m]=()=>{throw Error('REDE_PROIBIDA_QA')};const file=process.argv[1];process.argv=[process.execPath,file,...process.argv.slice(2)];require(file);`;
 for(const name of scripts){run(NODE,['-e',guard,path.join(BACKEND,'scripts',name)],{cwd:BACKEND,env:R.cleanEnv(),timeout:120000});console.log('QA aprovado: '+name);}
 run(NODE,['--test',path.join(ROOT,'ops/deploy/atualizar-dev-autorizacao-valor-20261026.test.cjs')]);
 console.log('QA aprovado: aplicador DEV');
}
async function finish(s,io){
 if(s.phase==='prepared'){
  io.assert(s.before,io.snapshot(),false);await io.migrate();
  s={...s,phase:'schema_ready'};io.save(s);
 }
 if(s.phase==='schema_ready'){
  io.assert(s.before,io.snapshot(),false);s={...s,phase:'restarting'};io.save(s);await io.restart();
 }
 const after=await io.ready(s.before);io.assert(s.before,after,true);s={...s,phase:'done',after};io.save(s);return s;
}
async function main(mode,version){
 check(process.platform==='linux'&&process.arch==='x64'&&process.getuid()===1000&&process.version==='v24.22.1'
  &&fs.realpathSync(process.execPath)===NODE&&!process.env.NODE_OPTIONS&&['--backend','--conferir'].includes(mode)&&/^[a-f0-9]{40}$/.test(version||''),'VALOR_DEV_RUNTIME_ARGUMENTOS_INVALIDOS');
 check(fs.realpathSync(process.cwd())===ROOT&&git(['rev-parse','--show-toplevel'])===ROOT&&git(['branch','--show-current'])==='refactor/frontend','VALOR_DEV_CHECKOUT_DIVERGENTE');
 check(!git(['status','--porcelain','--untracked-files=no']),'VALOR_DEV_TRACKED_ALTERADO');
 git(['fetch','origin','refactor/frontend']);git(['merge-base','--is-ancestor',version,'origin/refactor/frontend']);
 const head=git(['rev-parse','HEAD']);validateStartingHead(head,version,head===PREVIOUS_BACKEND?git(['rev-parse',PREVIOUS_BACKEND+':backend',BASE+':backend']):'');
 verifyVersion(version);
 privateDirectory();const lock=PRIVATE+'/.operacao.lock';try{fs.mkdirSync(lock,{mode:0o700});}catch{throw Error('VALOR_DEV_OPERACAO_OCUPADA');}
 try{
  const stateFile=PRIVATE+'/backend.json';let s=readState(stateFile);
  if(s)check(s.version===version&&['prepared','schema_ready','restarting','done'].includes(s.phase),'VALOR_DEV_ESTADO_DIVERGENTE');
  const current=snapshot(),env=effectiveEnv({pid:current.apps.find(a=>a.name==='backend-dev').pid});
  R.validateFlags(env);preflightEnvironment(env);check(await health(8000)&&await health(8001),'VALOR_DEV_HEALTH_INICIAL_FALHOU');
  if(mode==='--conferir'){
   check(s?.phase==='done'&&head===version,'VALOR_DEV_BACKEND_AINDA_NAO_CONCLUIDO');
   assertTransition(s.before,current,true);const r=doctor('--conferir',env);
   check(r.applied&&r.structure_ok&&!r.pending.length,'VALOR_DEV_SCHEMA_NAO_PRONTO');
  }else{
   check(process.env.CONFIRM_DEV_BACKUP==='SIM'&&process.env.CONFIRM_AUTORIZACAO_VALOR_DEV_SCHEMA==='SIM','VALOR_DEV_CONFIRME_BACKUP_E_SCHEMA');
   if(!s){s={version,phase:'prepared',before:current,starting_head:head};writeState(stateFile,s);}
   assertTransition(s.before,current,['restarting','done'].includes(s.phase));
   git(['merge','--ff-only',version]);qa();
   s=await finish(s,{assert:assertTransition,snapshot,save:v=>writeState(stateFile,v),
    migrate:()=>doctor('--aplicar',{...env,CONFIRM_DEV_BACKUP:'SIM',CONFIRM_AUTORIZACAO_VALOR_DEV_SCHEMA:'SIM'}),
    restart:()=>{console.log('Reiniciando SOMENTE backend-dev, com Node isolado e ambiente preservado.');run(PM2_NODE,[PM2_CLI,'restart','backend-dev']);},
    ready:async before=>{
     const until=Date.now()+45000;let consecutive=0;
     while(Date.now()<until){const ps=list();
      for(const a of before.apps.filter(a=>a.name!=='backend-dev'))check(ps.some(p=>p.name===a.name&&p.pid===a.pid&&p.pm2_env?.status==='online'),'VALOR_DEV_PROCESSO_PROTEGIDO_MUDOU');
      if(ps.find(p=>p.name==='backend-dev')?.pm2_env?.status==='online'){
       const after=snapshot();assertTransition(before,after,true);
       if(await health(8000)&&await health(8001)){if(++consecutive>=3)return after;}else consecutive=0;
      }await new Promise(r=>setTimeout(r,1000));
     }throw Error('VALOR_DEV_BACKEND_NAO_ESTABILIZOU');
    }});
   const r=doctor('--conferir',effectiveEnv({pid:s.after.apps.find(a=>a.name==='backend-dev').pid}));
   check(r.applied&&r.structure_ok&&!r.pending.length,'VALOR_DEV_SCHEMA_FINAL_DIVERGENTE');
  }
  console.log(JSON.stringify({outcome:'AUTORIZACAO_VALOR_BACKEND_DEV_PRONTO',commit:version,migration:'202610260001_pagamento_autorizacao_valor.js',
   node_dev:NODE,somente_duas_colunas_json_novas:true,producao_experience_daemon_nodes_env_dumps_preservados:true,financial_data_writes:0,external_calls:0,automatico_nsdocs_desligado:true,frontend_liberado:false}));
  console.log('Envie esta saida antes de publicar o frontend. Sem install, migrations gerais ou PM2 save/update/resurrect/update-env.');
 }finally{fs.rmdirSync(lock);}
}
module.exports={BASE,PREVIOUS_BACKEND,PATHS,MANIFEST,BACKLOG_HASH,validateInventory,validateStartingHead,assertTransition,finish,main};
if(require.main===module||process.argv[1]==='-')main(process.argv[2],process.argv[3]).catch(e=>{
 console.error(/^(?:VALOR_DEV|CONSULTAS|FISCAL|NSDOCS|COMANDO)_[A-Z0-9_]{1,110}$/.test(e.message||'')?e.message:'VALOR_DEV_ATUALIZACAO_INTERROMPIDA_SEM_SEGREDOS');
 console.error('Nao force Git, remova locks ou publique frontend. Envie a saida sem credenciais.');process.exitCode=1;
});
