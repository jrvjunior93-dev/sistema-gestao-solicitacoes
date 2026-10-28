const {test}=require('node:test'),assert=require('node:assert/strict');
const schema=require('./comprasPrecisaoDevSchema.cjs');
const migration=require('../migrations/'+schema.NAME);
function fake(){
 const {Sequelize,DataTypes}=require('sequelize');
 const db=new Sequelize('qa','qa','qa',{dialect:'mysql',logging:false});
 const type=new Map(schema.COLUMNS.map(t=>[t,'DECIMAL(14,2)']));let applied=false,changes=0,records=0;
 const columns=()=>schema.COLUMNS.map(t=>({TABLE_NAME:t,COLUMN_NAME:'preco_unitario',COLUMN_TYPE:type.get(t),IS_NULLABLE:'NO',COLUMN_DEFAULT:'0.00'}));
 const calls=[];
 db.query=async(sql,o={})=>{
  calls.push(sql);
  if(sql.includes('@@GLOBAL'))return[[{uuid:'60f043e9-4025-11f1-9a61-06d8a063012d',banco:'gestao_solicitacoes'}]];
  if(sql.startsWith('SHOW SESSION'))return[[{Variable_name:'Ssl_cipher',Value:'cipher'},{Variable_name:'Ssl_version',Value:'TLSv1.3'}]];
  if(sql.includes('GET_LOCK'))return[[{acquired:1}]];
  if(sql.includes('RELEASE_LOCK'))return[[{released:1}]];
  if(sql.includes('information_schema.COLUMNS'))return[columns()];
  if(sql==='SELECT name FROM schema_migrations ORDER BY name')return[applied?[{name:schema.NAME}]:[]];
  if(sql.startsWith('INSERT INTO schema_migrations')){assert.equal(o.replacements[0],schema.NAME);applied=true;records++;return[];}
  for(const t of schema.COLUMNS)if(sql.startsWith('ALTER TABLE `'+t+'`')){type.set(t,'DECIMAL(22,10)');changes++;return[];}
  throw Error('SQL nao simulado');
 };
 const original=db.getQueryInterface().queryGenerator;
 const qi={queryGenerator:original,describeTable:async t=>({preco_unitario:{type:type.get(t)}}),
  changeColumn:async(t,c,attr)=>db.query(original.changeColumnQuery(t,original.attributesToSQL({[c]:db.normalizeAttribute(attr)},{context:'changeColumn',table:t})))};
 db.getQueryInterface=()=>qi;
 return{db,DataTypes,calls,type,counts:()=>({changes,records})};
}
test('widening real gera somente dois ALTER permitidos; ledger nomeado e replay sem novos ALTER',async()=>{
 const f=fake(),args={transaction:{connection:{}},files:[schema.NAME],DataTypes:f.DataTypes,migration};
 const first=await schema.apply(f.db,args);assert(first.applied&&first.structure_ok);
 assert.deepEqual(f.counts(),{changes:2,records:1});
 const second=await schema.apply(f.db,args);assert(!second.applied_now);
 assert.deepEqual(f.counts(),{changes:2,records:1});
 assert(!f.calls.some(s=>/\b(?:UPDATE|DELETE|DROP|TRUNCATE)\b/.test(s)));
});
test('tipos, banco, TLS, outras migrations e SQL de negocio sao recusados',async()=>{
 const f=fake();f.type.set(schema.COLUMNS[0],'DOUBLE');
 await assert.rejects(schema.state(f.db.query,{files:[schema.NAME]}),/TIPO_DIVERGENTE/);
 await assert.rejects(schema.identity(async sql=>sql.startsWith('SELECT')?[[{uuid:'prod',banco:'gestao_solicitacoes'}]]:[[]]),/BANCO_DIVERGENTE/);
 await assert.rejects(schema.identity(async sql=>sql.startsWith('SELECT')?[[{uuid:'60f043e9-4025-11f1-9a61-06d8a063012d',banco:'gestao_solicitacoes'}]]:[[]]),/TLS_OBRIGATORIO/);
 for(const s of ['UPDATE pedido_compras SET valor_total=0','DELETE FROM pedido_compra_itens','ALTER TABLE pedido_compras ADD x INT','SELECT 1; DELETE FROM x'])assert.throws(()=>schema.structuralSql(s),/FORA_ESCOPO/);
 await assert.rejects(schema.state(fake().db.query,{files:[schema.NAME,'outra.js']}),/OUTRAS_MIGRATIONS/);
});
