// UI/CSS/HTTP reais, API interceptada localmente; sem dados/integracoes reais.
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(root, '../outputs/devolucao-cheques'); mkdirSync(output, { recursive: true });
const user = { id: 7, perfil: 'SUPERADMIN', role: 'SUPERADMIN' };
const fixture = `import React,{useMemo,useState}from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';
import Editor from '/src/components/financeiro/DevolucaoChequesComposta.jsx';import Page from '/src/pages/FinanceiroBaixasCompostas.jsx';
import{WorkspacePageContext,createWorkspaceMemory}from'/src/navigation/WorkspaceContext.jsx';
import'/src/index.css';import'/src/styles/design-tokens.css';import'/src/styles/componentes-padrao.css';import'/src/styles/escala.css';
function App(){const[ativo,A]=useState(true),[permitido,P]=useState(true);window.alternar=A;window.permissao=P;const memory=useMemo(()=>createWorkspaceMemory(),[]);
return <MemoryRouter initialEntries={['/financeiro/baixas-compostas?grupo=1']}><WorkspacePageContext.Provider value={{key:'cheques-qa',memory,snapshot:true,active:true,tabId:'qa'}}>
{location.search.includes('pagina')?<Page/>:ativo?<Editor grupoId={1} permitido={permitido}/>:<p>Outra aba</p>}
</WorkspacePageContext.Provider></MemoryRouter>};createRoot(document.getElementById('root')).render(<App/>);`;
const server = await createServer({ root, configFile: false, logLevel: 'error', server: { host: '127.0.0.1', port: 0 },
  plugins: [{ name: 'devolucao-cheques-qa', enforce: 'pre',
    resolveId(id) { if (id === '/fixture.jsx') return '\0devolucao-qa.jsx'; },
    async load(id) { if (id === '\0devolucao-qa.jsx') return transformWithEsbuild(fixture, 'fixture.jsx', { loader: 'jsx', jsx: 'transform' }); },
    transform(code, id) {
      if (id.endsWith('/src/services/api.js')) return code.replace('normalizeApiUrl(import.meta.env.VITE_API_URL)', "'/api'");
      if (id.endsWith('/contexts/AuthContext.jsx')) return `export const useAuth=()=>({user:${JSON.stringify(user)}});`;
      if (id.endsWith('/contexts/ThemeContext.jsx')) return 'export const useTheme=()=>({tema:{status:{}}});';
    },
    configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
      if (new URL(req.url, 'http://localhost').pathname !== '/fixture') return next();
      res.setHeader('Content-Type', 'text/html'); res.end(await vite.transformIndexHtml('/fixture', '<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
    }); }
  }, react()], optimizeDeps: { include: ['react', 'react-dom/client', 'react-router-dom'] } });
let browser, version, operations, returned, writes, previews, lost, stale, reads, deny;
const errors = [];
function reset() { version = 1; operations = []; returned = []; writes = []; previews = []; lost = false; stale = false; reads = 0; deny = false; }
function grupo() { return { id: 1, codigo: 'BC-QA', tipo: 'RECEBIMENTO', status: returned.length ? 'PARCIAL_ESTORNADO' : 'CONFIRMADO',
  valor_principal: '41666.67', valor_quitacao: '41666.67', componentes: [], parceiro: { nome: 'Cliente QA' }, empresa: { nome: 'Empresa QA' },
  estornos_cheques: operations.map(o => ({ ...o, motivo: 'Substituicao QA', motivo_bancario: '22', data_devolucao: '2026-10-20' })) }; }
function result(body) { return { grupo_id: 1, codigo: 'BC-QA', cheque_ids: body.cheque_ids, valor_total: String(body.cheque_ids.length * 8000),
  titulos: [{ id: 8746, codigo: 'TIT-007520', saldo_antes: '0.00', saldo_depois: body.cheque_ids.includes(88) ? '14792.76' : '8000.00', status_depois: 'PARCIAL' },
    ...(body.cheque_ids.includes(88) ? [{ id: 8747, codigo: 'TIT-QA-2', saldo_antes: '0.00', saldo_depois: '1207.24', status_depois: 'PARCIAL' }] : [])] }; }
const setor = p => p.getByRole('region', { name: 'Devolução seletiva de cheques' });
const cheque = (p, n = '000488') => p.getByRole('checkbox', { name: new RegExp(`Cheque ${n} —`) });
const conferir = p => p.getByRole('button', { name: /^Conferir devolução/ });
const confirmar = p => p.getByRole('button', { name: /^Confirmar devolução de/ });
async function preencher(p, multi = false) {
  await cheque(p).check(); if (multi) await cheque(p, '000329').check();
  await p.getByLabel('Motivo bancário (código)', { exact: true }).fill('22');
  await p.getByLabel('Justificativa da devolução', { exact: true }).fill('Recebimento sera substituido - QA');
  await p.getByLabel('Data da devolução', { exact: true }).fill('20/10/2026');
  await p.getByLabel('Data da devolução', { exact: true }).press('Tab');
}
async function previa(p) { await conferir(p).click(); await confirmar(p).waitFor(); }
async function aceite(p) { await p.getByRole('checkbox', { name: /^Conferi os cheques/ }).check(); }
try {
  await server.listen(); browser = await chromium.launch({ channel: 'chrome', headless: true });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  async function pagina(width, real = false) {
    const p = await browser.newPage({ viewport: { width, height: 900 } }); p.setDefaultTimeout(12000);
    p.on('pageerror', e => errors.push(e.message));
    await p.route('**/*', async route => {
      const url = new URL(route.request().url()); if (url.origin !== base) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      let data = [], status = 200;
      if (url.pathname.endsWith('/cheques-devolucao')) {
        reads++;
        if (deny) { status = 403; data = { error: 'Sem permissao para conferir recebimentos.' }; }
        else data = { revisao: String(version), operacoes: operations, cheques: [85,88,90].map((id, i) => ({ id, codigo: `CHQ-QA-${id}`,
          numero_cheque: ['000488','000329','000999'][i], valor: '8000.00', disponivel: id !== 90 && !returned.includes(id),
          bloqueio: id === 90 ? 'Cheque compensado. Regularize o fluxo bancario.' : returned.includes(id) ? 'Cheque ja devolvido.' : null })) };
      } else if (url.pathname.endsWith('/cheques-devolucao/preview')) {
        const b = route.request().postDataJSON(); previews.push(b); assert.equal(b.data_devolucao, '2026-10-20');
        assert.deepEqual(Object.keys(b).sort(), ['cheque_ids', 'data_devolucao', 'motivo', 'motivo_bancario']);
        data = { ...result(b), preview_hash: String(version).padStart(64, 'a') };
      } else if (url.pathname.endsWith('/cheques-devolucao/confirmar')) {
        const b = route.request().postDataJSON(), chave = route.request().headers()['idempotency-key']; writes.push({ b, chave }); assert(chave);
        await new Promise(r => setTimeout(r, 150));
        if (stale) { stale = false; version++; status = 409; data = { error: 'O recebimento mudou. Consulte os dados atuais.' }; }
        else { data = result(b); returned.push(...b.cheque_ids); version++; operations.push({ chave, usuario_id: 7, resultado: data });
          if (lost) { lost = false; return route.abort(); } }
      } else if (url.pathname === '/api/financeiro/baixas-compostas') data = [grupo()];
      else if (url.pathname === '/api/financeiro/baixas-compostas/1') data = grupo();
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await p.goto(`${base}/fixture${real ? '?pagina=1' : ''}`); await cheque(p).waitFor(); return p;
  }
  for (const width of [1366,390]) {
    reset(); let p = await pagina(width); await preencher(p, true); await previa(p);
    assert(await confirmar(p).isDisabled()); assert(await cheque(p, '000999').isDisabled());
    assert((await setor(p).innerText()).includes('TIT-QA-2'));
    await p.getByLabel('Justificativa da devolução').fill('Justificativa alterada QA'); assert.equal(await confirmar(p).count(), 0);
    await previa(p); await aceite(p); await p.screenshot({ path: path.join(output, `previa-${width}.png`), fullPage: true });
    await confirmar(p).evaluate(button => { button.click(); button.click(); });
    await p.getByText(/Devolução confirmada: 2 cheque/).waitFor(); assert.equal(writes.length, 1); assert.equal(returned.length, 2);
    await p.close();
    // Rascunho e restaurado, mas previa/aceite nunca sao restaurados.
    reset(); p = await pagina(width); await preencher(p); await previa(p); await aceite(p);
    await p.evaluate(() => window.alternar(false)); await p.getByText('Outra aba').waitFor(); await p.evaluate(() => window.alternar(true));
    await cheque(p).waitFor(); assert(await cheque(p).isChecked()); assert.equal(await confirmar(p).count(), 0);
    // Falha/versao obsoleta exige leitura explicita, sem repetir a escrita.
    await previa(p); await aceite(p); stale = true; await confirmar(p).click(); await p.getByRole('alert').filter({ hasText: /recebimento mudou/ }).waitFor();
    assert.equal(writes.length, 1); assert.equal(returned.length, 0); assert(await conferir(p).isDisabled());
    await p.getByRole('button', { name: 'Consultar dados atuais', exact: true }).click(); await p.getByRole('button', { name: 'Usar dados atuais' }).click();
    await preencher(p); await previa(p); await aceite(p);
    lost = true; await confirmar(p).click(); await p.getByRole('alert').filter({ hasText: /não será reenviada/ }).waitFor();
    assert.equal(writes.length, 2); assert.equal(returned.length, 1);
    await p.getByRole('button', { name: 'Consultar dados atuais', exact: true }).click(); await p.getByText(/Devolução confirmada: 1 cheque/).waitFor();
    assert.equal(writes.length, 2); await p.close();
    // Pagina real: deep link, filtro parcial, estorno restante e refresh sem loops.
    reset(); p = await pagina(width, true); await preencher(p); await previa(p); await aceite(p); await confirmar(p).click();
    await p.getByText(/Devolução confirmada: 1 cheque/).waitFor();
    await p.getByRole('button', { name: 'Estornar restante do grupo', exact: true }).waitFor(); assert(reads <= 2, 'Nao deve consultar em loop');
    assert.equal(writes.length, 1); await p.screenshot({ path: path.join(output, `pagina-${width}.png`), fullPage: true }); await p.close();
  }
  reset(); const p = await pagina(1366); deny = true; await p.getByRole('button', { name: 'Consultar dados atuais', exact: true }).click();
  await p.getByRole('alert').filter({ hasText: /Sem permissao/ }).waitFor(); assert.equal(await cheque(p).count(), 0); assert.equal(writes.length, 0);
  await p.evaluate(() => window.permissao(false)); assert.equal(await setor(p).count(), 0); await p.close();
  assert.deepEqual(errors, []); console.log('OK: UI real1366/390 e pagina integrada, selecao multipla/rateio, dataBR, previa/aceite, edicao invalida, draft, bloqueios, duplo clique, stale/409, resposta perdida/recibo sem reenvio, ACL, estorno restante e sem loop. HTTP interceptado; sem API/DB reais.');
} finally { await browser?.close(); await server.close(); }
