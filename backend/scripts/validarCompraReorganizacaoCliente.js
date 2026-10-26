'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {main}=require('./compraReorganizacaoHttp');
function fixture(){const dir=path.resolve(__dirname,'../../outputs/qa-reorg-client-'+crypto.randomUUID());fs.mkdirSync(dir,{recursive:true});const token=path.join(dir,'sessao.jwt');fs.writeFileSync(token,'qa-token.qa-body.qa-signature',{mode:0o600});return{dir,token,args:(action,out)=>['--acao',action,'--api','http://127.0.0.1:8001/api','--token-arquivo',token,'--saida',path.join(dir,out)]};}
test('cliente envia plano exato revisado, fatia 25 SCs em10/10/5 e nao exibe token',async()=>{
 const f=fixture(),file=path.join(f.dir,'plano.json'),p={versao:1,tipo:'APLICAR',usuario_id:1,hash:'qa',sc:Array.from({length:25},(_,i)=>({sc_id:i+1}))};fs.writeFileSync(file,JSON.stringify({plano:p}));const calls=[];
 const r=await main([...f.args('aplicar','out.json'),'--plano',file,'--lote','ee98a900-5055-4f03-bd09-6443003a88cd','--todas','--confirmar-gravacao'],{fetchImpl:async(url,options)=>{const b=JSON.parse(options.body);calls.push(b);assert.equal(options.redirect,'error');return{ok:true,json:async()=>({resultados:b.sc_ids.map(sc_id=>({sc_id,status:'APLICADA'}))})};}});
 assert.deepEqual(calls.map(c=>c.sc_ids.length),[10,10,5]);assert(calls.every(c=>JSON.stringify(c.plano)===JSON.stringify(p)));assert.equal(r.resultados.length,25);assert(!fs.readFileSync(path.join(f.dir,'out.json'),'utf8').includes('qa-signature'));
});
test('sem confirmacao, sem selecao ou destino existente: nenhuma requisicao',async()=>{
 const f=fixture(),p=path.join(f.dir,'plano.json');fs.writeFileSync(p,JSON.stringify({tipo:'APLICAR',sc:[{sc_id:1}]}));let calls=0;const deps={fetchImpl:async()=>{calls++;throw Error('Nao deveria chamar');}};
 const common=[...f.args('aplicar','out.json'),'--plano',p,'--lote','ee98a900-5055-4f03-bd09-6443003a88cd'];
 await assert.rejects(main([...common,'--sc','1'],deps),/CONFIRMACAO/);await assert.rejects(main([...common,'--confirmar-gravacao'],deps),/SELECAO/);
 fs.writeFileSync(path.join(f.dir,'out.json'),'preservar');await assert.rejects(main([...common,'--confirmar-gravacao','--sc','1'],deps));assert.equal(calls,0);assert.equal(fs.readFileSync(path.join(f.dir,'out.json'),'utf8'),'preservar');
});
test('dominio externo e redirect nao podem receber a sessao',async()=>{
 const f=fixture();let calls=0;await assert.rejects(main([...f.args('consultar','out.json'),'--api','https://outro.invalid/api','--lote','ee98a900-5055-4f03-bd09-6443003a88cd'],{fetchImpl:async()=>{calls++;}}));assert.equal(calls,0);
});
