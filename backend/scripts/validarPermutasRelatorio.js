'use strict';
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {Sequelize,DataTypes}=require('sequelize');
const {filtros,consulta,relatorio}=require('../src/services/permutaRelatorioService');
// Carrega somente o modelo, sem env/models/database nem conexao MySQL.
const orm=new Sequelize('qa','qa','qa',{dialect:'mysql',logging:false});
const tabelaObras=require('../src/models/Obra')(orm,DataTypes).getTableName();
assert.equal(tabelaObras,'Obras','Manter o nome real gerado pelo modelo do sistema');
const db=new DatabaseSync(':memory:');
db.function('CONCAT_WS',{varargs:true},(sep,...v)=>v.filter(x=>x!=null).join(sep));
db.exec(`CREATE TABLE movimentos_financeiros(id INTEGER,titulo_financeiro_id INTEGER,forma_pagamento_id INTEGER,tipo_movimento TEXT,status TEXT,forma_recebimento TEXT,tipo_permuta TEXT,categoria_bem TEXT,descricao_bem TEXT,documento_referencia TEXT,valor REAL,valor_quitacao REAL,conta_bancaria_id INTEGER,baixa_grupo_id INTEGER,fila_liquidacao_id INTEGER,criado_por INTEGER,estornado_em TEXT,data_movimento TEXT,empresa_id INTEGER);
 CREATE TABLE titulos_financeiros(id INTEGER,codigo TEXT,tipo TEXT,deleted_at TEXT,obra_id INTEGER,empresa_id INTEGER,parceiro_id INTEGER);
 CREATE TABLE financeiro_formas_pagamento(id INTEGER,tipo TEXT,codigo TEXT,nome TEXT);
 CREATE TABLE parceiros(id INTEGER,nome TEXT); CREATE TABLE empresas_grupo(id INTEGER,nome TEXT); CREATE TABLE Obras(id INTEGER,nome TEXT);
 CREATE TABLE titulos_compartilhados_origens(titulo_financeiro_id INTEGER,obra_id INTEGER);
 INSERT INTO parceiros VALUES(1,'Parceiro QA'); INSERT INTO empresas_grupo VALUES(1,'Empresa QA'); INSERT INTO Obras VALUES(1,'Obra A'),(2,'Obra B');
 INSERT INTO financeiro_formas_pagamento VALUES(9,'PERMUTA','PERMUTA','Permuta');
 INSERT INTO titulos_financeiros VALUES(1,'TIT-P','PAGAR',NULL,1,1,1),(2,'TIT-R','RECEBER',NULL,1,1,1),(3,'TIT-C','PAGAR',NULL,1,1,1),(4,'TIT-X','RECEBER','2026-01-01',2,1,1);
 INSERT INTO titulos_compartilhados_origens VALUES(3,1),(3,2);`);
const insert=db.prepare('INSERT INTO movimentos_financeiros(id,titulo_financeiro_id,forma_pagamento_id,tipo_movimento,status,forma_recebimento,tipo_permuta,valor,valor_quitacao,data_movimento,empresa_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
insert.run(1,1,9,'BAIXA','ATIVO','PERMUTA',null,60,60,'2026-10-18',1);
insert.run(2,1,null,'BAIXA','ATIVO','PIX',null,140,140,'2026-10-18',1);
insert.run(3,2,null,'BAIXA','ATIVO','BENS','TERRENO',1000,1000,'2026-01-01',1);
insert.run(4,2,null,'BAIXA','ESTORNADO','PERMUTA',null,200,200,'2026-01-02',1);
insert.run(5,3,null,'BAIXA','ATIVO','PERMUTA',null,50,50,'2026-02-01',1);
insert.run(6,4,null,'BAIXA','ATIVO','PERMUTA',null,30,30,'0226-05-22',1);
// SQLite aceita obras/Obras como iguais. Conferir identificadores EXATOS antes
// de executar cada SELECT para nao mascarar novamente o erro do MySQL Linux.
const tabelas=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));
assert(tabelas.has(tabelaObras));assert(!tabelas.has('obras'));
function conferirTabelas(sql) {
  for(const m of sql.matchAll(/\b(?:FROM|JOIN)\s+`?([a-z_][a-z0-9_]*)`?/gi)) {
    if(!tabelas.has(m[1]))throw Object.assign(new Error(`Tabela inexistente: ${m[1]}`),{code:'ER_NO_SUCH_TABLE'});
  }
}
let consultas=0,perm=true,financeiro=true,scope=null;
const deps={auth:{canAccessFinanceiro:async()=>financeiro,userHasStrictAreaPermission:async()=>perm,getFinanceiroObraScopeIds:async()=>scope},db:{query:async(sql,{replacements:r})=>{
  consultas++;assert(sql.startsWith('SELECT '));
  conferirTabelas(sql);
  const pronto=sql.replace(/:(\w+)/g,(_,k)=>Array.isArray(r[k])?r[k].join(','):typeof r[k]==='number'?String(r[k]):"'"+String(r[k]).replaceAll("'","''")+"'");
  return db.prepare(pronto).all();
}}};
(async()=>{
  const from=consulta(filtros({status:'ATIVO',pagina:'1'}),null).from;
  assert(from.includes(`LEFT JOIN ${tabelaObras} o ON o.id=t.obra_id`));
  const errado=from.replace(`JOIN ${tabelaObras} o`,'JOIN obras o');
  assert.notEqual(errado,from);
  assert.throws(()=>conferirTabelas(errado),e=>e.code==='ER_NO_SUCH_TABLE','Reproduzir a referencia incorreta antes de SQLite');
  let r=await relatorio({user:{id:1}},{status:'ATIVO',pagina:'1'},deps);
  assert.equal(r.data.length,4);assert.equal(Number(r.resumo.total),4);
  assert(r.data.every(m=>m.status==='ATIVO'));assert(r.data.some(m=>m.obra==='Obra A'));
  r=await relatorio({user:{id:1}},{q:'Obra B'},deps);assert.equal(r.data.length,1);assert.equal(r.data[0].obra,'Obra B');
  r=await relatorio({user:{id:1}},{tipo:'RECEBER',obra_id:'1'},deps);assert.equal(r.data.length,1);assert.equal(r.data[0].tipo,'RECEBER');
  r=await relatorio({user:{id:1}},{status:'TODOS'},deps);
  assert.equal(Number(r.resumo.pagamentos),110);assert.equal(Number(r.resumo.recebimentos),1030);assert.equal(Number(r.resumo.estornados),200);assert.equal(r.data.length,5);
  assert(r.data.some(m=>m.data_movimento==='0226-05-22'),'Legado nao corrigido silenciosamente');
  r=await relatorio({user:{id:1}},{data_inicio:'2026-10-18',data_fim:'2026-10-18'},deps);assert.equal(r.data.length,1);assert.equal(Number(r.resumo.pagamentos),60,'PIX nao contado como permuta');
  scope=[1];r=await relatorio({user:{id:1}},{status:'TODOS'},deps);assert.equal(Number(r.resumo.pagamentos),60,'Compartilhado fora do escopo completo nao vaza');assert.equal(Number(r.resumo.recebimentos),1000);
  scope=[];r=await relatorio({user:{id:1}},{},deps);assert.equal(r.data.length,0);
  scope=null;r=await relatorio({user:{id:1}},{limite:'1',pagina:'2',status:'TODOS'},deps);assert.equal(r.data.length,1);assert.equal(r.paginacao.total,5);
  const antes=consultas;scope=[1];await assert.rejects(relatorio({user:{id:1}},{obra_id:'2'},deps),/Acesso negado/);assert.equal(consultas,antes);
  perm=false;await assert.rejects(relatorio({user:{id:1}},{},deps),/Acesso negado/);assert.equal(consultas,antes);
  perm=true;financeiro=false;await assert.rejects(relatorio({user:{id:1}},{},deps),/Acesso negado/);assert.equal(consultas,antes);
  for(const q of [{data_inicio:'2026-02-30'},{data_inicio:'2026-10-19',data_fim:'2026-10-18'},{obra_id:'1 OR 1=1'},{limite:'500'},{q:['x']},{campo_inexistente:'x'}])assert.throws(()=>filtros(q));
  console.log('Relatorio: modelo/schema Obras com casing exato antes de cada SELECT, regressao ER_NO_SUCH_TABLE reproduzida, SQL SQLite, filtros/busca/todo periodo/paginacao, legado/estornos/PIX e negativas de ACL/escopo aprovados. Sem MySQL/rede.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.close());
