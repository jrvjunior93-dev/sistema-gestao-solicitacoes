'use strict';
// ORM minimo sobre SQLite real em memoria; sem bancos/servicos externos.
const {Op}=require('sequelize'),{randomUUID}=require('node:crypto');
const {fixture:purchaseFixture}=require('./vinculosNfeDbFixture.cjs');
const {createService}=require('../../src/services/fiscalPagamentoDocumentosService');
function conditions(where={},values=[]){
  return Reflect.ownKeys(where).map(key=>{
    if(key===Op.or||key===Op.and)return '('+where[key].map(w=>conditions(w,values)).join(key===Op.or?' OR ':' AND ')+')';
    if(!/^\w+$/.test(key))throw Error('Coluna QA invalida');
    const v=where[key];if(v===null)return '"'+key+'" IS NULL';
    if(v&&typeof v==='object')return Reflect.ownKeys(v).map(op=>{
      if(op===Op.ne&&v[op]===null)return '"'+key+'" IS NOT NULL';
      if(op===Op.in){values.push(...v[op]);return v[op].length?'"'+key+'" IN ('+v[op].map(()=>'?').join(',')+')':'0';}
      if(op===Op.ne){values.push(v[op]);return '"'+key+'" <> ?';}throw Error('Operador QA invalido');
    }).join(' AND ');
    values.push(v);return '"'+key+'"=?';
  }).join(' AND ')||'1';
}
async function fixture(){
  const f=await purchaseFixture(),{sql,db}=f;
  await f.service.save(f.req,1,f.body([10,11,12]),randomUUID());
  sql.exec("ALTER TABLE fiscal_dfe_documents ADD COLUMN pdf_storage_key TEXT;ALTER TABLE fiscal_dfe_documents ADD COLUMN danfe_storage_key TEXT;ALTER TABLE fiscal_dfe_documents ADD COLUMN createdAt TEXT;"+
    "UPDATE fiscal_dfe_documents SET danfe_storage_key='dev/danfe-101.pdf',createdAt='2026-10-24T15:00:00Z' WHERE id=1;"+
    "ALTER TABLE titulos ADD COLUMN solicitacao_id INTEGER;ALTER TABLE titulos ADD COLUMN deleted_at TEXT;"+
    "UPDATE titulos SET solicitacao_id=CASE WHEN id IN(10,11) THEN 100 ELSE 200 END;"+
    "CREATE TABLE partes(id INTEGER PRIMARY KEY,titulo_financeiro_id INTEGER,pedido_compra_id INTEGER,obra_id INTEGER,solicitacao_id INTEGER);"+
    "CREATE TABLE rateios(id INTEGER PRIMARY KEY,titulo_financeiro_id INTEGER,obra_id INTEGER);"+
    "CREATE TABLE itens_dossie(id INTEGER PRIMARY KEY,lote_id INTEGER,titulo_financeiro_id INTEGER,snapshot_hash TEXT);"+
    "CREATE TABLE fila(id INTEGER PRIMARY KEY,titulo_financeiro_id INTEGER);"+
    "INSERT INTO titulos(id,codigo,tipo,status,valor_original,valor_baixado,valor_saldo,obra_id,renegociacao_id,solicitacao_id)VALUES(20,'TIT-20','PAGAR','PARCIAL','200','40','160',10,1,100);"+
    "INSERT INTO negociacao_alocacoes(titulo_origem_id,titulo_destino_id)VALUES(10,20);"+
    "INSERT INTO rateios VALUES(1,20,10),(2,20,12);"+
    "INSERT INTO titulos(id,codigo,tipo,status,valor_original,valor_baixado,valor_saldo,obra_id,compartilhamento_id,solicitacao_id)VALUES(21,'TIT-21','PAGAR','ABERTO','200','0','200',10,1,100);"+
    "INSERT INTO partes VALUES(1,21,10,10,100),(2,21,12,12,200);"+
    "INSERT INTO titulos(id,codigo,tipo,status,valor_original,valor_baixado,valor_saldo,obra_id,deleted_at,solicitacao_id)VALUES(22,'TIT-22','PAGAR','EXCLUIDO','100','0','100',10,'2026-10-24',100);"+
    "INSERT INTO titulos(id,codigo,tipo,status,valor_original,valor_baixado,valor_saldo,obra_id,solicitacao_id)VALUES(14,'TIT-14','PAGAR','ABERTO','50','0','50',10,100);"+
    "INSERT INTO fretes(pedido_compra_id,titulo_financeiro_id,tipo)VALUES(10,14,'TERCEIRO');"+
    "INSERT INTO pedido_titulos(pedido_compra_id,titulo_financeiro_id,origem)VALUES(10,14,'FRETE_TERCEIRO');"+
    "INSERT INTO itens_dossie VALUES(100,9,10,'hash-original'),(101,9,11,'hash-original'),(102,9,12,'hash-original'),(200,10,20,'hash-original'),(201,10,21,'hash-original'),(202,10,22,'hash-original'),(203,10,14,'hash-original');"+
    "INSERT INTO fila VALUES(400,10),(401,12),(402,21);");
  const tables={TituloCompartilhadoOrigem:'partes',TituloFinanceiroRateio:'rateios',PagamentoAutorizacaoItem:'itens_dossie',PagamentoManualFilaItem:'fila'};
  for(const [name,table]of Object.entries(tables))db[name]={
    findAll:async(options={})=>{
      if(name==='PagamentoManualFilaItem'&&options.include){
        const request=options.include[0].where.solicitacao_id;
        const rows=sql.prepare('SELECT f.* FROM fila f JOIN titulos t ON t.id=f.titulo_financeiro_id WHERE t.solicitacao_id=? OR EXISTS(SELECT 1 FROM partes p WHERE p.titulo_financeiro_id=t.id AND p.solicitacao_id=?)').all(request,request);
        return Promise.all(rows.map(async row=>({...row,titulo:await db.TituloFinanceiro.findByPk(row.titulo_financeiro_id)})));
      }
      const values=[];return sql.prepare('SELECT * FROM '+table+' WHERE '+conditions(options.where,values)).all(...values);
    },findByPk:async id=>sql.prepare('SELECT * FROM '+table+' WHERE id=?').get(Number(id))
  };
  db.PagamentoManualFilaItem.findOne=async o=>(await db.PagamentoManualFilaItem.findAll(o))[0]||null;
  db.Anexo={findAll:async o=>o.where.solicitacao_id===100?[{id:1,nome_original:'boleto-qa.pdf',caminho_arquivo:'/uploads/boleto-qa.pdf',tipo:'BOLETO',createdAt:'2026-10-24T14:00:00Z'}]:[]};
  const state={owner:true,queue:true,works:null},signed=[],events=[];
  const access={owner:async user=>{if(!user?.id||!state.owner)throw Object.assign(Error('Acesso negado as autorizacoes de pagamento.'),{statusCode:403});},
    queue:async()=>state.queue,works:async()=>state.works,requestWhere:solicitacao_id=>({solicitacao_id})};
  const service=createService({db,access,storage:{sign:async(...args)=>{signed.push(args);return 'https://storage.qa/assinado?validade=180';}},audit:async e=>events.push(e)});
  const snapshot=()=>JSON.stringify(['titulos','itens_dossie','fila','fiscal_document_links','fiscal_dfe_events'].map(table=>sql.prepare('SELECT * FROM '+table+' ORDER BY id').all()));
  return {...f,state,access,signed,events,service,snapshot,req:{user:{id:31}}};
}
module.exports={fixture};
