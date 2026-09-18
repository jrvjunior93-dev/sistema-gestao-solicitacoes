import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = `
  import React, { useState } from 'react';
  import { createRoot } from 'react-dom/client';
  import RetornoSolicitacaoBar from '/src/pages/SolicitacaoDetalhe/RetornoSolicitacaoBar.jsx';
  function Tela() {
    const [devolvivel, setDevolvivel] = useState(true);
    return <RetornoSolicitacaoBar
      solicitacao={{ id: 42, contexto_interacao: {
        pode_interagir: true, setor_atual: 'OBRA',
        pedidos_retorno_para_decisao: [],
        devolucao_retorno: devolvivel ? { pedido_id: 17, setor_destino: 'FINANCEIRO' } : null
      } }}
      onMudou={() => setDevolvivel(false)}
    />;
  }
  createRoot(document.getElementById('root')).render(<Tela />);
`;
const servicos = `
  export async function devolverSolicitacaoAposRetorno(id) {
    window.devolucoes = [...(window.devolucoes || []), id];
    return { solicitacao: { id, area_responsavel: 'FINANCEIRO' } };
  }
  export async function cancelarRetornoSolicitacao() { throw new Error('Acao inesperada'); }
  export async function decidirRetornoSolicitacao() { throw new Error('Acao inesperada'); }
  export async function solicitarRetornoSolicitacao() { throw new Error('Acao inesperada'); }
`;

const server = await createServer({
  root, configFile: false, logLevel: 'error', server: { host: '127.0.0.1', port: 0 },
  plugins: [{
    name: 'fixture-devolucao-retorno', enforce: 'pre',
    resolveId(id) { if (id === '/fixture.jsx') return '\0fixture-devolucao-retorno.jsx'; },
    async load(id) {
      if (id === '\0fixture-devolucao-retorno.jsx') {
        return transformWithEsbuild(fixture, 'fixture.jsx', { loader: 'jsx', jsx: 'transform' });
      }
    },
    transform(code, id) { if (id.endsWith('/src/services/solicitacoes.js')) return servicos; },
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (req.url !== '/fixture') return next();
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
  const erros = [];
  page.on('pageerror', (error) => erros.push(error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/fixture`);
  const botao = page.getByRole('button', { name: 'Devolver para FINANCEIRO' });
  await botao.click();
  const confirmacao = page.getByRole('dialog', { name: 'Devolver solicitação ao setor anterior' });
  await confirmacao.getByRole('button', { name: 'Cancelar' }).click();
  assert.equal(await page.evaluate(() => (window.devolucoes || []).length), 0, 'Cancelar nao deve mover a solicitacao');
  await botao.click();
  await confirmacao.getByRole('button', { name: 'Devolver para FINANCEIRO' }).click();
  await page.getByTestId('devolucao-retorno-aprovado').waitFor({ state: 'hidden' });
  assert.deepEqual(await page.evaluate(() => window.devolucoes), [42]);
  assert.deepEqual(erros, []);
  console.log('OK: devolucao ao setor aprovador exige confirmacao, cancela sem enviar e atualiza a tela.');
} finally {
  await browser.close();
  await server.close();
}
