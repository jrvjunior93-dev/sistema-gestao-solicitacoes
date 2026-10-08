// Formulario e HTTP reais; sessao e transporte isolados. Sem banco ou rede externa.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stub = '\0qa-usuario-centros-';
const plugin = {
  name: 'qa-usuario-centros', enforce: 'pre',
  resolveId(source) {
    if (source.endsWith('/contexts/AuthContext')) return stub + 'auth';
    if (source.endsWith('/ThemeContext')) return stub + 'tema';
  },
  load(id) {
    if (id === stub + 'auth') return `export const useAuth=()=>({user:{id:1,perfil:'SUPERADMIN'}});`;
    if (id === stub + 'tema') return `export const useTheme=()=>({tema:{}});`;
  },
  configureServer(server) {
    server.middlewares.use('/qa-usuarios', async (_, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end(await server.transformIndexHtml('/qa-usuarios', `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route}from'react-router-dom';import Page from '/src/pages/UsuarioNovo.jsx';
import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/escala.css';import '/src/styles/componentes-padrao.css';import '/src/styles/responsive-system.css';
const edit=new URLSearchParams(location.search).has('edit');
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,{initialEntries:[edit?'/usuarios/42/editar':'/usuarios/novo']},React.createElement(Routes,null,React.createElement(Route,{path:'/usuarios/novo',element:React.createElement(Page)}),React.createElement(Route,{path:'/usuarios/:id/editar',element:React.createElement(Page)}),React.createElement(Route,{path:'/usuarios',element:React.createElement('p',null,'Lista QA')}))));</script></body></html>`));
    });
  }
};
const server = await createServer({root, plugins:[plugin], server:{host:'127.0.0.1',port:5312,strictPort:true,proxy:{}}});
await server.listen(); let browser;
try {
  browser = await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
  const page = await browser.newPage(); const errors=[], unexpected=[], saves=[], scopes=[];
  let catalogFails=false, saveFails=false, heldSave, releaseSave;
  page.on('pageerror', e=>errors.push(e.message));
  const entries=[{id:19,codigo:'19',nome:'Obra QA',tipo_centro_custo:'OBRA'},
    {id:51,codigo:'CC-51',nome:'Administrativo QA',tipo_centro_custo:'CENTRO_CUSTO'}];
  await page.route('**/*', async route=>{
    const request=route.request(), url=new URL(request.url());
    const json=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
    if(url.pathname.endsWith('/setores'))return json([{id:3,nome:'OBRA'}]);
    if(url.pathname.endsWith('/obras')){
      scopes.push(url.searchParams.get('escopo'));
      return catalogFails?json({error:'Indisponivel'},503):json(url.searchParams.get('escopo')==='TODOS'?entries:[entries[0]]);
    }
    if(url.pathname.endsWith('/usuarios/42')&&request.method()==='GET')return json({id:42,nome:'Usuario QA',email:'qa@example.invalid',perfil:'USUARIO',setor_id:3,pode_criar_solicitacao_compra:true,vinculos:[{obra_id:19},{obra_id:51}]});
    if(/\/usuarios(?:\/42)?$/.test(url.pathname)&&['POST','PUT'].includes(request.method())){
      saves.push({method:request.method(),body:request.postDataJSON()});
      if(heldSave)await new Promise(resolve=>{releaseSave=resolve});
      return saveFails?json({error:'Falha QA'},400):json({id:42});
    }
    if(url.origin==='http://127.0.0.1:5312'&&!url.pathname.startsWith('/api'))return route.continue();
    unexpected.push(url.pathname);return route.abort();
  });
  const obra=page.getByRole('checkbox',{name:'19 - Obra QA Obra',exact:true});
  const centro=page.getByRole('checkbox',{name:'CC-51 - Administrativo QA Centro de custo',exact:true});
  await page.goto('http://127.0.0.1:5312/qa-usuarios'); await centro.waitFor();
  assert.equal(await centro.isChecked(),false);assert.equal(await obra.isChecked(),false);
  await page.getByLabel('Nome',{exact:false}).first().fill('Usuario novo QA');
  await page.getByLabel('Email',{exact:false}).first().fill('novo@example.invalid');
  await page.getByLabel('Perfil',{exact:false}).selectOption('USUARIO');
  await page.getByLabel('Setor',{exact:false}).selectOption('3');
  await obra.check();await centro.check();await centro.uncheck();await centro.check();
  heldSave=true;
  await page.getByRole('button',{name:'Salvar',exact:true}).click();
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(el=>el.textContent==='Salvando...'&&el.disabled));
  await page.locator('form').evaluate(form=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  assert.equal(saves.length,1,'Envio simultaneo nao pode duplicar cadastro');
  assert.equal(saves[0].method,'POST');assert.deepEqual(saves[0].body.obras,[19,51]);
  assert.equal(saves[0].body.perfil,'USUARIO');assert.equal(saves[0].body.enviar_convite,true);assert.equal(saves[0].body.senha,undefined);
  heldSave=false;releaseSave();await page.getByText('Lista QA',{exact:true}).waitFor();

  await page.goto('http://127.0.0.1:5312/qa-usuarios?edit=1');await centro.waitFor();
  assert.equal(await centro.isChecked(),true);assert.equal(await obra.isChecked(),true);
  await page.getByLabel('Nome',{exact:false}).first().fill('Usuario atualizado QA');
  await page.getByRole('button',{name:'Salvar',exact:true}).click();await page.getByText('Lista QA',{exact:true}).waitFor();
  assert.deepEqual(saves[1].body.obras,[19,51],'Editar outro campo preserva os dois vinculos');assert.equal(saves[1].method,'PUT');
  assert.equal(saves[1].body.pode_criar_solicitacao_compra,true);assert.equal(saves[1].body.senha,undefined);

  await page.goto('http://127.0.0.1:5312/qa-usuarios?edit=1');await centro.waitFor();await obra.uncheck();
  const output=path.resolve(root,'../outputs/usuario-centros-custo-20261008');await mkdir(output,{recursive:true});
  for(const width of[1366,390]){
    await page.setViewportSize({width,height:844});await centro.scrollIntoViewIfNeeded();
    assert(await centro.isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:path.join(output,`vinculos-${width}.png`),fullPage:true});
  }
  await page.getByRole('button',{name:'Salvar',exact:true}).click();await page.getByText('Lista QA',{exact:true}).waitFor();
  assert.deepEqual(saves[2].body.obras,[51],'Centro de custo pode permanecer como unico vinculo');

  saveFails=true;await page.goto('http://127.0.0.1:5312/qa-usuarios?edit=1');await centro.waitFor();
  await page.getByRole('button',{name:'Salvar',exact:true}).click();await page.getByText('Falha QA',{exact:true}).waitFor();
  assert.equal(await centro.isChecked(),true,'Falha no save preserva selecao');
  assert.equal(await page.getByRole('button',{name:'Salvar',exact:true}).isEnabled(),true);
  catalogFails=true;await page.goto('http://127.0.0.1:5312/qa-usuarios?edit=1');
  await page.getByRole('button',{name:'Salvar',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Salvar',exact:true}).isDisabled(),true,'Falha no catalogo nao pode apagar vinculos ao salvar');
  const count=saves.length;await page.locator('form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.equal(saves.length,count);
  assert(scopes.length>=5&&scopes.every(scope=>scope==='TODOS'));assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  console.log('OK: cadastro/edicao reais, obras+centros, selecao multipla, payload existente, preservacao e remocao de vinculos, erro seguro e envio unico; desktop/mobile. APIs simuladas.');
}finally{await browser?.close();await server.close();}
