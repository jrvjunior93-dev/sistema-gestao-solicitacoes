// Paginas reais; API/estado em memoria; sem banco, .env ou rede externa.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '../outputs/rh-contatos'); mkdirSync(output, { recursive: true });
const nomes = [...readFileSync(path.join(root, 'src/services/rhDp.js'), 'utf8').matchAll(/export (?:async )?function (\w+)/g)].map(m => m[1]);
const cadastro = { id: 91, nome: 'Contato QA', cpf: '52998224725', empresa_grupo_id: 1, obra_id: 7,
  data_admissao: '2026-09-01', status: 'ATIVO', tipo_vinculo: 'CLT', telefone: '27999991234',
  telefone_secundario: '27988884321', endereco: 'Rua A', numero: '10', municipio: 'Vitória', estado: 'ES',
  endereco_secundario: 'Rua B', numero_secundario: '20', municipio_secundario: 'Serra', estado_secundario: 'ES' };
const overrides = {
  getRhColaboradores: 'async()=>[window.cadastro]', getRhColaborador: 'async()=>window.cadastro',
  getRhEmpresasGrupo: `async()=>[{id:1,nome:'Empresa QA'}]`,
  criarRhColaborador: 'async p=>{window.salvos.push(structuredClone(p));Object.assign(window.cadastro,p);return window.cadastro}',
  atualizarRhColaborador: 'async(id,p)=>{window.salvos.push(structuredClone(p));Object.assign(window.cadastro,p);return window.cadastro}',
  abrirRhSolicitacao: `async p=>{window.admissoes.push(structuredClone(p));return {id:55,tipo:'ADMISSAO',situacao:'RASCUNHO',dados_json:p.dados}}`,
  getRhChecklistDoTipo: 'async()=>({itens:[]})',
  rhTransferencias: 'async()=>({obras:window.locais,obras_responsavel_ids:[7],itens:[]})'
};
const entry = `import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';
import Cadastro from '/src/pages/RhDpColaboradores.jsx';import Pessoal from '/src/pages/RhDpPessoal.jsx';
import{ThemeContext,TEMA_PADRAO}from'/src/contexts/ThemeContext.jsx';
import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/componentes-padrao.css';
import '/src/styles/escala.css';import '/src/styles/responsive-system.css';
window.cadastro=${JSON.stringify(cadastro)};window.salvos=[];window.admissoes=[];
window.locais=[{id:7,nome:'Obra QA',codigo:'OB-7',tipo_centro_custo:'OBRA'}];
const Page=new URLSearchParams(location.search).has('admissao')?Pessoal:Cadastro;
createRoot(document.getElementById('root')).render(<BrowserRouter><ThemeContext.Provider value={{tema:TEMA_PADRAO}}>
<main className="layout-main"><Page/></main></ThemeContext.Provider></BrowserRouter>);`;
const server = await createServer({ root, configFile: false, logLevel: 'error', cacheDir: path.join(output, 'vite-cache'),
  server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'qa-rh-contatos', enforce: 'pre',
    resolveId(id) { if (id === '/fixture.jsx') return '\0qa-contatos.jsx'; },
    async load(id) { if (id === '\0qa-contatos.jsx') return transformWithEsbuild(entry, 'fixture.jsx', { loader: 'jsx', jsx: 'transform' }); },
    transform(code, id) {
      if (id.endsWith('/src/contexts/AuthContext.jsx')) return `const readonly=new URLSearchParams(location.search).has('readonly');const user={id:2,perfil:readonly?'USUARIO':'SUPERADMIN',area:'DP',setor:{codigo:'DP'},areas_permissoes_configuradas:true,modulos_habilitados:['RH_DP'],areas_permissoes:readonly?['rh_dp.colaboradores.visualizar']:['rh_dp.colaboradores.visualizar','rh_dp.colaboradores.editar','rh_dp.solicitacoes.visualizar','rh_dp.solicitacoes.abrir','rh_dp.solicitacoes.ver_todas']};export const useAuth=()=>({user});`;
      if (id.endsWith('/src/services/rhDp.js')) return nomes.map(n => `export const ${n}=${overrides[n] || 'async()=>[]'};`).join('\n');
      if (id.endsWith('/src/services/obras.js')) return 'export const getObras=async()=>window.locais;export const getMinhasObras=async()=>window.locais;';
      if (id.endsWith('/src/services/setores.js')) return 'export const getSetores=async()=>[];';
      if (id.endsWith('/src/services/notificacoes.js')) return 'export const getNotificacoes=async()=>({total_nao_lidas:0});';
      if (id.endsWith('/src/hooks/useUiVisibility.js')) return 'export const useUiVisibility=()=>({isVisible:()=>true});';
    },
    configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
      if (new URL(req.url, 'http://localhost').pathname !== '/fixture') return next();
      res.setHeader('Content-Type', 'text/html'); res.end(await vite.transformIndexHtml('/fixture',
        '<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
    }); }
  }, react()] });
let browser, page;
const errors = [], external = [];
try {
  await server.listen(); browser = await chromium.launch({ channel: 'chrome', headless: true });
  page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.setDefaultTimeout(10000);
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue();
    external.push(route.request().url()); return route.abort();
  });
  const base = `http://127.0.0.1:${server.httpServer.address().port}/fixture`;
  await page.goto(base);
  await page.getByRole('button', { name: 'Editar colaborador Contato QA', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Detalhe do colaborador', exact: true });
  const primeiro = modal.getByRole('group', { name: 'Endereço', exact: true });
  const segundo = modal.getByRole('group', { name: 'Segundo endereço', exact: true });
  assert.equal(await segundo.getByLabel('Logradouro', { exact: true }).inputValue(), 'Rua B');
  await modal.getByLabel('Segundo telefone', { exact: true }).fill('+55 (27) 99999-1234');
  await modal.getByRole('button', { name: 'Salvar alteracoes', exact: true }).click();
  await modal.getByText('O segundo telefone deve ser diferente do primeiro.', { exact: true }).first().waitFor();
  assert.equal(await page.evaluate(() => window.salvos.length), 0);
  await modal.getByLabel('Segundo telefone', { exact: true }).fill('27977774321');
  await primeiro.getByLabel('Logradouro', { exact: true }).fill('Rua Principal Nova');
  await segundo.getByLabel('Logradouro', { exact: true }).fill('Rua Secundária Nova');
  await modal.getByRole('button', { name: 'Salvar alteracoes', exact: true }).click();
  await page.waitForFunction(() => window.salvos.length === 1);
  assert.equal((await page.evaluate(() => window.salvos[0])).telefone_secundario, '27977774321');
  await modal.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('button', { name: 'Editar colaborador Contato QA', exact: true }).click();
  assert.equal(await segundo.getByLabel('Logradouro', { exact: true }).inputValue(), 'Rua Secundária Nova');
  await modal.getByRole('button', { name: 'Remover segundo endereço', exact: true }).click();
  await modal.getByLabel('Segundo telefone', { exact: true }).fill('');
  await modal.getByRole('button', { name: 'Salvar alteracoes', exact: true }).click();
  await page.waitForFunction(() => window.salvos.length === 2);
  const limpo = await page.evaluate(() => window.salvos[1]);
  assert.equal(limpo.endereco_secundario, null); assert.equal(limpo.telefone_secundario, null);
  assert.equal(limpo.endereco, 'Rua Principal Nova');
  await page.goto(base + '?admissao=1&local_id=7&aba=colaboradores');
  await page.getByRole('button', { name: 'Pedir admissao', exact: true }).click();
  const adm = page.getByRole('dialog');
  await adm.getByLabel('Nome completo', { exact: true }).fill('Novo Contato QA');
  await adm.getByLabel('CPF', { exact: true }).fill('52998224725');
  await adm.getByLabel(/^Empresa do grupo/).selectOption('1');
  await adm.getByLabel(/^Obra \/ Centro de Custo/).selectOption('7');
  await adm.getByLabel('Data de admissao', { exact: true }).fill('11/10/2026');
  await adm.getByLabel('Telefone', { exact: true }).fill('(27) 99999-1234');
  await adm.getByLabel('E-mail', { exact: true }).fill('qa@example.invalid');
  await adm.getByLabel('Nome da mae', { exact: true }).fill('Mãe QA');
  const a1 = adm.getByRole('group', { name: 'Endereço', exact: true });
  const a2 = adm.getByRole('group', { name: 'Segundo endereço', exact: true });
  await a1.getByLabel('Logradouro', { exact: true }).fill('Rua da Admissão');
  await a1.getByLabel('Número', { exact: true }).fill('30');
  await a1.getByLabel('Município', { exact: true }).fill('Vitória');
  await adm.getByRole('button', { name: 'Adicionar segundo endereço', exact: true }).click();
  await a2.getByLabel('Usar o mesmo endereço', { exact: true }).check();
  assert.equal(await a2.getByLabel('Logradouro', { exact: true }).inputValue(), 'Rua da Admissão');
  await a1.getByLabel('Número', { exact: true }).fill('31');
  assert.equal(await a2.getByLabel('Número', { exact: true }).inputValue(), '31');
  await a2.getByLabel('Usar o mesmo endereço', { exact: true }).uncheck();
  await a2.getByLabel('Logradouro', { exact: true }).fill('Outro endereço');
  await a2.getByLabel('Usar o mesmo endereço', { exact: true }).check();
  await adm.getByRole('button', { name: 'Adicionar segundo telefone', exact: true }).click();
  await adm.getByLabel('Segundo telefone', { exact: true }).fill('+55 (27) 99999-1234');
  await adm.getByRole('button', { name: 'Criar rascunho', exact: true }).click();
  await adm.getByText('O segundo telefone deve ser diferente do primeiro.', { exact: true }).first().waitFor();
  assert.equal(await page.evaluate(() => window.admissoes.length), 0);
  await adm.getByLabel('Segundo telefone', { exact: true }).fill('27988884321');
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await a2.scrollIntoViewIfNeeded();
    const bounds = await a2.getByLabel('Logradouro', { exact: true }).boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, 'Endereco cabe no viewport');
    await page.screenshot({ path: path.join(output, `admissao-${width}.png`) });
  }
  await adm.getByRole('button', { name: 'Criar rascunho', exact: true }).click();
  await page.waitForFunction(() => window.admissoes.length === 1);
  const dados = (await page.evaluate(() => window.admissoes[0])).dados;
  assert.equal(dados.endereco_secundario, dados.endereco); assert.equal(dados.numero_secundario, '31');
  assert.equal(dados.telefone_secundario, '27988884321'); assert.equal(dados.mesmo_endereco, undefined);
  await page.goto(base + '?readonly=1');
  await page.getByRole('button', { name: 'Ver colaborador Contato QA', exact: true }).click();
  assert.equal(await modal.getByLabel('Segundo telefone', { exact: true }).isDisabled(), true);
  assert.equal(await segundo.getByLabel('Logradouro', { exact: true }).isDisabled(), true);
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  console.log('OK UI contatos RH: editar/reabrir/limpar, admissao/copiar sincronizado, telefones distintos, payload, consulta, desktop/mobile. Sem banco/rede externa.');
} catch (error) {
  if (page) { await page.screenshot({ path: path.join(output, 'falha.png') });
    console.error((await page.getByRole('dialog').allTextContents()).join('\n').slice(0, 4000)); }
  throw error;
} finally { await browser?.close(); await server.close(); }
