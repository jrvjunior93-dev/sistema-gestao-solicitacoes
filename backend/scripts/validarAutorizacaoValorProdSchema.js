'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const op=require('./autorizacaoValorProdSchema');
function fixture(){
 const executed=new Set(),columns=[],calls=[];let failSecond=false;
 const db={async query(sql,opts){calls.push(sql);
  if(sql.includes('server_uuid'))return[[{uuid:'5ed4b970-009f-11f1-809c-0ad0e0c90c53',banco:'gestao_solicitacoes'}]];
  if(sql.startsWith('SHOW SESSION'))return[[{Variable_name:'Ssl_cipher',Value:'TLS_AES'},{Variable_name:'Ssl_version',Value:'TLSv1.3'}]];
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
 return{db,dependencies:{files:[op.NAME],DataTypes:{JSON:'JSON'}},executed,columns,calls,fail:value=>{failSecond=value;}};
}
test('PROD: somente duas colunas e ledger; replay sem DDL ou escrita financeira',async()=>{
 const f=fixture(),r=await op.apply(f.db,f.dependencies);assert(r.applied&&r.structure_ok);assert.equal(f.columns.length,2);
 assert.equal(f.calls.filter(s=>s.startsWith('ALTER')).length,2);
 const before=f.calls.length;await op.apply(f.db,f.dependencies);
 assert.equal(f.calls.slice(before).filter(s=>s.startsWith('ALTER')||s.startsWith('INSERT')).length,0);
 assert(f.calls.every(s=>!/\b(DELETE|UPDATE|DROP|TRUNCATE)\b/i.test(s)));
});
test('DDL parcial retoma e registra ledger somente depois das duas colunas',async()=>{
 const f=fixture();f.fail(true);await assert.rejects(op.apply(f.db,f.dependencies),/DDL interrompida/);
 assert.equal(f.columns.length,1);assert(!f.executed.has(op.NAME));
 assert(f.calls.some(s=>s.includes('RELEASE_LOCK')));
 f.fail(false);await op.apply(f.db,f.dependencies);assert.equal(f.columns.length,2);assert(f.executed.has(op.NAME));
});
test('UUID DEV, TLS vazio/antigo, migration estranha e coluna divergente bloqueiam antes do DDL',async()=>{
 for(const change of[f=>f.dependencies.files.push('estranha.js'),f=>f.columns.push({TABLE_NAME:op.TABLES[0],DATA_TYPE:'varchar',IS_NULLABLE:'YES'}),f=>f.executed.add(op.NAME)]){
  const f=fixture();change(f);await assert.rejects(op.apply(f.db,f.dependencies));assert.equal(f.calls.filter(s=>s.startsWith('ALTER')).length,0);
 }
 for(const replacement of[
  sql=>sql.includes('server_uuid')?[[{uuid:'60f043e9-4025-11f1-9a61-06d8a063012d',banco:'gestao_solicitacoes'}]]:null,
  sql=>sql.startsWith('SHOW SESSION')?[[{Variable_name:'Ssl_cipher',Value:''},{Variable_name:'Ssl_version',Value:'TLSv1.3'}]]:null,
  sql=>sql.startsWith('SHOW SESSION')?[[{Variable_name:'Ssl_cipher',Value:'TLS_AES'},{Variable_name:'Ssl_version',Value:'TLSv1.1'}]]:null
 ]){const f=fixture(),query=f.db.query;f.db.query=async(sql,...args)=>replacement(sql)||query(sql,...args);
  await assert.rejects(op.apply(f.db,f.dependencies));assert.equal(f.columns.length,0);}
});
test('guarda rejeita SQL financeiro, comandos empilhados, outro alvo e exportacao',()=>{
 for(const table of op.TABLES)op.structuralSql(`ALTER TABLE \`${table}\` ADD \`autorizacao_valor_json\` JSON;`);
 for(const sql of['UPDATE titulos_financeiros SET valor=1','DELETE FROM schema_migrations','DROP TABLE x','ALTER TABLE `x` ADD `autorizacao_valor_json` JSON','SELECT 1; DROP TABLE x','SELECT 1 INTO OUTFILE "/tmp/a"'])assert.throws(()=>op.structuralSql(sql));
});
test('DDL real gerado pelo Sequelize MySQL e aceito sem conexao de rede',async()=>{
 const {Sequelize,DataTypes}=require('sequelize'),f=fixture();
 const db=new Sequelize('offline','offline','offline',{dialect:'mysql',logging:false});
 db.connectionManager.getConnection=async()=>{throw Error('Conexao real proibida');};
 db.query=async(sql)=>{op.structuralSql(sql);const table=sql.match(/ALTER TABLE `([^`]+)`/)[1];
  f.columns.push({TABLE_NAME:table,DATA_TYPE:'json',IS_NULLABLE:'YES'});};
 const qi=f.db.getQueryInterface();f.db.getQueryInterface=()=>({...db.getQueryInterface(),describeTable:qi.describeTable,
  addColumn:(...args)=>db.getQueryInterface().addColumn(...args)});
 f.dependencies.DataTypes=DataTypes;await op.apply(f.db,f.dependencies);assert.equal(f.columns.length,2);
});
