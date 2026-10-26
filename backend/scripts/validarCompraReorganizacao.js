'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{Sequelize,DataTypes,Op}=require('sequelize');
const D=require('../src/services/compraReorganizacaoDomain'),{createStore,specs,guardSql}=require('../src/services/compraReorganizacaoStore'),{createService}=require('../src/services/compraReorganizacaoService');
const user={id:1,ativo:true},lote='ee98a900-5055-4f03-bd09-6443003a88cd';
const total=id=>({sc_id:id,tipo:'TOTAL',cancelar_principal:true,cancelar_cotacao:true,encerrar_saldo:false,itens_saldo:[],motivo:'Solicitado pelo proprietário para reorganização.'});
const partial=id=>({sc_id:id,tipo:'PARCIAL',cancelar_principal:false,cancelar_cotacao:false,encerrar_saldo:true,itens_saldo:[101],motivo:'Cancelar apenas saldo revisado.'});
async function fixture(){
 const db={sequelize:new Sequelize({dialect:'sqlite',storage:':memory:',dialectModule:require('./helpers/sqliteSequelizeMemory'),logging:false})};
 const names=[...new Set([...Object.keys(specs),'CompraReorganizacaoOperacao','SolicitacaoCompraItem','SolicitacaoCompraItemManual','PedidoCompraItemRecebimento','PedidoCompraTitulo','TituloCompartilhadoOrigem','TituloFinanceiro','PagamentoManualFilaItem','PagamentoAutorizacaoItem','FiscalDocumentLink','PedidoCompraDocumentoFinanceiro','PedidoCompraReabertura','Anexo','Historico','SolicitacaoCompraLog','PedidoCompraItemLog','PedidoCompraEntregaOperacao'])];
 for(const name of names)db[name]=require(name==='FiscalDocumentLink'?'../src/modules/fiscal/models/'+name:'../src/models/'+name)(db.sequelize,DataTypes);
 await db.sequelize.sync();await db.sequelize.query('PRAGMA foreign_keys=OFF');
 async function seed(name,attrs){const model=db[name],values={...attrs};
  for(const [key,a] of Object.entries(model.rawAttributes))if(values[key]===undefined&&!a.autoIncrement&&a.allowNull===false&&a.defaultValue===undefined){
   const kind=a.type.key;values[key]=['INTEGER','BIGINT','DECIMAL','FLOAT','DOUBLE'].includes(kind)?1:kind==='BOOLEAN'?false:kind==='DATE'?new Date():kind==='DATEONLY'?'2026-10-26':kind==='JSON'?{}:'QA_'+name+'_'+key+'_'+(attrs.id||1);
  }
  return model.create(values,{hooks:false,validate:false});
 }
 for(const id of[1,2]){await seed('Solicitacao',{id:id+10,codigo:'SOL-'+id,status_global:'PENDENTE',valor:100});await seed('SolicitacaoCompra',{id,origem:'NORMAL',status:'LIBERADO_PARA_COMPRA',solicitacao_principal_id:id+10,obra_id:1,solicitante_id:1});await seed('SolicitacaoCompraFornecedor',{id,solicitacao_compra_id:id,status:'RESPONDIDO'});await seed('SolicitacaoCompraItemManual',{id,solicitacao_compra_id:id,quantidade:20});}
 const store=createStore(db),realRestore=store.restore;let runs=0,failAt=null,queue=Promise.resolve();
 store.transaction=fn=>{const next=queue.then(()=>db.sequelize.transaction(fn));queue=next.catch(()=>{});return next;};
 // Mesmo snapshot/restaurador e journal SQL reais. Efeitos de negocio isolados em memoria.
 store.writeGuard=async(_tx,fn)=>fn();
 store.run=async(config,_uid,entryId,before,tx)=>{
  runs++;
  if(config.tipo==='TOTAL'){
   await db.SolicitacaoCompra.update({status:'CANCELADA',encerrado_em:new Date(),observacoes:config.motivo},{where:{id:config.sc_id},transaction:tx});
   if(config.cancelar_principal)await db.Solicitacao.update({status_global:'CANCELADA'},{where:{id:before.business.Solicitacao[0].id},transaction:tx});
  }else{
   await db.PedidoCompraItem.update({quantidade_pedido:3,quantidade_cancelada:0,valor_total:30,ipi_valor:0},{where:{id:101},transaction:tx});
   await db.SolicitacaoCompraAlocacao.update({quantidade_alocada:3,valor_total:30},{where:{pedido_compra_item_id:101},transaction:tx});
   await db.PedidoCompra.update({valor_total:30,valor_total_fornecedor:30},{where:{id:100},transaction:tx});
   await db.PedidoCompraEntrega.create({pedido_compra_item_id:101,pedido_compra_id:100,estado:'CONCLUIDO',saldo_cancelado:7,versao:1},{transaction:tx});
   await seedInTx('SolicitacaoCompraFechamento',{solicitacao_compra_id:config.sc_id,tipo:'SEM_PEDIDO',numero_rodada:1,idempotency_key:entryId,fechado_em:new Date(),status:'CONCLUIDO'},tx);
   await db.SolicitacaoCompra.update({status:'ENCERRADO'},{where:{id:config.sc_id},transaction:tx});
  }
  if(failAt==='after')throw Error('falha simulada');
 };
 async function seedInTx(name,attrs,tx){return db[name].create(attrs,{transaction:tx});}
 let denied=false;
 const service=createService(store,async()=>{D.check(!denied,'REORG_ACESSO_NEGADO',403);});
 async function addPartial(){
  await seed('PedidoCompra',{id:100,solicitacao_compra_id:1,obra_id:1,fornecedor_compra_id:1,status:'FECHADO_FORNECEDOR',valor_total:100,valor_total_fornecedor:100});
  await seed('PedidoCompraItem',{id:101,pedido_compra_id:100,item_tipo:'MANUAL',solicitacao_compra_item_manual_id:1,quantidade_pedido:10,quantidade_cancelada:0,valor_total:100,ipi_valor:5});
  await seed('SolicitacaoCompraAlocacao',{id:1,solicitacao_compra_id:1,pedido_compra_id:100,pedido_compra_item_id:101,solicitacao_compra_item_manual_id:1,quantidade_alocada:10,status:'ATIVA',valor_total:100});
  await seed('PedidoCompraItemRecebimento',{id:1,pedido_compra_item_id:101,quantidade:3});
 }
 return{db,store,service,seed,addPartial,runs:()=>runs,deny:()=>denied=true,fail:()=>failAt='after',close:()=>db.sequelize.close()};
}
async function runFixture(fn){const f=await fixture();try{return await fn(f);}finally{await f.close();}}
const apply=(f,p,sc_ids=[1])=>f.service.apply(user,{lote_id:lote,plano:p,sc_ids,confirmacao:'APLICAR_LOTE_REVISADO'});
test('simulacao sem journal/escrita de compra e sem vazamento de snapshots',()=>runFixture(async f=>{
 const before=await f.store.transaction(tx=>f.store.capture(1,tx));const plan=await f.service.simulate(user,[total(1)]);assert.equal(plan.sc[0].situacao,'PRONTA');assert(!JSON.stringify(plan).includes('antes_json'));
 assert.equal(await f.db.CompraReorganizacaoOperacao.count(),0);const after=await f.store.transaction(tx=>f.store.capture(1,tx));assert.equal(D.hash(before),D.hash(after));
}));
test('cancelar duas SCs, reverter uma, repetir reversao e depois reverter o restante',()=>runFixture(async f=>{
 const p=await f.service.simulate(user,[total(1),total(2)]);assert((await apply(f,p,[1,2])).resultados.every(r=>r.status==='APLICADA'));
 let reverse=await f.service.simulateReverse(user,{lote_id:lote,sc_ids:[1],motivo:'Rever apenas SC1'});
 assert.equal((await f.service.reverse(user,{plano:reverse,sc_ids:[1],motivo:reverse.motivo,confirmacao:'REVERTER_LOTE_REVISADO'})).resultados[0].status,'REVERTIDA');
 assert.equal((await f.db.SolicitacaoCompra.findByPk(1)).status,'LIBERADO_PARA_COMPRA');assert.equal((await f.db.SolicitacaoCompra.findByPk(2)).status,'CANCELADA');
 const histories=await f.db.Historico.count();const replay=await f.service.reverse(user,{plano:reverse,sc_ids:[1],motivo:reverse.motivo,confirmacao:'REVERTER_LOTE_REVISADO'});assert(replay.resultados[0].replay);assert.equal(await f.db.Historico.count(),histories);
 reverse=await f.service.simulateReverse(user,{lote_id:lote,todas:true,motivo:'Reverter lote'});const r=await f.service.reverse(user,{plano:reverse,sc_ids:reverse.sc.map(s=>s.sc_id),motivo:reverse.motivo,confirmacao:'REVERTER_LOTE_REVISADO'});assert(r.resultados.every(r=>r.status==='REVERTIDA'));
}));
test('duplo envio concorrente e resposta perdida nao repetem alteracoes/historico',()=>runFixture(async f=>{
 const p=await f.service.simulate(user,[total(1)]);const [a,b]=await Promise.all([apply(f,p),apply(f,p)]);assert.equal(f.runs(),1);assert(a.resultados[0].replay!==b.resultados[0].replay);assert.equal(await f.db.CompraReorganizacaoOperacao.count(),1);assert.equal(await f.db.Historico.count(),1);
}));
test('falha depois da mutacao faz rollback inclusive journal e status principal',()=>runFixture(async f=>{
 const p=await f.service.simulate(user,[total(1)]);f.fail();const r=await apply(f,p);assert.equal(r.resultados[0].status,'CONFLITO');assert.equal((await f.db.SolicitacaoCompra.findByPk(1)).status,'LIBERADO_PARA_COMPRA');assert.equal((await f.db.Solicitacao.findByPk(11)).status_global,'PENDENTE');assert.equal(await f.db.CompraReorganizacaoOperacao.count(),0);assert.equal(await f.db.Historico.count(),0);
}));
test('mudanca depois da simulacao bloqueia aplicar e depois de aplicado bloqueia reversao',()=>runFixture(async f=>{
 let p=await f.service.simulate(user,[total(1)]);await f.db.SolicitacaoCompra.update({observacoes:'Nova observacao'},{where:{id:1}});assert.equal((await apply(f,p)).resultados[0].codigo,'REORG_PLANO_DESATUALIZADO');
 p=await f.service.simulate(user,[total(1)]);await apply(f,p);await f.db.SolicitacaoCompra.update({observacoes:'Trabalho posterior'},{where:{id:1}});
 const r=await f.service.simulateReverse(user,{lote_id:lote,todas:true,motivo:'Solicitado'});assert.equal(r.sc[0].codigo,'REORG_MOVIMENTACAO_POSTERIOR');assert.equal((await f.db.SolicitacaoCompra.findByPk(1)).observacoes,'Trabalho posterior');
}));
test('saldo parcial restaura campos/quantidades sem apagar fechamento ou recebimentos',()=>runFixture(async f=>{
 await f.addPartial();const p=await f.service.simulate(user,[partial(1)]);assert.equal(p.sc[0].situacao,'PRONTA');assert.equal((await apply(f,p)).resultados[0].status,'APLICADA');
 const r=await f.service.simulateReverse(user,{lote_id:lote,sc_ids:[1],motivo:'Retomar saldo'});const out=await f.service.reverse(user,{plano:r,sc_ids:[1],motivo:r.motivo,confirmacao:'REVERTER_LOTE_REVISADO'});assert.equal(out.resultados[0].status,'REVERTIDA');
 assert.equal(Number((await f.db.PedidoCompraItem.findByPk(101)).quantidade_pedido),10);assert.equal(Number((await f.db.SolicitacaoCompraAlocacao.findByPk(1)).quantidade_alocada),10);
 assert.equal((await f.db.SolicitacaoCompraFechamento.findOne()).status,'REVERTIDO');assert.equal(await f.db.PedidoCompraItemRecebimento.count(),1);const e=await f.db.PedidoCompraEntrega.findByPk(101);assert.equal(e.versao,2);assert.equal(Number(e.saldo_cancelado),0);
}));
test('titulo novo depois do cancelamento impede reversao sem alterar pagamento',()=>runFixture(async f=>{
 const p=await f.service.simulate(user,[total(1)]);await apply(f,p);await f.seed('TituloFinanceiro',{id:50,solicitacao_id:11,status:'QUITADO',valor_baixado:100,valor_saldo:0});
 const r=await f.service.simulateReverse(user,{lote_id:lote,todas:true,motivo:'Retomar'});assert.equal(r.sc[0].situacao,'BLOQUEADA');assert.equal((await f.db.TituloFinanceiro.findByPk(50)).status,'QUITADO');
}));
test('titulo vinculado bloqueia saldo e principal compartilhada bloqueia o grupo',()=>runFixture(async f=>{
 await f.addPartial();await f.seed('TituloFinanceiro',{id:50,solicitacao_id:11,status:'ABERTO'});await f.seed('PedidoCompraTitulo',{pedido_compra_id:100,titulo_financeiro_id:50,data_vencimento:'2026-12-30',valor:100});
 assert.equal((await f.service.simulate(user,[partial(1)])).sc[0].codigo,'REORG_PEDIDO_COM_FINANCEIRO');
 await f.db.SolicitacaoCompra.update({solicitacao_principal_id:12},{where:{id:1}});assert.equal((await f.service.simulate(user,[total(2)])).sc[0].codigo,'REORG_PRINCIPAL_COMPARTILHADA');
}));
test('permissao revogada, usuario diferente, escopo/hash/motivo alterados nao gravam',()=>runFixture(async f=>{
 const p=await f.service.simulate(user,[total(1)]);await assert.rejects(apply(f,{...p,usuario_id:2}),/PLANO_INVALIDO/);await assert.rejects(apply(f,{...p,sc:[]}),/PLANO_INVALIDO/);f.deny();await assert.rejects(apply(f,p),/ACESSO_NEGADO/);assert.equal(await f.db.CompraReorganizacaoOperacao.count(),0);
}));
test('guarda SQL nega DELETE/DDL, financeiro, outro campo e comandos empilhados',()=>{
 const tables=new Map([['pedido_compra_itens',specs.PedidoCompraItem]]),audit=new Set(['historicos']);
 guardSql('UPDATE `pedido_compra_itens` SET `quantidade_pedido`=? WHERE `id`=?;',tables,audit);
 guardSql("INSERT INTO `historicos` (`descricao`) VALUES ('texto; UPDATE aqui')",tables,audit);
 for(const sql of['DELETE FROM `pedido_compra_itens`','DROP TABLE x','UPDATE `titulos_financeiros` SET `valor_saldo`=0 WHERE id=1','UPDATE `pedido_compra_itens` SET `pedido_compra_id`=2 WHERE id=1','SELECT 1; DROP TABLE x'])assert.throws(()=>guardSql(sql,tables,audit));
});
test('selecao e motivos explicitos; sem todos implicito, duplicidades ou coercao de booleanos',()=>{
 assert.throws(()=>D.entries([{...total(1),cancelar_principal:'false'}]));assert.throws(()=>D.entries([total(1),total(1)]));assert.throws(()=>D.ids([]));assert.throws(()=>D.entries([{...partial(1),cancelar_principal:true}]));assert.throws(()=>D.entries([{...total(1),motivo:' '}])) ;
});

test('lote preserva sucesso independente e conflito ocorrido entre simular e reverter',()=>runFixture(async f=>{
 const plan=await f.service.simulate(user,[total(1),total(2)]);
 await f.db.SolicitacaoCompra.update({observacoes:'Mudou'},{where:{id:2}});
 const applied=await apply(f,plan,[1,2]);assert.equal(applied.resultados[0].status,'APLICADA');assert.equal(applied.resultados[1].status,'CONFLITO');
 const reverse=await f.service.simulateReverse(user,{lote_id:lote,todas:true,motivo:'Revisao'});
 await f.db.SolicitacaoCompra.update({observacoes:'Outro usuario trabalhou'},{where:{id:1}});
 const result=await f.service.reverse(user,{plano:reverse,sc_ids:[1],motivo:reverse.motivo,confirmacao:'REVERTER_LOTE_REVISADO'});
 assert.equal(result.resultados[0].codigo,'REORG_PLANO_DESATUALIZADO');assert.equal((await f.db.CompraReorganizacaoOperacao.findOne()).status,'APLICADA');
}));

test('reversao nao reabre prazo operacional ja vencido',()=>{
 const {reverseReady}=require('../src/services/compraReorganizacaoService'),current={business:{},guard:{}};
 const row={status:'APLICADA',depois_json:current,antes_json:{business:{ObrigacaoOperacional:[{id:1,limite_em:'2026-01-01T00:00:00Z'}]}},alteracoes_json:[{model:'ObrigacaoOperacional',id:1,fields:{status:{antes:'PENDENTE',depois:'CANCELADA'}}}]};
 assert.throws(()=>reverseReady(row,current,new Date('2026-10-26')),/PRAZO_VENCIDO/);
});

test('integracao dos servicos reais cancela saldo, recalcula totais e reverte atomicamente em SQL memoria',()=>runFixture(async f=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module'),db=f.db;
 for(const name of['FornecedorCompra','ConfiguracaoSistema']){db[name]=require('../src/models/'+name)(db.sequelize,DataTypes);await db[name].sync();}
 db.PedidoCompra.hasMany(db.PedidoCompraItem,{as:'itens',foreignKey:'pedido_compra_id'});
 db.PedidoCompra.belongsTo(db.FornecedorCompra,{as:'fornecedor',foreignKey:'fornecedor_compra_id'});
 db.PedidoCompra.belongsTo(db.SolicitacaoCompra,{as:'solicitacao',foreignKey:'solicitacao_compra_id'});
 db.PedidoCompraTitulo.belongsTo(db.TituloFinanceiro,{as:'titulo',foreignKey:'titulo_financeiro_id'});
 db.PedidoCompraFrete.hasMany(db.PedidoCompraFreteRateio,{as:'rateios',foreignKey:'frete_id'});
 const original=db.SolicitacaoCompra.findByPk.bind(db.SolicitacaoCompra);
 db.SolicitacaoCompra.findByPk=async(id,options={})=>{
  const s=await original(id,{...options,include:undefined});if(!s||!options.include)return s;
  for(const [alias,model] of Object.entries({itens:'SolicitacaoCompraItem',itensManuais:'SolicitacaoCompraItemManual',fornecedores:'SolicitacaoCompraFornecedor',alocacoes:'SolicitacaoCompraAlocacao',pedidos:'PedidoCompra'}))s[alias]=await db[model].findAll({where:{solicitacao_compra_id:id},transaction:options.transaction});return s;
 };
 const actual=new Set(['compraReorganizacaoStore','pedidoCompraService','pedidoEntregaService','pedidoCompraFreteService','pedidoCompraTotaisService','prazosOperacionaisService','comprasCotacao','pedidoCompraStatusConfig']),cache=new Map();
 function load(name){if(cache.has(name))return cache.get(name).exports;const file=path.resolve(__dirname,'../src/services/'+name+'.js'),module={exports:{}},native=createRequire(file);cache.set(name,module);
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,console,Buffer,require(id){if(id==='../models')return db;if(id.startsWith('./')&&actual.has(id.slice(2)))return load(id.slice(2));
   if(['./comprasDelegacaoService','./setorCapabilityService','./comprasFornecedorService','./compraApropriacao','../utils/excelWorkbook'].includes(id))return{};return native(id);}}, {filename:file});return module.exports;
 }
 await f.addPartial();await db.PedidoCompraItem.update({preco_unitario:10},{where:{id:101}});
 await f.seed('PedidoCompraFrete',{id:1,pedido_compra_id:100,solicitacao_compra_id:1,tipo:'EMBUTIDO',criterio_rateio:'PROPORCIONAL',status_financeiro:'PENDENTE',valor_total:10});
 const real=load('compraReorganizacaoStore').createStore(db);f.store.run=real.run;
 const tableSpecs=new Map(Object.entries(specs).map(([name,s])=>[db[name].getTableName(),s])),audits=new Set(['CompraReorganizacaoOperacao','Historico','SolicitacaoCompraLog','PedidoCompraItemLog','PedidoCompraEntregaOperacao'].map(name=>db[name].getTableName()));
 f.store.writeGuard=async(_tx,action)=>{const native=db.sequelize.query.bind(db.sequelize);db.sequelize.query=(sql,...args)=>{guardSql(typeof sql==='string'?sql:sql.query,tableSpecs,audits);return native(sql,...args);};try{return await action();}finally{db.sequelize.query=native;}};
 const plan=await f.service.simulate(user,[partial(1)]),applied=await apply(f,plan);
 assert.equal(applied.resultados[0].status,'APLICADA',JSON.stringify(applied));
 assert.equal(Number((await db.PedidoCompraItem.findByPk(101)).quantidade_pedido),3);assert.equal((await db.SolicitacaoCompra.findByPk(1)).status,'ENCERRADO');
 assert.equal(await db.PedidoCompraEntregaOperacao.count(),1);assert.equal(await db.PedidoCompraItemRecebimento.count(),1);assert(await db.Historico.count()>=3);
 assert.equal(await db.PedidoCompraFreteRateio.count(),1);assert.equal(Number((await db.PedidoCompraFreteRateio.findOne()).valor_rateado),10);
 const reverse=await f.service.simulateReverse(user,{lote_id:lote,todas:true,motivo:'Retomar saldo revisado'}),result=await f.service.reverse(user,{plano:reverse,sc_ids:[1],motivo:reverse.motivo,confirmacao:'REVERTER_LOTE_REVISADO'});
 assert.equal(result.resultados[0].status,'REVERTIDA',JSON.stringify(result));assert.equal(Number((await db.PedidoCompraItem.findByPk(101)).quantidade_pedido),10);
 assert.equal((await db.SolicitacaoCompraFechamento.findOne()).status,'REVERTIDO');assert.equal(await db.PedidoCompraItemRecebimento.count(),1);assert.equal(await db.PedidoCompraEntregaOperacao.count(),1);
 assert.equal(await db.PedidoCompraFreteRateio.count(),1);assert.equal(Number((await db.PedidoCompraFreteRateio.findOne()).valor_rateado),0);
}));
