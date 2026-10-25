'use strict';
// Fixtures, SQLite em memoria e comparacao com codigo anterior. Sem rede real.
const {test}=require('node:test'),assert=require('node:assert/strict');
for(const [name,methods] of [['node:http',['get','request']],['node:https',['get','request']],['node:net',['connect','createConnection']],['node:tls',['connect']]])
 for(const method of methods)require(name)[method]=()=>{throw Error('REDE_REAL_PROIBIDA');};
global.fetch=()=>{throw Error('REDE_REAL_PROIBIDA');};
const {execFileSync}=require('node:child_process'),path=require('node:path'),Module=require('node:module');
const {fixture,row,key,company,core,SECRET}=require('./helpers/nsdocsComplementFixture.cjs');
const root='../src/modules/fiscal/services/nsdocsHistorical/';
const {buildListRequest,providerDate}=require(root+'contract'),{normalizeResponse}=require(root+'manual/query');
const {discover}=require(root+'manual/complement/discovery'),{capture}=require(root+'manual/complement/capture');
const BASE='f8d32ac12d9a2619391af7e3cdf599711ef93a47';
function baseline(relative){
 const filename=path.resolve(__dirname,'../src/modules/fiscal/services/nsdocsHistorical',relative),m=new Module(filename,module);
 m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));
 const source=execFileSync('git',['show',BASE+':backend/src/modules/fiscal/services/nsdocsHistorical/'+relative],{cwd:path.resolve(__dirname,'../..'),encoding:'utf8'});
 m._compile(source,filename);return m.exports;
}
const originalDiscover=baseline('manual/complement/discovery.js').discover;
const oldContract=baseline('contract.js');
function unsupported(i,day){return {id:'CTE_'+i,modelo:'CT-e',status:'Pendente',empresa_cnpj:company.cnpj,data_emissao:day+'/10/2026',data_recebimento:day+'/10/2026'};}
function provider(f,rows,{ignoreFilter=false,reverse=false}={}){
 f.deps.request=async request=>{
  f.calls.list++;const url=new URL(request.url),model=url.searchParams.get('modelo');
  assert.equal(url.origin,'https://api.nsdocs.com.br');assert.equal(url.pathname,'/v2/documentos');
  assert.equal(url.searchParams.get('quantidade'),'100');assert.equal(url.searchParams.get('deslocamento'),'0');
  assert.equal(request.companyCnpj,company.cnpj);assert(Object.isFrozen(request));assert(Object.isFrozen(request.headers));
  let found=rows.filter(r=>(ignoreFilter||!model||r.modelo===model)&&r.status===request.status&&
   providerDate(r[request.dateField])>=request.startDate&&providerDate(r[request.dateField])<=request.endDate);
  if(reverse)found=found.slice().reverse();found=found.slice(0,100);
  return {rows:structuredClone(found),total:found.length};
 };
}
async function finish(f,run=discover){
 for(let i=0;i<100;i++){const s=await run({planId:f.plan.id,company,maxQueries:10},f.deps);if(!s.pending_windows||s.needs_review)return s;}
 throw Error('LIMITE_QA');
}
function seedLegacy150(f){
 const p=f.plan,pending=p.windows.find(w=>w.status==='Pendente');pending.raw_count=100;
 const children=core.split(pending);p.windows.push(...children);
 const right=children[1];right.raw_count=100;const tail=core.split(right);p.windows.push(...tail);
 const firstRows=Array.from({length:70},(_,i)=>row(47+i,'10'));
 const secondRows=[...Array.from({length:9},(_,i)=>row(i+1)),...Array.from({length:71},(_,i)=>row(117+i))];
 const firstOther=Array.from({length:29},(_,i)=>unsupported(i,'10'));
 const secondOther=Array.from({length:14},(_,i)=>unsupported(29+i,'20'));
 function close(w,rows){const req=buildListRequest({companyCnpj:company.cnpj,status:w.status,startDate:w.start,endDate:w.end,dateField:p.date_field,limit:100,offset:0},company.cnpj);
  const page=normalizeResponse({rows,total:rows.length},req,company);assert(page.window_complete);
  Object.assign(w,{state:'enumerated',raw_count:page.raw_count,reported_total:page.total,next_offset:null,documents:page.documents,unsupported:page.unsupported,duplicates:page.duplicates});}
 close(children[0],[...firstRows,...firstOther]);close(tail[0],[...secondRows,...secondOther]);
 core.validate(p,company);f.store.save(p);
 const remainingSources=Array.from({length:37},(_,i)=>({...row(10+i),status:'Importado'}));
 const newRows=Array.from({length:30},(_,i)=>row(188+i,'27'));
 const extraOther=[...Array.from({length:60},(_,i)=>unsupported(43+i,'25')),...Array.from({length:60},(_,i)=>unsupported(103+i,'30'))];
 return {rows:[...firstRows,...firstOther,...secondRows,...secondOther,...remainingSources,...newRows,...extraOther],
  closed:[children[0],tail[0]].map(w=>({id:w.id,json:JSON.stringify(w)}))};
}
test('contrato e descritor legado intactos; parametro de modelo nao invade outras capturas',()=>{
 const input={companyCnpj:company.cnpj,status:'Pendente',startDate:'2026-10-01',endDate:'2026-10-31',limit:100,offset:0};
 assert.deepEqual(buildListRequest(input,company.cnpj),oldContract.buildListRequest(input,company.cnpj));
 for(const model of ['NF-e','nfe','NFSE','CT-e','',null,true,{},'NF-e&status=Importado'])assert.throws(()=>buildListRequest({...input,model},company.cnpj));
 assert.throws(()=>buildListRequest({...input,companyCnpj:'99999999999999',model:'NF-e'},company.cnpj));
});
test('escolha de intervalo menor preserva empates e nunca escolhe janelas prontas',()=>{
 const windows=[{id:'a',state:'pending',start:'2026-01-01',end:'2026-01-31'},
  {id:'b',state:'enumerated',start:'2026-01-01',end:'2026-01-01'},
  {id:'c',state:'pending',start:'2026-01-10',end:'2026-01-12'},
  {id:'d',state:'pending',start:'2026-01-20',end:'2026-01-22'}],before=JSON.stringify(windows);
 assert.equal(core.nextPending({windows}).id,'c');assert.equal(JSON.stringify(windows),before);
 assert.equal(core.nextPending({windows:windows.filter(w=>w.state!=='pending')}),undefined);
});
test('aproveita150notas e43observacoes anteriores; reduz chamadas4para2 e nao perde NF-e',async t=>{
 const f=await fixture(46),old=await fixture(46);t.after(f.close);t.after(old.close);
 const seeded=seedLegacy150(f),legacy=seedLegacy150(old);
 const before=core.summary(f.store.load(f.plan.id));assert.equal(before.documents_discovered,150);assert.equal(before.source_documents_missing,37);assert.equal(before.unsupported_documents,43);
 provider(f,seeded.rows);provider(old,legacy.rows);
 const a=await finish(f),b=await finish(old,originalDiscover);
 assert(a.enumeration_complete);assert(b.enumeration_complete);assert.equal(a.source_documents_missing,0);
 const current=f.store.load(f.plan.id),previous=old.store.load(old.plan.id);
 assert.equal(current.documents.length,217);assert.deepEqual(current.documents.map(d=>d.access_key),previous.documents.map(d=>d.access_key));
 assert.equal(f.calls.list,2);assert.equal(old.calls.list,4);assert.equal(a.unsupported_documents,43);
 for(const w of seeded.closed)assert.equal(JSON.stringify(current.windows.find(x=>x.id===w.id)),w.json);
 assert.equal(f.calls.xml,0);assert.equal(f.calls.put,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM fiscal_dfe_documents').get().n,46);
 console.log('BENCHMARK_FICTICIO: mesmo conjunto217NF-e; chamadas4->2;150metadados anteriores intactos');
});
test('captura apos otimizacao conserva46cadastros/XMLs/historico e nao duplica em replay',async t=>{
 const f=await fixture(46);t.after(f.close);const seeded=seedLegacy150(f);
 const originals=f.sql.prepare('SELECT * FROM fiscal_dfe_documents ORDER BY id').all(),events=f.sql.prepare('SELECT * FROM fiscal_dfe_events ORDER BY id').all();
 const objects=new Map([...f.objects].map(([k,v])=>[k,v.toString('base64')])),parent=JSON.stringify(f.parent);
 f.sql.exec("CREATE TABLE financeiro_titulos(id INTEGER,status TEXT,saldo INTEGER);INSERT INTO financeiro_titulos VALUES(1,'PARCIAL',60)");
 provider(f,seeded.rows);await finish(f);let result;
 for(let i=0;i<10;i++){result=await capture({planId:f.plan.id,company,maxBatches:10},f.deps);if(!result.pending_batches)break;}
 assert(result.complete);assert.equal(result.reused_xmls,46);assert.equal(result.xml_downloads,171);
 assert.deepEqual(f.sql.prepare('SELECT * FROM fiscal_dfe_documents WHERE id<=46 ORDER BY id').all(),originals);
 assert.deepEqual(f.sql.prepare('SELECT * FROM fiscal_dfe_events WHERE id<=? ORDER BY id').all(events.length),events);
 assert.deepEqual({...f.sql.prepare('SELECT * FROM financeiro_titulos').get()},{id:1,status:'PARCIAL',saldo:60});
 for(const [k,v]of objects)assert.equal(f.objects.get(k).toString('base64'),v);assert.equal(JSON.stringify(f.parent),parent);
 const replay=await capture({planId:f.plan.id,company,maxBatches:10},f.deps);assert.equal(replay.executed_batches,0);
 assert.equal(f.calls.xml,171);assert.equal(f.calls.put,171);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM fiscal_dfe_documents').get().n,217);
});
test('filtro ignorado pelo provedor interrompe sem fechar janela nem descartar150notas',async t=>{
 const f=await fixture(46);t.after(f.close);const seeded=seedLegacy150(f),before=JSON.stringify(f.store.load(f.plan.id));
 provider(f,seeded.rows,{ignoreFilter:true});await assert.rejects(discover({planId:f.plan.id,company,maxQueries:1},f.deps),e=>e.code==='NSDOCS_FILTRO_MODELO_NAO_RESPEITADO');
 assert.equal(JSON.stringify(f.store.load(f.plan.id)),before);assert.equal(f.calls.list,1);assert.equal(f.calls.xml,0);assert.equal(f.calls.put,0);
});
test('pagina cheia de100NF-e em um dia continua exigindo revisao, mesmo com outros modelos excluidos',async t=>{
 const f=await fixture(1);t.after(f.close);provider(f,[...Array.from({length:101},(_,i)=>row(i+1)),...Array.from({length:30},(_,i)=>unsupported(i,'20'))]);
 const result=await finish(f);assert(result.needs_review);assert(!result.enumeration_complete);assert(!result.complete);assert.equal(f.calls.xml,0);
});
test('outros modelos com mais100por dia nao impedem cobertura dasNF-e abaixo do limite',async t=>{
 const f=await fixture(1),old=await fixture(1);t.after(f.close);t.after(old.close);
 const rows=[...Array.from({length:30},(_,i)=>row(i+1)),...Array.from({length:200},(_,i)=>unsupported(i,'20'))];
 provider(f,rows);provider(old,rows);const result=await finish(f),previous=await finish(old,originalDiscover);
 assert(result.enumeration_complete);assert.equal(result.documents_discovered,30);assert.equal(result.needs_review,false);
 assert(previous.needs_review);assert.equal(f.calls.xml,0);assert.equal(f.calls.put,0);
 assert.equal(f.store.load(f.plan.id).documents.length,30);
});
test('ordem embaralhada, duplicidade entre status e chave conflitante continuam controladas',async t=>{
 const f=await fixture(1);t.after(f.close);const rows=Array.from({length:130},(_,i)=>row(i+1,i<65?'10':'20'));rows[0]=row(1);
 rows.push({...row(1),status:'Importado'});provider(f,rows,{reverse:true});const result=await finish(f);
 assert(result.enumeration_complete);assert.equal(result.documents_discovered,130);assert.equal(new Set(f.store.load(f.plan.id).documents.map(d=>d.access_key)).size,130);
 const conflict=await fixture(1);t.after(conflict.close);provider(conflict,[row(1),{...row(1),status:'Importado',valor:'R$ 1,00'}]);
 await assert.rejects(finish(conflict),e=>e.code==='NSDOCS_COMPLEMENTO_IDENTIDADE_CONFLITANTE');
});
test('snapshot legado ja congelado permanece identico e nao faz consultas novas',async t=>{
 const f=await fixture(1);t.after(f.close);provider(f,[row(1)]);await finish(f,originalDiscover);
 const before=JSON.stringify(f.store.load(f.plan.id)),calls=f.calls.list;await discover({planId:f.plan.id,company,maxQueries:10},f.deps);
 assert.equal(JSON.stringify(f.store.load(f.plan.id)),before);assert.equal(f.calls.list,calls);
});
test('marcador de filtro nao pode atribuirNF-e a janelas legadas que contem outros modelos',async t=>{
 const f=await fixture(46);t.after(f.close);const seeded=seedLegacy150(f),p=f.store.load(f.plan.id);
 p.windows.find(w=>w.id===seeded.closed[0].id).query_model='NF-e';assert.throws(()=>core.validate(p,company));
 const another=f.store.load(f.plan.id);another.windows[0].query_model='nfe';assert.throws(()=>core.validate(another,company));
});
test('cancelamento, lock e cooldown nao contornados; limites e origem ausente permanecem',async t=>{
 const f=await fixture(46);t.after(f.close);const seeded=seedLegacy150(f),before=JSON.stringify(f.store.load(f.plan.id));provider(f,seeded.rows);
 for(const deps of [{...f.deps,locks:{withPlanLock(){throw Error('LOCK_OCUPADO');}}},
  {...f.deps,secrets:{...f.deps.secrets,checkCooldown(){throw Error('COOLDOWN');}}}])await assert.rejects(discover({planId:f.plan.id,company,maxQueries:1},deps));
 await assert.rejects(discover({planId:f.plan.id,company,signal:AbortSignal.abort()},f.deps));
 await assert.rejects(discover({planId:f.plan.id,company,maxQueries:11},f.deps));
 assert.equal(JSON.stringify(f.store.load(f.plan.id)),before);assert.equal(f.calls.list,0);assert.equal(f.calls.xml,0);
 const missing=await fixture(1);t.after(missing.close);provider(missing,[row(2)]);const out=await finish(missing);
 assert.equal(out.source_documents_missing,1);assert(!out.complete);
});
test('falha de disco ou transporte nao perde150metadados nem avanca janela',async t=>{
 for(const reason of ['disk','network']){const f=await fixture(46);t.after(f.close);const seeded=seedLegacy150(f),before=JSON.stringify(f.store.load(f.plan.id));
  provider(f,seeded.rows);if(reason==='disk')f.store.failNext();else f.deps.request=async()=>{throw Error('RAW_'+SECRET);};
  await assert.rejects(discover({planId:f.plan.id,company,maxQueries:1},f.deps));assert.equal(JSON.stringify(f.store.load(f.plan.id)),before);
  assert.equal(f.calls.xml,0);assert.equal(f.calls.put,0);assert(!JSON.stringify(f.journals).includes(SECRET));}
});
test('checkpoint salvo com resposta perdida retoma sem consultar de novo a janela concluida',async t=>{
 const f=await fixture(46);t.after(f.close);const seeded=seedLegacy150(f);provider(f,seeded.rows);
 const save=f.store.save.bind(f.store);let once=true;
 f.store.save=(p,create)=>{save(p,create);if(once){once=false;throw Error('ACK_FICTICIO_PERDIDO');}};
 await assert.rejects(discover({planId:f.plan.id,company,maxQueries:1},f.deps),/ACK_FICTICIO/);
 assert.equal(core.summary(f.store.load(f.plan.id)).documents_discovered,180);
 const result=await finish(f);assert(result.enumeration_complete);assert.equal(result.documents_discovered,217);
 assert.equal(f.calls.list,2);assert.equal(f.calls.xml,0);assert.equal(f.calls.put,0);
 for(const w of seeded.closed)assert.equal(JSON.stringify(f.store.load(f.plan.id).windows.find(x=>x.id===w.id)),w.json);
});
test('campo de recebimento conserva semantica e nao se transforma em filtro de emissao',async t=>{
 const f=await fixture(1);t.after(f.close);const p=f.plan;p.date_field='data_recebimento';
 const root=p.windows.find(w=>w.status==='Pendente'),children=core.split(root);p.windows.push(...children);
 for(const w of [children[0],p.windows.find(w=>w.status==='Importado')])Object.assign(w,{state:'enumerated',raw_count:0,next_offset:null,documents:[],unsupported:[],duplicates:0});
 core.validate(p,company);f.store.save(p);
 const rows=[row(1),{...row(2,'01'),data_recebimento:'25/10/2026'}];provider(f,rows);
 const original=f.deps.request;f.deps.request=async r=>{const u=new URL(r.url);assert(u.searchParams.has('data_recebimento'));assert(!u.searchParams.has('data_emissao'));return original(r);};
 const result=await finish(f);assert(result.enumeration_complete);assert.equal(result.documents_discovered,2);assert.equal(f.calls.list,1);
 const doc=f.store.load(f.plan.id).documents.find(d=>d.access_key===key(2));assert.equal(doc.issued_on,'2026-10-01');assert.equal(doc.received_on,'2026-10-25');
});
test('intervalo entre chamadas e verificado a cada GET sem paralelismo ou retentativa rapida',async t=>{
 const f=await fixture(46);t.after(f.close);const seeded=seedLegacy150(f);provider(f,seeded.rows);
 let now=60000,last=0,checks=0,waits=0,active=0;
 f.deps.wait=async()=>{waits++;now+=60000;};
 f.deps.secrets.checkCooldown=()=>{assert(now-last>=60000);checks++;};
 const original=f.deps.request;f.deps.request=async r=>{assert.equal(active,0);active++;last=now;try{return await original(r);}finally{active--;}};
 await finish(f);assert.equal(checks,2);assert.equal(waits,1);assert.equal(active,0);
});
