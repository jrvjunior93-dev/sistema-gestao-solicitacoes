// Edicao real; fronteiras HTTP/sessao simuladas. Sem escrita externa.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prefix = '\0qa-titulo-encargos-';
const plugin = { name: 'qa-titulo-encargos', enforce: 'pre',
  resolveId(source, importer) {
    if (source.endsWith('/ThemeContext')) return prefix + 'tema';
    if (!importer?.endsWith('/FinanceiroTituloEditar.jsx')) return;
    if (source === '../components/padrao') return prefix + 'padrao';
    if (source.startsWith('../services/')) return prefix + 'api';
  },
  load(id) {
    if (id === prefix + 'tema') return `export const useTheme=()=>({tema:{}});`;
    if (id === prefix + 'padrao') return `
      export{default as Pagina}from'/src/components/padrao/Pagina.jsx';
      export{default as PageHeader}from'/src/components/padrao/PageHeader.jsx';
      export{default as BlocoConteudo}from'/src/components/padrao/BlocoConteudo.jsx';
      export{FormSecao,CampoForm}from'/src/components/padrao/FormSecao.jsx';
      const avisar={erro:message=>window.__avisos.push(message),sucesso:()=>{}};
      export const Avisos=()=>null,useAvisos=()=>({avisos:[],fechar:()=>{},limpar:()=>{},avisar});`;
    if (id === prefix + 'api') return `
      const parceiro={id:1,nome:'Credor QA',fornecedor:true};
      const categoria={id:1,nome:'Despesa QA',tipo:'DESPESA',considera_dre:false};
      export const getTituloFinanceiroById=async()=>({id:1,codigo:'TIT-QA',tipo:'PAGAR',status:window.__blocked?'QUITADO':'ABERTO',
        obra_id:1,parceiro_id:1,categoria_financeira_id:1,empresa_id:1,descricao:'Pagamento QA',valor_original:200,
        valor_bruto:200,valor_saldo:200,valor_baixado:window.__blocked?200:0,juros:10,multa:3,
        data_vencimento:'2026-10-20',competencia_data:'2026-10-08',parceiro,categoriaFinanceira:categoria,movimentos:[],paymentIntents:[]});
      export const getMinhasObras=async()=>[{id:1,nome:'Obra QA',empresa_grupo_id:1}];
      export const getCategoriasFinanceiras=async()=>[categoria];
      export const getEmpresasGrupo=async()=>[{id:1,nome:'Empresa QA'}];
      export const listarApropriacoes=async()=>[],buscarParceiros=async()=>[parceiro],getPaymentBeneficiaries=async()=>[];
      export const atualizarTituloFinanceiro=async(id,payload)=>{window.__saves.push(payload);return{id}};
      export const atualizarPaymentBeneficiary=async()=>{},criarPaymentBeneficiary=async()=>{};`;
  },
  configureServer(server) { server.middlewares.use('/qa-titulo-encargos', async (_, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(await server.transformIndexHtml('/qa-titulo-encargos', `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter,Routes,Route}from'react-router-dom';import Page from '/src/pages/FinanceiroTituloEditar.jsx';import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/componentes-padrao.css';import '/src/styles/responsive-system.css';window.__saves=[];window.__avisos=[];window.__blocked=new URLSearchParams(location.search).has('blocked');createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,React.createElement(Routes,null,React.createElement(Route,{path:'*',element:React.createElement(Page)}))));</script></body></html>`));
  }); }
};
const server = await createServer({ root, plugins: [plugin], cacheDir: 'node_modules/.vite-qa-titulo-encargos',
  server: { host: '127.0.0.1', port: 5319, strictPort: true, proxy: {} } });
await server.listen(); let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const page = await browser.newPage(); const errors = [], external = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => { if (new URL(route.request().url()).origin === 'http://127.0.0.1:5319') return route.continue(); external.push(route.request().url()); return route.abort(); });
  await page.goto('http://127.0.0.1:5319/qa-titulo-encargos');
  const juros = page.getByLabel('Juros do título', { exact: true }), multa = page.getByLabel('Multa do título', { exact: true });
  await juros.waitFor(); assert.match(await juros.inputValue(), /10,00$/); assert.match(await multa.inputValue(), /3,00$/);
  await juros.fill('15,50'); await multa.fill('4,25');
  await page.getByText(/Total previsto com juros e multa:.*219,75/).waitFor();
  await page.setViewportSize({width:390,height:844});
  await juros.scrollIntoViewIfNeeded();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({path:path.join(root,'../outputs/titulo-encargos-mobile.png')});
  await page.setViewportSize({width:1366,height:900}); await juros.scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(root,'../outputs/titulo-encargos-desktop.png')});
  await page.getByRole('button', { name: /Salvar/ }).last().click();
  await page.waitForFunction(() => window.__saves.length === 1);
  const payload = await page.evaluate(() => window.__saves[0]);
  assert.equal(payload.juros, 15.5); assert.equal(payload.multa, 4.25); assert.equal(payload.valor, 200);
  await page.goto('http://127.0.0.1:5319/qa-titulo-encargos?blocked=1');
  await juros.waitFor(); assert(await juros.isDisabled()); assert(await multa.isDisabled());
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  console.log('OK: edicao real, hidratacao, campos em reais separados, total, payload e bloqueio de baixado; desktop/mobile. APIs isoladas.');
} finally { await browser?.close(); await server.close(); }
