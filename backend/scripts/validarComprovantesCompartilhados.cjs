'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { Op } = require('sequelize');
function load(name, deps) {
 const box={module:{exports:{}},require:n=>{assert(n in deps,'Dependencia sem simulacao: '+n);return deps[n];}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/services',name),'utf8'),box);return box.module.exports;
}
function fixture(){
 const titulo={id:12604,codigo:'TIT-012333',compartilhamento_id:3,solicitacao_id:null};
 const item={id:883,titulo_financeiro_id:12604,status:'BAIXADO',movimento_financeiro_id:8542,
 comprovante_url:'isolado://arquivo',comprovante_hash:'hash-qa',comprovante_nome:'12333.pdf'};
 const proof={id:784,fila_id:883,nome:'12333.pdf',url:item.comprovante_url,hash:item.comprovante_hash,vinculado_em:'2026-10-28T20:25:42Z'};
 let state={anexos:[],historicos:[]},failAt=0,writes=0,chain=Promise.resolve();const locks=[];
 const origens=[6488,6589,6488].map((id,i)=>({id:i+1,solicitacao_id:id,lote_id:3,titulo_financeiro_id:12604}));
 const db={
 TituloFinanceiro:{findByPk:async(id,opts)=>{if(opts.lock)locks.push([id,opts.lock]);return titulo;}},
 TituloCompartilhadoOrigem:{findAll:async()=>origens,findOne:async({where})=>origens.find(o=>o.solicitacao_id===where.solicitacao_id&&o.titulo_financeiro_id===where.titulo_financeiro_id)},
 PagamentoManualFilaComprovante:{findAll:async()=>[proof]},
 PagamentoManualFilaItem:{findAll:async()=>[{...item,comprovantes:[proof]}]},
 Anexo:{findOne:async({where})=>state.anexos.find(a=>a.solicitacao_id===where.solicitacao_id&&a.caminho_arquivo===where.caminho_arquivo),
 findAll:async({where})=>state.anexos.filter(a=>a.solicitacao_id===where.solicitacao_id),
 create:async(data,opts)=>{assert(opts.transaction);if(++writes===failAt)throw Error('FALHA_SIMULADA');const a={...data,id:state.anexos.length+1};state.anexos.push(a);return a;}},
 Historico:{findAll:async({where})=>state.historicos.filter(h=>h.solicitacao_id===where.solicitacao_id&&(typeof where.acao==='string'?h.acao===where.acao:where.acao[Op.in].includes(h.acao))),
 create:async(data,opts)=>{assert(opts.transaction);if(++writes===failAt)throw Error('FALHA_SIMULADA');state.historicos.push({...data});}}
 };
 const history=load('pagamentoFilaHistoricoService.js',{'../models':db,sequelize:{Op},'../utils/fileName':{normalizeOriginalName:s=>s}});
 const signed=[],files=load('comprovanteCompartilhadoSolicitacaoService.js',{'../models':db,sequelize:{Op},
 './fileAccessService':{canAccessSolicitacaoFile:async req=>({allowed:!req.negado})},
 './s3':{getPresignedUrl:async(url,seconds,opts)=>{signed.push(url);assert.equal(seconds,300);assert(opts.strict);return 'ASSINADO-SIMULADO';}}});
 const tx=async(fn)=>{const prev=chain;let release;chain=new Promise(ok=>release=ok);await prev;
 const before=structuredClone(state);try{return await fn({LOCK:{UPDATE:'UPDATE'}});}catch(e){state=before;throw e;}finally{release();}};
 return {db,titulo,item,proof,origens,history,files,signed,locks,tx,get state(){return state;},fail:n=>{failAt=n;writes=0;}};
}
const req={user:{id:1,area:'FINANCEIRO'}};
test('caso real: planejamento sem escrita, duas origens unicas e um arquivo por origem',async()=>{
 const f=fixture(),p=await f.history.planejarComprovantesFilaNoHistorico(f.item);
 assert.equal(p.arquivos.length,2);assert.deepEqual(Array.from(p.solicitacao_ids),[6488,6589]);
 assert(p.arquivos.every(a=>a.situacao==='PENDENTE_HISTORICO'));assert.equal(f.state.anexos.length,0);
});
test('publica uma vez por origem; replay e concorrencia nao duplicam, preserva baixa e origem',async()=>{
 const f=fixture(),before=JSON.stringify([f.titulo,f.item,f.proof]);
 const results=await Promise.all([f.tx(t=>f.history.registrarComprovantesFilaNoHistorico(req,f.item,t)),f.tx(t=>f.history.registrarComprovantesFilaNoHistorico(req,f.item,t))]);
 assert.deepEqual(results,[2,0]);assert.equal(f.state.anexos.length,2);assert.equal(f.state.historicos.length,2);
 assert(f.locks.every(([id,lock])=>id===12604&&lock==='UPDATE'));
 assert.equal(JSON.stringify([f.titulo,f.item,f.proof]),before);
 assert(f.state.historicos.every(h=>JSON.parse(h.metadata).compartilhamento_id===3));
});
test('falha em cada escrita desfaz o conjunto; removido por origem nao e ressuscitado',async()=>{
 for(let i=1;i<=4;i++){const f=fixture();f.fail(i);await assert.rejects(f.tx(t=>f.history.registrarComprovantesFilaNoHistorico(req,f.item,t)),/FALHA_SIMULADA/);assert.equal(f.state.anexos.length,0);assert.equal(f.state.historicos.length,0);}
 const f=fixture();f.state.historicos.push({solicitacao_id:6488,acao:'ANEXO_REMOVIDO',metadata:JSON.stringify({caminho:f.proof.url})});
 assert.equal(await f.tx(t=>f.history.registrarComprovantesFilaNoHistorico(req,f.item,t)),1);
 assert.equal(f.state.anexos[0].solicitacao_id,6589);
});
test('manuais sem origem nao publicam; legado segue uma origem; sem baixa ou origens validas nao inventa evento',async()=>{
 const f=fixture();f.titulo.compartilhamento_id=null;assert.equal((await f.history.planejarComprovantesFilaNoHistorico(f.item)).arquivos.length,0);
 f.titulo.solicitacao_id=7;assert.equal(await f.tx(t=>f.history.registrarComprovantesFilaNoHistorico(req,f.item,t)),1);
 assert.equal(f.state.anexos[0].solicitacao_id,7);
 f.item.status='PENDENTE';assert.equal((await f.history.planejarComprovantesFilaNoHistorico(f.item)).arquivos.length,0);
 f.item.status='BAIXADO';f.titulo.compartilhamento_id=3;f.origens.length=0;await assert.rejects(f.history.planejarComprovantesFilaNoHistorico(f.item),/origens validas/);
});
test('DTO sem URL/hash/participacoes; origem autorizada abre so seu comprovante',async()=>{
 const f=fixture(),docs=await f.files.listar(12604,6488);assert.equal(docs.length,1);
 assert.deepEqual(Object.keys(docs[0]).sort(),['filaId','id','nome']);assert.equal(docs[0].id,784);
 assert.equal((await f.files.abrir(req,6488,12604,883,784)).url,'ASSINADO-SIMULADO');
 const before=f.signed.length;
 for(const args of [[{negado:true},6488,12604,883,784],[req,999,12604,883,784],[req,6488,999,883,784],[req,6488,12604,999,784],[req,6488,12604,883,999],[req,6488,12604,883,'x']])await assert.rejects(f.files.abrir(...args));
 assert.equal(f.signed.length,before);
});
test('arquivo removido nao aparece nem abre, sem afetar a outra solicitacao',async()=>{
 const f=fixture();f.state.anexos.push({solicitacao_id:6488,caminho_arquivo:f.proof.url,deleted_at:'2026-10-29'});
 assert.equal((await f.files.listar(12604,6488)).length,0);await assert.rejects(f.files.abrir(req,6488,12604,883,784));
 assert.equal((await f.files.listar(12604,6589)).length,1);assert.equal(f.signed.length,0);
});


test('card compartilhado conserva valores da participacao e recebe apenas descritores de comprovante',async()=>{
 const linhas=[{solicitacao_id:6488,valor:'1191.90'},{solicitacao_id:6589,valor:'991.47'}];linhas.baixas={pago:['1191.90','991.47'],saldo:['0.00','0.00']};
 const chamadas=[];
 const service=load('tituloCompartilhadoConsulta.js',{
 './tituloCompartilhadoLeitura':{mapa:async()=>new Map([[12604,linhas]])},
 './tituloRenegociacaoDomain':require('../src/services/tituloRenegociacaoDomain'),
 './comprovanteCompartilhadoSolicitacaoService':{listar:async(t,s)=>{chamadas.push([t,s]);return[{filaId:883,id:784,nome:'12333.pdf'}];}}
 });
 const titulo={id:12604,codigo:'TIT-012333',compartilhamento_id:3,valor_original:'2183.37',status:'QUITADO',segredo:'outras origens',filaPagamentosManuais:[{segredo:'nao copiar'}]};
 const [card]=await service.porSolicitacao({},[titulo],6488,{incluirComprovantes:true});
 assert.equal(card.valor_original,'1191.90');assert.equal(card.valor_baixado,'1191.90');assert.equal(card.valor_saldo,'0.00');
 assert.equal(card.comprovantesCompartilhados.length,1);assert.equal(card.segredo,undefined);assert.equal(card.filaPagamentosManuais.length,0);assert.deepEqual(chamadas,[[12604,6488]]);
 chamadas.length=0;await service.porSolicitacao({},[titulo],6488);assert.equal(chamadas.length,0,'Calculo de status nao carrega documentos');
});

test('remocao com metadata invalida bloqueia publicacao e leitura em vez de restaurar arquivo',async()=>{
 const f=fixture();f.state.historicos.push({solicitacao_id:6488,acao:'ANEXO_REMOVIDO',metadata:'{invalido'});
 await assert.rejects(f.tx(t=>f.history.registrarComprovantesFilaNoHistorico(req,f.item,t)),/remocao invalido/);
 assert.equal(f.state.anexos.length,0);
 await assert.rejects(f.files.listar(12604,6488),/remocao invalido/);
});
