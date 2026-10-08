// Tela real e componentes reais; sessao/APIs isoladas, sem escrita externa.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stub = '\0qa-fila-instrumentos-';
const forms = [
  { id: 1, nome: 'Cartão de crédito', codigo: 'CARTAO_CREDITO', tipo: 'CARTAO_CREDITO', exige_cartao: true, gera_fatura: true },
  { id: 2, nome: 'Cartão de débito', tipo: 'CARTAO_DEBITO', exige_cartao: true },
  { id: 3, nome: 'PIX', tipo: 'PIX' }, { id: 4, nome: 'Cheque', tipo: 'CHEQUE' }
];
const plugin = { name: 'qa-fila-instrumentos', enforce: 'pre',
  resolveId(source, importer) {
    if (source.endsWith('/ThemeContext')) return stub + 'tema';
    if (!importer?.endsWith('/FinanceiroFilaPagamentos.jsx')) return;
    if (source === '../contexts/AuthContext') return stub + 'auth';
    if (source === '../components/padrao') return stub + 'padrao';
    if (source === '../utils/acessoProduto') return stub + 'permissoes';
    if (source === '../services/financeiro') return stub + 'api';
  },
  load(id) {
    if (id === stub + 'tema') return `export const useTheme=()=>({tema:{}});`;
    if (id === stub + 'auth') return `export const useAuth=()=>({user:{id:1}});`;
    if (id === stub + 'permissoes') return `export const canBaixarFilaPagamentos=()=>true,hasPermissao=()=>true,canImportarComprovantesFilaPagamentos=()=>false,canReportarFilaPagamentos=()=>true,canResolverFilaPagamentos=()=>true;`;
    if (id === stub + 'padrao') return `import React from 'react';const avisar={erro:console.error,sucesso:()=>{}};const confirmar=async()=>({ok:true});export const Pagina=({children})=>React.createElement('main',null,children);export const BlocoConteudo=({children})=>React.createElement('section',null,children);export const PageHeader=({title})=>React.createElement('h1',null,title);export const Avisos=()=>null;export const useAvisos=()=>({avisos:[],fechar:()=>{},avisar});export const useConfirmacao=()=>({confirmar});`;
    if (id === stub + 'api') return `
      export const getFilaPagamentos=async({status})=>({data:status==='NAO_PAGO'?[{id:-7,status:'NAO_PAGO',somente_consulta:true,motivo:'Documento divergente',titulo:{id:7,codigo:'TIT-REJEITADO',valor_saldo:200}}]:[{id:1,status:'PENDENTE',valor_previsto:200,comprovante_hash:'qa',comprovante_url:'qa',titulo:{id:1,codigo:'TIT-QA',status:'ABERTO',valor_saldo:200,forma_pagamento_id:1}}],resumo:{PENDENTE:1,NAO_PAGO:1}});
      export const getContasFilaPagamentos=async()=>[{id:5,nome:'Conta QA',ativo:true,empresa_id:1},{id:6,nome:'Outra conta',ativo:true,empresa_id:2}];
      export const getInstrumentosFilaPagamentos=async()=>({formas:${JSON.stringify(forms)},cartoes:[{id:10,nome:'Crédito QA',tipo:'CREDITO',conta_bancaria_id:5},{id:20,nome:'Débito QA',tipo:'DEBITO',conta_bancaria_id:5}],cheques:[{id:77,codigo:'CH-QA',numero_cheque:'007',titular_nome:'Cliente QA',valor:200,empresa_id:1},{id:88,codigo:'CH-OUTRA',valor:200,empresa_id:2}]});
      export const registrarBaixasFilaPagamentos=async(itens,key)=>{window.__settles.push({itens,key});return{baixados:1,divergentes:0}};
      export const anexarComprovanteFilaPagamento=async()=>{},aprovarDivergenciasFilaPagamentos=async()=>{},getComprovanteFilaPagamento=async()=>{},informarNaoPagamentoFila=async()=>{},previewComprovantesFilaPagamentos=async()=>{},resolverFilaPagamento=async()=>{},vincularComprovantesFilaPagamentos=async()=>{};`;
  },
  configureServer(server) { server.middlewares.use('/qa-fila', async (_, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(await server.transformIndexHtml('/qa-fila', `<html><body><div id="root"></div><script type="module">import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';import Page from '/src/pages/FinanceiroFilaPagamentos.jsx';window.__settles=[];createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,React.createElement(Page)));</script></body></html>`));
  }); }
};
const server = await createServer({ root, plugins: [plugin], server: { host: '127.0.0.1', port: 5308, strictPort: true, proxy: {} } });
await server.listen(); let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const page = await browser.newPage(); const errors = [], unexpected = [];
  page.on('pageerror', e => { errors.push(e.message); console.error('Erro da tela QA:', e.message); });
  page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === 'http://127.0.0.1:5308') return route.continue();
    unexpected.push(route.request().url()); return route.abort();
  });
  await page.goto('http://127.0.0.1:5308/qa-fila');
  const forma = page.getByLabel('Forma de pagamento de TIT-QA', { exact: true });
  await forma.waitFor();
  const cartao = page.getByLabel('Cartão de TIT-QA', { exact: true });
  assert.equal(await cartao.locator('option[value="20"]').count(), 0);
  await cartao.selectOption('10');
  const conta = page.getByLabel('Conta pagadora de TIT-QA', { exact: true });
  assert.equal(await conta.inputValue(), '5'); assert.equal(await conta.locator('option[value="6"]').count(), 0);
  await page.getByRole('button', { name: 'Registrar baixa', exact: true }).click();
  await page.waitForFunction(() => window.__settles.length === 1);
  let payload = await page.evaluate(() => window.__settles[0]);
  assert.equal(payload.itens[0].cartao_id, 10); assert.equal(payload.itens[0].forma_pagamento_id, 1);
  assert.equal(payload.itens[0].conta_bancaria_id, 5); assert(payload.key);
  await forma.waitFor(); await forma.selectOption('3');
  assert.equal(await cartao.count(), 0); assert.equal(await conta.locator('option[value="6"]').count(), 1);
  await page.getByRole('button', { name: 'Registrar baixa', exact: true }).click();
  await page.waitForFunction(() => window.__settles.length === 2);
  payload = await page.evaluate(() => window.__settles[1].itens[0]);
  assert.equal(payload.forma_pagamento_id, 3); assert.equal(payload.cartao_id, undefined);
  await forma.waitFor(); await forma.selectOption('4');
  await page.getByLabel('Origem do cheque de TIT-QA', { exact: true }).selectOption('CARTEIRA');
  const cheque = page.getByLabel('Cheque da carteira de TIT-QA', { exact: true });
  assert.equal(await cheque.locator('option[value="88"]').count(), 0);
  await cheque.selectOption('77');
  await page.getByRole('button', { name: 'Registrar baixa', exact: true }).click();
  await page.waitForFunction(() => window.__settles.length === 3);
  payload = await page.evaluate(() => window.__settles[2].itens[0]);
  assert.equal(payload.usar_cheque_terceiro, true); assert.equal(payload.cheque_terceiro_id, 77);
  assert.equal(payload.cheque_numero, undefined); assert.equal(payload.cartao_id, undefined);
  await forma.waitFor(); await page.getByLabel('Origem do cheque de TIT-QA', { exact: true }).selectOption('PROPRIO');
  await page.getByText('Dados do cheque próprio', { exact: true }).click();
  await page.getByLabel('Numero do cheque *', { exact: true }).fill('123');
  await page.getByLabel('Emitente / titular *', { exact: true }).fill('Empresa QA');
  await page.getByRole('button', { name: 'Registrar baixa', exact: true }).click();
  await page.waitForFunction(() => window.__settles.length === 4);
  payload = await page.evaluate(() => window.__settles[3].itens[0]);
  assert.equal(payload.cheque_numero, '123'); assert.equal(payload.cheque_emitente, 'Empresa QA');
  assert.equal(payload.cheque_terceiro_id, undefined); assert.equal(payload.usar_cheque_terceiro, undefined);
  await page.getByRole('button', { name: /Não pagos/ }).click();
  await page.getByText('Documento divergente', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /Registrar baixa|Reabrir|Encerrar/ }).count(), 0);
  assert.equal(await page.getByText('Rejeitado pelo proprietário · somente consulta', { exact: true }).count(), 1);
  assert.equal(await page.getByLabel('Selecionar TIT-REJEITADO', { exact: true }).isDisabled(), true);
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log('OK: fila real, credito, conta vinculada, PIX sem campos antigos, carteira por empresa, payloads e rejeicao somente consulta. APIs isoladas.');
} finally { await browser?.close(); await server.close(); }
