// Paginas/componentes/servicos reais, HTTP simulado local, sem banco ou API externa.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '../outputs/edicao-solicitacao');
fs.mkdirSync(output, { recursive: true });
const fixture = `import React from 'react';import {createRoot}from'react-dom/client';
import{BrowserRouter,Routes,Route}from'react-router-dom';
import Lista from '/src/pages/Solicitacoes/index.jsx';import Detalhe from '/src/pages/SolicitacaoDetalhe/index.jsx';
import{ThemeContext,TEMA_PADRAO}from'/src/contexts/ThemeContext.jsx';
import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/componentes-padrao.css';import '/src/styles/escala.css';import '/src/styles/responsive-system.css';
createRoot(document.getElementById('root')).render(<BrowserRouter><ThemeContext.Provider value={{tema:TEMA_PADRAO}}>
<div className="fx-topbar" style={{position:'fixed',top:0,height:96}}/><main className="layout-main" style={{paddingTop:96}}>
<Routes><Route path="/fixture" element={<Lista arquivadas={location.search.includes('arquivadas')}/>}/>
<Route path="/solicitacoes/:id" element={<Detalhe/>}/></Routes></main></ThemeContext.Provider></BrowserRouter>);`;
const server = await createServer({ root, configFile: false, logLevel: 'error', cacheDir: path.join(output, 'vite-cache'),
  define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api') },
  server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'qa-edicao-solicitacao', enforce: 'pre',
    resolveId(id) { if (id === '/fixture.jsx') return '\0edicao-fixture.jsx'; },
    async load(id) { if (id === '\0edicao-fixture.jsx') return transformWithEsbuild(fixture, 'fixture.jsx', { loader: 'jsx', jsx: 'transform' }); },
    transform(code, id) {
      if (id.endsWith('/src/contexts/AuthContext.jsx')) return `const papel=new URLSearchParams(location.search).get('papel')||'superadmin';
        const user={id:1,perfil:papel==='superadmin'?'SUPERADMIN':papel==='adminGeo'?'ADMIN':'USUARIO',
        area:papel==='adminGeo'?'GEO':'OBRA',setor:{codigo:papel==='adminGeo'?'GEO':'OBRA'},areas_permissoes_configuradas:true,
        modulos_habilitados:[{key:'COMPRAS',enabled:false},{key:'CONTRATOS',enabled:false},{key:'FINANCEIRO',enabled:false}],
        areas_permissoes:papel==='valor'?['solicitacoes.acoes.alterar_valor']:papel==='vencimento'?['solicitacoes.acoes.alterar_data_vencimento']:[]};
        export const useAuth=()=>({user});`;
    },
    configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (pathname !== '/fixture' && !/^\/solicitacoes\/\d+$/.test(pathname)) return next();
      res.setHeader('Content-Type', 'text/html');res.end(await vite.transformIndexHtml(pathname,
        '<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
    }); }
  }, react()], optimizeDeps: { include: ['react', 'react-dom/client', 'react-router-dom'] } });

let browser;
const errors = [];
const pages = [];
try {
  const helper = await server.ssrLoadModule('/src/utils/solicitacaoEdicao.js');
  for (const [texto, esperado] of [['2.000',2000],['2.000,00',2000],['0,01',0.01],['0',0],['',null],['R$ 1.234,56',1234.56]])
    assert.equal(helper.parseValorSolicitacaoBR(texto), esperado);
  for (const texto of ['-1', '2.00', '1,234', 'Infinity', 'NaN', '1.2.000', 'abc']) assert.throws(() => helper.parseValorSolicitacaoBR(texto));
  assert.deepEqual(helper.permissoesEdicaoSolicitacao({perfil:'SUPERADMIN'}),{valor:true,vencimento:true});
  assert.deepEqual(helper.permissoesEdicaoSolicitacao({perfil:'ADMIN',setor:{codigo:'GEO'}}),{valor:true,vencimento:true});
  assert.deepEqual(helper.permissoesEdicaoSolicitacao({perfil:'ADMIN',area:'OBRA'}),{valor:false,vencimento:false});
  assert.equal(helper.vencimentoSolicitacaoParaEdicao({data_vencimento:'2099-01-01',data_vencimento_solicitacao:'2099-02-02'}),'2099-02-02');
  assert.equal(helper.vencimentoSolicitacaoParaEdicao({data_vencimento:'2099-01-01',data_vencimento_solicitacao:null}),'');
  for (const [key,campo] of [['alterar_valor','valor'],['alterar_data_vencimento','vencimento']]) {
    const p=helper.permissoesEdicaoSolicitacao({perfil:'USUARIO',areas_permissoes_configuradas:true,areas_permissoes:[`solicitacoes.acoes.${key}`]});
    assert.equal(p[campo],true);assert.equal(p[campo==='valor'?'vencimento':'valor'],false);
  }
  await server.listen();browser=await chromium.launch({channel:'chrome',headless:true});
  const base=`http://127.0.0.1:${server.httpServer.address().port}`;
  async function abrir(rota='/fixture', width=1366) {
    const page=await browser.newPage({viewport:{width,height:900}});pages.push(page);
    page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(30000);
    page.on('pageerror',e=>errors.push(e.message));
    let registro={id:90,codigo:'SOL-QA90',obra_id:7,obra:{id:7,nome:'Obra QA'},tipo:{id:1,nome:'DESPESA EVENTUAL'},
      descricao:'Solicitação QA',valor:1000,valor_exibicao:600,valor_pago_acumulado:400,status_global:'PARCIALMENTE PAGO',
      area_responsavel:'GEO',data_vencimento:'2099-10-10',createdAt:'2026-10-01T12:00:00Z',
      contexto_interacao:{pode_interagir:true},historicos:[],anexos:[]};
    if(rota.includes('medicao'))Object.assign(registro,{data_vencimento_solicitacao:'2099-08-01',data_vencimento_medicao:'2099-10-10'});
    const estado={envios:[],falhar:false};
    await page.route('**/*', async route=>{
      const u=new URL(route.request().url());
      if(!u.href.startsWith(base))return route.abort();
      if(!u.pathname.startsWith('/api/'))return route.continue();
      const metodo=route.request().method(),p=u.pathname.slice(4);
      if(metodo==='PATCH' && /^\/solicitacoes\/90\/(valor|data-vencimento)$/.test(p)) {
        const body=route.request().postDataJSON();estado.envios.push({p,body});
        await new Promise(ok=>setTimeout(ok,350));
        if(estado.falhar)return route.fulfill({status:403,json:{error:'Acesso negado simulado'}});
        Object.assign(registro,body);
        if('data_vencimento'in body && 'data_vencimento_solicitacao'in registro) {
          registro.data_vencimento_solicitacao=body.data_vencimento;
          registro.data_vencimento=registro.data_vencimento_medicao||body.data_vencimento;
        }
        if('valor'in body)registro.valor_exibicao=Math.max(Number(body.valor)-400,0);
        return route.fulfill({status:204,body:''});
      }
      let data=[];
      if(p==='/solicitacoes')data={items:[registro],page:1,total:1,total_pages:1,limit:25};
      else if(p==='/solicitacoes/90'||p==='/solicitacoes/90/resumo-lista')data=registro;
      else if(p.includes('contadores'))data={todas:1,minhas:1};
      else if(p.includes('preferencias'))data={};
      else if(p.includes('etapas-compra'))data={itens:[],pedidos:[],comentarios:[]};
      return route.fulfill({json:data});
    });
    await page.goto(base+rota,{waitUntil:'domcontentloaded'});
    await page.getByRole('heading',{name:rota.startsWith('/fixture')?'Solicitações':/SOL-QA90/}).first().waitFor({timeout:30000});
    return{page,estado};
  }
  const {page,estado}=await abrir();
  const editar=page.getByRole('button',{name:'Editar valor de SOL-QA90',exact:true});
  await editar.waitFor();await editar.press('Enter');
  assert.ok(page.url().endsWith('/fixture'),'Enter no icone nao navega para o detalhe');
  let modal=page.getByRole('dialog',{name:'Editar valor · SOL-QA90',exact:true});
  const valor=modal.getByRole('textbox',{name:'Valor da solicitação (R$)'});
  assert.equal(await valor.inputValue(),'1.000,00','Edita total, nao saldo exibido de 600');
  await valor.fill('-1');await modal.getByRole('button',{name:'Salvar alteração'}).click();
  await modal.getByRole('alert').waitFor();assert.equal(estado.envios.length,0);
  await valor.fill('2.000,00');
  await modal.getByRole('button',{name:'Salvar alteração'}).evaluate(e=>{e.form.requestSubmit();e.form.requestSubmit();});
  await modal.getByRole('button',{name:'Salvando...'}).waitFor();
  await page.keyboard.press('Escape');assert.equal(await modal.count(),1,'Nao fecha durante PATCH');
  await modal.waitFor({state:'hidden'});
  assert.deepEqual(estado.envios,[{p:'/solicitacoes/90/valor',body:{valor:2000}}]);
  await page.getByRole('button',{name:'Editar vencimento de SOL-QA90',exact:true}).click();
  modal=page.getByRole('dialog',{name:'Editar vencimento · SOL-QA90',exact:true});
  const data=modal.getByRole('textbox',{name:'Vencimento da solicitação'});
  await data.fill('01/01/2000');await modal.getByRole('button',{name:'Salvar alteração'}).click();
  assert.equal(estado.envios.length,1,'Data passada nao e enviada');
  await data.fill('31/12/2099');await modal.getByRole('button',{name:'Salvar alteração'}).click();
  await modal.waitFor({state:'hidden'});
  assert.deepEqual(estado.envios[1],{p:'/solicitacoes/90/data-vencimento',body:{data_vencimento:'2099-12-31'}});
  await editar.click();modal=page.getByRole('dialog',{name:'Editar valor · SOL-QA90',exact:true});
  await modal.getByRole('button',{name:'Cancelar'}).click();assert.equal(estado.envios.length,2);
  await editar.click();await modal.getByRole('button',{name:'Salvar alteração'}).click();
  await modal.waitFor({state:'hidden'});assert.equal(estado.envios.length,2,'Sem alteracao nao grava historico repetido');
  await page.getByRole('button',{name:'Cards',exact:true}).click();
  await editar.waitFor();await editar.click();await modal.getByRole('button',{name:'Cancelar'}).click();
  assert.ok(page.url().endsWith('/fixture'),'Icone no card nao abre solicitacao');
  await page.setViewportSize({width:390,height:850});await editar.click();
  await modal.screenshot({path:path.join(output,'modal-valor-mobile.png')});
  assert.ok(await modal.evaluate(e=>e.scrollWidth<=innerWidth),'Modal cabe no celular');
  await modal.getByRole('button',{name:'Cancelar'}).click();
  for(const papel of ['valor','vencimento','consulta','adminGeo']) {
    const {page:p}=await abrir(`/fixture?papel=${papel}`);
    await p.getByText('SOL-QA90',{exact:true}).first().waitFor();
    assert.equal(await p.getByRole('button',{name:'Editar valor de SOL-QA90',exact:true}).count(),['valor','adminGeo'].includes(papel)?1:0);
    assert.equal(await p.getByRole('button',{name:'Editar vencimento de SOL-QA90',exact:true}).count(),['vencimento','adminGeo'].includes(papel)?1:0);
    await p.close();
  }
  const {page:arquivadas}=await abrir('/fixture?arquivadas');
  await arquivadas.getByText('SOL-QA90',{exact:true}).first().waitFor();
  assert.equal(await arquivadas.getByRole('button',{name:/Editar (valor|vencimento) de/}).count(),0);
  const {page:dp,estado:ds}=await abrir('/solicitacoes/90');
  await dp.getByRole('button',{name:'Editar valor',exact:true}).click();
  const dm=dp.getByRole('dialog',{name:'Editar valor · SOL-QA90',exact:true});
  ds.falhar=true;await dm.getByRole('textbox',{name:'Valor da solicitação (R$)'}).fill('1.234,56');
  await dm.getByRole('button',{name:'Salvar alteração'}).click();
  await dm.getByText('Acesso negado simulado',{exact:true}).waitFor();
  assert.equal(await dm.getByRole('textbox').inputValue(),'1.234,56','Preserva rascunho apos erro');
  ds.falhar=false;await dm.getByRole('button',{name:'Salvar alteração'}).click();await dm.waitFor({state:'hidden'});
  assert.equal(ds.envios.length,2);assert.equal(ds.envios[1].body.valor,1234.56);
  await dp.getByRole('button',{name:'Editar vencimento',exact:true}).click();
  const dv=dp.getByRole('dialog',{name:'Editar vencimento · SOL-QA90',exact:true});
  await dv.getByRole('textbox',{name:'Vencimento da solicitação'}).fill('');
  await dv.getByRole('button',{name:'Salvar alteração'}).click();await dv.waitFor({state:'hidden'});
  assert.deepEqual(ds.envios[2].body,{data_vencimento:null});
  await dp.screenshot({path:path.join(output,'detalhe-desktop.png'),fullPage:true});
  for(const [entrada,esperado] of [['0',0],['',null]]) {
    await dp.getByRole('button',{name:'Editar valor',exact:true}).click();
    await dm.getByRole('textbox',{name:'Valor da solicitação (R$)'}).fill(entrada);
    await dm.getByRole('button',{name:'Salvar alteração'}).click();await dm.waitFor({state:'hidden'});
    assert.equal(ds.envios.at(-1).body.valor,esperado);
  }
  const {page:mp,estado:ms}=await abrir('/fixture?medicao');
  await mp.getByRole('button',{name:'Editar vencimento de SOL-QA90',exact:true}).click();
  const mm=mp.getByRole('dialog',{name:'Editar vencimento · SOL-QA90',exact:true});
  assert.equal(await mm.getByRole('textbox').inputValue(),'01/08/2099','Data propria, nao data da parcela');
  await mm.getByText(/A lista usa o vencimento da medição/).waitFor();
  await mm.getByRole('textbox').fill('02/08/2099');await mm.getByRole('button',{name:'Salvar alteração'}).click();
  await mm.waitFor({state:'hidden'});assert.deepEqual(ms.envios[0].body,{data_vencimento:'2099-08-02'});
  for(const papel of ['valor','vencimento','consulta']) {
    const {page:p}=await abrir(`/solicitacoes/90?papel=${papel}`,390);
    assert.equal(await p.getByRole('button',{name:'Editar valor',exact:true}).count(),papel==='valor'?1:0);
    assert.equal(await p.getByRole('button',{name:'Editar vencimento',exact:true}).count(),papel==='vencimento'?1:0);
    await p.close();
  }
  assert.deepEqual(errors,[]);
  console.log('Edicao de solicitacao validada: lista/cards/mobile/detalhe, permissoes separadas, total vs saldo, BR, datas, cancelamento, trava, erro/retry e recarga. Sem banco ou API externa.');
} catch(error) {
  console.error('Erros JS:',errors);
  for(const page of pages)if(!page.isClosed())console.error('Tela:',page.url(),(await page.locator('body').innerText()).slice(0,2500));
  throw error;
} finally {await browser?.close();await server.close();}
