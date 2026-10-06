import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PADRAO, FUTURAS } = createRequire(import.meta.url)('../../backend/src/services/prazosOperacionaisDomain.js');
const virtual = '\0prazos-fixture.jsx';
const entry = `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';import Prazos,{ContadorPrazo} from '/src/components/PrazosOperacionais.jsx';
import Config from '/src/pages/PrazosOperacionaisConfig.jsx';import '/src/index.css';
import Solicitacoes from '/src/pages/Solicitacoes/index.jsx';import '/src/components/lista-avancada/lista-avancada.css';
import {ThemeContext,TEMA_PADRAO} from '/src/contexts/ThemeContext.jsx';
import '/src/styles/design-tokens.css';import '/src/styles/escala.css';import '/src/styles/componentes-padrao.css';import '/src/styles/responsive-system.css';
window.actor={id:99,perfil:'SUPERADMIN',nome:'Teste'};
window.prazo={quantidade:2,limite_em:new Date(Date.now()+7200000).toISOString(),servidor_agora:new Date().toISOString(),aviso_ms:3600000,modo:'BLOQUEAR'};
function App(){const [lista,setLista]=useState(false),[real,setReal]=useState(false);return <ThemeContext.Provider value={{tema:TEMA_PADRAO}}><BrowserRouter><main className="layout-shell" style={{padding:12,maxWidth:'100%'}}><button onClick={()=>setLista(!lista)}>Trocar tela de teste</button><button onClick={()=>setReal(true)}>Ver lista real</button><Prazos>{real?<Solicitacoes/>:lista?<div><h1>Solicitações</h1><span>SOL-TESTE </span><ContadorPrazo prazo={window.prazo}/><button>Consulta permanece disponível</button></div>:<Config/>}</Prazos></main></BrowserRouter></ThemeContext.Provider>}
createRoot(document.getElementById('root')).render(<App/>);`;
const server = await createServer({ root, configFile: false, logLevel: 'error', server: { host: '127.0.0.1', port: 0 },
  plugins: [{ name: 'prazos-fixture', enforce: 'pre', resolveId(id) {
    if (id === '/fixture.jsx') return virtual;
    if (id.endsWith('contexts/AuthContext') || id.endsWith('contexts/AuthContext.jsx')) return '\0prazos-auth';
  }, async load(id) {
    if (id === virtual) return (await transformWithEsbuild(entry, 'fixture.jsx', { loader: 'jsx', jsx: 'automatic' })).code;
    if (id === '\0prazos-auth') return `import React from 'react';export const AuthContext=React.createContext({});export function useAuth(){return {user:window.actor}};`;
  }, configureServer(s) { s.middlewares.use(async (req, res, next) => {
    if (req.url === '/fixture') { res.setHeader('Content-Type', 'text/html'); res.end(await s.transformIndexHtml('/fixture', '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0"><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>')); } else next();
  }); } }, react()], optimizeDeps: { include: ['react', 'react-dom/client', 'react-router-dom'] } });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } }), erros = [], envios = [];
  const origem = `http://127.0.0.1:${server.httpServer.address().port}`;
  let regra = structuredClone(PADRAO), modoEstado = 'normal', liberarErro = false;
  page.on('pageerror', (e) => { erros.push(e.message); console.error(e.message); });
  page.on('dialog', (dialog) => dialog.accept());
  await page.route('**/*', async (route) => {
    const request = route.request(), url = new URL(request.url());
    const endpoint = url.pathname.includes('/auth/prazos-operacionais') ? 'estado'
      : url.pathname.includes('/configuracoes/prazos-operacionais/liberacoes') ? 'liberar'
      : url.pathname.includes('/configuracoes/prazos-operacionais') ? 'config' : null;
    if (!endpoint && url.pathname.startsWith('/api/')) {
      const prazo = await page.evaluate(() => window.prazo);
      const data = url.pathname === '/api/solicitacoes' ? { items: [{ id: 7, codigo: 'SOL-TESTE',
        descricao: 'Acompanhamento de entrega', status_global: 'PENDENTE', area_responsavel: 'GEO',
        obra: { id: 3, nome: 'Obra teste' }, valor: 100, prazo_operacional: prazo }], meta: { total: 1 } } : [];
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    }
    if (!endpoint) return route.continue();
    const headers = { 'Access-Control-Allow-Origin': origem, 'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    let data = {}, status = 200;
    if (endpoint === 'estado') {
      const agora = Date.now() + (modoEstado === 'vencido' ? 10800000 : 0);
      data = { ativo: modoEstado !== 'normal', modo: 'BLOQUEAR', servidor_agora: new Date(agora).toISOString(), obras: modoEstado === 'normal' ? [] : [{ id: 3, nome: 'Obra teste', quantidade: 2, vencidas: 2, bloqueada: true,
        limite_em: new Date(Date.now() - 1000).toISOString(), aviso_ms: 3600000,
        pendencias: [{ solicitacao_id: 7, codigo: 'SOL-TESTE', pedido_id: 8 }] }] };
    } else if (endpoint === 'config') {
      if (request.method() === 'PATCH') {
        assert.match(request.headers()['content-type'], /application\/json/);
        envios.push(request.postDataJSON()); regra = { ...request.postDataJSON(), revisao: regra.revisao + 1 };
      }
      data = { regra, futuras: FUTURAS };
    } else {
      assert.match(request.headers()['content-type'], /application\/json/);
      envios.push(request.postDataJSON());
      if (liberarErro) { status = 503; data = { error: 'Falha simulada de rede' }; } else data = { liberacao: { id: 1 } };
    }
    await route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto(`${origem}/fixture`);
  await page.getByLabel('Cobrança ativa').waitFor();
  assert.equal(await page.getByLabel('Cobrança ativa').isChecked(), false);
  assert.equal(await page.getByLabel('Modo').inputValue(), 'OBSERVAR');
  assert.equal(await page.getByText('Próximas etapas — ainda desativadas').count(), 1);
  await page.getByLabel('Cobrança ativa').check();
  await page.getByLabel('Início da cobrança').fill('2026-10-06');
  await page.getByLabel('Modo').selectOption('BLOQUEAR');
  await page.getByLabel('Unidade', { exact: true }).selectOption('HORAS');
  await page.getByLabel('Calendário', { exact: true }).selectOption('UTEIS');
  await page.getByLabel('Prazo para informar').fill('3');
  await page.getByLabel('Tolerância após o prazo').fill('1');
  await page.getByLabel('Fim do expediente').waitFor();
  await page.getByRole('button', { name: 'Salvar regra', exact: true }).click();
  await page.getByText(/Regra salva/).waitFor();
  assert.equal(envios.length, 1); assert.equal(envios[0].prazo, 3); assert.equal(envios[0].tolerancia, 1);
  assert.equal(envios[0].modo, 'BLOQUEAR');
  const folder = path.join(root, '../outputs/prazos-operacionais-qa'); fs.mkdirSync(folder, { recursive: true });
  for (const width of [1366, 768, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    const medidas = await page.evaluate(() => ({ largura: innerWidth, corpo: document.documentElement.scrollWidth }));
    assert.ok(medidas.corpo <= medidas.largura + 1, `Overflow ${width}: ${JSON.stringify(medidas)}`);
    await page.screenshot({ path: path.join(folder, `config-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.screenshot({ path: path.join(folder, 'config-escuro.png'), fullPage: true });
  await page.getByText('Liberação temporária e auditada de uma obra', { exact: true }).click();
  await page.getByLabel('ID da obra').fill('3');
  await page.getByLabel('Liberar até (horário deste dispositivo)').fill('2026-10-07T15:00');
  await page.getByLabel('Motivo', { exact: true }).fill('Exceção autorizada');
  liberarErro = true;
  await page.getByRole('button', { name: 'Registrar liberação', exact: true }).click();
  await page.getByText('Falha simulada de rede', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Registrar liberação', exact: true }).click();
  assert.equal(envios.at(-1).idempotency_key, envios.at(-2).idempotency_key, 'Retry conserva chave');
  await page.getByRole('button', { name: 'Trocar tela de teste' }).click();
  await page.getByText(/Entrega em 2h/).waitFor();
  modoEstado = 'vencido';
  await page.evaluate(() => window.dispatchEvent(new Event('fluxy:prazos-operacionais')));
  await page.getByText(/operações bloqueadas por entrega não informada/).waitFor();
  await page.getByText(/Entrega vencida há/).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Informar entrega em SOL-TESTE' }).getAttribute('href'), '/solicitacoes/7');
  assert.equal(await page.getByRole('button', { name: 'Consulta permanece disponível' }).isEnabled(), true);
  await page.screenshot({ path: path.join(folder, 'contador-bloqueio-escuro.png'), fullPage: true });
  await page.getByRole('button', { name: 'Ver lista real', exact: true }).click();
  await page.getByText('SOL-TESTE', { exact: true }).first().waitFor();
  await page.getByText(/Entrega vencida há/).first().waitFor();
  await page.screenshot({ path: path.join(folder, 'lista-real-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 375, height: 900 });
  await page.getByText(/Entrega vencida há/).first().waitFor();
  await page.screenshot({ path: path.join(folder, 'lista-real-mobile.png'), fullPage: true });
  assert.deepEqual(erros, []);
  console.log('OK: página e contador reais, transporte JSON, configuração off, horas úteis, ativação, liberação/retry, relógio do servidor, aviso/consulta/regularização, 375/768/1366px e tema escuro. APIs simuladas, sem dados reais.');
} finally { await browser.close(); await server.close(); }
