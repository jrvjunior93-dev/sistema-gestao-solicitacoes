// Paginas reais e transporte local interceptado. Sem banco/API de negocio.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = `import React,{useState,useMemo}from'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';
import{WorkspacePageContext,createWorkspaceMemory}from'/src/navigation/WorkspaceContext.jsx';
import{ThemeContext,TEMA_PADRAO}from'/src/contexts/ThemeContext.jsx';
import Categorias from'/src/modules/solicitacao-compra/pages/GestaoCategorias.jsx';
import Unidades from'/src/modules/solicitacao-compra/pages/GestaoUnidades.jsx';
import Fornecedores from'/src/modules/solicitacao-compra/pages/GestaoFornecedores.jsx';
import Insumos from'/src/modules/solicitacao-compra/pages/GestaoInsumos.jsx';
window.writes=[];window.reads=[];window.finished=0;window.negado=false;window.readonly=false;window.units=[{id:1,nome:'Metro',sigla:'m'}];window.categories=[{id:1,nome:'Material QA'},{id:2,nome:'Outra categoria QA'}];window.rows=[{id:1,nome:'Cadastro QA',sigla:'qa',ativo:true,cnpj:'52998224725',categoria_insumos:['Eletrico'],unidade_id:1,categoria_id:1,codigo:'INS-QA'},{id:2,nome:'Outro QA',sigla:'x',ativo:true,unidade_id:1,categoria_id:2}];
function Host(){const[active,A]=useState(true);const memory=useMemo(()=>createWorkspaceMemory(),[]);window.qaTab=A;window.qaMemory=memory;
return <WorkspacePageContext.Provider value={{key:'cadastro-qa',memory,snapshot:true,active:true}}>
{active?(new URLSearchParams(location.search).has('insumos')?<Insumos/>:new URLSearchParams(location.search).has('fornecedores')?<Fornecedores/>:new URLSearchParams(location.search).has('unidades')?<Unidades/>:<Categorias/>):<p>Consulta auxiliar</p>}
</WorkspacePageContext.Provider>}
createRoot(document.getElementById('root')).render(<BrowserRouter><ThemeContext.Provider value={{tema:TEMA_PADRAO}}><main className="layout-main" style={{paddingTop:96}}><Host/></main></ThemeContext.Provider></BrowserRouter>);`;
const mocks = `const wait=()=>new Promise(r=>setTimeout(r,100));
async function list(){window.reads.push('GET');await wait();window.finished++;if(window.negado)throw new Error('Cadastro QA negado');return structuredClone(window.rows)}
async function create(data){window.writes.push({kind:'POST',data});await wait();const row={...data,id:3};window.rows.push(row);return row}
async function update(id,data){window.writes.push({kind:'PUT',id,data});await wait();Object.assign(window.rows.find(r=>r.id===id),data)}
async function remove(id){window.writes.push({kind:'DELETE',id});await wait();window.rows=window.rows.filter(r=>r.id!==id)}
async function catalog(key){if(!location.search.includes('insumos'))return list();await wait();if(window.negado)throw new Error('Cadastro QA negado');return structuredClone(window[key])}
async function insumos(params={}){window.reads.push({kind:'insumos',params});const denied=window.negado;const rows=structuredClone(window.rows);await new Promise(r=>setTimeout(r,params.categoria_id==='2'?350:100));window.finished++;if(denied)throw new Error('Cadastro QA negado');return params.categoria_id?rows.filter(r=>String(r.categoria_id)===String(params.categoria_id)):rows}
async function bulk(data){window.writes.push({kind:'BULK',data});await wait();const failed=window.partial?['Linha 2: Erro ao criar insumo']:[];data.insumos.filter((_,i)=>!window.partial||i!==1).forEach((nome,i)=>window.rows.push({id:10+i,nome,unidade_id:data.unidade_id,categoria_id:data.categoria_id}));return {sucesso:data.insumos.length-failed.length,total:data.insumos.length,erros:failed}}
export const listarCategorias=()=>catalog('categories'),listarUnidades=()=>catalog('units'),criarCategoria=create,criarUnidade=create,atualizarCategoria=update,atualizarUnidade=update,deletarCategoria=remove,deletarUnidade=remove,listarFornecedoresCompra=list,criarFornecedorCompra=create,atualizarFornecedorCompra=update,desativarFornecedorCompra=remove,listarInsumos=insumos,criarInsumo=create,atualizarInsumo=update,deletarInsumo=remove,importarInsumosEmMassa=bulk;`;
const server = await createServer({root,configFile:false,server:{host:'127.0.0.1',port:0},plugins:[{
  name:'qa-cadastro-local',enforce:'pre',
  resolveId(id){if(id==='/fixture.jsx')return '\0qa-cadastro.jsx'},
  async load(id){if(id==='\0qa-cadastro.jsx')return transformWithEsbuild(entry,'fixture.jsx',{loader:'jsx',jsx:'transform'})},
  transform(_code,id){
    if(id.endsWith('/services/compras.js'))return mocks;
    if(id.endsWith('/contexts/AuthContext.jsx'))return `export const useAuth=()=>({user:window.readonly?{id:2,perfil:'USUARIO',area:'OBRA',modulos_habilitados:['COMPRAS','COTACOES'],areas_permissoes_configuradas:true,areas_permissoes:['compras.fornecedores.visualizar']}:{id:1,perfil:'SUPERADMIN',area:'GEO'}});`;
  },
  configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
    if(new URL(req.url,'http://localhost').pathname!=='/fixture')return next();
    res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml('/fixture',
      '<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
  })}
},react()]});
let browser,page;
const errors=[],external=[];
try {
  await server.listen();browser=await chromium.launch({channel:'chrome',headless:true});
  page=await browser.newPage();page.setDefaultTimeout(10000);
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{if(new URL(route.request().url()).hostname==='127.0.0.1')return route.continue();external.push(route.request().url());return route.abort()});
  const base='http://127.0.0.1:'+server.httpServer.address().port+'/fixture';
  const css=readFileSync(path.join(root,'dist/index.html'),'utf8').match(/href="\/assets\/([^\"]+\.css)"/)[1];
  const goto=async unit=>{await page.goto(base+(unit==='insumos'?'?insumos=1':unit==='fornecedor'?'?fornecedores=1':unit?'?unidades=1':''));await page.addStyleTag({path:path.join(root,'dist/assets',css)});await page.getByText('Cadastro QA',{exact:true}).waitFor()};
  const alternate=async()=>{const count=await page.evaluate(()=>window.finished);await page.evaluate(()=>window.qaTab(false));await page.getByText('Consulta auxiliar',{exact:true}).waitFor();await page.evaluate(()=>window.qaTab(true));await page.waitForFunction(count=>window.finished>count,count);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))};
  for (const width of [1366,390]) for (const unit of [false,true]) {
    await page.setViewportSize({width,height:900});await goto(unit);
    const field=page.getByPlaceholder(unit?'Ex.: Quilograma':'Ex.: Material de construção');
    const mass=page.getByLabel(unit?'Unidades para importar':'Categorias para importar',{exact:true});
    await field.fill('Novo último Z');if(unit)await page.getByPlaceholder('Ex.: kg').fill('nz');
    await page.getByRole('button',{name:/^Importação em massa/}).click();await mass.fill(unit?'Metro|m\nQuilo|kg':'Aço\nCimento Z');
    const text=await mass.inputValue();await alternate();await field.waitFor();
    await page.waitForFunction(()=>window.reads.length>=2);await page.getByRole('button',{name:'Adicionar',exact:true}).waitFor();
    assert.equal(await field.inputValue(),'Novo último Z');assert.equal(await mass.inputValue(),text);
    if(unit)assert.equal(await page.getByPlaceholder('Ex.: kg').inputValue(),'nz');
    assert.equal(await page.evaluate(()=>window.writes.length),0);
    await page.getByRole('button',{name:unit?'Nova unidade':'Nova categoria',exact:true}).click();
    await page.getByRole('button',{name:'Editar',exact:true}).first().click();await field.fill('Edição final Z');
    await alternate();await page.getByRole('button',{name:'Salvar',exact:true}).waitFor();
    assert.equal(await field.inputValue(),'Edição final Z');assert.equal(await page.evaluate(()=>window.writes.length),0);
    await page.evaluate(()=>window.rows[0].nome='Nome atual do servidor');await alternate();
    await page.getByRole('alert').filter({hasText:'O cadastro foi alterado'}).waitFor();
    assert.ok(await page.getByRole('button',{name:'Salvar',exact:true}).isDisabled());
    await page.getByRole('button',{name:'Usar dados atuais',exact:true}).evaluate(el=>el.scrollIntoView({block:'center'}));
    await page.getByRole('button',{name:'Usar dados atuais',exact:true}).click();
    await page.getByRole('dialog').getByRole('button',{name:'Usar dados atuais',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await field.inputValue(),'Nome atual do servidor');
    await field.fill('Editar uma vez');await page.locator('form').first().evaluate(form=>{form.requestSubmit();form.requestSubmit()});
    await page.getByText(unit?'Unidade atualizada.':'Categoria atualizada.',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.writes.filter(w=>w.kind==='PUT').length),1);
    await alternate();await page.getByText('Editar uma vez',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.writes.length),1);
    await page.getByRole('button',{name:'Editar',exact:true}).first().click();await field.fill('Não reutilizar DTO');
    await page.evaluate(()=>window.qaTab(false));await page.getByText('Consulta auxiliar',{exact:true}).waitFor();
    await page.evaluate(()=>{window.negado=true;window.qaTab(true)});await page.getByText('Cadastro QA negado',{exact:true}).waitFor();
    assert.equal(await field.inputValue(),'');assert.ok(await field.isDisabled());assert.equal(await page.getByText('Editar uma vez',{exact:true}).count(),0);
    assert.equal(await page.evaluate(()=>window.writes.length),1);
    await goto(unit);await page.getByRole('button',{name:'Editar',exact:true}).first().click();await field.fill('Registro removido');
    await page.evaluate(()=>window.rows=window.rows.filter(r=>r.id!==1));await alternate();
    await page.getByRole('alert').filter({hasText:'não disponível para edição'}).waitFor();assert.ok(await field.isDisabled());assert.equal(await field.inputValue(),'');
    assert.equal(await page.evaluate(()=>window.writes.length),0);
    console.log('OK '+width+'px '+(unit?'Unidades':'Categorias')+': novo/edicao/massa, revisao, negativa, removido e mutex; nenhum replay.');
  }
  for(const width of [1366,390]){
    await page.setViewportSize({width,height:900});await goto('fornecedor');
    const name=page.getByPlaceholder('Nome da pessoa ou razão social da empresa',{exact:true});
    const category=page.getByLabel('Nova categoria atendida',{exact:true});
    const search=page.getByPlaceholder('Buscar por nome, CNPJ, email ou contato',{exact:true});
    await name.fill('Novo fornecedor último Z');await category.fill('Categoria incompleta Z');await search.fill('Contato QA');
    await alternate();assert.equal(await name.inputValue(),'Novo fornecedor último Z');assert.equal(await category.inputValue(),'Categoria incompleta Z');
    assert.equal(await search.inputValue(),'Contato QA');assert.equal(await page.evaluate(()=>window.writes.length),0);
    await page.getByRole('button',{name:'Novo fornecedor',exact:true}).click();await page.getByRole('button',{name:'Editar',exact:true}).first().click();
    await name.fill('Fornecedor editado Z');await alternate();assert.equal(await name.inputValue(),'Fornecedor editado Z');
    await page.evaluate(()=>window.rows[0].nome='Nome atual do fornecedor');await alternate();
    await page.getByRole('alert').filter({hasText:'O cadastro foi alterado'}).waitFor();assert.ok(await name.isDisabled());
    await page.getByRole('button',{name:'Usar dados atuais',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Usar dados atuais',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await name.inputValue(),'Nome atual do fornecedor');
    await name.fill('Fornecedor salvo uma vez');await page.locator('form').first().evaluate(form=>{form.requestSubmit();form.requestSubmit()});
    await page.getByText('Fornecedor atualizado.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.writes.length),1);
    await alternate();await page.getByText('Fornecedor salvo uma vez',{exact:true}).waitFor();assert.equal(await name.inputValue(),'');
    await page.getByRole('button',{name:'Editar',exact:true}).first().click();await name.fill('Nao restaurar DTO');
    await page.evaluate(()=>window.negado=true);await alternate();await page.getByText('Cadastro QA negado',{exact:true}).waitFor();
    assert.equal(await name.inputValue(),'');assert.ok(await name.isDisabled());assert.equal(await page.getByText('Fornecedor salvo uma vez',{exact:true}).count(),0);
    assert.equal(await page.evaluate(()=>window.writes.length),1);
    await goto('fornecedor');await page.getByRole('button',{name:'Editar',exact:true}).first().click();await name.fill('Registro retirado');
    await page.evaluate(()=>window.rows=window.rows.filter(r=>r.id!==1));await alternate();await page.getByRole('alert').filter({hasText:'não disponível para edição'}).waitFor();
    assert.ok(await name.isDisabled());assert.equal(await name.inputValue(),'');
    await goto('fornecedor');await page.getByRole('button',{name:'Desativar',exact:true}).first().evaluate(el=>{el.click();el.click()});
    await page.getByRole('dialog',{name:'Desativar fornecedor',exact:true}).getByRole('button',{name:'Desativar',exact:true}).evaluate(el=>{el.click();el.click()});
    await page.getByText('Fornecedor desativado.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.writes.length),1);
    await goto('fornecedor');await page.getByRole('button',{name:'Editar',exact:true}).first().click();await name.fill('Nao mostrar em modo leitura');
    await page.evaluate(()=>window.readonly=true);await alternate();await page.getByText('Cadastro QA',{exact:true}).waitFor();
    assert.equal(await name.count(),0);assert.equal(await page.getByRole('button',{name:'Editar',exact:true}).count(),0);assert.equal(await page.evaluate(()=>window.writes.length),0);
    console.log('OK fornecedor '+width+'px: novo, campos/categoria/filtro, edicao/revisao, negativa, removido e mutex salvar/desativar.');
  }
  for(const width of [1366,390]){
    await page.setViewportSize({width,height:900});await goto('insumos');
    const name=page.getByLabel('Nome do insumo',{exact:true}), description=page.getByLabel('Descrição do insumo',{exact:true});
    const unit=page.getByLabel('Unidade do insumo',{exact:true}), category=page.getByLabel('Categoria do insumo',{exact:true});
    const mass=page.getByLabel('Insumos para importar',{exact:true});
    const search=page.getByPlaceholder('Buscar por nome, código, descrição, categoria ou unidade',{exact:true});
    await name.fill('Novo último Z');await description.fill('Descrição final Z');await unit.selectOption('1');await category.selectOption('1');
    await page.getByRole('button',{name:'Importar em massa',exact:true}).click();await mass.fill('Insumo A\nInsumo B Z');
    await page.getByLabel('Unidade da importação',{exact:true}).selectOption('1');await page.getByLabel('Categoria da importação',{exact:true}).selectOption('1');
    await search.fill('Pesquisa Z');await alternate();
    assert.equal(await name.inputValue(),'Novo último Z');assert.equal(await description.inputValue(),'Descrição final Z');assert.equal(await unit.inputValue(),'1');
    assert.equal(await mass.inputValue(),'Insumo A\nInsumo B Z');assert.equal(await search.inputValue(),'Pesquisa Z');assert.equal(await page.evaluate(()=>window.writes.length),0);
    await search.fill('');await page.getByRole('button',{name:'Novo insumo',exact:true}).click();await page.getByRole('button',{name:'Editar',exact:true}).first().click();
    await name.fill('Edição final Z');await alternate();assert.equal(await name.inputValue(),'Edição final Z');
    await page.evaluate(()=>window.rows[0].nome='Nome atual do insumo');await alternate();
    await page.getByRole('alert').filter({hasText:'O cadastro foi alterado'}).waitFor();assert.ok(await name.isDisabled());
    await page.getByRole('button',{name:'Usar dados atuais',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Usar dados atuais',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await name.inputValue(),'Nome atual do insumo');
    await name.fill('Salvo uma vez');await page.locator('form').first().evaluate(form=>{form.requestSubmit();form.requestSubmit()});
    await page.getByText('Insumo atualizado.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.writes.length),1);await alternate();assert.equal(await name.inputValue(),'');
    await page.getByRole('button',{name:'Editar',exact:true}).first().click();await name.fill('Campo negado');
    await page.evaluate(()=>window.negado=true);await alternate();await page.getByText('Cadastro QA negado',{exact:true}).waitFor();
    assert.ok(await name.isDisabled());assert.equal(await name.inputValue(),'');assert.equal(await mass.count(),0);assert.equal(await page.getByText('Salvo uma vez',{exact:true}).count(),0);
    await goto('insumos');await page.getByRole('button',{name:'Editar',exact:true}).first().click();await name.fill('Registro retirado');
    await page.evaluate(()=>window.rows=window.rows.filter(r=>r.id!==1));await alternate();await page.getByRole('alert').filter({hasText:'não disponível para edição'}).waitFor();assert.equal(await name.inputValue(),'');assert.ok(await name.isDisabled());
    await goto('insumos');await name.fill('Referência removida');await unit.selectOption('1');await page.evaluate(()=>window.units=[]);await alternate();
    await page.locator('form').first().evaluate(form=>form.requestSubmit());await page.getByText('Selecione unidade e categoria disponíveis no cadastro atual.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.writes.length),0);
    await goto('insumos');await page.getByRole('button',{name:'Importar em massa',exact:true}).click();await mass.fill('Importado A\nFalha B\nImportado C');await page.evaluate(()=>window.partial=true);
    await mass.locator('xpath=ancestor::form').evaluate(form=>{form.requestSubmit();form.requestSubmit()});
    await page.getByRole('alert').getByText('2 de 3 insumos importados com sucesso.',{exact:true}).waitFor();assert.equal(await mass.inputValue(),'Falha B');assert.equal(await page.evaluate(()=>window.writes.length),1);
    await alternate();assert.equal(await mass.inputValue(),'Falha B');assert.equal(await page.evaluate(()=>window.writes.length),1);
    await page.evaluate(()=>window.partial=false);await mass.locator('xpath=ancestor::form').evaluate(form=>form.requestSubmit());await page.getByRole('alert').getByText('1 de 1 insumos importados com sucesso.',{exact:true}).waitFor();
    assert.equal(await mass.inputValue(),'');assert.deepEqual(await page.evaluate(()=>window.writes[1].data.insumos),['Falha B']);await alternate();assert.equal(await page.evaluate(()=>window.writes.length),2);
    await goto('insumos');await page.getByRole('button',{name:'Excluir',exact:true}).first().evaluate(el=>{el.click();el.click()});
    await page.getByRole('dialog').getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal(await page.evaluate(()=>window.writes.length),0);
    await page.getByRole('button',{name:'Excluir',exact:true}).first().click();await page.getByRole('dialog').getByRole('button',{name:'Excluir',exact:true}).evaluate(el=>{el.click();el.click()});
    await page.getByText('Insumo excluído.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.writes.length),1);
    // Uma resposta antiga bem-sucedida nao pode vencer a negativa do recorte atual.
    await goto('insumos');await page.getByRole('button',{name:'Categoria',exact:true}).click();await page.getByRole('menu').getByText('Outra categoria QA',{exact:true}).click();
    await page.waitForFunction(()=>window.reads.some(r=>r.params?.categoria_id==='2'));
    await page.evaluate(()=>{window.negado=true;window.qaTab(false)});await page.getByText('Consulta auxiliar',{exact:true}).waitFor();await page.evaluate(()=>window.qaTab(true));
    await page.getByText('Cadastro QA negado',{exact:true}).waitFor();await page.waitForTimeout(400);
    assert.equal(await page.getByText('Outro QA',{exact:true}).count(),0);assert.ok(await name.isDisabled());assert.equal(await page.evaluate(()=>window.writes.length),0);
    console.log('OK insumos '+width+'px: cadastro/filtros/massa, ultima tecla, conflito/negativa, catalogo atual, parcial, resposta tardia e mutex.');
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('OK paginas reais e transporte isolado; sem acesso a banco/API de negocio.');
} catch(error) {
  console.error(await page?.evaluate(()=>({text:document.body.innerText,scrollY,header:document.querySelector('header')?.getBoundingClientRect().toJSON(),alert:document.querySelector('[role=alert]')?.getBoundingClientRect().toJSON()})));
  throw error;
} finally {await browser?.close();await server.close()}
