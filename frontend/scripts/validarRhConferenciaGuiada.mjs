import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
import { camposAlterados, progressoConferencia } from '../src/utils/rhApuracaoConferencia.js';

assert.deepEqual(camposAlterados({ ajuste_credito_manual: 0, observacoes: 'a' }, { ajuste_credito_manual: '0', observacoes: '' }), { observacoes: '' });
assert.equal(progressoConferencia([{ id: 1, status: 'CONFERIDO' }], { 1: { status: 'CONFERIDO' } }, { 1: 'salvando' }).pronto, false);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '../outputs/rh-conferencia');
fs.mkdirSync(output, { recursive: true });
const seed = { id: 12, competencia: '2026-10', etapa_pagamento: 'DIARIA', obra_id: 7, empresa_grupo_id: 3,
  obra: { id: 7, nome: 'Obra de teste' }, empresaGrupo: { nome: 'Empresa de teste' }, dias_base: 30,
  status: 'RASCUNHO', total_colaboradores: 2, total_bruto: 2000, total_descontos: 0, total_liquido: 2000,
  itens: ['Ana Teste', 'Beatriz Teste'].map((nome, i) => ({ id: i + 1, status: 'PENDENTE',
    valor_bruto: 1000, valor_descontos: 0, valor_liquido: 1000, dias_trabalhados: 10, ajuste_credito_manual: 0, ajuste_debito_manual: 0,
    observacoes: '', revisao_conferencia: `rev${i}`, detalhes_json: { importacao_ids: [19], forma_calculo_gerencial: 'DIARIA' },
    colaborador: { nome, tipo_vinculo: 'CLT', forma_calculo_gerencial: 'DIARIA', pagamento: { chave_pix: 'pix-teste' } } })) };
const modules = {
  auth: `const perfil = new URLSearchParams(location.search).get('perfil') || 'completo';
    const user = { id: 2, perfil: 'USUARIO', setor: 'DEPARTAMENTO_PESSOAL', areas_permissoes_configuradas: true,
      areas_permissoes: ['rh_dp.apuracao.visualizar', ...(perfil !== 'consulta' ? ['rh_dp.apuracao.editar'] : []), ...(perfil === 'completo' ? ['rh_dp.fechamento.executar', 'rh_dp.obrigacoes.visualizar'] : [])] };
    export const useAuth = () => ({ user });`,
  obras: `export const getObras = async () => [{ id: 7, nome: 'Obra de teste' }];`,
  configuracoesSistema: `export * from '/src/services/configuracoesSistema.js'; export const getTemaSistema = async () => null; export const salvarTemaSistema = async () => null;`,
  rhDp: `export * from '/src/services/rhDp.js'; const seed = ${JSON.stringify(seed)};
    window.calls = []; window.failNext = false; window.delay = 120;
    const clone = v => JSON.parse(JSON.stringify(v));
    let db = JSON.parse(localStorage.getItem('qa-rh-apuracao') || 'null') || clone(seed);
    let preparada = !new URLSearchParams(location.search).has('novo') || localStorage.getItem('qa-rh-preparada') === '1';
    const gravar = () => localStorage.setItem('qa-rh-apuracao', JSON.stringify(db));
    export const getRhApuracao = async () => clone(db);
    export const getRhApuracoes = async () => preparada ? [clone(db)] : [];
    export const getRhEmpresasGrupo = async () => [{ id: 3, nome: 'Empresa de teste' }];
    export const getRhJornadasMultiobra = async () => ({ resumo: {}, colaboradores: [] });
    export const abrirConferenciaRhJornada = async (id, preparar) => {
      if(preparar) { window.calls.push('preparar'); preparada = true; localStorage.setItem('qa-rh-preparada', '1'); }
      return { solicitacao_id: id, recorte: { competencia: db.competencia, obra_id: 7, empresa_grupo_id: 3, etapa_pagamento: 'DIARIA' }, apuracoes: preparada ? [clone(db)] : [] };
    };
    export const atualizarRhApuracaoItem = async (id, itemId, payload) => {
      window.calls.push({ id, itemId, payload });
      await new Promise(ok => setTimeout(ok, window.delay));
      if(window.failNext) { window.failNext = false; throw new Error('Falha de rede simulada'); }
      const item = db.itens.find(i => i.id === itemId);
      if(payload.revisao_conferencia !== item.revisao_conferencia) throw new Error('Conflito simulado. Recarregue a apuracao.');
      const ajuste = Object.keys(payload).some(k => !['status', 'revisao_conferencia'].includes(k));
      Object.assign(item, payload, { status: ajuste ? 'PENDENTE' : payload.status || item.status, revisao_conferencia: String(Date.now()) + itemId });
      if(window.alterarBeatriz && itemId === 1) {
        window.alterarBeatriz = false;
        db.itens[1].observacoes = 'Outra sessao'; db.itens[1].revisao_conferencia = 'rev-outra-sessao';
      }
      item.valor_liquido = 1000 + Number(item.ajuste_credito_manual) - Number(item.ajuste_debito_manual);
      db.total_liquido = db.itens.reduce((total, i) => total + i.valor_liquido, 0);
      gravar(); return clone(db);
    };
    export const conferirRhApuracao = async () => {
      window.calls.push('conferir');
      if(db.itens.some(i => i.status !== 'CONFERIDO')) throw new Error('Itens pendentes');
      db.status = 'CONFERIDA'; gravar(); return clone(db);
    };
    export const fecharRhApuracao = async (id, payload) => {
      window.calls.push('fechar'); await new Promise(ok => setTimeout(ok, 350));
      if(db.fechamentoRh) throw new Error('Ja fechada');
      const fechamento = { id: 77, status: 'FECHADO', ...payload, total_titulos: 2, total_valor: db.total_liquido,
        titulos: db.itens.map(i => ({ id: i.id, tipo_titulo: 'SALARIO', titulo_financeiro_id: i.id + 700, valor_gerado: i.valor_liquido, tituloFinanceiro: { codigo: 'TIT-TESTE-' + i.id } })) };
      db.fechamentoRh = fechamento; gravar(); return clone(fechamento);
    };
    export const gerarRhApuracao = async () => clone(db);
    export const consolidarRhJornadasMultiobra = async () => clone(db);
    export const reabrirRhFechamento = async () => {};
  `
};
const fixture = `import React from 'react'; import { createRoot } from 'react-dom/client'; import { MemoryRouter } from 'react-router-dom';
  import RhDpApuracao from '/src/pages/RhDpApuracao.jsx'; import { ThemeProvider } from '/src/contexts/ThemeContext.jsx';
  import { Pagina, PageHeader } from '/src/components/padrao/index.js';
  import '/src/index.css'; import '/src/styles/design-tokens.css'; import '/src/styles/escala.css'; import '/src/styles/componentes-padrao.css'; import '/src/styles/responsive-system.css';
  createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider, null,
    React.createElement(MemoryRouter, { initialEntries: ['/rh-dp/pessoal?aba=apuracao&jornada_id=55'] },
      React.createElement('div', { className: 'layout-shell' }, React.createElement('div', { className: 'layout-content-shell' },
        React.createElement('div', { className: 'fx-topbar', style: { position: 'sticky', top: 0, minHeight: 96 } }, 'Fluxy · RH/DP'),
        React.createElement('main', { className: 'layout-main' }, React.createElement(Pagina, { className: 'rhdp-page rh-pessoal-page' },
          React.createElement(PageHeader, { titulo: 'Pessoal', descricao: 'Conferência e fechamento' }), React.createElement(RhDpApuracao))))))));`;
const server = await createServer({ root, configFile: false, logLevel: 'error', cacheDir: path.join(output, 'vite-cache'), server: { host: '127.0.0.1', port: 0 },
  plugins: [{ name: 'rh-conferencia-fixture', enforce: 'pre', resolveId(id) {
    if (id === '/fixture.jsx') return '\0fixture-rh';
    if (/(^|\/)AuthContext(?:\.jsx)?$/.test(id)) return '\0rh:auth';
    const service = id.match(/services\/(\w+)$/)?.[1];
    if (service !== 'auth' && modules[service]) return `\0rh:${service}`;
  }, load(id) {
    if (id === '\0fixture-rh') return fixture;
    if (id.startsWith('\0rh:')) return modules[id.slice(4)];
  }, configureServer(vite) {
    vite.middlewares.use(async (req, res, next) => {
      if (new URL(req.url || '/', 'http://localhost').pathname !== '/fixture') return next();
      res.setHeader('Content-Type', 'text/html');
      res.end(await vite.transformIndexHtml('/fixture', '<html lang="pt-BR"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
    });
  } }, react()], optimizeDeps: { include: ['react', 'react-dom/client', 'react-router-dom'] }
});
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const url = `http://127.0.0.1:${server.httpServer.address().port}/fixture`;
const errors = [];
async function pagina(query = '', width = 1366) {
  const page = await browser.newPage({ viewport: { width, height: 850 } });
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
  await page.goto(url + query, { waitUntil: 'domcontentloaded' });
  try { await page.getByRole('checkbox', { name: 'Conferido: Ana Teste' }).waitFor({ timeout: 30000 }); }
  catch (error) { console.error(errors, (await page.locator('body').innerText()).slice(0, 2500)); throw error; }
  return page;
}
async function salvo(page, id) {
  await page.waitForFunction(id => JSON.parse(localStorage.getItem('qa-rh-apuracao') || '{}').itens?.find(i => i.id === id)?.status === 'CONFERIDO', id);
  await page.waitForFunction(() => !document.querySelector('.rh-conferencia-toolbar')?.textContent.includes('Há ajustes'));
}
try {
  const page = await pagina();
  await page.getByRole('checkbox', { name: 'Conferido: Ana Teste' }).click();
  await salvo(page, 1);
  await page.reload();
  await page.getByRole('checkbox', { name: 'Conferido: Ana Teste' }).waitFor();
  assert.ok(await page.getByRole('checkbox', { name: 'Conferido: Ana Teste' }).isChecked(), 'Conferencia sobrevive ao reload');
  await page.getByRole('button', { name: /Ver detalhe de Detalhes e ajustes de Beatriz Teste/ }).click();
  await page.evaluate(() => { window.delay = 500; window.alterarBeatriz = true; });
  await page.getByRole('checkbox', { name: 'Conferido: Ana Teste' }).click();
  await page.evaluate(() => {
    const el = document.querySelector('[aria-label="Observações de Beatriz Teste"]');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, 'Rascunho preservado');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('qa-rh-apuracao')).itens[0].status === 'PENDENTE');
  assert.equal(await page.getByLabel('Observações de Beatriz Teste').inputValue(), 'Rascunho preservado', 'Salvar outra linha nao apaga o rascunho');
  await page.getByLabel('Observações de Beatriz Teste').focus();
  await page.getByLabel('Observações de Beatriz Teste').blur();
  await page.getByRole('button', { name: 'Tentar novamente' }).waitFor();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-rh-apuracao')).itens[1].observacoes), 'Outra sessao', 'Rascunho nao sobrescreve alteracao concorrente');
  await page.getByRole('button', { name: 'Recarregar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Recarregar', exact: true }).click();
  await page.getByText('Apuração recarregada com os dados salvos no sistema.', { exact: true }).waitFor();
  await page.getByLabel('Observações de Beatriz Teste').fill('Rascunho preservado');
  await page.getByLabel('Observações de Beatriz Teste').blur();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('qa-rh-apuracao')).itens[1].observacoes === 'Rascunho preservado');
  await page.evaluate(() => { window.delay = 120; window.failNext = true; });
  await page.getByRole('checkbox', { name: 'Conferido: Ana Teste' }).click();
  await page.getByRole('button', { name: 'Tentar novamente' }).waitFor();
  assert.ok(!(await page.getByRole('checkbox', { name: 'Conferido: Ana Teste' }).isChecked()), 'Erro nao finge conferencia gravada');
  assert.ok(await page.getByRole('button', { name: 'Revisar fechamento' }).isDisabled());
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await salvo(page, 1);
  await page.getByRole('checkbox', { name: 'Conferido: Beatriz Teste' }).click();
  await salvo(page, 2);
  await page.getByLabel('Observações de Beatriz Teste').fill('');
  await page.getByLabel('Observações de Beatriz Teste').blur();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('qa-rh-apuracao')).itens[1].status === 'PENDENTE');
  assert.ok(await page.getByRole('button', { name: 'Revisar fechamento' }).isDisabled(), 'Mudanca invalida a conferencia');
  await page.getByRole('checkbox', { name: 'Conferido: Beatriz Teste' }).click();
  await salvo(page, 2);
  await page.getByRole('button', { name: 'Revisar fechamento' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Concluir conferência', exact: true }).click();
  await page.getByRole('button', { name: 'Fechar e gerar títulos', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Fechar e gerar títulos', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
  assert.equal(await page.evaluate(() => window.calls.filter(c => c === 'fechar').length), 0);
  await page.getByRole('button', { name: 'Fechar e gerar títulos', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Fechar e gerar titulos', exact: true }).click();
  await page.getByText('3. Fechamento concluído', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.calls.filter(c => c === 'fechar').length), 1);
  assert.equal(await page.getByText('TIT-TESTE-1', { exact: true }).count(), 1);
  assert.equal(await page.getByText('3. Fechamento concluído', { exact: true }).count(), 1, 'Resultado na mesma tela');
  await page.screenshot({ path: path.join(output, 'fechamento-1366.png'), fullPage: true });
  await page.close();

  for (const perfil of ['consulta', 'edicao']) {
    const page = await pagina(`?perfil=${perfil}`);
    const checks = page.getByRole('checkbox', { name: 'Conferido: Ana Teste' });
    assert.equal(await checks.isDisabled(), perfil === 'consulta');
    assert.equal(await page.getByRole('button', { name: 'Fechar e gerar títulos', exact: true }).count(), 0);
    if (perfil === 'edicao') {
      await checks.click(); await salvo(page, 1);
      await page.getByRole('checkbox', { name: 'Conferido: Beatriz Teste' }).click(); await salvo(page, 2);
      await page.getByRole('button', { name: 'Concluir conferência', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Concluir conferência', exact: true }).click();
      assert.equal(await page.locator('#rh-form-fechamento').count(), 0, 'Editar nao concede fechar');
    }
    await page.close();
  }
  // Cada pagina usa um contexto de navegador isolado: nunca compartilha dados reais.
  for (const width of [1366, 390]) {
    const page = await pagina('', width);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Sem overflow da pagina');
    await page.screenshot({ path: path.join(output, `conferencia-${width}-claro.png`), fullPage: true, animations: 'disabled' });
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.screenshot({ path: path.join(output, `conferencia-${width}-escuro.png`), fullPage: true, animations: 'disabled' });
    await page.close();
  }
  const novo = await browser.newPage();
  novo.on('pageerror', error => errors.push(error.message));
  await novo.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
  await novo.goto(url + '?novo');
  await novo.getByRole('button', { name: 'Preparar apuração desta jornada' }).waitFor();
  assert.equal(await novo.evaluate(() => window.calls.length), 0, 'Abrir nao gera apuracao');
  await novo.getByRole('button', { name: 'Preparar apuração desta jornada' }).click();
  await novo.getByRole('checkbox', { name: 'Conferido: Ana Teste' }).waitFor();
  assert.equal(await novo.evaluate(() => window.calls.filter(c => c === 'preparar').length), 1);
  await novo.close();
  assert.deepEqual(errors, [], 'Nenhum erro React/JS');
  console.log('Conferencia RH/DP validada: checkbox, reload, autosave, rascunhos, erro/retry, invalidacao, permissoes, preparacao explicita, fechamento inline e responsividade. Somente fixtures locais.');
} finally { await browser.close(); await server.close(); }
