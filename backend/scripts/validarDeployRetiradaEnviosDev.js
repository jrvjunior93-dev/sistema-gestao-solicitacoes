'use strict';
// Fixtures/VM somente. Nao acessa PM2, DB, EC2 ou Git remoto.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { executar, conferirPlano, MIGRATION, TABLE, BACKEND } = require('./aplicarMigrationRetiradaEnviosDev');
const migration = require('../migrations/202610230003_pagamento_envios_retiradas');
const old = require('../migrations/202610230002_medicao_vinculos_ativos');
const root = path.resolve(__dirname,'../..');
const source = fs.readFileSync(path.join(root,'ops/deploy/atualizar-dev-retirada-envios-20261023.sh'),'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root,'ops/deploy/retirada-envios-dev-20261023.json'),'utf8'));
const blocks = [...source.matchAll(/<<'NODE'\r?\n([^]*?)\r?\nNODE/g)].map(m=>m[1]);
const index = (name, fields, unique = true) => ({ name, unique, fields:fields.map(attribute=>({attribute,length:null})) });
function fixture() {
  const state={ tableExists:true,pending:[MIGRATION],executed:new Set(['202610230002_medicao_vinculos_ativos.js']) };
  const s={exists:false,creates:0,applies:0,queries:[],logs:[],badTable:false,badUnique:false,failDDL:false,
    uuid:'60f043e9-4025-11f1-9a61-06d8a063012d',banco:'gestao_solicitacoes',version:'8.0.40',engine:'InnoDB'};
  const cols=['solicitacao_id','medicao_id','contrato_parcela_id','devolvido_em'].map(nome=>({nome}));
  for (const [nome,c] of Object.entries(old.COLUNAS)) cols.push({nome,tipo:c.tipo,expressao:c.expressao,extra:'VIRTUAL GENERATED',anulavel:'YES',tamanho:nome==='evento_chave'?64:null});
  const processes=[{name:'backend-dev',pm2_env:{pm_exec_path:BACKEND+'/server.js',PORT:8001,status:'online',watch:false}}];
  const runtimeEnv={ALLOW_SCHEMA_MIGRATIONS:'false',CONFIRM_DEV_BACKUP:'SIM'};
  const qi={
    async showIndex(t) { return t==='medicao_parcelas' ? [index('medicao_parcelas_ativa_unica',['contrato_parcela_id','vinculo_ativo']),index('medicao_parcelas_evento_unico',['contrato_parcela_id','evento_chave']),index('medicao_parcelas_solicitacao',['solicitacao_id'],false)]
      : [index('pagamento_retirada_usuario_chave',['usuario_id','chave'],!s.badUnique)]; },
    async describeTable(t) { assert.equal(t,TABLE); return Object.fromEntries((s.badTable?['id']:['id','usuario_id','chave','pedido_hash','resultado','createdAt','updatedAt']).map(k=>[k,{}])); },
    async createTable(t) { assert.equal(t,TABLE);s.creates++;s.exists=true;if(s.failDDL)throw Error('FALHA_DDL'); }
  };
  const db={getQueryInterface:()=>qi,async query(sql,opts){
    s.queries.push(sql);assert(/^SELECT\b/i.test(sql),'Escrita nao autorizada pelo preflight');
    if(sql.includes('@@GLOBAL.server_uuid'))return [[{uuid:s.uuid,banco:s.banco}]];
    if(sql==='SELECT VERSION() AS versao')return [[{versao:s.version}]];
    if(sql.includes('COUNT(*) AS total')){assert.deepEqual(opts.replacements,[TABLE]);return [[{total:s.exists?1:0}]];}
    if(sql.includes('information_schema.TABLES'))return [[{engine:s.engine}]];
    if(sql.includes('information_schema.COLUMNS'))return [cols];
    if(sql.includes('FROM medicao_parcelas'))return [[]];
    throw Error('SELECT_NAO_PREVISTO');
  }};
  const schema={getMigrationState:async()=>state,assertMigrationsUpToDate:async()=>assert.equal(state.pending.length,0),
    async runMigrations(o){assert.deepEqual(o,{authorized:true});assert.equal(runtimeEnv.ALLOW_SCHEMA_MIGRATIONS,'true');s.applies++;
      await migration.up({sequelize:db,queryInterface:qi,DataTypes:require('sequelize').DataTypes});state.pending=[];state.executed.add(MIGRATION);}
  };
  const args={modo:'--aplicar',cwd:BACKEND,env:{deploymentEnvironment:'development',port:8001,dbHost:'fluxy-staging.cn820k66sdx7.us-east-2.rds.amazonaws.com'},runtimeEnv,db,schema,
    validateRequiredEnv(){},log:t=>s.logs.push(t),execFileSync(cmd,a){assert.equal(cmd,'pm2');assert.deepEqual(a,['jlist']);return JSON.stringify(processes);}};
  return {args,s,state,processes,runtimeEnv};
}
function inventory(files=manifest.arquivos,extra={}) {
  vm.runInNewContext(blocks[1],{process:{argv:['node','-','base','target']},require(n){
    if(n==='node:assert/strict')return {equal:assert.equal,deepEqual(a,b,m){assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)),m);}};
    assert.equal(n,'node:child_process');return {execFileSync(cmd,args){assert.equal(cmd,'git');
      if(args[0]==='diff')return args.includes('backend/migrations') ? (extra.migrations||'A\tbackend/migrations/'+MIGRATION) : files.join('\n');
      if(args[1].endsWith('.json')&&args[1].includes('ops/deploy/'))return JSON.stringify({...manifest,base:'base'});
      return JSON.stringify({dependencies:{qa:extra.dependencies&&args[1].startsWith('target:')?'2':'1'},scripts:args[1].startsWith('base:')?{}:{'test:retirada-envios':'node qa.js'}});
    }};
  }});
}
function shell() {
  assert.equal(blocks.length,2);blocks.forEach(b=>new vm.Script(b));
  const ff=source.indexOf('git merge --ff-only'),apply=source.indexOf('aplicarMigrationRetiradaEnviosDev.js --aplicar'),restart=source.indexOf('pm2 restart backend-dev');
  assert(ff>0&&apply>ff&&restart>apply);
  for(const token of ['flock -n 9','test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-dev','test "$(git branch --show-current)" = refactor/frontend',
    'test -z "$(git status --porcelain --untracked-files=no)"','test "${CONFIRM_DEV_BACKUP:-}" = SIM',
    'git merge-base --is-ancestor "$versao_dev" origin/refactor/frontend','test "$head_dev" = "$base_dev" || test "$head_dev" = "$versao_dev"',
    'assert.deepEqual(arquivos, [...manifesto.arquivos].sort()','base_dev='+manifest.base]) assert(source.indexOf(token)>=0&&source.indexOf(token)<ff,token);
  assert(source.indexOf('validarDeployRetiradaEnviosDev.js')<apply);
  assert.equal((source.match(/pm2 restart/g)||[]).length,1);
  assert.equal((source.match(/test "\$env_hash_dev"/g)||[]).length,3);
  assert(source.includes('env -u CONFIRM_DEV_BACKUP -u ALLOW_SCHEMA_MIGRATIONS pm2 restart backend-dev'));
  assert(source.includes('http://127.0.0.1:8001/health'));
  assert(!/--update-env|backend-solicitacoes|pm2 (?:reload|start|stop|delete)|npm (?:ci|install)|git (?:reset|push|checkout)|export ALLOW_SCHEMA/.test(source));
  inventory();assert.throws(()=>inventory([...manifest.arquivos,'M\tbackend/.env']));assert.throws(()=>inventory(manifest.arquivos.slice(1)));
  assert.throws(()=>inventory(manifest.arquivos,{dependencies:true}));assert.throws(()=>inventory(manifest.arquivos,{migrations:'A\tbackend/migrations/outra.js'}));
  for(const alter of [null,p=>{p.PORT=8000;},p=>{p.watch=true;},p=>{p.status='stopped';},p=>{p.pm_exec_path='/producao/server.js';},p=>{p.ALLOW_SCHEMA_MIGRATIONS='true';}]){
    const p={pm_exec_path:BACKEND+'/server.js',PORT:8001,status:'online',watch:false};alter?.(p);
    const run=()=>vm.runInNewContext(blocks[0],{process:{env:{}},require(n){
      if(n==='./backend/src/config/env')return {};
      assert.equal(n,'node:child_process');return{execFileSync:()=>JSON.stringify([{name:'backend-dev',pm2_env:p}])};
    }});
    if(alter)assert.throws(run);else run();
  }
}
async function qa(){
  shell();let f=fixture();f.args.modo='--verificar';await executar(f.args);assert.equal(f.s.creates,0);assert.equal(f.s.applies,0);
  f=fixture();await executar(f.args);await executar(f.args);assert.equal(f.s.creates,1);assert.equal(f.s.applies,1);assert.equal(f.runtimeEnv.ALLOW_SCHEMA_MIGRATIONS,'false');
  f.args.modo='--verificar-aplicada';await executar(f.args);assert.equal(f.s.applies,1);
  // CREATE ja ocorrido mas registro da migration ainda ausente: retomar sem recriar.
  f=fixture();f.s.exists=true;await executar(f.args);assert.equal(f.s.creates,0);assert.equal(f.s.applies,1);
  for(const alter of [f=>{f.args.cwd='/producao/backend';},f=>{f.args.env.deploymentEnvironment='production';},f=>{f.args.env.port=8000;},f=>{f.args.env.dbHost='outro';},
    f=>{f.processes.length=0;},f=>{f.processes.push(f.processes[0]);},f=>{f.processes[0].pm2_env.PORT=8000;},f=>{f.processes[0].pm2_env.watch=true;},
    f=>{f.processes[0].pm2_env.DB_PASSWORD='NAO_MOSTRAR';},f=>{f.processes[0].pm2_env.ALLOW_SCHEMA_MIGRATIONS='true';},f=>{f.runtimeEnv.ALLOW_SCHEMA_MIGRATIONS='true';},
    f=>{f.s.uuid='producao';},f=>{f.s.banco='outro';},f=>{f.state.pending.push('outra.js');},f=>{f.state.executed.clear();},f=>{f.state.tableExists=false;},
    f=>{f.s.version='5.7.44';},f=>{f.s.engine='MyISAM';},f=>{f.runtimeEnv.CONFIRM_DEV_BACKUP='NAO';},f=>{f.s.exists=true;f.s.badTable=true;},f=>{f.s.exists=true;f.s.badUnique=true;}]) {
    f=fixture();alter(f);await assert.rejects(executar(f.args));assert.equal(f.s.applies,0);assert.equal(f.s.creates,0);assert(!f.s.logs.join('').includes('NAO_MOSTRAR'));
  }
  f=fixture();f.args.modo='--verificar-aplicada';await assert.rejects(executar(f.args),/NAO_REGISTRADA/);
  f=fixture();f.state.pending=[];f.state.executed.add(MIGRATION);await assert.rejects(executar(f.args),/SCHEMA_DIVERGENTE/);
  f=fixture();f.s.failDDL=true;await assert.rejects(executar(f.args));assert.equal(f.runtimeEnv.ALLOW_SCHEMA_MIGRATIONS,'false');
  await assert.rejects(conferirPlano({getQueryInterface:()=>({})},{up:async({sequelize})=>sequelize.query('DELETE FROM titulos_financeiros')}),/ESCRITA_BLOQUEADA/);
  if(process.argv.includes('--index')){
    const cp=require('node:child_process');
    const lista=cp.execFileSync('git',['diff','--cached','--name-status',manifest.base],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).sort();
    assert.deepEqual(lista,[...manifest.arquivos].sort(),'Index nao corresponde ao inventario autorizado');
  }
  console.log('OK deploy DEV: inventario/FF/lock, identidade/UUID/PM2/flags, somente003, schema anterior integro, preflight read-only, backup, retomada/replay e restart exclusivo. Sem EC2/banco/rede.');
}
if(require.main===module)qa().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={qa};
