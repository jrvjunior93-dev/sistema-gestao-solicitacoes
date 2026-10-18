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
  resolveId(source, importer) { if (source === '@simplewebauthn/browser' && importer?.endsWith('/utils/webauthn.js')) return tag; },
  load(id) { if (id === tag) return `export const browserSupportsWebAuthn=()=>true,startRegistration=async()=>{throw Error('Registro inesperado no QA')},startAuthentication=async()=>{window.__passkeys=(window.__passkeys||0)+1;if(window.__cancelPasskeyAt===window.__passkeys)throw Object.assign(Error('The operation either timed out or was not allowed. See: https://www.w3.org/TR/webauthn-2/'),{name:window.__cancelPasskeyName||'NotAllowedError'});return {id:'qa-credential'}};`; },
  configureServer(s) { s.middlewares.use('/qa-obras', async (_req, res) => {
    res.setHeader('Content-Type', 'text/html'); res.end(await s.transformIndexHtml('/qa-obras', `<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';import Page from '/src/components/financeiro/AutorizacoesPorObra.jsx';import ModalPortal from '/src/components/ui/ModalPortal.jsx';
import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/componentes-padrao.css';import '/src/styles/financeiro-autorizacoes-pagamento.css';
function App(){const[busy,setBusy]=React.useState(false);const[caps,setCaps]=React.useState({can_decide:true,passkey_count:1,mode:'PILOT'});const[doc,setDoc]=React.useState(null);window.__setCaps=setCaps;return React.createElement(React.Fragment,null,React.createElement('main',{style:{padding:12,maxWidth:1400,margin:'auto'}},React.createElement('h1',null,'Autorizações de pagamento'),React.createElement(Page,{caps,userId:31,busy,setBusy,abrirDocumento:async doc=>{window.__documento=doc.id;setDoc(doc)}})),doc&&React.createElement(ModalPortal,{onClose:()=>setDoc(null)},React.createElement('div',{role:'dialog','aria-label':'Documento QA',style:{position:'fixed',inset:20,zIndex:1100,background:'white'}},'Documento '+doc.id,React.createElement('button',{onClick:()=>setDoc(null)},'Fechar documento'))))}
createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,React.createElement(App)));</script></body></html>`));
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
      data_vencimento: '2026-10-17', forma_pagamento: { nome: 'Boleto' },
      favorecido_pagamento: { nome: 'Fornecedor QA', metodo: 'PIX', pix_mascarado: '***1234' } }, documentos: [{ id, nome: 'Boleto ' + id + '.pdf' }] };
});
for (const [id, status, tituloStatus] of [[4,'QUITADO','QUITADO'],[5,'PARCIALMENTE_PAGO','PARCIAL'],[6,'NAO_PAGO','ABERTO'],[7,'NA_FILA','ABERTO'],[8,'CANCELADO','CANCELADO'],[9,'REJEITADO','ABERTO']]) {
  const i = items[id - 1]; i.situacao_financeira = status; i.status = status === 'REJEITADO' ? status : 'ENFILEIRADO'; i.titulo.status = tituloStatus;
  if (id === 4) { i.titulo.valor_baixado = 100; i.titulo.valor_saldo = 0; }
  if (id === 5) { i.titulo.valor_baixado = 30; i.titulo.valor_saldo = 70; }
}
const nomes = id => 'Obra ' + String(id).padStart(3, '0');
const originais = structuredClone(items);
let fail = false, failLot = 0, invalidar = 0, active = 0, maxActive = 0, slow = false, modoDetalhe = false;
let sinalDecisao, liberarDecisao;
const chamadas = [], decisoes = [], errors = [], unexpected = [];
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } }); page.on('pageerror', e => errors.push(e.message));
await page.route('**/*', async route => {
  const url = new URL(route.request().url()), p = url.searchParams;
  const json = (v, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(v) });
  if (url.pathname.includes('/autorizacoes-pagamento/')) {
    if(url.pathname.includes('/painel/fila-direta/')) {
      const body=route.request().postDataJSON();
      assert(body.decisoes.every(d=>d.fila_id>0 && d.titulo_id>0 && !('item_id' in d) && d.motivo.trim() && d.versao));
      if(url.pathname.endsWith('/opcoes'))return json({challenge:'qa-direta'});
      assert.equal(body.credential.id,'qa-credential');decisoes.push({id:'FILA_DIRETA',body});
      const itens=[];
      for(const d of body.decisoes){const i=items.find(i=>i.fila_id===d.fila_id);assert.equal(i.titulo_financeiro_id,d.titulo_id);
        i.status=i.situacao_financeira='REJEITADO';i.bloqueado_proprietario=true;i.fila_atual.status='RESOLVIDO';i.motivo_decisao=d.motivo;itens.push(i);}
      return json({itens});
    }
    const idLote = url.pathname.match(/\/(\d+)\/(autenticacao\/opcoes|decidir)$/);
    if (idLote) {
      const id = Number(idLote[1]), body = route.request().postDataJSON();
      if (id === failLot) return json({ message: 'Falha QA no próximo lote' }, 403);
      if (idLote[2] === 'autenticacao/opcoes') return json({ challenge: 'qa', decisoes: body.decisoes });
      if (sinalDecisao) await new Promise(resolve => { liberarDecisao = resolve; sinalDecisao(); sinalDecisao = null; });
      decisoes.push({ id, body });
      for (const d of body.decisoes) {
        const i = items.find(i => i.id === d.item_id); assert.equal(i.lote_id, id);
        assert(d.decisao === 'REJEITAR_FILA' ? ['AUTORIZADO', 'ENFILEIRADO'].includes(i.status) : i.status === 'PENDENTE');
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
        const dataTipo=p.get('data_tipo')||'VENCIMENTO',di=p.get('vencimento_inicio'),df=p.get('vencimento_fim');
        const preparados=items.map(i=>{
          const baixas=(i.baixas_qa||[]).filter(b=>b.status==='ATIVO'&&(!di||b.data>=di)&&(!df||b.data<=df));
          return {...i,pago_no_periodo:baixas.reduce((s,b)=>s+b.valor,0),ultima_baixa_periodo:baixas.at(-1)?.data||null,
            data_referencia:dataTipo==='PAGAMENTO'?baixas.at(-1)?.data||null:dataTipo==='EMISSAO'?i.data_emissao||null:i.vencimento_atual};
        });
        const recorte = preparados.filter(i => (!ids || ids.includes(i.id)) && (!p.get('situacao') || p.get('situacao') === i.situacao_financeira
            || p.get('situacao')==='NA_FILA' && i.situacao_financeira!=='EXCLUIDO' && ['PENDENTE','EM_EDICAO'].includes(i.fila_atual?.status) && !i.bloqueado_proprietario)
          && (!di || i.data_referencia >= di) && (!df || i.data_referencia && i.data_referencia <= df))
          .map(i => ({ ...i, obras: i.obras.filter(id => (!p.get('obra') || nomes(id).toLowerCase().includes(p.get('obra').toLowerCase())) && (!p.get('obra_id') || Number(p.get('obra_id')) === id)) })).filter(i => i.obras.length);
        const pagina = Number(p.get('pagina') || 1), limite = Number(p.get('limite') || 30), inicio = (pagina - 1) * limite;
        if (url.pathname.endsWith('/painel/obras')) {
          const obras = new Map();
          for (const i of recorte) for (const id of i.obras) {
            const o = obras.get(id) || { obra_id: id, obra_nome: nomes(id), quantidade_titulos: 0, valor_total: 0 };
            o.quantidade_titulos++; o.valor_total += (dataTipo==='PAGAMENTO'?i.pago_no_periodo:i.valor_snapshot) / (i.id === 1 ? 2 : 1); obras.set(id, o);
          }
          const data = [...obras.values()].sort((a,b) => a.obra_id - b.obra_id);
          return await json({ data: data.slice(inicio, inicio + limite), resumo: { quantidade_titulos: recorte.length, valor_total: data.reduce((s,o)=>s+o.valor_total,0) },
            paginacao: { pagina, total: data.length, mais: inicio + limite < data.length } });
        }
        let navegaveis = recorte;
        if (modoDetalhe || p.has('sentido')) navegaveis = [...recorte].sort((a,b) => (a.data_referencia||'').localeCompare(b.data_referencia||'') || b.id-a.id);
        if (p.has('sentido')) {
          const referencia = { id: Number(p.get('cursor_item_id')), vencimento_atual: p.get('cursor_vencimento') }, proxima = p.get('sentido') === 'PROXIMA';
          navegaveis = navegaveis.filter(i => { const ordem = (i.data_referencia||'').localeCompare(referencia.vencimento_atual==='SEM_DATA'?'':referencia.vencimento_atual) || referencia.id-i.id; return proxima ? ordem > 0 : ordem < 0; });
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
const aplicarStatus = async s => {
  const campo = page.getByLabel('Situação atual');
  if (await campo.inputValue() !== s) {
    const resposta = page.waitForResponse(r => r.url().includes('/painel/obras') && (new URL(r.url()).searchParams.get('situacao') || '') === s);
    await campo.selectOption(s); await resposta;
  }
  await pronto();
};
const buscarObra = async obra => {
  const resposta = page.waitForResponse(r => r.url().includes('/painel/obras') && new URL(r.url()).searchParams.get('obra') === obra);
  await page.getByLabel('Obra / centro de custo').fill(obra); await resposta; await pronto();
};
const limpar = () => page.getByRole('button', { name: 'Limpar seleção de todas as páginas' }).click();
try {
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/qa-obras`);
  await page.locator('.pa-obra').first().waitFor(); await pronto(); assert(chamadas.length > 0);
  const total = await page.locator('.pa-obras-resumo').textContent(); assert(total.includes('304 títulos únicos'), total);
  assert.equal(await page.getByRole('button', {name:'Aplicar filtros',exact:true}).count(),0);
  // Datas reais: fim primeiro aplica limite unico valido; inicio+fim aplicam
  // automaticamente. Substituicao por segmento, limite do ano e teclado mobile.
  const inicioData = page.getByLabel('Vencimento inicial', { exact: true });
  const fimData = page.getByLabel('Vencimento final', { exact: true });
  const antesData = chamadas.length;
  const fimPrimeiro = page.waitForResponse(r => r.url().includes('/painel/obras') && r.url().includes('vencimento_fim=2026-10-31') && !r.url().includes('vencimento_inicio='));
  await fimData.pressSequentially('31102026');
  assert.equal(await fimData.inputValue(), '31/10/2026');
  await fimPrimeiro; await pronto(); assert(chamadas.length > antesData);
  const filtroAutomatico = page.waitForResponse(r => r.url().includes('/painel/obras') && r.url().includes('vencimento_inicio=2026-10-15'));
  await inicioData.pressSequentially('15102026'); await filtroAutomatico; await pronto();
  await inicioData.evaluate(el => { el.focus(); el.setSelectionRange(0, 2); });
  await page.keyboard.type('02'); assert.equal(await inicioData.inputValue(), '02/10/2026');
  await fimData.evaluate(el => { el.focus(); el.setSelectionRange(6, 10); });
  await page.keyboard.type('20277'); assert.equal(await fimData.inputValue(), '31/10/2027', 'Ano nao recebe quinto digito');
  await fimData.evaluate(el => { el.setSelectionRange(3, 5); el.dispatchEvent(new InputEvent('beforeinput', { bubbles:true, cancelable:true, inputType:'insertText', data:'11' })); });
  assert.equal(await fimData.inputValue(), '31/11/2027');
  assert.equal(await fimData.evaluate(el => el.validity.valid), false, 'Data impossivel nao vai para API');
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click(); await pronto();
  await inicioData.pressSequentially('31102026'); await fimData.pressSequentially('01102026');
  await page.getByRole('status').getByText(/Ajuste as datas/).waitFor();
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click(); await pronto();
  // Situacao aplica o rascunho inteiro, inclusive busca/data ainda em debounce.
  await page.getByLabel('Obra / centro de custo').fill('Obra 001');
  await inicioData.pressSequentially('17102026'); await fimData.pressSequentially('17102026');
  const combinado = page.waitForResponse(r => {
    const u = new URL(r.url());
    return u.pathname.endsWith('/painel/obras') && u.searchParams.get('situacao') === 'NA_FILA'
      && u.searchParams.get('obra') === 'Obra 001' && u.searchParams.get('vencimento_inicio') === '2026-10-17'
      && u.searchParams.get('vencimento_fim') === '2026-10-17';
  });
  await page.getByLabel('Situação atual').selectOption('NA_FILA'); await combinado; await pronto();
  assert((await page.locator('.pa-obras-resumo').innerText()).includes('1 títulos únicos'));
  await aplicarStatus('QUITADO'); assert((await page.locator('.pa-obras-resumo').innerText()).includes('1 títulos únicos'));
  await page.getByRole('button',{name:'Limpar filtros',exact:true}).click(); await pronto();
  assert.equal(await inicioData.inputValue(),''); assert.equal(await fimData.inputValue(),'');
  const antesParcial = chamadas.length;
  await inicioData.pressSequentially('18');
  await page.getByLabel('Situação atual').selectOption('QUITADO'); await page.waitForTimeout(750);
  assert.equal(chamadas.length,antesParcial,'Data incompleta nao pode virar consulta de todo periodo ao mudar situacao');
  await page.getByRole('button',{name:'Limpar filtros',exact:true}).click(); await pronto();
  assert.equal(await inicioData.inputValue(),'','Limpar remove inclusive texto parcial sem ISO');
  await abrirObra(1);
  await page.getByRole('checkbox', { name: 'Selecionar os disponíveis desta página' }).check();
  await page.getByText(/^50 selecionado\(s\)/).waitFor();
  await page.getByRole('navigation', { name: 'Paginação de títulos' }).getByRole('button', { name: 'Próxima' }).click(); await pronto();
  await page.getByRole('checkbox', { name: 'Selecionar os disponíveis desta página' }).check(); await page.getByText(/^100 selecionado\(s\)/).waitFor();
  await abrirObra(2); await page.getByRole('checkbox', { name: 'Selecionar os disponíveis desta página' }).check(); await page.getByText(/^130 selecionado\(s\)/).waitFor();
  await limpar(); await page.getByText(/^0 selecionado\(s\)/).waitFor();
  // Aprovar somente um titulo; outro do MESMO lote deve continuar pendente.
  await abrirObra(1); await page.getByLabel('Selecionar TIT-1', { exact: true }).check();
  await page.evaluate(()=>{window.__cancelPasskeyAt=(window.__passkeys||0)+1;});
  await page.getByRole('button', { name: 'Autorizar', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar autorização com passkey' }).click();
  await page.getByRole('status').getByText(/Confirmação por passkey não concluída.*Nenhuma decisão foi enviada/).waitFor(); await pronto();
  assert.equal(decisoes.length,0,'Cancelar passkey nao envia POST de decisao');
  assert(await page.getByLabel('Selecionar TIT-1',{exact:true}).isChecked(),'Cancelar preserva selecao');
  assert(await page.getByRole('button',{name:'Autorizar',exact:true}).isEnabled(),'Pode tentar novamente');
  assert(!/w3\.org|timed out/.test(await page.locator('.pa-obras').innerText()));
  await page.getByRole('button', { name: 'Autorizar', exact: true }).click();
  await page.getByRole('region', { name: 'Conferência da decisão' }).waitFor();
  await page.getByRole('button', { name: 'Confirmar autorização com passkey' }).evaluate(el => { el.click(); el.click(); });
  await page.getByRole('status').getByText(/1 título\(s\) confirmado/).waitFor(); await pronto();
  assert.equal(decisoes.length, 1); assert.equal(decisoes[0].id, 7); assert.deepEqual(decisoes[0].body.decisoes.map(d=>d.item_id), [1]); assert.equal(items[1].status, 'PENDENTE');
  await abrirObra(2); await abrirObra(1); await page.getByLabel('Selecionar TIT-2', { exact: true }).check();
  await page.getByRole('button', { name: 'Autorizar', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar autorização com passkey' }).click(); await page.getByRole('status').getByText(/1 título\(s\) confirmado/).waitFor(); await pronto();
  assert.equal(decisoes.length, 2); assert.equal(decisoes[1].id, 7); assert.deepEqual(decisoes[1].body.decisoes.map(d=>d.item_id), [2]);
  // Status atuais, inclusive quitado/nao pago, sem modificar a decisao assinada.
  for (const s of ['QUITADO','PARCIALMENTE_PAGO','NAO_PAGO','NA_FILA']) {
    await aplicarStatus(s); await abrirObra(1); assert.equal(await page.locator('.pa-status').first().textContent(), { QUITADO:'Quitado', PARCIALMENTE_PAGO:'Parcialmente pago', NAO_PAGO:'Não pago', NA_FILA:'Na fila' }[s]);
    assert(await page.getByRole('button', { name: 'Autorizar', exact: true }).isDisabled());
  }
  // Filtros usam vencimento, e so disparam ao aplicar.
  const antes = chamadas.length; await page.getByLabel('Obra / centro de custo').fill('Obra 002'); assert.equal(chamadas.length, antes);
  await aplicarStatus('AGUARDANDO'); assert.equal(await page.locator('.pa-obra').count(), 1);
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click(); await pronto(); await abrirObra(1);
  await page.getByLabel('Selecionar TIT-3', { exact: true }).check();
  items[2].titulo.status = 'QUITADO'; items[2].titulo.valor_saldo = 0; items[2].titulo.valor_baixado = 100; items[2].situacao_financeira = 'QUITADO';
  await page.getByRole('button', { name: 'Autorizar', exact: true }).click();
  await page.getByRole('status').getByText(/A situação de um ou mais títulos mudou/).waitFor(); assert.equal(decisoes.length, 2); assert.equal(await page.getByRole('region', { name: 'Conferência da decisão' }).count(), 0); await pronto();
  // Falha parcial entre dois lotes nao desfaz o primeiro nem confirma o segundo.
  await page.getByLabel('Selecionar TIT-10', { exact: true }).check(); await page.getByLabel('Selecionar TIT-11', { exact: true }).check(); failLot = 111;
  await page.getByRole('button', { name: 'Autorizar', exact: true }).click(); await page.getByRole('button', { name: 'Confirmar autorização com passkey' }).click();
  await page.getByRole('status').getByText(/1 título\(s\) já confirmado/).waitFor(); await pronto(); assert.equal(items[9].status, 'ENFILEIRADO'); assert.equal(items[10].status, 'PENDENTE'); await limpar(); failLot = 0;
  // Servidor pode invalidar material sob lock: HTTP200 nao significa aprovado.
  invalidar = 12; await page.getByLabel('Selecionar TIT-12', { exact: true }).check();
  await page.getByRole('button', { name: 'Autorizar', exact: true }).click(); await page.getByRole('button', { name: 'Confirmar autorização com passkey' }).click();
  await page.getByRole('status').getByText(/Um ou mais títulos mudaram ou foram invalidados/).waitFor(); await pronto(); assert.equal(items[11].status, 'INVALIDADO'); invalidar = 0;
  await page.getByLabel('Selecionar TIT-13', { exact: true }).check(); await page.getByRole('button', { name: 'Rejeitar', exact: true }).click();
  assert(await page.getByLabel('Motivo para rejeição').isVisible());
  assert(await page.getByRole('button', { name: 'Conferir rejeição', exact: true }).isDisabled());
  await page.getByLabel('Motivo para rejeição').fill('Conferir contrato antes do pagamento');
  await page.getByRole('button', { name: 'Conferir rejeição', exact: true }).click(); await page.getByRole('button', { name: 'Confirmar rejeição com passkey' }).click();
  await page.getByRole('status').getByText(/Rejeições registradas/).waitFor(); await pronto(); assert.equal(items[12].status, 'REJEITADO');
  assert.equal(decisoes.at(-1).body.decisoes[0].motivo, 'Conferir contrato antes do pagamento');
  // Somente leitura e sem passkey nao habilitam decisao.
  await page.evaluate(() => window.__setCaps({ can_decide: false, passkey_count: 0 })); await page.getByRole('region', { name: 'Conferência e avisos' }).waitFor({ state: 'detached' });
  assert(await page.getByLabel('Selecionar TIT-11', { exact: true }).isDisabled());
  await page.evaluate(() => window.__setCaps({ can_decide: true, passkey_count: 0 })); assert(await page.getByRole('button', { name: 'Autorizar', exact: true }).isDisabled());
  await page.evaluate(() => window.__setCaps({ can_decide: true, passkey_count: 1 }));
  // Erro preserva dados/rascunho, mas bloqueia acoes ate refresh confirmado.
  fail = true; await page.evaluate(() => window.dispatchEvent(new Event('fluxy-autorizacoes-obras-atualizar'))); await page.getByRole('alert').waitFor();
  assert(await page.getByRole('button', { name: 'Autorizar', exact: true }).isDisabled());
  fail = false; await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await page.getByRole('alert').waitFor({ state: 'detached' }); await pronto();
  // Troca rapida de filtros e tempestade de foco com respostas lentas.
  slow = true;
  for (const busca of ['Obra 001', 'Obra 002', 'Obra 003']) {
    await page.getByLabel('Obra / centro de custo').fill(busca);
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
  await buscarObra('Obra 999');
  await page.getByText(/Nenhuma obra nesta situação/).waitFor(); await page.screenshot({ path: path.join(output, 'vazio-mobile.png'), fullPage: true });
  // Detalhe de tela inteira: mesma lista/filtros, sem aprovar ao navegar.
  modoDetalhe = true; items.splice(0, items.length, ...structuredClone(originais));
  Object.assign(items[80], {envio_destino:'AUTORIZACAO',enviado_por:{id:19,nome:'Novo preparador QA'},enviado_em:'2026-10-18T12:00:00Z'});
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click(); await pronto();
  assert.equal(await page.getByRole('region', { name: 'Conferência e avisos' }).count(), 0, 'Nao ocupa area com selecao vazia antes de abrir obra');
  await abrirObra(1); await page.getByLabel('Selecionar TIT-130', { exact: true }).check();
  const totalDecisoes = decisoes.length;
  await page.getByRole('button', { name: 'Abrir detalhes de TIT-81', exact: true }).click();
  const detalhe = page.getByRole('dialog', { name: 'Detalhes do título para autorização' });
  const prontoDetalhe = async id => { await detalhe.getByRole('heading', { name: 'SOL-' + id, exact: true }).waitFor(); await detalhe.getByRole('button', { name: 'Próxima', exact: true }).waitFor({ state: 'visible' }); await page.waitForFunction(() => !document.querySelector('.pa-titulo-rodape button')?.disabled); };
  await prontoDetalhe(81);
  assert((await detalhe.innerText()).includes('Enviado para autorização. Por Novo preparador QA'));
  assert.equal(await detalhe.getByText('Valor enviado para autorização', { exact: true }).count(), 1);
  await detalhe.getByRole('heading', { name: 'Dados para autorização', exact: true }).waitFor();
  await detalhe.getByRole('heading', { name: 'Documentos enviados para autorização', exact: true }).waitFor();
  assert(!/dossi[eê]/i.test(await detalhe.innerText()), 'Rotulos do detalhe usam linguagem de autorizacao, sem renomear contratos tecnicos');
  assert.equal(await page.locator('#root').evaluate(el => el.inert), true);
  assert.deepEqual(await detalhe.getByRole('navigation').getByRole('button').allTextContents(), ['Anterior','Rejeitar','Autorizar','Próxima']);
  await detalhe.getByRole('button', { name: 'Próxima', exact: true }).click(); await prontoDetalhe(80);
  await detalhe.getByRole('button', { name: 'Anterior', exact: true }).click(); await prontoDetalhe(81);
  assert.equal(decisoes.length, totalDecisoes, 'Anterior/proxima nao chamam POST de decisao');
  await detalhe.getByRole('button', { name: 'Próxima', exact: true }).click(); await prontoDetalhe(80);
  await detalhe.getByRole('button', { name: 'Boleto 80.pdf', exact: true }).click(); assert.equal(await page.evaluate(() => window.__documento), 80);
  await page.getByRole('dialog',{name:'Documento QA'}).waitFor(); await page.keyboard.press('Escape');
  await page.getByRole('dialog',{name:'Documento QA'}).waitFor({state:'detached'}); assert(await detalhe.isVisible(),'Escape do anexo nao fecha o titulo');
  for (const width of [320,390,768,1366]) {
    await page.setViewportSize({width,height:850});
    await detalhe.locator('.pa-titulo-corpo').evaluate(el => el.scrollTo(0, 0));
    assert(await detalhe.evaluate(el => { const r=el.getBoundingClientRect();return r.top===0 && r.left===0 && r.width===innerWidth && Math.abs(r.height-innerHeight)<2; }), 'Tela inteira '+width);
    assert(await detalhe.locator('footer').evaluate(el => el.getBoundingClientRect().bottom<=innerHeight+1), 'Rodape sempre visivel');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Rotulo maior sem overflow '+width);
    assert(await detalhe.locator('.pa-titulo-valores').evaluate(el => el.scrollWidth <= el.clientWidth), 'Valores sem corte com rotulo completo '+width);
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
  await detalhe.getByRole('button', { name: 'Autorizar', exact: true }).click();
  await detalhe.getByRole('region',{name:'Conferência deste título'}).waitFor();
  await detalhe.getByRole('button',{name:'Anterior',exact:true}).click(); await prontoDetalhe(81);
  assert.equal(decisoes.length,totalDecisoes,'Navegar apos conferir tambem nao decide');
  assert.equal(await detalhe.getByRole('region',{name:'Conferência deste título'}).count(),0);
  await detalhe.getByRole('button',{name:'Próxima',exact:true}).click(); await prontoDetalhe(80);
  await page.evaluate(()=>{window.__cancelPasskeyAt=window.__passkeys+1;window.__cancelPasskeyName='AbortError';});
  await detalhe.getByRole('button', { name: 'Autorizar', exact: true }).click();
  await detalhe.getByRole('button', { name: 'Confirmar aprovação com passkey' }).click();
  await detalhe.getByRole('status').getByText(/Confirmação por passkey não concluída/).waitFor();
  assert.equal(decisoes.length,totalDecisoes);
  assert.equal(await detalhe.getByRole('alert').count(),0,'Cancelamento nao bloqueia o detalhe como erro');
  assert(await detalhe.getByRole('button',{name:'Autorizar',exact:true}).isEnabled());
  await detalhe.getByRole('button', { name: 'Autorizar', exact: true }).click();
  const decisaoEmVoo = new Promise(resolve => { sinalDecisao = resolve; });
  await detalhe.getByRole('button', { name: 'Confirmar aprovação com passkey' }).evaluate(el=>{el.click();el.click();});
  await decisaoEmVoo;
  const indiceEmDecisao = await page.evaluate(() => history.state.idx);
  await page.goBack(); await page.waitForFunction(idx => history.state.idx === idx, indiceEmDecisao);
  assert(await detalhe.isVisible(), 'Voltar nao desmonta uma decisao em andamento');
  assert(await detalhe.getByRole('button', { name: 'Confirmar aprovação com passkey' }).isDisabled());
  liberarDecisao(); liberarDecisao = null;
  await detalhe.getByText('Somente este título foi aprovado. Os demais não foram decididos.').waitFor(); await prontoDetalhe(80);
  assert.deepEqual(decisoes.at(-1).body.decisoes.map(d=>d.item_id), [80]); assert.equal(decisoes.length,totalDecisoes+1);
  assert.equal(items[129].status,'PENDENTE','Selecao fora do detalhe nao foi aprovada');
  await detalhe.getByRole('button', { name: 'Próxima', exact: true }).click(); await prontoDetalhe(79);
  await detalhe.getByRole('button', { name: 'Anterior', exact: true }).click(); await prontoDetalhe(81);
  await detalhe.getByRole('button', { name: 'Próxima', exact: true }).click(); await prontoDetalhe(79);
  await detalhe.getByRole('button', { name: 'Rejeitar', exact: true }).click(); assert(await detalhe.getByLabel('Motivo da rejeição').isVisible());
  assert.equal(decisoes.length,totalDecisoes+1);
  await detalhe.getByLabel('Motivo da rejeição').fill('Conferir valores do contrato');
  await detalhe.getByRole('button', { name: 'Conferir rejeição', exact: true }).click(); await detalhe.getByRole('button', { name: 'Confirmar rejeição com passkey' }).click();
  await detalhe.getByText('Somente este título foi rejeitado, com motivo e histórico.').waitFor(); await prontoDetalhe(79);
  assert.deepEqual(decisoes.at(-1).body.decisoes,[{item_id:79,decisao:'REJEITAR',motivo:'Conferir valores do contrato'}]);
  await detalhe.getByRole('button', { name: 'Próxima', exact: true }).click(); await prontoDetalhe(78);
  await page.evaluate(()=>window.__setCaps({can_decide:false,passkey_count:1}));
  assert(await detalhe.getByRole('button', {name:'Autorizar',exact:true}).isDisabled());
  assert(await detalhe.getByRole('button', {name:'Rejeitar',exact:true}).isDisabled());
  assert(await detalhe.getByRole('button', {name:'Próxima',exact:true}).isEnabled());
  await page.evaluate(()=>window.__setCaps({can_decide:true,passkey_count:0})); assert(await detalhe.getByRole('button', {name:'Autorizar',exact:true}).isDisabled());
  await page.evaluate(()=>window.__setCaps({can_decide:true,passkey_count:1,paused:true})); assert(await detalhe.getByRole('button', {name:'Autorizar',exact:true}).isDisabled());
  await page.evaluate(()=>window.__setCaps({can_decide:true,passkey_count:1}));
  invalidar=78;
  await detalhe.getByRole('button', { name: 'Autorizar', exact: true }).click(); await detalhe.getByRole('button', { name: 'Confirmar aprovação com passkey' }).click();
  await detalhe.getByRole('alert').getByText(/O servidor não confirmou esta decisão/).waitFor(); invalidar=0;
  assert(await detalhe.getByRole('button', {name:'Autorizar',exact:true}).isDisabled());
  await detalhe.getByRole('button',{name:'Atualizar título',exact:true}).click(); await prontoDetalhe(78);
  await detalhe.getByRole('button',{name:'Próxima',exact:true}).click(); await prontoDetalhe(77);
  const antesObsoleto=decisoes.length;
  items[76].titulo.status='QUITADO';items[76].titulo.valor_saldo=0;items[76].situacao_financeira='QUITADO';
  await detalhe.getByRole('button',{name:'Autorizar',exact:true}).click(); await detalhe.getByText(/A situação do título mudou/).waitFor();
  assert.equal(decisoes.length,antesObsoleto); assert.equal(await detalhe.getByRole('region',{name:'Conferência deste título'}).count(),0);
  await page.keyboard.press('Escape'); await detalhe.waitFor({state:'detached'}); await pronto();
  assert.equal(await page.locator('#root').evaluate(el=>el.inert),false);
  assert(await page.getByLabel('Selecionar TIT-130',{exact:true}).isChecked(),'Selecao geral preservada ao fechar o detalhe');
  // Historico real do navegador: anterior/proxima nao acrescentam etapas.
  const postsAntesVoltar = decisoes.length;
  await page.getByRole('button', { name: 'Abrir detalhes de TIT-81', exact: true }).evaluate(el => { el.click(); el.click(); }); await prontoDetalhe(81);
  await detalhe.getByRole('button', { name: 'Próxima', exact: true }).click(); await prontoDetalhe(76);
  await detalhe.getByRole('button', { name: 'Boleto 76.pdf', exact: true }).click();
  await page.getByRole('dialog', { name: 'Documento QA' }).waitFor();
  const indiceDetalhe = await page.evaluate(() => history.state.idx);
  await page.goBack(); await page.getByRole('dialog', { name: 'Documento QA' }).waitFor({ state: 'detached' });
  await page.waitForFunction(idx => history.state.idx === idx, indiceDetalhe);
  assert(await detalhe.isVisible(), 'Voltar fecha apenas o anexo sobreposto');
  await page.goBack(); await detalhe.waitFor({ state: 'detached' }); await pronto();
  assert(await page.getByLabel('Selecionar TIT-130',{exact:true}).isChecked());
  await page.goForward(); await prontoDetalhe(81); // Revalida o alvo ao reabrir.
  slow = true;
  await detalhe.getByRole('button', { name: 'Atualizar título', exact: true }).click();
  await page.goBack();
  await page.waitForFunction(idx => history.state.idx === idx, indiceDetalhe);
  assert(await detalhe.isVisible(), 'Voltar durante consulta nao desmonta a operacao');
  await prontoDetalhe(81); slow = false;
  await page.goBack(); await detalhe.waitFor({ state: 'detached' }); await pronto();
  await page.goBack(); await page.locator('.pa-obras[data-detalhe="false"]').waitFor();
  await page.goForward(); await pronto();
  assert(await page.getByLabel('Selecionar TIT-130',{exact:true}).isChecked(), 'Selecao mantida ao voltar e avancar entre obras');
  assert.equal(decisoes.length, postsAntesVoltar, 'Voltar/avancar nunca decide');
  assert(!/snapshot_json|SOL-|Fornecedor QA/.test(await page.evaluate(() => JSON.stringify(history.state))), 'Historico nao armazena dossies');
  // Bloqueio do saldo parcial ja em fila; autorizacao nao pode ser reenviada
  // pelo mesmo botao. Motivo abre sob demanda, sem painel permanente inferior.
  await page.getByRole('button', { name: 'Voltar às obras' }).click(); await pronto();
  await aplicarStatus('PARCIALMENTE_PAGO'); await abrirObra(1);
  await limpar();
  await page.getByLabel('Selecionar TIT-5', { exact:true }).check();
  assert((await page.locator('.pa-obras-total-selecao').innerText()).includes('70,00'));
  const barra = page.getByRole('navigation', { name:'Paginação de títulos' });
  assert.deepEqual(await barra.getByRole('button').allTextContents(), ['Anterior','Rejeitar','Autorizar','Próxima']);
  for (const width of [320,390,768,1366]) {
    await page.setViewportSize({width,height:900});
    await barra.scrollIntoViewIfNeeded();
    assert(await barra.evaluate(el=>el.scrollWidth<=el.clientWidth),'Barra sem corte '+width);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Pagina sem overflow '+width);
    await page.screenshot({path:path.join(output,'rejeitar-saldo-'+width+'.png')});
  }
  await page.setViewportSize({width:390,height:900});
  assert(await barra.getByRole('button', { name:'Autorizar', exact:true }).isDisabled());
  assert.equal(await page.getByLabel('Motivo para rejeição').count(), 0);
  await barra.getByRole('button', { name:'Rejeitar', exact:true }).click();
  await page.getByLabel('Motivo para rejeição').fill('Suspender somente o saldo de 70');
  await page.getByRole('button', { name:'Conferir rejeição', exact:true }).click();
  await page.getByRole('button', { name:'Confirmar rejeição com passkey' }).evaluate(el => {el.click();el.click();});
  await page.getByRole('status').getByText(/Rejeições registradas/).waitFor(); await pronto();
  assert.deepEqual(decisoes.at(-1).body.decisoes, [{item_id:5,decisao:'REJEITAR_FILA',motivo:'Suspender somente o saldo de 70'}]);
  assert.deepEqual([items[4].titulo.valor_baixado,items[4].titulo.valor_saldo],[30,70]);
  await page.getByRole('button', { name:'Voltar às obras' }).click(); await pronto();
  await aplicarStatus('NA_FILA'); await abrirObra(1);
  await page.getByRole('button', { name:'Abrir detalhes de TIT-7', exact:true }).click(); await prontoDetalhe(7);
  assert(await detalhe.getByRole('button', { name:'Autorizar',exact:true }).isDisabled());
  await detalhe.getByRole('button', { name:'Rejeitar',exact:true }).click();
  await detalhe.getByLabel('Motivo da rejeição').fill('Suspender o pagamento');
  await detalhe.getByRole('button', { name:'Conferir rejeição',exact:true }).click();
  await detalhe.getByRole('button', { name:'Confirmar rejeição com passkey' }).click();
  await detalhe.getByText('Somente este título foi rejeitado, com motivo e histórico.').waitFor();
  assert.equal(decisoes.at(-1).body.decisoes[0].decisao,'REJEITAR_FILA');
  await detalhe.getByRole('button',{name:'Voltar à lista',exact:true}).click(); await pronto();
  await page.getByRole('button',{name:'Voltar às obras',exact:true}).click(); await pronto();
  await aplicarStatus('AGUARDANDO'); await abrirObra(1);
  await page.getByLabel('Selecionar TIT-125',{exact:true}).check();
  await page.getByLabel('Selecionar TIT-126',{exact:true}).check();
  await page.evaluate(()=>{window.__cancelPasskeyAt=window.__passkeys+2;window.__cancelPasskeyName='NotAllowedError';});
  const antesInterromper=decisoes.length;
  await page.getByRole('button',{name:'Autorizar',exact:true}).click();
  await page.getByRole('button',{name:'Confirmar autorização com passkey',exact:true}).click();
  await page.getByRole('status').getByText(/1 título\(s\) já confirmado\(s\); os demais não foram alterados/).waitFor(); await pronto();
  assert.equal(decisoes.length,antesInterromper+1,'Segundo lote cancelado nao envia decisao');
  assert.equal(items[124].status,'ENFILEIRADO');assert.equal(items[125].status,'PENDENTE');
  assert(await page.getByLabel('Selecionar TIT-126',{exact:true}).isChecked());
  assert(!/Nenhuma decisão foi enviada|w3\.org|timed out/.test(await page.getByRole('status').innerText()),'Nao negar confirmacoes anteriores');
  // Novo universo: digitais + diretos, inclusive saldo parcial. Nenhum lote
  // ficticio e nenhum ID de fila enviado como item_id digital.
  await limpar();await page.getByRole('button',{name:'Voltar às obras',exact:true}).click();await pronto();
  const digital=structuredClone(originais[6]);digital.fila_atual={id:7,status:'PENDENTE'};
  const diretos=[1,2,3].map(n=>({ ...structuredClone(originais[6]),id:-n,lote_id:null,lote:null,origem_painel:'FILA_DIRETA',fila_id:n,
    titulo_financeiro_id:1000+n,status:'FILA_DIRETA',situacao_financeira:n===1?'PARCIALMENTE_PAGO':'NA_FILA',
    versao_painel:'a'.repeat(64),snapshot_hash:null,documentos:[],fila_atual:{id:n,status:'PENDENTE'},
    enviado_por:{id:20,nome:'Financeiro QA'},enviado_em:'2026-10-18T12:00:00Z',data_emissao:'2026-01-01',
    titulo:{id:1000+n,status:n===1?'PARCIAL':'ABERTO',valor_baixado:n===1?30:0,valor_saldo:n===1?70:100},
    snapshot_json:{codigo:'TIT-D'+n,solicitacao:{codigo:'SOL-D'+n},credor:{nome:'Fornecedor direto'}},
    baixas_qa:n===1?[{data:'2026-10-18',valor:30,status:'ATIVO'},{data:'2026-10-18',valor:500,status:'ESTORNADO'}]:[] }));
  items.splice(0,items.length,digital,...diretos);
  await page.getByRole('button',{name:'Limpar filtros',exact:true}).click();await pronto();await aplicarStatus('NA_FILA');
  assert((await page.locator('.pa-obras-resumo').innerText()).includes('4 títulos únicos'));
  assert((await page.locator('.pa-obras-resumo').innerText()).includes('Todo o período'));
  await page.getByLabel('Filtrar pela data de').selectOption('EMISSAO');
  const di=page.getByLabel('Data inicial',{exact:true}),df=page.getByLabel('Data final',{exact:true});
  await df.pressSequentially('01012026');await di.pressSequentially('01012026');
  await page.waitForResponse(r=>r.url().includes('/painel/obras')&&r.url().includes('data_tipo=EMISSAO')&&r.url().includes('vencimento_inicio=2026-01-01'));await pronto();
  assert((await page.locator('.pa-obras-resumo').innerText()).includes('3 títulos únicos'));
  // Limpar as duas datas autoaplica todo periodo, sem clique escondido.
  await di.fill('');await df.fill('');
  await page.waitForResponse(r=>r.url().includes('/painel/obras')&&r.url().includes('data_tipo=EMISSAO')&&!r.url().includes('vencimento_inicio'));await pronto();
  assert((await page.locator('.pa-obras-resumo').innerText()).includes('4 títulos únicos'));
  await page.getByLabel('Filtrar pela data de').selectOption('PAGAMENTO');
  await df.pressSequentially('18102026');await di.pressSequentially('18102026');
  await page.waitForResponse(r=>r.url().includes('/painel/obras')&&r.url().includes('data_tipo=PAGAMENTO')&&r.url().includes('vencimento_inicio=2026-10-18'));await pronto();
  assert((await page.locator('.pa-obras-resumo').innerText()).includes('Valor efetivamente pago no período'));
  assert((await page.locator('.pa-obras-resumo').innerText()).includes('30,00'));
  for(const width of [320,390,768,1366]){
    await page.setViewportSize({width,height:900});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Filtro de pagamento sem corte '+width);
    await page.screenshot({path:path.join(output,'filtro-pagamento-'+width+'.png'),fullPage:true});
  }
  await page.setViewportSize({width:390,height:900});
  await abrirObra(1);await page.getByRole('button',{name:'Abrir detalhes de TIT-D1',exact:true}).click();
  await detalhe.getByRole('heading',{name:'SOL-D1',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('.pa-titulo-rodape button')?.disabled);
  assert((await detalhe.innerText()).includes('Financeiro QA'));assert(!/Lote #null/.test(await detalhe.innerText()));
  assert((await detalhe.getByText(/Valor efetivamente pago no período:/).innerText()).includes('30,00'),'Revalidacao do detalhe preserva periodo');
  assert(await detalhe.getByRole('button',{name:'Autorizar',exact:true}).isDisabled());
  const antesDireto=decisoes.length;
  await detalhe.getByRole('button',{name:'Rejeitar',exact:true}).click();await detalhe.getByLabel('Motivo da rejeição').fill('Bloquear apenas o saldo');
  await detalhe.getByRole('button',{name:'Conferir rejeição',exact:true}).click();
  await page.evaluate(()=>{window.__cancelPasskeyAt=window.__passkeys+1;});
  await detalhe.getByRole('button',{name:'Confirmar rejeição com passkey',exact:true}).click();
  await detalhe.getByRole('status').getByText(/Confirmação por passkey não concluída/).waitFor();assert.equal(decisoes.length,antesDireto);
  await detalhe.getByRole('button',{name:'Rejeitar',exact:true}).click();await detalhe.getByRole('button',{name:'Conferir rejeição',exact:true}).click();
  await detalhe.getByRole('button',{name:'Confirmar rejeição com passkey',exact:true}).evaluate(el=>{el.click();el.click();});
  await detalhe.getByText('Somente este título foi rejeitado, com motivo e histórico.').waitFor();
  assert.equal(decisoes.length,antesDireto+1);assert.equal(decisoes.at(-1).id,'FILA_DIRETA');
  assert.deepEqual([diretos[0].titulo.valor_baixado,diretos[0].titulo.valor_saldo],[30,70]);
  await detalhe.getByRole('button',{name:'Voltar à lista',exact:true}).click();await pronto();
  await page.getByRole('button',{name:'Voltar às obras',exact:true}).click();await pronto();
  await page.getByRole('button',{name:'Limpar filtros',exact:true}).click();await pronto();await aplicarStatus('NA_FILA');await abrirObra(1);
  await page.getByRole('checkbox',{name:'Selecionar os disponíveis desta página'}).check();
  await page.getByRole('button',{name:'Rejeitar',exact:true}).click();await page.getByLabel('Motivo para rejeição').fill('Conferir envios selecionados');
  await page.getByRole('button',{name:'Conferir rejeição',exact:true}).click();
  const antesMisto=decisoes.length;await page.getByRole('button',{name:'Confirmar rejeição com passkey',exact:true}).click();
  await page.getByRole('status').getByText(/3 título\(s\) confirmado/).waitFor();await pronto();
  assert.equal(decisoes.length,antesMisto+2,'Diretos em grupo proprio e digital no lote real');
  assert.equal(decisoes.at(-1).id,'FILA_DIRETA');assert.equal(decisoes.at(-1).body.decisoes.length,2);
  // Excluidos separados das pendencias: registros/autorizacoes/filas antigas
  // permanecem no historico e nao habilitam nenhuma decisao.
  await page.getByRole('button',{name:'Voltar às obras',exact:true}).click();await pronto();
  const excluidos=[['TIT-009718','SOL-6240',10982.88],['TIT-009810','SOL-6312',2480],['TIT-010187','SOL-6392',2070.79]].map(([codigo,sol,valor],n)=>({
    ...structuredClone(originais[n]),id:5001+n,titulo_financeiro_id:9001+n,lote_id:500,
    obras:[1],status:n===2?'PENDENTE':'ENFILEIRADO',situacao_financeira:'EXCLUIDO',titulo:null,
    valor_snapshot:valor,snapshot_json:{codigo,solicitacao:{codigo:sol},credor:{nome:'Credor historico QA'}},
    exclusao_titulo:{em:'2026-10-09T16:20:53Z',responsavel:{id:2,nome:'Operadora QA'},motivo:'Exclusao em massa pela tela de contas a pagar/receber'},
    fila_atual:n===2?null:{id:33+n,status:'PENDENTE'}
  }));
  items.splice(0,items.length,...excluidos);
  const antesHistorico=decisoes.length;
  await page.getByRole('button',{name:'Limpar filtros',exact:true}).click();await pronto();
  assert((await page.locator('.pa-obras-resumo').innerText()).includes('0 títulos únicos'));
  await aplicarStatus('NA_FILA');assert((await page.locator('.pa-obras-resumo').innerText()).includes('0 títulos únicos'));
  await aplicarStatus('EXCLUIDO');
  assert((await page.locator('.pa-obras-resumo').innerText()).includes('Valor histórico enviado — não é saldo a pagar'));
  await abrirObra(1);
  assert.equal(await page.getByRole('note',{name:'Histórico de exclusão do título'}).count(),3);
  assert.equal(await page.getByText('Título excluído',{exact:true}).count(),3);
  assert.equal(await page.getByText(/Pendente de decisão, mas/).count(),0);
  for(const codigo of ['TIT-009718','TIT-009810','TIT-010187'])
    assert(await page.getByLabel('Selecionar '+codigo,{exact:true}).isDisabled());
  assert(await page.getByRole('button',{name:'Autorizar',exact:true}).isDisabled());
  assert(await page.getByRole('button',{name:'Rejeitar',exact:true}).isDisabled());
  await page.getByRole('button',{name:'Abrir detalhes de TIT-009810',exact:true}).click();
  await detalhe.getByRole('heading',{name:'SOL-6312',exact:true}).waitFor();
  await page.waitForFunction(()=>!document.querySelector('.pa-titulo-rodape button')?.disabled);
  const historico=detalhe.getByRole('note',{name:'Histórico de exclusão do título'});
  assert((await historico.innerText()).includes('Operadora QA'));
  assert((await historico.innerText()).includes('Exclusao em massa pela tela de contas a pagar/receber'));
  assert((await detalhe.locator('.pa-titulo-valores').innerText()).includes('2.480,00'),'Snapshot historico nao e reescrito');
  assert(await detalhe.getByRole('button',{name:'Autorizar',exact:true}).isDisabled());
  assert(await detalhe.getByRole('button',{name:'Rejeitar',exact:true}).isDisabled());
  for(const width of [320,390,1366]){
    await page.setViewportSize({width,height:900});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Historico excluido sem overflow '+width);
    await page.screenshot({path:path.join(output,'titulo-excluido-'+width+'.png'),fullPage:false});
  }
  assert.equal(decisoes.length,antesHistorico,'Consultar excluidos nao executa acao financeira');
  assert.equal(maxActive, 1, 'Leituras seriais, sem N+1/polling concorrente'); assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log('UI por obra/titulo: desktop/tablet/mobile/escuro, selecao/paginas/cursor/historico, passkey/motivo/revalidacao/duplo clique/ACL, tres bases de data/limpeza automatica/total pago sem estorno, fila direta/autor/parcial/rejeicao e grupos mistos sem lote ficticio aprovados. APIs isoladas.');
} finally { liberarDecisao?.(); await page.close(); await browser.close(); await server.close(); }
