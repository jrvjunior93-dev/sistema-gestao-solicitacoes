// UI real, servicos em memoria e nenhum acesso a banco ou API externa.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
import { SUBTIPOS_MOVIMENTACAO } from '../src/utils/rhMovimentacoes.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '../outputs/rh-pessoal-locais');
mkdirSync(output, { recursive: true });
const gerencial = process.argv.includes('--gerencial');
const demissoes = process.argv.includes('--demissoes');
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
if (demissoes) cadastrosExtras.push({ id: 25, nome: 'Demissao pendente QA', obra_id: 7, obra: locais[0],
  status: 'DEMITIDO', demissao_pendente_conclusao: true, solicitacoes_abertas: [{ id: 235, tipo: 'DEMISSAO', situacao: 'APROVADA' }] });
const solicitacao = { id: 55, codigo: 'RHP-55', tipo: 'JORNADA', colaborador_id: 11, situacao: 'ABERTA', obra_id: 7,
  obra: locais[0], dados_json: { importacao_id: 19, competencia: '2026-09' }, historicos: [] };
const apuracao = { id: 12, competencia: '2026-09', importacao_id: 19, obra_id: 7, obra: locais[0],
  status: 'RASCUNHO', dias_base: 30, total_colaboradores: 2, total_liquido: 2000,
  itens: pessoas.slice(0, 2).map((colaborador, index) => ({ id: index + 1, colaborador_id: colaborador.id,
    colaborador: { ...colaborador, pagamento: { chave_pix: 'pix-qa' } }, status: 'PENDENTE',
    dias_trabalhados: 10, valor_bruto: 1000, valor_descontos: 0, valor_liquido: 1000,
    ajuste_credito_manual: 0, ajuste_debito_manual: 0, revisao_conferencia: 'qa-' + index,
    detalhes_json: { importacao_ids: [19] } })) };
const overrides = {
  abrirRhSolicitacao: `async p=>{window.chamadas.push(['criar-rascunho',p]);await new Promise(ok=>setTimeout(ok,150));return {id:88,situacao:'RASCUNHO'};}`,
  anexarNaRhSolicitacao: `async(id,p,arquivo)=>{window.chamadas.push(['anexar-movimentacao',id,p,arquivo?.name]);return {id:1};}`,
  getRhColaborador: `async id=>{window.chamadas.push(['cadastro',id]);return {...window.pessoas.find(p=>p.id===Number(id)),cpf:'52998224725',empresa_grupo_id:3};}`,
  atualizarRhColaborador: `async(id,p)=>{window.chamadas.push(['salvar-cadastro',id,p]);await new Promise(ok=>setTimeout(ok,150));Object.assign(window.pessoas.find(i=>i.id===id),p);return {...window.pessoas.find(i=>i.id===id),cpf:'52998224725'};}`,
  getRhDocumentos: `async p=>{window.chamadas.push(['documentos',p]);const data=window.pessoas.filter(i=>(!p.obra_id||i.obra_id===Number(p.obra_id))&&(!p.colaborador_id||i.id===Number(p.colaborador_id))).map(i=>({id:i.id,colaborador_id:i.id,colaborador:i,nome_original:'Documento '+i.nome,status:'ENVIADO',ativo:true}));return {data,meta:{page:1,total_pages:1,total:data.length}};}`,
  getRhRelatorioOperacional: `async p=>{window.chamadas.push(['relatorio',p]);const analitico=window.pessoas.filter(i=>!p.obra_id||i.obra_id===Number(p.obra_id));return {resumo:{colaboradores_ativos:analitico.length},colaboradores:{analitico}};}`,
  listarEventosRecorrentesRh: `async p=>{window.chamadas.push(['eventos',p]);return [];}`,
  pagamentoRhSolicitacao: `async(path,options={})=>{
    if(!path||path==='/preparar'){const ids=options.data.colaborador_ids||(options.data.colaborador_id?[options.data.colaborador_id]:null);window.pagamento={id:99,codigo:'RH-QA-99',obra_id:options.data.obra_id,situacao:'RASCUNHO',dados_json:{revisao:0,competencia:'2026-10',data_vencimento:'2026-10-15',linhas:window.pessoas.filter(p=>p.obra_id===options.data.obra_id&&(!ids||ids.includes(p.id))).map(p=>({...p,selecionado:Boolean(ids),dias:30,faltas:0,acrescimos:0,descontos:0,parcela_40:false,parcela_60:false,conferido_obra:false,conferido_dp:false}))}};}
    if(options.method==='PUT')window.pagamento.dados_json={...options.data,revisao:options.data.revisao+1};
    if(path.endsWith('/enviar')){window.envios.push({...window.pagamento.dados_json,obra_id:window.pagamento.obra_id});window.pagamento.situacao='ABERTA';}
    return structuredClone({solicitacao:window.pagamento,pode_conferir:false,pode_enviar_fila:false,responsaveis:[],avisos:[]});
  }`,
  getRhColaboradores: `async p=>{window.chamadas.push(['colaboradores',p]);return [...window.pessoas,...window.cadastrosExtras].filter(i=>(!p.obra_id||i.obra_id===Number(p.obra_id))&&(!p.status||i.status===p.status||(p.incluir_demissoes_pendentes==='1'&&i.demissao_pendente_conclusao))&&(!p.q||i.nome.toLowerCase().includes(p.q.toLowerCase())));}`,
  listarRhSolicitacoes: `async p=>{window.chamadas.push(['solicitacoes',p]);return window.pedidos.filter(s=>(!p.obra_id||s.obra_id===Number(p.obra_id))&&(!p.colaborador_id||s.colaborador_id===Number(p.colaborador_id))&&(!p.tipo||s.tipo===p.tipo));}`,
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
  getRhEmpresasGrupo: `async()=>[{id:3,nome:'Empresa QA'}]`,
  getRhEmpresasConsulta: `async()=>[{id:3,nome:'Empresa QA'}]`,
  getRhEmpresasAdmissao: `async()=>{window.chamadas.push(['catalogo-admissao']);return [{id:3,nome:'Empresa QA',cnpj:'111'},{id:4,nome:'Outra empresa QA',cnpj:'222'}];}`,
  rhTransferencias: `async(p,o)=>{window.chamadas.push(['transferencias',p,o]);return p==='/configuracao'?{obras:window.locais,obras_responsavel_ids:[7]}:{itens:[],total:0,total_paginas:1,pagina:1};}`
};
const rhModule = exportsRh.map(name => `export const ${name}=${overrides[name] || 'async()=>[]'};`).join('\n');
const fixture = `import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter,Routes,Route}from'react-router-dom';
  import Pessoal from '/src/pages/RhDpPessoal.jsx';import Documentos from '/src/pages/RhDpDocumentos.jsx';import Relatorio from '/src/pages/RhDpRelatorioOperacional.jsx';import{ThemeContext,TEMA_PADRAO}from'/src/contexts/ThemeContext.jsx';
  import ModuleHub from '/src/navigation/ModuleHub.jsx';
  const modo=new URLSearchParams(location.search).get('global');const Page=modo==='docs'?Documentos:modo==='relatorio'?Relatorio:Pessoal;
  import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/componentes-padrao.css';import '/src/styles/escala.css';import '/src/styles/responsive-system.css';
  window.locais=${JSON.stringify(locais)};window.pessoas=${JSON.stringify(pessoas)};window.pedido=${JSON.stringify(solicitacao)};
  window.cadastrosExtras=${JSON.stringify(cadastrosExtras)};
  window.pedidos=[window.pedido,{id:56,codigo:'RHP-56',tipo:'MOVIMENTACAO',subtipo:'FERIAS',situacao:'ABERTA',obra_id:51,colaborador_id:13,colaborador:window.pessoas[2],obra:window.locais[1],dados_json:{},historicos:[]}];
  window.apuracao=${JSON.stringify(apuracao)};window.chamadas=[];window.envios=[];window.compartilhada=new URLSearchParams(location.search).has('compartilhada');
  createRoot(document.getElementById('root')).render(<BrowserRouter><ThemeContext.Provider value={{tema:TEMA_PADRAO}}><div className="fx-topbar" style={{position:'fixed',top:0,height:96}}/><main className="layout-main" style={{paddingTop:96}}><Routes><Route path="/fixture" element={<Page/>}/><Route path="/hub/:moduleId" element={<ModuleHub/>}/><Route path="/rh-dp/pessoal" element={<Pessoal/>}/></Routes></main></ThemeContext.Provider></BrowserRouter>);`;
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
      if (id.endsWith('/src/contexts/AuthContext.jsx')) return `import {createContext} from 'react';const dp=new URLSearchParams(location.search).has('dp')||sessionStorage.getItem('qaDp')==='1';if(dp)sessionStorage.setItem('qaDp','1');const readonly=new URLSearchParams(location.search).has('readonly');
        const user={id:2,perfil:new URLSearchParams(location.search).has('admin')?'SUPERADMIN':'USUARIO',area:dp?'DP':'OBRA',setor:{codigo:dp?'DP':'OBRA'},areas_permissoes_configuradas:true,modulos_habilitados:['RH_DP','FINANCEIRO'],
          areas_permissoes:readonly?['rh_dp.colaboradores.visualizar','rh_dp.solicitacoes.visualizar']:['rh_dp.colaboradores.visualizar','rh_dp.solicitacoes.visualizar','rh_dp.solicitacoes.abrir',...(dp?['rh_dp.colaboradores.editar','rh_dp.documentos.visualizar','rh_dp.relatorios.visualizar','rh_dp.eventos_recorrentes.visualizar','rh_dp.solicitacoes.ver_todas','rh_dp.apuracao.visualizar','rh_dp.apuracao.editar','rh_dp.fechamento.executar','rh_dp.obrigacoes.visualizar']:[])]};export const AuthContext=createContext({user});export const useAuth=()=>({user});`;
      if (id.endsWith('/src/services/rhDp.js')) return rhModule;
      if (id.endsWith('/src/services/obras.js')) return `export const getObras=async p=>{window.chamadas.push(['obras',p]);return window.locais;};export const getMinhasObras=async p=>{window.chamadas.push(['minhas',p]);return window.locais;};`;
      if (id.endsWith('/src/services/notificacoes.js')) return `export const getNotificacoes=async()=>({total_nao_lidas:0});`;
      if (id.endsWith('/src/services/setores.js')) return `export const getSetores=async()=>[];`;
      if (id.endsWith('/src/hooks/useUiVisibility.js')) return `export const useUiVisibility=()=>({isVisible:()=>true});`;
    },
    configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
      if (!['/fixture','/hub/rhdp','/rh-dp/pessoal'].includes(new URL(req.url, 'http://localhost').pathname)) return next();
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
    await page.getByRole('heading', { name: /Pessoal|Solicitações globais|Gestão de Colaboradores|Documentos|Relatório Operacional/ }).first().waitFor({ timeout: 30000 });
    return page;
  }
  const page = await abrir();
  await page.getByRole('button', { name: 'Abrir Obra QA', exact: true }).click();
  await page.getByRole('button', { name: 'Pedir admissao', exact: true }).click();
  const admissao = page.getByRole('dialog').last();
  await admissao.getByLabel('Empresa do grupo', { exact: true }).selectOption('4');
  assert.equal(await admissao.getByLabel('Empresa do grupo', { exact: true }).inputValue(), '4');
  assert.equal(await page.evaluate(() => window.chamadas.filter(c => c[0] === 'catalogo-admissao').length), 1);
  await admissao.getByRole('button', { name: /Cancelar|Fechar/, exact: true }).first().click();
  await admissao.waitFor({ state: 'hidden' });
  if (demissoes) {
    for (const width of [390, 1366]) {
      const local = await abrir('?local_id=7&aba=colaboradores', width);
      await local.getByText('Demissao pendente QA', { exact: true }).waitFor();
      await local.getByText('DEMITIDO', { exact: true }).waitFor();
      await local.getByText('Aguardando conclusão do DP', { exact: true }).waitFor();
      assert.equal(await local.getByRole('button', { name: 'Solicitar pagamento: Demissao pendente QA', exact: true }).count(), 0);
      assert.equal(await local.getByRole('button', { name: 'Pedir demissao: Demissao pendente QA', exact: true }).count(), 0);
      const selecao = local.getByLabel('Selecionar linha 25', { exact: true });
      assert((await selecao.count()) === 0 || await selecao.isDisabled(), 'Inativo nao entra em pagamento em lote');
      assert(await local.evaluate(() => window.chamadas.filter(c => c[0] === 'colaboradores').every(c => c[1].incluir_demissoes_pendentes === '1')));
      for (const nome of cadastrosExtras.filter(c => c.id !== 25).map(c => c.nome)) assert.equal(await local.getByText(nome, { exact: true }).count(), 0);
      await local.getByText('Demissao pendente QA', { exact: true }).scrollIntoViewIfNeeded();
      const statusBox = await local.getByText('Aguardando conclusão do DP', { exact: true }).boundingBox();
      assert(statusBox.x + statusBox.width <= width, 'Situacao pendente nao ultrapassa o viewport');
      await local.screenshot({ path: path.join(output, `demissao-lista-${width}.png`) });
      await local.evaluate(() => { window.cadastrosExtras.find(c => c.id === 25).demissao_pendente_conclusao = false; });
      await local.getByRole('button', { name: 'Atualizar', exact: true }).click();
      await local.getByText('Demissao pendente QA', { exact: true }).waitFor({ state: 'hidden' });
    }
    assert.deepEqual(errors, []);
    console.log('Lista real da obra: demitido pendente visivel ate conclusao/releitura, demais inativos ausentes, sem pagamento individual/lote ou nova demissao; opt-in da consulta, 390/1366 aprovados.');
  } else if (process.argv.includes('--admissao')) {
    assert.deepEqual(errors, []);
    console.log('Admissao OBRA sem gestao de empresas: catalogo completo, selecao e fechamento sem criar rascunho aprovados.');
  } else if (process.argv.includes('--movimentacoes')) {
    const novos = SUBTIPOS_MOVIMENTACAO.slice(-3);
    for (const largura of [1366, 390]) {
      const movimento = await abrir('?local_id=7&aba=colaboradores', largura);
      for (const sub of novos) {
        await movimento.getByRole('button', { name: 'Movimentacoes: Ana QA', exact: true }).click();
        const dialog = movimento.getByRole('dialog').last();
        await dialog.getByLabel(/Tipo da movimentacao/).selectOption(sub.valor);
        assert.equal(await dialog.getByRole('option', { name: sub.rotulo, exact: true }).count(), 1);
        await dialog.getByText(sub.orientacao, { exact: true }).waitFor();
        if (sub.valor === 'ACIDENTE_TRABALHO_CAT') await dialog.getByLabel('Relato do acidente', { exact: true }).fill('Relato interno QA do acidente na obra.');
        const arquivo = indice => ({ name: `${sub.valor}-assinado-${indice}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-fixture') });
        await dialog.getByLabel('Arquivo', { exact: true }).first().setInputFiles(arquivo(1));
        await dialog.getByRole('button', { name: 'Acrescentar arquivo', exact: true }).click();
        await dialog.getByLabel('Arquivo', { exact: true }).nth(1).setInputFiles(arquivo(2));
        if (sub.valor === 'ACIDENTE_TRABALHO_CAT') await dialog.screenshot({ path: path.join(output, `movimentacao-cat-${largura}.png`) });
        const antes = await movimento.evaluate(() => window.chamadas.filter(c => c[0] === 'criar-rascunho').length);
        await dialog.getByRole('button', { name: 'Criar rascunho', exact: true }).evaluate(el => { el.click(); el.click(); });
        await dialog.waitFor({ state: 'hidden' });
        const chamadas = await movimento.evaluate(() => window.chamadas);
        const criacoes = chamadas.filter(c => c[0] === 'criar-rascunho');
        assert.equal(criacoes.length, antes + 1, 'Duplo clique cria somente um pedido');
        const dados = criacoes.at(-1)[1];
        assert.equal(dados.tipo, 'MOVIMENTACAO'); assert.equal(dados.subtipo, sub.valor); assert.equal(dados.colaborador_id, 11); assert.equal(dados.obra_id, 7);
        if (sub.valor === 'ACIDENTE_TRABALHO_CAT') assert.equal(dados.justificativa, 'Relato interno QA do acidente na obra.');
        const arquivos = chamadas.filter(c => c[0] === 'anexar-movimentacao').slice(-2);
        assert.equal(arquivos.length, 2); assert(arquivos.every(c => c[1] === 88 && c[3].startsWith(sub.valor)));
      }
      await movimento.evaluate(novos => {
        window.pedidos = novos.map((sub, i) => ({ id: 101 + i, codigo: `RH-${101 + i}`, tipo: 'MOVIMENTACAO', subtipo: sub.valor,
          obra_id: 7, obra: window.locais[0], colaborador_id: 11, colaborador: window.pessoas[0], situacao: 'ABERTA',
          justificativa: 'Relato interno QA do acidente na obra.', dados_json: {}, historicos: [] }));
      }, novos);
      await movimento.getByRole('tab', { name: 'Solicitações', exact: true }).click();
      for (const [indice, sub] of novos.entries()) {
        await movimento.getByText(sub.rotulo, { exact: true }).waitFor();
        await movimento.evaluate(id => { window.pedido = window.pedidos.find(p => p.id === id); }, 101 + indice);
        await movimento.getByRole('button', { name: `Abrir: solicitação #${101 + indice}`, exact: true }).click();
        const detalhe = movimento.getByRole('dialog').last();
        await detalhe.getByText(`Movimentacao · ${sub.rotulo}`, { exact: true }).waitFor();
        if (sub.valor === 'ACIDENTE_TRABALHO_CAT') await detalhe.getByText('Relato do acidente', { exact: true }).waitFor();
        await detalhe.getByRole('button', { name: 'Fechar', exact: true }).first().click();
      }
      const consulta = await abrir('?readonly=1&local_id=7&aba=colaboradores', largura);
      await consulta.getByText('Ana QA', { exact: true }).waitFor();
      assert.equal(await consulta.getByRole('button', { name: 'Movimentacoes: Ana QA', exact: true }).count(), 0);
    }
    assert.deepEqual(errors, []);
    console.log('Movimentacoes RH desktop/mobile: tres tipos, orientacoes/relato CAT, dois PDFs por pedido, payload/obra/colaborador, duplo clique e somente leitura aprovados. Fixtures locais.');
  } else {
  await page.getByRole('button', { name: 'Solicitar pagamento: Ana QA', exact: true }).waitFor();
  assert.deepEqual(await page.getByRole('tab').allTextContents(), ['Colaboradores', 'Solicitações', 'Transferências entre obras']);
  assert.ok(await page.evaluate(() => window.chamadas.some(c => c[0] === 'minhas' && c[1].escopo === 'TODOS')));
  assert.ok(await page.evaluate(() => window.chamadas.filter(c => c[0] === 'colaboradores').every(c => Number(c[1].obra_id) === 7)));
  assert.ok(await page.evaluate(() => window.chamadas.filter(c => c[0] === 'colaboradores').every(c => c[1].status === 'ATIVO')));
  for (const nome of ['Caio QA', ...cadastrosExtras.map(item => item.nome)]) {
    assert.equal(await page.getByText(nome, { exact: true }).count(), 0, 'Card da obra exclui inativos, afastados e outros locais');
  }
  // O botao individual ignora inclusive uma selecao diferente feita na tabela.
  await page.getByLabel('Selecionar linha 12', { exact: true }).check();
  await page.getByRole('button', { name: 'Solicitar pagamento: Ana QA', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Solicitar pagamento', exact: true });
  await modal.getByLabel('Dias: Ana QA', { exact: true }).fill('5');
  assert.equal(await modal.getByLabel('Dias: Beatriz QA', { exact: true }).count(), 0, 'Individual nao carrega outros colaboradores');
  await modal.getByLabel('Conferido: Ana QA', { exact: true }).check();
  await modal.screenshot({ path: path.join(output, 'pagamento-individual-solicitacao.png') });
  await modal.getByRole('button', { name: 'Solicitar pagamento', exact: true }).click();
  await page.getByRole('dialog', { name: 'Solicitar pagamento ao DP', exact: true })
    .getByRole('button', { name: 'Solicitar pagamento', exact: true }).click();
  await page.waitForFunction(() => window.envios.length === 1);
  assert.deepEqual(await page.evaluate(() => window.envios[0].linhas.filter(l => l.selecionado).map(l => l.colaborador_id)), [11]);
  await modal.getByRole('button', { name: 'Fechar', exact: true }).click();
  await modal.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Solicitar pagamento', exact: true }).click();
  await modal.getByLabel('Dias: Beatriz QA', { exact: true }).waitFor();
  assert.equal(await modal.getByLabel('Dias: Ana QA', { exact: true }).count(), 0, 'Botao geral usa somente os marcados');
  assert.deepEqual(await page.evaluate(() => window.pagamento.dados_json.linhas.map(l => l.colaborador_id)), [12]);
  await modal.getByRole('button', { name: 'Fechar', exact: true }).click();
  await modal.waitFor({ state: 'hidden' });
  await page.getByLabel('Nome, CPF ou matricula', { exact: true }).fill('Ana');
  await page.getByRole('button', { name: 'Solicitar pagamento: Beatriz QA', exact: true }).waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Solicitar pagamento', exact: true }).click();
  await modal.getByLabel('Dias: Beatriz QA', { exact: true }).waitFor();
  assert.equal(await modal.getByLabel('Dias: Ana QA', { exact: true }).count(), 0, 'Busca nao perde marcacao oculta');
  await modal.getByRole('button', { name: 'Fechar', exact: true }).click();
  await modal.waitFor({ state: 'hidden' });
  await page.getByLabel('Nome, CPF ou matricula', { exact: true }).fill('');
  await page.getByLabel('Selecionar linha 12', { exact: true }).waitFor();
  await page.getByLabel('Selecionar linha 12', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Solicitar pagamento', exact: true }).click();
  await modal.getByLabel('Dias: Ana QA', { exact: true }).waitFor();
  assert.equal(await modal.getByLabel('Dias: Beatriz QA', { exact: true }).count(), 1, 'Sem selecao abre todos do local');
  await modal.getByLabel('Selecionar todos', { exact: true }).check();
  await modal.getByLabel('Aplicar aos selecionados').selectOption('conferir');
  await modal.getByRole('button', { name: 'Solicitar pagamento', exact: true }).click();
  await page.getByRole('dialog', { name: 'Solicitar pagamento ao DP', exact: true })
    .getByRole('button', { name: 'Solicitar pagamento', exact: true }).click();
  await page.waitForFunction(() => window.envios.length === 2);
  assert.deepEqual(await page.evaluate(() => window.envios[1].linhas.filter(l => l.selecionado).map(l => l.colaborador_id)), [11, 12]);
  await modal.getByRole('button', { name: 'Fechar', exact: true }).click();
  await modal.waitFor({ state: 'hidden' });
  await page.getByRole('checkbox', { name: 'Selecionar todos', exact: true }).check();
  await page.getByRole('button', { name: 'Solicitar pagamento', exact: true }).click();
  await modal.getByLabel('Dias: Ana QA', { exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.pagamento.dados_json.linhas.map(l => l.colaborador_id)), [11, 12]);
  assert.ok(await page.evaluate(() => window.pagamento.dados_json.linhas.every(l => l.selecionado)));
  await modal.getByRole('button', { name: 'Fechar', exact: true }).click();
  await modal.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Voltar para Obras', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir Escritório QA', exact: true }).click();
  await page.getByRole('button', { name: 'Solicitar pagamento: Caio QA', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Solicitar pagamento: Ana QA', exact: true }).count(), 0);
  assert.equal(await page.getByText('Inativo escritório QA', { exact: true }).count(), 0);
  assert.equal(await page.getByLabel('Selecionar linha 13', { exact: true }).isChecked(), false, 'Troca de local limpa selecao');
  await page.getByRole('button', { name: 'Solicitar pagamento', exact: true }).click();
  await modal.getByLabel('Dias: Caio QA', { exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.pagamento.dados_json.linhas.map(l => l.colaborador_id)), [13]);
  await modal.getByRole('button', { name: 'Fechar', exact: true }).click();
  await modal.waitFor({ state: 'hidden' });
  await page.getByRole('tab', { name: 'Solicitações', exact: true }).click();
  await page.getByRole('button',{name:'Abrir: solicitação #56',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Abrir: solicitação #55',exact:true}).count(),0,'OBRA ve somente solicitacoes do local');
  const cadastroGlobal = await abrir('?dp=1&aba=colaboradores');
  await cadastroGlobal.getByText('Inativo obra QA', { exact: true }).waitFor();
  for (const item of cadastrosExtras) await cadastroGlobal.getByText(item.nome, { exact: true }).waitFor();
  for (const item of cadastrosExtras) assert.ok(await cadastroGlobal.getByLabel(`Selecionar linha ${item.id}`, { exact: true }).isDisabled());
  await cadastroGlobal.getByLabel('Selecionar linha 11', { exact: true }).check();
  await cadastroGlobal.getByLabel('Selecionar linha 13', { exact: true }).check();
  await cadastroGlobal.getByRole('button', { name: 'Solicitar pagamento', exact: true }).click();
  await cadastroGlobal.getByText('Selecione colaboradores da mesma obra ou centro de custo para solicitar pagamento.', { exact: true }).waitFor();
  assert.equal(await cadastroGlobal.getByRole('dialog', { name: 'Solicitar pagamento', exact: true }).count(), 0, 'Nao mistura obras');
  assert.ok(await cadastroGlobal.evaluate(() => window.chamadas.filter(c => c[0] === 'colaboradores').every(c => !c[1].status)),
    'Cadastro geral do DP preserva consulta a inativos, afastados e sem local');
  const dpLocais = await abrir('?dp=1');
  await dpLocais.getByRole('button',{name:'Abrir Obra QA',exact:true}).waitFor();
  assert.equal(await dpLocais.getByRole('button',{name:'Abrir: solicitação #56',exact:true}).count(),0,'Porta de obras abre cards, nao solicitacoes globais');
  await dpLocais.getByRole('button',{name:'Solicitações de todas as obras',exact:true}).click();
  await dpLocais.getByRole('button', { name: 'Abrir: solicitação #55', exact: true }).waitFor();
  await dpLocais.getByRole('button', { name: 'Abrir: solicitação #56', exact: true }).waitFor();
  assert.ok(await dpLocais.evaluate(()=>window.chamadas.filter(c=>c[0]==='solicitacoes').every(c=>!c[1].obra_id)), 'DP entra em solicitacoes globais');
  await dpLocais.screenshot({path:path.join(output,'dp-solicitacoes-globais.png'),fullPage:true});
  await dpLocais.getByRole('button', { name: 'Obras / Centros de Custo', exact: true }).click();
  await dpLocais.getByRole('button', { name: 'Abrir Obra QA', exact: true }).click();
  await dpLocais.getByText('Ana QA', { exact: true }).waitFor();
  assert.equal(await dpLocais.getByText('Caio QA',{exact:true}).count(),0,'Não mostra linhas globais durante a troca de local');
  for (const pessoa of cadastrosExtras) assert.equal(await dpLocais.getByText(pessoa.nome,{exact:true}).count(),0);
  assert.deepEqual(await dpLocais.getByRole('tab').allTextContents(), ['Colaboradores','Solicitações','Transferências entre obras','Eventos recorrentes','Documentos','Relatórios']);
  await dpLocais.screenshot({ path: path.join(output,'dp-local-seis-abas.png'),fullPage:true });
  await dpLocais.getByRole('button', { name: 'Editar cadastro: Ana QA', exact: true }).click();
  const editor = dpLocais.getByRole('dialog', { name: 'Detalhe do colaborador', exact: true });
  await editor.getByRole('button', { name: 'Salvar alteracoes', exact: true }).waitFor();
  await editor.screenshot({ path: path.join(output,'dp-editor-no-local.png') });
  // Os campos reais mantêm a validação e o mesmo PATCH; o modal não troca o local na URL.
  await editor.getByLabel('Cargo', { exact:true }).fill('Cargo ajustado QA');
  await editor.getByRole('button', { name: 'Salvar alteracoes', exact: true }).click();
  await editor.locator('form#rh-colaborador-form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  await dpLocais.waitForFunction(() => window.chamadas.some(c=>c[0]==='salvar-cadastro'));
  await dpLocais.getByText('Colaborador salvo.', { exact: true }).waitFor();
  assert.equal(await dpLocais.evaluate(()=>window.chamadas.filter(c=>c[0]==='salvar-cadastro').length),1,'Bloqueio síncrono de duplo envio');
  assert.equal(await dpLocais.evaluate(()=>window.chamadas.find(c=>c[0]==='salvar-cadastro')[2].cargo),'Cargo ajustado QA');
  assert.ok(dpLocais.url().includes('local_id=7') && dpLocais.url().includes('aba=colaboradores'));
  assert.ok(!dpLocais.url().includes('colaborador_id='));
  await editor.getByRole('button', { name: 'Cancelar edicao', exact: true }).click();
  await dpLocais.getByRole('tab', { name: 'Documentos', exact: true }).click();
  await dpLocais.getByText('Documento Ana QA', { exact: true }).waitFor();
  assert.equal(await dpLocais.getByText('Documento Caio QA', { exact: true }).count(), 0);
  assert.ok(await dpLocais.evaluate(()=>window.chamadas.filter(c=>c[0]==='documentos'&&!c[1].colaborador_id).every(c=>Number(c[1].obra_id)===7)));
  await dpLocais.getByRole('tab', { name: 'Relatórios', exact: true }).click();
  await dpLocais.waitForFunction(()=>window.chamadas.some(c=>c[0]==='relatorio'));
  await dpLocais.getByRole('button', { name: 'Limpar', exact: true }).click();
  await dpLocais.getByRole('button', { name: 'Atualizar relatório', exact: true }).click();
  assert.ok(await dpLocais.evaluate(()=>window.chamadas.filter(c=>c[0]==='relatorio').every(c=>Number(c[1].obra_id)===7)));
  await dpLocais.getByRole('tab', { name: 'Eventos recorrentes', exact: true }).click();
  await dpLocais.waitForFunction(()=>window.chamadas.some(c=>c[0]==='eventos'&&Number(c[1].obra_id)===7));
  await dpLocais.getByRole('tab', { name: 'Transferências entre obras', exact: true }).click();
  await dpLocais.waitForFunction(()=>window.chamadas.some(c=>c[0]==='transferencias'&&c[1]===''&&Number(c[2].params.obra_id)===7));
  await dpLocais.getByRole('button', { name: 'Voltar para Obras', exact: true }).click();
  await dpLocais.getByRole('button', { name: 'Abrir Escritório QA', exact: true }).click();
  await dpLocais.getByText('Caio QA', { exact: true }).waitFor();
  await dpLocais.getByRole('tab', { name: 'Documentos', exact: true }).click();
  await dpLocais.getByText('Documento Caio QA', { exact: true }).waitFor();
  await dpLocais.getByRole('tab', { name: 'Transferências entre obras', exact: true }).click();
  await dpLocais.getByRole('tab', { name: 'Transferências deste local', exact: true }).waitFor();
  await dpLocais.waitForFunction(()=>window.chamadas.some(c=>c[0]==='transferencias'&&Number(c[2]?.params?.obra_id)===51));
  assert.equal(await dpLocais.getByText('Transferências disponíveis somente entre obras.', { exact: true }).count(), 0);
  const documentosGlobais = await abrir('?dp=1&global=docs');
  await documentosGlobais.getByText('Documento Caio QA', { exact: true }).waitFor();
  await documentosGlobais.getByText('Documento Ana QA', { exact: true }).waitFor();
  assert.ok(await documentosGlobais.evaluate(()=>window.chamadas.filter(c=>c[0]==='documentos').every(c=>!c[1].obra_id)));
  const relatorioGlobal = await abrir('?dp=1&global=relatorio');
  await relatorioGlobal.waitForFunction(()=>window.chamadas.some(c=>c[0]==='relatorio'));
  assert.ok(await relatorioGlobal.evaluate(()=>window.chamadas.filter(c=>c[0]==='relatorio').every(c=>!c[1].obra_id)));
  const semAtivos = await abrir('?local_id=7&aba=colaboradores');
  await semAtivos.getByText('Ana QA', { exact: true }).waitFor();
  await semAtivos.getByLabel('Selecionar linha 11', { exact: true }).check();
  await semAtivos.evaluate(() => window.pessoas.filter(item => item.obra_id === 7).forEach(item => { item.status = 'INATIVO'; }));
  await semAtivos.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await semAtivos.getByText('Nenhum colaborador nesta obra.', { exact: true }).waitFor();
  const dp = await abrir('?dp=1&local_id=7&aba=solicitacoes');
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
  await mobile.getByLabel('Selecionar', { exact: true }).check();
  await mobile.getByRole('button', { name: 'Solicitar pagamento', exact: true }).click();
  const modalMobile = mobile.getByRole('dialog', { name: 'Solicitar pagamento', exact: true });
  await modalMobile.getByLabel('Dias: Caio QA', { exact: true }).waitFor();
  await modalMobile.screenshot({ path: path.join(output, 'pagamento-selecionados-mobile.png') });
  const dpMobile = await abrir('?dp=1',390);
  await dpMobile.getByRole('button',{name:'Abrir Escritório QA',exact:true}).waitFor();
  await dpMobile.getByRole('button',{name:'Solicitações de todas as obras',exact:true}).click();
  await dpMobile.getByRole('button',{name:'Abrir: solicitação #56',exact:true}).waitFor();
  await dpMobile.getByRole('button',{name:'Obras / Centros de Custo',exact:true}).click();
  await dpMobile.getByRole('button',{name:'Abrir Escritório QA',exact:true}).click();
  await dpMobile.getByRole('button',{name:'Editar cadastro: Caio QA',exact:true}).click();
  await dpMobile.getByRole('dialog',{name:'Detalhe do colaborador',exact:true}).waitFor();
  await dpMobile.getByRole('dialog',{name:'Detalhe do colaborador',exact:true}).getByRole('button',{name:'Salvar alteracoes',exact:true}).scrollIntoViewIfNeeded();
  assert.ok(await dpMobile.getByRole('dialog',{name:'Detalhe do colaborador',exact:true}).getByRole('button',{name:'Salvar alteracoes',exact:true}).isVisible());
  await dpMobile.screenshot({ path:path.join(output,'dp-editor-mobile.png'),fullPage:true });
  assert.ok(await dpMobile.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Sem transbordamento global no celular');
  await dpMobile.getByRole('dialog',{name:'Detalhe do colaborador',exact:true}).getByRole('button',{name:'Fechar',exact:true}).click();
  await dpMobile.getByRole('tab',{name:'Relatórios',exact:true}).click();
  await dpMobile.waitForFunction(()=>window.chamadas.some(c=>c[0]==='relatorio'&&Number(c[1].obra_id)===51));
  await dpMobile.screenshot({path:path.join(output,'dp-relatorio-local-mobile.png'),fullPage:true});
  await dpMobile.getByRole('button',{name:'Solicitações de todas as obras',exact:true}).click();
  await dpMobile.getByRole('button',{name:'Abrir: solicitação #55',exact:true}).waitFor();
  await dpMobile.getByRole('button',{name:'Abrir: solicitação #56',exact:true}).waitFor();
  assert.equal(new URL(dpMobile.url()).searchParams.has('local_id'),false,'Visao global remove somente o recorte local');
  await dpMobile.screenshot({path:path.join(output,'dp-solicitacoes-globais-mobile.png'),fullPage:true});
  assert.ok(await dpMobile.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Lista global sem transbordamento');
  const admin = await abrir('?admin=1&visao=global&aba=solicitacoes');
  await admin.getByRole('button',{name:'Abrir: solicitação #56',exact:true}).waitFor();
  const acompanhamento = await abrir('?dp=1&local_id=7&aba=colaboradores');
  await acompanhamento.getByRole('button',{name:'Acompanhar solicitacoes de Ana QA',exact:true}).click();
  const pedidos = acompanhamento.getByRole('dialog',{name:'Solicitacoes do colaborador',exact:true});
  await pedidos.getByText('JORNADA',{exact:true}).waitFor();
  await pedidos.getByRole('button',{name:'Abrir detalhes',exact:true}).click();
  await acompanhamento.getByRole('dialog',{name:'Jornada RHP-55',exact:true}).waitFor();
  const salario = await abrir('?admin=1&local_id=7&aba=colaboradores');
  await salario.getByRole('button',{name:'Movimentacoes: Ana QA',exact:true}).click();
  const movimentacao = salario.getByRole('dialog',{name:'Movimentacao',exact:true});
  await movimentacao.getByLabel(/Tipo da movimentacao/).selectOption('ALTERACAO_SALARIAL');
  await movimentacao.getByLabel(/Novo salario/).fill('188100');
  await movimentacao.getByLabel(/Vale a partir de/).fill('01/06/2020');
  await movimentacao.getByLabel(/^Motivo/).fill('Ajuste QA');
  await movimentacao.getByRole('button',{name:'Criar rascunho',exact:true}).click();
  await salario.waitForFunction(()=>window.chamadas.some(c=>c[0]==='criar-rascunho'));
  assert.equal(await salario.evaluate(()=>window.chamadas.find(c=>c[0]==='criar-rascunho')[1].dados.novo_salario),1881,'Moeda BR enviada como numero');
  await movimentacao.waitFor({state:'hidden'});
  await salario.getByRole('button',{name:'Editar cadastro: Ana QA',exact:true}).click();
  const salarioEditor = salario.getByRole('dialog',{name:'Detalhe do colaborador',exact:true});
  await salarioEditor.getByLabel('Salário base',{exact:true}).fill('188100');
  await salarioEditor.getByLabel('Vigência do salário',{exact:true}).fill('01/06/2020');
  await salarioEditor.getByLabel('Motivo do ajuste salarial',{exact:true}).fill('Ajuste direto QA');
  await salarioEditor.getByRole('button',{name:'Salvar alteracoes',exact:true}).click();
  await salarioEditor.locator('form#rh-colaborador-form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  await salario.waitForFunction(()=>window.chamadas.some(c=>c[0]==='salvar-cadastro'));
  const salarioPayload = await salario.evaluate(()=>window.chamadas.find(c=>c[0]==='salvar-cadastro')[2]);
  assert.equal(salarioPayload.salario_vigencia_inicio,'2020-06-01');
  assert.equal(salarioPayload.salario_motivo,'Ajuste direto QA');
  assert.equal(await salario.evaluate(()=>window.chamadas.filter(c=>c[0]==='salvar-cadastro').length),1,'Salario direto bloqueia duplo envio');
  await salario.screenshot({path:path.join(output,'superadmin-salario-vigencia.png'),fullPage:true});
  await salario.setViewportSize({width:390,height:900});
  await salarioEditor.getByLabel('Vigência do salário',{exact:true}).scrollIntoViewIfNeeded();
  await salario.screenshot({path:path.join(output,'superadmin-salario-vigencia-mobile.png'),fullPage:true});
  assert.ok(await salario.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Editor salarial responsivo');
  const dpSalario = await abrir('?dp=1&local_id=7&aba=colaboradores');
  await dpSalario.getByRole('button',{name:'Editar cadastro: Ana QA',exact:true}).click();
  const editorDp = dpSalario.getByRole('dialog',{name:'Detalhe do colaborador',exact:true});
  assert.equal(await editorDp.getByLabel('Salário base',{exact:true}).isDisabled(),true,'DP nao ganha edicao direta salarial');
  assert.equal(await editorDp.getByLabel('Vigência do salário',{exact:true}).count(),0);
  const dpLeitura = await abrir('?dp=1&readonly=1&local_id=7&aba=colaboradores');
  await dpLeitura.getByText('Ana QA',{exact:true}).waitFor();
  assert.equal(await dpLeitura.getByRole('button',{name:'Editar cadastro: Ana QA',exact:true}).count(),0);
  assert.equal(await dpLeitura.getByRole('tab',{name:'Documentos',exact:true}).count(),0);
  assert.equal(await dpLeitura.getByRole('tab',{name:'Relatórios',exact:true}).count(),0);
  const readonly = await abrir('?readonly=1');
  await readonly.getByRole('button', { name: 'Abrir Obra QA', exact: true }).click();
  await readonly.getByText('Ana QA', { exact: true }).waitFor();
  assert.equal(await readonly.getByRole('button', { name: 'Solicitar pagamento', exact: true }).count(), 0);
  assert.equal(await readonly.getByLabel('Selecionar linha 11', { exact: true }).count(), 0);
  // Percurso real pelo hub solicitado: o link de locais nao pode cair na
  // lista global, e a aba do local nunca deve listar outra obra/centro.
  for (const largura of [1366, 390]) {
    const hub = await abrir('?dp=1', largura);
    await hub.goto(base.replace('/fixture','/hub/rhdp')+'?dp=1',{waitUntil:'domcontentloaded'});
    await hub.getByRole('heading',{name:'Colaboradores',exact:true}).waitFor();
    const cardGlobal = hub.getByRole('link',{name:/^Solicitações globais —/});
    const cardLocais = hub.getByRole('link',{name:/^Obras \/ Centros de Custo —/});
    assert.equal(await cardLocais.getAttribute('href'),'/rh-dp/pessoal');
    assert.equal(await cardGlobal.getAttribute('href'),'/rh-dp/pessoal?visao=global&aba=solicitacoes');
    await cardGlobal.focus();
    await hub.screenshot({path:path.join(output,`hub-global-locais-${largura}.png`),fullPage:true});
    await hub.keyboard.press('Enter');
    await hub.getByRole('heading',{name:'Solicitações globais',exact:true}).waitFor();
    await hub.getByRole('button',{name:'Abrir: solicitação #55',exact:true}).waitFor();
    await hub.getByRole('button',{name:'Abrir: solicitação #56',exact:true}).waitFor();
    assert.equal(new URL(hub.url()).searchParams.has('local_id'),false);
    await hub.reload({waitUntil:'domcontentloaded'});
    // O login da fixture deve permanecer DP ao recarregar como na sessao real.
    await hub.getByRole('button',{name:'Abrir: solicitação #56',exact:true}).waitFor();
    await hub.goBack();
    await hub.getByRole('link',{name:/^Obras \/ Centros de Custo —/}).click();
    await hub.getByRole('button',{name:'Abrir Obra QA',exact:true}).waitFor();
    assert.equal(await hub.getByRole('button',{name:'Abrir: solicitação #55',exact:true}).count(),0);
    await hub.getByRole('button',{name:'Abrir Obra QA',exact:true}).click();
    await hub.getByText('Ana QA',{exact:true}).waitFor();
    await hub.getByRole('tab',{name:'Solicitações',exact:true}).click();
    await hub.getByRole('button',{name:'Abrir: solicitação #55',exact:true}).waitFor();
    assert.equal(await hub.getByRole('button',{name:'Abrir: solicitação #56',exact:true}).count(),0);
    await hub.getByRole('button',{name:'Voltar para Obras',exact:true}).click();
    await hub.getByRole('button',{name:'Abrir Escritório QA',exact:true}).click();
    await hub.getByText('Caio QA',{exact:true}).waitFor();
    await hub.getByRole('tab',{name:'Solicitações',exact:true}).click();
    await hub.getByRole('button',{name:'Abrir: solicitação #56',exact:true}).waitFor();
    assert.equal(await hub.getByRole('button',{name:'Abrir: solicitação #55',exact:true}).count(),0);
    await hub.screenshot({path:path.join(output,`centro-solicitacoes-${largura}.png`),fullPage:true});
    assert.ok(await hub.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
  }
  await page.screenshot({ path: path.join(output, `local-${gerencial ? 'gerencial' : etapas ? 'etapas' : 'legado'}.png`), fullPage: true });
  await dp.screenshot({ path: path.join(output, 'dp-modal.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('Colaboradores por local: seis abas DP, edição cadastral, documentos/relatórios locais e globais, escopos negativos, centros/obras, mobile e pagamento/conferência/fechamento validados (' + (gerencial ? 'gerencial' : etapas ? 'etapas' : 'legado') + ').');
  }
} catch (error) {
  console.error('Erros JavaScript da fixture:', errors);
  for (const page of pages) if (!page.isClosed()) console.error('Tela:', page.url(), (await page.locator('body').innerText()).slice(0, 3000));
  throw error;
} finally { await browser?.close();await server.close(); }
