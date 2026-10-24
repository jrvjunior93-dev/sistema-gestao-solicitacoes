'use strict';
// SQLite real em memoria; ORM minimo adapta Op/lock, sem models globais/env.
// O mutex do harness nao comprova locks/concorrrencia do MySQL em producao.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {Op,DataTypes}=require('sequelize');
const {randomUUID}=require('node:crypto');
const {createService}=require('../../src/modules/fiscal/services/fiscalPurchaseLinkService');
const D=require('../../src/modules/fiscal/services/fiscalPurchaseLinkDomain');
const migration=require('../../migrations/202610240002_fiscal_vinculos_pedidos');
const CNPJ='11222333000181',ISSUER='11444777000161';
const q=s=>'"'+s.replaceAll('"','""')+'"';
function conditions(where={},params=[]) {
  const parts=Reflect.ownKeys(where).map(k=>{
    if(k===Op.or||k===Op.and)return '('+(where[k].map(w=>conditions(w,params)).join(k===Op.or?' OR ':' AND ')||'0')+')';
    const value=where[k];
    if(value===null)return q(k)+' IS NULL';
    if(value&&typeof value==='object')return Reflect.ownKeys(value).map(op=>{
      const v=value[op];
      if(op===Op.ne&&v===null)return q(k)+' IS NOT NULL';
      if(op===Op.in){if(!v.length)return'0';params.push(...v);return q(k)+' IN ('+v.map(()=>'?').join(',')+')';}
      if(op===Op.ne||op===Op.like){params.push(v);return q(k)+(op===Op.ne?' <> ?':' LIKE ?');}
      throw Error('Operador nao adaptado');
    }).join(' AND ');
    params.push(value);return q(k)+' = ?';
  });return parts.join(' AND ')||'1';
}
async function fixture(){
  const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
  const tables={FiscalDfeDocument:'fiscal_dfe_documents',FiscalCompany:'fiscal_companies',FiscalDfeEvent:'fiscal_dfe_events',FiscalDocumentLink:'fiscal_document_links',
    PedidoCompra:'pedidos',SolicitacaoCompra:'compras',Obra:'obras',EmpresaGrupo:'empresas',FornecedorCompra:'fornecedores',Parceiro:'parceiros',
    PedidoCompraTitulo:'pedido_titulos',PedidoCompraFrete:'fretes',SolicitacaoCompraAlocacao:'alocacoes',TituloFinanceiro:'titulos',TituloRenegociacaoAlocacao:'negociacao_alocacoes',Solicitacao:'solicitacoes'};
  const ddl={FiscalDfeDocument:'document_type TEXT,recipient_cnpj TEXT,issuer_cnpj TEXT,fiscal_company_id INTEGER,document_number TEXT,issuer_name TEXT,total_value TEXT,document_status TEXT,xml_storage_key TEXT',
    FiscalCompany:'empresa_id INTEGER,cnpj TEXT,ativo INTEGER',
    FiscalDfeEvent:'fiscal_dfe_document_id INTEGER,event_type TEXT,event_protocol TEXT,event_date TEXT,event_description TEXT,raw_event_json TEXT',
    PedidoCompra:'solicitacao_compra_id INTEGER,obra_id INTEGER,fornecedor_compra_id INTEGER,status TEXT,valor_total TEXT,valor_total_fornecedor TEXT',
    SolicitacaoCompra:'solicitacao_principal_id INTEGER',Obra:'empresa_grupo_id INTEGER,nome TEXT',EmpresaGrupo:'cnpj TEXT',FornecedorCompra:'nome TEXT,parceiro_id INTEGER',Parceiro:'cpf_cnpj TEXT',
    PedidoCompraTitulo:'pedido_compra_id INTEGER,titulo_financeiro_id INTEGER,origem TEXT',PedidoCompraFrete:'pedido_compra_id INTEGER,titulo_financeiro_id INTEGER,tipo TEXT',SolicitacaoCompraAlocacao:'pedido_compra_id INTEGER,titulo_financeiro_id INTEGER',
    TituloFinanceiro:'codigo TEXT,tipo TEXT,status TEXT,valor_original TEXT,valor_baixado TEXT,valor_saldo TEXT,obra_id INTEGER,compartilhamento_id INTEGER,renegociacao_id INTEGER',TituloRenegociacaoAlocacao:'titulo_origem_id INTEGER,titulo_destino_id INTEGER',Solicitacao:'codigo TEXT'};
  let attrs;
  require('../../src/modules/fiscal/models/FiscalDocumentLink')({define:(_n,a)=>{attrs=a;}},DataTypes);
  const links=Object.entries(attrs).filter(([k])=>!['id','purchase_link_key','allocated_value'].includes(k)).map(([k,a])=>`${q(k)} ${String(a.type).includes('INT')?'INTEGER':'TEXT'}`).join(',');
  for(const [model,table]of Object.entries(tables))sql.exec(`CREATE TABLE ${q(table)} (id INTEGER PRIMARY KEY AUTOINCREMENT,${model==='FiscalDocumentLink'?links:ddl[model]})`);
  const qi={describeTable:async t=>Object.fromEntries(sql.prepare(`PRAGMA table_info(${q(t)})`).all().map(c=>[c.name,{}])),
    addColumn:async(t,c)=>sql.exec(`ALTER TABLE ${q(t)} ADD COLUMN ${q(c)} TEXT`),
    showIndex:async t=>sql.prepare(`PRAGMA index_list(${q(t)})`).all(),
    addIndex:async(t,cols,o)=>sql.exec(`CREATE UNIQUE INDEX ${q(o.name)} ON ${q(t)} (${cols.map(q).join(',')})`)};
  await migration.up(qi,DataTypes);await migration.up(qi,DataTypes);
  const val=v=>v instanceof Date?v.toISOString():v&&typeof v==='object'?JSON.stringify(v):v;
  const db={};let failEvent=false;
  for(const [name,table]of Object.entries(tables)){
    const instance=row=>{if(!row)return null;const value={...row};if(value.raw_event_json)value.raw_event_json=JSON.parse(value.raw_event_json);
      Object.defineProperties(value,{toJSON:{value:()=>({...value})},update:{value:async(payload)=>{
        if(name!=='FiscalDocumentLink')throw Error('ESCRITA_FINANCEIRA_PROIBIDA');
        const cols=Object.keys(payload);sql.prepare(`UPDATE ${q(table)} SET ${cols.map(c=>q(c)+'=?').join(',')} WHERE id=?`).run(...cols.map(c=>val(payload[c])),row.id);Object.assign(value,payload);return value;
      }}});return value;};
    db[name]={findAll:async(o={})=>{const params=[];let query=`SELECT ${o.attributes?o.attributes.map(q).join(','):'*'} FROM ${q(table)} WHERE ${conditions(o.where,params)}`;
      if(o.order)query+=' ORDER BY '+o.order.map(([c,d])=>q(c)+' '+d).join(',');if(o.limit)query+=' LIMIT '+Number(o.limit);
      return sql.prepare(query).all(...params).map(instance);},
      findOne:async o=>(await db[name].findAll({...o,limit:1}))[0]||null,
      findByPk:async id=>instance(sql.prepare(`SELECT * FROM ${q(table)} WHERE id=?`).get(Number(id))),
      create:async payload=>{if(name==='FiscalDfeEvent'&&failEvent)throw Error('FALHA_AUDITORIA');const cols=Object.keys(payload);
        const info=sql.prepare(`INSERT INTO ${q(table)} (${cols.map(q)}) VALUES (${cols.map(()=>'?')})`).run(...cols.map(c=>val(payload[c])));
        return db[name].findByPk(Number(info.lastInsertRowid));}};
  }
  let queue=Promise.resolve();
  db.sequelize={transaction:action=>{const run=queue.then(async()=>{sql.exec('BEGIN IMMEDIATE');try{const result=await action({LOCK:{UPDATE:'UPDATE'}});sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}});queue=run.catch(()=>{});return run;}};
  await db.FiscalCompany.create({id:1,empresa_id:2,cnpj:CNPJ,ativo:1});await db.EmpresaGrupo.create({id:2,cnpj:CNPJ});await db.EmpresaGrupo.create({id:3,cnpj:ISSUER});
  await db.FiscalDfeDocument.create({id:1,document_type:'nfe',recipient_cnpj:CNPJ,issuer_cnpj:ISSUER,fiscal_company_id:1,document_number:'101',issuer_name:'QA',total_value:'300.00',document_status:'xml_downloaded',xml_storage_key:'imutavel.xml'});
  await db.FornecedorCompra.create({id:7,nome:'QA',parceiro_id:8});await db.Parceiro.create({id:8,cpf_cnpj:ISSUER});
  for(const [id,sol]of[[10,100],[11,100],[12,200],[13,200]]){
    await db.SolicitacaoCompra.create({id,solicitacao_principal_id:sol});await db.Obra.create({id,empresa_grupo_id:id===13?3:2,nome:'Obra QA'});
    await db.PedidoCompra.create({id,solicitacao_compra_id:id,obra_id:id,fornecedor_compra_id:7,status:'FECHADO_FORNECEDOR',valor_total:'100.00',valor_total_fornecedor:'100.00'});
    await db.TituloFinanceiro.create({id,codigo:'TIT-'+id,tipo:'PAGAR',status:id===10?'PARCIAL':'ABERTO',valor_original:'100.00',valor_baixado:id===10?'40.00':'0.00',valor_saldo:id===10?'60.00':'100.00',obra_id:id});
    await db.PedidoCompraTitulo.create({pedido_compra_id:id,titulo_financeiro_id:id,origem:'NOVO_FLUXO'});
  }
  let denied=false,scopeIds=null,freight=false;const deniedPermissions=new Set();
  const access=new Proxy({}, {get:(_target,name)=>async()=>!denied&&!deniedPermissions.has(name)});
  const finance={buscarTitulosPedido:async id=>(await db.PedidoCompraTitulo.findAll({where:{pedido_compra_id:id}})).map(v=>({origem:freight?'FRETE_TERCEIRO':'NOVO_FLUXO',titulo:plainTitle(v.titulo_financeiro_id)}))};
  function plainTitle(id){return {...sql.prepare('SELECT * FROM titulos WHERE id=?').get(id)};}
  const service=createService({db,access,scope:async()=>scopeIds,finance,titleScope:async()=>{if(denied)D.fail('Negado',403);}});
  const req={user:{id:5}},body=(orders=[10],revision=0)=>({revision,motivo:'Conferencia QA',pedidos:orders.map(p=>({pedido_id:p,valor:'100.00',titulo_ids:[p]}))});
  return {sql,db,qi,service,req,body,setDenied:v=>denied=v,denyPermission:name=>deniedPermissions.add(name),setScope:v=>scopeIds=v,setFreight:v=>freight=v,setFail:v=>failEvent=v,
    financial:()=>JSON.stringify(sql.prepare('SELECT * FROM titulos ORDER BY id').all()),
    close:()=>sql.close()};
}

module.exports={fixture};
