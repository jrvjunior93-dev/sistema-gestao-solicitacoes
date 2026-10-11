// Paginas, payloads, validators e controller reais; transporte/modelos isolados.
// Nao carrega .env, nao conecta banco e nao realiza uploads ou criacoes reais.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { parse } from '@babel/parser';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
import { prepararPayloadSolicitacaoCompra } from '../src/modules/solicitacao-compra/utils/payloadSolicitacaoCompra.js';
import { buildComprasDraftKey } from '../src/modules/solicitacao-compra/utils/comprasDraftStorage.js';

const require = createRequire(import.meta.url);
const { validateCompraCreateBody, validateCompraDiretaCreateBody } = require('../../backend/src/validators/operationalValidators.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(path.resolve(root, '..', p), 'utf8');
const item = { manual: true, nome_manual: 'Material de cobertura', unidade_sigla_manual: 'un', quantidade: 1,
  valor_unitario: 10, valor_total: 10, necessario_para: '2099-12-01',
  apropriacao_id: 9, apropriacoes: [{ apropriacao_id: 9, quantidade_apropriada: 1 }] };
const boleto = { id: 4, nome: 'Boleto', codigo: 'BOLETO', ativo: true, gera_boleto: true };
const base = { obra_id: 42, necessario_para: '2099-12-01', itens: [item] };
const direta = { ...base, origem: 'COMPRA_DIRETA', forma_pagamento_ids: [4], formas_pagamento: [{ id: 4, valor: 10 }],
  anexos_cabecalho: [{ tipo_documento: 'BOLETO', arquivo_url: '/uploads/boleto.pdf', arquivo_nome_original: 'boleto.pdf' }] };
for (const [validar, body] of [[validateCompraCreateBody, prepararPayloadSolicitacaoCompra(base)], [validateCompraDiretaCreateBody, direta]]) {
  assert.equal(validar({ ...body, titulo: '  Cobertura & materiais  ' }).titulo, 'Cobertura & materiais');
  for (const titulo of [undefined, null, '', '  ']) assert.equal(validar({ ...body, titulo }).titulo, undefined);
  assert.equal(validar({ ...body, titulo: 'x'.repeat(255) }).titulo.length, 255);
  for (const titulo of ['x'.repeat(256), {}, []]) assert.throws(() => validar({ ...body, titulo }));
  assert.throws(() => validar({ ...body, status: 'APROVADA' }), /campos nao permitidos/);
  for (const necessario_para of [undefined, null, '', '31/12/2099', '2099-13-01']) {
    assert.throws(() => validar({ ...body, necessario_para }), /obrigatori|valid|formato/i,
      'Data do cabecalho obrigatoria mesmo com data preenchida nos itens');
  }
  assert.equal(validar({ ...body, necessario_para: '2096-02-29' }).necessario_para, '2096-02-29');
}

const controllerSource = read('backend/src/controllers/SolicitacaoCompraController.js');
const ast = parse(controllerSource, { sourceType: 'script' });
const exported = ast.program.body.find(n => n.type === 'ExpressionStatement' && n.expression.type === 'AssignmentExpression'
  && n.expression.left.object?.name === 'module');
const node = exported.expression.right.properties.find(n => n.type === 'ObjectMethod' && n.key.name === 'create');
assert(node);
const method = controllerSource.slice(node.start, node.end);
async function persistir(body, permitido = true) {
  const gravados = { compra: [], principal: [], commits: 0, rollbacks: 0 };
  const transaction = { commit: async () => gravados.commits++, rollback: async () => gravados.rollbacks++ };
  const noop = async () => {};
  const make = name => ({ create: async data => {
    if (gravados[name]) gravados[name].push(data);
    return { id: name === 'principal' ? 200 : 100, ...data, update: noop };
  }, bulkCreate: noop });
  const fluxo = async () => ({ areaResponsavel: 'GEO', usaFluxoDiretoria: false });
  const sandbox = {
    Op: { in: Symbol('in') },
    SolicitacaoCompra: { ...make('compra'), sequelize: { transaction: async () => transaction } },
    Solicitacao: make('principal'), SolicitacaoCompraItem: make('item'), SolicitacaoCompraItemManual: make('manual'),
    SolicitacaoCompraItemApropriacao: make('rateio'), SolicitacaoCompraItemManualApropriacao: make('rateio'),
    Historico: make('historico'), StatusArea: make('status'),
    Obra: { findByPk: async () => ({ id: 42 }) }, Insumo: { findAll: async () => [] },
    FormaPagamentoFinanceira: { findAll: async () => [boleto] },
    validarAcesso: async (_req, res) => permitido ? { id: 991 } : (res.status(403).json({ error: 'Acesso negado' }), null),
    normalizeTextCompra: v => String(v || '').trim().toUpperCase(), carregarMapaApropriacoes: async () => new Map(),
    prepararItemCompraPayload: ({ item }) => ({ manual: true, item: { ...item }, rateios: item.apropriacoes }),
    arredondarMoeda: v => Math.round(Number(v) * 100) / 100, parseValorMonetario: v => Number(v || 0),
    ratearValorMonetario: (_valor, itens) => itens.map(() => 0),
    isFormaPagamentoFopag: () => false, isFormaPagamentoBoleto: () => true,
    isAnexoBoletoCompraDireta: a => a.tipo_documento === 'BOLETO', formatarFormaPagamentoResumo: f => f.nome,
    buscarTipoSolicitacaoCompraDireta: async () => ({ id: 2 }), buscarTipoSolicitacaoCompra: async () => ({ id: 1 }),
    assertTipoDisponivelNoDestino: noop, montarFluxoAprovacaoCompraDireta: fluxo, montarFluxoAprovacaoCompra: fluxo,
    gerarCodigoSolicitacao: async () => 'SOL-TESTE', formatCurrencyPdf: v => Number(v).toFixed(2),
    registrarLogSolicitacaoCompra: noop, publishComprasRealtimeEventSafe: noop,
    anexarPdfNaSolicitacaoPrincipal: async () => false, anexarArquivosCabecalhoSolicitacao: async () => 1,
    require: name => { assert.equal(name, '../services/pedidoEntregaService'); return { assertObraPodeCriarCompra: noop }; },
    console: { error: error => { throw error; } }
  };
  const controller = vm.runInNewContext(`({${method}})`, sandbox);
  const res = { status(code) { this.code = code; return this; }, json(data) { this.body = data; return this; } };
  await controller.create({ body }, res);
  return { ...gravados, res };
}
for (const [validar, body, tipo] of [[validateCompraCreateBody, prepararPayloadSolicitacaoCompra(base), 'Solicitação de Compra'],
  [validateCompraDiretaCreateBody, direta, 'Compra Direta']]) {
  for (const titulo of ['  Cobertura & materiais  ', undefined]) {
    const result = await persistir(validar({ ...body, titulo }));
    assert.equal(result.res.code, 201); assert.equal(result.commits, 1); assert.equal(result.rollbacks, 0);
    assert.equal(result.compra[0].titulo, titulo ? titulo.trim() : tipo === 'Compra Direta' ? tipo : null);
    assert.equal(result.principal[0].descricao.split('\n')[0], titulo ? titulo.trim() : tipo);
    assert.equal(result.principal[0].status_global, 'PENDENTE'); assert.equal(result.principal[0].area_responsavel, 'GEO');
    assert.equal(result.principal[0].valor, tipo === 'Compra Direta' ? 10 : null);
  }
  const negado = await persistir(validar(body), false);
  assert.equal(negado.res.code, 403); assert.equal(negado.compra.length, 0); assert.equal(negado.rollbacks, 1);
}
const lista = read('backend/src/controllers/SolicitacaoController.js');
assert.match(lista, /const buscaUnica = String\(q \|\| ''\)\.trim\(\)/);
assert.match(lista, /\{ descricao: \{ \[Op.like\]: like \} \}/, 'Pesquisa geral inclui a descricao persistida');
const routes = read('backend/src/routes.js');
for (const suffix of ['', '-diretas']) assert.match(routes, new RegExp(`router.post\\('/compras/solicitacoes${suffix}'[^\\n]+allowCompraSolicitacoesCreate[^\\n]+requireCompraBodyObraAccess`));
console.log('OK backend isolado: titulo, limites, legado, controller create, descricao pesquisavel, transacao e negativas.');

const fixture = `import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {ThemeContext,TEMA_PADRAO} from '/src/contexts/ThemeContext.jsx';
import Nova from '/src/modules/solicitacao-compra/pages/NovaSolicitacaoCompra.jsx';
import Revisar from '/src/modules/solicitacao-compra/pages/RevisarSolicitacaoCompra.jsx';
import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/componentes-padrao.css';
const direta=location.search.includes('direta');const prefix=direta?'/solicitacoes-compra-direta':'/solicitacoes-compra';
createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={[prefix+(location.search.includes('revisar')?'/revisar':'/nova')]}><ThemeContext.Provider value={{tema:TEMA_PADRAO}}>
<div className="layout-shell"><main className="layout-main"><Routes><Route path={prefix+'/nova'} element={<Nova modoCompraDireta={direta}/>}/>
<Route path={prefix+'/revisar'} element={<Revisar modoCompraDireta={direta}/>}/><Route path="*" element={<p>Concluído</p>}/></Routes></main></div></ThemeContext.Provider></MemoryRouter>);`;
const server = await createServer({ root, configFile: false, logLevel: 'error', server: { host: '127.0.0.1', port: 0 },
  plugins: [{ name: 'titulo-compras-qa', enforce: 'pre',
    resolveId(id) { if (id === '/fixture.jsx') return '\0titulo-compras-qa.jsx'; },
    async load(id) { if (id === '\0titulo-compras-qa.jsx') return transformWithEsbuild(fixture, 'fixture.jsx', { loader: 'jsx', jsx: 'transform' }); },
    transform(_code, id) {
      if (id.endsWith('/src/contexts/AuthContext.jsx')) return `export const useAuth=()=>({user:{id:991,nome:'Teste',perfil:'SUPERADMIN',area:'GEO'}});`;
      if (id.endsWith('/src/services/api.js')) return `export const API_URL='https://fixture.invalid/api';export const API_ORIGIN='https://fixture.invalid';
        export const authHeaders=(h={})=>h;export const fileUrl=p=>p;export const getAuthToken=()=>null;export const getAuditSessionId=()=>null;
        export const installFetchSecurityDefaults=()=>{};export const setAuthToken=()=>{};export const clearAuthToken=()=>{};`;
    }, configureServer(vite) { vite.middlewares.use(async (req,res,next) => {
      if (new URL(req.url,'http://localhost').pathname !== '/fixture') return next();
      res.setHeader('Content-Type','text/html'); res.end(await vite.transformIndexHtml('/fixture',
        '<html lang="pt-BR"><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
    }); }
  }, react()], optimizeDeps: { include: ['react','react-dom/client','react-router-dom'] } });
let browser;
try {
  await server.listen(); browser = await chromium.launch({ channel: 'chrome', headless: true });
  const url = `http://127.0.0.1:${server.httpServer.address().port}/fixture`;
  for (const modo of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    page.setDefaultTimeout(10000);
    const errors = [], enviados = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', async route => {
      const u = new URL(route.request().url()); if (u.origin === new URL(url).origin) return route.continue();
      assert.equal(u.hostname, 'fixture.invalid', `Rede externa inesperada: ${u}`);
      let data = [];
      if (u.pathname.includes('/obras/minhas')) data = [{ id: 42, nome: 'Obra teste', codigo: '42' }];
      else if (u.pathname.includes('/apropriacoes')) data = [{ id: 9, codigo: '1.1', descricao: 'Cobertura', obra_id: 42, ativo: true }];
      else if (u.pathname.includes('formas-pagamento')) data = [boleto];
      else if (route.request().method() === 'POST') {
        assert.equal(u.pathname, modo ? '/api/compras/solicitacoes-diretas' : '/api/compras/solicitacoes');
        enviados.push(route.request().postDataJSON()); await new Promise(r => setTimeout(r,200)); data = { id: 100, codigo: 'SOL-TESTE' };
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    const key = buildComprasDraftKey(991, modo ? 'compra-direta' : 'solicitacao');
    async function conferirRateio() {
      // O efeito de troca de obra preexistente pode limpar o rateio ao hidratar
      // um rascunho. Reconfere pelo controle real; nao mascara isso em producao.
      await page.getByRole('button',{name:/^Apropriar/}).first().click();
      const modal = page.getByRole('dialog',{name:'Apropriar item'}); await modal.waitFor();
      await modal.getByRole('combobox').fill('1.1');
      await page.getByRole('button',{name:/1\.1.*Cobertura/}).click();
      await modal.getByRole('textbox',{name:'Quantidade apropriada do rateio 1'}).fill('1');
      await modal.getByRole('button',{name:'Salvar distribuição',exact:true}).click();
      await modal.waitFor({state:'hidden'});
    }
    const draft = { payload: modo ? direta : base, resumo: { obra_nome: 'Obra teste', solicitante_nome: 'Teste', itens: [{ ...item, insumo_nome: item.nome_manual }] } };
    await page.addInitScript(({key,draft}) => { if (!localStorage.getItem(key)) localStorage.setItem(key,JSON.stringify(draft)); }, {key,draft});
    await page.goto(url + (modo ? '?direta' : ''));
    const campo = page.getByLabel('Título da solicitação', {exact:true}); await campo.waitFor();
    assert.equal(await campo.getAttribute('maxlength'), '255'); assert.equal(await campo.getAttribute('required'), null);
    const titulo = modo ? 'Compra direta <Cobertura> & materiais' : 'Materiais <Cobertura> & revisão';
    await campo.fill(titulo);
    await page.waitForFunction(({key,titulo}) => JSON.parse(localStorage.getItem(key)).payload.titulo === titulo, {key,titulo});
    await page.reload(); assert.equal(await campo.inputValue(), titulo);
    const output = path.resolve(root,'../outputs/titulo-compras'); mkdirSync(output,{recursive:true});
    await page.screenshot({path:path.join(output,modo?'direta-desktop.png':'compra-desktop.png')});
    await page.setViewportSize({width:390,height:844});
    assert.equal(await campo.isVisible(),true); const box = await campo.boundingBox(); assert.ok(box.x>=0 && box.x+box.width<=391);
    await page.screenshot({path:path.join(output,modo?'direta-mobile.png':'compra-mobile.png')});
    await page.setViewportSize({width:1366,height:900});
    await conferirRateio();
    const data = page.getByLabel(modo ? 'Data de vencimento' : 'Necessário para', {exact:true});
    assert.notEqual(await data.getAttribute('required'), null);
    await data.fill(''); await page.getByRole('button',{name:'Revisar solicitação',exact:true}).click();
    await page.getByText(modo ? 'Informe a data de vencimento.' : 'Informe a data da necessidade.',{exact:true}).first().waitFor();
    assert.equal(enviados.length,0); assert(await campo.isVisible(), 'Sem data permanece na edicao');
    // Salvar rascunho incompleto continua permitido, mas criar/revisar nao.
    await page.waitForFunction(key=>!JSON.parse(localStorage.getItem(key)).payload.necessario_para,key);
    const incompleto = await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
    await page.goto(url + (modo ? '?direta&revisar' : '?revisar'));
    await page.getByRole('button',{name:'Visualizar PDF antes de criar',exact:true}).click();
    await page.locator('iframe').waitFor(); await page.keyboard.press('Escape');
    await page.getByRole('checkbox',{name:/Confirmo que revisei/}).check();
    await page.getByRole('button',{name:'Criar solicitacao',exact:true}).click();
    await page.getByText(modo
      ? 'Informe a data de vencimento. Volte e edite a solicitação.'
      : 'Informe a data da necessidade. Volte e edite a solicitação.',{exact:true}).waitFor();
    assert.equal(enviados.length,0);
    assert.deepEqual(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key),incompleto,'Revisao antiga nao perde rascunho');
    await page.getByRole('button',{name:'Voltar e editar',exact:true}).click();
    await data.fill('01/12/2099'); await data.blur(); await conferirRateio();
    await page.getByRole('button',{name:'Revisar solicitação',exact:true}).click();
    try { await page.getByRole('button',{name:'Visualizar PDF antes de criar',exact:true}).waitFor(); }
    catch (error) { console.error('Modo:',modo,'Erros:',errors,'Tela:',await page.locator('body').innerText()); throw error; }
    assert.equal(await page.getByText(titulo,{exact:true}).count(),1);
    await page.getByRole('button',{name:'Voltar e editar',exact:true}).click();
    await page.waitForFunction(titulo => document.querySelector('input[maxlength="255"]')?.value === titulo, titulo);
    assert.equal(await campo.inputValue(),titulo);
    await conferirRateio();
    await page.getByRole('button',{name:'Revisar solicitação',exact:true}).click();
    await page.getByRole('button',{name:'Visualizar PDF antes de criar',exact:true}).click();
    const iframe = page.locator('iframe'); await iframe.waitFor(); assert.ok((await iframe.getAttribute('srcdoc')).includes('&lt;Cobertura&gt; &amp;'));
    await page.keyboard.press('Escape'); await page.getByRole('checkbox',{name:/Confirmo que revisei/}).check();
    await page.getByRole('button',{name:'Criar solicitacao',exact:true}).evaluate(el=>{el.click();el.click();});
    await page.getByText('Concluído',{exact:true}).waitFor(); assert.equal(enviados.length,1); assert.equal(enviados[0].titulo,titulo);
    assert.equal((modo?validateCompraDiretaCreateBody:validateCompraCreateBody)(enviados[0]).titulo,titulo);
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),null); assert.deepEqual(errors,[]);
    await page.evaluate(key=>localStorage.setItem(key,JSON.stringify({payload:{titulo:'Rascunho somente com título'}})),key);
    await page.goto(url + (modo ? '?direta' : ''));
    await campo.waitFor(); await page.waitForFunction(() => document.querySelector('input[maxlength="255"]')?.value === 'Rascunho somente com título');
    assert.equal(await campo.inputValue(),'Rascunho somente com título');
    await page.reload();
    await page.waitForFunction(() => document.querySelector('input[maxlength="255"]')?.value === 'Rascunho somente com título');
    assert.equal(await campo.inputValue(),'Rascunho somente com título');
    await page.close();
  }
  console.log('OK UI real: dois modos, titulo opcional, data do cabecalho obrigatoria, rascunho incompleto preservado e bloqueado na revisao, autosave/recarga, revisao/voltar, HTML escapado, desktop/mobile e envio unico com servicos reais/transporte isolado.');
} finally { await browser?.close(); await server.close(); }
