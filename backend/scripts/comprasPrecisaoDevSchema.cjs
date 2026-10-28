'use strict';
// Exclusivo DEV, somente widening nomeado. Nunca importa models ou rotina PC-00299.
const fs=require('node:fs'),path=require('node:path');
const NAME='202610270010_compras_precisao_unitarios.js';
const migration=require('../migrations/'+NAME);
const COLUMNS=['pedido_compra_itens','solicitacao_compra_alocacoes'];
const check=(ok,code)=>{if(!ok)throw Error(code);};
const normalize=sql=>String(sql).trim().replace(/;$/,'');
async function identity(query){
 const [[id]]=await query('SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco');
 check(id?.uuid==='60f043e9-4025-11f1-9a61-06d8a063012d'&&id.banco==='gestao_solicitacoes','COMPRAS_PRECISAO_DEV_BANCO_DIVERGENTE');
 const [tls]=await query("SHOW SESSION STATUS WHERE Variable_name IN ('Ssl_cipher','Ssl_version')");
 check(tls.some(r=>r.Variable_name==='Ssl_cipher'&&r.Value)&&tls.some(r=>r.Variable_name==='Ssl_version'&&/^TLSv1\.[23]$/.test(r.Value)),'COMPRAS_PRECISAO_DEV_TLS_OBRIGATORIO');
}
async function structure(query){
 const [cols]=await query("SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('pedido_compra_itens','solicitacao_compra_alocacoes') AND COLUMN_NAME='preco_unitario'");
 const missing=[];
 for(const table of COLUMNS){
  const col=cols.find(c=>c.TABLE_NAME===table&&c.COLUMN_NAME==='preco_unitario');
  check(col&&col.IS_NULLABLE==='NO'&&col.COLUMN_DEFAULT!=null&&Number(col.COLUMN_DEFAULT)===0,'COMPRAS_PRECISAO_DEV_COLUNA_DIVERGENTE');
  const type=String(col.COLUMN_TYPE).replace(/\s/g,'').toLowerCase();
  check(['decimal(14,2)','decimal(22,10)'].includes(type),'COMPRAS_PRECISAO_DEV_TIPO_DIVERGENTE');
  if(type==='decimal(14,2)')missing.push(table+'.preco_unitario');
 }
 return{structure_ok:missing.length===0,missing};
}
async function state(query,{files=fs.readdirSync(path.resolve(__dirname,'../migrations'))}={}){
 const [rows]=await query('SELECT name FROM schema_migrations ORDER BY name');
 const executed=new Set(rows.map(r=>r.name));
 const pending=files.filter(n=>n.endsWith('.js')&&!executed.has(n)).sort();
 check(pending.every(n=>n===NAME),'COMPRAS_PRECISAO_DEV_OUTRAS_MIGRATIONS_PENDENTES');
 const shape=await structure(query);
 check(!executed.has(NAME)||shape.structure_ok,'COMPRAS_PRECISAO_DEV_LEDGER_SCHEMA_DIVERGENTE');
 return{migration:NAME,pending,applied:executed.has(NAME),...shape};
}
function allowedDdl(db,D=require('sequelize').DataTypes){
 const qg=db.getQueryInterface().queryGenerator;
 const attr=db.normalizeAttribute({type:D.DECIMAL(22,10),allowNull:false,defaultValue:0});
 return new Set(COLUMNS.map(t=>normalize(qg.changeColumnQuery(t,qg.attributesToSQL({preco_unitario:attr},{context:'changeColumn',table:t})))));
}
function structuralSql(sql,ddl=new Set()){
 const text=normalize(sql);
 const read=/^(SELECT|SHOW)\b/i.test(text)&&!/[;]|\b(?:INSERT|UPDATE|DELETE|REPLACE|TRUNCATE|DROP|OUTFILE|DUMPFILE|LOAD_FILE|SLEEP|BENCHMARK|FOR\s+UPDATE)\b/i.test(text);
 check(read||ddl.has(text),'COMPRAS_PRECISAO_DEV_DDL_FORA_ESCOPO');
}
async function apply(db,{transaction,files,DataTypes=require('sequelize').DataTypes,migration:run=migration}={}){
 check(transaction?.connection,'COMPRAS_PRECISAO_DEV_CANAL_DEDICADO_OBRIGATORIO');
 const native=db.query.bind(db),query=(sql,o={})=>native(sql,{...o,transaction});let locked=false;
 try{
  await identity(query);
  const [[lock]]=await query("SELECT GET_LOCK('fluxy_compras_precisao_dev_schema',0) AS acquired");
  check(Number(lock?.acquired)===1,'COMPRAS_PRECISAO_DEV_SCHEMA_OCUPADO');locked=true;
  const before=await state(query,{files}),ddl=allowedDdl(db,DataTypes);
  // MySQL DDL tem commit implicito: nao prometer rollback de schema. Retomada valida cada coluna.
  db.query=(sql,o={})=>{structuralSql(typeof sql==='string'?sql:sql?.query,ddl);return query(sql,o);};
  try{await run.up({queryInterface:db.getQueryInterface(),DataTypes});}finally{db.query=native;}
  check((await structure(query)).structure_ok,'COMPRAS_PRECISAO_DEV_SCHEMA_INCOMPLETO');
  if(!before.applied)await query('INSERT INTO schema_migrations (name) VALUES (?)',{replacements:[NAME]});
  const after=await state(query,{files});
  check(after.applied&&after.structure_ok&&!after.pending.length,'COMPRAS_PRECISAO_DEV_SCHEMA_FINAL_DIVERGENTE');
  return{...after,applied_now:!before.applied};
 }finally{
  db.query=native;
  if(locked)await query("SELECT RELEASE_LOCK('fluxy_compras_precisao_dev_schema') AS released");
 }
}
async function main(args){
 check(args.length===1&&['--conferir','--aplicar'].includes(args[0]),'COMPRAS_PRECISAO_DEV_ARGUMENTOS_INVALIDOS');
 require('dotenv').config({quiet:true,override:false});
 const runtime=require('../src/modules/fiscal/services/nsdocs/manual/runtime');runtime.assertDevProcess();
 check(!process.env.NODE_OPTIONS&&process.env.NODE_TLS_REJECT_UNAUTHORIZED!=='0'&&!/^(true|1|yes|on)$/i.test(process.env.ALLOW_SCHEMA_MIGRATIONS||''),'COMPRAS_PRECISAO_DEV_AMBIENTE_INSEGURO');
 if(args[0]==='--conferir')return runtime.withDevReadDatabase(async db=>{
  const query=(sql,o)=>{structuralSql(sql);return db.query(sql,o);};await identity(query);return state(query);
 });
 check(process.env.CONFIRM_DEV_BACKUP==='SIM'&&process.env.CONFIRM_COMPRAS_PRECISAO_DEV_SCHEMA==='SIM','COMPRAS_PRECISAO_DEV_CONFIRME_BACKUP_SCHEMA');
 check(require('node:child_process').execFileSync('/usr/bin/git',['--no-optional-locks','branch','--show-current'],{encoding:'utf8',timeout:5000,stdio:['ignore','pipe','ignore']}).trim()==='refactor/frontend','COMPRAS_PRECISAO_DEV_BRANCH_DIVERGENTE');
 const {env,validateRequiredEnv}=require('../src/config/env');validateRequiredEnv();
 require('../src/modules/fiscal/services/nsdocs/manual/policy').validateFlags(require('dotenv').parse(fs.readFileSync('.env')));
 const {Sequelize}=require('sequelize'),{getRdsSsl}=require('../src/modules/fiscal/services/nsdocs/manual/rdsTls');
 const db=new Sequelize(env.dbName,env.dbUser,env.dbPassword,{host:env.dbHost,port:env.dbPort,dialect:'mysql',logging:false,
  pool:{max:1,min:0,acquire:15000},dialectOptions:{connectTimeout:10000,ssl:{...getRdsSsl()}}});
 try{return await db.transaction(transaction=>apply(db,{transaction}));}finally{await db.close();}
}
module.exports={NAME,COLUMNS,identity,structure,state,allowedDdl,structuralSql,apply,main};
if(require.main===module)main(process.argv.slice(2)).then(r=>console.log(JSON.stringify({outcome:'COMPRAS_PRECISAO_SCHEMA_DEV',...r,
 financial_data_writes:0,business_data_writes:0,external_calls:0}))).catch(e=>{
 console.error(/^COMPRAS_PRECISAO_DEV_[A-Z0-9_]+$/.test(e.message||'')?e.message:'COMPRAS_PRECISAO_DEV_SCHEMA_INTERROMPIDO_SEM_SEGREDOS');process.exitCode=1;
});
