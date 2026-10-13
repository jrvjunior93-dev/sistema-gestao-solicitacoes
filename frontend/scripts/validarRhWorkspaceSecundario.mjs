// Paginas reais, servicos interceptados em memoria; nenhum banco/.env/rede externa.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '../outputs/rh-workspace-secundario');
mkdirSync(output, { recursive: true });
const entry = `import React,{useState,useMemo}from'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';
import{WorkspacePageContext,createWorkspaceMemory}from'/src/navigation/WorkspaceContext.jsx';
import{ThemeContext,TEMA_PADRAO}from'/src/contexts/ThemeContext.jsx';
import Eventos from'/src/pages/RhDpEventosRecorrentes.jsx';import Transferencias from'/src/pages/RhDpTransferencias.jsx';
import Documentos from'/src/pages/RhDpDocumentos.jsx';import Relatorio from'/src/pages/RhDpRelatorioOperacional.jsx';
import Importacoes from'/src/pages/RhDpImportacoes.jsx';
window.writes=[];window.reads=[];window.negado=false;window.changed=false;
window.locais=[{id:1,nome:'Origem QA',codigo:'1'},{id:2,nome:'Destino QA',codigo:'2'},{id:3,nome:'Nova origem QA',codigo:'3'}];
window.evento={id:81,ativo:true,codigo:'OUTRO',valor:100,competencia_inicio:'2026-10',parcelas_total:2,parcelas_valores:[100,100],
parcelas_aplicadas:0,colaborador:{id:7,nome:'Ana QA',obra:{id:1,nome:'Origem QA'}}};
window.colaborador={id:7,nome:'Ana QA',cargo:'QA',matricula:'QA-7',obra_id:1,obra:window.locais[0]};
window.transferencia={id:10,colaborador:{id:7,nome:'Ana QA'},obra:window.locais[0],obra_id:1,obra_destino_id:2,
obra_destino_nome:'Destino QA',situacao:'ABERTA',historicos:[],pode_decidir:true,pode_cancelar:false};
window.importacao={id:88,tipo:'JORNADA',competencia:'2026-10',obra:window.locais[0],status:'PREVIEW',total_linhas:1,total_validas:1,total_erros:0,linhas:[]};
function Host(){const[active,A]=useState(true);const memory=useMemo(()=>createWorkspaceMemory(),[]);window.qaTab=A;window.qaMemory=memory;
const events=new URLSearchParams(location.search).has('eventos');const readonly=new URLSearchParams(location.search).has('readonly');
const docs=new URLSearchParams(location.search).has('documentos');const report=new URLSearchParams(location.search).has('relatorio');
const imports=new URLSearchParams(location.search).has('importacoes');
return <WorkspacePageContext.Provider value={{key:events?'eventos-qa':'transfer-qa',memory,snapshot:true,active:true}}>
{active?(imports?<Importacoes/>:docs?<Documentos obraId={1} comoAba/>:report?<Relatorio obraId={1} comoAba/>:events?<Eventos podeDecidir={!readonly} somenteLeitura={readonly} obraId={1}/>:<Transferencias obraId={1}/>):<p>Consulta auxiliar</p>}
</WorkspacePageContext.Provider>}
createRoot(document.getElementById('root')).render(<BrowserRouter><ThemeContext.Provider value={{tema:TEMA_PADRAO}}><main className="layout-main"><Host/></main></ThemeContext.Provider></BrowserRouter>);`;
const mocks = `const copy=v=>structuredClone(v);const wait=()=>new Promise(r=>setTimeout(r,120));
export async function listarEventosRecorrentesRh(params){window.reads.push({kind:'eventos',params});await wait();if(window.negado)throw new Error('Evento QA negado');return [copy(window.evento)]}
export async function atualizarEventoRecorrenteRh(id,data){window.writes.push({kind:'editar',id,data});await wait();Object.assign(window.evento,data);return copy(window.evento)}
export async function desativarEventoRecorrenteRh(id,motivo){window.writes.push({kind:'cancelar',id,motivo});await wait();window.evento.ativo=false}
export async function getRhEmpresasGrupo(){return []}
export async function getRhDocumentoTipos(){return []}
export async function getRhDocumentos(params){window.reads.push({kind:'documentos',params});await wait();if(window.negado)throw new Error('Documento QA negado');return {data:[{id:12,colaborador_id:7,colaborador:{nome:'Documento Ana QA'},nome_original:'doc-qa.pdf',status:'ENVIADO',ativo:true}],meta:{page:params.page,total_pages:3,total:60,limit:20}}}
export async function getRhDocumentoLink(){throw new Error('Preview fora desta fixture')}
export async function substituirRhDocumento(){window.writes.push({kind:'substituir'})}
export async function getRhRelatorioOperacional(params){window.reads.push({kind:'relatorio',params});await wait();if(window.negado)throw new Error('Relatório QA negado');return {resumo:{colaboradores_ativos:1},colaboradores:{analitico:[{id:7,nome:'Relatório Ana QA'}]},documentos:{}}}
export async function getRhImportacoes(params){window.reads.push({kind:'importacoes',params});await wait();if(window.negado)throw new Error('Importação QA negada');return [copy(window.importacao)]}
export async function getRhImportacao(id){window.reads.push({kind:'importacao',id});await wait();if(window.negado)throw new Error('Importação QA negada');return copy(window.importacao)}
export async function criarPreviewRhImportacao(data){window.writes.push({kind:'preview',data:{...data,file:undefined}});await wait();return copy(window.importacao)}
export async function confirmarRhImportacao(id){window.writes.push({kind:'confirmarImportacao',id});await wait();window.importacao.status='CONFIRMADA';return copy(window.importacao)}
export async function rhTransferencias(p='',opts={}){
window.reads.push({kind:'transfer',p,opts});await wait();
if(window.negado)throw new Error('Transferência QA negada');
if(opts.method==='POST'){window.writes.push({kind:'transfer',p,data:opts.data});return {id:10}}
if(p==='/configuracao')return {obras:copy(window.locais),obras_responsavel_ids:[1],acesso_global:false};
if(p==='/diretorio')return {itens:[copy(window.colaborador)],total:1,pagina:opts.params.pagina};
if(p==='/10')return copy(window.transferencia);
return {itens:[copy(window.transferencia)],total:1,pagina:1,limite:20,total_paginas:1,nao_lidas:0};
}`;
const server = await createServer({root,configFile:false,logLevel:'error',cacheDir:path.join(output,'vite-cache'),
  server:{host:'127.0.0.1',port:0},plugins:[{name:'qa-rh-secundario',enforce:'pre',
    resolveId(id){if(id==='/fixture.jsx')return '\0qa-secundario.jsx'},
    async load(id){if(id==='\0qa-secundario.jsx')return transformWithEsbuild(entry,'fixture.jsx',{loader:'jsx',jsx:'transform'})},
    transform(_code,id){if(id.endsWith('/src/services/rhDp.js'))return mocks;
      if(id.endsWith('/src/contexts/AuthContext.jsx'))return "export const useAuth=()=>({user:{id:3,perfil:'SUPERADMIN',area:'DP',setor:{codigo:'DP'}}});";
      if(id.endsWith('/src/services/obras.js'))return 'export const getObras=async()=>window.locais;';
      if(id.endsWith('/src/hooks/useUiVisibility.js'))return 'export const useUiVisibility=()=>({isVisible:()=>true});';
    },
    configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
      if(new URL(req.url,'http://localhost').pathname!=='/fixture')return next();
      res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml('/fixture',
        '<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
    })}
  },react()]});
let browser,page;
const errors=[],external=[];
try{
  await server.listen();browser=await chromium.launch({channel:'chrome',headless:true});
  page=await browser.newPage();page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(30000);
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{if(new URL(route.request().url()).hostname==='127.0.0.1')return route.continue();external.push(route.request().url());return route.abort()});
  const base='http://127.0.0.1:'+server.httpServer.address().port+'/fixture';
  const css=readFileSync(path.join(root,'dist/index.html'),'utf8').match(/href="\/assets\/([^\"]+\.css)"/)[1];
  const goto=async search=>{await page.goto(base+search);await page.addStyleTag({path:path.join(root,'dist/assets',css)})};
  const alternate=async()=>{await page.evaluate(()=>window.qaTab(false));await page.getByText('Consulta auxiliar',{exact:true}).waitFor();await page.evaluate(()=>window.qaTab(true))};
  for(const width of [1366,390]){
    await page.setViewportSize({width,height:900});await goto('?eventos=1');
    await page.getByRole('button',{name:'Editar evento de Ana QA',exact:true}).click();
    const modal=page.getByRole('dialog',{name:'Editar evento recorrente'});
    const obs=modal.getByLabel('Observações',{exact:true});await obs.fill('Último caractere Z');
    await alternate();await obs.waitFor();assert.equal(await obs.inputValue(),'Último caractere Z');
    assert.equal(await page.evaluate(()=>window.writes.length),0);
    await page.evaluate(()=>{window.evento.parcelas_aplicadas=1;window.evento.parcelas_aplicadas_valores=[100]});
    await alternate();await modal.getByRole('alert').waitFor();assert.equal(await obs.inputValue(),'Último caractere Z');
    assert.ok(await modal.getByRole('button',{name:'Salvar alterações',exact:true}).isDisabled());
    await page.evaluate(()=>window.qaTab(false));await page.getByText('Consulta auxiliar',{exact:true}).waitFor();
    await page.evaluate(()=>{window.negado=true;window.qaTab(true)});await page.getByText('Evento QA negado',{exact:true}).waitFor();
    assert.equal(await modal.count(),0);assert.equal(await page.getByText('Ana QA',{exact:true}).count(),0);
    await goto('?eventos=1');await page.getByRole('button',{name:'Editar evento de Ana QA',exact:true}).click();
    await obs.fill('Salvar uma vez');await modal.locator('form').evaluate(el=>{el.requestSubmit();el.requestSubmit()});
    await modal.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.writes.length),1);
    await alternate();await page.getByRole('button',{name:'Editar evento de Ana QA',exact:true}).waitFor();
    assert.equal(await modal.count(),0);assert.equal(await page.evaluate(()=>window.writes.length),1);
    await goto('?eventos=1&readonly=1');await page.getByText('Ana QA',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Editar evento de Ana QA',exact:true}).count(),0);

    await goto('');const search=page.getByLabel('Nome, matrícula ou função',{exact:true});await search.fill('Ana');
    await page.getByRole('button',{name:'Pesquisar',exact:true}).click();
    await page.getByRole('button',{name:'Solicitar transferência',exact:true}).click();
    const transfer=page.getByRole('dialog',{name:'Solicitar transferência entre obras'});
    await transfer.getByLabel('Obra de destino',{exact:true}).selectOption('2');
    const justification=transfer.getByLabel('Justificativa',{exact:true});await justification.fill('Destino e texto Z');
    await alternate();await justification.waitFor();assert.equal(await justification.inputValue(),'Destino e texto Z');
    assert.equal(await transfer.getByLabel('Obra de destino',{exact:true}).inputValue(),'2');
    assert.equal(await search.inputValue(),'Ana');assert.equal(await page.evaluate(()=>window.writes.length),0);
    await page.evaluate(()=>{window.colaborador.obra_id=3;window.colaborador.obra=window.locais[2]});
    await alternate();await transfer.getByRole('alert').waitFor();
    assert.ok(await transfer.getByRole('button',{name:'Enviar para aprovação',exact:true}).isDisabled());
    await page.evaluate(()=>window.qaTab(false));await page.getByText('Consulta auxiliar',{exact:true}).waitFor();
    await page.evaluate(()=>{window.negado=true;window.qaTab(true)});await page.getByText('Transferência QA negada',{exact:true}).first().waitFor();
    assert.equal(await transfer.count(),0);
    await goto('');await page.getByRole('tab',{name:'Transferências deste local',exact:true}).click();
    await page.getByRole('button',{name:'Abrir',exact:true}).click();
    const detail=page.getByRole('dialog',{name:'Transferência #10'});const comment=detail.getByLabel('Comentário / motivo da rejeição',{exact:true});
    await comment.fill('Comentário mantido Z');const writes=await page.evaluate(()=>window.writes.length);
    await page.evaluate(()=>{window.transferencia.pode_decidir=false;window.transferencia.situacao='APROVADA'});
    await alternate();await comment.waitFor();assert.equal(await comment.inputValue(),'Comentário mantido Z');
    assert.equal(await detail.getByRole('button',{name:'Aprovar transferência',exact:true}).count(),0);
    assert.equal(await page.evaluate(()=>window.writes.filter(w=>!['/leituras'].includes(w.p)).length),0);
    assert.ok(await page.evaluate(()=>window.writes.length)>=writes); // Somente leitura de notificacoes legada.
    await page.evaluate(()=>window.qaTab(false));await page.getByText('Consulta auxiliar',{exact:true}).waitFor();
    await page.evaluate(()=>{window.negado=true;window.qaTab(true)});await page.getByText('Transferência QA negada',{exact:true}).first().waitFor();
    assert.equal(await detail.count(),0);

    await goto('?documentos=1');await page.getByText('Documento Ana QA',{exact:true}).waitFor();
    const docSearch=page.getByPlaceholder('Buscar por colaborador, CPF, matrícula, arquivo ou observação');
    await docSearch.fill('Arquivo Z');await page.getByRole('button',{name:'Próxima página',exact:true}).click();
    await page.getByText('Página 2 de 3',{exact:true}).waitFor();
    await alternate();await docSearch.waitFor();assert.equal(await docSearch.inputValue(),'Arquivo Z');
    await page.getByText('Página 2 de 3',{exact:true}).waitFor();
    const docRead=await page.evaluate(()=>window.reads.filter(r=>r.kind==='documentos').at(-1).params);
    assert.equal(docRead.obra_id,1);assert.equal(docRead.page,2);assert.equal(docRead.q,'Arquivo Z');
    assert.equal(await page.evaluate(()=>window.writes.length),0);
    await page.evaluate(()=>window.qaTab(false));await page.getByText('Consulta auxiliar',{exact:true}).waitFor();
    await page.evaluate(()=>{window.negado=true;window.qaTab(true)});await page.getByText('Documento QA negado',{exact:true}).waitFor();
    assert.equal(await page.getByText('Documento Ana QA',{exact:true}).count(),0);

    await goto('?relatorio=1');await page.getByText('Relatório Ana QA',{exact:true}).waitFor();
    const start=page.getByLabel('Data inicial',{exact:true});await start.fill('01/10/2026');await start.blur();
    await page.getByRole('button',{name:'Atualizar relatório',exact:true}).click();
    await page.getByText('Relatório Ana QA',{exact:true}).waitFor();
    const applied=await start.inputValue();await start.fill('02/10/2026');await start.blur();const input=await start.inputValue();
    await alternate();await start.waitFor();assert.equal(await start.inputValue(),input);
    await page.getByText('Relatório Ana QA',{exact:true}).waitFor();
    const reportRead=await page.evaluate(()=>window.reads.filter(r=>r.kind==='relatorio').at(-1).params);
    assert.equal(reportRead.obra_id,1);assert.equal(reportRead.data_inicial,'2026-10-01');assert.notEqual(input,applied);
    assert.equal(await page.evaluate(()=>window.writes.length),0);
    await page.evaluate(()=>window.qaTab(false));await page.getByText('Consulta auxiliar',{exact:true}).waitFor();
    await page.evaluate(()=>{window.negado=true;window.qaTab(true)});await page.getByText('Relatório QA negado',{exact:true}).waitFor();
    assert.equal(await page.getByText('Relatório Ana QA',{exact:true}).count(),0);

    await goto('?importacoes=1');await page.getByRole('button',{name:'Ver preview da importação 88',exact:true}).waitFor();
    const importObs=page.getByLabel('Observações do lote',{exact:true});await importObs.fill('Observação Z');
    await page.getByRole('button',{name:'Ver preview da importação 88',exact:true}).click();
    await page.getByRole('button',{name:'Confirmar importação',exact:true}).waitFor();
    await alternate();await importObs.waitFor();assert.equal(await importObs.inputValue(),'Observação Z');
    await page.getByRole('button',{name:'Confirmar importação',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.writes.length),0);
    await page.evaluate(()=>window.importacao.status='CONFIRMADA');await alternate();await importObs.waitFor();
    await page.getByRole('button',{name:'Voltar para lista',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Confirmar importação',exact:true}).count(),0);
    await page.evaluate(()=>window.qaTab(false));await page.getByText('Consulta auxiliar',{exact:true}).waitFor();
    await page.evaluate(()=>{window.negado=true;window.qaTab(true)});await page.getByText('Importação QA negada',{exact:true}).first().waitFor();
    assert.equal(await page.getByRole('button',{name:'Voltar para lista',exact:true}).count(),0);
    await goto('?importacoes=1');await page.getByRole('button',{name:'Ver preview da importação 88',exact:true}).click();
    await page.getByRole('button',{name:'Confirmar importação',exact:true}).click();
    await page.getByRole('dialog').getByRole('button',{name:'Confirmar importação',exact:true}).click();
    await page.waitForFunction(()=>window.writes.length===1);await page.getByRole('dialog').waitFor({state:'hidden'});
    await alternate();await importObs.waitFor();await page.getByRole('button',{name:'Voltar para lista',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Confirmar importação',exact:true}).count(),0);assert.equal(await page.evaluate(()=>window.writes.length),1);
    console.log('OK RH secundario '+width+'px: eventos/transferencias/documentos/relatorio/importacoes, inputs e origem atual, negativas, permissao fresca, sem replay e mutex.');
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('OK paginas reais isoladas. Nenhum acesso a API/banco de negocio.');
}catch(error){console.error('Erros de pagina:',errors);if(page){await page.screenshot({path:path.join(output,'falha.png')});console.error((await page.locator('body').innerText()).slice(0,5000));console.error(await page.locator('[role="dialog"]').evaluateAll(es=>es.map(e=>({label:e.getAttribute('aria-label'),hidden:e.getAttribute('aria-hidden'),parents:[e.parentElement?.outerHTML.slice(0,200)],observations:e.querySelector('textarea')?.outerHTML}))))}throw error}
finally{await browser?.close();await server.close()}
