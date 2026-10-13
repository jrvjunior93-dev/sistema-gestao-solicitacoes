import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

// Componente real; transporte, busca de parceiro e preview isolados de servicos reais.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = { id: 10, status: 'FECHADO_FORNECEDOR', valor_total_fornecedor: 100,
  fornecedor: { parceiro_id: 20, nome: 'Fornecedor teste' },
  fretes: [{ id: 8, tipo: 'TERCEIRO', status_financeiro: 'PENDENTE_TITULO', parceiro_id: 21,
    valor_total: 25, parceiro: { nome: 'Transportadora teste' } }],
  financeiro: { status: 'AGUARDANDO_PREVISAO', legado: false, titulos: [],
    opcoes: { categoria_padrao_id: 1, categorias: [{ id: 1, nome: 'Material' }],
      formas_pagamento: [{ id: 1, nome: 'Boleto', gera_boleto: true }, { id: 2, nome: 'Pix' }] } } };
const js = `import React from 'react';import{createRoot}from'react-dom/client';
import Pedido from '/src/modules/solicitacao-compra/components/PedidoCompraFinanceiro.jsx';
window.envios=[];window.uploads=[];window.avisos=[];
const avisar=Object.fromEntries(['alerta','erro','sucesso'].map(k=>[k,msg=>window.avisos.push({k,msg})]));
createRoot(document.getElementById('root')).render(React.createElement(Pedido,{pedido:${JSON.stringify(fixture)},
user:{id:4},avisar,onAtualizar:async()=>{}}));`;
const api = `export async function criarPrevisoesPedidoCompra(id,data){window.envios.push({id,data});
await new Promise(r=>setTimeout(r,150));return {};}
export async function uploadAnexoTemporarioCompra(file){window.uploads.push(file.name);
return {arquivo_url:'https://arquivos.test/'+file.name,arquivo_nome_original:file.name};}
export async function adotarFinanceiroPedidoCompra(){};export async function decidirReaberturaPedidoCompra(){};
export async function obterUrlAssinadaCompra(){};export async function reparcelarPrevisoesPedidoCompra(){};`;
const acesso = `export const canViewPedidoCompraFinanceiro=()=>true;
export const canGerarPrevisaoPedidoCompraFinanceiro=()=>!window.somenteLeitura;
export const canAnexarDocumentoPedidoCompraFinanceiro=()=>false;
export const canAprovarReaberturaPedidoCompraFinanceiro=()=>false;
export const canAccessFinanceiro=()=>false;`;
const server = await createServer({ root, configFile: false, logLevel: 'error',
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
      if (id === '\0boleto-api') return api;
      if (id === '\0boleto-acesso') return acesso;
      if (id === '\0boleto-preview') return 'export default()=>({abrirPreview:async()=>{},modalPreview:null});';
      if (id === '\0boleto-parceiro.jsx') return `import React from 'react';export default function Busca({selecionado}){
        return React.createElement('span',{},'Favorecido: '+selecionado?.nome)}`;
    },
    configureServer(s) { s.middlewares.use(async (req, res, next) => {
      if (req.url !== '/fixture') return next();
      res.setHeader('Content-Type', 'text/html');
      res.end(await s.transformIndexHtml('/fixture', '<html><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
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
  await page.addInitScript(() => { window.somenteLeitura = true; });
  await page.reload();
  await page.getByText('Gestão financeira do pedido', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Criar títulos', exact: true }).count(), 0);
  assert.deepEqual(erros, []);
  console.log('Tela real: compra/frete sem boleto, multiplos anexos, PIX obrigatorio e leitura sem acao validados.');
} finally {
  await browser?.close();
  await server.close();
}
