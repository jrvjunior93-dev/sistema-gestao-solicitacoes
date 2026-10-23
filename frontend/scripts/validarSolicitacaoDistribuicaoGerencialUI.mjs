// Tela real, API HTTP interceptada; sem banco ou rede externa.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '../outputs/solicitacao-distribuicao-gerencial'); fs.mkdirSync(output, { recursive: true });
const fixture = `import React from'react';import{createRoot}from'react-dom/client';import{BrowserRouter,Routes,Route}from'react-router-dom';
import Detalhe from'/src/pages/SolicitacaoDetalhe/index.jsx';import{ThemeContext,TEMA_PADRAO}from'/src/contexts/ThemeContext.jsx';
import'/src/index.css';import'/src/styles/design-tokens.css';import'/src/styles/componentes-padrao.css';import'/src/styles/escala.css';import'/src/styles/responsive-system.css';
createRoot(document.getElementById('root')).render(<BrowserRouter><ThemeContext.Provider value={{tema:TEMA_PADRAO}}><main className="layout-main" style={{padding:16}}>
<Routes><Route path="/solicitacoes/:id" element={<Detalhe/>}/><Route path="/solicitacoes" element={<p>Sem acesso ao detalhe</p>}/></Routes>
</main></ThemeContext.Provider></BrowserRouter>);`;
const server = await createServer({ root, configFile: false, logLevel: 'error', cacheDir: path.join(output, 'vite-cache'),
  define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api') }, server: { host: '127.0.0.1', port: 0 },
  plugins: [{ name: 'qa-distribuicao-gerencial', enforce: 'pre',
    resolveId(id) { if (id === '/qa-entry.jsx') return '\0qa-gerencial.jsx'; },
    async load(id) { if (id === '\0qa-gerencial.jsx') return transformWithEsbuild(fixture, 'qa.jsx', { loader: 'jsx', jsx: 'transform' }); },
    transform(code, id) { if (id.replaceAll('\\','/').endsWith('/src/contexts/AuthContext.jsx')) return `
      export const useAuth=()=>({user:{id:1,perfil:location.search.includes('superadmin')?'SUPERADMIN':'USUARIO',area:'OBRA',setor:{codigo:'OBRA'},
      areas_permissoes_configuradas:true,areas_permissoes:[],modulos_habilitados:[{key:'COMPRAS',enabled:false},{key:'CONTRATOS',enabled:false},{key:'FINANCEIRO',enabled:false}]}});`; },
    configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
      const p = new URL(req.url,'http://localhost').pathname;
      if (!/^\/solicitacoes(?:\/\d+)?$/.test(p)) return next();
      res.setHeader('Content-Type','text/html'); res.end(await vite.transformIndexHtml(p,
        '<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/qa-entry.jsx"></script></body></html>'));
    }); }
  }, react()], optimizeDeps: { include: ['react','react-dom/client','react-router-dom'] } });
let browser;
const errors = [], forbidden = [], mutations = [];
const linha = (obra_id, percentual, valor, tipo = 'OBRA') => ({ id: obra_id, obra_id, abrangencia:'OBRA', criterio:'PERCENTUAL', percentual, valor_distribuido:valor,
  obraGerencial:{id:obra_id,codigo:`D-${obra_id}`,nome:obra_id===7?'Obra com nome muito longo para testar a leitura integral no celular sem truncamento nem perda de informações':'Administrativo Escritório',tipo_centro_custo:tipo} });
try {
  const layout = await server.ssrLoadModule('/src/pages/SolicitacaoDetalhe/blocosDetalhe.js');
  const antigo = layout.resolverLayoutDetalhe({prefsUsuario:{ordem:['financeiro','historico'],removidos:['apropriacoes']}});
  assert(antigo.ordem.includes('distribuicao_gerencial'));assert(!antigo.ocultos.has('distribuicao_gerencial'));
  assert(layout.resolverLayoutDetalhe({prefsUsuario:{removidos:['distribuicao_gerencial']}}).ocultos.has('distribuicao_gerencial'));
  await server.listen(); browser = await chromium.launch({channel:'chrome',headless:true});
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  async function abrir({ width=1366, tipo='DESPESA ADMINISTRATIVA', linhas=[linha(7,'60.000000','60.00'),linha(8,'40.000000','40.00','CENTRO_CUSTO')], negar=false, prefs={}, perfil='' }={}) {
    const page = await browser.newPage({viewport:{width,height:950}}); page.setDefaultTimeout(12000);
    page.on('pageerror',e=>errors.push(e.message)); const calls = [];
    const registro={id:90,codigo:'SOL-QA90',obra_id:30,obra:{id:30,codigo:'ADM',nome:'Administrativo Escritório'},tipo:{id:1,nome:tipo},
      descricao:'Distribuição original QA',valor:8000,status_global:'PENDENTE',area_responsavel:'GEO',createdAt:'2026-10-01T12:00:00Z',
      contexto_interacao:{pode_interagir:false},historicos:[],anexos:[],distribuicoesCentroCusto:linhas};
    if(linhas===null)delete registro.distribuicoesCentroCusto;
    const original = JSON.stringify(registro);
    await page.route('**/*',async route=>{
      const req=route.request(),u=new URL(req.url());
      if(u.origin!==base){forbidden.push(req.url());return route.abort();}
      if(!u.pathname.startsWith('/api/'))return route.continue();
      calls.push({method:req.method(),url:u.pathname});
      if(req.method()!=='GET'){mutations.push({method:req.method(),url:u.pathname});return route.fulfill({status:405,json:{error:'Somente leitura'}});}
      if(u.pathname==='/api/solicitacoes/90')return route.fulfill({status:negar?403:200,json:negar?{error:'Acesso negado'}:registro});
      if(u.pathname.includes('/preferencias'))return route.fulfill({json:{preferencias:prefs}});
      if(u.pathname.includes('/etapas-compra'))return route.fulfill({json:{itens:[],pedidos:[],comentarios:[]}});
      return route.fulfill({json:[]});
    });
    await page.goto(base+'/solicitacoes/90'+(perfil?'?'+perfil:''));
    if(negar)await page.getByText('Sem acesso ao detalhe',{exact:true}).waitFor();
    else await page.getByRole('heading',{name:/SOL-QA90/}).first().waitFor();
    return {page,calls,registro,original};
  }
  for(const width of [1366,390])for(const tipo of ['DESPESA ADMINISTRATIVA','DESPESA COMERCIAL','DESPESA MARKETING']){
    const linhas=[linha(7,'60.000000','60.00'),linha(8,'40.000000','40.00','CENTRO_CUSTO')]
      .map(l=>({...l,criterio:tipo==='DESPESA COMERCIAL'?'VALOR':'PERCENTUAL'}));
    const {page,calls,registro,original}=await abrir({width,tipo,linhas,prefs:{ordem:['financeiro','historico'],removidos:['apropriacoes']}});
    const card=page.getByTestId('distribuicao-gerencial-salva'); await card.waitFor();
    const toggle=card.getByRole('button'); assert.equal(await toggle.getAttribute('aria-expanded'),'false');
    assert.equal(await card.getByRole('table').count(),0,'Recolhido conforme padrao do detalhe');
    const requests=calls.length; await toggle.press('Enter');
    const tabela=card.getByRole('table');await tabela.waitFor();
    await card.getByText(`Critério registrado: ${tipo==='DESPESA COMERCIAL'?'Valor em R$':'Percentual'}`,{exact:true}).waitFor();
    assert.match(await tabela.innerText(),/60%/);assert.match(await tabela.innerText(),/40%/);
    assert.match(await tabela.innerText(),/100,00/);assert(!/8\.000,00/.test(await tabela.innerText()),'Nao usar valor atual da solicitacao');
    await card.getByText('Centro de custo',{exact:true}).waitFor(); await card.getByText('Obra',{exact:true}).waitFor();
    assert.equal(await card.locator('input,select,textarea,a').count(),0,'Nenhuma acao de edicao ou link a outro escopo');
    assert.equal(await card.getByRole('button').count(),1,'Somente recolher/abrir');
    assert.equal(calls.length,requests,'Abrir bloco nao busca destinos/configuracoes ou financeiro');
    assert.equal(JSON.stringify(registro),original);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Tela sem transbordamento');
    assert(await tabela.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'Tabela legivel sem rolagem horizontal');
    assert(await tabela.locator('th,td').evaluateAll(celulas=>celulas.every(e=>{
      const r=e.getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth;
    })),'Todas as colunas de percentual e valor ficam dentro da tela, sem recorte por CSS legado');
    if(tipo==='DESPESA ADMINISTRATIVA')await card.screenshot({path:path.join(output,`distribuicao-${width}.png`)});
    await toggle.click();await tabela.waitFor({state:'hidden'});await page.close();
  }
  const todas={id:1,obra_id:null,abrangencia:'TODAS',criterio:'TODAS',percentual:'100.000000',valor_distribuido:'5205.41'};
  for(const width of [390,1366]){
    const {page}=await abrir({width,linhas:[todas],perfil:'superadmin'}),card=page.getByTestId('distribuicao-gerencial-salva');
    await card.getByRole('button').click(); await card.getByText('TODAS',{exact:true}).last().waitFor();
    assert.equal(await card.locator('tbody tr').count(),1);assert.match(await card.getByRole('table').innerText(),/5\.205,41/);
    await page.close();
  }
  for(const linhas of [[],null]){
    const {page}=await abrir({linhas});
    assert.equal(await page.getByTestId('distribuicao-gerencial-salva').count(),0);await page.close();
  }
  let {page}=await abrir({linhas:[{...linha(99,'33.333333',null),obraGerencial:null}]});
  let card=page.getByTestId('distribuicao-gerencial-salva');await card.getByRole('button').click();
  await card.getByText('Destino #99',{exact:true}).waitFor();assert.match(await card.innerText(),/33,333333%/);
  assert.equal(await card.getByText('Não informado',{exact:true}).count(),2);await page.close();
  ({page}=await abrir({negar:true}));assert.equal(await page.getByTestId('distribuicao-gerencial-salva').count(),0);await page.close();
  assert.deepEqual(errors,[]);assert.deepEqual(forbidden,[]);assert.deepEqual(mutations,[]);
  console.log('OK detalhe gerencial real: administrativo/comercial/marketing1366/390, consulta sem permissao financeira/edicao, TODAS/SUPERADMIN, criterios/valores salvos, legado vazio, destino ausente, percentuais precisos, layout antigo, teclado/recolher e ACL403. Sem novas consultas ou escritas, banco/rede externa.');
} finally { if(browser)await browser.close();await server.close(); }
