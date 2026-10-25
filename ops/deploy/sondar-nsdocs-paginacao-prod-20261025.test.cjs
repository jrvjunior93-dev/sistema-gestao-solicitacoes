'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {main,summarize,PLAN}=require('./sondar-nsdocs-paginacao-prod-20261025.cjs');
const root='../../backend/src/modules/fiscal/services/nsdocsHistorical/manual/';
const policy=require(root+'policy'),{validatePlan}=require(root+'historical');
const key='SEGREDO_FICTICIO_APENAS_QA';
const company={id:1,cnpj:'27123008000100',ativo:1};
const args=['--plano-id',PLAN,'--confirmar-consulta-real'];
const page={raw_count:5,total:5,next_offset:null,documents:Array.from({length:5},(_,i)=>({provider_id:'OLD'+i})),unsupported:[]};
const request={status:'Pendente'};
const row=id=>({id,empresa_cnpj:company.cnpj,status:'Pendente',modelo:'NF-e'});
function fixture(){
 const plan={version:1,id:PLAN,company_id:company.id,company_cnpj:company.cnpj,date_field:'data_emissao',start_date:'2026-01-01',end_date:'2026-01-31',jobs:[{id:'00000000-0000-4000-8000-000000000001',start:'2026-01-01',end:'2026-01-31',status:'Pendente',offset:0,state:'completed'}]};
 const events=[],calls=[],credential={companyId:company.id,companyCnpj:company.cnpj,apiKey:key};
 let planLocked=false,queryLocked=false,loads=0,busy=false,fail=false,change=false;
 const d={policy,validatePlan,runtime:{async loadProdCompany(id,cnpj){assert.equal(id,1);assert.equal(cnpj,company.cnpj);return company;}},
  plans:{async withPlanLock(action){if(busy)throw Error('OCUPADO');planLocked=true;try{return await action();}finally{planLocked=false;}},load(id){assert(planLocked);assert.equal(id,PLAN);loads++;const p=structuredClone(plan);if(change&&loads>1)p.jobs[0].state='pending';return p;}},
  async readCapture(){assert(planLocked);assert(!queryLocked);return {state:'completed',request_json:JSON.stringify({limit:5,offset:0,status:'Pendente',startDate:'2026-01-01',endDate:'2026-01-31',dateField:'data_emissao'}),page_json:JSON.stringify(page)};},
  store:{async withLock(action){assert(planLocked);queryLocked=true;try{return await action();}finally{queryLocked=false;}},checkCooldown(){assert(queryLocked);},loadCredentials(){assert(queryLocked);return credential;},appendHistory(e){assert(queryLocked);events.push(e);}},
  async request(r,k){assert(planLocked&&queryLocked);assert.equal(k,key);calls.push(r);if(fail)throw Error('RESPOSTA_BRUTA_'+key);return {rows:[row('NEW0'),row('NEW1')],total:2};},log(s){assert(!s.includes(key));}};
 return {d,events,calls,credential,plan,busy:()=>busy=true,fail:()=>fail=true,change:()=>change=true};
}
test('sem confirmacao nao carrega runtime, credencial ou API',async()=>{
 await assert.rejects(main([],{runtime:{loadProdCompany(){throw Error('NAO_DEVE_CHAMAR');}}}),/CONFIRMACAO/);
 await assert.rejects(main(['--plano-id','00000000-0000-4000-8000-000000000001','--confirmar-consulta-real']),/CONFIRMACAO/);
});
test('um GET offset5 sob dois locks; header de pagina nao impede contar documentos novos',async()=>{
 const f=fixture(),before=JSON.stringify(f.plan),out=await main(args,f.d);
 assert.equal(f.calls.length,1);const url=new URL(f.calls[0].url);
 assert.equal(url.origin,'https://api.nsdocs.com.br');assert.equal(url.pathname,'/v2/documentos');
 assert.equal(url.searchParams.get('quantidade'),'5');assert.equal(url.searchParams.get('deslocamento'),'5');
 assert.equal(url.searchParams.get('data_emissao'),'01/01/2026 - 31/01/2026');assert.equal(url.searchParams.get('status'),'Pendente');
 assert.equal(out.new_provider_ids_vs_first_page,2);assert.equal(out.total_header,2);
 assert.equal(out.external_nsdocs_calls,1);assert.equal(out.xml_downloads,0);assert.equal(out.database_writes,0);assert.equal(out.storage_calls,0);
 assert.equal(JSON.stringify(f.plan),before);assert.equal(f.credential.apiKey,'');assert.equal(f.events.length,2);
});
test('pagina cheia com total5, pagina vazia e deslocamento ignorado sao distinguidos',()=>{
 const output=summarize({rows:Array.from({length:5},(_,i)=>row('NEW'+i)),total:5},page,request,company,key,policy);
 assert.equal(output.new_provider_ids_vs_first_page,5);assert.equal(output.overlap_with_saved_first_page,0);
 const empty=summarize({rows:[],total:0},page,request,company,key,policy);assert.equal(empty.returned_rows,0);
 const repeated=summarize({rows:Array.from({length:5},(_,i)=>row('OLD'+i)),total:5},page,request,company,key,policy);
 assert.equal(repeated.overlap_with_saved_first_page,5);assert.equal(repeated.new_provider_ids_vs_first_page,0);
});
test('segredo refletido, outra empresa/status, IDs repetidos e resposta acima do limite recusados',()=>{
 for(const rows of [[{...row('NEW'),extra:key}],[{...row('NEW'),empresa_cnpj:'11222333000181'}],[{...row('NEW'),status:'Importado'}],[row('NEW'),row('NEW')],Array.from({length:6},(_,i)=>row('NEW'+i))])
  assert.throws(()=>summarize({rows,total:rows.length},page,request,company,key,policy));
});
test('plano ocupado nao abre credencial nem chama API',async()=>{
 const f=fixture();f.busy();await assert.rejects(main(args,f.d),/OCUPADO/);assert.equal(f.calls.length,0);assert.equal(f.events.length,0);assert.equal(f.credential.apiKey,key);
});
test('falha de rede registra interrupcao e zera copia da chave; nao altera plano',async()=>{
 const f=fixture(),before=JSON.stringify(f.plan);f.fail();await assert.rejects(main(args,f.d));
 assert.equal(f.calls.length,1);assert.equal(f.events.length,2);assert.equal(f.events[1].outcome,'NSDOCS_SONDA_PAGINACAO_INTERROMPIDA');assert.equal(f.credential.apiKey,'');assert.equal(JSON.stringify(f.plan),before);
});
test('mudanca do plano impede anunciar resultado de sucesso',async()=>{
 const f=fixture();f.change();await assert.rejects(main(args,f.d));assert.equal(f.events[1].outcome,'NSDOCS_SONDA_PAGINACAO_INTERROMPIDA');
});
test('plano incompleto nao inicia consulta',async()=>{
 const f=fixture();f.plan.jobs[0].state='pending';await assert.rejects(main(args,f.d),/NAO_CONCLUIDO/);assert.equal(f.calls.length,0);assert.equal(f.events.length,0);
});
