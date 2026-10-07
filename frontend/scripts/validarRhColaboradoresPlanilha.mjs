import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const source = readFileSync(new URL('../src/pages/RhDpColaboradores.jsx', import.meta.url), 'utf8');
const handlers = source.slice(source.indexOf('async function onSelecionarArquivoImportacao('), source.indexOf('async function carregarDocumentosColaborador('));
async function testar({ podeEditar = true, podeVer = true, cancelar = false, falhar = false } = {}) {
  const downloads = [], uploads = [], avisos = [], locks = { importar: { current: false }, baixar: { current: false } };
  let confirmations = 0, removidos = 0, revogados = 0;
  const funcoes = vm.runInNewContext(`${handlers}; ({ importar: onSelecionarArquivoImportacao, baixar: baixarPlanilhaColaboradores })`, {
    podeEditar, user: { id: 2 }, canViewRhDpColaboradores: () => podeVer,
    importandoRef: locks.importar, baixandoPlanilhaRef: locks.baixar,
    setImportando() {}, setBaixandoPlanilha() {},
    confirmar: async () => { confirmations++; await Promise.resolve(); return { ok: !cancelar }; },
    importarRhColaboradores: async file => { uploads.push(file); if (falhar) throw new Error('Falha de teste'); return { importados: 2, atualizados: 3, ignorados: 1, erros: [] }; },
    recarregarColaboradores: async () => {},
    baixarPlanilhaRhColaboradores: async options => { downloads.push(options); await Promise.resolve(); if (falhar) throw new Error('Falha de teste'); return { blob: {}, filename: 'colaboradores.xlsx' }; },
    avisar: { sucesso: message => avisos.push(message), alerta: message => avisos.push(message), erro: message => avisos.push(message) },
    window: { URL: { createObjectURL: () => 'blob:fixture', revokeObjectURL: () => { revogados++; } } },
    document: { body: { appendChild() {} }, createElement: () => ({ click() {}, remove() { removidos++; } }) },
    console: { error() {} }
  });
  await Promise.all([funcoes.importar({ target: { files: [{ name: 'cadastro.xlsx' }] } }), funcoes.importar({ target: { files: [{ name: 'cadastro.xlsx' }] } })]);
  await Promise.all([funcoes.baixar(), funcoes.baixar()]);
  await funcoes.baixar(true);
  return { downloads, uploads, avisos, confirmations, locks, removidos, revogados };
}
const normal = await testar();
assert.equal(normal.uploads.length, 1); assert.equal(normal.confirmations, 1, 'Lock antes da confirmacao');
assert.equal(normal.downloads.length, 2, 'Duplo clique nao baixa duas vezes; modelo separado');
assert.equal(normal.downloads[0].modelo, false); assert.equal(normal.downloads[1].modelo, true);
assert.match(normal.avisos[0], /Atualizados: 3/);
assert.equal(normal.removidos, 2); assert.equal(normal.revogados, 2);
const consulta = await testar({ podeEditar: false });
assert.equal(consulta.uploads.length, 0); assert.equal(consulta.downloads.length, 1);
const negado = await testar({ podeEditar: false, podeVer: false }); assert.equal(negado.downloads.length, 0);
assert.equal((await testar({ cancelar: true })).uploads.length, 0);
const falha = await testar({ falhar: true }); assert.equal(falha.locks.importar.current, false); assert.equal(falha.locks.baixar.current, false);
assert.match(source, /Exportar todos \(Excel\)/); assert.match(source, /Baixar modelo \(Excel\)/);
assert.doesNotMatch(source, /Colaborador Exemplo|function downloadModeloColaboradores/);
console.log('RH frontend: exportacao/modelo, permissao, lock de download/importacao, confirmacao, contadores e falhas validados.');

// Tela real e tema real, com API simulada. Nao conecta a producao.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nomesServicos = source.match(/import\s*\{([^}]+)\}\s*from '\.\.\/services\/rhDp';/)[1].split(',').map(s => s.trim());
const entry = `import React from 'react'; import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom'; import Rh from '/src/pages/RhDpColaboradores.jsx';
import {ThemeContext,TEMA_PADRAO} from '/src/contexts/ThemeContext.jsx';
import '/src/index.css'; import '/src/styles/design-tokens.css'; import '/src/styles/componentes-padrao.css';
import '/src/styles/escala.css'; import '/src/styles/responsive-system.css'; import '/src/components/lista-avancada/lista-avancada.css';
window.baixados=[]; createRoot(document.getElementById('root')).render(<MemoryRouter><ThemeContext.Provider value={{tema:TEMA_PADRAO}}><div className="layout-shell"><main className="layout-main"><Rh/></main></div></ThemeContext.Provider></MemoryRouter>);`;
const server = await createServer({ root, configFile: false, logLevel: 'error', server: { host: '127.0.0.1', port: 0 }, plugins: [{
  name: 'rh-colaboradores-xlsx-fixture', enforce: 'pre',
  resolveId(id) { if (id === '/fixture.jsx') return '\0rh-colaboradores-xlsx-fixture.jsx'; },
  async load(id) { if (id === '\0rh-colaboradores-xlsx-fixture.jsx') return transformWithEsbuild(entry, 'fixture.jsx', { loader: 'jsx', jsx: 'transform' }); },
  transform(code, id) {
    if (id.endsWith('/src/contexts/AuthContext.jsx')) return `export const useAuth=()=>({user:{id:2,perfil:'SUPERADMIN'}});`;
    if (id.endsWith('/src/services/rhDp.js')) return nomesServicos.map(name => name === 'baixarPlanilhaRhColaboradores'
      ? `export const ${name}=async options=>{window.baixados.push(options);await new Promise(r=>setTimeout(r,100));return{blob:new Blob(['fixture']),filename:options.modelo?'modelo.xlsx':'cadastro.xlsx'};};`
      : `export const ${name}=async()=>[];`).join('\n');
    if (id.endsWith('/src/services/obras.js')) return `export const getObras=async()=>[];`;
    if (id.endsWith('/src/services/setores.js')) return `export const getSetores=async()=>[];`;
    if (id.endsWith('/src/services/api.js')) return `export const API_URL='https://fixture.invalid/api';export const API_ORIGIN='https://fixture.invalid';export const authHeaders=()=>({});export const fileUrl=p=>p;export const getAuthToken=()=>null;export const getAuditSessionId=()=>null;export const installFetchSecurityDefaults=()=>{};export const setAuthToken=()=>{};export const clearAuthToken=()=>{};`;
  },
  configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
    if (new URL(req.url, 'http://localhost').pathname !== '/fixture') return next();
    res.setHeader('Content-Type', 'text/html');
    res.end(await vite.transformIndexHtml('/fixture', '<html lang="pt-BR"><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
  }); }
}, react()], optimizeDeps: { include: ['react', 'react-dom/client', 'react-router-dom'] } });
let browser;
try {
  await server.listen(); browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = [], external = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue();
    external.push(route.request().url()); return route.abort();
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/fixture`);
  const exportar = page.getByRole('button', { name: 'Exportar todos (Excel)', exact: true });
  await exportar.waitFor();
  const downloadPromise = page.waitForEvent('download');
  await exportar.evaluate(el => { el.click(); el.click(); });
  assert.equal((await downloadPromise).suggestedFilename(), 'cadastro.xlsx');
  await exportar.waitFor(); assert.equal(await page.evaluate(() => window.baixados.length), 1);
  const modeloPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar modelo (Excel)', exact: true }).click();
  assert.equal((await modeloPromise).suggestedFilename(), 'modelo.xlsx');
  await exportar.waitFor();
  const output = path.resolve(root, '../outputs/rh-colaboradores-planilha'); mkdirSync(output, { recursive: true });
  await page.screenshot({ path: path.join(output, 'toolbar-claro.png') });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; document.documentElement.classList.add('dark'); });
  await page.screenshot({ path: path.join(output, 'toolbar-escuro.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of ['Exportar todos (Excel)', 'Baixar modelo (Excel)', 'Importar massa']) {
    const bounds = await page.getByRole('button', { name, exact: true }).boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 391, `Acao ${name} cabe no celular`);
  }
  await page.screenshot({ path: path.join(output, 'toolbar-celular.png') });
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  console.log('Tela real RH: download/modelo, duplo clique, temas e acoes responsivas validados sem rede externa.');
} finally { await browser?.close(); await server.close(); }
