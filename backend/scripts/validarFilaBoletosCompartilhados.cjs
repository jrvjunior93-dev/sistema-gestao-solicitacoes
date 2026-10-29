'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Op } = require('sequelize');
const source = fs.readFileSync(path.join(__dirname, '../src/services/pagamentoFilaBoletosPedidosService.js'), 'utf8');
function fixture() {
  const state = { permitido: true, scope: null, calls: [], assinados: [],
    titulo: { id: 12758, compartilhamento_id: 4, solicitacao_id: null },
    origens: [243, 309].map((pedido_compra_id, i) => ({ titulo_financeiro_id: 12758, lote_id: 4, pedido_compra_id, solicitacao_id: 6443, obra_id: 23 })),
    docs: [10, 11, 12].map(id => ({ id, pedido_compra_id: 243, tipo: 'BOLETO_COMPRA', arquivo_nome: `boleto-${id}.jpeg`, arquivo_url: `privado/${id}`, createdAt: '2026-10-15' })),
    anexos: [10, 11, 12].map(id => ({ id: 14920 + id, solicitacao_id: 6443, tipo: 'BOLETO_COMPRA', caminho_arquivo: `privado/${id}`, deleted_at: null })),
    filas: [{ id: 993, titulo_financeiro_id: 12758 }] };
  const db = {
    TituloCompartilhadoOrigem: { findAll: async o => { state.calls.push('origens'); assert(o.where.titulo_financeiro_id[Op.in].includes(12758)); return structuredClone(state.origens); } },
    Solicitacao: { findAll: async o => { state.calls.push('solicitacoes'); return [{ id: 6443, codigo: 'SOL-6408' }]; } },
    PedidoCompraDocumentoFinanceiro: {
      findAll: async o => { state.calls.push('docs'); return structuredClone(state.docs.filter(d => o.where.pedido_compra_id[Op.in].includes(d.pedido_compra_id) && d.tipo === o.where.tipo && d.arquivo_url !== null)); },
      findByPk: async id => { state.calls.push('doc'); const doc = state.docs.find(d => d.id === id); return state.trocarUrl ? { ...doc, arquivo_url: 'privado/alterado' } : doc; }
    },
    Anexo: { findAll: async o => { state.calls.push('anexos'); assert.equal(o.where.deleted_at, null); return structuredClone(state.anexos.filter(a => !a.deleted_at && a.tipo === o.where.tipo && o.where.solicitacao_id[Op.in].includes(a.solicitacao_id) && o.where.caminho_arquivo[Op.in].includes(a.caminho_arquivo))); } },
    PagamentoManualFilaItem: { findByPk: async id => { state.calls.push('fila'); return state.filas.find(f => f.id === id); } },
    TituloFinanceiro: { findByPk: async id => { state.calls.push('titulo'); return Number(state.titulo.id) === Number(id) ? structuredClone(state.titulo) : null; } }
  };
  const sandbox = { module: { exports: {} }, require: name => {
    if (name === '../models') return db;
    if (name === 'sequelize') return { Op };
    if (name === './authorizationService') return { canAccessFilaPagamentos: async () => state.permitido, getFinanceiroObraScopeIds: async () => state.scope };
    if (name === './s3') return { getPresignedUrl: async (url, seconds, opts) => { state.assinados.push(url); assert.equal(seconds, 300); assert.equal(opts.strict, true); return 'https://assinatura.invalid/arquivo'; } };
    throw Error('DEPENDENCIA_NAO_SIMULADA:' + name);
  } };
  vm.runInNewContext(source, sandbox);
  return { s: state, service: sandbox.module.exports, req: { user: { id: 1 } } };
}
test('caso real: null direto, dois pedidos da mesma SOL e tres boletos sem duplicar', async () => {
  const { s, service, req } = fixture(), antes = JSON.stringify(s);
  const titulo = structuredClone(s.titulo);
  await service.anexarBoletosPedidos(req, [titulo]);
  assert.equal(titulo.boletos_pedidos.length, 3);
  assert(titulo.boletos_pedidos.every(d => d.origens.length === 1 && d.origens[0].pedido_compra_id === 243 && d.origens[0].solicitacao_codigo === 'SOL-6408'));
  assert(!JSON.stringify(titulo).includes('privado/')); assert.equal(s.assinados.length, 0);
  assert.equal(JSON.stringify({ ...s, calls: [], assinados: [] }), antes);
  assert.equal(s.calls.filter(c => c === 'anexos').length, 1);
});
test('deduplica arquivo entre pedidos, preservando as duas origens', async () => {
  const f = fixture(); f.s.docs.push({ ...f.s.docs[0], id: 50, pedido_compra_id: 309 });
  const t = { ...f.s.titulo }; await f.service.anexarBoletosPedidos(f.req, [t]);
  assert.equal(t.boletos_pedidos.length, 3); assert.equal(t.boletos_pedidos[0].origens.length, 2);
});
test('removidos, nota sem arquivo, frete e pedido alheio nao sao publicados', async () => {
  const f = fixture(); f.s.anexos[0].deleted_at = '2026-10-29'; f.s.docs[1].arquivo_url = null;
  f.s.docs.push({ id: 51, pedido_compra_id: 999, tipo: 'BOLETO_COMPRA', arquivo_url: 'alheio' },
    { id: 52, pedido_compra_id: 243, tipo: 'NOTA_FISCAL', arquivo_url: null },
    { id: 53, pedido_compra_id: 243, tipo: 'BOLETO_FRETE', arquivo_url: 'frete' });
  const t = { ...f.s.titulo }; await f.service.anexarBoletosPedidos(f.req, [t]);
  assert.deepEqual(Array.from(t.boletos_pedidos, d => d.documento_id), [12]);
  await assert.rejects(f.service.abrirBoletoPedido(f.req, 993, 10), { statusCode: 404 }); assert.equal(f.s.assinados.length, 0);
});
test('acesso parcial a obras e lote divergente nao expoem documentos', async () => {
  for (const mudar of [s => { s.scope = [99]; }, s => { s.scope = [23]; s.origens[1].obra_id = 99; }, s => { s.origens[0].lote_id = 999; }]) {
    const f = fixture(); mudar(f.s); const t = { ...f.s.titulo }; await f.service.anexarBoletosPedidos(f.req, [t]);
    assert.equal(t.boletos_pedidos.length, 0); assert(!f.s.calls.includes('docs'));
    await assert.rejects(f.service.abrirBoletoPedido(f.req, 993, 10), { statusCode: 404 }); assert.equal(f.s.assinados.length, 0);
  }
});
test('download revalida fila, titulo, origem e anexo antes de assinar', async () => {
  const f = fixture(), r = await f.service.abrirBoletoPedido(f.req, 993, 10);
  assert.equal(r.nome, 'boleto-10.jpeg'); assert.deepEqual(f.s.assinados, ['privado/10']);
  await assert.rejects(f.service.abrirBoletoPedido(f.req, 100, 10), { statusCode: 404 });
  await assert.rejects(f.service.abrirBoletoPedido(f.req, 993, 999), { statusCode: 404 });
});
test('sem permissao e IDs invalidos nao consultam nem assinam; troca posterior do arquivo bloqueia', async () => {
  const f = fixture(); f.s.permitido = false;
  await assert.rejects(f.service.abrirBoletoPedido(f.req, 993, 10), { statusCode: 403 }); assert.equal(f.s.calls.length, 0);
  await assert.rejects(f.service.abrirBoletoPedido(f.req, -1, 10), { statusCode: 400 });
  f.s.permitido = true; f.s.trocarUrl = true;
  await assert.rejects(f.service.abrirBoletoPedido(f.req, 993, 10), { statusCode: 404 }); assert.equal(f.s.assinados.length, 0);
});
test('titulo comum preserva fluxo anterior e nao abre no endpoint compartilhado', async () => {
  const f = fixture(), t = { id: 10, solicitacao: { boletos: [{ id: 1 }] } }, antes = JSON.stringify(t);
  await f.service.anexarBoletosPedidos(f.req, [t]); assert.equal(JSON.stringify(t), antes); assert.equal(f.s.calls.length, 0);
  f.s.titulo.compartilhamento_id = null;
  await assert.rejects(f.service.abrirBoletoPedido(f.req, 993, 10), { statusCode: 404 });
});
test('retirar fila ou apagar espelho impede nova abertura; GET nao cria registros', async () => {
  const f = fixture(); f.s.filas = [];
  await assert.rejects(f.service.abrirBoletoPedido(f.req, 993, 10), { statusCode: 404 });
  const g = fixture(); g.s.anexos = [];
  await assert.rejects(g.service.abrirBoletoPedido(g.req, 993, 10), { statusCode: 404 });
  assert(!/\.(create|update|destroy|save|findOrCreate|upsert)\(/.test(source));
  const routes = fs.readFileSync(path.join(__dirname, '../src/routes.js'), 'utf8');
  assert(routes.includes("'/financeiro/fila-pagamentos/:id/boletos-pedidos/:documentoId', allowFilaPagamentosRead"));
});

test('tres parcelas reutilizam os mesmos tres arquivos, com consultas em lote por pagina', async () => {
  const f=fixture();f.s.origens=[12758,12759,12760].flatMap(titulo_financeiro_id=>f.s.origens.map(o=>({...o,titulo_financeiro_id})));
  const titulos=[12758,12759,12760].map(id=>({...f.s.titulo,id}));
  await f.service.anexarBoletosPedidos(f.req,titulos);
  assert(titulos.every(t=>t.boletos_pedidos.length===3));
  for(const name of ['origens','docs','solicitacoes','anexos'])assert.equal(f.s.calls.filter(c=>c===name).length,1);
});
test('rota valida ambos os parametros; controller responde sem cache e usa somente servico autorizado',async()=>{
 const {validateNumericIdParams}=require('../src/validators/securityValidators');
 const validate=validateNumericIdParams(['id','documentoId'],'Boleto');
 assert.deepEqual(validate({id:'993',documentoId:'10'}),{id:'993',documentoId:'10'});
 assert.throws(()=>validate({id:'993',documentoId:'outro'}));
 const code=fs.readFileSync(path.join(__dirname,'../src/controllers/PagamentoManualFilaController.js'),'utf8');
 const chamadas=[],sandbox={module:{exports:{}},require:name=>{
  if(name==='../services/pagamentoFilaBoletosPedidosService')return{abrirBoletoPedido:async(req,fila,doc)=>{chamadas.push([fila,doc]);return {nome:'QA',url:'assinada'};}};
  return {};
 }};vm.runInNewContext(code,sandbox);const headers={};let result;
 await sandbox.module.exports.boletoPedido({params:{id:'993',documentoId:'10'}},{setHeader:(k,v)=>headers[k]=v,json:r=>result=r});
 assert.deepEqual(chamadas,[['993','10']]);assert.equal(headers['Cache-Control'],'no-store');assert.equal(result.nome,'QA');
});

test('lote misto com origem sem pedido conserva boletos dos pedidos validos, sem relaxar escopo',async()=>{
 const f=fixture();f.s.origens[1].pedido_compra_id=null;const t={...f.s.titulo};
 await f.service.anexarBoletosPedidos(f.req,[t]);assert.equal(t.boletos_pedidos.length,3);
 f.s.scope=[23];f.s.origens[1].obra_id=99;await f.service.anexarBoletosPedidos(f.req,[t]);assert.equal(t.boletos_pedidos.length,0);
});
