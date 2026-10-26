'use strict';
// Importacao pura. Somente duas colunas aditivas; sem runner geral ou backfill.
const fs=require('node:fs'),path=require('node:path');
const NAME='202610260001_pagamento_autorizacao_valor.js';
const TABLES=['pagamento_autorizacao_itens','pagamentos_manuais_fila'];
const check=(ok,code)=>{if(!ok)throw Error(code);};
async function identity(query){
 const [[id]]=await query('SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco');
 check(id?.uuid==='5ed4b970-009f-11f1-809c-0ad0e0c90c53'&&id.banco==='gestao_solicitacoes','VALOR_PROD_BANCO_DIVERGENTE');
 const [tls]=await query("SHOW SESSION STATUS WHERE Variable_name IN ('Ssl_cipher','Ssl_version')");
 check(tls.some(r=>r.Variable_name==='Ssl_cipher'&&r.Value)&&tls.some(r=>r.Variable_name==='Ssl_version'&&/^TLSv1\.[23]$/.test(r.Value)),'VALOR_PROD_TLS_OBRIGATORIO');
}
async function state(query,files=fs.readdirSync(path.resolve(__dirname,'../migrations'))){
 const [rows]=await query('SELECT name FROM schema_migrations ORDER BY name');const executed=new Set(rows.map(r=>r.name));
 const pending=files.filter(n=>n.endsWith('.js')&&!executed.has(n)).sort();
 check(pending.every(n=>n===NAME),'VALOR_PROD_OUTRAS_MIGRATIONS_PENDENTES');
 const [columns]=await query("SELECT TABLE_NAME, DATA_TYPE, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('pagamento_autorizacao_itens','pagamentos_manuais_fila') AND COLUMN_NAME='autorizacao_valor_json'");
 check(columns.every(c=>TABLES.includes(c.TABLE_NAME)&&c.DATA_TYPE==='json'&&c.IS_NULLABLE==='YES'),'VALOR_PROD_COLUNA_INCOMPATIVEL');
 const structure=columns.length===2&&TABLES.every(t=>columns.some(c=>c.TABLE_NAME===t));
 check(!executed.has(NAME)||structure,'VALOR_PROD_LEDGER_SCHEMA_DIVERGENTE');
 return{migration:NAME,pending,applied:executed.has(NAME),structure_ok:structure};
}
function structuralSql(sql){
 check(typeof sql==='string','VALOR_PROD_SQL_INVALIDO');const text=sql.trim().replace(/;$/,'');
 const read=/^(SELECT|SHOW)\b/i.test(text)&&!/[;]|\b(?:INSERT|UPDATE|DELETE|REPLACE|TRUNCATE|DROP|OUTFILE|DUMPFILE|LOAD_FILE|FOR\s+UPDATE)\b/i.test(text);
 const ddl=TABLES.some(t=>text===`ALTER TABLE \`${t}\` ADD \`autorizacao_valor_json\` JSON`);
 check(read||ddl,'VALOR_PROD_DDL_FORA_DO_ESCOPO');
}
async function apply(db,dependencies={}){
 const query=db.query.bind(db);let locked=false;
 try{
  await identity(query);
  const [[lock]]=await query("SELECT GET_LOCK('fluxy_autorizacao_valor_prod_schema', 0) AS acquired");
  check(Number(lock?.acquired)===1,'VALOR_PROD_SCHEMA_OCUPADO');locked=true;
  const before=await state(query,dependencies.files);
  db.query=async(sql,...args)=>{structuralSql(typeof sql==='string'?sql:sql?.query);return query(sql,...args);};
  await (dependencies.migration||require('../migrations/'+NAME)).up({queryInterface:db.getQueryInterface(),DataTypes:dependencies.DataTypes||require('sequelize').DataTypes});
  db.query=query;
  const shape=await state(query,dependencies.files);check(shape.structure_ok,'VALOR_PROD_SCHEMA_INCOMPLETO');
  if(!before.applied)await query('INSERT INTO schema_migrations (name) VALUES (?)',{replacements:[NAME]});
  const after=await state(query,dependencies.files);check(after.applied&&after.structure_ok&&!after.pending.length,'VALOR_PROD_SCHEMA_FINAL_DIVERGENTE');
  return{...after,applied_now:!before.applied};
 }finally{db.query=query;if(locked)await query("SELECT RELEASE_LOCK('fluxy_autorizacao_valor_prod_schema') AS released");}
}
async function main(args){
 check(args.length===1&&['--conferir','--aplicar'].includes(args[0]),'VALOR_PROD_ARGUMENTOS_INVALIDOS');
 const runtime=require('../src/modules/fiscal/services/nsdocsHistorical/manual/runtime');runtime.assertProdProcess();
 check(!process.env.NODE_OPTIONS&&process.env.NODE_TLS_REJECT_UNAUTHORIZED!=='0'&&process.env.ALLOW_SCHEMA_MIGRATIONS!=='true','VALOR_PROD_AMBIENTE_INSEGURO');
 if(args[0]==='--conferir')return runtime.withProdReadDatabase(async db=>{await identity(db.query.bind(db));return state(db.query.bind(db));});
 check(['CONFIRM_PROD_BACKUP','CONFIRM_PROD_BACKUP_TIMER','CONFIRM_PROD_MAINTENANCE','CONFIRM_AUTORIZACAO_VALOR_PROD_SCHEMA'].every(k=>process.env[k]==='SIM'),'VALOR_PROD_CONFIRME_BACKUP_TIMER_JANELA_SCHEMA');
 check(require('node:child_process').execFileSync('/usr/bin/git',['--no-optional-locks','branch','--show-current'],{encoding:'utf8',timeout:5000,stdio:['ignore','pipe','ignore']}).trim()==='main','VALOR_PROD_BRANCH_INVALIDA');
 require('node:child_process').execFileSync('/usr/bin/systemctl',['is-active','--quiet','fluxy-prod-db-backup.timer'],{timeout:5000,stdio:'ignore',env:{PATH:'/usr/bin:/bin',LANG:'C'}});
 const {env,validateRequiredEnv}=require('../src/config/env');validateRequiredEnv();
 require('../src/modules/fiscal/services/nsdocsHistorical/manual/policy').validateFlags(require('dotenv').parse(fs.readFileSync('.env')));
 const {Sequelize}=require('sequelize'),{getRdsSsl}=require('../src/modules/fiscal/services/nsdocsHistorical/manual/rdsTls');
 const db=new Sequelize(env.dbName,env.dbUser,env.dbPassword,{host:env.dbHost,port:env.dbPort,dialect:'mysql',logging:false,
  pool:{max:1,min:0,acquire:15000},dialectOptions:{connectTimeout:10000,ssl:{...getRdsSsl()}}});
 try{return await apply(db);}finally{await db.close();}
}
module.exports={NAME,TABLES,identity,state,structuralSql,apply,main};
if(require.main===module)main(process.argv.slice(2)).then(r=>console.log(JSON.stringify({outcome:'AUTORIZACAO_VALOR_SCHEMA_PROD',...r,financial_data_writes:0,external_calls:0}))).catch(e=>{
 console.error(/^VALOR_PROD_[A-Z0-9_]+$/.test(e.message||'')?e.message:'VALOR_PROD_SCHEMA_INTERROMPIDO_SEM_SEGREDOS');process.exitCode=1;
});
