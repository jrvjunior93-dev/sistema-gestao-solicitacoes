// Router/hook/Layout/componentes reais; transporte inteiramente interceptado.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import tailwindConfig from '../tailwind.config.js';
import { chromium } from 'playwright';
import { makeTab, makeEntry, moveTab, recordIdentity } from '../src/navigation/workspaceModel.js';
import { consultarJanela } from '../src/pages/Solicitacoes/consultarJanela.js';
import { lerConsultaSessao, salvarConsultaSessao } from '../src/pages/Solicitacoes/consultaSessao.js';
import { camposRespostaDraft, restaurarRespostaDraft, revisaoRespostaDraft } from '../src/modules/solicitacao-compra/utils/cotacaoWorkspaceDraft.js';
import { camposFila, revisaoFila } from '../src/navigation/filaWorkspaceDraft.js';
assert.deepEqual(camposFila({ motivo: 'Digitado', comprovante_url: 'privado', _saldo_referencia: 9, titular_documento: '123', data_emissao: '2026-01-01' }),
  { motivo: 'Digitado', titular_documento: '123', data_emissao: '2026-01-01' });
assert.notEqual(revisaoFila({id:1,titulo:{valor_saldo:100}}),revisaoFila({id:1,titulo:{valor_saldo:90}}));
const formQA = { preco: 'nao pertence ao cabecalho', condicao_pagamento: 'Boleto', token: 'SECRETO',
 itens: [{ item_tipo: 'CADASTRADO', item_referencia_id: 5, preco: '12', saldo_solicitacao: 4, arquivo_url: 'privado' }] };
const projected = camposRespostaDraft(formQA);
assert(!('token' in projected));assert(!('saldo_solicitacao' in projected.itens[0]));assert(!('arquivo_url' in projected.itens[0]));
assert.equal(restaurarRespostaDraft(formQA, projected).itens[0].saldo_solicitacao,4);
assert.notEqual(revisaoRespostaDraft({id:77,status:'RESPONDIDO'},formQA),revisaoRespostaDraft({id:77,status:'CANCELADO'},formQA));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const financeiroOnly = process.argv.includes('--financeiro-only');
const pedidoOnly = process.argv.includes('--pedido-only');
const provisaoOnly = process.argv.includes('--provisao-only');
const solicitacoesOnly = process.argv.includes('--solicitacoes-filtros-only');
if (solicitacoesOnly) process.argv.push('--table-only');
const consultaStorage = new Map();
const storageQA = { getItem: key => consultaStorage.get(key), setItem: (key, value) => consultaStorage.set(key, value) };
const ownerQA = { id: 35, areas_permissoes: ['solicitacoes.visualizar'] };
salvarConsultaSessao(ownerQA, false, { filtros: { codigo: 'SOL-QA', token: 'segredo' },
  consulta: { busca: 'Busca QA', filtros: { obra: ['7'], status: ['PENDENTE'], token: ['segredo'] },
    visao: { id: 'todas', params: { acesso: 'TODOS' } }, ordenacao: { campo: 'codigo', direcao: 'asc' }, dto: { arquivo_url: 'privado' } } }, storageQA);
const restoredQA = lerConsultaSessao(ownerQA, false, '', storageQA);
assert.equal(restoredQA.consulta.busca, 'Busca QA');assert.deepEqual(restoredQA.consulta.filtros.obra, ['7']);
assert(!JSON.stringify(restoredQA).includes('segredo'));assert(!JSON.stringify(restoredQA).includes('privado'));
assert(!restoredQA.consulta.visao.params);
assert.equal(lerConsultaSessao({ ...ownerQA, id: 36 }, false, '', storageQA), null);
assert.equal(lerConsultaSessao({ ...ownerQA, areas_permissoes: [] }, false, '', storageQA), null);
assert.equal(lerConsultaSessao(ownerQA, true, '', storageQA), null);
assert.equal(lerConsultaSessao(ownerQA, false, '?status=PAGA', storageQA), null);
assert.equal(lerConsultaSessao(ownerQA, false, '', { getItem() { throw Error('Storage bloqueado'); } }), null);
salvarConsultaSessao(ownerQA, false, {}, { setItem() { throw Error('Storage bloqueado'); } });
if (provisaoOnly) process.argv.push('--table-only'); // O modo integral continua incluindo o contrato real de provisao.
if (pedidoOnly) process.argv.push('--table-only'); // Base leve + contrato do pedido, sem ocultar casos no modo integral.
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
import ListaCompras from '/src/modules/solicitacao-compra/pages/SolicitacoesCompra.jsx';
import Pedidos from '/src/modules/solicitacao-compra/pages/PedidosCompra.jsx';
import PedidoDetalhe from '/src/modules/solicitacao-compra/pages/PedidoCompraDetalhe.jsx';
import FilaPagamentos from '/src/pages/FinanceiroFilaPagamentos.jsx';
import TituloNovo from '/src/pages/FinanceiroTituloNovo.jsx';
import Titulos from '/src/pages/FinanceiroTitulos.jsx';
import Autorizacoes from '/src/pages/FinanceiroAutorizacoesPagamento.jsx';
import Cotacoes from '/src/modules/solicitacao-compra/pages/ListaCotacoes.jsx';
import GerenciarCotacao from '/src/modules/solicitacao-compra/pages/GerenciarCotacaoSolicitacao.jsx';
import NovaProvisao from '/src/modules/provisionamento-financeiro/pages/NovaProvisaoFinanceira.jsx';
import ListaProvisoes from '/src/modules/provisionamento-financeiro/pages/ProvisionamentosFinanceiros.jsx';
import DetalheProvisao from '/src/modules/provisionamento-financeiro/pages/ProvisionamentoFinanceiroDetalhe.jsx';
import CategoriasProvisao from '/src/modules/provisionamento-financeiro/pages/GestaoCategoriasMacro.jsx';
import DashboardProvisao from '/src/modules/provisionamento-financeiro/pages/DashboardProvisionamentoFinanceiro.jsx';
import RelatorioProvisao from '/src/modules/provisionamento-financeiro/pages/ProvisionamentoRelatorioOperacional.jsx';
import NovaCompra from '/src/modules/solicitacao-compra/pages/NovaSolicitacaoCompra.jsx';
import RevisarCompra from '/src/modules/solicitacao-compra/pages/RevisarSolicitacaoCompra.jsx';
import Tabela from '/src/components/padrao/TabelaPadrao.jsx';
import Login from '/src/pages/Login/index.jsx';import PrivateRoute from '/src/components/PrivateRoute.jsx';
import tabs,{useLegacyWorkspaceTabs}from'/src/navigation/useWorkspaceTabs';
import WorkspaceView from'/src/navigation/WorkspaceView.jsx';
import{WorkspaceContext,createWorkspaceMemory,useWorkspace,useWorkspaceState,useWorkspaceWork,useWorkspaceTitle}from'/src/navigation/WorkspaceContext.jsx';
import{AuthContext}from'/src/contexts/AuthContext.jsx';import{ThemeContext,TEMA_PADRAO}from'/src/contexts/ThemeContext.jsx';
import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/componentes-padrao.css';
import '/src/components/lista-avancada/lista-avancada.css';
import '/src/styles/responsive-system.css';
import '/src/modules/solicitacao-compra/compras-responsive.css';
const params=new URLSearchParams(location.search);const core=params.has('core');const legacy=params.has('legacy');
const user={id:1,perfil:'SUPERADMIN',nome:'QA',area:'GEO',setor:{codigo:'GEO'},modulos_habilitados:[{key:'COMPRAS',enabled:false},{key:'CONTRATOS',enabled:false},{key:'FINANCEIRO',enabled:false}]};
if(params.has('obraadminqa'))Object.assign(user,{area:'OBRA',setor:{codigo:'OBRA'}});
if(params.has('regularqa'))Object.assign(user,{perfil:'USUARIO',area:'OBRA',setor:{codigo:'OBRA'},areas_permissoes_configuradas:true,areas_permissoes:[]});
if(params.has('comprasqa'))user.modulos_habilitados=[{key:'COMPRAS',enabled:true},{key:'COTACOES',enabled:true},{key:'FINANCEIRO',enabled:false}];
if(params.has('granularqa'))Object.assign(user,{perfil:'USUARIO',area:'COMPRAS',setor:{codigo:'COMPRAS',eh_setor_compras:true},
 areas_permissoes_configuradas:true,areas_permissoes:params.has('negadoqa')?[]:[
 'compras.cotacoes.visualizar','compras.cotacoes.encerrar_sem_pedido',
 ...(params.has('gerarpedidosqa')?['compras.solicitacoes.gerar_pedidos']:[])]});
if(params.has('financeiroqa')){user.modulos_habilitados=[{key:'FINANCEIRO',enabled:true}];user.autorizacao_pagamentos={can_decide:true,passkey_count:1};}
if(params.has('provisaoqa')||params.has('provisaolistqa')||params.has('provisaoconsultasqa'))user.modulos_habilitados=[{key:'PROVISOES',enabled:true}];
function TestAuth({children}){const[effective,set]=useState(params.has('anon')?null:params.has('mfa')?{...user,mfa_setup_pending:true}:user);const[ready,R]=useState(!params.has('restoring'));useEffect(()=>{window.qaAuth={ready:()=>R(true),logout:()=>set(null),switch:()=>set({...user,id:2,nome:'Outro usuario'}),restrict:()=>set(current=>({...current,areas_permissoes_configuradas:true,areas_permissoes:[]}))}},[]);return <AuthContext.Provider value={{user:effective,authReady:ready,isAuthenticated:!!effective,login:async data=>set(data.user),logout:()=>set(null)}}>{children}</AuthContext.Provider>}
function ItemsFixture(){return <><Toolbar/><CompraEtapas solicitacaoId={useParams().id} user={user} podeDecidir podeReceber={false} podeProgramarEntrega={false} podeAnexar={false} mostrarCotacao={params.has('cotacoesqa')} podeGerenciarCotacao={!params.has('readonlyqa')}/></>}
function Toolbar(){const w=useWorkspace();const nav=useNavigate();useEffect(()=>{window.qa=w?{...w}:{tabs:[],fallback:true}},[w]);return <div style={{position:'sticky',top:0,zIndex:90,background:'#fff'}}><button onClick={()=>w?w.openTab('/consulta/1'):nav('/consulta/1')}>QA consulta</button><button onClick={()=>w?w.back('/solicitacoes'):nav(-1)}>QA voltar</button><button onClick={()=>nav('/compras/delegacao')}>QA delegacao</button><button onClick={()=>w?w.openTab('/consulta-lenta'):nav('/consulta-lenta')}>QA aba lenta</button></div>}
const ConsultaLenta=React.lazy(()=>new Promise(resolve=>setTimeout(()=>resolve({default:()=> <><Toolbar/><p>Consulta lenta pronta</p></>}),400)));
function CoreForm(){const[text,set]=useWorkspaceState('texto','');const[busy,B]=useState(false);useWorkspaceWork(!!text,busy);useWorkspaceTitle('SOL-CORE-'+(useParams().id||'NOVA'));return <><input aria-label="Rascunho" value={text} onChange={e=>set(e.target.value)}/><button onClick={()=>{B(true);setTimeout(()=>B(false),700)}}>QA ocupado</button><div style={{height:2500}}>Formulario</div></>}
function TableFixture(){const[q,Q]=useWorkspaceState('tableqa:query','');const[loading,L]=useState(true);useEffect(()=>{const timer=setTimeout(()=>L(false),80);return()=>clearTimeout(timer)},[]);return <><Toolbar/><input aria-label="Filtro tabela QA" value={q} onChange={e=>Q(e.target.value)}/><Tabela itens={loading?[]:Array.from({length:120},(_,i)=>({id:i+1,nome:'Linha '+String(i+1).padStart(3,'0')}))} colunas={[{id:'nome',titulo:'Nome',tipo:'texto',largura:2000,minWidth:2000,ordenavel:true,render:r=>r.nome}]} linhaExpansivel={r=><p>Detalhe linha {r.id}</p>} storageKey="qa:tabela" chaveWorkspace={params.has('notableoptin')?null:'qa:tabela'} consultaWorkspace={q} carregando={loading}/></>}
function CoreShell(){const[owner,setOwner]=useState(user);const w=(legacy?useLegacyWorkspaceTabs:tabs)(owner);const memory=useMemo(()=>createWorkspaceMemory(),[owner.id]);useEffect(()=>{window.qa={...w,store:memory,owner:()=>setOwner({...user,id:2}),nav:navigate,close:id=>{w.closeTab(id);memory.deleteTab(id)}}},[w,memory]);const navigate=useNavigate();return <WorkspaceContext.Provider value={w}><div id="tabs">{w.tabs.map(t=><button key={t.id} data-route={t.route} onClick={()=>w.activateTab(t.id)}>{t.title}</button>)}</div><WorkspaceView key={owner.id} workspace={w} memory={memory} enabled={!legacy}/></WorkspaceContext.Provider>}
const withToolbar=Component=><><Toolbar/><Component/></>;
createRoot(document.getElementById('root')).render(<BrowserRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><TestAuth><ThemeContext.Provider value={{tema:TEMA_PADRAO}}><Routes>
<Route path="/login" element={<Login/>}/>
<Route element={<PrivateRoute>{core?<CoreShell/>:<Layout/>}</PrivateRoute>}><Route path="/nova-solicitacao" element={core?<CoreForm/>:withToolbar(Nova)}/>
<Route path="/compras/delegacao" element={withToolbar(Delegacao)}/>
<Route path="/solicitacoes-compra" element={params.has('tableqa')?<TableFixture/>:withToolbar(ListaCompras)}/>
<Route path="/solicitacoes-compra/nova" element={withToolbar(NovaCompra)}/>
<Route path="/solicitacoes-compra/revisar" element={withToolbar(RevisarCompra)}/>
<Route path="/solicitacoes-compra-direta/nova" element={<><Toolbar/><NovaCompra modoCompraDireta/></>}/>
<Route path="/solicitacoes-compra-direta/revisar" element={<><Toolbar/><RevisarCompra modoCompraDireta/></>}/>
<Route path="/solicitacoes-compra/finalizada/:id" element={<><Toolbar/><p>Compra QA criada</p></>}/>
<Route path="/pedidos-compra" element={withToolbar(Pedidos)}/>
<Route path="/cotacoes" element={withToolbar(Cotacoes)}/>
<Route path="/pedidos-compra/:id" element={params.has('pedidoqa')?withToolbar(PedidoDetalhe):<><Toolbar/><p>Detalhe do pedido QA</p></>}/>
<Route path="/financeiro/fila-pagamentos" element={withToolbar(FilaPagamentos)}/>
<Route path="/financeiro/titulos/novo" element={withToolbar(TituloNovo)}/>
<Route path="/financeiro/contas-a-pagar" element={<><Toolbar/><Titulos tipoFixo="PAGAR"/></>}/>
<Route path="/financeiro/autorizacoes-pagamento" element={withToolbar(Autorizacoes)}/>
<Route path="/provisoes-financeiras/nova" element={withToolbar(NovaProvisao)}/>
<Route path="/provisoes-financeiras" element={withToolbar(ListaProvisoes)}/>
<Route path="/provisoes-financeiras/categorias" element={withToolbar(CategoriasProvisao)}/>
<Route path="/provisoes-financeiras/dashboard" element={withToolbar(DashboardProvisao)}/>
<Route path="/provisoes-financeiras/relatorios/operacional" element={withToolbar(RelatorioProvisao)}/>
<Route path="/provisoes-financeiras/:id" element={params.has('provisaolistqa')||params.has('provisaoconsultasqa')?withToolbar(DetalheProvisao):<><Toolbar/><p>Provisão criada QA</p></>}/>
<Route path="/solicitacoes-compra/:id/cotacao" element={<><Toolbar/><GerenciarCotacao embedded={params.has('embeddedqa')}/></>}/>
<Route path="/solicitacoes-compra/:id" element={<><Toolbar/><p>Solicitacao de compra sem principal</p></>}/>
<Route path="/perfil" element={<><Toolbar/><p>Perfil MFA</p></>}/>
<Route path="/consulta-lenta" element={<ConsultaLenta/>}/>
<Route path="/solicitacoes" element={core?<CoreForm/>:withToolbar(Lista)}/><Route path="/solicitacoes/:id" element={core?<CoreForm/>:params.has('itens')?<ItemsFixture/>:withToolbar(Detalhe)}/>
<Route path="/consulta/:id" element={core?<CoreForm/>:<><Toolbar/><p>Consulta auxiliar</p></>}/><Route path="/" element={<Toolbar/>}/></Route>
</Routes></ThemeContext.Provider></TestAuth></BrowserRouter>);`;

const server = await createServer({ root, configFile:false,logLevel:'error',
  css:{postcss:{plugins:[tailwindcss({...tailwindConfig,content:tailwindConfig.content.map(p=>path.resolve(root,p).replaceAll('\\','/'))}),autoprefixer()]}},
  define:{'import.meta.env.VITE_API_URL':JSON.stringify('/api')},
  server:{host:'127.0.0.1',port:0},plugins:[{
    name:'workspace-qa',enforce:'pre',
    resolveId(id){if(id==='/qa.jsx')return '\0workspace-qa.jsx'},
    async load(id){if(id==='\0workspace-qa.jsx')return transformWithEsbuild(fixture,'qa.jsx',{loader:'jsx',jsx:'transform'})},
    transform(code,id){
      // Testar tambem a lista sem snapshots (equivalente ao piloto em OFF).
      if(solicitacoesOnly&&id.endsWith('/src/layout/Layout.jsx')) return code.replace("const pilotEnabled = import.meta.env.VITE_WORKSPACE_PILOT !== 'off';", "const pilotEnabled = !window.qaLegacy;");
      if(process.argv.includes('--baseline-controller')&&id.endsWith('/src/navigation/useWorkspaceController.js')) return execFileSync('git',['show','0fb4822d:frontend/src/navigation/useWorkspaceController.js'],{cwd:root,encoding:'utf8'});
      if(id.endsWith('/src/contexts/AuthContext.jsx')) return `import{createContext,useContext}from'react';export const AuthContext=createContext({});export const useAuth=()=>useContext(AuthContext);`;
      if(id.endsWith('/src/contexts/LiveUpdatesContext.jsx')) return `export function useLiveUpdateSubscription(){};`;
    },
    configureServer(s){s.middlewares.use(async(req,res,next)=>{
      if(!/^\/(nova-solicitacao|solicitacoes|pedidos-compra|cotacoes|financeiro|provisoes-financeiras|consulta|compras|login|perfil|$)/.test(req.url))return next();
      res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml(req.url,'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>.la-tabela{min-width:2600px!important}</style></head><body><div id="root"></div><script type="module" src="/qa.jsx"></script></body></html>'));
    })}
  },react()],optimizeDeps:{include:['react','react-dom/client','react-router-dom']}});
await server.listen();const base='http://127.0.0.1:'+server.httpServer.address().port;
let browser;
const results=[];
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,channel:process.env.PLAYWRIGHT_EXECUTABLE_PATH?undefined:'chrome'});
 const install=async (page, { context = false } = {})=>{
   const waitForURL = page.waitForURL.bind(page);
   page.waitForURL = async (...args) => {
     await waitForURL(...args);
     // history muda antes do commit do Router em startTransition.
     await page.waitForFunction(()=>location.pathname==='/login'||window.qa?.fallback||window.qa?.tabs.find(t=>t.id===window.qa.activeId)?.route===location.pathname+location.search+location.hash);
   };
   // O formulario retido fica hidden/inert; interagir apenas com a pagina ativa.
   page.getByLabel = (text, opts) => page.locator('[data-workspace-page]:not([hidden])').getByLabel(text, opts);
   const errors=[],writes=[],reads=[],queries=[],navigationAudit=[];page.setDefaultTimeout(12000);page.setDefaultNavigationTimeout(30000);
   page.on('pageerror',e=>{errors.push(e.message);console.error('QA pageerror:',e.message)});
   const obra={id:7,codigo:'07',nome:'Obra QA',tipo_centro_custo:'OBRA',ativo:true};
   const tipo={id:5,nome:'DESPESA EVENTUAL',ativo:true};
   const record=id=>({id,codigo:'SOL-QA'+id,obra_id:7,obra,tipo,valor:1000,valor_exibicao:1000,descricao:'Solicitacao QA',status_global:'PENDENTE',area_responsavel:'GEO',anexos:[],historicos:[],interacoes_pendentes:[],contexto_interacao:{pode_interagir:true},createdAt:'2026-10-01T12:00:00Z'});
   await (context ? page.context() : page).route('**/*',async route=>{
    const req=route.request(),u=new URL(req.url());
    if(u.origin!==base)return route.abort();
    if(!u.pathname.startsWith('/api/'))return route.continue();
    const p=u.pathname.slice(4);
    if(p==='/governanca/auditoria-operacional/navegacao' && req.method()==='POST') navigationAudit.push(req.postDataJSON());
    else if(req.method()!=='GET')writes.push({p,method:req.method()});else {reads.push(p);queries.push({p,params:Object.fromEntries(u.searchParams)});}
    let data=[];
    if(p==='/obras/minhas'||p==='/obras')data=[obra];
    else if(p==='/apropriacoes')data=[{id:9,codigo:'1.1',descricao:'Cobertura',obra_id:7,ativo:true}];
    else if(p.includes('formas-pagamento'))data=[{id:4,nome:'Boleto',codigo:'BOLETO',ativo:true,gera_boleto:true}];
    else if(p==='/compras/solicitacoes')data=[{id:8,solicitacao_principal_id:90,status:'PENDENTE',obra,solicitante:{nome:'QA'}},{id:9,status:'PENDENTE',obra,solicitante:{nome:'QA'}},{id:10,solicitacao_principal_id:91,status:'PENDENTE',obra,solicitante:{nome:'QA'}}];
    else if(p==='/compras/delegacao/usuarios')data=[{id:1,nome:'Comprador QA',setor:'COMPRAS'}];
    else if(p==='/compras/pedidos')data=[{id:8,solicitacao_compra_id:8,fornecedor:{nome:'Fornecedor QA'},obra,status:'ABERTO',valor_total:150}];
    else if(p==='/compras/cotacoes')data=[{id:8,token:'token-qa-publico',fornecedor:{nome:'Fornecedor QA'},solicitacao:{id:8,obra,titulo:'Cotacao QA'},status:'ENVIADO'}];
    else if(p==='/compras/solicitacoes/8/workspace-cotacao')data={solicitacao:{id:8,status:'PENDENTE',obra,fornecedores:[],itens:[],itensManuais:[]},comparativo:{itens:[]}};
    else if(p==='/tipos-solicitacao')data=[tipo];
    else if(p==='/tipos-solicitacao/disponiveis')data={tipos:[tipo],destino_inicial:{codigo:'GEO',nome:'GEO'},tipo_automatico:false};
    else if(p==='/solicitacoes')data={items:[record(90),record(91)],meta:{page:Number(u.searchParams.get('page'))||1,total:50,total_pages:2,limit:25}};
    else if(p==='/solicitacoes/filtros/status')data=['PENDENTE'];
    else if(p==='/solicitacoes/filtros/obras')data=[obra];
    else if(/^\/solicitacoes\/\d+\/compra-etapas$/.test(p))data={solicitacao_compra_id:8,status_compra:'PENDENTE',pedidos:[],comentarios:[],leituras_comentarios:{},itens:[{id:5,item_tipo:'CADASTRADO',nome:'Arame',quantidade:1,status_aprovacao:'PENDENTE'}]};
    else if(/^\/solicitacoes\/\d+(?:\/resumo-lista)?$/.test(p))data=record(Number(p.split('/')[2]));
    else if(p.includes('contadores'))data={todas:50};
    else if(p.includes('preferencias'))data={preferencias:{paginacao_numerada:true,larguras:{codigo:1500,descricao:1000}}};
    else if(p.includes('nova-solicitacao-campos'))data={regras:{}};
    else if(p.includes('nova-solicitacao-automacao-destino'))data={destinos_disponiveis:[],regras:{}};
    else if(p.includes('suporte-whatsapp'))data={};
    return route.fulfill({json:data});
   });return{errors,writes,reads,queries,navigationAudit};
 };
 if (solicitacoesOnly) {
  for (const width of [1366, 390]) for (const legacy of [false, true]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const audit = await install(page, { context: true });
    await page.addInitScript(value => { window.qaLegacy = value; }, legacy);
    const origem = base + '/solicitacoes' + (legacy ? '?legacy' : '');
    await page.goto(origem);
    const search = page.getByPlaceholder('Buscar por código, obra, descrição ou fornecedor…');
    await search.fill('SOL-QA');
    const mobileFilter = page.getByRole('button', { name: /^Filtrar/ });
    const openMobile = async () => { if (width < 768) await mobileFilter.click(); };
    const closeMobile = async () => { if (width < 768) await page.locator('.la-busca input').click(); };
    await openMobile();
    await page.locator('.la-rapido-wrap').getByRole('button', { name: 'Status', exact: true }).click();
    await page.getByRole('checkbox', { name: 'PENDENTE', exact: true }).check();
    await page.locator('.la-rapido-wrap').getByRole('button', { name: /Status \(1\)/ }).click();
    await page.getByRole('button', { name: /Mais filtros/ }).click();
    await page.getByLabel('Descrição', { exact: true }).fill('Solicitacao QA');
    await closeMobile();
    await page.waitForFunction(() => JSON.parse(sessionStorage.getItem('solicitacoes:consulta-sessao:1:ativas') || 'null')?.consulta?.filtros?.status?.includes('PENDENTE'));
    await page.waitForResponse(r => r.url().includes('/api/solicitacoes?') && r.url().includes('descricao=Solicitacao') && r.url().includes('q=SOL-QA'));
    const beforeTabs = await page.evaluate(() => window.qa.tabs.length);
    const link = page.getByRole('link', { name: 'SOL-QA90', exact: true });
    assert.equal(await link.getAttribute('href'), '/solicitacoes/90');
    const popupPromise = page.context().waitForEvent('page');
    await link.click({ modifiers: ['Control'] });
    const popup = await popupPromise;
    await popup.waitForURL('**/solicitacoes/90');
    await popup.getByRole('heading', { name: /SOL-QA90/ }).waitFor();
    assert.equal(page.url(), origem, 'Ctrl+clique nao muda a lista atual');
    assert.equal(await page.evaluate(() => window.qa.tabs.length), beforeTabs, 'Nao abre simultaneamente aba interna');
    assert.equal(await search.inputValue(), 'SOL-QA');
    await popup.close();

    if (width >= 768 && !legacy) {
      const middlePromise = page.context().waitForEvent('page');
      await link.click({ button: 'middle' });
      const middle = await middlePromise;await middle.waitForURL('**/solicitacoes/90');
      assert.equal(page.url(), origem);await middle.close();
      const rowPromise = page.context().waitForEvent('page');
      await link.locator('xpath=ancestor::tr').locator('td').nth(2).click({ modifiers: ['Control'] });
      const rowPage = await rowPromise;await rowPage.waitForURL('**/solicitacoes/90');
      assert.equal(page.url(), origem);await rowPage.close();
    }

    await link.click();await page.waitForURL('**/solicitacoes/90');
    assert.equal(await page.evaluate(() => window.qa.tabs.length), beforeTabs + (legacy ? 0 : 1));
    await page.getByRole('button', { name: 'QA voltar', exact: true }).click();
    await page.waitForURL(origem);
    assert.equal(await search.inputValue(), 'SOL-QA');
    await openMobile();
    await page.getByRole('button', { name: /Mais filtros/ }).click();
    // O painel avançado pode ter sido restaurado aberto pela aba.
    if (!(await page.getByLabel('Descrição', { exact: true }).isVisible())) {
      await page.getByRole('button', { name: /Mais filtros/ }).click();
    }
    assert.equal(await page.getByLabel('Descrição', { exact: true }).inputValue(), 'Solicitacao QA');
    await closeMobile();
    assert.ok(audit.queries.some(q => q.p === '/solicitacoes' && q.params.status === 'PENDENTE' && q.params.q === 'SOL-QA' && q.params.descricao === 'Solicitacao QA'));
    await page.reload();
    assert.equal(await search.inputValue(), 'SOL-QA', 'Sessao complementa retorno sem snapshot/F5');
    await page.getByRole('link', { name: 'SOL-QA90', exact: true }).waitFor();
    assert.deepEqual(audit.errors, []);assert.deepEqual(audit.writes, []);
    await page.close();
    console.log('OK filtros/Ctrl+clique ' + width + 'px, ' + (legacy ? 'legado' : 'workspace') + ': retorno, sessao e popup sem trocar lista; sem escrita de negocio.');
  }
  const page = await browser.newPage(); const audit = await install(page);
  await page.goto(base + '/solicitacoes?ids=90&visao=paradas-no-setor');
  await page.getByRole('link', { name: 'SOL-QA90', exact: true }).click();
  await page.waitForURL('**/solicitacoes/90');
  await page.getByRole('button', { name: 'QA voltar', exact: true }).click();
  await page.waitForURL('**/solicitacoes?ids=90&visao=paradas-no-setor');
  await page.waitForResponse(r => r.url().includes('/api/solicitacoes?') && new URL(r.url()).searchParams.get('ids') === '90');
  assert.equal(audit.queries.filter(q => q.p === '/solicitacoes').at(-1).params.visao, 'paradas-no-setor');
  assert.deepEqual(audit.errors, []);assert.deepEqual(audit.writes, []);await page.close();
  {
    const page = await browser.newPage();const audit = await install(page);let denied = false;
    await page.route('**/api/solicitacoes?*', r => denied
      ? r.fulfill({ status: 403, json: { error: 'Consulta QA negada' } }) : r.fallback());
    await page.goto(base + '/solicitacoes');
    const search = page.getByPlaceholder('Buscar por código, obra, descrição ou fornecedor…');
    await search.fill('Consulta do usuario 1');
    await page.waitForResponse(r => r.url().includes('/api/solicitacoes?') && r.url().includes('q=Consulta'));
    await page.getByRole('link', { name: 'SOL-QA90', exact: true }).click();
    await page.waitForURL('**/solicitacoes/90');denied = true;
    const forbidden = page.waitForResponse(r => r.url().includes('/api/solicitacoes?') && r.status() === 403);
    await page.getByRole('button', { name: 'QA voltar', exact: true }).click();await forbidden;
    await page.getByRole('link', { name: 'SOL-QA90', exact: true }).waitFor({ state: 'detached' });
    assert.equal(await search.inputValue(), 'Consulta do usuario 1');
    assert.equal(await page.getByRole('link', { name: 'SOL-QA90', exact: true }).count(), 0, 'Filtro restaurado nao concede acesso nem restaura DTO');
    denied = false;await page.evaluate(() => window.qaAuth.switch());
    await page.waitForFunction(() => document.querySelector('.la-busca input')?.value === '');
    await page.getByRole('link', { name: 'SOL-QA90', exact: true }).waitFor();
    await search.fill('Consulta usuario 2');
    await page.waitForResponse(r => r.url().includes('/api/solicitacoes?') && r.url().includes('q=Consulta'));
    await page.evaluate(() => window.qaAuth.restrict());
    await page.waitForFunction(() => document.querySelector('.la-busca input')?.value === '');
    assert.deepEqual(audit.errors, []);assert.deepEqual(audit.writes, []);await page.close();
    console.log('OK consulta segura: retorno 403 nao restaura registros; outro usuario e mudanca de escopo descartam busca anterior.');
  }
 }
 if(!financeiroOnly&&!process.argv.includes('--cotacao-only')&&!process.argv.includes('--compras-only')&&!process.argv.includes('--table-only')&&!process.argv.includes('--correcoes-only')&&!process.argv.includes('--wizard-only')){
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
 for(const deniedStatus of[403,404]){
  const page=await browser.newPage();const audit=await install(page);let denied=false,changed=false;
  await page.route('**/api/solicitacoes/90',r=>r.fulfill(denied?{status:deniedStatus,json:{error:deniedStatus===404?'Solicitacao nao encontrada.':'Acesso negado.'}}:
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
  console.log('OK seguranca UI: '+deniedStatus+' nao restaura modal/dados antigos; revisao alterada bloqueia sobregravacao.');
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
 }
 // E3a: listas reais de Compras, sem mudancas de endpoints/ACL/escritas.
 if(!financeiroOnly&&!process.argv.includes('--cotacao-only')&&!process.argv.includes('--table-only')&&!process.argv.includes('--correcoes-only')&&!process.argv.includes('--wizard-only')){
 for(const width of[1366,390]){
  for(const kind of ['solicitacoes-compra','pedidos-compra','cotacoes']){
   const page=await browser.newPage({viewport:{width,height:900}});const audit=await install(page);
   await page.goto(base+'/'+kind+'?comprasqa');
   const openName=kind==='solicitacoes-compra'?/Abrir detalhes da solicitação SC-00008/:kind==='pedidos-compra'?/Abrir pedido PC-00008/:/Editar cotação 00008/;
   const search=page.getByRole('textbox',{name:kind==='solicitacoes-compra'?'Código, obra ou solicitante':kind==='pedidos-compra'?'Fornecedor, obra ou pedido':'Fornecedor ou título da solicitação'});
   await page.getByRole('button',{name:openName}).waitFor();
   // Marcar pelo controle original, inclusive no layout de cards mobile.
   if(kind==='solicitacoes-compra') await page.locator(width<768?'.app-tabela-card-selecao input': 'input[aria-label="Selecionar linha 8"]').first().check();
   await search.fill(kind==='solicitacoes-compra'?'SC-00008':'Fornecedor QA');
   await page.getByRole('button',{name:openName}).waitFor();
   await page.getByRole('button',{name:'Status',exact:true}).click();
   const statusOption=kind==='solicitacoes-compra'?'Pendente':kind==='pedidos-compra'?'Aberto':'Enviado';
   await page.getByRole(kind==='solicitacoes-compra'?'checkbox':'radio',{name:statusOption,exact:true}).check();
   await page.getByRole('button',{name:'Status (1)',exact:true}).click();
   await page.getByRole('button',{name:'Obra / Centro de Custo',exact:true}).click();
   await page.getByRole('radio',{name:kind==='solicitacoes-compra'?'07 - Obra QA':'Obra QA',exact:true}).check();
   await page.getByRole('button',{name:'Obra / Centro de Custo (1)',exact:true}).click();
   await page.getByRole('button',{name:openName}).waitFor();
   const endpoint=kind==='solicitacoes-compra'?'/compras/solicitacoes':kind==='pedidos-compra'?'/compras/pedidos':'/compras/cotacoes';
   const recorteAntes=audit.queries.filter(q=>q.p===endpoint).at(-1)?.params;
   const source=await page.evaluate(()=>window.qa.activeId),before=await page.evaluate(()=>window.qa.tabs.length);
   await page.locator('.resizable-table-scroll').evaluateAll(els=>els.forEach(el=>{el.dispatchEvent(new Event('pointerdown'));el.scrollLeft=el.scrollWidth-el.clientWidth;}));
   if(process.argv.includes('--debug-compras')){
    const folder=path.join(root,'../outputs/workspace-compras-20261012');fs.mkdirSync(folder,{recursive:true});
    await page.screenshot({path:path.join(folder,kind+'-'+width+'.png')});
    console.log(await page.getByRole('button',{name:openName}).evaluate(el=>({bounds:el.getBoundingClientRect().toJSON(),scrollY:window.scrollY,scrollX:window.scrollX,root:document.documentElement.getBoundingClientRect().toJSON()})));
   }
   await page.getByRole('button',{name:openName}).click();
   await page.waitForURL(kind==='pedidos-compra'?'**/pedidos-compra/8':kind==='cotacoes'?'**/solicitacoes-compra/8/cotacao':'**/solicitacoes-compra/8');
   assert.equal(await page.evaluate(()=>window.qa.tabs.length),before+1);
   await page.getByRole('button',{name:'QA voltar',exact:true}).click();
   await page.waitForURL('**/'+kind+'?comprasqa');
   await page.getByRole('button',{name:openName}).waitFor();
   assert.equal(await search.inputValue(),kind==='solicitacoes-compra'?'SC-00008':'Fornecedor QA');
   assert.equal(await page.getByRole('button',{name:'Status (1)',exact:true}).count(),1);
   assert.equal(await page.getByRole('button',{name:'Obra / Centro de Custo (1)',exact:true}).count(),1);
   assert.deepEqual(audit.queries.filter(q=>q.p===endpoint).at(-1)?.params,recorteAntes,'Mesmo recorte autorizado ao retornar');
   if(kind==='solicitacoes-compra') assert(await page.locator(width<768?'.app-tabela-card-selecao input':'input[aria-label="Selecionar linha 8"]').first().isChecked(),'Selecao sobrevive ao GET de retorno');
   assert.equal(await page.evaluate(()=>window.qa.activeId),source);
   const readsBefore=audit.reads.length;
   await page.locator('.resizable-table-scroll').evaluateAll(els=>els.forEach(el=>{el.dispatchEvent(new Event('pointerdown'));el.scrollLeft=el.scrollWidth-el.clientWidth;}));
   await page.getByRole('button',{name:openName}).click();
   await page.getByRole('button',{name:'QA voltar',exact:true}).click();await page.waitForURL('**/'+kind+'?comprasqa');
   await page.getByRole('button',{name:openName}).waitFor();
   assert.equal(await page.evaluate(()=>window.qa.tabs.length),before+1,'Reutiliza detalhe aberto');
   assert(audit.reads.length>readsBefore,'Retorno faz leitura autorizada, sem cache de DTO');
   assert.deepEqual(audit.errors,[]);assert.deepEqual(audit.writes,[]);
   // Escopo trocado nao herda busca/selecao do usuario anterior.
   await page.evaluate(()=>window.qaAuth.switch());
   await search.waitFor();assert.equal(await search.inputValue(),'');
   await page.close();
   console.log('OK E3a '+kind+' '+width+'px: contexto, nova aba/origem, reutilizacao, GET atual e isolamento.');
  }
 }
 for(const [kind,endpoint] of [['solicitacoes-compra','solicitacoes'],['pedidos-compra','pedidos'],['cotacoes','cotacoes']]){
  const page=await browser.newPage();const audit=await install(page);let denied=false,held,release;
  await page.route('**/api/compras/'+endpoint+'?*',async r=>{
   if(denied)return r.fulfill({status:403,json:{error:'Acesso negado.'}});
   if(r.request().url().includes('q=antiga')||r.request().url().includes('obra_id=7')){held=r;await new Promise(resolve=>release=resolve);return r.fulfill({json:[{id:999,fornecedor:{nome:'RESPOSTA ANTIGA'},status:'ABERTO'}]});}
   return r.fallback();
  });
  await page.goto(base+'/'+kind+'?comprasqa');
  const open=page.getByRole('button',{name:kind==='solicitacoes-compra'?/Abrir detalhes/:kind==='pedidos-compra'?/Abrir pedido/:/Editar cotação/});await open.first().waitFor();
  const query=page.getByRole('textbox',{name:kind==='solicitacoes-compra'?'Código, obra ou solicitante':kind==='pedidos-compra'?'Fornecedor, obra ou pedido':'Fornecedor ou título da solicitação'});
  if(kind!=='solicitacoes-compra'){
   await query.fill('antiga');
  }else{
   await page.getByRole('button',{name:'Obra / Centro de Custo',exact:true}).click();
   await page.getByRole('radio',{name:'07 - Obra QA',exact:true}).check();
   await page.getByRole('button',{name:'Obra / Centro de Custo (1)',exact:true}).click();
  }
  const deadline=Date.now()+12000;while(!held&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,25));assert(held,'Consulta lenta iniciada');
  denied=true;
  if(kind!=='solicitacoes-compra'){await query.fill('nova');}else await page.getByRole('button',{name:'Limpar tudo',exact:true}).click();
  await page.getByText('Acesso negado.',{exact:true}).waitFor();
  if(release)release();
  await page.waitForTimeout(100);assert.equal(await open.count(),0);assert.equal(await page.getByText('RESPOSTA ANTIGA',{exact:true}).count(),0);
  assert.deepEqual(audit.errors,[]);assert.deepEqual(audit.writes,[]);await page.close();
  console.log('OK E3a '+kind+': 403 limpa dados e resposta tardia nao os restaura.');
 }
 }
 // Tabela compartilhada opt-in e legado, com carga assincrona e janela local.
 for(const optin of(process.argv.includes('--cotacao-only')||process.argv.includes('--correcoes-only')||process.argv.includes('--wizard-only')?[]:[true,false])){
  const page=await browser.newPage({viewport:{width:1366,height:900}});const audit=await install(page);
  const origin='/solicitacoes-compra?comprasqa&tableqa'+(optin?'':'&notableoptin');
  await page.goto(base+origin);
  await page.getByRole('button',{name:'Nome',exact:true}).waitFor();
  await page.getByRole('button',{name:'Nome',exact:true}).click();
  await page.getByRole('button',{name:'Ver detalhe',exact:true}).first().click();
  await page.getByText('Detalhe linha 1',{exact:true}).waitFor();
  await page.locator('.app-tabela-sentinela').scrollIntoViewIfNeeded();
  await page.getByRole('status').filter({hasText:'100 de 120'}).waitFor();
  // Voltar ao meio, com rolagem horizontal verdadeira.
  await page.evaluate(()=>{window.dispatchEvent(new Event('wheel'));window.scrollTo(0,1100)});
  await page.locator('.resizable-table-scroll').evaluate(el=>{el.dispatchEvent(new Event('pointerdown'));el.scrollLeft=300});
  await page.waitForTimeout(70);
  assert.equal(await page.locator('.resizable-table-scroll').evaluate(el=>el.scrollLeft),300,'Fixture deve ter rolagem horizontal');
  const y=await page.evaluate(()=>window.scrollY);
  // Evitar que o auto-scroll do clique de teste mova a origem ao topo.
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));await page.waitForURL('**/consulta/1');
  await page.getByRole('button',{name:'QA voltar',exact:true}).click();await page.waitForURL(base+origin);
  await page.getByRole('button',{name:'Nome',exact:true}).waitFor();
  if(optin){
   await page.getByRole('status').filter({hasText:'100 de 120'}).waitFor();
   assert.equal(await page.locator('th[aria-sort="ascending"]').count(),1);
   assert.equal(await page.getByText('Detalhe linha 1',{exact:true}).count(),1);
   await page.waitForFunction(expected=>Math.abs(window.scrollY-expected)<2,y);
   assert.equal(await page.locator('.resizable-table-scroll').evaluate(el=>el.scrollLeft),300);
   await page.getByRole('textbox',{name:'Filtro tabela QA'}).fill('outro recorte');
   await page.getByRole('status').filter({hasText:'50 de 120'}).waitFor();
   // Mesmo tick: nao esperar o evento assincrono de scroll antes de navegar.
   for(const position of[650,0]){
    await page.evaluate(y=>{window.scrollTo(0,y);window.qa.openTab('/consulta/1')},position);
    await page.waitForURL('**/consulta/1');
    await page.getByRole('button',{name:'QA voltar',exact:true}).click();await page.waitForURL(base+origin);
    await page.getByRole('button',{name:'Nome',exact:true}).waitFor();
    await page.waitForFunction(y=>window.scrollY===y,position);
   }
  }else{
   assert.equal(await page.locator('th[aria-sort="ascending"]').count(),0,'Sem opt-in, ordenacao nao e restaurada');
   assert.equal(await page.getByText('Detalhe linha 1',{exact:true}).count(),0);
   assert.equal(await page.locator('.resizable-table-scroll').evaluate(el=>el.scrollLeft),0);
  }
  assert.deepEqual(audit.errors,[]);assert.deepEqual(audit.writes,[]);await page.close();
  console.log('OK tabela '+(optin?'opt-in: ordenacao, expansao, janela e scroll; novo recorte reinicia janela.':'legada: comportamento anterior preservado.'));
 }
 if(!financeiroOnly&&!process.argv.includes('--cotacao-only')&&!process.argv.includes('--table-only')&&!process.argv.includes('--correcoes-only')&&!process.argv.includes('--wizard-only')){
 {
  const page=await browser.newPage();const audit=await install(page);let omit=false;
  await page.route('**/api/compras/solicitacoes?*',async r=>omit?r.fulfill({json:[{id:9,status:'PENDENTE',obra:{id:7,nome:'Obra QA'}}]}):r.fallback());
  await page.goto(base+'/solicitacoes-compra?comprasqa');
  await page.locator('input[aria-label="Selecionar linha 8"]').check();
  await page.getByRole('button',{name:'QA consulta',exact:true}).click();await page.waitForURL('**/consulta/1');omit=true;
  await page.getByRole('button',{name:'QA voltar',exact:true}).click();await page.waitForURL('**/solicitacoes-compra?comprasqa');
  await page.getByRole('button',{name:/Abrir detalhes da solicitação SC-00009/}).waitFor();
  assert.equal(await page.locator('input[aria-label="Selecionar linha 8"]').count(),0);
  assert.equal(await page.getByRole('button',{name:/Inativar selecionadas/}).count(),0,'Selecao nao autorizada eliminada');
  assert.deepEqual(audit.errors,[]);assert.deepEqual(audit.writes,[]);await page.close();
  console.log('OK selecao restaurada descartada quando registro sai do GET autorizado.');
 }
 {
  const page=await browser.newPage();const audit=await install(page);let deletions=0;
  await page.route('**/api/compras/solicitacoes/8',async r=>{
   if(r.request().method()!=='DELETE')return r.fallback();
   deletions++;await new Promise(resolve=>setTimeout(resolve,650));return r.fulfill({json:{ok:true}});
  });
  await page.goto(base+'/solicitacoes-compra?comprasqa');await page.locator('input[aria-label="Selecionar linha 8"]').check();
  await page.getByRole('button',{name:'Inativar selecionadas (1)',exact:true}).click();
  await page.getByRole('button',{name:'Manter',exact:true}).click();assert.equal(deletions,0);
  await page.getByRole('button',{name:'Inativar selecionadas (1)',exact:true}).click();
  await page.getByRole('button',{name:'Inativar',exact:true}).dblclick();
  await page.getByRole('button',{name:'Inativando...',exact:true}).waitFor();
  await page.getByRole('button',{name:'QA consulta',exact:true}).click();
  await page.waitForTimeout(80);assert.equal(new URL(page.url()).pathname,'/solicitacoes-compra','Operacao pendente nao e desmontada');
  await page.getByRole('button',{name:'Inativando...',exact:true}).waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Atualizar',exact:true}).waitFor();
  assert.equal(deletions,1,'Duplo clique executa uma unica operacao simulada');
  await page.getByRole('button',{name:'QA consulta',exact:true}).click();await page.waitForURL('**/consulta/1');
  await page.getByRole('button',{name:'QA voltar',exact:true}).click();await page.waitForURL('**/solicitacoes-compra?comprasqa');
  await page.getByRole('button',{name:/Abrir detalhes da solicitação SC-00008/}).waitFor();
  assert.equal(deletions,1,'Restauracao nao reaplica DELETE');assert.deepEqual(audit.errors,[]);await page.close();
  console.log('OK operacao simulada: cancelar, duplo clique, aba ocupada e retorno sem repeticao.');
 }
 // Cadastro rapido real: PJ possui fantasia; representante nao e exibido/enviado.
 for(const width of[1366,390]){
  const page=await browser.newPage({viewport:{width,height:900}});const audit=await install(page);let payload,created=0;
  await page.route('**/api/compras/fornecedores',async r=>{
   if(r.request().method()!=='POST')return r.fallback();
   created++;payload=r.request().postDataJSON();await new Promise(resolve=>setTimeout(resolve,180));
   return r.fulfill({status:201,json:{id:77,parceiro_id:99,...payload}});
  });
  await page.goto(base+'/solicitacoes-compra/8/cotacao?comprasqa'+(width<768?'&embeddedqa':''));
  const card=page.locator('.cotacao-fornecedor-rapido');await card.getByLabel('Nome do fornecedor',{exact:true}).fill('Fornecedor novo QA');
  await card.getByLabel('CPF/CNPJ',{exact:true}).fill('04252011000110');
  await card.getByLabel('WhatsApp',{exact:true}).fill('27999999999');
  await card.getByRole('button',{name:'Cadastrar e selecionar',exact:true}).click();
  await page.getByText('Informe o nome fantasia da empresa.',{exact:true}).waitFor();assert.equal(payload,undefined);
  await card.getByLabel('Nome fantasia',{exact:true}).fill('Fantasia QA');
  assert.equal(await card.getByLabel(/representante/i).count(),0);
  await card.getByRole('button',{name:'Cadastrar e selecionar',exact:true}).dblclick();
  await page.getByText('Fornecedor criado e selecionado.',{exact:true}).waitFor();
  assert.equal(payload.nome_fantasia,'Fantasia QA');assert(!('representante_nome' in payload));assert(!('representante_cpf' in payload));
  assert.equal(created,1);
  await card.getByLabel('CPF/CNPJ',{exact:true}).fill('52998224725');assert.equal(await card.getByLabel('Nome fantasia',{exact:true}).count(),0);
  assert.deepEqual(audit.errors,[]);await page.close();
  console.log('OK fornecedor rapido '+width+'px: PJ com fantasia, PF sem fantasia, representante oculto/opcional e envio unico.');
 }
 {
  const page=await browser.newPage({viewport:{width:1366,height:900}});const audit=await install(page);let sent;
  await page.route('**/api/compras/solicitacoes/8/workspace-cotacao',r=>r.fulfill({json:{solicitacao:{id:8,status:'PENDENTE',obra:{id:7,nome:'Obra QA'},fornecedores:[],itens:[{id:5,insumo:{nome:'Arame'},quantidade:1,status_aprovacao:'APROVADO'}],itensManuais:[]},comparativo:{itens:[]}}}));
  await page.route('**/api/compras/solicitacoes/8/enviar',r=>{sent=r.request().postDataJSON();return r.fulfill({json:{ok:true}})});
  await page.goto(base+'/solicitacoes-compra/8/cotacao?comprasqa&embeddedqa');
  const card=page.locator('.cotacao-fornecedor-rapido');
  await card.getByLabel('Nome do fornecedor',{exact:true}).fill('Empresa inline QA');
  await card.getByLabel('CPF/CNPJ',{exact:true}).fill('04252011000110');
  await card.getByLabel('WhatsApp',{exact:true}).fill('27999999999');
  await card.getByRole('button',{name:'Gerar links de cotacao',exact:true}).click();
  await page.getByText('Informe o nome fantasia da empresa.',{exact:true}).waitFor();assert.equal(sent,undefined);
  await card.getByLabel('Nome fantasia',{exact:true}).fill('Fantasia inline QA');
  await card.getByRole('button',{name:'Gerar links de cotacao',exact:true}).click();
  await page.getByText('Links de cotação gerados. Use os botoes de WhatsApp para enviar a mensagem a cada fornecedor.',{exact:true}).waitFor();
  assert.equal(sent.fornecedores[0].nome_fantasia,'Fantasia inline QA');
  assert.equal(sent.fornecedores[0].itens[0].solicitacao_compra_item_id,5);
  assert(!('representante_nome' in sent.fornecedores[0]));assert(!('representante_cpf' in sent.fornecedores[0]));
  assert.deepEqual(audit.errors,[]);await page.close();
  console.log('OK card embutido: novo fornecedor junto com links envia fantasia e item, sem representante.');
 }
 }
 if(!financeiroOnly&&!process.argv.includes('--cotacao-only')&&!process.argv.includes('--table-only')&&!process.argv.includes('--wizard-only')){
 for(const regular of[false,true]){
  const page=await browser.newPage();const audit=await install(page);
  await page.route('**/api/solicitacoes/90',r=>r.fulfill({json:{id:90,codigo:'SOL-QA90',obra_id:7,obra:{id:7,nome:'Obra QA'},tipo:{id:5,nome:'DESPESA EVENTUAL'},valor:1000,status_global:'PENDENTE',area_responsavel:'COMPRAS',anexos:[],historicos:[],contexto_interacao:{pode_interagir:false},createdAt:'2026-10-01T12:00:00Z'}}));
  await page.goto(base+'/solicitacoes/90?obraadminqa'+(regular?'&regularqa':''));
  await page.locator('[data-workspace-page]:not([hidden]) .sol-detail-page')
   .getByRole('heading',{name:/SOL-QA90/}).waitFor({timeout:30000});
  assert.equal(await page.getByRole('button',{name:'Alterar status',exact:true}).count(),regular?0:1);
  assert.equal(await page.getByRole('button',{name:'Enviar para outro setor',exact:true}).count(),regular?0:1);
  assert.deepEqual(audit.errors,[]);assert.deepEqual(audit.writes,[]);await page.close();
  console.log('OK detalhe real fora de setor: '+(regular?'usuario OBRA sem escrita.':'SUPERADMIN OBRA pode alterar status/enviar; contexto antigo nao bloqueia.'));
 }
 // Controles reais do comparativo dentro de CompraEtapas, sem fieldset global.
 for(const caso of['somente-encerrar','gerar-pedidos','leitura','vazio','terminal','negado']){
  const page=await browser.newPage();const audit=await install(page);
  await page.route('**/api/compras/solicitacoes/8/workspace-cotacao',r=>r.fulfill({json:{
   solicitacao:{id:8,status:caso==='terminal'?'ENCERRADO':'PENDENTE',obra:{id:7,nome:'Obra QA'},
    fornecedores:[{id:77,fornecedor_id:77,nome:'Fornecedor QA',status:'RESPONDIDO'}],itens:[],itensManuais:[]},
   comparativo:{itens:caso==='vazio'?[]:[{id:5,item_tipo:'CADASTRADO',item_referencia_id:5,nome:'Areia QA',unidade:'m3',
    quantidade:15,saldo_disponivel:15,respostas:[]}]}
  }}));
  await page.goto(base+'/solicitacoes/90?itens&cotacoesqa&comprasqa&granularqa'
   +(caso==='gerar-pedidos'?'&gerarpedidosqa':'')+(caso==='leitura'?'&readonlyqa':'')+(caso==='negado'?'&negadoqa':''));
  await page.getByRole('button',{name:'Cotação',exact:true}).click();
  const panel=page.locator('.cotacao-comparativo-panel');await panel.waitFor();
  const encerrar=panel.getByRole('button',{name:'Encerrar sem pedido',exact:true});
  const gerar=panel.getByRole('button',{name:'Gerar pedidos selecionados',exact:true});
  assert.equal(await encerrar.count(),caso==='negado'?0:1);
  assert.equal(await gerar.count(),caso==='gerar-pedidos'?1:0,'Encerrar sem pedido nao concede gerar pedidos');
  if(caso!=='negado'){
   if(['leitura','vazio','terminal'].includes(caso)){assert(await encerrar.isDisabled());}
   else{assert(await encerrar.isEnabled());await encerrar.click();await page.getByRole('dialog').waitFor();}
  }
  assert.deepEqual(audit.writes,[]);assert.deepEqual(audit.errors,[]);await page.close();
  console.log('OK comparativo usuario Compras granular: '+caso+'; sem ampliacao de escrita.');
 }
 for(const width of[1366,390]){
  for(const readonly of[false,true]){
   const page=await browser.newPage({viewport:{width,height:900}});const audit=await install(page);
   const response={resposta_item_id:101,fornecedor_id:77,cotacao_fornecedor_id:77,fornecedor_nome:'Fornecedor QA',disponivel:true,preco:10,valor_total_cotado:150,quantidade_disponivel:50,saldo_disponivel_fornecedor:40};
   await page.route('**/api/compras/solicitacoes/8/workspace-cotacao',r=>r.fulfill({json:{
    solicitacao:{id:8,status:'PENDENTE',obra:{id:7,nome:'Obra QA'},fornecedores:[{id:77,fornecedor_id:77,nome:'Fornecedor QA',status:'RESPONDIDO'}],itens:[],itensManuais:[]},
    comparativo:{itens:[{id:5,item_tipo:'CADASTRADO',item_referencia_id:5,nome:'Areia QA',unidade:'m3',quantidade:15,saldo_disponivel:15,respostas:[response]}]}
   }}));
   await page.goto(base+'/solicitacoes/90?itens&cotacoesqa&comprasqa'+(readonly?'&readonlyqa':''));
   await page.getByRole('button',{name:'Cotação',exact:true}).click();
   const panel=page.locator('.cotacao-comparativo-panel');
   await panel.getByRole('button',{name:'Mapa',exact:true}).click();
   await panel.getByText('Mapa de comparação',{exact:true}).waitFor();
   assert.equal(await panel.getByRole('button',{name:'Mapa',exact:true}).evaluate(el=>!!el.parentElement.closest('button')),false,'Nao aninhar botoes no cabecalho');
   if(readonly){
    const inputs=panel.locator('input[placeholder="Qtd."]');assert(await inputs.first().isDisabled());
    await panel.getByRole('button',{name:'Cards',exact:true}).click();
    assert(await panel.getByRole('checkbox',{name:'Comprar de Fornecedor QA',exact:true}).isDisabled());
   }else{
    for(const mode of['Cards','Mapa']){
     await panel.getByRole('button',{name:mode,exact:true}).click();
     const check=mode==='Cards'?panel.getByRole('checkbox',{name:'Comprar de Fornecedor QA',exact:true}):panel.locator('input[type="checkbox"]').last();
     if(mode==='Cards')await panel.locator('.resizable-table-scroll').evaluateAll(els=>els.forEach(el=>{el.scrollLeft=el.scrollWidth}));
     if(!await check.isChecked())await check.check();
     const input=panel.getByRole('textbox',{name:/Quantidade comprada de Fornecedor QA/});
     await input.click();await input.pressSequentially('7');assert.equal(await input.inputValue(),'7','Foco seleciona valor inicial para substituir');
     await input.fill('');assert(await check.isChecked());assert(await input.isEnabled());
     assert(await input.evaluate(el=>el===document.activeElement),'Limpar mantem foco');
     await input.pressSequentially('0,5');assert(await check.isChecked());assert.equal(await input.inputValue(),'0,5');
     await input.fill('');await panel.getByRole('button',{name:'Gerar pedidos selecionados',exact:true}).click();
     await page.getByText('Informe uma quantidade maior que zero para cada fornecedor selecionado.',{exact:true}).waitFor();
     assert.deepEqual(audit.writes,[],'Quantidade vazia nunca fecha pedido');
     await input.fill('5');await check.uncheck();assert(await input.isDisabled());
    }
   }
   assert.deepEqual(audit.errors,[]);assert.deepEqual(audit.writes,[]);await page.close();
   console.log('OK comparativo '+width+'px '+(readonly?'leitura: Cards/Mapa ativos, gravacoes bloqueadas.':'edicao: substituir/limpar/decimal/foco sem desmarcar; vazio nao envia.'));
  }
 }
 // Lista real: cancelamento, negativa da API, duplo clique e alvo unico.
 for(const regular of[false,true]){
  const page=await browser.newPage();const audit=await install(page);let calls=0,denied=true;
  await page.route('**/api/solicitacoes/90',async r=>{
   if(r.request().method()!=='DELETE')return r.fallback();calls++;
   await new Promise(resolve=>setTimeout(resolve,150));
   return denied?r.fulfill({status:403,json:{error:'Sem permissao de excluir QA'}}):r.fulfill({status:204});
  });
  await page.goto(base+'/solicitacoes'+(regular?'?regularqa':''));
  await page.getByRole('checkbox').nth(1).check();
  const del=page.getByRole('button',{name:'Excluir',exact:true});
  if(regular){assert.equal(await del.count(),0);}
  else{
   await del.click();await page.getByRole('dialog').getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal(calls,0);
   await del.click();await page.getByRole('dialog').getByRole('button',{name:'Excluir',exact:true}).click();
   await page.getByText('Sem permissao de excluir QA',{exact:true}).waitFor();assert.equal(calls,1);
   denied=false;await del.click();
   await page.getByRole('dialog').getByRole('button',{name:'Excluir',exact:true}).evaluate(el=>{el.click();el.click()});
   await page.getByText('Solicitação SOL-QA90 excluída.',{exact:true}).waitFor();assert.equal(calls,2);
   assert.equal(await page.getByText('SOL-QA90',{exact:true}).count(),0);
  }
  assert.deepEqual(audit.errors,[]);await page.close();console.log('OK exclusao UI '+(regular?'negativa OBRA.':'cancelar/403/duplo clique/alvo unico.'));
 }
 {
  const page=await browser.newPage();await install(page);await page.goto(base+'/solicitacoes');
  const count=await page.evaluate(async()=>{
   const access=await import('/src/utils/acessoProduto.js');
   const user={id:1,perfil:'SUPERADMIN',area:'OBRA',setor:{codigo:'OBRA'},areas_permissoes_configuradas:true,areas_permissoes:[],
    modulos_habilitados:[{key:'COMPRAS',enabled:false},{key:'FINANCEIRO',enabled:false},{key:'RH_DP',enabled:false}],autorizacao_pagamentos:{enabled:true,can_configure:true}};
   let count=0;for(const[name,fn]of Object.entries(access))if(/^can[A-Z]/.test(name)&&typeof fn==='function'){
    if(fn(user)!==true)throw Error(name+' bloqueou superadmin');count++;
   }
   const regular={...user,perfil:'USUARIO',modulos_habilitados:[],autorizacao_pagamentos:null};
   for(const name of['canPreparePagamentos','canApprovePagamentos','canSendPagamentosBanco','canOperateComprasCotacoes'])if(access[name](regular))throw Error(name+' liberou usuario comum');
   if(access.canAccessAutorizacoesPagamento({...user,autorizacao_pagamentos:{enabled:false}}))throw Error('Modo OFF nao deve ser ativado por bypass');
   return count;
  });assert(count>=166);console.log('OK '+count+' predicados centrais frontend e negativas; modo OFF preservado.');await page.close();
 }
 }
 // E3b: paginas reais de criacao/revisao, memoria da sessao e storage legado.
 if(!financeiroOnly&&!process.argv.includes('--cotacao-only')&&!process.argv.includes('--table-only')&&!process.argv.includes('--correcoes-only')&&!process.argv.includes('--compras-only')){
 for(const width of[1366,390])for(const direta of[false,true])for(const quota of[false,true]){
  const page=await browser.newPage({viewport:{width,height:900}});const audit=await install(page);
  const prefix=direta?'/solicitacoes-compra-direta':'/solicitacoes-compra';
  const key='fluxy_compras_draft_v2:1:'+(direta?'compra-direta':'solicitacao');
  const item={manual:true,nome_manual:'Material QA',insumo_nome:'Material QA',unidade_sigla_manual:'un',
   quantidade:1,valor_unitario:10,apropriacao_id:9,apropriacoes:[{apropriacao_id:9,quantidade_apropriada:1}],necessario_para:'2099-12-01'};
  const draft={payload:{obra_id:7,titulo:'Compra inicial',necessario_para:'2099-12-01',itens:[item],
   ...(direta?{parceiro_id:8,origem:'COMPRA_DIRETA',forma_pagamento_ids:[4],formas_pagamento:[{id:4,valor:10}],
    anexos_cabecalho:[{tipo_documento:'BOLETO',arquivo_url:'/uploads/qa.pdf',arquivo_nome_original:'qa.pdf'}]}:{})},
   resumo:{obra_nome:'Obra QA',credor_nome:'Fornecedor QA',itens:[item]}};
  await page.addInitScript(({key,draft,quota})=>{
   localStorage.setItem(key,JSON.stringify(draft));
   if(quota){const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){
    if(k.startsWith('fluxy_compras_draft'))throw new DOMException('Quota','QuotaExceededError');
    return original.call(this,k,v);
   }}
  },{key,draft,quota});
  await page.goto(base+prefix+'/nova?comprasqa');
  const title=page.getByLabel('Título da solicitação',{exact:true});
  await title.waitFor();await page.waitForFunction(()=>document.querySelector('input[maxlength="255"]')?.value==='Compra inicial');
  const initial=await page.evaluate(()=>window.qa.activeId);
  await page.getByRole('button',{name:/^(Apropriar|Editar apropriação)/}).first().click();
  const modal=page.getByRole('dialog',{name:'Apropriar item'});
  assert.equal(await modal.getByRole('textbox',{name:'Quantidade apropriada do rateio 1'}).inputValue(),'1');
  await modal.getByRole('textbox',{name:'Quantidade apropriada do rateio 1'}).fill('0,5');
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));await page.waitForURL('**/consulta/1');
  assert.equal(await page.getByRole('dialog').count(),0,'Modal da pagina anterior nao vaza');
  await page.evaluate(id=>window.qa.activateTab(id),initial);
  await modal.waitFor();assert.equal(await modal.getByRole('textbox',{name:'Quantidade apropriada do rateio 1'}).inputValue(),'0,5');
  await modal.getByRole('button',{name:'Cancelar',exact:true}).click();
  await title.fill('Ultimo caractere '+width+'!');
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));await page.waitForURL('**/consulta/1');
  await page.evaluate(id=>window.qa.activateTab(id),initial);
  assert.equal(await title.inputValue(),'Ultimo caractere '+width+'!');
  // Outra aba do mesmo tipo nao pode substituir o payload desta revisao.
  await page.evaluate(route=>window.qa.openTab(route),prefix+'/nova?comprasqa&segundo');
  await title.waitFor();await title.fill('Outra aba');
  const segundo=await page.evaluate(()=>window.qa.activeId);
  await page.evaluate(id=>window.qa.activateTab(id),initial);
  await page.waitForURL('**'+prefix+'/nova?comprasqa');
  assert.equal(await title.inputValue(),'Ultimo caractere '+width+'!');
  await page.getByRole('button',{name:'Revisar solicitação',exact:true}).click();
  await page.waitForURL('**'+prefix+'/revisar');
  await page.getByRole('button',{name:'Visualizar PDF antes de criar',exact:true}).click();
  await page.locator('iframe').waitFor();await page.keyboard.press('Escape');
  await page.getByRole('checkbox',{name:/Confirmo que revisei/}).check();
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));await page.waitForURL('**/consulta/1');
  await page.evaluate(id=>window.qa.activateTab(id),initial);
  assert.equal(await page.getByRole('checkbox',{name:/Confirmo que revisei/}).isChecked(),true);
  await page.getByRole('button',{name:'Voltar e editar',exact:true}).click();
  await title.fill('Revisao alterada!');
  await page.getByRole('button',{name:'Revisar solicitação',exact:true}).click();
  await page.waitForURL('**'+prefix+'/revisar');
  assert.equal(await page.getByRole('checkbox',{name:/Confirmo que revisei/}).isChecked(),false,'Nao reaplica aprovacao de outro conteudo');
  assert.deepEqual(audit.writes,[],'Alternancia/revisao nao cria registro');
  let creates=0,denied=true;
  await page.route('**/api/compras/solicitacoes'+(direta?'-diretas':''),async r=>{
   if(r.request().method()!=='POST')return r.fallback();creates++;
   assert.equal(r.request().postDataJSON().titulo,'Revisao alterada!');
   await new Promise(resolve=>setTimeout(resolve,200));
   return r.fulfill(denied?{status:403,json:{error:'Compra QA negada'}}:{status:201,json:{id:200}});
  });
  const confirmar=async()=>{
   await page.getByRole('button',{name:'Visualizar PDF antes de criar',exact:true}).click();
   await page.locator('iframe').waitFor();await page.keyboard.press('Escape');
   await page.getByRole('checkbox',{name:/Confirmo que revisei/}).check();
  };
  await confirmar();
  await page.getByRole('button',{name:'Criar solicitacao',exact:true}).evaluate(el=>{el.click();el.click()});
  await page.getByText('Compra QA negada',{exact:true}).waitFor();assert.equal(creates,1);
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));await page.waitForURL('**/consulta/1');
  await page.evaluate(id=>window.qa.activateTab(id),initial);
  await page.getByText('Revisao alterada!',{exact:true}).waitFor();assert.equal(creates,1);
  denied=false;
  await page.getByRole('button',{name:'Criar solicitacao',exact:true}).evaluate(el=>{el.click();el.click()});
  await page.getByText('Compra QA criada',{exact:true}).waitFor();assert.equal(creates,2);
  await page.evaluate(id=>window.qa.activateTab(id),segundo);
  await page.waitForURL('**'+prefix+'/nova?comprasqa&segundo');
  assert.equal(await title.inputValue(),'Outra aba','Sucesso de uma aba nao apaga o trabalho de outra');
  await page.evaluate(id=>window.qa.activateTab(id),initial);
  await page.getByText('Compra QA criada',{exact:true}).waitFor();
  await page.evaluate(route=>window.qa.openTab(route),prefix+'/nova?comprasqa');
  await title.waitFor();assert.equal(await title.inputValue(),'','Nao ressuscita formulario criado');
  assert.deepEqual(audit.errors,[]);await page.close();
  console.log('OK E3b wizard '+width+'px '+(direta?'direta':'normal')+' storage '+(quota?'quota':'disponivel')+': campos/modal, revisao, 403, duplo envio e sucesso sem replay.');
 }
 for(const width of [1366,390]){
  const page=await browser.newPage({viewport:{width,height:900}});const audit=await install(page);
  await page.addInitScript(()=>localStorage.setItem('fluxy_compras_draft_v2:1:solicitacao',JSON.stringify({
   payload:{obra_id:7,titulo:'Upload pendente',necessario_para:'2099-12-01',itens:[{manual:true,nome_manual:'Material upload',insumo_nome:'Material upload',
    unidade_sigla_manual:'un',quantidade:1,apropriacao_id:9,apropriacoes:[{apropriacao_id:9,quantidade_apropriada:1}]}]},resumo:{}})));
  let release,uploads=0;
  await page.route('**/api/compras/anexos-temporarios',r=>new Promise(resolve=>{
   uploads++;release=()=>r.fulfill({json:{arquivo_url:'/uploads/qa-upload.pdf',arquivo_nome_original:'qa-upload.pdf'}}).then(resolve);
  }));
  await page.goto(base+'/solicitacoes-compra/nova?comprasqa');
  const file=page.locator('.app-table-shell input[type="file"], .app-tabela-cards input[type="file"]').first();await file.waitFor({state:'attached'});
  const selected={name:'qa-upload.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nQA local')};
  const request=page.waitForRequest(r=>r.url().endsWith('/compras/anexos-temporarios'));await file.setInputFiles(selected);await request;
  await file.setInputFiles(selected);assert.equal(uploads,1,'Mesmo upload pendente nao dispara novamente');
  const initial=await page.evaluate(()=>window.qa.activeId);
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(()=>window.qa.activeId),initial,'Aba ocupada nao navega');
  assert(await page.getByRole('button',{name:'Revisar solicitação',exact:true}).isDisabled());
  assert(await page.getByRole('button',{name:'Limpar rascunho',exact:true}).isDisabled());
  release();await page.getByText('qa-upload.pdf',{exact:true}).waitFor();
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));await page.waitForURL('**/consulta/1');
  await page.evaluate(id=>window.qa.activateTab(id),initial);await page.getByText('qa-upload.pdf',{exact:true}).waitFor();assert.equal(uploads,1);
  await page.evaluate(()=>window.qaAuth.switch());const title=page.getByLabel('Título da solicitação',{exact:true});
  await page.waitForFunction(()=>document.querySelector('input[maxlength="255"]')?.value==='');assert.equal(await title.inputValue(),'');
  const lifecycle=await page.evaluate(async()=>{
   const {createWorkspaceMemory}=await import('/src/navigation/WorkspaceContext.jsx');const memory=createWorkspaceMemory();
   const {referenciaParceiroCompra}=await import('/src/modules/solicitacao-compra/utils/useComprasDraft.js');
   if(Object.keys(referenciaParceiroCompra({id:1,nome:'QA',cpf_cnpj:'',saldo:100,contas:['privado'],permissoes:['admin']})).join(',')!=='id,nome,cpf_cnpj')throw Error('Snapshot de DTO indevido');
   for(let i=0;i<40;i++){const tab='t'+i,prefix=tab+'|/nova';memory.set(prefix+'|flow',tab+'|draft');
    memory.setFlow(tab+'|draft',{titulo:'teste'},tab);memory.dirty.add(prefix+'|work');memory.deleteTab(tab);}
   return memory.stats();
  });assert.deepEqual(lifecycle,{slots:0,dirty:0,busy:0,flows:0});
  assert.deepEqual(audit.errors,[]);await page.close();
  console.log('OK E3b upload '+width+'px: operacao protegida, um envio, retorno sem replay, identidade e 40 limpezas de flow.');
 }
 }
 if(!financeiroOnly&&!['--table-only','--correcoes-only','--compras-only','--wizard-only'].some(flag=>process.argv.includes(flag))){
 for(const width of [1366,390]){
  const page=await browser.newPage({viewport:{width,height:900}});const audit=await install(page);
  let price=10,deniedRead=false,deniedWrite=true,updates=0;
  const response=()=>({resposta_item_id:101,fornecedor_id:77,cotacao_fornecedor_id:77,fornecedor_nome:'Fornecedor QA',
   disponivel:true,preco:price,valor_total_cotado:150,quantidade_disponivel:50,saldo_disponivel_fornecedor:40});
  const workspace=()=>({solicitacao:{id:8,status:'PENDENTE',obra:{id:7,nome:'Obra QA'},
   fornecedores:[{id:77,status:'RESPONDIDO',token:'nao-persistir',fornecedor_compra_id:77,fornecedor:{id:77,nome:'Fornecedor QA'},
    condicao_pagamento:'Boleto',prazo_entrega_dias:5,respostas:[{id:101,item_tipo:'CADASTRADO',solicitacao_compra_item_id:5,
     preco:price,disponivel:true,quantidade_disponivel:50}]}],
   itens:[{id:5,insumo:{nome:'Areia QA'},quantidade:15,status_aprovacao:'APROVADO'}],itensManuais:[]},
   comparativo:{itens:[{id:5,item_tipo:'CADASTRADO',item_referencia_id:5,nome:'Areia QA',unidade:'m3',
    quantidade:15,saldo_disponivel:15,respostas:[response()]}]}});
  await page.route('**/api/compras/solicitacoes/8/workspace-cotacao',r=>r.fulfill(deniedRead
   ?{status:403,json:{error:'Cotacao QA indisponivel'}}:{json:workspace()}));
  await page.route('**/api/compras/solicitacoes/8/cotacoes/77/resposta-interna',async r=>{
   updates++;await new Promise(resolve=>setTimeout(resolve,200));
   return r.fulfill(deniedWrite?{status:403,json:{error:'Resposta QA negada'}}:{json:{ok:true}});
  });
  await page.goto(base+'/solicitacoes-compra/8/cotacao?comprasqa');
  const comment=page.getByRole('textbox',{name:'Comentário da cotação',exact:true});await comment.fill('Conferencia pendente!');
  const supplier=page.locator('.cotacao-fornecedor-rapido');await supplier.getByLabel('Nome do fornecedor',{exact:true}).fill('Rascunho fornecedor');
  const initial=await page.evaluate(()=>window.qa.activeId);
  const panel=page.locator('.cotacao-comparativo-panel');
  await panel.locator('.resizable-table-scroll').evaluateAll(els=>els.forEach(el=>{el.scrollLeft=el.scrollWidth}));
  await panel.getByRole('checkbox',{name:'Comprar de Fornecedor QA',exact:true}).check();
  await panel.getByRole('textbox',{name:/Quantidade comprada de Fornecedor QA/}).fill('0,5');
  await panel.getByRole('button',{name:'Mapa',exact:true}).click();
  await page.getByRole('button',{name:'Editar resposta internamente',exact:true}).first().click();
  const modal=page.getByRole('dialog',{name:'Editar resposta da cotacao'});
  const observation=modal.getByLabel('Observação geral',{exact:true});await observation.fill('Último caractere!');
  await modal.getByRole('textbox',{name:'Preço unitário de Areia QA',exact:true}).fill('12,00');
  const edited=await modal.getByRole('textbox',{name:'Preço unitário de Areia QA',exact:true}).inputValue();
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));await page.waitForURL('**/consulta/1');
  assert.equal(await page.getByRole('dialog').count(),0);
  await page.evaluate(id=>window.qa.activateTab(id),initial);await modal.waitFor();
  assert.equal(await observation.inputValue(),'Último caractere!');
  assert.equal(await modal.getByRole('textbox',{name:'Preço unitário de Areia QA',exact:true}).inputValue(),edited);
  await modal.getByRole('button',{name:'Salvar rascunho',exact:true}).evaluate(el=>{el.click();el.click()});
  await page.getByText('Resposta QA negada',{exact:true}).waitFor();assert.equal(updates,1);
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));await page.waitForURL('**/consulta/1');
  await page.evaluate(id=>window.qa.activateTab(id),initial);await modal.waitFor();assert.equal(updates,1);
  await modal.getByRole('button',{name:'Fechar',exact:true}).click();
  assert.equal(await comment.inputValue(),'Conferencia pendente!');
  assert.equal(await supplier.getByLabel('Nome do fornecedor',{exact:true}).inputValue(),'Rascunho fornecedor');
  await panel.getByText('Mapa de comparação',{exact:true}).waitFor();
  assert.equal(await panel.getByRole('textbox',{name:/Quantidade comprada de Fornecedor QA/}).inputValue(),'0,5');
  await page.getByRole('button',{name:'Editar resposta internamente',exact:true}).first().click();await observation.fill('Rascunho conflitante');
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));await page.waitForURL('**/consulta/1');price=20;
  await page.evaluate(id=>window.qa.activateTab(id),initial);
  await page.getByText(/A resposta mudou desde a edição/).waitFor();assert.equal(await modal.count(),0);
  await page.getByRole('button',{name:'Consultar rascunho',exact:true}).click();
  const recovery=page.getByRole('dialog',{name:'Rascunho não enviado da resposta'});
  assert((await recovery.getByRole('textbox',{name:'Campos do rascunho não enviado'}).inputValue()).includes('Rascunho conflitante'));
  assert(await recovery.getByRole('textbox').getAttribute('readonly')!==null);
  await page.keyboard.press('Escape');await recovery.waitFor({state:'hidden'});
  assert.equal(await panel.getByRole('textbox',{name:/Quantidade comprada de Fornecedor QA/}).inputValue(),'','Preco mudou: exige nova selecao');
  assert.equal(updates,1,'Conflito nao envia nem reaplica mutacao');
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));await page.waitForURL('**/consulta/1');deniedRead=true;
  await page.evaluate(id=>window.qa.activateTab(id),initial);await page.getByText('Cotacao QA indisponivel',{exact:true}).first().waitFor();
  assert.equal(await modal.count(),0);assert.equal(await comment.count(),0,'Negativa nao exibe dados anteriores');
  deniedRead=false;await page.evaluate(()=>window.qa.openTab('/consulta/1'));await page.waitForURL('**/consulta/1');
  await page.evaluate(id=>window.qa.activateTab(id),initial);await page.getByText(/A resposta mudou desde a edição/).waitFor();
  await page.getByRole('button',{name:'Descartar rascunho',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Descartar',exact:true}).click();
  await page.getByRole('button',{name:'Editar resposta internamente',exact:true}).first().click();
  deniedWrite=false;await modal.getByRole('button',{name:'Salvar rascunho',exact:true}).evaluate(el=>{el.click();el.click()});
  await page.getByText('Rascunho salvo e registrado na auditoria.',{exact:true}).waitFor();assert.equal(updates,2);
  await page.evaluate(()=>window.qaAuth.switch());await comment.waitFor();
  assert.equal(await comment.inputValue(),'','Troca de identidade nao restaura comentario');
  assert.equal(await supplier.getByLabel('Nome do fornecedor',{exact:true}).inputValue(),'');
  assert.equal(await modal.count(),0);assert.deepEqual(audit.errors,[]);await page.close();
  console.log('OK E3c cotacao '+width+'px: rascunho/modal/selecoes, consulta fresca, conflito, 403, envio unico e identidade.');
 }
 for(const width of [1366,390]){
  const page=await browser.newPage({viewport:{width,height:900}});const audit=await install(page);
  let changed=false,inactive=false,deniedPartner=false,deniedWorkspace=false,removedItem=false;
  const directReads=[];
  const supplier=()=>({id:77,nome:changed?'Fornecedor atual':'Fornecedor inicial',whatsapp:changed?'27999990002':'27999990001',ativo:!inactive});
  const partner=()=>({id:88,nome:changed?'Parceiro atual':'Parceiro inicial',telefone:changed?'27999990004':'27999990003',ativo:true});
  await page.route('**/api/compras/solicitacoes/8/workspace-cotacao',r=>r.fulfill(deniedWorkspace
   ?{status:403,json:{error:'Selecao QA indisponivel'}}:{json:{solicitacao:{id:8,status:'PENDENTE',fornecedores:[],
    itens:[{id:5,insumo:{nome:'Areia QA'},quantidade:15,status_aprovacao:'APROVADO'},
     ...(!removedItem?[{id:6,insumo:{nome:'Brita QA'},quantidade:10,status_aprovacao:'APROVADO'}]:[])],itensManuais:[]},comparativo:{itens:[]}}}));
  await page.route('**/api/compras/fornecedores?*',r=>r.fulfill({json:new URL(r.request().url()).searchParams.get('q')==='Sem resultado'?[]:[supplier()]}));
  await page.route('**/api/parceiros?*',r=>r.fulfill({json:new URL(r.request().url()).searchParams.get('q')==='Sem resultado'?[]:[partner()]}));
  await page.route('**/api/compras/fornecedores/77',r=>{directReads.push('fornecedor');return r.fulfill({json:supplier()})});
  await page.route('**/api/parceiros/88',r=>{directReads.push('parceiro');return r.fulfill(deniedPartner?{status:403,json:{error:'Parceiro sem acesso'}}:{json:partner()})});
  await page.goto(base+'/solicitacoes-compra/8/cotacao?comprasqa');
  const search=page.getByPlaceholder('Digite nome, CNPJ, email ou contato');await search.fill('inicial');
  const autocomplete=page.locator('.cotacao-fornecedores-autocomplete');
  await autocomplete.getByRole('button',{name:/Fornecedor inicial/}).click();
  await autocomplete.getByRole('button',{name:/Parceiro inicial/}).click();
  const selected=page.locator('.cotacao-fornecedores-selecionados');
  await selected.getByText('Parceiro inicial',{exact:true}).waitFor();
  await page.getByRole('checkbox',{name:'Enviar Brita QA para Fornecedor inicial',exact:true}).uncheck();
  await search.fill('Sem resultado');await autocomplete.getByText('Nenhum fornecedor encontrado para essa busca.',{exact:true}).waitFor();
  const initial=await page.evaluate(()=>window.qa.activeId);
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));await page.waitForURL('**/consulta/1');changed=true;
  await page.evaluate(id=>window.qa.activateTab(id),initial);
  await selected.getByText('Fornecedor atual',{exact:true}).waitFor();await selected.getByText('Parceiro atual',{exact:true}).waitFor();
  assert.equal(await search.inputValue(),'Sem resultado');
  await selected.getByText('27999990002',{exact:true}).waitFor();await selected.getByText('27999990004',{exact:true}).waitFor();
  assert.equal(await selected.getByText('Fornecedor inicial',{exact:true}).count(),0,'Nao restaurar rotulo antigo');
  assert.deepEqual(directReads.sort(),['fornecedor','parceiro']);
  assert.equal(await page.getByRole('checkbox',{name:'Enviar Brita QA para Fornecedor atual',exact:true}).isChecked(),false);
  assert.equal(await page.getByRole('checkbox',{name:'Enviar Areia QA para Fornecedor atual',exact:true}).isChecked(),true);
  assert.equal(await page.getByRole('checkbox',{name:'Enviar Brita QA para Parceiro atual',exact:true}).isChecked(),true);
  assert.deepEqual(audit.writes,[],'Reativacao nao gera links nem envia cotacao');
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));await page.waitForURL('**/consulta/1');removedItem=true;
  await page.evaluate(id=>window.qa.activateTab(id),initial);await selected.getByText('Fornecedor atual',{exact:true}).waitFor();
  assert.equal(await page.getByRole('checkbox',{name:/Enviar Brita QA/}).count(),0,'Item removido nao e restaurado');
  assert.equal(await page.getByRole('checkbox',{name:'Enviar Areia QA para Fornecedor atual',exact:true}).isChecked(),true);
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));await page.waitForURL('**/consulta/1');inactive=true;deniedPartner=true;
  await page.evaluate(id=>window.qa.activateTab(id),initial);
  await selected.getByText('Nenhum fornecedor selecionado.',{exact:true}).waitFor();
  assert.equal(await selected.getByRole('button',{name:'Remover',exact:true}).count(),0,'Inativo/403 nao reapresentam cadastro escolhido');
  assert.deepEqual(audit.writes,[]);
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));await page.waitForURL('**/consulta/1');deniedWorkspace=true;
  await page.evaluate(id=>window.qa.activateTab(id),initial);await page.getByText('Selecao QA indisponivel',{exact:true}).first().waitFor();
  assert.equal(await search.count(),0);assert.equal(await selected.count(),0);assert.deepEqual(audit.writes,[]);assert.deepEqual(audit.errors,[]);
  await page.close();console.log('OK E3c fornecedores '+width+'px: IDs fora do filtro, contatos atuais, itens parciais/removidos, inativo/403 e nenhum envio no retorno.');
 }
 }
 if(pedidoOnly || (!financeiroOnly&&!['--table-only','--correcoes-only','--compras-only','--wizard-only'].some(flag=>process.argv.includes(flag)))){
 for(const width of [1366,390]){
  const page=await browser.newPage({viewport:{width,height:900}});const audit=await install(page);
  let price=10,deniedRead=false,deniedWrite=true,updates=0,targetSaldo=20,remanejos=0,fretes=0;
  const data=()=>({id:8,status:'ABERTO',obra:{id:7,nome:'Obra QA'},fornecedor:{id:77,nome:'Fornecedor QA'},
    solicitacao_compra_id:8,itens:[{id:5,descricao:'Areia QA',quantidade_pedido:10,preco_unitario:price,
      quantidade_solicitada:10,quantidade_minima_item:1,unidade:'m3',observacoes:''}],fretes:[],
      candidatos_remanejamento:[{resposta_item_id:99,fornecedor_id:78,fornecedor_nome:'Destino QA',saldo_disponivel_fornecedor:targetSaldo,preco_unitario:5,unidade:'m3'}]});
  await page.route('**/api/compras/pedidos/8',r=>r.fulfill(deniedRead
    ?{status:403,json:{error:'Pedido QA indisponivel'}}:{json:data()}));
  await page.route('**/api/compras/pedidos/8/itens/5',async r=>{
    updates++;await new Promise(resolve=>setTimeout(resolve,150));
    return r.fulfill(deniedWrite?{status:403,json:{error:'Item QA negado'}}:{json:data()});
  });
  await page.route('**/api/compras/pedidos/8/itens/5/remanejar',async r=>{remanejos++;await new Promise(resolve=>setTimeout(resolve,150));return r.fulfill({json:data()})});
  await page.route('**/api/compras/pedidos/8/fretes',async r=>{fretes++;assert.equal(r.request().postDataJSON().valor_total,20);await new Promise(resolve=>setTimeout(resolve,150));return r.fulfill({json:data()})});
  await page.goto(base+'/pedidos-compra/8?comprasqa&pedidoqa');
  const initial=await page.evaluate(()=>window.qa.activeId);
  await page.getByRole('button',{name:'Editar',exact:true}).first().click();
  const modal=page.getByRole('dialog',{name:'Editar item do pedido'});
  await modal.getByLabel('Observações do item',{exact:true}).fill('Última tecla!');
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));await page.waitForURL('**/consulta/1');
  await page.evaluate(id=>window.qa.activateTab(id),initial);await modal.waitFor();
  assert.equal(await modal.getByLabel('Observações do item',{exact:true}).inputValue(),'Última tecla!');
  await modal.getByRole('button',{name:'Salvar ajustes',exact:true}).evaluate(el=>{el.click();el.click()});
  await page.getByText('Item QA negado',{exact:true}).waitFor();assert.equal(updates,1);
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));await page.waitForURL('**/consulta/1');price=20;
  await page.evaluate(id=>window.qa.activateTab(id),initial);await modal.waitFor();
  assert.equal(await modal.getByLabel('Observações do item',{exact:true}).inputValue(),'Última tecla!');
  assert(await modal.getByRole('button',{name:'Salvar ajustes',exact:true}).isDisabled());assert.equal(updates,1);
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));await page.waitForURL('**/consulta/1');deniedRead=true;
  await page.evaluate(id=>window.qa.activateTab(id),initial);await page.getByText('Pedido de compra não encontrado.',{exact:true}).waitFor();
  assert.equal(await modal.count(),0);deniedRead=false;
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));await page.waitForURL('**/consulta/1');
  await page.evaluate(id=>window.qa.activateTab(id),initial);await modal.waitFor();
  await modal.getByRole('button',{name:'Fechar',exact:true}).click();
  await page.getByRole('button',{name:'Descartar rascunhos conflitantes',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Descartar',exact:true}).click();
  await page.getByRole('button',{name:'Editar',exact:true}).first().click();await modal.waitFor();
  assert.equal(await modal.getByLabel('Observações do item',{exact:true}).inputValue(),'');
  await modal.getByLabel('Observações do item',{exact:true}).fill('Conferido');deniedWrite=false;
  await modal.getByRole('button',{name:'Salvar ajustes',exact:true}).evaluate(el=>{el.click();el.click()});
  await page.getByText('Item atualizado com auditoria registrada.',{exact:true}).waitFor();assert.equal(updates,2);
  await page.getByRole('button',{name:'Editar',exact:true}).first().click();await modal.waitFor();
  const destino=modal.getByLabel('Resposta de destino do remanejamento',{exact:true});
  const remanejo=modal.getByLabel('Quantidade a remanejar',{exact:true});
  await destino.selectOption('99');await remanejo.fill('3');await remanejo.blur();
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));await page.waitForURL('**/consulta/1');
  await page.evaluate(id=>window.qa.activateTab(id),initial);await modal.waitFor();
  assert.equal(await destino.inputValue(),'99');assert.equal(await remanejo.inputValue(),'3');assert.equal(remanejos,0);
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));await page.waitForURL('**/consulta/1');targetSaldo=4;
  await page.evaluate(id=>window.qa.activateTab(id),initial);await modal.waitFor();
  await modal.getByRole('alert').filter({hasText:'O saldo ou a resposta de destino mudou'}).waitFor();
  assert.ok(await modal.getByRole('button',{name:'Remanejar',exact:true}).isDisabled());assert.equal(remanejos,0);
  await modal.getByRole('button',{name:'Usar saldos atuais',exact:true}).click();
  await page.getByRole('dialog',{name:'Descartar remanejamento'}).getByRole('button',{name:'Usar saldos atuais',exact:true}).click();
  await destino.selectOption('99');await remanejo.fill('2');await remanejo.blur();
  await modal.getByRole('button',{name:'Remanejar',exact:true}).evaluate(el=>{el.click();el.click()});
  await page.getByText('Item remanejado para o fornecedor selecionado.',{exact:true}).waitFor();assert.equal(remanejos,1);
  await page.getByRole('button',{name:'Registrar frete',exact:true}).click();
  const freight=page.getByRole('dialog',{name:'Registrar frete do pedido'});
  const freteValor=freight.getByLabel('Valor total do frete',{exact:true});await freteValor.fill('20,00');
  const obsFrete=freight.getByPlaceholder('Ex.: frete embutido na negociação ou frete pago diretamente a transportador.');await obsFrete.fill('Frete final Z');
  const valorFreteDigitado=await freteValor.inputValue();
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));await page.waitForURL('**/consulta/1');
  await page.evaluate(id=>window.qa.activateTab(id),initial);await freight.waitFor();
  assert.equal(await freteValor.inputValue(),valorFreteDigitado);assert.equal(await obsFrete.inputValue(),'Frete final Z');assert.equal(fretes,0);
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));await page.waitForURL('**/consulta/1');price=30;
  await page.evaluate(id=>window.qa.activateTab(id),initial);await freight.getByRole('alert').waitFor();
  assert.ok(await freight.getByRole('button',{name:'Registrar frete',exact:true}).isDisabled());assert.equal(fretes,0);
  await freight.getByRole('button',{name:'Cancelar',exact:true}).click();
  await page.getByRole('button',{name:'Registrar frete',exact:true}).click();await freteValor.fill('20,00');
  await freight.getByRole('button',{name:'Registrar frete',exact:true}).evaluate(el=>{el.click();el.click()});
  await page.getByText('Frete embutido registrado para rateio de custo.',{exact:true}).waitFor();assert.equal(fretes,1);
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));await page.waitForURL('**/consulta/1');
  await page.evaluate(id=>window.qa.activateTab(id),initial);await page.getByRole('button',{name:'Registrar frete',exact:true}).waitFor();
  assert.equal(fretes,1);assert.equal(remanejos,1,'Retorno nao repete remanejamento ou frete');
  assert.deepEqual(audit.errors,[]);await page.close();console.log('OK pedido '+width+'px: campos/modal, consulta atual, conflito, 403 e envio unico.');
 }
 }
 if(!['--table-only','--correcoes-only','--compras-only','--wizard-only'].some(flag=>process.argv.includes(flag))){
 for(const width of [1366,390]){
  const page=await browser.newPage({viewport:{width,height:900}});const audit=await install(page);
  let saldo=100,deniedRead=false,deniedWrite=true,updates=0;
  const row=()=>({id:1,status:'PENDENTE',juros:5,multa:2,titulo:{id:4,codigo:'TIT-QA',status:'ABERTO',valor_saldo:saldo,forma_pagamento_id:4},conta_bancaria_id:7});
  await page.route('**/api/financeiro/fila-pagamentos?*',r=>r.fulfill(deniedRead?{status:403,json:{error:'Fila QA negada'}}:{json:{data:[row()],resumo:{PENDENTE:1}}}));
  await page.route('**/api/financeiro/fila-pagamentos/contas',r=>r.fulfill({json:[{id:7,nome:'Conta QA',ativo:true,empresa_id:1,empresa:{nome:'Empresa QA'}}]}));
  await page.route('**/api/financeiro/fila-pagamentos/instrumentos',r=>r.fulfill({json:{formas:[{id:4,nome:'Pix',ativo:true,codigo:'PIX'}],cartoes:[],cheques:[]}}));
  await page.route('**/api/financeiro/fila-pagamentos/baixar',async r=>{
    updates++;await new Promise(resolve=>setTimeout(resolve,150));
    assert.equal(r.request().postDataJSON().itens[0].juros,5);assert.equal(r.request().postDataJSON().itens[0].multa,2);
    return r.fulfill(deniedWrite?{status:403,json:{error:'Baixa QA negada'}}:{json:{baixados:1}});
  });
  await page.goto(base+'/financeiro/fila-pagamentos?financeiroqa&q=TIT-QA');
  const initial=await page.evaluate(()=>window.qa.activeId);
  const valor=page.getByLabel('Valor pago de TIT-QA',{exact:true});await valor.waitFor();
  await valor.fill('110');await page.getByLabel('Selecionar TIT-QA',{exact:true}).check();
  // Total divergente precisa de justificativa; o campo tambem pertence ao rascunho.
  await page.locator('[data-fila-id="1"][data-fila-campo="motivo"]').fill('Última tecla!');
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));await page.waitForURL('**/consulta/1');
  await page.evaluate(id=>window.qa.activateTab(id),initial);await valor.waitFor();
  assert.equal(await valor.inputValue(),'110');assert(await page.getByLabel('Selecionar TIT-QA',{exact:true}).isChecked());
  assert.equal(await page.locator('[data-fila-id="1"][data-fila-campo="motivo"]').inputValue(),'Última tecla!');
  assert.equal(updates,0,'Restauracao financeira nao envia baixa');
  await page.getByRole('button',{name:'Registrar baixa',exact:true}).evaluate(el=>{el.click();el.click()});
  await page.getByRole('dialog').getByRole('button',{name:'Registrar baixa',exact:true}).evaluate(el=>{el.click();el.click()});
  await page.getByText('Baixa QA negada',{exact:true}).waitFor();assert.equal(updates,1);
  await page.getByRole('dialog').getByRole('button',{name:'Voltar e corrigir',exact:true}).click();
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));await page.waitForURL('**/consulta/1');saldo=90;
  await page.evaluate(id=>window.qa.activateTab(id),initial);await valor.waitFor();
  assert.equal(await valor.inputValue(),'110');await page.getByText(/Saldo ou status alterado/).waitFor();
  await page.getByRole('button',{name:'Registrar baixa',exact:true}).click();
  await page.getByText('O saldo ou status mudou desde a edição.',{exact:true}).waitFor();assert.equal(updates,1);
  await page.getByRole('dialog').getByRole('button',{name:'Voltar e corrigir',exact:true}).click();
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));await page.waitForURL('**/consulta/1');deniedRead=true;
  await page.evaluate(id=>window.qa.activateTab(id),initial);await page.getByText('Fila QA negada',{exact:true}).waitFor();
  assert.equal(await valor.count(),0,'403 nao restaura dados de titulo');deniedRead=false;
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));await page.waitForURL('**/consulta/1');
  await page.evaluate(id=>window.qa.activateTab(id),initial);await valor.waitFor();
  await page.getByRole('button',{name:'Descartar rascunhos conflitantes',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Descartar',exact:true}).click();
  await page.waitForFunction(()=>Number(document.querySelector('[data-fila-id="1"][data-fila-campo="valor_pago"]')?.value)===97);
  deniedWrite=false;await page.getByRole('button',{name:'Registrar baixa',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Registrar baixa',exact:true}).evaluate(el=>{el.click();el.click()});
  await page.getByText(/1 baixa\(s\) registrada\(s\)/).waitFor();assert.equal(updates,2);
  assert.deepEqual(audit.errors,[]);await page.close();console.log('OK fila '+width+'px: rascunho/selecoes, 403, conflito, juros/multa, envio unico e sem replay.');
 }
 }
 if(!['--table-only','--correcoes-only','--compras-only','--wizard-only'].some(flag=>process.argv.includes(flag))){
 for(const width of [1366,390]){
  const page=await browser.newPage({viewport:{width,height:900}});const audit=await install(page);
  await page.goto(base+'/financeiro/titulos/novo?financeiroqa&tipo=PAGAR');
  const initial=await page.evaluate(()=>window.qa.activeId);
  const descricao=page.getByLabel('Descrição',{exact:true});await descricao.waitFor();
  await descricao.fill('Título digitado até a última tecla');
  await page.getByLabel('Número do documento',{exact:true}).fill('NF-QA-123');
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));await page.waitForURL('**/consulta/1');
  await page.evaluate(id=>window.qa.activateTab(id),initial);await descricao.waitFor();
  assert.equal(await descricao.inputValue(),'Título digitado até a última tecla');
  assert.equal(await page.getByLabel('Número do documento',{exact:true}).inputValue(),'NF-QA-123');
  await page.locator('select').filter({has:page.locator('option[value="RECEBER"]')}).first().selectOption('RECEBER');
  assert.equal(await descricao.inputValue(),'Título digitado até a última tecla');
  assert.equal(audit.writes.length,0,'Voltar nao cria titulo nem favorecido');
  await page.evaluate(()=>window.qaAuth.switch());await descricao.waitFor();
  assert.equal(await descricao.inputValue(),'','Identidade diferente nao herda formulario');
  assert.deepEqual(audit.errors,[]);await page.close();console.log('OK titulo novo '+width+'px: campos, tipo, retorno sem escrita e identidade.');

  const listPage=await browser.newPage({viewport:{width,height:900}});const listAudit=await install(listPage);
  let titleSaldo=100,listDenied=false;
  await listPage.route('**/api/financeiro/titulos?*',r=>r.fulfill(listDenied?{status:403,json:{error:'Títulos QA negados'}}:{json:{data:[{
    id:4,codigo:'TIT-QA-LISTA',tipo:'PAGAR',status:'ABERTO',valor_original:100,valor_saldo:titleSaldo,juros:0,multa:0,empresa_id:1,parceiro_id:7,
    descricao:'Título da lista QA',data_vencimento:'2026-10-20',parceiro:{nome:'Credor QA'},obra:{id:7,nome:'Obra QA'}
  }],pagination:{page:1,limit:25,total:1,total_pages:1}}}));
  await listPage.goto(base+'/financeiro/contas-a-pagar?financeiroqa');
  const query=listPage.getByLabel('Busca rápida',{exact:true});await query.fill('NF-QA');
  await listPage.getByRole('button',{name:'Consultar',exact:true}).click();
  await listPage.getByText('TIT-QA-LISTA',{exact:true}).first().waitFor();
  await listPage.getByLabel(width < 600 ? 'Selecionar' : 'Selecionar todos',{exact:true}).last().check();
  await listPage.getByRole('button',{name:/^Baixar selecionados/}).click();
  const baixa=listPage.getByRole('dialog',{name:'Baixa em massa',exact:true});
  const obs=baixa.getByPlaceholder('Ex.: Baixa em massa conforme extrato bancário.',{exact:true});await obs.fill('Pagamento em conferência');
  const listTab=await listPage.evaluate(()=>window.qa.activeId);
  await listPage.evaluate(()=>window.qa.openTab('/consulta/1'));await listPage.waitForURL('**/consulta/1');
  await listPage.evaluate(id=>window.qa.activateTab(id),listTab);await obs.waitFor();
  assert.equal(await query.inputValue(),'NF-QA');assert.equal(await obs.inputValue(),'Pagamento em conferência');
  assert.equal(listAudit.writes.filter(w=>w.p.startsWith('/financeiro/')).length,0,'Nenhuma operacao financeira no retorno; salvar preferencia de consulta conserva fluxo original');
  await listPage.evaluate(()=>window.qa.openTab('/consulta/1'));await listPage.waitForURL('**/consulta/1');titleSaldo=95;
  await listPage.evaluate(id=>window.qa.activateTab(id),listTab);await baixa.getByRole('alert').waitFor();
  assert.equal(await obs.inputValue(),'Pagamento em conferência');
  assert.ok(await baixa.getByRole('button',{name:'Registrar baixa',exact:true}).isDisabled());
  await listPage.evaluate(()=>window.qa.openTab('/consulta/1'));await listPage.waitForURL('**/consulta/1');listDenied=true;
  await listPage.evaluate(id=>window.qa.activateTab(id),listTab);await listPage.getByText('Títulos QA negados',{exact:true}).waitFor();
  assert.equal(await baixa.count(),0);assert.equal(await listPage.getByText('TIT-QA-LISTA',{exact:true}).count(),0);
  assert.deepEqual(listAudit.errors,[]);await listPage.close();console.log('OK titulos '+width+'px: filtros/selecoes/baixa em massa, saldo atual, conflito e 403 sem replay.');

  const negoPage=await browser.newPage({viewport:{width,height:900}});const negoAudit=await install(negoPage);
  let negoSaldo=100,negoDenied=false;
  await negoPage.route('**/api/financeiro/titulos?*',r=>r.fulfill(negoDenied?{status:403,json:{error:'Negociação QA negada'}}:{json:{data:[{
    id:4,codigo:'TIT-QA-NEGOCIACAO',tipo:'PAGAR',status:'ABERTO',valor_original:100,valor_saldo:negoSaldo,valor_baixado:0,empresa_id:1,parceiro_id:7,
    descricao:'Título negociável QA',data_vencimento:'2026-10-20',parceiro:{nome:'Credor QA'},obra:{id:7,nome:'Obra QA'}
  }],pagination:{page:1,limit:25,total:1,total_pages:1}}}));
  await negoPage.goto(base+'/financeiro/contas-a-pagar?financeiroqa');await negoPage.getByRole('button',{name:'Consultar',exact:true}).click();
  await negoPage.getByText('TIT-QA-NEGOCIACAO',{exact:true}).first().waitFor();await negoPage.getByRole('button',{name:'Parcelar',exact:true}).first().click();
  const negoModal=negoPage.getByRole('dialog',{name:'Parcelar título',exact:true}), negoInput=negoModal.getByLabel('Motivo da negociação',{exact:true});
  await negoInput.fill('Negociação preservada Z');const negoTab=await negoPage.evaluate(()=>window.qa.activeId);
  await negoPage.evaluate(()=>window.qa.openTab('/consulta/1'));await negoPage.waitForURL('**/consulta/1');await negoPage.evaluate(id=>window.qa.activateTab(id),negoTab);
  await negoInput.waitFor();assert.equal(await negoInput.inputValue(),'Negociação preservada Z');assert.equal(negoAudit.writes.filter(w=>w.p.startsWith('/financeiro/')).length,0);
  await negoPage.evaluate(()=>window.qa.openTab('/consulta/1'));await negoPage.waitForURL('**/consulta/1');negoSaldo=95;await negoPage.evaluate(id=>window.qa.activateTab(id),negoTab);
  await negoModal.getByRole('alert').filter({hasText:'Os saldos ou dados'}).waitFor();assert.ok(await negoInput.isDisabled());
  await negoPage.evaluate(()=>window.qa.openTab('/consulta/1'));await negoPage.waitForURL('**/consulta/1');negoDenied=true;await negoPage.evaluate(id=>window.qa.activateTab(id),negoTab);
  await negoPage.getByText('Negociação QA negada',{exact:true}).waitFor();assert.equal(await negoModal.count(),0);assert.equal(await negoPage.getByText('TIT-QA-NEGOCIACAO',{exact:true}).count(),0);
  assert.deepEqual(negoAudit.errors,[]);await negoPage.close();console.log('OK negociação lista real '+width+'px: IDs/GET atuais, modal/campos, conflito e 403 sem replay.');

  const fontesPage=await browser.newPage({viewport:{width,height:900}});const fontesAudit=await install(fontesPage);
  let fontesSaldo=100,fontesDenied=false,fontesStatus='ABERTO';
  await fontesPage.route('**/api/financeiro/titulos?*',r=>r.fulfill(fontesDenied?{status:403,json:{error:'Fontes QA negadas'}}:{json:{data:[{
    id:4,codigo:'TIT-QA-FONTES',tipo:'PAGAR',status:fontesStatus,valor_original:100,valor_saldo:fontesSaldo,valor_baixado:0,empresa_id:1,parceiro_id:7,
    descricao:'Título de múltiplas fontes QA',data_vencimento:'2026-10-20',parceiro:{nome:'Credor QA'},obra:{id:7,nome:'Obra QA'}
  }],pagination:{page:1,limit:25,total:1,total_pages:1}}}));
  await fontesPage.goto(base+'/financeiro/contas-a-pagar?financeiroqa');await fontesPage.getByRole('button',{name:'Consultar',exact:true}).click();
  await fontesPage.getByText('TIT-QA-FONTES',{exact:true}).first().waitFor();await fontesPage.getByLabel(width<600?'Selecionar':'Selecionar todos',{exact:true}).last().check();
  await fontesPage.getByRole('button',{name:/^Baixa com múltiplas fontes/}).click();
  const fontesModal=fontesPage.getByRole('dialog',{name:'Baixa com múltiplas fontes',exact:true}), fontesObs=fontesModal.getByLabel('Observações do grupo',{exact:true});
  await fontesObs.fill('Fontes digitadas Z');await fontesModal.getByLabel('Valor da fonte *',{exact:true}).fill('100');const fontesTab=await fontesPage.evaluate(()=>window.qa.activeId);
  await fontesPage.evaluate(()=>window.qa.openTab('/consulta/1'));await fontesPage.waitForURL('**/consulta/1');await fontesPage.evaluate(id=>window.qa.activateTab(id),fontesTab);
  await fontesObs.waitFor();assert.equal(await fontesObs.inputValue(),'Fontes digitadas Z');assert.equal(await fontesModal.getByLabel('Valor da fonte *',{exact:true}).inputValue(),'100');
  assert.equal(fontesAudit.writes.filter(w=>w.p.startsWith('/financeiro/')).length,0);
  await fontesPage.evaluate(()=>window.qa.openTab('/consulta/1'));await fontesPage.waitForURL('**/consulta/1');fontesSaldo=95;await fontesPage.evaluate(id=>window.qa.activateTab(id),fontesTab);
  await fontesModal.getByRole('alert').filter({hasText:'Os saldos ou instrumentos mudaram'}).waitFor();assert.ok(await fontesModal.getByRole('button',{name:'Validar e revisar',exact:true}).isDisabled());
  await fontesPage.evaluate(()=>window.qa.openTab('/consulta/1'));await fontesPage.waitForURL('**/consulta/1');fontesStatus='QUITADO';fontesSaldo=0;await fontesPage.evaluate(id=>window.qa.activateTab(id),fontesTab);
  await fontesModal.getByRole('alert').filter({hasText:'não estão disponíveis para baixa'}).waitFor();assert.ok(await fontesModal.getByRole('button',{name:'Validar e revisar',exact:true}).isDisabled());
  await fontesPage.evaluate(()=>window.qa.openTab('/consulta/1'));await fontesPage.waitForURL('**/consulta/1');fontesDenied=true;await fontesPage.evaluate(id=>window.qa.activateTab(id),fontesTab);
  await fontesPage.getByText('Fontes QA negadas',{exact:true}).waitFor();assert.equal(await fontesModal.count(),0);assert.equal(await fontesPage.getByText('TIT-QA-FONTES',{exact:true}).count(),0);
  assert.deepEqual(fontesAudit.errors,[]);await fontesPage.close();console.log('OK fontes lista real '+width+'px: IDs/GET atuais, modal/inputs, saldo/status e 403 sem replay.');

  const authPage=await browser.newPage({viewport:{width,height:900}});const authAudit=await install(authPage);
  let denied=false,processed=false;
  const lot=id=>({id,codigo:'LOT-QA-'+id,status:'PENDENTE',valor_total:100,quantidade_itens:1,dossie_hash:'QA',itens:[{
    id:id*10,status:processed&&id===2?'ENFILEIRADO':'PENDENTE',valor_snapshot:100,snapshot_json:{codigo:'TIT-QA-'+id},documentos:[],titulo:{status:'ABERTO',valor_baixado:0}
  }]});
  await authPage.route('**/api/financeiro/autorizacoes-pagamento',r=>r.fulfill(denied?{status:403,json:{error:'Lotes QA negados'}}:{json:{data:[lot(1),lot(2)]}}));
  await authPage.goto(base+'/financeiro/autorizacoes-pagamento?financeiroqa');
  await authPage.locator('.pa-lot').nth(1).click();
  const reason=authPage.getByLabel('Motivo para rejeição',{exact:true});await reason.fill('Conferir lote dois');
  await authPage.locator('.pa-lot').first().click();assert.equal(await reason.inputValue(),'');
  await reason.fill('Conferir lote um');await authPage.locator('.pa-lot').nth(1).click();assert.equal(await reason.inputValue(),'Conferir lote dois');
  const authTab=await authPage.evaluate(()=>window.qa.activeId);
  await authPage.evaluate(()=>window.qa.openTab('/consulta/1'));await authPage.waitForURL('**/consulta/1');
  await authPage.evaluate(id=>window.qa.activateTab(id),authTab);await reason.waitFor();
  assert.equal(await reason.inputValue(),'Conferir lote dois');assert.equal(authAudit.writes.length,0);
  await authPage.evaluate(()=>window.qa.openTab('/consulta/1'));await authPage.waitForURL('**/consulta/1');processed=true;
  await authPage.evaluate(id=>window.qa.activateTab(id),authTab);await authPage.locator('.pa-lot').nth(1).waitFor();
  assert.equal(await authPage.getByRole('button',{name:'Rejeitar',exact:true}).count(),0,'Item processado nao recupera decisao pendente');
  await authPage.evaluate(()=>window.qa.openTab('/consulta/1'));await authPage.waitForURL('**/consulta/1');denied=true;
  await authPage.evaluate(id=>window.qa.activateTab(id),authTab);await authPage.getByText('Lotes QA negados',{exact:true}).waitFor();
  assert.equal(await authPage.locator('.pa-lot').count(),0);assert.deepEqual(authAudit.errors,[]);await authPage.close();
  console.log('OK autorizacoes '+width+'px: motivo por lote, consulta atual, processados e 403, sem decisao automatica.');
 }
 }
 if(provisaoOnly || (!financeiroOnly&&!['--table-only','--correcoes-only','--compras-only','--wizard-only','--cotacao-only','--pedido-only'].some(flag=>process.argv.includes(flag)))){
 for(const width of [1366,390]){
  const page=await browser.newPage({viewport:{width,height:900}});const audit=await install(page);
  let denied=false,posts=0,release;
  await page.route('**/api/provisoes-financeiras/contexto',r=>r.fulfill(denied?{status:403,json:{error:'Provisao QA sem acesso'}}:
   {json:{permissoes:{pode_criar:true},obras_criacao:[{id:7,codigo:'07',nome:'Obra QA'}]}}));
  await page.route('**/api/provisoes-financeiras',r=>new Promise(resolve=>{
   posts++;assert.equal(r.request().postDataJSON().descricao,'Provisão última Z');
   release=()=>r.fulfill({json:{id:8}}).then(resolve);
  }));
  await page.goto(base+'/provisoes-financeiras/nova?provisaoqa');
  const initial=await page.evaluate(()=>window.qa.activeId);
  const description=page.getByLabel('Descrição',{exact:true});await description.fill('Provisão última Z');
  await page.getByLabel('Obra',{exact:true}).selectOption('7');
  await page.getByLabel('Data prevista de desembolso',{exact:true}).fill('12/1');
  await page.getByLabel('Item macro',{exact:true}).fill('Categoria livre');
  await page.getByLabel('Valor previsto',{exact:true}).fill('12345');
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));await page.waitForURL('**/consulta/1');
  await page.evaluate(id=>window.qa.activateTab(id),initial);await description.waitFor();assert.equal(await description.inputValue(),'Provisão última Z');assert.equal(posts,0);
  assert.equal(await page.getByLabel('Data prevista de desembolso',{exact:true}).inputValue(),'12/1');
  await page.locator('form').evaluate(f=>f.requestSubmit());assert.equal(posts,0);
  await page.getByLabel('Data prevista de desembolso',{exact:true}).fill('31/12/2026');
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));await page.waitForURL('**/consulta/1');denied=true;
  await page.evaluate(id=>window.qa.activateTab(id),initial);await page.getByText('Provisao QA sem acesso',{exact:true}).waitFor();assert.equal(await description.count(),0);
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));await page.waitForURL('**/consulta/1');denied=false;
  await page.evaluate(id=>window.qa.activateTab(id),initial);await description.waitFor();assert.equal(await description.inputValue(),'Provisão última Z');
  const request=page.waitForRequest(r=>new URL(r.url()).pathname==='/api/provisoes-financeiras'&&r.method()==='POST');
  await page.locator('form').evaluate(el=>{el.requestSubmit();el.requestSubmit()});await request;assert.equal(posts,1);
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(()=>window.qa.activeId),initial,'Provisao ocupada nao troca de aba');
  assert.ok(await page.getByRole('button',{name:'Cancelar',exact:true}).isDisabled());
  release();await page.getByText('Provisão criada QA',{exact:true}).waitFor();
  await page.evaluate(()=>window.qa.back('/provisoes-financeiras/nova?provisaoqa'));await description.waitFor();
  assert.equal(await description.inputValue(),'');assert.equal(posts,1);assert.deepEqual(audit.errors,[]);await page.close();
  console.log('OK provisao Layout real '+width+'px: opt-in, ultima tecla, 403, mutex, bloqueio de aba ocupada e sucesso limpo sem replay.');
 }
 for(const width of [1366,390]){
  const page=await browser.newPage({viewport:{width,height:900}});const audit=await install(page);
  let denied=false,posts=0,release;const reads=[];
  let record={id:17,codigo:'PROV-LAYOUT-QA',obra_id:7,obra:{id:7,nome:'Obra QA'},categoriaMacro:{id:1,nome:'Estrutura'},data_prevista_desembolso:'2026-12-31',valor_previsto:'150.00',descricao:'Provisão atual QA',fornecedor_texto:'Credor QA',prioridade:'alta',status:'previsto',anexos:[],historicos:[]};
  await page.route('**/api/provisoes-financeiras/contexto',r=>r.fulfill(denied?{status:403,json:{error:'Contexto da provisao negado QA'}}:
   {json:{permissoes:{pode_criar:true,pode_editar:true},obras_acesso:[record.obra],obras_criacao:[record.obra]}}));
  await page.route('**/api/provisoes-financeiras?*',r=>{
   const params=Object.fromEntries(new URL(r.request().url()).searchParams);reads.push(params);
   return r.fulfill({json:{items:[record],meta:{page:Number(params.page),limit:25,total:50,pages:2},resumo:{total_registros_filtrados:50,valor_total_filtrado:7500}}});
  });
  await page.route('**/api/provisoes-financeiras/17',r=>{
   if(r.request().method()==='GET')return r.fulfill({json:record});
   assert.equal(r.request().method(),'PUT');posts++;const payload=r.request().postDataJSON();assert.equal(payload.descricao,'Edição integrada última Z');
   return new Promise(resolve=>{release=()=>{record={...record,...payload};return r.fulfill({json:record}).then(resolve)}});
  });
  await page.goto(base+'/provisoes-financeiras?provisaolistqa');const initial=await page.evaluate(()=>window.qa.activeId);
  const search=page.getByPlaceholder('Buscar código, descrição ou credor',{exact:true});await search.fill('Filtro final Z');
  await page.getByRole('button',{name:'Próxima',exact:true}).click();await page.getByRole('navigation',{name:'Paginação',exact:true}).getByText('Página 2 de 2',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Detalhes',exact:true}).click();await page.waitForURL('**/provisoes-financeiras/17');await page.getByRole('heading',{name:'PROV-LAYOUT-QA',exact:true}).waitFor();
  const detail=await page.evaluate(()=>window.qa.activeId);assert.notEqual(detail,initial);assert.equal(await page.evaluate(()=>window.qa.tabs.find(t=>t.id===window.qa.activeId).title),'PROV-LAYOUT-QA');
  await page.getByRole('button',{name:'Editar registro',exact:true}).click();const description=page.getByLabel('Descrição',{exact:true});await description.fill('Edição integrada última Z');
  const comment=page.getByLabel('Novo comentário',{exact:true});await comment.fill('Comentário ainda em trabalho Z');
  await page.evaluate(id=>window.qa.activateTab(id),initial);await search.waitFor();assert.equal(await search.inputValue(),'Filtro final Z');
  await page.getByRole('navigation',{name:'Paginação',exact:true}).getByText('Página 2 de 2',{exact:true}).waitFor();assert.equal(reads.at(-1).page,'2');
  await page.evaluate(id=>window.qa.activateTab(id),detail);await description.waitFor();assert.equal(await description.inputValue(),'Edição integrada última Z');assert.equal(await comment.inputValue(),'Comentário ainda em trabalho Z');assert.equal(posts,0);
  assert.ok(await page.getByRole('button',{name:'Salvar alteracoes',exact:true}).isEnabled(),await page.locator('body').innerText());
  assert.equal(await page.getByLabel('Item macro',{exact:true}).inputValue(),'Estrutura');
  assert.match(await page.getByLabel('Valor previsto',{exact:true}).inputValue(),/150,00/);
  assert.equal(await page.getByLabel('Data prevista',{exact:true}).inputValue(),'31/12/2026');
  const editForm=page.locator('[data-workspace-page]:not([hidden]) form').filter({has:page.locator('textarea[aria-label="Descrição"]')});
  assert.deepEqual(await editForm.evaluate(el=>Array.from(el.elements).filter(x=>x.willValidate&&!x.validity.valid).map(x=>({name:x.name,type:x.type,message:x.validationMessage}))),[]);
  const request=page.waitForRequest(r=>new URL(r.url()).pathname==='/api/provisoes-financeiras/17'&&r.method()==='PUT');
  const submitted=editForm.evaluate(el=>{el.requestSubmit();el.requestSubmit()});
  await Promise.all([submitted,request]).catch(async error=>{console.error(await page.locator('body').innerText());console.error(audit.errors);throw error});assert.equal(posts,1);
  await page.evaluate(id=>window.qa.activateTab(id),initial);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await page.evaluate(()=>window.qa.activeId),detail);
  assert.ok(await page.getByRole('button',{name:'Fechar edicao',exact:true}).isDisabled());release();await page.getByRole('button',{name:'Editar registro',exact:true}).waitFor();
  await page.evaluate(id=>window.qa.activateTab(id),initial);await search.waitFor();denied=true;
  await page.evaluate(id=>window.qa.activateTab(id),detail);await page.getByText('Contexto da provisao negado QA',{exact:true}).first().waitFor();assert.equal(await description.count(),0);assert.equal(await comment.count(),0);assert.equal(await page.getByRole('heading',{name:'PROV-LAYOUT-QA',exact:true}).count(),0);
  await page.waitForFunction(()=>window.qa.tabs.find(t=>t.id===window.qa.activeId).title==='Provisão');
  assert.equal(posts,1);assert.deepEqual(audit.errors,[]);await page.close();
  console.log('OK lista/detalhe provisao Layout real '+width+'px: abas independentes, filtro/pagina, inputs, GET atual, mutex/busy e negativa.');
 }
 }
 if(provisaoOnly || (!financeiroOnly&&!['--table-only','--correcoes-only','--compras-only','--wizard-only','--cotacao-only','--pedido-only'].some(flag=>process.argv.includes(flag)))){
 for(const width of [1366,390]){
  const page=await browser.newPage({viewport:{width,height:900}});const audit=await install(page);
  const queries=[];let denied=false;
  const record={id:17,codigo:'PROV-CONSULTAS-QA',obra_id:7,obra:{id:7,codigo:'07',nome:'Obra QA'},data_prevista_desembolso:'2026-12-31',valor_previsto:'150.00',descricao:'Provisao consulta QA',prioridade:'alta',status:'previsto',anexos:[],historicos:[]};
  await page.route('**/api/provisoes-financeiras/contexto',r=>r.fulfill(denied?{status:403,json:{error:'Contexto consultas negado QA'}}:{json:{permissoes:{pode_editar:true,pode_dashboard:true},obras_acesso:[record.obra]}}));
  await page.route('**/api/provisoes-financeiras/categorias*',r=>{assert.equal(r.request().method(),'GET');return r.fulfill(denied?{status:403,json:{error:'Categorias consultas negadas QA'}}:{json:[{id:1,nome:'Categoria consultas QA',descricao:'Base atual',ativo:true,ordem_exibicao:1}]})});
  await page.route('**/api/provisoes-financeiras/dashboard/resumo*',r=>{queries.push(Object.fromEntries(new URL(r.request().url()).searchParams));return r.fulfill({json:{cards:{total_periodo:150,quantidade_abertas:1},alertas:{vencidas_nao_tratadas:{itens:[record],quantidade:1},itens_criticos_proximos:{itens:[]},obras_concentracao_alta:[]},graficos:{por_mes:[],por_obra:[],por_categoria:[],curva_semanal:[],pipeline_status:[]}}})});
  await page.route('**/api/provisoes-financeiras?*',r=>r.fulfill({json:{items:[record],meta:{page:1,total:1,pages:1}}}));
  await page.route('**/api/provisoes-financeiras/17',r=>r.fulfill({json:record}));
  await page.goto(base+'/provisoes-financeiras/categorias?provisaoconsultasqa');
  const catTab=await page.evaluate(()=>window.qa.activeId);const newName=page.getByLabel('Nome da nova categoria macro',{exact:true});
  await newName.fill('Nova categoria em trabalho Z');await page.getByRole('button',{name:'Editar',exact:true}).first().click();await page.getByLabel('Nome da categoria macro',{exact:true}).fill('Edicao categoria Z');
  await page.evaluate(()=>window.qa.openTab('/provisoes-financeiras/dashboard'));await page.getByRole('button',{name:'Detalhes',exact:true}).waitFor();
  const dashTab=await page.evaluate(()=>window.qa.activeId);const initial=()=>page.getByLabel('Data inicial',{exact:true});
  await initial().fill('12/1');await page.getByLabel('Data final',{exact:true}).fill('31/12/2026');
  await page.getByRole('button',{name:'Detalhes',exact:true}).waitFor();
  await page.evaluate(()=>window.qa.openTab('/provisoes-financeiras/relatorios/operacional'));await page.getByRole('link',{name:'PROV-CONSULTAS-QA',exact:true}).waitFor();
  const reportTab=await page.evaluate(()=>window.qa.activeId);await initial().fill('15/1');await page.getByLabel('Data final',{exact:true}).fill('30/12/2026');const appliedCount=queries.length;
  await page.evaluate(id=>window.qa.activateTab(id),catTab);await newName.waitFor();assert.equal(await newName.inputValue(),'Nova categoria em trabalho Z');assert.equal(await page.getByLabel('Nome da categoria macro',{exact:true}).inputValue(),'Edicao categoria Z');
  await page.evaluate(id=>window.qa.activateTab(id),dashTab);await page.getByRole('button',{name:'Detalhes',exact:true}).waitFor();assert.equal(await initial().inputValue(),'12/1');assert.equal(await page.getByLabel('Data final',{exact:true}).inputValue(),'31/12/2026');assert.equal(queries.at(-1).data_final,'2026-12-31');
  await page.evaluate(id=>window.qa.activateTab(id),reportTab);await page.getByRole('link',{name:'PROV-CONSULTAS-QA',exact:true}).waitFor();assert.equal(await initial().inputValue(),'15/1');assert.equal(await page.getByLabel('Data final',{exact:true}).inputValue(),'30/12/2026');assert.equal(queries.at(-1).data_final,undefined,'Retorno nao aplica filtro pesado ainda digitado');assert.equal(queries.length,appliedCount+2);
  const count=queries.length;await page.getByRole('button',{name:'Atualizar relatorio',exact:true}).click();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.equal(queries.length,count,'Data parcial bloqueia aplicar');
  await initial().fill('01/01/2026');await page.getByRole('button',{name:'Atualizar relatorio',exact:true}).evaluate(b=>{b.click();b.click()});await page.getByRole('link',{name:'PROV-CONSULTAS-QA',exact:true}).waitFor();assert.equal(queries.length,count+1);assert.equal(queries.at(-1).data_final,'2026-12-30');
  await page.getByRole('link',{name:'PROV-CONSULTAS-QA',exact:true}).click();await page.getByRole('heading',{name:'PROV-CONSULTAS-QA',exact:true}).waitFor();assert.notEqual(await page.evaluate(()=>window.qa.activeId),reportTab);await page.waitForFunction(()=>window.qa.tabs.find(t=>t.id===window.qa.activeId).title==='PROV-CONSULTAS-QA');
  await page.evaluate(id=>window.qa.activateTab(id),reportTab);await initial().waitFor();assert.equal(await initial().inputValue(),'01/01/2026');
  denied=true;await page.evaluate(id=>window.qa.activateTab(id),catTab);await page.getByText('Categorias consultas negadas QA',{exact:true}).first().waitFor();assert.equal(await newName.count(),0);
  await page.evaluate(id=>window.qa.activateTab(id),dashTab);await page.getByText('Contexto consultas negado QA',{exact:true}).first().waitFor();assert.equal(await initial().count(),0);assert.equal(await page.locator('[data-workspace-page]:not([hidden])').getByText('PROV-CONSULTAS-QA',{exact:true}).count(),0);
  await page.evaluate(id=>window.qa.activateTab(id),reportTab);await page.getByText('Contexto consultas negado QA',{exact:true}).first().waitFor();assert.equal(await initial().count(),0);
  assert.deepEqual(audit.errors,[]);assert.deepEqual(audit.writes,[]);
  assert.equal(await page.evaluate(()=>JSON.stringify([...Object.entries(sessionStorage),...Object.entries(localStorage)]).includes('Nova categoria em trabalho Z')),false);
  await page.close();console.log('OK categorias/dashboard/relatorio Layout real '+width+'px: opt-ins, drafts/data parcial, filtro aplicado separado, nova aba/codigo e negativa; sem escrita/storage de rascunho.');
 }
 }
 // Comparacao controlada do mesmo formulario e DOM. Nao benchmark de producao.
 for(const legacy of[true,false,false,true]){
  const page=await browser.newPage({viewport:{width:1366,height:900}});const audit=await install(page);
  await page.goto(base+'/nova-solicitacao?core'+(legacy?'&legacy':''));
  await page.getByLabel('Rascunho').fill('valor');
  const initial=await page.evaluate(()=>window.qa.tabs[0].id);
  await page.evaluate(()=>window.qa.openTab('/consulta/1'));
  await page.waitForURL('**/consulta/1');
  const aux=await page.evaluate(()=>window.qa.activeId);
  const times=[];
  for(let i=0;i<40;i++) times.push(await page.evaluate(id=>new Promise(resolve=>{const t=performance.now();window.qa.activateTab(id);requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(performance.now()-t)))}),i%2?aux:initial));
  const cdp=await page.context().newCDPSession(page);await cdp.send('HeapProfiler.collectGarbage');
  const baseline=(await cdp.send('Runtime.getHeapUsage')).usedSize;
  for(let i=0;i<30;i++){
    const previous=await page.evaluate(()=>({id:window.qa.activeId,route:location.pathname+location.search+location.hash}));
    await page.evaluate(i=>window.qa.openTab('/consulta/c'+i),i);
    // O controlador legado publica activeId no effect, nao no mesmo tick.
    // Aguardar a rota evita fechar a aba anterior por engano no ensaio.
    await page.waitForURL('**/consulta/c'+i);
    const id=await page.evaluate(()=>window.qa.activeId);assert.notEqual(id,previous.id);
    await page.evaluate(id=>window.qa.close(id),id);
    await page.waitForFunction(id=>!window.qa.tabs.some(t=>t.id===id),id);
    await page.waitForURL(base+previous.route);
  }
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
