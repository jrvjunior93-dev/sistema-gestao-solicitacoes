'use strict';
// QAs exclusivos em fixtures/VM: nenhuma EC2, PM2, Git remoto ou banco real.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const path = require('node:path'), vm = require('node:vm'), { createRequire } = require('node:module');
const crypto = require('node:crypto'), { EventEmitter } = require('node:events');
const { executar, MIGRATION, TABLE, BACKEND } = require('./aplicarMigrationRetiradaEnviosProducao20261024');
const runnerFile = path.resolve(__dirname,'../../ops/deploy/atualizar-prod-retirada-envios-20261024.cjs');
const runnerSource = fs.readFileSync(runnerFile,'utf8'), runner = require(runnerFile);
const clone = x => JSON.parse(JSON.stringify(x));
const oldFixtureFile = path.join(__dirname,'validarDeployMedicaoFiltrosProducao20261023.js');
const fixtureModule = { exports: {} };
const fixtureAssert = Object.assign((...args) => assert(...args), assert, {
  deepEqual(a,b,m){ assert.deepEqual(clone(a),clone(b),m); }
});
vm.runInNewContext(fs.readFileSync(oldFixtureFile,'utf8')+'\nmodule.exports.fixture=fixture;', {
  module:fixtureModule, require:name => name === 'node:assert/strict' ? fixtureAssert : createRequire(oldFixtureFile)(name),
  __dirname, process:{argv:[]}, console, Buffer });
function schemaFixture() {
  const x = fixtureModule.exports.fixture(); x.aplicarJson();x.aplicarIndices();
  const { ctx, s } = x; s.pending=[MIGRATION];s.executed=new Set(['202610230001_medicao_rejeicao_favorecido_titulo.js','202610230002_medicao_vinculos_ativos.js']);
  s.exists=false;s.apply=0;s.badType=false;
  const oldQuery=ctx.db.query,oldQi=ctx.db.getQueryInterface();
  const qi={...oldQi,describeTable:async t=>{
    assert.equal(t,TABLE);return Object.fromEntries(Object.entries({id:'INTEGER',usuario_id:'INT',chave:'VARCHAR(64)',pedido_hash:'VARCHAR(64)',
      resultado:s.badType?'TEXT':'JSON',createdAt:'DATETIME',updatedAt:'DATETIME'}).map(([k,type])=>[k,{type,allowNull:false,primaryKey:k==='id'}]));
  },showIndex:async t=>t===TABLE?[{unique:true,fields:[{attribute:'usuario_id'},{attribute:'chave'}]}]:oldQi.showIndex(t)};
  ctx.db.getQueryInterface=()=>qi;
  ctx.db.query=async function(sql,opts) {
    if(sql.includes('COUNT(*) AS total')){assert.deepEqual(opts.replacements,[TABLE]);return [[{total:s.exists?1:0}]];}
    return oldQuery.call(this,sql,opts);
  };
  ctx.schema={getMigrationState:async()=>s,assertMigrationsUpToDate:async()=>assert.equal(s.pending.length,0),
    async runMigrations(options){assert.deepEqual(options,{authorized:true});assert.equal(ctx.runtimeEnv.ALLOW_SCHEMA_MIGRATIONS,'true');
      s.apply++;if(s.fail)throw Error('FALHA_DDL');s.exists=true;s.pending=[];s.executed.add(MIGRATION);}};
  ctx.log=line=>s.logs.push(line);return x;
}
test('003 preflight somente leitura, aplicar/replay, schema anterior intacto e flag restaurada',async()=>{
  const x=schemaFixture();x.ctx.modo='--verificar';await executar(x.ctx);assert.equal(x.s.apply,0);
  x.ctx.modo='--aplicar';await executar(x.ctx);await executar(x.ctx);assert.equal(x.s.apply,1);
  assert.equal(x.ctx.runtimeEnv.ALLOW_SCHEMA_MIGRATIONS,'false');x.ctx.modo='--concluido';await executar(x.ctx);
});
test('003 criada sem registro e retomada segura; metadata incompatível bloqueada',async()=>{
  const x=schemaFixture();x.s.exists=true;await executar(x.ctx);assert.equal(x.s.apply,1);
  const y=schemaFixture();y.s.exists=true;y.s.badType=true;await assert.rejects(executar(y.ctx),/TABELA_RECIBOS/);assert.equal(y.s.apply,0);
});
test('003 guardas PROD efetivas e pendencia inesperada impedem DDL',async()=>{
  for(const mutate of [x=>{x.ctx.cwd='/dev';},x=>{x.ctx.env.deploymentEnvironment='development';},x=>{x.ctx.env.port=8001;},
    x=>{x.s.uuid='DEV';},x=>{x.s.tls=false;},x=>{x.s.timer=false;},x=>{x.ctx.env.jwtExpiresIn='1h';},
    x=>{x.ctx.runtimeEnv.ALLOW_SCHEMA_MIGRATIONS='true';},x=>{x.ctx.runtimeEnv.CONFIRM_PROD_BACKUP='NAO';},
    x=>{x.ctx.runtimeEnv.CONFIRM_PROD_BACKUP_TIMER='NAO';},x=>{x.ctx.runtimeEnv.CONFIRM_PROD_MAINTENANCE='NAO';},
    x=>{x.s.pending.push('outra.js');},x=>{x.s.tableExists=false;},x=>{x.s.pending=['202610230002_medicao_vinculos_ativos.js',MIGRATION];}]) {
    const x=schemaFixture();mutate(x);await assert.rejects(executar(x.ctx));assert.equal(x.s.apply,0);
  }
});
test('003 falha restaura flag; concluido recusa pendente; registrada sem tabela recusa',async()=>{
  let x=schemaFixture();x.s.fail=true;await assert.rejects(executar(x.ctx),/FALHA_DDL/);assert.equal(x.ctx.runtimeEnv.ALLOW_SCHEMA_MIGRATIONS,'false');
  x=schemaFixture();x.ctx.modo='--concluido';await assert.rejects(executar(x.ctx),/AINDA_PENDENTE/);
  x=schemaFixture();x.s.pending=[];x.s.executed.add(MIGRATION);await assert.rejects(executar(x.ctx),/SCHEMA_DIVERGENTE/);
});
function processRecord(name,id,pid,cwd,bin,port){return {name,pm_id:id,pid,pm2_env:{status:'online',pm_cwd:cwd,pm_exec_path:`${cwd}/server.js`,
  exec_interpreter:bin,exec_mode:'fork_mode',watch:false,pm_uptime:100,restart_time:1,env:{PORT:port,SECRET:'NAO_EXIBIR'},PORT:port,args:['--fixture']}};}
function harness(options={}) {
  const ps=[processRecord('backend-solicitacoes',0,100,BACKEND,runner.NODE,8000),
    processRecord('backend-dev',1,200,'/home/ubuntu/sistema-gestao-solicitacoes-dev/backend',runner.DEVNODE,8001),
    processRecord('outro',3,300,'/outro','/usr/bin/node',8010)];
  const files=new Map(),dirs=new Set(),calls=[],logs=[];let head=options.head||runner.OLDEST,restarted=false,seq=0;
  const target='a'.repeat(40),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
  for(const f of ['/usr/bin/node',runner.NODE,runner.DEVNODE,`${BACKEND}/.env`,
    '/home/ubuntu/fluxy-node24-prod/retorno.json','/home/ubuntu/fluxy-node24-dev/retorno.json',
    '/home/ubuntu/fluxy-node24-prod/persistencia-20261024/estado.json','/home/ubuntu/fluxy-node24-dev/persistencia-20261024/estado.json'])files.set(f,Buffer.from('fixture-'+f));
  for(const f of ['/home/ubuntu/.pm2/dump.pm2','/home/ubuntu/.pm2/dump.pm2.bak'])files.set(f,Buffer.from(JSON.stringify(ps.slice(0,2).map(p=>({name:p.name,exec_interpreter:p.pm2_env.exec_interpreter})))));
  files.set('/home/ubuntu/.pm2/pm2.pid',Buffer.from('608'));
  const manifest={base:runner.BASE,source:'84b9aef43fe2f3192bdcf0e415dd794289b0f751',arquivos:['A\tbackend/migrations/'+MIGRATION]};
  const before={scripts:{antigo:'qa'},dependencies:{x:'1'}},after=clone(before);
  after.scripts['test:retirada-envios']='node scripts/validarRetiradaEnvios.js && node scripts/validarRetiradaEnviosHttp.js && node scripts/validarAnaliseProprietario.js && node scripts/validarPainelAutorizacoesSqlLocal.js';
  if(options.dependencies)after.dependencies.x='2';
  function version(bin){return [runner.NODE,runner.DEVNODE].includes(bin)?'v24.22.1':'v24.13.0';}
  const mockFs={existsSync:f=>files.has(f)||dirs.has(f),realpathSync:f=>f,
    lstatSync:()=>({isFile:()=>true,isSymbolicLink:()=>false,nlink:1,mode:0o600}),
    readFileSync(f,encoding){
      if(/^\/proc\/\d+\/environ$/.test(f))return 'PORT=8000\0SECRET=NAO_EXIBIR\0NODE_OPTIONS=--enable-source-maps\0NODE_CHANNEL_FD=3\0';
      if(!files.has(f))throw Error('ENOENT');return encoding?files.get(f).toString():files.get(f);},
    readlinkSync(f){const id=Number(f.split('/')[2]);if(id===608)return '/usr/bin/node';const p=ps.find(p=>p.pid===id);assert(p);return p.pm2_env.exec_interpreter;},
    mkdirSync(f,opts){assert.equal(opts.mode,0o700);if(dirs.has(f))throw Error('EEXIST');dirs.add(f);},
    rmdirSync:f=>dirs.delete(f),writeFileSync(f,text,opts){assert(f.endsWith('retirada-envios-prod-backend-pronto.json'));assert.equal(opts.mode,0o600);files.set(f,Buffer.from(text));}
  };
  function spawnSync(bin,args,opts){calls.push([bin,[...args],opts]);const ok=stdout=>({status:0,stdout:stdout||'',stderr:''});
    if(bin==='git'){
      if(args[0]==='branch')return ok('main');if(args[0]==='status')return ok(options.dirty?'M arquivo':'');
      if(args[0]==='rev-parse')return ok(args[1]==='--git-path'?`${runner.ROOT}/.git/${args[2]}`:args[1]==='origin/main'?target:head);
      if(args[0]==='fetch'||args[0]==='merge-base')return ok();
      if(args[0]==='show')return ok(JSON.stringify(args[1].endsWith(runner.MANIFEST)?manifest:args[1].startsWith(runner.BASE+':')?before:after));
      if(args[0]==='diff')return ok(args.includes('--name-only')?'':manifest.arquivos.join('\n'));
      if(args[0]==='merge'){head=target;return ok();}throw Error('GIT_INESPERADO');
    }
    if(bin==='systemctl')return options.timerOff&&args.at(-1)==='fluxy-prod-db-backup.timer'?{status:3}:ok();
    if(bin==='pm2'){
      if(args[0]==='jlist')return ok(JSON.stringify(ps));assert.deepEqual([...args],['restart','0']);
      assert(!Object.hasOwn(opts.env,'CONFIRM_PROD_BACKUP'));assert(!Object.hasOwn(opts.env,'ALLOW_SCHEMA_MIGRATIONS'));
      ps[0].pid=110;ps[0].pm2_env.restart_time++;restarted=true;
      // Mudanca legitima de ordem/metadado no PM2 nao muda configuracao funcional.
      ps[0].pm2_env.env={SECRET:'NAO_EXIBIR',PORT:8000};ps[0].pm2_env.SSH_CONNECTION='mudou';
      if(options.mutateDev)ps[1].pid++;
      if(options.mutateDump)files.set('/home/ubuntu/.pm2/dump.pm2',Buffer.from('adulterado'));
      return ok();
    }
    if(args[0]==='--version')return ok(version(mockFs.readlinkSync(bin)));
    if(bin===runner.NODE && args[0]==='-e'){
      assert(!Object.hasOwn(opts.env,'NODE_CHANNEL_FD'));assert.equal(opts.env.NODE_OPTIONS,'--enable-source-maps');
      if(args[1].includes('modo: "--aplicar"')){assert.equal(opts.env.CONFIRM_PROD_BACKUP,'SIM');if(options.schemaFail)return {status:1,stderr:'NAO_EXIBIR'};}
      return ok('PROD_CONFIG_PROBE:'+sha(options.changedConfig&&restarted?'mudou':'config-estavel'));
    }
    if(bin===runner.NODE && args[0].startsWith('scripts/'))return options.qaFail?{status:1}:ok();
    throw Error('COMANDO_INESPERADO');
  }
  const context={module:{exports:{}},Buffer,structuredClone,process:{platform:'linux',arch:process.arch,argv:[],getuid:()=>1000,cwd:()=>runner.ROOT,
    env:{CONFIRM_PROD_BACKUP:'SIM',CONFIRM_PROD_BACKUP_TIMER:'SIM',CONFIRM_PROD_MAINTENANCE:'SIM'}},
    console:{log:l=>logs.push(l),error:l=>logs.push(l)},setTimeout:cb=>queueMicrotask(cb),require(name){
      if(name==='node:fs')return mockFs;if(name==='node:child_process')return {spawnSync};if(name==='node:path')return path.posix;
      if(name==='node:os')return {userInfo:()=>({username:'ubuntu'})};
      if(name==='node:crypto')return crypto;if(name==='node:http')return {get(o,callback){
        const req=new EventEmitter();req.destroy=()=>req.emit('error',Error('fixture'));const res=new EventEmitter();res.statusCode=200;res.setEncoding=()=>{};
        queueMicrotask(()=>{callback(res);res.emit('data','{"ok":true}');res.emit('end');});return req;}};throw Error('MODULO_NAO_AUTORIZADO');}
  };
  vm.runInNewContext(runnerSource,context);return {main:context.module.exports.main,api:context.module.exports,target,ps,files,dirs,calls,logs,context,manifest,before,after};
}
test('runner completo: FF, QA, somente003, restart PROD isolado, DEV/dumps/estado preservados',async()=>{
  const h=harness(),protectedFiles=new Map(h.files),dev=clone(h.ps[1]);await h.main(h.target);
  assert.deepEqual(h.ps[1],dev);for(const [f,b]of protectedFiles)assert.equal(h.files.get(f).toString(),b.toString());
  assert(h.logs.some(l=>typeof l==='string'&&l.includes('BACKEND_RETIRADA_ENVIOS_PRODUCAO_PRONTO')));
  assert(!h.logs.join('').includes('NAO_EXIBIR'));assert.equal(h.dirs.size,0);
});
for(const [label,options]of [['dirty',{dirty:true}],['timer',{timerOff:true}],['dependencies',{dependencies:true}],['QA',{qaFail:true}],['schema',{schemaFail:true}],['HEAD',{head:'b'.repeat(40)}]])
  test(`runner bloqueia ${label} antes de restart`,async()=>{const h=harness(options);await assert.rejects(h.main(h.target));assert(!h.calls.some(([b,a])=>b==='pm2'&&a[0]==='restart'));});
for(const [label,options]of [['DEV',{mutateDev:true}],['dump',{mutateDump:true}],['configuracao',{changedConfig:true}]])
  test(`runner detecta mudanca concorrente ${label} sem acao em DEV`,async()=>{const h=harness(options);await assert.rejects(h.main(h.target));
    assert(h.calls.filter(([b,a])=>b==='pm2'&&a[0]!=='jlist').every(([,a])=>a[0]==='restart'&&a[1]==='0'));});
test('inventario e IPC: frontend e dependencias recusados, NODE_OPTIONS preservado',()=>{
  const h=harness();const bad={...h.manifest,arquivos:['M\tfrontend/src/App.jsx']};
  assert.throws(()=>runner.validateInventory(bad,bad.arquivos,h.before,h.after),/FRONTEND/);
  assert.deepEqual(runner.cleanEnvironment({NODE_CHANNEL_FD:'3',NODE_OPTIONS:'--enable-source-maps'}),{NODE_OPTIONS:'--enable-source-maps'});
});
test('probe real em VM: configuracao antes/depois canonica, confirmacoes transitórias e banco fechado',async()=>{
  const h=harness();await h.main(h.target);let guard=0,ddl=0,closed=0;const fingerprints=[];
  for(const [,args,opts] of h.calls.filter(([b,a])=>b===runner.NODE&&a[0]==='-e')){
    const logs=[],p={env:{...opts.env},cwd:()=>BACKEND};
    await vm.runInNewContext(args[1],{process:p,Buffer,console:{log:l=>logs.push(l),error:l=>logs.push(l)},require(name){
      if(name==='node:fs')return {realpathSync:()=>BACKEND,readFileSync:()=>''};
      if(name==='node:child_process')return {execFileSync(){}};if(name==='node:crypto')return crypto;
      if(name==='./src/config/env')return {env:{deploymentEnvironment:'production',port:8000,jwtExpiresIn:'12h'},validateRequiredEnv(){}};
      if(name==='./src/database')return {close:async()=>{closed++;}};
      if(name==='./src/database/runMigrations')return {assertMigrationsUpToDate:async()=>{}};
      if(name==='./scripts/promoverSchemaProducao20261018')return {conferirProducao:async()=>{guard++;}};
      if(name==='./scripts/aplicarMigrationRetiradaEnviosProducao20261024')return {executar:async ctx=>{
        guard++;if(ctx.modo==='--aplicar'){assert.equal(p.env.CONFIRM_PROD_BACKUP,'SIM');ddl++;}
      }};
      if(name==='dotenv')return {parse:()=>({PORT:'8000',SECRET:'NAO_EXIBIR'})};throw Error('MODULO_NAO_AUTORIZADO');
    }});
    assert.equal(p.exitCode,undefined);assert(!logs.join('').includes('NAO_EXIBIR'));
    fingerprints.push(logs.find(l=>l.startsWith('PROD_CONFIG_PROBE:')));
  }
  assert.equal(guard,5);assert.equal(closed,5);assert.equal(ddl,1);
  assert.equal(new Set(fingerprints).size,1,'Confirmacoes e metadados nao podem causar falso positivo de ambiente');
});
module.exports={schemaFixture,harness};
