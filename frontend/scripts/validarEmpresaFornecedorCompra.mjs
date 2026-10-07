import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
import { getCpfCnpjError, maskCpfCnpj, maskPhone, maskCep, onlyDigits } from '../src/utils/formatters.js';
import { getDadosEmpresaParceiroError } from '../src/utils/dadosEmpresaParceiro.js';

const source = readFileSync(new URL('../src/modules/solicitacao-compra/pages/GestaoFornecedores.jsx', import.meta.url), 'utf8');
const functions = source.slice(source.indexOf('function formVazio()'), source.indexOf('/*\n  QUAIS FILTROS'));
const { vazio, editar } = vm.runInNewContext(`${functions}; ({vazio:formVazio(),editar:formDoRegistro})`, { maskCpfCnpj, maskPhone, maskCep });
const empresa = { nome: 'Empresa teste', cnpj: '04.252.011/0001-10', nome_fantasia: 'Fantasia teste',
  representante_nome: 'Representante teste', representante_cpf: '529.982.247-25', representante_cargo: 'Diretor' };
const hidratado = editar({ id: 8, nome: empresa.nome, cnpj: empresa.cnpj, parceiro: empresa });
for (const campo of ['nome_fantasia', 'representante_nome', 'representante_cpf', 'representante_cargo']) assert.equal(hidratado[campo], empresa[campo]);
const handlerSource = source.slice(source.indexOf('async function handleSalvar('), source.indexOf('async function handleDesativar('));
async function testar(dados, { permitido = true, bloqueado = false, duplo = false, falhar = false } = {}) {
  const enviados = [], erros = [], lock = { current: bloqueado };
  const salvar = vm.runInNewContext(`${handlerSource}; handleSalvar`, {
    form: { ...vazio, ...dados }, canManage: permitido, salvandoRef: lock,
    getCpfCnpjError, getDadosEmpresaParceiroError, onlyDigits,
    avisar: { alerta: e => erros.push(e), erro: e => erros.push(e), sucesso() {} },
    setSalvando() {}, setForm() {}, setNovaCategoria() {}, carregar: async () => {}, formVazio: () => vazio,
    criarFornecedorCompra: async payload => { enviados.push(payload); await Promise.resolve(); if (falhar) throw new Error('Erro fixture'); },
    atualizarFornecedorCompra: async (id, payload) => enviados.push({ id, ...payload })
  });
  const promises = [salvar({ preventDefault() {} })];
  if (duplo) promises.push(salvar({ preventDefault() {} }));
  await Promise.all(promises); return { enviados, erros, lock };
}
const novo = await testar(empresa, { duplo: true });
assert.equal(novo.enviados.length, 1, 'Duplo envio protegido de forma sincrona');
assert.equal(novo.enviados[0].nome_fantasia, empresa.nome_fantasia);
assert.equal(novo.enviados[0].representante_cpf, '52998224725');
for (const campo of ['nome_fantasia']) {
  const resultado = await testar({ ...empresa, [campo]: '' });
  assert.equal(resultado.enviados.length, 0); assert.equal(resultado.erros.length, 1);
}
for (const campo of ['representante_nome', 'representante_cpf']) {
  assert.equal((await testar({ ...empresa, [campo]: '' })).enviados.length, 1, `${campo} opcional em Compras`);
  assert.ok(!getDadosEmpresaParceiroError({ ...empresa, cpf_cnpj: empresa.cnpj, [campo]: '' }), `${campo} opcional tambem no cadastro completo`);
}
assert.equal((await testar({ ...empresa, representante_cpf: empresa.cnpj })).enviados.length, 0);
assert.equal((await testar({ id: 8, nome: empresa.nome, cnpj: empresa.cnpj })).enviados.length, 1, 'Edicao legada continua opcional');
assert.equal((await testar({ nome: 'Pessoa', cnpj: '52998224725' })).enviados.length, 1, 'PF sem campos de empresa');
assert.equal((await testar(empresa, { permitido: false })).enviados.length, 0);
assert.equal((await testar(empresa, { bloqueado: true })).enviados.length, 0);
const erro = await testar(empresa, { falhar: true });
assert.equal(erro.lock.current, false, 'Falha libera uma nova tentativa'); assert.equal(erro.erros.length, 1);
assert.match(source, /<DadosEmpresaParceiro[\s\S]*?cpf_cnpj: form.cnpj[\s\S]*?obrigatorio=\{!form.id\}/);
console.log('Formulario de fornecedores: hidratacao, PJ/PF, legado, validacao, payload, permissao e duplo envio validados.');

// Tela e componentes reais, com API local simulada e toda rede externa bloqueada.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = `import React from 'react'; import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {ThemeContext,TEMA_PADRAO} from '/src/contexts/ThemeContext.jsx';
import Gestao from '/src/modules/solicitacao-compra/pages/GestaoFornecedores.jsx';
import '/src/index.css'; import '/src/styles/design-tokens.css'; import '/src/styles/componentes-padrao.css';
window.enviados=[];
createRoot(document.getElementById('root')).render(<MemoryRouter><ThemeContext.Provider value={{tema:TEMA_PADRAO}}><div className="layout-shell"><main className="layout-main"><Gestao /></main></div></ThemeContext.Provider></MemoryRouter>);`;
const server = await createServer({ root, configFile: false, logLevel: 'error', server: { host: '127.0.0.1', port: 0 },
  plugins: [{ name: 'fornecedor-empresa-fixture', enforce: 'pre',
    resolveId(id) { if (id === '/fixture.jsx') return '\0fornecedor-empresa-fixture.jsx'; },
    async load(id) { if (id === '\0fornecedor-empresa-fixture.jsx') return transformWithEsbuild(fixture, 'fixture.jsx', { loader: 'jsx', jsx: 'transform' }); },
    transform(code, id) {
      if (id.endsWith('/src/contexts/AuthContext.jsx')) return `export const useAuth=()=>({user:location.search.includes('consulta')?{id:3,perfil:'USUARIO',area:'OBRA',areas_permissoes:[]}:{id:2,perfil:'SUPERADMIN'}});`;
      if (id.endsWith('/src/services/compras.js')) return `
        export const listarFornecedoresCompra=async()=>[{id:8,nome:'Empresa existente',cnpj:'04252011000110',contato:'Comercial',categoria_insumos:['Eletrico'],ativo:true,parceiro:${JSON.stringify(empresa)}}];
        export const criarFornecedorCompra=async payload=>{window.enviados.push(payload);await new Promise(r=>setTimeout(r,200));return{id:9,...payload};};
        export const atualizarFornecedorCompra=async(id,payload)=>{window.enviados.push({id,...payload});return{id,...payload};};
        export const desativarFornecedorCompra=async()=>({ok:true});`;
      if (id.endsWith('/src/services/api.js')) return `export const API_URL='https://fixture.invalid/api';
        export const API_ORIGIN='https://fixture.invalid'; export const authHeaders=()=>({});
        export const fileUrl=p=>p; export const getAuthToken=()=>null; export const getAuditSessionId=()=>null;
        export const installFetchSecurityDefaults=()=>{}; export const setAuthToken=()=>{}; export const clearAuthToken=()=>{};`;
    }, configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (new URL(req.url, 'http://localhost').pathname !== '/fixture') return next();
        res.setHeader('Content-Type', 'text/html');
        res.end(await vite.transformIndexHtml('/fixture', '<html lang="pt-BR"><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
      });
    }
  }, react()], optimizeDeps: { include: ['react', 'react-dom/client', 'react-router-dom'] } });
let browser;
try {
  await server.listen(); browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 980 } });
  page.setDefaultTimeout(10000);
  const errors = [], externos = [];
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
  page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
  await page.route('**/*', route => {
    if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue();
    externos.push(route.request().url()); return route.abort();
  });
  const url = `http://127.0.0.1:${server.httpServer.address().port}/fixture`;
  await page.goto(url);
  await page.getByRole('button', { name: 'Criar fornecedor', exact: true }).waitFor();
  assert.equal(await page.locator('[name="nome_fantasia"]').count(), 0);
  await page.getByLabel('CNPJ / CPF', { exact: true }).fill(empresa.cnpj);
  await page.locator('[name="nome_fantasia"]').waitFor();
  assert.equal(await page.locator('[name="nome_fantasia"]').isEnabled(), true);
  assert.equal(await page.locator('[name="nome_fantasia"]').getAttribute('required'), '');
  assert.equal(await page.locator('[name="representante_nome"]').getAttribute('required'), null);
  assert.equal(await page.locator('[name="representante_cpf"]').getAttribute('required'), null);
  await page.getByLabel('Nome / Razão social', { exact: true }).fill(empresa.nome);
  await page.locator('[name="nome_fantasia"]').fill(empresa.nome_fantasia);
  const output = path.resolve(root, '../outputs/fornecedor-empresa'); mkdirSync(output, { recursive: true });
  await page.screenshot({ path: path.join(output, 'claro.png') });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; document.documentElement.classList.add('dark'); });
  await page.screenshot({ path: path.join(output, 'escuro.png') });
  await page.getByRole('button', { name: 'Criar fornecedor', exact: true }).evaluate(el => { el.click(); el.click(); });
  await page.getByText('Fornecedor cadastrado.', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.enviados.length), 1);
  assert.equal(await page.evaluate(() => window.enviados[0].representante_cpf), '');
  // A tabela conserva sua rolagem horizontal; aciona o callback sem alterar colunas.
  await page.getByRole('button', { name: 'Editar', exact: true }).first().evaluate(el => el.click());
  assert.equal(await page.locator('[name="nome_fantasia"]').inputValue(), empresa.nome_fantasia);
  assert.equal(await page.locator('[name="nome_fantasia"]').getAttribute('required'), null, 'Legado opcional');
  await page.locator('[name="nome_fantasia"]').fill('Fantasia editada');
  await page.getByRole('button', { name: 'Salvar alteracoes', exact: true }).click();
  await page.getByText('Fornecedor atualizado.', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.enviados[1].nome_fantasia), 'Fantasia editada');
  await page.getByLabel('CNPJ / CPF', { exact: true }).fill(empresa.cnpj);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const campo of ['nome_fantasia', 'representante_nome', 'representante_cpf', 'representante_cargo']) {
    const bounds = await page.locator(`[name="${campo}"]`).boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 391, `Campo ${campo} cabe no celular`);
  }
  await page.screenshot({ path: path.join(output, 'celular.png') });
  await page.getByLabel('CNPJ / CPF', { exact: true }).fill('52998224725');
  assert.equal(await page.locator('[name="nome_fantasia"]').count(), 0, 'PJ nao aparece para CPF');
  await page.goto(`${url}?consulta`);
  await page.getByText('Empresa existente', { exact: true }).waitFor();
  assert.equal(await page.locator('form').count(), 0, 'Sem gerenciamento nao mostra formulario');
  assert.deepEqual(errors, []); assert.deepEqual(externos, []);
  console.log('Tela real validada: campos habilitados, salvar/editar, duplo clique, PF/PJ, permissao e responsividade.');
} finally { await browser?.close(); await server.close(); }
