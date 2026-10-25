'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
for(const [name,methods] of [['node:http',['get','request']],['node:https',['get','request']],['node:net',['connect','createConnection']],['node:tls',['connect']]])
 for(const method of methods)require(name)[method]=()=>{throw Error('REDE_REAL_PROIBIDA');};
global.fetch=()=>{throw Error('REDE_REAL_PROIBIDA');};
const {fixture,row,xml,company,SECRET}=require('./helpers/nsdocsComplementFixture.cjs');
const root='../src/modules/fiscal/services/nsdocsHistorical/';
const {cpf,buildListRequest}=require(root+'contract'),{normalizeResponse}=require(root+'manual/query');
const {validateNfeXml}=require(root+'manual/xml'),{discover}=require(root+'manual/complement/discovery'),{capture}=require(root+'manual/complement/capture');
const CPFS=['52998224725','01234567890']; // Exemplos ficticios de QA, sem pessoas reais.
function keyCpf(number,issuer=CPFS[0]){
 const body='322610'+issuer.padStart(14,'0')+'55'+'920'+String(number).padStart(9,'0')+'1'+'00000001';
 let sum=0,weight=2;for(let i=42;i>=0;i--){sum+=Number(body[i])*weight;weight=weight===9?2:weight+1;}
 return body+(sum%11<2?0:11-sum%11);
}
function rowCpf(number,issuer=CPFS[0]){return {...row(number),emitente_cnpj:issuer,chave_acesso:keyCpf(number,issuer)};}
const request=buildListRequest({companyCnpj:company.cnpj,status:'Pendente',startDate:'2026-10-01',endDate:'2026-10-31',dateField:'data_emissao',limit:100,offset:0},company.cnpj);
const page=rows=>normalizeResponse({rows,total:rows.length},request,company);
const docCpf=()=>page([rowCpf(47)]).documents[0];
function xmlCpf(doc){return Buffer.from(xml(doc).toString().replace(`<emit><CNPJ>${doc.issuer_cnpj}</CNPJ></emit>`,`<emit><CPF>${doc.issuer_cnpj}</CPF></emit>`));}
function withXml(doc,change){return Buffer.from(change(xmlCpf(doc).toString()));}
function recomputeKey(body){let sum=0,weight=2;for(let i=42;i>=0;i--){sum+=Number(body[i])*weight;weight=weight===9?2:weight+1;}return body+(sum%11<2?0:11-sum%11);}
test('CPF informado e validado como11digitos, zeros iniciais preservados e tipo explicito',()=>{
 for(const number of CPFS){assert.equal(cpf(number),number);const p=page([rowCpf(47,number)]),doc=p.documents[0];
  assert.equal(doc.issuer_cnpj,number);assert.equal(doc.issuer_cnpj.length,11);assert.equal(doc.issuer_document_type,'CPF');
  assert.equal(doc.company_cnpj,company.cnpj);assert.equal(doc.recipient_cnpj,company.cnpj);}
});
test('mascara de CPF normaliza sem alterar payload; CNPJ antigo nao recebe campos novos',()=>{
 const raw={...rowCpf(47),emitente_cnpj:'529.982.247-25'},before=JSON.stringify(raw);
 assert.deepEqual(page([raw]).documents[0],docCpf());assert.equal(JSON.stringify(raw),before);
 const old=page([row(1)]).documents[0];assert.equal(old.issuer_document_type,undefined);assert.equal(old.issuer_cnpj,row(1).emitente_cnpj);
 assert.equal(old.issuer_cnpj.length,14);
});
test('CPF invalido, repetido, numero, vazio ou com caracteres extras continua recusado',()=>{
 for(const value of ['52998224724','00000000000','11111111111',52998224725,'',' 52998224725','529.982.247/25',null,undefined])
  assert.throws(()=>page([{...rowCpf(47),emitente_cnpj:value}]));
});
test('empresa e destinatario continuam CNPJ; CPF de emitente nao autoriza documento de outra empresa',()=>{
 for(const patch of [{empresa_cnpj:CPFS[0]},{destinatario_cnpj:CPFS[0]},
  {empresa_cnpj:'11444777000161'},{destinatario_cnpj:'11444777000161'},{emitente_cnpj:'11444777000162'}])
  assert.throws(()=>page([{...rowCpf(47),...patch}]));
});
test('identidade, datas, valores, chave e duplicidade continuam obrigatorios',()=>{
 for(const patch of [{chave_acesso:''},{data_emissao:'32/10/2026'},{data_emissao:'01/01/2026'},
  {valor:'1.00'},{status:'Importado'},{emitente_nome:''}])assert.throws(()=>page([{...rowCpf(47),...patch}]));
 assert.equal(page([rowCpf(47),rowCpf(47)]).duplicates,1);
 assert.throws(()=>page([rowCpf(47),{...rowCpf(47),emitente_cnpj:CPFS[1]}]),e=>e.code==='NSDOCS_DUPLICIDADE_CONFLITANTE');
});
test('pagina cheia comCPF continua exigindo subdivisao, sem descartar a nota',()=>{
 const rows=Array.from({length:100},(_,i)=>i===39?rowCpf(i+1):row(i+1)),p=page(rows);
 assert.equal(p.documents.length,100);assert.equal(p.documents.filter(d=>d.issuer_document_type==='CPF').length,1);
 assert.equal(p.window_complete,false);assert.equal(p.partition_required,true);assert.equal(p.next_offset,null);
});
test('XML emitCPF concordante e chave com zeros a esquerda sao aceitos, sem validar assinatura',()=>{
 for(const number of CPFS){const doc=page([rowCpf(47,number)]).documents[0],body=xmlCpf(doc),checked=validateNfeXml(body,doc,SECRET);
  assert.equal(doc.access_key.slice(6,20),number.padStart(14,'0'));assert.equal(checked.validation,'identity_checked_signature_unverified');
  assert.equal(body.toString().match(/<CPF>(.*?)<\/CPF>/)[1],number);}
 const old=page([row(1)]).documents[0];assert(validateNfeXml(xml(old),old,SECRET).hash);
});
test('CPF metadata/XML/tipo divergentes e tag CNPJ paraCPF sao negados',()=>{
 const doc=docCpf();assert.throws(()=>validateNfeXml(xml(doc),doc,SECRET));
 assert.throws(()=>validateNfeXml(xmlCpf(doc),{...doc,issuer_document_type:undefined},SECRET));
 assert.throws(()=>validateNfeXml(xmlCpf(doc),{...doc,issuer_document_type:'CNPJ'},SECRET));
 assert.throws(()=>validateNfeXml(xmlCpf(doc),{...doc,issuer_cnpj:CPFS[1]},SECRET));
 assert.throws(()=>validateNfeXml(withXml(doc,s=>s.replace(`<CPF>${CPFS[0]}</CPF>`,`<CPF>${CPFS[1]}</CPF>`)),doc,SECRET));
 assert.throws(()=>validateNfeXml(xmlCpf(doc),{...doc,issuer_cnpj:CPFS[0].padStart(14,'0')},SECRET));
});
test('XML com ambas identidades, CPF duplicado ou namespaces falsos e recusado',()=>{
 const doc=docCpf();
 for(const replacement of [`<CPF>${CPFS[0]}</CPF><CNPJ>${row(1).emitente_cnpj}</CNPJ>`,
  `<CPF>${CPFS[0]}</CPF><CPF>${CPFS[0]}</CPF>`,
  `<CPF xmlns="urn:falso">${CPFS[0]}</CPF>`])
  assert.throws(()=>validateNfeXml(withXml(doc,s=>s.replace(`<CPF>${CPFS[0]}</CPF>`,replacement)),doc,SECRET));
 const cnpj=page([row(1)]).documents[0];
 assert.throws(()=>validateNfeXml(Buffer.from(xml(cnpj).toString().replace('</emit>',`<CPF>${CPFS[0]}</CPF></emit>`)),cnpj,SECRET));
});
test('empresa destinataria, valores, datas, numero, modelo, chave e protocolo permanecem conferidos',()=>{
 const doc=docCpf();
 for(const patch of [{company_cnpj:CPFS[0]},{recipient_cnpj:CPFS[0]},
  {recipient_cnpj:'11444777000161'},{total_cents:1},{issued_on:'2026-10-01'},{number:'99999'}])
  assert.throws(()=>validateNfeXml(xmlCpf(doc),{...doc,...patch},SECRET));
 for(const change of [s=>s.replace('<mod>55</mod>','<mod>65</mod>'),s=>s.replace('<vNF>1234.56</vNF>','<vNF>1.00</vNF>'),
  s=>s.replace('</dest>',`<CPF>${CPFS[0]}</CPF></dest>`),s=>s.replace('<!not_here>','')+'<extra/>',
  s=>s.replace(/<chNFe>\d+<\/chNFe>/,'<chNFe>'+'1'.repeat(44)+'</chNFe>')])
  assert.throws(()=>validateNfeXml(withXml(doc,change),doc,SECRET));
});
test('chave deCPF comDV recomposto mas emitente incorreto continua rejeitada',()=>{
 const doc=docCpf(),wrong=recomputeKey('322610'+CPFS[1].padStart(14,'0')+doc.access_key.slice(20,43));
 const changed={...doc,access_key:wrong};assert.throws(()=>validateNfeXml(xmlCpf(changed),changed,SECRET));
 const bad={...doc,access_key:doc.access_key.slice(0,43)+(Number(doc.access_key[43])+1)%10};
 assert.throws(()=>validateNfeXml(xmlCpf(bad),bad,SECRET));
});
test('XXE, DOCTYPE e segredo refletido continuam proibidos comCPF',()=>{
 const doc=docCpf();for(const body of [Buffer.from('<!DOCTYPE NFe>'+xmlCpf(doc).toString()),
  withXml(doc,s=>s.replace('</emit>',`<xNome>${SECRET}</xNome></emit>`))])assert.throws(()=>validateNfeXml(body,doc,SECRET));
});
test('parser fiscal existente usado nos detalhes/DANFE preservaCPF e o XML original',()=>{
 const {parseNfeXml}=require('../src/modules/fiscal/services/fiscalXmlParserService');
 for(const number of CPFS){const doc=page([rowCpf(47,number)]).documents[0],body=xmlCpf(doc),before=Buffer.from(body);
  const parsed=parseNfeXml(body.toString());assert.equal(parsed.issuer_cnpj,number);assert.equal(parsed.recipient_cnpj,company.cnpj);
  assert.equal(parsed.access_key,doc.access_key);assert.deepEqual(body,before);}
});
test('46notas/XMLs/historico intactos; novasCPF persistem tipadas; replay nao duplica',async t=>{
 const f=await fixture(46);t.after(f.close);
 const before=f.sql.prepare('SELECT * FROM fiscal_dfe_documents ORDER BY id').all(),events=f.sql.prepare('SELECT * FROM fiscal_dfe_events ORDER BY id').all();
 const objects=new Map([...f.objects].map(([k,v])=>[k,v.toString('base64')])),parent=JSON.stringify(f.parent);
 const rows=Array.from({length:60},(_,i)=>i===46||i===47?rowCpf(i+1,CPFS[i-46]):row(i+1));
 f.deps.request=async r=>{f.calls.list++;const filtered=rows.filter(x=>x.status===r.status);return {rows:structuredClone(filtered),total:filtered.length};};
 f.deps.xml=async doc=>{f.calls.xml++;return doc.issuer_document_type==='CPF'?xmlCpf(doc):xml(doc);};
 const s=await discover({planId:f.plan.id,company,maxQueries:10},f.deps);assert(s.enumeration_complete);assert.equal(s.source_documents_missing,0);assert.equal(s.documents_discovered,60);
 await capture({planId:f.plan.id,company,maxBatches:10},f.deps);const end=await capture({planId:f.plan.id,company,maxBatches:10},f.deps);
 assert(end.complete);assert.equal(end.reused_xmls,46);assert.equal(end.xml_downloads,14);
 assert.deepEqual(f.sql.prepare('SELECT * FROM fiscal_dfe_documents WHERE id<=46 ORDER BY id').all(),before);
 assert.deepEqual(f.sql.prepare('SELECT * FROM fiscal_dfe_events WHERE id<=? ORDER BY id').all(events.length),events);
 const saved=f.sql.prepare('SELECT issuer_cnpj,raw_summary_json FROM fiscal_dfe_documents WHERE issuer_cnpj IN (?,?) ORDER BY issuer_cnpj').all(...CPFS);
 assert.equal(saved.length,2);for(const d of saved){assert.equal(d.issuer_cnpj.length,11);assert.equal(JSON.parse(d.raw_summary_json).issuer_document_type,'CPF');}
 for(const [key,bytes] of objects)assert.equal(f.objects.get(key).toString('base64'),bytes);assert.equal(JSON.stringify(f.parent),parent);
 const replay=await capture({planId:f.plan.id,company,maxBatches:10},f.deps);assert.equal(replay.executed_batches,0);assert.equal(f.calls.xml,14);assert.equal(f.calls.put,14);
});
