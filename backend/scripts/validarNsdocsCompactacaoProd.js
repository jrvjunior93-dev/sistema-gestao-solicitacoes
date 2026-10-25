'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {gzipSync,deflateSync}=require('node:zlib'),{EventEmitter}=require('node:events');
// Transportes ficticios. Nenhuma chave/consulta/rede real neste QA.
const {decodeListBody,MAX_BODY_BYTES}=require('../src/modules/fiscal/services/nsdocsHistorical/normalize');
const {decodeXml,requestDocuments}=require('../src/modules/fiscal/services/nsdocsHistorical/manual/transport');
const {MAX_XML_BYTES}=require('../src/modules/fiscal/services/nsdocsHistorical/manual/xml');
const secret='CHAVE_FICTICIA_NAO_REAL';
const input={method:'GET',url:'https://api.nsdocs.com.br/v2/documentos?status=Importado',companyCnpj:'11222333000181'};
test('lista vazia e preenchida sem encoding sao JSON UTF8; gzip sem header continua aceito',()=>{
 for(const rows of [[],[{id:'FICTICIO',status:'Importado'}]]){
  const raw=Buffer.from(JSON.stringify(rows));
  for(const e of [undefined,null,''])assert.deepEqual(decodeListBody(raw,e),rows);
  assert.deepEqual(decodeListBody(gzipSync(raw),undefined),rows);
  for(const [data,encoding] of [[gzipSync(raw),'gzip'],[deflateSync(raw),'deflate'],[raw,'identity']])assert.deepEqual(decodeListBody(data,encoding),rows);
 }
});
test('header explicito, gzip truncado/CRC invalido, JSON invalido/HTML/UTF8 e codecs inesperados falham fechados',()=>{
 const raw=Buffer.from('[]'),good=gzipSync(raw),bad=Buffer.from(good);bad[bad.length-8]^=1;
 for(const [data,e] of [[raw,'gzip'],[good.subarray(0,good.length-2),undefined],[bad,undefined],
  [Buffer.from('['),undefined],[Buffer.from('<html>erro</html>'),undefined],[Buffer.from([0xff]),undefined],
  [raw,'br'],[raw,'gzip, deflate'],[Buffer.from('{}'),undefined]])assert.throws(()=>decodeListBody(data,e));
});
test('limites de corpo e descompressao permanecem para JSON/XML em todos os formatos',()=>{
 const big=Buffer.alloc(MAX_BODY_BYTES+1,32),hugeXml=Buffer.alloc(MAX_XML_BYTES+1,32);
 for(const [data,e] of [[big,undefined],[gzipSync(big),'gzip'],[deflateSync(big),'deflate']])assert.throws(()=>decodeListBody(data,e));
 for(const [data,e] of [[hugeXml,undefined],[hugeXml,'identity'],[gzipSync(hugeXml),undefined]])assert.throws(()=>decodeXml(data,e));
});
test('XML sem header e gzip legado mantem bytes; encoding falso e gzip corrompido nao viram XML',()=>{
 const raw=Buffer.from('<?xml version="1.0"?><NFe>ficticio</NFe>');
 for(const [data,e] of [[raw,undefined],[raw,'identity'],[gzipSync(raw),undefined],[gzipSync(raw),'gzip'],[deflateSync(raw),'deflate']])assert.deepEqual(decodeXml(data,e),raw);
 assert.throws(()=>decodeXml(raw,'gzip'));assert.throws(()=>decodeXml(gzipSync(raw).subarray(0,12),undefined));
});
function client(body,extra={}){return {request(url,options,callback){
 assert.equal(url.origin,'https://api.nsdocs.com.br');assert.equal(options.rejectUnauthorized,true);
 assert.equal(options.headers.Authorization,'Bearer '+secret);assert(!url.href.includes(secret));
 const req=new EventEmitter();req.destroy=()=>{};req.end=()=>queueMicrotask(()=>{
  const res=new EventEmitter();res.statusCode=200;res.headers={'content-type':'application/json','x-total-registros':'0',...extra};res.destroy=()=>{};
  callback(res);res.emit('data',body);res.emit('end');
 });return req;
}};}
test('HTTP Importado vazio sem header retorna pagina vazia real, nao erro de gzip; TLS/headers mantidos',async()=>{
 const r=await requestDocuments(input,secret,client(Buffer.from('[]')));
 assert.deepEqual(r,{rows:[],total:0});
});
test('HTTP corrompido, JSON que nao e lista ou corpo que reflete chave nao produz pagina valida',async()=>{
 for(const [body,headers] of [[Buffer.from('[]'),{'content-encoding':'gzip'}],[Buffer.from('{}'),{}],
  [Buffer.from(JSON.stringify([{ref:secret}])),{}]]){
  await assert.rejects(requestDocuments(input,secret,client(body,headers)),e=>/^NSDOCS_/.test(e.code)&&!e.message.includes(secret));
 }
});
