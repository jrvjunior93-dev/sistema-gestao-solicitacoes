'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {Sequelize}=require('sequelize');
const s=require('./fiscalVinculosDevSchema');
const cols=[{COLUMN_NAME:'purchase_link_key',DATA_TYPE:'varchar',CHARACTER_MAXIMUM_LENGTH:100,IS_NULLABLE:'YES'},
 {COLUMN_NAME:'allocated_value',DATA_TYPE:'decimal',NUMERIC_PRECISION:14,NUMERIC_SCALE:2,IS_NULLABLE:'YES'}];
const indices=['fiscal_dfe_document_id','purchase_link_key'].map((COLUMN_NAME,i)=>({INDEX_NAME:'ux_fiscal_purchase_link',COLUMN_NAME,NON_UNIQUE:0,SEQ_IN_INDEX:i+1,SUB_PART:null}));
function connection({tls=true,uuid=true,extra=false,fail=false}={}){
 let applied=false,structure=false;const calls=[];
 const connection={query:async(sql)=>{calls.push(sql);
   if(sql.includes('Ssl_cipher'))return[[{Value:tls?'TLS_TEST':''}]];
   if(sql.includes('server_uuid'))return[[{uuid:uuid?'60f043e9-4025-11f1-9a61-06d8a063012d':'outra-instancia',banco:'gestao_solicitacoes'}]];
   if(sql.includes('GET_LOCK'))return[[{acquired:1}]];
   if(sql.startsWith('SELECT name'))return[[{name:'base.js'},...(applied?[{name:s.NAME}]:[])]];
   if(sql.includes('information_schema.COLUMNS'))return[structure?cols:[]];
   if(sql.includes('information_schema.STATISTICS'))return[structure?indices:[]];
   if(sql.startsWith('INSERT INTO schema_migrations'))applied=true;
   return[[]];
 },getQueryInterface(){return{sequelize:connection};}};
 const migration={up:async qi=>{if(fail)throw Error('DDL_FALHOU');await qi.sequelize.query('ALTER TABLE `fiscal_document_links` ADD `purchase_link_key` VARCHAR(100);');structure=true;}};
 return{connection,calls,dependencies:{files:['base.js',s.NAME,...(extra?['outra.js']:[])],migration}};
}
test('forma completa do indice e das colunas; prefixo/nao unico/tipo errado nao passam',()=>{
 assert(s.verifyStructure(cols,indices));assert(!s.verifyStructure(cols,[{...indices[0],SUB_PART:10},indices[1]]));
 assert(!s.verifyStructure([{...cols[0],CHARACTER_MAXIMUM_LENGTH:10},cols[1]],indices));assert(!s.verifyStructure(cols,indices.map(i=>({...i,NON_UNIQUE:1}))));
});
test('DDL real gerado pelo Sequelize MySQL e aceito; comandos fora do alvo sao negados',()=>{
 const db=new Sequelize('qa','qa','ficticio',{dialect:'mysql',logging:false});const gen=db.getQueryInterface().queryGenerator;
 for(const [name,type]of[['purchase_link_key',Sequelize.STRING(100)],['allocated_value',Sequelize.DECIMAL(14,2)]])s.structuralSql(gen.addColumnQuery('fiscal_document_links',name,{type,allowNull:true}));
 s.structuralSql(gen.addIndexQuery('fiscal_document_links',['fiscal_dfe_document_id','purchase_link_key'],{name:'ux_fiscal_purchase_link',unique:true}));
 for(const sql of['UPDATE titulos_financeiros SET valor_saldo=0','ALTER TABLE titulos_financeiros ADD indevido INT','DROP TABLE fiscal_document_links','ALTER TABLE fiscal_document_links ADD outra_coluna INT'])assert.throws(()=>s.structuralSql(sql));
});
test('TLS/UUID antes de qualquer DDL; migration exclusiva e ledger depois da estrutura',async()=>{
 const f=connection();const result=await s.apply(f.connection,f.dependencies);assert(result.applied&&result.structure_ok&&result.applied_now);
 assert(f.calls.findIndex(x=>x.includes('server_uuid'))<f.calls.findIndex(x=>x.startsWith('ALTER')));
 assert(f.calls.findIndex(x=>x.startsWith('ALTER'))<f.calls.findIndex(x=>x.startsWith('INSERT')));
 assert(f.calls.at(-1).includes('RELEASE_LOCK'));
 const replay=await s.apply(f.connection,f.dependencies);assert.equal(replay.applied_now,false);assert.equal(f.calls.filter(x=>x.startsWith('INSERT')).length,1);
});
test('banco diferente, TLS ausente, outra migration pendente e falha de DDL nao geram ledger',async()=>{
 for(const options of[{tls:false},{uuid:false},{extra:true},{fail:true}]){const f=connection(options);await assert.rejects(s.apply(f.connection,f.dependencies));assert(!f.calls.some(x=>x.startsWith('INSERT')));}
});
