// Componente e assinatura SSE reais; APIs isoladas, sem banco/S3/EC2.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseline = process.argv.includes('--baseline');
const freteMode = process.argv.includes('--frete');
const original = baseline ? execFileSync('git', ['show', '31490a0d5ab39404b2b8bbb3e3285bc75f5faa3d:frontend/src/pages/SolicitacaoDetalhe/FinanceiroCard.jsx'], {cwd:root,encoding:'utf8'}) : null;
const services = ['financeiro', 'parceiros', 'solicitacoes', 'empresasGrupo', 'obras'];
const mocks = new Map(services.map(name => {
  const source = readFileSync(path.join(root, `src/services/${name}.js`), 'utf8');
  const exports = [...source.matchAll(/export (?:async )?function (\w+)/g)].map(m => m[1]);
  return [name, exports.map(fn => `export async function ${fn}(...args){return window.qaService('${fn}',args);}`).join('\n')];
}));
const fixture = `
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import FinanceiroCard,{buildDefaultForm} from '/src/pages/SolicitacaoDetalhe/FinanceiroCard.jsx';
import {LiveUpdatesProvider,useLiveUpdateSubscription} from '/src/contexts/LiveUpdatesContext.jsx';
window.qaUser={id:9,perfil:'COMPRAS',areas_permissoes_configuradas:true,areas_permissoes:['financeiro.titulos.criar','financeiro.titulos.visualizar']};
window.qaReads=0;window.qaSends=[];window.qaFail=false;
window.qaSource={id:10,codigo:'SOL-QA-10',valor:1000,data_vencimento:'2090-01-31',
 tipo:{nome:'DESPESA ADMINISTRATIVA'},obra:{id:2,nome:'Obra QA',empresa_grupo_id:3},
 parceiro:{id:4,nome:'Credor QA',fornecedor:true},forma_pagamento_id:1};
window.qaTitles=[];window.qaTitleReads=0;
${freteMode ? `window.qaSource={...window.qaSource,valor:200,tipo:{nome:'COMPRA DIRETA'},
  compra_direta:{id:5,origem:'COMPRA_DIRETA',frete_tipo:'TERCEIRO',frete_valor:50,valor_fechado:150,
    frete_data_vencimento:'2090-01-31',frete_parceiro_id:4,frete_forma_pagamento_id:2,
    freteCredor:{id:4,nome:'Transportadora QA'},formas_pagamento_json:[{id:2,valor:150}]}};
  window.qaTitles=[{id:1,solicitacao_id:10,origem_titulo:'COMPRA_DIRETA_FRETE',tipo:'PAGAR',
    descricao:'Frete QA',status:'ABERTO',valor_original:50,valor_saldo:50,valor_baixado:0,data_vencimento:'2090-01-31'}];` : ''}
window.qaDefaultForm=()=>buildDefaultForm(window.qaSource,window.qaTitles);
const categories=[{id:6,nome:'Despesa QA',tipo:'PAGAR',ativo:true}];
const forms=[{id:1,nome:'Boleto',tipo:'BOLETO',ativo:true,permite_parcelamento:true},{id:2,nome:'Transferencia',tipo:'TRANSFERENCIA',ativo:true}];
window.qaService=async(name,args)=>{
 if(name==='getTitulosFinanceirosPorSolicitacao'){window.qaTitleReads++;return structuredClone(window.qaTitles)}
 if(name==='getCategoriasFinanceiras')return categories;
 if(name==='getFormasPagamentoFinanceiras')return forms;
 if(name==='buscarParceiroPorId')return window.qaSource.parceiro;
 if(name==='buscarParceiros')return [window.qaSource.parceiro];
 if(name==='getEmpresasGrupo')return [{id:3,nome:'Empresa QA'}];
 if(name==='getObras')return [window.qaSource.obra];
 if(name==='gerarContaPorSolicitacao'){
   window.qaSends.push(structuredClone(args));await new Promise(r=>setTimeout(r,120));
   if(window.qaFail)throw Error('Falha de envio simulada');return {id:21};
 }
 return [];
};
const intervals=new Map();const nativeInterval=window.setInterval.bind(window);
const nativeClear=window.clearInterval.bind(window);let next=1000000;
window.setInterval=(fn,ms,...args)=>{if(ms===45000){const id=next++;intervals.set(id,()=>fn(...args));return id;}return nativeInterval(fn,ms,...args)};
window.clearInterval=id=>{if(intervals.has(id))intervals.delete(id);else nativeClear(id)};
window.qaFallback=()=>{for(const fn of intervals.values())fn()};
window.EventSource=class{constructor(){this.listeners={};window.qaStream=this;setTimeout(()=>this.emit('connected',{}),10)}
 addEventListener(name,fn){this.listeners[name]=fn}removeEventListener(name){delete this.listeners[name]}close(){}
 emit(name,data){if(name==='error')this.onerror?.();else this.listeners[name]?.({data:JSON.stringify(data)})}};
function Host(){const[record,R]=useState(structuredClone(window.qaSource));const[readonly,S]=useState(false);
 window.qaReplace=patch=>{window.qaSource={...window.qaSource,...patch};R(structuredClone(window.qaSource))};
 window.qaReadonly=S;
 const refresh=()=>{window.qaReads++;R(structuredClone(window.qaSource))};
 useLiveUpdateSubscription({enabled:true,filter:p=>p.entity==='SOLICITACAO'&&Number(p.record_id)===record.id,
   onEvent:refresh,fallbackRefresh:refresh,fallbackMs:45000});
 return <FinanceiroCard solicitacao={record} podeAcessarModuloFinanceiro podeVisualizarTitulos
  podeOperarAbaFinanceiro={!readonly} somenteLeitura={readonly} onTituloCriado={()=>window.qaCreated=true}/>;
}
createRoot(document.getElementById('root')).render(<MemoryRouter><LiveUpdatesProvider><Host/></LiveUpdatesProvider></MemoryRouter>);
`;
const server = await createServer({root,configFile:false,logLevel:'error',server:{host:'127.0.0.1',port:0},
  plugins:[{name:'qa-titulo-refresh',enforce:'pre',
    resolveId(id){if(id==='/qa-titulo.jsx')return '\0qa-titulo.jsx';},
    load(id){if(id==='\0qa-titulo.jsx')return transformWithEsbuild(fixture,'qa-titulo.jsx',{loader:'jsx',jsx:'transform'});},
    transform(code,id){
      if(baseline && id.endsWith('/src/pages/SolicitacaoDetalhe/FinanceiroCard.jsx'))return original;
      if(id.endsWith('/src/contexts/AuthContext.jsx'))return `export function useAuth(){return {user:window.qaUser,authReady:true,isAuthenticated:true}}`;
      for(const[name,mock]of mocks)if(id.endsWith('/src/services/'+name+'.js'))return mock;
    },
    configureServer(s){s.middlewares.use(async(req,res,next)=>{
      if(new URL(req.url,'http://localhost').pathname!=='/qa-titulo')return next();
      res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml('/qa-titulo',
        '<html><body><div id="root"></div><script type="module" src="/qa-titulo.jsx"></script></body></html>'));
    });}
  },react()],optimizeDeps:{include:['react','react-dom/client','react-router-dom']}});
await server.listen();
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  cases: for(const width of baseline ? [1366] : [1366,390]){
    const page=await browser.newPage({viewport:{width,height:900}});
    const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Erro da pagina QA:',e.message)});
    await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/qa-titulo');
    if(freteMode){
      await page.waitForFunction(()=>window.qaTitleReads>0);
      await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      const padrao=await page.evaluate(()=>window.qaDefaultForm());
      assert.match(padrao.valor,/150,00/);assert.equal(padrao.pagamentos.length,1);
      assert.equal(padrao.pagamentos[0].origem_frete,false);
      await page.getByRole('button',{name:'Criar Título',exact:true}).click();
      const modal=page.getByRole('dialog');await modal.waitFor();
      await modal.getByLabel('Categoria financeira deste título',{exact:true}).fill('Despesa');
      await modal.getByRole('option',{name:/Despesa QA/}).click();
      await modal.getByRole('button',{name:'Confirmar',exact:true}).click();
      await page.waitForFunction(()=>window.qaCreated===true);
      const enviado=await page.evaluate(()=>window.qaSends[0][1]);
      assert.match(enviado.valor,/150,00/);assert.equal(enviado.pagamentos.length,1);
      assert.equal(enviado.pagamentos[0].origem_frete,false);
      await page.evaluate(()=>{window.qaTitles.push({...window.qaTitles[0],id:2,descricao:'Fornecedor QA',
        origem_titulo:'SOLICITACAO',valor_original:150,valor_saldo:150});
        window.qaReplace({compra_direta:{...window.qaSource.compra_direta,updatedAt:'nova-revisao'}})});
      const bloqueado=page.getByRole('button',{name:/^Criar Título desabilitado/});
      await bloqueado.waitFor();assert.equal(await bloqueado.isDisabled(),true);
      assert.deepEqual(errors,[]);console.log('OK '+width+'px: frete existente omitido, valor do fornecedor, envio real sem frete duplicado e bloqueio de regeneracao.');
      await page.close();continue;
    }
    const open=page.getByRole('button',{name:'Criar Título',exact:true});await open.click();
    const modal=page.getByRole('dialog');await modal.waitFor();
    await modal.getByLabel(/^Forma de pagamento/).selectOption('1');
    await modal.getByLabel('Parcelas',{exact:true}).fill('2');
    const amounts=modal.getByLabel('Valor',{exact:true});
    await amounts.nth(0).fill('400,00');await amounts.nth(1).fill('600,00');
    const dates=modal.getByLabel('Vencimento',{exact:true});
    await dates.nth(0).fill('15/02/2090');await dates.nth(1).fill('15/03/2090');
    const category=modal.getByLabel('Categoria financeira deste título',{exact:true});
    await category.fill('Despesa');await modal.getByRole('option',{name:/Despesa QA/}).click();
    const refs=modal.getByLabel('Documento ou referência',{exact:true});
    await refs.nth(0).fill('boleto-digitado-Z');
    await dates.nth(1).fill('15/03'); // Data parcial tambem nao pode sumir.
    const before=await modal.locator('input,select,textarea').evaluateAll(els=>els.map(el=>({value:el.value,checked:el.checked})));
    await refs.nth(0).focus();
    await page.evaluate(()=>window.qaStream.emit('fluxy.realtime',{entity:'SOLICITACAO',record_id:999,action:'CREATED'}));
    assert.equal(await page.evaluate(()=>window.qaReads),0,'Outra solicitacao nao recarrega o detalhe');
    for(let i=1;i<=3;i++){
      await page.evaluate(()=>window.qaStream.emit('fluxy.realtime',{entity:'SOLICITACAO',record_id:10,action:'UPDATED'}));
      await page.waitForFunction(n=>window.qaReads===n,i);
      await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      if(baseline){
        assert.equal(await refs.nth(0).inputValue(),'','Codigo anterior apaga a referencia digitada apos SSE');
        assert.equal(await modal.getByLabel('Parcelas',{exact:true}).inputValue(),'1','Codigo anterior perde as parcelas');
        assert.deepEqual(errors,[]);
        console.log('REPRODUZIDO na versao anterior: evento SSE da mesma solicitacao apaga referencia e reinicia parcelas.');
        await page.close();break cases;
      }
      assert.deepEqual(await modal.locator('input,select,textarea').evaluateAll(els=>els.map(el=>({value:el.value,checked:el.checked}))),before);
      assert.ok(await refs.nth(0).evaluate(el=>document.activeElement===el),'Foco preservado');
    }
    await page.evaluate(()=>window.qaStream.emit('error',{}));
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    await page.evaluate(()=>window.qaFallback());await page.waitForFunction(()=>window.qaReads===4);
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    assert.deepEqual(await modal.locator('input,select,textarea').evaluateAll(els=>els.map(el=>({value:el.value,checked:el.checked}))),before,'Fallback preserva todos os campos');
    assert.equal(await page.evaluate(()=>window.qaSends.length),0,'Refresh nao cria titulos');
    await dates.nth(1).fill('15/03/2090');
    await page.evaluate(()=>window.qaReplace({valor:1200}));
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    assert.equal(await refs.nth(0).inputValue(),'boleto-digitado-Z','Mudanca de valor nao apaga rascunho');
    await modal.getByRole('button',{name:'Confirmar',exact:true}).click();
    await page.getByText(/O valor da solicitacao mudou durante o preenchimento/).first().waitFor();
    assert.equal(await page.evaluate(()=>window.qaSends.length),0,'Envio valida valor atual do servidor');
    await modal.getByRole('button',{name:'Fechar',exact:true}).click();await open.click();
    assert.equal(await modal.getByLabel('Parcelas',{exact:true}).inputValue(),'1');
    assert.equal(await refs.nth(0).inputValue(),'','Reabertura limpa campos descartados');
    assert.match(await amounts.nth(0).inputValue(),/1\.200,00/,'Reabertura usa o valor atualizado');
    await category.fill('Despesa');await modal.getByRole('option',{name:/Despesa QA/}).click();
    await refs.nth(0).fill('preservar-no-erro');
    await page.evaluate(()=>window.qaFail=true);
    await modal.getByRole('button',{name:'Confirmar',exact:true}).click();
    await page.getByText('Falha de envio simulada',{exact:true}).first().waitFor();
    assert.equal(await refs.nth(0).inputValue(),'preservar-no-erro','Erro de envio preserva formulario');
    await page.evaluate(()=>window.qaFail=false);
    await modal.getByRole('button',{name:'Confirmar',exact:true}).click();
    await page.waitForFunction(()=>window.qaCreated===true);
    assert.equal(await page.getByRole('dialog').count(),0,'Sucesso fecha formulario');
    assert.equal(await page.evaluate(()=>window.qaSends.length),2);
    await open.click();assert.equal(await refs.nth(0).inputValue(),'','Sucesso limpa rascunho');
    await refs.nth(0).fill('nao-levar-para-outro-registro');
    await page.evaluate(()=>window.qaReplace({id:11,codigo:'SOL-QA-11',valor:700}));
    await page.waitForFunction(()=>document.querySelector('[role=dialog]')===null);
    await open.click();assert.equal(await refs.nth(0).inputValue(),'');
    assert.match(await amounts.nth(0).inputValue(),/700,00/);
    await modal.getByRole('button',{name:'Fechar',exact:true}).click();
    await page.evaluate(()=>window.qaReadonly(true));
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    assert.equal(await open.count(),0,'Somente leitura nao ganha botao de criacao');
    await page.evaluate(()=>{window.qaUser={...window.qaUser,areas_permissoes:[]};window.qaReadonly(false)});
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    assert.equal(await open.count(),0,'Sem permissao nao ganha botao de criacao');
    assert.deepEqual(errors,[]);
    console.log('OK '+width+'px: SSE/fallback, foco, parcelas/data parcial, validacao atual, descarte, falha/sucesso, identidade e permissoes.');
    await page.close();
  }
}finally{await browser.close();await server.close();}
