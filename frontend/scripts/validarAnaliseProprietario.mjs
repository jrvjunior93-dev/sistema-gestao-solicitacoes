import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'src/pages/FinanceiroTitulos.jsx'), 'utf8');
const handler = source.slice(source.indexOf('async function enviarSelecionadosParaPagamento('), source.indexOf('async function excluirTitulosSelecionados('));
const buttons = source.slice(source.indexOf("{canPrepareAutorizacao && tipoReferencia === 'PAGAR' ? ("), source.indexOf('{canCreateBaixaComposta ? (', source.indexOf("{canPrepareAutorizacao && tipoReferencia === 'PAGAR' ? (")));
assert(buttons.includes("enviarSelecionadosParaPagamento('AUTORIZACAO')"));
assert(buttons.includes("enviarSelecionadosParaPagamento('FILA')"));
assert(source.includes('canAlterarStatusInterno ? ('));
assert(source.includes('|| canPrepareAutorizacao || canAlterarStatusInterno'));
assert(!handler.includes('canInformarAutorizacaoPapel'));

function scenario(overrides = {}) {
  const posts = [], confirms = [], errors = [], pending = { current: false }, key = { current: null };
  let failures = 0;
  const context = {
    tipoReferencia: 'PAGAR', canPrepareFila: true, canPrepareAutorizacao: true, autorizacaoDigitalDisponivel: true,
    selectedTitulosBaixaveis: [{ id: 2 }, { id: 1 }], selectedSaldo: 150,
    envioPagamentoPendenteRef: pending, envioPagamentoChaveRef: key,
    confirmar: async (options) => { confirms.push(options); await Promise.resolve(); return { ok: true, texto: 'Autorizado pelo proprietario em papel.' }; },
    setError: (message) => errors.push(message), setSendingFilaPagamentos() {},
    avisar: { sucesso() {} }, formatCurrency: (value) => `R$ ${value}`, compactFilters: (value) => value,
    appliedFilters: {}, ordenacao: null, pagination: { page: 1, limit: 25 },
    getTitulosFinanceiros: async () => [], setTitulos() {}, setPagination() {}, setSelectedTituloIds() {},
    criarAutorizacaoPagamento: async (...args) => { posts.push({ destino: 'AUTORIZACAO', args }); return { codigo: 'AUT-TESTE' }; },
    enviarTitulosFilaPagamentos: async (...args) => { posts.push({ destino: 'FILA', args }); if (failures-- > 0) throw new Error('Resposta perdida'); return { quantidade: 2 }; },
    ...overrides
  };
  const submit = vm.runInNewContext(handler + '; enviarSelecionadosParaPagamento', context);
  return { submit, posts, confirms, errors, pending, context, failOnce: () => { failures = 1; } };
}
const both = scenario(); await Promise.all([both.submit('AUTORIZACAO'), both.submit('FILA')]);
assert.equal(both.posts.length, 1); assert.equal(both.confirms.length, 1); assert.equal(both.posts[0].destino, 'AUTORIZACAO');
assert.equal(both.confirms[0].campo, undefined); assert.equal(both.pending.current, false);
const direct = scenario(); await direct.submit('FILA'); assert.equal(direct.posts[0].args.length, 2);
assert.equal(direct.confirms[0].campo, undefined, 'Sem segunda confirmacao ou declaracao de autorizacao');
const digitalOnly = scenario({ canPrepareFila: false });
await digitalOnly.submit('AUTORIZACAO'); await digitalOnly.submit('FILA'); assert.equal(digitalOnly.posts.length, 1);
const queueOnly = scenario({ canPrepareAutorizacao: false });
await queueOnly.submit('AUTORIZACAO'); await queueOnly.submit('FILA'); assert.equal(queueOnly.posts.length, 1); assert.equal(queueOnly.posts[0].args[2], undefined);
const disabled = scenario({ autorizacaoDigitalDisponivel: false }); await disabled.submit('AUTORIZACAO'); await disabled.submit('FILA');
assert.equal(disabled.posts.length, 1); assert.equal(disabled.posts[0].destino, 'FILA');
const cancel = scenario({ confirmar: async () => ({ ok: false }) }); await cancel.submit('FILA'); assert.equal(cancel.posts.length, 0); assert.equal(cancel.pending.current, false);
const empty = scenario({ selectedTitulosBaixaveis: [] }); await empty.submit('FILA'); assert.equal(empty.confirms.length, 0);
const retry = scenario(); retry.failOnce(); await retry.submit('FILA'); await retry.submit('FILA');
assert.equal(retry.posts[0].args[1], retry.posts[1].args[1], 'Retry conserva chave de idempotencia');
const freeze = scenario(); freeze.context.confirmar = async () => {
  freeze.context.selectedTitulosBaixaveis.push({ id: 3 }); return { ok: true, texto: 'Autorizado pelo proprietario em papel.' };
};
await freeze.submit('FILA'); assert.deepEqual(Array.from(freeze.posts[0].args[0]), [1, 2]);

// Toolbar e handler reais; hook de confirmacao e CSS reais. Apenas APIs simuladas.
const fixture = `import React, {useState,useRef} from 'react';import {createRoot} from 'react-dom/client';
import {useConfirmacao} from '/src/components/padrao/Confirmacao.jsx';
import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/escala.css';import '/src/styles/componentes-padrao.css';import '/src/styles/responsive-system.css';
window.posts=[];
function Fixture(){
  const params=new URLSearchParams(location.search),mode=params.get('mode')||'PILOT',grant=params.get('grant')||'both';
  const canPrepareAutorizacao=['both','prepare'].includes(grant),canPrepareFila=['both','queue'].includes(grant);
  const autorizacaoDigitalDisponivel=!['OFF','PAUSED'].includes(mode);
  const tipoReferencia='PAGAR',selectedTitulosBaixaveis=[{id:1}],selectedSaldo=100,savingBaixaMassa=false;
  const [sendingFilaPagamentos,setSendingFilaPagamentos]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const envioPagamentoPendenteRef=useRef(false),envioPagamentoChaveRef=useRef(null),{confirmar,elementoConfirmacao}=useConfirmacao();
  const formatCurrency=value=>'R$ '+value,avisar={sucesso:setNotice},appliedFilters={},ordenacao=null,pagination={page:1,limit:25};
  const compactFilters=value=>value,getTitulosFinanceiros=async()=>[],setTitulos=()=>{},setPagination=()=>{},setSelectedTituloIds=()=>{};
  const criarAutorizacaoPagamento=async(...args)=>{window.posts.push({destino:'AUTORIZACAO',args});return{codigo:'AUT-TESTE'};};
  const enviarTitulosFilaPagamentos=async(...args)=>{window.posts.push({destino:'FILA',args});return{quantidade:1};};
  ${handler}
  return <main className="p-4" style={{color:'var(--c-text)',background:'var(--c-bg)',minHeight:'100vh'}}>
    <section className="card p-4"><h1>Contas a Pagar</h1><p>1 título selecionado · R$ 100,00</p><div className="flex flex-wrap gap-2 mt-3">${buttons}</div>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}</section>{elementoConfirmacao}</main>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);`;
const server = await createServer({ root, configFile: false, logLevel: 'error', server: { host: '127.0.0.1', port: 0 },
  plugins: [{ name: 'owner-analysis-fixture', enforce: 'pre', resolveId(id) { if (id === '/fixture.jsx') return '\0owner-fixture.jsx'; },
    async load(id) { if (id === '\0owner-fixture.jsx') return transformWithEsbuild(fixture, 'fixture.jsx', { loader: 'jsx', jsx: 'transform' }); },
    configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
      if (new URL(req.url, 'http://localhost').pathname !== '/fixture') return next();
      res.setHeader('Content-Type', 'text/html'); res.end(await vite.transformIndexHtml('/fixture', '<html lang="pt-BR"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
    }); } }, react()], optimizeDeps: { include: ['react', 'react-dom/client'] }
});
let browser;
try {
  await server.listen(); browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }), errors = [];
  page.setDefaultTimeout(10000); page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  const url = `http://127.0.0.1:${server.httpServer.address().port}/fixture`;
  const output = path.join(root, '../outputs/analise-proprietario'); mkdirSync(output, { recursive: true });
  for (const mode of ['OFF', 'PILOT', 'ENFORCED', 'PAUSED']) {
    await page.goto(`${url}?mode=${mode}`);
    const digitalButton = page.getByRole('button', { name: /Solicitar autorização/ });
    assert.equal(await digitalButton.count(), 1); assert.equal(await digitalButton.isEnabled(), !['OFF','PAUSED'].includes(mode));
    await page.getByRole('button', { name: /Enviar para pagamento/ }).click();
    assert.equal(await page.getByRole('textbox').count(), 0);
    await page.getByRole('dialog').getByRole('button', { name: 'Enviar para pagamento', exact: true }).dblclick();
    await page.getByRole('status').waitFor();
    assert.equal(await page.evaluate(() => window.posts.length), 1);
    assert.equal(await page.evaluate(() => window.posts[0].args.length), 2);
  }
  await page.goto(`${url}?grant=prepare`); assert.equal(await page.getByRole('button', { name: /Enviar para pagamento/ }).count(), 0);
  await page.getByRole('button', { name: /Solicitar autorização/ }).click();
  assert.equal(await page.getByRole('textbox').count(), 0); await page.getByRole('button', { name: 'Solicitar autorização', exact: true }).click();
  await page.getByRole('status').waitFor(); assert.equal(await page.evaluate(() => window.posts[0].destino), 'AUTORIZACAO');
  await page.goto(`${url}?grant=queue`); assert.equal(await page.getByRole('button', { name: /Solicitar autorização/ }).count(), 0);
  await page.getByRole('button', { name: /Enviar para pagamento/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Enviar para pagamento', exact: true }).click();
  await page.getByRole('status').waitFor(); assert.equal(await page.evaluate(() => window.posts.length), 1);
  await page.goto(`${url}?grant=none`); assert.equal(await page.getByRole('button').count(), 0);
  for (const [theme,width] of [['light',1280],['dark',1280],['dark',390]]) {
    await page.setViewportSize({ width, height: 800 }); await page.goto(url);
    await page.evaluate((value) => { document.documentElement.classList.toggle('dark',value==='dark'); }, theme);
    await page.screenshot({ path: path.join(output, `${theme}-${width}.png`) });
    await page.getByRole('button', { name: /Enviar para pagamento/ }).click();
    await page.screenshot({ path: path.join(output, `${theme}-${width}-confirmacao.png`) });
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    assert.equal(await page.evaluate(() => window.posts.length), 0);
  }
  assert.deepEqual(errors, []);
  console.log('OK: acoes e permissoes independentes, quatro modos, confirmacao unica, selecao congelada, retry/duplo clique e toolbar em temas claro/escuro/celular. Sem APIs externas.');
} finally { if (browser) await browser.close(); await server.close(); }
