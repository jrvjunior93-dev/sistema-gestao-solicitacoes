'use strict';
const {DatabaseSync}=require('node:sqlite');
const {createService}=require('../../src/services/pedidoLocalizacaoService');
function fixture(extra=0,{largeId=false}={}){
  const sql=new DatabaseSync(':memory:');
  sql.function('CONCAT',{varargs:true},(...args)=>args.join(''));
  sql.function('LPAD',(value,length,pad)=>String(value).padStart(Number(length),pad).slice(0,Number(length)));
  sql.exec('CREATE TABLE pedido_compras (id INTEGER PRIMARY KEY,solicitacao_compra_id INTEGER,obra_id INTEGER,fornecedor_compra_id INTEGER,status TEXT,valor_total NUMERIC,valor_total_fornecedor NUMERIC,createdAt TEXT);'+
    'CREATE TABLE solicitacao_compras (id INTEGER PRIMARY KEY,solicitacao_principal_id INTEGER,titulo TEXT,observacoes TEXT,numero_sienge TEXT,comprador_responsavel_id INTEGER,solicitante_id INTEGER);'+
    'CREATE TABLE solicitacoes (id INTEGER PRIMARY KEY,codigo TEXT,descricao TEXT,justificativa TEXT,numero_pedido TEXT);'+
    'CREATE TABLE fornecedores_compra (id INTEGER PRIMARY KEY,nome TEXT,cnpj TEXT);CREATE TABLE Obras (id INTEGER PRIMARY KEY,nome TEXT,codigo TEXT);'+
    'CREATE TABLE pedido_compra_itens (id INTEGER PRIMARY KEY,pedido_compra_id INTEGER,descricao TEXT,observacoes TEXT,unidade TEXT,quantidade_pedido NUMERIC,removido INTEGER);');
  sql.exec("INSERT INTO solicitacoes VALUES(2153,'SOL-35','Materiais para fundacao','Infraestrutura','EXT-26'),(2154,'SOL-36','Equipamento da obra2','Maquina',NULL),(2155,'SOL-37','Outra compra','Atribuida a outro comprador',NULL);"+
    "INSERT INTO solicitacao_compras VALUES(66,2153,'Teste compra NF-e38539','Entrega areia e brita','ERP-66',5,7),(67,2154,'Compra da obra2','Outra equipe','ERP-67',6,8),(68,2155,'Compra de outro responsavel','','ERP-68',6,8);"+
    "INSERT INTO fornecedores_compra VALUES(1,'Pedreira QA','42334280000114'),(2,'Fornecedor fora do escopo','00000000000000');"+
    "INSERT INTO Obras VALUES(1,'Edificio Italia','7'),(2,'Obra fora do escopo','8');"+
    "INSERT INTO pedido_compras VALUES(26,66,1,1,'FECHADO_FORNECEDOR',600,600,'2026-10-24 20:00:00'),(27,66,1,1,'FECHADO_FORNECEDOR',566.44,566.44,'2026-10-25 01:00:00'),"+
    "(28,67,2,2,'ABERTO',200,200,'2026-10-24 20:00:00'),(29,66,1,1,'CANCELADO',50,50,'2026-10-23 20:00:00'),(30,68,1,1,'ABERTO',15,15,'2026-10-25 03:00:00');"+
    "INSERT INTO pedido_compra_itens VALUES(48,26,'Areia fina','Infraestrutura','m3',1,0),(49,26,'Cimento','Material 100% conferido','sc',2,0),"+
    "(50,27,'Brita1','Sem frete','m3',1,0),(51,27,'Ferro antigo','Retirado','kg',5,1),(52,28,'Equipamento reservado','Sigiloso','un',1,0);");
  const insert=sql.prepare("INSERT INTO pedido_compras VALUES(?,66,1,1,'ABERTO',10,10,'2026-10-24 20:00:00')");
  for(let i=0;i<extra;i++)insert.run(100+i);
  if(largeId)insert.run(100000);
  sql.exec('PRAGMA query_only=ON');
  const queries=[];
  const sequelize={transaction:async(options,fn)=>{
    if(!options.readOnly||options.isolationLevel!=='REPEATABLE READ')throw Error('Consulta fora do modo leitura');
    sql.exec('BEGIN');try{return await fn({fixture:true});}finally{sql.exec('ROLLBACK');}
  },query:async(query,options)=>{
    if(!/^SELECT\b/.test(query))throw Error('Somente SELECT no relatorio');
    queries.push({query,params:options.replacements});
    const used=[...query.matchAll(/:([a-z_0-9]+)/gi)].map(m=>m[1]);
    const params=Object.fromEntries([...new Set(used)].map(k=>[k,options.replacements[k]]));
    // O parser DATETIME do Sequelize/MySQL usa a timezone UTC configurada e
    // devolve Date; serializar aqui reproduz a resposta HTTP real do campo.
    return sql.prepare(query).all(params).map(row=>row.criado_em?
      {...row,criado_em:new Date(row.criado_em.replace(' ','T')+'Z').toISOString()}:row);
  }};
  const tables={orders:'pedido_compras',requests:'solicitacao_compras',mainRequests:'solicitacoes',suppliers:'fornecedores_compra',works:'Obras',items:'pedido_compra_itens'};
  const service=createService({sequelize,QueryTypes:{SELECT:'SELECT'},tables});
  return {sql,service,queries,close:()=>sql.close(),scope:{obraIds:[1],userId:5}};
}
module.exports={fixture};
