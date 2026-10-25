'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {PLAN,summarize,main}=require('./sondar-nsdocs-modelo-complemento-prod-20261025.cjs');
const root='../../backend/src/modules/fiscal/services/nsdocsHistorical/';
const policy=require(root+'manual/policy'),{normalizeResponse}=require(root+'manual/query'),{buildListRequest}=require(root+'contract');
const key='SEGREDO_FICTICIO_SONDA_MODELO_0123456789',company={id:1,cnpj:'27123008000100',ativo:true};
const args=['--plano-id',PLAN,'--confirmar-consulta-real'];
const request=buildListRequest({companyCnpj:company.cnpj,status:'Pendente',startDate:'2026-02-01',endDate:'2026-02-28',dateField:'data_emissao',limit:100,offset:0},company.cnpj);
function row(){return {id:'NAO_EXIBIR_ID',empresa_cnpj:company.cnpj,modelo:'NF-e',emitente_cnpj:company.cnpj,destinatario_cnpj:company.cnpj,emitente_nome:'NAO_EXIBIR_EMITENTE',destinatario_nome:'NAO_EXIBIR_DESTINATARIO',numero:'100',valor:'10,00',situacao:'Autorizado',status:'Pendente',chave_acesso:'1'.repeat(44),data_recebimento:'01/02/2026',data_emissao:'01/02/2026'};}
const window={start:'2026-02-01',end:'2026-02-28',status:'Pendente',state:'enumerated',raw_count:2,documents:normalizeResponse({rows:[row()],total:1},request,company).documents,unsupported:[{provider_id:'CTE_QA',model:'CT-e'}]};
const summary=(rows,w=window)=>summarize({rows,total:rows.length},request,company,w,key,policy,normalizeResponse);
function fixture() {
  const plan = { id: PLAN, date_field: 'data_emissao', windows: [
    { start: '2026-01-01', end: '2026-01-31', status: 'Importado', state: 'enumerated' },
    { start: '2026-02-01', end: '2026-02-28', status: 'Pendente', state: 'pending' }
  ] };
  plan.windows[0] = {...window, documents:structuredClone(window.documents),unsupported:structuredClone(window.unsupported)};
  let planLock = false, queryLock = false, busy = false, fail = false, cooldown = false, changed = false, loads = 0;
  const calls = [], events = [], outputs = [], credential = { companyId: 1, companyCnpj: company.cnpj, apiKey: key };
  const d = { policy, buildListRequest, normalizeResponse,
    runtime: { async loadProdCompany(id, cnpj) { assert.equal(id, 1); assert.equal(cnpj, company.cnpj); return company; } },
    core: { validate(value, c) { assert.equal(c, company); return value; } },
    plans: { load(id) { assert(planLock); assert.equal(id, PLAN); loads++;
      const value = structuredClone(plan); if (changed && loads > 1) value.windows[1].state = 'enumerated'; return value; } },
    locks: { async withPlanLock(action) { if (busy) throw Error('BUSY'); planLock = true;
      try { return await action(); } finally { planLock = false; } } },
    secrets: { async withLock(action) { assert(planLock); queryLock = true;
      try { return await action(); } finally { queryLock = false; } },
      checkCooldown() { assert(queryLock); if (cooldown) throw Error('COOLDOWN'); },
      loadCredentials() { assert(queryLock); return credential; },
      appendHistory(event) { assert(queryLock); events.push(event); } },
    async request(descriptor, k) { assert(planLock && queryLock); assert.equal(k, key); calls.push(descriptor);
      if (fail) throw Error('RAW_ERROR_' + key); return { rows: [row()], total: 1 }; },
    log(value) { assert(!value.includes(key)); outputs.push(JSON.parse(value)); }
  };
  return { d, plan, calls, events, outputs, credential, busy() { busy = true; }, fail() { fail = true; },
    cooldown() { cooldown = true; }, change() { changed = true; }, unlocked() { return !planLock && !queryLock; } };
}
test('confirma somente o mesmo conjunto NF-e e identidade sem imprimir dados',()=>{
 const raw=row(),before=JSON.stringify(window),out=summary([raw]);assert(out.model_filter_confirmed);
 assert.equal(out.expected_nfe_rows,1);assert.equal(out.nfe_rows,1);assert.equal(out.missing_saved_nfe,0);assert.equal(out.identity_changes,0);
 for(const value of [key,raw.id,raw.chave_acesso,raw.emitente_nome,raw.destinatario_nome,raw.emitente_cnpj])assert(!JSON.stringify(out).includes(value));
 assert.equal(JSON.stringify(window),before);
});
test('filtro ignorado com outros modelos nao e confirmado',()=>{
 const out=summary([row(),{id:'CTE_QA',empresa_cnpj:company.cnpj,modelo:'CT-e'}]);
 assert.equal(out.other_model_rows,1);assert.equal(out.missing_saved_nfe,0);assert.equal(out.model_filter_confirmed,false);
});
test('zero, omissao, documento novo e mudanca de identidade exigem revisao',()=>{
 const empty=summary([]);assert.equal(empty.missing_saved_nfe,1);assert(!empty.model_filter_confirmed);
 const extra=summary([row(),{...row(),id:'NEW',chave_acesso:'2'.repeat(44)}]);
 assert.equal(extra.new_nfe_vs_saved_window,1);assert(!extra.model_filter_confirmed);
 const changed=summary([{...row(),valor:'11,00'}]);assert.equal(changed.identity_changes,1);assert(!changed.model_filter_confirmed);
});
test('empresa/status divergentes, segredo refletido e corpo grande recusam confirmacao',()=>{
 for(const patch of [{empresa_cnpj:'11222333000181'},{status:'Importado'}])assert(!summary([{...row(),...patch}]).model_filter_confirmed);
 assert.throws(()=>summary([{...row(),extra:key}]));assert.throws(()=>summary(Array.from({length:101},row)));
});
test('pagina cheia ou duplicatas nunca provam filtro para a janela conferida',()=>{
 assert(!summary([row(),row()]).model_filter_confirmed);
 const out=summary(Array.from({length:100},(_,i)=>({...row(),id:'DOC'+i,chave_acesso:String(i).padStart(44,'0')})));
 assert(!out.model_filter_confirmed);
});
test('confirmacao e ID exato obrigatorios antes de carregar runtime',async()=>{
 for(const args of [[],['--plano-id',PLAN],['--plano-id','00000000-0000-4000-8000-000000000001','--confirmar-consulta-real']])
  await assert.rejects(main(args,{runtime:{loadProdCompany(){throw Error('NAO_DEVERIA_EXECUTAR');}}}),/CONFIRMACAO/);
});
test('um GET modelo=nfe do intervalo ja conferido, preservando plano e controles',async()=>{
 const f=fixture(),before=JSON.stringify(f.plan),out=await main(args,f.d);
 assert.equal(f.calls.length,1);const url=new URL(f.calls[0].url);assert.equal(url.origin,'https://api.nsdocs.com.br');assert.equal(url.pathname,'/v2/documentos');
 assert.equal(url.searchParams.get('modelo'),'nfe');assert.equal(url.searchParams.get('quantidade'),'100');assert.equal(url.searchParams.get('deslocamento'),'0');
 assert.equal(url.searchParams.get('status'),'Pendente');assert.equal(url.searchParams.get('data_emissao'),'01/02/2026 - 28/02/2026');
 assert(out.model_filter_confirmed);assert.equal(out.external_nsdocs_calls,1);assert.equal(out.database_writes,0);assert.equal(out.storage_calls,0);assert.equal(out.xml_downloads,0);
 assert.equal(f.events.length,2);assert.equal(f.outputs.length,1);assert.equal(f.credential.apiKey,'');assert(f.unlocked());assert.equal(JSON.stringify(f.plan),before);
});
test('plano ocupado ou cooldown nao consome credencial nem API',async()=>{
 for(const kind of ['busy','cooldown']){const f=fixture();f[kind]();await assert.rejects(main(args,f.d));assert.equal(f.calls.length,0);assert.equal(f.events.length,0);assert.equal(f.credential.apiKey,key);assert(f.unlocked());}
});
test('falha de rede e concorrencia impedem sucesso, sem perder estado ou imprimir corpo',async()=>{
 const f=fixture(),before=JSON.stringify(f.plan);f.fail();await assert.rejects(main(args,f.d));
 assert.equal(f.events[1].outcome,'NSDOCS_SONDA_MODELO_INTERROMPIDA');assert.equal(f.outputs.length,0);assert.equal(f.credential.apiKey,'');assert(f.unlocked());assert.equal(JSON.stringify(f.plan),before);
 const changed=fixture();changed.change();await assert.rejects(main(args,changed.d),/PLANO_MUDOU/);assert.equal(changed.outputs.length,0);
});
test('sem janela mista ja enumerada nao inicia nova consulta',async()=>{
 const f=fixture();f.plan.windows[0].unsupported=[];await assert.rejects(main(args,f.d),/SEM_JANELA_MISTA/);assert.equal(f.calls.length,0);assert.equal(f.events.length,0);
});
