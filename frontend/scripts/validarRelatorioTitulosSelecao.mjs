import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'src/pages/FinanceiroTitulos.jsx'), 'utf8');
const handler = source.slice(source.indexOf('async function abrirRelatorio()'), source.indexOf('function baixarRelatorio()'));
const buttonStart = source.indexOf('{canExportTitulos && <button');
const button = source.slice(buttonStart, source.indexOf('</button>}', buttonStart) + '</button>}'.length);
assert.ok(handler.includes('selectedTitulos.map'));
assert.ok(source.includes('relatorioSelecaoCount > 0'));

// Handler, botao, service HTTP e CSS reais; lista de QA e API interceptada.
const fixture = `import React,{useState,useRef}from 'react';import{createRoot}from 'react-dom/client';
import{HiOutlineDocumentText}from 'react-icons/hi2';
import{gerarRelatorioTitulosFinanceirosPdf}from '/src/services/financeiro.js';
import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/escala.css';import '/src/styles/componentes-padrao.css';
function Fixture(){
  const[selected,setSelected]=useState([]),[relatorioLoading,setRelatorioLoading]=useState(false),[relatorioSelecaoCount,setRelatorioSelecaoCount]=useState(0);
  const[relatorioModalOpen,setRelatorioModalOpen]=useState(false),[relatorioError,setRelatorioError]=useState(''),[relatorioPdfUrl,setRelatorioPdfUrl]=useState('');
  const[relatorioFilename,setRelatorioFilename]=useState(''),relatorioRequestIdRef=useRef(0);
  const canExportTitulos=new URLSearchParams(location.search).get('permission')!=='none',loading=false,hasConsulted=true,tipoReferencia='PAGAR';
  const appliedFilters={tipo:'PAGAR',status:'ABERTO',obra_id:10},compactFilters=x=>x,selectedTitulos=selected.map(id=>({id}));
  ${handler}
  return <main className="p-4" style={{color:'var(--c-text)',background:'var(--c-bg)',minHeight:'100vh'}}><section className="card p-4">
    <h1>Contas a Pagar</h1><p>3 títulos nos filtros aplicados</p>
    {[1,2,3].map(id=><label key={id} className="block my-3"><input aria-label={'Selecionar TIT-00000'+id} type="checkbox" checked={selected.includes(id)} onChange={e=>setSelected(old=>e.target.checked?[...old,id]:old.filter(v=>v!==id))}/> TIT-00000{id}</label>)}
    ${button}
    {relatorioModalOpen&&<p role="status">{relatorioLoading?'Gerando...':relatorioError|| (relatorioSelecaoCount>0?relatorioSelecaoCount+' selecionados':'Todos os filtrados')}</p>}
    <output>{relatorioPdfUrl&&relatorioFilename}</output>
  </section></main>;
}createRoot(document.getElementById('root')).render(<Fixture/>);`;
const server = await createServer({ root, configFile: false, logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
  plugins: [{ name: 'report-selection-fixture', enforce: 'pre',
    resolveId(id) { if (id === '/fixture.jsx') return '\0report-selection-fixture.jsx'; },
    async load(id) { if (id === '\0report-selection-fixture.jsx') return transformWithEsbuild(fixture, 'fixture.jsx', { loader: 'jsx', jsx: 'transform' }); },
    configureServer(vite) { vite.middlewares.use(async (req,res,next) => {
      if (new URL(req.url,'http://localhost').pathname !== '/fixture') return next();
      res.setHeader('Content-Type','text/html'); res.end(await vite.transformIndexHtml('/fixture','<html lang="pt-BR"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
    }); }
  },react()], optimizeDeps: { include: ['react','react-dom/client'] }
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const page = await browser.newPage({ viewport: { width: 1280,height: 800 } });
  const calls=[],errors=[]; let reject=false;
  page.on('pageerror', error=>errors.push(error.message));
  await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.pathname.endsWith('/financeiro/titulos/relatorio.pdf')){
      calls.push({method:req.method(),query:Object.fromEntries(url.searchParams),body:req.postDataJSON()});
      return reject?route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'Atualize a selecao'})})
        :route.fulfill({status:200,contentType:'application/pdf',headers:{'content-disposition':'inline; filename="relatorio-qa.pdf"'},body:'%PDF-QA'});
    }
    return url.hostname==='127.0.0.1'?route.continue():route.abort();
  });
  const url=`http://127.0.0.1:${server.httpServer.address().port}/fixture`;
  await page.goto(url);
  await page.getByRole('button',{name:'Gerar relatorio',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Todos os filtrados'}).waitFor();
  assert.equal(calls[0].method,'GET');assert.equal(calls[0].body,null);
  assert.equal(calls[0].query.obra_id,'10');
  await page.getByRole('checkbox',{name:'Selecionar TIT-000001'}).check();
  await page.getByRole('checkbox',{name:'Selecionar TIT-000003'}).check();
  const selectedButton=page.getByRole('button',{name:'Gerar relatorio (2)',exact:true});
  assert.equal(await selectedButton.getAttribute('title'),'Gerar PDF somente com os titulos selecionados');
  await selectedButton.click();await page.getByRole('status').filter({hasText:'2 selecionados'}).waitFor();
  assert.equal(calls[1].method,'POST');assert.deepEqual(calls[1].body,{titulo_ids:[1,3]});
  assert.equal(calls[1].query.status,'ABERTO');
  await page.getByRole('checkbox',{name:'Selecionar TIT-000001'}).uncheck();
  await page.getByRole('checkbox',{name:'Selecionar TIT-000003'}).uncheck();
  await page.getByRole('button',{name:'Gerar relatorio',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Todos os filtrados'}).waitFor();
  assert.equal(calls[2].method,'GET');
  reject=true;await page.getByRole('checkbox',{name:'Selecionar TIT-000002'}).check();
  await page.getByRole('button',{name:'Gerar relatorio (1)',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Atualize a selecao'}).waitFor();
  assert.equal(calls.length,4,'Erro de selecao nao tenta GET de todos os filtrados');
  reject=false;
  await page.goto(url+'?permission=none');assert.equal(await page.getByRole('button').count(),0);
  const output=path.resolve(root,'../outputs/qa-relatorio-selecao');mkdirSync(output,{recursive:true});
  for(const[theme,width]of[['light',1280],['dark',1280],['dark',390]]){
    await page.setViewportSize({width,height:800});await page.goto(url);
    await page.evaluate(value=>document.documentElement.classList.toggle('dark',value==='dark'),theme);
    await page.getByRole('checkbox',{name:'Selecionar TIT-000001'}).check();
    await page.screenshot({path:path.join(output,theme+'-'+width+'.png')});
  }
  assert.deepEqual(errors,[]);
  console.log('UI de relatorio: handler/botao/service reais, GET sem selecao, POST com IDs, filtros preservados, limpeza da selecao, erro sem fallback e permissao validados. APIs interceptadas.');
}finally{if(browser)await browser.close();await server.close();}
