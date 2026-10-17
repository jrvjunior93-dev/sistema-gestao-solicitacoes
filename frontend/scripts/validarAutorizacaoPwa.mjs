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
    if (source.endsWith('/mobile/runtime')) return stub + 'native';
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
    if (id === stub + 'native') return `export const isNativeApp=()=>false;export const registerNativeBackButtonHandler=handlers=>{window.__qaNativeBack=handlers;return()=>{if(window.__qaNativeBack===handlers)delete window.__qaNativeBack}};`;
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
import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter,MemoryRouter,Routes,Route,Navigate}from'react-router-dom';
import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/escala.css';import '/src/styles/componentes-padrao.css';import '/src/styles/responsive-system.css';
import Layout from '/src/layout/Layout.jsx';import Page from '/src/pages/FinanceiroAutorizacoesPagamento.jsx';import{AuthContext,useAuth}from'/src/contexts/AuthContext';import{resolverRotaInicial}from'/src/navigation/telaInicialRoute.js';
const route='/financeiro/autorizacoes-pagamento';const entry=new URLSearchParams(location.search).get('entry')==='auth'?route:'/';
const browserMode=new URLSearchParams(location.search).has('browser');
if(browserMode&&location.pathname==='/qa-pwa'){history.replaceState(null,'','/qa-pwa/perfil?browser=1');history.pushState(null,'','/qa-pwa'+route+'?browser=1')}
window.__qaInitialRoute=resolverRotaInicial(window.__qaUser);
function Entry(){return React.createElement(Navigate,{to:resolverRotaInicial(window.__qaUser),replace:true})}
function App(){return React.createElement(AuthContext.Provider,{value:useAuth()},React.createElement(browserMode?BrowserRouter:MemoryRouter,browserMode?{basename:'/qa-pwa'}:{initialEntries:[entry==='/'?window.__qaInitialRoute:entry]},React.createElement(Routes,null,React.createElement(Route,{element:React.createElement(Layout)},React.createElement(Route,{index:true,element:React.createElement(Entry)}),React.createElement(Route,{path:route,element:React.createElement(Page)}),React.createElement(Route,{path:'/perfil',element:React.createElement('p',null,'Perfil QA')}),React.createElement(Route,{path:'/modulos',element:React.createElement('p',null,'Módulos QA')})))))}
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
  async function scenario({ installed = true, ios = false, user = owner, entry = '', realBrowser = false } = {}) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [], unexpected = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(({ user, installed, ios }) => {
      window.__qaUser = user;
      const original = window.matchMedia.bind(window);
      window.matchMedia = q => q === '(display-mode: standalone)' ? { matches: installed && !ios } : original(q);
      if (ios) Object.defineProperty(navigator, 'standalone', { value: true });
    }, { user, installed, ios });
    const lots = Array.from({ length: 151 }, (_, i) => i + 1).map(id => ({ id, codigo: `AUT-LEGADO-${id}`, status: 'AGUARDANDO', valor_total: 100, quantidade_itens: 1,
      createdAt: '2026-10-08T14:00:00Z', dossie_hash: 'qa', itens: [{ id, status: 'PENDENTE', valor_snapshot: 100,
        snapshot_json: { codigo: `TIT-${id}`, solicitacao: { codigo: `SOL-${id}`, descricao: 'Compra Direta: Itens: Cimento' } } }] }));
    await page.route('**/*', route => {
      const url = new URL(route.request().url()), json = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
      if (route.request().isNavigationRequest() && url.origin === 'http://127.0.0.1:5311') return route.continue();
      if (url.pathname.endsWith('/financeiro/autorizacoes-pagamento')) {
        const pagina = Number(url.searchParams.get('pagina') || 1), limite = Number(url.searchParams.get('limite') || 30);
        return json({ data: lots.slice((pagina - 1) * limite, pagina * limite), paginacao: { pagina, total: lots.length, mais: pagina * limite < lots.length } });
      }
      if (url.pathname.endsWith('/autorizacoes-pagamento/painel/obras')) return json({ data: [{ obra_id: 1, obra_nome: 'Obra QA', quantidade_titulos: 5, valor_total: 500 }], resumo: { quantidade_titulos: 5, valor_total: 500 }, paginacao: { total: 1, mais: false } });
      if (url.pathname.endsWith('/autorizacoes-pagamento/painel/titulos')) return json({ data: realBrowser ? [{ id: 1, lote_id: 1, titulo_financeiro_id: 1, status: 'PENDENTE', situacao_financeira: 'AGUARDANDO', snapshot_hash: 'qa', valor_snapshot: 100, vencimento_atual: '2026-10-17', lote: { status: 'AGUARDANDO' }, titulo: { status: 'ABERTO', valor_saldo: 100, valor_baixado: 0 }, snapshot_json: { codigo: 'TIT-1', solicitacao: { codigo: 'SOL-1' } } }] : [], paginacao: { total: realBrowser ? 1 : 0, mais: false } });
      if (url.pathname.endsWith('/autorizacoes-pagamento/passkeys')) return json({ data: [{ id: 1, nome_dispositivo: 'Celular QA' }] });
      if (url.pathname.endsWith('/autorizacoes-pagamento/autorizadores')) return json({ data: [] });
      if (url.pathname.endsWith('/usuarios')) return json([]);
      if (url.pathname.endsWith('/passkeys/registro/opcoes')) return json({ challenge: 'qa' });
      if (url.pathname.endsWith('/passkeys/registro/verificar')) return json({ ok: true });
      if (url.origin === 'http://127.0.0.1:5311' && !url.pathname.startsWith('/api')) return route.continue();
      unexpected.push(url.pathname); return route.abort();
    });
    await page.goto(`http://127.0.0.1:5311/qa-pwa${realBrowser ? '?browser=1' : entry ? '?entry=' + entry : ''}`);
    return { page, errors, unexpected };
  }
  const { page, errors, unexpected } = await scenario();
  await page.waitForFunction(() => window.__qaInitialRoute);
  assert.equal(await page.evaluate(() => window.__qaInitialRoute), '/financeiro/autorizacoes-pagamento');
  await page.locator('.pa-obra').waitFor().catch(async e => { console.error({ errors, unexpected, body: await page.locator('body').innerText() }); throw e; });
  assert.equal(await page.locator('.app-page-header').count(),0,'Sem cabecalho redundante/area branca vazia');
  assert(await page.locator('.pa-obras-filtros').evaluate(el=>el.getBoundingClientRect().top<220),'Filtros no primeiro viewport util');
  assert.equal(await page.locator('.pa-obra').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)','Obras com fundo branco no tema claro');
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.locator('.pa-pwa-toolbar summary').click();
    assert(await page.locator('.pa-pwa-toolbar .pa-pwa-options__content').evaluate(el => { const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth; }), 'Menu Opcoes inteiro no viewport '+width);
    await page.screenshot({path:path.join(output,`opcoes-inteiras-${width}.png`),fullPage:false});
    await page.locator('.pa-pwa-toolbar summary').click();
    assert(await page.getByLabel('Situação atual').evaluate(el => { const c=document.createElement('canvas').getContext('2d');c.font=getComputedStyle(el).font;const s=getComputedStyle(el);return c.measureText(el.selectedOptions[0].text).width < el.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight)-28; }), 'Situacao selecionada nao truncada '+width);
  }
  await page.screenshot({path:path.join(output,'obras-compactas-navegador.png'),fullPage:false});
  await page.getByRole('button', { name: 'Por lote / histórico', exact: true }).click();
  await page.getByRole('checkbox').waitFor();
  assert.equal(await page.locator('.fx-topbar').count(), 0);
  assert.equal(await page.locator('[data-qa-tabs]').count(), 0);
  assert.equal(await page.locator('.pa-toolbar').count(), 0);
  assert.equal(await page.locator('[data-qa-guard]').count(), 2, 'Guardas continuam envolvendo o dossie');
  assert.equal(await page.locator('.pa-list strong').nth(1).textContent(), 'LOTE-1');
  assert(await page.locator('.pa-list').evaluate(el => el.getBoundingClientRect().top < 210), 'Lotes aparecem no topo util, apos seletor de visao');
  assert(await page.locator('.pa-list').evaluate(el => el.clientHeight > 220), 'Lista ampliada no celular');
  assert(await page.locator('.pa-detail').evaluate(el => el.getBoundingClientRect().top < 580), 'Dossie no primeiro viewport');
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
  await page.getByRole('navigation', { name: 'Paginação de lotes' }).getByRole('button', { name: 'Próxima' }).click();
  await page.locator('.pa-detail__head').getByText('LOTE-31', { exact: true }).waitFor();
  await page.getByText('151 lotes', { exact: true }).waitFor();
  await page.getByRole('navigation', { name: 'Paginação de lotes' }).getByRole('button', { name: 'Anterior' }).click();
  await page.locator('.pa-detail__head').getByText('LOTE-1', { exact: true }).waitFor();
  await page.locator('#pa-dispositivos summary').click();
  await page.getByText(/Celular QA/).waitFor();
  await page.locator('.pa-pwa-shell summary').click();
  await page.getByRole('button', { name: 'Sair do sistema' }).click();
  assert.equal(await page.evaluate(() => window.__qaLogout), 1);
  await page.getByRole('link', { name: 'Menu de módulos', exact: true }).click();
  await page.getByText('Módulos QA', { exact: true }).waitFor();
  assert.equal(await page.locator('.fx-topbar').count(), 1, 'Outras telas mantem shell completo');
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []); await page.close();

  for (const options of [{ installed: false, entry: 'auth' }, { user: { ...owner, autorizacao_pagamentos: { enabled: true, can_prepare: true, can_view: true } }, entry: 'auth' },
    { installed: false, user: { ...owner, perfil: 'SUPERADMIN', autorizacao_pagamentos: { enabled: true, can_view: true, can_configure: true } }, entry: 'auth' }]) {
    const qa = await scenario(options);
    await qa.page.locator('.pa-obra').waitFor();
    assert.equal(await qa.page.getByRole('button', { name: 'Por obra', exact: true }).getAttribute('aria-pressed'), 'true');
    await qa.page.getByRole('button', { name: 'Por lote / histórico', exact: true }).click();
    await qa.page.locator('.pa-list').waitFor();
    assert.equal(await qa.page.locator('.fx-topbar').count(), 0);
    assert.equal(await qa.page.locator('.pa-toolbar').count(), 0);
    assert.equal(await qa.page.locator('.pa-pwa-shell').count(), 1);
    if (options.user) assert.equal(await qa.page.getByRole('button', { name: /^Autorizar/ }).count(), 0, 'Visao comum nao concede decisao por perfil');
    assert.deepEqual(qa.errors, []); assert.deepEqual(qa.unexpected, []); await qa.page.close();
  }
  const ios = await scenario({ ios: true, user: { ...owner, autorizacao_pagamentos: { ...owner.autorizacao_pagamentos, passkey_count: 0 } } });
  await ios.page.getByRole('button', { name: 'Por lote / histórico', exact: true }).click();
  await ios.page.locator('.pa-list').waitFor();
  assert.equal(await ios.page.locator('.pa-pwa-shell').count(), 1);
  await ios.page.locator('.pa-pwa-toolbar summary').click();
  assert.equal(await ios.page.getByRole('button', { name: 'Cadastrar passkey' }).isVisible(), true);
  assert.equal(await ios.page.getByRole('button', { name: /^Autorizar/ }).isDisabled(), true);
  assert.deepEqual(ios.errors, []); assert.deepEqual(ios.unexpected, []); await ios.page.close();
  // BrowserRouter + Layout/WorkspaceView reais: POP deve permanecer na mesma
  // pagina logica, nao cair no fallback inicial do workspace.
  for (const nativo of [false, true]) {
    const qa = await scenario({ realBrowser: true }); const p = qa.page;
    const voltar = () => nativo ? p.evaluate(() => window.__qaNativeBack.onNavigateBack()) : p.goBack();
    await p.locator('.pa-obra').click();
    await p.getByLabel('Selecionar TIT-1', { exact: true }).check();
    assert.equal(await p.locator('.pa-pwa-toolbar').isVisible(), false, 'Toolbar nao ocupa espaco dentro da obra');
    assert.equal(await p.locator('.pa-obras-resumo').isVisible(), false, 'Totais gerais nao ocupam espaco dentro da obra');
    if (!nativo) await p.screenshot({path:path.join(output,'obra-aberta-compacta.png'),fullPage:false});
    await p.getByRole('button', { name: 'Abrir detalhes de TIT-1', exact: true }).click();
    const d = p.getByRole('dialog', { name: 'Detalhes do título para autorização' });
    await d.getByRole('button', { name: 'Próxima', exact: true }).waitFor();
    await p.waitForFunction(() => !document.querySelector('.pa-titulo-rodape button')?.disabled);
    await voltar(); await d.waitFor({ state: 'detached' });
    await p.getByRole('button', { name: 'Voltar às obras', exact: true }).waitFor();
    assert(await p.getByLabel('Selecionar TIT-1', { exact: true }).isChecked());
    await voltar(); await p.locator('.pa-obras[data-detalhe="false"]').waitFor();
    assert(await p.locator('.pa-obra').isVisible(), 'Segundo voltar mostra obras no celular');
    assert(await p.locator('.pa-pwa-toolbar').isVisible(), 'Voltar as obras restaura visoes/filtros/opcoes');
    assert(new URL(p.url()).pathname.endsWith('/financeiro/autorizacoes-pagamento'));
    if (!nativo) {
      await p.goBack(); await p.getByText('Perfil QA', { exact: true }).waitFor();
      await p.goForward(); await p.locator('.pa-obra').waitFor();
      await p.goForward(); await p.getByRole('button', { name: 'Voltar às obras', exact: true }).waitFor();
      await p.goForward(); await d.waitFor();
      await p.waitForFunction(() => !document.querySelector('.pa-titulo-rodape button')?.disabled);
      await p.reload(); await p.locator('.pa-obra').waitFor();
      assert.equal(await d.count(), 0, 'Reload sem cache sensivel retorna a consulta, sem reabrir snapshot obsoleto');
    }
    assert.deepEqual(qa.errors, []); assert.deepEqual(qa.unexpected, []); await p.close();
  }
  console.log('OK: PWA Android/iOS/navegador, ACL e shell preservados; BrowserRouter com Layout/workspace reais e callback nativo: detalhe -> titulos -> obras, saida/avanco/reload, selecao mantida, sem decisao. APIs simuladas.');
} finally { await browser?.close(); await server.close(); }
