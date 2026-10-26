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
    if (source.endsWith('/utils/webauthn')) return stub + 'webauthn';
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
    if (id === stub + 'webauthn') return `export const suportaPasskeys=()=>true,registrarPasskey=async()=>({id:'qa'}),autenticarComPasskey=async()=>{window.__qaPasskeys=(window.__qaPasskeys||0)+1;return{id:'qa'}};`;
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
  async function scenario({ installed = true, ios = false, user = owner, entry = '', realBrowser = false, excluido = false, multiplos = false } = {}) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: multiplos, isMobile: multiplos });
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
    if(excluido) {
      lots[0].situacao_financeira='EXCLUIDO';
      Object.assign(lots[0].itens[0],{situacao_financeira:'EXCLUIDO',titulo:null,
        exclusao_titulo:{em:'2026-10-14T18:00:22Z',responsavel:{id:1,nome:'Operador QA'},motivo:'Exclusao conferida'}});
    }
    const itens = Array.from({length: multiplos ? 12 : 1}, (_, n) => ({ id: n+1, lote_id: n+1, titulo_financeiro_id: n+1,
      status: 'PENDENTE', situacao_financeira: 'AGUARDANDO', snapshot_hash: `qa-${n}`, valor_snapshot: 100,
      vencimento_atual: '2026-10-17', lote: { status: 'AGUARDANDO' },
      titulo: { status: 'ABERTO', valor_saldo: 100, valor_baixado: 0 }, snapshot_json: { codigo: `TIT-${n+1}`, solicitacao: { codigo: `SOL-${n+1}` } } }));
    const decisoes = [];
    await page.route('**/*', route => {
      const url = new URL(route.request().url()), json = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
      if (route.request().isNavigationRequest() && url.origin === 'http://127.0.0.1:5311') return route.continue();
      if (url.pathname.endsWith('/financeiro/autorizacoes-pagamento')) {
        const pagina = Number(url.searchParams.get('pagina') || 1), limite = Number(url.searchParams.get('limite') || 30);
        return json({ data: lots.slice((pagina - 1) * limite, pagina * limite), paginacao: { pagina, total: lots.length, mais: pagina * limite < lots.length } });
      }
      if (url.pathname.endsWith('/autorizacoes-pagamento/painel/obras')) return json({ data: [{ obra_id: 1, obra_nome: 'Obra QA', quantidade_titulos: 5, valor_total: 500 }], resumo: { quantidade_titulos: 5, valor_total: 500 }, paginacao: { total: 1, mais: false } });
      if (url.pathname.endsWith('/autorizacoes-pagamento/painel/titulos')) {
        let data = realBrowser ? itens : [];
        if (url.searchParams.get('item_ids')) data = data.filter(i => url.searchParams.get('item_ids').split(',').map(Number).includes(i.id));
        else data = data.filter(i => i.status === 'PENDENTE');
        return json({ data, paginacao: { total: data.length, mais: false } });
      }
      if (multiplos && url.pathname.endsWith('/painel/selecao/autenticacao/opcoes')) return json({ selecao_id:'qa-selecao',publicKey:{challenge:'qa'} });
      if (multiplos && (url.pathname.endsWith('/painel/selecao/autorizar') || /\/\d+\/decidir$/.test(url.pathname))) {
        const payload = route.request().postDataJSON();
        const ids = payload.item_ids || payload.decisoes.map(d => d.item_id);
        decisoes.push({ coletiva: Boolean(payload.item_ids), ids });
        const data = itens.filter(i => ids.includes(i.id));
        for (const i of data) Object.assign(i, { status:'ENFILEIRADO',situacao_financeira:'NA_FILA',fila_item_id:i.id });
        return json({ itens:data,envio_pendente:false });
      }
      if (multiplos && /\/\d+\/autenticacao\/opcoes$/.test(url.pathname)) return json({challenge:'qa'});
      if (url.pathname.endsWith('/autorizacoes-pagamento/passkeys')) return json({ data: [{ id: 1, nome_dispositivo: 'Celular QA' }] });
      if (url.pathname.endsWith('/autorizacoes-pagamento/autorizadores')) return json({ data: [] });
      if (url.pathname.endsWith('/usuarios')) return json([]);
      if (url.pathname.endsWith('/passkeys/registro/opcoes')) return json({ challenge: 'qa' });
      if (url.pathname.endsWith('/passkeys/registro/verificar')) return json({ ok: true });
      if (url.origin === 'http://127.0.0.1:5311' && !url.pathname.startsWith('/api')) return route.continue();
      unexpected.push(url.pathname); return route.abort();
    });
    await page.goto(`http://127.0.0.1:5311/qa-pwa${realBrowser ? '?browser=1' : entry ? '?entry=' + entry : ''}`);
    return { page, errors, unexpected, decisoes, itens };
  }
  // PWA instalado + Layout reais: acao coletiva visivel sem rolar ate o fim,
  // conferencia focada e autorizacao individual nao absorve a selecao da lista.
  for (const {width,height=844,ios=false} of [{width:320,height:568},{width:390},{width:390,ios:true},{width:768},{width:1366}]) {
    const qa = await scenario({realBrowser:true,multiplos:true,ios}); const p = qa.page;
    await p.setViewportSize({width,height});
    await p.locator('.pa-obra').click();
    // No layout de duas colunas os filtros permanecem acima do painel.
    // Posicionar o painel na pagina nao percorre os artigos da obra.
    if(width>760) await p.locator('.pa-obras-titulos').scrollIntoViewIfNeeded();
    await p.getByLabel('Selecionar TIT-1',{exact:true}).check();
    await p.getByLabel('Selecionar TIT-2',{exact:true}).check();
    const autorizar = p.getByRole('button',{name:'Autorizar selecionados (2)',exact:true});
    const acaoAcessivel = async () => autorizar.evaluate(el => {
      const r=el.getBoundingClientRect(), hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return r.top>=0 && r.bottom<=innerHeight && (hit===el || el.contains(hit));
    });
    assert(await autorizar.isEnabled());
    assert(await acaoAcessivel(),'Acao em lote visivel apos marcar dois, sem rolar os artigos '+width);
    await p.locator('.pa-obras-itens').evaluate(el=>{el.scrollTop=el.scrollHeight;});
    assert(await acaoAcessivel(),'Acao em lote visivel no fim da lista '+width);
    await p.screenshot({path:path.join(output,`pwa-selecao-acessivel-${width}${ios?'-ios':''}.png`),fullPage:false});
    await autorizar.click();
    const conferencia=p.getByRole('region',{name:'Conferência da decisão'});
    await conferencia.waitFor();
    assert(await conferencia.evaluate(el=>el===document.activeElement),'Foco na conferencia, nao na biometria');
    assert((await conferencia.innerText()).includes('200,00'));
    assert.equal(await conferencia.locator('li').count(),2);
    assert.equal(await p.evaluate(()=>window.__qaPasskeys||0),0);
    assert.equal(qa.decisoes.length,0,'Preparar selecao nao grava autorizacao');
    assert(await conferencia.getByRole('button',{name:'Confirmar autorização com passkey (2)',exact:true}).evaluate(el=>{
      const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;
    }),'Confirmacao em lote fica no viewport apos abrir conferencia '+width);
    await p.screenshot({path:path.join(output,`pwa-conferencia-coletiva-${width}.png`),fullPage:false});
    await conferencia.getByRole('button',{name:'Voltar à seleção',exact:true}).click();
    await p.getByRole('button',{name:'Abrir detalhes de TIT-3',exact:true}).click();
    const detalhe=p.getByRole('dialog',{name:'Detalhes do título para autorização'});
    await detalhe.getByRole('button',{name:'Autorizar somente este título',exact:true}).click();
    await detalhe.getByRole('region',{name:'Conferência deste título'}).waitFor();
    assert((await detalhe.innerText()).includes('Aprovar somente TIT-3?'));
    await p.screenshot({path:path.join(output,`pwa-autorizacao-individual-${width}.png`),fullPage:false});
    await detalhe.getByRole('button',{name:'Confirmar somente este título com passkey',exact:true}).click();
    await detalhe.getByText('Somente este título foi aprovado. Os demais não foram decididos.').waitFor();
    assert.deepEqual(qa.decisoes,[{coletiva:false,ids:[3]}]);
    await detalhe.getByRole('button',{name:'Voltar à lista',exact:true}).click();
    await p.getByLabel('Selecionar TIT-1',{exact:true}).waitFor();
    assert(await p.getByLabel('Selecionar TIT-1',{exact:true}).isChecked());
    assert(await p.getByLabel('Selecionar TIT-2',{exact:true}).isChecked());
    await autorizar.click();
    await conferencia.getByRole('button',{name:'Confirmar autorização com passkey (2)',exact:true}).evaluate(el=>{el.click();el.click();});
    await p.getByRole('status').getByText(/2 título\(s\) confirmado\(s\) e enviado\(s\)/).waitFor();
    assert.deepEqual(qa.decisoes,[{coletiva:false,ids:[3]},{coletiva:true,ids:[1,2]}]);
    assert.equal(await p.evaluate(()=>window.__qaPasskeys),2,'Uma passkey individual + uma coletiva');
    assert(qa.itens.slice(3).every(i=>i.status==='PENDENTE'),'Nao selecionados intactos');
    assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Sem overflow '+width);
    assert.deepEqual(qa.errors,[]);assert.deepEqual(qa.unexpected,[]);await p.close();
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
  await page.getByRole('checkbox').waitFor().catch(async e => { console.error({ errors, unexpected, body: await page.locator('body').innerText() }); throw e; });
  const valorLegado=page.getByLabel('Valor a autorizar de TIT-1',{exact:true});
  assert(await valorLegado.isVisible(),'Visao por lote tambem permite editar no celular');
  await valorLegado.fill('60.00');
  await page.getByText(/R\$\s40,00 permanece pendente no título/).waitFor();
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
    if (options.user?.perfil === 'SUPERADMIN') {
      for (const width of [320,390,768,1024,1366,1920]) {
        await qa.page.setViewportSize({width,height:1000});
        assert(await qa.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),'Shell WEB sem overflow '+width);
        assert(await qa.page.locator('.pa-obras-filtros').evaluate(el => {
          const form=el.getBoundingClientRect(), area=el.closest('.pa-obras').getBoundingClientRect();
          return form.width >= area.width-2 && form.left >= area.left-1 && form.right <= area.right+1;
        }),'Filtro ocupa a area util do Pagina real, sem teto de cadastro '+width);
        for (const selector of ['.pa-obras-filtros>button','.pa-config__form button']) {
          assert(await qa.page.locator(selector).evaluate(el => getComputedStyle(el).whiteSpace==='nowrap' && el.scrollWidth<=el.clientWidth),'Botao legivel sem quebra de letras '+width);
        }
        assert(await qa.page.locator('.pa-config__form select').evaluate(el=>el.getBoundingClientRect().height<60),'Select administrativo nao cresce em coluna mobile '+width);
        await qa.page.screenshot({path:path.join(output,`web-filtros-${width}.png`),fullPage:false});
      }
    }
    await qa.page.getByRole('button', { name: 'Por lote / histórico', exact: true }).click();
    await qa.page.locator('.pa-list').waitFor();
    assert.equal(await qa.page.locator('.fx-topbar').count(), options.installed === false ? 1 : 0, 'Web mantem cabecalho; instalado permanece compacto');
    assert.equal(await qa.page.locator('[data-qa-tabs]').count(), options.installed === false ? 1 : 0, 'Web mantem as abas internas');
    assert.equal(await qa.page.locator('.pa-toolbar').count(), 0);
    assert.equal(await qa.page.locator('.pa-pwa-shell').count(), options.installed === false ? 0 : 1);
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
  const hist=await scenario({excluido:true});
  await hist.page.getByRole('button',{name:'Por lote / histórico',exact:true}).click();
  await hist.page.getByRole('note',{name:'Histórico de exclusão do título'}).waitFor();
  assert.equal(await hist.page.getByRole('checkbox').count(),0,'Pendente historico excluido nao e selecionavel');
  assert.equal(await hist.page.getByRole('button',{name:/^(Autorizar|Rejeitar|Revogar autorizações|Reprocessar envio)/}).count(),0);
  assert((await hist.page.getByRole('note').innerText()).includes('Operador QA'));
  for(const width of [390,1366]){
    await hist.page.setViewportSize({width,height:900});
    assert(await hist.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Historico por lote sem overflow '+width);
    await hist.page.screenshot({path:path.join(output,'excluido-historico-lote-'+width+'.png'),fullPage:false});
  }
  assert.deepEqual(hist.errors,[]);assert.deepEqual(hist.unexpected,[]);await hist.page.close();
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
  const web = await scenario({ installed: false, realBrowser: true });
  await web.page.setViewportSize({ width: 1366, height: 900 });
  for (const etapa of ['entrada', 'reload', 'retorno']) {
    if (etapa === 'reload') await web.page.reload();
    if (etapa === 'retorno') { await web.page.goBack(); await web.page.getByText('Perfil QA', { exact: true }).waitFor(); await web.page.goForward(); }
    await web.page.locator('.pa-obra').waitFor();
    assert.equal(await web.page.locator('.fx-topbar').count(), 1, etapa);
    assert.equal(await web.page.locator('[data-qa-tabs]').count(), 1, etapa);
    assert.equal(await web.page.locator('.pa-pwa-shell').count(), 0, etapa);
    assert.equal(await web.page.locator('.pa-pagina').count(), 1, 'Uma unica pagina logica ' + etapa);
  }
  await web.page.screenshot({ path: path.join(output, 'web-abas-preservadas.png'), fullPage: false });
  assert.deepEqual(web.errors, []); assert.deepEqual(web.unexpected, []); await web.page.close();
  console.log('OK: PWA Android/iOS/navegador e toque320x568/390/768/1366: acao coletiva fora da rolagem, conferencia focada com total/quantidade, individual separado da selecao, uma passkey/POST coletivo e duplo clique protegido. ACL/shell/abas, BrowserRouter/workspace e voltar nativo preservados. APIs/biometria simuladas.');
} finally { await browser?.close(); await server.close(); }
