import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Regras reais do servidor, sem carregar models, .env ou conectar a banco.
const prazoSource = readFileSync(path.join(root, '../backend/src/modules/custosRecebiveis/services/prazoService.js'), 'utf8');
const context = { module: { exports: {} }, require: id => {
  if (id === 'sequelize') return { Op: {} };
  if (id === '../../../models') return {};
  throw new Error(`Dependencia nao simulada: ${id}`);
} };
vm.runInNewContext(prazoSource, context);
const { competenciasLiberadas } = context.module.exports;
const now = new Date('2026-10-07T12:00:00-03:00');
const months = options => Array.from(competenciasLiberadas({ now, competencias: [], ...options }));
assert.deepEqual(months({ temPlanoPublicado: false, inicio: '2026-10' }), []);
assert.deepEqual(months({ temPlanoPublicado: true, inicio: '2026-10' }), ['2026-10'], 'Primeiro mes nao depende de registro anterior');
assert.deepEqual(months({ temPlanoPublicado: true, inicio: '2026-09' }), ['2026-09', '2026-10']);
assert.deepEqual(months({ temPlanoPublicado: true, inicio: '2026-11' }), [], 'Inicio futuro respeita a janela');
assert.deepEqual(months({ temPlanoPublicado: true, inicio: '2026-11', now: new Date('2026-10-25T00:00:00-03:00') }), ['2026-11']);
assert.deepEqual(months({ temPlanoPublicado: true, inicio: '2026-10', competencias: [{ competencia: '2026-10' }] }), [], 'Nao recria mes existente');

// Componente e helper de permissoes reais; servico e editores isolados.
const fixture = `import React from 'react'; import {createRoot} from 'react-dom/client';
import View from '/src/modules/custosRecebiveis/components/CrPlanejamentoMensalView.jsx';
import {hasExplicitCustosRecebiveisPermission as has} from '/src/modules/custosRecebiveis/utils/access.js';
import '/src/index.css'; import '/src/styles/design-tokens.css'; import '/src/styles/componentes-padrao.css';
import '/src/modules/custosRecebiveis/styles/custos-recebiveis.css';
const mode = new URLSearchParams(location.search).get('mode') || 'missing';
window.mode=mode; window.posts=[]; window.changed=0;
const user={perfil:mode==='superadmin'?'SUPERADMIN':'USUARIO',areas_permissoes:
mode==='readonly'?['custos_recebiveis.planejamento.visualizar']:
mode==='finish'?['custos_recebiveis.planejamento.finalizar']:
mode==='receipts'?['custos_recebiveis.planejamento.preencher_recebiveis']:['custos_recebiveis.planejamento.preencher_custos']};
const situacao=['missing','superadmin'].includes(mode)?'SEM_ESTRUTURA':mode==='future'?'AGUARDANDO_JANELA':'ABERTO';
createRoot(document.getElementById('root')).render(<main style={{maxWidth:1280,margin:'24px auto'}}><View
 obra={{id:22,codigo:'22',nome:'ESCOLA DE NOVA VENÉCIA',classificacao:'PUBLICA'}} userId={2}
 permissions={{costs:has(user,'custos_recebiveis.planejamento.preencher_custos'),receipts:has(user,'custos_recebiveis.planejamento.preencher_recebiveis')}}
 prazos={{planejamento:{situacao,competencia:'2026-11',dias:18}}} onChanged={()=>window.changed++}
 /></main>);`;
const childFiles = ['CrDilatacaoRequestModal.jsx', 'CrMonthlySummaryCard.jsx', 'CrMonthlyDetailView.jsx', 'CrReopeningRequestModal.jsx'];
const server = await createServer({ root, configFile: false, logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
  plugins: [{ name: 'cr-novo-mes-fixture', enforce: 'pre',
    resolveId(id) { if (id === '/fixture.jsx') return '\0cr-novo-mes-fixture.jsx'; },
    async load(id) { if (id === '\0cr-novo-mes-fixture.jsx') return transformWithEsbuild(fixture, 'fixture.jsx', { loader: 'jsx', jsx: 'transform' }); },
    transform(code, id) {
      if (childFiles.some(file => id.endsWith('/' + file))) return 'export default function Stub(){return null;}';
      if (id.endsWith('/CrPlanejamentoView.jsx')) return `import React from 'react'; export default function Editor({competencia}){return <div role="status">Editor de {competencia}</div>;}`;
      if (id.endsWith('/modules/custosRecebiveis/services/custosRecebiveis.js')) return `
        export async function listarCompetenciasObra(){
          if(window.mode==='loadingError') throw new Error('Falha ao consultar meses.');
          return {items:[],competencias_permitidas:['first','receipts','serverError','readonly','finish'].includes(window.mode)?['2026-10']:[]};
        }
        export async function criarCompetenciaObra(id,competencia){
          window.posts.push({id,competencia}); await new Promise(r=>setTimeout(r,150));
          if(window.mode==='serverError' && window.posts.length===1) throw new Error('Publique uma versao da estrutura micro antes de planejar a competencia.');
          return {competencia:{competencia}};
        }
        export const solicitarDilatacao=async()=>({});`;
    },
    configureServer(vite) { vite.middlewares.use(async(req,res,next)=>{
      if(new URL(req.url,'http://localhost').pathname!=='/fixture') return next();
      res.setHeader('Content-Type','text/html');
      res.end(await vite.transformIndexHtml('/fixture','<html lang="pt-BR"><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
    }); }
  }, react()], optimizeDeps: { include: ['react', 'react-dom/client'] } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    if(new URL(route.request().url()).hostname==='127.0.0.1') return route.continue();
    external.push(route.request().url()); return route.abort();
  });
  const url=`http://127.0.0.1:${server.httpServer.address().port}/fixture`;
  const open=async(mode)=>{await page.goto(url+'?mode='+mode); await page.getByText('Nenhum mês registrado',{exact:true}).waitFor();};
  await open('missing');
  await page.getByRole('button',{name:'Novo mês',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'importe e publique a planilha da obra'}).waitFor();
  assert.equal(await page.evaluate(()=>window.posts.length),0);
  const output=path.resolve(root,'../outputs/cr-novo-mes'); mkdirSync(output,{recursive:true});
  await page.screenshot({path:path.join(output,'sem-planilha-claro.png')});
  await page.evaluate(()=>{document.documentElement.dataset.theme='dark'; document.documentElement.classList.add('dark');});
  await page.screenshot({path:path.join(output,'sem-planilha-escuro.png')});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Tela cabe no celular');
  await page.screenshot({path:path.join(output,'sem-planilha-celular.png')});
  await page.setViewportSize({width:1280,height:800});
  await open('future');
  await page.getByRole('button',{name:'Novo mês',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'competência de início'}).waitFor();
  assert.equal(await page.evaluate(()=>window.posts.length),0);
  for(const mode of ['readonly','finish']) {
    await open(mode); assert.equal(await page.getByRole('button',{name:/Novo mês/}).count(),0,'Consulta ou finalizar nao autoriza criar');
  }
  await open('superadmin'); await page.getByRole('button',{name:'Novo mês',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'importe e publique'}).waitFor();
  for(const mode of ['first','receipts']) {
    await open(mode);
    const button=page.getByRole('button',{name:/Novo mês · outubro de 2026/i});
    await button.evaluate(el=>{el.click();el.click();});
    await page.getByRole('status').filter({hasText:'Editor de 2026-10'}).waitFor();
    assert.equal(await page.evaluate(()=>window.posts.length),1,'Duplo clique envia uma vez');
    assert.deepEqual(await page.evaluate(()=>window.posts[0]),{id:22,competencia:'2026-10'});
  }
  await open('serverError');
  await page.getByRole('button',{name:/Novo mês/}).click();
  await page.getByRole('alert').filter({hasText:'Publique uma versao'}).waitFor();
  await page.getByRole('button',{name:/Novo mês/}).click();
  await page.getByRole('status').filter({hasText:'Editor de 2026-10'}).waitFor();
  assert.equal(await page.evaluate(()=>window.posts.length),2,'Erro libera nova tentativa');
  await page.goto(url+'?mode=loadingError');
  await page.getByRole('alert').filter({hasText:'Falha ao consultar meses'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Novo mês',exact:true}).isDisabled(),true);
  assert.deepEqual(errors,[]); assert.deepEqual(external,[]);
  console.log('Novo mes: primeiro ciclo, inicio futuro, permissoes, falta de planilha, falha/retry, duplo clique e UI em dois temas/celular validados. Sem banco ou rede externa.');
} finally { await browser?.close(); await server.close(); }
