import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = `import React from 'react';import {createRoot} from 'react-dom/client';import Bloco from '/src/components/contratos/BlocoMedicaoContrato.jsx';
createRoot(document.getElementById('root')).render(<main className="layout-main" style={{padding:16,minWidth:0}}><form onSubmit={e=>{e.preventDefault();window.submits=(window.submits||0)+1;}}><Bloco semCard contratoId={4} onChange={d=>window.medicao=d}/></form></main>);`;
const mock = `let criado=false;
export async function getContratoParcelas(){return {contrato:{id:4,medivel:true},saldo:{valor_contrato:44100,comprometido:19999.68,saldo:24100.32},parcelas:[
{id:1,numero:1,valor:9999.68,valor_previsto:9999.68,vencimento:'2026-10-08',status:'QUITADO',medivel:false,editavel:false},
{id:2,numero:2,valor:10000,valor_previsto:34100.32,vencimento:'2026-10-13',status:'QUITADO',medivel:false,editavel:false},
...(criado?[{id:3,numero:3,valor:24100.32,valor_previsto:24100.32,vencimento:'2026-11-15',status:'PREVISAO',medivel:true,editavel:true}]:[])]};}
export async function getSaldoReprogramacaoContrato(){return {saldo_disponivel:24100.32,referencia:'a'.repeat(64),maximo_parcelas:22,pode_reprogramar:!location.search.includes('negado')};}
export async function reprogramarSaldoContrato(id,data){window.envios=[...(window.envios||[]),{id,data}];await new Promise(r=>setTimeout(r,120));if(location.search.includes('erro'))throw new Error('Saldo mudou. Atualize antes de confirmar.');criado=true;return {};}
export async function getFormasPagamentoMedicao(){return {formas:[]};}
export async function getOpcoesFormularioContrato(){return {};}`;
const server = await createServer({ root, configFile: false, logLevel: 'error', server: { host: '127.0.0.1', port: 0 },
  plugins: [{ name: 'qa-saldo-contrato', enforce: 'pre',
    resolveId(id) { if (id === '/entry-saldo.jsx') return '\0qa-saldo.jsx'; },
    async load(id) { if (id === '\0qa-saldo.jsx') return transformWithEsbuild(fixture, 'fixture.jsx', { loader: 'jsx', jsx: 'transform' }); },
    transform(code, id) { if (id.replaceAll('\\', '/').endsWith('/src/services/contratos.js')) return mock; },
    configureServer(s) { s.middlewares.use(async (req, res, next) => {
      if (!req.url.startsWith('/qa-saldo')) return next();
      res.setHeader('Content-Type', 'text/html'); res.end(await s.transformIndexHtml('/qa-saldo', '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/entry-saldo.jsx"></script></body></html>'));
    }); }
  }, react()], optimizeDeps: { include: ['react', 'react-dom/client'] } });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const out = path.join(root, '../outputs/contrato-saldo-reprogramacao');
fs.mkdirSync(out, { recursive: true });
try {
  for (const width of [1366, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 950 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', r => new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort());
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/qa-saldo`);
    const css = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8').match(/href="\/assets\/([^\"]+\.css)"/)[1];
    await page.addStyleTag({ path: path.join(root, 'dist/assets', css) });
    await page.getByRole('button', { name: 'Reprogramar saldo', exact: true }).click({ timeout: 12000 }).catch(async e => {
      console.log('Erros da fixture:', errors); console.log(await page.locator('body').innerText()); throw e;
    });
    await page.getByLabel('Quantidade de novas parcelas').fill('3');
    assert.equal(await page.getByLabel('Valor da nova parcela 3', { exact: true }).inputValue(), '8033,44');
    await page.getByLabel('Quantidade de novas parcelas').fill('1');
    await page.getByLabel('Vencimento da nova parcela 1', { exact: true }).fill('15/11/2026');
    await page.getByLabel('Justificativa da reprogramação').fill('Continuidade dos serviços no saldo contratado');
    await page.getByLabel('Valor da nova parcela 1', { exact: true }).press('Enter');
    assert.equal(await page.evaluate(() => window.submits || 0), 0, 'Enter nos campos nao envia a solicitacao principal');
    assert.equal(await page.getByRole('button', { name: 'Confirmar novas parcelas' }).isEnabled(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Sem transbordamento horizontal');
    await page.screenshot({ path: path.join(out, `saldo-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Confirmar novas parcelas' }).dblclick();
    await page.getByRole('button', { name: 'Confirmar novas parcelas' }).waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.envios.length), 1);
    assert.equal(await page.evaluate(() => window.envios[0].data.parcelas[0].valor), 24100.32, 'Moeda brasileira vira valor numerico correto');
    assert.equal(await page.evaluate(() => window.submits || 0), 0, 'Nao enviar Nova Solicitacao ao reprogramar');
    await page.getByRole('checkbox', { name: 'Medir parcela 3', exact: true }).check();
    assert.equal(await page.evaluate(() => window.medicao.itens[0].contrato_parcela_id), 3, 'Nova parcela entra no payload normal da medicao');
    assert.deepEqual(errors, []); await page.close();
  }
  const negado = await browser.newPage();
  await negado.route('**/*', r => new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort());
  await negado.goto(`http://127.0.0.1:${server.httpServer.address().port}/qa-saldo?negado`);
  await negado.getByText('Medição — títulos do contrato').waitFor();
  await negado.waitForFunction(() => Boolean(window.medicao?.saldo));
  assert.equal(await negado.getByRole('button', { name: 'Reprogramar saldo', exact: true }).count(), 0);
  console.log('UI saldo: desktop/mobile, centavos, previsoes selecionaveis, negativo ACL e duplo clique sem enviar solicitacao aprovados. API simulada, sem banco/rede externa.');
} finally { await browser.close(); await server.close(); }
