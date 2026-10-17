// UI real e contratos HTTP; biometria/servidor isolados. Sem banco/producao.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { podeSelecionarAutorizacao } from '../src/utils/autorizacaoPagamentoSituacao.js';
const saldoParcial = { status: 'PENDENTE', situacao_financeira: 'PARCIALMENTE_PAGO', lote: { status: 'AGUARDANDO' },
  valor_snapshot: 50, snapshot_json: { valor_saldo: 50 }, titulo: { status: 'PARCIAL', valor_baixado: 50, valor_saldo: 50 } };
assert(podeSelecionarAutorizacao(saldoParcial), 'Saldo parcial pode receber nova aprovacao se seu dossie corresponde ao saldo atual');
assert(!podeSelecionarAutorizacao({ ...saldoParcial, titulo: { ...saldoParcial.titulo, valor_saldo: 40 } }), 'Saldo alterado exige conferencia');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tag = '\0qa-autorizacoes-obras';
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5341, strictPort: true, proxy: {} }, plugins: [{
  name: 'qa-autorizacoes-obras', enforce: 'pre',
  resolveId(source, importer) { if (source.endsWith('/utils/webauthn') && ['/AutorizacoesPorObra.jsx', '/AutorizacaoTituloDetalhe.jsx'].some(p => importer?.endsWith(p))) return tag; },
  load(id) { if (id === tag) return `export const autenticarComPasskey=async()=>{window.__passkeys=(window.__passkeys||0)+1;return {id:'qa-credential'}};`; },
  configureServer(s) { s.middlewares.use('/qa-obras', async (_req, res) => {
    res.setHeader('Content-Type', 'text/html'); res.end(await s.transformIndexHtml('/qa-obras', `<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import Page from '/src/components/financeiro/AutorizacoesPorObra.jsx';import ModalPortal from '/src/components/ui/ModalPortal.jsx';
import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/componentes-padrao.css';import '/src/styles/financeiro-autorizacoes-pagamento.css';
function App(){const[busy,setBusy]=React.useState(false);const[caps,setCaps]=React.useState({can_decide:true,passkey_count:1,mode:'PILOT'});const[doc,setDoc]=React.useState(null);window.__setCaps=setCaps;return React.createElement(React.Fragment,null,React.createElement('main',{style:{padding:12,maxWidth:1400,margin:'auto'}},React.createElement('h1',null,'Autorizações de pagamento'),React.createElement(Page,{caps,userId:31,busy,setBusy,abrirDocumento:async doc=>{window.__documento=doc.id;setDoc(doc)}})),doc&&React.createElement(ModalPortal,{onClose:()=>setDoc(null)},React.createElement('div',{role:'dialog','aria-label':'Documento QA',style:{position:'fixed',inset:20,zIndex:1100,background:'white'}},'Documento '+doc.id,React.createElement('button',{onClick:()=>setDoc(null)},'Fechar documento'))))}
createRoot(document.getElementById('root')).render(React.createElement(App));</script></body></html>`));
  }); }
}] });
await server.listen(); const browser = await chromium.launch({ channel: 'chrome', headless: true });
const items = Array.from({ length: 310 }, (_, i) => {
  const id = i + 1, obraId = id <= 130 ? 1 : id <= 160 ? 2 : id - 158;
  return { id, lote_id: id <= 2 ? 7 : id + 100, titulo_financeiro_id: id, status: 'PENDENTE', situacao_financeira: 'AGUARDANDO',
    valor_snapshot: 100, snapshot_hash: 'assinado-' + id, lote: { id: id <= 2 ? 7 : id + 100, codigo: 'LOTE-' + (id <= 2 ? 7 : id + 100), status: 'AGUARDANDO', expira_em: '2099-01-01' },
    titulo: { id, status: 'ABERTO', valor_baixado: 0, valor_saldo: 100, solicitacao: { justificativa: 'Justificativa da obra para o fornecedor.' } },
    obras: id === 1 ? [1, 2] : [obraId], valor_no_recorte: 100, vencimento_atual: '2026-10-17', obras_nomes: 'Obra ' + obraId,
    snapshot_json: { codigo: 'TIT-' + id, solicitacao: { codigo: 'SOL-' + id, descricao: 'Materiais de construção' }, credor: { nome: 'Fornecedor QA' },
      data_vencimento: '2026-10-17', forma_pagamento: { nome: 'Boleto' } }, documentos: [{ id, nome: 'Boleto ' + id + '.pdf' }] };
});
for (const [id, status, tituloStatus] of [[4,'QUITADO','QUITADO'],[5,'PARCIALMENTE_PAGO','PARCIAL'],[6,'NAO_PAGO','ABERTO'],[7,'NA_FILA','ABERTO'],[8,'CANCELADO','CANCELADO'],[9,'REJEITADO','ABERTO']]) {
  const i = items[id - 1]; i.situacao_financeira = status; i.status = status === 'REJEITADO' ? status : 'ENFILEIRADO'; i.titulo.status = tituloStatus;
  if (id === 4) { i.titulo.valor_baixado = 100; i.titulo.valor_saldo = 0; }
  if (id === 5) { i.titulo.valor_baixado = 30; i.titulo.valor_saldo = 70; }
}
const nomes = id => 'Obra ' + String(id).padStart(3, '0');
const originais = structuredClone(items);
let fail = false, failLot = 0, invalidar = 0, active = 0, maxActive = 0, slow = false, modoDetalhe = false;
const chamadas = [], decisoes = [], errors = [], unexpected = [];
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } }); page.on('pageerror', e => errors.push(e.message));
await page.route('**/*', async route => {
  const url = new URL(route.request().url()), p = url.searchParams;
  const json = (v, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(v) });
  if (url.pathname.includes('/autorizacoes-pagamento/')) {
    const idLote = url.pathname.match(/\/(\d+)\/(autenticacao\/opcoes|decidir)$/);
    if (idLote) {
      const id = Number(idLote[1]), body = route.request().postDataJSON();
      if (id === failLot) return json({ message: 'Falha QA no próximo lote' }, 403);
      if (idLote[2] === 'autenticacao/opcoes') return json({ challenge: 'qa', decisoes: body.decisoes });
      decisoes.push({ id, body });
      for (const d of body.decisoes) {
        const i = items.find(i => i.id === d.item_id); assert.equal(i.lote_id, id); assert.equal(i.status, 'PENDENTE');
        if (i.id === invalidar) { i.status = i.situacao_financeira = 'INVALIDADO'; continue; }
        i.status = d.decisao === 'AUTORIZAR' ? 'ENFILEIRADO' : 'REJEITADO'; i.situacao_financeira = d.decisao === 'AUTORIZAR' ? 'NA_FILA' : 'REJEITADO';
      }
      return json({ itens: items.filter(i => i.lote_id === id) });
    }
    if (url.pathname.endsWith('/painel/obras') || url.pathname.endsWith('/painel/titulos')) {
      active++; maxActive = Math.max(maxActive, active); chamadas.push(url.search);
      try {
        if (slow) await new Promise(ok => setTimeout(ok, 180));
        if (fail) return await json({ message: 'Consulta indisponível em QA' }, 500);
        const ids = p.get('item_ids')?.split(',').map(Number);
        const recorte = items.filter(i => (!ids || ids.includes(i.id)) && (!p.get('situacao') || p.get('situacao') === i.situacao_financeira)
          && (!p.get('vencimento_inicio') || i.vencimento_atual >= p.get('vencimento_inicio')) && (!p.get('vencimento_fim') || i.vencimento_atual <= p.get('vencimento_fim')))
          .map(i => ({ ...i, obras: i.obras.filter(id => (!p.get('obra') || nomes(id).toLowerCase().includes(p.get('obra').toLowerCase())) && (!p.get('obra_id') || Number(p.get('obra_id')) === id)) })).filter(i => i.obras.length);
        const pagina = Number(p.get('pagina') || 1), limite = Number(p.get('limite') || 30), inicio = (pagina - 1) * limite;
        if (url.pathname.endsWith('/painel/obras')) {
          const obras = new Map();
          for (const i of recorte) for (const id of i.obras) {
            const o = obras.get(id) || { obra_id: id, obra_nome: nomes(id), quantidade_titulos: 0, valor_total: 0 };
            o.quantidade_titulos++; o.valor_total += i.valor_snapshot / (i.id === 1 ? 2 : 1); obras.set(id, o);
          }
          const data = [...obras.values()].sort((a,b) => a.obra_id - b.obra_id);
          return await json({ data: data.slice(inicio, inicio + limite), resumo: { quantidade_titulos: recorte.length, valor_total: data.reduce((s,o)=>s+o.valor_total,0) },
            paginacao: { pagina, total: data.length, mais: inicio + limite < data.length } });
        }
        let navegaveis = recorte;
        if (modoDetalhe || p.has('sentido')) navegaveis = [...recorte].sort((a,b) => a.vencimento_atual.localeCompare(b.vencimento_atual) || b.id-a.id);
        if (p.has('sentido')) {
          const referencia = { id: Number(p.get('cursor_item_id')), vencimento_atual: p.get('cursor_vencimento') }, proxima = p.get('sentido') === 'PROXIMA';
          navegaveis = navegaveis.filter(i => { const ordem = i.vencimento_atual.localeCompare(referencia.vencimento_atual) || referencia.id-i.id; return proxima ? ordem > 0 : ordem < 0; });
          if (!proxima) navegaveis.reverse();
        }
        return await json({ data: navegaveis.slice(inicio, inicio + limite).map(i => ({ ...i, obras_nomes: i.obras.map(nomes).join(' / '), valor_no_recorte: i.valor_snapshot * i.obras.length / (i.id === 1 ? 2 : 1) })),
          paginacao: { pagina, total: navegaveis.length, mais: inicio + limite < navegaveis.length } });
      } finally { active--; }
    }
  }
  if (url.hostname === '127.0.0.1' && !url.pathname.startsWith('/api')) return route.continue();
  unexpected.push(url.pathname); return route.abort();
});
const output = path.resolve(root, '../outputs/autorizacoes-obras-20261017'); fs.mkdirSync(output, { recursive: true });
const pronto = async () => { await page.waitForFunction(() => ![...document.querySelectorAll('.pa-obras-resumo span')].some(el => el.textContent === 'Atualizando…')); await page.waitForTimeout(30); };
const abrirObra = async id => { await page.getByRole('button', { name: new RegExp(nomes(id)) }).first().click(); await pronto(); };
const aplicarStatus = async s => { await page.getByLabel('Situação atual').selectOption(s); await page.getByRole('button', { name: 'Aplicar filtros', exact: true }).click(); await pronto(); };
const limpar = () => page.getByRole('button', { name: 'Limpar seleção de todas as páginas' }).click();
try {
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/qa-obras`);
  await page.locator('.pa-obra').first().waitFor(); await pronto(); assert(chamadas.length > 0);
  const total = await page.locator('.pa-obras-resumo').textContent(); assert(total.includes('304 títulos únicos'), total);
  await abrirObra(1);
  await page.getByRole('checkbox', { name: 'Selecionar os pendentes desta página' }).check();
  await page.getByText(/^50 selecionado\(s\)/).waitFor();
  await page.getByRole('navigation', { name: 'Paginação de títulos' }).getByRole('button', { name: 'Próxima' }).click(); await pronto();
  await page.getByRole('checkbox', { name: 'Selecionar os pendentes desta página' }).check(); await page.getByText(/^100 selecionado\(s\)/).waitFor();
  await abrirObra(2); await page.getByRole('checkbox', { name: 'Selecionar os pendentes desta página' }).check(); await page.getByText(/^130 selecionado\(s\)/).waitFor();
  await limpar(); await page.getByText(/^0 selecionado\(s\)/).waitFor();
  // Aprovar somente um titulo; outro do MESMO lote deve continuar pendente.
  await abrirObra(1); await page.getByLabel('Selecionar TIT-1', { exact: true }).check();
  await page.getByRole('button', { name: 'Autorizar selecionados', exact: true }).click();
  await page.getByRole('region', { name: 'Conferência da decisão' }).waitFor();
  await page.getByRole('button', { name: 'Confirmar autorização com passkey' }).evaluate(el => { el.click(); el.click(); });
  await page.getByRole('status').getByText(/1 título\(s\) confirmado/).waitFor(); await pronto();
  assert.equal(decisoes.length, 1); assert.equal(decisoes[0].id, 7); assert.deepEqual(decisoes[0].body.decisoes.map(d=>d.item_id), [1]); assert.equal(items[1].status, 'PENDENTE');
  await abrirObra(2); await abrirObra(1); await page.getByLabel('Selecionar TIT-2', { exact: true }).check();
  await page.getByRole('button', { name: 'Autorizar selecionados', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar autorização com passkey' }).click(); await page.getByRole('status').getByText(/1 título\(s\) confirmado/).waitFor(); await pronto();
  assert.equal(decisoes.length, 2); assert.equal(decisoes[1].id, 7); assert.deepEqual(decisoes[1].body.decisoes.map(d=>d.item_id), [2]);
  // Status atuais, inclusive quitado/nao pago, sem modificar a decisao assinada.
  for (const s of ['QUITADO','PARCIALMENTE_PAGO','NAO_PAGO','NA_FILA']) {
    await aplicarStatus(s); await abrirObra(1); assert.equal(await page.locator('.pa-status').first().textContent(), { QUITADO:'Quitado', PARCIALMENTE_PAGO:'Parcialmente pago', NAO_PAGO:'Não pago', NA_FILA:'Na fila' }[s]);
    assert(await page.getByRole('button', { name: 'Autorizar selecionados', exact: true }).isDisabled());
  }
  // Filtros usam vencimento, e so disparam ao aplicar.
  const antes = chamadas.length; await page.getByLabel('Obra / centro de custo').fill('Obra 002'); assert.equal(chamadas.length, antes);
  await aplicarStatus('AGUARDANDO'); assert.equal(await page.locator('.pa-obra').count(), 1);
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click(); await pronto(); await abrirObra(1);
  await page.getByLabel('Selecionar TIT-3', { exact: true }).check();
  items[2].titulo.status = 'QUITADO'; items[2].titulo.valor_saldo = 0; items[2].titulo.valor_baixado = 100; items[2].situacao_financeira = 'QUITADO';
  await page.getByRole('button', { name: 'Autorizar selecionados', exact: true }).click();
  await page.getByRole('status').getByText(/A situação de um ou mais títulos mudou/).waitFor(); assert.equal(decisoes.length, 2); assert.equal(await page.getByRole('region', { name: 'Conferência da decisão' }).count(), 0); await pronto();
  // Falha parcial entre dois lotes nao desfaz o primeiro nem confirma o segundo.
  await page.getByLabel('Selecionar TIT-10', { exact: true }).check(); await page.getByLabel('Selecionar TIT-11', { exact: true }).check(); failLot = 111;
  await page.getByRole('button', { name: 'Autorizar selecionados', exact: true }).click(); await page.getByRole('button', { name: 'Confirmar autorização com passkey' }).click();
  await page.getByRole('status').getByText(/1 título\(s\) já confirmado/).waitFor(); await pronto(); assert.equal(items[9].status, 'ENFILEIRADO'); assert.equal(items[10].status, 'PENDENTE'); await limpar(); failLot = 0;
  // Servidor pode invalidar material sob lock: HTTP200 nao significa aprovado.
  invalidar = 12; await page.getByLabel('Selecionar TIT-12', { exact: true }).check();
  await page.getByRole('button', { name: 'Autorizar selecionados', exact: true }).click(); await page.getByRole('button', { name: 'Confirmar autorização com passkey' }).click();
  await page.getByRole('status').getByText(/Um ou mais títulos mudaram ou foram invalidados/).waitFor(); await pronto(); assert.equal(items[11].status, 'INVALIDADO'); invalidar = 0;
  await page.getByLabel('Selecionar TIT-13', { exact: true }).check(); await page.getByRole('button', { name: 'Rejeitar selecionados', exact: true }).click();
  await page.getByRole('status').getByText(/Informe o motivo/).waitFor();
  await page.getByLabel('Motivo para rejeição').fill('Conferir contrato antes do pagamento');
  await page.getByRole('button', { name: 'Rejeitar selecionados', exact: true }).click(); await page.getByRole('button', { name: 'Confirmar rejeição com passkey' }).click();
  await page.getByRole('status').getByText(/Rejeições registradas/).waitFor(); await pronto(); assert.equal(items[12].status, 'REJEITADO');
  assert.equal(decisoes.at(-1).body.decisoes[0].motivo, 'Conferir contrato antes do pagamento');
  // Somente leitura e sem passkey nao habilitam decisao.
  await page.evaluate(() => window.__setCaps({ can_decide: false, passkey_count: 0 })); await page.getByRole('region', { name: 'Seleção e decisão' }).waitFor({ state: 'detached' });
  assert(await page.getByLabel('Selecionar TIT-11', { exact: true }).isDisabled());
  await page.evaluate(() => window.__setCaps({ can_decide: true, passkey_count: 0 })); assert(await page.getByRole('button', { name: 'Autorizar selecionados', exact: true }).isDisabled());
  await page.evaluate(() => window.__setCaps({ can_decide: true, passkey_count: 1 }));
  // Erro preserva dados/rascunho, mas bloqueia acoes ate refresh confirmado.
  fail = true; await page.evaluate(() => window.dispatchEvent(new Event('fluxy-autorizacoes-obras-atualizar'))); await page.getByRole('alert').waitFor();
  assert(await page.getByRole('button', { name: 'Autorizar selecionados', exact: true }).isDisabled());
  fail = false; await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await page.getByRole('alert').waitFor({ state: 'detached' }); await pronto();
  // Troca rapida de filtros e tempestade de foco com respostas lentas.
  slow = true;
  for (const busca of ['Obra 001', 'Obra 002', 'Obra 003']) {
    await page.getByLabel('Obra / centro de custo').fill(busca); await page.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
    await page.evaluate(() => { for (let i=0;i<8;i++) window.dispatchEvent(new Event('focus')); });
  }
  await page.getByRole('button', { name: /Obra 003/ }).waitFor(); await pronto(); assert.equal(await page.locator('.pa-obra').count(), 1);
  slow = false; await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click(); await pronto(); await abrirObra(1);
  for (const width of [1366, 768, 390]) {
    await page.setViewportSize({ width, height: 900 }); await page.waitForTimeout(80);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Sem overflow ' + width);
    await page.evaluate(() => window.scrollTo(0,0));
    await page.screenshot({ path: path.join(output, `obras-${width}.png`), fullPage: false });
  }
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.screenshot({ path: path.join(output, 'obras-mobile-dark.png'), fullPage: false });
  await page.evaluate(() => document.documentElement.classList.remove('dark'));
  await page.getByRole('button', { name: 'Voltar às obras' }).click(); await pronto();
  await page.getByLabel('Obra / centro de custo').fill('Obra 999'); await page.getByRole('button', { name: 'Aplicar filtros' }).click(); await pronto();
  await page.getByText(/Nenhuma obra nesta situação/).waitFor(); await page.screenshot({ path: path.join(output, 'vazio-mobile.png'), fullPage: true });
  // Detalhe de tela inteira: mesma lista/filtros, sem aprovar ao navegar.
  modoDetalhe = true; items.splice(0, items.length, ...structuredClone(originais));
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click(); await pronto();
  assert.equal(await page.getByRole('region', { name: 'Seleção e decisão' }).count(), 0, 'Nao ocupa area com selecao vazia antes de abrir obra');
  await abrirObra(1); await page.getByLabel('Selecionar TIT-130', { exact: true }).check();
  const totalDecisoes = decisoes.length;
  await page.getByRole('button', { name: 'Abrir detalhes de TIT-81', exact: true }).click();
  const detalhe = page.getByRole('dialog', { name: 'Detalhes do título para autorização' });
  const prontoDetalhe = async id => { await detalhe.getByRole('heading', { name: 'SOL-' + id, exact: true }).waitFor(); await detalhe.getByRole('button', { name: 'Próxima', exact: true }).waitFor({ state: 'visible' }); await page.waitForFunction(() => !document.querySelector('.pa-titulo-rodape button')?.disabled); };
  await prontoDetalhe(81);
  assert.equal(await page.locator('#root').evaluate(el => el.inert), true);
  assert.deepEqual(await detalhe.getByRole('navigation').getByRole('button').allTextContents(), ['Anterior','Rejeitar','Aprovar','Próxima']);
  await detalhe.getByRole('button', { name: 'Próxima', exact: true }).click(); await prontoDetalhe(80);
  await detalhe.getByRole('button', { name: 'Anterior', exact: true }).click(); await prontoDetalhe(81);
  assert.equal(decisoes.length, totalDecisoes, 'Anterior/proxima nao chamam POST de decisao');
  await detalhe.getByRole('button', { name: 'Próxima', exact: true }).click(); await prontoDetalhe(80);
  await detalhe.getByRole('button', { name: 'Boleto 80.pdf', exact: true }).click(); assert.equal(await page.evaluate(() => window.__documento), 80);
  await page.getByRole('dialog',{name:'Documento QA'}).waitFor(); await page.keyboard.press('Escape');
  await page.getByRole('dialog',{name:'Documento QA'}).waitFor({state:'detached'}); assert(await detalhe.isVisible(),'Escape do anexo nao fecha o titulo');
  for (const width of [390,768,1366]) {
    await page.setViewportSize({width,height:850});
    assert(await detalhe.evaluate(el => { const r=el.getBoundingClientRect();return r.top===0 && r.left===0 && r.width===innerWidth && Math.abs(r.height-innerHeight)<2; }), 'Tela inteira '+width);
    assert(await detalhe.locator('footer').evaluate(el => el.getBoundingClientRect().bottom<=innerHeight+1), 'Rodape sempre visivel');
    await page.screenshot({path:path.join(output,'titulo-tela-inteira-'+width+'.png')});
  }
  await page.setViewportSize({width:390,height:850});
  await page.evaluate(()=>document.documentElement.classList.add('dark'));
  await page.waitForTimeout(700); // Aguarda a transicao de tema antes da prova visual.
  const coresDetalhe = await detalhe.locator('footer button').evaluateAll(nodes => nodes.map(el=>({texto:el.textContent,disabled:el.disabled,cor:getComputedStyle(el).color,fundo:getComputedStyle(el).backgroundColor,opacidade:getComputedStyle(el).opacity})));
  const luminancia = cor => cor.match(/[\d.]+/g).slice(0,3).map(Number).map(c=>c/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((s,c,i)=>s+c*[.2126,.7152,.0722][i],0);
  for (const botao of coresDetalhe) { const a=luminancia(botao.cor),b=luminancia(botao.fundo);assert((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,'Contraste do botao '+botao.texto+': '+JSON.stringify(botao)); }
  await page.screenshot({path:path.join(output,'titulo-tela-inteira-dark.png')}); await page.evaluate(()=>document.documentElement.classList.remove('dark'));
  await detalhe.getByRole('button',{name:'Próxima',exact:true}).focus(); await page.keyboard.press('Tab');
  assert.equal(await detalhe.getByRole('button',{name:'Voltar à lista'}).evaluate(el=>el===document.activeElement),true,'Foco permanece no detalhe');
  await detalhe.getByRole('button', { name: 'Aprovar', exact: true }).click();
  await detalhe.getByRole('region',{name:'Conferência deste título'}).waitFor();
  await detalhe.getByRole('button',{name:'Anterior',exact:true}).click(); await prontoDetalhe(81);
  assert.equal(decisoes.length,totalDecisoes,'Navegar apos conferir tambem nao decide');
  assert.equal(await detalhe.getByRole('region',{name:'Conferência deste título'}).count(),0);
  await detalhe.getByRole('button',{name:'Próxima',exact:true}).click(); await prontoDetalhe(80);
  await detalhe.getByRole('button', { name: 'Aprovar', exact: true }).click();
  await detalhe.getByRole('button', { name: 'Confirmar aprovação com passkey' }).evaluate(el=>{el.click();el.click();});
  await detalhe.getByText('Somente este título foi aprovado. Os demais não foram decididos.').waitFor(); await prontoDetalhe(80);
  assert.deepEqual(decisoes.at(-1).body.decisoes.map(d=>d.item_id), [80]); assert.equal(decisoes.length,totalDecisoes+1);
  assert.equal(items[129].status,'PENDENTE','Selecao fora do detalhe nao foi aprovada');
  await detalhe.getByRole('button', { name: 'Próxima', exact: true }).click(); await prontoDetalhe(79);
  await detalhe.getByRole('button', { name: 'Anterior', exact: true }).click(); await prontoDetalhe(81);
  await detalhe.getByRole('button', { name: 'Próxima', exact: true }).click(); await prontoDetalhe(79);
  await detalhe.getByRole('button', { name: 'Rejeitar', exact: true }).click(); await detalhe.getByText('Informe o motivo da rejeição.', {exact:true}).waitFor();
  assert.equal(decisoes.length,totalDecisoes+1);
  await detalhe.getByLabel('Motivo da rejeição').fill('Conferir valores do contrato');
  await detalhe.getByRole('button', { name: 'Rejeitar', exact: true }).click(); await detalhe.getByRole('button', { name: 'Confirmar rejeição com passkey' }).click();
  await detalhe.getByText('Somente este título foi rejeitado, com motivo e histórico.').waitFor(); await prontoDetalhe(79);
  assert.deepEqual(decisoes.at(-1).body.decisoes,[{item_id:79,decisao:'REJEITAR',motivo:'Conferir valores do contrato'}]);
  await detalhe.getByRole('button', { name: 'Próxima', exact: true }).click(); await prontoDetalhe(78);
  await page.evaluate(()=>window.__setCaps({can_decide:false,passkey_count:1}));
  assert(await detalhe.getByRole('button', {name:'Aprovar',exact:true}).isDisabled());
  assert(await detalhe.getByRole('button', {name:'Rejeitar',exact:true}).isDisabled());
  assert(await detalhe.getByRole('button', {name:'Próxima',exact:true}).isEnabled());
  await page.evaluate(()=>window.__setCaps({can_decide:true,passkey_count:0})); assert(await detalhe.getByRole('button', {name:'Aprovar',exact:true}).isDisabled());
  await page.evaluate(()=>window.__setCaps({can_decide:true,passkey_count:1,paused:true})); assert(await detalhe.getByRole('button', {name:'Aprovar',exact:true}).isDisabled());
  await page.evaluate(()=>window.__setCaps({can_decide:true,passkey_count:1}));
  invalidar=78;
  await detalhe.getByRole('button', { name: 'Aprovar', exact: true }).click(); await detalhe.getByRole('button', { name: 'Confirmar aprovação com passkey' }).click();
  await detalhe.getByRole('alert').getByText(/O servidor não confirmou esta decisão/).waitFor(); invalidar=0;
  assert(await detalhe.getByRole('button', {name:'Aprovar',exact:true}).isDisabled());
  await detalhe.getByRole('button',{name:'Atualizar título',exact:true}).click(); await prontoDetalhe(78);
  await detalhe.getByRole('button',{name:'Próxima',exact:true}).click(); await prontoDetalhe(77);
  const antesObsoleto=decisoes.length;
  items[76].titulo.status='QUITADO';items[76].titulo.valor_saldo=0;items[76].situacao_financeira='QUITADO';
  await detalhe.getByRole('button',{name:'Aprovar',exact:true}).click(); await detalhe.getByText(/A situação do título mudou/).waitFor();
  assert.equal(decisoes.length,antesObsoleto); assert.equal(await detalhe.getByRole('region',{name:'Conferência deste título'}).count(),0);
  await page.keyboard.press('Escape'); await detalhe.waitFor({state:'detached'}); await pronto();
  assert.equal(await page.locator('#root').evaluate(el=>el.inert),false);
  assert(await page.getByLabel('Selecionar TIT-130',{exact:true}).isChecked(),'Selecao geral preservada ao fechar o detalhe');
  assert.equal(maxActive, 1, 'Leituras seriais, sem N+1/polling concorrente'); assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log('UI por obra e titulo fullscreen: desktop/tablet/mobile/escuro, selecao global, lote parcial, cursor entre paginas, Anterior/Proxima sem decidir, aprovar/rejeitar somente o atual, passkey/motivo/revalidacao/duplo clique/INVALIDADO/ACL, anexos empilhados/Escape/foco/root inert e retorno preservado aprovados. APIs isoladas.');
} finally { await page.close(); await browser.close(); await server.close(); }
