import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

// Tela e componentes reais; somente identidade, permissões, preferências e API
// são fixtures. Não usa banco, sessão de produção ou serviços externos.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/pages/FinanceiroCaixas.jsx'), 'utf8');
assert.equal((source.match(/variante="primario"/g) || []).length, 1);
assert(!source.includes('bloqueio_ativo') && !source.includes('usuario_sujeito_bloqueio'));
assert(source.includes('salvandoRef.current = true'));
assert(source.includes('setMovimentoRecolhido(false)'));
assert(source.includes('min={dataMinimaFechamento}'));
assert(source.includes('usuarioSolicitouDivergencia') && source.includes('podeDecidirSessao'));

const fixture = `import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import FinanceiroCaixas from '/src/pages/FinanceiroCaixas.jsx';
import '/src/index.css';
import '/src/styles/design-tokens.css';
import '/src/components/lista-avancada/lista-avancada.css';
import '/src/styles/escala.css';
import '/src/styles/componentes-padrao.css';
import '/src/styles/responsive-system.css';
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,
  React.createElement('div',{className:'layout-shell fluxy-app-shell'},
    React.createElement('main',{className:'layout-main'},
      React.createElement('div',{className:'layout-content-shell'},React.createElement(FinanceiroCaixas))))));`;

const api = `
const query=new URLSearchParams(location.search), caso=query.get('caso')||'fechado';
const hoje=new Date().toISOString().slice(0,10);
window.envios=[];
const pausa=()=>new Promise(r=>setTimeout(r,80));
const conta={id:1,nome:'COFRE CSC',tipo_operacional:caso==='banco'?'CONTA_BANCARIA':'CAIXA_INTERNO',
  banco:'Banco de teste',ativo:true,exige_abertura_fechamento:true,saldo_inicial:500,
  empresa_id:1,empresa:{id:1,nome:'CSC'}};
const anterior={id:9,status:'FECHADO',data_abertura:'2026-10-01',data_fechamento:'2026-10-01',
  saldo_abertura:500,saldo_informado:500,saldo_sistema:500,diferenca:0,
  total_entradas:0,total_saidas:0,fechadoPor:{nome:'Operador anterior'}};
let atual=['aberto','consulta','sem-fechar','pendente','propria','restrito'].includes(caso)?{
  id:10,status:['pendente','propria'].includes(caso)?'AGUARDANDO_APROVACAO':'ABERTO',
  data_abertura:hoje,saldo_abertura:500,saldo_sistema:550,saldo_informado:530,diferenca:-20,
  divergencia_solicitada_por:caso==='propria'?2:3,divergenciaSolicitadaPor:{nome:'Operador'},
  observacoes_fechamento:'Contagem com diferença registrada',abertoPor:{nome:'Operador atual'},
  resumo_atual:{saldo_sistema:550,total_entradas:50,total_saidas:0,quantidade_movimentos:1},
  movimentos_detalhados:[{id:1,origem:'MANUAL',tipo:'CAIXA_ENTRADA_MANUAL',natureza:'ENTRADA',
    data:hoje,descricao:'Recebimento de teste',valor:50,estornavel:true}]
}:null;
const clone=x=>structuredClone(x);
export async function getContasBancarias(){return caso==='vazio'?[]:[clone(conta)]}
export async function getCaixasFinanceiros(){return clone(atual?[atual,anterior]:[anterior])}
export async function getCaixaFinanceiro(){return clone(atual)}
export async function getPainelDiarioCaixas(){return {
  configuracao:{pode_operar:caso!=='restrito',pode_aprovar_divergencia:true,bloqueio_ativo:true,usuario_sujeito_bloqueio:true},
  resumo:{total_contas:1,contas_prontas:atual?1:0,contas_pendentes:atual?0:1,saldo_consolidado:550},
  contas:[{conta:clone(conta),sessao:clone(atual),saldo_abertura_esperado:500,saldo_atual:550,
    situacao:atual?.status==='AGUARDANDO_APROVACAO'?'DIVERGENCIA_PENDENTE':atual?'PRONTO':'PENDENTE_ABERTURA'}]}}
export async function abrirCaixaFinanceiro(payload){window.envios.push({acao:'abrir',payload});await pausa();
  if(caso==='falha')throw new Error('Falha simulada ao abrir');
  atual={id:10,status:'ABERTO',data_abertura:payload.data_abertura,saldo_abertura:payload.saldo_abertura,
    resumo_atual:{saldo_sistema:payload.saldo_abertura,total_entradas:0,total_saidas:0},movimentos_detalhados:[]};return clone(atual)}
export async function fecharCaixaFinanceiro(id,payload){window.envios.push({acao:'fechar',id,payload});await pausa();
  atual={...atual,...payload,status:payload.saldo_informado===atual.resumo_atual.saldo_sistema?'FECHADO':'AGUARDANDO_APROVACAO'};
  return clone(atual)}
export async function confirmarConciliacaoDiaCaixa(payload){window.envios.push({acao:'ofx',payload});await pausa();return {}}
export async function registrarMovimentoCaixaFinanceiro(id,payload){window.envios.push({acao:'movimento',id,payload});await pausa();return clone(atual)}
export async function estornarMovimentoCaixaFinanceiro(id,movimentoId,payload){window.envios.push({acao:'estornar',id,movimentoId,payload});await pausa();return clone(atual)}
export async function decidirDivergenciaCaixaFinanceiro(id,payload){window.envios.push({acao:'decidir',id,payload});await pausa();
  atual={...atual,status:payload.decisao==='APROVAR'?'FECHADO':'ABERTO'};return clone(atual)}
`;

const helpers = {
  canOpenFinanceiroCaixa: 'abrir', canCloseFinanceiroCaixa: 'fechar',
  canConfirmFinanceiroCaixaConciliacao: 'ofx', canMoveFinanceiroCaixa: 'movimentar',
  canReverseFinanceiroCaixaMovement: 'estornar', canDecideFinanceiroCaixaDivergence: 'decidir'
};
const permissions = Object.entries(helpers).map(([fn, action]) =>
  `export function ${fn}(){const c=new URLSearchParams(location.search).get('caso');return c!=='consulta' && !(c==='sem-fechar' && '${action}'==='fechar')}`
).join('\n');
const preferences = `export const TIPO_BLOCOS='blocos',TIPO_COLUNAS='colunas',TIPO_VISUAL='visual',TIPO_LARGURAS='larguras',TIPO_FILTROS='filtros';
const noop=()=>{};export function usePreferenciaDeLista(){return [null,noop,noop]}
export function usePreferencias(){return {pronto:true,erro:null}}`;

const server = await createServer({ root, configFile: false, logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
  css: { postcss: path.join(root, 'postcss.config.js') },
  plugins: [{ name: 'caixas-fixture', enforce: 'pre',
    resolveId(id, importer) {
      if (id === '/fixture.jsx') return '\0caixas-fixture.jsx';
      if (id.endsWith('PreferenciasContext')) return '\0caixas-preferencias';
      if (importer?.endsWith('FinanceiroCaixas.jsx')) {
        if (id.endsWith('services/financeiro')) return '\0caixas-api';
        if (id.endsWith('contexts/AuthContext')) return '\0caixas-auth';
        if (id.endsWith('utils/acessoProduto')) return '\0caixas-permissoes';
      }
    },
    load(id) {
      if (id === '\0caixas-fixture.jsx') return fixture;
      if (id === '\0caixas-api') return api;
      if (id === '\0caixas-auth') return 'export function useAuth(){return {user:{id:2}}}';
      if (id === '\0caixas-permissoes') return permissions;
      if (id === '\0caixas-preferencias') return preferences;
    },
    configureServer(s) { s.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith('/fixture?')) return next();
      res.setHeader('Content-Type', 'text/html');
      res.end(await s.transformIndexHtml('/fixture', '<html lang="pt-BR"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
    }); }
  }, react()]
});

let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 960 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === origin ? route.continue() : route.abort();
  });
  const actionCard = page.getByTestId('caixa-acoes-diarias');
  const abertura = page.getByRole('region', { name: 'Abrir caixa', exact: true });
  const fechamento = page.getByRole('region', { name: 'Conferir e fechar caixa', exact: true });
  async function abrir(caso) {
    await page.goto(`${origin}/fixture?caso=${caso}`);
    await actionCard.waitFor();
    await page.waitForFunction(() => !document.body.textContent.includes('Carregando a conta...'));
    assert.equal(await page.getByText(/Bloqueio (ativo|desativado)/).count(), 0);
    assert.equal(await page.locator('.app-bloco--primario').count(), 1);
  }
  async function recolhidos() {
    const values = await page.locator('.app-bloco-recolher').evaluateAll(items => items.map(item => item.getAttribute('aria-expanded')));
    assert(values.length >= 2 && values.every(value => value === 'false'));
  }
  function quantidadeEnvios(acao) { return page.evaluate(a => window.envios.filter(item => item.acao === a).length, acao); }

  await abrir('fechado');
  assert.equal(await actionCard.evaluate(el => getComputedStyle(el).borderTopStyle), 'solid');
  assert(await page.locator('.app-bloco-recolher svg').first().evaluate(el => el.getBoundingClientRect().width < 32));
  await recolhidos();
  assert.equal(await actionCard.locator('#caixa-abertura-titulo').count(), 1);
  assert.equal(await actionCard.locator('#caixa-fechamento-titulo').count(), 1);
  const a = await abertura.boundingBox(), f = await fechamento.boundingBox();
  assert(Math.abs(a.y - f.y) < 2 && f.x > a.x);
  assert.equal(await fechamento.getByRole('button', { name: 'Fechar caixa', exact: true }).count(), 0);
  await abertura.getByLabel('Saldo contado *', { exact: true }).fill('500,00');
  await abertura.locator('form').evaluate(form => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await page.getByText('Caixa aberto', { exact: true }).waitFor();
  assert.equal(await quantidadeEnvios('abrir'), 1);
  assert.equal(await fechamento.getByLabel('Saldo contado *', { exact: true }).inputValue(), '');
  await fechamento.getByLabel('Saldo contado *', { exact: true }).fill('500,00');
  await fechamento.getByRole('button', { name: 'Fechar caixa', exact: true }).click();
  await page.getByText('Caixa fechado', { exact: true }).waitFor();
  assert.equal(await quantidadeEnvios('fechar'), 1);

  await abrir('aberto');
  await recolhidos();
  await fechamento.getByLabel('Saldo contado *', { exact: true }).fill('530,00');
  await fechamento.getByRole('button', { name: 'Preparar saída de ajuste' }).click();
  const movimento = page.locator('#caixa-movimento-form');
  await movimento.waitFor();
  assert.equal(await movimento.getByRole('combobox').inputValue(), 'SAIDA');
  assert.match(await movimento.getByLabel('Valor *', { exact: true }).inputValue(), /20,00$/);
  assert.equal(await movimento.getByLabel('Comprovante da saída *', { exact: true }).count(), 1);
  assert.equal(await quantidadeEnvios('movimento'), 0);
  await movimento.getByLabel('Comprovante da saída *', { exact: true }).setInputFiles({ name: 'comprovante.pdf', mimeType: 'application/pdf', buffer: Buffer.from('fixture') });
  await movimento.getByRole('button', { name: 'Registrar', exact: true }).click();
  await page.waitForFunction(() => document.body.textContent.includes('Saída registrada com sucesso.'));
  assert.equal(await quantidadeEnvios('movimento'), 1);
  const livro = page.getByRole('button', { name: 'Livro do caixa', exact: true });
  await livro.focus();
  await page.keyboard.press('Enter');
  await page.getByText('Recebimento de teste', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Estornar', exact: true }).click();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  const historico = page.getByRole('button', { name: 'Histórico de aberturas e fechamentos', exact: true });
  await historico.click();
  await page.getByText('Operador atual', { exact: true }).waitFor();
  await page.getByText('Operador anterior', { exact: true }).waitFor();
  await page.reload();
  await page.waitForFunction(() => !document.body.textContent.includes('Carregando a conta...'));
  await recolhidos();

  const evidencias = path.join(root, '../qa/evidencias/caixas-layout-2026-10-06');
  fs.mkdirSync(evidencias, { recursive: true });
  // Fixture isolada não monta a topbar. Elimina somente seu offset de sticky.
  await page.evaluate(() => {
    document.querySelector('.app-pagina').style.setProperty('--pos-cabecalho-fixo', '0px');
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: path.join(evidencias, 'desktop-claro.png'), fullPage: true });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.screenshot({ path: path.join(evidencias, 'desktop-escuro.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileA = await abertura.boundingBox(), mobileF = await fechamento.boundingBox();
  assert(mobileF.y >= mobileA.y + mobileA.height && Math.abs(mobileF.x - mobileA.x) < 2);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: path.join(evidencias, 'mobile-escuro.png'), fullPage: true });
  await page.setViewportSize({ width: 1366, height: 960 });

  await abrir('consulta');
  assert.equal(await actionCard.getByRole('button', { name: 'Fechar caixa', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Registrar entrada ou saída', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Livro do caixa', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Estornar', exact: true }).count(), 0);
  await abrir('restrito');
  assert.equal(await actionCard.getByRole('button', { name: 'Fechar caixa', exact: true }).count(), 0);
  await abrir('sem-fechar');
  assert.equal(await actionCard.getByRole('button', { name: 'Fechar caixa', exact: true }).count(), 0);
  await abrir('pendente');
  await actionCard.getByRole('button', { name: 'Decidir divergencia', exact: true }).click();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await abrir('propria');
  assert.equal(await actionCard.getByRole('button', { name: 'Decidir divergencia', exact: true }).count(), 0);
  await abrir('banco');
  await abertura.getByRole('button', { name: 'Confirmar OFX', exact: true }).click();
  await page.waitForFunction(() => window.envios.some(item => item.acao === 'ofx'));
  assert.equal(await quantidadeEnvios('ofx'), 1);
  await abrir('falha');
  await abertura.getByLabel('Saldo contado *', { exact: true }).fill('500,00');
  await abertura.getByRole('button', { name: 'Abrir caixa', exact: true }).click();
  await page.getByText('Falha simulada ao abrir', { exact: true }).waitFor();
  assert.equal(await abertura.getByRole('button', { name: 'Abrir caixa', exact: true }).isEnabled(), true);
  await abrir('vazio');
  assert.equal(await actionCard.getByRole('button', { name: 'Abrir caixa', exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  console.log('Caixas: layout real, recolhimento, permissões, abertura/fechamento, duplo envio, ajuste, OFX e divergência validados no Edge.');
  console.log(`Capturas: ${evidencias}`);
} finally {
  await browser?.close();
  await server.close();
}
