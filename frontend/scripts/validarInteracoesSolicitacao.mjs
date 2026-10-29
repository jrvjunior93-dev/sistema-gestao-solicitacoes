import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from 'tailwindcss';
import { chromium } from 'playwright';
import { validarPaginasInteracoes } from './interacoesPaginasQA.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const grupos = [
  { tipo: 'COMENTARIO', quantidade: 1, historico_id: 100, historico_ids: [100] },
  { tipo: 'ANEXO', quantidade: 1, historico_id: 101, historico_ids: [101] },
  { tipo: 'COMENTARIO_ITEM', quantidade: 2, historico_id: 103, historico_ids: [102, 103] }
];
const historicos = [
  { id: 100, acao: 'COMENTARIO', descricao: 'Conferir pagamento <script>literal</script>', createdAt: '2026-10-11T12:00:00Z' },
  { id: 101, acao: 'ANEXO_ADICIONADO', descricao: 'boleto.pdf', createdAt: '2026-10-11T12:00:01Z', metadata: { caminho: '/uploads/boleto.pdf' } },
  { id: 102, acao: 'COMENTARIO_ETAPA_COMPRA', descricao: 'Material errado', createdAt: '2026-10-11T12:00:02Z' },
  { id: 103, acao: 'COMENTARIO_ETAPA_COMPRA', descricao: 'Conferir entrega', createdAt: '2026-10-11T12:00:03Z' }
];
const compra = { solicitacao_compra_id: 8, status_compra: 'COTACAO', pedidos: [], leituras_comentarios: {},
  itens: [{ id: 5, item_tipo: 'CADASTRADO', nome: 'Arame', quantidade: 1, status_aprovacao: 'APROVADO' }],
  comentarios: [
    { id: 102, escopo: 'ITEM', item_tipo: 'CADASTRADO', referencia_id: 5, descricao: 'Material errado', usuario: { id: 2, nome: 'Outro usuário' } },
    { id: 103, escopo: 'ITEM_APROVADO', item_tipo: 'CADASTRADO', referencia_id: 5, descricao: 'Conferir entrega', usuario: { id: 2, nome: 'Outro usuário' } }
  ] };
const fixture = `import React,{useEffect,useState} from 'react';import {createRoot} from 'react-dom/client';
import {BrowserRouter,useLocation} from 'react-router-dom';
import Atencao from '/src/pages/Solicitacoes/AtencaoPendente.jsx';
import Atividade from '/src/pages/Solicitacoes/AtividadePendente.jsx';
import Timeline from '/src/pages/SolicitacaoDetalhe/Timeline.jsx';
import CompraEtapas from '/src/pages/SolicitacaoDetalhe/CompraEtapas.jsx';
import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/componentes-padrao.css';
function App(){const [grupos,setGrupos]=useState(${JSON.stringify(grupos)});const location=useLocation();
const q=new URLSearchParams(location.search);useEffect(()=>{const f=e=>setGrupos(e.detail.interacoes_pendentes);window.addEventListener('fluxy:interacoes-lidas',f);return()=>window.removeEventListener('fluxy:interacoes-lidas',f)},[]);
return <main className="layout-main" style={{padding:12}}><div onClick={()=>window.cliqueLinha=(window.cliqueLinha||0)+1}>
<Atividade solicitacao={{id:42,atividades_pendentes:[{tipo:'RETORNO_PENDENTE',nome:'Aprovar retorno',prazo_em:null,atrasada:false}]}} />
<Atencao solicitacao={{id:42,codigo:'SOL-42',interacoes_pendentes:grupos,retorno_solicitado_pendente:true}} /></div>
<div id="rota">{location.pathname+location.search}</div>
<Timeline solicitacaoId={42} historicos={${JSON.stringify(historicos)}} interacoesPendentes={grupos}
eventoFoco={q.get('interacao')!=='COMENTARIO_ITEM'?Number(q.get('evento')):null} />
<CompraEtapas solicitacaoId={42} user={{id:1,perfil:'OBRA'}} podeDecidir={false} podeGerenciarCotacao={false} />
</main>};createRoot(document.getElementById('root')).render(<BrowserRouter><App/></BrowserRouter>);`;
const server = await createServer({ root, configFile: false, css: { postcss: { plugins: [tailwind({config:path.join(root,'tailwind.config.js')})] } }, logLevel: 'error', server: { host: '127.0.0.1', port: 0 }, plugins: [{
  name: 'interacoes-fixture', enforce: 'pre',
  resolveId(id, importer) {
    if (id === '/fixture.jsx') return '\0interacoes-fixture.jsx';
    if (importer?.endsWith('CompraEtapas.jsx') && id.endsWith('LiveUpdatesContext')) return '\0live-fixture';
  },
  async load(id) {
    if (id === '\0interacoes-fixture.jsx') return transformWithEsbuild(fixture, 'fixture.jsx', { loader: 'jsx', jsx: 'transform' });
    if (id === '\0live-fixture') return 'export function useLiveUpdateSubscription(){}';
  },
  transform(code, id) {
    if (id.endsWith('/src/services/api.js')) return code.replace(
      'export const API_URL = normalizeApiUrl(import.meta.env.VITE_API_URL);',
      "export const API_URL = 'https://fixture.invalid/api';"
    );
  },
  configureServer(s) { s.middlewares.use(async (req, res, next) => {
    const pathname = req.url?.split('?')[0];
    if (pathname === '/fixture' || pathname === '/solicitacoes/42') {
      res.setHeader('Content-Type', 'text/html');
      res.end(await s.transformIndexHtml('/fixture', '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
    } else next();
  }); }
}, react()], optimizeDeps: { include: ['react', 'react-dom/client', 'react-router-dom'] } });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH, channel: process.env.PLAYWRIGHT_EXECUTABLE_PATH ? undefined : 'chrome', headless: true });
try {
  for (const width of [1366, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const erros = []; const leituras = []; const externos = [];
    let pendentes = structuredClone(grupos); let falhar = false;
    page.on('pageerror', (e) => erros.push(e.message));
    page.on('console', (msg) => { if (msg.type() === 'error') console.error(msg.text()); });
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1') return route.continue();
      if (url.hostname !== 'fixture.invalid') { externos.push(url.href); return route.abort(); }
      if (url.pathname.endsWith('/compra-etapas')) return route.fulfill({ json: compra });
      if (url.pathname.endsWith('/usuarios-lista')) return route.fulfill({ json: [] });
      if (url.pathname.endsWith('/comentarios/leitura')) return route.fulfill({ json: { ok: true } });
      if (url.pathname.endsWith('/interacoes/leitura')) {
        const body = route.request().postDataJSON(); leituras.push(body.historico_ids);
        if (falhar) return route.fulfill({ status: 403, json: { error: 'Leitura negada (fixture)' } });
        pendentes = pendentes.map((g) => ({ ...g, historico_ids: g.historico_ids.filter((id) => !body.historico_ids.includes(id)) }))
          .map((g) => ({ ...g, quantidade: g.historico_ids.length, historico_id: Math.max(...g.historico_ids) }))
          .filter((g) => g.quantidade);
        return route.fulfill({ json: { interacoes_pendentes: pendentes } });
      }
      externos.push(url.pathname); return route.abort();
    });
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    await page.goto(`${base}/fixture`);
    await page.getByRole('button', { name: 'Interações não lidas de SOL-42: 4' }).waitFor({ timeout: 10000 }).catch((e) => { console.error(erros); throw e; });
    await page.waitForTimeout(1000); assert.equal(leituras.length, 0, 'abrir detalhe nao reconhece eventos');
    await page.getByRole('button', { name: 'Interações não lidas de SOL-42: 4' }).click();
    const modal = page.getByRole('dialog', { name: 'Interações · SOL-42' });
    await modal.getByRole('link', { name: /Comentário em item/ }).waitFor();
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Fechar');
    await page.keyboard.press('Shift+Tab');
    assert.ok(await page.evaluate(() => document.activeElement.textContent.includes('Comentário em item')));
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Fechar');
    assert.equal(await page.evaluate(() => window.cliqueLinha || 0), 0, 'balao nao dispara clique da linha');
    assert.equal(await modal.getByRole('link').count(), 3, 'um grupo por tipo');
    assert.equal(await modal.locator('script').count(), 0);
    await page.screenshot({ path: path.join(root, `../outputs/interacoes-${width}.png`) });
    await page.keyboard.press('Escape'); await modal.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Interações não lidas de SOL-42: 4');
    await page.getByRole('button', { name: /Interações não lidas/ }).click();
    await page.mouse.click(2, 2); await modal.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: /Interações não lidas/ }).click();
    falhar = true;
    await modal.getByRole('link', { name: /Novo comentário no histórico/ }).click();
    await page.getByText('Conferir pagamento <script>literal</script>', { exact: true }).waitFor();
    await page.waitForTimeout(1100);
    assert.ok(leituras.some((ids) => ids.includes(100)));
    assert.equal(await page.getByRole('button', { name: 'Interações não lidas de SOL-42: 4' }).count(), 1, 'falha nao apaga destaque');
    assert.equal(leituras.flat().includes(102), false, 'historico nao consome comentarios de itens');
    falhar = false;
    await page.getByRole('button', { name: 'Interações não lidas de SOL-42: 2' }).waitFor();
    await page.getByRole('button', { name: 'Interações não lidas de SOL-42: 2' }).click();
    await modal.getByRole('link', { name: /Comentário em item/ }).click();
    const comentarios = page.getByRole('dialog', { name: 'Comentários: Arame' });
    await comentarios.getByText('Material errado', { exact: true }).waitFor();
    await comentarios.getByText('Conferir entrega', { exact: true }).waitFor();
    assert.equal(await comentarios.getByRole('button', { name: 'Enviar', exact: true }).count(), 0, 'atalho nao amplia escrita');
    await page.getByRole('button', { name: /Interações não lidas/ }).waitFor({state:'hidden'});
    assert.ok(leituras.some((ids) => ids.includes(102) && ids.includes(103)), 'conversa compartilhada sem duplicidade');
    await comentarios.getByRole('button', { name: 'Fechar comentários' }).click();
    assert.equal(await page.getByRole('link', { name: /Aprovar retorno/ }).count(), 1, 'atividade nao e consumida por leitura');
    assert.deepEqual(erros, []); assert.deepEqual(externos, []);
    await page.close();
  }
  await validarPaginasInteracoes(browser);
  console.log('OK: UI real desktop/mobile, agrupamento/atalhos/rolagem/leitura/403/Escape/isolar itens e retorno; APIs isoladas.');
} finally { await browser.close(); await server.close(); }
