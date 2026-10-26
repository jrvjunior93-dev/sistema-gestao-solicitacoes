'use strict';
// Importacao pura; CLI exclusiva DEV. Nenhum runner generico de migrations.
const fs=require('node:fs'),path=require('node:path');
const NAME='202610260001_pagamento_autorizacao_valor.js';
const ALIAS='202610240003_fiscal_nsdocs_historico.js',LEGACY='202610240001_fiscal_nsdocs_capturas.js';
const TABLES=['pagamento_autorizacao_itens','pagamentos_manuais_fila'];
const BACKEND='/home/ubuntu/sistema-gestao-solicitacoes-dev/backend';
const check=(ok,code)=>{if(!ok)throw Error(code);};
async function identity(query){
 const [[id]]=await query('SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco');
 check(id?.uuid==='60f043e9-4025-11f1-9a61-06d8a063012d'&&id.banco==='gestao_solicitacoes','VALOR_DEV_BANCO_DIVERGENTE');
 const [tls]=await query("SHOW SESSION STATUS LIKE 'Ssl_cipher'");check(Boolean(tls[0]?.Value),'VALOR_DEV_TLS_OBRIGATORIO');
}
async function state(query,files=fs.readdirSync(path.resolve(__dirname,'../migrations'))){
 const [rows]=await query('SELECT name FROM schema_migrations ORDER BY name');const executed=new Set(rows.map(r=>r.name));
 const pending=files.filter(n=>n.endsWith('.js')&&!executed.has(n)).sort();
 check(pending.every(n=>[NAME,ALIAS].includes(n)),'VALOR_DEV_OUTRAS_MIGRATIONS_PENDENTES');
 if(pending.includes(ALIAS))check(executed.has(LEGACY),'VALOR_DEV_SCHEMA_NSDOCS_LEGADO_AUSENTE');
 const [columns]=await query("SELECT TABLE_NAME, DATA_TYPE, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('pagamento_autorizacao_itens','pagamentos_manuais_fila') AND COLUMN_NAME='autorizacao_valor_json'");
 check(columns.every(c=>TABLES.includes(c.TABLE_NAME)&&c.DATA_TYPE==='json'&&c.IS_NULLABLE==='YES'),'VALOR_DEV_COLUNA_INCOMPATIVEL');
 const structure=columns.length===2&&TABLES.every(t=>columns.some(c=>c.TABLE_NAME===t));
 check(!executed.has(NAME)||structure,'VALOR_DEV_LEDGER_SCHEMA_DIVERGENTE');
 return{migration:NAME,pending,applied:executed.has(NAME),structure_ok:structure,alias_applied:executed.has(ALIAS)};
}
function structuralSql(sql,readOnly=false){
 check(typeof sql==='string','VALOR_DEV_SQL_INVALIDO');
 const text=sql.trim().replace(/;$/,'');
 const read=/^(SELECT|SHOW)\b/i.test(text)&&!/[;]|\b(?:INSERT|UPDATE|DELETE|REPLACE|TRUNCATE|DROP|OUTFILE|DUMPFILE|LOAD_FILE|FOR\s+UPDATE)\b/i.test(text);
 const ddl=TABLES.some(t=>text===`ALTER TABLE \`${t}\` ADD \`autorizacao_valor_json\` JSON`);
 check(read||!readOnly&&ddl,'VALOR_DEV_DDL_FORA_DO_ESCOPO');
}
async function apply(db,dependencies={}){
 const query=db.query.bind(db);let locked=false;
 try{
  await identity(query);
  const [[lock]]=await query("SELECT GET_LOCK('fluxy_autorizacao_valor_dev_schema', 0) AS acquired");
  check(Number(lock?.acquired)===1,'VALOR_DEV_SCHEMA_OCUPADO');locked=true;
  const before=await state(query,dependencies.files);
  const DataTypes=dependencies.DataTypes||require('sequelize').DataTypes;
  if(before.pending.includes(ALIAS)){
   // A migration 003 replica a 001 ja aplicada no DEV. Apenas validar: qualquer
   // CREATE/ALTER/indice pretendido por ela sera rejeitado antes da execucao.
   db.query=async(sql,...args)=>{structuralSql(typeof sql==='string'?sql:sql?.query,true);return query(sql,...args);};
   const aliasTypes=typeof db.normalizeDataType==='function'?{...DataTypes,
    JSON:db.normalizeDataType(DataTypes.JSON),DATE:db.normalizeDataType(DataTypes.DATE)}:DataTypes;
   await (dependencies.alias||require('../migrations/'+ALIAS)).up({sequelize:db,queryInterface:db.getQueryInterface(),DataTypes:aliasTypes});
   db.query=query;
   await query('INSERT INTO schema_migrations (name) VALUES (?)',{replacements:[ALIAS]});
  }
  db.query=async(sql,...args)=>{structuralSql(typeof sql==='string'?sql:sql?.query);return query(sql,...args);};
  await (dependencies.migration||require('../migrations/'+NAME)).up({queryInterface:db.getQueryInterface(),DataTypes});
  db.query=query;
  const shape=await state(query,dependencies.files);check(shape.structure_ok,'VALOR_DEV_SCHEMA_INCOMPLETO');
  if(!before.applied)await query('INSERT INTO schema_migrations (name) VALUES (?)',{replacements:[NAME]});
  const after=await state(query,dependencies.files);check(after.applied&&after.structure_ok&&after.pending.length===0,'VALOR_DEV_SCHEMA_FINAL_DIVERGENTE');
  return{...after,applied_now:!before.applied,alias_validated_only:before.pending.includes(ALIAS)};
 }finally{db.query=query;if(locked)await query("SELECT RELEASE_LOCK('fluxy_autorizacao_valor_dev_schema') AS released");}
}
async function main(args){
 check(args.length===1&&['--conferir','--aplicar'].includes(args[0]),'VALOR_DEV_ARGUMENTOS_INVALIDOS');
 const runtime=require('../src/modules/fiscal/services/nsdocs/manual/runtime');runtime.assertDevProcess();
 if(args[0]==='--conferir')return runtime.withDevReadDatabase(async db=>{await identity(db.query.bind(db));return state(db.query.bind(db));});
 check(process.env.CONFIRM_DEV_BACKUP==='SIM'&&process.env.CONFIRM_AUTORIZACAO_VALOR_DEV_SCHEMA==='SIM','VALOR_DEV_CONFIRME_BACKUP_E_SCHEMA');
 const {env}=require('../src/config/env');const {Sequelize}=require('sequelize');
 const {getRdsSsl}=require('../src/modules/fiscal/services/nsdocs/manual/rdsTls');
 const db=new Sequelize(env.dbName,env.dbUser,env.dbPassword,{host:env.dbHost,port:env.dbPort,dialect:'mysql',logging:false,
  pool:{max:1,min:0,acquire:15000},dialectOptions:{connectTimeout:10000,ssl:{...getRdsSsl()}}});
 try{return await apply(db);}finally{await db.close();}
}
module.exports={NAME,ALIAS,LEGACY,TABLES,identity,state,structuralSql,apply,main};
if(require.main===module)main(process.argv.slice(2)).then(r=>console.log(JSON.stringify({outcome:'AUTORIZACAO_VALOR_SCHEMA_DEV',...r,financial_data_writes:0,external_calls:0}))).catch(e=>{
 console.error(/^VALOR_DEV_[A-Z0-9_]+$/.test(e.message||'')?e.message:'VALOR_DEV_SCHEMA_INTERROMPIDO_SEM_SEGREDOS');process.exitCode=1;
});
