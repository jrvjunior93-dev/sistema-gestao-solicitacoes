// Modal e cliente reais; API interceptada. Sem usuarios reais, banco ou S3.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(root, '../outputs/rh-pedido-tipos'); fs.mkdirSync(output, { recursive: true });
const pedido = { id: 55, codigo: 'RH-QA-55', tipo: 'ADMISSAO', situacao: 'RASCUNHO', obra_id: 7,
  dados_json: { nome: 'Pessoa QA', tipo_vinculo: 'CLT', data_inicio_efetivo_obra: '2026-10-01' },
  obra: { id: 7, nome: 'Obra QA' }, historicos: [] };
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0, proxy: {} }, plugins: [{
  name: 'qa-pedido-tipos', enforce: 'pre',
  transform(_code, id) {
    if (id.endsWith('/src/contexts/AuthContext.jsx')) return `export const useAuth=()=>({user:{id:2,perfil:'USUARIO',area:new URLSearchParams(location.search).get('area')||'DP',areas_permissoes_configuradas:true,areas_permissoes:['rh_dp.solicitacoes.visualizar','rh_dp.solicitacoes.abrir']}});`;
  },
  configureServer(vite) { vite.middlewares.use('/qa-tipos', async (_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(await vite.transformIndexHtml('/qa-tipos', `<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';
import Page from'/src/pages/RhDpPessoalSolicitacoes.jsx';import{ThemeContext,TEMA_PADRAO}from'/src/contexts/ThemeContext.jsx';
import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/componentes-padrao.css';import '/src/styles/responsive-system.css';
createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,React.createElement(ThemeContext.Provider,{value:{tema:TEMA_PADRAO}},React.createElement('main',{className:'layout-main'},React.createElement(Page,{obraId:7,podeAbrir:true,podeDecidir:false})))));
</script></body></html>`));
  }); }
}] });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
page.setDefaultTimeout(12000);
const erros = [], unexpected = [], posts = [];
let modo = 'normal', liberarTipos, liberarPost, anexos = [];
page.on('pageerror', e => erros.push(e.message));
await page.route('**/*', async route => {
  const req = route.request(), url = new URL(req.url());
  const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  if (url.pathname.endsWith('/rh/solicitacoes/55/tipos-documento')) {
    const capturado = modo;
    if (capturado === 'lento') await new Promise(ok => { liberarTipos = ok; });
    if (capturado === 'negado') return json({ error: 'Catálogo indisponível QA' }, 403);
    return json(capturado === 'vazio' ? [] : [{ id: 1, nome: capturado === 'lento' ? 'Resposta antiga QA' : 'CPF QA', obrigatorio: false },
      { id: 2, nome: 'Carteira QA', obrigatorio: true }]);
  }
  if (url.pathname.endsWith('/rh/solicitacoes/55/anexos')) {
    if (req.method() === 'POST') {
      posts.push(req.postData());
      await new Promise(ok => { liberarPost = ok; });
      anexos = [{ id: 90, nome_original: 'documento-qa.pdf', tipo: { nome: 'CPF QA' }, situacao: 'PENDENTE' }];
      return json(anexos[0]);
    }
    return json(anexos);
  }
  if (url.pathname.endsWith('/rh/solicitacoes/55/conferencia')) return json({ exigeConferencia: false });
  if (url.pathname.endsWith('/rh/solicitacoes/55')) return json(pedido);
  if (url.pathname.endsWith('/rh/solicitacoes')) return json([pedido]);
  if (url.hostname === '127.0.0.1' && !url.pathname.startsWith('/api')) return route.continue();
  unexpected.push(req.url()); return route.abort();
});
const base = `http://127.0.0.1:${server.httpServer.address().port}/qa-tipos`;
const tipo = () => page.getByLabel('Tipo do documento', { exact: true });
const enviar = () => page.getByRole('button', { name: 'Enviar documento', exact: true });
const pronto = async () => {
  await tipo().waitFor();
  await page.waitForFunction(() => { const s = [...document.querySelectorAll('select')].find(e => e.closest('label')?.textContent.includes('Tipo do documento')); return s && !s.disabled; });
};
try {
  for (const area of ['DP', 'OBRA']) {
    await page.goto(base + `?solicitacao=55&area=${area}`); await pronto();
    assert.deepEqual(await tipo().locator('option').allTextContents(), ['Sem classificacao (nao entra na pasta)', 'CPF QA', 'Carteira QA (obrigatorio)']);
    console.log(`Catalogo no modal ${area} conferido.`);
  }
  for (const width of [390, 1366]) {
    await page.setViewportSize({ width, height: 900 }); await tipo().scrollIntoViewIfNeeded();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(output, `catalogo-${width}.png`) });
  }
  await tipo().selectOption('1');
  await page.getByLabel('Arquivo', { exact: true }).setInputFiles({ name: 'documento-qa.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-QA') });
  await enviar().click();
  await page.waitForFunction(() => document.querySelector('input[type=file]')?.disabled);
  await page.getByRole('dialog').evaluate(dialog => { const form = dialog.querySelector('form.rh-pessoal-envio'); form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  assert.equal(posts.length, 1, 'Submit repetido bloqueado enquanto o upload esta em voo');
  assert.match(posts[0], /name="documento_tipo_id"\r\n\r\n1/);
  liberarPost();
  await page.getByText('Documento enviado. Ele vai para a pasta depois que o DP atestar.', { exact: true }).waitFor();
  await pronto(); assert.equal(await tipo().inputValue(), '');
  console.log('Upload classificado e protecao de duplo submit conferidos.');
  modo = 'negado'; await page.goto(base + '?solicitacao=55');
  await page.getByRole('alert').getByText('Catálogo indisponível QA', { exact: true }).waitFor();
  assert.equal(await enviar().isDisabled(), true);
  modo = 'normal'; await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click(); await pronto();
  modo = 'vazio'; await page.goto(base + '?solicitacao=55'); await pronto();
  await page.getByText('Nenhum tipo ativo compatível cadastrado. Consulte o DP para conferir o catálogo.', { exact: true }).waitFor();
  assert.equal(await tipo().locator('option').count(), 1);
  modo = 'lento'; await page.goto(base + '?solicitacao=55');
  await page.waitForFunction(() => [...document.querySelectorAll('small')].some(e => e.textContent.includes('Carregando tipos')));
  assert.equal(await tipo().isDisabled(), true); assert.equal(await enviar().isDisabled(), true);
  await page.getByRole('dialog').getByRole('button', { name: 'Fechar', exact: true }).click();
  modo = 'normal'; await page.getByRole('button', { name: 'Abrir: solicitação #55', exact: true }).click(); await pronto();
  liberarTipos();
  await page.waitForLoadState('networkidle');
  assert.equal(await tipo().locator('option', { hasText: 'Resposta antiga QA' }).count(), 0, 'Resposta anterior ao fechar nao contamina nova abertura');
  assert.deepEqual(erros, []); assert.deepEqual(unexpected, []);
  console.log('Modal RH real: DP/Obra, tipos fora do checklist, obrigatoriedade, upload classificado/duplo submit, erro/retry/vazio/loading, resposta obsoleta e 390/1366 aprovados. API isolada.');
} catch (error) { console.error({ erros, unexpected, url: page.url(), body: (await page.locator('body').innerText()).slice(0, 1600) }); throw error; }
finally { liberarTipos?.(); liberarPost?.(); await browser.close(); await server.close(); }
