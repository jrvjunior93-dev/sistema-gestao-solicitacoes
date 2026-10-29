import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { projetarPrivacidadeRh } = require('../../backend/src/services/rhPrivacidadeObraDomain');
const output = path.resolve(root, '../outputs/rh-privacidade-obra'); mkdirSync(output, { recursive: true });
const fixture = `import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';
import Pagamento from '/src/components/rh/RhDpPagamentoModal.jsx';import Cadastro from '/src/components/rh/RhColaboradorObraModal.jsx';
import Editor from '/src/pages/RhDpColaboradores.jsx';import{ThemeContext,TEMA_PADRAO}from'/src/contexts/ThemeContext.jsx';
import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/componentes-padrao.css';
const mode=new URLSearchParams(location.search).get('mode');
createRoot(document.getElementById('root')).render(<ThemeContext.Provider value={{tema:TEMA_PADRAO}}><MemoryRouter><main className="layout-main">
{mode.startsWith('cadastro')?<Cadastro id={7} onFechar={()=>{}}/>:mode==='editor'?<Editor colaboradorId={7} comoEditor onFecharEditor={()=>{}}/>:<Pagamento solicitacaoId={91} local={{id:10,nome:'Obra QA'}} onFechar={()=>{}}/>}
</main></MemoryRouter></ThemeContext.Provider>);`;
const server = await createServer({ root, configFile: false, logLevel: 'error', cacheDir: path.join(output, 'vite-cache'), server: { host: '127.0.0.1', port: 0 }, plugins: [{
  name: 'rh-privacidade-qa', enforce: 'pre',
  resolveId(id) { if (id === '/fixture.jsx') return '\0rh-privacidade-fixture.jsx'; },
  async load(id) { if (id === '\0rh-privacidade-fixture.jsx') return transformWithEsbuild(fixture, 'fixture.jsx', { loader: 'jsx', jsx: 'transform' }); },
  transform(code, id) {
    if (id.endsWith('/src/services/api.js')) return code.replace('normalizeApiUrl(import.meta.env.VITE_API_URL)', "'/api'");
    if (id.endsWith('/src/contexts/AuthContext.jsx')) return `import{createContext}from'react';export const AuthContext=createContext({});export const useAuth=()=>({user:{id:1,perfil:'SUPERADMIN',area:'DP',modulos_habilitados:['RH_DP']}});`;
  },
  configureServer(s) { s.middlewares.use(async (req, res, next) => {
    if (new URL(req.url, 'http://localhost').pathname !== '/fixture') return next();
    res.setHeader('Content-Type', 'text/html'); res.end(await s.transformIndexHtml('/fixture', '<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
  }); }
}, react()] });
let browser;
const errors = [];
try {
  await server.listen(); browser = await chromium.launch({ channel: 'chrome', headless: true });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  async function abrir(mode, width) {
    const page = await browser.newPage({ viewport: { width, height: 920 } }); page.setDefaultTimeout(12000);
    page.on('pageerror', e => errors.push(e.message));
    const calls = [];
    const pessoa = { id: 7, nome: 'Pessoa QA', cpf: '52998224725', obra_id: 10, empresa_grupo_id: 1, tipo_vinculo: 'CLT', status: 'ATIVO',
      data_admissao: '2020-01-01', forma_calculo_gerencial: 'MENSAL', salario_base: 9743.21, salario_restrito_obra: true, observacoes: 'Inicial' };
    const payment = { solicitacao: { id: 91, codigo: 'RH-QA91', obra_id: 10, situacao: 'RASCUNHO', dados_json: { revisao: 1, competencia: '2026-10', data_vencimento: '2026-10-30', titulos: [],
      linhas: [{ colaborador_id: 7, nome: 'Pessoa QA', cpf: pessoa.cpf, salario_base: 9743.21, base: 9743.21, forma_calculo_gerencial: 'MENSAL',
        bruto: 3897.28, liquido: 3897.28, selecionado: true, parcela_40: true, parcela_60: false, parcela_50: false, dias: 30, faltas: 0, acrescimos: 0, descontos: 0,
        cadastro_versao: 'SECRET-HASH', modo_recebimento: 'PIX', chave_pix: 'qa@example.test', favorecido_nome: 'Pessoa QA', favorecido_documento: pessoa.cpf, conferido_obra: false, conferido_dp: false }] } },
      pode_conferir: mode === 'dp', pode_enviar_fila: mode === 'dp', responsaveis: [], avisos: [] };
    const docs = [{ id: 3, nome_original: 'arquivo-da-obra.pdf', tipo_nome: 'Documento', status: 'ENVIADO' }];
    let falharCadastro = mode === 'cadastro-erro';
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== base) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      const method = request.method(); calls.push({ path: url.pathname, method, body: request.postData() });
      let result = [];
      if (url.pathname.includes('/cadastro-obra')) {
        if (falharCadastro && method === 'GET') {
          falharCadastro = false;
          return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Erro no cadastro limitado do colaborador' }) });
        }
        if (method === 'POST') { await new Promise(r => setTimeout(r, 200)); docs.push({ id: 4, nome_original: 'novo.pdf', status: 'ENVIADO' }); result = { replay: false }; }
        else {
          if (method === 'PATCH') pessoa.observacoes = request.postDataJSON().observacoes;
          result = { colaborador: { id: 7, nome: pessoa.nome, observacoes: pessoa.observacoes }, documentos: docs, tipos_documento: [{ id: 5, nome: 'Documento' }], pode_editar: true };
        }
      } else if (url.pathname.startsWith('/api/rh/pagamentos-solicitacao')) {
        if (method === 'PUT') {
          const body = request.postDataJSON(); assert.equal(body.linhas[0].salario_base, null); assert.equal(body.linhas[0].cadastro_versao, undefined);
          for (const key of ['parcela_40', 'parcela_60', 'acrescimos', 'descontos', 'conferido_obra']) payment.solicitacao.dados_json.linhas[0][key] = body.linhas[0][key];
          payment.solicitacao.dados_json.revisao++;
        }
        result = mode === 'dp' ? structuredClone(payment) : projetarPrivacidadeRh(payment, new Set([7]));
      } else if (url.pathname === '/api/rh/colaboradores/7') {
        if (method === 'PATCH') { pessoa.salario_restrito_obra = request.postDataJSON().salario_restrito_obra; }
        result = pessoa;
      } else if (url.pathname.endsWith('/dossie')) result = { arquivos: [], resumo: {} };
      else if (url.pathname.endsWith('/documentos')) result = { itens: [], total: 0 };
      else if (url.pathname.includes('empresas')) result = [{ id: 1, nome: 'Empresa QA', ativo: true }];
      else if (url.pathname === '/api/obras' || url.pathname === '/api/obras/minhas') result = [{ id: 10, nome: 'Obra QA', tipo_centro_custo: 'OBRA' }];
      else if (url.pathname.includes('preferencias')) result = { preferencias: {} };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) }).catch(() => {});
    });
    await page.goto(`${base}/fixture?mode=${mode}`); return { page, calls };
  }
  for (const width of [1366, 390]) {
    const { page, calls } = await abrir('obra', width);
    const modal = page.getByRole('dialog', { name: 'Solicitar pagamento', exact: true });
    await modal.getByText('Salário restrito ao DP', { exact: true }).waitFor();
    assert.ok(!(await page.locator('body').innerText()).match(/9\.743,21|3\.897,28/));
    const row = modal.locator('tbody tr').first();
    await row.getByLabel('40%: Pessoa QA', { exact: true }).uncheck();
    await row.getByLabel('60%: Pessoa QA', { exact: true }).check();
    await row.getByLabel('Acréscimos: Pessoa QA', { exact: true }).fill('80,00');
    await row.getByLabel('Descontos: Pessoa QA', { exact: true }).fill('30,00');
    await modal.getByRole('button', { name: 'Salvar', exact: true }).click();
    await page.waitForFunction(() => document.body.innerText.includes('Salvo'));
    assert.ok(calls.some(c => c.method === 'PUT'));
    const enviado = JSON.parse(calls.filter(c => c.method === 'PUT').at(-1).body).linhas[0];
    assert.equal(enviado.parcela_60, true); assert.equal(enviado.parcela_40, false);
    assert.equal(enviado.acrescimos, 80); assert.equal(enviado.descontos, 30);
    assert.ok(!(await page.locator('body').innerText()).match(/9\.743,21|3\.897,28/));
    await modal.screenshot({ path: path.join(output, `pagamento-obra-${width}.png`) }); await page.close();
    const cadastro = await abrir('cadastro', width), c = cadastro.page;
    const dialog = c.getByRole('dialog', { name: 'Cadastro do colaborador' });
    await dialog.getByLabel('Observações', { exact: true }).fill('Conferido pela obra');
    assert.equal(await dialog.getByLabel('Salário base', { exact: true }).count(), 0);
    assert.equal(await dialog.getByLabel('CPF', { exact: true }).count(), 0);
    await dialog.getByRole('button', { name: 'Salvar observações' }).dblclick();
    await c.getByText('Observações salvas.', { exact: true }).waitFor();
    const writes = cadastro.calls.filter(r => r.method === 'PATCH'); assert.equal(writes.length, 1); assert.deepEqual(JSON.parse(writes[0].body), { observacoes: 'Conferido pela obra' });
    await dialog.getByLabel('Tipo de documento').selectOption('5');
    await dialog.getByLabel('Arquivo', { exact: true }).setInputFiles({ name: 'novo.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-QA') });
    await dialog.getByLabel('Observações', { exact: true }).fill('Observação ainda não salva');
    await dialog.getByRole('button', { name: 'Enviar documento' }).dblclick();
    await c.getByText('Documento enviado.', { exact: true }).waitFor();
    assert.equal(cadastro.calls.filter(r => r.method === 'POST').length, 1);
    assert.equal(await dialog.getByLabel('Observações', { exact: true }).inputValue(), 'Observação ainda não salva');
    assert.equal(await c.getByText('DP-PRIVATE').count(), 0);
    await dialog.screenshot({ path: path.join(output, `cadastro-obra-${width}.png`) }); await c.close();
    const falha = await abrir('cadastro-erro', width);
    const d = falha.page.getByRole('dialog', { name: 'Cadastro do colaborador' });
    await d.getByRole('alert').getByText('Erro no cadastro limitado do colaborador', { exact: true }).waitFor();
    assert.equal(await d.getByText('Carregando cadastro…', { exact: true }).count(), 0);
    assert.equal(await d.getByLabel('Observações', { exact: true }).count(), 0);
    await d.getByRole('button', { name: 'Tentar novamente' }).click();
    await d.getByLabel('Observações', { exact: true }).waitFor();
    assert.equal(falha.calls.filter(r => r.path.endsWith('/cadastro-obra') && r.method === 'GET').length, 2);
    assert.equal(falha.calls.filter(r => r.method !== 'GET').length, 0);
    await falha.page.close();
  }
  const dp = await abrir('dp', 1366);
  await dp.page.getByText('R$ 9.743,21', { exact: false }).first().waitFor(); await dp.page.close();
  const editor = await abrir('editor', 1366);
  const sigilo = editor.page.getByRole('checkbox', { name: /Salário restrito aos usuários da obra/ });
  await sigilo.waitFor(); assert.equal(await sigilo.isChecked(), true); await sigilo.uncheck();
  await sigilo.locator('xpath=ancestor::div[contains(@class,"form-group")][1]').screenshot({ path: path.join(output, 'flag-cadastro-dp.png') });
  await editor.page.getByRole('button', { name: 'Salvar alteracoes', exact: true }).click();
  await editor.page.getByText('Colaborador salvo.', { exact: true }).waitFor();
  assert.equal(JSON.parse(editor.calls.find(c => c.method === 'PATCH' && c.path === '/api/rh/colaboradores/7').body).salario_restrito_obra, false);
  await editor.page.close(); assert.deepEqual(errors, []);
  console.log('UI RH: Obra sem salario/bruto/liquido/total, percentuais/ajustes/save; DP com valores e flag; cadastro limitado/arquivos da obra/mutex e observacoes preservadas em1366/390 PASS. Sem API/DB reais.');
} catch (error) {
  console.error('Erros da pagina:', errors);
  for (const context of browser?.contexts() || []) for (const page of context.pages()) {
    console.error((await page.locator('body').innerText()).slice(0, 3000));
    await page.screenshot({ path: path.join(output, 'falha.png'), fullPage: true });
  }
  throw error;
} finally { await browser?.close(); await server.close(); }
