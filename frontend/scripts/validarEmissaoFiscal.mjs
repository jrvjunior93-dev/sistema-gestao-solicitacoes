// Dados ficticios, paginas reais e adaptadores locais. Sem API/DB/AWS/NSDOCS reais.
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatarDataEmissaoFiscal as format } from '../src/modules/fiscal/utils/dataEmissaoFiscal.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const self = fileURLToPath(import.meta.url);
if (process.argv.includes('--tz')) {
  const doc = { source: 'nsdocs_v2_manual', emission_date: '2026-10-16T00:00:00.000Z' };
  const before = JSON.stringify(doc);
  assert.equal(format(doc), '16/10/2026');
  assert.equal(JSON.stringify(doc), before);
  for (const emission_date of ['2026-10-16', '2026-10-16 00:00:00', '2026-10-16T23:59:59-03:00']) {
    assert.equal(format({ ...doc, emission_date }), '16/10/2026');
  }
  assert.equal(format({ ...doc, emission_date: '2024-02-29' }), '29/02/2024');
  for (const emission_date of [null, '', 'invalida', '2026-02-29', '2026-10-32', '2026-00-16', '2026-10-16T24:00:00Z', '2026-10-16T10:80:00Z']) {
    assert.equal(format({ ...doc, emission_date }), null);
  }
  assert.equal(format(null), null);
  assert.equal(format({ emission_date: '2026-10-16' }), '16/10/2026');
  for (const source of ['manual_upload', 'batch_import', 'sefaz_distribution', undefined]) {
    // Um XML legado emitido a noite no Brasil pode estar no dia seguinte em UTC.
    const emission_date = '2026-10-17T01:30:00.000Z';
    assert.equal(format({ source, emission_date }), new Date(emission_date).toLocaleDateString('pt-BR'));
  }
  console.log(`Datas civis, legado, invalidos e imutabilidade aprovados: ${process.env.TZ}`);
  process.exit(0);
}
const zones = ['America/Sao_Paulo', 'UTC', 'Pacific/Kiritimati'];
for (const TZ of zones) {
  const run = cp.spawnSync(process.execPath, [self, '--tz'], { env: { ...process.env, TZ }, encoding: 'utf8', timeout: 10000 });
  assert.equal(run.status, 0, run.stderr); process.stdout.write(run.stdout);
}

const { createServer, transformWithEsbuild } = await import('vite');
const { default: react } = await import('@vitejs/plugin-react');
const { chromium } = await import('playwright');
const docs = [{ id: 81, document_number: '101', source: 'nsdocs_v2_manual', emission_date: '2026-10-16T00:00:00.000Z',
  issuer_name: 'Fornecedor QA', document_status: 'xml_downloaded', xml_storage_key: 'fixture.xml',
  createdAt: '2026-10-16T00:30:00.000Z', events: [{ id: 1, event_date: '2026-10-16T00:30:00.000Z', event_type: 'fixture' }] },
  { id: 82, document_number: '102', source: 'manual_upload', emission_date: '2026-10-17T01:30:00.000Z', issuer_name: 'Legado QA' },
  { id: 83, document_number: '103', source: 'nsdocs_v2_manual', emission_date: null, issuer_name: 'Sem data QA' }];
const api = `const docs=${JSON.stringify(docs)};
window.qaCalls=[];
export const getFiscalDocuments=async()=>{window.qaCalls.push('lista');return {data:docs};};
export const getFiscalDocument=async(id)=>{window.qaCalls.push('detalhe');return docs.find(d=>d.id===Number(id));};
export const getFiscalCompanies=async()=>({data:[]});
export const getFiscalDocumentFileUrl=async(id,type)=>{window.qaCalls.push('arquivo:'+id+':'+type);return {url:'about:blank'};};
const blocked=()=>{window.qaCalls.push('MUTACAO');throw Error('Mutacao proibida no QA');};
export {blocked as generateFiscalDocumentDanfe, blocked as uploadFiscalXml, blocked as createFiscalDivergence,
blocked as getFiscalLinkOptions,blocked as ignoreFiscalDocument,blocked as linkFiscalDocument,
blocked as suggestFiscalDocumentLinks,blocked as updateFiscalDivergence,blocked as updateFiscalDocumentLink,
blocked as uploadFiscalDocumentFile,blocked as validateFiscalDocument};`;
// Adaptadores de layout isolam o teste do tema/preferencias: as expressoes das
// colunas, campos, horarios e handlers continuam sendo as das paginas reais.
const padrao = `import React from 'react';
export const Pagina=({children})=><main>{children}</main>;
export const BlocoConteudo=({children,titulo})=><section aria-label={titulo}>{children}</section>;
export const PageHeader=({titulo,secundarias=[]})=><header><h1>{titulo}</h1>{secundarias.map((a,i)=><button key={i} onClick={a.onClick}>{a.rotulo}</button>)}</header>;
export const CamposComVazios=({campos})=><dl>{campos.map((c,i)=><div key={i} data-field={c.label}><dt>{c.label}</dt><dd>{c.valor??''}</dd></div>)}</dl>;
export const TabelaPadrao=({colunas,itens=[],storageKey,acoesLinha})=><table data-key={storageKey}><tbody>{itens.map((item,i)=><tr key={i}>{colunas.map((c,j)=><td key={j} data-col={c.id}>{c.render?.(item)}</td>)}<td>{acoesLinha?.(item)}</td></tr>)}</tbody></table>;
export const FormSecao=({children})=><div>{children}</div>;
export const CampoForm=({children})=><div>{children}</div>;
export const CelulaDupla=({principal})=><span>{principal}</span>;
export const BarraFiltros=()=>null;export const Avisos=()=>null;
export const useAvisos=()=>({avisos:[],avisar:{erro:()=>{},sucesso:()=>{}},fechar:()=>{}});
export const useConfirmacao=()=>({confirmar:async()=>({confirmado:false}),elementoConfirmacao:null});
export const useFiltrosVisiveis=()=>({ehVisivel:()=>true});`;
const fixture = `import React from 'react';import{createRoot}from'react-dom/client';
import{MemoryRouter,Routes,Route}from'react-router-dom';
import List from '/src/modules/fiscal/pages/FiscalDocuments.jsx';
import Detail from '/src/modules/fiscal/pages/FiscalDocumentDetail.jsx';
createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/fiscal/documentos']}>
<Routes><Route path='/fiscal/documentos' element={<List/>}/><Route path='/fiscal/documentos/:id' element={<Detail/>}/></Routes></MemoryRouter>);`;
const virtual = { '\0qa-emissao-entry.jsx': fixture, '\0qa-emissao-padrao.jsx': padrao, '\0qa-emissao-api.js': api,
  '\0qa-emissao-viewer.js': 'export default()=>({abrirPreview:()=>{},modalPreview:null});',
  '\0qa-emissao-status.jsx': "import React from 'react';export default({status})=><span>{status}</span>;" };
const vite = await createServer({ root, configFile: false, logLevel: 'error', envFile: false,
  server: { host: '127.0.0.1', port: 0 }, css: { postcss: { plugins: [] } },
  plugins: [{ name: 'qa-emissao-local', enforce: 'pre',
    resolveId(id, importer) {
      if (id === '/qa-emissao.jsx') return '\0qa-emissao-entry.jsx';
      if (id === '../services/fiscalApi' && importer?.replaceAll('\\','/').includes('/modules/fiscal/hooks/')) return '\0qa-emissao-api.js';
      if (!importer?.replaceAll('\\','/').includes('/modules/fiscal/pages/')) return;
      if (id === '../../../components/padrao') return '\0qa-emissao-padrao.jsx';
      if (id === '../services/fiscalApi') return '\0qa-emissao-api.js';
      if (id === '../../../hooks/useVisualizadorArquivo') return '\0qa-emissao-viewer.js';
      if (id === '../../../components/StatusBadge') return '\0qa-emissao-status.jsx';
    },
    load(id) { if (Object.hasOwn(virtual,id)) return id.endsWith('.jsx') ? transformWithEsbuild(virtual[id],id,{loader:'jsx',jsx:'transform'}) : virtual[id]; },
    configureServer(server) { server.middlewares.use(async(req,res,next)=>{
      if (req.url?.split('?')[0] !== '/qa-emissao') return next();
      res.setHeader('Content-Type','text/html');
      res.end(await server.transformIndexHtml('/qa-emissao','<html><body><div id="root"></div><script type="module" src="/qa-emissao.jsx"></script></body></html>'));
    }); }
  }, react()], optimizeDeps: { include: ['react', 'react-dom/client', 'react-router-dom'] } });
let browser;
try {
  await vite.listen();
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const timezoneId of zones) {
    const context = await browser.newContext({ timezoneId });
    const errors = [], external = [];
    await context.route('**/*', route => {
      if (route.request().url().startsWith(`${origin}/`)) return route.continue();
      external.push(route.request().url()); return route.abort();
    });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${origin}/qa-emissao`);
    const emissions = page.locator('[data-key="tabela:documentos-fiscais"] [data-col="emissao"]');
    await emissions.first().waitFor();
    assert.equal(await emissions.nth(0).innerText(), '16/10/2026');
    assert.equal(await emissions.nth(1).innerText(), await page.evaluate(() => new Date('2026-10-17T01:30:00.000Z').toLocaleDateString('pt-BR')));
    assert.equal(await emissions.nth(2).innerText(), '-');
    // Navegacao real lista -> detalhe, sem trocar handlers de arquivos nas paginas.
    await page.getByRole('link', { name: 'Detalhes', exact: true }).first().click();
    const emission = page.locator('[data-field="Emissão"] dd'); await emission.waitFor();
    assert.equal(await emission.innerText(), '16/10/2026');
    const expected = await page.evaluate(() => new Date('2026-10-16T00:30:00.000Z').toLocaleString('pt-BR'));
    assert.equal(await page.locator('[data-field="Criado em"] dd').innerText(), expected);
    assert.equal(await page.locator('[data-key="tabela:documento-fiscal:eventos"] [data-col="data"]').innerText(), expected);
    const popupWait = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Abrir XML', exact: true }).click();
    await (await popupWait).close();
    assert.deepEqual(await page.evaluate(() => window.qaCalls), ['lista','detalhe','arquivo:81:xml']);
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    await context.close();
    console.log(`Lista/detalhe, legado, historico com hora e XML aprovados no navegador: ${timezoneId}`);
  }
} finally {
  await browser?.close(); await vite.close();
}
