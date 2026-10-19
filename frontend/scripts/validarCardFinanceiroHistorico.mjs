import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(root, '../outputs/qa-card-financeiro-historico-20261019'); fs.mkdirSync(output, { recursive: true });
const mocks = new Map(['financeiro', 'parceiros', 'solicitacoes', 'empresasGrupo', 'obras'].map(name => {
 const source = fs.readFileSync(path.join(root, `src/services/${name}.js`), 'utf8');
 return [name, [...source.matchAll(/export (?:async )?function (\w+)/g)].map(m => `export async function ${m[1]}(...args){return window.qaService('${m[1]}',args);}`).join('\n')];
}));
const fixture = `import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';
import Card from'/src/pages/SolicitacaoDetalhe/FinanceiroCard.jsx';import{ThemeContext,TEMA_PADRAO}from'/src/contexts/ThemeContext.jsx';
import'/src/index.css';import'/src/styles/design-tokens.css';import'/src/styles/escala.css';import'/src/styles/componentes-padrao.css';
const q=new URLSearchParams(location.search),neg=q.has('neg'),reg=q.has('reg'),obra=q.has('obra');
window.qaUser={id:9,perfil:'USUARIO',areas_permissoes_configuradas:true,areas_permissoes:obra?[]:['financeiro.titulos.visualizar','financeiro.titulos.criar','financeiro.fila_pagamentos.preparar']};
const base={tipo:'PAGAR',descricao:'Titulo individual',status:'ABERTO',valor_original:'7055.00',valor_baixado:'0.00',valor_saldo:'7055.00',data_vencimento:'2026-10-30'};
const avulso={...base,id:1,codigo:'TIT-ANTIGO',...(reg?{status:'CANCELADO',valor_saldo:'0.00',regularizacao_substituicao:{tipo:'LOTE_COMPARTILHADO',id:1}}:{})};
const parts=['2351.67','2351.66','2351.67'].map((v,i)=>({...base,id:i+2,codigo:'TIT-COMP-'+i,descricao:'Titulo compartilhado',somente_participacao:true,compartilhamento_id:1,valor_original:v,valor_saldo:v}));
const original={id:10,codigo:'TIT-ORIGEM-ACORDO',status:'RENEGOCIADO',valor_original:'2815.00',valor_saldo:'0.00',renegociado_por_id:3};
window.titulos=neg?[{...base,id:10,codigo:'TIT-ORIGEM-ACORDO',valor_original:'2815.00',valor_baixado:'938.33',valor_saldo:'1876.67',status:'PARCIAL',renegociado_por_id:3,historico_titulo_original:original,
renegociacao_titulos:[{id:20,codigo:'TIT-PARCELA-1',vencimento:'2026-10-16',valor:'938.33',valor_saldo:'0.00'},{id:21,codigo:'TIT-PARCELA-2',vencimento:'2026-10-25',valor:'938.34',valor_saldo:'938.34'},{id:22,codigo:'TIT-PARCELA-3',vencimento:'2026-11-09',valor:'938.33',valor_saldo:'938.33'}]}]:[avulso,...parts];
window.qaWrites=[];window.qaService=async(name,args)=>{if(name==='getTitulosFinanceirosPorSolicitacao')return structuredClone(window.titulos);if(name==='buscarParceiroPorId')return null;if(/gerar|enviar|criar|atualizar|cadastrar/i.test(name))window.qaWrites.push(name);return []};
const s={id:1,codigo:neg?'SOL-5419':'SOL-5426',valor:neg?2815:7055,tipo:{nome:'SOLICITACAO DE COMPRA'},obra_id:1,obra:{id:1,nome:'Obra QA'},data_vencimento:'2026-10-30'};
createRoot(document.getElementById('root')).render(<MemoryRouter><ThemeContext.Provider value={{tema:TEMA_PADRAO}}><main className="app-page p-4"><Card solicitacao={s} podeVisualizarTitulos podeAcessarModuloFinanceiro={!obra} podeOperarAbaFinanceiro={!obra} somenteLeitura={obra}/></main></ThemeContext.Provider></MemoryRouter>);`;
const server = await createServer({root,configFile:false,logLevel:'error',server:{host:'127.0.0.1',port:0},plugins:[{
 name:'qa-card-historico',enforce:'pre',resolveId(id){if(id==='/fixture.jsx')return '\0qa-card.jsx'},
 load(id){if(id==='\0qa-card.jsx')return transformWithEsbuild(fixture,'fixture.jsx',{loader:'jsx',jsx:'transform'})},
 transform(code,id){if(id.endsWith('/src/contexts/AuthContext.jsx'))return `export function useAuth(){return {user:window.qaUser}}`;for(const[n,m]of mocks)if(id.endsWith('/src/services/'+n+'.js'))return m},
 configureServer(s){s.middlewares.use(async(req,res,next)=>{if(new URL(req.url,'http://localhost').pathname!=='/fixture')return next();res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml('/fixture','<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'))})}
},react()],optimizeDeps:{include:['react','react-dom/client','react-router-dom']}});
let browser;const errors=[],external=[];
try{
 await server.listen();browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue();external.push(r.request().url());return r.abort()});
 const goto=async q=>{await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/fixture${q}`);await page.getByRole('heading',{name:'Financeiro',exact:true}).click();await page.getByText('Valor financeiro vigente',{exact:true}).waitFor();await page.waitForFunction(()=>document.body.textContent.includes('7.055,00')||document.body.textContent.includes('2.815,00'))};
 for(const width of [1366,390]){
  await page.setViewportSize({width,height:1000});
  await goto('');await page.getByText(/nenhum saldo ativo é ocultado/).waitFor();assert((await page.locator('body').innerText()).includes('14.110,00'));
  await goto('?reg=1');await page.getByText('Histórico de títulos (1) · fora dos totais vigentes',{exact:true}).click();await page.getByText(/Regularizado por substituição: lote compartilhado #1/).waitFor();
  assert(!(await page.locator('body').innerText()).includes('14.110,00'));await page.screenshot({path:path.join(output,`compartilhado-${width}.png`),fullPage:true});
  await goto('?neg=1');await page.getByText('Negociação #3 · participação nas parcelas vigentes',{exact:true}).click();
  assert.equal(await page.getByRole('link',{name:'TIT-PARCELA-2',exact:true}).getAttribute('href'),'/financeiro/titulos/21');
  await page.getByText('Histórico de títulos (1) · fora dos totais vigentes',{exact:true}).click();await page.getByText(/Substituído pela negociação #3/).waitFor();
  assert((await page.locator('body').innerText()).includes('1.876,67'));await page.screenshot({path:path.join(output,`negociacao-${width}.png`),fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(await page.evaluate(()=>window.qaWrites),[]);
  await goto('?neg=1&obra=1');await page.getByText('Negociação #3 · participação nas parcelas vigentes',{exact:true}).click();assert.equal(await page.getByRole('link').count(),0);assert.equal(await page.getByRole('button',{name:'Criar Título',exact:true}).count(),0);
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('OK card real desktop/mobile: sobreposição visível, totais vigentes, histórico preservado, parcelas navegáveis, Obra sem links/ações financeiras, zero escritas/APIs externas.');
}finally{await browser?.close();await server.close()}
