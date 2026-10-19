// Tela real; APIs e sessao simuladas. Nenhum acesso ao banco ou ambiente externo.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { mensagemEnvioFila } from '../src/utils/filaPagamentoMensagem.js';
import { codigoLoteAutorizacao, motivosAjusteAutorizacao, resumoSolicitacaoAutorizacao } from '../src/utils/autorizacaoPagamentoResumo.js';

const legacyLot = Object.freeze({ id: 42, codigo: 'AUT-20261008-ABCDEF' });
assert.equal(codigoLoteAutorizacao(legacyLot), 'LOTE-42');
assert.equal(legacyLot.codigo, 'AUT-20261008-ABCDEF');
assert.deepEqual(motivosAjusteAutorizacao({ itens: [{ id: 1, status: 'REJEITADO', motivo_decisao: 'Corrigir',
  snapshot_json: { codigo: 'TIT-1', solicitacao: { codigo: 'SOL-1' } } }, { id: 2, status: 'AUTORIZADO', motivo_decisao: 'Antigo' }] }),
  [{ id: 1, motivo: 'Corrigir', referencia: 'SOL-1 · TIT-1' }]);
assert.equal(codigoLoteAutorizacao({ id: 3, codigo: 'LOTE-3' }), 'LOTE-3');
assert.equal(codigoLoteAutorizacao({ codigo: 'LEGADO' }), 'LEGADO');

assert.equal(resumoSolicitacaoAutorizacao({ solicitacao: { descricao: 'Solicitação de Compra\nItens: Cimento' }, descricao: 'Forma 1 - SOL-1993 - SOLICITAÇÃO DE COMPRA: Itens: Tijolo' }), 'Solicitação de Compra');
assert.equal(resumoSolicitacaoAutorizacao({ solicitacao: { descricao: 'Compra Direta\nItens: Areia\nObservações: teste' }, descricao: 'Titulo personalizado' }), 'Compra Direta');
assert.equal(resumoSolicitacaoAutorizacao({ descricao: 'Forma 2 - SOL-24 - COMPRA DIRETA: Itens: Areia - Parcela 1/3' }), 'Compra Direta');
assert.equal(resumoSolicitacaoAutorizacao({ descricao: 'SOL-25 - SOLICITACAO DE COMPRA: Itens: Tijolo' }), 'Solicitação de Compra');
assert.equal(resumoSolicitacaoAutorizacao({ descricao: 'Contrato de consultoria para compra direta' }), 'Contrato de consultoria para compra direta');
assert.equal(resumoSolicitacaoAutorizacao({ forma_pagamento: { nome: 'Compra Direta' }, descricao: 'Pagamento de mão de obra' }), 'Pagamento de mão de obra', 'Forma de pagamento nao identifica origem da solicitacao');
const frozenPurchase = Object.freeze({ solicitacao: Object.freeze({ codigo: 'SOL-24', descricao: 'Compra Direta\nItens: Areia' }), descricao: 'Titulo original' });
assert.equal(resumoSolicitacaoAutorizacao(frozenPurchase), 'Compra Direta');
assert.equal(frozenPurchase.solicitacao.descricao, 'Compra Direta\nItens: Areia', 'Descricao congelada preservada');
assert.equal(resumoSolicitacaoAutorizacao({ descricao: 'Pagamento de mão de obra valor total: R$ 500,00' }), 'Pagamento de mão de obra');

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
      res.end(await server.transformIndexHtml('/qa-autorizacao', `<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body><div id="root" class="layout-shell"></div><script type="module">import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/componentes-padrao.css';import Page from '/src/pages/FinanceiroAutorizacoesPagamento.jsx';createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,React.createElement(Page)));</script></body></html>`));
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
  let rows = [{ id: 1, codigo: 'QA-1', status: 'AGUARDANDO', valor_total: 150, quantidade_itens: 2, dossie_hash: 'qa', expira_em: '2000-01-01T00:00:00Z', createdAt: '2026-10-08T12:00:00Z', itens: [
    { id: 1, status: 'PENDENTE', valor_snapshot: 100, snapshot_json: { codigo: 'TIT-1', solicitacao: { codigo: 'SOL-1993', descricao: 'Solicitação de Compra\nItens: Cimento [manual]' }, descricao: 'Forma 1 - SOL-1993 - SOLICITAÇÃO DE COMPRA: Itens: Tijolo [manual]' } },
    { id: 2, status: 'PENDENTE', valor_snapshot: 50, snapshot_json: { codigo: 'TIT-2', solicitacao: { codigo: 'SOL-1994', descricao: 'Compra Direta\nItens: Areia [manual]' }, descricao: 'Forma 1 - SOL-1994 - COMPRA DIRETA: Itens: Areia [manual]' } }
  ] }];
  const justification = 'Compra necessária para continuidade da obra.\n' + 'Texto detalhado e seguro <script> sem executar HTML. '.repeat(100);
  rows[0].itens[0].titulo = { status: 'ABERTO', valor_baixado: 0, solicitacao: { justificativa: justification } };
  let holdNext = false, releaseHeld, heldStarted; const decisions = [];
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    const json = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    if (url.pathname.endsWith('/autorizacoes-pagamento/painel/obras')) return json({ data: [], resumo: {}, paginacao: { total: 0, mais: false } });
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
  await page.getByRole('button', { name: 'Por lote / histórico', exact: true }).click();
  const checks = page.getByRole('checkbox');
  await checks.nth(1).waitFor();
  assert.equal(await page.getByText(/Expira em/).count(), 0);
  const headers = await page.locator('.pa-table th').allTextContents();
  assert.equal(headers[1], 'Solicitação');
  assert.equal(headers[headers.indexOf('Status') + 1], 'Justificativa');
  assert.equal(headers[headers.indexOf('Status') + 2], 'Motivo');
  assert.equal(await page.locator('.pa-table tbody tr').nth(0).locator('td').nth(1).locator('strong').first().textContent(), 'SOL-1993');
  assert.equal(await page.getByText('Título TIT-1', { exact: true }).count(), 1);
  assert.equal(await page.getByText('Solicitação de Compra', { exact: true }).count(), 1);
  assert.equal(await page.getByText('Compra Direta', { exact: true }).count(), 1);
  assert.equal(await page.getByText(/Cimento|Tijolo|Areia|\[manual\]/).count(), 0, 'Itens das compras nao aparecem no resumo');
  assert.equal(await page.getByRole('button', { name: /^Autorizar/ }).isEnabled(), true, 'Lote com prazo antigo continua aguardando decisao');
  assert.equal(await checks.nth(0).isChecked(), true);
  await checks.nth(1).uncheck();
  const preview=page.getByRole('button',{name:'Ler justificativa de SOL-1993',exact:true});
  const modal=page.getByRole('dialog',{name:'Justificativa da solicitação',exact:true});
  assert.equal(await page.locator('.pa-justification-column').nth(1).textContent(),'-');
  const baseUrl=page.url();
  await preview.click();await modal.waitFor();
  assert.equal(await modal.locator('.pa-justification-text').textContent(),justification,'Texto integral, inclusive quebras e caracteres HTML como texto');
  assert.equal(await modal.locator('script').count(),0);
  await modal.locator('.pa-justification-text').click();assert(await modal.isVisible(),'Clique dentro nao fecha');
  await page.keyboard.press('Escape');await modal.waitFor({state:'hidden'});assert.equal(page.url(),baseUrl);
  assert.equal(await checks.nth(1).isChecked(),false,'Modal nao altera a selecao para decisao');
  for(const width of[390,1440]){
    await page.setViewportSize({width,height:844});
    await preview.click();await modal.waitFor();
    assert(await modal.getByRole('button',{name:'Fechar',exact:true}).isVisible());
    assert(await modal.evaluate(el=>el.getBoundingClientRect().width<=innerWidth));
    // Back real do navegador usa a mesma pilha do gesto/acao voltar do PWA.
    await page.goBack();await modal.waitFor({state:'hidden'});assert.equal(page.url(),baseUrl);
    await preview.click();await modal.waitFor();
    await modal.click({position:{x:2,y:2}});await modal.waitFor({state:'hidden'});assert.equal(page.url(),baseUrl);
    await preview.click();await modal.waitFor();
    await modal.getByRole('button',{name:'Fechar',exact:true}).click();await modal.waitFor({state:'hidden'});
  }
  assert.equal(decisions.length,0,'Ler/fechar nao envia qualquer decisao');
  rows[0].itens[0].status = 'ENFILEIRADO'; rows[0].itens[0].fila_item_id = 11;
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await page.getByText('Fila #11', { exact: true }).waitFor();
  assert.equal(await checks.count(), 1);
  assert.equal(await checks.first().isChecked(), false);
  assert.equal(await page.getByRole('button', { name: /^Autorizar/ }).isDisabled(), true);
  await checks.first().check();
  await page.getByRole('button', { name: /Autorizar.*50,00/ }).waitFor();

  // A consulta atual e serial: liberar o GET antigo antes do refresh seguinte.
  holdNext = true;
  const started = new Promise(resolve => { heldStarted = resolve; });
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await started;
  rows[0].status = 'CONCLUIDO'; rows[0].itens[1].status = 'ENFILEIRADO'; rows[0].itens[1].fila_item_id = 12;
  const antiga = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/financeiro/autorizacoes-pagamento'));
  releaseHeld();
  await antiga;
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await page.getByText('Fila #12', { exact: true }).waitFor();
  assert.equal(await checks.count(), 0);
  assert.equal(await page.locator('.pa-table').getByText('Na fila', { exact: true }).count(), 2);
  assert.equal(await page.getByText('Na fila', { exact: true }).count(), 4, 'Dois titulos, lista e detalhe do lote');
  assert.equal(await page.getByText('CONCLUIDO', { exact: true }).count(), 0);
  assert.equal(await page.locator('.pa-status--concluido').count(), 2, 'Status interno e estilo preservados');
  assert.equal(await page.getByRole('button', { name: /^Autorizar/ }).count(), 0);

  // Lote misto: o rotulo nao transforma um item rejeitado em enfileirado.
  rows[0].itens[1].status = 'REJEITADO'; delete rows[0].itens[1].fila_item_id;
  rows[0].itens[1].motivo_decisao = 'Corrigir documento antes de autorizar o pagamento.';
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await page.getByText('REJEITADO', { exact: true }).waitFor();
  assert.equal(await page.getByText('Na fila', { exact: true }).count(), 3);
  assert.equal(await page.locator('.pa-table').getByText('Na fila', { exact: true }).count(), 1);
  const reasonRow = page.locator('.pa-table tbody tr').nth(1);
  assert.equal(await reasonRow.locator('td').last().textContent(), rows[0].itens[1].motivo_decisao);
  assert.equal(await reasonRow.locator('td').nth(7).getByText(rows[0].itens[1].motivo_decisao).count(), 0);
  assert((await page.locator('.pa-lot-reason').textContent()).includes('SOL-1994 · TIT-2'));
  assert((await page.locator('.pa-lot-reason').textContent()).includes(rows[0].itens[1].motivo_decisao));
  // Texto longo seguro e modal com a mesma navegacao da justificativa.
  const motivoCompleto = 'Conferir favorecido e valor.\n' + '<script>Texto informado, nao HTML</script>. '.repeat(10);
  rows[0].itens[1].motivo_decisao = motivoCompleto;
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  const lerMotivo = page.getByRole('button', { name: 'Ler motivo do ajuste de SOL-1994', exact: true });
  await lerMotivo.waitFor();
  const modalMotivo = page.getByRole('dialog', { name: 'Motivo do ajuste', exact: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const fechar of ['Escape', 'Voltar', 'Fora', 'Fechar']) {
      await lerMotivo.click(); await modalMotivo.waitFor();
      assert.equal(await modalMotivo.locator('.pa-justification-text').textContent(), motivoCompleto);
      assert.equal(await modalMotivo.locator('script').count(), 0);
      assert.equal(await page.getByRole('dialog', { name: 'Justificativa da solicitação', exact: true }).count(), 0);
      if (fechar === 'Fechar') await page.screenshot({ path: path.resolve(root, `../outputs/motivo-ajuste-${width}.png`) });
      if (fechar === 'Escape') await page.keyboard.press('Escape');
      else if (fechar === 'Voltar') await page.goBack();
      else if (fechar === 'Fora') await modalMotivo.click({ position: { x: 2, y: 2 } });
      else await modalMotivo.getByRole('button', { name: 'Fechar', exact: true }).click();
      await modalMotivo.waitFor({ state: 'hidden' });
      assert.equal(page.url(), baseUrl);
    }
  }
  assert.equal(decisions.length, 0, 'Consultar motivo nao envia decisao');
  await page.goto('http://127.0.0.1:5307/qa-autorizacao?motivo=2'); await modalMotivo.waitFor();
  await modalMotivo.getByRole('button', { name: 'Fechar', exact: true }).click(); await modalMotivo.waitFor({ state: 'hidden' });
  assert.equal(new URL(page.url()).search, '');
  const output = path.resolve(root, '../outputs/autorizacao-resumo-20261008');
  await mkdir(output, { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('.pa-table-wrap').evaluate(el => { el.scrollLeft = 0; });
    await page.screenshot({ path: path.join(output, `resumo-${width}.png`), fullPage: true });
    assert.equal(await page.locator('.pa-reason-column').last().isVisible(), true);
    if (width === 390) {
      assert(await page.locator('.pa-table-wrap').evaluate(el => el.scrollWidth > el.clientWidth), 'Tabela permite rolagem horizontal no mobile');
      await page.locator('.pa-table-wrap').evaluate(el => { el.scrollLeft = el.scrollWidth; });
      await page.screenshot({ path: path.join(output, 'resumo-mobile-motivo.png'), fullPage: true });
    }
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.screenshot({ path: path.join(output, `resumo-dark-${width}.png`), fullPage: true });
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  // Titulo avulso sem solicitacao continua identificavel pelo codigo TIT.
  const origem = rows[0].itens[1].snapshot_json;
  rows[0].itens[1].snapshot_json = { codigo: 'TIT-AVULSO', descricao: 'Pagamento avulso' };
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await page.locator('.pa-table').getByText('TIT-AVULSO', { exact: true }).waitFor();
  rows[0].itens[1].snapshot_json = origem;

  // Autorizacao ja gravada: preparador/autorizador recupera envio, sem nova decisao.
  rows[0].status = 'AUTORIZADO'; rows[0].itens[0].status = 'AUTORIZADO'; delete rows[0].itens[0].fila_item_id;
  rows[0].itens[0].lote_id = 1; rows[0].itens[0].titulo.valor_saldo = 100;
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await page.getByRole('button', { name: 'Reenviar autorizados para a fila', exact: true }).waitFor();
  assert.equal(await checks.count(), 0);
  assert.equal(await page.getByText('Na fila', { exact: true }).count(), 0);
  assert.equal(await page.getByText('Autorizado — aguardando envio', { exact: true }).count(), 3);
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
  // Outro lote permanece selecionado apos abrir e voltar; Atualizar preserva
  // contexto e consulta a justificativa sem buscar detalhes da solicitacao.
  rows.push({id:7,codigo:'LOTE-7',status:'AGUARDANDO',itens:[{id:70,status:'PENDENTE',valor_snapshot:50,
    snapshot_json:{codigo:'TIT-70',solicitacao:{codigo:'SOL-70'}},
    titulo:{status:'ABERTO',valor_baixado:0,solicitacao:{justificativa:justification}}}]});
  await page.getByRole('button',{name:'Atualizar',exact:true}).click();
  await page.getByRole('button',{name:/LOTE-7/}).click();
  await page.getByRole('button',{name:'Ler justificativa de SOL-70',exact:true}).click();await modal.waitFor();
  await page.goBack();await modal.waitFor({state:'hidden'});
  assert.equal(await page.locator('.pa-lot.is-active strong').textContent(),'LOTE-7');
  await page.getByRole('checkbox').uncheck();
  await page.getByRole('button',{name:'Atualizar',exact:true}).click();await page.getByRole('button',{name:'Ler justificativa de SOL-70',exact:true}).waitFor();
  assert.equal(await page.locator('.pa-lot.is-active strong').textContent(),'LOTE-7');
  assert.equal(await page.getByRole('checkbox').isChecked(),false,'Atualizar nao resseleciona item dispensado');
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Ler justificativa de SOL-70',exact:true}).click();await modal.waitFor();
  await page.screenshot({path:path.join(output,'justificativa-mobile.png'),fullPage:true});
  await page.evaluate(()=>document.documentElement.classList.add('dark'));
  await page.screenshot({path:path.join(output,'justificativa-mobile-dark.png'),fullPage:true});
  await modal.getByRole('button',{name:'Fechar',exact:true}).click();await modal.waitFor({state:'hidden'});
  // Link direto sem entrada propria: Fechar remove somente a query, nao sai.
  await page.goto('http://127.0.0.1:5307/qa-autorizacao?justificativa=70');await modal.waitFor();
  await modal.getByRole('button',{name:'Fechar',exact:true}).click();await modal.waitFor({state:'hidden'});
  assert.equal(new URL(page.url()).pathname,'/qa-autorizacao');assert.equal(new URL(page.url()).search,'');
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log('OK: justificativa entre STATUS/MOTIVO, leitura integral segura, modal/fora/Escape/voltar/link direto, selecao/lote preservados; Atualizar e concorrencia, convergencia/revogacao. APIs simuladas.');
} finally { await browser?.close(); await server.close(); }
