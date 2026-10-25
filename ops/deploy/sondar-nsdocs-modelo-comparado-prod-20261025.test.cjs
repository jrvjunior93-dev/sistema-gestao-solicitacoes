'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {PLAN,compare,main}=require('./sondar-nsdocs-modelo-comparado-prod-20261025.cjs');
const root='../../backend/src/modules/fiscal/services/nsdocsHistorical/';
const policy=require(root+'manual/policy'),{normalizeResponse}=require(root+'manual/query'),{buildListRequest}=require(root+'contract');
const key='SEGREDO_FICTICIO_SONDA_COMPARADA_0123456789',company={id:1,cnpj:'27123008000100',ativo:true};
const args=['--plano-id',PLAN,'--confirmar-duas-consultas-reais'];
const request=buildListRequest({companyCnpj:company.cnpj,status:'Pendente',startDate:'2026-08-06',endDate:'2026-08-21',dateField:'data_emissao',limit:100,offset:0},company.cnpj);
function row(i=1){return {id:'FICTICIO'+i,empresa_cnpj:company.cnpj,modelo:'NF-e',emitente_cnpj:company.cnpj,destinatario_cnpj:company.cnpj,
 emitente_nome:'NAO_EXIBIR_EMITENTE',destinatario_nome:'NAO_EXIBIR_DESTINATARIO',numero:i,valor:'10,00',situacao:'Autorizado',status:'Pendente',
 chave_acesso:String(i).padStart(44,'0'),data_recebimento:'10/08/2026',data_emissao:'10/08/2026'};}
const rows=Array.from({length:70},(_,i)=>row(i+1));
const other={id:'CTE_FICTICIO',empresa_cnpj:company.cnpj,modelo:'CT-e'};
const saved={start:'2026-08-06',end:'2026-08-21',status:'Pendente',state:'enumerated',raw_count:71,
 documents:normalizeResponse({rows,total:70},request,company).documents,unsupported:[{provider_id:other.id,model:other.modelo}]};
const summary=list=>compare({rows:list,total:list.length},request,company,saved,key,policy,normalizeResponse);
function fixture(){
 let planLocked=false,queryLocked=false,busy=false,cooldown=false,fail=false,mutation=false,controlMode='stable',filteredMode='stable',cancelWait=false;
 const plan={date_field:'data_emissao',windows:[structuredClone(saved)]},calls=[],events=[],outputs=[],waits=[];
 const credential={companyId:1,companyCnpj:company.cnpj,apiKey:key},controller=new AbortController();
 const d={policy,buildListRequest,normalizeResponse,signal:controller.signal,
  runtime:{async loadProdCompany(id,cnpj){assert.equal(id,1);assert.equal(cnpj,company.cnpj);return company;}},core:{validate:p=>p},
  locks:{async withPlanLock(action){if(busy)throw Error('BUSY');planLocked=true;try{return await action();}finally{planLocked=false;}}},
  plans:{load(id){assert(planLocked);assert.equal(id,PLAN);return structuredClone(plan);}},
  secrets:{async withLock(action){assert(planLocked);queryLocked=true;try{return await action();}finally{queryLocked=false;}},
   checkCooldown(){assert(queryLocked);if(cooldown)throw Error('COOLDOWN');},loadCredentials(){assert(queryLocked);return credential;},
   appendHistory(e){assert(queryLocked);events.push(e);}},
  async wait(signal){assert(planLocked&&queryLocked);waits.push(signal);if(cancelWait)controller.abort();},
  async request(r,k,client,signal){assert(planLocked&&queryLocked);assert.equal(k,key);assert.equal(client,undefined);assert(signal instanceof AbortSignal);
   const url=new URL(r.url),model=url.searchParams.get('modelo');assert.equal(url.origin,'https://api.nsdocs.com.br');assert.equal(url.pathname,'/v2/documentos');
   assert(!url.searchParams.has('Authorization'));calls.push(r);if(fail)throw Error('RAW_'+key);
   let value=structuredClone(model?rows:[...rows,other]);const mode=model?filteredMode:controlMode;
   if(mode==='empty')value=[];if(mode==='ignored')value=structuredClone([...rows,other]);
   if(mode==='missing')value=value.filter(x=>x.id!==rows[0].id);if(mode==='extra')value.push(row(71));
   if(mode==='changed')value[0].valor='11,00';if(mutation)plan.windows[0].raw_count=99;
   return {rows:value,total:value.length};},log(s){assert(!s.includes(key));outputs.push(JSON.parse(s));}
 };
 return {d,plan,calls,events,outputs,waits,credential,controller,busy(){busy=true;},cooldown(){cooldown=true;},fail(){fail=true;},
  change(){mutation=true;},control(mode){controlMode=mode;},filtered(mode){filteredMode=mode;},cancelWait(){cancelWait=true;},unlocked:()=>!planLocked&&!queryLocked};
}
test('comparacao ignora outros modelos no controle, exige identidade exata e nao exibe notas',()=>{
 const out=summary([...rows,other]);assert(out.saved_nfe_set_matches);assert.equal(out.other_model_rows,1);
 for(const v of [key,company.cnpj,rows[0].id,rows[0].chave_acesso,rows[0].emitente_nome])assert(!JSON.stringify(out).includes(v));
 for(const list of [[],rows.slice(1),[...rows,row(71)],[{...rows[0],valor:'11,00'},...rows.slice(1)],[...rows,rows[0]]])assert(!summary(list).saved_nfe_set_matches);
});
test('confirma com controle misto e literalNF-e que retorna as mesmas70notas',async()=>{
 const f=fixture(),before=JSON.stringify(f.plan),out=await main(args,f.d);assert(out.model_filter_confirmed);
 assert.equal(out.external_nsdocs_calls,2);assert.equal(f.calls.length,2);assert.equal(f.waits.length,1);assert.equal(f.events.length,4);
 assert.equal(new URL(f.calls[0].url).searchParams.has('modelo'),false);
 assert.equal(new URL(f.calls[1].url).searchParams.get('modelo'),'NF-e');
 for(const r of f.calls){const u=new URL(r.url);assert.equal(u.searchParams.get('quantidade'),'100');assert.equal(u.searchParams.get('deslocamento'),'0');
  assert.equal(u.searchParams.get('status'),'Pendente');assert.equal(u.searchParams.get('data_emissao'),'06/08/2026 - 21/08/2026');assert.equal(r.companyCnpj,company.cnpj);}
 assert.equal(out.control_without_model_filter.nfe_rows,70);assert.equal(out.filtered_result.nfe_rows,70);assert.equal(out.filtered_result.other_model_rows,0);
 assert.equal(out.xml_downloads,0);assert.equal(out.database_writes,0);assert.equal(out.storage_calls,0);assert.equal(out.plan_changed,false);
 assert.equal(JSON.stringify(f.plan),before);assert.equal(f.credential.apiKey,'');assert(f.unlocked());
});
test('controle zerado, incompleto, novo ou divergente interrompe com uma consulta apenas',async()=>{
 for(const mode of ['empty','missing','extra','changed']){const f=fixture();f.control(mode);const out=await main(args,f.d);
  assert(!out.model_filter_confirmed);assert.equal(out.external_nsdocs_calls,1);assert.equal(out.filtered_result,null);assert.equal(f.waits.length,0);assert.equal(f.events.length,2);assert(f.unlocked());}
});
test('filtro ignorado, vazio ou com identidade diferente nao confirma otimizacao',async()=>{
 for(const mode of ['ignored','empty','missing','extra','changed']){const f=fixture();f.filtered(mode);const out=await main(args,f.d);
  assert(!out.model_filter_confirmed);assert.equal(f.calls.length,2);assert.equal(f.credential.apiKey,'');assert(f.unlocked());}
});
test('segredo refletido, outra empresa e pagina cheia nao provam cobertura',()=>{
 assert.throws(()=>summary([{...rows[0],extra:key},...rows.slice(1)]));
 assert(!summary([{...rows[0],empresa_cnpj:'11222333000181'},...rows.slice(1)]).saved_nfe_set_matches);
 const full=Array.from({length:100},(_,i)=>row(i+1));assert(!summary(full).saved_nfe_set_matches);
});
test('exige confirmacao especifica de ate duas chamadas antes do runtime',async()=>{
 for(const a of [[],['--plano-id',PLAN,'--confirmar-consulta-real'],['--plano-id','00000000-0000-4000-8000-000000000001','--confirmar-duas-consultas-reais']])
  await assert.rejects(main(a,{runtime:{loadProdCompany(){throw Error('NAO_DEVERIA_EXECUTAR');}}}),/CONFIRMACAO/);
});
test('lock/cooldown bloqueiam e credencial nao fica retida',async()=>{
 for(const method of ['busy','cooldown']){const f=fixture();f[method]();await assert.rejects(main(args,f.d));
  assert.equal(f.calls.length,0);assert.equal(f.events.length,0);assert(f.unlocked());if(method==='cooldown')assert.equal(f.credential.apiKey,'');}
});
test('cancelamento na espera nao realiza segunda chamada e libera locks',async()=>{
 const f=fixture();f.cancelWait();await assert.rejects(main(args,f.d),e=>e.code==='NSDOCS_SONDA_CANCELADA');
 assert.equal(f.calls.length,1);assert.equal(f.events.length,2);assert.equal(f.credential.apiKey,'');assert(f.unlocked());
});
test('falha de rede ou mudanca no plano impede resultado sem mostrar erro bruto',async()=>{
 for(const method of ['fail','change']){const f=fixture();const before=JSON.stringify(f.plan);f[method]();await assert.rejects(main(args,f.d));
  assert.equal(f.outputs.length,0);assert.equal(f.events.length,2);assert.equal(f.credential.apiKey,'');assert(f.unlocked());if(method==='fail')assert.equal(JSON.stringify(f.plan),before);}
});
test('registra e remove handlers de interrupcao ao terminar',async()=>{
 const names=['SIGINT','SIGTERM','SIGHUP'],before=names.map(n=>process.listenerCount(n));const f=fixture();delete f.d.signal;
 await main(args,f.d);assert.deepEqual(names.map(n=>process.listenerCount(n)),before);
});
test('janela de controle ausente nao abre credencial nem API',async()=>{
 const f=fixture();f.plan.windows[0].documents.pop();await assert.rejects(main(args,f.d),/BASE_CONFERIDA/);assert.equal(f.calls.length,0);assert.equal(f.events.length,0);
});
