'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),{Sequelize,DataTypes}=require('sequelize');
const {listarSugestoesFila}=require('../src/services/pagamentoFilaAutocompleteService');
const {validateManualPaymentQueueOptionsQuery:validate}=require('../src/validators/paymentValidators');
test('somente forma de pagamento aceita abertura sem texto e busca de um caractere',()=>{
 for(const q of [undefined,'',' ','P'])assert.equal(validate({campo:'forma_pagamento_id',q}).q,(q||'').trim());
 for(const campo of ['obra_id','favorecido','solicitacao_id','titulo_id'])for(const q of ['','P'])assert.throws(()=>validate({campo,q}));
 for(const q of [{campo:'cpf_cnpj',q:''},{campo:'forma_pagamento_id',q:'x'.repeat(121)},{campo:'forma_pagamento_id',q:'',escopo:'TODOS'}])assert.throws(()=>validate(q));
});
test('formas vem da fila/status/escopo inteiro, inclusive titulo501; nao do catalogo ou baixa',async()=>{
 const memory=new DatabaseSync(':memory:'),sequelize=new Sequelize('qa','qa','qa',{dialect:'mysql',logging:false}),db={sequelize};
 for(const name of ['PagamentoManualFilaItem','PagamentoAutorizacaoItem'])db[name]=require('../src/models/'+name)(sequelize,DataTypes);
 try{
  memory.exec(`CREATE TABLE financeiro_formas_pagamento(id INT PRIMARY KEY,nome TEXT);
   CREATE TABLE titulos_financeiros(id INT PRIMARY KEY,forma_pagamento_id INT,deleted_at TEXT,status TEXT,valor_saldo REAL);
   CREATE TABLE pagamentos_manuais_fila(id INT PRIMARY KEY,titulo_financeiro_id INT,status TEXT);
   CREATE TABLE pagamento_autorizacao_itens(id INT PRIMARY KEY,titulo_financeiro_id INT,status TEXT);
   CREATE TABLE titulos_compartilhados_origens(titulo_financeiro_id INT,obra_id INT);
   INSERT INTO financeiro_formas_pagamento VALUES(1,'PIX'),(2,'BOLETO'),(3,'CARTAO REJEITADO'),(4,'CADASTRO SEM FILA'),(5,'SOMENTE CANCELADO'),(6,'FORA DO ESCOPO');`);
  const title=memory.prepare('INSERT INTO titulos_financeiros VALUES(?,?,NULL,\'ABERTO\',100)'),queue=memory.prepare('INSERT INTO pagamentos_manuais_fila VALUES(?,?,\'PENDENTE\')');
  for(let id=1;id<=500;id++){title.run(id,1);queue.run(id,id);}title.run(501,2);queue.run(501,501);title.run(502,6);queue.run(502,502);memory.exec('INSERT INTO titulos_compartilhados_origens VALUES(502,99)');
  title.run(503,5);memory.exec("INSERT INTO pagamentos_manuais_fila VALUES(503,503,'CANCELADO')");title.run(504,4);queue.run(504,504);memory.exec("UPDATE titulos_financeiros SET deleted_at='2026-10-27' WHERE id=504");
  title.run(505,3);memory.exec("INSERT INTO pagamento_autorizacao_itens VALUES(1,505,'REJEITADO')");
  const reads=[];sequelize.query=async sql=>{assert.match(sql,/^SELECT fp.id AS id, fp.nome AS nome/);assert.match(sql,/LIMIT 101$/);assert(!/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP)\b/i.test(sql));assert(!sql.includes('pagamentos_manuais_baixas'));reads.push(sql);return memory.prepare(sql).all();};
  const req={user:{id:7}};
  const a=await listarSugestoesFila(req,validate({campo:'forma_pagamento_id',status:'PENDENTE',q:''}),db,async()=>[3]);assert.deepEqual(a.data.map(r=>r.id),[2,1]);assert.equal(a.limite,100);assert(!a.mais);
  const b=await listarSugestoesFila(req,validate({campo:'forma_pagamento_id',status:'TODOS',q:''}),db,async()=>[3]);assert.deepEqual(b.data.map(r=>r.id),[2,3,1]);
  const c=await listarSugestoesFila(req,validate({campo:'forma_pagamento_id',status:'PENDENTE',q:''}),db,async()=>null);assert(c.data.some(r=>r.id===6));
  assert(reads.every(q=>q.includes('titulo.forma_pagamento_id = fp.id')&&q.includes('titulo.deleted_at IS NULL')));
 }finally{memory.close();await sequelize.close();}
});
test('resultado inicial limitado e contrato de busca digitada preservado',async()=>{
 const sequelize=new Sequelize('qa','qa','qa',{dialect:'mysql',logging:false}),db={sequelize};for(const name of ['PagamentoManualFilaItem','PagamentoAutorizacaoItem'])db[name]=require('../src/models/'+name)(sequelize,DataTypes);
 try{
  sequelize.query=async sql=>{assert.match(sql,/LIMIT 101$/);return Array.from({length:101},(_,i)=>({id:i+1,nome:'FORMA '+i}));};
  const first=await listarSugestoesFila({user:{}},validate({campo:'forma_pagamento_id',q:''}),db,async()=>null);assert.equal(first.data.length,100);assert(first.mais);
  sequelize.query=async sql=>{assert.match(sql,/LIMIT 21$/);assert.match(sql,/LIKE/);return[{id:1,nome:'PIX'}];};const search=await listarSugestoesFila({user:{}},validate({campo:'forma_pagamento_id',q:'P'}),db,async()=>null);assert.equal(search.data[0].nome,'PIX');assert.equal(search.limite,undefined);
 }finally{await sequelize.close();}
});
