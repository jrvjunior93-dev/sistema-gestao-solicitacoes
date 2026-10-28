'use strict';
// Servicos reais com SQL Sequelize em SQLite :memory:. Sem env/app/banco externo.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {Sequelize,DataTypes,Op}=require('sequelize');
const memory=require('./helpers/sqliteSequelizeMemory');
let harness;
if(process.argv.includes('--baseline')){
 const target=path.resolve(__dirname,'../src/services/pedidoCompraService.js'),read=fs.readFileSync;
 const old=require('node:child_process').execFileSync('git',['show','ece109c93f62268bb3f4108d658e9a817bff80f5:backend/src/services/pedidoCompraService.js'],{encoding:'utf8'});
 fs.readFileSync=function(file,...args){return typeof file==='string'&&path.resolve(file)===target?old:read.call(this,file,...args)};
 try{harness=require('./validarPedidoReabertura')}finally{fs.readFileSync=read}
}else harness=require('./validarPedidoReabertura');
const {fixture}=harness;
const source=fs.readFileSync(path.join(__dirname,'../src/services/pedidoCompraFinanceiroService.js'),'utf8');
async function database(kind){
 const sql=[],db=new Sequelize({dialect:'sqlite',storage:':memory:',dialectModule:memory,logging:s=>sql.push(s)});
 const id={type:DataTypes.INTEGER,primaryKey:true};
 const TituloFinanceiro=db.define('TituloFinanceiro',{id,codigo:DataTypes.STRING,tipo:DataTypes.STRING,status:DataTypes.STRING,
  descricao:DataTypes.STRING,valor_original:DataTypes.DECIMAL,valor_saldo:DataTypes.DECIMAL,valor_baixado:DataTypes.DECIMAL,
  compartilhamento_id:DataTypes.INTEGER,data_emissao:DataTypes.DATEONLY,data_vencimento:DataTypes.DATEONLY,
  forma_pagamento_id:DataTypes.INTEGER,categoria_financeira_id:DataTypes.INTEGER,deleted_at:DataTypes.DATE},
  {timestamps:false,defaultScope:{where:{deleted_at:null}}});
 const attrs={id,pedido_compra_id:DataTypes.INTEGER,titulo_financeiro_id:DataTypes.INTEGER,tipo:DataTypes.STRING,
  origem:DataTypes.STRING,status_liberacao:DataTypes.STRING,numero_parcela:DataTypes.INTEGER,total_parcelas:DataTypes.INTEGER};
 const models={TituloFinanceiro,PedidoCompraReabertura:{findOne:async()=>null}};
 for(const name of ['PedidoCompraTitulo','SolicitacaoCompraAlocacao','PedidoCompraFrete'])models[name]=db.define(name,attrs,{timestamps:false});
 models.PedidoCompraTitulo.belongsTo(TituloFinanceiro,{as:'titulo',foreignKey:'titulo_financeiro_id',constraints:false});
 await db.sync();
 await TituloFinanceiro.bulkCreate([81,82].map(n=>({id:n,codigo:'TIT-QA-'+n,tipo:'PAGAR',status:'ABERTO',valor_original:100,valor_saldo:100,valor_baixado:0})));
 const route={direto:'PedidoCompraTitulo',alocacao:'SolicitacaoCompraAlocacao',frete:'PedidoCompraFrete'}[kind];
 await models[route].bulkCreate([{id:1,pedido_compra_id:271,titulo_financeiro_id:81,tipo:'TERCEIRO',origem:'COMPRA'},
  {id:2,pedido_compra_id:272,titulo_financeiro_id:82,tipo:'TERCEIRO',origem:'COMPRA'}]);
 const moduleQA={exports:{}};
 vm.runInNewContext(source,{module:moduleQA,Date,require(name){
  if(name==='sequelize')return{Op};if(name==='../models')return models;
  if(['./tituloFinanceiroService','./notificacoes','./pedidoCompraTituloConfigService','./formasPagamentoMedicaoService','./authorizationService'].includes(name))return{};
  if(name==='./tituloRenegociacaoVinculos')return{projetarAssociacoes:async()=>{},projetarOrigens:async rows=>rows};
  if(name==='./tituloCompartilhadoLeitura')return{projetarPedido:async()=>{}};
  throw Error('DEPENDENCIA_NAO_SIMULADA:'+name);
 }});
 const finance=moduleQA.exports;
 const snapshot=async()=>JSON.stringify(await Promise.all([TituloFinanceiro.unscoped(),...['PedidoCompraTitulo','SolicitacaoCompraAlocacao','PedidoCompraFrete'].map(k=>models[k])]
  .map(m=>m.findAll({raw:true,order:[['id','ASC']]}))));
 async function check(expected){
  // O pedido/historico/transaction usam o harness isolado. A fronteira financeira
  // roda SQL real sem transaction de producao, pois SQLite e efemero/local.
  const order=fixture((pedidoId,opts)=>{assert(opts.transaction);assert.equal(opts.incluirLegados,true);return finance.buscarTitulosPedido(pedidoId)});
  order.options[{direto:'vinculos',alocacao:'alocacoesTitulo',frete:'fretesTitulo'}[kind]]=1;
  const before=await snapshot(),start=sql.length;
  const summary=await finance.obterResumoFinanceiroPedido(order.pedido);
  assert.equal(summary.reabertura_exige_geo,expected);assert.equal(summary.possui_titulo,expected);
  assert.equal(summary.quantidade_titulos,expected?1:0);
  const reopen=()=>order.transacao(transaction=>order.service.reabrirPedidoParaCotacao({pedidoId:271,usuarioId:7,motivo:'Conferir pedido apos exclusao',transaction}));
  if(expected){
   await assert.rejects(reopen(),e=>e.code==='REABERTURA_EXIGE_APROVACAO_GEO');
   assert.equal(order.estado.pedido.status,'FECHADO_FORNECEDOR');assert.equal(order.estado.historicos.length,0);
  }else{
   await reopen();await reopen();
   assert.equal(order.estado.pedido.status,'ABERTO');
   assert.equal(order.estado.historicos.filter(h=>h.acao==='PEDIDO_COMPRA_REABERTO').length,1);assert.equal(order.estado.sincronizacoesFinanceiras,0);
  }
  assert.equal(await snapshot(),before,'Reabertura nao apaga/atualiza titulos ou vinculos');
  assert(sql.slice(start).every(q=>!/:\s*(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/i.test(q)));
 }
 return{db,models,check,route};
}
for(const kind of ['direto','alocacao','frete'])test('reabertura e resumo concordam: '+kind,async()=>{
 const f=await database(kind),title=f.models.TituloFinanceiro;
 try{
  for(const status of ['PREVISAO','ABERTO','PARCIAL','QUITADO','CANCELADO','ESTORNADO','RENEGOCIADO']){
   await title.update({status,valor_baixado:status==='PARCIAL'?30:status==='QUITADO'?100:0},{where:{id:81}});
   await f.check(true);
  }
  await title.update({deleted_at:new Date('2026-10-28T12:00:00Z')},{where:{id:81}});
  assert.equal(await f.models[f.route].count({where:{pedido_compra_id:271}}),1,'Vinculo historico permanece');
  await f.check(false); // outro pedido ainda tem titulo existente, sem vazar.
  await title.unscoped().destroy({where:{id:81}});
  await f.check(false); // referencia orfa tambem nao equivale a titulo existente.
 }finally{await f.db.close()}
});
