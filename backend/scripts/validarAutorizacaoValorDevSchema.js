'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const op=require('./autorizacaoValorDevSchema');
function fixture(){
 const executed=new Set([op.LEGACY]),columns=[],calls=[];let failSecond=false;
 const db={async query(sql,opts){calls.push(sql);
  if(sql.includes('server_uuid'))return[[{uuid:'60f043e9-4025-11f1-9a61-06d8a063012d',banco:'gestao_solicitacoes'}]];
  if(sql.startsWith('SHOW SESSION'))return[[{Value:'TLS_AES'}]];
  if(sql.includes('GET_LOCK'))return[[{acquired:1}]];
  if(sql.startsWith('SELECT name'))return[[...executed].map(name=>({name}))];
  if(sql.includes('information_schema.COLUMNS'))return[columns];
  if(sql.startsWith('INSERT INTO schema_migrations')){executed.add(opts.replacements[0]);return[[]];}
  if(sql.startsWith('ALTER TABLE')){if(failSecond&&sql.includes('pagamentos_manuais_fila'))throw Error('DDL interrompida');
   columns.push({TABLE_NAME:sql.match(/`([^`]+)`/)[1],DATA_TYPE:'json',IS_NULLABLE:'YES'});return[[]];}
  return[[]];
 },getQueryInterface(){return{
  describeTable:async table=>columns.some(c=>c.TABLE_NAME===table)?{autorizacao_valor_json:{type:'JSON',allowNull:true}}:{},
  addColumn:async(table,name)=>db.query(`ALTER TABLE \`${table}\` ADD \`${name}\` JSON;`)
 };}};
 const dependencies={files:[op.LEGACY,op.ALIAS,op.NAME],DataTypes:{JSON:'JSON'},
  alias:{up:async()=>db.query('SELECT 1 AS schema_conferido')}};
 return{db,dependencies,executed,columns,calls,fail:value=>{failSecond=value;}};
}
test('DEV: duas colunas e ledger; alias NSDOCS somente leitura; replay sem DDL',async()=>{
 const f=fixture();const r=await op.apply(f.db,f.dependencies);
 assert(r.applied&&r.structure_ok&&r.alias_validated_only);assert.equal(f.columns.length,2);
 assert.equal(f.calls.filter(s=>s.startsWith('ALTER')).length,2);
 const before=f.calls.length;await op.apply(f.db,f.dependencies);
 assert.equal(f.calls.slice(before).filter(s=>s.startsWith('ALTER')||s.startsWith('INSERT')).length,0);
 assert(f.calls.every(s=>!/\b(DELETE|UPDATE|DROP|TRUNCATE)\b/i.test(s)));
});
test('DDL parcial e retomavel sem perder auditoria ou repetir coluna',async()=>{
 const f=fixture();f.fail(true);await assert.rejects(op.apply(f.db,f.dependencies),/DDL interrompida/);
 assert.equal(f.columns.length,1);assert(!f.executed.has(op.NAME));
 f.fail(false);await op.apply(f.db,f.dependencies);assert.equal(f.columns.length,2);assert(f.executed.has(op.NAME));
});
test('alias exige schema DEV anterior e nunca pode criar/alterar objetos NSDOCS',async()=>{
 let f=fixture();f.executed.clear();await assert.rejects(op.apply(f.db,f.dependencies),/LEGADO_AUSENTE|OUTRAS_MIGRATIONS/);
 f=fixture();f.dependencies.alias={up:async()=>f.db.query('CREATE TABLE nsdocs_qualquer (id INT)')};
 await assert.rejects(op.apply(f.db,f.dependencies),/FORA_DO_ESCOPO/);assert.equal(f.columns.length,0);assert(!f.executed.has(op.ALIAS));
});
test('identidade, TLS, migration estranha e coluna divergente interrompem antes de DDL',async()=>{
 for(const change of[f=>f.dependencies.files.push('estranha.js'),f=>f.columns.push({TABLE_NAME:op.TABLES[0],DATA_TYPE:'varchar',IS_NULLABLE:'YES'})]){
  const f=fixture();change(f);await assert.rejects(op.apply(f.db,f.dependencies));assert.equal(f.calls.filter(s=>s.startsWith('ALTER')).length,0);
 }
 const f=fixture(),query=f.db.query;f.db.query=async function(sql,...a){if(sql.includes('server_uuid'))return[[{uuid:'producao',banco:'gestao_solicitacoes'}]];return query.call(this,sql,...a);};
 await assert.rejects(op.apply(f.db,f.dependencies),/BANCO_DIVERGENTE/);assert.equal(f.columns.length,0);
 const t=fixture(),tq=t.db.query;t.db.query=async function(sql,...a){if(sql.startsWith('SHOW SESSION'))return[[{Value:''}]];return tq.call(this,sql,...a);};
 await assert.rejects(op.apply(t.db,t.dependencies),/TLS_OBRIGATORIO/);assert.equal(t.columns.length,0);
});
test('guardas SQL rejeitam dados, alvos extras, comandos empilhados e DDL no alias',()=>{
 for(const table of op.TABLES)op.structuralSql(`ALTER TABLE \`${table}\` ADD \`autorizacao_valor_json\` JSON;`);
 for(const sql of['UPDATE titulos_financeiros SET valor=1','DELETE FROM schema_migrations','DROP TABLE x','ALTER TABLE `x` ADD `autorizacao_valor_json` JSON','SELECT 1; DROP TABLE x','SELECT 1 INTO OUTFILE "/tmp/a"'])assert.throws(()=>op.structuralSql(sql));
 assert.throws(()=>op.structuralSql('ALTER TABLE `pagamento_autorizacao_itens` ADD `autorizacao_valor_json` JSON',true));
});
test('alias real confere schema 001 em tipos MySQL sem DDL NSDOCS',async()=>{
 const {Sequelize,DataTypes}=require('sequelize');
 const dialect=new Sequelize('offline','offline','offline',{dialect:'mysql',logging:false});
 dialect.connectionManager.getConnection=async()=>{throw Error('Conexao real proibida');};
 const schemas={};const indices=[{unique:true,fields:[{attribute:'capture_id'},{attribute:'access_key'}]}];
 await require('../migrations/'+op.LEGACY).up({DataTypes,sequelize:{query:async()=>[[{total:0}]]},queryInterface:{
  createTable:async(table,shape)=>{schemas[table]=Object.fromEntries(Object.entries(shape).map(([k,v])=>[k,{type:String(dialect.normalizeDataType(v.type)),allowNull:v.allowNull??true,primaryKey:v.primaryKey===true}]));},
  showIndex:async()=>indices
 }});
 const f=fixture(),query=f.db.query,qi=f.db.getQueryInterface();
 f.db.query=async function(sql,...a){if(sql.includes('information_schema.TABLES'))return[[{total:1}]];return query.call(this,sql,...a);};
 f.db.normalizeDataType=t=>dialect.normalizeDataType(t);
 f.db.getQueryInterface=()=>({...qi,describeTable:async t=>schemas[t]||qi.describeTable(t),showIndex:async()=>indices});
 f.dependencies.DataTypes=DataTypes;f.dependencies.alias=require('../migrations/'+op.ALIAS);
 await op.apply(f.db,f.dependencies);assert.equal(f.columns.length,2);
 assert(f.calls.filter(s=>s.startsWith('ALTER')).every(s=>/pagamento_autorizacao_itens|pagamentos_manuais_fila/.test(s)));
 schemas.fiscal_nsdocs_captures.request_json.type='TEXT';
 f.executed.delete(op.ALIAS);
 await assert.rejects(op.apply(f.db,f.dependencies),/incompativel/);
});
