import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '../outputs/treinamento-rastreio'); fs.mkdirSync(out, { recursive: true });
// Tracker real, relogio/eventos deterministas, APIs simuladas. Sem servidor real.
const source = fs.readFileSync(path.join(root, 'src/utils/treinamentoVideoTracker.js'), 'utf8').replace(/^import[^\n]+\n/, '').replace('export function', 'function');
let now = 0, serial = 0, timers = new Map(), sent = [], warnings = [], fail = false;
const doc = new EventTarget(); doc.visibilityState = 'visible'; const win = new EventTarget();
const video = new EventTarget(); Object.assign(video, { currentTime: 0, duration: 100, playbackRate: 1, paused: true, seeking: false, readyState: 4 });
const api = { iniciarTreinamentoVideo: async () => ({}), registrarTreinamentoVideo: async (_, p) => { sent.push(structuredClone(p)); if (fail) { fail = false; throw new Error('Offline QA'); } } };
const attach = new Function('document', 'window', 'crypto', 'performance', 'setInterval', 'clearInterval', source + ';return rastrearVideo;')(
  doc, win, { randomUUID }, { now: () => now }, (fn, ms) => { const id = ++serial; timers.set(id, { fn, ms }); return id; }, id => timers.delete(id));
const dispose = attach(video, 7, e => warnings.push(e), api);
const drain = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
await drain();
const event = (target, name) => target.dispatchEvent(new Event(name));
function tick(seconds, movement = true) { for (let i = 0; i < seconds * 2; i++) { now += 500; if (movement) video.currentTime += .5 * video.playbackRate; for (const t of timers.values()) if (t.ms === 500) t.fn(); } }
function flush() { for (const t of timers.values()) if (t.ms === 5000) t.fn(); }
video.paused = false; event(video, 'playing'); tick(5); flush(); await drain();
assert.equal(sent[0].trechos[0][2], 5); assert.equal(sent[0].trechos[0][1], 5);
video.paused = true; event(video, 'pause'); tick(10, false); flush(); await drain(); assert.equal(sent.length, 1, 'Pausa nao registra tempo');
video.paused = false; event(video, 'playing'); doc.visibilityState = 'hidden'; event(doc, 'visibilitychange'); tick(5); flush(); await drain(); assert.equal(sent.length, 1, 'Aba oculta nao registra cobertura');
doc.visibilityState = 'visible'; event(doc, 'visibilitychange'); event(video, 'playing');
event(video, 'waiting'); tick(5, false); flush(); await drain(); assert.equal(sent.length, 1, 'Buffering nao registra tempo');
event(video, 'playing'); video.currentTime = 99; video.seeking = true; event(video, 'seeking'); video.seeking = false; event(video, 'seeked'); await drain();
assert.equal(sent[1].trechos.length, 0); assert.deepEqual(sent[1].saltos, [[10, 99]], 'Pular ao fim nao preenche trecho');
video.currentTime = 20; event(video, 'playing'); video.playbackRate = 2; event(video, 'ratechange'); tick(5); fail = true; flush(); await drain();
assert.equal(sent[2].trechos[0][2], 5); assert.equal(sent[2].trechos[0][1], 30, '2x cobre 10s em 5s reais');
flush(); await drain(); assert.deepEqual(sent[2], sent[3], 'Retry conserva sequencia e pacote'); assert.equal(warnings.length, 1);
tick(1); dispose(); await drain(); assert.equal(timers.size, 0); assert(sent.at(-1).trechos.length, 'Fechar envia cauda');
event(video, 'playing'); assert.equal(timers.size, 0, 'Cleanup remove listeners/timers');

const fixture = `import React from 'react';import{createRoot}from'react-dom/client';import Relatorio from'/src/components/treinamento/TreinamentoRelatorioVideo.jsx';
import{ThemeContext,TEMA_PADRAO}from'/src/contexts/ThemeContext.jsx';
import'/src/index.css';import'/src/styles/design-tokens.css';import'/src/styles/componentes-padrao.css';import'/src/styles/escala.css';import'/src/styles/responsive-system.css';
import'/src/components/lista-avancada/lista-avancada.css';
window.calls=[];window.user={id:2,perfil:'USUARIO',areas_permissoes_configuradas:true,areas_permissoes:location.search.includes('leitor')?['treinamento.conteudos.gerenciar']:['treinamento.relatorios.visualizar']};
window.report=async params=>{window.calls.push(params);await new Promise(r=>setTimeout(r,40));if(window.negar)throw new Error('Acesso negado QA');return{total:51,items:[{id:1,usuario:{id:3,nome:'Pessoa QA'},ator_id:1,ator:{nome:'Admin QA'},titulo:'Como usar o Fluxy',versao:'123456789abcdef',sessoes:2,duracao:100,segundos:20,percentual:10,saltos:1,pulou_final:true,concluido_manual:true,concluido_em:'2026-10-14T12:00:00Z',primeira_visualizacao:'2026-10-14T11:00:00Z',ultima_visualizacao:'2026-10-14T12:00:00Z',trechos:[[0,10]],ultimos_saltos:[[10,99]]}]};};
createRoot(document.getElementById('root')).render(<ThemeContext.Provider value={{tema:TEMA_PADRAO}}><Relatorio/></ThemeContext.Provider>);`;
const server = await createServer({ root, configFile: false, logLevel: 'error', server: { host: '127.0.0.1', port: 0 }, plugins: [{
  name: 'qa-rastreio', enforce: 'pre', resolveId(id) { if (id === '/fixture.jsx') return '\0qa-rastreio.jsx'; },
  async load(id) { if (id === '\0qa-rastreio.jsx') return transformWithEsbuild(fixture, 'fixture.jsx', { loader: 'jsx', jsx: 'transform' }); },
  transform(_, id) {
    if (id.endsWith('/src/services/treinamento.js')) return 'export const getTreinamentoRelatorioVideo=p=>window.report(p);';
    if (id.endsWith('/src/contexts/AuthContext.jsx')) return 'export const useAuth=()=>({user:window.user});';
  },
  configureServer(s) { s.middlewares.use(async (req, res, next) => { if (new URL(req.url, 'http://localhost').pathname !== '/') return next(); res.setHeader('Content-Type', 'text/html'); res.end(await s.transformIndexHtml('/', '<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>')); }); }
}, react()] });
let browser, page; const errors = [];
try {
  await server.listen(); browser = await chromium.launch({ channel: 'chrome', headless: true }); page = await browser.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', e => errors.push(e.message)); const base = server.resolvedUrls.local[0];
  await page.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 }); await page.goto(base); await page.getByText('Pessoa QA', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Ver trechos', exact: true }).click();
    await page.getByRole('region', { name: 'Detalhes da reprodução' }).waitFor();
    assert((await page.getByRole('region', { name: 'Detalhes da reprodução' }).innerText()).includes('0:10 → 1:39'));
    await page.getByPlaceholder('Buscar usuário ou vídeo').fill('Pessoa'); await page.waitForFunction(() => window.calls.some(c => c.busca === 'Pessoa'));
    await page.getByRole('button', { name: 'Próxima', exact: true }).click(); await page.waitForFunction(() => window.calls.some(c => c.pagina === 2));
    await page.getByRole('button', { name: 'Anterior', exact: true }).click(); await page.waitForFunction(() => window.calls.at(-1)?.pagina === 1);
    await page.getByRole('button', { name: /Reprodução/ }).click();
    await page.getByRole('radio', { name: 'Avançou ao final', exact: true }).check();
    await page.waitForFunction(() => window.calls.at(-1)?.pulou_final === 'true');
    await page.getByRole('button', { name: 'Ver trechos', exact: true }).click();
    await page.screenshot({ path: path.join(out, 'relatorio-' + width + '.png'), fullPage: true });
  }
  await page.evaluate(() => { window.negar = true; }); await page.getByRole('button', { name: 'Atualizar relatório', exact: true }).click(); await page.getByRole('alert').waitFor();
  assert.equal(await page.getByText('Pessoa QA', { exact: true }).count(), 0, 'Erro/permissao nao deixa dados anteriores visiveis');
  await page.goto(base + '?leitor'); await page.waitForLoadState('networkidle'); assert.equal(await page.evaluate(() => window.calls.length), 0, 'Gerenciar nao concede relatorio');
  assert.equal(await page.getByText('Relatório de reprodução', { exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  console.log('Treinamento UI/tracker: reproducao/pausa/aba oculta/buffering/salto/2x/retry/cleanup, relatorio desktop/mobile, detalhe, filtros/paginacao e ACL aprovados.');
} catch (e) { if (page) await page.screenshot({ path: path.join(out, 'falha.png') }); throw e; }
finally { await browser?.close(); await server.close(); }
