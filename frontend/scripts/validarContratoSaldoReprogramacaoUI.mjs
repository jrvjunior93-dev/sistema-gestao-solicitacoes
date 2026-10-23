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
const mock = `let criadas=[], falhouReload=false;
export async function getContratoParcelas(){return {contrato:{id:4,medivel:true},saldo:{valor_contrato:44100,comprometido:19999.68,saldo:24100.32},parcelas:[
{id:1,numero:1,valor:9999.68,valor_previsto:9999.68,vencimento:'2026-10-08',status:'QUITADO',medivel:false,editavel:false},
{id:2,numero:2,valor:10000,valor_previsto:34100.32,vencimento:'2026-10-13',status:'QUITADO',medivel:false,editavel:false},
...criadas.map((p,i)=>({id:3+i,numero:3+i,valor:p.valor,valor_previsto:p.valor,vencimento:p.vencimento,status:'PREVISAO',medivel:true,editavel:true}))]};}
export async function getSaldoReprogramacaoContrato(){
 if(criadas.length && location.search.includes('reload') && !falhouReload){falhouReload=true;throw new Error('Consulta indisponivel');}
 const livre=(2410032-criadas.reduce((s,p)=>s+Math.round(p.valor*100),0))/100;
 return {saldo_disponivel:livre,referencia:('a'+criadas.length).padEnd(64,'0'),maximo_parcelas:22-criadas.length,pode_reprogramar:livre>0&&!location.search.includes('negado')};}
export async function reprogramarSaldoContrato(id,data){window.envios=[...(window.envios||[]),{id,data}];await new Promise(r=>setTimeout(r,120));if(location.search.includes('erro'))throw new Error('Saldo mudou. Atualize antes de confirmar.');criadas.push(...data.parcelas);return {};}
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
    const valor = page.getByLabel('Valor da nova parcela 1', { exact: true });
    await valor.fill(''); await valor.pressSequentially('2800,50');
    assert.equal(await valor.inputValue(), '2800,50', 'Digitar sequencialmente sem mascara mudar o cursor');
    await valor.press('Home'); await valor.press('ArrowRight'); await valor.press('Delete'); await valor.press('9');
    assert.equal(await valor.inputValue(), '2900,50', 'Edicao no meio do valor preserva cursor');
    assert.equal(await valor.evaluate(e => e.selectionStart), 2);
    await valor.press('End'); await valor.press('Backspace'); await valor.press('5');
    assert.equal(await valor.inputValue(), '2900,55');
    await page.getByLabel('Vencimento da nova parcela 1', { exact: true }).fill('15/11/2026');
    assert.match(await valor.inputValue(), /2\.900,55/, 'Formatar somente ao sair do campo');
    await page.getByLabel('Justificativa da reprogramação').fill('Continuidade dos serviços no saldo contratado');
    const confirmar = page.getByRole('button', { name: 'Confirmar novas parcelas' });
    for (const invalido of ['0', '-1', '24100,33']) {
      await valor.fill(invalido); await valor.press('Tab'); assert.equal(await confirmar.isEnabled(), false);
    }
    await page.getByText('Excede o saldo disponível em', { exact: false }).waitFor();
    await valor.fill('R$ 2.800,00'); await valor.press('Tab');
    await page.getByText('Saldo para futuras reprogramações: R$ 21.300,32', { exact: false }).waitFor();
    await page.getByLabel('Valor da nova parcela 1', { exact: true }).press('Enter');
    assert.equal(await page.evaluate(() => window.submits || 0), 0, 'Enter nos campos nao envia a solicitacao principal');
    assert.equal(await page.getByRole('button', { name: 'Confirmar novas parcelas' }).isEnabled(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Sem transbordamento horizontal');
    await page.screenshot({ path: path.join(out, `saldo-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Confirmar novas parcelas' }).dblclick();
    await page.getByRole('button', { name: 'Confirmar novas parcelas' }).waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.envios.length), 1);
    assert.equal(await page.evaluate(() => window.envios[0].data.parcelas[0].valor), 2800, 'Moeda brasileira vira valor numerico correto');
    assert.equal(await page.evaluate(() => window.submits || 0), 0, 'Nao enviar Nova Solicitacao ao reprogramar');
    await page.getByRole('checkbox', { name: 'Medir parcela 3', exact: true }).check();
    assert.equal(await page.evaluate(() => window.medicao.itens[0].contrato_parcela_id), 3, 'Nova parcela entra no payload normal da medicao');
    await page.getByRole('button', { name: 'Reprogramar saldo', exact: true }).click();
    assert.equal(await valor.inputValue(), '21300,32', 'Sobra fica disponivel sem recarregar a pagina');
    await page.getByLabel('Vencimento da nova parcela 1', { exact: true }).fill('15/12/2026');
    await page.getByLabel('Justificativa da reprogramação').fill('Programar o saldo restante');
    await confirmar.click(); await confirmar.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.envios.length), 2);
    assert.equal(await page.evaluate(() => window.envios[1].data.parcelas[0].valor), 21300.32);
    assert.notEqual(await page.evaluate(() => window.envios[0].data.referencia), await page.evaluate(() => window.envios[1].data.referencia));
    assert.equal(await page.getByRole('button', { name: 'Reprogramar saldo', exact: true }).count(), 0);
    await page.getByRole('checkbox', { name: 'Medir parcela 4', exact: true }).waitFor({ timeout: 4000 }).catch(async e => {
      console.log(await page.locator('body').innerText()); throw e;
    });
    assert.deepEqual(errors, []); await page.close();
  }
  const negado = await browser.newPage();
  await negado.route('**/*', r => new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort());
  await negado.goto(`http://127.0.0.1:${server.httpServer.address().port}/qa-saldo?negado`);
  await negado.getByText('Medição — títulos do contrato').waitFor();
  await negado.waitForFunction(() => Boolean(window.medicao?.saldo));
  assert.equal(await negado.getByRole('button', { name: 'Reprogramar saldo', exact: true }).count(), 0);
  await negado.close();
  for (const caso of ['erro', 'reload', 'total']) {
    const page = await browser.newPage({ viewport: { width: 1366, height: 950 } });
    await page.route('**/*', r => new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort());
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/qa-saldo?${caso}`);
    await page.getByRole('button', { name: 'Reprogramar saldo', exact: true }).click();
    if (caso !== 'total') await page.getByLabel('Valor da nova parcela 1', { exact: true }).fill('2800.50');
    await page.getByLabel('Vencimento da nova parcela 1', { exact: true }).fill('15/11/2026');
    await page.getByLabel('Justificativa da reprogramação').fill('Teste de retomada segura');
    const confirmar = page.getByRole('button', { name: 'Confirmar novas parcelas' });
    await confirmar.click();
    if (caso === 'erro') {
      await page.getByRole('alert').filter({ hasText: 'Saldo mudou' }).waitFor();
      assert.equal(await confirmar.isEnabled(), true);
      assert.match(await page.getByLabel('Valor da nova parcela 1', { exact: true }).inputValue(), /2\.800,50/);
    } else if (caso === 'reload') {
      await page.getByRole('alert').filter({ hasText: 'Parcelas criadas, mas a consulta falhou' }).waitFor();
      await page.getByRole('button', { name: 'Fechar', exact: true }).click();
      await page.getByRole('button', { name: 'Reprogramar saldo', exact: true }).click();
      await page.getByRole('button', { name: 'Recarregar parcelas' }).click();
      await page.getByRole('button', { name: 'Recarregar parcelas' }).waitFor({ state: 'hidden' });
      assert.equal(await page.getByRole('button', { name: 'Reprogramar saldo', exact: true }).count(), 1);
    } else {
      await confirmar.waitFor({ state: 'hidden' });
      assert.equal(await page.evaluate(() => window.envios[0].data.parcelas[0].valor), 24100.32);
      assert.equal(await page.getByRole('button', { name: 'Reprogramar saldo', exact: true }).count(), 0);
    }
    assert.equal(await page.evaluate(() => window.envios.length), 1, 'Falha de leitura nao repete POST');
    assert.equal(await page.evaluate(() => window.submits || 0), 0);
    await page.close();
  }
  console.log('UI saldo: parcial/total/sobra, segunda programacao sem reload, teclado/cursor/colar/centavos, desktop/mobile, ACL, excesso/zero/negativo, erro/retomada e duplo clique sem repetir POST ou enviar solicitacao aprovados. API simulada, sem banco/rede externa.');
} finally { await browser.close(); await server.close(); }
