// Faturas reais, servicos isolados em memoria; nenhuma baixa/banco real.
import './validarFaturaItensUnificados.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer,transformWithEsbuild} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const entry=`import React,{useState,useMemo}from'react';import{createRoot}from'react-dom/client';import{BrowserRouter,Routes,Route}from'react-router-dom';
import{ThemeContext,TEMA_PADRAO}from'/src/contexts/ThemeContext.jsx';import{WorkspacePageContext,WorkspaceContext,createWorkspaceMemory}from'/src/navigation/WorkspaceContext.jsx';
import List from'/src/pages/FinanceiroFaturasCartao.jsx';import Detail from'/src/pages/FinanceiroFaturaCartaoDetalhe.jsx';
window.reads=[];window.writes=[];window.opens=[];window.denied=false;window.readonly=false;
window.fatura={id:1,competencia:'2026-10',status:'ABERTA',valor_total:100,cartao:{id:1,bandeira:'QA',ultimos_digitos:'1234',contaBancaria:{id:3,nome:'Controle QA'}},titulos:[{id:1,codigo:'TIT-FATURA-QA',parceiro:{nome:'Credor QA'},status:'ABERTO',valor_original:100,valor_saldo:100}]};
function Host({list}){const[active,A]=useState(true);const memory=useMemo(()=>createWorkspaceMemory(),[]);window.qaTab=A;
return <WorkspaceContext.Provider value={{canOpen:true,openTab:(route)=>{window.opens.push(route);A(false);return 'nova-aba'}}}><WorkspacePageContext.Provider value={{key:list?'lista-fatura':'fatura-1',memory,snapshot:true,active:true}}>{active?(list?<List/>:<Detail/>):<p>Consulta auxiliar</p>}</WorkspacePageContext.Provider></WorkspaceContext.Provider>}
createRoot(document.getElementById('root')).render(<BrowserRouter><ThemeContext.Provider value={{tema:TEMA_PADRAO}}><main className='layout-main' style={{paddingTop:96}}><Routes><Route path='/fixture' element={<Host list/>}/><Route path='/fixture/:id' element={<Host/>}/></Routes></main></ThemeContext.Provider></BrowserRouter>);`;
const mocks=`const copy=v=>structuredClone(v),wait=()=>new Promise(r=>setTimeout(r,120));
export const getCartoesFinanceiros=async()=>[window.fatura.cartao];
export const getFaturasCartaoFinanceiro=async params=>{window.reads.push({kind:'list',params});await wait();if(window.denied)throw new Error('Faturas negadas QA');return [copy(window.fatura)]};
export const getFaturaCartaoFinanceiro=async()=>{window.reads.push({kind:'detail'});await wait();if(window.denied)throw new Error('Fatura negada QA');return copy(window.fatura)};
export const getContasBancarias=async()=>[{id:1,nome:'Conta real QA',ativo:true}];
export const baixarFaturaCartaoFinanceiro=async(id,data)=>{window.writes.push({id,data});await wait();window.fatura.status='PAGA';if(window.fatura.titulos[0]){window.fatura.titulos[0].status='QUITADO';window.fatura.titulos[0].valor_saldo=0;}return copy(window.fatura)};`;
const server=await createServer({root,configFile:false,logLevel:'error',server:{host:'127.0.0.1',port:0},plugins:[{name:'qa-faturas',enforce:'pre',
  resolveId(id){if(id==='/fixture.jsx')return '\0qa-faturas.jsx'},
  async load(id){if(id==='\0qa-faturas.jsx')return transformWithEsbuild(entry,'fixture.jsx',{loader:'jsx',jsx:'transform'})},
  transform(_code,id){if(id.endsWith('/src/services/financeiro.js'))return mocks;
    if(id.endsWith('/src/contexts/AuthContext.jsx'))return "export const useAuth=()=>({user:window.readonly?{id:2,perfil:'USUARIO',area:'OBRA',areas_permissoes_configuradas:true,areas_permissoes:['financeiro.cartoes.visualizar']}:{id:1,perfil:'SUPERADMIN',area:'FINANCEIRO'}});";
  },
  configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(!/^\/fixture(?:\/\d+)?$/.test(new URL(req.url,'http://localhost').pathname))return next();res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml('/fixture','<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'))})}
},react()]});
let browser,page;const errors=[],external=[];
try{
  await server.listen();browser=await chromium.launch({channel:'chrome',headless:true});page=await browser.newPage();page.setDefaultTimeout(12000);
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue();external.push(r.request().url());return r.abort()});
  const base='http://127.0.0.1:'+server.httpServer.address().port+'/fixture';
  const css=readFileSync(path.join(root,'dist/index.html'),'utf8').match(/href="\/assets\/([^\"]+\.css)"/)[1];
  const goto=async(detail=false)=>{await page.goto(base+(detail?'/1':''));await page.addStyleTag({path:path.join(root,'dist/assets',css)})};
  const alternate=async()=>{await page.evaluate(()=>window.qaTab(false));await page.getByText('Consulta auxiliar',{exact:true}).waitFor();await page.evaluate(()=>window.qaTab(true))};
  for(const width of [1366,390]){
    await page.setViewportSize({width,height:900});await goto();const search=page.getByPlaceholder('Competência, cartão ou conta',{exact:true});
    await search.fill('1234');await page.getByRole('link',{name:'Abrir detalhes da fatura 2026-10',exact:true}).click();await page.getByText('Consulta auxiliar',{exact:true}).waitFor();
    assert.deepEqual(await page.evaluate(()=>window.opens),['/financeiro/faturas-cartao/1']);await page.evaluate(()=>window.qaTab(true));await search.waitFor();
    assert.equal(await search.inputValue(),'1234');await page.getByRole('link',{name:'Abrir detalhes da fatura 2026-10',exact:true}).waitFor();
    assert.deepEqual(await page.evaluate(()=>window.reads.at(-1).params),{status:'ABERTA'});assert.equal(await page.evaluate(()=>window.writes.length),0);
    await page.evaluate(()=>window.denied=true);await alternate();await page.getByText('Faturas negadas QA',{exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'Abrir detalhes da fatura 2026-10',exact:true}).count(),0);

    await goto(true);const conta=page.getByLabel('Conta bancária da fatura',{exact:true});await conta.selectOption('1');
    const obs=page.getByPlaceholder('Opcional',{exact:true});await obs.fill('Pagamento última Z');await alternate();await conta.waitFor();
    assert.equal(await conta.inputValue(),'1');assert.equal(await obs.inputValue(),'Pagamento última Z');assert.equal(await page.evaluate(()=>window.writes.length),0);
    await page.evaluate(()=>{window.fatura.valor_total=80;window.fatura.titulos[0].valor_saldo=80});await alternate();await page.getByRole('alert').filter({hasText:'O saldo ou status da fatura mudou'}).waitFor();
    assert.ok(await conta.isDisabled());assert.equal(await obs.inputValue(),'Pagamento última Z');
    await page.getByRole('button',{name:'Usar dados atuais',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Usar dados atuais',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
    await conta.selectOption('1');await obs.fill('Baixa explícita QA');await page.locator('form').evaluate(el=>{el.requestSubmit();el.requestSubmit()});
    const confirmation=page.getByRole('dialog',{name:'Registrar o pagamento desta fatura?',exact:true});await confirmation.waitFor();
    await confirmation.getByRole('button',{name:'Baixar fatura',exact:true}).evaluate(el=>{el.click();el.click()});
    await page.getByText(/Pagamento da fatura registrado/).waitFor();assert.equal(await page.evaluate(()=>window.writes.length),1);
    assert.equal(await page.evaluate(()=>window.writes[0].data.observacoes),'Baixa explícita QA');await alternate();await page.getByText('Fatura 2026-10',{exact:true}).waitFor();assert.equal(await obs.count(),0);assert.equal(await page.evaluate(()=>window.writes.length),1);
    await goto(true);await conta.waitFor();await conta.selectOption('1');await obs.fill('Não exibir sem permissão');await page.evaluate(()=>window.readonly=true);await alternate();await page.getByText('Consulta disponível. A baixa da fatura exige permissão específica.',{exact:true}).waitFor();assert.equal(await obs.count(),0);
    await page.evaluate(()=>window.denied=true);await alternate();await page.getByText('Fatura não encontrada.',{exact:true}).waitFor();assert.equal(await page.getByText('TIT-FATURA-QA',{exact:true}).count(),0);assert.equal(await page.evaluate(()=>window.writes.length),0);
    await goto(true);await conta.waitFor();
    await page.evaluate(()=>{window.fatura.titulos=[];window.fatura.compras_rateadas=[
      {id:10,titulo_financeiro_id:10,valor_quitacao:45,data_movimento:'2026-10-13',titulo:{codigo:'TIT-RATEIO-A',descricao:'Parte A',parceiro:{nome:'Credor A'}}},
      {id:11,titulo_financeiro_id:11,valor_quitacao:55,data_movimento:'2026-10-13',titulo:{codigo:'TIT-RATEIO-B',descricao:'Parte B',parceiro:{nome:'Credor B'}}}];});
    await alternate();await page.getByText('TIT-RATEIO-A',{exact:true}).waitFor();await page.getByText('TIT-RATEIO-B',{exact:true}).waitFor();
    await page.getByRole('heading',{name:'Títulos da fatura',exact:true}).waitFor();
    assert.equal(await page.getByRole('heading',{name:'Compras e parcelas nesta fatura',exact:true}).count(),0);
    assert.equal(await page.getByText(/^R\$\s45,00$/).count(),1);
    assert.equal(await page.getByText(/^R\$\s55,00$/).count(),1);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:path.join(root,`../outputs/fatura-rateada-${width}.png`),fullPage:true});
    await conta.selectOption('1');await page.locator('form').evaluate(el=>el.requestSubmit());
    await page.getByRole('dialog',{name:'Registrar o pagamento desta fatura?',exact:true}).getByRole('button',{name:'Baixar fatura',exact:true}).click();
    await page.getByText(/Pagamento da fatura registrado/).waitFor();assert.equal(await page.evaluate(()=>window.writes.length),1);
    assert.equal(await conta.count(),0,'Fatura so de rateios pode pagar, mas nao oferece segunda baixa depois de PAGA');

    await goto(true);await conta.waitFor();
    await page.evaluate(()=>{
      window.fatura.valor_total='555.34';
      window.fatura.titulos=[{id:1,codigo:'TIT-LEGADO',descricao:'Compra antiga',parceiro:{nome:'Credor legado'},
        status:'QUITADO',valor_original:'100.00',valor_saldo:'0.00',data_compra:'2026-09-17',numero_parcela:2,total_parcelas:6}];
      const parte=(id,tituloId,codigo,valor,extra={})=>({id,titulo_financeiro_id:tituloId,valor_quitacao:valor,
        titulo:{id:tituloId,codigo,descricao:'Compra QA',parceiro:{nome:'MONDAY.COM LTDA.'},status:'QUITADO',valor_original:'1200.00',valor_saldo:'0.00'},...extra});
      window.fatura.compras_rateadas=[
        parte('parcela-10',2,'TIT-MONDAY-A','198.00',{parcela_cartao_id:10,numero_parcela:1,quantidade_parcelas:1,data_compra:'2026-09-17'}),
        parte('parcela-11',3,'TIT-MONDAY-B','198.00',{parcela_cartao_id:11,numero_parcela:1,quantidade_parcelas:1,data_compra:'2026-09-28'}),
        parte('parcela-12',4,'TIT-PARCELADO','33.34',{parcela_cartao_id:12,numero_parcela:2,quantidade_parcelas:3,data_compra:'2026-08-10'}),
        parte(10,5,'TIT-MULTIFONTE','12.00',{data_movimento:'2026-09-20'}),
        parte(11,5,'TIT-MULTIFONTE','14.00',{data_movimento:'2026-09-20'})];
      window.snapshot=JSON.stringify(window.fatura);
    });
    await alternate();await page.getByText('TIT-MONDAY-A',{exact:true}).waitFor();
    assert.equal(await page.getByRole('heading',{name:'Títulos da fatura',exact:true}).count(),1);
    assert.equal(await page.getByRole('heading',{name:'Compras e parcelas nesta fatura',exact:true}).count(),0);
    for(const codigo of ['TIT-LEGADO','TIT-MONDAY-A','TIT-MONDAY-B','TIT-PARCELADO'])
      assert.equal(await page.getByText(codigo,{exact:true}).count(),1);
    assert.equal(await page.getByText('TIT-MULTIFONTE',{exact:true}).count(),2);
    assert.equal(await page.getByText('1/1',{exact:true}).count(),2);
    assert.equal(await page.getByText('2/3',{exact:true}).count(),1);
    assert.equal(await page.getByText(/^R\$\s198,00$/).count(),2);
    assert.equal(await page.getByText(/^R\$\s33,34$/).count(),1);
    assert.equal(await page.getByText(/^R\$\s1\.200,00$/).count(),0);
    await page.getByText('5 título(s)',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>JSON.stringify(window.fatura)===window.snapshot),true);
    assert.equal(await page.evaluate(()=>window.writes.length),0,'Consultar lista unificada nao registra baixa');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:path.join(root,`../outputs/fatura-unificada-${width}.png`),fullPage:true});
    await page.evaluate(()=>window.readonly=true);await alternate();
    await page.getByText('Consulta disponível. A baixa da fatura exige permissão específica.',{exact:true}).waitFor();
    await page.getByText('TIT-MONDAY-A',{exact:true}).waitFor();assert.equal(await conta.count(),0);
    await page.evaluate(()=>window.denied=true);await alternate();
    await page.getByText('Fatura não encontrada.',{exact:true}).waitFor();
    assert.equal(await page.getByText('TIT-MONDAY-A',{exact:true}).count(),0);
    console.log('OK faturas '+width+'px: busca/origem, GET atual, conta/observacoes, conflito, permissao/negativa e baixa unica sem replay.');
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
}catch(error){console.error(errors);console.error((await page?.locator('body').innerText())?.slice(0,5000));throw error}
finally{await browser?.close();await server.close()}
