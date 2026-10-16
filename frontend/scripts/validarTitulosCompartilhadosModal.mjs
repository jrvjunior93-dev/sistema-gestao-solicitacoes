import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
import { empresasDevedorasTitulo, tituloTemOutraDevedora } from '../src/utils/tituloEmpresasDevedoras.js';
assert.deepEqual(empresasDevedorasTitulo({ empresa_id: 41 }), ['41']);
const tituloMultiempresa = { compartilhamento_id: 5, participacoes: [{ empresa_id: 41 }, { empresa_id: 42 }, { empresa_id: 41 }] };
assert.deepEqual(empresasDevedorasTitulo(tituloMultiempresa), ['41', '42']);
assert(tituloTemOutraDevedora(tituloMultiempresa, 41));
assert(tituloTemOutraDevedora(tituloMultiempresa, 42));
assert(!tituloTemOutraDevedora({ empresa_id: 41 }, 41));
assert(!tituloTemOutraDevedora(tituloMultiempresa, ''));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = `import React,{useMemo,useState}from'react';import{createRoot}from'react-dom/client';
import{MemoryRouter}from'react-router-dom';import Modal from'/src/components/financeiro/TitulosCompartilhadosModal.jsx';
import{WorkspacePageContext,createWorkspaceMemory}from'/src/navigation/WorkspaceContext.jsx';
import Cancelar from'/src/components/financeiro/CancelarLoteCompartilhado.jsx';
function App(){const memory=useMemo(()=>createWorkspaceMemory(),[]);const[aberto,A]=useState(true),[criado,C]=useState(null),[cancelado,X]=useState(false);return <WorkspacePageContext.Provider value={{key:'lote-qa',memory,snapshot:true,active:true}}>{aberto?<Modal solicitacaoId={1} pedidoId={11} credorInicial={{id:7,nome:'Fornecedor QA'}} onClose={()=>A(false)} onCreated={r=>{window.resultado=r;C(r)}}/>:criado&&!cancelado?<Cancelar titulo={{id:20,compartilhamento_id:criado.id,status:'ABERTO',valor_baixado:0}} permitido onCanceled={()=>X(true)}/>:cancelado?<p>Lote cancelado em QA</p>:null}</WorkspacePageContext.Provider>}
createRoot(document.getElementById('root')).render(<MemoryRouter><App/></MemoryRouter>);`;
const mocks = `const config={categorias:[{id:8,nome:'Materiais'}],categoria_padrao_id:8,formas:[{id:9,nome:'Transferência'}]};
const origens=[{solicitacao_id:1,codigo:'SOL-1',pedido_compra_id:11,pedido_codigo:'PC-00011',valor:'60.01',obra:{nome:'Obra A'},empresa:{id:41,nome:'Empresa A',cnpj:'CNPJ-A'},parceiro_id:7},
{solicitacao_id:2,codigo:'SOL-2',pedido_compra_id:22,pedido_codigo:'PC-00022',valor:'40.00',obra:{nome:'Obra B'},empresa:{id:42,nome:'Empresa B',cnpj:'CNPJ-B'},parceiro_id:7}];
export async function buscarOrigensCompartilhadas(p){await new Promise(r=>setTimeout(r,80));return {...config,items:p.solicitacao_id?[origens[0]]:[origens[1]],proximo_cursor:null};}
export async function conferirLoteCompartilhado(p){window.previews=(window.previews||0)+1;window.body=p;await new Promise(r=>setTimeout(r,80));return{...p,valor:'100.01',preview_hash:'a'.repeat(64),parcelas:p.parcelas.map(parcela=>({...parcela,participacoes:origens.map(o=>({...o,valor:o.valor,empresa_nome:o.empresa.nome,empresa_cnpj:o.empresa.cnpj}))}))};}
export async function criarLoteCompartilhado(body,chave){window.envios=window.envios||[];window.envios.push({body,chave});await new Promise(r=>setTimeout(r,250));if(window.envios.length===1)throw Error('Timeout simulado. Tente novamente.');return{id:5,titulos:[{id:20,codigo:'TIT-20'}]};}
export async function cancelarLoteCompartilhado(id,motivo){window.cancelamentos=(window.cancelamentos||0)+1;window.cancelamento={id,motivo};await new Promise(r=>setTimeout(r,150));return{id,cancelado:true};}`;
const server = await createServer({ root, configFile: false, logLevel: 'error', server: { host: '127.0.0.1', port: 0 },
  plugins: [{ name: 'fixture-titulos-compartilhados', enforce: 'pre',
    resolveId(id) { if (id === '/fixture.jsx') return '\0fixture-compartilhados.jsx'; },
    load(id) { if (id === '\0fixture-compartilhados.jsx') return transformWithEsbuild(fixture, 'fixture.jsx', { loader: 'jsx', jsx: 'transform' }); },
    transform(code, id) { if (id.endsWith('/src/services/titulosCompartilhados.js')) return mocks; },
    configureServer(s) { s.middlewares.use(async (req, res, next) => {
      if (new URL(req.url, 'http://localhost').pathname !== '/fixture') return next();
      res.setHeader('Content-Type', 'text/html');
      res.end(await s.transformIndexHtml('/fixture', '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
    }); }
  }, react()], optimizeDeps: { include: ['react', 'react-dom/client', 'react-router-dom'] } });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/fixture`);
  const css = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8').match(/href="\/assets\/([^\"]+\.css)"/)[1];
  await page.addStyleTag({ path: path.join(root, 'dist/assets', css) });
  const gerar = page.getByRole('button', { name: 'Gerar títulos compartilhados', exact: true });
  await gerar.waitFor(); assert(await gerar.isDisabled());
  await page.getByLabel('Participação PC-00011').waitFor();
  await page.getByLabel('Buscar solicitações / pedidos').fill('SOL-2');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await page.getByText('Origens selecionadas (2/100)', { exact: true }).waitFor();
  assert(await page.getByLabel('Participação PC-00022').getAttribute('readonly') !== null);
  await page.getByLabel('Forma de pagamento', { exact: true }).selectOption('9');
  await page.getByLabel('Instruções de pagamento').fill('Favorecido fornecedor; agência 1, conta 2.');
  await page.getByRole('button', { name: 'Distribuir total nas parcelas' }).click();
  assert.equal(await page.getByLabel('Valor da parcela 1', { exact: true }).inputValue(), '100.01');
  await page.getByRole('button', { name: 'Conferir lote', exact: true }).click();
  await page.getByRole('checkbox').waitFor(); assert(await gerar.isDisabled());
  assert.equal(await page.evaluate(() => window.body.origens.length), 2);
  const out = path.resolve(root, '../outputs/titulos-compartilhados'); fs.mkdirSync(out, { recursive: true });
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const bounds = await page.getByRole('dialog').evaluate(el => { const r = el.firstElementChild.getBoundingClientRect(); return { left: r.left, right: r.right, width: innerWidth }; });
    assert(bounds.left >= 0 && bounds.right <= bounds.width + 1, JSON.stringify(bounds));
    assert.equal(await page.getByLabel('Participação PC-00011').inputValue(), '60.01');
    await page.screenshot({ path: path.join(out, `lote-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.getByLabel('Descrição do lote').fill('Compra alterada');
  assert(await gerar.isDisabled(), 'Alteração invalida a prévia'); assert.equal(await page.getByRole('checkbox').count(), 0);
  await page.getByRole('button', { name: 'Conferir lote', exact: true }).click();
  await page.getByRole('checkbox').check();
  await gerar.evaluate(el => { el.click(); el.click(); });
  await page.getByRole('alert').getByText('Timeout simulado. Tente novamente.').waitFor();
  assert.equal(await page.evaluate(() => window.envios.length), 1, 'Múltiplos cliques não repetem envio');
  await gerar.click(); await page.getByRole('status').waitFor();
  assert.equal(await page.evaluate(() => window.envios[0].chave === window.envios[1].chave), true, 'Retry mantém a chave de idempotência');
  assert.equal(await page.evaluate(() => window.resultado.id), 5);
  await page.getByRole('button', { name: 'Fechar', exact: true }).first().click();
  await page.getByRole('button', { name: 'Cancelar lote compartilhado', exact: true }).click();
  const cancelar = page.getByRole('button', { name: 'Confirmar cancelamento do lote', exact: true });
  assert(await cancelar.isDisabled());
  await page.getByLabel('Motivo do cancelamento').fill('Compra consolidada incorretamente.');
  await cancelar.evaluate(el => { el.click(); el.click(); });
  await page.getByText('Lote cancelado em QA', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.cancelamentos), 1);
  assert.equal(await page.evaluate(() => window.cancelamento.id), 5);
  assert.deepEqual(errors, []);
  console.log('UI compartilhada desktop/mobile: seleção entre buscas, obras/CNPJs distintos, prévia invalidada por edição, confirmação explícita, duplo clique e retry idempotente aprovados. Somente fixtures locais.');
} finally { await browser.close(); await server.close(); }
