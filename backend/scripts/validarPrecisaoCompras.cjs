const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const d = require('../src/utils/decimalCompras');

test('precos decimais preservam 10 casas sem passar por Number; limites nao truncam', () => {
  assert.equal(d.unitPrice('999999999999.1234567891'), '999999999999.1234567891');
  assert.equal(d.inputPrice('R$ 1.234,1234567891'), '1234.1234567891');
  assert.equal(d.editablePrice('3.6750000000'), '3,675');
  assert.equal(d.displayPrice('3.6750000000'), 'R$ 3,675');
  assert.equal(d.displayPrice('2'), 'R$ 2,00');
  assert.throws(() => d.unitPrice('1.12345678901'), /10 casas/);
  assert.throws(() => d.unitPrice('1000000000000'), /fora da faixa/);
  assert.throws(() => d.unitPrice('-1'), /fora da faixa/);
  assert.throws(() => d.unitPrice('NaN'), /invalido/);
  assert.throws(() => d.unitPrice('1e1000'), /fora da faixa/);
});

test('HALF_UP exato elimina divergencias do toFixed e do produto binario', () => {
  assert.equal(d.money('1.345'), 1.35);
  assert.equal(d.money('3.675'), 3.68);
  assert.equal(d.money('-1.345'), -1.35);
  assert.equal(d.lineMoney('1000', '0.876'), 876);
  assert.equal(d.lineMoney('0.001', '1.2345678912'), 0);
  assert.equal(d.lineMoney('50', '3.675'), 183.75);
  assert.equal(d.sumMoney([0.1,0.2]), 0.3);
  assert.throws(() => d.lineMoney('-1','2'), /negativa/);
  assert.throws(() => d.lineMoney('100','999999999999'), /faixa monetaria/);
});

test('centavos residuais conciliam linhas e total por maiores restos; chave estavel independe da ordem', () => {
  const items=[{key:2,quantity:1,price:'.005'.replace(/^\./,'0.')},{key:1,quantity:1,price:'0.005'}];
  const result=d.merchandise(items);
  assert.equal(result.total, 0.01); assert.deepEqual(result.lines,[0,0.01]);
  assert.deepEqual(result.adjustments,[-0.01,0]);
  assert.deepEqual(d.merchandise([...items].reverse()).lines,[0.01,0]);
  assert.deepEqual(d.merchandise([]),{total:0,lines:[],adjustments:[]});
  for(let count=1;count<=250;count++){
    const r=d.merchandise(Array.from({length:count},(_,i)=>({key:i,quantity:'0.123',price:String(i+1)+'.1234567891'})));
    assert.equal(Math.round(r.lines.reduce((s,v)=>s+Math.round(v*100),0)),Math.round(r.total*100));
    assert.deepEqual(r,d.merchandise(Array.from({length:count},(_,i)=>({key:i,quantity:'0.123',price:String(i+1)+'.1234567891'}))));
  }
});

test('frontend gerado executa o mesmo calculo que backend', {skip:process.argv.includes('--backend-only')}, async () => {
  require('node:child_process').execFileSync(process.execPath,[path.join(__dirname,'gerarDecimalComprasFrontend.cjs'),'--check']);
  const f=await import(pathToFileURL(path.resolve(__dirname,'../../frontend/src/utils/decimalCompras.js')).href);
  const rows=[{key:1,quantity:'484',price:'1.636'},{key:2,quantity:'1000',price:'0.876'}];
  assert.deepEqual(f.merchandise(rows),d.merchandise(rows));
  assert.equal(f.inputPrice('999.999.999.999,1234567891'),d.inputPrice('999.999.999.999,1234567891'));
  const preview=await import(pathToFileURL(path.resolve(__dirname,'../../frontend/src/utils/comprasDecimalPreview.js')).href);
  assert.equal(preview.previewMercadorias([{key:1,quantity:1000,price:'0,876'}]).total,876);
  assert.equal(preview.previewMercadorias([{key:1,quantity:1,price:'1000000000000'}]).errors.length,1);
  assert.equal(preview.previewMercadorias([{key:1,quantity:1,price:'-'}]).errors.length,1);
});

test('validadores da API preservam unitarios de 22 digitos e rejeitam precisao excedente',()=>{
  const v=require('../src/validators/operationalValidators');
  const body=v.validateCompraPedidoItemUpdateBody({preco_unitario:'999999999999.1234567891',quantidade_pedido:'1,123'});
  assert.equal(body.preco_unitario,'999999999999.1234567891');assert.equal(body.quantidade_pedido,1.123);
  const response=v.validateCompraCotacaoRespostaInternaBody({itens:[{
    item_tipo:'CADASTRADO',item_referencia_id:1,status_disponibilidade:'DISPONIVEL',
    preco:'999.999.999.999,1234567891',quantidade_disponivel:'1'
  }],finalizar:false});
  assert.equal(response.itens[0].preco,'999999999999.1234567891');
  assert.throws(()=>v.validateCompraPedidoItemUpdateBody({preco_unitario:'1.12345678901'}),/10 casas/);
  assert.equal(v.validateCompraPedidoItemUpdateBody({observacoes:'Manter preco'}).preco_unitario,undefined);
});

// Executa a funcao real do servico com adaptadores de persistencia em memoria.
function loadRecalcular(pedido) {
  const source=fs.readFileSync(path.resolve(__dirname,'../src/services/pedidoCompraService.js'),'utf8');
  const start=source.indexOf('async function recalcularPedidoPorId(');
  const end=source.indexOf('\nasync function ',start+1);
  assert(start>=0&&end>start);
  const context={ decimalCompras:d,asNumber:v=>Number(v||0),roundMoney:d.money,
    calcularRateiosMonetarios:(_discount,values)=>values.map(()=>0),
    PedidoCompra:{findByPk:async()=>pedido},PedidoCompraItem:{},FornecedorCompra:{},SolicitacaoCompra:{},
    sincronizarTotaisFretePedido:async()=>{},sincronizarValoresSolicitacaoCompra:async()=>{} };
  return vm.runInNewContext(source.slice(start,end)+'\nrecalcularPedidoPorId',context);
}

test('recalculo real usa unitarios preservados e concilia cabecalho; repeticao nao muda resultado', async () => {
  const pedido={id:7,desconto_total:0,itens:[
    {id:1,resposta_item_id:31,quantidade_pedido:'1',preco_unitario:'0.0050000000',valor_total:0,valor_mercadoria:0},
    {id:2,resposta_item_id:32,quantidade_pedido:'1',preco_unitario:'0.0050000000',valor_total:0,valor_mercadoria:0}
  ]};
  pedido.update=async v=>Object.assign(pedido,v);
  pedido.itens.forEach(i=>{i.update=async v=>Object.assign(i,v);});
  const calc=loadRecalcular(pedido);await calc(7);
  assert.equal(pedido.valor_mercadorias,0.01);assert.equal(pedido.valor_total,0.01);
  assert.equal(pedido.itens[0].preco_unitario,'0.0050000000');
  assert.equal(pedido.itens[0].valor_mercadoria,0.01);assert.equal(pedido.itens[1].valor_mercadoria,0);
  await calc(7);assert.equal(pedido.valor_total,0.01);
});

test('migration amplia somente precisao; repeticao nao aplica DDL e down recusa perda', async () => {
  const m=require('../migrations/202610270010_compras_precisao_unitarios');
  const types=new Map();let changes=0;
  const qi={describeTable:async t=>({preco_unitario:{type:types.get(t)||'DECIMAL(14,2)'}}),
    changeColumn:async(t,c,def)=>{assert.equal(c,'preco_unitario');assert.equal(def.type,'DECIMAL(22,10)');types.set(t,def.type);changes++;}};
  const args={queryInterface:qi,DataTypes:{DECIMAL:(p,s)=>`DECIMAL(${p},${s})`}};
  await m.up(args);assert.equal(changes,2);await m.up(args);assert.equal(changes,2);
  await assert.rejects(m.down(),/historico/);
  await assert.rejects(m.up({...args,queryInterface:{...qi,describeTable:async()=>({preco_unitario:{type:'DOUBLE'}})}}),/inesperada/);
});

test('caminhos de gravacao deixam de arredondar preco e conservam auditoria/guardas', () => {
  const source=fs.readFileSync(path.resolve(__dirname,'../src/services/pedidoCompraService.js'),'utf8');
  assert(!source.includes('preco_unitario: roundMoney('));
  assert(!source.includes('? roundMoney(payload.preco_unitario)'));
  assert(source.includes('decimalCompras.unitPrice(resposta.preco)'));
  assert(source.includes('await assertPedidoEditavel(pedidoId, transaction)'));
  assert(source.includes('await registrarLogPedidoItem('));
  const controller=fs.readFileSync(path.resolve(__dirname,'../src/controllers/CotacaoFornecedorController.js'),'utf8');
  assert(controller.includes('inputPrice(itemResposta.preco)'));
});

const fixtureIndex=process.argv.indexOf('--fonte');
if(fixtureIndex>=0) test('53 itens reais: simulacao e recalculo real conciliam 38.348,13 sem alterar a fonte',async()=>{
  const input=JSON.parse(fs.readFileSync(path.resolve(process.argv[fixtureIndex+1]),'utf8'));
  const original=JSON.stringify(input);
  const {simulate,html}=require('./simularPrecisaoPedido.cjs');
  const simulation=simulate(input);
  assert.equal(simulation.proposto.mercadorias,38348.13);assert.equal(simulation.diferenca,-5.71);
  assert.equal(JSON.stringify(input),original);
  assert.deepEqual(simulation,simulate(input));
  assert.equal(simulation.gravacoes_banco,0);assert.equal(simulation.itens.length,53);
  assert.equal(d.sumMoney(simulation.itens.map(i=>i.valor_mercadoria_proposto)),38348.13);
  assert.equal(d.sumMoney(simulation.itens.map(i=>i.ajuste_residuo_centavos)),0.02);
  assert(html(simulation).includes('53 itens'));
  const pedido={id:299,desconto_total:0,itens:input.itens.map(i=>({
    id:i.id,resposta_item_id:i.resposta_item_id,quantidade_pedido:i.quantidade,
    preco_unitario:i.unitario_resposta,valor_mercadoria:i.valor_mercadoria,valor_total:i.valor_mercadoria
  }))};
  pedido.update=async v=>Object.assign(pedido,v);
  pedido.itens.forEach(i=>{i.update=async v=>Object.assign(i,v);});
  await loadRecalcular(pedido)(299);
  assert.equal(pedido.valor_mercadorias,38348.13);assert.equal(pedido.valor_total,38348.13);
  assert.deepEqual(pedido.itens.map(i=>Number(i.valor_mercadoria)),simulation.itens.map(i=>i.valor_mercadoria_proposto));
  assert.equal(JSON.stringify(input),original);
  assert.throws(()=>simulate({...input,itens:input.itens.slice(1)}),/53 itens/);
  assert.throws(()=>simulate({...input,pedido:300}),/PC-00299/);
});

module.exports = { loadRecalcular };
