import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
import { dataOperacionalHoje } from '../src/utils/dataOperacional.js';

// Componente e estilos reais. Identidade, relogio e API isolados sem servicos externos.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
assert.equal(dataOperacionalHoje(new Date('2026-10-07T02:59:59Z')), '2026-10-06');
assert.equal(dataOperacionalHoje(new Date('2026-10-07T03:00:00Z')), '2026-10-07');
const fixture = `import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route,useNavigate} from 'react-router-dom';
import Controle from '/src/components/ControleDiarioCaixa.jsx';
import {installFetchSecurityDefaults} from '/src/services/api.js';
import '/src/index.css';import '/src/styles/design-tokens.css';
import '/src/components/lista-avancada/lista-avancada.css';import '/src/styles/escala.css';
import '/src/styles/componentes-padrao.css';import '/src/styles/responsive-system.css';
window.estadoCaixa=new URLSearchParams(location.search).get('caso')||'antigo';
window.dia='2026-10-06';window.consultas=0;window.montagensProtegidas=0;window.eventos=[];
window.identidade={id:2,perfil:window.estadoCaixa==='superadmin'?'SUPERADMIN':'USUARIO'};
window.fetch=async()=>new Response(JSON.stringify(window.resposta||{}),{status:window.httpStatus||200});
installFetchSecurityDefaults();
window.addEventListener('fluxy:controle-diario-caixa',event=>window.eventos.push(event.detail||null));
window.testarFetch=async(url,status,body,method)=>{
 window.httpStatus=status;window.resposta=body;
 return (await fetch(url,{method})).json();
};
function Area(){React.useEffect(()=>{window.montagensProtegidas++},[]);return <button>Acao protegida</button>}
function Caixa(){const navigate=useNavigate();return <section className='app-bloco mt-3'>
 <h2>Caixa e Contas</h2><button className='btn btn-primary' onClick={()=>{window.estadoCaixa='aberto';window.dispatchEvent(new CustomEvent('fluxy:controle-diario-caixa'))}}>Abrir caixa de hoje</button>
 <button className='btn btn-outline' onClick={()=>navigate('/solicitacoes')}>Ir para solicitacoes</button></section>}
function App(){const navigate=useNavigate();window.navegar=navigate;return <div className='layout-shell fluxy-app-shell'>
 <header className='p-3'>Fluxy <button className='btn btn-outline'>Sair</button></header><main className='layout-main'><div className='layout-content-shell'>
 <Controle><Routes><Route path='/financeiro/caixas' element={<Caixa/>}/><Route path='*' element={<Area/>}/></Routes></Controle>
 </div></main></div>}
createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/solicitacoes']}><App/></MemoryRouter>);`;
const api = `export async function getEstadoControleDiarioCaixa(){window.consultas++;await new Promise(r=>setTimeout(r,70));
 const caso=window.estadoCaixa;if(caso==='falha')throw new Error('Falha simulada na verificacao');
 const bloqueado=['antigo','divergencia','sem-permissao','novo-dia'].includes(caso);
 return {bloqueado,usuario_sujeito_bloqueio:!['off','nao-responsavel','superadmin'].includes(caso),
  data_referencia:window.dia,servidor_agora:new Date().toISOString(),
  mensagem:caso==='divergencia'?'Aguarde a decisao de outro aprovador.':'Feche o caixa anterior e abra um novo caixa de hoje para continuar usando o sistema.',
  pendencias:bloqueado?[{nome:'COFRE CSC',conta_bancaria_id:1,motivo:caso==='divergencia'?'DIVERGENCIA':'FECHAMENTO_ANTERIOR'}]:[]};}`;
const server = await createServer({ root, configFile: false, logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 }, css: { postcss: path.join(root, 'postcss.config.js') },
  plugins: [{ name: 'controle-caixa-fixture', enforce: 'pre',
    resolveId(id, importer) {
      if (id === '/fixture.jsx') return '\0controle-fixture.jsx';
      if (importer?.endsWith('ControleDiarioCaixa.jsx')) {
        if (id.endsWith('contexts/AuthContext')) return '\0controle-auth';
        if (id.endsWith('services/controleDiarioCaixa')) return '\0controle-api';
        if (id.endsWith('utils/acessoProduto')) return '\0controle-permissoes';
        if (id.endsWith('utils/dataOperacional')) return '\0controle-data';
      }
    },
    async load(id) {
      if (id === '\0controle-fixture.jsx') return (await transformWithEsbuild(fixture, 'fixture.jsx', { loader: 'jsx', jsx: 'automatic' })).code;
      if (id === '\0controle-auth') return 'export function useAuth(){return {user:window.identidade}}';
      if (id === '\0controle-api') return api;
      if (id === '\0controle-permissoes') return "export function canViewFinanceiroCaixas(){return window.estadoCaixa!=='sem-permissao'}";
      if (id === '\0controle-data') return 'export function dataOperacionalHoje(){return window.dia}';
    },
    configureServer(s) { s.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith('/fixture?')) return next();
      res.setHeader('Content-Type', 'text/html');
      res.end(await s.transformIndexHtml('/fixture', '<html lang="pt-BR"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
    }); }
  }, react()]
});
let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const banner = page.getByTestId('bloqueio-caixa-diario');
  const protectedAction = page.getByRole('button', { name: 'Acao protegida', exact: true });
  async function abrir(caso) { await page.goto(`${origin}/fixture?caso=${caso}`); }
  await abrir('antigo');
  await banner.waitFor();
  await page.getByRole('button', { name: 'Abrir caixa de hoje', exact: true }).waitFor();
  assert.equal(await protectedAction.count(), 0);
  assert.equal(await page.evaluate(() => window.montagensProtegidas), 0);
  await page.evaluate(() => window.navegar('/pedidos-compra'));
  await page.getByRole('button', { name: 'Abrir caixa de hoje', exact: true }).waitFor();
  assert.equal(await protectedAction.count(), 0);
  const evidencias = path.join(root, '../qa/evidencias/controle-diario-geral-2026-10-06');
  fs.mkdirSync(evidencias, { recursive: true });
  await page.screenshot({ path: path.join(evidencias, 'desktop-claro.png'), fullPage: true });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.screenshot({ path: path.join(evidencias, 'desktop-escuro.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: path.join(evidencias, 'mobile-escuro.png'), fullPage: true });
  await page.getByRole('button', { name: 'Abrir caixa de hoje', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[data-testid="bloqueio-caixa-diario"]'));
  await page.getByRole('button', { name: 'Ir para solicitacoes', exact: true }).click();
  await protectedAction.waitFor();
  // Sessao fechada hoje: demais areas liberadas. Virada bloqueia sem novo login.
  await page.evaluate(() => { window.estadoCaixa='fechado-hoje'; window.dispatchEvent(new Event('focus')); });
  await protectedAction.waitFor();
  await page.evaluate(() => { window.estadoCaixa='novo-dia'; window.dia='2026-10-07'; });
  await banner.waitFor();
  assert.equal(await protectedAction.count(), 0);
  for (const caso of ['aberto','fechado-hoje','off','nao-responsavel','superadmin']) {
    await abrir(caso); await protectedAction.waitFor();
    assert.equal(await banner.count(), 0);
    if (caso === 'superadmin') assert.equal(await page.evaluate(() => window.consultas), 0);
  }
  // Ativacao ou pendencia detectada ao voltar a janela, sem logout.
  await abrir('off'); await protectedAction.waitFor();
  await page.evaluate(() => { window.estadoCaixa='antigo'; window.dispatchEvent(new Event('focus')); });
  await banner.waitFor();
  await abrir('sem-permissao'); await banner.waitFor();
  await page.getByText(/Solicite ao administrador a permissão/).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Abrir caixa de hoje', exact: true }).count(), 0);
  assert.equal(await page.evaluate(() => window.montagensProtegidas), 0);
  await abrir('divergencia'); await page.getByText('Aguarde a decisao de outro aprovador.', { exact: true }).waitFor();
  await abrir('falha'); await page.getByText('Falha simulada na verificacao', { exact: true }).waitFor();
  assert.equal(await protectedAction.count(), 0);
  await page.evaluate(() => { window.estadoCaixa='aberto'; });
  await page.getByRole('button', { name: 'Verificar novamente', exact: true }).click();
  await protectedAction.waitFor();
  // O wrapper de fetch preserva o corpo para o chamador e sinaliza bloqueio/mutacao de caixa.
  const body = { codigo: 'CONTROLE_DIARIO_CONTAS_PENDENTE', bloqueado: true, error: 'Abra hoje', data_referencia: '2026-10-06' };
  const recebido = await page.evaluate(body => window.testarFetch('/api/solicitacoes',423,body,'GET'), body);
  assert.deepEqual(recebido, body);
  await page.waitForFunction(() => window.eventos.some(e => e?.codigo === 'CONTROLE_DIARIO_CONTAS_PENDENTE'));
  const antes = await page.evaluate(() => window.eventos.length);
  await page.evaluate(() => window.testarFetch('/api/financeiro/caixas/1/fechar',200,{ok:true},'POST'));
  assert.equal(await page.evaluate(() => window.eventos.length), antes + 1);
  await page.evaluate(() => window.testarFetch('/api/solicitacoes',200,{ok:true},'POST'));
  await page.evaluate(() => window.testarFetch('/api/solicitacoes',423,{codigo:'OUTRO'},'GET'));
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.eventos.length), antes + 1);
  assert.deepEqual(errors, []);
  console.log('Controle diario: gate real, redirecionamento, permissoes, falha segura, virada sem login, fechamento hoje e notificacao HTTP validados no Edge.');
  console.log(`Capturas: ${evidencias}`);
} finally { await browser?.close(); await server.close(); }
