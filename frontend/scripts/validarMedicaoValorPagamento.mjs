// UI de producao e transporte reais. API isolada em memoria; sem banco/EC2.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import tailwindConfig from '../tailwind.config.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputs = path.resolve(root, '../outputs/medicao-valor-pagamento'); fs.mkdirSync(outputs, { recursive: true });
const parcela = { id: 101, numero: 1, valor: 10000, situacao: 'ABERTO', titulo_financeiro_id: 1,
  titulo_valor_original: 10000, medicao: { id: 9, numero: 1, aprovada_em: '2026-10-01', valor_total: 10000 },
  titulo_pagamento: { id: 1, tipo: 'PAGAR', status: 'ABERTO', valor_saldo: 10000 }, vencimento: '2026-10-30' };
const fixture = `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';
import ModalMedicao from '/src/pages/SolicitacaoDetalhe/ModalMedicao.jsx';
import PrevisoesContrato from '/src/pages/SolicitacaoDetalhe/PrevisoesContrato.jsx';
import MedicaoValorPagamento from '/src/components/contratos/MedicaoValorPagamento.jsx';
import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/componentes-padrao.css';
function App(){const[id,setId]=useState(9),[rev,setRev]=useState(0);window.trocar=id=>setId(id);window.recarregou=0;
const mudar=()=>{window.recarregou++;setRev(v=>v+1);};return <MemoryRouter><main className="p-3">
{location.search.includes('modal')?<ModalMedicao contratoId={4} medicao={{...${JSON.stringify(parcela.medicao)},id}}
parcelas={[${JSON.stringify(parcela)}]} solicitacaoId={42} consultarValorPagamento onSalvo={mudar} onFechar={()=>{}} />:
<><PrevisoesContrato contratoId={4} solicitacaoId={42} atualizarEm={rev}/><MedicaoValorPagamento key={id} contratoId={4} medicaoId={id} onMudou={mudar}/></>}
</main></MemoryRouter>;}createRoot(document.getElementById('root')).render(<App/>);`;
const server = await createServer({ root, configFile: false, logLevel: 'error', css: { postcss: { plugins: [tailwindcss(tailwindConfig), autoprefixer()] } },
  server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'medicao-pagamento-qa', enforce: 'pre',
    resolveId(id) { if (id === '/fixture.jsx') return '\0medicao-pagamento-qa.jsx'; },
    async load(id) { if (id === '\0medicao-pagamento-qa.jsx') return transformWithEsbuild(fixture, 'fixture.jsx', { loader: 'jsx', jsx: 'transform' }); },
    transform(code, id) {
      if (id.endsWith('/src/services/api.js')) return `export const API_URL='https://fixture.invalid/api';export const API_ORIGIN='https://fixture.invalid';
        export const authHeaders=(extra={})=>({'X-QA':'1',...extra});export const fileUrl=p=>p;export const getAuthToken=()=>null;
        export const getAuditSessionId=()=>null;export const installFetchSecurityDefaults=()=>{};export const setAuthToken=()=>{};export const clearAuthToken=()=>{};`;
      if (id.endsWith('/src/contexts/AuthContext.jsx')) return 'export const useAuth=()=>({user:{id:5}});';
    }, configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
      if (new URL(req.url, 'http://localhost').pathname !== '/fixture') return next();
      res.setHeader('Content-Type', 'text/html');res.end(await vite.transformIndexHtml('/fixture', '<html lang="pt-BR"><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
    }); }
  }, react()], optimizeDeps: { include: ['react', 'react-dom/client', 'react-router-dom'] } });
let browser;
try {
  await server.listen(); browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage(), errors = [], unexpected = [], posts = [];
  let dados, negar = false, fatura = false;
  function reset() { dados = { contrato_id: 4, medicao_id: 9, valor_medido: 10000, aprovada: true, pode_ajustar: true,
    titulos: [{ id: 1, codigo: 'TIT-1', status: 'ABERTO', valor: 10000, saldo: 10000, baixado: 0, revisao: 0, abatimento: 0 }], historico: [] }; negar = fatura = false; }
  reset();page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.pathname.match(/\/contratos\/4\/medicoes\/\d+\/pagamento$/)) {
      if (req.method() === 'GET') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...dados,
        ...(page.url().includes('readonly') ? { pode_ajustar: false } : {}),
        titulos: dados.titulos.map(t => ({ ...t, ...(fatura ? { fatura_cartao_id: 88 } : {}) })) }) });
      assert.equal(req.method(), 'POST');assert.equal(req.headers()['x-qa'], '1'); const b = req.postDataJSON(); posts.push(b);
      if (negar) return route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"Sem permissão QA"}' });
      const t = dados.titulos.find(t => t.id === b.titulo_id); const antes = t.valor;
      if (b.acao === 'REDUZIR') {
        const diferenca = t.valor - Number(b.valor_autorizado);t.valor = Number(b.valor_autorizado);t.saldo = t.valor;t.revisao++;
        if (b.destino === 'FUTURO') dados.titulos.push({ id: 2, codigo: 'TIT-2', origem_id: 1, status: 'PREVISAO', valor: diferenca,
          saldo: diferenca, baixado: 0, revisao: 1, abatimento: 0, pendente: true });
        else t.abatimento += diferenca;
      } else { t.status = 'ABERTO';t.pendente = false;t.revisao++; }
      dados.historico.push({ id: dados.historico.length + 1, titulo_id: t.id, usuario_id: 5, data: '2026-10-16T12:00:00Z',
        acao: b.acao, motivo: b.motivo, antes: { valor: antes }, depois: { valor: t.valor, destino: b.destino } });
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ titulo_id: t.id, novo_envio_obrigatorio: true }) });
    }
    if (url.pathname.endsWith('/contratos/4/parcelas')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      contrato: { id: 4, codigo: 'CT-4', fluxo_novo: true, solicitacao_id: 42 }, totais: { valor_contrato: 10000 },
      parcelas: [{ ...parcela, titulo_valor_original: dados.titulos[0].valor, medicao_pagamento_resumo: {
        valor_titulos: dados.titulos.filter(t => !t.pendente).reduce((s, t) => s + t.valor, 0),
        valor_pendente: dados.titulos.filter(t => t.pendente).reduce((s, t) => s + t.valor, 0),
        abatimento: dados.titulos.reduce((s, t) => s + t.abatimento, 0) } }] }) });
    unexpected.push(req.url()); return route.abort();
  });
  const base = `http://127.0.0.1:${server.httpServer.address().port}/fixture`;
  const bloco = () => page.getByRole('region', { name: 'Valor medido e pagamento autorizado', exact: true });
  async function preencher(destino) {
    await bloco().getByRole('button', { name: 'Ajustar valor para pagamento · TIT-1', exact: true }).click();
    await bloco().getByLabel('Valor autorizado *', { exact: true }).fill('8000.00');
    await bloco().getByRole('combobox', { name: /^Destino da diferença/ }).selectOption(destino);
    await bloco().getByLabel('Motivo *', { exact: true }).fill('Autorizado em reunião, com registro do destino.');
  }
  async function confirmar() {
    await bloco().getByRole('button', { name: 'Conferir ajuste', exact: true }).click();
    await page.getByRole('dialog').filter({ hasText: 'Ajustar valor para pagamento' }).getByRole('button', { name: 'Confirmar ajuste', exact: true }).click();
    await bloco().getByRole('status').filter({ hasText: 'Ajuste salvo' }).waitFor();
    await bloco().getByText('TIT-1 · R$ 8.000,00 · ABERTO', { exact: true }).waitFor();
  }
  for (const width of [1366, 390]) {
    reset(); await page.setViewportSize({ width, height: 900 }); await page.goto(base);
    await preencher('FUTURO'); const antes = posts.length;
    await page.screenshot({ path: path.join(outputs, `formulario-${width}.png`), fullPage: true });
    await bloco().getByRole('button', { name: 'Conferir ajuste', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Voltar', exact: true }).click();assert.equal(posts.length, antes);
    await bloco().getByRole('button', { name: 'Conferir ajuste', exact: true }).evaluate(el => { el.click();el.click(); });
    assert.equal(await page.getByRole('dialog').count(), 1);
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmar ajuste', exact: true }).evaluate(el => { el.click();el.click(); });
    await bloco().getByRole('button', { name: 'Liberar diferença futura · TIT-2', exact: true }).waitFor();
    assert.equal(posts.length, antes + 1);assert.equal(posts.at(-1).destino, 'FUTURO');assert.equal(posts.at(-1).valor_anterior, '10000.00');
    assert.equal(dados.valor_medido, 10000);assert.equal(dados.titulos[0].valor, 8000);
    await page.getByTestId('previsoes-contrato').getByText('futuro R$ 2.000,00', { exact: true }).waitFor();
    assert.equal(await bloco().getByRole('heading', { name: 'Valor medido × valor para pagamento' }).count(), 1);
    await page.screenshot({ path: path.join(outputs, `futuro-${width}.png`), fullPage: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Layout cabe sem rolagem horizontal da pagina');
    Object.assign(dados.titulos[0], { status: 'QUITADO', baixado: 8000, saldo: 0 }); await page.reload();
    await bloco().getByRole('button', { name: 'Liberar diferença futura · TIT-2', exact: true }).click();
    assert.equal(await bloco().getByRole('button', { name: 'Ajustar valor para pagamento · TIT-1', exact: true }).count(), 0);
    await bloco().getByLabel('Motivo *', { exact: true }).fill('Autorização posterior da diferença.');
    await bloco().getByRole('button', { name: 'Conferir ajuste', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmar ajuste', exact: true }).click();
    await bloco().getByText('TIT-2 · R$ 2.000,00 · ABERTO', { exact: true }).waitFor();
    assert.equal(posts.at(-1).acao, 'LIBERAR_PENDENTE');assert(!posts.at(-1).destino);assert.equal(dados.titulos[0].baixado, 8000);
    reset();await page.goto(base);await preencher('DEFINITIVO');await confirmar();
    await page.getByTestId('previsoes-contrato').getByText('abatimento R$ 2.000,00', { exact: true }).waitFor();
    assert.equal(dados.titulos.length, 1);assert.equal(dados.valor_medido, 10000);
    await page.screenshot({ path: path.join(outputs, `definitivo-${width}.png`), fullPage: true });
  }
  reset();await page.goto(base + '?readonly');await bloco().getByText('TIT-1 · R$ 10.000,00 · ABERTO', { exact: true }).waitFor();
  assert.equal(await bloco().getByRole('button', { name: /Ajustar valor para pagamento/ }).count(), 0);
  reset();fatura = true;await page.goto(base);await preencher('DEFINITIVO');
  await bloco().getByRole('button', { name: 'Conferir ajuste', exact: true }).click();assert.equal(await page.getByRole('dialog').count(), 0, 'Sem consentimento de fatura nao envia');
  await bloco().getByRole('checkbox').check();await confirmar();assert.equal(posts.at(-1).desvincular_fatura, true);
  reset();await page.goto(base);await preencher('FUTURO');negar = true;
  await bloco().getByRole('button', { name: 'Conferir ajuste', exact: true }).click();await page.getByRole('dialog').getByRole('button', { name: 'Confirmar ajuste', exact: true }).click();
  await bloco().getByRole('alert').filter({ hasText: 'Sem permissão QA' }).waitFor();assert.equal(dados.titulos[0].valor, 10000);
  const chaveFalha = posts.at(-1).idempotency_key;negar = false;await confirmar();assert.equal(posts.at(-1).idempotency_key, chaveFalha);
  // Trocar o registro com a confirmacao aberta nao pode enviar o alvo antigo.
  reset();await page.goto(base);await preencher('DEFINITIVO');const antesTroca = posts.length;
  await bloco().getByRole('button', { name: 'Conferir ajuste', exact: true }).click();
  await page.getByRole('dialog').waitFor();await page.evaluate(() => window.trocar(10));
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await bloco().getByText('TIT-1 · R$ 10.000,00 · ABERTO', { exact: true }).waitFor();
  assert.equal(posts.length, antesTroca, 'Confirmacao obsoleta nao escreve');
  // Integracao no modal original, sem oferecer edicao da medicao aprovada.
  reset();await page.goto(base + '?modal');await bloco().getByText('TIT-1 · R$ 10.000,00 · ABERTO', { exact: true }).waitFor();
  assert.equal(await page.locator('[data-testid="salvar-medicao"]').count(), 0);
  await preencher('DEFINITIVO');await page.screenshot({ path: path.join(outputs, 'modal-original.png'), fullPage: true });await confirmar();
  assert.deepEqual(errors, []);assert.deepEqual(unexpected, []);
  console.log('OK: modal/financeiro reais desktop/mobile, medido/titulo/pendente/abatimento, dois destinos, cancelar/mutex, pago protegido, liberacao futura, fatura explicita, ACL/403/retry e chave estavel. Rede isolada.');
} finally { if (browser) await browser.close(); await server.close(); }
