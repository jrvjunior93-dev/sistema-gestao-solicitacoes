'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const {Sequelize,DataTypes,Op,fn,col}=require('sequelize'),P=require('../src/services/solicitacoesCompraPaginacao');
const {validateRequest}=require('../src/middlewares/validation');
const {validateCompraQuery}=require('../src/validators/operationalValidators');
const sqlite=require('./helpers/sqliteSequelizeMemory');
class MemoryDb extends sqlite.Database{constructor(...args){super(...args);this.db.function('UPPER',v=>String(v??'').toUpperCase());this.db.function('REGEXP_REPLACE',(s,p,r)=>String(s).replace(new RegExp(p.replaceAll('[[:space:]]','\\s').replaceAll('[:space:]','\\s'),'gu'),r));}}
const BASE='46ac88de88957ffc15e8b0db45dfcd6eed7bc34e';
const oldSource=cp.execFileSync('git',['show',BASE+':backend/src/controllers/SolicitacaoCompraController.js'],{encoding:'utf8'});
const newSource=fs.readFileSync(__dirname+'/../src/controllers/SolicitacaoCompraController.js','utf8');
async function fixture(){
 const sql=[],db=new Sequelize({dialect:'sqlite',storage:':memory:',dialectModule:{...sqlite,Database:MemoryDb},logging:q=>sql.push(q)}),models={};
 const attrs={id:{type:DataTypes.INTEGER,primaryKey:true},origem:DataTypes.STRING,status:DataTypes.STRING,status_global:DataTypes.STRING,area_responsavel:DataTypes.STRING,nome:DataTypes.STRING,codigo:DataTypes.STRING,email:DataTypes.STRING,createdAt:DataTypes.DATE,necessario_para:DataTypes.DATE,observacoes:DataTypes.TEXT,dados_pagamento:DataTypes.TEXT};
 for(const name of ['SolicitacaoCompra','Obra','User','Solicitacao','SolicitacaoCompraItem','SolicitacaoCompraItemManual','SolicitacaoCompraFornecedor','PedidoCompra'])models[name]=db.define(name,attrs,{timestamps:false,tableName:name});
 models.SolicitacaoCompra.belongsTo(models.Obra,{as:'obra',foreignKey:'obra_id'});models.SolicitacaoCompra.belongsTo(models.User,{as:'solicitante',foreignKey:'solicitante_id'});models.SolicitacaoCompra.belongsTo(models.User,{as:'compradorResponsavel',foreignKey:'comprador_responsavel_id'});models.SolicitacaoCompra.belongsTo(models.Solicitacao,{as:'solicitacaoPrincipal',foreignKey:'solicitacao_principal_id'});
 for(const[name,as]of [['SolicitacaoCompraItem','itens'],['SolicitacaoCompraItemManual','itensManuais'],['SolicitacaoCompraFornecedor','fornecedores'],['PedidoCompra','pedidos']])models.SolicitacaoCompra.hasMany(models[name],{as,foreignKey:'solicitacao_compra_id'});
 await db.sync();await db.query('PRAGMA foreign_keys=OFF');
 await models.Obra.bulkCreate([{id:1,nome:'Obra Norte',codigo:'OB01'},{id:2,nome:'Obra 100% _Sul',codigo:'OB02'}]);await models.User.bulkCreate([{id:7,nome:'Ana'},{id:8,nome:'José'}]);
 await models.Solicitacao.bulkCreate([{id:1,status_global:'PENDENTE',area_responsavel:'GEO'},{id:2,status_global:' liberado ',area_responsavel:'GEO'},{id:3,status_global:' pedido - gerado ',area_responsavel:' compras '},{id:4,status_global:'COTACAO',area_responsavel:'GEO'}]);
 const definitions=[['ENVIADO',1,8,1],['ENVIADO',2,8,1],['ENVIADO',3,8,1],['ENVIADO',4,8,1],['ENVIADO',null,8,1],['ENVIADO',1,7,1],['CANCELADA',1,8,1],['CANCELADO',1,8,2],['RECUSADO',2,8,2],['REJEITADA',2,8,2],['FECHAMENTO_PARCIAL',1,8,2],['FINALIZADA',1,8,2],['AGUARDANDO_DIRETORIA',1,8,1],['INATIVA',2,8,1],['ENVIADO',999,8,1],[' pedido--emitido ',1,8,1],[' cótação ',1,8,1]];
 await models.SolicitacaoCompra.bulkCreate(definitions.map(([status,principal,owner,obra],i)=>({id:i+1,origem:'NORMAL',status,solicitacao_principal_id:principal,solicitante_id:owner,comprador_responsavel_id:7,obra_id:obra,createdAt:new Date(2026,0,i+1),observacoes:'DADO_PESADO_NAO_DEVE_VIR',dados_pagamento:'NAO_DEVE_VIR'})));
 await models.SolicitacaoCompra.create({id:100001,origem:'NORMAL',status:'LIBERADO',solicitante_id:8,obra_id:1,createdAt:new Date(2026,1,1)});
 await models.SolicitacaoCompra.create({id:90,origem:'COMPRA_DIRETA',status:'LIBERADO',solicitante_id:8,obra_id:1,createdAt:new Date(2026,1,1)});
 await models.SolicitacaoCompraItem.bulkCreate([{id:1,solicitacao_compra_id:8},{id:2,solicitacao_compra_id:8},{id:3,solicitacao_compra_id:1}]);await models.SolicitacaoCompraItemManual.create({id:10,solicitacao_compra_id:8});await models.SolicitacaoCompraFornecedor.create({id:20,solicitacao_compra_id:8});
 function controller(source){
  const normal=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase(),isSuperadmin=u=>!!u.superadmin,userHasSetorCapability=async(u,k)=>!!u[k];
  const fragment=source.slice(source.indexOf('function isCompraAguardandoDiretoria('),source.indexOf('async function podeGerenciarCompraNaFilaGeo('));
  const follow=new Function('normalizeTextCompra','Solicitacao','isSuperadmin','userHasSetorCapability',fragment+';return podeAcompanharCompraAntesLiberacao;')(normal,models.Solicitacao,isSuperadmin,userHasSetorCapability);
  const ctx={...models,Op,fn,col,validarAcesso:async req=>req.user,canEditarItensSolicitacaoCompra:async u=>!!u.editar,canEncaminharCompraSolicitacoes:async()=>false,canViewAllComprasScope:async u=>u.full!==false,isSuperadmin,userHasSetorCapability,canManageComprasDelegacao:async()=>true,buscarSetorGerenciaProcessos:async()=> 'GEO',podeAcompanharCompraAntesLiberacao:follow,listarPaginaSolicitacoesCompra:P.listarPagina};
  const index=source.slice(source.indexOf('  async index(req, res) {'),source.indexOf('  async inativar(req, res) {'));
  return new Function(...Object.keys(ctx),'return ({'+index+'}).index;')(...Object.values(ctx));
 }
 const old=controller(oldSource),current=controller(newSource);
 async function call(query,user={id:7,superadmin:true},scope=null,legacy=false){let status=200,body;const res={status:n=>{status=n;return res;},json:x=>{body=x;return x;}};await(legacy?old:current)({query:{visao:'resumo',...query},user,compraScopeObraIds:scope},res);return{status,body};}
 const routeLine=fs.readFileSync(__dirname+'/../src/routes.js','utf8').split(/\r?\n/).find(s=>s.startsWith("router.get('/compras/solicitacoes',"));
 assert(routeLine,'Rota de producao deve ser exercitada com seu validador real.');
 let handlers;
 new Function('router','allowCompraSolicitacoesOrDelegacaoRead','validateRequest','validateCompraQuery','scopeCompraListAccess','SolicitacaoCompraController',routeLine)(
  {get(url,...steps){assert.equal(url,'/compras/solicitacoes');handlers=steps;}},
  (req,res,next)=>req.user?.denied?res.status(403).json({error:'Acesso negado QA'}):next(),
  validateRequest,validateCompraQuery,(req,res,next)=>next(),{index:current});
 assert.equal(handlers.length,4);
 async function route(query,user={id:7,superadmin:true},scope=null){
  let status=200,body;const req={query:{visao:'resumo',...query},user,compraScopeObraIds:scope};
  const res={status(n){status=n;return this},json(x){body=x;return x}};
  for(const fn of handlers){let advance=false;await fn(req,res,()=>{advance=true});if(!advance)break}
  return{status,body,query:req.query};
 }
 return{models,sql,db,call,route,close:()=>db.close()};
}
test('rota REAL: middleware aceita contrato do frontend antes do controller e limita no SQL',async()=>{
 const f=await fixture();try{
  await f.models.SolicitacaoCompra.bulkCreate(Array.from({length:121},(_,i)=>({id:300000+i,origem:'NORMAL',status:'LIBERADO',solicitante_id:7,obra_id:1,createdAt:new Date(2026,2,i%28+1)})));
  const start=f.sql.length;
  const r=await f.route({page:'1',limit:'50',q:'',status:'',visao:'resumo'});
  assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.data.length,50);assert.equal(r.body.pagination.limit,50);
  assert(r.body.pagination.total>100);assert.equal(r.query.page,1);
  assert(f.sql.slice(start).some(s=>/\bLIMIT\b/.test(s)));
  assert(!f.sql.slice(start).some(s=>/DADO_PESADO_NAO_DEVE_VIR|NAO_DEVE_VIR/.test(s)));
  const next=await f.route({page:'2',limit:'50'});assert.equal(next.status,200);assert.equal(next.body.data.length,50);
  assert(!next.body.data.some(t=>r.body.data.some(p=>p.id===t.id)));
  const scoped=await f.route({page:'1',limit:'50',q:'',status:'CANCELADA'},{id:7,superadmin:true},[1]);
  assert.equal(scoped.status,200);assert.deepEqual(scoped.body.data.map(t=>t.id),[7]);assert.equal(scoped.query.status,'CANCELADO');
  const search=await f.route({q:'SC-100001'});assert.equal(search.status,200);assert.equal(search.body.data[0].id,100001);
  assert.equal(search.body.pagination.limit,50,'Filtro novo sem pagina explicita continua limitado');
  assert(Array.isArray((await f.route({})).body),'Contrato legado continua array sem parametros novos');
  for(const query of [{page:'0'},{limit:'101'},{page:['1','2']},{q:{}},{q:'x'.repeat(201)},{status:['ABERTO']},{page:'1',sort:'sql'}, {page:'1',contexto:'delegacao'},{q:'x',visao:'delegacao'}]){
   const before=f.sql.length,bad=await f.route(query);assert.equal(bad.status,400,JSON.stringify(query));assert.equal(f.sql.length,before,'Invalido deve parar antes do banco');
  }
  const before=f.sql.length,denied=await f.route({page:'1'},{denied:true});
  assert.equal(denied.status,403);assert.equal(f.sql.length,before);
 }finally{await f.close()}
});
test('validacao estrita de pagina/limite/busca/status, sem truncar silenciosamente',()=>{
 assert.equal(P.parseQuery({}).limit,50);assert.equal(P.parseQuery({status:'cancelada,recusada'}).statuses.join(','),'CANCELADO,RECUSADO');
 for(const q of [{page:'0'},{page:'1.5'},{page:['1']},{limit:'101'},{q:'x'.repeat(201)},{status:['CANCELADO']},{obra_id:'1 OR 1=1'}])assert.throws(()=>P.parseQuery(q),e=>e.statusCode===400);
});
test('SQL paginado preserva permissao da listagem REAL anterior e nao gera paginas furadas',async()=>{
 const f=await fixture();try{for(const user of [{id:7,superadmin:true},{id:7,eh_setor_compras:true},{id:7,eh_setor_compras:true,full:false},{id:7,eh_setor_geo:true,editar:true,full:false},{id:7,full:false},{id:8,eh_setor_compras:true}]){
  const baseline=await f.call({},user,null,true);assert.equal(baseline.status,200);const expected=baseline.body.map(r=>r.id).sort((a,b)=>a-b),seen=[];let total;
  for(let page=1;page<=30;page++){const r=await f.call({page:String(page),limit:'2'},user);assert.equal(r.status,200);total=r.body.pagination.total;seen.push(...r.body.data.map(r=>r.id));if(page===r.body.pagination.pages)break;assert.equal(r.body.data.length,2);}
  assert.equal(total,expected.length);assert.deepEqual(seen.sort((a,b)=>a-b),expected,'Usuario '+JSON.stringify(user));assert.equal(new Set(seen).size,seen.length);
 }}finally{await f.close();}
});
test('filtros antecedem LIMIT: busca em pagina distante, codigo grande, status sinonimos, texto literal',async()=>{
 const f=await fixture();try{
  for(const [q,expected]of [['sc-00001',[1]],['sc-100001',[100001]],['100%', [8,9,10,11,12]],['_Sul',[8,9,10,11,12]],['José',[1,2,3,4,5,7,8,9,10,11,12,13,15,16,17,100001]]]){
   const r=await f.call({page:'1',limit:'100',q});assert.equal(r.status,200);assert.deepEqual(r.body.data.map(r=>r.id).sort((a,b)=>a-b),expected);
  }
  const r=await f.call({page:'1',limit:'2',status:'CANCELADO,RECUSADO'});assert.equal(r.body.pagination.total,4);assert.equal(r.body.data.length,2);
  const page2=await f.call({page:'2',limit:'2',status:'CANCELADO,RECUSADO'});assert.deepEqual([...r.body.data,...page2.body.data].map(r=>r.id).sort((a,b)=>a-b),[7,8,9,10]);
 }finally{await f.close();}
});
test('obra/autorizacao/facetas/contagem nao vazam, lista nao carrega detalhes ou campos pesados',async()=>{
 const f=await fixture();try{
  const beforeDenied=f.sql.length;const unauthenticated=await f.call({page:'1'},null);assert.equal(unauthenticated.body,undefined);assert.equal(f.sql.length,beforeDenied);
  const r=await f.call({page:'1',limit:'50',obra_id:'2'},undefined,[2]);assert.equal(r.body.pagination.total,5);assert.equal(r.body.data.find(r=>r.id===8).itens_count,3);assert.equal(r.body.data.find(r=>r.id===8).fornecedores_count,1);
  for(const row of r.body.data)for(const key of ['observacoes','dados_pagamento','itens','itensManuais','fornecedores','pedidos'])assert(!Object.hasOwn(row,key));
  const denied=await f.call({page:'1',obra_id:'1'},undefined,[2]);assert.equal(denied.body.pagination.total,0);assert.deepEqual(denied.body.filters.statuses,[]);
  const empty=await f.call({page:'1'},undefined,[]);assert.equal(empty.body.pagination.total,0);
  const actor={id:7,eh_setor_compras:true};const a=await f.call({page:'1',q:'sc-00008'},actor,[2]);assert(!a.body.filters.statuses.includes('AGUARDANDO_DIRETORIA'));
  const selectionSql=f.sql.filter(s=>s.includes('SELECT')&&s.includes('LIMIT'));assert(selectionSql.length>0);assert(selectionSql.every(s=>!s.includes('JOIN `SolicitacaoCompraItem')&&!s.includes('JOIN `SolicitacaoCompraFornecedor')));
 }finally{await f.close();}
});
test('limite maximo, pagina alem do fim, ordem estavel, entrada invalida e contrato legado',async()=>{
 const f=await fixture();try{
  const r=await f.call({page:'999',limit:'2'});assert.equal(r.body.pagination.page,r.body.pagination.pages);assert(r.body.data.length>0&&r.body.data.length<=2);
  await f.models.SolicitacaoCompra.create({id:100002,origem:'NORMAL',status:'LIBERADO',solicitante_id:8,obra_id:1,createdAt:new Date(2026,1,1)});
  const all=await f.call({page:'1',limit:'100'});assert.deepEqual(all.body.data.slice(0,2).map(r=>r.id),[100002,100001]);
  const invalid=await f.call({page:'1',limit:'1000'});assert.equal(invalid.status,400);
  const legacy=await f.call({});assert(Array.isArray(legacy.body));assert.equal(legacy.body.length,all.body.pagination.total);
  const oldDelegation=await f.call({page:'1',contexto:'delegacao'});assert.equal(oldDelegation.status,400);
 }finally{await f.close();}
});
test('status desconhecido mantem underscores e busca nao permite SQL ou curingas',async()=>{
 const f=await fixture();try{
  await f.models.SolicitacaoCompra.create({id:2000,origem:'NORMAL',status:'FECHAMENTO__PARCIAL',solicitante_id:8,solicitacao_principal_id:1,obra_id:1});
  const r=await f.call({page:'1',status:'FECHAMENTO__PARCIAL'},{id:7,eh_setor_compras:true});assert.deepEqual(r.body.data.map(r=>r.id),[2000]);
  const attack=await f.call({page:'1',q:"' OR 1=1 --"});assert.equal(attack.body.pagination.total,0);
 }finally{await f.close();}
});
test('SQL MySQL gerado tem LIMIT/OFFSET, ordem deterministica e expressoes suportadas',async()=>{
 const f=await fixture(),mysql=new Sequelize('qa','qa','qa',{dialect:'mysql',logging:false});mysql.connectionManager.getConnection=async()=>{throw Error('MYSQL_REAL_PROIBIDO');};
 try{
  const M=f.models.SolicitacaoCompra,options={model:M,attributes:P.LIST_ATTRIBUTES,where:P.filteredWhere({origem:{[Op.ne]:'COMPRA_DIRETA'}},P.parseQuery({q:'sc-100001',status:'CANCELADO'}),'mysql'),include:[{model:f.models.Obra,as:'obra'},{model:f.models.User,as:'solicitante'}],order:[['createdAt','DESC'],['id','DESC']],limit:2,offset:2};
  M._validateIncludedElements(options);const sql=mysql.dialect.queryGenerator.selectQuery(M.getTableName(),options,M);assert.match(sql,/LIMIT 2, 2/);assert.match(sql,/LPAD\(/);assert.match(sql,/GREATEST\(/);assert.match(sql,/REGEXP_REPLACE\(/);assert.match(sql,/`createdAt` DESC, `SolicitacaoCompra`\.`id` DESC/);assert(!sql.includes('JOIN `SolicitacaoCompraItem'));
 }finally{await f.close();await mysql.close();}
});
