'use strict';
// Servicos reais em VM; Redis, biometria, transacao e modelos simulados.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { Op } = require('sequelize');
const domain = require('../src/services/pagamentoFilaDiretaRejeicao');
const { versaoFilaDireta } = require('../src/services/pagamentoFilaDiretaDomain');
const { sha256 } = (() => { const crypto = require('node:crypto'); return { sha256: v => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex') }; })();
let permitir, nominal, bank, digital, verify, falhaAudit, filaMudou, store, logs, txChain;
const tx = { LOCK: { UPDATE: 'UPDATE' } };
function row(d) { return { ...d, async update(p, options) { assert.equal(options.transaction, tx); Object.assign(this,p); return this; } }; }
let title, fila, credential;
function reset() {
  permitir=nominal=verify=true; bank=digital=falhaAudit=false; filaMudou=false; store=null; logs=[]; txChain=Promise.resolve();
  title=row({ id:7,tipo:'PAGAR',status:'PARCIAL',valor_saldo:'70.00',valor_baixado:'30.00',updatedAt:'2026-10-18T12:00:00Z',bloqueio_pagamento_proprietario:null });
  fila=row({ id:9,titulo_financeiro_id:7,status:'PENDENTE',valor_previsto:'100.00',selecionado_por:4,updatedAt:'2026-10-18T12:00:00Z' });
  credential=row({ id:3,usuario_id:31,credential_id:'cred-qa',ativo:true,counter:0,public_key:Buffer.from('qa').toString('base64') });
}
reset();
const db = {
  TituloFinanceiro:{ findAll:async o=>{ assert.equal(o.where.id[Op.in][0],7); if(o.transaction) assert.equal(o.lock,'UPDATE'); return [title]; } },
  PagamentoAutorizacaoItem:{findOne:async()=>digital?{id:12}:null},
  PagamentoManualFilaItem:{findOne:async()=>filaMudou?{...fila,id:10}:fila,findAll:async()=>[fila]},
  PaymentIntent:{findOne:async()=>bank?{status:'PROCESSANDO'}:null},
  SecurityEventLog:{create:async(d,o)=>{assert.equal(o.transaction,tx);if(falhaAudit)throw Error('Auditoria QA indisponivel');logs.push(d);return d;}},
  PagamentoAutorizador:{findOne:async()=>nominal?{usuario_id:31}:null},
  WebauthnCredential:{findAll:async()=>[credential],findOne:async o=>o.where.usuario_id===31&&o.where.credential_id==='cred-qa'?credential:null},
  sequelize:{async transaction(fn){ const anterior=txChain;let release;txChain=new Promise(ok=>{release=ok;});await anterior;
    const rows=[title,fila,credential], backups=rows.map(r=>JSON.parse(JSON.stringify(r))),logsAntes=[...logs];
    try{return await fn(tx);}catch(e){rows.forEach((r,i)=>{for(const k of Object.keys(r))if(typeof r[k]!=='function')delete r[k];Object.assign(r,backups[i]);});logs=logsAntes;throw e;}finally{release();} }}
};
const env={paymentOwnerApprovalMode:'PILOT',webauthnRpId:'qa.invalid',webauthnOrigins:['https://qa.invalid']};
const deps={crypto:require('node:crypto'),sequelize:{Op},'../config/env':{env},'../models':db,
  './authorizationService':{userHasNominalAreaPermission:async()=>permitir},
  './analiseProprietarioService':{},'./pagamentoManualFilaService':{},'./pagamentoAutorizacaoEventosService':{sha256},
  './s3':{},'./webauthnChallengeStore':{saveChallenge:async(c,d)=>{assert.equal(c.purpose,'reject-direct-queue');assert.equal(c.userId,31);store=d;},
    consumeChallengeAtomic:async c=>{assert.equal(c.purpose,'reject-direct-queue');const d=store;store=null;return d;}},
  './webPushService':{},'./securityLogService':{},'./pagamentoAutorizacaoSituacao':{},'./pagamentoAutorizacaoConsultaService':{},
  './pagamentoFilaDiretaRejeicao':domain,
  './webauthnQA':{generateAuthenticationOptions:async o=>{assert.equal(o.userVerification,'required');return {challenge:'qa-challenge'};},
    verifyAuthenticationResponse:async o=>{assert.equal(o.requireUserVerification,true);assert.equal(o.expectedChallenge,'qa-challenge');assert.equal(o.expectedRPID,'qa.invalid');assert.deepEqual(Array.from(o.expectedOrigin),['https://qa.invalid']);return {verified:verify,authenticationInfo:{newCounter:1}};}}
};
const file=path.join(__dirname,'../src/services/pagamentoAutorizacaoService.js');
const source=fs.readFileSync(file,'utf8');assert(source.includes("return import('@simplewebauthn/server');"));
const sandbox={module:{exports:{}},Buffer,Uint8Array,console,require(id){if(id in deps)return deps[id];throw Error('Import nao simulado '+id);}};
vm.runInNewContext(source.replace("return import('@simplewebauthn/server');","return require('./webauthnQA');"),sandbox);
const service=sandbox.module.exports, req={user:{id:31}}, payload=()=>({decisoes:[{fila_id:9,titulo_id:7,versao:versaoFilaDireta(title,fila),motivo:'Pagamento nao autorizado'}],credential:{id:'cred-qa'}});
(async()=>{
  // Executa o store real isolado: GETDEL, nao uma sequencia GET/DEL suscetivel
  // a replay concorrente. Prefixo, finalidade, usuario e TTL ficam separados.
  const valores=new Map();let redis={
    set:async(k,v,o)=>{assert.equal(o.EX,300);valores.set(k,v);},
    getDel:async k=>{const v=valores.get(k);valores.delete(k);return v;}
  };
  const storeVm={module:{exports:{}},require(id){if(id==='../config/env')return {env:{redisKeyPrefix:'qa:'}};
    if(id==='./rateLimitStore')return {getRedisClient:async()=>redis};throw Error(id);}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/services/webauthnChallengeStore.js'),'utf8'),storeVm);
  const realStore=storeVm.module.exports,ctx={purpose:'reject-direct-queue',userId:31,lotId:'direct'};
  await realStore.saveChallenge(ctx,{challenge:'unico'});
  assert.equal(await realStore.consumeChallengeAtomic({...ctx,userId:32}),null);
  const consumo=await Promise.all([realStore.consumeChallengeAtomic(ctx),realStore.consumeChallengeAtomic(ctx)]);
  assert.equal(consumo.filter(Boolean).length,1);
  redis=null;await assert.rejects(realStore.consumeChallengeAtomic(ctx),e=>e.statusCode===503);
  let p=payload();await service.directQueueOptions(req,p);const replies=await Promise.allSettled([service.rejectDirectQueue(req,p),service.rejectDirectQueue(req,p)]);
  assert.equal(replies.filter(r=>r.status==='fulfilled').length,1);assert.equal(logs.length,1);assert.equal(fila.status,'RESOLVIDO');
  assert.equal(title.valor_saldo,'70.00');assert.equal(title.valor_baixado,'30.00');assert.equal(title.status,'PARCIAL');
  assert.equal(title.bloqueio_pagamento_proprietario.item_id,0);assert.equal(title.bloqueio_pagamento_proprietario.lote_id,null);assert.equal(credential.counter,1);
  assert.equal(replies.find(r=>r.status==='fulfilled').value.itens[0].id,-9);
  for(const alterar of [()=>{permitir=false;},()=>{nominal=false;},()=>{env.paymentOwnerApprovalMode='OFF';},()=>{env.paymentOwnerApprovalMode='PAUSED';}]){
    reset();env.paymentOwnerApprovalMode='PILOT';alterar();await assert.rejects(service.directQueueOptions(req,payload()));assert.equal(store,null);assert.equal(logs.length,0);
  }
  reset();env.paymentOwnerApprovalMode='PILOT';await assert.rejects(service.directQueueOptions({...req,dev_user_switch:{}},payload()));
  for(const alterar of [()=>{title.status='QUITADO';},()=>{title.renegociado_por_id=8;},()=>{bank=true;},()=>{digital=true;},()=>{fila.status='EM_EDICAO';},()=>{filaMudou=true;},()=>{title.tipo='RECEBER';}]){
    reset();alterar();await assert.rejects(service.directQueueOptions(req,payload()));assert.equal(logs.length,0);assert.equal(title.bloqueio_pagamento_proprietario,null);
  }
  for(const alterar of [()=>{title.valor_saldo='69.00';},()=>{fila.status='NAO_PAGO';},()=>{digital=true;},()=>{bank=true;},()=>{verify=false;},()=>{falhaAudit=true;}]){
    reset();p=payload();await service.directQueueOptions(req,p);alterar();const antes=JSON.stringify({title,fila,credential});
    await assert.rejects(service.rejectDirectQueue(req,p));assert.equal(JSON.stringify({title,fila,credential}),antes);assert.equal(logs.length,0);
  }
  reset();p=payload();await service.directQueueOptions(req,p);p.decisoes[0].motivo='Outro motivo';await assert.rejects(service.rejectDirectQueue(req,p));
  assert.equal(title.bloqueio_pagamento_proprietario,null);
  for(const d of [{fila_id:0,titulo_id:7,versao:'a'.repeat(64),motivo:'x'}, {fila_id:9,titulo_id:7,versao:'a'.repeat(64),motivo:''},
    {fila_id:9,titulo_id:7,versao:'a'.repeat(64),motivo:'x',item_id:9}])assert.throws(()=>domain.normalizar([d]));
  assert.throws(()=>domain.normalizar(Array(51).fill({})));assert.throws(()=>domain.normalizar([payload().decisoes[0],payload().decisoes[0]]));
  console.log('Fila direta: ACL nominal/autor ativo/PILOT/pausa/troca usuario, challenge atomico/replay/motivo, passkey UV/origem/RPID, lock/versao/concorrencia, banco/DP/quitado/novo ciclo, preservacao parcial, auditoria e rollback aprovados. Sem banco/Redis/biometria reais.');
})().catch(e=>{console.error(e);process.exitCode=1;});
