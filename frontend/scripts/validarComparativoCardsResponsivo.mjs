import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resposta = { fornecedor_id: 10, cotacao_fornecedor_id: 20, resposta_item_id: 30,
  fornecedor_nome: 'Fornecedor de materiais com nome longo para comparação', quantidade_disponivel: 100,
  saldo_disponivel_fornecedor: 100, disponivel: true, preco: 20, valor_total_cotado: 1000,
  prazo_entrega_fornecedor: '5 dias corridos', condicao_pagamento: 'Boleto 30/60/90', frete_tipo: 'SEM_FRETE' };
const comparativo = { itens: [{ id: 1, item_tipo: 'CADASTRADO', nome: 'Arame recozido', quantidade: 50,
  quantidade_atual: 50, saldo_disponivel: 50, unidade: 'kg', respostas: [resposta] }] };
const fixture = `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {SecaoComparativo} from '/src/modules/solicitacao-compra/pages/GerenciarCotacaoSolicitacao.jsx';
function App(){const [v,setV]=useState({});return <MemoryRouter><main id="host" style={{width:850,maxWidth:'100%',minWidth:0,padding:12}}>
<div className="cotacao-gestao-embutida"><SecaoComparativo embedded comparativo={${JSON.stringify(comparativo)}}
solicitacao={{status:'EM_COTACAO'}} podeComprar podeEncerrar podeEditarResposta vencedoresSelecionados={v}
onVencedorChange={({resposta,quantidade})=>setV(s=>({...s,[resposta.resposta_item_id]:{quantidade_alocada:quantidade}}))}
onEncerrar={()=>window.geracoes=(window.geracoes||0)+1}/></div></main></MemoryRouter>}
createRoot(document.getElementById('root')).render(<App/>);`;
const server = await createServer({root,configFile:false,logLevel:'error',server:{host:'127.0.0.1',port:0},
  plugins:[{name:'comparativo-fixture',enforce:'pre',resolveId(id){if(id==='/fixture.jsx')return '\0comparativo-fixture.jsx'},
    async load(id){if(id==='\0comparativo-fixture.jsx')return transformWithEsbuild(fixture,'fixture.jsx',{loader:'jsx',jsx:'transform'})},
    transform(code,id){if(id.endsWith('/pages/GerenciarCotacaoSolicitacao.jsx'))return `${code}\nexport { SecaoComparativo };`},
    configureServer(s){s.middlewares.use(async(req,res,next)=>{if(req.url!='/fixture')return next();
      res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml('/fixture',
        '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'))})}
  },react()],optimizeDeps:{include:['react','react-dom/client','react-router-dom']}});
await server.listen();
const browser = await chromium.launch({channel:'chrome',headless:true});
try {
  const page = await browser.newPage({viewport:{width:1900,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/fixture`);
  const css=fs.readFileSync(path.join(root,'dist/index.html'),'utf8').match(/href="\/assets\/([^\"]+\.css)"/)[1];
  await page.addStyleTag({path:path.join(root,'dist/assets',css)});
  await page.getByRole('button',{name:'Cards',exact:true}).waitFor();
  for (const mode of ['Cards','Mapa','Cards']) {
    await page.getByRole('button',{name:mode,exact:true}).click();
    for (const width of [850,1650,500,350,1200]) {
      await page.locator('#host').evaluate((el,w)=>{el.style.width=`${w}px`},width);
      await page.waitForTimeout(150);
      const medida=await page.evaluate(()=>{
        const host=document.querySelector('#host');
        const bloco=host.querySelector('.app-bloco');
        const card=host.querySelector('.cotacao-comparativo-item');
        const scroll=host.querySelector('.resizable-table-scroll, .compras-responsive-table');
        return {host:host.getBoundingClientRect().right,bloco:bloco?.getBoundingClientRect().right,
          card:card?.getBoundingClientRect().right,scroll:scroll?.getBoundingClientRect().right,
          rolagem:scroll && scroll.scrollWidth>scroll.clientWidth};
      });
      assert.ok(medida.scroll<=medida.host+1,`${mode} ${width}px saiu do card: ${JSON.stringify(medida)}`);
      if(mode==='Cards')assert.ok(medida.card<=medida.host+1,`Card excedeu o host: ${JSON.stringify(medida)}`);
      if(width<1200)assert.ok(medida.rolagem,`Colunas devem rolar dentro do card: ${mode} ${width}`);
    }
  }
  const selecionar=page.getByRole('checkbox',{name:`Comprar de ${resposta.fornecedor_nome}`,exact:true});
  await selecionar.check();
  const qtd=page.getByRole('textbox',{name:`Quantidade comprada de ${resposta.fornecedor_nome}`,exact:true});
  assert.equal(await qtd.inputValue(),'50');
  await qtd.fill('25');assert.equal(await qtd.inputValue(),'25');
  await page.getByRole('button',{name:'Mapa',exact:true}).click();
  assert.equal(await page.getByRole('textbox',{name:`Quantidade comprada de ${resposta.fornecedor_nome} para Arame recozido`,exact:true}).inputValue(),'25');
  await page.getByRole('button',{name:'Cards',exact:true}).click();
  await page.getByRole('button',{name:'Gerar pedidos selecionados',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.geracoes),1);
  await page.setViewportSize({width:375,height:812});
  await page.waitForTimeout(150);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),
    'Viewport móvel não deve ter rolagem horizontal da página');
  await page.setViewportSize({width:1900,height:900});
  await page.waitForTimeout(150);
  assert.deepEqual(errors,[]);
  const out=path.resolve(root,'../outputs/comparativo-cards-qa');fs.mkdirSync(out,{recursive:true});
  await page.screenshot({path:path.join(out,'cards.png'),fullPage:true});
  console.log('OK: comparativo real Cards/Mapa, redimensionamento sem reload, rolagem interna, seleção/quantidade e geração preservadas. Sem API externa.');
} finally {await browser.close();await server.close();}
