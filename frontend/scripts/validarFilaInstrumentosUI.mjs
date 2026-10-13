// Tela real e componentes reais; sessao/APIs isoladas, sem escrita externa.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import tailwindConfig from '../tailwind.config.js';
import { validarColunasFila } from './filaColunasQA.mjs';
import { validarArquivosPreviewFila } from './filaArquivosPreviewQA.mjs';
import { validarDadosPagamentoFila } from './filaDadosPagamentoQA.mjs';
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
    if (importer?.endsWith('/PreferenciasContext.jsx') && source === './AuthContext') return stub + 'auth';
    if (importer?.endsWith('/ArquivosSolicitacaoFilaModal.jsx') && source === '../../services/financeiro') return stub + 'api';
    if (!importer?.endsWith('/FinanceiroFilaPagamentos.jsx')) return;
    if (source === '../contexts/AuthContext') return stub + 'auth';
    if (source === '../components/padrao') return stub + 'padrao';
    if (source === '../utils/acessoProduto') return stub + 'permissoes';
    if (source === '../services/financeiro') return stub + 'api';
  },
  load(id) {
    if (id === stub + 'tema') return `export const useTheme=()=>({tema:{}});`;
    if (id === stub + 'auth') return `export const useAuth=()=>({user:{id:Number(new URLSearchParams(location.search).get('usuario')||1)},authReady:true,isAuthenticated:true});`;
    if (id === stub + 'permissoes') return `export const canBaixarFilaPagamentos=()=>!window.__readOnly,hasPermissao=(_,key)=>!(key==='financeiro.titulos.estornar'&&window.__noReverse),canImportarComprovantesFilaPagamentos=()=>false,canReportarFilaPagamentos=()=>true,canResolverFilaPagamentos=()=>!window.__readOnly;`;
    if (id === stub + 'padrao') return `export{default as Pagina}from'/src/components/padrao/Pagina.jsx';export{default as BlocoConteudo}from'/src/components/padrao/BlocoConteudo.jsx';export{default as PageHeader}from'/src/components/padrao/PageHeader.jsx';const avisar={erro:console.error,sucesso:()=>{},alerta:message=>window.__alerts.push(message)};const confirmar=async()=>({ok:true,texto:'Correção QA'});export const Avisos=()=>null;export const useAvisos=()=>({avisos:[],fechar:()=>{},limpar:()=>{},avisar});export const useConfirmacao=()=>({confirmar});`;
    if (id === stub + 'api') return `
      export const getFilaPagamentos=async({status})=>{
        const paid=window.__paid,receipt=window.__receipt,saldo=window.__saldo||200;
        const row={id:1,status:paid?'BAIXADO':'PENDENTE',movimento_financeiro_id:paid?10:null,valor_informado:paid?200:null,valor_previsto:saldo,juros:window.__juros||0,multa:window.__multa||0,conta_bancaria_id:5,data_baixa:paid?'2026-10-08':null,pendente_comprovante:paid&&!receipt,comprovante_hash:receipt||!window.__receiptScenario?'qa':null,comprovante_url:receipt||!window.__receiptScenario?'qa':null,titulo:{id:1,codigo:'TIT-QA',status:paid?'QUITADO':'ABERTO',valor_saldo:paid?0:saldo,forma_pagamento_id:1,solicitacao_id:100,solicitacao:{id:100,codigo:'SOL-QA'}}};
        row.titulo.descricao='SOL-QA - MEDIÇÃO';
        row.titulo.numero_documento=new URLSearchParams(location.search).has('documento')?'DOC-QA':null;
        row.titulo.formaPagamento=${JSON.stringify(forms[0])};
        if(new URLSearchParams(location.search).has('dados')) row.titulo.observacoes=window.__paymentText || ('PIX: 000201ABC/Pix@EXEMPLO.COM +'+'aB:0123456789/'.repeat(500));
        if(new URLSearchParams(location.search).has('massa')) {
          const items=Array.from({length:32},(_,i)=>({...row,id:i+1,juros:10,multa:3,
            status:i===30?'BAIXADO':i===31?'EM_EDICAO':'PENDENTE',
            movimento_financeiro_id:i===30?90:null,
            titulo:{...row.titulo,id:i+1,codigo:'TIT-MASSA-'+(i+1),forma_pagamento_id:3,
              obra:{id:3,codigo:'CC-3',nome:'Centro de custo QA'},valor_saldo:200}}));
          return {data:items,resumo:{PENDENTE:30,BAIXADO:1}};
        }
        if(new URLSearchParams(location.search).has('edicao')){row.status='EM_EDICAO';row.titulo.origem_titulo='RH_DP';row.titulo.status_interno_pagar='EM EDICAO DP';row.motivo='Revisao solicitada pelo DP';}
        const rh=new URLSearchParams(location.search).get('rh');
        if(rh){row.titulo.paymentBeneficiary={nome:'Responsavel RH',cpf_cnpj:'52998224725',metodo_preferencial:rh==='pix'?'PIX_CHAVE':'CONTA_BANCARIA',pix_tipo_chave:rh==='pix'?'EMAIL':'DADOS_BANCARIOS',pix_chave:rh==='pix'?'responsavel@example.test':'104:1234:23456',banco_codigo:'104',agencia:'1234',conta:'23456'};row.titulo.observacoes='Solicitacao RH: RH-24\\nReembolsos de vale:\\nAna QA: R$ 100,00\\nBruno QA: R$ 50,00';}
        return{data:status==='NAO_PAGO'?[new URLSearchParams(location.search).has('naopago')?{...row,status:'NAO_PAGO',movimento_financeiro_id:null}: {id:-7,status:'NAO_PAGO',somente_consulta:true,motivo:'Documento divergente',titulo:{id:7,codigo:'TIT-REJEITADO',valor_saldo:200}}]:status==='PENDENTE_COMPROVANTE'?(paid&&!receipt?[row]:[]):status==='PENDENTE'&&paid?[]:[row],resumo:{PENDENTE:paid?0:1,PENDENTE_COMPROVANTE:paid&&!receipt?1:0,NAO_PAGO:1,BAIXADO:paid?1:0}};
      };
      export const getContasFilaPagamentos=async()=>[{id:5,nome:'Conta QA',ativo:true,empresa_id:1},{id:6,nome:'Outra conta',ativo:true,empresa_id:2}];
      export const getInstrumentosFilaPagamentos=async()=>({formas:${JSON.stringify(forms)},cartoes:[{id:10,nome:'Crédito QA',tipo:'CREDITO',conta_bancaria_id:5},{id:11,nome:'Crédito outra conta',tipo:'CREDITO',conta_bancaria_id:6},{id:20,nome:'Débito QA',tipo:'DEBITO',conta_bancaria_id:5}],cheques:[{id:77,codigo:'CH-QA',numero_cheque:'007',titular_nome:'Cliente QA',valor:new URLSearchParams(location.search).has('parcelas')?100:200,empresa_id:1},{id:88,codigo:'CH-OUTRA',valor:200,empresa_id:2}]});
      export const registrarBaixasFilaPagamentos=async(itens,key,instrumentos_lote)=>{window.__settles.push({itens,key,instrumentos_lote});if(window.__receiptScenario)window.__paid=true;return{baixados:1,divergentes:0,pendentes_comprovante:window.__receiptScenario?1:0}};
      export const anexarComprovanteFilaPagamento=async()=>{window.__uploads++;window.__receipt=true};
      export const getArquivosSolicitacaoFila=async()=>new URLSearchParams(location.search).has('arquivos')
        ? ['boleto.PDF','foto.jpeg','planta.png','animacao.gif','foto.webp','arquivo.docx','arquivo.svg'].map((nome,i)=>({id:'qa-'+i,nome_original:nome,caminho_arquivo:'https://bucket.example.test/qa/'+nome,tipo:'BOLETO',createdAt:'2026-10-08T12:00:00Z'})) : [];
      export const estornarBaixaFilaPagamento=async(id,motivo,key)=>{window.__reverseCalls=(window.__reverseCalls||0)+1;window.__reversed={id,motivo,key};};
      export const resolverFilaPagamento=async(id,action,motivo)=>{window.__returned={id,action,motivo};};
      export const aprovarDivergenciasFilaPagamentos=async()=>{},getComprovanteFilaPagamento=async()=>{},informarNaoPagamentoFila=async()=>{},previewComprovantesFilaPagamentos=async()=>{},vincularComprovantesFilaPagamentos=async()=>{};`;
  },
  configureServer(server) { server.middlewares.use('/qa-fila', async (_, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(await server.transformIndexHtml('/qa-fila', `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root" style="padding:12px;min-width:0"></div><script type="module">import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';import{PreferenciasProvider}from'/src/contexts/PreferenciasContext.jsx';import Page from '/src/pages/FinanceiroFilaPagamentos.jsx';import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/escala.css';import '/src/styles/componentes-padrao.css';import '/src/styles/responsive-system.css';window.__settles=[];window.__alerts=[];window.__uploads=0;window.__receiptScenario=new URLSearchParams(location.search).has('receipt');window.__readOnly=new URLSearchParams(location.search).has('readonly');window.__paid=window.__readOnly;const tela=React.createElement(BrowserRouter,null,React.createElement(Page));createRoot(document.getElementById('root')).render(new URLSearchParams(location.search).has('preferencias')?React.createElement(PreferenciasProvider,null,tela):tela);</script></body></html>`));
  }); }
};
const server = await createServer({ root, cacheDir: path.join(root,'../outputs/fila-qa-cache'), plugins: [plugin],
  css:{postcss:{plugins:[tailwindcss({...tailwindConfig,content:[path.join(root,'src/**/*.{js,jsx,ts,tsx}')]}),autoprefixer()]}},
  server: { host: '127.0.0.1', port: 5308, strictPort: true, proxy: {} } });
await server.listen(); let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {channel:'chrome'}) });
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
  assert.equal(await chequeModal.count(), 0, 'Escolher cheque nao presume origem nem abre dados proprios');
  assert.equal(await page.getByLabel('Origem do cheque de TIT-QA', { exact: true }).inputValue(), '');
  await page.getByLabel('Origem do cheque de TIT-QA', { exact: true }).selectOption('PROPRIO');
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
  // A fixture continua PENDENTE apos a baixa simulada, mas o draft concluido
  // e descartado. Configurar outra operacao, nao reaplicar a selecao anterior.
  await forma.waitFor(); await forma.selectOption('4');
  await page.getByLabel('Origem do cheque de TIT-QA', { exact: true }).selectOption('PROPRIO');
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
  await conta.selectOption('5');
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
  await page.getByRole('button',{name:'Descartar rascunhos conflitantes',exact:true}).click();
  await forma.selectOption('3'); await conta.selectOption('5');
  await juros.fill('10'); await multa.fill('3'); assert.equal(await pago.inputValue(), '213.00');
  for (const input of [juros, multa, pago]) {
    assert(await input.evaluate(node => node.getBoundingClientRect().width <= node.closest('td').getBoundingClientRect().width),
      'Campo monetario deve caber na coluna sem cortar o valor');
  }
  await page.evaluate(() => { window.__saldo=250; });
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await page.getByText(/Saldo.*250/).waitFor();
  assert.equal(await pago.inputValue(), '213.00', 'Mudanca de saldo nao sobregrava trabalho monetario pendente');
  await pago.fill('200');
  await page.evaluate(() => { window.__saldo=275; });
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await page.getByText(/Saldo.*275/).waitFor();
  assert.equal(await pago.inputValue(), '200', 'Atualizar preserva valor pago divergente informado manualmente');
  await page.getByRole('button', { name: 'Registrar baixa', exact: true }).click();
  await page.getByRole('dialog',{name:'Não foi possível registrar a baixa',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.__settles.length),0,'Conflito nao pode baixar');
  await page.getByRole('button',{name:'Voltar e corrigir',exact:true}).click();
  await page.getByRole('button',{name:'Descartar rascunhos conflitantes',exact:true}).click();
  await forma.selectOption('3'); await conta.selectOption('5'); await juros.fill('10'); await multa.fill('3');
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
  for(const rh of ['banco','pix']) {
    await page.goto(`http://127.0.0.1:5308/qa-fila?rh=${rh}`);
    await page.getByText('Responsavel RH',{exact:true}).waitFor();
    if(rh==='banco') {
      await page.getByText('Banco 104 · Ag. 1234 · Conta 23456',{exact:true}).waitFor();
      assert.equal(await page.getByText(/PIX DADOS_BANCARIOS/).count(),0);
    } else await page.getByText('PIX EMAIL: responsavel@example.test',{exact:true}).waitFor();
    await page.getByText('Ver colaboradores do reembolso',{exact:true}).click();
    await page.getByText(/Ana QA: R\$ 100,00/).waitFor();
    assert.ok((await page.locator('details[open]').innerText()).includes('Bruno QA: R$ 50,00'));
  }
  await page.goto('http://127.0.0.1:5308/qa-fila?edicao=1');
  await page.locator('tbody').getByText('Em edição pelo DP',{exact:true}).waitFor();
  assert.ok(await page.getByLabel('Conta pagadora de TIT-QA',{exact:true}).isDisabled());
  assert.equal(await page.getByRole('button',{name:'Registrar baixa',exact:true}).count(),0);
  const bloqueada=page.locator('tbody tr').filter({hasText:'TIT-QA'});
  assert.ok((await bloqueada.getAttribute('class')).includes('sem-warning-bg'));
  assert.equal(await bloqueada.locator('input[type="checkbox"]:enabled').count(),0);
  await page.getByText('Baixa bloqueada até o reenvio pelo DP',{exact:true}).waitFor();
  for(const width of [1366,390]) {
    await page.setViewportSize({width,height:900});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.getByText('Baixa bloqueada até o reenvio pelo DP',{exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(root,`../outputs/fila-edicao-dp-${width}.png`),fullPage:true});
  }
  assert.equal(await page.evaluate(()=>window.__settles.length),0);
  for(const width of [1366,390]) {
    await page.setViewportSize({width,height:900});
    await page.goto('http://127.0.0.1:5308/qa-fila?massa=1&status=TODOS');
    const selectAll=page.getByLabel('Selecionar todos os elegíveis desta lista',{exact:true});
    await selectAll.waitFor();
    await page.getByLabel('Selecionar TIT-MASSA-1',{exact:true}).check();
    assert(await selectAll.evaluate(el=>el.indeterminate));
    await selectAll.check();
    assert.equal(await page.locator('tbody input[type="checkbox"]:checked').count(),30);
    assert(await page.getByLabel('Selecionar TIT-MASSA-31',{exact:true}).isDisabled());
    assert(await page.getByLabel('Selecionar TIT-MASSA-32',{exact:true}).isDisabled());
    await page.getByRole('button',{name:'Baixa em massa (30)',exact:true}).evaluate(button=>{button.click();button.click();});
    const bulkDialog = page.getByRole('dialog', { name: 'Baixa em massa', exact: true });
    await bulkDialog.waitFor();
    assert.equal(await page.evaluate(() => window.__settles.length), 0, 'Abrir modal nao registra baixa');
    await bulkDialog.getByLabel('Conta pagadora', { exact: true }).selectOption('5');
    await bulkDialog.getByLabel('Data do pagamento', { exact: true }).fill('12/10/2026');
    await bulkDialog.getByRole('button', { name: 'Conferir e registrar baixas', exact: true }).evaluate(button => { button.click(); button.click(); });
    await page.waitForFunction(()=>window.__settles.length===1);
    const bulk=await page.evaluate(()=>window.__settles[0]);
    assert(bulk.key); assert.equal(bulk.itens.length,30);
    assert(bulk.itens.every(item=>item.valor_pago===213 && item.juros===10 && item.multa===3));
    assert(bulk.itens.every(item=>item.data_baixa==='2026-10-12' && item.conta_bancaria_id===5 && item.desconto===0));
    assert.equal(await page.locator('th[data-coluna="local"]').count(),1);
    assert((await page.locator('th[data-coluna="local"]').textContent()).includes('Obra / Centro de Custo'));
    assert.equal(await page.getByText('CC-3 · Centro de custo QA',{exact:true}).count(),32);
    const opener=page.getByRole('button',{name:'Abrir arquivos de SOL-QA',exact:true}).nth(20);
    await opener.scrollIntoViewIfNeeded();
    for(const close of ['button','Escape']) {
      await page.evaluate(()=>{document.querySelector('.resizable-table-scroll').scrollLeft=12;});
      const before=await page.evaluate(()=>({y:scrollY,x:document.querySelector('.resizable-table-scroll').scrollLeft}));
      await opener.click();
      const modal=page.getByRole('dialog',{name:'Arquivos da solicitação SOL-QA',exact:true});
      await modal.waitFor();
      const position=await page.evaluate(()=>({y:scrollY,x:document.querySelector('.resizable-table-scroll').scrollLeft}));
      assert(Math.abs(position.y-before.y)<2 && Math.abs(position.x-before.x)<2,'Abrir tambem preserva a posicao');
      assert(position.x>0,'Exercita rolagem horizontal');
      assert(position.y>300,'Fixture exercita rolagem longa');
      // Simula perda de posicao enquanto o modal esta aberto.
      await page.evaluate(()=>{window.scrollTo(0,0);document.querySelector('.resizable-table-scroll').scrollLeft=0;});
      if(close==='Escape') await page.keyboard.press('Escape');
      else await modal.getByRole('button',{name:'Fechar',exact:true}).click();
      await modal.waitFor({state:'detached'});
      await page.waitForFunction(p=>Math.abs(scrollY-p.y)<2 && Math.abs(document.querySelector('.resizable-table-scroll').scrollLeft-p.x)<2,position);
      assert.equal(await page.evaluate(()=>window.__settles.length),1,'Consultar arquivos nao registra nova baixa');
    }
    await page.evaluate(()=>{window.scrollTo(0,0);document.querySelector('.resizable-table-scroll').scrollLeft=0;});
    await page.screenshot({path:path.join(root,`../outputs/fila-massa-${width}.png`)});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  }
  // Instrumentos efetivos editados dentro do modal, sem alterar a fila ao cancelar.
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const url = 'http://127.0.0.1:5308/qa-fila?massa=1&parcelas=1&status=TODOS';
    const abrirMassa = async () => {
      await page.getByLabel('Selecionar TIT-MASSA-1', { exact: true }).check();
      await page.getByLabel('Selecionar TIT-MASSA-2', { exact: true }).check();
      await page.getByRole('button', { name: 'Baixa em massa (2)', exact: true }).click();
    };
    await page.goto(url); await abrirMassa();
    const bulk = page.getByRole('dialog', { name: 'Baixa em massa', exact: true });
    assert.equal(await bulk.getByLabel(/Forma de pagamento de TIT-/).count(), 0, 'Massa nao permite formas individuais');
    assert.equal(await bulk.getByRole('button', { name: 'Aplicar forma', exact: true }).count(), 0);
    await bulk.getByLabel('Forma de pagamento do lote', { exact: true }).selectOption('4');
    const editor = page.getByRole('dialog', { name: 'Cheques do pagamento de lote selecionado', exact: true });
    await editor.waitFor();
    assert.equal(await editor.getByLabel('Origem do cheque 1', { exact: true }).inputValue(), '');
    assert.equal(await editor.getByLabel('Numero do cheque *', { exact: true }).count(), 0);
    await editor.getByRole('button', { name: 'Cancelar', exact: true }).first().click();
    await bulk.getByRole('button', { name: 'Cancelar', exact: true }).first().click();
    assert.equal(await page.getByLabel('Forma de pagamento de TIT-MASSA-1', { exact: true }).inputValue(), '3');
    assert.equal(await page.evaluate(() => window.__settles.length), 0);

    await abrirMassa();
    await bulk.getByLabel('Conta pagadora', { exact: true }).selectOption('6');
    await bulk.getByLabel('Forma de pagamento do lote', { exact: true }).selectOption('1');
    await bulk.getByLabel('Cartão para os selecionados', { exact: true }).selectOption('10');
    assert.equal(await bulk.getByLabel('Conta pagadora', { exact: true }).inputValue(), '5');
    assert(await bulk.getByLabel('Conta pagadora', { exact: true }).isDisabled());
    assert.equal(await bulk.getByLabel('Cartão para os selecionados', { exact: true }).locator('option[value="20"]').count(), 0);
    await bulk.getByRole('button', { name: 'Conferir e registrar baixas', exact: true }).click();
    await page.waitForFunction(() => window.__settles.length === 1);
    let envio = await page.evaluate(() => window.__settles[0]);
    assert(envio.itens.every(item => item.forma_pagamento_id === 1 && item.cartao_id === 10 && item.conta_bancaria_id === 5));

    await page.goto(url); await abrirMassa();
    await bulk.getByLabel('Forma de pagamento do lote', { exact: true }).selectOption('4');
    await editor.waitFor();
    await editor.getByLabel('Conta pagadora dos cheques', { exact: true }).selectOption('5');
    await editor.getByLabel('Quantidade de cheques', { exact: true }).fill('61');
    assert((await editor.getByRole('alert').textContent()).includes('1 a 60'));
    assert.equal(await editor.getByRole('region', { name: /^Dados do cheque / }).count(), 1);
    await editor.getByLabel('Quantidade de cheques', { exact: true }).fill('4');
    await editor.getByRole('region', { name: 'Dados do cheque 4', exact: true }).waitFor();
    await editor.getByLabel('Quantidade de cheques', { exact: true }).fill('2');
    await editor.getByLabel('Origem do cheque 1', { exact: true }).selectOption('PROPRIO');
    await editor.getByLabel('Valor do cheque 1 (R$)', { exact: true }).fill('326');
    await editor.getByLabel('Numero do cheque *', { exact: true }).fill('BULK-101');
    await editor.getByLabel('Emitente / titular *', { exact: true }).fill('Empresa QA');
    await editor.getByLabel('Origem do cheque 2', { exact: true }).selectOption('CARTEIRA');
    const carteira = editor.getByLabel('Cheque da carteira 2', { exact: true });
    assert.equal(await carteira.locator('option[value="88"]').count(), 0);
    await carteira.selectOption('77');
    await editor.getByLabel('Quantidade de cheques', { exact: true }).fill('1');
    await editor.getByLabel('Quantidade de cheques', { exact: true }).fill('12');
    assert.equal(await carteira.inputValue(), '77');
    assert.equal(await editor.getByLabel('Numero do cheque *', { exact: true }).inputValue(), 'BULK-101');
    await editor.getByLabel('Quantidade de cheques', { exact: true }).fill('1');
    await editor.getByLabel('Conta pagadora dos cheques', { exact: true }).selectOption('6');
    await editor.getByLabel('Quantidade de cheques', { exact: true }).fill('2');
    assert.equal(await carteira.inputValue(), '', 'Trocar empresa invalida inclusive cheque ocultado');
    assert.equal(await editor.getByLabel('Numero do cheque *', { exact: true }).inputValue(), 'BULK-101');
    await editor.getByLabel('Conta pagadora dos cheques', { exact: true }).selectOption('5');
    await carteira.selectOption('77');
    await editor.getByLabel('Quantidade de cheques', { exact: true }).fill('2');
    assert(await editor.getByRole('link', { name: 'Abrir carteira para cadastrar', exact: true }).isVisible());
    await editor.getByRole('button', { name: 'Confirmar cheques', exact: true }).click();
    await editor.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.__settles.length), 0);
    await bulk.getByLabel('Data do pagamento', { exact: true }).fill('13/10/2026');
    await page.screenshot({ path: path.join(root, `../outputs/fila-cabecalho-cheques-${width}.png`) });
    await bulk.getByRole('button', { name: 'Conferir e registrar baixas', exact: true }).evaluate(button => { button.click(); button.click(); });
    await page.waitForFunction(() => window.__settles.length === 1);
    envio = await page.evaluate(() => window.__settles[0]);
    assert.equal(envio.instrumentos_lote.componentes[0].cheque_numero, 'BULK-101');
    assert.equal(envio.instrumentos_lote.componentes[1].cheque_terceiro_id, 77);
    assert(envio.itens.every(item => item.forma_pagamento_id === 4 && !item.cartao_id && !item.parcelas_cheque));
  }
  // Conjunto unico compartilhado: nenhuma copia de cheque/cartao por titulo.
  for (const width of [1366, 390]) for (const tipo of ['CHEQUE', 'CARTAO']) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('http://127.0.0.1:5308/qa-fila?massa=1&parcelas=1&status=TODOS');
    await page.getByLabel('Selecionar TIT-MASSA-1', { exact: true }).check();
    await page.getByLabel('Selecionar TIT-MASSA-2', { exact: true }).check();
    await page.getByRole('button', { name: 'Baixa em massa (2)', exact: true }).click();
    const bulk = page.getByRole('dialog', { name: 'Baixa em massa', exact: true });
    await bulk.getByLabel('Conta pagadora', { exact: true }).selectOption('5');
    await bulk.getByLabel('Forma de pagamento do lote', { exact: true }).selectOption(tipo === 'CHEQUE' ? '4' : '1');
    if (tipo === 'CARTAO') await bulk.getByRole('button', { name: 'Mais de um cartão para o lote', exact: true }).click();
    const editor = page.getByRole('dialog', { name: `${tipo === 'CHEQUE' ? 'Cheques' : 'Cartões'} do pagamento de lote selecionado`, exact: true });
    await editor.waitFor();
    assert.equal(await page.evaluate(() => window.__settles.length), 0);
    if (tipo === 'CHEQUE') {
      await editor.getByLabel('Quantidade de cheques', { exact: true }).fill('2');
      await editor.getByLabel('Origem do cheque 1', { exact: true }).selectOption('PROPRIO');
      await editor.getByLabel('Valor do cheque 1 (R$)', { exact: true }).fill('326');
      await editor.getByLabel('Numero do cheque *', { exact: true }).fill('LOTE-1');
      await editor.getByLabel('Emitente / titular *', { exact: true }).fill('Empresa QA');
      await editor.getByLabel('Origem do cheque 2', { exact: true }).selectOption('CARTEIRA');
      await editor.getByLabel('Cheque da carteira 2', { exact: true }).selectOption('77');
    } else {
      await editor.getByLabel('Quantidade de cartões', { exact: true }).fill('2');
      await editor.getByLabel('Cartão 1', { exact: true }).selectOption('10');
      await editor.getByLabel('Valor no cartão 1 (R$)', { exact: true }).fill('126');
      await editor.getByLabel('Cartão 2', { exact: true }).selectOption('11');
      await editor.getByLabel('Valor no cartão 2 (R$)', { exact: true }).fill('300');
      await editor.getByLabel('Quantidade de cartões', { exact: true }).fill('1');
      await editor.getByLabel('Quantidade de cartões', { exact: true }).fill('2');
      assert.equal(await editor.getByLabel('Cartão 2', { exact: true }).inputValue(), '11');
      assert.equal(await editor.getByLabel('Valor no cartão 2 (R$)', { exact: true }).inputValue(), '300');
      assert.equal(await editor.getByLabel('Cartão 1', { exact: true }).locator('option[value="20"]').count(), 0);
    }
    await page.screenshot({ path: path.join(root, `../outputs/fila-lote-${tipo.toLowerCase()}-${width}.png`) });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await editor.getByRole('button', { name: tipo === 'CHEQUE' ? 'Confirmar cheques' : 'Confirmar cartões', exact: true }).click();
    await editor.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.__settles.length), 0, 'Confirmar instrumentos nao dispara baixa');
    await bulk.getByRole('status').getByText(/Conjunto único/).waitFor();
    await bulk.getByRole('button', { name: 'Conferir e registrar baixas', exact: true }).evaluate(button => { button.click(); button.click(); });
    await page.waitForFunction(() => window.__settles.length === 1);
    const envio = await page.evaluate(() => window.__settles[0]);
    assert.equal(envio.instrumentos_lote.tipo, tipo); assert.equal(envio.instrumentos_lote.componentes.length, 2);
    assert.equal(envio.instrumentos_lote.componentes.reduce((sum, item) => sum + item.valor_pago, 0), 426);
    assert(envio.itens.every(item => !item.cartao_id && !item.parcelas_cheque && !item.parcelas_cartao && !item.cheque_numero));
  }
  // Multicartao por titulo continua separado do conjunto global.
  await page.goto('http://127.0.0.1:5308/qa-fila');
  await forma.waitFor();
  await page.getByRole('button', { name: 'Mais de um cartão', exact: true }).click();
  const cards = page.getByRole('dialog', { name: 'Cartões do pagamento de TIT-QA', exact: true });
  await cards.getByLabel('Quantidade de cartões', { exact: true }).fill('2');
  await cards.getByLabel('Cartão 1', { exact: true }).selectOption('10');
  await cards.getByLabel('Valor no cartão 1 (R$)', { exact: true }).fill('100');
  await cards.getByLabel('Cartão 2', { exact: true }).selectOption('11');
  await cards.getByLabel('Valor no cartão 2 (R$)', { exact: true }).fill('100');
  await cards.getByRole('button', { name: 'Confirmar cartões', exact: true }).click();
  await cards.waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => window.__settles.length), 0);
  await page.getByRole('button', { name: 'Registrar baixa', exact: true }).click();
  await page.waitForFunction(() => window.__settles.length === 1);
  const cartoesIndividuais = await page.evaluate(() => window.__settles[0]);
  assert.equal(cartoesIndividuais.itens[0].parcelas_cartao.length, 2); assert.equal(cartoesIndividuais.itens[0].cartao_id, undefined);
  assert.equal(cartoesIndividuais.instrumentos_lote, null);
  await page.goto('http://127.0.0.1:5308/qa-fila?massa=1&readonly=1&status=TODOS');
  await page.getByLabel('Selecionar TIT-MASSA-1',{exact:true}).waitFor();
  assert(await page.getByLabel('Selecionar TIT-MASSA-1',{exact:true}).isDisabled());
  assert.equal(await page.getByRole('button',{name:/Baixa em massa/}).count(),0,'Sem permissao nao ha baixa em massa');
  await validarColunasFila(browser);
  await validarArquivosPreviewFila(browser);
  await validarDadosPagamentoFila(browser);
  // Parcelas proprias + carteira, desconto e estorno na pagina real.
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('http://127.0.0.1:5308/qa-fila?parcelas=1');
    await forma.waitFor(); await forma.selectOption('4');
    assert.equal(await chequeModal.count(), 0);
    await conta.selectOption('5');
    await page.getByRole('button', { name: 'Mais de um cheque / parcelar', exact: true }).click();
    const parcelas = page.getByRole('dialog', { name: 'Cheques do pagamento de TIT-QA', exact: true });
    await parcelas.waitFor();
    await parcelas.getByLabel('Origem do cheque 1', { exact: true }).selectOption('PROPRIO');
    await parcelas.getByLabel('Valor do cheque 1 (R$)', { exact: true }).fill('100');
    await parcelas.getByLabel('Numero do cheque *', { exact: true }).fill('101');
    await parcelas.getByLabel('Emitente / titular *', { exact: true }).fill('Empresa QA');
    await parcelas.getByLabel('Quantidade de cheques', { exact: true }).fill('4');
    await parcelas.getByRole('region', { name: 'Dados do cheque 4', exact: true }).waitFor();
    await parcelas.getByRole('button', { name: 'Remover cheque 4', exact: true }).click();
    assert.equal(await parcelas.getByLabel('Quantidade de cheques', { exact: true }).inputValue(), '3');
    await parcelas.getByLabel('Quantidade de cheques', { exact: true }).fill('2');
    await parcelas.getByLabel('Origem do cheque 2', { exact: true }).selectOption('CARTEIRA');
    await parcelas.getByLabel('Cheque da carteira 2', { exact: true }).selectOption('77');
    assert.equal(await parcelas.getByLabel('Cheque da carteira 2', { exact: true }).locator('option[value="88"]').count(), 0);
    assert.equal(await parcelas.getByLabel('Valor do cheque 2 (R$)', { exact: true }).inputValue(), '100');
    assert.equal(await parcelas.getByRole('link', { name: 'Abrir carteira para cadastrar', exact: true }).getAttribute('href'), '/financeiro/cheques-terceiros');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(root, `../outputs/fila-cheques-parcelas-${width}.png`), fullPage: true });
    await parcelas.getByRole('button', { name: 'Confirmar cheques', exact: true }).click();
    await parcelas.waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Registrar baixa', exact: true }).click();
    await page.waitForFunction(() => window.__settles.length === 1);
    const multi = await page.evaluate(() => window.__settles[0].itens[0]);
    assert.equal(multi.parcelas_cheque.length, 2); assert.equal(multi.parcelas_cheque[0].cheque_numero, '101');
    assert.equal(multi.parcelas_cheque[1].cheque_terceiro_id, 77); assert.equal(multi.parcelas_cheque[1].usar_cheque_terceiro, true);
    assert.equal(multi.cheque_numero, undefined);
    await forma.selectOption('3'); await conta.selectOption('5');
    await page.getByLabel('Desconto de TIT-QA', { exact: true }).fill('20');
    assert.equal(await page.getByLabel('Valor pago de TIT-QA', { exact: true }).inputValue(), '180.00');
    await page.getByRole('button', { name: 'Registrar baixa', exact: true }).click();
    await page.waitForFunction(() => window.__settles.length === 2);
    const discount = await page.evaluate(() => window.__settles[1].itens[0]);
    assert.equal(discount.desconto, 20); assert.equal(discount.valor_pago, 180);
    await page.evaluate(() => { window.__paid = true; });
    await page.getByRole('button', { name: /^Baixados/ }).click();
    const reverse = page.getByRole('button', { name: 'Estornar baixa', exact: true }); await reverse.waitFor();
    await reverse.evaluate(button => { button.click(); button.click(); });
    await page.waitForFunction(() => window.__reversed);
    const reversed = await page.evaluate(() => window.__reversed);
    assert.equal(reversed.id, 1); assert.equal(reversed.motivo, 'Correção QA'); assert(reversed.key);
    assert.equal(await page.evaluate(() => window.__reverseCalls), 1, 'Duplo clique nao duplica estorno');
  }
  await page.goto('http://127.0.0.1:5308/qa-fila?sem-estorno=1');
  await forma.waitFor(); await page.evaluate(() => { window.__paid = true; window.__noReverse = true; });
  await page.getByRole('button', { name: /^Baixados/ }).click();
  await page.getByText('TIT-QA', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Estornar baixa', exact: true }).count(), 0, 'Resolver fila nao concede estorno');
  await page.goto('http://127.0.0.1:5308/qa-fila?naopago=1&status=NAO_PAGO');
  await page.getByRole('button', { name: 'Devolver para fila', exact: true }).click();
  await page.waitForFunction(() => window.__returned);
  assert.deepEqual(await page.evaluate(() => window.__returned), { id: 1, action: 'REABRIR', motivo: '' });
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log('OK: fila real desktop/mobile, cabecalho unico da massa conta/data/forma/instrumentos, quantidade/proprio/carteira, cancelamento/mutex, desconto, cheques, estorno, devolver nao pago, selecao/colunas e rolagem. APIs isoladas.');
} finally { await browser?.close(); await server.close(); }
