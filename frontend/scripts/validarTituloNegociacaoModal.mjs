import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = `import React,{useEffect,useMemo,useState} from 'react';import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';import Modal from '/src/components/financeiro/TituloNegociacaoModal.jsx';
import{WorkspacePageContext,createWorkspaceMemory}from'/src/navigation/WorkspaceContext.jsx';
const titulos=[{id:1,codigo:'TIT-000101',parceiro_id:7,empresa_id:8,status:'PARCIAL',valor_original:150,valor_baixado:50,valor_saldo:100,parceiro:{nome:'Fornecedor de materiais'}},
{id:2,codigo:'TIT-000102',parceiro_id:7,empresa_id:8,status:'ABERTO',valor_original:200,valor_baixado:0,valor_saldo:200,parceiro:{nome:'Fornecedor de materiais'}}];
window.titulos=structuredClone(titulos);window.reads=0;window.denied=false;window.readonly=false;
function Page(){const[rows,R]=useState(null);window.qaRows=R;useEffect(()=>{let live=true;setTimeout(()=>{window.reads++;if(live)R(window.denied?[]:structuredClone(window.titulos))},100);return()=>{live=false}},[]);
return rows&&rows.length===2&&!window.readonly?<Modal titulos={rows} onClose={()=>window.qaTab(false)} onConfirmed={r=>window.resultado=r}/>:<p>{rows?'Negociação indisponível':'Consultando títulos'}</p>}
function Host(){const[active,A]=useState(true);const memory=useMemo(()=>createWorkspaceMemory(),[]);window.qaTab=A;window.memory=memory;
return <WorkspacePageContext.Provider value={{key:'negociacao-qa',memory,snapshot:true,active:true}}>{active?<Page/>:<p>Consulta auxiliar</p>}</WorkspacePageContext.Provider>}
createRoot(document.getElementById('root')).render(<MemoryRouter>{location.search.includes('workspace')?<Host/>:<Modal titulos={titulos} onClose={()=>window.fechou=true} onConfirmed={r=>window.resultado=r}/>}</MemoryRouter>);`;
const mockService = `export const getFormasPagamentoFinanceiras=async()=>[{id:1,nome:'PIX',codigo:'PIX',ativo:true}];
export async function previewNegociacaoTitulos(body){
window.previas=(window.previas||0)+1;window.payloadPreview=body;
await new Promise(r=>setTimeout(r,120));
return {principal:'300.00',juros:'7.50',multa:'10.00',total:'317.50',preview_hash:'a'.repeat(64),
parcelas:(body.parcelas||[{vencimento:'2090-01-31',valor:'105.84'},{vencimento:'2090-02-28',valor:'105.83'},{vencimento:'2090-03-31',valor:'105.83'}]).map((p,i)=>({...p,numero:i+1,rateios:[{titulo_origem_id:1,obra_id:3,valor:'35.28'},{titulo_origem_id:2,obra_id:4,valor:'70.56'}]}))};}
export async function confirmarNegociacaoTitulos(body,chave){
window.envios=window.envios||[];window.envios.push({body,chave});await new Promise(r=>setTimeout(r,180));
if(window.envios.length===1)throw new Error('Falha simulada de rede. Tente novamente.');
return {id:5,titulos:[{id:31,codigo:'TIT-000031',valor:'105.84',vencimento:'2090-01-31'}]};}`;
const server = await createServer({ root, configFile: false, logLevel: 'error', server: { host: '127.0.0.1', port: 0 },
  plugins: [{ name: 'fixture-negociacao', enforce: 'pre',
    resolveId(id) { if (id === '/fixture.jsx') return '\0fixture-negociacao.jsx'; },
    async load(id) { if (id === '\0fixture-negociacao.jsx') return transformWithEsbuild(fixture, 'fixture.jsx', { loader: 'jsx', jsx: 'transform' }); },
    transform(code, id) { if (id.endsWith('/src/services/financeiro.js')) return mockService; },
    configureServer(s) { s.middlewares.use(async (req, res, next) => {
      if (new URL(req.url,'http://localhost').pathname !== '/fixture') return next();
      res.setHeader('Content-Type', 'text/html');
      res.end(await s.transformIndexHtml('/fixture', '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
    }); }
  }, react()], optimizeDeps: { include: ['react', 'react-dom/client', 'react-router-dom'] } });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/fixture`);
  const css = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8').match(/href="\/assets\/([^\"]+\.css)"/)[1];
  await page.addStyleTag({ path: path.join(root, 'dist/assets', css) });
  const confirmar = page.getByRole('button', { name: 'Confirmar negociação' });
  await confirmar.waitFor(); assert.equal(await confirmar.isDisabled(), true);
  await page.getByLabel('Motivo da negociação').fill('Negociação de saldos com fornecedor');
  await page.getByLabel('Quantidade de parcelas').fill('3');
  await page.getByLabel('Primeiro vencimento').fill('2090-01-31');
  await page.getByLabel('Forma de pagamento', { exact: true }).selectOption('1');
  await page.getByLabel('Chave PIX ou copia e cola', { exact: true }).fill('pix-qa');
  await page.getByRole('button', { name: 'Validar prévia' }).click();
  await page.getByRole('checkbox').waitFor(); assert.equal(await confirmar.isDisabled(), true);
  await page.getByRole('checkbox').check(); assert.equal(await confirmar.isDisabled(), false);
  await page.getByLabel('Valor da parcela 1', { exact: true }).fill('106.84');
  assert.equal(await confirmar.isDisabled(), true);
  await page.getByLabel('Valor da parcela 2', { exact: true }).fill('104.83');
  await page.getByRole('button', { name: 'Validar prévia' }).click();
  await page.getByRole('checkbox').waitFor();
  assert.equal(await page.evaluate(() => window.payloadPreview.parcelas[0].valor), '106.84');
  const out = path.resolve(root, '../outputs/renegociacao'); fs.mkdirSync(out, { recursive: true });
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(100);
    const bounds = await page.getByRole('dialog').evaluate(el => {
      const panel = el.firstElementChild.getBoundingClientRect();
      return { right: panel.right, left: panel.left, width: innerWidth };
    });
    assert.ok(bounds.left >= 0 && bounds.right <= bounds.width + 1, JSON.stringify(bounds));
    await page.screenshot({ path: path.join(out, `modal-${width}.png`) });
  }
  await page.getByRole('checkbox').check();
  await confirmar.click();
  await page.getByRole('alert').filter({ hasText: 'Falha simulada' }).waitFor();
  await confirmar.click();
  await page.getByRole('link', { name: 'TIT-000031' }).waitFor();
  const envios = await page.evaluate(() => window.envios);
  assert.equal(envios.length, 2); assert.equal(envios[0].chave, envios[1].chave);
  assert.deepEqual(envios[0].body, envios[1].body); assert.deepEqual(errors, []);
  console.log('OK: modal desktop/mobile, prévia, edição invalida confirmação, aceite obrigatório, retry idempotente e links. Serviços simulados; sem API externa.');
  const alternate=async()=>{const count=await page.evaluate(()=>window.reads);await page.evaluate(()=>window.qaTab(false));await page.getByText('Consulta auxiliar',{exact:true}).waitFor();await page.evaluate(()=>window.qaTab(true));await page.waitForFunction(count=>window.reads>count,count);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))};
  for(const width of [1366,390]){
    await page.setViewportSize({width,height:900});await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/fixture?workspace`);await page.addStyleTag({path:path.join(root,'dist/assets',css)});
    const motivo=page.getByLabel('Motivo da negociação',{exact:true}), confirmar=page.getByRole('button',{name:'Confirmar negociação',exact:true});
    await motivo.fill('Motivo com última tecla Z');await page.getByLabel('Quantidade de parcelas',{exact:true}).fill('3');
    await page.getByLabel('Forma de pagamento',{exact:true}).selectOption('1');await page.getByLabel('Chave PIX ou copia e cola',{exact:true}).fill('pix-qa');await alternate();
    assert.equal(await motivo.inputValue(),'Motivo com última tecla Z');assert.equal(await page.evaluate(()=>window.previas||0),0);assert.equal(await page.evaluate(()=>window.envios?.length||0),0);
    await page.getByRole('button',{name:'Validar prévia',exact:true}).evaluate(el=>{el.click();el.click()});await page.getByRole('checkbox').waitFor();assert.equal(await page.evaluate(()=>window.previas),1);
    await page.getByLabel('Valor da parcela 1',{exact:true}).fill('106.84');await page.getByLabel('Valor da parcela 2',{exact:true}).fill('104.83');
    await page.getByRole('button',{name:'Validar prévia',exact:true}).click();await page.getByRole('checkbox').check();assert.equal(await confirmar.isDisabled(),false);
    await alternate();assert.equal(await page.getByLabel('Valor da parcela 1',{exact:true}).inputValue(),'106.84');assert.equal(await page.getByRole('checkbox').count(),0);assert.ok(await confirmar.isDisabled());
    assert.equal(await page.evaluate(()=>window.previas),2);assert.equal(await page.evaluate(()=>window.envios?.length||0),0);
    const draft=await page.evaluate(()=>window.memory.get('negociacao-qa|'+encodeURIComponent('negociacao:1:2')));
    assert.ok(draft.fields.motivo);assert.deepEqual(Object.keys(draft.fields.parcelas[0]).sort(),['valor','vencimento']);
    assert.equal(Object.hasOwn(draft,'preview_hash'),false);assert.equal(Object.hasOwn(draft.fields,'aceite'),false);
    await page.evaluate(()=>window.titulos[0].valor_saldo=95);await alternate();await page.getByRole('alert').filter({hasText:'Os saldos ou dados'}).waitFor();assert.ok(await motivo.isDisabled());
    await page.getByRole('button',{name:'Validar prévia',exact:true}).evaluate(el=>el.click());assert.equal(await page.evaluate(()=>window.previas),2);
    await page.getByRole('button',{name:'Descartar negociação digitada',exact:true}).click();assert.equal(await motivo.inputValue(),'');assert.equal(await page.getByLabel('Valor da parcela 1',{exact:true}).count(),0);
    await motivo.fill('Nova negociação');await page.getByLabel('Forma de pagamento',{exact:true}).selectOption('1');await page.getByLabel('Chave PIX ou copia e cola',{exact:true}).fill('pix-qa');await page.getByRole('button',{name:'Validar prévia',exact:true}).click();await page.getByRole('checkbox').check();
    await confirmar.evaluate(el=>{el.click();el.click()});await page.getByRole('alert').filter({hasText:'Falha simulada'}).waitFor();assert.equal(await page.evaluate(()=>window.envios.length),1);
    await confirmar.evaluate(el=>{el.click();el.click()});await page.getByRole('link',{name:'TIT-000031',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.envios.length),2);
    assert.equal(await page.evaluate(()=>window.envios[0].chave===window.envios[1].chave),true);
    await alternate();assert.equal(await motivo.inputValue(),'');assert.equal(await page.evaluate(()=>window.envios.length),2);assert.equal(await page.getByRole('checkbox').count(),0);
    await page.evaluate(()=>{window.titulos.forEach(t=>{t.parceiro_id=77;t.parceiro={nome:'Novo credor QA'}});window.qaRows(structuredClone(window.titulos))});
    await page.waitForFunction(()=>document.querySelector('input[role="combobox"]')?.value==='Novo credor QA');
    await motivo.fill('Não autorizar título baixado');await page.evaluate(()=>{window.titulos[0].status='QUITADO';window.titulos[0].valor_saldo=0});await alternate();
    await page.getByRole('alert').filter({hasText:'não estão disponíveis'}).waitFor();assert.ok(await confirmar.isDisabled());assert.ok(await motivo.isDisabled());
    await page.evaluate(()=>window.denied=true);await alternate();await page.getByText('Negociação indisponível',{exact:true}).waitFor();assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.getByText('TIT-000101',{exact:true}).count(),0);
    await page.evaluate(()=>{window.denied=false;window.readonly=true});await alternate();assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.evaluate(()=>window.envios.length),2);
    console.log('OK negociação workspace '+width+'px: campos/parcelas, GET atual, prévia/aceite não restaurados, conflito/status/negativa, envio único e retry.');
  }
  assert.deepEqual(errors,[]);
} finally { await browser.close(); await server.close(); }
