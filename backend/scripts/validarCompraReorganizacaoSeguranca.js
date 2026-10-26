'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const D=require('../src/services/compraReorganizacaoDomain'),{createController}=require('../src/controllers/CompraReorganizacaoController'),{createStore,specs,guardSql}=require('../src/services/compraReorganizacaoStore');
const base={sc_id:1,tipo:'TOTAL',cancelar_principal:true,cancelar_cotacao:true,encerrar_saldo:false,itens_saldo:[],motivo:'Reorganizar'};
function controllerFixture(){let invoked=0;const sc={id:1,obra_id:2,solicitante_id:1,comprador_responsavel_id:1},calls=[];
 const auth=new Proxy({canAccessSolicitacaoCompraByScope:async()=>true},{get(o,k){return o[k]||(async()=>{calls.push(k);return true;});}});
 const ctrl=createController({db:{},auth,scope:async(req,_res,next)=>{req.solicitacaoCompraResource=sc;next();},capability:async()=>true,storeFactory:()=>({}),serviceFactory:(_s,authorize)=>({simulate:async(user,items)=>{await authorize(user,items[0],'APLICAR',{business:{SolicitacaoCompra:[sc]}});invoked++;return{ok:true};}})});
 const request={user:{id:1,ativo:true},body:{itens:[base]},params:{},method:'POST'},res={code:200,status(c){this.code=c;return this;},json(body){this.body=body;return this;}};
 return{auth,ctrl,request,res,calls,invoked:()=>invoked};
}
test('permissoes granulares de cancelar/cotacao e escopo sao exigidos antes de operar',async()=>{
 let f=controllerFixture();await f.ctrl.simulate(f.request,f.res);assert.equal(f.res.code,200);assert(f.calls.includes('canDeleteCompraSolicitacoes'));assert(f.calls.includes('canCancelarComprasCotacoes'));
 f=controllerFixture();f.auth.canDeleteCompraSolicitacoes=async()=>false;await f.ctrl.simulate(f.request,f.res);assert.equal(f.res.code,403);assert.equal(f.invoked(),0);
 f=controllerFixture();f.auth.canAccessSolicitacaoCompraByScope=async()=>false;await f.ctrl.simulate(f.request,f.res);assert.equal(f.res.code,403);
 f=controllerFixture();f.request.body.extra='injecao';await f.ctrl.simulate(f.request,f.res);assert.equal(f.res.code,400);
 f=controllerFixture();f.request.user=null;await f.ctrl.simulate(f.request,f.res);assert.equal(f.res.code,401);
});
test('rotas novas permanecem depois de auth/CSRF/MFA/modulo e usam limite de operacao',()=>{
 const src=fs.readFileSync(path.resolve(__dirname,'../src/routes.js'),'utf8'),pos=src.indexOf("router.post('/compras/reorganizacao/simular'");
 for(const token of['router.use(auth)','router.use(csrfProtection)','router.use(requireMfaCompletion)',"router.use('/compras', requireEnabledModule('COMPRAS'))"])assert(src.indexOf(token)>=0&&src.indexOf(token)<pos,token);
 assert(src.includes("'/compras/reorganizacao/lotes/:loteId/reverter', criticalRateLimit"));
});
test('migration cria somente journal aditivo, e replay e tipos divergentes sao tratados',async()=>{
 const m=require('../migrations/202610260002_compra_reorganizacao_reversivel'),{Sequelize,DataTypes}=require('sequelize'),dialect=new Sequelize('offline','offline','offline',{dialect:'mysql',logging:false});let shape,create=0,index=false;
 const qi={showAllTables:async()=>shape?['compra_reorganizacao_operacoes']:[],createTable:async(name,attrs)=>{assert.equal(name,'compra_reorganizacao_operacoes');create++;shape=Object.fromEntries(Object.entries(attrs).map(([k,v])=>[k,{type:String(dialect.normalizeDataType(v.type)),allowNull:v.allowNull,primaryKey:!!v.primaryKey}]));},describeTable:async()=>shape,showIndex:async()=>index?[{name:'uq_compra_reorg_lote_sc',unique:true,fields:[{attribute:'lote_id'},{attribute:'solicitacao_compra_id'}]}]:[],addIndex:async()=>{index=true;}};
 await m.up({queryInterface:qi,DataTypes});await m.up({queryInterface:qi,DataTypes});assert.equal(create,1);assert(index);shape.antes_json.type='TEXT';await assert.rejects(m.up({queryInterface:qi,DataTypes}),/SCHEMA_INCOMPATIVEL/);await assert.rejects(m.down(),/SEM_REVERSAO_DESTRUTIVA/);
});
test('modo reversivel preserva IDs dos rateios e nao executa destroy',async()=>{
 const file=path.resolve(__dirname,'../src/services/pedidoCompraFreteService.js'),rows=[{id:1,pedido_compra_item_id:11,valor_rateado:10},{id:2,pedido_compra_item_id:12,valor_rateado:20}];let created=[];
 const model={findAll:async()=>rows.map(r=>({...r,update:async patch=>Object.assign(r,patch)})),bulkCreate:async values=>{created.push(...values);},destroy:()=>{throw Error('EXCLUSAO_PROIBIDA');}};
 const sandbox={module:{exports:{}},require:id=>id==='../models'?{PedidoCompraFreteRateio:model}:id==='sequelize'?require('sequelize'):{},console};
 vm.runInNewContext(fs.readFileSync(file,'utf8')+'\nmodule.exports.qa=salvarRateiosPreservandoRegistros;',sandbox,{filename:file});
 await sandbox.module.exports.qa(1,[{pedido_compra_item_id:12,valor_item_base:100,percentual_rateio:50,valor_rateado:30,manual:false},{pedido_compra_item_id:13,valor_item_base:200,percentual_rateio:50,valor_rateado:30,manual:false}],{LOCK:{UPDATE:'UPDATE'}});
 assert.equal(rows[0].valor_rateado,0);assert.equal(rows[1].valor_rateado,30);assert.equal(rows[1].id,2);assert.equal(created.length,1);assert.equal(created[0].pedido_compra_item_id,13);
});
test('guarda de conexao e local a transacao, restaura funcoes apos erro e aceita SQL MySQL real',async()=>{
 const {Sequelize,DataTypes}=require('sequelize'),sequelize=new Sequelize('offline','offline','offline',{dialect:'mysql',logging:false}),db={sequelize};
 for(const name of Object.keys(specs))db[name]=require('../src/models/'+name)(sequelize,DataTypes);
 for(const name of['CompraReorganizacaoOperacao','Historico','SolicitacaoCompraLog','PedidoCompraItemLog','PedidoCompraEntregaOperacao'])db[name]=require('../src/models/'+name)(sequelize,DataTypes);
 const store=createStore(db),seen=[],connection={query(sql){seen.push(sql);return'OK';},execute(sql){seen.push(sql);return'OK';}},native=connection.query;
 await store.writeGuard({connection},async()=>{assert.equal(connection.query('SELECT 1'),'OK');assert.throws(()=>connection.query('DELETE FROM `pedido_compra_itens`'));});assert.equal(connection.query,native);
 await assert.rejects(store.writeGuard({connection},async()=>{throw Error('interrompido');}));assert.equal(connection.query,native);
 const tableSpecs=new Map(Object.entries(specs).map(([n,s])=>[db[n].getTableName(),s]));
 for(const [name,spec] of Object.entries(specs)){
  const sql=sequelize.getQueryInterface().queryGenerator.updateQuery(db[name].getTableName(),{[spec.write[0]]:null},{[spec.pk||'id']:1},{},db[name].rawAttributes).query;
  guardSql(sql,tableSpecs,new Set());
 }
});

test('manifestos locais separam total/saldo/itens e nao omitem bloqueios financeiros',()=>{
 const {prepare}=require('./prepararCompraReorganizacaoManifestos');
 const report={summary:{cancelamentos_executados:0,consultado_em:'2026-10-26'},rows:[{id:1,sc_id:1,modo:'TOTAL',pedidos:[],titulos:[]},{id:2,sc_id:2,modo:'SALDO_NAO_RECEBIDO',pedidos:[{id:20,status:'FECHADO_FORNECEDOR',bloqueio_financeiro:true}],itens:[{id:21,pedido_compra_id:20,quantidade_pedido:10,recebido:3}]}]};
 const r=prepare(report);assert.equal(r.total.itens.length,1);assert.deepEqual(r.saldo.itens[0].itens_saldo,[]);assert.deepEqual(r.pedidos.itens[0].itens_saldo,[21]);assert.equal(r.conferencia.mensagens.length,3);assert(r.conferencia.alertas.some(a=>a.codigo==='REORG_PEDIDO_COM_FINANCEIRO'));assert.equal(r.conferencia.cancelamentos_executados,0);
 assert.throws(()=>prepare({...report,rows:[report.rows[0],report.rows[0]]}));
});
