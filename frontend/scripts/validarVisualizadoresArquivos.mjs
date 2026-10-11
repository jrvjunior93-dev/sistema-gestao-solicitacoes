// Componentes e handlers de producao; APIs inteiramente isoladas, sem banco.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import { parse } from '@babel/parser';
import { chromium } from 'playwright';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import tailwindConfig from '../tailwind.config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const etapa = process.argv[2] || 'compras';
// Extrair o handler evita reproduzir sua logica na fixture. Os testes completos
// da fila continuam em validarFilaInstrumentosUI; aqui exercitamos a camada
// compartilhada e a integracao de cada handler de leitura ao endpoint original.
const casos = {
  financeiro: [
    ['pages/FinanceiroFilaPagamentos.jsx', 'abrirComprovante', [4, 8, 'Comprovante.pdf'], 'getComprovanteFilaPagamento', [4, 8]],
    ['pages/SolicitacaoDetalhe/FinanceiroCard.jsx', 'abrirComprovante', [4, 8, null, 'Comprovante.pdf'], 'getComprovanteFilaPagamento', [4, 8]],
    ['pages/SolicitacaoDetalhe/FinanceiroCard.jsx', 'abrirComprovante', [null, null, '/historico.pdf', 'Histórico.pdf'], 'getLinkSeguroAnexoSolicitacao', ['/historico.pdf']],
    ['components/recarga-cartao/PrestacaoRecargaCartao.jsx', 'abrirDocumento', [{ id: 8, caminho_arquivo: '/recarga.pdf', nome_original: 'Recarga.pdf' }], 'getLinkSeguroAnexoSolicitacao', ['/recarga.pdf']],
    ['pages/FinanceiroAutorizacoesPagamento.jsx', 'openDocument', [{ id: 8, nome: 'Autorização.pdf', mime_type: 'application/pdf' }], 'obterDocumentoAutorizacao', [8]]
    ,['pages/FinanceiroPagamentos.jsx', 'handleGerarComprovanteItem', [{ id: 8 }], 'gerarComprovantePaymentBatchItem', [17, 8]]
  ],
  compras: [
    ['modules/solicitacao-compra/pages/SolicitacoesCompra.jsx', 'handleBaixarPdf', [17], 'baixarPdfSolicitacaoCompra', [17]],
    ['modules/solicitacao-compra/pages/SolicitacaoCompraDetalheView.jsx', 'handleAbrirPdf', [], 'baixarPdfSolicitacaoCompra', [17]],
    ['modules/solicitacao-compra/components/PedidoCompraFinanceiro.jsx', 'abrirDocumento', [{ arquivo_url: '/nota.pdf', arquivo_nome: 'Nota.pdf' }], 'obterUrlAssinadaCompra', ['/nota.pdf']],
    ['pages/GestaoContratos.jsx', 'visualizarAnexoContrato', ['/contrato.pdf', 'Contrato.pdf'], 'obterUrlAssinada', ['/contrato.pdf']],
    ['pages/SolicitacaoDetalhe/AditivosDoContrato.jsx', 'abrirNegociacao', [{ negociacao_detalhada: { id: 8, nome_original: 'Negociação.pdf', caminho_arquivo: '/negociacao.pdf' } }], 'getLinkSeguroAnexoSolicitacao', ['/negociacao.pdf']]
  ],
  dp: [
    ['pages/RhDpDocumentos.jsx', 'abrirDocumento', [{ id: 8, nome_original: 'Documento.pdf' }], 'getRhDocumentoLink', [8]],
    ['pages/RhDpColaboradores.jsx', 'abrirDocumento', [{ id: 8, nome_original: 'Documento.pdf' }], 'getRhDocumentoLink', [8]],
    ['pages/RhDpColaboradores.jsx', 'abrirArquivoDossie', [{ id: 8, nome: 'Dossiê.pdf' }], 'getRhDossieArquivoLink', [17, { id: 8, nome: 'Dossiê.pdf' }]],
    ['pages/RhDpPessoalSolicitacoes.jsx', 'abrirAnexo', [{ id: 8, nome_original: 'Admissão.pdf' }], 'getRhSolicitacaoAnexoLink', [17, 8]],
    ['pages/RhDpFechamentos.jsx', 'abrirComprovante', [{ id: 8, fila_id: 4, nome: 'Comprovante.pdf' }], 'getRhFechamentoComprovanteLink', [17, 4, 8]]
  ],
  outros: [
    ['pages/ArquivosModelos.jsx', 'abrirArquivo', [{ id: 8, nome_original: 'Modelo.pdf' }], 'getLinkArquivoModelo', [8]],
    ['pages/Treinamento.jsx', 'abrirArquivo', [{ id: 8, documento_nome_original: 'Treinamento.pdf' }, 'DOCUMENTO'], 'getTreinamentoArquivoUrl', [8, 'DOCUMENTO']],
    ['pages/ObraGestao.jsx', 'abrirArquivo', [{ caminho_arquivo: '/obra.pdf', nome_original: 'Obra.pdf' }], 'obterUrlArquivoObra', ['/obra.pdf']],
    ['pages/ComercialContratos.jsx', 'abrirDocumentoContrato', [8], 'getLinkDocumentoContratoComercial', [8, 'pdf']],
    ['pages/ComunicacaoInterna.jsx', 'abrirAnexoConversa', [{ caminho: '/conversa.pdf', nome: 'Conversa.pdf' }], 'obterUrlAssinadaAnexo', ['/conversa.pdf']],
    ['modules/provisionamento-financeiro/pages/ProvisionamentoFinanceiroDetalhe.jsx', 'abrirAnexo', [{ id: 8, nome_original: 'Provisão.pdf' }], 'obterLinkAnexoProvisaoFinanceira', [8]],
    ['modules/sst/pages/SstCrudPage.jsx', 'openDocument', [{ id: 8, nome_original: 'SST.pdf' }], 'getDocumentoSstUrl', [8]],
    ['modules/fiscal/pages/FiscalDocuments.jsx', 'openFile', [8, 'pdf'], 'getFiscalDocumentFileUrl', [8, 'pdf']],
    ['modules/fiscal/pages/FiscalDocumentDetail.jsx', 'openFile', ['pdf'], 'getFiscalDocumentFileUrl', [17, 'pdf']],
    ['modules/fiscal/pages/FiscalDocuments.jsx', 'generateDanfe', [8], 'generateFiscalDocumentDanfe', [8]],
    ['modules/fiscal/pages/FiscalDocumentDetail.jsx', 'generateDanfe', [], 'generateFiscalDocumentDanfe', [17]]
  ]
};
const selecionados = etapa === 'todos' ? Object.values(casos).flat() : casos[etapa];
assert(selecionados, 'Etapa valida: financeiro/compras/dp/outros/todos');
function handler(file, nome) {
  const texto = readFileSync(path.join(root, 'src', file), 'utf8');
  const ast = parse(texto, { sourceType: 'module', plugins: ['jsx'] });
  let encontrado;
  const andar = n => {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'FunctionDeclaration' && n.id?.name === nome) encontrado = n;
    if (n.type === 'VariableDeclarator' && n.id?.name === nome) encontrado = n.init?.type === 'CallExpression' ? n.init.arguments[0] : n.init;
    for (const v of Object.values(n)) { if (Array.isArray(v)) v.forEach(andar); else if (v && typeof v === 'object') andar(v); }
  };
  andar(ast);
  assert(encontrado?.body, 'Handler existente: ' + file + ':' + nome);
  const params = encontrado.params.map(p => texto.slice(p.start, p.end)).join(',');
  return `async function executar(${params}) ${texto.slice(encontrado.body.start, encontrado.body.end)}`;
}
function expressao(file, marcador) {
  const texto = readFileSync(path.join(root, 'src', file), 'utf8');
  const ast = parse(texto, { sourceType: 'module', plugins: ['jsx'] });
  let resultado;
  const andar = n => { if (!n || typeof n !== 'object') return;
    if (n.type === 'JSXExpressionContainer' && texto.slice(n.start, n.end).startsWith(marcador)) resultado = texto.slice(n.start, n.end);
    for (const v of Object.values(n)) { if (Array.isArray(v)) v.forEach(andar); else if (v && typeof v === 'object') andar(v); }
  }; andar(ast); assert(resultado); return resultado;
}
const tituloFile = 'pages/FinanceiroTitulos.jsx', obrasFile = 'pages/FinanceiroObras.jsx';
const fixture = `import React,{useState,useRef,useEffect} from 'react';
import useVisualizadorArquivo from '/src/hooks/useVisualizadorArquivo.jsx';
import CompraPreviewModal from '/src/modules/solicitacao-compra/components/CompraPreviewModal.jsx';
import OverlayModal from '/src/components/ui/OverlayModal.jsx';
import VisualizadorArquivoModal from '/src/components/ui/VisualizadorArquivoModal.jsx';
export default function Fixture(){
 const {abrirPreview,modalPreview}=useVisualizadorArquivo();
 const [compra,setCompra]=useState(null),[lista,setLista]=useState(false),[erro,setErro]=useState('');
 const servico=async(nome,...args)=>{window.__calls.push({nome,args});if(window.__espera)await new Promise(r=>window.__liberar=r);if(window.__negar)throw new Error('Acesso negado QA');return nome==='gerarComprovantePaymentBatchItem'?{signed_url:'/arquivo.pdf'}:nome==='generateFiscalDocumentDanfe'?{url:'/arquivo.pdf',document:{id:17}}:nome.startsWith('gerarRelatorio')?{blob:new Blob(['%PDF-1.4 QA'],{type:'application/pdf'}),filename:'relatorio-QA.pdf'}:nome==='baixarPdfSolicitacaoCompra'?new Blob(['%PDF-1.4 QA'],{type:'application/pdf'}):nome.startsWith('getFiscal')||nome.startsWith('getDocumentoSst')||nome.startsWith('obterLink')||nome.startsWith('getLinkDocumento')||nome.startsWith('getTreinamento')?{url:'/arquivo.pdf'}:'/arquivo.pdf';};
 const avisar={erro:setErro,alerta:setErro,sucesso:()=>{}},id=17,form={id:17},aberta={id:17},detalhe={id:17};
 const baixando=false,abrindoAnexoId=null,abrindoDocumentoId=null,openingFile='',generatingDanfe='',loading=false;
 const setBaixando=()=>{},setAbrindoAnexoId=()=>{},setAbrindoDocumentoId=()=>{},setOpeningFile=()=>{},limpar=()=>{},limparAvisos=()=>{};
 const selectedBatch={id:17},setReceiptLoading=()=>{},setGeneratingDanfe=()=>{},setDocumento=()=>{},load=async()=>{},refreshAfterAction=async()=>{},getFiscalDocument=async()=>({id:17});
 ${[...new Set(selecionados.flatMap(c => c[1] === 'abrirArquivo' && c[0].includes('Treinamento') ? [c[3], 'marcarTreinamentoLeitura'] : [c[3]]))].map(n => `const ${n}=(...args)=>servico('${n}',...args);`).join('\n')}
 const handlers=[${selecionados.map(c => `{rodar:(${handler(c[0], c[1])}),args:${JSON.stringify(c[2])}}`).join(',')}];
 const [relatorioModalOpen,setRelatorioModalOpen]=useState(false),[relatorioLoading,setRelatorioLoading]=useState(false),[relatorioError,setRelatorioError]=useState(''),[relatorioPdfUrl,setRelatorioPdfUrl]=useState(''),[relatorioFilename,setRelatorioFilename]=useState('relatorio.pdf'),[relatorioSelecaoCount,setRelatorioSelecaoCount]=useState(0);
 const [pdfModalOpen,setPdfModalOpen]=useState(false),[pdfLoading,setPdfLoading]=useState(false),[pdfError,setPdfError]=useState(''),[pdfUrl,setPdfUrl]=useState(''),[pdfFilename,setPdfFilename]=useState('relatorio.pdf');
 const relatorioRequestIdRef=useRef(0),pdfRequestIdRef=useRef(0),pageTitle='Contas a pagar',tipoReferencia='PAGAR',appliedFilters={obra_id:'3',situacao:'ABERTO'},selectedTitulos=[{id:8}],compactFilters=v=>v,compact=v=>v;
 const gerarRelatorioTitulosFinanceirosPdf=(...args)=>servico('gerarRelatorioTitulosFinanceirosPdf',...args),gerarRelatorioFinanceiroObrasPdf=(...args)=>servico('gerarRelatorioFinanceiroObrasPdf',...args);
 ${handler(tituloFile,'abrirRelatorio').replace('function executar(', 'function abrirRelatorio(')}
 ${handler(tituloFile,'fecharRelatorio').replace('function executar(', 'function fecharRelatorio(')}
 ${handler(obrasFile,'abrirPdf').replace('function executar(', 'function abrirPdf(')}
 ${handler(obrasFile,'fecharPdf').replace('function executar(', 'function fecharPdf(')}
 useEffect(()=>()=>{if(relatorioPdfUrl)URL.revokeObjectURL(relatorioPdfUrl)},[relatorioPdfUrl]);
 useEffect(()=>()=>{if(pdfUrl)URL.revokeObjectURL(pdfUrl)},[pdfUrl]);
 return <><div style={{height:650}}>QA isolado</div><button onClick={()=>setLista(true)}>Lista</button>
 {handlers.map((h,i)=><button key={i} onClick={()=>h.rodar(...h.args)}>Fluxo {i}</button>)}
 <button onClick={()=>setCompra({name:'Compra.pdf',url:'/arquivo.pdf'})}>Compra</button>
 <button onClick={()=>setCompra({name:'Prévia',srcDoc:'<p>Prévia HTML interna</p>'})}>HTML interno</button>
 <button onClick={()=>setCompra({name:'Blob.pdf',url:URL.createObjectURL(new Blob(['QA']))})}>Blob compra</button>
 <button onClick={abrirRelatorio}>Relatorio titulos</button><button onClick={abrirPdf}>Relatorio obras</button>
 ${expressao(tituloFile,'{relatorioModalOpen ?')}
 ${expressao(obrasFile,'{pdfModalOpen ?')}
 {erro?<p role="alert">{erro}</p>:null}
 {lista?<OverlayModal rotulo="Lista QA" onFechar={()=>setLista(false)}>
   <button onClick={()=>abrirPreview(async()=>{await servico('assinatura');return '/arquivo';},{nome:'Assinado.pdf'})}>PDF assinado</button>
   <button onClick={()=>abrirPreview({url:'/imagem',nome:'Foto.jpeg'})}>Imagem</button>
   <button onClick={()=>abrirPreview({url:'/arquivo',nome:'Texto.svg'})}>SVG</button>
   <button onClick={()=>abrirPreview({url:'/arquivo',nome:'Arquivo.pdf',mimetype:'text/html'})}>HTML externo</button>
   <button onClick={()=>abrirPreview({url:'/arquivo',nome:'Arquivo',mime_type:'application/pdf',downloadUrl:'javascript:alert(1)'})}>MIME</button>
   <button onClick={()=>abrirPreview({url:'javascript:alert(1)',nome:'Inseguro.pdf'})}>Inseguro</button>
   <button onClick={()=>abrirPreview({nome:'Ausente.pdf'})}>Ausente</button>
   <button onClick={()=>setLista(false)}>Fechar lista</button>
 </OverlayModal>:null}
 {modalPreview}<CompraPreviewModal preview={compra} onClose={()=>setCompra(null)}/></>;
}`;
const plugin={name:'qa-preview',enforce:'pre',resolveId(s){if(s==='virtual:qa-preview')return '\0qa-preview';if(s.endsWith('/ThemeContext'))return '\0qa-tema';},async load(id){if(id==='\0qa-preview')return (await transformWithEsbuild(fixture,'qa-preview.jsx',{loader:'jsx'})).code;if(id==='\0qa-tema')return 'export const useTheme=()=>({tema:{}});';},configureServer(server){server.middlewares.use('/qa-preview',async(req,res)=>{res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/qa-preview',`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">import React from 'react';import{createRoot}from'react-dom/client';import Fixture from 'virtual:qa-preview';import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/componentes-padrao.css';window.__calls=[];window.__revogadas=[];const revogar=URL.revokeObjectURL.bind(URL);URL.revokeObjectURL=u=>{window.__revogadas.push(u);revogar(u)};createRoot(document.getElementById('root')).render(React.createElement(Fixture));</script></body></html>`));});}};
const server=await createServer({root,cacheDir:path.join(root,'../outputs/preview-qa-cache'),plugins:[plugin],css:{postcss:{plugins:[tailwindcss({...tailwindConfig,content:[path.join(root,'src/**/*.{js,jsx,ts,tsx}')]}),autoprefixer()]}},server:{host:'127.0.0.1',port:5310,strictPort:true,proxy:{}}});
await server.listen();let browser;
try {
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[],popups=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('popup',p=>popups.push(p));
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.protocol.startsWith('chrome'))return route.continue();assert.equal(u.origin,'http://127.0.0.1:5310','Nenhuma chamada externa');if(u.pathname==='/imagem')return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')});if(u.pathname.startsWith('/arquivo'))return route.fulfill({contentType:'application/pdf',body:'%PDF-1.4 QA'});return route.continue();});
 await page.goto('http://127.0.0.1:5310/qa-preview');
 for(let i=0;i<selecionados.length;i++){
  await page.evaluate(()=>window.__calls=[]);
  await page.getByRole('button',{name:'Fluxo '+i,exact:true}).click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('dialog').locator('iframe').waitFor();
  const calls=await page.evaluate(()=>window.__calls);
  const caso=selecionados[i];assert.deepEqual(calls.find(c=>c.nome===caso[3])?.args,caso[4],caso[0]);
  assert.equal(calls.filter(c=>c.nome===caso[3]).length,1);
  await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});
 }
 await page.getByRole('button',{name:'Compra',exact:true}).click();await page.getByRole('dialog').locator('iframe').waitFor();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'HTML interno',exact:true}).click();assert.match(await page.getByRole('dialog').locator('iframe').getAttribute('srcdoc'),/Prévia HTML interna/);await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Blob compra',exact:true}).click();await page.getByRole('dialog').locator('iframe').waitFor();const blob=await page.getByRole('dialog').locator('iframe').getAttribute('src');await page.keyboard.press('Escape');await page.waitForFunction(u=>window.__revogadas.includes(u),blob);
 for(const [label,endpoint,argumentos] of [['Relatorio titulos','gerarRelatorioTitulosFinanceirosPdf',[{obra_id:'3',situacao:'ABERTO'},[8]]],['Relatorio obras','gerarRelatorioFinanceiroObrasPdf',[{obra_id:'3',situacao:'ABERTO'}]]]){
  await page.evaluate(()=>window.__calls=[]);await page.getByRole('button',{name:label,exact:true}).click();const p=page.getByRole('dialog');await p.locator('iframe').waitFor();
  assert.deepEqual(await page.evaluate(()=>window.__calls[0]),{nome:endpoint,args:argumentos},'Filtros aplicados e selecao permanecem no endpoint de relatorio');
  const url=await p.locator('iframe').getAttribute('src');const [download]=await Promise.all([page.waitForEvent('download'),p.getByRole('link',{name:'Baixar arquivo',exact:true}).click()]);assert.equal(download.suggestedFilename(),'relatorio-QA.pdf');await page.keyboard.press('Escape');await p.waitFor({state:'detached'});await page.waitForFunction(u=>window.__revogadas.includes(u),url);
  await page.evaluate(()=>window.__negar=true);await page.getByRole('button',{name:label,exact:true}).click();await page.getByRole('dialog').getByText('Acesso negado QA',{exact:true}).waitFor();await page.evaluate(()=>window.__negar=false);await page.getByRole('dialog').getByRole('button',{name:'Tentar novamente',exact:true}).click();await page.getByRole('dialog').locator('iframe').waitFor();await page.keyboard.press('Escape');
  await page.evaluate(()=>window.__espera=true);await page.getByRole('button',{name:label,exact:true}).click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await page.evaluate(()=>{window.__espera=false;window.__liberar()});await page.waitForTimeout(100);assert.equal(await page.getByRole('dialog').count(),0,'Relatorio tardio nao reabre');
 }
 for(const width of [1366,390]){
  await page.setViewportSize({width,height:900});await page.getByRole('button',{name:'Lista',exact:true}).click();
  const lista=page.getByRole('dialog',{name:'Lista QA',exact:true}),trigger=lista.getByRole('button',{name:'PDF assinado',exact:true});
  await page.evaluate(()=>{window.__espera=true;window.__calls=[];});await trigger.evaluate(el=>{el.focus();el.click();el.click()});
  await page.waitForFunction(()=>window.__calls.length===1);assert.equal(await page.evaluate(()=>window.__calls.length),1);
  const preview=page.getByRole('dialog',{name:'Assinado.pdf',exact:true});await preview.waitFor();
  await page.evaluate(()=>{window.__espera=false;window.__liberar()});await preview.locator('iframe').waitFor();
  assert.equal(await preview.locator('iframe').getAttribute('sandbox'),null);const panel=await preview.locator('.card').boundingBox();assert(panel.width<=width&&panel.width>(width===390?330:1100));
  await page.keyboard.press('Escape');await preview.waitFor({state:'detached'});assert(await lista.isVisible());assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden');
  await page.waitForFunction(()=>document.activeElement.textContent==='PDF assinado');
  for(const name of ['Imagem','SVG','HTML externo','Inseguro','MIME','Ausente']){
    await lista.getByRole('button',{name,exact:true}).click();const p=page.getByRole('dialog').last();
    if(name==='Imagem')await p.locator('img').waitFor();
    else if(name==='MIME'){await p.locator('iframe').waitFor();assert.equal(await p.getByRole('link',{name:'Baixar arquivo',exact:true}).count(),0,'URL de download insegura nunca oferecida');}
    else assert.equal(await p.locator('iframe,img').count(),0);
    if(name==='Inseguro'||name==='Ausente')assert.equal(await p.getByRole('link').count(),0);
    await page.keyboard.press('Escape');
  }
  await page.keyboard.press('Escape');await lista.waitFor({state:'detached'});assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
 }
 // Uma negativa deve usar o aviso existente e nao mostrar recurso/popup.
 await page.evaluate(()=>window.__negar=true);await page.getByRole('button',{name:'Fluxo 0',exact:true}).click();await page.getByRole('alert').getByText('Acesso negado QA',{exact:true}).waitFor();assert.equal(await page.getByRole('dialog').count(),0);
 await page.evaluate(()=>{window.__negar=false;window.__espera=true});await page.getByRole('button',{name:'Fluxo 0',exact:true}).click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await page.evaluate(()=>{window.__espera=false;window.__liberar()});await page.waitForTimeout(100);assert.equal(await page.getByRole('dialog').count(),0,'Resposta tardia nao reabre');
 assert.deepEqual(errors,[]);assert.equal(popups.length,0);
 console.log('OK '+etapa+': '+selecionados.length+' handlers reais/endpoints originais, adapters de compra, HTML interno, blobs, PDF/imagem, desktop/mobile, dupla abertura, pilha/Escape/foco, 403 e resposta tardia. APIs isoladas.');
} finally{await browser?.close();await server.close();}
