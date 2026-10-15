// Pagina real, HTTP e sessao em memoria; sem backend ou escrita externa.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const saida = path.resolve(root, '../outputs/rh-titulos-enviados');
await mkdir(saida, { recursive: true });
const stub = '\0qa-rh-envios-';
const plugin = { name: 'qa-rh-envios', enforce: 'pre',
  resolveId(source, importer) {
    if (source.endsWith('/ThemeContext')) return stub + 'tema';
    if (source.endsWith('/AuthContext')) return stub + 'auth';
    if (!importer?.endsWith('/RhDpTitulosEnviados.jsx')) return;
    if (source === '../services/rhDp') return stub + 'api';
    if (source === '../components/padrao') return stub + 'padrao';
  },
  load(id) {
    if (id === stub + 'tema') return 'export const useTheme=()=>({tema:{}});';
    if (id === stub + 'auth') return `export const useAuth=()=>({user:new URLSearchParams(location.search).has('negado')?{id:2,perfil:'USUARIO',setor:'DP',areas_permissoes:[]}:{id:1,perfil:'SUPERADMIN'},authReady:true,isAuthenticated:true});`;
    if (id === stub + 'padrao') return `export{default as Pagina}from'/src/components/padrao/Pagina.jsx';export{default as BlocoConteudo}from'/src/components/padrao/BlocoConteudo.jsx';export{default as PageHeader}from'/src/components/padrao/PageHeader.jsx';export{default as TabelaPadrao}from'/src/components/padrao/TabelaPadrao.jsx';`;
    if (id === stub + 'api') return `
      export async function getRhTitulosEnviados(q){
        window.chamadas.push(q);await new Promise(ok=>setTimeout(ok,80));
        if(window.falhar)throw Error('Falha de consulta simulada');
        let data=[{id:1,codigo:'TIT-DP-1',descricao:'RH-000001 - Salario 40% - Ana QA',credor:'Ana QA',competencia:'2026-10',empresa_id:3,empresa:'Empresa QA',obra_id:7,obra:'Obra QA',recebimento_dp:'DINHEIRO',
          valor:1200,baixado:0,saldo:1200,status_titulo:'ABERTO',status_fila:'PENDENTE',ultimo_envio:'2026-10-15T12:00:00Z',possiveis_duplicados:[2],envios:[{id:2,status:'PENDENTE',enviado_em:'2026-10-15T12:00:00Z',valor_previsto:1200},{id:1,status:'CANCELADO',enviado_em:'2026-10-14T12:00:00Z',valor_previsto:1200}]},
          {id:2,codigo:'TIT-DP-2',descricao:'RH-000002 - Salario 40% - Ana QA',credor:'Ana QA',competencia:'2026-10',empresa_id:3,empresa:'Empresa QA',obra_id:7,obra:'Obra QA',recebimento_dp:'PIX',
          valor:1200,baixado:1200,saldo:0,status_titulo:'QUITADO',status_fila:'BAIXADO',ultimo_envio:'2026-10-14T12:00:00Z',possiveis_duplicados:[1],envios:[{id:3,status:'BAIXADO',enviado_em:'2026-10-14T12:00:00Z',valor_previsto:1200}]}];
        data=data.filter(t=>(!q.recebimento_dp||t.recebimento_dp===q.recebimento_dp)&&(!q.status_titulo||t.status_titulo===q.status_titulo)&&(!q.q||t.credor.includes(q.q)));
        return {data,total:data.length,suspeitos:data.length,filtros:{empresas:[{id:3,nome:'Empresa QA'}],obras:[{id:7,nome:'Obra QA'}]}};
      }`;
  },
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (new URL(req.url, 'http://localhost').pathname !== '/qa-envios') return next();
      res.setHeader('Content-Type', 'text/html');
      res.end(await server.transformIndexHtml('/qa-envios', `<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
      import React from'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';import Page from'/src/pages/RhDpTitulosEnviados.jsx';
      import'/src/index.css';import'/src/styles/design-tokens.css';import'/src/styles/componentes-padrao.css';import'/src/styles/responsive-system.css';
      window.chamadas=[];createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,React.createElement(Page)));
      </script></body></html>`));
    });
  }
};
const server = await createServer({ root, plugins: [plugin], cacheDir: path.join(saida, 'vite-cache'), server: { host: '127.0.0.1', port: 5315, strictPort: true, proxy: {} } });
await server.listen(); let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage(); const erros = [], externas = [];
  page.on('pageerror', e => erros.push(e.message));
  await page.route('**/*', route => { if (new URL(route.request().url()).origin === 'http://127.0.0.1:5315') return route.continue(); externas.push(route.request().url()); return route.abort(); });
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('http://127.0.0.1:5315/qa-envios');
    await page.getByText('TIT-DP-1', { exact: true }).waitFor();
    assert(await page.getByText('TIT-DP-2', { exact: true }).isVisible());
    await page.getByText('2 registro(s)', { exact: true }).click();
    assert(await page.getByText(/Fila #1/).isVisible());
    assert((await page.locator('body').innerText()).includes('Possível duplicidade'));
    await page.getByLabel('Recebimento DP', { exact: true }).selectOption('DINHEIRO');
    await page.getByLabel('Empresa do colaborador', { exact: true }).selectOption('3');
    await page.getByLabel('Competência', { exact: true }).fill('2026-10');
    await page.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
    await page.getByText('TIT-DP-2', { exact: true }).waitFor({ state: 'hidden' });
    await page.getByText('TIT-DP-1', { exact: true }).waitFor();
    assert.equal((await page.evaluate(() => window.chamadas.at(-1))).recebimento_dp, 'DINHEIRO');
    assert.equal(await page.getByRole('button', { name: /^(Baixa em massa|Registrar baixa|Cancelar solicitação|Remover colaborador)( |$)/ }).count(), 0);
    await page.screenshot({ path: path.join(saida, 'relatorio-' + width + '.png'), fullPage: true });
    await page.getByRole('button', { name: 'Limpar', exact: true }).click();
    await page.getByText('TIT-DP-2', { exact: true }).waitFor();
    await page.evaluate(() => { window.falhar = true; });
    await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
    await page.getByRole('alert').getByText('Falha de consulta simulada').waitFor();
    assert.equal(await page.getByText('TIT-DP-1', { exact: true }).count(), 0, 'Erro nao conserva dados antigos como atuais');
  }
  await page.goto('http://127.0.0.1:5315/qa-envios?negado=1');
  await page.getByText('Sem permissão para relatórios do DP.', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.chamadas.length), 0);
  assert.deepEqual(erros, []); assert.deepEqual(externas, []);
  console.log('UI relatorio DP: titulos/status/historico/alerta, filtros/limpar, erro sem dados antigos, permissao negada antes do GET e desktop/mobile aprovados. APIs em memoria.');
} finally { await browser?.close(); await server.close(); }
