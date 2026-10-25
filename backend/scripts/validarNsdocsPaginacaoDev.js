'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{gzipSync}=require('node:zlib');
const {normalizePage,decodeListBody}=require('../src/modules/fiscal/services/nsdocs/normalize');
const {decodeXml}=require('../src/modules/fiscal/services/nsdocs/manual/transport');
const {normalizeResponse}=require('../src/modules/fiscal/services/nsdocs/manual/query');
const company={id:2,cnpj:'11222333000181'};
test('DEV aceita JSON/XML sem encoding e gzip legado; declarado corrompido continua recusado',()=>{
 assert.deepEqual(decodeListBody(Buffer.from('[]')),[]);assert.deepEqual(decodeListBody(gzipSync(Buffer.from('[]'))),[]);
 assert.equal(decodeXml(Buffer.from('<xml/>')).toString(),'<xml/>');assert.equal(decodeXml(gzipSync(Buffer.from('<xml/>'))).toString(),'<xml/>');
 assert.throws(()=>decodeListBody(Buffer.from('[]'),'gzip'));assert.throws(()=>decodeXml(Buffer.from('<xml/>'),'gzip'));
});
test('DEV nao encerra pagina cheia por header5 nem prossegue offsets como prova de cobertura',()=>{
 const rows=Array.from({length:5},(_,i)=>({id:'FICTICIO'+i,empresa_cnpj:company.cnpj,modelo:'CT-e'}));
 const request={companyCnpj:company.cnpj,offset:0,limit:5};
 const first=normalizePage(rows,request,5,{countMode:'page'});assert.equal(first.window_complete,false);
 const manual=normalizeResponse({rows,total:5},request,company);assert.equal(manual.partition_required,true);assert.equal(manual.next_offset,null);
 assert.equal(normalizePage([],{...request,offset:5},0,{countMode:'page'}).window_complete,true);
});
