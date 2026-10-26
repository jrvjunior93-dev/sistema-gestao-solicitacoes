'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),lib=require('sequelize');
const {Op}=lib;
const titulo=id=>({id,codigo:'TIT-'+id,valor_saldo:100,valor_baixado:0,status:'ABERTO',origem_titulo:'MANUAL'});
const filas=Array.from({length:530},(_,i)=>({id:i+1,titulo_financeiro_id:i+1,status:'PENDENTE',titulo:titulo(i+1),juros:0,multa:0}));
const rejeicoes=Array.from({length:30},(_,i)=>({id:1000+i,titulo_financeiro_id:3000+i,status:'REJEITADO',titulo:titulo(3000+i)}));
let leiturasRejeitados=0;
function matches(row,where={}) {
  return Reflect.ownKeys(where).every(k=>k===Op.and?true:typeof where[k]!=='object'||where[k]===null?row[k]===where[k]
    :where[k][Op.in]?where[k][Op.in].includes(row[k]):where[k][Op.gt]!=null?Number(row[k])>where[k][Op.gt]:where[k][Op.ne]!=null?row[k]!==where[k][Op.ne]:true);
}
const clone=r=>({...structuredClone(r),toJSON(){const{toJSON,...data}=this;return data;}});
const models={sequelize:{fn:lib.fn,col:lib.col,escape:s=>"'"+s+"'"},PagamentoManualFilaItem:{
  count:async o=>filas.filter(r=>matches(r,o.where)).length,
  findAll:async o=>{
    if(o.group)return o.group.includes('PagamentoManualFilaItem.status')?[{status:'PENDENTE',total:530}]:[];
    assert(o.include.find(i=>i.as==='comprovantes').separate,'Comprovantes sao carregados depois de paginar os itens');
    return filas.filter(r=>matches(r,o.where)).slice(o.offset||0,(o.offset||0)+o.limit).map(clone);
  }
},PagamentoAutorizacaoItem:{
  count:async o=>o.where[Op.and].some(l=>l.val==='1 = 0')?0:rejeicoes.length,
  findAll:async o=>{leiturasRejeitados++;return [...rejeicoes].reverse().slice(o.offset||0,(o.offset||0)+(o.limit??30)).map(clone);}
}};
const mod={exports:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/services/pagamentoManualFilaService.js'),'utf8'),{
  module:mod,console,require(id){
    if(id==='../models')return models;if(id==='sequelize')return lib;if(id==='crypto')return require('node:crypto');
    if(['./pagamentoFilaFiltrosDomain','./pagamentoFilaPesquisaDomain','./pagamentoFilaComprovanteDomain','./pagamentoFilaValoresDomain'].includes(id))return require('../src/services/'+id.slice(2));
    if(id==='./recebimentoDpConsultaService')return{anexarRecebimentosDp:async()=>{}};
    if(id==='./instrucaoFinanceiraFavorecidoService')return{anexarInstrucoes:async()=>{}};
    if(id==='./pagamentoFilaDestinatarioService')return{anexarDestinatarios:async()=>{}};
    if(id==='./authorizationService')return{getFinanceiroObraScopeIds:async()=>null};
    if(id==='./tituloCompartilhadoLeitura')return{anexarParticipacoes:async()=>{}};
    if(id==='./pagamentoAutorizacaoValorDomain')return require('../src/services/pagamentoAutorizacaoValorDomain');
    return{};
  }
});
(async()=>{
  const antes=JSON.stringify([filas,rejeicoes]),todos=[];
  for(let pagina=1;pagina<=12;pagina++){
    const r=await mod.exports.listarFilaPagamentos({user:{id:1}},{status:'TODOS',pagina,limite:50});
    assert.equal(r.total,560);assert.equal(r.total_paginas,12);assert(r.data.length<=50);
    if(pagina===11){assert.equal(r.data.length,50);assert.equal(r.data.filter(r=>r.id>0).length,30);assert.equal(r.data.filter(r=>r.id<0).length,20);}
    if(pagina===12)assert.equal(r.data.length,10);
    todos.push(...r.data);
  }
  assert.equal(todos.length,560);assert.equal(new Set(todos.map(r=>r.id)).size,560);
  assert(todos.slice(530).every(r=>r.somente_consulta&&r.id<0),'Rejeicoes nao viram pagamentos executaveis');
  const antesLeituras=leiturasRejeitados;
  const p=await mod.exports.listarFilaPagamentos({user:{id:1}},{status:'PENDENTE',pagina:11,limite:50});
  assert.equal(p.total,530);assert.equal(p.data.length,30);assert.equal(p.data[0].id,501);
  assert.equal(leiturasRejeitados,antesLeituras,'Pagina de pendentes nao materializa rejeicoes');
  assert.equal(JSON.stringify([filas,rejeicoes]),antes,'Consulta nao modifica financeiro ou historico');
  console.log('Fila: 530 itens + 30 rejeicoes em 12 paginas, fronteira mista, IDs virtuais, >500 sem perda/duplicidade, comprovantes 1:N e GET sem escrita aprovados. Sem banco/rede.');
})().catch(e=>{console.error(e);process.exitCode=1;});
