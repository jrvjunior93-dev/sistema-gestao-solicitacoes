// Formulario interno e portal reais, com dados ficticios e rede externa bloqueada.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer,transformWithEsbuild} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.resolve(root,'../outputs/cotacao-total-disponivel');fs.mkdirSync(out,{recursive:true});
const item={id:71,item_tipo:'MANUAL',nome:'Material QA',unidade:'UN',quantidade:10,quantidade_solicitada:'10',quantidade_original:'10',
 quantidade_disponivel:'4',preco:'20',ipi_valor:'3',icms_valor:'2',st_valor:'1',frete_valor:'5',quantidade_minima_item:'',observacao:''};
const cotacao={id:10,status:'ENVIADO',fornecedor:{nome:'Fornecedor QA'},frete_tipo:'EMBUTIDO',frete_modo:'POR_ITEM',frete_valor:0,
 difal_valor:7,desconto_total:3,condicao_pagamento:'PIX',prazo_entrega_dias:3,prazo_entrega_tipo:'DIAS_CORRIDOS'};
const seed={cotacao,fornecedor:{nome:'Fornecedor QA'},solicitacao:{id:666,obra:{nome:'Obra QA'}},itens:[item]};
const form={...cotacao,nova_oferta_saldo:false,valor_minimo_pedido:'',observacao_resposta:'',frete_transportador_nome:'',frete_transportador_cpf_cnpj:'',itens:[item]};
const fixture=`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route}from'react-router-dom';
import{ModalRespostaInternaCotacao}from'/src/modules/solicitacao-compra/pages/GerenciarCotacaoSolicitacao.jsx';
import Publica from'/src/modules/solicitacao-compra/pages/CotacaoFornecedorPublica.jsx';import{ThemeContext,TEMA_PADRAO}from'/src/contexts/ThemeContext.jsx';
import'/src/index.css';import'/src/styles/design-tokens.css';import'/src/styles/componentes-padrao.css';import'/src/styles/escala.css';
window.seed=${JSON.stringify(seed)};window.saves=0;
function App(){const[f,F]=useState(${JSON.stringify(form)});const pub=location.search.includes('publica');return<MemoryRouter initialEntries={['/cotacao/qa']}><ThemeContext.Provider value={{tema:TEMA_PADRAO}}>
{pub?<Routes><Route path='/cotacao/:token' element={<Publica/>}/></Routes>:<ModalRespostaInternaCotacao cotacao={${JSON.stringify(cotacao)}} form={f} onChange={(k,v)=>F(s=>({...s,[k]:v}))}
onChangeItem={(i,k,v)=>F(s=>({...s,itens:s.itens.map((x,j)=>j===i?{...x,[k]:v}:x)}))} onSalvar={()=>window.saves++} onFechar={()=>{}}/>}
</ThemeContext.Provider></MemoryRouter>}createRoot(document.getElementById('root')).render(<App/>);`;
const server=await createServer({root,configFile:false,logLevel:'error',cacheDir:path.join(out,'vite-cache'),server:{host:'127.0.0.1',port:0},
 plugins:[{name:'qa-total-disponivel',enforce:'pre',resolveId(id){if(id==='/fixture.jsx')return'\0qa-total.jsx'},
 async load(id){if(id==='\0qa-total.jsx')return transformWithEsbuild(fixture,'fixture.jsx',{loader:'jsx',jsx:'transform'})},
 transform(code,id){if(id.endsWith('/pages/GerenciarCotacaoSolicitacao.jsx'))return code+'\nexport{ModalRespostaInternaCotacao};';
 if(id.endsWith('/services/compras.js'))return code.replace(/export async function obterCotacaoPublica[\s\S]*?\n}/,'export async function obterCotacaoPublica(){return structuredClone(window.seed);}')},
 configureServer(s){s.middlewares.use(async(req,res,next)=>{if(new URL(req.url,'http://localhost').pathname!='/fixture')return next();res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml('/fixture',
 '<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'))})}},react()]});
let browser,page;const errors=[],external=[];
try{
 await server.listen();browser=await chromium.launch({channel:'chrome',headless:true});const base='http://127.0.0.1:'+server.httpServer.address().port;
 for(const width of [1366,390])for(const publica of [false,true]){
  page=await browser.newPage({viewport:{width,height:900}});page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>{if(r.request().url().startsWith(base))return r.continue();external.push('externa');return r.abort()});
  await page.goto(base+'/fixture'+(publica?'?publica=1':''));
  const stat=label=>page.locator('.app-stat').filter({has:page.getByText(label,{exact:true})}).locator('.app-stat-valor');
  const totalLabel=publica?'Total estimado da proposta':'Total estimado';
  await stat('Mercadorias').waitFor();
  const expectValue=async(label,value)=>assert.match(await stat(label).innerText(),new RegExp(value.replace('.','\\.')));
  await expectValue('Mercadorias','80,00');await expectValue(totalLabel,'95,00');
  await page.getByText(/R\$\s*91,00/).first().waitFor();
  const qtd=page.getByLabel('Quantidade disponível de Material QA',{exact:true});
  await qtd.fill('2,5');await expectValue('Mercadorias','50,00');await expectValue(totalLabel,'65,00');await page.getByText(/R\$\s*61,00/).first().waitFor();
  await page.getByLabel('Preço unitário de Material QA',{exact:true}).fill('25');
  await expectValue('Mercadorias','62,50');await expectValue(totalLabel,'77,50');
  if(!publica){await page.getByLabel('Quantidade solicitada de Material QA',{exact:true}).fill('100');await expectValue('Mercadorias','62,50');}
  await qtd.fill('50');await expectValue('Mercadorias','1.250,00');await expectValue(totalLabel,'1.265,00');
  await qtd.fill('0');await expectValue('Mercadorias','0,00');await expectValue(totalLabel,'15,00');
  await qtd.fill('');await expectValue('Mercadorias','0,00');
  await qtd.fill('4');await expectValue('Mercadorias','100,00');await expectValue(totalLabel,'115,00');
  assert.equal(await page.evaluate(()=>window.saves),0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Sem rolagem horizontal da pagina');
  await page.screenshot({path:path.join(out,`${publica?'publica':'interna'}-${width}.png`),fullPage:true});await page.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('PASS: resposta interna/publica reais1366/390; disponivel4/2,5/50/zero/vazio, preco, solicitada independente, total/tributos/desconto/frete preservados; sem envio/BD/rede externa.');
}finally{await browser?.close();await server.close()}
