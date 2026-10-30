'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { Op } = require('sequelize');
const { criarServico, validar, tipoForma } = require('../src/services/baixaLoteSolicitacaoService');
function fixture() {
  const db = { titulos: [1,2].map(id => ({ id, codigo:'TIT-'+id,tipo:'PAGAR',status:'ABERTO',empresa_id:5,valor_saldo:id*100,
    juros:id===1?10:0,multa:2,updatedAt:'2026-10-30T10:00:00Z' })), movimentos:[{id:40,titulo_financeiro_id:1,juros:4,multa:1,status:'ATIVO'}],historicos:[],filas:[] };
  let tail=Promise.resolve(), baixarCalls=0, failAt=0, denied=false;
  const selection = (where,rows) => rows.filter(r => Object.entries(where).every(([k,v]) => v&&typeof v==='object' ? v[Op.in]?.includes(r[k]) : r[k]===v));
  function transaction() {const wait=tail;let unlock;tail=new Promise(r=>unlock=r);let saved;return { LOCK:{UPDATE:'UPDATE'},finished:false,
    acquire:async()=>{await wait;saved=structuredClone(db);},commit:async function(){this.finished=true;unlock();},rollback:async function(){if(saved)Object.assign(db,saved);this.finished=true;unlock();} };}
  const models={sequelize:{transaction:async()=>transaction()},Solicitacao:{findByPk:async(id,o)=>{assert.equal(o.lock,'UPDATE');await o.transaction.acquire();return {id};}},
    TituloFinanceiro:{findAll:async(o)=>selection(o.where,db.titulos)},
    ContaBancaria:{findByPk:async()=>({id:3,empresa_id:5,ativo:true,updatedAt:'a'})},FormaPagamentoFinanceira:{findByPk:async()=>({id:8,tipo:'PIX',nome:'Pix',ativo:true,updatedAt:'b'})},
    MovimentoFinanceiro:{findAll:async(o)=>selection(o.where,db.movimentos)},PagamentoManualFilaItem:{findAll:async()=>db.filas},
    Historico:{findOne:async(o)=>db.historicos.find(h=>h.descricao===o.where.descricao),create:async h=>db.historicos.push(h)}};
  const run=criarServico({models,validarAcessoTitulo:async()=>{},assertPodeInteragir:async()=>{if(denied)throw Object.assign(Error('Sem acesso'),{statusCode:403});},listarTitulos:async()=>[{id:1},{id:2}],
    baixarTitulo:async(req,id,payload,opts)=>{assert(opts.transaction);assert.deepEqual(Object.keys(opts),['transaction']);baixarCalls++;if(baixarCalls===failAt)throw Error('Falha na baixa');
      const t=db.titulos.find(t=>t.id===id);assert.equal(payload.valor,t.valor_saldo);t.status='QUITADO';t.valor_saldo=0;
      const m={id:100+baixarCalls,titulo_financeiro_id:id,juros:payload.juros,multa:payload.multa,status:'ATIVO',tipo_movimento:'BAIXA'};db.movimentos.push(m);return {movimento_financeiro_id:m.id};}});
  db.movimentos[0].tipo_movimento='BAIXA';
  const dados={titulo_ids:[2,1],conta_bancaria_id:3,forma_pagamento_id:8,data_movimento:'2026-10-30'};
  const call=(body=dados,confirmar=false)=>run({user:{id:1,setor_id:6}},77,body,confirmar);
  return {db,call,dados,fail:()=>{failAt=2;},deny:()=>{denied=true;},calls:()=>baixarCalls};
}
test('previa nao grava, usa principal e encargos remanescentes sem cobra-los duas vezes',async()=>{
  const f=fixture(),old=JSON.stringify(f.db),p=await f.call();assert.equal(p.total,309);assert.equal(p.titulos[0].juros,6);assert.equal(p.titulos[0].multa,1);assert.equal(JSON.stringify(f.db),old);assert.equal(f.calls(),0);
});
test('confirmacao atomica, replay sem baixa nova e concorrencia com uma unica operacao',async()=>{
  const f=fixture(),p=await f.call(),dados={...f.dados,revisao:p.revisao,chave:'lote_solicitacao_00001'};
  const result=await Promise.all([f.call(dados,true),f.call(dados,true)]);assert.equal(result[0].baixados.length,2);assert.equal(result[1].replay,true);assert.equal(f.calls(),2);assert.equal(f.db.historicos.length,1);
});
test('falha na segunda baixa desfaz o lote inteiro e nao grava conclusao',async()=>{
  const f=fixture(),p=await f.call(),old=JSON.stringify(f.db);f.fail();await assert.rejects(f.call({...f.dados,revisao:p.revisao,chave:'lote_solicitacao_00001'},true),/Falha/);assert.equal(JSON.stringify(f.db),old);
});
test('mudanca apos previa, fila ativa, titulo externo e permissao negada bloqueiam sem baixa',async()=>{
  const f=fixture(),p=await f.call();f.db.titulos[0].valor_saldo=90;await assert.rejects(f.call({...f.dados,revisao:p.revisao,chave:'lote_solicitacao_00001'},true),/alterados/);assert.equal(f.calls(),0);
  f.db.filas.push({id:5});await assert.rejects(f.call(),/fila/);f.db.filas=[];await assert.rejects(f.call({...f.dados,titulo_ids:[3]}),/fora da solicitacao/);f.deny();await assert.rejects(f.call(),/Sem acesso/);assert.equal(f.calls(),0);
});
test('replay depois de estorno exige conferencia; chave com dados diferentes nao e reutilizada',async()=>{
  const f=fixture(),p=await f.call(),d={...f.dados,revisao:p.revisao,chave:'lote_solicitacao_00001'};await f.call(d,true);
  await assert.rejects(f.call({...d,observacoes:'outro'},true),/outros dados/);f.db.movimentos[1].status='ESTORNADO';await assert.rejects(f.call(d,true),/estornado/);assert.equal(f.calls(),2);
});
test('contrato de entrada recusa duplicatas, datas invalidas e campos de bypass',()=>{
  const f=fixture();assert.throws(()=>validar({...f.dados,titulo_ids:[1,1]}));assert.throws(()=>validar({...f.dados,data_movimento:'2026-02-30'}));assert.throws(()=>validar({...f.dados,autorizadoPorFilaPagamento:true}));
});
test('formas especiais e inativas nao entram no lote simples',()=>{
  for(const tipo of ['CARTAO_CREDITO','CHEQUE','PERMUTA']) assert.throws(()=>tipoForma({tipo,ativo:true}));
  assert.throws(()=>tipoForma({tipo:'PIX',ativo:false}));
  assert.throws(()=>tipoForma({tipo:'PIX',ativo:true,exige_cartao:true}));
  for(const tipo of ['PIX','BOLETO','TRANSFERENCIA','DINHEIRO']) assert.equal(tipoForma({tipo,ativo:true}),tipo);
});
