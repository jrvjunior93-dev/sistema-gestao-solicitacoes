// Modal real nos tres modos; API em memoria, sem banco/rede externa.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '../outputs/rh-pagamento-50'); mkdirSync(out, { recursive: true });
const fixture = `import React,{useState,useMemo} from 'react';import{createRoot}from'react-dom/client';import Modal from'/src/components/rh/RhDpPagamentoModal.jsx';
import{WorkspacePageContext,createWorkspaceMemory}from'/src/navigation/WorkspaceContext.jsx';
import{ThemeContext,TEMA_PADRAO}from'/src/contexts/ThemeContext.jsx';
import'/src/index.css';import'/src/styles/design-tokens.css';import'/src/styles/componentes-padrao.css';import'/src/styles/escala.css';import'/src/styles/responsive-system.css';import'/src/styles/rh-pessoal-locais.css';
const q=new URLSearchParams(location.search);const modo=q.get('modo');window.envios=[];window.chamadas=[];window.fechados=0;window.erros=[];
const linha={salario_base:3000,forma_calculo_gerencial:'MENSAL',dias:30,faltas:0,acrescimos:0,descontos:0,
parcela_40:false,parcela_60:false,conferido_obra:false,conferido_dp:false,modo_recebimento:'PIX',chave_pix:'qa@example.test'};
const lista=[{...linha,colaborador_id:11,nome:'Ana QA'},{...linha,colaborador_id:12,nome:'Bruno QA'},
{...linha,colaborador_id:13,nome:'Diaria QA',forma_calculo_gerencial:'DIARIA',valor_diaria:100,dias:5}];
window.api=async(p,o={})=>{window.chamadas.push([p,structuredClone(o)]);await new Promise(r=>setTimeout(r,80));
if(o.method==='DELETE'){window.exclusoes=(window.exclusoes||0)+1;window.pedido=null;return {excluido:true};}
if(o.method==='POST'&&p==='/preparar'&&!window.pedido?.id){const ids=o.data.colaborador_ids||(o.data.colaborador_id?[o.data.colaborador_id]:null);
window.pedido={id:null,codigo:null,obra_id:7,situacao:'RASCUNHO',dados_json:{revisao:0,competencia:'2026-10',data_vencimento:'2026-10-15',linhas:lista.filter(l=>!ids||ids.includes(l.colaborador_id)).map(l=>({...l,selecionado:!!ids}))}};}
if(o.method==='POST'&&p==='/salvar'){if(window.falhar){window.falhar=false;throw new Error('Falha simulada no primeiro save');}window.pedido={...window.pedido,id:51,codigo:'RH-000051',dados_json:{...structuredClone(o.data.dados),revisao:1}};
if(q.has('antigo'))window.pedido.dados_json.linhas.forEach(l=>delete l.parcela_50);}
if(o.method==='PUT'){window.pedido.dados_json={...structuredClone(o.data),revisao:window.pedido.dados_json.revisao+1};
if(q.has('antigo'))window.pedido.dados_json.linhas.forEach(l=>delete l.parcela_50);}
if(p.endsWith('/enviar')){window.envios.push(structuredClone(window.pedido.dados_json));window.pedido.situacao='ABERTA';}
return structuredClone({solicitacao:window.pedido,pode_conferir:false,pode_enviar_fila:false,
pode_excluir_rascunho:!!window.pedido?.id&&window.pedido.situacao==='RASCUNHO',responsaveis:[],avisos:[]});};
function App(){const[aberto,A]=useState(true);const[ativo,T]=useState(true);const memory=useMemo(()=>createWorkspaceMemory(),[]);window.qaTab=T;
return <WorkspacePageContext.Provider value={{key:'pagamento50',memory,snapshot:true,active:ativo}}><main className="layout-main">
<button onClick={()=>A(true)}>Abrir pagamento</button>{aberto&&ativo&&<Modal local={{id:7,nome:'Obra QA'}} colaborador={modo==='individual'?{id:11}:undefined}
colaboradorIds={modo==='selecionados'?[11,12]:undefined} onFechar={()=>{window.fechados++;A(false);}}/>}</main></WorkspacePageContext.Provider>;}
createRoot(document.getElementById('root')).render(<ThemeContext.Provider value={{tema:TEMA_PADRAO}}><App/></ThemeContext.Provider>);`;
const server = await createServer({ root, configFile: false, logLevel: 'error', cacheDir: path.join(out, 'vite-cache'),
  server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'qa-pagamento50', enforce: 'pre',
    resolveId(id) { if (id === '/fixture.jsx') return '\0pagamento50.jsx'; },
    async load(id) { if (id === '\0pagamento50.jsx') return transformWithEsbuild(fixture, 'fixture.jsx', { loader: 'jsx', jsx: 'transform' }); },
    transform(code, id) { if (id.endsWith('/src/services/rhDp.js')) return 'export const pagamentoRhSolicitacao=(...args)=>window.api(...args);'; },
    configureServer(s) { s.middlewares.use(async (req,res,next) => { if (new URL(req.url,'http://localhost').pathname !== '/') return next();
      res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml('/', '<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>')); }); }
  }, react()] });
let browser, page; const errors = [];
try {
  await server.listen(); browser = await chromium.launch({ channel:'chrome', headless:true });
  page = await browser.newPage({ viewport:{width:1366,height:900} }); page.setDefaultTimeout(12000);
  page.on('pageerror', e=>errors.push(e.message)); const base=server.resolvedUrls.local[0];
  await page.route('**/*', r=>r.request().url().startsWith(base)?r.continue():r.abort());
  for (const modo of ['individual','todos','selecionados']) for (const width of [1366,390]) {
    await page.setViewportSize({width,height:900}); await page.goto(base+'?modo='+modo);
    const modal=page.getByRole('dialog',{name:'Solicitar pagamento',exact:true});
    await modal.getByLabel('50%: Ana QA',{exact:true}).waitFor();
    if(modo==='todos')await modal.getByLabel('Selecionar todos',{exact:true}).check();
    if(modo==='individual')await modal.getByLabel('50%: Ana QA',{exact:true}).check();
    else await modal.getByLabel('Aplicar aos selecionados',{exact:true}).selectOption('50');
    assert.equal(await modal.getByLabel('50%: Ana QA',{exact:true}).isChecked(),true);
    assert.equal(await modal.getByLabel('40%: Ana QA',{exact:true}).isChecked(),false);
    assert.ok((await modal.locator('tbody tr').first().innerText()).includes('1.500,00'));
    if(modo==='todos') {assert.equal(await modal.getByLabel('50%: Diaria QA',{exact:true}).isDisabled(),true);
      assert.ok((await modal.locator('tbody tr').nth(2).innerText()).includes('500,00'));}
    await modal.getByLabel('50%: Ana QA',{exact:true}).uncheck();
    assert.equal(await modal.getByLabel('100%: Ana QA',{exact:true}).isChecked(),true);
    await modal.getByLabel('50%: Ana QA',{exact:true}).check();
    await modal.getByLabel('60%: Ana QA',{exact:true}).check();
    assert.equal(await modal.getByLabel('50%: Ana QA',{exact:true}).isChecked(),false);
    await modal.getByLabel('50%: Ana QA',{exact:true}).check();
    assert.equal(await modal.getByLabel('60%: Ana QA',{exact:true}).isChecked(),false);
    await modal.getByLabel('Acréscimos: Ana QA',{exact:true}).fill('2000');
    await modal.getByLabel('Descontos: Ana QA',{exact:true}).fill('1000');
    assert.ok((await modal.locator('tbody tr').first().innerText()).includes('1.510,00'));
    await modal.getByLabel('Aplicar aos selecionados',{exact:true}).selectOption('conferir');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await modal.screenshot({path:path.join(out,modo+'-'+width+'.png')});
    await modal.getByRole('button',{name:'Solicitar pagamento',exact:true}).click();
    const confirm=page.getByRole('dialog',{name:'Solicitar pagamento ao DP',exact:true});
    await confirm.getByRole('button',{name:'Solicitar pagamento',exact:true}).click();
    await page.waitForFunction(()=>window.envios.length===1);
    const enviado=await page.evaluate(()=>window.envios[0]);
    assert.equal(enviado.linhas[0].parcela_50,true);assert.equal(enviado.linhas[0].acrescimos,20);assert.equal(enviado.linhas[0].descontos,10);
    assert.equal(enviado.linhas.length,modo==='individual'?1:modo==='todos'?3:2);
  }
  await page.goto(base+'?modo=individual&antigo');
  const modal=page.getByRole('dialog',{name:'Solicitar pagamento',exact:true});
  await modal.getByLabel('50%: Ana QA',{exact:true}).check();
  await modal.getByLabel('Conferido: Ana QA',{exact:true}).check();
  await page.getByText(/O servidor não confirmou o pagamento de 50%/).first().waitFor();
  assert.equal(await page.evaluate(()=>window.envios.length),0,'Backend antigo nao pode gerar 100% silenciosamente');
  // Abrir/editar/editor/retorno de aba/fechar nao persistem antes de Salvar ou Conferido.
  for(const width of [1366,390]){
    await page.setViewportSize({width,height:900});await page.goto(base+'?modo=individual');
    const m=page.getByRole('dialog',{name:'Solicitar pagamento',exact:true});
    await m.getByLabel('50%: Ana QA',{exact:true}).waitFor();
    await m.getByLabel('Acréscimos: Ana QA',{exact:true}).fill('2000');
    await page.evaluate(()=>new Promise(r=>setTimeout(r,1100)));
    assert.equal(await page.evaluate(()=>window.chamadas.filter(c=>c[0]==='/salvar'||c[1].method==='PUT').length),0);
    await page.evaluate(()=>window.qaTab(false));await m.waitFor({state:'hidden'});
    await page.evaluate(()=>window.qaTab(true));
    assert.ok((await m.getByLabel('Acréscimos: Ana QA',{exact:true}).inputValue()).includes('20,00'));
    assert.equal(await page.evaluate(()=>window.pedido.id),null);
    await m.screenshot({path:path.join(out,`previa-${width}.png`)});
    await m.getByRole('button',{name:'Solicitar pagamento',exact:true}).click();
    await page.getByText(/Salve o rascunho ou marque como Conferido/).waitFor();
    assert.equal(await page.evaluate(()=>window.chamadas.filter(c=>c[0]==='/salvar').length),0);
    await m.getByRole('button',{name:'Fechar',exact:true}).click();await m.waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>window.pedido.id),null);
    await page.getByRole('button',{name:'Abrir pagamento',exact:true}).click();
    await m.getByLabel('Acréscimos: Ana QA',{exact:true}).waitFor();
    await page.evaluate(()=>{window.falhar=true;});
    await m.getByRole('button',{name:'Salvar',exact:true}).click();
    await page.getByText('Falha simulada no primeiro save',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.pedido.id),null);
    const salvar=m.getByRole('button',{name:'Salvar',exact:true});
    await Promise.all([salvar.click(),salvar.click()]);
    await page.waitForFunction(()=>window.pedido.id===51);
    assert.equal(await page.evaluate(()=>window.chamadas.filter(c=>c[0]==='/salvar').length),2,'Uma falha e um save, sem duplicacao pelo clique duplo');
    assert.equal(await page.evaluate(()=>window.pedido.dados_json.linhas[0].acrescimos),20);
    await m.screenshot({path:path.join(out,`rascunho-salvo-${width}.png`)});
    await m.getByRole('button',{name:'Excluir rascunho',exact:true}).click();
    const confirmar=page.getByRole('dialog',{name:'Excluir rascunho de pagamento',exact:true});
    await confirmar.getByRole('button',{name:'Cancelar',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.exclusoes||0),0);
    await m.getByRole('button',{name:'Excluir rascunho',exact:true}).click();
    await confirmar.getByRole('button',{name:'Excluir rascunho',exact:true}).click();
    await m.waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>window.exclusoes),1);
    await page.getByRole('button',{name:'Abrir pagamento',exact:true}).click();
    await m.getByLabel('Conferido: Ana QA',{exact:true}).check();
    await page.waitForFunction(()=>window.pedido.id===51);
    assert.equal(await page.evaluate(()=>window.pedido.dados_json.linhas[0].conferido_obra),true);
    assert.equal(await page.evaluate(()=>window.chamadas.filter(c=>c[0]==='/salvar').length),3);
  }
  assert.deepEqual(errors,[]);
  console.log('50% e previa UI: tres modos desktop/mobile, sem gravacao ao abrir/editar/fechar/retorno, save/conferido explicito, falha/retry/duplo clique e exclusao com confirmacao. Sem banco/rede externa.');
} catch(e) { if(page)await page.screenshot({path:path.join(out,'falha.png')}); throw e; }
finally { await browser?.close();await server.close(); }
