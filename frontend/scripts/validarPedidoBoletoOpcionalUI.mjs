import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import tailwindConfig from '../tailwind.config.js';

// Componente real; transporte, busca de parceiro e preview isolados de servicos reais.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output=path.join(root,'../outputs/pedido-cartoes');fs.mkdirSync(output,{recursive:true});
const fixture = { id: 10, status: 'FECHADO_FORNECEDOR', valor_total_fornecedor: 100,
  fornecedor: { parceiro_id: 20, nome: 'Fornecedor teste' },
  fretes: [{ id: 8, tipo: 'TERCEIRO', status_financeiro: 'PENDENTE_TITULO', parceiro_id: 21,
    valor_total: 25, parceiro: { nome: 'Transportadora teste' } }],
  financeiro: { status: 'AGUARDANDO_PREVISAO', legado: false, titulos: [],
    documentos: [{id:91,tipo:'BOLETO_COMPRA',arquivo_url:'https://arquivos.test/boleto.pdf',arquivo_nome:'boleto.pdf'},
      {id:92,tipo:'NOTA_FISCAL',numero_documento:'123',arquivo_url:'https://arquivos.test/nota.pdf',arquivo_nome:'nota.pdf'}],
    opcoes: { categoria_padrao_id: 1, categorias: [{ id: 1, nome: 'Material' }],
      formas_pagamento: [{ id: 1, nome: 'Boleto', gera_boleto: true }, { id: 2, nome: 'Pix' },
        { id: 4, nome: 'Cartão de crédito', tipo: 'CARTAO_CREDITO', exige_cartao: true, gera_fatura: true, permite_parcelamento: true },
        { id: 5, nome: 'Cartão de débito', tipo: 'CARTAO_DEBITO', exige_cartao: true, permite_parcelamento: false }],
      cartoes: [{ id: 10, nome: 'Crédito QA', tipo: 'CREDITO', ultimos_digitos: '1234' },
        { id: 20, nome: 'Débito QA', tipo: 'DEBITO' }, { id: 30, nome: 'Inativo QA', tipo: 'CREDITO', ativo: false }] } } };
const js = `import React from 'react';import{createRoot}from'react-dom/client';
import Pedido from '/src/modules/solicitacao-compra/components/PedidoCompraFinanceiro.jsx';
import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/componentes-padrao.css';import '/src/styles/responsive-system.css';
window.envios=[];window.uploads=[];window.avisos=[];window.removidos=[];window.semArquivo=[];
const avisar=Object.fromEntries(['alerta','erro','sucesso'].map(k=>[k,msg=>window.avisos.push({k,msg})]));
const base=${JSON.stringify(fixture)};
function App(){const[pedido,setPedido]=React.useState(base);
return React.createElement(Pedido,{pedido,user:{id:4},avisar,onAtualizar:async()=>{
setPedido(atual=>({...atual,fretes:atual.fretes.map(f=>({...f})),financeiro:{...atual.financeiro,documentos:base.financeiro.documentos
 .filter(d=>d.tipo!=='BOLETO_COMPRA'||!window.semArquivo.includes(d.id))
 .map(d=>window.semArquivo.includes(d.id)?{...d,arquivo_url:null,arquivo_nome:null}:d)}}));}});}
createRoot(document.getElementById('root')).render(React.createElement(App));`;
const api = `export async function criarPrevisoesPedidoCompra(id,data){window.envios.push({id,data});
await new Promise(r=>setTimeout(r,150));return {};}
export async function uploadAnexoTemporarioCompra(file){window.uploads.push(file.name);
return {arquivo_url:'https://arquivos.test/'+file.name,arquivo_nome_original:file.name};}
export async function adotarFinanceiroPedidoCompra(){};export async function decidirReaberturaPedidoCompra(){};
export async function obterUrlAssinadaCompra(){};export async function reparcelarPrevisoesPedidoCompra(){};`;
const remocaoApi=`export async function removerArquivoDocumentoPedidoCompra(id,documentoId){
window.removidos.push({id,documentoId});await new Promise(r=>setTimeout(r,150));
if(window.negada)throw new Error('Sem permissao para remover anexos do pedido.');
window.semArquivo.push(documentoId);return {ok:true};}`;
const acesso = `export const canViewPedidoCompraFinanceiro=()=>true;
export const canGerarPrevisaoPedidoCompraFinanceiro=()=>!window.somenteLeitura;
export const canAnexarDocumentoPedidoCompraFinanceiro=()=>!window.somenteLeitura;
export const canDeleteSolicitacaoAnexo=()=>!window.semExclusao&&!window.somenteLeitura;
export const canAprovarReaberturaPedidoCompraFinanceiro=()=>false;
export const canAccessFinanceiro=()=>false;`;
const server = await createServer({ root, configFile: false, logLevel: 'error',
  css:{postcss:{plugins:[tailwindcss({...tailwindConfig,content:tailwindConfig.content.map(p=>path.resolve(root,p).replaceAll('\\','/'))}),autoprefixer()]}},
  server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'pedido-boleto-fixture', enforce: 'pre',
    resolveId(id, importer) {
      if (id === '/fixture.jsx') return '\0boleto-fixture.jsx';
      if (!importer?.endsWith('PedidoCompraFinanceiro.jsx')) return;
      if (id.endsWith('services/compras')) return '\0boleto-api';
      if (id.endsWith('utils/acessoProduto')) return '\0boleto-acesso';
      if (id.endsWith('hooks/useVisualizadorArquivo')) return '\0boleto-preview';
      if (id.endsWith('components/solicitacoes/ParceiroBuscaRemota')) return '\0boleto-parceiro.jsx';
    },
    load(id) {
      if (id === '\0boleto-fixture.jsx') return js;
      if (id === '\0boleto-api') return api+remocaoApi;
      if (id === '\0boleto-acesso') return acesso;
      if (id === '\0boleto-preview') return 'export default()=>({abrirPreview:async()=>{},modalPreview:null});';
      if (id === '\0boleto-parceiro.jsx') return `import React from 'react';export default function Busca({selecionado}){
        return React.createElement('span',{},'Favorecido: '+selecionado?.nome)}`;
    },
    configureServer(s) { s.middlewares.use(async (req, res, next) => {
      if (req.url !== '/fixture') return next();
      res.setHeader('Content-Type', 'text/html');
      res.end(await s.transformIndexHtml('/fixture', '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root" style="padding:16px"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
    }); }
  }, react()], optimizeDeps: { include: ['react', 'react-dom/client'] } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  const erros = [];
  page.on('pageerror', (e) => { erros.push(e.message); console.error(e.message); });
  const url = `http://127.0.0.1:${server.httpServer.address().port}/fixture`;
  await page.goto(url);
  const compra = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Pagamento ao fornecedor', exact: true }) }).last();
  const frete = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Pagamento do frete #8', exact: true }) }).last();
  for (const bloco of [compra, frete]) {
    await bloco.locator('select').first().selectOption('1');
    await bloco.getByText('Opcional na criação dos títulos.', { exact: false }).waitFor();
    assert.equal(await bloco.locator('input[type=file][required]').count(), 0);
    assert.equal(await bloco.locator('.form-label--required').filter({ hasText: 'Boletos' }).count(), 0);
  }
  await page.getByRole('button', { name: 'Criar títulos', exact: true }).click();
  await page.waitForFunction(() => window.envios.length === 1 && window.avisos.some((a) => a.k === 'sucesso'));
  const primeiro = await page.evaluate(() => window.envios[0]);
  assert.equal(primeiro.id, 10);
  assert.deepEqual(primeiro.data.boletos, []);
  assert.deepEqual(primeiro.data.fretes[0].boletos, []);
  assert.equal(primeiro.data.parcelas[0].valor, 100);
  assert.equal(primeiro.data.fretes[0].parcelas[0].valor, 25);
  assert.equal(await page.evaluate(() => window.uploads.length), 0);

  await compra.locator('input[type=file]').setInputFiles([
    { name: 'compra1.pdf', mimeType: 'application/pdf', buffer: Buffer.from('boleto teste 1') },
    { name: 'compra2.pdf', mimeType: 'application/pdf', buffer: Buffer.from('boleto teste 2') }
  ]);
  await frete.locator('input[type=file]').setInputFiles({ name: 'frete.pdf', mimeType: 'application/pdf', buffer: Buffer.from('boleto frete teste') });
  await page.getByRole('button', { name: 'Criar títulos', exact: true }).click();
  await page.waitForFunction(() => window.envios.length === 2 && window.avisos.filter((a) => a.k === 'sucesso').length === 2);
  const segundo = await page.evaluate(() => window.envios[1]);
  assert.equal(segundo.data.boletos.length, 2);
  assert.equal(segundo.data.fretes[0].boletos[0].arquivo_nome, 'frete.pdf');
  assert.equal(await page.evaluate(() => window.uploads.length), 3);
  await compra.locator('select').first().selectOption('2');
  await page.getByRole('button', { name: 'Criar títulos', exact: true }).click();
  assert.ok(await page.evaluate(() => window.avisos.some((a) => a.k === 'alerta' && /chave PIX/.test(a.msg))));
  assert.equal(await page.evaluate(() => window.envios.length), 2);
  await compra.locator('select').first().selectOption('4');
  const cartaoCompra=compra.getByLabel('Cartão utilizado', { exact: true });
  await cartaoCompra.waitFor();
  assert.equal(await cartaoCompra.locator('option').count(),2,'Somente credito ativo');
  assert.equal(await compra.getByLabel('Dados para pagamento', { exact: true }).count(),0);
  await page.getByRole('button', { name: 'Criar títulos', exact: true }).click();
  assert.equal(await page.evaluate(() => window.envios.length),2,'Nao criar sem cartao');
  await cartaoCompra.selectOption('10');
  await compra.getByLabel('Quantidade de parcelas', { exact: true }).fill('2');
  await compra.getByLabel(/^Data da compra/).fill('12/10/2026');
  await frete.locator('select').first().selectOption('5');
  const cartaoFrete=frete.getByLabel('Cartão utilizado', { exact: true });
  await cartaoFrete.waitFor();
  assert.equal(await cartaoFrete.locator('option').count(),2,'Somente debito ativo');
  await cartaoFrete.selectOption('20');
  await frete.getByLabel(/^Data da compra/).fill('13/10/2026');
  for(const width of[1366,390]){
    await page.setViewportSize({width,height:900});
    await page.screenshot({path:path.join(output,`pedido-cartoes-${width}.png`),fullPage:true});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'Sem rolagem horizontal da pagina');
    assert(await cartaoCompra.isVisible());assert(await cartaoFrete.isVisible());
  }
  await page.setViewportSize({width:1366,height:900});
  await page.getByRole('button', { name: 'Criar títulos', exact: true }).click();
  await page.waitForFunction(() => window.envios.length===3 && window.avisos.filter(a=>a.k==='sucesso').length===3);
  const cartoes=await page.evaluate(()=>window.envios[2].data);
  assert.equal(cartoes.cartao_id,10);assert.equal(cartoes.data_compra,'2026-10-12');
  assert.deepEqual(cartoes.parcelas.map(p=>p.valor),[50,50]);
  assert.equal(cartoes.fretes[0].cartao_id,20);assert.equal(cartoes.fretes[0].data_compra,'2026-10-13');
  await compra.locator('select').first().selectOption('5');
  assert.equal(await cartaoCompra.inputValue(),'','Trocar forma limpa cartao incompatível');
  assert.equal(await compra.getByLabel('Quantidade de parcelas', { exact: true }).inputValue(),'1');
  for(const width of [1366,390]){
    await page.setViewportSize({width,height:900});await page.reload();
    const remover=page.getByRole('button',{name:'Remover anexo boleto.pdf',exact:true});
    await compra.locator('select').first().selectOption('4');
    await cartaoCompra.selectOption('10');
    await remover.click();
    const modal=page.getByRole('dialog',{name:'Remover anexo do pedido'});
    await modal.getByRole('button',{name:'Cancelar',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.removidos.length),0,'Cancelar nao remove');
    await remover.click();await page.evaluate(()=>{window.negada=true;});
    await modal.getByRole('button',{name:'Confirmar remoção',exact:true}).click();
    await page.waitForFunction(()=>window.avisos.some(a=>a.k==='erro'));
    assert(await remover.isVisible(),'403 preserva documento');assert(await modal.isVisible());
    await page.evaluate(()=>{window.negada=false;});
    await page.screenshot({path:path.join(output,`pedido-remover-${width}.png`),fullPage:true});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
    await modal.getByRole('button',{name:'Confirmar remoção',exact:true}).evaluate(b=>{b.click();b.click();});
    await page.waitForFunction(()=>window.semArquivo.includes(91));
    await remover.waitFor({state:'detached'});
    assert.equal(await page.evaluate(()=>window.removidos.length),2,'Um erro e uma remocao; clique repetido nao duplica');
    assert.deepEqual(await page.evaluate(()=>window.removidos[1]),{id:10,documentoId:91});
    assert(await page.getByRole('button',{name:'Remover anexo nota.pdf'}).isVisible(),'Outro arquivo preservado');
    assert.equal(await page.evaluate(()=>window.envios.length),0,'Remocao nao cria/baixa/exclui titulos');
    assert.equal(await cartaoCompra.inputValue(),'10','Refresh dos anexos preserva preenchimento financeiro');
    await page.getByRole('button',{name:'Remover anexo nota.pdf'}).click();
    await modal.getByRole('button',{name:'Confirmar remoção',exact:true}).click();
    await page.getByRole('button',{name:'Remover anexo nota.pdf'}).waitFor({state:'detached'});
    assert(await page.getByText('Nota fiscal',{exact:false}).count()>0,'Metadados da nota preservados');
  }
  await page.addInitScript(()=>{window.semExclusao=true;});await page.reload();
  await page.getByText('Gestão financeira do pedido',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:/^Remover anexo /}).count(),0,'Sem permissao de exclusao');
  assert.equal(await page.getByRole('button',{name:'Abrir arquivo',exact:true}).count(),2,'Visualizacao preservada');
  await page.addInitScript(() => { window.somenteLeitura = true; });
  await page.reload();
  await page.getByText('Gestão financeira do pedido', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Criar títulos', exact: true }).count(), 0);
  assert.deepEqual(erros, []);
  console.log('Tela real desktop/mobile: boleto opcional/multiplo, PIX, cartoes/frete e remocao isolada (cancelar/403/mutex/permissoes/metadados) validados.');
} finally {
  await browser?.close();
  await server.close();
}
