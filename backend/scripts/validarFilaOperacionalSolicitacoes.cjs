const test=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const f=require('../src/services/solicitacaoFilaOperacional');
const agora=new Date('2026-10-29T12:00:00Z');
const geo={tokens:['GEO'],decidir:true,setorEntrega:null};
const sc={id:1,area_responsavel:'GEO',status_global:'ABERTA'};
const ret={id:12,createdAt:'2026-10-20T12:00:00Z'};
test('retorno persiste apos ler/comentar, sem prazo inventado, e some apenas sem pedido pendente',()=>{
 const args={solicitacao:sc,retorno:ret,contexto:geo,agora};
 const a=f.atividades(args);assert.equal(a[0].nome,'Aprovar retorno');assert.equal(a[0].atrasada,false);assert.equal(a[0].prazo_em,null);
 assert.deepEqual(f.atividades({...args,solicitacao:{...sc,interacoes_pendentes:[],atencao_pendente:null}}),a);
 assert.deepEqual(f.atividades({...args,retorno:null}),[]);
});
test('setor principal, aliases GEO, permissao e cancelamento delimitam atividades',()=>{
 assert.equal(f.atividades({solicitacao:{...sc,area_responsavel:'Gerência de Processos'},retorno:ret,contexto:geo}).length,1);
 for(const contexto of [{...geo,decidir:false},{...geo,tokens:['OBRA']},null])assert.equal(f.atividades({solicitacao:sc,retorno:ret,contexto}).length,0);
 assert.equal(f.atividades({solicitacao:{...sc,cancelada:true},retorno:ret,contexto:geo}).length,0);
 assert.equal(f.atividades({solicitacao:sc,retorno:ret,contexto:{tokens:[],superadmin:true,decidir:true}}).length,1);
});
test('atividade de outro setor nao vira pendencia do GEO; 53itens viram um resumo',()=>{
 const entregas=Array.from({length:53},(_,i)=>({item_id:i,setor:'OBRA',previsao:'2026-10-28',updatedAt:'2026-10-28'}));
 assert.equal(f.atividades({solicitacao:sc,entregas,contexto:geo}).length,0);
 const a=f.atividades({solicitacao:sc,entregas,contexto:{tokens:['OBRA'],setorEntrega:'OBRA'}});
 assert.equal(a.length,1);assert.equal(a[0].quantidade,53);assert.equal(a[0].atrasada,true);
});
function fixture(){
 const db=new DatabaseSync(':memory:');db.function('GREATEST',{varargs:true},(...args)=>args.sort().at(-1));db.function('LEAST',{varargs:true},(...args)=>args.sort()[0]);
 db.exec(`CREATE TABLE solicitacoes(id INTEGER PRIMARY KEY,area_responsavel TEXT,cancelada INTEGER DEFAULT 0,status_global TEXT DEFAULT 'ABERTA',createdAt TEXT,updatedAt TEXT);
 CREATE TABLE solicitacao_pedidos_retorno(id INTEGER,solicitacao_id INTEGER,status TEXT,setor_atual_pedido TEXT,createdAt TEXT);
 CREATE TABLE solicitacao_atencoes_usuario(solicitacao_id INTEGER,usuario_id INTEGER,lido_em TEXT,evento_em TEXT);
 CREATE TABLE solicitacao_interacoes_usuario(solicitacao_id INTEGER,usuario_id INTEGER,lido_em TEXT,evento_em TEXT);
 CREATE TABLE pedido_compra_entregas(pedido_compra_item_id INTEGER,pedido_compra_id INTEGER,estado TEXT,previsao TEXT,prazo_compras TEXT,updatedAt TEXT);
 CREATE TABLE pedido_compra_itens(id INTEGER,pedido_compra_id INTEGER,removido INTEGER DEFAULT 0,quantidade_pedido REAL,quantidade_cancelada REAL DEFAULT 0);
 CREATE TABLE pedido_compras(id INTEGER,solicitacao_compra_id INTEGER,status TEXT,obra_id INTEGER);
 CREATE TABLE solicitacao_compras(id INTEGER,solicitacao_principal_id INTEGER);
 CREATE TABLE pedido_compra_item_recebimentos(pedido_compra_item_id INTEGER,quantidade REAL);
 CREATE TABLE obrigacoes_operacionais(referencia_id INTEGER,solicitacao_id INTEGER,pedido_id INTEGER,obra_id INTEGER,tipo TEXT,setor TEXT,status TEXT,limite_em TEXT);`);
 const add=(id,area='GEO')=>db.prepare('INSERT INTO solicitacoes(id,area_responsavel,createdAt,updatedAt) VALUES(?,?,?,?)').run(id,area,'2026-10-01','2026-10-29');
 const escape=v=>"'"+String(v instanceof Date?v.toISOString():v).replace(/'/g,"''")+"'";
 const order=(ctx=geo,regra={ativo:false},limit=100,offset=0)=>{
  const c={...ctx,sqlInteracao:'EXISTS (SELECT 1 FROM solicitacao_interacoes_usuario siu WHERE siu.solicitacao_id=Solicitacao.id AND siu.usuario_id=7 AND siu.lido_em IS NULL)',sqlUltimaInteracao:'(SELECT MAX(siu.evento_em) FROM solicitacao_interacoes_usuario siu WHERE siu.solicitacao_id=Solicitacao.id AND siu.usuario_id=7 AND siu.lido_em IS NULL)'};
  const sql=f.sqlFila({contexto:c,usuarioId:7,escape,hoje:'2026-10-29',agora,regra}).map(([s,d])=>s+' '+d).join(',');
  return db.prepare(`SELECT id FROM solicitacoes AS Solicitacao ORDER BY ${sql},id DESC LIMIT ? OFFSET ?`).all(limit,offset).map(r=>r.id);
 };return{db,add,order};
}
test('SQL executavel: retorno antes de mensagens, inclusive fora da primeira pagina; leitura nao remove retorno',()=>{
 const {db,add,order}=fixture();try{
  for(let id=1;id<=40;id++)add(id);
  db.exec("INSERT INTO solicitacao_pedidos_retorno VALUES(1,1,'PENDENTE','GEO','2026-10-01'),(2,2,'PENDENTE','GEO','2026-10-02')");
  for(let id=10;id<=40;id++)db.prepare('INSERT INTO solicitacao_interacoes_usuario VALUES(?,7,NULL,?)').run(id,'2026-10-29');
  assert.deepEqual(order(geo,{},2),[1,2]);
  db.exec("INSERT INTO solicitacao_interacoes_usuario VALUES(1,7,NULL,'2026-10-29'); UPDATE solicitacao_interacoes_usuario SET lido_em='2026-10-29' WHERE solicitacao_id=1");
  assert.deepEqual(order(geo,{},2),[1,2]);
  db.exec("UPDATE solicitacao_pedidos_retorno SET status='REJEITADO' WHERE id=1");assert.deepEqual(order(geo,{},2),[2,40]);
  assert.equal(order({...geo,decidir:false},{},1)[0],40);
  db.exec("UPDATE solicitacoes SET area_responsavel='COMPRAS' WHERE id=2");assert.equal(order(geo,{},1)[0],40);
 }finally{db.close();}
});
test('SQL executavel: acompanhamento sem acao nao sobe por updatedAt ou por entrega de outro setor',()=>{
 const {db,add,order}=fixture();try{
  add(1);add(2,'COMPRAS');db.exec("INSERT INTO solicitacao_pedidos_retorno VALUES(1,2,'PENDENTE','COMPRAS','2026-01-01'); INSERT INTO solicitacao_interacoes_usuario VALUES(1,7,NULL,'2026-10-29')");
  assert.deepEqual(order(),[1,2]);
  db.exec("UPDATE solicitacoes SET updatedAt='2099-01-01' WHERE id=2");assert.deepEqual(order(),[1,2]);
  assert.equal(order({...geo,superadmin:true})[0],2);
 }finally{db.close();}
});
test('SQL executavel: atraso operacional real antes de retorno; ciclo novo com prazo futuro nao usa alerta legado',()=>{
 const {db,add,order}=fixture();try{
  add(1,'OBRA');add(2,'OBRA');add(3,'OBRA');add(4,'OBRA');
  db.exec("INSERT INTO solicitacao_pedidos_retorno VALUES(1,1,'PENDENTE','OBRA','2026-10-01'); INSERT INTO solicitacao_interacoes_usuario VALUES(4,7,NULL,'2026-10-29')");
  for(const id of [2,3])db.exec(`INSERT INTO solicitacao_compras VALUES(${id},${id});INSERT INTO pedido_compras VALUES(${id},${id},'ABERTO',1);INSERT INTO pedido_compra_itens(id,pedido_compra_id,quantidade_pedido) VALUES(${id},${id},10);INSERT INTO pedido_compra_entregas VALUES(${id},${id},'OBRA','2026-10-20',NULL,'2026-10-20');INSERT INTO obrigacoes_operacionais VALUES(${id},${id},${id},1,'ENTREGA_OBRA','OBRA','PENDENTE','${id===2?'2026-10-28':'2026-10-30'}T12:00:00.000Z');`);
  const ctx={tokens:['OBRA'],decidir:true,setorEntrega:'OBRA'},regra={ativo:true,iniciar_em:'2026-10-01'};
  assert.deepEqual(order(ctx,regra),[2,1,3,4]);
  db.exec("INSERT INTO pedido_compra_item_recebimentos VALUES(2,10)");assert.deepEqual(order(ctx,regra),[1,3,4,2]);
 }finally{db.close();}
});
