// Tela/CSS/servicos reais, HTTP interceptado e rascunho local isolado. Sem API/DB reais.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(root, '../outputs/compra-direta-credor-obrigatorio');
mkdirSync(output, { recursive: true });
const key = 'fluxy_compras_draft_v2:2:compra-direta';
const draft = { payload: { obra_id: 7, tipo_solicitacao_id: 76, necessario_para: '2026-10-30',
  titulo: 'Compra QA', parceiro_id: null, forma_pagamento_ids: [1], favorecido_id: 9,
  favorecido_chave_pix: 'pix-qa', desconto_total: 10, frete_tipo: 'SEM_FRETE',
  itens: [{ manual: true, nome_manual: 'Material QA', unidade_sigla_manual: 'UN',
    quantidade: 2, valor_unitario: 50, valor_total: 100, apropriacao_id: 4,
    apropriacoes: [{ apropriacao_id: 4, quantidade_apropriada: 2 }] }] },
  resumo: { obra_nome: 'Obra QA', credor_nome: '', favorecido: { id: 9, nome: 'Favorecido QA' },
    formas_pagamento: [{ id: 1, nome: 'PIX', codigo: 'PIX', valor: 90, favorecido_id: 9, chave_pix: 'pix-qa' }],
    itens: [{ nome_manual: 'Material QA', insumo_nome: 'Material QA', quantidade: 2, valor_total: 100 }] },
  meta: { expira_em: Date.now() + 86400000 } };
const fixture = `import React from 'react';import{createRoot}from'react-dom/client';
import{MemoryRouter,Routes,Route}from'react-router-dom';
import Nova from '/src/modules/solicitacao-compra/pages/NovaCompraDireta.jsx';
import Revisar from '/src/modules/solicitacao-compra/pages/RevisarCompraDireta.jsx';
import{ThemeContext,TEMA_PADRAO}from'/src/contexts/ThemeContext.jsx';
import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/componentes-padrao.css';import '/src/styles/escala.css';
createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={[location.search.includes('revisao')?'/solicitacoes-compra-direta/revisar':'/nova']}><ThemeContext.Provider value={{tema:TEMA_PADRAO}}>
<Routes><Route path='/nova' element={<Nova/>}/><Route path='/solicitacoes-compra-direta/revisar' element={<Revisar/>}/></Routes>
</ThemeContext.Provider></MemoryRouter>);`;
const server = await createServer({ root, configFile: false, logLevel: 'error', server: { host: '127.0.0.1', port: 0 },
  plugins: [{ name: 'credor-obrigatorio-qa', enforce: 'pre',
    resolveId(id) { if (id === '/fixture.jsx') return '\0credor-fixture.jsx'; },
    async load(id) { if (id === '\0credor-fixture.jsx') return transformWithEsbuild(fixture, 'fixture.jsx', { loader: 'jsx', jsx: 'transform' }); },
    transform(code, id) {
      if (id.endsWith('/src/contexts/AuthContext.jsx')) return `import{createContext}from'react';export const AuthContext=createContext({});
        export const useAuth=()=>({user:{id:2,nome:'Usuario QA',perfil:'SUPERADMIN',modulos_habilitados:['COMPRAS','SOLICITACOES']}});`;
      if (id.endsWith('/src/services/api.js')) return code.replace('normalizeApiUrl(import.meta.env.VITE_API_URL)', "'/api'");
    },
    configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
      if (new URL(req.url, 'http://localhost').pathname !== '/fixture') return next();
      res.setHeader('Content-Type', 'text/html');
      res.end(await vite.transformIndexHtml('/fixture', '<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
    }); }
  }, react()], optimizeDeps: { include: ['react', 'react-dom/client', 'react-router-dom'] } });
let browser;
const errors = [], requests = [];
let rule = true, ruleFailure = false, ruleDelay = 0;
try {
  await server.listen(); browser = await chromium.launch({ channel: 'chrome', headless: true });
  const base = `http://127.0.0.1:${server.httpServer.address().port}/fixture`;
  async function abrir({ width = 1366, credor = null, revisao = false } = {}) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ key, draft, credor }) => {
      const d = structuredClone(draft);
      if (credor) { d.payload.parceiro_id = credor; d.resumo.credor_nome = 'Credor QA'; }
      localStorage.setItem(key, JSON.stringify(d));
    }, { key, draft, credor });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (!url.href.startsWith(base.split('/fixture')[0])) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      requests.push({ path: url.pathname, method: route.request().method() });
      let data = [], status = 200;
      if (url.pathname === '/api/compras/solicitacoes-diretas' && route.request().method() === 'POST') {
        data = { error: 'Selecione o credor da compra direta na lista de resultados.' }; status = 400;
        await new Promise(resolve => setTimeout(resolve, 300));
      } else if (url.pathname.endsWith('/regra-credor')) {
        const snapshot = rule;
        if (ruleDelay) await new Promise(resolve => setTimeout(resolve, ruleDelay));
        data = ruleFailure ? { error: 'Falha QA' } : { credor: { obrigatorio: snapshot } };
        status = ruleFailure ? 503 : 200;
      } else if (url.pathname === '/api/obras/minhas') data = [{ id: 7, nome: 'Obra QA' }, { id: 8, nome: 'Outra obra QA' }];
      else if (url.pathname === '/api/apropriacoes') data = [{ id: 4, codigo: '01', descricao: 'Material QA', obra_id: 7 }];
      else if (url.pathname.endsWith('/formas-pagamento-ativas')) data = [{ id: 1, nome: 'PIX', codigo: 'PIX', ativo: true }];
      else if (url.pathname === '/api/parceiros') data = [{ id: 8, nome: 'Credor QA', cpf_cnpj: '123', ativo: true, fornecedor: true }];
      else if (url.pathname.includes('/preferencias')) data = { preferencias: {} };
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) }).catch(() => {});
    });
    await page.goto(base + (revisao ? '?revisao=1' : ''));
    return page;
  }
  const revisar = page => page.getByRole('button', { name: 'Revisar solicitação', exact: true });
  const credor = page => page.locator('input[role="combobox"][aria-required]');
  const erro = 'Selecione o credor da compra direta na lista de resultados.';
  for (const width of [1366, 390]) {
    rule = true; ruleFailure = false;
    const page = await abrir({ width });
    await page.locator('input[role="combobox"][aria-required="true"]').waitFor();
    await revisar(page).click(); await page.getByText(erro, { exact: true }).first().waitFor();
    await credor(page).fill('Nome apenas digitado');
    await revisar(page).click(); await page.getByText(erro, { exact: true }).first().waitFor();
    await page.waitForTimeout(800);
    const salvo = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), key);
    assert.equal(salvo.payload.parceiro_id, null); assert.equal(salvo.payload.itens.length, 1);
    assert.equal(Number(salvo.payload.desconto_total), 10);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(output, `credor-obrigatorio-${width}.png`), fullPage: true });
    await credor(page).fill('Credor QA');
    await page.getByRole('option', { name: /Credor QA/ }).click();
    await revisar(page).dblclick();
    await page.getByRole('button', { name: 'Criar solicitacao', exact: true }).waitFor();
    const revisado = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), key);
    assert.equal(Number(revisado.payload.parceiro_id), 8); assert.equal(revisado.payload.favorecido_id, 9);
    assert.equal(revisado.payload.desconto_total, 10); assert.equal(revisado.payload.formas_pagamento[0].valor, 90);
    await page.close();
  }
  rule = false;
  const opcional = await abrir();
  await opcional.locator('input[role="combobox"][aria-required="false"]').waitFor();
  await revisar(opcional).click();
  await opcional.getByRole('button', { name: 'Criar solicitacao', exact: true }).waitFor();
  assert.equal(await opcional.evaluate(k => JSON.parse(localStorage.getItem(k)).payload.parceiro_id, key), null);
  await opcional.close();
  rule = true; ruleFailure = true;
  const falha = await abrir();
  const tentar = falha.getByRole('button', { name: 'Tentar conferir regra novamente' });
  await tentar.waitFor(); await revisar(falha).click();
  assert(await revisar(falha).isVisible());
  ruleFailure = false; await tentar.click();
  await falha.locator('input[aria-required="true"]').waitFor();
  await revisar(falha).click(); await falha.getByText(erro, { exact: true }).first().waitFor();
  await falha.close();
  ruleDelay = 1200;
  const aguardando = await abrir({ credor: 8 });
  await revisar(aguardando).click();
  await aguardando.getByText('Aguarde a conferência da regra do credor antes de revisar.', { exact: true }).first().waitFor();
  await aguardando.close();
  assert.equal(requests.filter(r => r.method !== 'GET').length, 0, 'Nenhuma criacao financeira durante revisao ou reprovacao');
  // Rascunho antigo que ja estava na revisao: POST negativo mantem dados e nao repete envio.
  const antiga = await abrir({ revisao: true });
  await antiga.getByRole('button', { name: 'Visualizar PDF antes de criar' }).click();
  await antiga.keyboard.press('Escape');
  await antiga.getByRole('checkbox', { name: /Confirmo que revisei/ }).check();
  await antiga.getByRole('button', { name: 'Criar solicitacao', exact: true }).dblclick();
  await antiga.getByText(erro, { exact: true }).first().waitFor();
  assert.equal(requests.filter(r => r.method === 'POST').length, 1);
  assert.equal(await antiga.evaluate(k => JSON.parse(localStorage.getItem(k)).payload.itens.length, key), 1);
  assert.equal(await antiga.evaluate(k => JSON.parse(localStorage.getItem(k)).payload.parceiro_id, key), null);
  await antiga.close();
  assert.deepEqual(errors, []);
  console.log('OK: UI real desktop/mobile, servico HTTP real, obrigatorio/opcional, nome digitado, selecao, restauracao/autosave de rascunho, favorecido distinto, desconto e falha/recuperacao/espera da regra. Sem API/DB reais.');
} catch (error) {
  for (const context of browser?.contexts() || []) for (const page of context.pages()) {
    console.error((await page.locator('body').innerText()).slice(-3500));
    await page.screenshot({ path: path.join(output, 'falha-qa.png'), fullPage: true });
  }
  throw error;
} finally { await browser?.close(); await server.close(); }
