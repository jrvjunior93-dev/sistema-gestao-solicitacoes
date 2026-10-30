'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {identidadeEnvio,lerReplay}=require('../src/services/cotacoesIndependentes');
const {validateCompraEnviarBody,validateCompraEncerrarBody}=require('../src/validators/operationalValidators');
const source=fs.readFileSync(__dirname+'/../src/controllers/SolicitacaoCompraController.js','utf8');
const method=source.slice(source.indexOf('  async enviarParaFornecedores('),source.indexOf('  async recusar(',source.indexOf('  async enviarParaFornecedores('))).trim().replace(/,\s*$/,'');
function fixture(){
 const db={links:[{id:327,token:'LEGADO',fornecedor_compra_id:11}],itens:[{solicitacao_compra_fornecedor_id:327,item_referencia_id:3514}],logs:[],respostas:[{id:2113}],pedidos:[{id:314}]};
 let locked=false,n=400,fail=false,tail=Promise.resolve();
 function transaction(){
   const anterior=tail;let liberar;tail=new Promise(r=>{liberar=r;});let saved;
   return {LOCK:{UPDATE:'UPDATE'},acquire:async()=>{await anterior;saved=structuredClone(db);locked=true;},
     commit:async()=>{locked=false;liberar();},rollback:async()=>{if(saved)Object.assign(db,structuredClone(saved));locked=false;liberar();}};
 }
 const ctx={...require('../src/services/cotacoesIndependentes'),validateCompraEnviarBody,console:{error:()=>{}},
 SolicitacaoCompra:{sequelize:{transaction:async()=>transaction()},findByPk:async(id,o)=>{assert.equal(o.lock,'UPDATE');await o.transaction.acquire();return{id:724,status:'LIBERADO'};}},
 validarAcesso:async()=>({id:15}),validarAcessoCompras:async()=>true,isSolicitacaoCompraDireta:()=>false,isSolicitacaoCompraTerminal:()=>false,isCompraAguardandoDiretoria:()=>false,podeAcompanharCompraAntesLiberacao:async()=>true,validarEscopoSolicitacaoCompra:async()=>true,
 SolicitacaoCompraLog:{findOne:async({where})=>db.logs.find(l=>l.descricao===where.descricao)},
 carregarSolicitacaoCompraCompleta:async()=>({}),obterItensCotaveis:()=>[{id:3512}],
 FornecedorCompra:{findByPk:async()=>({id:11,nome:'Mercado Pago'})},
 normalizarItensSelecionadosCotacaoSeguro:async({itensPayload})=>itensPayload,
 selecionarPayloadItensCotacao:e=>e.itens,
 SolicitacaoCompraFornecedor:{create:async(data)=>{assert(locked);const row={id:++n,...data};db.links.push(row);return row;}},
 SolicitacaoCompraFornecedorItem:{bulkCreate:async rows=>{if(fail)throw Error('FALHA');db.itens.push(...rows);}},
 gerarTokenCotacao:()=>require('node:crypto').randomUUID(),montarUrlCotacaoPublica:(req,t)=>'/cotacao/'+t,
 registrarLogSolicitacaoCompra:async args=>db.logs.push({descricao:args.descricao,metadados:JSON.stringify(args.metadados)})};
 const methodFn=vm.runInNewContext('({'+method+'})',ctx).enviarParaFornecedores;
 return{db,fail:()=>{fail=true;},send:async(key,item=3512)=>{let status=200,body;const res={status:v=>{status=v;return res;},json:v=>{body=v;return res;}};await methodFn({params:{id:724},body:{chave_envio:key,fornecedores:[{fornecedor_id:11,itens:[{item_tipo:'MANUAL',item_referencia_id:item,solicitacao_compra_item_manual_id:item}]}]}},res);return{status,body};}};
}
test('controller real cria dois links do mesmo fornecedor sem tocar legado/pedidos/respostas',async()=>{const f=fixture();const old=JSON.stringify([f.db.links[0],f.db.itens[0],f.db.respostas,f.db.pedidos]);const a=await f.send('envio_independente_0001'),b=await f.send('envio_independente_0002',3514);assert.equal(a.status,201);assert.equal(b.status,201);assert.notEqual(a.body.fornecedores[0].token,b.body.fornecedores[0].token);assert.equal(f.db.links.length,3);assert.equal(JSON.stringify([f.db.links[0],f.db.itens[0],f.db.respostas,f.db.pedidos]),old);});
test('retry e resposta perdida reutilizam link; mesma chave com outro item retorna409',async()=>{const f=fixture(),a=await f.send('envio_independente_0001'),b=await f.send('envio_independente_0001');assert.equal(b.status,200);assert.equal(b.body.fornecedores[0].id,a.body.fornecedores[0].id);assert.equal(f.db.links.length,2);assert.equal((await f.send('envio_independente_0001',3514)).status,409);assert.equal(f.db.links.length,2);});
test('falha no lote desfaz link e nao altera historico anterior',async()=>{const f=fixture(),old=JSON.stringify(f.db);f.fail();assert.equal((await f.send('envio_independente_0001')).status,500);assert.equal(JSON.stringify(f.db),old);});
test('validador rejeita chave invalida e fingerprint independe da ordem das chaves',()=>{assert.throws(()=>validateCompraEnviarBody({chave_envio:'curta',fornecedores:[{fornecedor_id:11}]}));assert.deepEqual(identidadeEnvio(1,2,{chave_envio:'abc',a:1,b:2}),identidadeEnvio(1,2,{b:2,a:1,chave_envio:'abc'}));assert.throws(()=>lerReplay({metadados:'{}'},'x'));});

test('previsoes aceitam mesmo fornecedor com cotacoes/datas independentes; duplicata recusada',()=>{
 const p={fornecedor_id:11,cotacao_fornecedor_id:101,data_base:'2026-10-30',previsao:'2026-11-05',confirmada:true};
 const body={alocacoes:[{resposta_item_id:501,quantidade_alocada:1}],previsoes_entrega:[p,{...p,cotacao_fornecedor_id:102,previsao:'2026-11-10'}]};
 const r=validateCompraEncerrarBody(body);assert.equal(r.previsoes_entrega.length,2);assert.equal(r.previsoes_entrega[1].cotacao_fornecedor_id,102);
 assert.throws(()=>validateCompraEncerrarBody({...body,previsoes_entrega:[p,p]}));
});

test('agrupamento real do fechamento gera grupos distintos por cotacao do mesmo fornecedor',()=>{
 const s=fs.readFileSync(__dirname+'/../src/services/pedidoCompraService.js','utf8');const start=s.indexOf('  const porFornecedor = new Map();',s.indexOf('async function gerarPedidosDosVencedores'));const end=s.indexOf("  const { dataValida",start);
 const agrupar=new Function('alocacoes',s.slice(start,end)+';return porFornecedor;');
 const grupos=agrupar([{vinculacaoFornecedor:{id:101,fornecedor_compra_id:11},resposta:{id:501},quantidade_alocada:10,registro:{}},{vinculacaoFornecedor:{id:102,fornecedor_compra_id:11},resposta:{id:502},quantidade_alocada:50,registro:{}}]);
 assert.equal(grupos.size,2);assert.deepEqual(grupos.get(101).respostaItemIds,[501]);assert.deepEqual(grupos.get(102).respostaItemIds,[502]);
 const a=s.indexOf('  const gruposPedidos = [...porFornecedor.values()]',start),b=s.indexOf('  const pedidosCriados = [];',a);const validar=new Function('porFornecedor','previsoesEntrega',s.slice(a,b));
 const pp=[{fornecedor_id:11,cotacao_fornecedor_id:101},{fornecedor_id:11,cotacao_fornecedor_id:102}];assert.doesNotThrow(()=>validar(grupos,pp));assert.throws(()=>validar(grupos,[{fornecedor_id:11}]));assert.throws(()=>validar(grupos,[pp[0],{...pp[1],fornecedor_id:99}]));
});
test('comparativo frontend nao colapsa cotacoes; pedido exibido corresponde a resposta de origem',{skip:process.argv.includes('--backend-only')},()=>{
 const s=fs.readFileSync(__dirname+'/../../frontend/src/modules/solicitacao-compra/pages/GerenciarCotacaoSolicitacao.jsx','utf8');
 const a=s.indexOf('  const fornecedoresMapa = useMemo(() => {'),b=s.indexOf('  const fornecedoresMapaVisiveis',a);let text=s.slice(a,b).replace('const fornecedoresMapa = useMemo(() => {','const fornecedoresMapa = (() => {').replace('}, [comparativo]);','})();');
 const comparativo={fornecedores:[{id:101,fornecedor_id:11,nome:'Mesmo'},{id:102,fornecedor_id:11,nome:'Mesmo'}],itens:[{respostas:[{cotacao_fornecedor_id:101,fornecedor_id:11},{cotacao_fornecedor_id:102,fornecedor_id:11}]}]};
 const cols=new Function('comparativo',text+';return fornecedoresMapa;')(comparativo);assert.equal(cols.length,2);assert.deepEqual(cols.map(c=>c.mapa_id),[101,102]);
 const c=s.indexOf('  const pedidosPorCotacao = useMemo(() => {'),d=s.indexOf('  async function handleAbrirPdf',c);text=s.slice(c,d).replace('const pedidosPorCotacao = useMemo(() => {','const pedidosPorCotacao = (() => {').replace('}, [solicitacao]);','})();');
 const solicitacao={fornecedores:[{id:101,respostas:[{id:501}]},{id:102,respostas:[{id:502}]}],pedidos:[{id:314,status:'FECHADO_FORNECEDOR',itens:[{resposta_item_id:501}]},{id:315,status:'FECHADO_FORNECEDOR',itens:[{resposta_item_id:502}]}]};
 const map=new Function('solicitacao',text+';return pedidosPorCotacao;')(solicitacao);assert.equal(map.get(101).id,314);assert.equal(map.get(102).id,315);
});

test('envios concorrentes com a mesma chave criam uma unica cotacao sob lock da compra',async()=>{const f=fixture();const result=await Promise.all(Array.from({length:8},()=>f.send('envio_independente_0001')));assert(result.every(r=>[200,201].includes(r.status)));assert.equal(new Set(result.map(r=>r.body.fornecedores[0].id)).size,1);assert.equal(f.db.links.length,2);});
test('origem do pedido e resolvida por resposta; nunca pelo primeiro fornecedor repetido',()=>{
 const {cotacaoDoPedido}=require('../src/services/cotacoesIndependentes');const d={fornecedores:[{id:101,fornecedor_compra_id:11,respostas:[{id:501}]},{id:102,fornecedor_compra_id:11,respostas:[{id:502}]}]};assert.equal(cotacaoDoPedido(d,{fornecedor_compra_id:11,itens:[{resposta_item_id:502}]}).id,102);assert.equal(cotacaoDoPedido(d,{fornecedor_compra_id:11,itens:[]}),null);
});
