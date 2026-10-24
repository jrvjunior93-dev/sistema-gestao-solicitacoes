'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {fixture}=require('./fixtures/fiscalPagamentoFixture.cjs');
const {query}=require('../src/services/fiscalPagamentoDocumentosService');
test('NF-e em varios pedidos/solicitacoes aparece uma vez por arquivo e exige vinculo ativo',async()=>{
  const f=await fixture();try{
    const before=f.snapshot();f.sql.exec('PRAGMA query_only=ON');
    for(const item_id of[100,101,102]){
      const r=await f.service.owner(f.req,{item_id});assert.equal(r.consulta_atual,true);
      assert.deepEqual(r.data.map(a=>a.tipo),['pdf','xml']);assert.equal(r.data[0].documento_id,1);
      assert(!JSON.stringify(r).includes('storage_key'));assert(!JSON.stringify(r).includes('imutavel.xml'));
    }
    assert.equal(f.signed.length,0);assert.equal(f.snapshot(),before);
  }finally{f.close();}
});
test('URL sob demanda revalida vinculo/tipo/contexto e expira em180s; XML e attachment',async()=>{
  const f=await fixture();try{
    const before=f.snapshot(),q={item_id:100,documento_id:1,tipo:'xml'};
    const file=await f.service.owner(f.req,q);assert(file.url.startsWith('https://storage.qa/'));
    assert.equal(f.signed.length,1);assert.equal(f.signed[0][1],180);assert.equal(f.signed[0][2].attachment,true);
    assert.equal(f.signed[0][2].contentType,'application/octet-stream');assert.equal(f.events[0].metadata.item_id,100);
    assert.equal(f.snapshot(),before);
    await assert.rejects(f.service.owner(f.req,{...q,documento_id:999}),e=>e.statusCode===404);
    f.sql.exec("UPDATE fiscal_document_links SET link_status='rejected'");
    await assert.rejects(f.service.owner(f.req,q),e=>e.statusCode===404);assert.equal(f.signed.length,1);
  }finally{f.close();}
});
test('permissoes nominais/fila, obras, exclusao e titulos compartilhados permanecem restritos',async()=>{
  const f=await fixture();try{
    f.state.owner=false;await assert.rejects(f.service.owner(f.req,{item_id:100}),e=>e.statusCode===403);
    f.state.owner=true;f.state.works=[10];
    assert.equal((await f.service.owner(f.req,{item_id:100})).data.length,2);
    await assert.rejects(f.service.owner(f.req,{item_id:102}),e=>e.statusCode===403);
    await assert.rejects(f.service.owner(f.req,{item_id:201}),e=>e.statusCode===403);
    await assert.rejects(f.service.owner(f.req,{item_id:200}),e=>e.statusCode===403);
    f.state.works=null;await assert.rejects(f.service.owner(f.req,{item_id:202}),e=>e.statusCode===403);
    f.state.queue=false;await assert.rejects(f.service.queue(f.req,100),e=>e.statusCode===403);
    assert.equal(f.signed.length,0);
  }finally{f.close();}
});
test('fila da solicitacao inclui apenas NF-e do recorte; compartilhado, renegociacao e baixa parcial preservados',async()=>{
  const f=await fixture();try{
    const before=f.snapshot();f.sql.exec('PRAGMA query_only=ON');
    const one=await f.service.queue(f.req,100),two=await f.service.queue(f.req,200);
    assert.equal(one.data.length,2);assert.equal(two.data.length,2);
    assert.deepEqual(one.data[0].pedido_ids,[10]);assert.deepEqual(two.data[0].pedido_ids,[12]);
    assert.equal((await f.service.owner(f.req,{item_id:200})).data.length,2);
    assert.deepEqual((await f.service.owner(f.req,{item_id:201})).data[0].pedido_ids,[10,12]);
    assert.equal((await f.service.owner(f.req,{item_id:203})).data.length,0);
    assert.equal((await f.service.owner(f.req,{fila_id:400})).data.length,2);
    await assert.rejects(f.service.queue(f.req,999),e=>e.statusCode===403);
    assert.equal(f.snapshot(),before);
  }finally{f.close();}
});
test('empresa/CNPJ divergente e vinculo apenas sugerido nao liberam arquivo',async()=>{
  const f=await fixture();try{
    f.sql.exec("UPDATE fiscal_dfe_documents SET recipient_cnpj='00000000000000'");
    assert.equal((await f.service.owner(f.req,{item_id:100})).data.length,0);
    f.sql.exec("UPDATE fiscal_dfe_documents SET recipient_cnpj='11222333000181';UPDATE fiscal_document_links SET link_status='suggested'");
    assert.equal((await f.service.owner(f.req,{item_id:100})).data.length,0);
    assert.equal(f.signed.length,0);
  }finally{f.close();}
});
test('consultas recusam URL livre, ID invalido, ambos contextos e tipo desconhecido',()=>{
  for(const raw of[{},{item_id:1,fila_id:2},{item_id:[]},{item_id:{}},{item_id:'1 OR 1=1'},{item_id:0},{item_id:1,url:'https://malicioso'},
    {item_id:1,documento_id:1,tipo:'html'},{item_id:1,tipo:'pdf'},{item_id:1,documento_id:1}])assert.throws(()=>query(raw,true),e=>e.statusCode===400);
});
test('XML sozinho permanece disponivel; DANFE ausente e resposta/contexto sem cache',async()=>{
  const f=await fixture();try{
    f.sql.exec('UPDATE fiscal_dfe_documents SET danfe_storage_key=NULL,pdf_storage_key=NULL');
    const c=require('../src/controllers/FiscalPagamentoDocumentosController').createController(f.service);
    const res=()=>({headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}});
    const one=res();await c.owner({user:f.req.user,query:{item_id:100}},one);
    assert.equal(one.headers['Cache-Control'],'private, no-store');assert.deepEqual(one.body.data.map(f=>f.tipo),['xml']);
    const missing=res();await c.owner({user:f.req.user,query:{item_id:100,documento_id:1,tipo:'pdf'}},missing);assert.equal(missing.statusCode,404);
    const denied=res();f.state.owner=false;await c.owner({user:f.req.user,query:{item_id:100}},denied);assert.equal(denied.statusCode,403);
    assert.equal(denied.headers['Cache-Control'],'private, no-store');assert.equal(f.signed.length,0);
  }finally{f.close();}
});
test('assinatura S3 usa apenas chave fiscal configurada e headers seguros sem mudar consumidores antigos',async()=>{
  const commands=[],signs=[];let exported={exports:{}};
  const source=fs.readFileSync(path.join(__dirname,'../src/modules/fiscal/services/fiscalS3Service.js'),'utf8');
  vm.runInNewContext(source,{module:exported,exports:exported.exports,Buffer,process:{env:{FISCAL_S3_BUCKET:'fiscal-qa',FISCAL_S3_REGION:'us-east-2'}},require:name=>{
    if(name==='@aws-sdk/client-s3')return{S3Client:class{},GetObjectCommand:class{constructor(input){this.input=input;commands.push(input);}}};
    if(name==='@aws-sdk/s3-request-presigner')return{getSignedUrl:async(_client,cmd,options)=>{signs.push(options);return'https://storage.qa/'+cmd.input.Key;}};
    if(name==='../../../utils/fileName')return require('../src/utils/fileName');return require(name);
  }});
  await exported.exports.getFiscalObjectSignedUrl('dev/nota.xml',180,{filename:'NF-e101.xml',attachment:true,contentType:'application/octet-stream'});
  assert.equal(commands[0].Bucket,'fiscal-qa');assert.match(commands[0].ResponseContentDisposition,/^attachment;/);
  assert.equal(signs[0].expiresIn,180);
  await exported.exports.getFiscalObjectSignedUrl('dev/danfe.pdf',180);assert.equal(commands[1].ResponseContentDisposition,undefined);
});
