// Paginas reais; API/estado em memoria; sem banco, .env ou rede externa.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import tailwindConfig from '../tailwind.config.js';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '../outputs/rh-contatos'); mkdirSync(output, { recursive: true });
const nomes = [...readFileSync(path.join(root, 'src/services/rhDp.js'), 'utf8').matchAll(/export (?:async )?function (\w+)/g)].map(m => m[1]);
const cadastro = { id: 91, nome: 'Contato QA', cpf: '52998224725', empresa_grupo_id: 1, obra_id: 7,
  data_admissao: '2026-09-01', status: 'ATIVO', tipo_vinculo: 'CLT', salario_base: 1000, telefone: '27999991234',
  telefone_secundario: '27988884321', endereco: 'Rua A', numero: '10', municipio: 'Vitória', estado: 'ES',
  endereco_secundario: 'Rua B', numero_secundario: '20', municipio_secundario: 'Serra', estado_secundario: 'ES' };
const overrides = {
  getRhColaboradores: 'async()=>[window.cadastro]', getRhColaborador: 'async()=>{if(window.negado)throw new Error("Cadastro QA negado");return window.cadastro}',
  getRhEmpresasGrupo: `async()=>[{id:1,nome:'Empresa QA'}]`,
  getRhEmpresasConsulta: `async()=>[{id:1,nome:'Empresa QA'}]`,
  getRhEmpresasAdmissao: `async()=>[{id:1,nome:'Empresa QA'}]`,
  criarRhColaborador: 'async p=>{window.salvos.push(structuredClone(p));Object.assign(window.cadastro,p);return window.cadastro}',
  atualizarRhColaborador: 'async(id,p)=>{window.salvos.push(structuredClone(p));Object.assign(window.cadastro,p);return window.cadastro}',
  abrirRhSolicitacao: `async p=>{window.admissoes.push(structuredClone(p));return {id:55,tipo:'ADMISSAO',situacao:'RASCUNHO',dados_json:p.dados}}`,
  getRhChecklistDoTipo: 'async()=>({itens:[]})',
  rhTransferencias: 'async()=>({obras:window.locais,obras_responsavel_ids:[7],itens:[]})'
};
const entry = `import React,{useState,useMemo} from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';
import{WorkspacePageContext,createWorkspaceMemory}from'/src/navigation/WorkspaceContext.jsx';
import Cadastro from '/src/pages/RhDpColaboradores.jsx';import Pessoal from '/src/pages/RhDpPessoal.jsx';
import{ThemeContext,TEMA_PADRAO}from'/src/contexts/ThemeContext.jsx';
import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/componentes-padrao.css';
import '/src/styles/escala.css';import '/src/styles/responsive-system.css';
window.cadastro=${JSON.stringify(cadastro)};window.salvos=[];window.admissoes=[];
window.locais=[{id:7,nome:'Obra QA',codigo:'OB-7',tipo_centro_custo:'OBRA'},{id:9,nome:'Centro QA',codigo:'CC-9',tipo_centro_custo:'CENTRO_CUSTO'}];
const Page=new URLSearchParams(location.search).has('admissao')?Pessoal:Cadastro;
function Host(){const[active,A]=useState(true);const memory=useMemo(()=>createWorkspaceMemory(),[]);window.qaTab=A;window.qaMemory=memory;
return <WorkspacePageContext.Provider value={{key:'contatos-qa',memory,snapshot:new URLSearchParams(location.search).has('workspace'),active:true}}>
{active?<Page/>:<p>Consulta auxiliar</p>}</WorkspacePageContext.Provider>}
createRoot(document.getElementById('root')).render(<BrowserRouter><ThemeContext.Provider value={{tema:TEMA_PADRAO}}>
<main className="layout-main"><Host/></main></ThemeContext.Provider></BrowserRouter>);`;
const server = await createServer({ root, configFile: false, logLevel: 'error', cacheDir: path.join(output, 'vite-cache'),
  css: { postcss: { plugins: [tailwindcss({ ...tailwindConfig,
    content: [path.join(root, 'src/**/*.{js,jsx,ts,tsx}')] }), autoprefixer()] } },
  server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'qa-rh-contatos', enforce: 'pre',
    resolveId(id) { if (id === '/fixture.jsx') return '\0qa-contatos.jsx'; },
    async load(id) { if (id === '\0qa-contatos.jsx') return transformWithEsbuild(entry, 'fixture.jsx', { loader: 'jsx', jsx: 'transform' }); },
    transform(code, id) {
      if (id.endsWith('/src/contexts/AuthContext.jsx')) return `const q=new URLSearchParams(location.search);const readonly=q.has('readonly'),obra=q.has('obra');const user={id:2,perfil:obra||readonly||q.has('dp')?'USUARIO':'SUPERADMIN',area:obra?'OBRA':'DP',setor:{codigo:obra?'OBRA':'DP'},obras_ids:[7],areas_permissoes_configuradas:true,modulos_habilitados:['RH_DP'],areas_permissoes:readonly?['rh_dp.colaboradores.visualizar']:['rh_dp.colaboradores.visualizar','rh_dp.colaboradores.editar','rh_dp.solicitacoes.visualizar','rh_dp.solicitacoes.abrir','rh_dp.solicitacoes.ver_todas',...(q.has('dp')&&!q.has('sem-salario')?['rh_dp.salario.aprovar']:[])]};export const useAuth=()=>({user});`;
      if (id.endsWith('/src/services/rhDp.js')) return nomes.map(n => `export const ${n}=${overrides[n] || 'async()=>[]'};`).join('\n');
      if (id.endsWith('/src/services/obras.js')) return 'export const getObras=async()=>window.locais;export const getMinhasObras=async()=>window.locais;';
      if (id.endsWith('/src/services/setores.js')) return 'export const getSetores=async()=>[];';
      if (id.endsWith('/src/services/notificacoes.js')) return 'export const getNotificacoes=async()=>({total_nao_lidas:0});';
      if (id.endsWith('/src/hooks/useUiVisibility.js')) return 'export const useUiVisibility=()=>({isVisible:()=>true});';
    },
    configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
      if (new URL(req.url, 'http://localhost').pathname !== '/fixture') return next();
      res.setHeader('Content-Type', 'text/html'); res.end(await vite.transformIndexHtml('/fixture',
        '<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
    }); }
  }, react()] });
let browser, page;
const errors = [], external = [];
try {
  await server.listen(); browser = await chromium.launch({ channel: 'chrome', headless: true });
  page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(30000); // Compilacao fria da fixture Vite, nao limite de latencia do produto.
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue();
    external.push(route.request().url()); return route.abort();
  });
  const base = `http://127.0.0.1:${server.httpServer.address().port}/fixture`;
  await page.goto(base);
  await page.getByRole('button', { name: 'Editar colaborador Contato QA', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Detalhe do colaborador', exact: true });
  await modal.getByLabel(/^Início efetivo na obra/).fill('01/08/2026');
  assert.equal(await modal.getByLabel('Data de admissão', { exact: true }).inputValue(), '01/09/2026');
  const primeiro = modal.getByRole('group', { name: 'Endereço', exact: true });
  const segundo = modal.getByRole('group', { name: 'Segundo endereço', exact: true });
  assert.equal(await segundo.getByLabel('Logradouro', { exact: true }).inputValue(), 'Rua B');
  await modal.getByLabel('Segundo telefone', { exact: true }).fill('+55 (27) 99999-1234');
  await modal.getByRole('button', { name: 'Salvar alteracoes', exact: true }).click();
  await modal.getByText('O segundo telefone deve ser diferente do primeiro.', { exact: true }).first().waitFor();
  assert.equal(await page.evaluate(() => window.salvos.length), 0);
  await modal.getByLabel('Segundo telefone', { exact: true }).fill('27977774321');
  await primeiro.getByLabel('Logradouro', { exact: true }).fill('Rua Principal Nova');
  await segundo.getByLabel('Logradouro', { exact: true }).fill('Rua Secundária Nova');
  await modal.getByRole('button', { name: 'Salvar alteracoes', exact: true }).click();
  await page.waitForFunction(() => window.salvos.length === 1);
  assert.equal((await page.evaluate(() => window.salvos[0])).telefone_secundario, '27977774321');
  await modal.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('button', { name: 'Editar colaborador Contato QA', exact: true }).click();
  assert.equal(await segundo.getByLabel('Logradouro', { exact: true }).inputValue(), 'Rua Secundária Nova');
  assert.equal(await modal.getByRole('button', { name: /segundo endereço/ }).count(), 0);
  await segundo.getByLabel('Usar o mesmo endereço', { exact: true }).check();
  assert.equal(await segundo.getByLabel('Logradouro', { exact: true }).inputValue(), 'Rua Principal Nova');
  await primeiro.getByLabel('Número', { exact: true }).fill('11');
  assert.equal(await segundo.getByLabel('Número', { exact: true }).inputValue(), '11');
  await segundo.getByLabel('Usar o mesmo endereço', { exact: true }).uncheck();
  for (const field of ['Logradouro', 'Número', 'Complemento', 'Bairro', 'Município', 'UF', 'CEP']) {
    await segundo.getByLabel(field, { exact: true }).fill('');
  }
  await modal.getByLabel('Segundo telefone', { exact: true }).fill('');
  await modal.getByRole('button', { name: 'Salvar alteracoes', exact: true }).click();
  await page.waitForFunction(() => window.salvos.length === 2);
  const limpo = await page.evaluate(() => window.salvos[1]);
  assert.equal(limpo.endereco_secundario, null); assert.equal(limpo.telefone_secundario, null);
  assert.equal(limpo.endereco, 'Rua Principal Nova');
  await page.goto(base + '?admissao=1&dp=1&local_id=7&aba=colaboradores');
  await page.getByRole('button', { name: 'Pedir admissao', exact: true }).click();
  const adm = page.getByRole('dialog');
  await adm.getByLabel('Nome completo', { exact: true }).fill('Novo Contato QA');
  await adm.getByLabel('CPF', { exact: true }).fill('52998224725');
  await adm.getByLabel(/^Empresa do grupo/).selectOption('1');
  await adm.getByLabel(/^Obra \/ Centro de Custo/).selectOption('7');
  assert.equal(await adm.getByLabel('Data de admissao (opcional)', { exact: true }).evaluate(el => el.required), false);
  assert.equal(await adm.getByLabel('Início efetivo na obra', { exact: true }).evaluate(el => el.required), true);
  await adm.getByLabel('Início efetivo na obra', { exact: true }).fill('01/10/2026');
  await adm.getByLabel(/^Forma de calculo gerencial/).selectOption('DIARIA');
  await adm.getByLabel('Valor da diaria', { exact: true }).fill('150,50');
  await adm.getByLabel('Telefone', { exact: true }).fill('(27) 99999-1234');
  await adm.getByLabel('E-mail', { exact: true }).fill('qa@example.invalid');
  await adm.getByLabel('Nome da mae', { exact: true }).fill('Mãe QA');
  const a1 = adm.getByRole('group', { name: 'Endereço', exact: true });
  const a2 = adm.getByRole('group', { name: 'Segundo endereço', exact: true });
  await a1.getByLabel('Logradouro', { exact: true }).fill('Rua da Admissão');
  await a1.getByLabel('Número', { exact: true }).fill('30');
  await a1.getByLabel('Município', { exact: true }).fill('Vitória');
  assert.equal(await adm.getByLabel('Segundo telefone', { exact: true }).count(), 1);
  assert.equal(await adm.getByRole('button', { name: /segundo (endereço|telefone)/ }).count(), 0);
  await a2.getByLabel('Usar o mesmo endereço', { exact: true }).check();
  assert.equal(await a2.getByLabel('Logradouro', { exact: true }).inputValue(), 'Rua da Admissão');
  await a1.getByLabel('Número', { exact: true }).fill('31');
  assert.equal(await a2.getByLabel('Número', { exact: true }).inputValue(), '31');
  await a2.getByLabel('Usar o mesmo endereço', { exact: true }).uncheck();
  await a2.getByLabel('Logradouro', { exact: true }).fill('Outro endereço');
  await a2.getByLabel('Usar o mesmo endereço', { exact: true }).check();
  await adm.getByLabel('Segundo telefone', { exact: true }).fill('+55 (27) 99999-1234');
  await adm.getByRole('button', { name: 'Criar rascunho', exact: true }).click();
  await adm.getByText('O segundo telefone deve ser diferente do primeiro.', { exact: true }).first().waitFor();
  assert.equal(await page.evaluate(() => window.admissoes.length), 0);
  await adm.getByLabel('Segundo telefone', { exact: true }).fill('27988884321');
  await page.locator('.app-avisos').getByRole('button', { name: 'Fechar', exact: true }).first().click();
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await adm.getByRole('group', { name: 'Identificação e lotação', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, `admissao-topo-${width}.png`) });
    await a2.scrollIntoViewIfNeeded();
    const bounds = await a2.getByLabel('Logradouro', { exact: true }).boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, 'Endereco cabe no viewport');
    await page.screenshot({ path: path.join(output, `admissao-${width}.png`) });
  }
  await adm.getByLabel('Início efetivo na obra', { exact: true }).fill('');
  await adm.getByRole('button', { name: 'Criar rascunho', exact: true }).click();
  assert.equal(await page.evaluate(() => window.admissoes.length), 0, 'Sem inicio efetivo nao enviar');
  await adm.getByLabel('Início efetivo na obra', { exact: true }).fill('01/10/2026');
  await adm.getByRole('button', { name: 'Criar rascunho', exact: true }).click();
  await page.waitForFunction(() => window.admissoes.length === 1);
  const dados = (await page.evaluate(() => window.admissoes[0])).dados;
  assert.equal(dados.valor_diaria, 150.5, 'DP envia valor numerico, nao BRL');
  assert.equal(dados.data_inicio_efetivo_obra, '2026-10-01');
  assert.equal(dados.data_admissao, undefined, 'Admissao pode ser informada depois');
  assert.equal(dados.endereco_secundario, dados.endereco); assert.equal(dados.numero_secundario, '31');
  assert.equal(dados.telefone_secundario.replace(/\D/g, ''), '27988884321'); assert.equal(dados.mesmo_endereco, undefined);
  await page.goto(base + '?admissao=1&obra=1&local_id=7&aba=colaboradores');
  await page.getByRole('button', { name: 'Pedir admissao', exact: true }).click();
  await adm.getByLabel('Segundo telefone', { exact: true }).waitFor();
  assert.equal(await a2.getByLabel('Usar o mesmo endereço', { exact: true }).count(), 0);
  assert.equal(await adm.getByLabel('Segundo telefone', { exact: true }).count(), 1);
  assert.equal(await a2.getByLabel('Logradouro', { exact: true }).isEditable(), true);
  await adm.getByLabel('Nome completo', { exact: true }).fill('Obra QA');
  await adm.getByLabel('CPF', { exact: true }).fill('52998224725');
  await adm.getByLabel(/^Empresa do grupo/).selectOption('1');
  await adm.getByLabel(/^Obra \/ Centro de Custo/).selectOption('7');
  await adm.getByLabel('Data de admissao (opcional)', { exact: true }).fill('11/10/2026');
  await adm.getByLabel('Início efetivo na obra', { exact: true }).fill('01/10/2026');
  await adm.getByLabel(/^Forma de calculo gerencial/).selectOption('DIARIA');
  await adm.getByLabel('Valor da diaria', { exact: true }).fill('180,00');
  await adm.getByLabel('Telefone', { exact: true }).fill('27999991234');
  await adm.getByLabel('E-mail', { exact: true }).fill('obra@example.invalid');
  await adm.getByLabel('Nome da mae', { exact: true }).fill('Mãe QA');
  for (const group of [a1, a2]) {
    await group.getByLabel('Logradouro', { exact: true }).fill('Rua Obra');
    await group.getByLabel('Número', { exact: true }).fill('40');
    await group.getByLabel('Município', { exact: true }).fill('Vitória');
  }
  await a2.getByLabel('Logradouro', { exact: true }).fill(' RUA obra. ');
  await a2.getByLabel('Município', { exact: true }).fill('VITORIA');
  await adm.getByRole('button', { name: 'Criar rascunho', exact: true }).click();
  await page.getByText('O segundo endereço deve ser diferente do primeiro para usuários de Obra.', { exact: true }).first().waitFor();
  assert.equal(await page.evaluate(() => window.admissoes.length), 0);
  await a2.getByLabel('Número', { exact: true }).fill('41');
  await page.locator('.app-avisos').getByRole('button', { name: 'Fechar', exact: true }).first().click();
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await a2.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, `admissao-obra-${width}.png`) });
  }
  await adm.getByRole('button', { name: 'Criar rascunho', exact: true }).click();
  await page.waitForFunction(() => window.admissoes.length === 1);
  assert.equal((await page.evaluate(() => window.admissoes[0])).dados.numero_secundario, '41');
  assert.equal((await page.evaluate(() => window.admissoes[0])).dados.valor_diaria, 180, 'Obra envia diaria numerica');
  await page.goto(base + '?readonly=1');
  await page.getByRole('button', { name: 'Ver colaborador Contato QA', exact: true }).click();
  assert.equal(await modal.getByLabel('Segundo telefone', { exact: true }).isDisabled(), true);
  assert.equal(await segundo.getByLabel('Logradouro', { exact: true }).isDisabled(), true);
  await page.goto(base + '?dp=1&sem-salario=1');
  await page.getByRole('button', { name: 'Editar colaborador Contato QA', exact: true }).click();
  assert.equal(await modal.getByLabel('Salário base', { exact: true }).isDisabled(), true);
  assert.equal(await modal.getByRole('combobox', { name: 'Obra / centro de custo principal', exact: true }).isDisabled(), true);
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 }); await page.goto(base + '?dp=1');
    await page.getByRole('button', { name: 'Editar colaborador Contato QA', exact: true }).click();
    assert.equal(await modal.getByLabel('Salário base', { exact: true }).isDisabled(), false);
    assert.equal(await modal.getByRole('combobox', { name: 'Obra / centro de custo principal', exact: true }).isDisabled(), true);
    await modal.getByLabel('Salário base', { exact: true }).fill('1881,00');
    await modal.getByLabel('Vigência do salário', { exact: true }).fill('01/10/2026');
    await modal.getByLabel('Motivo do ajuste salarial', { exact: true }).fill('Ajuste DP QA');
    await page.screenshot({ path: path.join(output, `salario-dp-${width}.png`) });
    await modal.getByRole('button', { name: 'Salvar alteracoes', exact: true }).click();
    await page.waitForFunction(() => window.salvos.length === 1);
    const salvo = await page.evaluate(() => window.salvos[0]);
    assert.equal(salvo.salario_vigencia_inicio, '2026-10-01'); assert.equal(salvo.salario_motivo, 'Ajuste DP QA');
    assert.equal(salvo.obra_id, 7); assert.equal(salvo.obra_vigencia_inicio, undefined);
    await page.goto(base); await page.getByRole('button', { name: 'Editar colaborador Contato QA', exact: true }).click();
    const obra = modal.getByRole('combobox', { name: 'Obra / centro de custo principal', exact: true });
    await obra.fill('Centro QA'); await page.getByRole('button', { name: /Centro QA/ }).click();
    await modal.getByLabel('Vigência da lotação', { exact: true }).fill('01/10/2026');
    await modal.getByLabel('Motivo do ajuste da lotação', { exact: true }).fill('Lotação SUPERADMIN QA');
    await page.screenshot({ path: path.join(output, `lotacao-superadmin-${width}.png`) });
    await modal.getByRole('button', { name: 'Salvar alteracoes', exact: true }).click();
    await page.waitForFunction(() => window.salvos.length === 1);
    const lotacao = await page.evaluate(() => window.salvos[0]);
    assert.equal(lotacao.obra_id, 9); assert.equal(lotacao.obra_vigencia_inicio, '2026-10-01');
    assert.equal(lotacao.obra_motivo, 'Lotação SUPERADMIN QA');
  }
  for (const width of [1366,390]) {
    await page.setViewportSize({width,height:900});await page.goto(base+'?workspace=1');
    await page.getByRole('button',{name:'Editar colaborador Contato QA',exact:true}).click();
    const cargo=modal.getByLabel('Cargo',{exact:true});await cargo.fill('Cargo digitado');
    await page.evaluate(()=>window.qaTab(false));await page.getByText('Consulta auxiliar',{exact:true}).waitFor();
    await page.evaluate(()=>window.qaTab(true));await cargo.waitFor();assert.equal(await cargo.inputValue(),'Cargo digitado');
    assert.equal(await page.evaluate(()=>window.salvos.length),0);
    await page.evaluate(()=>{window.cadastro.cargo='Cargo alterado no servidor';window.qaTab(false)});
    await page.getByText('Consulta auxiliar',{exact:true}).waitFor();await page.evaluate(()=>window.qaTab(true));
    await modal.getByRole('alert').waitFor();assert.equal(await cargo.inputValue(),'Cargo digitado');
    assert.ok(await modal.getByRole('button',{name:'Salvar alteracoes',exact:true}).isDisabled());
    await page.evaluate(()=>window.qaTab(false));await page.getByText('Consulta auxiliar',{exact:true}).waitFor();
    await page.evaluate(()=>{window.negado=true;window.qaTab(true)});await page.getByText('Cadastro QA negado',{exact:true}).waitFor();
    assert.equal(await modal.count(),0);
    await page.goto(base+'?workspace=1&admissao=1&dp=1&local_id=7&aba=colaboradores');
    await page.getByRole('button',{name:'Pedir admissao',exact:true}).click();
    const nome=adm.getByLabel('Nome completo',{exact:true});await nome.fill('Admissão em preenchimento');
    await page.evaluate(()=>window.qaTab(false));await page.getByText('Consulta auxiliar',{exact:true}).waitFor();
    await page.evaluate(()=>window.qaTab(true));await nome.waitFor();assert.equal(await nome.inputValue(),'Admissão em preenchimento');
    assert.equal(await adm.locator('select').filter({has:page.locator('option[value="7"]')}).first().inputValue(),'7');
    assert.equal(await page.evaluate(()=>window.admissoes.length),0);
    console.log('Workspace cadastro/admissao '+width+'px: preenchimento, revisao atual, 403 e sem gravacao no retorno OK.');
  }
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  console.log('OK UI contatos RH: editar/reabrir/limpar, admissao/copiar sincronizado, telefones distintos, payload, consulta, desktop/mobile. Sem banco/rede externa.');
} catch (error) {
  if (page) { await page.screenshot({ path: path.join(output, 'falha.png') });
    console.error((await page.getByRole('dialog').allTextContents()).join('\n').slice(0, 4000)); }
  throw error;
} finally { await browser?.close(); await server.close(); }
