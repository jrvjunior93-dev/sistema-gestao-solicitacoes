// Fila/editor reais, sessao e transporte local isolados; sem API/banco externos.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer,transformWithEsbuild} from 'vite';
import {chromium} from 'playwright';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import tailwindConfig from '../tailwind.config.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),stub='\0qa-fila-fontes-';
const formas=[{id:3,nome:'PIX',tipo:'PIX',ativo:true},{id:8,nome:'Dinheiro',tipo:'DINHEIRO',ativo:true},
  {id:9,nome:'Permuta',tipo:'PERMUTA',ativo:true},{id:4,nome:'Cheque',tipo:'CHEQUE',ativo:true},
  {id:2,nome:'Cartão de débito',tipo:'CARTAO_DEBITO',ativo:true,exige_cartao:true},
  {id:1,nome:'Cartão de crédito',tipo:'CARTAO_CREDITO',ativo:true,exige_cartao:true,gera_fatura:true}];
const entrada=`import React,{useMemo}from'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';
import{WorkspacePageContext,createWorkspaceMemory}from'/src/navigation/WorkspaceContext.jsx';
import Page from'/src/pages/FinanceiroFilaPagamentos.jsx';import'/src/index.css';import'/src/styles/design-tokens.css';import'/src/styles/escala.css';import'/src/styles/componentes-padrao.css';import'/src/styles/responsive-system.css';
window.__previews=[];window.__writes=[];window.__alerts=[];window.__failConfirm=false;window.__stale=false;
window.__rows=[1,2].map(id=>({id,status:'PENDENTE',valor_previsto:200,juros:0,multa:0,titulo:{id,codigo:'TIT-QA-'+id,tipo:'PAGAR',status:'ABERTO',valor_saldo:200,valor_original:200,valor_baixado:0,empresa_id:1,parceiro_id:1,obra_id:1,forma_pagamento_id:3,data_vencimento:'2026-10-20',updatedAt:'2026-10-18T12:00:00Z',parceiro:{id:1,nome:'Fornecedor QA',cpf_cnpj:'12345678000100'},empresa:{id:1,nome:'Empresa QA'},obra:{id:1,nome:'Obra QA'}}}));
localStorage.setItem('financeiro-fila-pagamentos:modo-lista',JSON.stringify({numerada:true}));
function Host(){const memory=useMemo(()=>createWorkspaceMemory(),[]);return <WorkspacePageContext.Provider value={{key:'fila-fontes-qa',memory,snapshot:true,active:true}}><Page/></WorkspacePageContext.Provider>};
createRoot(document.getElementById('root')).render(<BrowserRouter><Host/></BrowserRouter>);`;
const plugin={name:'qa-fila-fontes',enforce:'pre',resolveId(s){
  if(s.endsWith('/contexts/AuthContext')||s==='./AuthContext')return stub+'auth';
  if(s.endsWith('/ThemeContext'))return stub+'theme';
  if(s==='../components/padrao'||s==='../padrao')return stub+'padrao';
  if(s.endsWith('/services/financeiro'))return stub+'api';
  if(s==='virtual:qa-fila-fontes')return stub+'entry';
},async load(id){
  if(id===stub+'entry')return(await transformWithEsbuild(entrada,'qa-fila-fontes.jsx',{loader:'jsx',jsx:'automatic'})).code;
  if(id===stub+'theme')return `export const useTheme=()=>({tema:{}});`;
  if(id===stub+'auth')return `const p=new URLSearchParams(location.search);const keys=['financeiro.fila_pagamentos.visualizar','financeiro.fila_pagamentos.baixar','financeiro.baixas_compostas.criar','financeiro.baixas_compostas.confirmar','financeiro.baixas_compostas.estornar','financeiro.titulos.estornar','financeiro.permutas.usar'];const perms=keys.filter(k=>!(p.has('sem-composta')&&k.includes('baixas_compostas'))&&!(p.has('sem-baixa')&&k==='financeiro.fila_pagamentos.baixar')&&!(p.has('sem-permuta')&&k==='financeiro.permutas.usar'));export const useAuth=()=>({user:{id:1,perfil:'USUARIO',financeiro_liberado:true,areas_permissoes_configuradas:true,areas_permissoes:perms}});`;
  if(id===stub+'padrao')return `export{default as Pagina}from'/src/components/padrao/Pagina.jsx';export{default as PageHeader}from'/src/components/padrao/PageHeader.jsx';export{default as BlocoConteudo}from'/src/components/padrao/BlocoConteudo.jsx';export{default as TabelaPadrao}from'/src/components/padrao/TabelaPadrao.jsx';const avisar={erro:s=>window.__alerts.push(s),alerta:s=>window.__alerts.push(s),sucesso:s=>window.__alerts.push(s)};export const useAvisos=()=>({avisos:[],fechar:()=>{},limpar:()=>{},avisar});export const Avisos=()=>null;export const useConfirmacao=()=>({confirmar:async()=>({ok:true})});`;
  if(id===stub+'api')return `const catalogo=${JSON.stringify(formas)};
    export const getSugestoesFilaPagamentos=async()=>({data:[],mais:false});
    export const getFilaPagamentos=async(params={})=>{let rows=window.__rows.filter(r=>params.status==='TODOS'||r.status===(params.status||'PENDENTE'));if(params.fila_ids){const ids=String(params.fila_ids).split(',').map(Number);rows=rows.filter(r=>ids.includes(r.id));}return{data:structuredClone(rows),pagina:1,total:rows.length,total_paginas:1,resumo:{PENDENTE:rows.length},filtros:{empresas:[],credores:[]}}};
    export const getContasFilaPagamentos=async()=>[{id:5,nome:'Conta QA',empresa_id:1,ativo:true},{id:6,nome:'Caixa QA',empresa_id:1,ativo:true,tipo_operacional:'CAIXA_INTERNO',exige_abertura_fechamento:true}];
    export const getInstrumentosFilaPagamentos=async()=>({formas:${JSON.stringify(formas)},cartoes:[{id:20,nome:'Débito QA',tipo:'DEBITO',ativo:true,conta_bancaria_id:5},{id:10,nome:'Crédito QA',tipo:'CREDITO',ativo:true,conta_bancaria_id:5}],cheques:[],empresas:[{id:1,nome:'Empresa QA'},{id:2,nome:'Empresa2 QA'}]});
    export const previewBaixaCompostaFila=async body=>{window.__previews.push(structuredClone(body));await new Promise(r=>setTimeout(r,120));return{versao_revisao:'a'.repeat(64),componentes:body.componentes,titulos:body.fila_ids,valor_principal:body.componentes.reduce((s,c)=>s+c.valor,0)}};
    export const confirmarBaixaCompostaFila=async(body,key)=>{window.__writes.push({body:structuredClone(body),key});await new Promise(r=>setTimeout(r,120));if(window.__stale)throw Object.assign(new Error('Saldo ou fontes mudaram. Valide novamente.'),{status:409});if(window.__failConfirm)throw Error('Falha de rede simulada');for(const id of body.fila_ids){const row=window.__rows.find(r=>r.id===id),partes=body.alocacoes.filter(a=>a.titulo_financeiro_id===row.titulo.id),total=partes.reduce((s,a)=>s+a.valor,0);row.titulo.valor_saldo-=total;row.titulo.valor_baixado+=total;row.titulo.status=row.titulo.valor_saldo?'PARCIAL':'QUITADO';row.status=row.titulo.valor_saldo?'DIVERGENTE':'BAIXADO';row.movimento_financeiro_id=100+id;row.instrumento_pagamento_json={multiplas_fontes:true,liquidacao_id:7,instrumentos:partes.map(p=>({...body.componentes[p.componente_index],forma_nome:catalogo.find(f=>f.id===body.componentes[p.componente_index].forma_pagamento_id).nome,empresa_nome:'Empresa QA',valor:p.valor})),fontes_titulo:partes.map((p,i)=>({componente:i,valor:p.valor}))};}return{baixados:body.fila_ids.length,pendentes_comprovante:body.fila_ids.length,liquidacao_id:7}};
    export const previewBaixaFinanceiraComposta=async()=>{throw Error('API de titulos nao pode ser usada pela fila')},confirmarBaixaFinanceiraComposta=previewBaixaFinanceiraComposta;
    export const anexarComprovanteFilaPagamento=async()=>{},anexarComprovanteFilaPagamentoLote=async()=>{},aprovarDivergenciasFilaPagamentos=async()=>{},getComprovanteFilaPagamento=async()=>{},informarNaoPagamentoFila=async()=>{},previewComprovantesFilaPagamentos=async()=>{},registrarBaixasFilaPagamentos=async()=>{throw Error('API de baixa simples nao pode confirmar composicao')},resolverFilaPagamento=async()=>{},estornarBaixaFilaPagamento=async()=>{},vincularComprovantesFilaPagamentos=async()=>{},getArquivosSolicitacaoFila=async()=>[];`;
},configureServer(server){server.middlewares.use('/qa-fontes-fila',async(_,res)=>{res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/qa-fontes-fila',`<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root" style="padding:12px;min-width:0"></div><script type="module">import 'virtual:qa-fila-fontes';</script></body></html>`));});}};
const server=await createServer({root,configFile:false,esbuild:{jsx:'automatic'},css:{postcss:{plugins:[tailwindcss(tailwindConfig),autoprefixer()]}},cacheDir:path.join(root,'../outputs/fila-fontes-cache'),plugins:[plugin],server:{host:'127.0.0.1',port:0}});
let browser,page;const errors=[];
try{
  await server.listen();browser=await chromium.launch({channel:'chrome',headless:true});page=await browser.newPage();page.setDefaultTimeout(12000);
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  const base='http://127.0.0.1:'+server.httpServer.address().port+'/qa-fontes-fila';
  const abrir=async(q='')=>{await page.goto(base+q);await page.getByLabel('Selecionar TIT-QA-1',{exact:true}).waitFor();};
  const fontes=()=>page.getByRole('button',{name:'Múltiplas fontes',exact:true});
  const preencher=async(primeiro=120,segundo=80)=>{
    const dialog=page.getByRole('dialog');await dialog.getByLabel('Valor da fonte *',{exact:true}).first().fill(String(primeiro));
    await dialog.getByLabel('Conta financeira *',{exact:true}).first().selectOption('5');
    await dialog.getByRole('button',{name:'Adicionar fonte',exact:true}).click();
    await dialog.getByLabel('Forma de pagamento *',{exact:true}).nth(1).selectOption('8');
    await dialog.getByLabel('Caixa físico *',{exact:true}).selectOption('6');
    await dialog.getByLabel('Valor da fonte *',{exact:true}).nth(1).fill(String(segundo));
  };
  const pasta=path.join(root,'../outputs/fila-multiplas-fontes-20261018');fs.mkdirSync(pasta,{recursive:true});
  for(const width of [1366,390]){
    await page.setViewportSize({width,height:900});await abrir();await fontes().first().click();await page.getByRole('dialog').waitFor();
    await preencher();assert.equal(await page.getByRole('dialog').getByRole('option',{name:'Cartão de crédito',exact:true}).count(),0);
    await page.getByRole('button',{name:'Validar e revisar',exact:true}).evaluate(el=>{el.click();el.click()});
    await page.getByRole('button',{name:'Confirmar pagamento',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__previews.length),1);assert.equal(await page.evaluate(()=>window.__writes.length),0);
    assert(await page.getByRole('dialog').evaluate(el=>{const r=el.firstElementChild.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1}),'Modal deve caber na viewport');
    await page.screenshot({path:path.join(pasta,`fontes-${width}.png`)});
    await page.evaluate(()=>window.__failConfirm=true);await page.getByRole('button',{name:'Confirmar pagamento',exact:true}).evaluate(el=>{el.click();el.click()});
    await page.getByText('Falha de rede simulada',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__writes.length),1);
    await page.evaluate(()=>window.__failConfirm=false);await page.getByRole('button',{name:'Confirmar pagamento',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    const writes=await page.evaluate(()=>window.__writes);assert.equal(writes.length,2);assert.equal(writes[0].key,writes[1].key);assert.deepEqual(writes[0].body,writes[1].body);
    assert.deepEqual(writes[0].body.fila_ids,[1]);assert.equal(writes[0].body.versao_revisao,'a'.repeat(64));assert.deepEqual(writes[0].body.componentes.map(c=>c.valor),[120,80]);
    assert.equal(await page.getByLabel('Selecionar TIT-QA-1',{exact:true}).count(),0);assert.equal(await page.getByLabel('Selecionar TIT-QA-2',{exact:true}).count(),1);
    await page.getByLabel('Status',{exact:true}).fill('Baixados');
    await page.getByRole('button',{name:'Baixados',exact:true}).click();
    await page.getByText('Múltiplas fontes',{exact:true}).waitFor();
    assert(await page.getByText(/PIX.*120,00/).isVisible());assert(await page.getByText(/Dinheiro.*80,00/).isVisible());
  }
  await abrir();await page.getByLabel('Selecionar TIT-QA-1',{exact:true}).check();await page.getByLabel('Selecionar TIT-QA-2',{exact:true}).check();
  await page.getByRole('button',{name:'Baixa com múltiplas fontes',exact:true}).click();await preencher(240,160);
  await page.getByRole('button',{name:'Validar e revisar',exact:true}).click();await page.getByRole('button',{name:'Confirmar pagamento',exact:true}).waitFor();
  const preview=await page.evaluate(()=>window.__previews[0]);assert.deepEqual(preview.fila_ids,[1,2]);assert.equal(preview.alocacoes.length,3);
  await page.evaluate(()=>window.__stale=true);await page.getByRole('button',{name:'Confirmar pagamento',exact:true}).click();await page.getByText('Saldo ou fontes mudaram. Valide novamente.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Confirmar pagamento',exact:true}).count(),0);assert(await page.getByRole('button',{name:'Validar e revisar',exact:true}).isEnabled());
  await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);assert(await page.getByLabel('Selecionar TIT-QA-1',{exact:true}).isChecked());
  for(const q of ['?sem-composta','?sem-baixa']){
    await abrir(q);assert.equal(await fontes().count(),0);assert.equal(await page.getByRole('button',{name:'Baixa com múltiplas fontes',exact:true}).count(),0);assert.equal(await page.evaluate(()=>window.__writes.length),0);
  }
  await abrir('?sem-permuta');await fontes().first().click();assert.equal(await page.getByRole('dialog').getByRole('option',{name:'Permuta',exact:true}).count(),0);
  await page.getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal(await page.evaluate(()=>window.__writes.length),0);
  assert.deepEqual(errors,[]);console.log('Fila/editor reais: combinacao PIX+dinheiro, selecionados, payload/revisao, mutex/retry mesma chave, 409 exige revisao, cancelar/Escape/selecao, permissoes independentes e1366/390px aprovados. APIs simuladas.');
}catch(e){console.error(await page?.evaluate(()=>document.body.innerText));console.error(errors);throw e;}
finally{await browser?.close();await server.close();}
