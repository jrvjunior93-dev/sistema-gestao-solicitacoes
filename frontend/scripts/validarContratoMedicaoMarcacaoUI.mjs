import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import Marcacao from '/src/components/contratos/ContratoMedicaoMarcacao.jsx';
function App(){const[id,set]=useState(4);window.trocar=()=>set(5);return <main style={{padding:16,minWidth:0}}><h1>Gestao do contrato {id}</h1><Marcacao key={id} contratoId={id} onMudou={()=>window.recarregou=(window.recarregou||0)+1}/></main>}createRoot(document.getElementById('root')).render(<App/>);`;
const mock = `let estado={finalizado:false,revisao:0},historico=[];window.envios=[];
export async function getMarcacaoMedicaoContrato(id){await new Promise(r=>setTimeout(r,location.search.includes('lento')&&id===4?700:20));if(location.search.includes('erroget'))throw Error('Consulta negada');return{contrato_id:id,codigo:'CT-000'+id,estado:{...estado},historico:[...historico],pode_alterar:!location.search.includes('negado')};}
export async function alterarMarcacaoMedicaoContrato(id,payload){window.envios.push({id,payload});await new Promise(r=>setTimeout(r,100));if(location.search.includes('falha'))throw Error('A marcacao mudou. Atualize o contrato.');estado={...payload,revisao:payload.revisao+1,atualizado_por:9,atualizado_em:'2026-10-15T18:00:00.000Z'};historico.unshift({id:historico.length+1,usuario_id:9,data:estado.atualizado_em,finalizado:estado.finalizado,motivo:estado.motivo});return{estado,repetida:false};}`;
const server = await createServer({ root, configFile: false, logLevel: 'error', server: { host: '127.0.0.1', port: 0 },
  plugins: [{ name: 'qa-marcacao-contrato', enforce: 'pre', resolveId(id) { if (id === '/entry-marcacao.jsx') return '\0qa-marcacao.jsx'; },
    async load(id) { if (id === '\0qa-marcacao.jsx') return transformWithEsbuild(fixture, 'fixture.jsx', { loader: 'jsx', jsx: 'transform' }); },
    transform(code, id) { if (id.replaceAll('\\', '/').endsWith('/src/services/contratos.js')) return mock; },
    configureServer(s) { s.middlewares.use(async (req, res, next) => {
      if (!req.url.startsWith('/qa-marcacao')) return next(); res.setHeader('Content-Type', 'text/html');
      res.end(await s.transformIndexHtml('/qa-marcacao', '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/entry-marcacao.jsx"></script></body></html>'));
    }); } }, react()], optimizeDeps: { include: ['react', 'react-dom/client'] } });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const base = `http://127.0.0.1:${server.httpServer.address().port}/qa-marcacao`;
const out = path.join(root, '../outputs/contrato-medicao-marcacao'); fs.mkdirSync(out, { recursive: true });
try {
  for (const width of [1366, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', r => new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort());
    await page.goto(base);
    const css = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8').match(/href="\/assets\/([^\"]+\.css)"/)[1];
    await page.addStyleTag({ path: path.join(root, 'dist/assets', css) });
    const botao = page.getByRole('button', { name: 'Marcar como totalmente medido', exact: true }); await botao.click();
    assert.equal(await page.evaluate(() => window.envios.length), 0);
    await page.getByRole('button', { name: 'Confirmar marcacao', exact: true }).click();
    await page.getByText('Informe o motivo da marcacao ou da reversao.').waitFor();
    await page.getByLabel('Motivo *', { exact: true }).fill('Servico fisico concluido; saldo preservado');
    await page.getByRole('button', { name: 'Confirmar marcacao', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: 'Marcar como totalmente medido', exact: true });
    assert((await dialog.innerText()).includes('CT-0004'));
    await dialog.getByRole('button', { name: 'Voltar', exact: true }).click(); assert.equal(await page.evaluate(() => window.envios.length), 0);
    await page.getByRole('button', { name: 'Confirmar marcacao', exact: true }).evaluate(el => { el.click(); el.click(); });
    dialog = page.getByRole('dialog', { name: 'Marcar como totalmente medido', exact: true });
    await dialog.getByRole('button', { name: 'Marcar como totalmente medido', exact: true }).evaluate(el => { el.click(); el.click(); });
    const desfazer = page.getByRole('button', { name: 'Desfazer marcacao de totalmente medido', exact: true }); await desfazer.waitFor();
    assert.equal(await page.evaluate(() => window.envios.length), 1);
    assert.deepEqual(await page.evaluate(() => window.envios[0]), { id: 4, payload: { finalizado: true, revisao: 0, motivo: 'Servico fisico concluido; saldo preservado' } });
    await page.getByText('Historico da marcacao (1)', { exact: true }).click();
    assert((await page.locator('body').innerText()).includes('Usuario 9'));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(out, `marcado-${width}.png`), fullPage: true });
    await desfazer.click(); await page.getByLabel('Motivo *', { exact: true }).fill('Nova medicao autorizada pelo GEO');
    await page.getByRole('button', { name: 'Confirmar marcacao', exact: true }).click();
    await page.getByRole('dialog', { name: 'Desfazer marcacao', exact: true }).getByRole('button', { name: 'Desfazer marcacao', exact: true }).click();
    await botao.waitFor(); assert.equal(await page.evaluate(() => window.envios.length), 2);
    assert.equal(await page.evaluate(() => window.envios[1].payload.revisao), 1);
    assert.equal(await page.evaluate(() => window.envios[1].payload.finalizado), false);
    await page.goto(base + '?negado'); await page.getByText('Marcacao manual de medicao', { exact: true }).waitFor();
    assert.equal(await botao.count(), 0); assert.equal(await page.getByLabel('Motivo *', { exact: true }).count(), 0);
    await page.goto(base + '?falha'); await botao.click(); await page.getByLabel('Motivo *', { exact: true }).fill('Motivo preservado em falha');
    await page.getByRole('button', { name: 'Confirmar marcacao', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Marcar como totalmente medido', exact: true }).click();
    await page.getByText('A marcacao mudou. Atualize o contrato.').waitFor();
    assert.equal(await page.getByLabel('Motivo *', { exact: true }).inputValue(), 'Motivo preservado em falha');
    assert.equal(await desfazer.count(), 0);
    await page.goto(base + '?erroget'); await page.getByRole('alert').waitFor(); assert.equal(await botao.count(), 0);
    await page.goto(base + '?lento'); await page.evaluate(() => window.trocar());
    await page.getByRole('heading', { name: 'Gestao do contrato 5' }).waitFor(); await botao.click();
    await page.getByLabel('Motivo *', { exact: true }).fill('Confirmacao do alvo correto');
    await page.getByRole('button', { name: 'Confirmar marcacao', exact: true }).click();
    assert((await page.getByRole('dialog').innerText()).includes('CT-0005'));
    await page.getByRole('dialog').getByRole('button', { name: 'Voltar', exact: true }).click();
    await page.goto(base); await botao.click(); await page.getByLabel('Motivo *', { exact: true }).fill('Nao aplicar apos troca');
    await page.getByRole('button', { name: 'Confirmar marcacao', exact: true }).click(); await page.getByRole('dialog').waitFor();
    await page.evaluate(() => window.trocar()); await page.getByRole('heading', { name: 'Gestao do contrato 5' }).waitFor();
    assert.equal(await page.evaluate(() => window.envios.length), 0);
    assert.deepEqual(errors, []); await page.close();
  }
  console.log('UI marcacao: motivo/confirmacao/cancelar/reversao/historico, mutex, negativas, erro sem falsa conclusao, alvo fixado/GET antigo e desktop/mobile aprovados. APIs simuladas.');
} finally { await browser.close(); await server.close(); }
