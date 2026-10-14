import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = `import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';
import Tela from '/src/pages/RhDpTransferencias.jsx';
createRoot(document.getElementById('root')).render(<MemoryRouter><main className="layout-main" style={{padding:16,minWidth:0}}><Tela/></main></MemoryRouter>);`;
const mocks = `const obras=[{id:1,nome:'Obra de origem',codigo:'101',tipo_centro_custo:'OBRA'},{id:2,nome:'Obra de destino',codigo:'102',tipo_centro_custo:'OBRA'},{id:3,nome:'Centro Administrativo',codigo:'103',tipo_centro_custo:'CENTRO_CUSTO'}];
const s={id:10,colaborador:{id:7,nome:'Ana Teste'},obra:obras[0],obra_id:1,obra_destino_id:2,obra_destino_nome:obras[1].nome,
obra_aprovadora_id:1,situacao:'ABERTA',nao_lida:true,pode_decidir:true,pode_cancelar:false,atividade_em:'2026-09-18T15:00:00Z',historicos:[{id:1,descricao:'Transferência solicitada',usuario_id:22,createdAt:'2026-09-18T15:00:00Z'}]};
const colaboradores=Array.from({length:51},(_,i)=>({id:i+7,nome:i===0?'Ana Teste':i===1?'Sem Local':i===2?'Outra Obra':i===50?'Zilda Teste':'Colaborador '+String(i).padStart(2,'0'),matricula:'M'+(i+7),cargo:'Pedreira',obra_id:i===1?null:i===2?2:1,obra:i===1?null:obras[i===2?1:0]}));
export async function rhTransferencias(path='',opts={}){
if(path==='/leituras')return {};
if(path==='/configuracao')return {obras,obras_responsavel_ids:location.search?[]:[1],obras_solicitacao_ids:location.search.includes('comum')?[1]:location.search.includes('dp')?[1,2,3]:[1],transferencia_administrativa:location.search.includes('dp'),bypass_decisao:location.search.includes('dp'),acesso_global:location.search.includes('dp')};
if(path==='/diretorio'){
const busca=String(opts.params?.busca||'').toLowerCase();const pagina=Number(opts.params?.pagina||1);
window.consultasDiretorio=[...(window.consultasDiretorio||[]),{busca,pagina}];
const itens=colaboradores.filter(c=>[c.nome,c.matricula,c.cargo].some(v=>v.toLowerCase().includes(busca)));
return {itens:itens.slice((pagina-1)*50,pagina*50),total:itens.length,pagina};}
if(opts.method==='POST'){window.envios=(window.envios||[]);window.envios.push({path,...opts});await new Promise(r=>setTimeout(r,200));return {id:10};}
if(path==='/10')return {...s,pode_decidir:!location.search.includes('comum')};
if(location.search.includes('filtros')){
 const p=opts.params||{};window.consultasLista=[...(window.consultasLista||[]),structuredClone(p)];
 const status=String(p.situacoes||'').split(',').filter(Boolean);
 const registros=Array.from({length:43},(_,i)=>({...s,id:i+100,
 colaborador:{id:i+7,nome:i===0?'Ana Teste':'Colaborador filtro '+i},
 situacao:i%2?'APROVADA':'ABERTA',obra_id:i===42?2:1,obra_destino_id:i%3===0?3:2,
 obra_destino_nome:obras[i%3===0?2:1].nome}));
 const itens=registros.filter(r=>(!status.length||status.includes(r.situacao))&&(!p.origem_id||r.obra_id===Number(p.origem_id))
 &&(!p.destino_id||r.obra_destino_id===Number(p.destino_id))&&(!p.busca||r.colaborador.nome.toLowerCase().includes(p.busca.toLowerCase())));
 if(p.busca==='Antiga'){await new Promise(r=>setTimeout(r,1200));window.antigaTerminou=true;}
 const pagina=Number(p.pagina||1),limite=20;
 return {itens:itens.slice((pagina-1)*limite,pagina*limite),total:itens.length,pagina,total_paginas:Math.max(1,Math.ceil(itens.length/limite)),nao_lidas:0};
}
return {itens:[s],total:1,pagina:1,total_paginas:1,nao_lidas:1};}`;
const server = await createServer({ root, configFile: false, logLevel: 'error', server: { host: '127.0.0.1', port: 0 },
  plugins: [{ name: 'fixture-rh-transferencia', enforce: 'pre',
    resolveId(id) { if (id === '/fixture.jsx') return '\0fixture-rh-transferencia.jsx'; },
    async load(id) { if (id === '\0fixture-rh-transferencia.jsx') return transformWithEsbuild(fixture, 'fixture.jsx', { loader: 'jsx', jsx: 'transform' }); },
    transform(code, id) { if (id.endsWith('/src/services/rhDp.js')) return mocks; },
    configureServer(s) { s.middlewares.use(async (req, res, next) => {
      if (req.url.split('?')[0] !== '/fixture') return next();
      res.setHeader('Content-Type', 'text/html');
      res.end(await s.transformIndexHtml('/fixture', '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
    }); }
  }, react()], optimizeDeps: { include: ['react', 'react-dom/client', 'react-router-dom'] } });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/fixture`);
  const css = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8').match(/href="\/assets\/([^\"]+\.css)"/)[1];
  await page.addStyleTag({ path: path.join(root, 'dist/assets', css) });
  const diretorio = page.getByRole('region', { name: 'Todos Colaboradores' });
  await diretorio.getByText('51 colaborador(es) · Página 1 de 2').waitFor();
  await diretorio.getByText('Ana Teste').waitFor();
  assert.deepEqual((await page.evaluate(() => window.consultasDiretorio))[0], { busca: '', pagina: 1 }, 'Diretório deve carregar automaticamente sem busca');
  await diretorio.getByRole('button', { name: 'Próxima' }).click();
  await diretorio.getByText('Zilda Teste').waitFor();
  await diretorio.getByText('51 colaborador(es) · Página 2 de 2').waitFor();
  await diretorio.getByRole('button', { name: 'Anterior' }).click();
  await diretorio.getByText('Ana Teste').waitFor();
  await page.getByRole('tab', { name: /Transferências das minhas obras|Transferências deste local|Todas as transferências/ }).click();
  await page.getByRole('button', { name: 'Abrir', exact: true }).click();
  await page.getByRole('button', { name: 'Aprovar transferência', exact: true }).click();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  assert.equal(await page.evaluate(() => (window.envios || []).length), 0, 'Cancelar confirmacao nao deve aprovar');
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('tab', { name: 'Todos Colaboradores', exact: true }).click();
  await diretorio.getByRole('textbox', { name: 'Nome, matrícula ou função' }).fill('Ana');
  await page.getByRole('button', { name: 'Pesquisar', exact: true }).click();
  await diretorio.getByText('1 colaborador(es) · Página 1 de 1').waitFor();
  await page.getByRole('button', { name: 'Solicitar transferência', exact: true }).click();
  await page.getByLabel('Obra de destino', { exact: true }).selectOption('2');
  await page.getByLabel('Justificativa', { exact: true }).fill('Apoio à etapa da obra de destino');
  const out = path.join(root, '../outputs/rh-pessoal-transferencias'); fs.mkdirSync(out, { recursive: true });
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const bounds = await page.getByRole('dialog', { name: 'Solicitar transferência entre obras' }).evaluate(el => {
      const panel = el.firstElementChild.getBoundingClientRect();
      return { left: panel.left, right: panel.right, width: innerWidth };
    });
    assert(bounds.left >= 0 && bounds.right <= bounds.width + 1, JSON.stringify(bounds));
    if (!process.env.RH_NO_SCREENSHOTS) await page.screenshot({ path: path.join(out, `transferencia-${width}.png`) });
  }
  await page.getByRole('button', { name: 'Enviar para aprovação', exact: true }).click();
  await page.getByRole('dialog', { name: 'Solicitar transferência entre obras' }).waitFor({ state: 'hidden' });
  const envios = await page.evaluate(() => window.envios);
  assert.equal(envios.length, 1);
  assert.equal(envios[0].data.colaborador_id, 7); assert.equal(envios[0].data.obra_destino_id, 2);
  assert(!('obra_solicitante_id' in envios[0].data), 'Responsabilidade e origem sao resolvidas pelo servidor');
  assert(!('data_vigencia' in envios[0].data));
  await diretorio.getByRole('textbox', { name: 'Nome, matrícula ou função' }).fill('Sem Local');
  await page.getByRole('button', { name: 'Pesquisar', exact: true }).click();
  await diretorio.getByText('Sem Local', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Solicitar transferência', exact: true }).click();
  await page.getByLabel('Obra de destino', { exact: true }).selectOption('1');
  await page.getByLabel('Justificativa', { exact: true }).fill('Primeira alocação na obra');
  await page.getByRole('button', { name: 'Confirmar transferência', exact: true }).click();
  await page.getByRole('dialog', { name: 'Solicitar transferência entre obras' }).waitFor({ state: 'hidden' });
  assert.equal((await page.evaluate(() => window.envios)).at(-1).data.colaborador_id, 8);
  assert.deepEqual(errors, []);
  for (const perfil of ['comum', 'dp']) for (const width of [1366, 390]) {
    const outra = await browser.newPage({ viewport: { width, height: 900 } });
    await outra.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await outra.goto(`http://127.0.0.1:${server.httpServer.address().port}/fixture?${perfil}`);
    await outra.addStyleTag({ path: path.join(root, 'dist/assets', css) });
    await outra.getByText('Ana Teste', { exact: true }).first().waitFor();
    if (perfil === 'comum') {
      await outra.getByRole('button', { name: 'Solicitar transferência', exact: true }).first().click();
      assert.equal(await outra.getByRole('option', { name: /Obra de destino/ }).evaluate(o => o.disabled), false, 'Sem vinculo no destino, usuario da origem pode enviar');
      await outra.getByLabel('Obra de destino', { exact: true }).selectOption('2');
      await outra.getByText(/Aprovação pelo responsável da obra/).waitFor();
      await outra.getByLabel('Obra de destino', { exact: true }).selectOption('3');
      assert.equal(await outra.getByRole('option', { name: /Centro Administrativo.*Centro de custo/ }).evaluate(o => o.disabled), false);
      await outra.getByLabel('Justificativa', { exact: true }).fill('Solicitado por usuario comum da obra');
      assert.equal(await outra.getByRole('button', { name: 'Confirmar transferência', exact: true }).count(), 0, 'Usuario comum nao transfere automaticamente');
      await outra.getByRole('button', { name: 'Enviar para aprovação', exact: true }).click();
      await outra.getByRole('dialog', { name: 'Solicitar transferência entre obras' }).waitFor({ state: 'hidden' });
      assert.equal(await outra.evaluate(() => window.envios.length), 1);
      assert.equal(await outra.evaluate(() => window.envios[0].data.obra_destino_id), 3);
      await outra.getByRole('textbox', { name: 'Nome, matrícula ou função' }).fill('Outra Obra');
      await outra.getByRole('button', { name: 'Pesquisar', exact: true }).click();
      await outra.getByText('Outra Obra', { exact: true }).waitFor();
      await outra.getByRole('button', { name: 'Solicitar transferência', exact: true }).click();
      const dialog = outra.getByRole('dialog', { name: 'Solicitar transferência entre obras' });
      assert.equal(await dialog.getByRole('option', { name: /Obra de origem/ }).evaluate(o => o.disabled), false, 'Entrada para propria obra preservada');
      assert.equal(await dialog.getByRole('option', { name: /Centro Administrativo/ }).evaluate(o => o.disabled), true, 'Terceiros->terceiros bloqueado');
      await dialog.getByText(/Para trazer um colaborador de outro local/).waitFor();
      await dialog.getByLabel('Justificativa', { exact: true }).fill('Trazer colaborador de outra obra');
      await dialog.getByRole('button', { name: 'Enviar para aprovação', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(await outra.evaluate(() => window.envios.at(-1).data.obra_destino_id), 1);
    }
    if (perfil === 'dp') {
      await outra.getByRole('button', { name: 'Solicitar transferência', exact: true }).first().click();
      await outra.getByLabel('Obra de destino', { exact: true }).selectOption('3');
      await outra.getByLabel('Justificativa', { exact: true }).fill('Lotacao direta pelo DP');
      assert.equal(await outra.getByRole('button', { name: 'Enviar para aprovação', exact: true }).count(), 0);
      await outra.getByText('Transferência administrativa autorizada para DP/SUPERADMIN.', { exact: false }).waitFor();
      await outra.getByRole('button', { name: 'Confirmar transferência', exact: true }).click();
      await outra.getByRole('dialog', { name: 'Solicitar transferência entre obras' }).waitFor({ state: 'hidden' });
      assert.equal(await outra.evaluate(() => window.envios.length), 1);
      assert.equal(await outra.evaluate(() => window.envios[0].data.obra_destino_id), 3);
    }
    await outra.getByRole('tab', { name: /Transferências das minhas obras|Transferências entre obras/ }).click();
    await outra.getByRole('button', { name: 'Abrir', exact: true }).click();
    assert.equal(await outra.getByRole('button', { name: 'Aprovar transferência', exact: true }).count(), perfil === 'dp' ? 1 : 0);
    await outra.close();
  }
  for (const width of [1366,390]) {
    const tela = await browser.newPage({ viewport: { width, height: 900 } });
    tela.on('pageerror', e => errors.push(e.message));
    await tela.route('**/*', r => new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
    await tela.goto(`http://127.0.0.1:${server.httpServer.address().port}/fixture?dp&filtros`);
    await tela.addStyleTag({ path: path.join(root, 'dist/assets', css) });
    await tela.getByRole('tab', { name:'Transferências entre obras', exact:true }).click();
    await tela.getByText('43 transferência(ões) · Página 1 de 3', {exact:true}).waitFor();
    await tela.getByRole('button', {name:'Situação',exact:true}).click();
    await tela.getByRole('checkbox', {name:'Aprovada',exact:true}).check();
    await tela.getByText('21 transferência(ões) · Página 1 de 2', {exact:true}).waitFor();
    await tela.getByRole('button', {name:'Situação (1)',exact:true}).click();
    await tela.getByRole('button', {name:'Próxima',exact:true}).click();
    await tela.getByText('21 transferência(ões) · Página 2 de 2', {exact:true}).waitFor();
    await tela.getByRole('button', {name:'Atualizar',exact:true}).click();
    await tela.waitForFunction(()=>window.consultasLista.at(-1).situacoes==='APROVADA'&&window.consultasLista.at(-1).pagina===2);
    await tela.getByRole('button', {name:'Situação (1)',exact:true}).click();
    await tela.getByRole('checkbox', {name:'Aberta (aguardando aprovação)',exact:true}).check();
    await tela.getByText('43 transferência(ões) · Página 1 de 3', {exact:true}).waitFor();
    await tela.getByRole('button', {name:'Situação (2)',exact:true}).click();
    await tela.getByRole('button', {name:'Remover filtro Situação Aprovada',exact:true}).click();
    await tela.getByText('22 transferência(ões) · Página 1 de 2', {exact:true}).waitFor();
    await tela.getByRole('button', {name:'Origem',exact:true}).click();
    await tela.getByText('101 · Obra de origem', {exact:true}).click();
    await tela.getByRole('button', {name:'Origem (1)',exact:true}).click();
    await tela.getByRole('button', {name:'Destino',exact:true}).click();
    await tela.getByText('103 · Centro Administrativo · Centro de custo', {exact:true}).click();
    await tela.getByRole('button', {name:'Destino (1)',exact:true}).click();
    await tela.getByText('7 transferência(ões) · Página 1 de 1', {exact:true}).waitFor();
    assert.equal(await tela.evaluate(()=>window.consultasLista.at(-1).origem_id),'1');
    assert.equal(await tela.evaluate(()=>window.consultasLista.at(-1).destino_id),'3');
    await tela.evaluate(()=>window.scrollTo(0,0));
    if(!process.env.RH_NO_SCREENSHOTS)await tela.screenshot({path:path.join(out,`filtros-${width}.png`)});
    await tela.getByRole('button', {name:'Limpar tudo',exact:true}).click();
    await tela.getByText('43 transferência(ões) · Página 1 de 3', {exact:true}).waitFor();
    await tela.getByRole('button', {name:'Situação',exact:true}).click();
    await tela.getByRole('button', {name:'Marcar todas',exact:true}).click();
    await tela.getByRole('button', {name:'Situação (5)',exact:true}).waitFor();
    assert.equal(await tela.evaluate(()=>window.consultasLista.at(-1).situacoes.split(',').length),5);
    await tela.getByRole('button', {name:'Desmarcar',exact:true}).click();
    await tela.getByRole('button', {name:'Situação',exact:true}).click();
    const busca=tela.getByRole('textbox',{name:'Buscar colaborador por nome ou matrícula',exact:true});
    await busca.fill('Antiga');
    await tela.waitForFunction(()=>window.consultasLista.at(-1).busca==='Antiga');
    await busca.fill('Ana');
    await tela.getByText('1 transferência(ões) · Página 1 de 1', {exact:true}).waitFor();
    await tela.waitForFunction(()=>window.antigaTerminou);
    await tela.getByText('1 transferência(ões) · Página 1 de 1', {exact:true}).waitFor();
    await tela.getByRole('tab',{name:'Todos Colaboradores',exact:true}).click();
    await tela.getByRole('tab',{name:'Transferências entre obras',exact:true}).click();
    assert.equal(await busca.inputValue(),'Ana');
    await tela.getByRole('button',{name:'Limpar todos os filtros',exact:true}).click();
    await tela.getByText('43 transferência(ões) · Página 1 de 3', {exact:true}).waitFor();
    await tela.close();
  }
  assert.deepEqual(errors, []);
  console.log('OK: transferencias desktop/mobile, filtros situacao multipla/origem/destino/busca, paginas/limpeza/atualizacao/resposta obsoleta e regras de envio. Sem API externa.');
} finally { await browser.close(); await server.close(); }
