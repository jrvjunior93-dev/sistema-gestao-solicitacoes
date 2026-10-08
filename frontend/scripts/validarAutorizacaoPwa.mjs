// Shell, pagina, rota inicial e estilos reais. Sessao, guardas, APIs e biometria
// isolados: nao conecta banco, Redis, S3 ou dominios externos.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stub = '\0qa-autorizacao-pwa-';
const owner = { id: 31, nome: 'Proprietário QA', perfil: 'ADMIN', setor: { codigo: 'DIRETORIA' },
  tela_inicial: { id: 'perfil', to: '/perfil' },
  autorizacao_pagamentos: { enabled: true, mode: 'PILOT', can_decide: true, can_view: true, passkey_count: 1 } };
const plugin = {
  name: 'qa-autorizacao-pwa', enforce: 'pre',
  resolveId(source, importer) {
    if (source.endsWith('/contexts/AuthContext')) return stub + 'auth';
    if (importer?.endsWith('/FinanceiroAutorizacoesPagamento.jsx')) {
      if (source === '../components/padrao') return stub + 'padrao';
      if (source === '../utils/webauthn') return stub + 'webauthn';
    }
    if (!importer?.endsWith('/Layout.jsx')) return;
    if (source.endsWith('/AtalhosContext')) return stub + 'atalhos';
    if (source.endsWith('/instalacao')) return stub + 'instalacao';
    if (source.endsWith('/configuracoesSistema')) return stub + 'suporte';
    if (source.endsWith('/conversasInternas')) return stub + 'conversas';
    if (source.endsWith('/WorkspaceTabs')) return stub + 'tabs';
    if (source.endsWith('/CommandPalette')) return stub + 'palette';
    if (source.endsWith('/ControleDiarioCaixa') || source.endsWith('/PrazosOperacionais')) return stub + 'guard';
    if (source.endsWith('/NotificacoesBell')) return stub + 'bell';
    if (['OperationalAuditTracker', 'DevUserSwitcher', 'CrObrasTravadasAviso', 'AtalhosTopbar'].some(name => source.endsWith('/' + name))) return stub + 'empty';
  },
  load(id) {
    if (id === stub + 'auth') return `import React from 'react';export const AuthContext=React.createContext(null);export const useAuth=()=>({user:window.__qaUser,refreshSession:async()=>{},logout:()=>{window.__qaLogout=(window.__qaLogout||0)+1}});`;
    if (id === stub + 'padrao') return `import React from 'react';export {default as Pagina} from '/src/components/padrao/Pagina.jsx';export {default as PageHeader} from '/src/components/padrao/PageHeader.jsx';export const Avisos=()=>null;export const useAvisos=()=>({avisos:[],fechar:()=>{},avisar:{erro:console.error,sucesso:()=>{}}});`;
    if (id === stub + 'webauthn') return `export const suportaPasskeys=()=>true,registrarPasskey=async()=>({id:'qa'}),autenticarComPasskey=async()=>({id:'qa'});`;
    if (id === stub + 'atalhos') return `export const AtalhosProvider=({children})=>children;`;
    if (id === stub + 'guard') return `import React from 'react';export default function Guard({children}){return React.createElement('div',{'data-qa-guard':true},children)}`;
    if (id === stub + 'instalacao') return `export const getInstalacaoPublica=async()=>({product_name:'Fluxy'});`;
    if (id === stub + 'suporte') return `export const getSuporteWhatsapp=async()=>({});`;
    if (id === stub + 'conversas') return `export const getResumoConversas=async()=>({nao_lidas:0});`;
    if (id === stub + 'tabs') return `import React from 'react';export default()=>React.createElement('div',{'data-qa-tabs':true},'Abas do workspace');`;
    if (id === stub + 'palette') return `import React from 'react';export default({open})=>open?React.createElement('div',{role:'dialog','aria-label':'Buscar tela'},'Busca'):null;`;
    if (id === stub + 'bell') return `import React from 'react';export default()=>React.createElement('button',{'aria-label':'Notificações gerais'},'Avisos gerais');`;
    if (id === stub + 'empty') return `export default()=>null;`;
  },
  configureServer(server) {
    server.middlewares.use('/qa-pwa', async (_, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end(await server.transformIndexHtml('/qa-pwa', `<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route,Navigate}from'react-router-dom';
import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/escala.css';import '/src/styles/componentes-padrao.css';import '/src/styles/responsive-system.css';
import Layout from '/src/layout/Layout.jsx';import Page from '/src/pages/FinanceiroAutorizacoesPagamento.jsx';import{AuthContext,useAuth}from'/src/contexts/AuthContext';import{resolverRotaInicial}from'/src/navigation/telaInicialRoute.js';
const route='/financeiro/autorizacoes-pagamento';const entry=new URLSearchParams(location.search).get('entry')==='auth'?route:'/';
function Entry(){return React.createElement(Navigate,{to:resolverRotaInicial(window.__qaUser),replace:true})}
function App(){return React.createElement(AuthContext.Provider,{value:useAuth()},React.createElement(MemoryRouter,{initialEntries:[entry]},React.createElement(Routes,null,React.createElement(Route,{element:React.createElement(Layout)},React.createElement(Route,{index:true,element:React.createElement(Entry)}),React.createElement(Route,{path:route,element:React.createElement(Page)}),React.createElement(Route,{path:'/perfil',element:React.createElement('p',null,'Perfil QA')}),React.createElement(Route,{path:'/modulos',element:React.createElement('p',null,'Módulos QA')})))))}
createRoot(document.getElementById('root')).render(React.createElement(App));</script></body></html>`));
    });
  }
};
const server = await createServer({ root, plugins: [plugin], server: { host: '127.0.0.1', port: 5311, strictPort: true, proxy: {} } });
await server.listen(); let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const output = path.resolve(root, '../outputs/autorizacao-pwa-20261008');
  await mkdir(output, { recursive: true });
  async function scenario({ installed = true, ios = false, user = owner, entry = '' } = {}) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [], unexpected = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(({ user, installed, ios }) => {
      window.__qaUser = user;
      const original = window.matchMedia.bind(window);
      window.matchMedia = q => q === '(display-mode: standalone)' ? { matches: installed && !ios } : original(q);
      if (ios) Object.defineProperty(navigator, 'standalone', { value: true });
    }, { user, installed, ios });
    const lots = [1, 2, 3, 4, 5].map(id => ({ id, codigo: `AUT-LEGADO-${id}`, status: 'AGUARDANDO', valor_total: 100, quantidade_itens: 1,
      createdAt: '2026-10-08T14:00:00Z', dossie_hash: 'qa', itens: [{ id, status: 'PENDENTE', valor_snapshot: 100,
        snapshot_json: { codigo: `TIT-${id}`, solicitacao: { codigo: `SOL-${id}`, descricao: 'Compra Direta: Itens: Cimento' } } }] }));
    await page.route('**/*', route => {
      const url = new URL(route.request().url()), json = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
      if (url.pathname.endsWith('/financeiro/autorizacoes-pagamento')) return json({ data: lots });
      if (url.pathname.endsWith('/autorizacoes-pagamento/passkeys')) return json({ data: [{ id: 1, nome_dispositivo: 'Celular QA' }] });
      if (url.pathname.endsWith('/passkeys/registro/opcoes')) return json({ challenge: 'qa' });
      if (url.pathname.endsWith('/passkeys/registro/verificar')) return json({ ok: true });
      if (url.origin === 'http://127.0.0.1:5311' && !url.pathname.startsWith('/api')) return route.continue();
      unexpected.push(url.pathname); return route.abort();
    });
    await page.goto(`http://127.0.0.1:5311/qa-pwa${entry ? '?entry=' + entry : ''}`);
    return { page, errors, unexpected };
  }
  const { page, errors, unexpected } = await scenario();
  await page.getByRole('checkbox').waitFor();
  assert.equal(await page.locator('.fx-topbar').count(), 0);
  assert.equal(await page.locator('[data-qa-tabs]').count(), 0);
  assert.equal(await page.locator('.pa-toolbar').count(), 0);
  assert.equal(await page.locator('[data-qa-guard]').count(), 2, 'Guardas continuam envolvendo o dossie');
  assert.equal(await page.locator('.pa-list strong').nth(1).textContent(), 'LOTE-1');
  assert(await page.locator('.pa-list').evaluate(el => el.getBoundingClientRect().top < 150), 'Lotes aparecem no topo util');
  assert(await page.locator('.pa-list').evaluate(el => el.clientHeight > 220), 'Lista ampliada no celular');
  assert(await page.locator('.pa-detail').evaluate(el => el.getBoundingClientRect().top < 500), 'Dossie no primeiro viewport');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Sem overflow lateral do shell');
  assert.equal(await page.getByRole('button', { name: 'Adicionar passkey' }).isVisible(), false);
  await page.screenshot({ path: path.join(output, 'pwa-mobile.png'), fullPage: true });
  await page.locator('.pa-pwa-toolbar summary').click();
  assert.equal(await page.getByRole('button', { name: 'Adicionar passkey' }).isVisible(), true);
  await page.getByRole('button', { name: 'Adicionar passkey' }).click();
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(el => el.textContent.trim() === 'Atualizar')?.disabled);
  await page.locator('.pa-pwa-toolbar summary').click();
  await page.locator('.pa-pwa-shell summary').click();
  await page.getByRole('button', { name: 'Ativar modo escuro' }).click();
  assert.equal(await page.locator('html').evaluate(el => el.classList.contains('dark')), true);
  await page.locator('.pa-pwa-shell summary').click();
  await page.screenshot({ path: path.join(output, 'pwa-mobile-dark.png'), fullPage: true });
  await page.locator('.pa-lot-record summary').click();
  assert.equal(await page.getByText(/Código registrado: AUT-LEGADO-1/).isVisible(), true);
  await page.locator('#pa-dispositivos summary').click();
  await page.getByText(/Celular QA/).waitFor();
  await page.locator('.pa-pwa-shell summary').click();
  await page.getByRole('button', { name: 'Sair do sistema' }).click();
  assert.equal(await page.evaluate(() => window.__qaLogout), 1);
  await page.getByRole('link', { name: 'Menu de módulos', exact: true }).click();
  await page.getByText('Módulos QA', { exact: true }).waitFor();
  assert.equal(await page.locator('.fx-topbar').count(), 1, 'Outras telas mantem shell completo');
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []); await page.close();

  for (const options of [{ installed: false, entry: 'auth' }, { user: { ...owner, autorizacao_pagamentos: { enabled: true, can_prepare: true, can_view: true } }, entry: 'auth' }]) {
    const qa = await scenario(options); await qa.page.locator('.pa-list').waitFor();
    assert.equal(await qa.page.locator('.fx-topbar').count(), 1);
    assert.equal(await qa.page.locator('.pa-toolbar').count(), 1);
    assert.deepEqual(qa.errors, []); assert.deepEqual(qa.unexpected, []); await qa.page.close();
  }
  const ios = await scenario({ ios: true, user: { ...owner, autorizacao_pagamentos: { ...owner.autorizacao_pagamentos, passkey_count: 0 } } });
  await ios.page.locator('.pa-list').waitFor();
  assert.equal(await ios.page.locator('.pa-pwa-shell').count(), 1);
  assert.equal(await ios.page.getByRole('button', { name: 'Cadastrar passkey' }).isVisible(), true);
  assert.equal(await ios.page.getByRole('button', { name: /^Autorizar/ }).isDisabled(), true);
  assert.deepEqual(ios.errors, []); assert.deepEqual(ios.unexpected, []); await ios.page.close();
  console.log('OK: PWA Android/iOS, rota inicial, shell compacto exclusivo, area util, opcoes/passkey/tema/saida, guardas e legados preservados. APIs simuladas.');
} finally { await browser?.close(); await server.close(); }
