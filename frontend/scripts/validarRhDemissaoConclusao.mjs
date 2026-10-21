// UI e cliente HTTP reais, API interceptada. Sem dados pessoais/banco/S3/rede externa.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '../outputs/rh-demissao-conclusao'); fs.mkdirSync(output, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0, proxy: {} }, plugins: [{
  name: 'qa-demissao', enforce: 'pre',
  transform(_code, id) {
    if (id.endsWith('/src/contexts/AuthContext.jsx')) return `export const useAuth=()=>({user:{id:2,perfil:'USUARIO',area:new URLSearchParams(location.search).get('area')||'DP',areas_permissoes_configuradas:true,areas_permissoes:['rh_dp.solicitacoes.visualizar','rh_dp.solicitacoes.abrir','rh_dp.solicitacoes.decidir']}});`;
  },
  configureServer(vite) { vite.middlewares.use('/qa-demissao', async (_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(await vite.transformIndexHtml('/qa-demissao', `<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';
import Page from'/src/pages/RhDpPessoalSolicitacoes.jsx';import{ThemeContext,TEMA_PADRAO}from'/src/contexts/ThemeContext.jsx';
import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/componentes-padrao.css';import '/src/styles/responsive-system.css';
const dp=new URLSearchParams(location.search).get('area')!=='OBRA';
createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,React.createElement(ThemeContext.Provider,{value:{tema:TEMA_PADRAO}},React.createElement('main',{className:'layout-main'},React.createElement(Page,{obraId:7,podeAbrir:true,podeDecidir:dp})))));
</script></body></html>`));
  }); }
}] });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
page.setDefaultTimeout(12000);
const errors = [], unexpected = [], posts = [];
let bloqueado = false, concluida = false, liberarConclusao;
const pedido = () => ({ id: 235, codigo: 'RH-000235', tipo: 'DEMISSAO', situacao: 'APROVADA', obra_id: 7,
  colaborador: { nome: 'Pessoa QA', status: 'DEMITIDO' }, obra: { id: 7, nome: 'Obra QA' },
  demissao_pendente_conclusao: !concluida, demissao_concluida: concluida, dados_json: {}, historicos: [] });
let anexos = [{ id: 90, nome_original: 'aviso-qa.pdf', situacao: 'PENDENTE', tipo: { nome: 'Aviso QA' } }];
page.on('pageerror', e => errors.push(e.message));
await page.route('**/*', async route => {
  const req = route.request(), url = new URL(req.url());
  const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  if (req.method() === 'POST') posts.push({ path: url.pathname, body: req.postData() });
  if (url.pathname.endsWith('/rh/solicitacoes/235/tipos-documento')) return json([{ id: 1, nome: 'Aviso QA' }]);
  if (url.pathname.endsWith('/rh/solicitacoes/235/anexos')) {
    if (req.method() === 'POST') { anexos.push({ id: 91, nome_original: 'termo-qa.pdf', situacao: 'PENDENTE' }); return json(anexos.at(-1)); }
    return json(anexos);
  }
  if (url.pathname.endsWith('/rh/solicitacoes/235/anexos/90/validar')) {
    assert.equal(JSON.parse(req.postData()).aceito, true); anexos[0].situacao = 'VALIDADO'; return json(anexos[0]);
  }
  if (url.pathname.endsWith('/rh/solicitacoes/235/comentar')) return json({ id: 5 }, 201);
  if (url.pathname.endsWith('/rh/solicitacoes/235/concluir')) {
    if (bloqueado) return json({ error: 'Documento do checklist ainda precisa ser atestado.' }, 400);
    await new Promise(ok => { liberarConclusao = ok; }); concluida = true; return json(pedido());
  }
  if (url.pathname.endsWith('/rh/solicitacoes/235/conferencia')) return json({ exigeConferencia: false });
  if (url.pathname.endsWith('/rh/solicitacoes/235')) return json(pedido());
  if (url.pathname.endsWith('/rh/solicitacoes')) return json([pedido()]);
  if (url.hostname === '127.0.0.1' && !url.pathname.startsWith('/api')) return route.continue();
  unexpected.push(req.url()); return route.abort();
});
const base = `http://127.0.0.1:${server.httpServer.address().port}/qa-demissao?solicitacao=235`;
const dialog = () => page.getByRole('dialog').first();
const concluir = () => dialog().getByRole('button', { name: 'Concluir demissão', exact: true });
try {
  for (const area of ['OBRA', 'DP']) {
    await page.goto(base + '&area=' + area);
    await dialog().getByText('Aguardando conclusão do DP', { exact: true }).waitFor();
    await page.getByLabel('Tipo do documento', { exact: true }).selectOption('1');
    await page.getByLabel('Arquivo', { exact: true }).setInputFiles({ name: 'termo-qa.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-QA') });
    await page.getByRole('button', { name: 'Enviar documento', exact: true }).click();
    await page.getByText('Documento enviado. Ele vai para a pasta depois que o DP atestar.', { exact: true }).waitFor();
    await page.getByLabel('Comentário', { exact: true }).fill('Conferência ' + area);
    await page.getByRole('button', { name: 'Comentar', exact: true }).click();
    await page.getByText('Comentário registrado.', { exact: true }).waitFor();
    assert.equal(await concluir().count(), area === 'DP' ? 1 : 0);
    assert.equal(await page.getByRole('button', { name: 'Atestar', exact: true }).count() > 0, area === 'DP');
  }
  for (const width of [390, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    await concluir().scrollIntoViewIfNeeded();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(output, `demissao-${width}.png`) });
  }
  bloqueado = true; await concluir().click();
  await page.getByText('Documento do checklist ainda precisa ser atestado.', { exact: true }).waitFor();
  assert(await page.getByLabel('Arquivo', { exact: true }).isVisible(), 'Erro mantem modal e formulario disponiveis');
  await page.getByRole('button', { name: 'Atestar', exact: true }).first().click();
  await page.getByRole('dialog').last().getByRole('button', { name: 'Atestar', exact: true }).click();
  await page.getByText('Documento atestado. Ele vai para a pasta quando o DP concluir a demissão.', { exact: true }).waitFor();
  bloqueado = false; const antes = posts.filter(p => p.path.endsWith('/concluir')).length;
  await concluir().click();
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Concluindo…' && b.disabled));
  await dialog().getByRole('button', { name: 'Concluindo…', exact: true }).evaluate(b => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  assert.equal(posts.filter(p => p.path.endsWith('/concluir')).length, antes + 1);
  liberarConclusao();
  await page.getByText('Demissão concluída. O colaborador inativo saiu da lista operacional da obra.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Abrir: solicitação #235', exact: true }).click();
  await dialog().getByText('Concluída', { exact: true }).waitFor();
  assert.equal(await concluir().count(), 0); assert.equal(await page.getByLabel('Arquivo', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Atestar', exact: true }).count(), 0);
  assert.equal(posts.filter(p => p.path.endsWith('/comentar')).length, 2);
  assert.equal(posts.filter(p => p.path.endsWith('/validar')).length, 1);
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log('UI real demissao: DP/obra colaboram APROVADA, ateste, conclusao DP, erro explicito, duplo clique e consulta concluida; 390/1366. API isolada.');
} catch (error) { console.error({ errors, unexpected, body: (await page.locator('body').innerText()).slice(-2200) }); throw error; }
finally { liberarConclusao?.(); await browser.close(); await server.close(); }
