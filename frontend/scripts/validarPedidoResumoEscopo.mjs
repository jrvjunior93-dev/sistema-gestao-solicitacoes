// Componente real, hooks e transporte simulados. Nenhuma rede/banco ou DOM.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {transformWithEsbuild} from 'vite';
const source=await fs.readFile(new URL('../src/pages/SolicitacaoDetalhe/PedidoResumo.jsx',import.meta.url),'utf8');
const {code}=await transformWithEsbuild(source,'PedidoResumo.jsx',{loader:'jsx',jsx:'automatic',format:'cjs'});
function fixture(response,{defer=false}={}){
 const errors=[],updates=[],calls=[];let index=0,resolve;
 const waiting=new Promise(r=>resolve=r),mod={exports:{}};
 const jsx=(type,props)=>({type,props});
 vm.runInNewContext(code,{module:mod,exports:mod.exports,require:name=>{
  if(name==='react')return {useRef:()=>({current:false}),useState:initial=>{const state=index++;return[initial,v=>updates.push({state,value:v})];}};
  if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'Fragment'};
  if(name==='react-icons/hi2')return {HiBanknotes:'Money',HiXMark:'Close'};
  if(name==='./AcaoIconeCompra')return {default:'Action'};
  if(name==='../../components/ui/OverlayModal')return {default:'Modal'};
  if(name==='../../components/padrao')return {Avisos:'Notices',useAvisos:()=>({avisos:[],avisar:{erro:m=>errors.push(m)},fechar:()=>{}})};
  if(name==='../../modules/solicitacao-compra/components/PedidoCompraFinanceiro')return {default:'Financeiro'};
  if(name==='../../services/compras')return {obterPedidoCompra:async id=>{calls.push(id);if(defer)await waiting;return response;}};
  if(name==='../../utils/acessoProduto')return {canViewPedidoCompraFinanceiro:()=>true};
  throw Error('DEPENDENCIA_NAO_SIMULADA '+name);
 }});
 const tree=mod.exports.default({pedido:{id:25,itens:[]},user:{id:1}});
 function find(value){
  if(!value||typeof value!=='object')return;
  if(value.props?.rotulo==='Criar / gerenciar títulos deste pedido')return value;
  for(const child of Object.values(value)){if(Array.isArray(child)){for(const c of child){const found=find(c);if(found)return found;}}else{const found=find(child);if(found)return found;}}
 }
 const action=find(tree);assert(action);return {errors,updates,calls,open:action.props.onClick,release:resolve};
}
test('modal rejeita pedido de outro ID, financeiro de outro pedido ou resumo ausente',async()=>{
 for(const response of [{id:26,financeiro:{pedido_id:26}},{id:25,financeiro:{pedido_id:26}},{id:25},null]){
  const f=fixture(response);await f.open();assert.equal(f.errors.length,1);
  assert(!f.updates.some(x=>x.state===1&&x.value),'Nenhum dado de outro pedido entra no modal');
 }
});
test('modal aceita somente resposta do pedido correto, inclusive IDs string e legado sem pedido_id',async()=>{
 for(const response of [{id:25,financeiro:{pedido_id:25}},{id:'25',financeiro:{pedido_id:'25'}},{id:25,financeiro:{}}]){
  const f=fixture(response);await f.open();assert.deepEqual(f.errors,[]);assert.deepEqual(f.calls,[25]);
  assert(f.updates.some(x=>x.state===1&&x.value===response));
 }
});
test('cliques simultaneos fazem apenas uma consulta do pedido',async()=>{
 const f=fixture({id:25,financeiro:{pedido_id:25}},{defer:true});
 const first=f.open(),second=f.open();assert.deepEqual(f.calls,[25]);f.release();await Promise.all([first,second]);assert.equal(f.calls.length,1);assert.deepEqual(f.errors,[]);
});
