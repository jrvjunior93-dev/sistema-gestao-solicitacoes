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
    if (importer?.endsWith('/ArquivosSolicitacaoFilaModal.jsx') && source === '../../services/financeiro') return stub + 'api';
    if (!importer?.endsWith('/FinanceiroFilaPagamentos.jsx')) return;
    if (source === '../contexts/AuthContext') return stub + 'auth';
    if (source === '../components/padrao') return stub + 'padrao';
    if (source === '../utils/acessoProduto') return stub + 'permissoes';
    if (source === '../services/financeiro') return stub + 'api';
  },
  load(id) {
    if (id === stub + 'tema') return `export const useTheme=()=>({tema:{}});`;
    if (id === stub + 'auth') return `export const useAuth=()=>({user:{id:1}});`;
    if (id === stub + 'permissoes') return `export const canBaixarFilaPagamentos=()=>!window.__readOnly,hasPermissao=()=>true,canImportarComprovantesFilaPagamentos=()=>false,canReportarFilaPagamentos=()=>true,canResolverFilaPagamentos=()=>true;`;
    if (id === stub + 'padrao') return `export{default as Pagina}from'/src/components/padrao/Pagina.jsx';export{default as BlocoConteudo}from'/src/components/padrao/BlocoConteudo.jsx';export{default as PageHeader}from'/src/components/padrao/PageHeader.jsx';const avisar={erro:console.error,sucesso:()=>{},alerta:message=>window.__alerts.push(message)};const confirmar=async()=>({ok:true});export const Avisos=()=>null;export const useAvisos=()=>({avisos:[],fechar:()=>{},limpar:()=>{},avisar});export const useConfirmacao=()=>({confirmar});`;
    if (id === stub + 'api') return `
      export const getFilaPagamentos=async({status})=>{
        const paid=window.__paid,receipt=window.__receipt,saldo=window.__saldo||200;
        const row={id:1,status:paid?'BAIXADO':'PENDENTE',movimento_financeiro_id:paid?10:null,valor_informado:paid?200:null,valor_previsto:saldo,juros:window.__juros||0,multa:window.__multa||0,conta_bancaria_id:5,data_baixa:paid?'2026-10-08':null,pendente_comprovante:paid&&!receipt,comprovante_hash:receipt||!window.__receiptScenario?'qa':null,comprovante_url:receipt||!window.__receiptScenario?'qa':null,titulo:{id:1,codigo:'TIT-QA',status:paid?'QUITADO':'ABERTO',valor_saldo:paid?0:saldo,forma_pagamento_id:1,solicitacao_id:100,solicitacao:{id:100,codigo:'SOL-QA'}}};
        row.titulo.descricao='SOL-QA - MEDIÇÃO';
        row.titulo.numero_documento=new URLSearchParams(location.search).has('documento')?'DOC-QA':null;
        row.titulo.formaPagamento=${JSON.stringify(forms[0])};
        return{data:status==='NAO_PAGO'?[{id:-7,status:'NAO_PAGO',somente_consulta:true,motivo:'Documento divergente',titulo:{id:7,codigo:'TIT-REJEITADO',valor_saldo:200}}]:status==='PENDENTE_COMPROVANTE'?(paid&&!receipt?[row]:[]):status==='PENDENTE'&&paid?[]:[row],resumo:{PENDENTE:paid?0:1,PENDENTE_COMPROVANTE:paid&&!receipt?1:0,NAO_PAGO:1,BAIXADO:paid?1:0}};
      };
      export const getContasFilaPagamentos=async()=>[{id:5,nome:'Conta QA',ativo:true,empresa_id:1},{id:6,nome:'Outra conta',ativo:true,empresa_id:2}];
      export const getInstrumentosFilaPagamentos=async()=>({formas:${JSON.stringify(forms)},cartoes:[{id:10,nome:'Crédito QA',tipo:'CREDITO',conta_bancaria_id:5},{id:20,nome:'Débito QA',tipo:'DEBITO',conta_bancaria_id:5}],cheques:[{id:77,codigo:'CH-QA',numero_cheque:'007',titular_nome:'Cliente QA',valor:200,empresa_id:1},{id:88,codigo:'CH-OUTRA',valor:200,empresa_id:2}]});
      export const registrarBaixasFilaPagamentos=async(itens,key)=>{window.__settles.push({itens,key});if(window.__receiptScenario)window.__paid=true;return{baixados:1,divergentes:0,pendentes_comprovante:window.__receiptScenario?1:0}};
      export const anexarComprovanteFilaPagamento=async()=>{window.__uploads++;window.__receipt=true};
      export const getArquivosSolicitacaoFila=async()=>[];
      export const aprovarDivergenciasFilaPagamentos=async()=>{},getComprovanteFilaPagamento=async()=>{},informarNaoPagamentoFila=async()=>{},previewComprovantesFilaPagamentos=async()=>{},resolverFilaPagamento=async()=>{},vincularComprovantesFilaPagamentos=async()=>{};`;
  },
  configureServer(server) { server.middlewares.use('/qa-fila', async (_, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(await server.transformIndexHtml('/qa-fila', `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root" style="padding:12px;min-width:0"></div><script type="module">import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';import Page from '/src/pages/FinanceiroFilaPagamentos.jsx';import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/escala.css';import '/src/styles/componentes-padrao.css';import '/src/styles/responsive-system.css';window.__settles=[];window.__alerts=[];window.__uploads=0;window.__receiptScenario=new URLSearchParams(location.search).has('receipt');window.__readOnly=new URLSearchParams(location.search).has('readonly');window.__paid=window.__readOnly;createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,React.createElement(Page)));</script></body></html>`));
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
  const requestLink=page.getByRole('link',{name:'Abrir solicitação SOL-QA',exact:true});
  assert.equal(await requestLink.getAttribute('href'), '/solicitacoes/100');
  assert.equal(await requestLink.textContent(), ''); assert.equal(await requestLink.locator('svg').count(),1);
  const filesButton=page.getByRole('button',{name:'Abrir arquivos de SOL-QA',exact:true});
  assert.equal(await filesButton.textContent(), ''); await filesButton.click();
  await page.getByRole('dialog',{name:'Arquivos da solicitação SOL-QA',exact:true}).waitFor();
  await page.getByRole('button',{name:'Fechar',exact:true}).click();
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
  assert.equal(await conta.inputValue(),'','Trocar forma deve limpar conta mesmo com conta antiga na linha');
  await conta.selectOption('5');
  await page.getByRole('button', { name: 'Registrar baixa', exact: true }).click();
  await page.waitForFunction(() => window.__settles.length === 2);
  payload = await page.evaluate(() => window.__settles[1].itens[0]);
  assert.equal(payload.forma_pagamento_id, 3); assert.equal(payload.cartao_id, undefined);
  await forma.waitFor(); await forma.selectOption('4');
  const chequeModal=page.getByRole('dialog',{name:'Dados do cheque próprio de TIT-QA',exact:true});
  await chequeModal.waitFor();
  await page.getByLabel('Numero do cheque *',{exact:true}).fill('NAO-SALVAR');
  await page.keyboard.press('Escape');
  await chequeModal.waitFor({state:'hidden'});
  assert.equal(await conta.inputValue(),''); await conta.selectOption('5');
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
  await chequeModal.waitFor();
  assert.equal(await page.getByLabel('Numero do cheque *',{exact:true}).inputValue(), '');
  await page.getByLabel('Numero do cheque *', { exact: true }).fill('123');
  await page.getByLabel('Emitente / titular *', { exact: true }).fill('Empresa QA');
  await page.getByRole('button',{name:'Confirmar dados do cheque',exact:true}).click();
  await chequeModal.waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Dados do cheque próprio de TIT-QA',exact:true}).click();
  await page.getByLabel('Numero do cheque *',{exact:true}).fill('999');
  await chequeModal.getByRole('button',{name:'Cancelar',exact:true}).first().click();
  await page.getByRole('button',{name:'Dados do cheque próprio de TIT-QA',exact:true}).click();
  assert.equal(await page.getByLabel('Numero do cheque *',{exact:true}).inputValue(),'123','Cancelar nao pode alterar dados confirmados');
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(root,'../outputs/fila-cheque-modal-mobile.png'),fullPage:true});
  assert(await page.getByRole('button',{name:'Confirmar dados do cheque',exact:true}).isVisible());
  await page.getByRole('button',{name:'Confirmar dados do cheque',exact:true}).click();
  await page.setViewportSize({width:1366,height:900});
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
  await page.goto('http://127.0.0.1:5308/qa-fila?receipt=1');
  await forma.waitFor(); await forma.selectOption('3');
  await conta.selectOption('5');
  await page.getByRole('button', { name: 'Registrar baixa', exact: true }).click();
  await page.waitForFunction(() => window.__paid && window.__alerts.length === 1);
  await page.getByRole('button', { name: /Pendentes de comprovante/ }).click();
  await page.getByText('Pagamento registrado · pendente de comprovante', { exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('status'), 'PENDENTE_COMPROVANTE');
  assert.equal(await page.getByLabel('Selecionar TIT-QA', { exact: true }).isDisabled(), true);
  assert.equal(await conta.isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: /Registrar baixa|Registrar selecionados/ }).count(), 0);
  await page.waitForFunction(() => !document.querySelector('button[aria-pressed="true"]')?.disabled);
  await page.evaluate(() => { window.scrollTo(0, 0); document.querySelectorAll('.resizable-table-scroll').forEach(el => el.scrollLeft=0); });
  await page.setViewportSize({width:1366,height:900});
  await page.screenshot({path:path.join(root,'../outputs/fila-comprovante-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(root,'../outputs/fila-comprovante-mobile.png'),fullPage:true});
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Rolagem horizontal deve ficar na tabela, nao na pagina');
  await page.evaluate(() => { document.documentElement.classList.add('dark'); document.body.style.background='var(--c-bg)'; window.scrollTo(0,0); });
  await page.screenshot({path:path.join(root,'../outputs/fila-comprovante-mobile-dark.png'),fullPage:true});
  await page.getByLabel('Comprovantes de pagamento de TIT-QA', { exact: true }).setInputFiles({name:'pagamento.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-QA')});
  await page.waitForFunction(() => window.__uploads === 1);
  await page.getByText('Nenhum título encontrado neste recorte.', { exact:true }).waitFor();
  assert.equal(await page.evaluate(() => window.__settles.length), 1);
  await page.goto('http://127.0.0.1:5308/qa-fila?receipt=1&readonly=1&status=PENDENTE_COMPROVANTE');
  await page.getByText('Pagamento registrado · pendente de comprovante', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Comprovantes de pagamento de TIT-QA', { exact: true }).count(), 0);
  assert.equal(await page.getByLabel('Juros de TIT-QA', { exact: true }).isDisabled(), true);
  assert.equal(await page.getByLabel('Multa de TIT-QA', { exact: true }).isDisabled(), true);
  await page.setViewportSize({width:1366,height:900});
  await page.goto('http://127.0.0.1:5308/qa-fila');
  await forma.waitFor(); await forma.selectOption('3'); await conta.selectOption('5');
  const juros = page.getByLabel('Juros de TIT-QA', { exact: true }), multa = page.getByLabel('Multa de TIT-QA', { exact: true });
  const pago = page.getByLabel('Valor pago de TIT-QA', { exact: true });
  for (const [key, label] of [['juros', 'Juros (R$)'], ['multa', 'Multa (R$)']]) {
    const column = page.locator(`th[data-coluna="${key}"]`);
    assert.equal(await column.count(), 1);
    assert.equal(await column.isVisible(), true);
    assert((await column.textContent()).includes(label));
  }
  await page.evaluate(() => { window.__juros=5; window.__multa=2; });
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-fila-campo="valor_pago"]').value === '207.00');
  assert.equal(Number(await juros.inputValue()), 5); assert.equal(Number(await multa.inputValue()), 2);
  await juros.fill('10'); await multa.fill('3'); assert.equal(await pago.inputValue(), '213.00');
  for (const input of [juros, multa, pago]) {
    assert(await input.evaluate(node => node.getBoundingClientRect().width <= node.closest('td').getBoundingClientRect().width),
      'Campo monetario deve caber na coluna sem cortar o valor');
  }
  await page.evaluate(() => { window.__saldo=250; });
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-fila-campo="valor_pago"]').value === '263.00');
  await pago.fill('200');
  await page.evaluate(() => { window.__saldo=275; });
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await page.getByText(/Saldo.*275/).waitFor();
  assert.equal(await pago.inputValue(), '200', 'Atualizar preserva valor pago divergente informado manualmente');
  await pago.fill('288');
  await page.getByRole('button', { name: 'Registrar baixa', exact: true }).click();
  await page.waitForFunction(() => window.__settles.length === 1);
  payload = await page.evaluate(() => window.__settles[0].itens[0]);
  assert.equal(payload.juros, 10); assert.equal(payload.multa, 3); assert.equal(payload.valor_pago, 288);
  await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({path:path.join(root,'../outputs/fila-encargos-mobile.png'),fullPage:true});
  await page.setViewportSize({width:1366,height:900});
  await page.screenshot({path:path.join(root,'../outputs/fila-encargos-desktop.png'),fullPage:true});
  // Celula do titulo compacta, com ou sem numero de documento: forma fica
  // apenas na coluna propria. Navegacao, arquivos e upload continuam presentes.
  for (const width of [1366, 390]) {
    await page.setViewportSize({width,height:900});
    for (const documento of [false, true]) {
      await page.goto(`http://127.0.0.1:5308/qa-fila${documento?'?documento=1':''}`);
      await forma.waitFor();
      const titleCell=page.getByRole('link',{name:'TIT-QA',exact:true}).locator('..');
      const text=await titleCell.textContent();
      assert(text.includes('SOL-QA - MEDIÇÃO'));
      assert(!text.includes('Sem documento')&&!text.includes('DOC-QA'));
      assert(!text.includes('Cartão de crédito')&&!text.includes('Forma não informada'));
      assert.equal(await requestLink.count(),1);
      assert.equal(await filesButton.count(),1);
      assert.equal(await page.getByLabel('Comprovantes de pagamento de TIT-QA',{exact:true}).count(),1);
      assert.equal(await forma.inputValue(),'1');
    }
  }
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log('OK: fila real, colunas separadas de juros/multa, total e atualizacao de saldo/encargos preservando valor manual, instrumentos, modal cheque, conta limpa, icones, baixa sem PDF e anexo posterior sem segunda baixa. APIs isoladas.');
} finally { await browser?.close(); await server.close(); }
