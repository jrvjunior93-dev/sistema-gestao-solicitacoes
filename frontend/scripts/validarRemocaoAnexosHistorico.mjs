import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
import { anexoHistoricoRemovido } from '../src/pages/SolicitacaoDetalhe/anexosHistorico.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const h = { id: 1, solicitacao_id: 42, acao: 'ANEXO_ADICIONADO', metadata: { anexo_id: 7, caminho: 'https://fixture.invalid/ativo.pdf' }, createdAt: '2026-10-05T12:00:00Z' };
const r = { id: 2, solicitacao_id: 42, acao: 'ANEXO_REMOVIDO', metadata: JSON.stringify(h.metadata), createdAt: '2026-10-06T12:00:00Z' };
assert.equal(anexoHistoricoRemovido(h, [r]), true);
assert.equal(anexoHistoricoRemovido(h, [{ ...r, solicitacao_id: 99 }]), false);
assert.equal(anexoHistoricoRemovido(h, [{ ...r, metadata: { ...h.metadata, anexo_id: 8 } }]), false);
assert.equal(anexoHistoricoRemovido({ ...h, metadata: { caminho: h.metadata.caminho } }, [r]), true);
assert.equal(anexoHistoricoRemovido({ ...h, metadata: { caminho: h.metadata.caminho }, createdAt: '2026-10-07T12:00:00Z' }, [r]), false);
assert.equal(anexoHistoricoRemovido({ ...h, metadata: { ...h.metadata, removido: true } }), true);
assert.equal(anexoHistoricoRemovido({ ...h, metadata: 'malformado' }, [r]), false);

const fixture = `import React from 'react'; import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom'; import Timeline from '/src/pages/SolicitacaoDetalhe/Timeline.jsx';
import '/src/index.css'; import '/src/styles/design-tokens.css'; import '/src/styles/componentes-padrao.css';
const semPermissao = location.search.includes('consulta');
const removido = location.search.includes('removido');
const historicos = ${JSON.stringify([{ ...h, descricao: 'ativo.pdf' },
  { ...h, id: 3, descricao: 'antigo.pdf', metadata: { anexo_id: 9, caminho: 'https://fixture.invalid/antigo.pdf' } },
  { ...r, id: 4, descricao: 'antigo.pdf', metadata: { anexo_id: 9, caminho: 'https://fixture.invalid/antigo.pdf' } }])};
if (removido) historicos[0].metadata.removido = true;
window.recarregou=0;
createRoot(document.getElementById('root')).render(<MemoryRouter><div className="layout-shell"><main className="layout-main">
<Timeline historicos={historicos} canRemoveAnexo={!semPermissao} onAnexoRemovido={()=>{window.recarregou++;}} />
</main></div></MemoryRouter>);`;
const server = await createServer({ root, configFile: false, logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'anexo-remocao-fixture', enforce: 'pre',
    resolveId(id) { if (id === '/fixture.jsx') return '\0anexo-remocao-fixture.jsx'; },
    async load(id) { if (id === '\0anexo-remocao-fixture.jsx') return transformWithEsbuild(fixture, 'fixture.jsx', { loader: 'jsx', jsx: 'transform' }); },
    transform(code, id) {
      if (id.endsWith('/src/services/api.js')) return `export const API_URL='https://fixture.invalid/api';
        export const API_ORIGIN='https://fixture.invalid'; export const authHeaders=()=>({});
        export const fileUrl=p=>p; export const getAuthToken=()=>null; export const getAuditSessionId=()=>null;
        export const installFetchSecurityDefaults=()=>{}; export const setAuthToken=()=>{}; export const clearAuthToken=()=>{};`;
      if (id.endsWith('/src/contexts/AuthContext.jsx')) return 'export const useAuth=()=>({user:{id:2}});';
    }, configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (new URL(req.url, 'http://localhost').pathname !== '/fixture') return next();
        res.setHeader('Content-Type', 'text/html');
        res.end(await vite.transformIndexHtml('/fixture', '<html lang="pt-BR"><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
      });
    }
  }, react()], optimizeDeps: { include: ['react', 'react-dom/client', 'react-router-dom'] } });
let browser;
try {
  await server.listen(); browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage(); const errors = [], externos = [];
  page.on('pageerror', e => errors.push(e.message));
  let chamadas = 0, falhar = true;
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.href === 'https://fixture.invalid/api/anexos/historico/1' && route.request().method() === 'DELETE') {
      chamadas++;
      await new Promise(resolve => setTimeout(resolve, 350));
      return route.fulfill({ status: falhar ? 403 : 200, contentType: 'application/json',
        body: JSON.stringify(falhar ? { error: 'Sem permissão para remover (fixture)' } : { ok: true }) });
    }
    externos.push(url.href); return route.abort();
  });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  async function abrir(suffix = '') {
    await page.goto(`${base}/fixture${suffix}`);
    await page.getByRole('button', { name: /^Histórico/ }).click();
    await page.getByText('ativo.pdf', { exact: true }).waitFor();
  }
  const row = () => page.locator('.sol-detail-timeline-item').filter({ has: page.getByText('ativo.pdf', { exact: true }) });
  const antigo = () => page.locator('.sol-detail-timeline-item').filter({ has: page.getByText('ANEXO_ADICIONADO', { exact: true }) }).filter({ hasText: 'antigo.pdf' });
  await abrir(); assert.equal(await antigo().getByRole('button').count(), 0);
  await row().getByRole('button', { name: 'Remover', exact: true }).evaluate(el => { el.click(); el.click(); });
  assert.equal(await page.getByRole('dialog').count(), 1, 'Duplo clique nao abre duas confirmacoes');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
  assert.equal(chamadas, 0);
  await row().getByRole('button', { name: 'Remover', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remover anexo', exact: true }).click();
  await page.getByText('Sem permissão para remover (fixture)', { exact: true }).waitFor();
  assert.equal(await row().getByRole('button', { name: 'Visualizar', exact: true }).count(), 1);
  falhar = false;
  await row().getByRole('button', { name: 'Remover', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remover anexo', exact: true }).click();
  assert.equal(await row().getByRole('button', { name: 'Removendo…', exact: true }).isDisabled(), true);
  await row().getByText('Anexo removido — arquivo indisponível.', { exact: true }).waitFor();
  assert.equal(await row().getByRole('button').count(), 0, 'Atualiza mesmo com props antigas');
  assert.equal(chamadas, 2); assert.equal(await page.evaluate(() => window.recarregou), 1);
  await abrir('?removido'); assert.equal(await row().getByRole('button').count(), 0);
  await abrir('?consulta'); assert.equal(await page.getByRole('button', { name: 'Remover', exact: true }).count(), 0);
  assert.equal(await row().getByRole('button', { name: 'Visualizar', exact: true }).count(), 1);
  assert.deepEqual(errors, []); assert.deepEqual(externos, []);
  console.log('Historico validado: legado, auditoria preservada, cancelamento, erro/retry, processamento, atualizacao sem reload e permissao. Fixtures locais.');
} finally { await browser?.close(); await server.close(); }
