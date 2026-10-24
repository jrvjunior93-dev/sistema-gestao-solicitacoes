'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./fixtures/pedidoLocalizacaoFixture.cjs');
const {parseFilters}=require('../src/services/pedidoLocalizacaoQuery');
const {createController}=require('../src/controllers/PedidoLocalizacaoController');
const ids=r=>r.data.map(p=>p.id).sort((a,b)=>a-b);
test('solicitacao, codigos principal/SC/externo, fornecedor e itens encontram pedidos corretos',async()=>{
  const f=fixture();try{
    for(const query of[{solicitacao:'fundacao'},{codigo_solicitacao:'SOL-35'},{codigo_solicitacao:'SC-00066'},{codigo_solicitacao:'ERP-66'}])
      assert.deepEqual(ids(await f.service(query,f.scope)),[26,27,29]);
    for(const query of[{pedido:'PC-00026'},{pedido:'26',item:'Areia'},{fornecedor:'Pedreira',item:'Cimento'},{q:'Pedreira Cimento'}])
      assert.deepEqual(ids(await f.service(query,f.scope)),[26]);
    // Busca geral inclui tambem a observacao da solicitacao, comum aos seus pedidos.
    assert.deepEqual(ids(await f.service({q:'Pedreira Areia'},f.scope)),[26,27,29]);
    assert.equal((await f.service({item:'Ferro antigo'},f.scope)).total,0);
    assert.equal((await f.service({item:'100%'},f.scope)).total,1);
  }finally{f.close();}
});
test('filtros combinados, faixa monetaria exata, status e dia de criacao do ES',async()=>{
  const f=fixture();try{
    const r=await f.service({solicitacao:'NF-e38539',fornecedor:'Pedreira',status:'FECHADO_FORNECEDOR',valor_min:'566,44',valor_max:'600.00',data_inicio:'2026-10-24',data_fim:'2026-10-24'},f.scope);
    assert.deepEqual(ids(r),[26,27]);assert.equal(Number(r.resumo.valor_total),1166.44);
    assert.deepEqual(ids(await f.service({valor_min:'566.44',valor_max:'566.44'},f.scope)),[27]);
    assert.deepEqual(ids(await f.service({status:'CANCELADO'},f.scope)),[29]);
    assert.equal((await f.service({item:'Areia',valor_max:'500'},f.scope)).total,0);
  }finally{f.close();}
});
test('codigo PC com seis digitos nao e truncado pelo LPAD do MySQL',async()=>{
  const f=fixture(0,{largeId:true});try{
    const r=await f.service({pedido:'PC-100000'},f.scope);
    assert.deepEqual(ids(r),[100000]);assert.equal(r.data[0].codigo,'PC-100000');
  }finally{f.close();}
});
test('escopo de obras e comprador/solicitante se aplica tambem a resumo e itens',async()=>{
  const f=fixture();try{
    assert.deepEqual(ids(await f.service({},f.scope)),[26,27,29]);
    assert.equal((await f.service({obra_id:'2'},f.scope)).total,0);
    assert.equal((await f.service({}, {obraIds:[],userId:null})).total,0);
    assert.deepEqual(ids(await f.service({}, {obraIds:[1],userId:6})),[30]);
    assert.deepEqual(ids(await f.service({}, {obraIds:[1],userId:7})),[26,27,29]);
    assert.deepEqual(ids(await f.service({}, {obraIds:null,userId:null})),[26,27,28,29,30]);
    await assert.rejects(f.service({}, {userId:null}));
    assert(!JSON.stringify(await f.service({},f.scope)).includes('Equipamento reservado'));
  }finally{f.close();}
});
test('pedidos com varios itens nao duplicam contagem/valor; pagina traz apenas seus itens',async()=>{
  const f=fixture(60);try{
    const a=await f.service({limite:'25'},f.scope),b=await f.service({limite:'25',pagina:'2'},f.scope),last=await f.service({limite:'25',pagina:'999'},f.scope);
    assert.equal(a.total,63);assert.equal(Number(a.resumo.valor_total),1816.44);assert.equal(a.data.length,25);assert.equal(last.pagina,3);
    assert(!a.data.some(r=>b.data.some(s=>s.id===r.id)));
    const one=await f.service({pedido:'PC-00026'},f.scope);assert.equal(one.total,1);assert.equal(Number(one.resumo.valor_total),600);assert.equal(one.data[0].itens.length,2);
    assert(f.queries.every(q=>/^SELECT/.test(q.query)));assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM pedido_compras').get().n,65);
  }finally{f.close();}
});
test('validacao rejeita arrays/objetos/faixas/datas invalidas e limites acima de100',()=>{
  for(const q of[{limite:'101'},{pagina:0},{pagina:['1']},{obra_id:[]},{q:{}},{item:['Areia']},{valor_min:'-1'},{valor_max:'1e3'},{valor_min:'2',valor_max:'1'},
    {data_inicio:'2026-02-29'},{data_fim:'2026-10-32'},{data_inicio:'2026-10-25',data_fim:'2026-10-24'},{nao_suportado:'x'}])assert.throws(()=>parseFilters(q),e=>e.status===400);
});
test('texto e curingas sao literais/parametrizados; nenhum comando de escrita',async()=>{
  const f=fixture();try{
    for(const input of["x%' OR 1=1 --",'%','_','!']){
      const r=await f.service({solicitacao:input},f.scope);assert.equal(r.total,0);
      const queries=f.queries.slice(-2);assert(queries.every(q=>!q.query.includes(input)||input.length===1));
    }
    assert.throws(()=>f.sql.exec('DELETE FROM pedido_compras'),/readonly/);
  }finally{f.close();}
});
test('controller exige relatorio+pedidos, escopo conferido e nao concede escopo global por omissao',async()=>{
  const f=fixture();try{
    const auth={canViewComprasPedidos:async()=>true,canViewComprasRelatorios:async()=>true,getComprasVisibilityScope:async()=> 'ATRIBUIDAS',
      canViewAllComprasScope:async()=>false,canViewPedidoCompraFinanceiro:async()=>false};
    const response=()=>({statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(s){this.statusCode=s;return this;},json(v){this.body=v;return this;}});
    const run=async(mod={},req={user:{id:5},query:{},compraScopeObraIds:[1]})=>{
      const res=response();await createController({User:{findByPk:async()=>({id:5})},auth:{...auth,...mod},localizar:f.service})(req,res);return res;
    };
    const ok=await run();assert.equal(ok.body.total,3);assert.equal(ok.headers['Cache-Control'],'private, no-store');
    assert.equal((await run({canViewComprasPedidos:async()=>false})).statusCode,403);
    assert.equal((await run({canViewComprasRelatorios:async()=>false})).statusCode,403);
    assert.equal((await run({getComprasVisibilityScope:async()=> 'NENHUM'})).statusCode,403);
    assert.equal((await run({}, {user:{id:5},query:{}})).statusCode,403);
    assert.equal((await run({}, {query:{},compraScopeObraIds:[1]})).statusCode,401);
    const routes=fs.readFileSync(path.join(__dirname,'../src/routes.js'),'utf8');
    assert(routes.includes("router.get('/compras/relatorios/localizar-pedidos', allowComprasRelatoriosRead, allowComprasPedidosRead, scopeCompraListAccess, PedidoLocalizacaoController.index)"));
  }finally{f.close();}
});
