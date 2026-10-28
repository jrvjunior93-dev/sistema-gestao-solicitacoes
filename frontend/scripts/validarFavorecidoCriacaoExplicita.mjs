// Paginas reais, services ficticios em memoria. Nenhuma API/banco/EC2 real.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer,transformWithEsbuild} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'../outputs/favorecido-explicito');
fs.mkdirSync(out,{recursive:true});
const mocks=new Map(['financeiro','parceiros','solicitacoes','empresasGrupo','obras','apropriacoes'].map(name=>{
 const source=fs.readFileSync(path.join(root,'src/services/'+name+'.js'),'utf8');
 return[name,[...source.matchAll(/export (?:async )?function (\w+)/g)].map(m=>'export async function '+m[1]+'(...args){return window.qaService('+JSON.stringify(m[1])+',args)}').join('\n')];
}));
const fixture=[
 "import React,{useState}from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';",
 "import Card from'/src/pages/SolicitacaoDetalhe/FinanceiroCard.jsx';import Novo from'/src/pages/FinanceiroTituloNovo.jsx';",
 "import'/src/index.css';import'/src/styles/design-tokens.css';import'/src/styles/componentes-padrao.css';",
 "const query=new URLSearchParams(location.search);window.qaUser=query.has('readonly')?{id:2,perfil:'COMPRAS',areas_permissoes_configuradas:true,areas_permissoes:['financeiro.titulos.visualizar']}:{id:1,perfil:'SUPERADMIN'};",
 "const partners=[{id:4,nome:'Credor QA',cpf_cnpj:'11222333000181',fornecedor:true,pix_chave_fixa_1_tipo:'EMAIL',pix_chave_fixa_1:'credor@qa.test'},{id:5,nome:'Outro credor QA',cpf_cnpj:'11222333000181',fornecedor:true,pix_chave_fixa_1_tipo:'EMAIL',pix_chave_fixa_1:'outro@qa.test'},{id:9,nome:'Favorecido da solicitacao QA',cpf_cnpj:'52998224725'}];",
 "const saved=[{id:77,parceiro_id:4,ativo:true,nome:'Favorecido antigo QA',cpf_cnpj:'52998224725',pix_tipo_chave:'EMAIL',pix_chave:'antigo@qa.test'}];",
 "window.qa={reads:[],writes:[],delay:0,release:null};",
 "window.qaService=async(name,args)=>{window.qa.reads.push(name);if(/^(criar|atualizar|gerar|salvar|enviar|excluir|remover)/.test(name)){window.qa.writes.push({name,args});return{id:88}}",
 "if(name==='getTitulosFinanceirosPorSolicitacao')return[];",
 "if(name==='getCategoriasFinanceiras')return[{id:6,nome:'Despesa QA',tipo:'PAGAR',ativo:true}];",
 "if(name==='getFormasPagamentoFinanceiras')return[{id:1,nome:'PIX',tipo:'PIX',ativo:true},{id:2,nome:'Transferencia',tipo:'TRANSFERENCIA',ativo:true}];",
 "if(name==='getPaymentBeneficiaries'){if(window.qa.delay)await new Promise(r=>{window.qa.release=r});return saved;}",
 "if(name==='buscarParceiroPorId')return partners.find(p=>p.id===Number(args[0]));if(name==='buscarParceiros')return partners.filter(p=>p.fornecedor);",
 "if(name==='getEmpresasGrupo')return[{id:3,nome:'Empresa QA'}];",
 "if(name==='getMinhasObras'||name==='getObras')return[{id:2,nome:'Obra QA',empresa_grupo_id:3}];return[]};",
 "window.fetch=()=>{throw Error('REDE_FORA_DA_FIXTURE')};window.EventSource=class{addEventListener(){}removeEventListener(){}close(){}};",
 "const source={id:10,codigo:'SOL-QA-10',valor:100,data_vencimento:'2090-01-31',tipo:{nome:'DESPESA ADMINISTRATIVA'},obra:{id:2,nome:'Obra QA',empresa_grupo_id:3},parceiro:partners[0],forma_pagamento_id:1};",
 "function Host(){const[s,S]=useState(source);window.qaReplace=patch=>S({...source,...patch});return <Card solicitacao={s} podeAcessarModuloFinanceiro podeVisualizarTitulos podeOperarAbaFinanceiro={!query.has('readonly')} somenteLeitura={query.has('readonly')}/>}",
 "createRoot(document.getElementById('root')).render(<MemoryRouter>{query.has('novo')?<Novo/>:<Host/>}</MemoryRouter>);"
].join('\n');
const server=await createServer({root,configFile:false,logLevel:'error',cacheDir:path.join(out,'vite-cache'),server:{host:'127.0.0.1',port:0},plugins:[{
 name:'qa-favorecido',enforce:'pre',resolveId(id){if(id==='/fixture.jsx')return'\0favorecido.jsx'},
 load(id){if(id==='\0favorecido.jsx')return transformWithEsbuild(fixture,'fixture.jsx',{loader:'jsx',jsx:'transform'})},
 transform(code,id){if(id.endsWith('/src/contexts/AuthContext.jsx'))return'export function useAuth(){return{user:window.qaUser,authReady:true,isAuthenticated:true}}';
  for(const[name,mock]of mocks)if(id.endsWith('/src/services/'+name+'.js'))return mock;},
 configureServer(s){s.middlewares.use(async(req,res,next)=>{if(new URL(req.url,'http://local').pathname!=='/fixture')return next();
  res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml('/fixture','<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'))})}
},react()]});
let browser,page;const errors=[];
const empty=async area=>{for(const name of [/^Nome do favorecido/,/^CPF\/CNPJ/,/^Chave PIX/])assert.equal(await area.getByRole('textbox',{name}).inputValue(),'');};
try{
 await server.listen();browser=await chromium.launch({channel:'chrome',headless:true});page=await browser.newPage();page.setDefaultTimeout(15000);
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 const url='http://127.0.0.1:'+server.httpServer.address().port+'/fixture';
 for(const width of [1366,390]){
  await page.setViewportSize({width,height:950});await page.goto(url);
  await page.getByRole('button',{name:'Criar Título',exact:true}).click();const modal=page.getByRole('dialog');
  await modal.getByRole('combobox',{name:/Favorecido bancário vinculado/}).locator('option[value="77"]').waitFor({state:'attached'});
  const pix=modal.getByRole('checkbox',{name:'Preparar PIX',exact:true}),own=modal.getByRole('checkbox',{name:'Usar o próprio credor como favorecido',exact:false});
  assert(await pix.isChecked());assert(!(await own.isChecked()));await empty(modal);
  await modal.getByLabel('Categoria financeira deste título',{exact:true}).fill('Despesa');
  await modal.getByRole('option',{name:/Despesa QA/}).click();
  await page.locator('#form-gerar-conta').evaluate(form=>{form.noValidate=true});
  await modal.getByRole('button',{name:'Confirmar',exact:true}).click();
  await page.getByText('Preencha os dados PIX do favorecido do titulo 1.',{exact:true}).waitFor();
  assert.equal((await page.evaluate(()=>window.qa.writes)).length,0);
  await page.locator('.app-avisos').getByRole('button',{name:'Fechar',exact:true}).click();
  await own.check();assert.equal(await modal.getByRole('textbox',{name:/^Nome do favorecido/}).inputValue(),'Credor QA');
  assert.equal(await modal.getByRole('textbox',{name:/^Chave PIX/}).inputValue(),'credor@qa.test');
  await own.uncheck();await empty(modal);
  await pix.uncheck();await pix.check();await empty(modal);
  const saved=modal.getByRole('combobox',{name:/Favorecido bancário vinculado/});
  await saved.selectOption('77');assert.equal(await modal.getByRole('textbox',{name:/^Chave PIX/}).inputValue(),'antigo@qa.test');
  await saved.selectOption('');await empty(modal);
  await modal.getByRole('textbox',{name:/^Nome do favorecido/}).fill('Digitado QA');
  await modal.getByRole('button',{name:'Fechar',exact:true}).click();
  await page.getByRole('button',{name:'Criar Título',exact:true}).click();await empty(modal);
  await modal.getByText('Dados para pagamento deste título',{exact:true}).locator('xpath=../../..').screenshot({path:path.join(out,'card-'+width+'.png')});
  await modal.getByRole('button',{name:'Fechar',exact:true}).click();
  await page.evaluate(()=>window.qaReplace({id:11,favorecido_id:9,favorecido:{id:9,nome:'Favorecido da solicitacao QA',cpf_cnpj:'52998224725'},favorecido_chave_pix:'origem@qa.test'}));
  await page.getByRole('button',{name:'Criar Título',exact:true}).click();
  assert.equal(await modal.getByRole('textbox',{name:/^Nome do favorecido/}).inputValue(),'Favorecido da solicitacao QA');
  assert.equal(await modal.getByRole('textbox',{name:/^Chave PIX/}).inputValue(),'origem@qa.test');
  assert.equal((await page.evaluate(()=>window.qa.writes)).length,0);
  await page.goto(url);await page.evaluate(()=>{window.qa.delay=1});
  await page.getByRole('button',{name:'Criar Título',exact:true}).click();
  await modal.getByRole('textbox',{name:/^Nome do favorecido/}).fill('Digitado antes da consulta QA');
  await page.waitForFunction(()=>typeof window.qa.release==='function');
  await page.evaluate(()=>window.qa.release());
  await modal.getByRole('combobox',{name:/Favorecido bancário vinculado/}).locator('option[value="77"]').waitFor({state:'attached'});
  assert.equal(await modal.getByRole('textbox',{name:/^Nome do favorecido/}).inputValue(),'Digitado antes da consulta QA');
  assert.equal(await modal.getByRole('textbox',{name:/^Chave PIX/}).inputValue(),'');
  await modal.getByRole('button',{name:'Fechar',exact:true}).click();
  for(const instruction of [true,false]){
   await page.evaluate(instruction=>window.qaReplace(instruction
    ? {id:20,pagamentos_favorecidos:[{id:8,favorecido_id:9,nome_favorecido:'Favorecido da origem',cpf_cnpj:'52998224725',valor:100,forma_pagamento_id:1,favorecido_chave_pix:'origem@qa.test'}]}
    : {id:21,tipo:{nome:'COMPRA DIRETA'},compra_direta:{id:31,formas_pagamento_json:[{id:2,valor:100}]}}),instruction);
   await page.getByRole('button',{name:'Criar Título',exact:true}).click();
   await modal.getByLabel('Categoria financeira deste título',{exact:true}).fill('Despesa');
   await modal.getByRole('option',{name:/Despesa QA/}).click();
   for(const date of await modal.getByLabel('Vencimento',{exact:true}).all())await date.fill('31/01/2090');
   assert.equal(await modal.getByRole('checkbox',{name:'Preparar PIX',exact:true}).count(),0);
   const before=await page.evaluate(()=>window.qa.writes.length);
   await modal.getByRole('button',{name:'Confirmar',exact:true}).click();
   await modal.waitFor({state:'hidden'});
   const calls=await page.evaluate(before=>window.qa.writes.slice(before),before);
   assert.equal(calls.length,1);assert.equal(calls[0].name,'gerarContaPorSolicitacao');
   if(instruction)assert.equal(calls[0].args[1].pagamentos[0].favorecido_pagamento_id,'9');
  }
  await page.goto(url+'?novo');
  const search=page.getByPlaceholder('Buscar credor por nome ou CPF/CNPJ');await search.fill('Credor');
  await page.getByRole('button',{name:/^Credor QA/}).click();
  const beneficiary=page.getByRole('combobox',{name:/Favorecido bancário vinculado/});
  await beneficiary.locator('option[value="77"]').waitFor({state:'attached'});
  assert(await page.getByRole('checkbox',{name:/Preparar PIX para este credor/}).isChecked());await empty(page);
  const ownNovo=page.getByRole('checkbox',{name:/Usar o mesmo credor como favorecido/});
  await ownNovo.check();assert.equal(await page.getByRole('textbox',{name:/^Chave PIX/}).inputValue(),'credor@qa.test');
  await ownNovo.uncheck();await empty(page);
  await beneficiary.selectOption('77');await beneficiary.selectOption('');await empty(page);
  await ownNovo.check();await search.fill('Outro');await page.getByRole('button',{name:/^Outro credor QA/}).click();
  await beneficiary.locator('option[value="77"]').waitFor({state:'attached'});await empty(page);assert(!(await ownNovo.isChecked()));
  assert.equal((await page.evaluate(()=>window.qa.writes)).length,0);
 }
 await page.goto(url+'?readonly');await page.waitForFunction(()=>window.qa.reads.includes('getTitulosFinanceirosPorSolicitacao'));
 assert.equal(await page.getByRole('button',{name:'Criar Título',exact:true}).count(),0);
 assert.deepEqual(errors,[]);
 console.log('PASS favorecido explicito: Card/Novo reais1366/390, sem herdar cadastro, PIX ativo, credor por clique, novo limpa, troca de credor e origem preservada; zero gravacoes reais.');
}catch(e){if(page){fs.writeFileSync(path.join(out,'falha.txt'),await page.locator('body').innerText());await page.screenshot({path:path.join(out,'falha.png')});}throw e}
finally{await browser?.close();await server.close()}
