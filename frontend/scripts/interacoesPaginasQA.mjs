import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';

export async function validarPaginasInteracoes(browser) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const fixture = `import React from 'react';import{createRoot}from'react-dom/client';
    import{BrowserRouter,Routes,Route}from'react-router-dom';
    import Lista from '/src/pages/Solicitacoes/index.jsx';import Detalhe from '/src/pages/SolicitacaoDetalhe/index.jsx';
    import{ThemeContext,TEMA_PADRAO}from'/src/contexts/ThemeContext.jsx';
    import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/componentes-padrao.css';
    createRoot(document.getElementById('root')).render(<BrowserRouter><ThemeContext.Provider value={{tema:TEMA_PADRAO}}><main className="layout-main">
    <Routes><Route path="/fixture" element={<Lista/>}/><Route path="/solicitacoes/:id" element={<Detalhe/>}/></Routes></main></ThemeContext.Provider></BrowserRouter>);`;
  const server = await createServer({ root, configFile: false, logLevel: 'error',
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api') },
    server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'interacoes-paginas', enforce: 'pre',
      resolveId(id) { if (id === '/fixture.jsx') return '\0interacoes-paginas.jsx'; },
      async load(id) { if (id === '\0interacoes-paginas.jsx') return transformWithEsbuild(fixture, 'fixture.jsx', { loader: 'jsx', jsx: 'transform' }); },
      transform(code, id) {
        if (id.endsWith('/src/contexts/LiveUpdatesContext.jsx')) return `import{useEffect,useRef}from'react';
          export function useLiveUpdateSubscription(opts){const ref=useRef(opts);ref.current=opts;useEffect(()=>{
            const f=e=>{if(ref.current.enabled && (!ref.current.filter || ref.current.filter(e.detail)))void ref.current.onEvent(e.detail)};
            window.addEventListener('qa:liveupdate',f);return()=>window.removeEventListener('qa:liveupdate',f)},[])};`;
        if (id.endsWith('/src/contexts/AuthContext.jsx')) return `const user={id:1,perfil:'USUARIO',area:'OBRA',setor:{codigo:'OBRA'},
          areas_permissoes_configuradas:true,areas_permissoes:['solicitacoes.minhas.visualizar'],
          modulos_habilitados:[{key:'COMPRAS',enabled:false},{key:'CONTRATOS',enabled:false},{key:'FINANCEIRO',enabled:false}]};export const useAuth=()=>({user});`;
      },
      configureServer(s) { s.middlewares.use(async (req, res, next) => {
        const p = req.url.split('?')[0];
        if (p !== '/fixture' && p !== '/solicitacoes/90') return next();
        res.setHeader('Content-Type', 'text/html');
        res.end(await s.transformIndexHtml(p, '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
      }); }
    }, react()], optimizeDeps: { include: ['react', 'react-dom/client', 'react-router-dom'] } });
  await server.listen();
  try {
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    for (const width of [1366, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      page.setDefaultTimeout(15000);
      const erros = []; const escritas = []; const leituras = [];
      let novoEventoForaDaPagina = false;
      page.on('pageerror', (e) => erros.push(e.message));
      const registro = { id: 90, codigo: 'SOL-QA90', obra_id: 7, obra: { id: 7, nome: 'Obra QA' }, tipo: { id: 1, nome: 'DESPESA EVENTUAL' },
        descricao: 'Solicitação QA', valor: 1000, valor_exibicao: 1000, status_global: 'PENDENTE', area_responsavel: 'OBRA',
        data_vencimento: '2099-10-10', createdAt: '2026-10-01T12:00:00Z', contexto_interacao: { pode_interagir: false }, anexos: [],
        historicos: [{ id: 123, solicitacao_id: 90, acao: 'COMENTARIO', descricao: 'Conferir documento QA', createdAt: '2026-10-11T12:00:00Z' }],
        interacoes_pendentes: [{ tipo: 'COMENTARIO', quantidade: 1, historico_id: 123, historico_ids: [123] }] };
      await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (!url.href.startsWith(base)) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        const p = url.pathname.slice(4); const method = route.request().method();
        if (method === 'POST' && p.endsWith('/interacoes/leitura')) {
          leituras.push(route.request().postDataJSON()); registro.interacoes_pendentes = [];
          return route.fulfill({ json: { interacoes_pendentes: [] } });
        }
        if (method !== 'GET') escritas.push({ p, method });
        let data = [];
        if (p === '/solicitacoes') data = { items: novoEventoForaDaPagina ? [{ ...registro, id: 91, codigo: 'SOL-QA91',
          interacoes_pendentes: [{ tipo: 'ANEXO', quantidade: 1, historico_id: 124, historico_ids: [124] }] }, registro] : [registro],
          page: 1, total: novoEventoForaDaPagina ? 2 : 1, total_pages: 1, limit: 25 };
        else if (p === '/solicitacoes/90' || p === '/solicitacoes/90/resumo-lista') data = registro;
        else if (p.includes('contadores')) data = { todas: 1, minhas: 1 };
        else if (p.includes('preferencias')) data = { preferencias: { removidos: ['historico'] } };
        return route.fulfill({ json: data });
      });
      await page.goto(`${base}/fixture`);
      const balao = page.getByRole('button', { name: 'Interações pendentes de SOL-QA90: 1', exact: true });
      await balao.waitFor().catch(async (e) => { console.error(erros, await page.locator('body').innerText()); throw e; });
      if (width > 767) assert.equal(await balao.locator('xpath=ancestor::tr').getAttribute('class').then((s) => s.includes('la-urgencia-retorno')), true);
      await balao.press('Enter'); assert.equal(new URL(page.url()).pathname, '/fixture');
      const modal = page.getByRole('dialog', { name: 'Interações · SOL-QA90' });
      await modal.getByRole('link', { name: /Novo comentário no histórico/ }).click();
      await page.getByRole('heading', { name: /SOL-QA90/ }).first().waitFor();
      await page.getByText('Conferir documento QA', { exact: true }).waitFor();
      if (width < 768) assert.equal(await page.getByRole('tab', { name: 'Histórico' }).getAttribute('aria-selected'), 'true');
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('fluxy:interacoes-lidas', {
        detail: { id: 90, usuario_id: 999, interacoes_pendentes: [] }
      })));
      assert.equal(await page.getByRole('button', { name: 'Interações pendentes de SOL-QA90: 1', exact: true }).count(), 1,
        'resposta de outro usuario nao muda leitura atual');
      await page.waitForFunction(() => !document.querySelector('[aria-label="Interações pendentes de SOL-QA90: 1"]'));
      assert.ok(leituras.some((l) => l.historico_ids.includes(123)), 'leitura depois de exibir historico oculto, sem mudar preferencia');
      assert.equal(registro.status_global, 'PENDENTE'); assert.equal(registro.valor, 1000);
      await page.goBack(); await page.getByRole('heading', { name: 'Solicitações', exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: /Interações pendentes de SOL-QA90/ }).count(), 0);
      novoEventoForaDaPagina = true;
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('qa:liveupdate', {
        detail: { entity: 'SOLICITACAO', action: 'INTERACTION_ADDED', record_id: 91 }
      })));
      await page.getByRole('button', { name: 'Interações pendentes de SOL-QA91: 1', exact: true }).waitFor();
      const codigos = width > 767 ? await page.locator('tbody tr').allTextContents() : await page.locator('.la-card').allTextContents();
      assert.ok(codigos.findIndex((s) => s.includes('SOL-QA91')) < codigos.findIndex((s) => s.includes('SOL-QA90')),
        'evento fora da pagina provoca consulta da janela ordenada, nao apenas alteracao da linha');
      assert.deepEqual(escritas, [], 'nenhuma escrita de negocio ou preferencias'); assert.deepEqual(erros, []);
      await page.close();
    }
    console.log('OK: paginas reais lista/detalhe/mobile, Enter isolado, destaque, atalho em bloco oculto, leitura, voltar, sem mudar negocio/preferencias.');
  } finally { await server.close(); }
}
