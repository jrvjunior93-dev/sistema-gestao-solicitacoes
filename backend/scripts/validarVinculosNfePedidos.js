'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const D=require('../src/modules/fiscal/services/fiscalPurchaseLinkDomain');
const migration=require('../migrations/202610240002_fiscal_vinculos_pedidos');
const {fixture}=require('./fixtures/vinculosNfeDbFixture.cjs');
test('NF-e em pedidos da mesma e de outras solicitacoes; baixas, XML e titulos intactos',async()=>{
  const f=await fixture();try{const before=f.financial(),doc=JSON.stringify(await f.db.FiscalDfeDocument.findByPk(1));
    await f.service.save(f.req,1,f.body([10,11,12]),randomUUID());
    const links=(await f.service.read(f.req,{document_id:1})).data;
    assert.equal(links.length,6);assert.deepEqual([...new Set(links.map(l=>l.solicitacao_id))].sort(),[100,200]);
    assert.equal(f.financial(),before);assert.equal(JSON.stringify(await f.db.FiscalDfeDocument.findByPk(1)),doc);
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM fiscal_dfe_events').get().n,1);
    assert.equal(f.sql.prepare('SELECT SUM(CAST(allocated_value AS REAL)) AS n FROM fiscal_document_links').get().n,300);
  }finally{f.close();}
});
test('replay e cliques concorrentes nao duplicam; chave com outro conteudo e conflito',async()=>{
  const f=await fixture();try{const key=randomUUID(),body=f.body();const [a,b]=await Promise.all([f.service.save(f.req,1,body,key),f.service.save(f.req,1,body,key)]);
    assert.equal([a,b].filter(r=>r.replayed).length,1);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM fiscal_document_links').get().n,2);
    await assert.rejects(f.service.save(f.req,1,{...body,motivo:'Outro'},key),e=>e.statusCode===409);
    await assert.rejects(f.service.save({user:{id:6}},1,body,key),e=>e.statusCode===409);
    await assert.rejects(f.service.save(f.req,1,f.body([11]),randomUUID()),e=>e.statusCode===409);
  }finally{f.close();}
});
test('permissoes, escopo, empresa e titulo de outro pedido falham antes de gravar',async()=>{
  const f=await fixture();try{
    f.setDenied(true);await assert.rejects(f.service.save(f.req,1,f.body(),randomUUID()),e=>e.statusCode===403);f.setDenied(false);
    f.setScope([11]);await assert.rejects(f.service.save(f.req,1,f.body(),randomUUID()),e=>e.statusCode===403);f.setScope(null);
    await assert.rejects(f.service.save(f.req,1,f.body([13]),randomUUID()),e=>e.statusCode===409);
    const body=f.body();body.pedidos[0].titulo_ids=[11];await assert.rejects(f.service.save(f.req,1,body,randomUUID()),e=>e.statusCode===409);
    f.setFreight(true);await assert.rejects(f.service.save(f.req,1,f.body(),randomUUID()),e=>e.statusCode===409);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM fiscal_document_links').get().n,0);
  }finally{f.close();}
});
test('erro no evento reverte todos os vinculos; baixa parcial nao se altera',async()=>{
  const f=await fixture();try{const before=f.financial();f.setFail(true);
    await assert.rejects(f.service.save(f.req,1,f.body([10,11]),randomUUID()),/FALHA_AUDITORIA/);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM fiscal_document_links').get().n,0);assert.equal(f.financial(),before);
  }finally{f.close();}
});
test('referencia do pedido aparece no titulo futuro; encerrar preserva trilha e permite revisao',async()=>{
  const f=await fixture();try{const body=f.body();body.pedidos[0].titulo_ids=[];await f.service.save(f.req,1,body,randomUUID());
    await f.db.TituloFinanceiro.create({id:20,codigo:'TIT-FUTURO',status:'ABERTO',valor_original:'100.00',valor_baixado:'0.00',valor_saldo:'100.00',obra_id:10});
    await f.db.PedidoCompraTitulo.create({pedido_compra_id:10,titulo_financeiro_id:20,origem:'NOVO_FLUXO'});
    const read=await f.service.read(f.req,{titulo_id:20});assert.equal(read.data.length,1);assert.equal(read.data[0].referencia_pedido,true);
    await f.db.PedidoCompraFrete.create({pedido_compra_id:10,titulo_financeiro_id:20,tipo:'TERCEIRO'});
    assert.equal((await f.service.read(f.req,{titulo_id:20})).data.length,0,'Frete a terceiro nao herda referencia de mercadorias');
    let version=(await f.service.read(f.req,{document_id:1})).revision;
    const key=randomUUID(),raw={revision:version,motivo:'Correcao QA'};await f.service.remove(f.req,1,10,raw,key);assert.equal((await f.service.remove(f.req,1,10,raw,key)).replayed,true);
    assert.equal((await f.service.read(f.req,{pedido_id:10})).data.length,0);
    version=(await f.service.read(f.req,{document_id:1})).revision;await f.service.save(f.req,1,f.body([10],version),randomUUID());
    assert.equal((await f.service.read(f.req,{pedido_id:10})).data.length,2);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM fiscal_document_links').get().n,2);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM fiscal_dfe_events').get().n,3);
  }finally{f.close();}
});
test('duplicidade, valores e revisao invalidos; soma divergente e somente aviso',async()=>{
  assert.throws(()=>D.input({pedidos:[],motivo:'x',revision:0}));assert.throws(()=>D.input({pedidos:[{pedido_id:1,valor:'1e3',titulo_ids:[]}],motivo:'x',revision:0}));
  const f=await fixture();try{const result=await f.service.save(f.req,1,f.body(),randomUUID());assert(result.warnings.length);
    await assert.rejects(migration.down(),/Preservar/);
    assert.throws(()=>f.sql.prepare('INSERT INTO fiscal_document_links(fiscal_dfe_document_id,purchase_link_key) VALUES(1,?)').run('ORDER:10'),/UNIQUE/);
  }finally{f.close();}
});
test('renegociacao consulta documentos dos titulos de origem sem mover vinculos ou baixas',async()=>{
  const f=await fixture();try{await f.service.save(f.req,1,f.body(),randomUUID());
    await f.db.TituloFinanceiro.create({id:50,codigo:'TIT-ACORDO',status:'ABERTO',valor_original:'60.00',valor_baixado:'0.00',valor_saldo:'60.00',obra_id:10,renegociacao_id:1});
    await f.db.TituloRenegociacaoAlocacao.create({titulo_origem_id:10,titulo_destino_id:50});
    const before=f.financial(),links=JSON.stringify(f.sql.prepare('SELECT * FROM fiscal_document_links').all());
    const result=await f.service.read(f.req,{titulo_id:50});
    assert(result.data.some(r=>r.titulo_id===10&&r.referencia_renegociacao));
    assert.equal(f.financial(),before);assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM fiscal_document_links').all()),links);
  }finally{f.close();}
});
test('vinculo legado e reaproveitado sem duplicar a relacao ou apagar seu autor original',async()=>{
  const f=await fixture();try{await f.db.FiscalDocumentLink.create({id:40,fiscal_dfe_document_id:1,pedido_id:10,financeiro_titulo_id:10,created_by:2,link_status:'confirmed'});
    await f.service.save(f.req,1,f.body(),randomUUID());
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM fiscal_document_links').get().n,2);
    const legacy=await f.db.FiscalDocumentLink.findByPk(40);assert.equal(legacy.created_by,2);assert.equal(legacy.confirmed_by,5);assert.equal(legacy.purchase_link_key,'ORDER:10:TITLE:10');
    const event=await f.db.FiscalDfeEvent.findOne({});assert.equal(event.raw_event_json.before[0].created_by,2);
  }finally{f.close();}
});
test('somente visualizar nao permite vincular; listagem de NF-e respeita escopo dos pedidos',async()=>{
  const f=await fixture();try{
    await f.service.save(f.req,1,f.body([10,11,12]),randomUUID());f.setScope([10]);
    const result=await f.service.read(f.req,{document_id:1});assert.equal(result.data.length,2);assert(result.data.every(l=>l.pedido_id===10));
    f.denyPermission('canLinkFiscalDocuments');
    await assert.rejects(f.service.save(f.req,1,f.body(),randomUUID()),e=>e.statusCode===403);
    assert.equal((await f.service.read(f.req,{pedido_id:10})).data.length,2);
  }finally{f.close();}
});
test('titulo a receber ou cancelado nao entra na associacao; quitado pode receber evidencia',async()=>{
  const f=await fixture();try{
    f.sql.exec("UPDATE titulos SET tipo='RECEBER' WHERE id=10");
    await assert.rejects(f.service.save(f.req,1,f.body(),randomUUID()),e=>e.statusCode===409);
    f.sql.exec("UPDATE titulos SET tipo='PAGAR',status='CANCELADO' WHERE id=10");
    await assert.rejects(f.service.save(f.req,1,f.body(),randomUUID()),e=>e.statusCode===409);
    f.sql.exec("UPDATE titulos SET status='QUITADO',valor_baixado='100.00',valor_saldo='0.00' WHERE id=10");
    const before=f.financial();await f.service.save(f.req,1,f.body(),randomUUID());assert.equal(f.financial(),before);
  }finally{f.close();}
});
