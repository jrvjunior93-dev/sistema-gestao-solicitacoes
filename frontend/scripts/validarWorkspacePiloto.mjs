// Router/hook/Layout/componentes reais; transporte inteiramente interceptado.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
import { makeTab, makeEntry, moveTab, recordIdentity } from '../src/navigation/workspaceModel.js';
import { consultarJanela } from '../src/pages/Solicitacoes/consultarJanela.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let tab = makeTab(makeEntry('/a', 'A'));
for (let i = 0; i < 100; i++) tab = moveTab(tab, makeEntry('/b/'+i, 'B'));
assert.equal(tab.entries.length, 64);
assert.equal(recordIdentity('/solicitacoes/90?interacao=ANEXO'), '/solicitacoes/90');
for (const count of [25, 50, 75, 150, 300, 450]) {
  const queries=[];
  const data=await consultarJanela({q:'filtro'},count/25,25,true,async query=>{
    queries.push(query);assert([25,50,100,200].includes(Number(query.limit)));assert.equal(query.q,'filtro');
    return {items:Array.from({length:Number(query.limit)},(_,i)=>({id:(Number(query.page)-1)*Number(query.limit)+i})),meta:{total:1000}};
  });
  assert.equal(data.items.length,count);assert.equal(new Set(data.items.map(r=>r.id)).size,count);
  assert.equal(data.items.at(-1).id,count-1);assert(queries.length<=Math.ceil(count/200));
}

const fixture = `
import React,{useState,useMemo,useEffect}from'react';import{createRoot}from'react-dom/client';
import{BrowserRouter,Routes,Route,useParams,useNavigate}from'react-router-dom';
import Layout from '/src/layout/Layout.jsx';import Nova from '/src/pages/NovaSolicitacao.jsx';
import Lista from '/src/pages/Solicitacoes/index.jsx';import Detalhe from '/src/pages/SolicitacaoDetalhe/index.jsx';
import CompraEtapas from '/src/pages/SolicitacaoDetalhe/CompraEtapas.jsx';
import Delegacao from '/src/modules/solicitacao-compra/pages/ComprasDelegacao.jsx';
import Login from '/src/pages/Login/index.jsx';import PrivateRoute from '/src/components/PrivateRoute.jsx';
import tabs,{useLegacyWorkspaceTabs}from'/src/navigation/useWorkspaceTabs';
import WorkspaceView from'/src/navigation/WorkspaceView.jsx';
import{WorkspaceContext,createWorkspaceMemory,useWorkspace,useWorkspaceState,useWorkspaceWork,useWorkspaceTitle}from'/src/navigation/WorkspaceContext.jsx';
import{AuthContext}from'/src/contexts/AuthContext.jsx';import{ThemeContext,TEMA_PADRAO}from'/src/contexts/ThemeContext.jsx';
import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/componentes-padrao.css';
import '/src/components/lista-avancada/lista-avancada.css';
const params=new URLSearchParams(location.search);const core=params.has('core');const legacy=params.has('legacy');
const user={id:1,perfil:'SUPERADMIN',nome:'QA',area:'GEO',setor:{codigo:'GEO'},modulos_habilitados:[{key:'COMPRAS',enabled:false},{key:'CONTRATOS',enabled:false},{key:'FINANCEIRO',enabled:false}]};
function TestAuth({children}){const[effective,set]=useState(params.has('anon')?null:params.has('mfa')?{...user,mfa_setup_pending:true}:user);const[ready,R]=useState(!params.has('restoring'));useEffect(()=>{window.qaAuth={ready:()=>R(true),logout:()=>set(null),switch:()=>set({...user,id:2,nome:'Outro usuario'}),restrict:()=>set(current=>({...current,areas_permissoes_configuradas:true,areas_permissoes:[]}))}},[]);return <AuthContext.Provider value={{user:effective,authReady:ready,isAuthenticated:!!effective,login:async data=>set(data.user),logout:()=>set(null)}}>{children}</AuthContext.Provider>}
function ItemsFixture(){return <><Toolbar/><CompraEtapas solicitacaoId={useParams().id} user={user} podeDecidir podeReceber={false} podeProgramarEntrega={false} podeAnexar={false} mostrarCotacao={false}/></>}
function Toolbar(){const w=useWorkspace();const nav=useNavigate();useEffect(()=>{window.qa={...w}},[w]);return <div style={{position:'sticky',top:0,zIndex:90,background:'#fff'}}><button onClick={()=>w.openTab('/consulta/1')}>QA consulta</button><button onClick={()=>w.back('/solicitacoes')}>QA voltar</button><button onClick={()=>nav('/compras/delegacao')}>QA delegacao</button><button onClick={()=>w.openTab('/consulta-lenta')}>QA aba lenta</button></div>}
const ConsultaLenta=React.lazy(()=>new Promise(resolve=>setTimeout(()=>resolve({default:()=> <><Toolbar/><p>Consulta lenta pronta</p></>}),400)));
function CoreForm(){const[text,set]=useWorkspaceState('texto','');const[busy,B]=useState(false);useWorkspaceWork(!!text,busy);useWorkspaceTitle('SOL-CORE-'+(useParams().id||'NOVA'));return <><input aria-label="Rascunho" value={text} onChange={e=>set(e.target.value)}/><button onClick={()=>{B(true);setTimeout(()=>B(false),700)}}>QA ocupado</button><div style={{height:2500}}>Formulario</div></>}
function CoreShell(){const[owner,setOwner]=useState(user);const w=(legacy?useLegacyWorkspaceTabs:tabs)(owner);const memory=useMemo(()=>createWorkspaceMemory(),[owner.id]);useEffect(()=>{window.qa={...w,store:memory,owner:()=>setOwner({...user,id:2}),nav:navigate,close:id=>{w.closeTab(id);memory.deleteTab(id)}}},[w,memory]);const navigate=useNavigate();return <WorkspaceContext.Provider value={w}><div id="tabs">{w.tabs.map(t=><button key={t.id} data-route={t.route} onClick={()=>w.activateTab(t.id)}>{t.title}</button>)}</div><WorkspaceView key={owner.id} workspace={w} memory={memory} enabled={!legacy}/></WorkspaceContext.Provider>}
const withToolbar=Component=><><Toolbar/><Component/></>;
createRoot(document.getElementById('root')).render(<BrowserRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><TestAuth><ThemeContext.Provider value={{tema:TEMA_PADRAO}}><Routes>
<Route path="/login" element={<Login/>}/>
<Route element={<PrivateRoute>{core?<CoreShell/>:<Layout/>}</PrivateRoute>}><Route path="/nova-solicitacao" element={core?<CoreForm/>:withToolbar(Nova)}/>
<Route path="/compras/delegacao" element={withToolbar(Delegacao)}/>
<Route path="/solicitacoes-compra/:id" element={<><Toolbar/><p>Solicitacao de compra sem principal</p></>}/>
<Route path="/perfil" element={<><Toolbar/><p>Perfil MFA</p></>}/>
<Route path="/consulta-lenta" element={<ConsultaLenta/>}/>
<Route path="/solicitacoes" element={core?<CoreForm/>:withToolbar(Lista)}/><Route path="/solicitacoes/:id" element={core?<CoreForm/>:params.has('itens')?<ItemsFixture/>:withToolbar(Detalhe)}/>
<Route path="/consulta/:id" element={core?<CoreForm/>:<><Toolbar/><p>Consulta auxiliar</p></>}/><Route path="/" element={<Toolbar/>}/></Route>
</Routes></ThemeContext.Provider></TestAuth></BrowserRouter>);`;

const server = await createServer({ root, configFile:false,logLevel:'error',
  define:{'import.meta.env.VITE_API_URL':JSON.stringify('/api')},
  server:{host:'127.0.0.1',port:0},plugins:[{
    name:'workspace-qa',enforce:'pre',
    resolveId(id){if(id==='/qa.jsx')return '\0workspace-qa.jsx'},
    async load(id){if(id==='\0workspace-qa.jsx')return transformWithEsbuild(fixture,'qa.jsx',{loader:'jsx',jsx:'transform'})},
    transform(code,id){
      if(process.argv.includes('--baseline-controller')&&id.endsWith('/src/navigation/useWorkspaceController.js')) return execFileSync('git',['show','0fb4822d:frontend/src/navigation/useWorkspaceController.js'],{cwd:root,encoding:'utf8'});
      if(id.endsWith('/src/contexts/AuthContext.jsx')) return `import{createContext,useContext}from'react';export const AuthContext=createContext({});export const useAuth=()=>useContext(AuthContext);`;
      if(id.endsWith('/src/contexts/LiveUpdatesContext.jsx')) return `export function useLiveUpdateSubscription(){};`;
    },
    configureServer(s){s.middlewares.use(async(req,res,next)=>{
      if(!/^\/(nova-solicitacao|solicitacoes|consulta|compras|login|perfil|$)/.test(req.url))return next();
      res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml(req.url,'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>.la-tabela{min-width:2600px!important}</style></head><body><div id="root"></div><script type="module" src="/qa.jsx"></script></body></html>'));
    })}
  },react()],optimizeDeps:{include:['react','react-dom/client','react-router-dom']}});
await server.listen();const base='http://127.0.0.1:'+server.httpServer.address().port;
let browser;
const results=[];
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,channel:process.env.PLAYWRIGHT_EXECUTABLE_PATH?undefined:'chrome'});
 const install=async page=>{
   const waitForURL = page.waitForURL.bind(page);
   page.waitForURL = async (...args) => {
     await waitForURL(...args);
     // history muda antes do commit do Router em startTransition.
     await page.waitForFunction(()=>location.pathname==='/login'||window.qa?.tabs.find(t=>t.id===window.qa.activeId)?.route===location.pathname+location.search+location.hash);
   };
   // O formulario retido fica hidden/inert; interagir apenas com a pagina ativa.
   page.getByLabel = (text, opts) => page.locator('[data-workspace-page]:not([hidden])').getByLabel(text, opts);
   const errors=[],writes=[],reads=[],navigationAudit=[];page.setDefaultTimeout(12000);page.setDefaultNavigationTimeout(30000);
   page.on('pageerror',e=>{errors.push(e.message);console.error('QA pageerror:',e.message)});
   const obra={id:7,codigo:'07',nome:'Obra QA',tipo_centro_custo:'OBRA',ativo:true};
   const tipo={id:5,nome:'DESPESA EVENTUAL',ativo:true};
   const record=id=>({id,codigo:'SOL-QA'+id,obra_id:7,obra,tipo,valor:1000,valor_exibicao:1000,descricao:'Solicitacao QA',status_global:'PENDENTE',area_responsavel:'GEO',anexos:[],historicos:[],interacoes_pendentes:[],contexto_interacao:{pode_interagir:true},createdAt:'2026-10-01T12:00:00Z'});
   await page.route('**/*',async route=>{
    const req=route.request(),u=new URL(req.url());
    if(u.origin!==base)return route.abort();
    if(!u.pathname.startsWith('/api/'))return route.continue();
    const p=u.pathname.slice(4);
    if(p==='/governanca/auditoria-operacional/navegacao' && req.method()==='POST') navigationAudit.push(req.postDataJSON());
    else if(req.method()!=='GET')writes.push({p,method:req.method()});else reads.push(p);
    let data=[];
    if(p==='/obras/minhas')data=[obra];
    else if(p==='/compras/solicitacoes')data=[{id:8,solicitacao_principal_id:90,status:'PENDENTE',obra,solicitante:{nome:'QA'}},{id:9,status:'PENDENTE',obra,solicitante:{nome:'QA'}},{id:10,solicitacao_principal_id:91,status:'PENDENTE',obra,solicitante:{nome:'QA'}}];
    else if(p==='/compras/delegacao/usuarios')data=[{id:1,nome:'Comprador QA',setor:'COMPRAS'}];
    else if(p==='/tipos-solicitacao')data=[tipo];
    else if(p==='/tipos-solicitacao/disponiveis')data={tipos:[tipo],destino_inicial:{codigo:'GEO',nome:'GEO'},tipo_automatico:false};
    else if(p==='/solicitacoes')data={items:[record(90),record(91)],meta:{page:Number(u.searchParams.get('page'))||1,total:50,total_pages:2,limit:25}};
    else if(/^\/solicitacoes\/\d+\/compra-etapas$/.test(p))data={solicitacao_compra_id:8,status_compra:'PENDENTE',pedidos:[],comentarios:[],leituras_comentarios:{},itens:[{id:5,item_tipo:'CADASTRADO',nome:'Arame',quantidade:1,status_aprovacao:'PENDENTE'}]};
    else if(/^\/solicitacoes\/\d+(?:\/resumo-lista)?$/.test(p))data=record(Number(p.split('/')[2]));
    else if(p.includes('contadores'))data={todas:50};
    else if(p.includes('preferencias'))data={preferencias:{paginacao_numerada:true,larguras:{codigo:1500,descricao:1000}}};
    else if(p.includes('nova-solicitacao-campos'))data={regras:{}};
    else if(p.includes('nova-solicitacao-automacao-destino'))data={destinos_disponiveis:[],regras:{}};
    else if(p.includes('suporte-whatsapp'))data={};
    return route.fulfill({json:data});
   });return{errors,writes,reads,navigationAudit};
 };
 for(const width of[1366,390]){
  const page=await browser.newPage({viewport:{width,height:900}});const audit=await install(page);
  await page.goto(base+'/nova-solicitacao?core');await page.getByLabel('Rascunho').fill('ultimo caractere!');
  const initial=await page.evaluate(()=>window.qa.tabs[0].id);
  await page.getByRole('button',{name:'QA ocupado',exact:true}).click();
  await page.evaluate(()=>window.qa.openTab('/consulta/ocupado'));
  await page.waitForURL('**/nova-solicitacao?core');
  assert.equal(await page.getByLabel('Rascunho').inputValue(),'ultimo caractere!','Nao desmonta operacao em andamento');
  await page.waitForFunction(()=>window.qa.store.stats().busy===0);
  await page.evaluate(()=>{const t=window.qa.tabs.find(t=>t.route==='/consulta/ocupado');window.qa.close(t.id)});
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));await page.waitForURL('**/consulta/1');
  await page.waitForFunction(()=>window.qa.tabs.find(t=>t.id===window.qa.activeId)?.route===location.pathname+location.search);
  await page.getByLabel('Rascunho').fill('outro registro');
  await page.evaluate(id=>window.qa.activateTab(id),initial);
  assert.equal(await page.getByLabel('Rascunho').inputValue(),'ultimo caractere!');
  await page.evaluate(()=>window.qa.nav('/solicitacoes/92'));
  await page.waitForURL('**/solicitacoes/92');
  await page.evaluate(()=>window.qa.openTab('/nova-solicitacao?core'));
  await page.waitForURL('**/nova-solicitacao?core');
  assert.equal(await page.getByLabel('Rascunho').inputValue(),'ultimo caractere!','Formulario recuperado mesmo depois de navegar dentro da sua aba');
  assert.equal(await page.evaluate(()=>window.qa.tabs.length),2,'Nao criar segunda Nova Solicitacao');
  await page.evaluate(()=>window.qa.nav('/consulta/replace',{replace:true}));await page.waitForURL('**/consulta/replace');
  await page.evaluate(()=>window.qa.openTab('/nova-solicitacao?core'));await page.waitForURL('**/nova-solicitacao?core');
  assert.equal(await page.getByLabel('Rascunho').inputValue(),'ultimo caractere!','Replace de consulta nao perde o formulario nem deixa pagina vazia');
  assert.equal(await page.evaluate(()=>window.qa.tabs.length),2);
  await page.evaluate(()=>window.scrollTo(0,1200));
  await page.waitForFunction(()=>window.scrollY===1200);
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));
  await page.evaluate(()=>window.qa.openTab('/nova-solicitacao?core'));
  await page.waitForFunction(()=>window.scrollY===1200);
  await page.evaluate(()=>window.qa.openTab('/solicitacoes/90'));
  await page.getByLabel('Rascunho').fill('somente90');
  await page.evaluate(()=>window.qa.openTab('/solicitacoes/91'));
  assert.equal(await page.getByLabel('Rascunho').inputValue(),'');
  await page.evaluate(()=>window.qa.openTab('/solicitacoes/90?interacao=ANEXO'));
  assert.equal(await page.getByLabel('Rascunho').inputValue(),'somente90');
  assert.equal(await page.evaluate(()=>window.qa.tabs.length),4);
  await page.evaluate(()=>window.qa.nav('/consulta/5'));await page.waitForURL('**/consulta/5');
  await page.evaluate(()=>window.qa.back());await page.waitForURL('**/solicitacoes/90?interacao=ANEXO');
  await page.evaluate(()=>window.qa.nav('/consulta/6'));await page.waitForURL('**/consulta/6');
  await page.goBack();await page.waitForURL('**/solicitacoes/90?interacao=ANEXO');
  await page.goForward();await page.waitForURL('**/consulta/6');
  for(let i=10;i<19;i++)await page.evaluate(i=>window.qa.openTab('/consulta/'+i),i);
  assert.equal(await page.evaluate(()=>window.qa.tabs.length),12);
  assert.equal(await page.evaluate(()=>window.qa.openTab('/consulta/999')),false);
  assert.equal(await page.locator('[data-retained]').count(),1);
  const before=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('fluxy_workspace_tabs_v1:1')));
  assert(!JSON.stringify(before).includes('ultimo caractere'));
  await page.evaluate(()=>window.qa.owner());
  await page.getByLabel('Rascunho').waitFor();
  assert.equal(await page.getByLabel('Rascunho').inputValue(),'');
  assert.deepEqual(audit.errors,[]);assert.deepEqual(audit.writes,[]);
  console.log('OK base '+width+'px: ultimo caractere, identidade, origem, POP/Forward, limite, um formulario retido e troca de usuario.');
  await page.close();
 }
 // Acesso negado nao pode restaurar um formulario antigo sobre o registro.
 {
  const page=await browser.newPage();const audit=await install(page);let denied=false,changed=false;
  await page.route('**/api/solicitacoes/90',r=>r.fulfill(denied?{status:403,json:{error:'Acesso negado.'}}:
    {json:{id:90,codigo:'SOL-QA90',valor:changed?2000:1000,descricao:'QA',status_global:'PENDENTE',area_responsavel:'GEO',anexos:[],historicos:[],contexto_interacao:{pode_interagir:true}}}));
  await page.goto(base+'/solicitacoes/90');
  await page.getByRole('button',{name:'Editar valor',exact:true}).click();
  await page.getByRole('textbox',{name:'Valor da solicitação (R$)',exact:true}).fill('2.222,20');
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));await page.waitForURL('**/consulta/1');
  changed=true;await page.evaluate(()=>window.qa.openTab('/solicitacoes/90'));await page.waitForURL('**/solicitacoes/90');
  await page.getByText('Este dado foi alterado. Feche e confira o valor atual antes de editar novamente.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Salvar alteração',exact:true}).isDisabled(),true);
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));await page.waitForURL('**/consulta/1');
  denied=true;await page.evaluate(()=>window.qa.openTab('/solicitacoes/90'));await page.waitForURL('**/solicitacoes');
  assert.equal(await page.getByRole('dialog').count(),0);
  assert.equal(await page.getByRole('button',{name:'Salvar alteração',exact:true}).count(),0);
  assert.deepEqual(audit.errors,[]);assert.deepEqual(audit.writes,[]);await page.close();
  console.log('OK seguranca UI: 403 nao restaura modal/dados antigos; revisao alterada bloqueia sobregravacao.');
 }
 // Um modal da lista nao pode usar o DTO salvo antes do GET autorizado.
 {
  const page=await browser.newPage();const audit=await install(page);let denied=false;
  await page.route('**/api/solicitacoes?*',async r=>{
    if(denied){await new Promise(resolve=>setTimeout(resolve,250));return r.fulfill({status:403,json:{error:'Acesso negado.'}})}
    return r.fallback();
  });
  await page.goto(base+'/solicitacoes');
  await page.getByRole('button',{name:'Editar valor de SOL-QA90',exact:true}).evaluate(el=>el.click());
  await page.getByRole('textbox',{name:'Valor da solicitação (R$)',exact:true}).fill('9.999,99');
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));await page.waitForURL('**/consulta/1');
  denied=true;
  const deniedResponse=page.waitForResponse(r=>r.url().includes('/api/solicitacoes?')&&r.status()===403);
  await page.evaluate(()=>window.qa.openTab('/solicitacoes'));await page.waitForURL('**/solicitacoes');
  assert.equal(await page.getByRole('dialog').count(),0,'Nao exibir dados da edicao enquanto carrega');
  await deniedResponse;
  assert.equal(await page.getByRole('dialog').count(),0,'403 na lista nao restaura DTO/modal anterior');
  assert.deepEqual(audit.errors,[]);assert.deepEqual(audit.writes,[]);await page.close();
  console.log('OK seguranca lista: carga lenta e 403 nunca reapresentam o modal do registro sem resposta autorizada.');
 }
 // Revogacao durante a pagina ativa elimina linhas e modal ja abertos.
 {
  const page=await browser.newPage();const audit=await install(page);let denied=false,heldRoute,release;
  await page.route('**/api/solicitacoes?*',async r=>{
    if(new URL(r.request().url()).searchParams.get('q')==='slowQA'){
      heldRoute=r;await new Promise(resolve=>{release=resolve});
      return r.fulfill({json:{items:[{id:90,codigo:'RESPOSTA-ANTIGA',valor:1000}],meta:{total:1}}});
    }
    return denied?r.fulfill({status:403,json:{error:'Acesso negado.'}}):r.fallback();
  });
  await page.goto(base+'/solicitacoes');
  await page.getByRole('button',{name:'Editar valor de SOL-QA90',exact:true}).evaluate(el=>el.click());
  await page.getByRole('textbox',{name:'Valor da solicitação (R$)',exact:true}).fill('9.999,99');
  const slowRequest=page.waitForRequest(r=>r.url().includes('q=slowQA'));
  await page.getByPlaceholder('Buscar por código, obra, descrição ou fornecedor…').fill('slowQA');
  await slowRequest;
  denied=true;const response=page.waitForResponse(r=>r.url().includes('/api/solicitacoes?')&&r.status()===403);
  await page.getByPlaceholder('Buscar por código, obra, descrição ou fornecedor…').fill('Conferir acesso');
  await response;await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));
  assert(heldRoute && release);const oldResponse=page.waitForResponse(r=>r.url().includes('q=slowQA'));
  release();await oldResponse;
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await page.getByText('SOL-QA90',{exact:true}).count(),0);
  assert.equal(await page.getByText('RESPOSTA-ANTIGA',{exact:true}).count(),0,'200 tardio nao substitui o 403 mais recente');
  assert.deepEqual(audit.errors,[]);assert.deepEqual(audit.writes,[]);await page.close();
  console.log('OK revogacao na lista ativa: 403 remove registros e fecha os alvos de operacao anteriores.');
 }
 // Storage indisponivel nao quebra navegacao; sucesso limpa o unico formulario.
 {
  const page=await browser.newPage();const audit=await install(page);
  await page.addInitScript(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('fluxy_workspace_tabs'))throw new DOMException('Quota','QuotaExceededError');return original.call(this,k,v)}});
  await page.goto(base+'/nova-solicitacao?core');await page.getByLabel('Rascunho').fill('Antes do sucesso');
  await page.evaluate(()=>{window.qa.store.clearPage(window.qa.activeId+'|/nova-solicitacao');window.qa.nav('/solicitacoes/900',{replace:true})});
  await page.waitForURL('**/solicitacoes/900');
  await page.evaluate(()=>window.qa.openTab('/nova-solicitacao?core'));await page.waitForURL('**/nova-solicitacao?core');
  assert.equal(await page.getByLabel('Rascunho').inputValue(),'','Nao ressuscitar formulario enviado');
  assert.equal(await page.locator('[data-retained]').count(),1);
  assert.deepEqual(audit.errors,[]);assert.deepEqual(audit.writes,[]);await page.close();
  console.log('OK descarte apos sucesso e quota indisponivel: formulario limpo, navegacao operacional.');
 }
 // Paginas reais dentro do Layout real, mesma API interceptada.
 for(const width of[1366,390]){
  const page=await browser.newPage({viewport:{width,height:900}});const audit=await install(page);
  await page.goto(base+'/nova-solicitacao');
  await page.getByPlaceholder(/buscar.*obra|buscar.*centro|digite.*obra/i).fill('Obra QA');
  await page.getByRole('button',{name:/Obra QA.*07/}).click();
  await page.locator('[name="tipo_solicitacao_id"]').selectOption('5');
  await page.locator('[name="descricao"]').fill('Texto sem enviar ultimo caractere!');
  const reads=audit.reads.length;
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));await page.waitForURL('**/consulta/1');
  await page.evaluate(()=>window.qa.openTab('/nova-solicitacao'));await page.waitForURL('**/nova-solicitacao');
  assert.equal(await page.locator('[name="descricao"]').inputValue(),'Texto sem enviar ultimo caractere!');
  assert.equal(await page.locator('[name="tipo_solicitacao_id"]').inputValue(),'5');
  assert.equal(audit.reads.length,reads,'Nova nao refaz GET ao retornar');
  assert.equal(await page.locator('[data-retained]').count(),1);
  await page.getByRole('tab',{name:'Nova Solicitação',exact:true}).press('Delete');
  await page.getByRole('dialog',{name:'Fechar aba com alterações?'}).waitFor();
  await page.getByRole('button',{name:'Cancelar',exact:true}).click();
  assert.equal(await page.locator('[name="descricao"]').inputValue(),'Texto sem enviar ultimo caractere!');
  await page.evaluate(()=>window.qa.openTab('/solicitacoes'));await page.waitForURL('**/solicitacoes');
  const search=page.getByPlaceholder('Buscar por código, obra, descrição ou fornecedor…');
  await search.fill('SOL-QA');
  await page.waitForResponse(r=>r.url().includes('/api/solicitacoes?') && r.url().includes('SOL-QA'));
  await page.getByRole('button',{name:'Próxima',exact:true}).click();
  await page.getByText('2 / 2 · 50 registro(s)',{exact:true}).waitFor();
  await page.getByRole('checkbox').nth(1).check();
  if(width>767) {
    await page.locator('.la-tabela-wrap').evaluate(el=>{el.scrollLeft=130});
    await page.waitForFunction(()=>document.querySelector('.la-tabela-wrap').scrollLeft===130);
  }
  await page.getByText('SOL-QA90',{exact:true}).first().waitFor();
  await page.getByText('SOL-QA90',{exact:true}).first().evaluate(el=>el.click());
  await page.waitForURL('**/solicitacoes/90');
  await page.getByRole('tab',{name:'SOL-QA90'}).waitFor();
  if(width<768) await page.getByRole('tab',{name:'Conversa',exact:true}).click();
  await page.getByRole('heading',{name:'Conversa',exact:true}).click();
  await page.locator('.sol-detail-comment-textarea').fill('Comentario rascunho somente 90');
  await page.getByTestId('comentario-anexos').setInputFiles({name:'rascunho.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nQA')});
  await page.evaluate(()=>window.qa.openTab('/solicitacoes/91'));
  await page.waitForURL('**/solicitacoes/91');
  if(width<768) await page.getByRole('tab',{name:'Conversa',exact:true}).click();
  await page.getByRole('heading',{name:'Conversa',exact:true}).click();
  assert.equal(await page.locator('.sol-detail-comment-textarea').inputValue(),'');
  await page.evaluate(()=>window.qa.openTab('/solicitacoes/90'));
  await page.waitForURL('**/solicitacoes/90');
  assert.equal(await page.locator('.sol-detail-comment-textarea').inputValue(),'Comentario rascunho somente 90');
  await page.getByText('rascunho.pdf',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Editar valor',exact:true}).click();
  const money=page.getByRole('textbox',{name:'Valor da solicitação (R$)',exact:true});
  await money.fill('2.222,20');
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));
  await page.waitForURL('**/consulta/1');
  assert.equal(await page.getByRole('dialog').count(),0,'Modal da aba inativa deve desaparecer');
  await page.evaluate(()=>window.qa.openTab('/solicitacoes/90'));
  await money.waitFor();
  assert.equal(await money.inputValue(),'2.222,20');
  await page.getByRole('button',{name:'Cancelar',exact:true}).click();
  await page.getByRole('button',{name:'QA voltar',exact:true}).click();
  await page.waitForURL('**/solicitacoes');
  assert.equal(await search.inputValue(),'SOL-QA');
  await page.getByText('2 / 2 · 50 registro(s)',{exact:true}).waitFor();
  assert.equal(await page.getByRole('checkbox').nth(1).isChecked(),true);
  if(width>767) assert.equal(await page.locator('.la-tabela-wrap').evaluate(el=>el.scrollLeft),130);
  assert.deepEqual(audit.errors,[]);assert.deepEqual(audit.writes,[]);
  assert.equal(audit.navigationAudit.length,10,'Auditoria existente: uma chamada por transicao real, nao por marcacao de historico');
  await page.evaluate(()=>window.qa.openTab('/nova-solicitacao'));await page.waitForURL('**/nova-solicitacao');
  await page.evaluate(()=>window.qaAuth.switch());
  await page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('fluxy_workspace_tabs_v1:2')||'null')?.tabs?.length===1);
  await page.getByPlaceholder(/buscar.*obra|buscar.*centro|digite.*obra/i).fill('Obra QA');
  await page.getByRole('button',{name:/Obra QA.*07/}).click();
  await page.locator('[name="tipo_solicitacao_id"]').selectOption('5');
  assert.equal(await page.locator('[name="descricao"]').inputValue(),'','Usuario efetivo novo nao recebe o rascunho anterior');
  assert(!await page.evaluate(()=>sessionStorage.getItem('fluxy_workspace_tabs_v1:2').includes('Texto sem enviar')));
  await page.locator('[name="descricao"]').fill('Rascunho antes de mudar permissoes');
  await page.evaluate(()=>window.qaAuth.restrict());
  await page.getByPlaceholder(/buscar.*obra|buscar.*centro|digite.*obra/i).fill('Obra QA');
  await page.getByRole('button',{name:/Obra QA.*07/}).click();
  await page.locator('[name="tipo_solicitacao_id"]').selectOption('5');
  assert.equal(await page.locator('[name="descricao"]').inputValue(),'','Mudanca de escopo no mesmo usuario limpa formulario e cache');
  console.log('OK paginas reais '+width+'px: Nova preservada sem GET extra, lista/busca, nova aba SOL real e retorno a origem; zero escritas de negocio, auditoria preservada.');
  await page.close();
 }
 for(const width of[1366,390]){
  const page=await browser.newPage({viewport:{width,height:900}});const audit=await install(page);
  await page.goto(base+'/solicitacoes/90?itens');
  await page.getByRole('heading',{name:'Itens da solicitação',exact:true}).click();
  await page.getByRole('button',{name:'Comentários: Arame',exact:true}).click();
  await page.getByRole('textbox',{name:'Comentário',exact:true}).fill('Rascunho item 90');
  await page.getByRole('button',{name:'Fechar comentários',exact:true}).click();
  await page.evaluate(()=>window.qa.openTab('/solicitacoes/91'));await page.waitForURL('**/solicitacoes/91');
  await page.getByRole('heading',{name:'Itens da solicitação',exact:true}).click();
  await page.getByRole('button',{name:'Comentários: Arame',exact:true}).click();
  assert.equal(await page.getByRole('textbox',{name:'Comentário',exact:true}).inputValue(),'');
  await page.getByRole('button',{name:'Fechar comentários',exact:true}).click();
  await page.evaluate(()=>window.qa.openTab('/solicitacoes/90'));await page.waitForURL('**/solicitacoes/90');
  await page.getByRole('button',{name:'Comentários: Arame',exact:true}).click();
  assert.equal(await page.getByRole('textbox',{name:'Comentário',exact:true}).inputValue(),'Rascunho item 90');
  assert.deepEqual(audit.errors,[]);assert.deepEqual(audit.writes,[]);await page.close();
  console.log('OK comentarios em itens '+width+'px: rascunho isolado por solicitacao/item, sem dados ou permissoes cacheados.');
 }
 // Regressao DEV: nomes/aba ativa apos navegação comum e Suspense real.
 for(const width of[1366,390]){
  const page=await browser.newPage({viewport:{width,height:900}});const audit=await install(page);
  await page.goto(base+'/solicitacoes/90');
  await page.getByRole('tab',{name:/SOL-QA90/}).waitFor();
  await page.getByRole('button',{name:'Abrir nova aba interna',exact:true}).click();
  await page.getByRole('combobox',{name:'Buscar tela para abrir em nova aba',exact:true}).fill('Nova Solicitação');
  await page.locator('.fx-cmdk-item-main').filter({hasText:'Nova Solicitação'}).first().click();
  await page.waitForURL('**/nova-solicitacao');
  assert.equal(await page.getByRole('tablist',{name:'Telas abertas',exact:true}).getByRole('tab',{selected:true}).innerText(),'Nova Solicitação');
  await page.getByRole('button',{name:'QA delegacao',exact:true}).click();
  await page.waitForURL('**/compras/delegacao');
  assert.equal(await page.getByRole('tablist',{name:'Telas abertas',exact:true}).getByRole('tab',{selected:true}).innerText(),'Delegação de Compras');
  await page.getByRole('button',{name:'QA aba lenta',exact:true}).click();
  await page.getByText('Consulta lenta pronta',{exact:true}).waitFor();
  await page.waitForURL('**/consulta-lenta');
  assert.equal(await page.getByRole('tablist',{name:'Telas abertas',exact:true}).getByRole('tab',{selected:true}).innerText(),'consulta lenta');
  await page.goBack();await page.waitForURL('**/compras/delegacao');
  assert.equal(await page.getByRole('tablist',{name:'Telas abertas',exact:true}).getByRole('tab',{selected:true}).innerText(),'Delegação de Compras');
  const source=await page.evaluate(()=>window.qa.activeId);
  const filter=page.getByPlaceholder('Solicitação, obra, responsável, solicitante ou status');
  await filter.fill('SC-00008');
  await page.locator('[data-workspace-page]:not([hidden]) select').selectOption('1');
  const before=await page.evaluate(()=>window.qa.tabs.length);
  await page.getByRole('button',{name:'Abrir',exact:true}).click();await page.waitForURL('**/solicitacoes/90');
  await page.getByRole('tab',{name:/SOL-QA90/,selected:true}).waitFor();
  assert.equal(await page.getByRole('tablist',{name:'Telas abertas',exact:true}).getByRole('tab',{selected:true}).innerText(),'SOL-QA90');
  assert.equal(await page.evaluate(()=>window.qa.tabs.length),before,'Solicitacao ja aberta reutiliza sua aba, sem substituir Delegacao');
  assert.equal(await page.evaluate(id=>window.qa.tabs.find(t=>t.id===id).route,source),'/compras/delegacao');
  await page.goBack();await page.waitForURL('**/compras/delegacao');
  assert.equal(await filter.inputValue(),'SC-00008');
  assert.equal(await page.locator('[data-workspace-page]:not([hidden]) select').inputValue(),'1');
  await filter.fill('SC-00009');await page.getByRole('button',{name:'Abrir',exact:true}).click();
  await page.waitForURL('**/solicitacoes-compra/9');
  await page.getByRole('button',{name:'QA voltar',exact:true}).click();await page.waitForURL('**/compras/delegacao');
  assert.equal(await filter.inputValue(),'SC-00009');
  for(let i=0;await page.evaluate(()=>window.qa.tabs.length)<12;i++){
    await page.evaluate(i=>window.qa.openTab('/consulta/limite'+i),i);await page.waitForURL('**/consulta/limite'+i);
  }
  await page.evaluate(id=>window.qa.activateTab(id),source);await page.waitForURL('**/compras/delegacao');
  await filter.fill('SC-00010');await page.getByRole('button',{name:'Abrir',exact:true}).click();
  await page.getByText('Limite de 12 abas atingido. Feche uma aba para abrir outra.',{exact:true}).waitFor();
  assert.equal(new URL(page.url()).pathname,'/compras/delegacao');
  assert.equal(await page.evaluate(()=>window.qa.tabs.length),12);
  assert.deepEqual(audit.errors,[]);assert.deepEqual(audit.writes,[]);await page.close();
  console.log('OK homologacao '+width+'px: nomes imediatos, Suspense/POP, Delegacao nova aba, filtro/edicao/origem e limite sem substituir trabalho.');
 }
 {
  const page=await browser.newPage();const audit=await install(page);let denied=false;
  await page.route('**/api/compras/solicitacoes?*',r=>denied?r.fulfill({status:403,json:{error:'Acesso negado.'}}):r.fallback());
  await page.goto(base+'/compras/delegacao');await page.getByRole('button',{name:'Abrir',exact:true}).first().waitFor();
  await page.locator('[data-workspace-page]:not([hidden]) select').first().selectOption('1');
  denied=true;await page.getByRole('button',{name:'Atualizar',exact:true}).click();
  await page.getByText('Acesso negado.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Abrir',exact:true}).count(),0);
  assert.deepEqual(audit.errors,[]);assert.deepEqual(audit.writes,[]);await page.close();
  console.log('OK Delegacao: 403 elimina lista, usuarios e alvos antigos; sem novas permissoes ou escritas.');
 }
 {
  const page=await browser.newPage();const audit=await install(page);
  await page.goto(base+'/login');await page.waitForURL(base+'/');
  assert.equal(await page.locator('#root').getByRole('textbox',{name:/e-mail/i}).count(),0);
  await page.evaluate(()=>window.qaAuth.logout());await page.waitForURL('**/login');
  await page.locator('#root').getByRole('textbox',{name:/e-mail/i}).waitFor();
  assert.deepEqual(audit.writes,[]);assert.deepEqual(audit.errors,[]);await page.close();
  console.log('OK sessao: login antigo redireciona apenas sessao ativa; logout real continua exigindo login.');
 }
 {
  const page=await browser.newPage();const audit=await install(page);
  await page.goto(base+'/login?restoring');await page.getByText('Carregando tela',{exact:true}).waitFor();
  assert.equal(await page.locator('#root').getByRole('textbox',{name:/e-mail/i}).count(),0);
  await page.evaluate(()=>window.qaAuth.ready());await page.waitForURL(base+'/');
  assert.deepEqual(audit.errors,[]);assert.deepEqual(audit.writes,[]);await page.close();
  const mfa=await browser.newPage();const check=await install(mfa);await mfa.goto(base+'/login?mfa');await mfa.waitForURL('**/perfil');
  assert.deepEqual(check.errors,[]);assert.deepEqual(check.writes,[]);await mfa.close();
  const anon=await browser.newPage();const negative=await install(anon);await anon.goto(base+'/solicitacoes/90?anon');await anon.waitForURL('**/login');
  await anon.locator('#root').getByRole('textbox',{name:/e-mail/i}).waitFor();
  assert(!negative.reads.some(p=>p.startsWith('/solicitacoes')));assert.deepEqual(negative.writes,[]);await anon.close();
  console.log('OK restauracao/MFA/anonimo: sem flash de login, perfil obrigatorio e guarda privado preservado.');
 }
 {
  const page=await browser.newPage();const audit=await install(page);
  await page.route('**/api/login',r=>r.fulfill({json:{user:{id:1,perfil:'SUPERADMIN',nome:'QA',area:'GEO'}}}));
  await page.goto(base+'/login?anon&anterior');
  await page.locator('#root').getByRole('textbox',{name:/e-mail/i}).fill('qa@example.test');
  await page.locator('#root').getByLabel(/^senha$/i).fill('senha-apenas-fixture');
  await page.evaluate(()=>history.pushState({},'','/login?anon'));
  await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.waitForURL(base+'/');
  await page.goBack();await page.waitForURL(base+'/');
  assert.equal(await page.locator('#root').getByRole('textbox',{name:/e-mail/i}).count(),0);
  assert.deepEqual(audit.errors,[]);assert.deepEqual(audit.writes,[]);await page.close();
  console.log('OK login/POP antigo: entrada de login substituida; retorno nao pede autenticacao novamente. POST somente simulado em localhost.');
 }
 // Comparacao controlada do mesmo formulario e DOM. Nao benchmark de producao.
 for(const legacy of[true,false,false,true]){
  const page=await browser.newPage({viewport:{width:1366,height:900}});const audit=await install(page);
  await page.goto(base+'/nova-solicitacao?core'+(legacy?'&legacy':''));
  await page.getByLabel('Rascunho').fill('valor');
  const initial=await page.evaluate(()=>window.qa.tabs[0].id);
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));
  const aux=await page.evaluate(()=>window.qa.activeId);
  const times=[];
  for(let i=0;i<40;i++) times.push(await page.evaluate(id=>new Promise(resolve=>{const t=performance.now();window.qa.activateTab(id);requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(performance.now()-t)))}),i%2?aux:initial));
  const cdp=await page.context().newCDPSession(page);await cdp.send('HeapProfiler.collectGarbage');
  const baseline=(await cdp.send('Runtime.getHeapUsage')).usedSize;
  for(let i=0;i<30;i++){const id=await page.evaluate(i=>{window.qa.openTab('/consulta/c'+i);return window.qa.activeId},i);await page.evaluate(id=>window.qa.close(id),id)}
  await cdp.send('HeapProfiler.collectGarbage');const after=(await cdp.send('Runtime.getHeapUsage')).usedSize;
  assert(after-baseline<8*1024*1024,'Memoria cresceu acima do orcamento apos 30 ciclos');
  times.sort((a,b)=>a-b);results.push({legacy,p50:times[20],p95:times[38],heapDelta:after-baseline});
  assert.deepEqual(audit.errors,[]);assert.deepEqual(audit.writes,[]);
  await page.close();
 }
 const avg=(old,key)=>results.filter(r=>r.legacy===old).reduce((s,r)=>s+r[key],0)/2;
 const old=avg(true,'p95'),now=avg(false,'p95');
 assert(now<=old*1.1+17,'Regressao acima de 10% e um frame de variacao do ensaio');
 const report={baselineP95:old,pilotP95:now,results,transport:'isolado; sem banco/rede externa',viewports:[1366,390]};
 const output=path.join(root,'../outputs/workspace-piloto-20261011');fs.mkdirSync(output,{recursive:true});
 fs.writeFileSync(path.join(output,'resultado.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
 console.log('OK QA isolada: transporte local interceptado, sem banco/rede externa. Homologacao em aparelhos/dev continua separada.');
}catch(e){console.error(e);throw e}finally{await browser?.close();await server.close()}
