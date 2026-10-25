'use strict';
// Dados ficticios e SQLite em memoria. Todos os transportes externos bloqueados.
const {test}=require('node:test'),assert=require('node:assert/strict');
for(const [name,methods] of [['node:http',['get','request']],['node:https',['get','request']],['node:net',['connect','createConnection']],['node:tls',['connect']]])
 for(const method of methods)require(name)[method]=()=>{throw Error('REDE_REAL_PROIBIDA');};
global.fetch=()=>{throw Error('FETCH_REAL_PROIBIDO');};
const {randomUUID}=require('node:crypto');
const {fixture,row,key,company,SECRET,core}=require('./helpers/nsdocsComplementFixture.cjs');
const root='../src/modules/fiscal/services/nsdocsHistorical/manual/';
const {normalizePage}=require('../src/modules/fiscal/services/nsdocsHistorical/normalize');
const {normalizeResponse}=require(root+'query'),{buildListRequest,providerDate}=require('../src/modules/fiscal/services/nsdocsHistorical/contract');
const {discover}=require(root+'complement/discovery'),{capture,captureBatch}=require(root+'complement/capture');
const cli=require('./nsdocsProdComplement');
const fail=code=>error=>error.code===code;
function provider(f,rows){f.deps.request=async request=>{
 f.calls.list++;const url=new URL(request.url);
 assert.equal(url.origin,'https://api.nsdocs.com.br');assert.equal(url.pathname,'/v2/documentos');assert.equal(url.searchParams.get('quantidade'),'100');assert.equal(url.searchParams.get('deslocamento'),'0');assert.equal(url.searchParams.get('modelo'),'NF-e');
 const filtered=rows.filter(r=>r.modelo==='NF-e'&&r.status===request.status&&providerDate(r.data_emissao)>=request.startDate&&providerDate(r.data_emissao)<=request.endDate).slice(0,100);
 return {rows:structuredClone(filtered),total:filtered.length};
};}
async function enumerate(f,rows){provider(f,rows);let s;for(let i=0;i<50;i++){
 s=await discover({planId:f.plan.id,company,maxQueries:10},f.deps);if(!s.pending_windows||s.needs_review)return s;
}throw Error('LIMITE_QA');}

test('header5 nao encerra pagina cheia; offset positivo e pagina vazia final sao aceitos no modo de pagina',()=>{
 const rows=Array.from({length:5},(_,i)=>({id:'FICTICIO'+i,modelo:'CT-e',empresa_cnpj:company.cnpj}));
 for(const offset of [0,5]){const p=normalizePage(rows,{companyCnpj:company.cnpj,offset,limit:5},5,{countMode:'page'});assert.equal(p.window_complete,false);assert.equal(p.next_offset,offset+5);}
 assert.equal(normalizePage([],{companyCnpj:company.cnpj,offset:5,limit:5},0,{countMode:'page'}).window_complete,true);
 assert.throws(()=>normalizePage(rows,{companyCnpj:company.cnpj,offset:5,limit:5},4,{countMode:'page'}));
 const req=buildListRequest({companyCnpj:company.cnpj,status:'Pendente',startDate:'2026-10-01',endDate:'2026-10-31',limit:5,offset:0},company.cnpj);
 const legacy=normalizeResponse({rows:Array.from({length:5},(_,i)=>row(i+1)),total:5},req,company);
 assert.equal(legacy.partition_required,true);assert.equal(legacy.window_complete,false);assert.equal(legacy.next_offset,null);
});

test('complemento preserva pai e mantem snapshot ate executar descoberta manual limitada',async t=>{
 const f=await fixture(1);t.after(f.close);const before=JSON.stringify(f.parent);
 provider(f,[row(1),row(2)]);
 const s=await discover({planId:f.plan.id,company,maxQueries:1},f.deps);
 assert.equal(s.pending_windows,1);assert.equal(s.enumeration_complete,false);assert.equal(f.calls.list,1);assert.equal(f.calls.xml,0);assert.equal(f.calls.put,0);
 assert.equal(JSON.stringify(f.parent),before);assert.equal(f.journals.length,2);
 assert(!JSON.stringify(f.store.load(f.plan.id)).includes(SECRET));
});

test('46 NF-e/XMLs anteriores intactos; apenas14novos XMLs; replay e outro plano nao duplicam',async t=>{
 const f=await fixture(46);t.after(f.close);
 f.sql.exec("UPDATE fiscal_dfe_documents SET document_status='validated',manifestation_status='confirmacao_operacao',issuer_name='Conferido manualmente'");
 f.sql.exec("CREATE TABLE financeiro_titulos(id INTEGER,status TEXT,saldo INTEGER);INSERT INTO financeiro_titulos VALUES(1,'PARCIAL',60)");
 const before=f.sql.prepare('SELECT * FROM fiscal_dfe_documents ORDER BY id').all();
 const originalXml=[...f.objects].map(([k,v])=>[k,v.toString('base64')]);
 const rows=Array.from({length:60},(_,i)=>row(i+1));
 const s=await enumerate(f,rows);assert.equal(s.documents_discovered,60);assert.equal(s.enumeration_complete,true);assert.equal(s.complete,false);assert.equal(s.source_documents_missing,0);
 let end=await capture({planId:f.plan.id,company,maxBatches:10},f.deps);
 assert.equal(end.completed_batches,10);assert.equal(end.pending_batches,2);
 end=await capture({planId:f.plan.id,company,maxBatches:10},f.deps);
 assert.equal(end.complete,true);assert.equal(end.reused_xmls,46);assert.equal(end.xml_downloads,14);assert.equal(f.calls.xml,14);assert.equal(f.calls.put,14);assert.equal(f.calls.list,2);
 assert.deepEqual(f.sql.prepare('SELECT * FROM fiscal_dfe_documents WHERE id<=46 ORDER BY id').all(),before);
 for(const [k,b] of originalXml)assert.equal(f.objects.get(k).toString('base64'),b);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM fiscal_dfe_documents').get().n,60);
 assert.deepEqual({...f.sql.prepare('SELECT * FROM financeiro_titulos').get()},{id:1,status:'PARCIAL',saldo:60});
 const events=f.sql.prepare('SELECT COUNT(*) n FROM fiscal_dfe_events').get().n;
 const again=await capture({planId:f.plan.id,company,maxBatches:10},f.deps);assert.equal(again.executed_batches,0);assert.equal(f.calls.xml,14);
 const second=core.create(f.parent,f.plan.source_keys);f.store.save(second,true);f.plan=second;
 await enumerate(f,rows);await capture({planId:second.id,company,maxBatches:10},f.deps);await capture({planId:second.id,company,maxBatches:10},f.deps);
 assert.equal(f.calls.xml,14);assert.equal(f.calls.put,14);assert(f.sql.prepare('SELECT COUNT(*) n FROM fiscal_dfe_events').get().n>events);
 assert(!f.trace.some(s=>/UPDATE fiscal_dfe_documents|UPDATE empresas_grupo|UPDATE fiscal_companies|financeiro_titulos|pedido_compras/i.test(s)));
});

test('janelas cheias sao subdivididas sem offset; ordem embaralhada e sobreposicao entre status nao omitem nem duplicam',async t=>{
 const f=await fixture(1);t.after(f.close);
 const rows=Array.from({length:130},(_,i)=>row(i+1,i<65?'10':'20'));
 rows[0]=row(1,'20'); // origem ja capturada pertence ao snapshot
 rows.push({...row(1,'20'),status:'Importado'});rows.reverse();
 const s=await enumerate(f,rows);
 assert.equal(s.enumeration_complete,true);assert.equal(s.documents_discovered,130);assert.equal(s.needs_review,false);assert(f.calls.list>2);
 const p=f.store.load(f.plan.id);assert(p.windows.some(w=>w.state==='split'));assert.equal(new Set(p.documents.map(d=>d.access_key)).size,130);
 assert(p.windows.filter(w=>w.state==='enumerated').every(w=>w.raw_count<100));
});

test('100 documentos em um dia nao sao anunciados como cobertura completa',async t=>{
 const f=await fixture(1);t.after(f.close);
 const s=await enumerate(f,Array.from({length:101},(_,i)=>row(i+1)));
 assert.equal(s.needs_review,true);assert.equal(s.enumeration_complete,false);assert.equal(s.complete,false);assert.equal(f.calls.xml,0);
 await assert.rejects(capture({planId:f.plan.id,company},f.deps),fail('NSDOCS_COMPLEMENTO_ENUMERACAO_PENDENTE'));
});

test('falta de nota original impede declarar cobertura completa sem apagar a anterior',async t=>{
 const f=await fixture(1);t.after(f.close);
 const s=await enumerate(f,[row(2)]);assert.equal(s.source_documents_missing,1);
 const end=await capture({planId:f.plan.id,company},f.deps);assert.equal(end.complete,false);assert.equal(end.pending_batches,0);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM fiscal_dfe_documents').get().n,2);
});

test('falha de disco apos commit retoma ID salvo, sem baixar nem gravar XML novamente',async t=>{
 const f=await fixture(1);t.after(f.close);await enumerate(f,[row(1),row(2)]);
 f.store.failNext();await assert.rejects(capture({planId:f.plan.id,company},f.deps),/DISCO_FICTICIO/);
 assert.equal(f.calls.xml,1);assert.equal(f.calls.put,1);assert.equal(f.store.load(f.plan.id).batches[0].state,'pending');
 const end=await capture({planId:f.plan.id,company},f.deps);assert.equal(end.complete,true);assert.equal(f.calls.xml,1);assert.equal(f.calls.put,1);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM fiscal_dfe_documents').get().n,2);
});

test('falha no download e cancelamento mantem anterior e registram erro sanitizado',async t=>{
 const f=await fixture(1);t.after(f.close);await enumerate(f,[row(1),row(2)]);f.failXml();
 await assert.rejects(capture({planId:f.plan.id,company},f.deps),fail('NSDOCS_FALHA_SANITIZADA'));
 assert.equal(f.store.load(f.plan.id).batches[0].state,'pending');assert.equal(f.calls.put,0);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM fiscal_dfe_documents').get().n,1);
 assert(!JSON.stringify(f.sql.prepare('SELECT result_json,error_code FROM fiscal_nsdocs_captures').all()).includes(SECRET));
 await assert.rejects(capture({planId:f.plan.id,company,signal:AbortSignal.abort()},f.deps),fail('NSDOCS_CONSULTA_CANCELADA'));
});

test('XML existente divergente ou referencia indevida recusa reutilizacao',async t=>{
 const f=await fixture(1);t.after(f.close);await enumerate(f,[row(1)]);
 f.sql.exec("UPDATE fiscal_nsdocs_observations SET xml_bucket='BUCKET_INDEVIDO'");
 await assert.rejects(capture({planId:f.plan.id,company},f.deps),fail('NSDOCS_COMPLEMENTO_XML_EXISTENTE_INVALIDO'));assert.equal(f.calls.xml,0);
 f.sql.exec("UPDATE fiscal_nsdocs_observations SET xml_bucket='fluxy-fiscal-prod'");
 const d=structuredClone(f.seededDocs[0]);d.total_cents++;
 await assert.rejects(f.repo.reusableXml(d,company,9),fail('NSDOCS_COMPLEMENTO_IDENTIDADE_CONFLITANTE'));
});

test('manifesto, lote, empresa, geometria e referencia de origem adulterados sao recusados',async t=>{
 const f=await fixture(1);t.after(f.close);await enumerate(f,[row(1),row(2)]);
 const p=f.store.load(f.plan.id);
 for(const alter of [v=>v.documents[0].number='ALTERADO',v=>v.batches[0].start=1,v=>v.company_id=99,v=>v.windows[0].end='2026-10-30',v=>v.source_keys.push(key(1)),v=>v.windows[0].state='pending']){
  const bad=structuredClone(p);alter(bad);assert.throws(()=>core.validate(bad,company));
 }
 const before=JSON.stringify(p);await assert.rejects(captureBatch({plan:p,batch:{...p.batches[0]},company},f.deps),fail('NSDOCS_COMPLEMENTO_LOTE_INVALIDO'));assert.equal(JSON.stringify(p),before);
});

test('fonte do complemento tem de estar concluida no banco e conter notas',async t=>{
 const f=await fixture(1);t.after(f.close);
 f.sql.prepare("UPDATE fiscal_nsdocs_captures SET state='failed' WHERE id=?").run(f.parent.jobs[0].id);
 await assert.rejects(f.repo.sourceKeys(f.parent.jobs.map(j=>j.id),company),fail('NSDOCS_COMPLEMENTO_ORIGEM_INCOMPLETA'));
 assert.throws(()=>core.create(f.parent,[]));
});

test('descoberta recusa empresa/status/segredo e conflito de identidade; nada e capturado',async t=>{
 const f=await fixture(1);t.after(f.close);
 f.deps.request=async()=>({rows:[{...row(1),empresa_cnpj:'11444777000161'}],total:1});
 await assert.rejects(discover({planId:f.plan.id,company},f.deps));assert.equal(f.calls.xml,0);
 f.deps.request=async()=>({rows:[{...row(1),emitente_nome:SECRET}],total:1});await assert.rejects(discover({planId:f.plan.id,company},f.deps));
 const p=f.store.load(f.plan.id);p.windows.forEach((w,i)=>Object.assign(w,{state:'enumerated',raw_count:1,next_offset:null,unsupported:[],documents:[{...f.seededDocs[0],total_cents:f.seededDocs[0].total_cents+i}]}));
 assert.throws(()=>core.freeze(p),fail('NSDOCS_COMPLEMENTO_IDENTIDADE_CONFLITANTE'));
});

test('limites, locks e cooldown protegem chamadas; plano pronto nao lista de novo',async t=>{
 const f=await fixture(1);t.after(f.close);await enumerate(f,[row(1)]);const n=f.calls.list;
 await discover({planId:f.plan.id,company},f.deps);assert.equal(f.calls.list,n);
 await assert.rejects(discover({planId:f.plan.id,company,maxQueries:11},f.deps));await assert.rejects(capture({planId:f.plan.id,company,maxBatches:11},f.deps));
 const locked={...f.deps,locks:{withPlanLock(){throw Error('LOCK_OCUPADO');}}};await assert.rejects(capture({planId:f.plan.id,company},locked),/LOCK_OCUPADO/);
 const second=core.create(f.parent,f.plan.source_keys);f.store.save(second,true);
 const cooldown={...f.deps,secrets:{...f.deps.secrets,checkCooldown(){const e=Error('NSDOCS_AGUARDE_60_SEGUNDOS');e.code=e.message;throw e;}}};
 await assert.rejects(discover({planId:second.id,company},cooldown),fail('NSDOCS_AGUARDE_60_SEGUNDOS'));assert.equal(f.calls.list,n);
});

test('CLI exige IDs e confirmacoes, rejeita chave/endpoint e nao altera ambientes em consulta',async()=>{
 const id=randomUUID(),base=['--empresa-id','2','--cnpj',company.cnpj,'--plano-id',id];
 assert.throws(()=>cli.parse(['--descobrir',...base]));assert.throws(()=>cli.parse(['--capturar',...base,'--confirmar-chamada-real']));
 assert.throws(()=>cli.parse(['--consultar',...base,'--chave',SECRET]));assert.throws(()=>cli.parse(['--consultar',...base,'--endpoint','https://invalid']));
 assert.equal(cli.parse(['--descobrir',...base,'--confirmar-chamada-real','--max-consultas','10']).count,10);
 assert.throws(()=>cli.parse(['--descobrir',...base,'--confirmar-chamada-real','--max-consultas','11']));
 let writes=0,external=0;
 const p=core.create({id:randomUUID(),jobs:['Pendente','Importado'].map(status=>({start:'2026-10-01',end:'2026-10-31',status,state:'completed'})),company_id:2,company_cnpj:company.cnpj,start_date:'2026-10-01',end_date:'2026-10-31',date_field:'data_emissao'},[key(1)]);p.id=id;
 let out;await cli.main(['--consultar',...base],{loadCompany:async()=>company,store:{load:()=>p,save:()=>writes++},confirmWrite:()=>writes++,discover:()=>external++,capture:()=>external++,log:r=>out=r});
 assert.equal(writes,0);assert.equal(external,0);assert.equal(out.external_nsdocs_calls,0);assert.equal(out.application_connector_enabled,false);
});

test('CLI preparar cria somente complemento com ID explicito, sem gravar origem nem usar credencial',async()=>{
 const id=randomUUID(),parent={version:1,id:randomUUID(),company_id:2,company_cnpj:company.cnpj,date_field:'data_emissao',start_date:'2026-10-01',end_date:'2026-10-31',jobs:['Pendente','Importado'].map(status=>({id:randomUUID(),start:'2026-10-01',end:'2026-10-31',status,offset:0,state:'completed'}))};
 const before=JSON.stringify(parent);let confirmation=0,save=0,out;
 await cli.main(['--preparar','--empresa-id','2','--cnpj',company.cnpj,'--origem-id',parent.id,'--plano-id',id],{
  loadCompany:async()=>company,confirmWrite:kind=>{assert.equal(kind,'capture');confirmation++;},locks:{withPlanLock:async fn=>fn()},parentStore:{load:source=>{assert.equal(source,parent.id);return structuredClone(parent);}},
  readDatabase:fn=>fn({}),repository:()=>({preflight:async()=>{},sourceKeys:async()=>[key(1)]}),
  store:{save(p,create){assert.equal(p.id,id);assert.equal(p.source_id,parent.id);assert.equal(create,true);save++;}},log:r=>out=r});
 assert.equal(save,1);assert.equal(confirmation,1);assert.equal(out.external_nsdocs_calls,0);assert.equal(JSON.stringify(parent),before);
});

test('arquivo complementar usa criacao exclusiva, limite8MiB e substituicao atomica',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
 const files=new Map(),fds=new Map(),dirs=new Set(['/home/ubuntu/.config/fluxy-nsdocs-prod']);let fd=0,failRename=false,oversize=false;
 const sandbox={Buffer,module:{exports:{}},require(name){
  if(name==='node:crypto')return require(name);
  if(name==='../policy')return {...require(root+'policy')};
  if(name==='../capture')return {UUID:require(root+'capture').UUID};
  if(name==='../privateStore')return {assertDirectory(){},openPrivate(file,flags){assert(file.includes('/complement-'));if((flags&fs.constants.O_EXCL)&&files.has(file))throw Error('EXISTE');if(!files.has(file)){assert(flags&fs.constants.O_CREAT);files.set(file,'');}fds.set(++fd,file);return fd;}};
  if(name==='node:fs')return {constants:fs.constants,fstatSync:n=>({size:oversize?8*1024*1024+1:Buffer.byteLength(files.get(fds.get(n)))}),readFileSync:n=>files.get(fds.get(n)),closeSync:n=>fds.delete(n),writeFileSync(n,bytes){files.set(fds.get(n),bytes);},fsyncSync(){},renameSync(a,b){if(failRename)throw Error('RENAME_FALHOU');files.set(b,files.get(a));files.delete(a);},openSync(dir){assert(dirs.has(dir));fds.set(++fd,dir);return fd;}};
  throw Error('IMPORT_INDEVIDO');}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/modules/fiscal/services/nsdocsHistorical/manual/complement/store.js'),'utf8'),sandbox);
 const store=sandbox.module.exports,id=randomUUID(),p={id,marker:1};store.save(p,true);
 assert.equal(store.load(id).marker,1);assert.throws(()=>store.save(p,true),/EXISTE/);
 failRename=true;assert.throws(()=>store.save({...p,marker:2}),/RENAME_FALHOU/);assert.equal(store.load(id).marker,1);
 failRename=false;store.save({...p,marker:3});assert.equal(store.load(id).marker,3);
 const ready={id:randomUUID(),manifest_hash:'a'.repeat(64),documents:[{fixture:'METADADOS_IMUTAVEIS'}],windows:[],batches:[{id:randomUUID(),start:0,count:1,state:'pending',result:null}]};
 store.save(ready,true);const manifestName=[...files.keys()].find(p=>p.includes(ready.id)&&p.endsWith('.manifest.json'));
 const original=files.get(manifestName),beforeCount=[...files.keys()].filter(p=>p.endsWith('.manifest.json')).length;
 ready.batches[0].state='completed';ready.batches[0].result={xml_downloads:0,reused_xmls:1,resumed_documents:0};store.save(ready);
 assert.equal(store.load(ready.id).batches[0].result.reused_xmls,1);assert.equal(files.get(manifestName),original);
 assert.equal([...files.keys()].filter(p=>p.endsWith('.manifest.json')).length,beforeCount);
 const checkpoint=JSON.parse(files.get('/home/ubuntu/.config/fluxy-nsdocs-prod/complement-'+ready.id+'.json'));
 assert(!JSON.stringify(checkpoint).includes('METADADOS_IMUTAVEIS'));
 files.set(manifestName,original.replace('METADADOS_IMUTAVEIS','ADULTERADO'));assert.throws(()=>store.load(ready.id));
 oversize=true;assert.throws(()=>store.load(id));assert.throws(()=>store.load('../credentials'));
});
