// UI real, servicos em memoria e nenhum acesso a banco ou API externa.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '../outputs/rh-pessoal-locais');
mkdirSync(output, { recursive: true });
const gerencial = process.argv.includes('--gerencial');
const etapas = gerencial || process.argv.includes('--etapas');
const exportsRh = [...readFileSync(path.join(root, 'src/services/rhDp.js'), 'utf8')
  .matchAll(/export (?:async )?function (\w+)/g)].map(match => match[1]);
const locais = [{ id: 7, nome: 'Obra QA', codigo: 'OB-7', tipo_centro_custo: 'OBRA' },
  { id: 51, nome: 'Escritório QA', codigo: 'CC-51', tipo_centro_custo: 'CENTRO_CUSTO' }];
const pessoas = ['Ana QA', 'Beatriz QA', 'Caio QA'].map((nome, index) => ({
  id: index + 11, colaborador_id: index + 11, nome, obra_id: index < 2 ? 7 : 51,
  obra: locais[index < 2 ? 0 : 1], status: 'ATIVO', tipo_vinculo: 'CLT',
  forma_calculo_gerencial: 'MENSAL', pagamento_automatico_40_60: true,
  dias_vinculados: 30, limite_dias_mensais: 30, salario_base: 3000, pix_titulo: { chave_pix: 'pix-qa' }
}));
const cadastrosExtras = [
  { id: 21, nome: 'Inativo obra QA', obra_id: 7, obra: locais[0], status: 'INATIVO' },
  { id: 22, nome: 'Afastado obra QA', obra_id: 7, obra: locais[0], status: 'AFASTADO' },
  { id: 23, nome: 'Inativo escritório QA', obra_id: 51, obra: locais[1], status: 'INATIVO' },
  { id: 24, nome: 'Ativo sem local QA', obra_id: null, status: 'ATIVO' }
];
const solicitacao = { id: 55, codigo: 'RHP-55', tipo: 'JORNADA', situacao: 'ABERTA', obra_id: 7,
  obra: locais[0], dados_json: { importacao_id: 19, competencia: '2026-09' }, historicos: [] };
const apuracao = { id: 12, competencia: '2026-09', importacao_id: 19, obra_id: 7, obra: locais[0],
  status: 'RASCUNHO', dias_base: 30, total_colaboradores: 2, total_liquido: 2000,
  itens: pessoas.slice(0, 2).map((colaborador, index) => ({ id: index + 1, colaborador_id: colaborador.id,
    colaborador: { ...colaborador, pagamento: { chave_pix: 'pix-qa' } }, status: 'PENDENTE',
    dias_trabalhados: 10, valor_bruto: 1000, valor_descontos: 0, valor_liquido: 1000,
    ajuste_credito_manual: 0, ajuste_debito_manual: 0, revisao_conferencia: 'qa-' + index,
    detalhes_json: { importacao_ids: [19] } })) };
const overrides = {
  getRhColaboradores: `async p=>{window.chamadas.push(['colaboradores',p]);return [...window.pessoas,...window.cadastrosExtras].filter(i=>(!p.obra_id||i.obra_id===Number(p.obra_id))&&(!p.status||i.status===p.status));}`,
  listarRhSolicitacoes: `async p=>{window.chamadas.push(['solicitacoes',p]);return [window.pedido];}`,
  getRhSolicitacao: `async()=>window.pedido`,
  conferirDocumentacaoRhSolicitacao: `async()=>({exigeConferencia:false,faltando:[],entregues:[]})`,
  getRhChecklistDoTipo: `async()=>({itens:[]})`,
  colaboradoresParaJornadaRh: `async p=>{window.chamadas.push(['roster',p]);return window.pessoas.filter(i=>i.obra_id===Number(p.obra_id));}`,
  colaboradoresParaJornadaGerencialRh: `async p=>{window.chamadas.push(['roster',p]);return window.pessoas.filter(i=>i.obra_id===Number(p.obra_id));}`,
  registrarJornadaRh: `async p=>{window.envios.push(p);await new Promise(ok=>setTimeout(ok,150));return {solicitacao:window.pedido};}`,
  registrarJornadaGerencialRh: `async p=>{window.envios.push(p);await new Promise(ok=>setTimeout(ok,150));return {solicitacoes:[window.pedido]};}`,
  getRhApuracoes: `async()=>[window.apuracao]`,
  getRhApuracao: `async()=>structuredClone(window.apuracao)`,
  getRhJornadasMultiobra: `async()=>({resumo:{},colaboradores:[]})`,
  abrirConferenciaRhJornada: `async(id,preparar)=>{window.chamadas.push(['conferencia',id,preparar]);return {solicitacao_id:id,recorte:{competencia:'2026-09',obra_id:7,importacao_id:19},apuracoes:[structuredClone(window.apuracao)],compartilhadas:window.compartilhada?[12]:[]};}`,
  atualizarRhApuracaoItem: `async(id,itemId,p)=>{window.chamadas.push(['ajuste',id,itemId,p]);await new Promise(ok=>setTimeout(ok,150));const item=window.apuracao.itens.find(i=>i.id===itemId);Object.assign(item,p);if(p.ajuste_credito_manual!==undefined)item.status='PENDENTE';return structuredClone(window.apuracao);}`,
  conferirRhApuracao: `async()=>{window.chamadas.push(['conferir']);window.apuracao.status='CONFERIDA';return structuredClone(window.apuracao);}`,
  fecharRhApuracao: `async(id,p)=>{window.chamadas.push(['fechar',id,p]);await new Promise(ok=>setTimeout(ok,150));if(window.apuracao.fechamentoRh)throw new Error('Ja fechada');const f={id:77,...p,total_titulos:2,total_valor:2000,titulos:[{id:1,titulo_financeiro_id:701,tipo_titulo:'SALARIO',valor_gerado:1000,tituloFinanceiro:{codigo:'TIT-QA-701'}}]};window.apuracao.fechamentoRh=f;return f;}`,
  getRhEmpresasGrupo: `async()=>[]`,
  rhTransferencias: `async(p)=>p==='/configuracao'?{obras:window.locais,obras_responsavel_ids:[7]}:{itens:[],total:0,total_paginas:1,pagina:1}`
};
const rhModule = exportsRh.map(name => `export const ${name}=${overrides[name] || 'async()=>[]'};`).join('\n');
const fixture = `import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';
  import Page from '/src/pages/RhDpPessoal.jsx';import{ThemeContext,TEMA_PADRAO}from'/src/contexts/ThemeContext.jsx';
  import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/componentes-padrao.css';import '/src/styles/escala.css';import '/src/styles/responsive-system.css';
  window.locais=${JSON.stringify(locais)};window.pessoas=${JSON.stringify(pessoas)};window.pedido=${JSON.stringify(solicitacao)};
  window.cadastrosExtras=${JSON.stringify(cadastrosExtras)};
  window.apuracao=${JSON.stringify(apuracao)};window.chamadas=[];window.envios=[];window.compartilhada=new URLSearchParams(location.search).has('compartilhada');
  createRoot(document.getElementById('root')).render(<BrowserRouter><ThemeContext.Provider value={{tema:TEMA_PADRAO}}><div className="fx-topbar" style={{position:'fixed',top:0,height:96}}/><main className="layout-main" style={{paddingTop:96}}><Page/></main></ThemeContext.Provider></BrowserRouter>);`;
let browser;
const errors = [];
const pages = [];
const server = await createServer({ root, configFile: false, logLevel: 'error',
  cacheDir: path.join(root, '../outputs/rh-pessoal-locais', `vite-cache-${gerencial ? 'gerencial' : etapas ? 'etapas' : 'legado'}`),
  define: { 'import.meta.env.VITE_RH_JORNADA_40_60_ETAPAS': JSON.stringify(etapas ? 'ON' : 'OFF'),
    'import.meta.env.VITE_RH_JORNADA_GERENCIAL_V2': JSON.stringify(gerencial ? 'ON' : 'OFF') },
  server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'qa-rh-por-local', enforce: 'pre',
    resolveId(id) { if (id === '/fixture.jsx') return '\0qa-local.jsx'; },
    async load(id) { if (id === '\0qa-local.jsx') return transformWithEsbuild(fixture, 'fixture.jsx', { loader: 'jsx', jsx: 'transform' }); },
    transform(code, id) {
      if (id.endsWith('/src/contexts/AuthContext.jsx')) return `const dp=new URLSearchParams(location.search).has('dp');const readonly=new URLSearchParams(location.search).has('readonly');
        const user={id:2,perfil:'USUARIO',area:dp?'DP':'OBRA',setor:{codigo:dp?'DP':'OBRA'},areas_permissoes_configuradas:true,modulos_habilitados:['RH_DP','FINANCEIRO'],
          areas_permissoes:readonly?['rh_dp.colaboradores.visualizar','rh_dp.solicitacoes.visualizar']:['rh_dp.colaboradores.visualizar','rh_dp.solicitacoes.visualizar','rh_dp.solicitacoes.abrir',...(dp?['rh_dp.solicitacoes.ver_todas','rh_dp.apuracao.visualizar','rh_dp.apuracao.editar','rh_dp.fechamento.executar','rh_dp.obrigacoes.visualizar']:[])]};export const useAuth=()=>({user});`;
      if (id.endsWith('/src/services/rhDp.js')) return rhModule;
      if (id.endsWith('/src/services/obras.js')) return `export const getObras=async p=>{window.chamadas.push(['obras',p]);return window.locais;};export const getMinhasObras=async p=>{window.chamadas.push(['minhas',p]);return window.locais;};`;
      if (id.endsWith('/src/services/notificacoes.js')) return `export const getNotificacoes=async()=>({total_nao_lidas:0});`;
    },
    configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
      if (new URL(req.url, 'http://localhost').pathname !== '/fixture') return next();
      res.setHeader('Content-Type', 'text/html');res.end(await vite.transformIndexHtml('/fixture',
        '<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
    }); }
  }, react()], optimizeDeps: { include: ['react', 'react-dom/client', 'react-router-dom'] } });

try {
  await server.listen(); browser = await chromium.launch({ channel: 'chrome', headless: true });
  const base = `http://127.0.0.1:${server.httpServer.address().port}/fixture`;
  async function abrir(query = '', width = 1366) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    pages.push(page);
    page.setDefaultTimeout(10000);
    page.setDefaultNavigationTimeout(30000);
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
    await page.goto(base + query, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: /Pessoal|Gestão de Colaboradores/ }).first().waitFor({ timeout: 30000 });
    return page;
  }
  const page = await abrir();
  await page.getByRole('button', { name: 'Abrir Obra QA', exact: true }).click();
  await page.getByRole('button', { name: 'Solicitar pagamento: Ana QA', exact: true }).waitFor();
  assert.deepEqual(await page.getByRole('tab').allTextContents(), ['Colaboradores', 'Solicitações', 'Transferências entre obras']);
  assert.ok(await page.evaluate(() => window.chamadas.some(c => c[0] === 'minhas' && c[1].escopo === 'TODOS')));
  assert.ok(await page.evaluate(() => window.chamadas.filter(c => c[0] === 'colaboradores').every(c => Number(c[1].obra_id) === 7)));
  assert.ok(await page.evaluate(() => window.chamadas.filter(c => c[0] === 'colaboradores').every(c => c[1].status === 'ATIVO')));
  for (const nome of ['Caio QA', ...cadastrosExtras.map(item => item.nome)]) {
    assert.equal(await page.getByText(nome, { exact: true }).count(), 0, 'Card da obra exclui inativos, afastados e outros locais');
  }
  await page.getByRole('button', { name: 'Solicitar pagamento: Ana QA', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Solicitar pagamento', exact: true });
  if (gerencial) {
    await modal.locator('.rh-gerencial-linha').waitFor();
    assert.equal(await modal.locator('.rh-gerencial-linha').count(), 1);
    await modal.locator('.rh-gerencial-campos select').first().selectOption('ADIANTAMENTO_40');
    await modal.getByLabel('Dias desta etapa').fill('5');
    await modal.screenshot({ path: path.join(output, 'pagamento-individual-gerencial.png') });
    await modal.getByRole('button', { name: 'Revisar envio', exact: true }).click();
    await modal.getByRole('button', { name: 'Enviar ao DP', exact: true }).click();
  } else {
    await modal.getByRole('spinbutton', { name: /Dias trabalhados de Ana QA/ }).fill('5');
    assert.equal(await modal.getByRole('spinbutton', { name: /Dias trabalhados de Beatriz QA/ }).count(), 0);
    await modal.screenshot({ path: path.join(output, 'pagamento-individual-legado.png') });
    await modal.getByRole('button', { name: /Enviar jornada/ }).click();
  }
  await page.waitForFunction(() => window.envios.length === 1);
  const payload = await page.evaluate(() => window.envios[0]);
  assert.equal(payload.obra_id, 7);assert.deepEqual(payload.linhas.map(i => i.colaborador_id), [11]);
  assert.ok(payload.idempotency_key);
  if (!gerencial) assert.equal(payload.solicitacao_independente, true);
  await modal.getByRole('button', { name: 'Fechar', exact: true }).click();
  await modal.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Solicitar pagamento', exact: true }).click();
  if (gerencial) {
    await modal.locator('.rh-gerencial-linha').first().waitFor();assert.equal(await modal.locator('.rh-gerencial-linha').count(), 2);
    for (const row of await modal.locator('.rh-gerencial-linha').all()) {
      await row.locator('input[type="checkbox"]').first().check();
      await row.locator('.rh-gerencial-campos select').first().selectOption('ADIANTAMENTO_40');
      await row.getByLabel('Dias desta etapa').fill('4');
    }
    await modal.getByRole('button', { name: 'Revisar envio', exact: true }).click();
    await modal.getByRole('button', { name: 'Enviar ao DP', exact: true }).click();
  } else {
    await modal.getByRole('spinbutton', { name: /Dias trabalhados de Beatriz QA/ }).fill('4');
    await modal.getByRole('spinbutton', { name: /Dias trabalhados de Ana QA/ }).fill('4');
    await modal.getByRole('button', { name: /Enviar jornada/ }).click();
  }
  await page.waitForFunction(() => window.envios.length === 2);
  assert.deepEqual(await page.evaluate(() => window.envios[1].linhas.map(i => i.colaborador_id)), [11, 12]);
  await modal.getByRole('button', { name: 'Fechar', exact: true }).click();
  await modal.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Voltar aos locais', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir Escritório QA', exact: true }).click();
  await page.getByRole('button', { name: 'Solicitar pagamento: Caio QA', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Solicitar pagamento: Ana QA', exact: true }).count(), 0);
  assert.equal(await page.getByText('Inativo escritório QA', { exact: true }).count(), 0);
  await page.getByRole('tab', { name: 'Solicitações', exact: true }).click();
  await page.getByText('Nenhuma solicitação neste filtro.').waitFor();
  const cadastroGlobal = await abrir('?dp=1&aba=colaboradores');
  await cadastroGlobal.getByText('Inativo obra QA', { exact: true }).waitFor();
  for (const item of cadastrosExtras) await cadastroGlobal.getByText(item.nome, { exact: true }).waitFor();
  assert.ok(await cadastroGlobal.evaluate(() => window.chamadas.filter(c => c[0] === 'colaboradores').every(c => !c[1].status)),
    'Cadastro geral do DP preserva consulta a inativos, afastados e sem local');
  const semAtivos = await abrir('?local_id=7&aba=colaboradores');
  await semAtivos.getByText('Ana QA', { exact: true }).waitFor();
  await semAtivos.evaluate(() => window.pessoas.filter(item => item.obra_id === 7).forEach(item => { item.status = 'INATIVO'; }));
  await semAtivos.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await semAtivos.getByText('Nenhum colaborador nesta obra.', { exact: true }).waitFor();
  const dp = await abrir('?dp=1');
  await dp.getByRole('button', { name: 'Abrir: solicitação #55', exact: true }).click();
  const detalhe = dp.getByRole('dialog', { name: 'Jornada RHP-55', exact: true });
  await detalhe.getByRole('button', { name: 'Ver detalhe de Detalhes e ajustes de Ana QA', exact: true }).click();
  await detalhe.getByRole('textbox', { name: 'Ajuste crédito de Ana QA', exact: true }).fill('10');
  await detalhe.getByRole('textbox', { name: 'Observações de Ana QA', exact: true }).click();
  await dp.waitForFunction(() => Number(window.apuracao.itens[0].ajuste_credito_manual) === 10);
  await detalhe.getByRole('checkbox', { name: 'Conferido: Ana QA', exact: true }).click();
  await dp.waitForFunction(() => window.apuracao.itens[0].status === 'CONFERIDO');
  await detalhe.getByRole('checkbox', { name: 'Conferido: Beatriz QA', exact: true }).click();
  await dp.waitForFunction(() => window.apuracao.itens[1].status === 'CONFERIDO');
  await detalhe.getByRole('button', { name: 'Revisar fechamento', exact: true }).click();
  await dp.getByRole('button', { name: 'Concluir conferência', exact: true }).click();
  await detalhe.getByRole('button', { name: 'Fechar e gerar títulos', exact: true }).click();
  await dp.getByRole('button', { name: 'Fechar e gerar titulos', exact: true }).click();
  await detalhe.getByText('TIT-QA-701', { exact: true }).waitFor();
  assert.equal(await dp.evaluate(() => window.chamadas.filter(c => c[0] === 'fechar').length), 1);
  assert.equal(await dp.getByRole('dialog', { name: 'Jornada RHP-55', exact: true }).count(), 1, 'Conferencia e titulos no mesmo modal');
  await detalhe.getByRole('button', { name: 'Fechar', exact: true }).click();
  await dp.getByRole('button', { name: 'Abrir: solicitação #55', exact: true }).click();
  await detalhe.getByText('3. Fechamento concluído', { exact: true }).waitFor();
  assert.equal(await detalhe.getByRole('button', { name: 'Fechar e gerar títulos', exact: true }).count(), 0);
  assert.equal(await dp.evaluate(() => window.chamadas.filter(c => c[0] === 'fechar').length), 1, 'Reabrir o modal consulta o fechamento sem gerar novamente');
  const compartilhada = await abrir('?dp=1&compartilhada=1&solicitacao=55');
  await compartilhada.getByText('Apuração compartilhada', { exact: true }).waitFor();
  assert.ok(await compartilhada.getByRole('checkbox', { name: 'Conferido: Ana QA', exact: true }).isDisabled());
  assert.equal(await compartilhada.getByRole('button', { name: 'Fechar e gerar títulos', exact: true }).count(), 0);
  const mobile = await abrir('', 390);
  await mobile.getByRole('button', { name: 'Abrir Escritório QA', exact: true }).click();
  await mobile.getByRole('button', { name: 'Solicitar pagamento: Caio QA', exact: true }).waitFor();
  assert.equal(await mobile.getByText('Inativo escritório QA', { exact: true }).count(), 0);
  const readonly = await abrir('?readonly=1');
  await readonly.getByRole('button', { name: 'Abrir Obra QA', exact: true }).click();
  await readonly.getByText('Ana QA', { exact: true }).waitFor();
  assert.equal(await readonly.getByRole('button', { name: 'Solicitar pagamento', exact: true }).count(), 0);
  await page.screenshot({ path: path.join(output, `local-${gerencial ? 'gerencial' : etapas ? 'etapas' : 'legado'}.png`), fullPage: true });
  await dp.screenshot({ path: path.join(output, 'dp-modal.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('Pessoal por local: ativos no vinculo atual, cadastro global preservado, obras/centros, tres abas, pagamento individual/coletivo, permissoes, celular e conferencia/fechamento no modal validados (' + (gerencial ? 'gerencial' : etapas ? 'etapas' : 'legado') + ').');
} catch (error) {
  console.error('Erros JavaScript da fixture:', errors);
  for (const page of pages) if (!page.isClosed()) console.error('Tela:', page.url(), (await page.locator('body').innerText()).slice(0, 3000));
  throw error;
} finally { await browser?.close();await server.close(); }
