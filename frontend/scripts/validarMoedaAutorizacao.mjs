// Componente real, teclado real do navegador, sem banco/API/biometria externos.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.resolve(root,'../outputs/qa-moeda-autorizacao');fs.mkdirSync(output,{recursive:true});
const server=await createServer({root,cacheDir:path.join(output,'vite-cache'),server:{host:'127.0.0.1',port:5354,strictPort:true,proxy:{}},plugins:[{
 name:'qa-moeda-autorizacao',configureServer(s){s.middlewares.use('/qa-moeda',async(_req,res)=>{
  res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml('/qa-moeda',`<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';
import Valor,{conferirValorAutorizacao}from'/src/components/financeiro/ValorAutorizacao.jsx';
import '/src/styles/design-tokens.css';import '/src/styles/financeiro-autorizacoes-pagamento.css';
const item={titulo_financeiro_id:11,valor_snapshot:5000,snapshot_json:{codigo:'TIT-MOEDA'}};
function App(){const[value,setValue]=React.useState(undefined),[erro,setErro]=React.useState(''),[disabled,setDisabled]=React.useState(false);
window.__setValor=setValue;window.__desabilitar=setDisabled;window.__envios ||= [];
return React.createElement('main',{style:{padding:12,maxWidth:600,fontFamily:'Arial',fontSize:14}},
React.createElement(Valor,{item,value,disabled,onChange:v=>{setValue(v);setErro('')}}),
React.createElement('output',{'data-testid':'canonico'},String(value??item.valor_snapshot)),
React.createElement('button',{onClick:()=>{try{window.__envios.push(conferirValorAutorizacao(item,value));setErro('')}catch(e){setErro(e.message)}}},'Conferir valor'),
React.createElement('p',{role:'status'},erro));}createRoot(document.getElementById('root')).render(React.createElement(App));
</script></body></html>`));
 });}
}]});
await server.listen();let browser;
try{
 browser=await chromium.launch({headless:true,channel:'chrome'});
 const page=await browser.newPage(),errors=[],unexpected=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>{if(new URL(r.request().url()).origin==='http://127.0.0.1:5354')return r.continue();unexpected.push(r.request().url());return r.abort();});
 await page.goto('http://127.0.0.1:5354/qa-moeda');
 const campo=page.getByLabel('Valor a autorizar de TIT-MOEDA',{exact:true}),canonico=page.getByTestId('canonico');
 const texto=async()=> (await campo.inputValue()).replace(/\s/g,' ');
 const conferir=async(br,valor)=>{assert.equal(await texto(),br);assert.equal(await canonico.textContent(),valor);};
 const cursorNo=async busca=>campo.evaluate((el,{busca})=>{el.focus();const pos=el.value.indexOf(busca);if(pos<0)throw Error('Cursor nao encontrado');el.setSelectionRange(pos,pos);},{busca});
 await campo.waitFor();assert.equal(await texto(),'R$ 5.000,00');assert.equal(await campo.getAttribute('type'),'text');
 await campo.fill('');await conferir('','');
 for(const [tecla,br,valor]of[['1','R$ 0,01','0.01'],['2','R$ 0,12','0.12'],['3','R$ 1,23','1.23'],['4','R$ 12,34','12.34'],['5','R$ 123,45','123.45'],['6','R$ 1.234,56','1234.56']]){
  await campo.pressSequentially(tecla);await conferir(br,valor);
 }
 // Inserir no meio nao desloca o cursor para o fim nem limita pelo snapshot.
 await cursorNo('3');await campo.pressSequentially('9');await conferir('R$ 12.934,56','12934.56');
 await campo.pressSequentially('8');await conferir('R$ 129.834,56','129834.56');
 await page.getByRole('button',{name:'Conferir valor'}).click();await page.getByRole('status').getByText(/Informe um valor maior/).waitFor();
 assert.equal(await page.evaluate(()=>window.__envios.length),0);
 // Colagem BR e decimal canonico mantem os mesmos centavos.
 await campo.fill('R$ 1.234,56');await conferir('R$ 1.234,56','1234.56');
 await campo.fill('1234.56');await conferir('R$ 1.234,56','1234.56');
 await campo.press('ControlOrMeta+A');await page.keyboard.insertText('R$ 600,25');await conferir('R$ 600,25','600.25');
 await page.getByRole('button',{name:'Conferir valor'}).click();assert.deepEqual(await page.evaluate(()=>window.__envios),[600.25]);
 // Backspace sobre virgula e Delete sobre ponto continuam removendo digitos.
 await campo.fill('1234,56');await campo.evaluate(el=>{el.focus();const p=el.value.indexOf(',')+1;el.setSelectionRange(p,p);});
 await campo.press('Backspace');await conferir('R$ 123,56','123.56');
 await campo.press('Backspace');await conferir('R$ 12,56','12.56');
 await campo.fill('1234,56');await cursorNo('.');await campo.press('Delete');await conferir('R$ 134,56','134.56');
 await campo.press('Delete');await conferir('R$ 14,56','14.56');
 // Trocar uma selecao no meio e continuar digitando.
 await campo.fill('1234,56');await campo.evaluate(el=>{el.focus();const p=el.value.indexOf('234');el.setSelectionRange(p,p+3);});
 await campo.pressSequentially('9');await conferir('R$ 19,56','19.56');
 await campo.pressSequentially('8');await conferir('R$ 198,56','198.56');
 await campo.press('ControlOrMeta+A');await campo.press('Backspace');await conferir('','');
 await campo.pressSequentially('0');await conferir('R$ 0,00','0.00');await campo.press('Backspace');await conferir('','');
 await campo.press('ControlOrMeta+A');await campo.press('Backspace');await conferir('','');
 await campo.pressSequentially('6500');await conferir('R$ 65,00','65.00');
 await page.getByRole('button',{name:'Conferir valor'}).click();assert.deepEqual(await page.evaluate(()=>window.__envios),[600.25,65]);
 // Atualizacao de props/estado e bloqueio operacional preservados.
 await page.evaluate(()=>window.__setValor('1200.00'));await page.waitForFunction(()=>document.querySelector('input').value.includes('1.200,00'));await conferir('R$ 1.200,00','1200.00');
 await campo.dispatchEvent('compositionstart');await campo.fill('123,45');
 assert.equal(await canonico.textContent(),'1200.00','Composicao do teclado nao envia valor incompleto');
 await campo.dispatchEvent('compositionend',{data:'123,45'});
 await page.waitForFunction(()=>document.querySelector('output').textContent==='123.45');await conferir('R$ 123,45','123.45');
 await page.evaluate(()=>window.__desabilitar(true));await page.waitForFunction(()=>document.querySelector('input').disabled);assert(await campo.isDisabled());
 await page.evaluate(()=>window.__desabilitar(false));await page.waitForFunction(()=>!document.querySelector('input').disabled);
 for(const width of[320,390,1366]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(output,'moeda-'+width+'.png'),fullPage:false});}
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
 console.log('OK moeda BR: formatacao a cada tecla, cursor no meio, Backspace/Delete em separadores, selecao/colagem/limpeza/zero, props/disabled, 320/390/1366 e montante canonico conferido. Sem API/banco.');
 await page.close();
}finally{await browser?.close();await server.close();}
