// Componentes/CSS/HTTP reais; API interceptada em memoria e sem servicos externos.
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(root, '../outputs/negociacao-pagamento'); mkdirSync(output, { recursive: true });
const titulo = { id: 11543, codigo: 'TIT-011543', renegociacao_id: 6, tipo: 'PAGAR', status: 'ABERTO',
  empresa_id: 8, parceiro_id: 7, parceiro: { id: 7, nome: 'Credor QA' }, valor_original: '18522.15', valor_saldo: '18522.15',
  valor_baixado: '0.00', updatedAt: '2026-10-22T12:00:00Z', pagamento_negociacao: null };
const fixture = `import React,{useMemo,useState}from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';
import Editor from '/src/components/financeiro/TituloNegociacaoPagamento.jsx';import Modal from '/src/components/financeiro/TituloNegociacaoModal.jsx';
import{WorkspacePageContext,createWorkspaceMemory}from'/src/navigation/WorkspaceContext.jsx';
import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/componentes-padrao.css';import '/src/styles/escala.css';
function App(){const[t,T]=useState(${JSON.stringify(titulo)});const[permitido,P]=useState(true);window.permissao=P;
const[ativo,A]=useState(true);window.alternar=A;const memory=useMemo(()=>createWorkspaceMemory(),[]);
const origens=useMemo(()=>[{...t,id:1,codigo:'TIT-1',renegociacao_id:null}],[]);
return <MemoryRouter><WorkspacePageContext.Provider value={{key:'pagamento-qa',memory,snapshot:true,active:true,tabId:'qa'}}>
{location.search.includes('modal')?<Modal titulos={origens} onClose={()=>{}}/>:ativo?<Editor titulo={t} permitido={permitido} onSaved={async()=>T(await(await fetch('/api/financeiro/titulos/11543')).json())}/>:<p>Outra aba</p>}
</WorkspacePageContext.Provider></MemoryRouter>};createRoot(document.getElementById('root')).render(<App/>);`;
const server = await createServer({ root, configFile: false, logLevel: 'error', server: { host: '127.0.0.1', port: 0 },
  plugins: [{ name: 'pagamento-negociacao-qa', enforce: 'pre',
    resolveId(id) { if (id === '/fixture.jsx') return '\0pagamento-qa.jsx'; },
    async load(id) { if (id === '\0pagamento-qa.jsx') return transformWithEsbuild(fixture, 'fixture.jsx', { loader: 'jsx', jsx: 'transform' }); },
    transform(code, id) { if (id.endsWith('/src/services/api.js')) return code.replace('normalizeApiUrl(import.meta.env.VITE_API_URL)', "'/api'"); },
    configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
      if (new URL(req.url, 'http://localhost').pathname !== '/fixture') return next();
      res.setHeader('Content-Type', 'text/html'); res.end(await vite.transformIndexHtml('/fixture', '<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
    }); }
  }, react()], optimizeDeps: { include: ['react', 'react-dom/client', 'react-router-dom'] } });
let browser;
const errors = [], writes = [], previews = [];
let snapshot = structuredClone(titulo), version = 0, blocked = false, stale = false, lost = false;
const revision = () => String(version).padStart(64, 'a');
const forma = page => page.getByLabel('Forma de pagamento', { exact: true });
const dados = page => page.getByLabel('Dados para pagamento', { exact: true });
const salvar = page => page.getByRole('button', { name: 'Salvar dados de pagamento', exact: true });
try {
  await server.listen(); browser = await chromium.launch({ channel: 'chrome', headless: true });
  const base = `http://127.0.0.1:${server.httpServer.address().port}/fixture`;
  async function pagina(width, modal = false) {
    const page = await browser.newPage({ viewport: { width, height: 900 } }); page.setDefaultTimeout(10000);
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url()), method = route.request().method();
      if (url.origin !== new URL(base).origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      let data = [], status = 200;
      if (url.pathname.endsWith('/formas-pagamento')) data = [
        { id: 1, nome: 'PIX', codigo: 'PIX', ativo: true }, { id: 2, nome: 'Boleto', codigo: 'BOLETO', ativo: true },
        { id: 3, nome: 'Transferencia', codigo: 'TED', ativo: true }, { id: 4, nome: 'FOPAG', codigo: 'FOPAG', ativo: true }];
      else if (url.pathname === '/api/parceiros') data = [{ id: 9, nome: 'Favorecido QA', cpf_cnpj: '123' }];
      else if (url.pathname.endsWith('/negociacao/pagamento')) {
        if (blocked) { status = 409; data = { error: 'Titulo na fila ou autorizacao. Regularize antes de editar.' }; }
        else if (method === 'GET') data = { pagamento: snapshot.pagamento_negociacao, revisao: revision() };
        else {
          const body = route.request().postDataJSON(); writes.push(body);
          assert.deepEqual(Object.keys(body).sort(), ['pagamento', 'revisao']);
          assert.deepEqual(Object.keys(body.pagamento).sort(), ['chave_pix', 'dados_pagamento', 'favorecido_id', 'forma_pagamento_id']);
          await new Promise(r => setTimeout(r, 120));
          if (stale) { stale = false; version++; status = 409; data = { error: 'O titulo mudou. Confira os dados atuais.' }; }
          else {
            const p = body.pagamento; version++;
            snapshot.pagamento_negociacao = { forma_pagamento_id: p.forma_pagamento_id, forma_pagamento_nome: { 1: 'PIX', 2: 'Boleto', 3: 'Transferencia' }[p.forma_pagamento_id],
              favorecido_id: p.favorecido_id, nome_favorecido: p.favorecido_id === 9 ? 'Favorecido QA' : 'Credor QA',
              favorecido_chave_pix: p.chave_pix, dados_pagamento: p.dados_pagamento };
            snapshot.updatedAt = 'revisao-' + version;
            if (lost) { lost = false; return route.abort(); }
            data = { pagamento: snapshot.pagamento_negociacao, revisao: revision() };
          }
        }
      } else if (url.pathname === '/api/financeiro/titulos/11543') data = snapshot;
      else if (url.pathname.endsWith('/negociacoes/preview')) {
        const body = route.request().postDataJSON(); previews.push(body);
        data = { principal: '18522.15', total: '18522.15', juros: 0, multa: 0, preview_hash: 'a'.repeat(64),
          parcelas: [{ vencimento: '2090-01-01', valor: '18522.15', rateios: [] }] };
      }
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto(base + (modal ? '?modal' : '')); return page;
  }
  for (const width of [1366, 390]) {
    snapshot = structuredClone(titulo); version = 0; blocked = false;
    const page = await pagina(width);
    await page.getByRole('button', { name: 'Editar dados de pagamento' }).click();
    await forma(page).selectOption('1');
    assert.equal(await forma(page).locator('option', { hasText: 'FOPAG' }).count(), 0);
    await page.getByLabel('Chave PIX ou copia e cola', { exact: true }).fill('PIX-NEG-QA');
    await dados(page).fill('Dados combinados com fornecedor');
    await page.getByRole('button', { name: 'Limpar', exact: true }).click();
    await page.getByRole('combobox', { name: 'Favorecido do pagamento *', exact: true }).fill('Favorecido QA');
    await page.getByRole('button', { name: /Favorecido QA/ }).click();
    await page.screenshot({ path: path.join(output, `editar-${width}.png`), fullPage: true });
    const before = writes.length;
    await salvar(page).evaluate(el => { el.click(); el.click(); });
    await page.getByRole('button', { name: 'Editar dados de pagamento' }).waitFor();
    await page.getByText('PIX-NEG-QA', { exact: false }).waitFor();
    assert.equal(writes.length, before + 1); assert.equal(writes.at(-1).pagamento.favorecido_id, 9);
    assert.equal(snapshot.valor_original, '18522.15'); assert.equal(snapshot.parceiro_id, 7);
    await page.getByRole('button', { name: 'Editar dados de pagamento' }).click();
    await forma(page).selectOption('3'); await dados(page).fill('Banco QA / conta QA');
    stale = true; await salvar(page).click(); await page.getByRole('alert').filter({ hasText: 'mudou' }).waitFor();
    assert(await salvar(page).isDisabled()); assert.equal(await dados(page).inputValue(), 'Banco QA / conta QA');
    const total = writes.length;
    await page.getByRole('button', { name: 'Conferir dados atuais' }).click();
    await page.getByRole('button', { name: 'Usar dados atuais', exact: true }).click();
    assert.equal(writes.length, total, 'Conferir nunca salva automaticamente');
    await forma(page).selectOption('2'); await dados(page).fill('Boleto QA');
    lost = true; await salvar(page).click(); await page.getByRole('alert').waitFor();
    assert(await salvar(page).isDisabled());
    const aposPerda = writes.length;
    await page.getByRole('button', { name: 'Conferir dados atuais' }).click();
    await page.getByRole('button', { name: 'Usar dados atuais', exact: true }).click();
    assert.equal(writes.length, aposPerda); assert.equal(await dados(page).inputValue(), 'Boleto QA');
    await page.getByRole('button', { name: 'Cancelar edicao', exact: true }).click();
    blocked = true; await page.getByRole('button', { name: 'Editar dados de pagamento' }).click();
    await page.getByRole('alert').filter({ hasText: 'fila ou autorizacao' }).waitFor();
    assert.equal(await salvar(page).count(), 0);
    await page.evaluate(() => window.permissao(false));
    assert.equal(await page.getByRole('button', { name: 'Editar dados de pagamento' }).count(), 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.close();
  }
  blocked = false;
  const modal = await pagina(1366, true);
  await modal.getByLabel('Motivo da negociação', { exact: true }).fill('Acordo QA');
  await modal.getByRole('button', { name: 'Validar prévia', exact: true }).click();
  await modal.getByRole('alert').filter({ hasText: 'Selecione a forma' }).waitFor();
  await forma(modal).selectOption('1'); await modal.getByLabel('Chave PIX ou copia e cola', { exact: true }).fill('PIX-ACORDO');
  await dados(modal).fill('Instrucao negociada');
  await modal.getByRole('button', { name: 'Validar prévia', exact: true }).click();
  await modal.getByRole('checkbox').waitFor(); await modal.getByRole('checkbox').check();
  assert.equal(previews.at(-1).pagamento.chave_pix, 'PIX-ACORDO');
  await dados(modal).fill('Instrucao alterada');
  assert(await modal.getByRole('button', { name: 'Confirmar negociação', exact: true }).isDisabled());
  await modal.close(); assert.deepEqual(errors, []);
  console.log('OK: UI real 1366/390 e HTTP real interceptado, TIT-011543 legado simulado, forma/favorecido/PIX/boleto/TED, edicao restrita, duplo clique, conflito/releitura, resposta perdida sem reenvio, fila/autorizacao/negativa e previa invalidada. Sem API/DB reais.');
} catch (error) {
  for (const ctx of browser?.contexts() || []) for (const page of ctx.pages()) {
    console.error((await page.locator('body').innerText()).slice(-3000));
    await page.screenshot({ path: path.join(output, 'falha.png'), fullPage: true });
  }
  throw error;
} finally { await browser?.close(); await server.close(); }
