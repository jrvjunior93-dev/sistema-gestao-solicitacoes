'use strict';
// QA local sem banco externo: opcoes reais, SQL Sequelize e SQLite em memoria.
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const {Sequelize,DataTypes}=require('sequelize');
const db=new Sequelize('qa','qa','qa',{dialect:'mysql',logging:false});
db.connectionManager.getConnection=async()=>{throw Error('QA_BANCO_PROIBIDO');};
const names=['SolicitacaoCompraFornecedor','FornecedorCompra','SolicitacaoCompra','Obra','SolicitacaoCompraItem','Insumo','Unidade','SolicitacaoCompraItemApropriacao','Apropriacao','SolicitacaoCompraItemManual','SolicitacaoCompraItemManualApropriacao','SolicitacaoCompraRespostaItem','SolicitacaoCompraFornecedorItem','PedidoCompra','User','Solicitacao'];
const models=Object.fromEntries(names.map(name=>[name,db.define(name,{id:{type:DataTypes.INTEGER,primaryKey:true}},{timestamps:false,tableName:name})]));
const many=(a,b,as,fk)=>models[a].hasMany(models[b],{as,foreignKey:fk});
const belongs=(a,b,as,fk)=>models[a].belongsTo(models[b],{as,foreignKey:fk});
belongs('SolicitacaoCompraFornecedor','FornecedorCompra','fornecedor','fornecedor_compra_id');
belongs('SolicitacaoCompraFornecedor','SolicitacaoCompra','solicitacao','solicitacao_compra_id');
belongs('SolicitacaoCompra','Obra','obra','obra_id');belongs('SolicitacaoCompra','User','solicitante','solicitante_id');
belongs('SolicitacaoCompra','User','compradorResponsavel','comprador_responsavel_id');belongs('SolicitacaoCompra','Solicitacao','solicitacaoPrincipal','solicitacao_principal_id');
many('SolicitacaoCompra','SolicitacaoCompraItem','itens','solicitacao_compra_id');many('SolicitacaoCompra','SolicitacaoCompraItemManual','itensManuais','solicitacao_compra_id');
many('SolicitacaoCompra','SolicitacaoCompraFornecedor','fornecedores','solicitacao_compra_id');many('SolicitacaoCompra','PedidoCompra','pedidos','solicitacao_compra_id');
belongs('SolicitacaoCompraItem','Insumo','insumo','insumo_id');belongs('SolicitacaoCompraItem','Unidade','unidade','unidade_id');belongs('SolicitacaoCompraItem','Apropriacao','apropriacao','apropriacao_id');
belongs('SolicitacaoCompraItemManual','Apropriacao','apropriacao','apropriacao_id');
many('SolicitacaoCompraItem','SolicitacaoCompraItemApropriacao','apropriacoes','solicitacao_compra_item_id');many('SolicitacaoCompraItemManual','SolicitacaoCompraItemManualApropriacao','apropriacoes','solicitacao_compra_item_manual_id');
belongs('SolicitacaoCompraItemApropriacao','Apropriacao','apropriacao','apropriacao_id');belongs('SolicitacaoCompraItemManualApropriacao','Apropriacao','apropriacao','apropriacao_id');
many('SolicitacaoCompraFornecedor','SolicitacaoCompraRespostaItem','respostas','solicitacao_compra_fornecedor_id');many('SolicitacaoCompraFornecedor','SolicitacaoCompraFornecedorItem','itensSelecionados','solicitacao_compra_fornecedor_id');
const local=name=>fs.readFileSync(__dirname+'/../src/controllers/'+name+'.js','utf8');
const BASE='2f6bd864ebda5d87e13852dc605c1a6c881abbf2';
const original=name=>cp.execFileSync('git',['show',BASE+':backend/src/controllers/'+name+'.js'],{cwd:__dirname,encoding:'utf8'});
function normalized(value){
 if(typeof value==='function')return value.name;
 if(Array.isArray(value))return value.map(normalized);
 if(value&&typeof value==='object')return Object.fromEntries(Reflect.ownKeys(value).filter(k=>k!=='separate').map(k=>[typeof k==='symbol'?String(k):k,normalized(value[k])]).sort(([a],[b])=>a.localeCompare(b)));
 return value;
}
function sqlFor(model,options){
 const sqlOptions={...options,model,attributes:Object.keys(model.rawAttributes)};
 model._validateIncludedElements(sqlOptions);return db.dialect.queryGenerator.selectQuery(model.getTableName(),sqlOptions,model);
}
async function captureQuote(source){
 const fragment=source.slice(source.indexOf('async function carregarCotacaoPorToken('),source.indexOf('async function serializarCotacaoPublica('));let captured;
 const context={...models,SolicitacaoCompraFornecedor:{findOne:async options=>{captured=options;return null;}}};
 const fn=new Function(...Object.keys(context),fragment+'\nreturn carregarCotacaoPorToken;')(...Object.values(context));
 await fn('QA_TOKEN');return captured;
}
async function captureIndex(source,query={},denied=false,config={}){
 const fragment=source.slice(source.indexOf('  async index(req, res) {'),source.indexOf('  async inativar(req, res) {'));let captured,body;
 const rateio=model=>({model,as:'apropriacoes',include:[{model:models.Apropriacao,as:'apropriacao',attributes:['id','codigo','descricao']}]});
 const context={...models,Op:Sequelize.Op,fn:Sequelize.fn,col:Sequelize.col,
  SolicitacaoCompra:{findAll:async options=>{captured=options;return[];}},
  validarAcesso:async()=>denied?null:{id:7},userHasSetorCapability:async()=>false,canEditarItensSolicitacaoCompra:async()=>false,
  canEncaminharCompraSolicitacoes:async()=>false,canViewAllComprasScope:async()=>config.full!==false,isSuperadmin:()=>config.superadmin!==false,canManageComprasDelegacao:async()=>true,
  buildIncludeRateiosItem:()=>rateio(models.SolicitacaoCompraItemApropriacao),buildIncludeRateiosItemManual:()=>rateio(models.SolicitacaoCompraItemManualApropriacao)};
 const fn=new Function(...Object.keys(context),'return ({'+fragment+'}).index;')(...Object.values(context));
 const res={json:value=>{body=value;},status:code=>{throw Error('QA_HTTP_'+code);}};
 const req={query,user:{id:7}};if(config.scope)req.compraScopeObraIds=config.scope;
 await fn(req,res);return{options:captured,body};
}
async function hydrateQuote(before,after){
 // SQL real em SQLite :memory:, sem arquivo e sem conexao externa. Compara
 // o retorno do JOIN antigo com a carga separada, inclusive filhos e filtro.
 const memory=new Sequelize({dialect:'sqlite',storage:':memory:',dialectModule:require('./helpers/sqliteSequelizeMemory'),logging:false});
 try{
  const attrs={id:{type:DataTypes.INTEGER,primaryKey:true},...Object.fromEntries(['nome','email','whatsapp','contato','codigo','sigla','descricao','token'].map(k=>[k,DataTypes.STRING])),deleted_at:DataTypes.DATE};
  const sm=Object.fromEntries(names.map(name=>[name,memory.define(name,attrs,{timestamps:false,tableName:name})]));
  for(const name of names)for(const a of Object.values(models[name].associations))sm[name][a.associationType==='HasMany'?'hasMany':'belongsTo'](sm[a.target.name],{as:a.as,foreignKey:a.foreignKey});
  await memory.sync();
  await sm.SolicitacaoCompra.bulkCreate([{id:650},{id:651}]);
  await sm.SolicitacaoCompraFornecedor.bulkCreate([{id:313,token:'QA_TOKEN',solicitacao_compra_id:650},{id:314,token:'OUTRO_TOKEN',solicitacao_compra_id:651}]);
  await sm.SolicitacaoCompraItem.bulkCreate([{id:1,solicitacao_compra_id:650},{id:2,solicitacao_compra_id:650},{id:3,solicitacao_compra_id:651}]);
  await sm.SolicitacaoCompraItemManual.bulkCreate([{id:10,solicitacao_compra_id:650},{id:11,solicitacao_compra_id:650},{id:12,solicitacao_compra_id:650}]);
  await sm.Apropriacao.bulkCreate([{id:1,codigo:'AP1'},{id:2,codigo:'AP2'}]);
  await sm.SolicitacaoCompraItemApropriacao.bulkCreate([{id:1,solicitacao_compra_item_id:1,apropriacao_id:1},{id:2,solicitacao_compra_item_id:1,apropriacao_id:2}]);
  await sm.SolicitacaoCompraItemManualApropriacao.create({id:3,solicitacao_compra_item_manual_id:10,apropriacao_id:1});
  await sm.SolicitacaoCompraRespostaItem.bulkCreate([{id:20,solicitacao_compra_fornecedor_id:313},{id:21,solicitacao_compra_fornecedor_id:313},{id:22,solicitacao_compra_fornecedor_id:313,deleted_at:new Date()},{id:23,solicitacao_compra_fornecedor_id:314}]);
  await sm.SolicitacaoCompraFornecedorItem.bulkCreate([{id:30,solicitacao_compra_fornecedor_id:313},{id:31,solicitacao_compra_fornecedor_id:313},{id:32,solicitacao_compra_fornecedor_id:314}]);
  const translate=o=>({...o,...(o.model?{model:sm[o.model.name]}:{}),...(o.include?{include:o.include.map(translate)}:{})});
  const ordered=v=>Array.isArray(v)?v.map(ordered).sort((a,b)=>a.id-b.id):v&&typeof v==='object'&&! (v instanceof Date)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;
  const old=await sm.SolicitacaoCompraFornecedor.findOne(translate(before)),next=await sm.SolicitacaoCompraFornecedor.findOne(translate(after));
  assert.deepEqual(ordered(next.toJSON()),ordered(old.toJSON()),'Conteudo completo deve permanecer igual ao JOIN anterior.');
  assert.equal(next.solicitacao.itens.length,2);assert.equal(next.solicitacao.itensManuais.length,3);assert.equal(next.solicitacao.itens[0].apropriacoes.length,2);
  assert.deepEqual(next.respostas.map(r=>r.id).sort((a,b)=>a-b),[20,21]);assert.deepEqual(next.itensSelecionados.map(r=>r.id).sort((a,b)=>a-b),[30,31]);
  const empty=await sm.SolicitacaoCompraFornecedor.findOne(translate({...after,where:{token:'AUSENTE'}}));assert.equal(empty,null);
 }finally{await memory.close();}
}
async function main(){
 const before=await captureQuote(original('CotacaoFornecedorController')),after=await captureQuote(local('CotacaoFornecedorController'));
 assert.deepEqual(normalized(after),normalized(before),'Somente estrategia de carga pode mudar, nao filtros/projecoes/modelos.');
 const sourceSql=sqlFor(models.SolicitacaoCompraFornecedor,before),targetSql=sqlFor(models.SolicitacaoCompraFornecedor,after);
 for(const alias of ['solicitacao->itens','solicitacao->itensManuais','respostas','itensSelecionados']){
  assert(sourceSql.includes(' AS `'+alias+'`'),'Consulta anterior deve demonstrar o JOIN '+alias);
  assert(!targetSql.includes(' AS `'+alias+'`'),'Consulta corrigida nao pode juntar colecao '+alias);
 }
 assert(targetSql.includes('QA_TOKEN'));assert.deepEqual(after.where,{token:'QA_TOKEN'});
 const sc=after.include.find(i=>i.as==='solicitacao');assert(sc.include.filter(i=>['itens','itensManuais'].includes(i.as)).every(i=>i.separate===true));
 for(const visao of [undefined,'resumo','delegacao']){
  const query=visao?{visao,obra_id:'77'}:{obra_id:'77'},a=await captureIndex(original('SolicitacaoCompraController'),query),b=await captureIndex(local('SolicitacaoCompraController'),query);
  assert.deepEqual(normalized(b.options),normalized(a.options),'Filtros/escopo/projecoes da lista devem ser preservados.');assert.deepEqual(b.body,a.body);
  const sql=sqlFor(models.SolicitacaoCompra,b.options);
  for(const include of b.options.include.filter(i=>['itens','itensManuais','fornecedores','pedidos'].includes(i.as)))assert(include.separate===true&&!sql.includes(' AS `'+include.as+'`'));
 }
 const denied=await captureIndex(local('SolicitacaoCompraController'),{},true);assert.equal(denied.options,undefined,'Sem acesso nao pode consultar SC.');
 const restricted={superadmin:false,full:false,scope:[77,78]},a=await captureIndex(original('SolicitacaoCompraController'),{},false,restricted),b=await captureIndex(local('SolicitacaoCompraController'),{},false,restricted);
 assert.deepEqual(normalized(b.options),normalized(a.options));assert.deepEqual(b.options.where.obra_id[Sequelize.Op.in],[77,78]);
 assert.deepEqual(b.options.where[Sequelize.Op.or],[{comprador_responsavel_id:7},{solicitante_id:7}]);
 const emptyScope=await captureIndex(local('SolicitacaoCompraController'),{},false,{scope:[]});assert.equal(emptyScope.options,undefined);assert.deepEqual(emptyScope.body,[]);
 // Demonstra a ordem de crescimento, sem materializar o produto cartesiano.
 const rowsBefore=100*20*120*120,rowsAfter=100+20+120+120;
 assert.equal(rowsBefore,28800000);assert.equal(rowsAfter,360);
 await hydrateQuote(await captureQuote(original('CotacaoFornecedorController')),await captureQuote(local('CotacaoFornecedorController')));
 console.log('QA Compras OOM: SQL sem JOIN entre colecoes; retorno completo identico em SQLite memoria, filtros/projecoes/escopo/acesso preservados; sem banco externo.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
