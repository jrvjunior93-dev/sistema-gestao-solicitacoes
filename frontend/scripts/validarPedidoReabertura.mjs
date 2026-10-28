// Tela/cliente HTTP reais, API interceptada. Sem banco/S3/API externos.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '../outputs/pedido-reabertura'); fs.mkdirSync(output, { recursive: true });
const statuses = [{ codigo: 'ABERTO', nome: 'Aberto', ativo: true, bloqueia_edicao: false },
  { codigo: 'FECHADO_FORNECEDOR', nome: 'Fechado com o fornecedor', ativo: true, bloqueia_edicao: true },
  { codigo: 'CANCELADO', nome: 'Cancelado', ativo: true, bloqueia_edicao: true }];
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0, proxy: {} }, plugins: [{
  name: 'qa-pedido-reabertura', enforce: 'pre',
  transform(_code, id) {
    if (id.endsWith('/src/contexts/AuthContext.jsx')) return `export const useAuth=()=>({user:{id:7,perfil:'USUARIO',setor:{codigo:'COMPRAS'},areas_permissoes_configuradas:true,
areas_permissoes:['compras.pedidos.visualizar',...(new URLSearchParams(location.search).get('papel')==='leitura'?[]:['compras.pedidos.criar','compras.pedidos.editar_itens','compras.pedidos.reabrir','compras.pedidos.alterar_status'])]}});`;
  },
  configureServer(vite) { vite.middlewares.use('/qa-pedido', async (_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(await vite.transformIndexHtml('/qa-pedido', `<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from'react';import{createRoot}from'react-dom/client';import{BrowserRouter,Routes,Route}from'react-router-dom';
import Page from'/src/modules/solicitacao-compra/pages/PedidoCompraDetalhe.jsx';import{ThemeContext,TEMA_PADRAO}from'/src/contexts/ThemeContext.jsx';
import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/componentes-padrao.css';import '/src/styles/responsive-system.css';
createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,React.createElement(ThemeContext.Provider,{value:{tema:TEMA_PADRAO}},React.createElement('main',{className:'layout-main'},React.createElement(Routes,null,React.createElement(Route,{path:'/qa-pedido/:id',element:React.createElement(Page)}))))));
</script></body></html>`));
  }); }
}] });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
page.setDefaultTimeout(15000);
const errors = [], unexpected = [], writes = [], reads = [];
const testarPrecisao = process.argv.includes('--precisao');
let status = 'FECHADO_FORNECEDOR', modo = 'ok', geo = false, falhaGet = false, liberar;
const pedido = id => ({ id: Number(id), solicitacao_compra_id: 295, fornecedor_compra_id: 10,
  fornecedor: { id: 10, nome: 'Fornecedor QA' }, obra: { id: 1, nome: 'Obra QA' },
  solicitacao: { id: 295, status: status === 'ABERTO' ? 'FECHAMENTO_PARCIAL' : 'ENCERRADO' },
  status, status_configuracao: statuses.find(s => s.codigo === status), edicao_bloqueada: status !== 'ABERTO',
  valor_total: 6745.65, valor_mercadorias: 6745.65, valor_total_fornecedor: 6745.65,
  candidatos_adicao: [], candidatos_remanejamento: [], fretes: [],
  financeiro: { reabertura_exige_geo: geo, reabertura: geo && modo === 'geo-pendente' ? { status: 'PENDENTE' } : null, titulos: [], opcoes: {} },
  itens: Array.from({ length: 26 }, (_, n) => ({ id: n + 1, descricao: `Material QA ${n + 1}`,
    item_tipo: 'MANUAL', quantidade_pedido: 10, preco_unitario: 25.95, valor_total: 259.5, logs: [] })) });
page.on('pageerror', e => errors.push(e.message));
await page.route('**/*', async route => {
  const req = route.request(), url = new URL(req.url());
  const json = (body, code = 200) => route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(body) });
  if (url.pathname.endsWith('/configuracoes/status-pedidos-compra')) return json({ statuses });
  if (testarPrecisao && /\/compras\/pedidos\/\d+\/itens\/1$/.test(url.pathname) && req.method() === 'PATCH') {
    const body=JSON.parse(req.postData());
    writes.push({path:url.pathname,body});
    const updated=pedido(271);
    updated.itens[0].preco_unitario=body.preco_unitario;
    updated.itens[0].quantidade_pedido=body.quantidade_pedido;
    return json(updated);
  }
  if (/\/compras\/pedidos\/\d+(\/status|\/reabrir-cotacao|\/reaberturas)?$/.test(url.pathname)) {
    const id = url.pathname.match(/pedidos\/(\d+)/)[1];
    if (req.method() === 'GET') {
      reads.push(url.pathname);
      if (falhaGet) return json({ error: 'Falha temporária na leitura' }, 503);
      return json(pedido(id));
    }
    writes.push({ path: url.pathname, body: JSON.parse(req.postData()) });
    if (modo === 'esperar') await new Promise(ok => { liberar = ok; });
    if (modo === 'negativa') return json({ error: 'Confirme a previsão de entrega antes de fechar.' }, 400);
    if (modo === 'rede') { status = 'ABERTO'; return route.abort('failed'); }
    if (url.pathname.endsWith('/reaberturas')) { geo = true; modo = 'geo-pendente'; return json({ id: 8, status: 'PENDENTE' }); }
    status = url.pathname.endsWith('/status') ? JSON.parse(req.postData()).status : 'ABERTO';
    if (modo === 'confirmado') return json({ id: Number(id), status, operacao_confirmada: true, detalhe_pendente: true,
      operacao_id: '00000000-0000-4000-8000-000000000001' }, 202);
    return json(pedido(id));
  }
  if (url.hostname === '127.0.0.1' && !url.pathname.startsWith('/api')) return route.continue();
  unexpected.push(req.url()); return route.abort();
});
const base = `http://127.0.0.1:${server.httpServer.address().port}/qa-pedido/271`;
const fechar = () => page.getByRole('button', { name: 'Fechar com o fornecedor', exact: true });
const reabrir = () => page.getByRole('button', { name: 'Reabrir pedido', exact: true });
async function abrir({ atual = 'FECHADO_FORNECEDOR', papel = '', precisaGeo = false } = {}) {
  status = atual; modo = 'ok'; geo = precisaGeo; falhaGet = false;
  await page.goto(base + (papel ? '?papel=' + papel : ''));
  await page.getByText('Resumo do pedido', { exact: true }).waitFor();
}
async function confirmarReabertura() {
  await reabrir().click();
  const dialog = page.getByRole('dialog').last();
  await dialog.getByLabel('Motivo da reabertura').fill('Ajustar negociação com o fornecedor');
  await dialog.getByRole('button', { name: 'Reabrir pedido', exact: true }).click();
}
try {
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await abrir();
    assert.equal(await fechar().count(), 0);
    await reabrir().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
    assert.equal(writes.length, width === 1366 ? 0 : 2);
    await confirmarReabertura();
    await fechar().waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, `Aberto overflow ${width}`);
    await page.screenshot({ path: path.join(output, `aberto-${width}.png`), fullPage: true });
    await page.screenshot({ path: path.join(output, `aberto-${width}-cabecalho.png`) });
    assert.equal(writes.at(-1).body.motivo, 'Ajustar negociação com o fornecedor');
    const qtd = writes.length; modo = 'esperar';
    await fechar().evaluate(btn => { btn.click(); btn.click(); });
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('Fechando...') && b.disabled));
    assert.equal(writes.length, qtd + 1);
    assert.equal(writes.at(-1).body.status, 'FECHADO_FORNECEDOR');
    modo = 'ok'; liberar();
    await reabrir().waitFor(); assert.equal(await fechar().count(), 0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
    assert.equal(overflow, false, `Overflow ${width}`);
    await page.screenshot({ path: path.join(output, `fechado-${width}.png`), fullPage: true });
  }
  // Fechar nao descarta ajustes ainda nao salvos.
  await abrir({ atual: 'ABERTO' });
  await page.getByRole('button', { name: 'Editar', exact: true }).first().click();
  await page.getByRole('dialog').getByLabel('Quantidade do pedido').fill('12');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
  assert(await fechar().isDisabled());
  await page.getByRole('button', { name: 'Editar', exact: true }).first().click();
  assert.equal(await page.getByRole('dialog').getByLabel('Quantidade do pedido').inputValue(), '12');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
  // Falha de validacao nao altera o status e permite corrigir/repetir.
  await abrir({ atual: 'ABERTO' }); modo = 'negativa';
  await fechar().click();
  await page.getByText('Confirme a previsão de entrega antes de fechar.', { exact: true }).waitFor();
  assert.equal(status, 'ABERTO'); assert(await fechar().isEnabled());
  modo = 'ok'; await fechar().click(); await reabrir().waitFor();
  // Gravacao confirmada + erro de leitura: nao substituir DTO completo por recibo.
  await abrir();
  await page.getByLabel('Comentário do pedido').fill('Rascunho preservado após falha na leitura');
  modo = 'confirmado'; await confirmarReabertura();
  await page.getByText(/A reabertura foi registrada, mas/).waitFor();
  assert.equal(await fechar().count(), 0); assert.equal(await reabrir().count(), 0);
  const antes = writes.length;
  falhaGet = true;
  await page.getByRole('button', { name: 'Consultar estado do pedido' }).click();
  await page.getByRole('button', { name: 'Consultar estado do pedido' }).waitFor();
  assert.equal(writes.length, antes);
  falhaGet = false;
  await page.getByRole('button', { name: 'Consultar estado do pedido' }).click();
  await fechar().waitFor(); assert.equal(writes.length, antes);
  assert.equal(await page.getByLabel('Comentário do pedido').inputValue(), 'Rascunho preservado após falha na leitura');
  // Resposta perdida: consultar por GET, nunca repetir PATCH automaticamente.
  await abrir(); modo = 'rede'; await confirmarReabertura();
  await page.getByText(/Não foi possível confirmar o resultado da reabertura/).waitFor();
  const perda = writes.length;
  await page.getByRole('button', { name: 'Consultar estado do pedido' }).click();
  await fechar().waitFor(); assert.equal(writes.length, perda);
  // Uma resposta da aba/rota anterior nao pode substituir outro pedido.
  await abrir(); modo = 'esperar';
  const antesNavegar = writes.length;
  await confirmarReabertura();
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Processando...'));
  assert.equal(writes.length, antesNavegar + 1);
  await page.evaluate(() => { history.pushState({}, '', '/qa-pedido/272'); dispatchEvent(new PopStateEvent('popstate')); });
  await page.getByText(/Fornecedor QA — PC-00272/).waitFor();
  modo = 'ok'; liberar();
  await page.waitForResponse(response => response.url().endsWith('/pedidos/271/reabrir-cotacao'));
  assert.equal(await page.getByText(/Fornecedor QA — PC-00272/).count(), 1);
  // Permissoes/estado/fluxo GEO mantidos.
  await abrir({ atual: 'ABERTO', papel: 'leitura' }); assert.equal(await fechar().count(), 0);
  await abrir({ papel: 'leitura' }); assert.equal(await reabrir().count(), 0);
  await abrir({ atual: 'CANCELADO' }); assert.equal(await reabrir().count(), 0); assert.equal(await fechar().count(), 0);
  await abrir({ precisaGeo: true });
  await page.getByRole('button', { name: 'Solicitar reabertura ao GEO', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Motivo da reabertura').fill('Revisão sujeita à aprovação do GEO');
  await dialog.getByRole('button', { name: 'Enviar ao GEO', exact: true }).click();
  await page.getByText('Pedido de reabertura enviado ao GEO.', { exact: true }).waitFor();
  assert(writes.at(-1).path.endsWith('/reaberturas'));
  assert(await page.getByRole('button', { name: 'Reabertura aguardando GEO' }).isDisabled());
  assert.equal(status, 'FECHADO_FORNECEDOR');
  if (testarPrecisao) {
    await abrir({atual:'ABERTO'});
    await page.getByRole('button',{name:'Editar',exact:true}).first().click();
    const modal=page.getByRole('dialog');
    const price=modal.getByLabel('Preço unitário',{exact:true});
    await price.fill('3,6751234567');
    await price.blur();
    assert.equal(await price.inputValue(),'3,6751234567');
    await modal.getByRole('button',{name:'Salvar ajustes',exact:true}).click();
    await page.getByText('Item atualizado com auditoria registrada.',{exact:true}).waitFor();
    assert.equal(writes.at(-1).body.preco_unitario,'3.6751234567');
    console.log('Precisao UI: blur e PATCH preservam10casas em string; API simulada.');
  }
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log('UI real pedido26 itens: reabrir/fechar, motivo/cancelar, duplo clique, entrega400/retry, recibo202, leitura falha/rede perdida reconciliadas so GET, ACL/GEO/cancelado e1366/390 aprovados. API isolada.');
} finally { await page.close(); await browser.close(); await server.close(); }
