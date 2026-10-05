import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { descricaoItensCompraDireta } from '../src/pages/SolicitacaoDetalhe/estadoItensCompraDireta.js';

const vazio = { detalhe: null, total: 0, carregando: false, erro: '' };
assert.match(descricaoItensCompraDireta(vazio), /Aguardando/);
assert.match(descricaoItensCompraDireta({ ...vazio, carregando: true }), /Carregando/);
const falha = descricaoItensCompraDireta({ ...vazio, erro: 'Acesso negado' });
assert.match(falha, /Não foi possível carregar/);
assert.ok(!falha.includes('0 item'));
assert.equal(descricaoItensCompraDireta({ ...vazio, detalhe: {}, total: 2 }), '2 item(ns) cadastrado(s) nesta compra direta.');
assert.equal(descricaoItensCompraDireta({ ...vazio, detalhe: {} }), '0 item(ns) cadastrado(s) nesta compra direta.');
const pagina = readFileSync(new URL('../src/pages/SolicitacaoDetalhe/index.jsx', import.meta.url), 'utf8');
assert.match(pagina, /descricao=\{descricaoItensCompraDireta\(/);
assert.match(pagina, /let ativo = true;\s*setCompraDiretaDetalhe\(null\);\s*setCarregandoCompraDireta\(true\)/);
assert.match(pagina, /setCompraDiretaDetalhe\(data \|\| null\);\s*setErroItensCompraDireta\(''\);/);
assert.match(pagina, /erroItensCompraDireta \? \([\s\S]*?\{erroItensCompraDireta\}/);
console.log('Itens de Compra Direta: carregamento, erro, dois itens, vazio real e recuperacao da tela validados.');

if (process.argv.includes('--ui')) {
  const { createServer, transformWithEsbuild } = await import('vite');
  const { default: react } = await import('@vitejs/plugin-react');
  const { chromium } = await import('playwright');
  const { fileURLToPath } = await import('node:url');
  const { dirname, resolve } = await import('node:path');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const fixture = `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import BlocoConteudo from '/src/components/padrao/BlocoConteudo.jsx';
import {descricaoItensCompraDireta} from '/src/pages/SolicitacaoDetalhe/estadoItensCompraDireta.js';
function App(){const [estado,setEstado]=useState({carregando:false,erro:'Acesso negado',detalhe:null,total:0});
return <main><button onClick={()=>setEstado({carregando:true,erro:'',detalhe:null,total:0})}>Simular carregamento</button>
<button onClick={()=>setEstado({carregando:false,erro:'',detalhe:{},total:2})}>Simular sucesso</button>
<button onClick={()=>setEstado({carregando:false,erro:'',detalhe:{},total:0})}>Simular vazio real</button>
<BlocoConteudo titulo="Itens da compra direta" variante="secundario" recolhivel recolhidoPadrao alternarAoClicar
descricao={descricaoItensCompraDireta(estado)} acoes={<button disabled={estado.carregando}>Gerenciar todos os itens</button>}>
{estado.erro?<p>{estado.erro}</p>:<p>Itens carregados: {estado.total}</p>}
</BlocoConteudo></main>};createRoot(document.getElementById('root')).render(<App/>);`;
  const server = await createServer({ root, configFile: false, logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'estado-itens-fixture', enforce: 'pre',
      resolveId(id, importer) {
        if (id === '/fixture.jsx') return '\0estado-itens-fixture.jsx';
        if (importer?.endsWith('BlocoConteudo.jsx') && id.endsWith('PreferenciasContext')) return '\0estado-itens-preferencias';
      },
      async load(id) {
        if (id === '\0estado-itens-fixture.jsx') return transformWithEsbuild(fixture, 'fixture.jsx', { loader: 'jsx', jsx: 'transform' });
        if (id === '\0estado-itens-preferencias') return 'export const TIPO_BLOCOS="blocos"; export function usePreferenciaDeLista(){return [null,()=>{}]}';
      },
      configureServer(s) { s.middlewares.use(async (req, res, next) => {
        if (req.url !== '/fixture') return next();
        res.setHeader('Content-Type', 'text/html');
        res.end(await s.transformIndexHtml('/fixture', '<html><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
      }); }
    }, react()] });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage();
    const erros = []; page.on('pageerror', error => erros.push(error.message));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/fixture`);
    await page.getByText('Não foi possível carregar os itens da compra direta.', { exact: true }).waitFor();
    assert.equal(await page.getByText('0 item(ns) cadastrado(s) nesta compra direta.', { exact: true }).count(), 0);
    await page.getByRole('heading', { name: 'Itens da compra direta' }).click();
    await page.getByText('Acesso negado', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Simular carregamento' }).click();
    await page.getByText('Carregando itens da compra direta...', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Gerenciar todos os itens', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: 'Simular sucesso' }).click();
    await page.getByText('2 item(ns) cadastrado(s) nesta compra direta.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Gerenciar todos os itens', exact: true }).isDisabled(), false);
    await page.getByRole('button', { name: 'Simular vazio real' }).click();
    await page.getByText('0 item(ns) cadastrado(s) nesta compra direta.', { exact: true }).waitFor();
    assert.deepEqual(erros, []);
    console.log('Bloco real no navegador: erro visivel recolhido, expansao, carregamento e recuperacao validados. Fixture local, sem API externa.');
  } finally {
    await browser?.close();
    await server.close();
  }
}
