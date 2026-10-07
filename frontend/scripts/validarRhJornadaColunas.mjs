import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
import { formatCurrencyInput, parseCurrencyInput } from '../src/utils/formatters.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=readFileSync(path.join(root,'src/pages/RhDpJornada.jsx'),'utf8');
const grade=source.slice(source.indexOf('titulo="Lançamento por colaborador"'),source.indexOf('itens={linhasTabela}'));
for(const id of ['salario','regime_pagamento','valor_empreitada','servico_executado']) {
  assert.doesNotMatch(grade,new RegExp(`id: '${id}'`));
}
assert.doesNotMatch(source,/<option value="EMPREITADA"/);
const hydrate=vm.runInNewContext(source.slice(source.indexOf('function linhaVazia('),source.indexOf('/**\n * SEMPRE ABA'))+'; linhaVazia',{formatCurrencyInput});
const base={colaborador_id:1,nome:'Ana Teste',tipo_vinculo:'CLT',empresa_grupo_id:3,dias_vinculados:30,forma_calculo_gerencial:'MENSAL',salario_base:5000,pix_titulo:{chave_pix:'pix-teste'}};
const legacy={...base,jornada_informada:{regime_pagamento:'EMPREITADA',servico_executado:'Servico legado',valor_empreitada:1200,dias_trabalhados:5},edicao_jornada:{id:9,status:'AUTORIZADA'}};
assert.equal(hydrate(base).regime_pagamento,'NORMAL');
assert.equal(hydrate(legacy).servico_executado,'Servico legado');
const handler=source.slice(source.indexOf('async function enviar('),source.indexOf('async function anexarComprovantesDaJornada('));
async function submit(seed,{duplo=false,problema=false}={}) {
  const sent=[],errors=[],lock={current:false};
  const fn=vm.runInNewContext(handler+'; enviar',{
    linhas:[seed],comProblema:problema?[seed]:[],diasBase:30,competencia:'2026-09',obra:'7',empresa:'',etapaPagamento:'',ETAPAS_HABILITADAS:false,
    envioPendenteRef:lock,idempotencyKeyRef:{current:null},limpar(){},podeEditarLinha:()=>true,parseCurrencyInput,
    avisar:{erro:msg=>errors.push(msg),sucesso(){}},confirmar:async()=>({ok:true}),
    setJornadaEnviada(){},setSalvando(){},carregar:async()=>{},
    registrarJornadaRh:async(payload)=>{sent.push(payload);await Promise.resolve();return{};}
  });
  await Promise.all([fn({preventDefault(){}}),...(duplo?[fn({preventDefault(){}})]:[])]);
  return {sent,errors,lock};
}
const normal={...hydrate(base),dias_trabalhados:'20',faltas:'1'};
const sent=await submit(normal,{duplo:true});
assert.equal(sent.sent.length,1); assert.equal(sent.sent[0].linhas[0].regime_pagamento,'NORMAL');
assert.equal(sent.sent[0].linhas[0].dias_trabalhados,20); assert.equal(sent.sent[0].linhas[0].valor_empreitada,0);
assert.equal(sent.errors.length,0);
const antigo=await submit(hydrate(legacy));
assert.equal(antigo.sent[0].linhas[0].regime_pagamento,'EMPREITADA');
assert.equal(antigo.sent[0].linhas[0].servico_executado,'Servico legado');
assert.equal(antigo.sent[0].linhas[0].valor_empreitada,1200,'Reenvio nao apaga empreitada legada');
assert.equal((await submit(normal,{problema:true})).sent.length,0);
assert.equal((await submit({...normal,adicionais:'100,00',observacoes:''})).sent.length,0,'Ajuste mensal continua exigindo observacao');

// Pagina real e tabela padrao, servicos simulados e rede externa bloqueada.
const modules={
  auth:`export const useAuth=()=>({user:{id:2,perfil:'USUARIO',setor:'OBRA',areas_permissoes_configuradas:true,areas_permissoes:location.search.includes('consulta')?[]:['rh_dp.solicitacoes.abrir']}});`,
  obras:`export const getObras=async()=>[{id:7,nome:'Obra de teste'}]; export const getMinhasObras=getObras;`,
  configuracoesSistema:`export * from '/src/services/configuracoesSistema.js'; export const getTemaSistema=async()=>null; export const salvarTemaSistema=async()=>null;`,
  rhDp:`export * from '/src/services/rhDp.js'; window.posts=[];
    export const getRhEmpresasGrupo=async()=>[{id:3,nome:'Empresa de teste'}];
    export const getEdicoesJornadaPendentesRh=async()=>[];
    export const colaboradoresParaJornadaRh=async()=>[${JSON.stringify(base)}];
    export const listarRhSolicitacoes=async()=>[];
    export const registrarJornadaRh=async payload=>{window.posts.push(payload);await new Promise(r=>setTimeout(r,180));return{solicitacao:{id:55}};};`
};
const fixture=`import React from 'react'; import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';
import Rh from '/src/pages/RhDpJornada.jsx';import {ThemeProvider} from '/src/contexts/ThemeContext.jsx';
import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/componentes-padrao.css';
import '/src/styles/responsive-system.css';
createRoot(document.getElementById('root')).render(<ThemeProvider><MemoryRouter><main className="layout-main rhdp-page"><Rh/></main></MemoryRouter></ThemeProvider>);`;
const server=await createServer({root,configFile:false,logLevel:'error',server:{host:'127.0.0.1',port:0},
  define:{'import.meta.env.VITE_RH_JORNADA_40_60_ETAPAS':'"OFF"','import.meta.env.VITE_RH_JORNADA_GERENCIAL_V2':'"OFF"'},
  plugins:[{name:'rh-jornada-colunas-fixture',enforce:'pre',resolveId(id){
    if(id==='/fixture.jsx')return '\0rh-jornada-fixture.jsx';
    if(/(^|\/)AuthContext(?:\.jsx)?$/.test(id))return '\0rh:auth';
    const service=id.match(/services\/(\w+)$/)?.[1];
    if(service!=='auth' && modules[service])return '\0rh:'+service;
  },async load(id){
    if(id==='\0rh-jornada-fixture.jsx')return transformWithEsbuild(fixture,'fixture.jsx',{loader:'jsx',jsx:'transform'});
    if(id.startsWith('\0rh:'))return modules[id.slice(4)];
  },configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
    if(new URL(req.url,'http://localhost').pathname!=='/fixture')return next();
    res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml('/fixture','<html lang="pt-BR"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
  });}},react()],optimizeDeps:{include:['react','react-dom/client','react-router-dom']}});
let browser;
try{
  await server.listen();browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1366,height:850}}),errors=[];
  page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  const url=`http://127.0.0.1:${server.httpServer.address().port}/fixture`;
  async function mount(query=''){
    await page.goto(url+query);await page.getByRole('button',{name:'Montar lista',exact:true}).waitFor();
    await page.getByRole('button',{name:'Montar lista',exact:true}).click();
    await page.getByText('Ana Teste',{exact:true}).waitFor();
  }
  await mount();
  const headers=await page.getByRole('columnheader').allTextContents();
  for(const text of ['Base de calculo','Salário / diária','Pagamento','Empreitada','Valor empreitada','Serviço executado'])assert.ok(!headers.some(h=>h.trim()===text),text+' removido');
  await page.getByLabel(/Dias trabalhados de Ana Teste/).fill('20');
  const output=path.resolve(root,'../outputs/rh-jornada-colunas');mkdirSync(output,{recursive:true});
  await page.screenshot({path:path.join(output,'claro.png')});
  await page.evaluate(()=>{document.documentElement.dataset.theme='dark';document.documentElement.classList.add('dark');});
  await page.screenshot({path:path.join(output,'escuro.png')});
  await page.getByRole('button',{name:'Enviar jornada',exact:true}).evaluate(el=>{el.click();el.click();});
  await page.getByText(/Jornada de 1 colaborador\(es\) registrada/).waitFor();
  assert.equal(await page.evaluate(()=>window.posts.length),1);
  assert.equal(await page.evaluate(()=>window.posts[0].linhas[0].regime_pagamento),'NORMAL');
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,'celular.png')});
  await mount('?consulta');assert.equal(await page.getByRole('button',{name:'Enviar jornada',exact:true}).count(),0);
  assert.deepEqual(errors,[]);
  console.log('Jornada: colunas removidas, envio NORMAL, legado preservado, ajustes/limites, permissoes, duplo clique e QA local validados. Sem banco real.');
}finally{await browser?.close();await server.close();}
