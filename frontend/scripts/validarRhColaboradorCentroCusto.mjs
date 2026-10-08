// Tela/combo reais, servicos RH simulados e catalogo HTTP local. Sem banco/rede externa.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'src/pages/RhDpColaboradores.jsx'), 'utf8');
const nomes = source.match(/import\s*\{([^}]+)\}\s*from '\.\.\/services\/rhDp';/)[1].split(',').map(s => s.trim());
const catalogo = [
  { id: 19, codigo: 'OB-19', nome: 'Edifício Itália', tipo_centro_custo: 'OBRA' },
  { id: 51, codigo: 'CC-51', nome: 'Administrativo / Escritório', tipo_centro_custo: 'CENTRO_CUSTO' },
  { id: 52, codigo: 'CC-52', nome: 'Comercial e Marketing', tipo_centro_custo: 'CENTRO_CUSTO' }
];
const cadastro = { id: 91, nome: 'Colaborador QA', cpf: '52998224725', empresa_grupo_id: 7,
  obra_id: 51, data_admissao: '2026-09-01', status: 'ATIVO', tipo_vinculo: 'CLT' };
const entry = `import React from 'react';import{createRoot}from'react-dom/client';
import{MemoryRouter}from'react-router-dom';import Page from '/src/pages/RhDpColaboradores.jsx';
import{ThemeContext,TEMA_PADRAO}from'/src/contexts/ThemeContext.jsx';
import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/componentes-padrao.css';
import '/src/styles/escala.css';import '/src/styles/responsive-system.css';
window.salvos=[];window.cadastro=${JSON.stringify(cadastro)};
createRoot(document.getElementById('root')).render(<MemoryRouter><ThemeContext.Provider value={{tema:TEMA_PADRAO}}>
<div className="layout-shell"><main className="layout-main"><Page/></main></div></ThemeContext.Provider></MemoryRouter>);`;
const server = await createServer({ root, configFile: false, logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'qa-rh-centro-custo', enforce: 'pre',
    resolveId(id) { if (id === '/fixture.jsx') return '\0qa-rh-centro-custo.jsx'; },
    async load(id) { if (id === '\0qa-rh-centro-custo.jsx') return transformWithEsbuild(entry, 'fixture.jsx', { loader: 'jsx', jsx: 'transform' }); },
    transform(code, id) {
      if (id.endsWith('/src/contexts/AuthContext.jsx')) return `export const useAuth=()=>({user:new URLSearchParams(location.search).has('readonly')?{id:3,perfil:'USUARIO',rh_dp_capacidades:['rh_dp_colaboradores_view']}:{id:2,perfil:'SUPERADMIN'}});`;
      if (id.endsWith('/src/services/rhDp.js')) return nomes.map(name => {
        if (name === 'getRhEmpresasGrupo') return `export const ${name}=async()=>[{id:7,nome:'Empresa QA'}];`;
        if (name === 'getRhColaboradores') return `export const ${name}=async()=>[window.cadastro];`;
        if (name === 'getRhColaborador') return `export const ${name}=async()=>window.cadastro;`;
        if (['criarRhColaborador', 'atualizarRhColaborador'].includes(name)) return `export const ${name}=async(...args)=>{const payload=args.at(-1);window.salvos.push(JSON.parse(JSON.stringify(payload)));window.cadastro={...window.cadastro,...payload};return window.cadastro;};`;
        return `export const ${name}=async()=>[];`;
      }).join('\n');
      if (id.endsWith('/src/services/setores.js')) return `export const getSetores=async()=>[];`;
      if (id.endsWith('/src/services/api.js')) return `export const API_URL='/api';export const API_ORIGIN=location.origin;export const authHeaders=()=>({});export const fileUrl=p=>p;export const getAuthToken=()=>null;export const getAuditSessionId=()=>null;export const installFetchSecurityDefaults=()=>{};export const setAuthToken=()=>{};export const clearAuthToken=()=>{};`;
    },
    configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
      if (new URL(req.url, 'http://localhost').pathname !== '/fixture') return next();
      res.setHeader('Content-Type', 'text/html');
      res.end(await vite.transformIndexHtml('/fixture', '<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
    }); }
  }, react()], optimizeDeps: { include: ['react', 'react-dom/client', 'react-router-dom'] } });
let browser;
try {
  await server.listen(); browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = [], external = [], scopes = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/obras') {
      scopes.push(url.searchParams.get('escopo'));
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(url.searchParams.get('escopo') === 'TODOS' ? catalogo : [catalogo[0]]) });
    }
    if (url.hostname === '127.0.0.1') return route.continue();
    external.push(url.href); return route.abort();
  });
  const base = `http://127.0.0.1:${server.httpServer.address().port}/fixture`;
  await page.goto(base);
  await page.getByRole('button', { name: 'Novo colaborador', exact: true }).click();
  const campo = page.getByRole('combobox', { name: 'Obra / centro de custo principal', exact: true });
  async function conferirCampo(expected) {
    await page.waitForFunction(expected => document.querySelector('[aria-label="Obra / centro de custo principal"]')?.value === expected, expected);
    assert.equal(await campo.inputValue(), expected);
  }
  await campo.fill('escritorio');
  const centro = page.getByRole('button', { name: 'CC-51 Administrativo / Escritório', exact: true });
  await centro.waitFor(); await centro.click();
  await conferirCampo('CC-51 - Administrativo / Escritório');
  await campo.fill('OB-19'); await campo.press('Enter');
  await conferirCampo('OB-19 - Edifício Itália');
  assert.equal(await page.evaluate(() => window.salvos.length), 0, 'Enter escolhe sem enviar cadastro');
  await campo.fill('CC-52'); await campo.press('Enter');
  await campo.fill(''); await campo.press('Escape');
  await conferirCampo('');
  await campo.fill('Comercial'); await campo.press('Enter');
  await page.getByLabel('Empresa do grupo').selectOption('7');
  await page.getByLabel('Nome', { exact: true }).fill('Colaborador QA');
  await page.getByLabel('CPF', { exact: true }).fill('52998224725');
  await page.getByLabel('Data de admissão', { exact: true }).fill('01/09/2026');
  await page.getByRole('button', { name: 'Criar colaborador', exact: true }).click();
  await page.getByRole('button', { name: 'Salvar alteracoes', exact: true }).waitFor();
  const payload = await page.evaluate(() => window.salvos[0]);
  assert.equal(payload.obra_id, 52); assert.equal(payload.empresa_grupo_id, 7);
  assert.equal(payload.data_admissao, '2026-09-01'); assert.equal(payload.data_inicio, '2026-09-01');
  await conferirCampo('CC-52 - Comercial e Marketing');
  await page.getByRole('button', { name: 'Cancelar edicao', exact: true }).click();
  await page.getByRole('button', { name: 'Editar colaborador Colaborador QA', exact: true }).click();
  await conferirCampo('CC-52 - Comercial e Marketing');
  const output = path.resolve(root, '../outputs/rh-centro-custo'); mkdirSync(output, { recursive: true });
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 }); await campo.fill('CC-'); await centro.waitFor();
    const bounds = await centro.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, 'Lista cabe no viewport');
    await page.screenshot({ path: path.join(output, `autocomplete-${width}.png`) });
    await campo.press('Escape');
  }
  await page.goto(`${base}?readonly=1`);
  assert.equal(await page.getByRole('button', { name: 'Novo colaborador', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Ver colaborador Colaborador QA', exact: true }).click();
  assert.equal(await campo.isDisabled(), true); await conferirCampo('CC-51 - Administrativo / Escritório');
  assert.ok(scopes.length > 0 && scopes.every(scope => scope === 'TODOS'));
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  console.log('OK RH: obras/centros, nome sem acento/codigo, mouse/Enter/Esc, limpar, criar/reabrir, datas/IDs, consulta sem edicao e lista desktop/mobile. Sem banco ou rede externa.');
} finally { await browser?.close(); await server.close(); }
