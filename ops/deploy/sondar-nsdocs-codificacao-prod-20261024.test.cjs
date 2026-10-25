'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {gzipSync}=require('node:zlib'),{metadata,request,main}=require('./sondar-nsdocs-codificacao-prod-20261024.cjs');
test('metadados classificam JSON semheader e gzip sem exibir documento/chave/corpo ou header livre',()=>{
 const secret='FICTICIO_APENAS_QA',body=Buffer.from(JSON.stringify([{chave:secret,cnpj:'DADO_FICTICIO'}]));
 const plain=metadata(body,{'content-type':'application/json','x-total-registros':'1'},200);
 assert.equal(plain.content_encoding,'absent');assert.equal(plain.body_format,'json_array');assert.equal(plain.json_array_length,1);
 const gzip=metadata(gzipSync(body),{},200);assert.equal(gzip.gzip_signature,true);assert.equal(gzip.json_array_length,1);
 assert(!JSON.stringify(plain).includes(secret));assert(!JSON.stringify(plain).includes('DADO_FICTICIO'));
 const bad=metadata(body,{'content-encoding':secret,'content-type':secret,'x-total-registros':secret},200);
 assert(!JSON.stringify(bad).includes(secret));assert.equal(bad.content_encoding,'other');
});
test('sem confirmacao nao abre runtime, banco, arquivo ou chamada externa',async()=>{
 await assert.rejects(main([], {runtime:{loadProdCompany:()=>{throw Error('NAO_DEVE_CHAMAR');}}}),/CONFIRMACAO/);
});
test('um GET fixo com TLS; nunca XML/redirect e nenhum dado fiscal no resultado',async()=>{
 let calls=0;
 const client={request(url,options,callback){calls++;assert.equal(url.pathname,'/v2/documentos');
  assert.equal(options.method,'GET');assert.equal(options.rejectUnauthorized,true);
  const req=new EventEmitter();req.destroy=()=>{};req.end=()=>queueMicrotask(()=>{
   const res=new EventEmitter();res.statusCode=200;res.headers={'content-type':'application/json','x-total-registros':'0'};res.destroy=()=>{};
   callback(res);res.emit('data',Buffer.from('[]'));res.emit('end');});return req;}};
 const r=await request({url:'https://api.nsdocs.com.br/v2/documentos?status=Importado',companyCnpj:'11222333000181'},'FICTICIO',client);
 assert.equal(calls,1);assert.equal(r.body_format,'json_array');assert.equal(r.json_array_length,0);
 assert.throws(()=>request({url:'https://api.nsdocs.com.br/v2/documentos/123/xml'},'FICTICIO',client));
 assert.equal(calls,1);
});
