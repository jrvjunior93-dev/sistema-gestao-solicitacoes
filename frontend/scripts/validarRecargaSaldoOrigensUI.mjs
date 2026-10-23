// Tela/componentes/CSS reais com HTTP interceptado local; nenhum dado real.
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const saida = path.resolve(root, '../outputs/recarga-saldo-origens'); mkdirSync(saida, { recursive: true });
const fixture = `import React from 'react';import{createRoot}from'react-dom/client';
import Recarga from '/src/pages/SolicitacaoDetalhe/RecargaCartaoDetalhe.jsx';
import{ThemeContext,TEMA_PADRAO}from'/src/contexts/ThemeContext.jsx';
import'/src/index.css';import'/src/styles/design-tokens.css';import'/src/styles/componentes-padrao.css';import'/src/styles/escala.css';
createRoot(document.getElementById('root')).render(<ThemeContext.Provider value={{tema:TEMA_PADRAO}}><main className="app-page p-4"><Recarga solicitacaoId={6721}/></main></ThemeContext.Provider>);`;
const server = await createServer({ root, configFile: false, logLevel: 'error', server: { host: '127.0.0.1', port: 0 },
  plugins: [{ name: 'recarga-saldo-origens-qa', enforce: 'pre',
    resolveId(id) { if (id === '/fixture.jsx') return '\0recarga-origens.jsx'; },
    async load(id) { if (id === '\0recarga-origens.jsx') return transformWithEsbuild(fixture, 'fixture.jsx', { loader: 'jsx', jsx: 'transform' }); },
    transform(code, id) { if (id.endsWith('/src/services/api.js')) return code.replace('normalizeApiUrl(import.meta.env.VITE_API_URL)', "'/api'"); },
    configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
      if (req.url !== '/fixture') return next();
      res.setHeader('Content-Type', 'text/html'); res.end(await vite.transformIndexHtml('/fixture', '<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
    }); }
  }, react()], optimizeDeps: { include: ['react', 'react-dom/client'] } });
const baseContexto = () => ({ ultima_recarga: { id: 20, cartao_recarga_id: 1, solicitacao_id: 6721,
  cartao: { id: 1, nome: 'Cartão QA', ultimos_quatro: '0706' }, valor_solicitado: 1227.65, valor_efetivo: 0,
  valor_nao_recarregado: 0, status_ciclo: 'AGUARDANDO_PAGAMENTO',
  titulo: { id: 12185, status: 'ABERTO', valor_original: 1227.65, valor_baixado: 0, valor_saldo: 1227.65 } },
  saldo_cartao: { creditos_efetivos: 2000, despesas_pendentes: 1227.65, saldo_validado: 2000, saldo_disponivel: 772.35, revisao: 'FIXA' },
  prestacoes_pendentes_saldo: [{ solicitacao_id: 6399, solicitacao_codigo: 'SOL-6399', prestacao_id: 10, status: 'REJEITADA', valor: 1227.65 }],
  origens_prestacoes_incompletas: false, pode_validar: false });
let browser, ctx = baseContexto(), writes = [], consultas = 0;
const errors = [];
try {
  await server.listen(); browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.setDefaultTimeout(12000);
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== base) return route.abort();
    if (req.method() !== 'GET') { writes.push(req.url()); return route.abort(); }
    if (url.pathname === '/api/recargas-cartao/solicitacoes/6721') {
      consultas++; return route.fulfill({ contentType: 'application/json', body: JSON.stringify(ctx) });
    }
    if (url.pathname === '/solicitacoes/6399') return route.fulfill({ contentType: 'text/html', body: '<h1>Destino SOL-6399</h1>' });
    if (url.pathname.startsWith('/api/')) return route.abort();
    return route.continue();
  });
  async function abrir() {
    await page.goto(`${base}/fixture`);
    const alternar = page.getByRole('button', { name: /^Recarga de cartão/ });
    await alternar.waitFor();
    assert.equal(await alternar.getAttribute('aria-expanded'), 'false');
    await alternar.locator('.app-bloco-recolher-seta').click();
    try { await page.getByLabel('Saldo do cartão', { exact: true }).waitFor(); }
    catch (e) { await page.screenshot({ path: path.join(saida, 'falha-fixture.png'), fullPage: true });
      console.error({ errors, consultas, expandido: await alternar.getAttribute('aria-expanded'), texto: await page.locator('body').innerText() }); throw e; }
  }
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 }); ctx = baseContexto(); await abrir();
    const saldo = page.getByLabel('Saldo do cartão', { exact: true });
    assert.match(await saldo.innerText(), /Saldo antes dos gastos pendentes: R\$\s*2\.000,00/);
    assert.match(await saldo.innerText(), /Gastos pendentes de validação\/correção: R\$\s*1\.227,65/);
    assert.match(await saldo.innerText(), /Saldo disponível estimado: R\$\s*772,35/);
    assert.equal(await saldo.getByText('Saldo após gastos validados:', { exact: false }).count(), 0);
    await saldo.getByText('Esta recarga ainda não compõe o saldo do cartão.', { exact: true }).waitFor();
    const link = saldo.getByRole('link', { name: 'SOL-6399', exact: true });
    assert.equal(await link.getAttribute('href'), '/solicitacoes/6399');
    assert.match(await link.locator('..').innerText(), /Prestação aguardando correção/);
    assert.equal(await saldo.getByRole('link', { name: 'SOL-6721' }).count(), 0);
    assert.equal(await saldo.getByText('Ajustar saldo pelo extrato (GEO)', { exact: true }).count(), 0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(saida, `recarga-pendente-${width}.png`), fullPage: true });
    // Navegacao por teclado para a origem correta, sem escrita nem nova recarga.
    await link.focus(); await page.keyboard.press('Enter'); await page.getByRole('heading', { name: 'Destino SOL-6399' }).waitFor();
    assert.equal(new URL(page.url()).pathname, '/solicitacoes/6399');
    ctx = baseContexto(); ctx.prestacoes_pendentes_saldo = []; ctx.origens_prestacoes_incompletas = true;
    await abrir(); assert.equal(await page.getByRole('link').count(), 0);
    await page.getByText(/solicitação de origem não está disponível/).waitFor();
    assert(!(await page.locator('body').innerText()).includes('SOL-6399'));
    assert.match(await page.getByLabel('Saldo do cartão', { exact: true }).innerText(), /772,35/);
    ctx = baseContexto(); ctx.pode_validar = true;
    ctx.prestacoes_pendentes_saldo.push({ solicitacao_id: 6400, solicitacao_codigo: 'SOL-6400', prestacao_id: 11, status: 'ENVIADA', valor: 10 });
    await abrir(); assert.equal(await page.getByRole('link').count(), 2);
    await page.getByText(/Prestação aguardando validação/).waitFor();
    await page.getByText('Ajustar saldo pelo extrato (GEO)', { exact: true }).click();
    assert.equal(await page.getByLabel('Saldo disponível real', { exact: true }).count(), 1);
    // Nenhum campo/formulario de ajuste ou prestacao foi removido.
    await page.screenshot({ path: path.join(saida, `geo-origens-${width}.png`), fullPage: true });
  }
  for (const [status, baixado, saldo, aviso] of [
    ['QUITADO', 1227.65, 0, null], ['PARCIAL', 100, 1127.65, 'Recarga paga parcialmente:'],
    ['CANCELADO', 0, 0, null], ['ESTORNADO', 0, 0, null], ['PREVISAO', 0, 1227.65, 'Esta recarga ainda não compõe']
  ]) {
    ctx = baseContexto(); Object.assign(ctx.ultima_recarga.titulo, { status, valor_baixado: baixado, valor_saldo: saldo });
    await abrir(); const notes = page.getByRole('note');
    if (aviso) assert((await notes.innerText()).startsWith(aviso)); else assert.equal(await notes.count(), 0);
  }
  ctx = baseContexto(); delete ctx.ultima_recarga.titulo.valor_baixado;
  await abrir(); assert.equal(await page.getByRole('note').count(), 0, 'Nao inferir pagamento de dado ausente');
  ctx = baseContexto(); Object.assign(ctx.saldo_cartao, { saldo_validado: 772.35, despesas_pendentes: 0 });
  ctx.prestacoes_pendentes_saldo = []; await abrir();
  assert.equal(await page.getByLabel('Solicitações com gastos pendentes').count(), 0);
  assert.equal(await page.getByRole('link').count(), 0);
  ctx = baseContexto(); ctx.saldo_cartao.saldo_disponivel = -10; await abrir();
  await page.getByRole('alert').filter({ hasText: /Saldo negativo/ }).waitFor();
  assert.deepEqual(writes, []); assert.deepEqual(errors, []); assert(consultas < 25, 'Sem loop de consulta');
  console.log('OK saldo UI real1366/390: rotulos/valores preservados, link correto/teclado, varias origens/status, privacidade, aviso nao pago/parcial/legado, ajuste GEO preservado e saldo negativo. Nenhum POST nem API/banco reais.');
} finally { await browser?.close(); await server.close(); }
