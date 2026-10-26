'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Sequelize,DataTypes}=require('sequelize'),doctor=require('./compraReorganizacaoProdSchema'),migration=require('../migrations/'+doctor.NAME);
function fixture(){
 const db=new Sequelize('offline','offline','offline',{dialect:'mysql',logging:false}),ddl=[...doctor.allowedDdl(db)],tx={connection:{id:'CANAL_PROD'}},seen=[];
 const live={columns:[],indexes:[],applied:false,uuid:'5ed4b970-009f-11f1-809c-0ad0e0c90c53',tls:true,failIndex:false};
 const cols=()=>Object.entries(migration.shape(DataTypes)).map(([k,v])=>({COLUMN_NAME:k,COLUMN_TYPE:String(db.normalizeDataType(v.type)),IS_NULLABLE:v.allowNull?'YES':'NO',COLUMN_KEY:v.primaryKey?'PRI':''}));
 const indexes=()=>[{Key_name:'uq_compra_reorg_lote_sc',Non_unique:0,Seq_in_index:1,Column_name:'lote_id'},{Key_name:'uq_compra_reorg_lote_sc',Non_unique:0,Seq_in_index:2,Column_name:'solicitacao_compra_id'}];
 db.query=async(sql,options)=>{seen.push(sql);if(options)assert.equal(options.transaction,tx);
  if(sql.includes('@@GLOBAL.server_uuid'))return[[{uuid:live.uuid,banco:'gestao_solicitacoes'}]];
  if(sql.startsWith('SHOW SESSION STATUS'))return[[{Variable_name:'Ssl_cipher',Value:live.tls?'TLS_AES_256_GCM_SHA384':''},{Variable_name:'Ssl_version',Value:'TLSv1.3'}]];
  if(sql.includes('GET_LOCK'))return[[{acquired:1}]];if(sql.includes('RELEASE_LOCK'))return[[{released:1}]];
  if(sql==='SELECT name FROM schema_migrations ORDER BY name')return[[{name:'old.js'},...(live.applied?[{name:doctor.NAME}]:[])]];
  if(sql.includes('information_schema.COLUMNS'))return[live.columns];
  if(sql.startsWith('SHOW INDEX FROM'))return[live.indexes];
  if(sql.startsWith('INSERT INTO schema_migrations')){assert.deepEqual(options.replacements,[doctor.NAME]);live.applied=true;return[];}
  if(sql===ddl[0]){live.columns=cols();return[];}
  if(sql===ddl[1]){if(live.failIndex)throw Error('QA_INDEX_INTERROMPIDO');live.indexes=indexes();return[];}
  throw Error('SQL_NAO_ESPERADO');
 };
 const mockMigration={up:async()=>{if(!live.columns.length)await db.query(ddl[0]);if(!live.indexes.length)await db.query(ddl[1]);}};
 const run=()=>doctor.apply(db,{transaction:tx,files:['old.js',doctor.NAME],migration:mockMigration});
 return{db,ddl,tx,seen,live,run};
}
test('DDL permitido coincide com CREATE/indice gerados pelo Sequelize MySQL real',async()=>{
 const f=fixture(),sql=[];f.db.query=async q=>{sql.push(q);return[];};
 await f.db.getQueryInterface().createTable(doctor.TABLE,migration.shape(DataTypes));
 await f.db.getQueryInterface().addIndex(doctor.TABLE,['lote_id','solicitacao_compra_id'],{unique:true,name:'uq_compra_reorg_lote_sc'});
 assert.deepEqual(sql.map(q=>q.trim().replace(/;$/,'')),f.ddl);
});
test('aplicar somente journal/ledger e repetir sem DDL ou ledger duplicado',async()=>{
 const f=fixture();let r=await f.run();assert(r.applied&&r.structure_ok&&r.applied_now);r=await f.run();assert(!r.applied_now);
 assert.equal(f.seen.filter(s=>s===f.ddl[0]).length,1);assert.equal(f.seen.filter(s=>s.startsWith('INSERT INTO schema_migrations')).length,1);
});
test('falha entre tabela e indice conserva estrutura e permite retomada aditiva',async()=>{
 const f=fixture();f.live.failIndex=true;await assert.rejects(f.run(),/QA_INDEX/);assert(f.live.columns.length);assert(!f.live.applied);
 f.live.failIndex=false;assert((await f.run()).applied);assert.equal(f.seen.filter(s=>s===f.ddl[0]).length,1);assert(!f.seen.some(s=>/^DROP|DELETE|TRUNCATE/.test(s)));
});
test('UUID ou TLS divergentes impedem qualquer DDL',async()=>{
 for(const key of['uuid','tls']){const f=fixture();f.live[key]=key==='uuid'?'DEV':false;await assert.rejects(f.run());assert(!f.seen.some(s=>f.ddl.includes(s)));}
});
test('SQL fora do journal e leitura com escrita/exportacao sao recusados',()=>{
 const f=fixture();for(const sql of f.ddl){doctor.structuralSql(sql,new Set(f.ddl));assert.throws(()=>doctor.structuralSql(sql));}
 for(const sql of['DELETE FROM titulos_financeiros','DROP TABLE compra_reorganizacao_operacoes','ALTER TABLE solicitacoes DROP valor','SELECT 1; DELETE FROM x','SELECT 1 INTO OUTFILE \'x\'','UPDATE compra_reorganizacao_operacoes SET status=1',f.ddl[0].replace('VARCHAR(64)','VARCHAR(65)')])assert.throws(()=>doctor.structuralSql(sql,new Set(f.ddl)));
});
test('outra migration pendente e ledger sem tabela sao recusados',async()=>{
 let f=fixture();await assert.rejects(doctor.state(f.db.query,{files:['old.js',doctor.NAME,'outra.js']}),/OUTRAS_MIGRATIONS/);
 f=fixture();f.live.applied=true;await assert.rejects(doctor.state(f.db.query,{files:['old.js',doctor.NAME]}),/LEDGER_SCHEMA/);
});
test('CLI carrega dotenv antes das guardas DEV e nunca importa models ou runner geral',()=>{
 const s=fs.readFileSync(path.join(__dirname,'compraReorganizacaoProdSchema.js'),'utf8');assert(s.indexOf("require('dotenv').config")<s.indexOf('runtime.assertProdProcess()'));assert(!s.includes("require('../src/models')"));assert(s.includes('CONFIRM_SC_REVERSIVEL_PROD_SCHEMA'));assert(s.includes('withProdReadDatabase'));
});
