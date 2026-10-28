'use strict';
// Servico de geracao real com fronteiras ORM/criacao de titulo simuladas.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {Op}=require('sequelize');
const transaction={LOCK:{UPDATE:'UPDATE'}},links=[],created=[],history=[];
const orders=new Map([10,11].map(id=>[id,{id,obra_id:7,solicitacao_compra_id:20,financeiro_fluxo_versao:1,status:'FECHADO_FORNECEDOR',
  valor_total:100,valor_total_fornecedor:100,fornecedor:{parceiro_id:6,nome:'QA'},solicitacao:{solicitacao_principal_id:30},update:async()=>{}}]));
const freight={id:90,pedido_compra_id:10,tipo:'TERCEIRO',status_financeiro:'TITULO_GERADO',titulo_financeiro_id:999};
const existingFreight={id:999,status:'PARCIAL',valor_original:20,valor_baixado:5,valor_saldo:15,data_vencimento:'2026-10-30'};
const db={PedidoCompra:{findByPk:async(id,o)=>{assert.equal(o.lock,transaction.LOCK.UPDATE);return orders.get(Number(id));}},
  PedidoCompraTitulo:{findOne:async({where})=>links.find(v=>v.idempotency_key===where.idempotency_key),
    findAll:async({where})=>{assert(Number(where.pedido_compra_id)>0);return links.filter(l=>l.pedido_compra_id===Number(where.pedido_compra_id)).map(l=>({...l,titulo:created.find(t=>t.id===l.titulo_financeiro_id)}));},
    create:async(data,o)=>{assert.equal(o.transaction,transaction);links.push({...data,id:links.length+1});}},
  PedidoCompraFrete:{findAll:async({where})=>where.status_financeiro==='PENDENTE_TITULO'?[]:Number(where.pedido_compra_id)===10?[freight]:[]},
  SolicitacaoCompraAlocacao:{findAll:async()=>[]},TituloFinanceiro:{findAll:async()=>[existingFreight]},
  Historico:{create:async data=>history.push(data)},Parceiro:{findOne:async()=>({id:6,nome:'QA'})}};
let protectionCalls=0;
const filename=path.join(__dirname,'../src/services/pedidoCompraFinanceiroService.js'),moduleQA={exports:{}};
vm.runInNewContext(fs.readFileSync(filename,'utf8')+'\nobterResumoFinanceiroPedido=async p=>({pedido_id:p.id});',{
  module:moduleQA,require(name){
    if(name==='sequelize')return{Op};if(name==='../models')return db;
    if(name==='./tituloFinanceiroService')return{criarTituloManual:async(_req,data,opts)=>{
      assert.equal(opts.transaction,transaction);assert.equal(opts.origemTitulo,'PEDIDO_COMPRA');
      const title={id:created.length+1,status:'ABERTO',valor_original:data.valor,valor_saldo:data.valor,valor_baixado:0,data_vencimento:data.data_vencimento};created.push(title);return{titulos:[title]};}};
    if(name==='./notificacoes')return{};
    if(name==='./authorizationService')return{};
    if(name==='./tituloSobreposicaoService')return{assertSemAvulsosCompra:async id=>{assert.equal(id,30);protectionCalls++;}};
    if(name==='./pedidoCompraTituloConfigService')return{validarCategoriaTituloPedido:async()=>1};
    if(name==='./formasPagamentoMedicaoService')return{listarFormasDosFluxos:async()=>({formas:[{id:1,nome:'Transferencia'}]})};
    if(name==='./tituloRenegociacaoVinculos')return{projetarAssociacoes:async()=>{},projetarOrigens:async rows=>rows};
    if(name==='./tituloCompartilhadoLeitura')return{projetarPedido:async()=>{}};
    throw Error('Dependencia nao simulada: '+name);
  }
});
(async()=>{
  const s=moduleQA.exports;
  const generate=(id,key)=>s.criarPrevisoesPedido({req:{user:{id:4}},pedidoId:id,
    payload:{categoria_financeira_id:1,forma_pagamento_id:1,favorecido_pagamento_id:6,dados_pagamento:'Conta ficticia QA',parcelas:[{valor:100,data_vencimento:'2026-10-30'}]},idempotencyKey:key,transaction});
  const freightBefore=JSON.stringify(existingFreight);
  await generate(10,'primeiro');assert.equal(created.length,1,'Frete parcial nao impede criar mercadorias do mesmo pedido');
  assert.equal((await s.buscarTitulosPedido(11,{transaction})).length,0,'Titulos de outro pedido nao vazam por solicitacao');
  await generate(11,'segundo');assert.equal(created.length,2,'Segundo pedido da mesma solicitacao cria seu titulo proprio');
  await generate(11,'segundo');assert.equal(created.length,2,'Replay nao gera novos titulos');
  await generate(11,'nova-obrigacao');assert.equal(created.length,3,'Nova chave cria titulo mesmo com valor integral ja titulado');
  Object.assign(created[1],{status:'PARCIAL',valor_baixado:30,valor_saldo:70});
  const purchasePartial=JSON.stringify(created[1]);
  await generate(11,'nova-obrigacao-parcial');assert.equal(created.length,4);
  await generate(11,'segundo');assert.equal(created.length,4,'Replay com compra parcial nao gera titulo');
  assert.equal(JSON.stringify(created[1]),purchasePartial,'Titulo de compra com baixa parcial permanece intacto');
  assert.equal(JSON.stringify(existingFreight),freightBefore,'Frete com baixa parcial intacto');
  Object.assign(created[1],{status:'QUITADO',valor_baixado:100,valor_saldo:0});
  const paid=JSON.stringify(created[1]);await generate(11,'nova-obrigacao-apos-quitacao');assert.equal(created.length,5);
  assert.equal(JSON.stringify(created[1]),paid,'Titulo e baixa quitados preservados');
  await assert.rejects(generate(11,''),/Chave de idempotencia/);
  assert.equal(history.length,5);assert.equal(protectionCalls,0,'Criacao individual tambem permitida com avulsos anteriores');
  assert(history.every(h=>JSON.parse(h.metadata).criacao_independente===true));
  console.log('OK: criacao adicional com compra aberta/parcial/quitada, frete e escopo, replay/lock UPDATE e historico preservados.');
})().catch(e=>{console.error(e);process.exitCode=1;});
