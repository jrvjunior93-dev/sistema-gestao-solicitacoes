// Telas/componentes reais, transporte e sessao locais. Sem API/banco externos.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import { chromium } from 'playwright';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import tailwindConfig from '../tailwind.config.js';
import { previaParcelasCartao, valoresRateadosCartoes } from '../src/utils/parcelamentoCartao.mjs';
import { camposFila } from '../src/navigation/filaWorkspaceDraft.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { faturas } = require('../../backend/scripts/validarCartaoParcelamentoBaixa.js');
const { planejarRateioFila } = require('../../backend/src/services/pagamentoFilaRateioDomain');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '../outputs/cartao-parcelamento-baixa-20261019'); fs.mkdirSync(out, { recursive: true });
assert.deepEqual(camposFila({parcelamento_cartao:{quantidade_parcelas:6,data_compra:'2026-10-19',chave_idempotencia:'nao-persistir',titulo:{id:1}}}),
  {parcelamento_cartao:{quantidade_parcelas:6,data_compra:'2026-10-19'}});
for(let index=1;index<=100;index++){
  const valores=[index+0.01, index+0.02, index+0.03];
  const total=valores.reduce((s,v)=>s+Math.round(v*100),0);
  const components=[{valor_pago:(total-123)/100},{valor_pago:1.23}];
  const esperado=planejarRateioFila(valores.map((valor_pago,i)=>({fila_id:i+1,valor_pago})),components);
  const actual=valoresRateadosCartoes(valores,components);
  for(let c=0;c<2;c++)assert.deepEqual(actual[c],esperado.flat().filter(p=>p.componente===c).map(p=>p.valor_pago));
}
for (const tz of ['UTC','America/Sao_Paulo','Pacific/Auckland']) {
  process.env.TZ = tz;
  for (const input of [{data:'2026-10-19',closing:10,due:20},{data:'2026-01-31',closing:31,due:5},
    {data:'2028-02-29',closing:29,due:31},{data:'2026-12-30',closing:15,due:10}]) {
    const card = {tipo:'CREDITO',dia_fechamento:input.closing,dia_vencimento:input.due};
    const list = previaParcelasCartao(card, {quantidade_parcelas:12,data_compra:input.data},2740);
    assert.equal(list.reduce((s,p)=>s+Math.round(p.valor*100),0),274000);
    list.forEach((p,index)=>{const actual=faturas.calcularDatasFatura(card,input.data,index);assert.equal(p.data_vencimento,actual.data_vencimento);assert.equal(p.data_fechamento,actual.data_fechamento);assert.equal(p.competencia,actual.competencia);});
  }
}
const names=[...fs.readFileSync(path.join(root,'src/services/financeiro.js'),'utf8').matchAll(/export (?:async )?function (\w+)/g)].map(m=>m[1]);
const methods={
  getTituloFinanceiroById:'async()=>structuredClone(window.__titulo)',
  getCartoesFinanceiros:'async()=>structuredClone(window.__cartoes)',
  getContasBancarias:'async()=>structuredClone(window.__contas)',
  getContasFilaPagamentos:'async()=>structuredClone(window.__contas)',
  getInstrumentosFilaPagamentos:'async()=>({formas:window.__formas,cartoes:window.__cartoes,cheques:[],empresas:[{id:1,nome:"Empresa QA"}]})',
  getFilaPagamentos:'async()=>({data:structuredClone(window.__rows),pagina:1,total:1,total_paginas:1,resumo:{PENDENTE:1},filtros:{empresas:[],credores:[]}})',
  registrarBaixasFilaPagamentos:'async(itens,key,instrumentos)=>{window.__writes.push({tipo:"fila",itens,key,instrumentos});await new Promise(r=>setTimeout(r,100));return{resultados:[],erros:[]}}',
  baixarTituloFinanceiro:'async(id,data)=>{window.__writes.push({tipo:"titulo",id,data});await new Promise(r=>setTimeout(r,100));if(window.__fail)throw Error("Falha de rede simulada");window.__titulo.status="QUITADO";window.__titulo.valor_saldo=0;return structuredClone(window.__titulo)}'
};
const api=names.map(name=>`export const ${name}=${methods[name]||'async()=>[]'};`).join('\n');
const entry=`import React,{useMemo}from'react';import{createRoot}from'react-dom/client';import{BrowserRouter,Routes,Route}from'react-router-dom';
import{WorkspacePageContext,createWorkspaceMemory}from'/src/navigation/WorkspaceContext.jsx';
import{ThemeContext,TEMA_PADRAO}from'/src/contexts/ThemeContext.jsx';
import Queue from'/src/pages/FinanceiroFilaPagamentos.jsx';import Detail from'/src/pages/FinanceiroTituloDetalhe.jsx';
import'/src/index.css';import'/src/styles/design-tokens.css';import'/src/styles/escala.css';import'/src/styles/componentes-padrao.css';import'/src/styles/responsive-system.css';
window.__writes=[];window.__alerts=[];window.__fail=false;
window.__contas=[{id:5,nome:'Controle do cartão QA',empresa_id:1,ativo:true}];
window.__cartoes=[{id:10,nome:'Crédito QA',tipo:'CREDITO',ativo:true,conta_bancaria_id:5,dia_fechamento:10,dia_vencimento:20},{id:11,nome:'Crédito 2 QA',tipo:'CREDITO',ativo:true,conta_bancaria_id:5,dia_fechamento:10,dia_vencimento:20},{id:20,nome:'Débito QA',tipo:'DEBITO',ativo:true,conta_bancaria_id:5}];
window.__formas=[{id:1,nome:'Cartão de crédito',tipo:'CARTAO_CREDITO',ativo:true,gera_fatura:true,exige_cartao:true},{id:2,nome:'Cartão de débito',tipo:'CARTAO_DEBITO',ativo:true,exige_cartao:true}];
window.__titulo={id:1,codigo:'TIT-CARTAO-QA',tipo:'PAGAR',status:'ABERTO',valor_original:2740,valor_saldo:2740,valor_baixado:0,empresa_id:1,obra_id:1,parceiro_id:1,descricao:'Compra QA',movimentos:[],empresa:{id:1,nome:'Empresa QA'},obra:{id:1,nome:'Obra QA'},parceiro:{id:1,nome:'Credor QA'}};
window.__rows=[{id:1,status:'PENDENTE',valor_previsto:2740,juros:0,multa:0,titulo:window.__titulo}];
function Host({children}){const memory=useMemo(()=>createWorkspaceMemory(),[]);return <WorkspacePageContext.Provider value={{key:'cartao-parcelamento-qa',memory,snapshot:true,active:true}}>{children}</WorkspacePageContext.Provider>}
createRoot(document.getElementById('root')).render(<BrowserRouter><ThemeContext.Provider value={{tema:TEMA_PADRAO}}><main className='layout-main'><Host><Routes><Route path='/fila' element={<Queue/>}/><Route path='/titulo/:id' element={<Detail/>}/></Routes></Host></main></ThemeContext.Provider></BrowserRouter>);`;
const stub='\0cartao-parcelamento-';
const server=await createServer({root,configFile:false,logLevel:'error',esbuild:{jsx:'automatic'},css:{postcss:{plugins:[tailwindcss(tailwindConfig),autoprefixer()]}},cacheDir:path.join(out,'vite-cache'),server:{host:'127.0.0.1',port:0},plugins:[{
  name:'qa-cartao-parcelamento',enforce:'pre',resolveId(source){
    if(source==='/qa-entry.jsx')return stub+'entry';
    if(source.endsWith('/services/financeiro'))return stub+'api';
    if(source.endsWith('/contexts/AuthContext')||source==='./AuthContext')return stub+'auth';
    if(source==='../components/padrao')return stub+'padrao';
  },async load(id){
    if(id===stub+'entry')return(await transformWithEsbuild(entry,'qa.jsx',{loader:'jsx',jsx:'automatic'})).code;
    if(id===stub+'api')return api;
    if(id===stub+'auth')return `export const useAuth=()=>({user:{id:1,perfil:'USUARIO',financeiro_liberado:true,areas_permissoes_configuradas:true,areas_permissoes:new URLSearchParams(location.search).has('readonly')?['financeiro.titulos.visualizar','financeiro.fila_pagamentos.visualizar']:['financeiro.titulos.visualizar','financeiro.titulos.baixar','financeiro.titulos.estornar','financeiro.fila_pagamentos.visualizar','financeiro.fila_pagamentos.baixar']}});`;
    if(id===stub+'padrao')return `export*from'/src/components/padrao/index.js';export const useAvisos=()=>({avisos:[],fechar:()=>{},limpar:()=>{},avisar:{erro:s=>window.__alerts.push(s),alerta:s=>window.__alerts.push(s),sucesso:s=>window.__alerts.push(s)}});export const useConfirmacao=()=>({confirmar:async()=>({ok:true})});`;
  },configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(!['/fila','/titulo/1'].includes(new URL(req.url,'http://local').pathname))return next();res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml(req.url,'<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/qa-entry.jsx"></script></body></html>'));});}
}]});
let browser, page;
try{
  await server.listen();const base=`http://127.0.0.1:${server.httpServer.address().port}`;
  browser=await chromium.launch({channel:'chrome',headless:true});
  page=await browser.newPage();page.setDefaultTimeout(12000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  for(const width of [1366,390]){
    await page.setViewportSize({width,height:900});
    await page.goto(base+'/fila');
    await page.getByLabel('Forma de pagamento de TIT-CARTAO-QA',{exact:true}).selectOption('1');
    await page.getByLabel('Cartão de TIT-CARTAO-QA',{exact:true}).selectOption('10');
    await page.getByLabel('Parcelas do cartão de TIT-CARTAO-QA',{exact:true}).fill('6');
    const data=page.getByLabel('Data da compra de TIT-CARTAO-QA',{exact:true});await data.fill('19/10/2026');await data.blur();
    assert.equal(await page.getByRole('dialog').count(),0);
    await page.getByRole('button',{name:'Ver parcelas',exact:true}).click();
    let modal=page.getByRole('dialog',{name:'Prévia das parcelas de TIT-CARTAO-QA',exact:true});await modal.waitFor();
    assert.equal(await modal.locator('tbody tr').count(),6);assert.equal(await page.evaluate(()=>window.__writes.length),0);
    await page.screenshot({path:path.join(out,`fila-modal-${width}.png`)});
    assert(await modal.evaluate(el=>{const r=el.firstElementChild.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1}));
    await modal.getByRole('button',{name:'Voltar para o pagamento',exact:true}).click();
    assert.equal(await page.getByLabel('Parcelas do cartão de TIT-CARTAO-QA',{exact:true}).inputValue(),'6');
    assert.equal(await page.evaluate(()=>window.__writes.length),0);
    await page.getByLabel('Parcelas do cartão de TIT-CARTAO-QA',{exact:true}).fill('60');
    await page.getByRole('button',{name:'Ver parcelas',exact:true}).click();await modal.waitFor();
    assert.equal(await modal.locator('tbody tr').count(),60);
    assert(await modal.getByRole('button',{name:'Voltar para o pagamento',exact:true}).isVisible());
    await modal.getByRole('button',{name:'Voltar para o pagamento',exact:true}).click();
    await page.getByLabel('Parcelas do cartão de TIT-CARTAO-QA',{exact:true}).fill('6');
    await page.getByRole('button',{name:'Registrar baixa',exact:true}).first().click();
    await page.waitForFunction(()=>window.__writes.length===1);
    const queue=await page.evaluate(()=>window.__writes[0]);assert.equal(queue.itens[0].parcelamento_cartao.quantidade_parcelas,'6');assert.equal(queue.itens[0].parcelamento_cartao.data_compra,'2026-10-19');
    if(width===1366){
      await page.getByLabel('Selecionar TIT-CARTAO-QA',{exact:true}).check();
      await page.getByRole('button',{name:/^Baixa em massa/}).click();
      const mass=page.getByRole('dialog',{name:'Baixa em massa',exact:true});await mass.waitFor();
      await mass.getByLabel('Forma de pagamento do lote',{exact:true}).selectOption('1');
      await mass.getByLabel('Cartão para os selecionados',{exact:true}).selectOption('10');
      await mass.getByLabel('Parcelas do cartão de lote selecionado',{exact:true}).fill('6');
      await mass.getByRole('button',{name:'Ver parcelas',exact:true}).click();
      const prev=page.getByRole('dialog',{name:'Prévia das parcelas de lote selecionado',exact:true});await prev.waitFor();
      assert.equal(await prev.locator('tbody tr').count(),6);
      await prev.getByRole('button',{name:'Voltar para o pagamento',exact:true}).click();
      await mass.getByRole('button',{name:'Mais de um cartão para o lote',exact:true}).click();
      const cards=page.getByRole('dialog',{name:'Cartões do pagamento de lote selecionado',exact:true});await cards.waitFor();
      await cards.getByLabel('Quantidade de cartões',{exact:true}).fill('2');
      await cards.getByLabel('Cartão 1',{exact:true}).selectOption('10');await cards.getByLabel('Valor no cartão 1 (R$)',{exact:true}).fill('1740');
      await cards.getByLabel('Cartão 2',{exact:true}).selectOption('11');await cards.getByLabel('Valor no cartão 2 (R$)',{exact:true}).fill('1000');
      await cards.getByLabel('Parcelas do cartão de lote selecionado, cartão 1',{exact:true}).fill('3');
      await cards.getByLabel('Parcelas do cartão de lote selecionado, cartão 2',{exact:true}).fill('2');
      await cards.getByRole('button',{name:'Confirmar cartões',exact:true}).click();await cards.waitFor({state:'hidden'});
      await mass.getByRole('button',{name:'Conferir e registrar baixas',exact:true}).click();await mass.waitFor({state:'hidden'});
      await page.waitForFunction(()=>window.__writes.length===2);
      const multi=await page.evaluate(()=>window.__writes[1]);
      assert.deepEqual(multi.instrumentos.componentes.map(p=>p.parcelamento_cartao.quantidade_parcelas),['3','2']);
    }
    await page.goto(base+'/titulo/1');
    await page.getByRole('button',{name:'Registrar baixa',exact:true}).click();
    const form=page.getByRole('dialog',{name:'Registrar baixa',exact:true});await form.waitFor();
    await form.getByLabel('Forma de pagamento',{exact:true}).selectOption('CARTAO');
    await form.locator('select').filter({has:page.locator('option[value="10"]')}).selectOption('10');
    await page.getByLabel('Parcelas do cartão de TIT-CARTAO-QA',{exact:true}).fill('6');
    const titleDate=page.getByLabel('Data da compra de TIT-CARTAO-QA',{exact:true});await titleDate.fill('19/10/2026');await titleDate.blur();
    await form.getByRole('button',{name:'Ver parcelas',exact:true}).click();
    modal=page.getByRole('dialog',{name:'Prévia das parcelas de TIT-CARTAO-QA',exact:true});await modal.waitFor();
    assert.equal(await modal.locator('tbody tr').count(),6);assert.equal(await page.evaluate(()=>window.__writes.length),0);
    await page.screenshot({path:path.join(out,`titulo-modal-${width}.png`)});
    await page.keyboard.press('Escape');await modal.waitFor({state:'hidden'});assert(await form.isVisible());
    await page.evaluate(()=>window.__fail=true);
    await form.getByRole('button',{name:'Confirmar baixa',exact:true}).evaluate(el=>{el.click();el.click();});
    await page.waitForFunction(()=>window.__writes.length===1);await page.getByText('Falha de rede simulada',{exact:true}).first().waitFor();
    await page.evaluate(()=>window.__fail=false);
    await form.getByRole('button',{name:'Confirmar baixa',exact:true}).click();
    await form.waitFor({state:'hidden'});
    const writes=await page.evaluate(()=>window.__writes);assert.equal(writes.length,2);assert.deepEqual(writes[0].data,writes[1].data);
    assert.equal(writes[1].data.parcelamento_cartao.quantidade_parcelas,'6');assert.match(writes[1].data.parcelamento_cartao.chave_idempotencia,/^[\w-]{16,80}$/);
    await page.goto(base+'/titulo/1?readonly');assert.equal(await page.getByRole('button',{name:'Registrar baixa',exact:true}).count(),0);
  }
  assert.deepEqual(errors,[]);
  console.log('OK: calendarios frontend/backend iguais em UTC/BR/NZ, centavos, fila/detalhe reais, modal sobreposto desktop/mobile, Escape/retorno, previa sem baixa, payloads, duplo clique/retry idempotente e permissao de leitura. Sem API/banco externos.');
}catch(error){await page?.screenshot({path:path.join(out,'falha.png'),fullPage:true});console.error(await page?.locator('[role="dialog"]').allTextContents());throw error;}
finally{await browser?.close();await server.close();}
