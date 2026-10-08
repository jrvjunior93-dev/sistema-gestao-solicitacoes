// Tela real; APIs e sessao simuladas. Nenhum acesso ao banco ou ambiente externo.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';
import { mensagemEnvioFila } from '../src/utils/filaPagamentoMensagem.js';

assert.match(mensagemEnvioFila({ criados: 0, ja_na_fila: 2, ja_processados: 0 }), /sem novo envio/);
assert.match(mensagemEnvioFila({ criados: 1, ja_na_fila: 1, ja_processados: 0 }), /1/);
assert.match(mensagemEnvioFila({ criados: 0, ja_na_fila: 0, ja_processados: 1 }), /processado/);
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stub = '\0qa-autorizacao-';
const plugin = {
  name: 'qa-autorizacao-isolada', enforce: 'pre',
  resolveId(source, importer) {
    if (!importer?.endsWith('/FinanceiroAutorizacoesPagamento.jsx')) return;
    if (source === '../contexts/AuthContext') return stub + 'auth';
    if (source === '../components/padrao') return stub + 'padrao';
    if (source === '../utils/webauthn') return stub + 'webauthn';
  },
  load(id) {
    if (id === stub + 'webauthn') return `export const autenticarComPasskey=async()=>({id:'qa-key'}),registrarPasskey=async()=>({}),suportaPasskeys=()=>true;`;
    if (id === stub + 'auth') return `export const useAuth=()=>({user:{autorizacao_pagamentos:{mode:'PILOT',can_decide:true,can_prepare:true,passkey_count:1}},refreshSession:async()=>{}});`;
    if (id === stub + 'padrao') return `import React from 'react'; export const Pagina=({children})=>React.createElement('main',null,children);export const PageHeader=({title})=>React.createElement('h1',null,title);export const Avisos=()=>null;export const useAvisos=()=>({avisos:[],fechar:()=>{},avisar:{erro:()=>{},sucesso:()=>{}}});`;
  },
  configureServer(server) {
    server.middlewares.use('/qa-autorizacao', async (_, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end(await server.transformIndexHtml('/qa-autorizacao', `<html><body><div id="root"></div><script type="module">import React from 'react';import{createRoot}from'react-dom/client';import Page from '/src/pages/FinanceiroAutorizacoesPagamento.jsx';createRoot(document.getElementById('root')).render(React.createElement(Page));</script></body></html>`));
    });
  }
};
const server = await createServer({ root, plugins: [plugin], server: { host: '127.0.0.1', port: 5307, strictPort: true, proxy: {} } });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const page = await browser.newPage();
  const errors = [], unexpected = [];
  page.on('pageerror', e => errors.push(e.message));
  let rows = [{ id: 1, codigo: 'QA-1', status: 'AGUARDANDO', valor_total: 150, quantidade_itens: 2, dossie_hash: 'qa', itens: [
    { id: 1, status: 'PENDENTE', valor_snapshot: 100, snapshot_json: { codigo: 'TIT-1' } },
    { id: 2, status: 'PENDENTE', valor_snapshot: 50, snapshot_json: { codigo: 'TIT-2' } }
  ] }];
  let holdNext = false, releaseHeld, heldStarted; const decisions = [];
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    const json = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    if (url.pathname.endsWith('/autenticacao/opcoes')) return json({ challenge: 'qa' });
    if (url.pathname.endsWith('/decidir')) {
      decisions.push(request.postDataJSON());
      rows[0].status = 'AGUARDANDO';
      rows[0].itens[0].status = 'PENDENTE'; delete rows[0].itens[0].fila_item_id;
      return json(rows[0]);
    }
    if (url.pathname.endsWith('/financeiro/autorizacoes-pagamento')) {
      assert.equal(request.method(), 'GET');
      const snapshot = structuredClone(rows);
      if (holdNext) {
        holdNext = false;
        await new Promise(resolve => { releaseHeld = resolve; heldStarted?.(); });
      }
      return json({ data: snapshot });
    }
    if (url.pathname.endsWith('/financeiro/autorizacoes-pagamento/passkeys')) return json({ data: [] });
    if (url.origin === 'http://127.0.0.1:5307' && !url.pathname.startsWith('/api')) return route.continue();
    unexpected.push(url.pathname); return route.abort();
  });
  await page.goto('http://127.0.0.1:5307/qa-autorizacao');
  const checks = page.getByRole('checkbox');
  await checks.nth(1).waitFor();
  assert.equal(await checks.nth(0).isChecked(), true);
  await checks.nth(1).uncheck();
  rows[0].itens[0].status = 'ENFILEIRADO'; rows[0].itens[0].fila_item_id = 11;
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await page.getByText('Fila #11', { exact: true }).waitFor();
  assert.equal(await checks.count(), 1);
  assert.equal(await checks.first().isChecked(), false);
  assert.equal(await page.getByRole('button', { name: /^Autorizar/ }).isDisabled(), true);
  await checks.first().check();
  await page.getByRole('button', { name: /Autorizar.*50,00/ }).waitFor();

  // Uma resposta antiga nao pode reabrir a pendencia que um GET mais novo encerrou.
  holdNext = true;
  const started = new Promise(resolve => { heldStarted = resolve; });
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await started;
  rows[0].status = 'CONCLUIDO'; rows[0].itens[1].status = 'ENFILEIRADO'; rows[0].itens[1].fila_item_id = 12;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.getByText('Fila #12', { exact: true }).waitFor();
  releaseHeld();
  await page.waitForResponse(response => response.url().endsWith('/financeiro/autorizacoes-pagamento'));
  assert.equal(await checks.count(), 0);
  assert.equal(await page.getByText('Na fila de pagamento', { exact: true }).count(), 2);
  assert.equal(await page.getByText('NA FILA', { exact: true }).count(), 2, 'Rotulo do lote na lista e no detalhe');
  assert.equal(await page.getByText('CONCLUIDO', { exact: true }).count(), 0);
  assert.equal(await page.locator('.pa-status--concluido').count(), 2, 'Status interno e estilo preservados');
  assert.equal(await page.getByRole('button', { name: /^Autorizar/ }).count(), 0);

  // Lote misto: o rotulo nao transforma um item rejeitado em enfileirado.
  rows[0].itens[1].status = 'REJEITADO'; delete rows[0].itens[1].fila_item_id;
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await page.getByText('REJEITADO', { exact: true }).waitFor();
  assert.equal(await page.getByText('NA FILA', { exact: true }).count(), 2);
  assert.equal(await page.getByText('Na fila de pagamento', { exact: true }).count(), 1);

  // Autorizacao ja gravada: somente o preparo pode reprocessar, sem nova decisao.
  rows[0].status = 'AUTORIZADO'; rows[0].itens[0].status = 'AUTORIZADO'; delete rows[0].itens[0].fila_item_id;
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await page.getByRole('button', { name: 'Reprocessar envio à fila', exact: true }).waitFor();
  assert.equal(await checks.count(), 0);
  assert.equal(await page.getByText('NA FILA', { exact: true }).count(), 0);
  assert.equal(await page.getByText('AUTORIZADO', { exact: true }).count(), 3);
  assert.equal(await page.getByRole('button', { name: /^Autorizar/ }).count(), 0);
  // Revogar titulo autorizado exige motivo + passkey, sem nova baixa/estorno.
  rows[0].itens[0].titulo = { status: 'ABERTO', valor_baixado: 0 };
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await page.getByRole('button', { name: 'Revogar autorização', exact: true }).click();
  const confirmRevoke = page.getByRole('button', { name: 'Confirmar revogação com passkey', exact: true });
  assert.equal(await confirmRevoke.isDisabled(), true);
  await page.getByLabel('Motivo da revogação', { exact: true }).fill('Revisar documento');
  await confirmRevoke.click();
  await checks.first().waitFor();
  assert.equal(decisions.length, 1); assert.equal(decisions[0].decisoes[0].decisao, 'REVOGAR');
  assert.equal(decisions[0].decisoes[0].motivo, 'Revisar documento'); assert.equal(decisions[0].credential.id, 'qa-key');
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log('OK: tela real, atualizacao manual/foco, fila vinculada, selecao preservada, resposta obsoleta, NA FILA na lista/detalhe, lote misto e reprocessar sem nova decisao. APIs simuladas.');
} finally { await browser?.close(); await server.close(); }
