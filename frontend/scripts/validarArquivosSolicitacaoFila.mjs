import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pageSource = fs.readFileSync(path.join(root, 'src/pages/FinanceiroFilaPagamentos.jsx'), 'utf8');
assert(pageSource.includes('to={`/solicitacoes/${solicitacaoVinculada.id}`}'), 'Titulo da fila deve abrir sua solicitacao');
assert(pageSource.includes('setSolicitacaoArquivos(solicitacaoVinculada)'), 'Titulo da fila deve abrir o modal de anexos');

const fixture = `
  import React from 'react';
  import { createRoot } from 'react-dom/client';
  import ArquivosSolicitacaoFilaModal from '/src/components/financeiro/ArquivosSolicitacaoFilaModal.jsx';
  const empty = new URLSearchParams(location.search).has('empty');
  createRoot(document.getElementById('root')).render(
    <ArquivosSolicitacaoFilaModal
      solicitacao={{ id: empty ? 43 : 42, codigo: empty ? 'SOL-43' : 'SOL-42' }}
      onFechar={() => { window.fechou = true; }}
    />
  );
`;
const financeiroServices = `
  export async function getArquivosSolicitacaoFila(id) {
    window.consultas = [...(window.consultas || []), id];
    return id === 43 ? [] : [
      { id: 'anexo-1', nome_original: 'nota.pdf', tipo: 'SOLICITACAO', caminho_arquivo: 'https://s3.test/nota.pdf', createdAt: '2026-09-18T10:00:00Z' },
      { id: 'comprovante-2', nome_original: 'comprovante.png', tipo: 'Comprovante', caminho_arquivo: '/uploads/comprovante.png', createdAt: '2026-09-18T11:00:00Z' }
    ];
  }
`;
const solicitacaoServices = `
  export async function getLinkSeguroAnexoSolicitacao(path) {
    window.links = [...(window.links || []), path];
    return 'https://seguro.test/arquivo';
  }
`;

const server = await createServer({
  root, configFile: false, logLevel: 'error', server: { host: '127.0.0.1', port: 0 },
  plugins: [{
    name: 'fixture-arquivos-solicitacao-fila', enforce: 'pre',
    resolveId(id) { if (id === '/fixture.jsx') return '\0fixture-arquivos-solicitacao-fila.jsx'; },
    async load(id) {
      if (id === '\0fixture-arquivos-solicitacao-fila.jsx') {
        return transformWithEsbuild(fixture, 'fixture.jsx', { loader: 'jsx', jsx: 'transform' });
      }
    },
    transform(code, id) {
      if (id.endsWith('/src/services/financeiro.js')) return financeiroServices;
      if (id.endsWith('/src/services/solicitacoes.js')) return solicitacaoServices;
    },
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (new URL(req.url, 'http://localhost').pathname !== '/fixture') return next();
        res.setHeader('Content-Type', 'text/html');
        res.end(await vite.transformIndexHtml('/fixture', '<html><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
      });
    }
  }, react()],
  optimizeDeps: { include: ['react', 'react-dom/client'] }
});
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    HTMLAnchorElement.prototype.click = function captureClick() {
      window.abertos = [...(window.abertos || []), { href: this.href, download: this.download, target: this.target }];
    };
  });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  await page.goto(`${base}/fixture`);
  const modal = page.getByRole('dialog', { name: 'Arquivos da solicitação SOL-42' });
  await modal.getByText('nota.pdf').waitFor();
  await modal.getByText('comprovante.png').waitFor();
  await modal.getByText(/^Comprovante ·/).waitFor();
  assert.deepEqual(await page.evaluate(() => window.consultas), [42]);
  assert.equal(await page.evaluate(() => (window.links || []).length), 0, 'Link seguro so deve ser solicitado ao abrir');
  await modal.getByRole('button', { name: 'Visualizar' }).first().click();
  await page.waitForFunction(() => (window.abertos || []).length === 1);
  assert.deepEqual(await page.evaluate(() => window.links), ['https://s3.test/nota.pdf']);
  assert.deepEqual(await page.evaluate(() => window.abertos[0]), { href: 'https://seguro.test/arquivo', download: '', target: '_blank' });
  await modal.getByRole('button', { name: 'Baixar' }).first().click();
  await page.waitForFunction(() => (window.abertos || []).length === 2);
  assert.equal(await page.evaluate(() => window.abertos[1].download), 'nota.pdf');
  await page.goto(`${base}/fixture?empty=1`);
  await page.getByRole('dialog', { name: 'Arquivos da solicitação SOL-43' }).getByText('Nenhum arquivo anexado a esta solicitação.').waitFor();
  assert.deepEqual(errors, []);
  console.log('OK: acesso no titulo, modal lista anexos e comprovantes, abre link seguro sob demanda e trata lista vazia.');
} finally {
  await browser.close();
  await server.close();
}
