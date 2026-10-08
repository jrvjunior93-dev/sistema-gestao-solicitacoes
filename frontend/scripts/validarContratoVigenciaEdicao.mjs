// Pagina, DateInputBR, permissoes e servicos reais com HTTP/sessao simulados.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prefix = '\0qa-vigencia-';
const plugin = { name: 'qa-vigencia', enforce: 'pre',
  resolveId(source) {
    if (source.endsWith('/AuthContext')) return prefix + 'auth';
    if (source.endsWith('/ThemeContext')) return prefix + 'theme';
    if (/\/services\/api$/.test(source) || source === './api') return prefix + 'api';
  },
  load(id) {
    if (id === prefix + 'auth') return `const user=location.search.includes('leitura')?{id:1,perfil:'USUARIO',areas_permissoes:['contratos.geral.visualizar']}:{id:1,perfil:'SUPERADMIN'};export const useAuth=()=>({user});`;
    if (id === prefix + 'theme') return `export const useTheme=()=>({tema:{}});`;
    if (id === prefix + 'api') return `export const API_URL='/qa-api',API_ORIGIN='';export const authHeaders=(extra={})=>extra,fileUrl=p=>p,getAuthToken=()=>null,getAuditSessionId=()=>null;`;
  },
  configureServer(server) {
    server.middlewares.use('/qa-vigencia', async (_, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end(await server.transformIndexHtml('/qa-vigencia', `<html><body><div id="root" class="layout-shell"></div><script type="module">
        import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';
        import Page from '/src/pages/GestaoContratos.jsx';import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/escala.css';import '/src/styles/componentes-padrao.css';import '/src/styles/responsive-system.css';
        createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,React.createElement(Page)));
      </script></body></html>`));
    });
  }
};
const server = await createServer({ root, configFile: false, envFile: false, plugins: [plugin, react()],
  server: { host: '127.0.0.1', port: 0, proxy: {} } });
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  page.setDefaultTimeout(15000);
  const errors = [], requests = [];
  let contrato = { id: 1, obra_id: 7, codigo: 'CT-QA', ref_contrato: 'Contrato QA', fluxo_novo: true,
    valor_total: 1000, ajuste_solicitado: 0, ajuste_pago: 0, apropriacoes: [], credores: [],
    vigencia_inicio: '2026-01-01', vigencia_fim: '2026-12-31', obra: { id: 7, codigo: '7', nome: 'Obra QA' } };
  page.on('pageerror', e => { errors.push(e.message); console.error(e.message); });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { errors.push('Requisicao externa bloqueada'); return route.abort(); }
    if (!url.pathname.startsWith('/qa-api')) return route.continue();
    let body = [];
    if (url.pathname === '/qa-api/contratos/resumo') body = [contrato];
    else if (url.pathname === '/qa-api/obras') body = [contrato.obra];
    else if (url.pathname === '/qa-api/contratos/1' && route.request().method() === 'PATCH') {
      const patch = route.request().postDataJSON(); requests.push(patch);
      contrato = { ...contrato, ...patch }; body = contrato;
    } else if (url.pathname.includes('/operacional')) body = null;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(origin + '/qa-vigencia');
  await page.getByText('CT-QA', { exact: true }).first().click();
  const editar = page.getByRole('button', { name: 'Editar', exact: true });
  await editar.click();
  const inicio = page.getByLabel('Início da vigência', { exact: true });
  const fim = page.getByLabel('Fim da vigência', { exact: true });
  const salvar = page.getByRole('button', { name: 'Salvar contrato', exact: true });
  assert.equal(await inicio.inputValue(), '01/01/2026'); assert.equal(await fim.inputValue(), '31/12/2026');
  await fim.fill('30/02/2026'); await salvar.click();
  assert.equal(await fim.evaluate(el => el.checkValidity()), false); assert.equal(requests.length, 0);
  await fim.fill('12/'); await salvar.click();
  assert.equal(await fim.evaluate(el => el.checkValidity()), false); assert.equal(requests.length, 0);
  await fim.fill('31/12/2025'); await salvar.click();
  await page.getByText('O fim da vigência deve ser igual ou posterior ao início.', { exact: true }).waitFor();
  assert.equal(requests.length, 0);
  await fim.fill('31/01/2027');
  await salvar.evaluate(el => { el.click(); el.click(); });
  await fim.waitFor({ state: 'detached' });
  assert.equal(requests.length, 1); assert.equal(requests[0].vigencia_fim, '2027-01-31');
  assert.equal(requests[0].vigencia_inicio, undefined);
  await editar.click(); assert.equal(await fim.inputValue(), '31/01/2027');
  await page.setViewportSize({ width: 390, height: 844 });
  await fim.scrollIntoViewIfNeeded();
  const campoMobile = await fim.boundingBox();
  assert(campoMobile.x >= 0 && campoMobile.x + campoMobile.width <= 390);
  await page.setViewportSize({ width: 1366, height: 768 });
  await salvar.click(); await page.getByText('Nenhuma alteração para salvar.', { exact: true }).waitFor();
  assert.equal(requests.length, 1);
  await page.getByLabel('Ref. do Contrato', { exact: true }).last().fill('Referencia corrigida');
  await salvar.click(); await fim.waitFor({ state: 'detached' });
  assert.equal(requests.length, 2); assert.equal(requests[1].vigencia_fim, undefined);
  await editar.click(); await fim.fill(''); await salvar.click(); await fim.waitFor({ state: 'detached' });
  assert.equal(requests[2].vigencia_fim, null);
  await page.goto(origin + '/qa-vigencia?leitura');
  await page.getByText('CT-QA', { exact: true }).first().click();
  assert.equal(await editar.count(), 0);
  assert.deepEqual(errors, []);
  console.log('OK UI real: datas existentes, invalida/parcial/invertida, salvamento, duplo clique, reabertura, sem alteracoes, PATCH parcial, limpeza e permissao de leitura. APIs simuladas.');
} finally { await browser?.close(); await server.close(); }
