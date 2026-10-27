'use strict';
const fs=require('node:fs'),path=require('node:path');
const {Sequelize,DataTypes}=require('sequelize');
const {withDevReadDatabase,assertDevProcess}=require('../src/modules/fiscal/services/nsdocs/manual/runtime');
const {getRdsSsl}=require('../src/modules/fiscal/services/nsdocs/manual/rdsTls');
const NAME='202610240002_fiscal_vinculos_pedidos.js';
const DIRECTORY=path.resolve(__dirname,'../migrations');
const check=(ok,code)=>{if(!ok)throw Error(code);};
function verifyStructure(columns,indices){
  const byName=new Map(columns.map(c=>[c.COLUMN_NAME,c]));
  const key=byName.get('purchase_link_key'),amount=byName.get('allocated_value');
  const index=indices.filter(i=>i.INDEX_NAME==='ux_fiscal_purchase_link').sort((a,b)=>Number(a.SEQ_IN_INDEX)-Number(b.SEQ_IN_INDEX));
  return Boolean(key&&key.DATA_TYPE==='varchar'&&Number(key.CHARACTER_MAXIMUM_LENGTH)===100&&key.IS_NULLABLE==='YES'&&
    amount&&amount.DATA_TYPE==='decimal'&&Number(amount.NUMERIC_PRECISION)===14&&Number(amount.NUMERIC_SCALE)===2&&amount.IS_NULLABLE==='YES'&&
    index.length===2&&index.every(i=>Number(i.NON_UNIQUE)===0&&i.SUB_PART==null)&&index.map(i=>i.COLUMN_NAME).join(',')==='fiscal_dfe_document_id,purchase_link_key');
}
async function state(query,files=fs.readdirSync(DIRECTORY)){
  const [ledger]=await query('SELECT name FROM schema_migrations ORDER BY name');
  const applied=ledger.some(r=>r.name===NAME),known=new Set(ledger.map(r=>r.name));
  const pending=files.filter(f=>f.endsWith('.js')&&!known.has(f)).sort();
  check(pending.every(f=>f===NAME),'FISCAL_SCHEMA_OUTRAS_MIGRATIONS_PENDENTES');
  const [columns]=await query("SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='fiscal_document_links' AND COLUMN_NAME IN ('purchase_link_key','allocated_value')");
  const [indices]=await query("SELECT INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, SUB_PART FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='fiscal_document_links' AND INDEX_NAME='ux_fiscal_purchase_link'");
  const structure=verifyStructure(columns,indices);
  check(!applied||structure,'FISCAL_SCHEMA_LEDGER_E_ESTRUTURA_DIVERGENTES');
  return {migration:NAME,pending,applied,structure_ok:structure};
}
function structuralSql(sql){
  check(typeof sql==='string'&&!/\b(?:INSERT|UPDATE|DELETE|REPLACE|TRUNCATE|DROP|LOAD|MERGE)\b/i.test(sql),'FISCAL_DDL_FORA_DO_ESCOPO');
  check(/^\s*(?:SELECT|SHOW)\b/i.test(sql)||
    /^ALTER TABLE `?fiscal_document_links`? ADD (?:`?purchase_link_key`? VARCHAR\(100\)|`?allocated_value`? DECIMAL\(14,2\)|UNIQUE INDEX `?ux_fiscal_purchase_link`?)/i.test(sql),'FISCAL_DDL_FORA_DO_ESCOPO');
}
async function apply(sequelize,dependencies={}){
  const query=sequelize.query.bind(sequelize);let locked=false;
  try{
    const [tls]=await query("SHOW SESSION STATUS LIKE 'Ssl_cipher'");check(tls[0]?.Value,'FISCAL_SCHEMA_TLS_OBRIGATORIO');
    const [[identity]]=await query('SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco');
    check(identity.uuid==='60f043e9-4025-11f1-9a61-06d8a063012d'&&identity.banco==='gestao_solicitacoes','FISCAL_SCHEMA_FORA_DO_BANCO_DEV');
    const [[lock]]=await query("SELECT GET_LOCK('fluxy_fiscal_purchase_schema_dev', 0) AS acquired");
    check(Number(lock?.acquired)===1,'FISCAL_SCHEMA_OCUPADO');locked=true;
    const before=await state(query,dependencies.files);
    sequelize.query=async(sql,...args)=>{structuralSql(typeof sql==='string'?sql:sql?.query);return query(sql,...args);};
    await (dependencies.migration||require(path.join(DIRECTORY,NAME))).up(sequelize.getQueryInterface(),DataTypes);
    sequelize.query=query;
    // MySQL DDL faz commit implicito. So registrar no ledger depois da estrutura.
    const shape=await state(query,dependencies.files);check(shape.structure_ok,'FISCAL_SCHEMA_ESTRUTURA_NAO_CONFERIDA');
    if(!before.applied)await query('INSERT INTO schema_migrations (name) VALUES (?)',{replacements:[NAME]});
    const after=await state(query,dependencies.files);check(after.applied&&after.structure_ok,'FISCAL_SCHEMA_FINAL_DIVERGENTE');
    return {...after,applied_now:!before.applied};
  }finally{sequelize.query=query;if(locked)await query("SELECT RELEASE_LOCK('fluxy_fiscal_purchase_schema_dev') AS released");}
}
async function main(args,dependencies={}){
  check(args.length===1&&['--conferir','--aplicar'].includes(args[0]),'FISCAL_SCHEMA_ARGUMENTOS_INVALIDOS');
  const diagnosis=await (dependencies.read||withDevReadDatabase)(db=>state(db.query.bind(db),dependencies.files));
  if(args[0]==='--conferir')return diagnosis;
  (dependencies.guard||assertDevProcess)();
  check(process.env.CONFIRM_DEV_BACKUP==='SIM'&&process.env.CONFIRM_FISCAL_VINCULOS_DEV_SCHEMA==='SIM','FISCAL_SCHEMA_EXIGE_BACKUP_DEV_E_CONFIRMACAO');
  const {env}=require('../src/config/env');
  const connection=new Sequelize(env.dbName,env.dbUser,env.dbPassword,{host:env.dbHost,port:env.dbPort,dialect:'mysql',logging:false,
    pool:{max:1,min:0,idle:600000,acquire:15000},dialectOptions:{connectTimeout:10000,ssl:{...getRdsSsl()}}});
  try{return await apply(connection);}finally{await connection.close();}
}
module.exports={NAME,state,verifyStructure,structuralSql,apply,main};
if(require.main===module)main(process.argv.slice(2)).then(result=>console.log(JSON.stringify({outcome:'FISCAL_VINCULOS_SCHEMA_DEV',...result,chamadas_externas:0}))).catch(error=>{
  console.error(/^(?:FISCAL|NSDOCS)_[A-Z0-9_]{1,100}$/.test(error.message||'')?error.message:'FISCAL_SCHEMA_DEV_INTERROMPIDO');
  process.exitCode=1;
});
