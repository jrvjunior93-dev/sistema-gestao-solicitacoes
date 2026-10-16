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
    return id === 43 ? [{ id:'nao-boleto', nome_original:'outro.pdf',tipo:'SOLICITACAO'}] : [
      { id: 'anexo-1', nome_original: 'nota.pdf', tipo: 'BOLETO', caminho_arquivo: 'https://s3.test/nota.pdf', createdAt: '2026-09-18T10:00:00Z' },
      { id: 'anexo-2', nome_original: 'segundo.png', tipo: 'BOLETO', caminho_arquivo: '/uploads/segundo.png', createdAt: '2026-09-18T11:00:00Z' },
      { id: 'comprovante-3', nome_original: 'comprovante.png', tipo: 'Comprovante', caminho_arquivo: '/uploads/comprovante.png' },
      { id: 'anexo-4', nome_original: 'boleto-informativo.pdf', tipo: 'SOLICITACAO', caminho_arquivo: '/uploads/boleto-informativo.pdf' },
      { id: 'anexo-5', nome_original: 'compra.pdf', tipo: 'BOLETO_COMPRA', caminho_arquivo: 'https://s3.test/compra.pdf' },
      { id: 'anexo-6', nome_original: 'frete.pdf', tipo: 'BOLETO_FRETE', caminho_arquivo: 'https://s3.test/frete.pdf' },
      { id: 'anexo-7', nome_original: 'excluido.pdf', tipo: 'BOLETO_COMPRA', deleted_at:'2026-10-16', caminho_arquivo: 'https://s3.test/excluido.pdf' }
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
  await page.route('https://seguro.test/**', route => route.fulfill({ contentType: 'application/pdf', body: '%PDF-QA' }));
  await page.addInitScript(() => {
    HTMLAnchorElement.prototype.click = function captureClick() {
      window.abertos = [...(window.abertos || []), { href: this.href, download: this.download, target: this.target }];
    };
  });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  await page.goto(`${base}/fixture`);
  const modal = page.getByRole('dialog', { name: 'Arquivos da solicitação SOL-42' });
  await modal.getByText('nota.pdf').waitFor();
  await modal.getByText('segundo.png').waitFor();
  assert.equal(await modal.getByText('comprovante.png', {exact:true}).count(), 0);
  assert.equal(await modal.getByText('boleto-informativo.pdf', {exact:true}).count(), 0);
  assert.equal(await modal.getByRole('listitem').count(), 4);
  await modal.getByText('compra.pdf', { exact:true }).waitFor();
  await modal.getByText('frete.pdf', { exact:true }).waitFor();
  assert.equal(await modal.getByText('excluido.pdf', { exact:true }).count(), 0);
  assert.deepEqual(await page.evaluate(() => window.consultas), [42]);
  assert.equal(await page.evaluate(() => (window.links || []).length), 0, 'Link seguro so deve ser solicitado ao abrir');
  await modal.getByRole('button', { name: 'Visualizar' }).first().click();
  const preview = page.getByRole('dialog', { name: 'nota.pdf', exact: true });
  await preview.locator('iframe').waitFor();
  assert.deepEqual(await page.evaluate(() => window.links), ['https://s3.test/nota.pdf']);
  assert.equal(await preview.locator('iframe').getAttribute('src'), 'https://seguro.test/arquivo');
  assert.equal(await page.evaluate(() => (window.abertos || []).length), 0, 'Visualizar PDF nao aciona ancora externa');
  await preview.getByRole('button', { name: 'Fechar', exact: true }).click();
  await modal.getByRole('button', { name: 'Baixar' }).first().click();
  await page.waitForFunction(() => (window.abertos || []).length === 1);
  assert.equal(await page.evaluate(() => window.abertos[0].download), 'nota.pdf');
  await page.goto(`${base}/fixture?empty=1`);
  await page.getByRole('dialog', { name: 'Arquivos da solicitação SOL-43' }).getByText('Nenhum boleto anexado à solicitação ou aos seus pedidos de compra.').waitFor();
  assert.equal(await page.getByRole('button', {name:/Visualizar/}).count(), 0);
  assert.deepEqual(errors, []);
  console.log('OK: modal somente boletos (PDF/imagem), exclui comprovantes/anexos comuns mesmo em resposta antiga, presign sob demanda, preview/download e vazio.');
} finally {
  await browser.close();
  await server.close();
}
