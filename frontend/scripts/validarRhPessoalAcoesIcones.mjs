import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

// Pagina real, callbacks simulados: sem login, API externa ou escrita no banco.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '../outputs/rh-pessoal-acoes-icones');
fs.mkdirSync(output, { recursive: true });
const solicitacoes = [
  { id: 1, tipo: 'MOVIMENTACAO', situacao: 'ABERTA' },
  { id: 2, tipo: 'JORNADA', situacao: 'ABERTA' },
  { id: 3, tipo: 'ADMISSAO', situacao: 'RASCUNHO' },
  { id: 4, tipo: 'ADMISSAO', situacao: 'REJEITADA' },
  { id: 5, tipo: 'ALTERACAO_SALARIAL', situacao: 'ABERTA' },
  { id: 6, tipo: 'MOVIMENTACAO', subtipo: 'RETORNO_AFASTAMENTO', situacao: 'ABERTA' },
  { id: 7, tipo: 'EVENTO_RECORRENTE', situacao: 'ABERTA' },
  { id: 8, tipo: 'JORNADA', situacao: 'APROVADA' },
  { id: 9, tipo: 'ADMISSAO', situacao: 'CANCELADA' }
].map(s => ({ ...s, codigo: `RH-${s.id}`, criada_por: 2, dados_json: {},
  colaborador: { nome: `Colaborador Teste ${s.id}` }, obra: { nome: 'Obra de teste' },
  atividade_em: '2026-10-06T14:00:00', nao_lida: s.id === 1 }));
const modules = {
  auth: `export const useAuth = () => ({ user: { id: 2, perfil: 'USUARIO' } });`,
  rhDp: `export * from '/src/services/rhDp.js';
    const db = ${JSON.stringify(solicitacoes)}; window.calls = [];
    const clone = v => JSON.parse(JSON.stringify(v));
    const chamada = (acao, id, motivo) => { window.calls.push({ acao, id, motivo }); return {}; };
    export const listarRhSolicitacoes = async () => clone(db);
    export const getRhSolicitacao = async id => ({ ...clone(db.find(s => s.id === id)), historicos: [] });
    export const listarAnexosRhSolicitacao = async () => [];
    export const conferirDocumentacaoRhSolicitacao = async () => ({ faltando: [], anexosAguardando: 0 });
    export const getRhChecklistDoTipo = async () => ({ itens: [] });
    export const aprovarRhSolicitacao = async id => chamada('aprovar', id);
    export const rejeitarRhSolicitacao = async (id, motivo) => chamada('devolver', id, motivo);
    export const enviarRhSolicitacao = async id => chamada('enviar', id);
    export const reenviarRhSolicitacao = async id => chamada('reenviar', id);
    export const cancelarRhSolicitacao = async (id, motivo) => chamada('cancelar', id, motivo);
    export const solicitarRetornoRhSolicitacao = async (id, motivo) => chamada('retorno', id, motivo);
  `
};
const fixture = `import React from 'react'; import { createRoot } from 'react-dom/client';
  import { MemoryRouter } from 'react-router-dom';
  import RhDpPessoalSolicitacoes from '/src/pages/RhDpPessoalSolicitacoes.jsx';
  import '/src/index.css'; import '/src/styles/design-tokens.css'; import '/src/styles/escala.css';
  import '/src/styles/componentes-padrao.css'; import '/src/styles/responsive-system.css';
  const perfil = new URLSearchParams(location.search).get('perfil') || 'completo';
  createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter, null,
    React.createElement('div', { className: 'layout-shell' }, React.createElement('main', { className: 'layout-main' },
      React.createElement('div', { className: 'rhdp-page rh-pessoal-page' },
        React.createElement('h1', null, 'Pessoal · Solicitações'),
        React.createElement(RhDpPessoalSolicitacoes, {
          podeAbrir: ['completo', 'obra'].includes(perfil), podeDecidir: ['completo', 'dp'].includes(perfil),
          podeDecidirEventoRecorrente: perfil === 'completo', podeAprovarSalario: perfil === 'completo',
          onAbrirApuracao: perfil !== 'consulta' ? s => window.calls.push({ acao: 'jornada', id: s.id }) : undefined
        }))))));`;
const server = await createServer({ root, configFile: false, logLevel: 'error', server: { host: '127.0.0.1', port: 0 },
  plugins: [{ name: 'rh-pessoal-acoes-fixture', enforce: 'pre', resolveId(id) {
    if (id === '/fixture.jsx') return '\0rh-acoes-fixture';
    if (/(^|\/)AuthContext(?:\.jsx)?$/.test(id)) return '\0rh-acoes:auth';
    if (/services\/rhDp$/.test(id)) return '\0rh-acoes:rhDp';
  }, load(id) {
    if (id === '\0rh-acoes-fixture') return fixture;
    if (id.startsWith('\0rh-acoes:')) return modules[id.slice(10)];
  }, configureServer(vite) {
    vite.middlewares.use(async (req, res, next) => {
      if (new URL(req.url || '/', 'http://localhost').pathname !== '/fixture') return next();
      res.setHeader('Content-Type', 'text/html');
      res.end(await vite.transformIndexHtml('/fixture', '<html lang="pt-BR"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
    });
  } }, react()], optimizeDeps: { include: ['react', 'react-dom/client', 'react-router-dom', 'react-icons/hi2'] }
});
let browser;
const errors = [], externos = [];
const nome = (rotulo, id) => `${rotulo}: solicitação #${id}`;
function contraste(cor, fundo) {
  const luminancia = rgb => rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map(n => {
    const v = n / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }).reduce((soma, valor, i) => soma + valor * [0.2126, 0.7152, 0.0722][i], 0);
  const [maior, menor] = [luminancia(cor), luminancia(fundo)].sort((a, b) => b - a);
  return (maior + 0.05) / (menor + 0.05);
}
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const url = `http://127.0.0.1:${server.httpServer.address().port}/fixture`;
  async function pagina(perfil = 'completo', width = 1366) {
    const page = await browser.newPage({ viewport: { width, height: 850 } });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    page.setDefaultTimeout(10000);
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => {
      if (route.request().url().startsWith('http://127.0.0.1:')) return route.continue();
      externos.push(route.request().url()); return route.abort();
    });
    await page.goto(`${url}?perfil=${perfil}`);
    await page.getByRole('button', { name: nome('Abrir', 1), exact: true }).waitFor();
    return page;
  }
  async function clicar(page, rotulo, id) {
    await page.getByRole('button', { name: nome(rotulo, id), exact: true }).click();
  }
  async function chamada(page, acao, id) {
    await page.waitForFunction(({ acao, id }) => window.calls.some(c => c.acao === acao && c.id === id), { acao, id });
    assert.equal(await page.evaluate(({ acao, id }) => window.calls.filter(c => c.acao === acao && c.id === id).length, { acao, id }), 1);
  }

  const page = await pagina();
  const botoes = page.locator('.rh-solicitacoes-acoes button');
  assert.ok(await botoes.count() > 8);
  for (const button of await botoes.all()) {
    assert.equal((await button.innerText()).trim(), '', 'Acao da linha exibe somente icone');
    assert.equal(await button.locator('svg[aria-hidden="true"]').count(), 1);
    assert.ok(await button.getAttribute('title'));
    assert.ok(await button.getAttribute('aria-label'));
  }
  await clicar(page, 'Conferir jornada', 2); await chamada(page, 'jornada', 2);
  await clicar(page, 'Conferir jornada', 8); await chamada(page, 'jornada', 8);
  await clicar(page, 'Abrir', 1);
  await page.getByRole('dialog').waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'Fechar', exact: true }).click();
  await clicar(page, 'Aprovar', 1); await chamada(page, 'aprovar', 1);
  await clicar(page, 'Registrar ciência', 6); await chamada(page, 'aprovar', 6);
  await clicar(page, 'Enviar', 3); await chamada(page, 'enviar', 3);
  await clicar(page, 'Reenviar', 4); await chamada(page, 'reenviar', 4);

  await clicar(page, 'Devolver', 1);
  let dialog = page.getByRole('dialog');
  assert.ok(await dialog.getByRole('button', { name: 'Devolver', exact: true }).isDisabled());
  await dialog.getByRole('button', { name: 'Voltar', exact: true }).click();
  assert.equal(await page.evaluate(() => window.calls.filter(c => c.acao === 'devolver').length), 0);
  await clicar(page, 'Devolver', 1);
  dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Motivo', exact: true }).fill('Corrigir os dados');
  await dialog.getByRole('button', { name: 'Devolver', exact: true }).click();
  await chamada(page, 'devolver', 1);

  await clicar(page, 'Solicitar retorno', 1);
  dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Motivo', exact: true }).fill('Revisar a solicitação');
  await dialog.getByRole('button', { name: 'Enviar pedido de retorno', exact: true }).click();
  await chamada(page, 'retorno', 1);
  await clicar(page, 'Cancelar', 1);
  await page.getByRole('dialog').getByRole('button', { name: 'Manter solicitacao', exact: true }).click();
  assert.equal(await page.evaluate(() => window.calls.filter(c => c.acao === 'cancelar').length), 0);
  await clicar(page, 'Cancelar', 1);
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar solicitacao', exact: true }).click();
  await chamada(page, 'cancelar', 1);
  await page.close();

  for (const perfil of ['consulta', 'obra', 'dp']) {
    const page = await pagina(perfil);
    const count = async (rotulo, id) => page.getByRole('button', { name: nome(rotulo, id), exact: true }).count();
    assert.equal(await count('Aprovar', 1), perfil === 'dp' ? 1 : 0);
    assert.equal(await count('Cancelar', 1), perfil === 'obra' ? 1 : 0);
    assert.equal(await count('Enviar', 3), perfil === 'obra' ? 1 : 0);
    assert.equal(await count('Solicitar retorno', 1), perfil === 'obra' ? 1 : 0);
    assert.equal(await count('Conferir jornada', 2), perfil === 'consulta' ? 0 : 1);
    assert.equal(await count('Aprovar', 2), 0, 'Jornada nao recebe aprovacao generica');
    assert.equal(await count('Aprovar', 5), 0, 'Alteracao salarial depende de permissao propria');
    assert.equal(await count('Aprovar', 7), 0, 'Evento recorrente depende de permissao propria');
    assert.equal(await count('Cancelar', 9), 0, 'Estado encerrado nao concede cancelar');
    await page.close();
  }
  for (const width of [1366, 390]) {
    const page = await pagina('completo', width);
    for (const tema of ['claro', 'escuro']) {
      await page.evaluate(escuro => document.documentElement.classList.toggle('dark', escuro), tema === 'escuro');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Sem overflow da pagina');
      for (const button of await page.locator('.rh-solicitacoes-acoes button').all()) {
        const box = await button.boundingBox();
        assert.ok(box.width >= (width < 640 ? 44 : 34) - 1 && box.height >= (width < 640 ? 44 : 34) - 1, 'Alvo de clique preservado');
      }
      for (const button of await page.locator('.rh-solicitacoes-acoes .btn-primary').all()) {
        const cores = await button.evaluate(button => ({ cor: getComputedStyle(button.querySelector('svg')).color, fundo: getComputedStyle(button).backgroundColor }));
        assert.ok(contraste(cores.cor, cores.fundo) >= 3, `Icone legivel ${tema}/${width}: ${JSON.stringify(cores)}`);
      }
      await page.getByRole('button', { name: nome('Abrir', 1), exact: true }).focus();
      await page.keyboard.press('Tab');
      assert.ok(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle !== 'none'), 'Foco por teclado visivel');
      const grupos = await page.locator('.rh-solicitacoes-acoes').evaluateAll(grupos => grupos.map(grupo =>
        [...grupo.querySelectorAll('button')].map(button => { const b = button.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom }; })));
      for (const grupo of grupos) for (let i = 1; i < grupo.length; i++) {
        assert.ok(grupo[i].left >= grupo[i - 1].right - 1 || grupo[i].top >= grupo[i - 1].bottom - 1, 'Icones nao se sobrepoem');
      }
      await page.screenshot({ path: path.join(output, `solicitacoes-${width}-${tema}.png`), fullPage: true, animations: 'disabled' });
    }
    await page.close();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(externos, [], 'Nenhuma chamada externa ou de producao');
  console.log('Acoes de Pessoal validadas: icones, nomes acessiveis, callbacks, confirmacoes, permissoes, estados, temas e mobile. Somente fixtures locais.');
} finally { await browser?.close(); await server.close(); }
