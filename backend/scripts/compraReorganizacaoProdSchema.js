'use strict';
// Somente a tabela nova do journal. Sem models/index, sync, backfill ou runner geral.
const fs=require('node:fs'),path=require('node:path');
const NAME='202610260002_compra_reorganizacao_reversivel.js';
const migration=require('../migrations/'+NAME),{TABLE}=migration;
const check=(v,c)=>{if(!v)throw Error(c);};
const normalize=sql=>String(sql).trim().replace(/;$/,'');
async function identity(query){
 const [[id]]=await query('SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco');
 check(id?.uuid==='5ed4b970-009f-11f1-809c-0ad0e0c90c53'&&id.banco==='gestao_solicitacoes','REORG_PROD_BANCO_DIVERGENTE');
 const [tls]=await query("SHOW SESSION STATUS WHERE Variable_name IN ('Ssl_cipher','Ssl_version')");
 check(tls.some(r=>r.Variable_name==='Ssl_cipher'&&r.Value)&&tls.some(r=>r.Variable_name==='Ssl_version'&&/^TLSv1\.[23]$/.test(r.Value)),'REORG_PROD_TLS_OBRIGATORIO');
}
async function structure(query,{validate=true,DataTypes=require('sequelize').DataTypes}={}){
 const [columns]=await query(`SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='${TABLE}'`);
 if(!columns.length)return false;
 if(!validate)return true;
 const cols=Object.fromEntries(columns.map(c=>[c.COLUMN_NAME,{type:c.COLUMN_TYPE,allowNull:c.IS_NULLABLE==='YES',primaryKey:c.COLUMN_KEY==='PRI'}]));
 const [rows]=await query('SHOW INDEX FROM `'+TABLE+'`'),indexes=new Map();
 for(const r of rows){if(!indexes.has(r.Key_name))indexes.set(r.Key_name,{name:r.Key_name,unique:Number(r.Non_unique)===0,fields:[]});indexes.get(r.Key_name).fields[Number(r.Seq_in_index)-1]={attribute:r.Column_name};}
 const reject=()=>{throw Error('REORG_PROD_ESTRUTURA_INCOMPLETA');};
 await migration.up({DataTypes,queryInterface:{showAllTables:async()=>[TABLE],describeTable:async()=>cols,showIndex:async()=>[...indexes.values()],createTable:reject,addIndex:reject}});
 return true;
}
async function state(query,{files=fs.readdirSync(path.resolve(__dirname,'../migrations')),validate=true,DataTypes}={}){
 const [rows]=await query('SELECT name FROM schema_migrations ORDER BY name'),executed=new Set(rows.map(r=>r.name));
 const pending=files.filter(n=>n.endsWith('.js')&&!executed.has(n)).sort();
 check(pending.every(n=>n===NAME),'REORG_PROD_OUTRAS_MIGRATIONS_PENDENTES');
 const structure_ok=await structure(query,{validate,DataTypes});check(!executed.has(NAME)||structure_ok,'REORG_PROD_LEDGER_SCHEMA_DIVERGENTE');
 return{migration:NAME,pending,applied:executed.has(NAME),structure_ok};
}
function allowedDdl(db,DataTypes=require('sequelize').DataTypes){
 const qi=db.getQueryInterface(),qg=qi.queryGenerator;
 const attrs=Object.fromEntries(Object.entries(migration.shape(DataTypes)).map(([k,v])=>[k,db.normalizeAttribute(v)]));
 return new Set([qg.createTableQuery(TABLE,qg.attributesToSQL(attrs,{context:'createTable',table:TABLE}),{}),qg.addIndexQuery(TABLE,['lote_id','solicitacao_compra_id'],{name:'uq_compra_reorg_lote_sc',unique:true})].map(normalize));
}
function structuralSql(sql,ddl=new Set()){
 const s=normalize(sql);const read=/^(SELECT|SHOW)\b/i.test(s)&&!/[;]|\b(?:INSERT|UPDATE|DELETE|REPLACE|TRUNCATE|DROP|OUTFILE|DUMPFILE|LOAD_FILE|FOR\s+UPDATE)\b/i.test(s);
 check(read||ddl.has(s),'REORG_PROD_DDL_FORA_ESCOPO');
}
async function apply(db,{transaction,files,DataTypes=require('sequelize').DataTypes,migration:runMigration=migration}={}){
 check(transaction?.connection,'REORG_PROD_CANAL_DEDICADO_OBRIGATORIO');
 const native=db.query.bind(db),query=(sql,options={})=>native(sql,{...options,transaction});let locked=false;
 try{
  await identity(query);const [[lock]]=await query("SELECT GET_LOCK('fluxy_compra_reorganizacao_prod_schema', 0) AS acquired");check(Number(lock?.acquired)===1,'REORG_PROD_SCHEMA_OCUPADO');locked=true;
  const before=await state(query,{files,validate:false,DataTypes}),ddl=allowedDdl(db,DataTypes);
  // DDL MySQL pode fazer commit implicito. Journal aditivo e ledger sao retomaveis;
  // nao prometer rollback de CREATE TABLE. Toda query continua no mesmo canal/TLS.
  db.query=(sql,options={})=>{structuralSql(typeof sql==='string'?sql:sql?.query,ddl);return query(sql,options);};
  await runMigration.up({queryInterface:db.getQueryInterface(),DataTypes});db.query=native;
  check(await structure(query,{DataTypes}),'REORG_PROD_SCHEMA_INCOMPLETO');
  if(!before.applied)await query('INSERT INTO schema_migrations (name) VALUES (?)',{replacements:[NAME]});
  const after=await state(query,{files,DataTypes});check(after.applied&&after.structure_ok&&!after.pending.length,'REORG_PROD_SCHEMA_FINAL_DIVERGENTE');
  return{...after,applied_now:!before.applied};
 }finally{db.query=native;if(locked)await query("SELECT RELEASE_LOCK('fluxy_compra_reorganizacao_prod_schema') AS released");}
}
async function main(args){
 check(args.length===1&&['--conferir','--aplicar'].includes(args[0]),'REORG_PROD_SCHEMA_ARGUMENTOS_INVALIDOS');
 require('dotenv').config({quiet:true,override:false});
 const runtime=require('../src/modules/fiscal/services/nsdocsHistorical/manual/runtime');runtime.assertProdProcess();
 check(!process.env.NODE_OPTIONS&&process.env.NODE_TLS_REJECT_UNAUTHORIZED!=='0'&&!/^(true|1|yes|on)$/i.test(process.env.ALLOW_SCHEMA_MIGRATIONS||''),'REORG_PROD_AMBIENTE_INSEGURO');
 if(args[0]==='--conferir')return runtime.withProdReadDatabase(async db=>{const query=async(sql,options)=>{structuralSql(sql);return db.query(sql,options);};await identity(query);return state(query);});
 check(['CONFIRM_PROD_BACKUP','CONFIRM_PROD_BACKUP_TIMER','CONFIRM_PROD_MAINTENANCE','CONFIRM_SC_REVERSIVEL_PROD_SCHEMA'].every(k=>process.env[k]==='SIM'),'REORG_PROD_CONFIRME_BACKUP_TIMER_JANELA_SCHEMA');
 const cp=require('node:child_process');check(cp.execFileSync('/usr/bin/git',['--no-optional-locks','branch','--show-current'],{encoding:'utf8',timeout:5000,stdio:['ignore','pipe','ignore']}).trim()==='main','REORG_PROD_BRANCH_DIVERGENTE');
 cp.execFileSync('/usr/bin/systemctl',['is-active','--quiet','fluxy-prod-db-backup.timer'],{timeout:5000,stdio:'ignore',env:{PATH:'/usr/bin:/bin',LANG:'C'}});
 const {env,validateRequiredEnv}=require('../src/config/env');validateRequiredEnv();
 require('../src/modules/fiscal/services/nsdocsHistorical/manual/policy').validateFlags(require('dotenv').parse(fs.readFileSync('.env')));
 const {Sequelize}=require('sequelize'),{getRdsSsl}=require('../src/modules/fiscal/services/nsdocsHistorical/manual/rdsTls');
 const db=new Sequelize(env.dbName,env.dbUser,env.dbPassword,{host:env.dbHost,port:env.dbPort,dialect:'mysql',logging:false,pool:{max:1,min:0,acquire:15000},dialectOptions:{connectTimeout:10000,ssl:{...getRdsSsl()}}});
 try{return await db.transaction(transaction=>apply(db,{transaction}));}finally{await db.close();}
}
module.exports={NAME,TABLE,identity,structure,state,allowedDdl,structuralSql,apply,main};
if(require.main===module)main(process.argv.slice(2)).then(r=>console.log(JSON.stringify({outcome:'SC_REVERSIVEL_SCHEMA_PROD',...r,financial_data_writes:0,cancelamentos:0,external_calls:0}))).catch(e=>{console.error(/^REORG_[A-Z0-9_]+$/.test(e.message||'')?e.message:'REORG_PROD_SCHEMA_INTERROMPIDO_SEM_SEGREDOS');process.exitCode=1;});
