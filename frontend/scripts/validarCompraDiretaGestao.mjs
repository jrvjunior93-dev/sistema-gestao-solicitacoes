// Tela real e API em memoria; nenhuma chamada externa ou banco.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '../outputs/compra-direta-gestao');
mkdirSync(output, { recursive: true });
const nomes = file => [...readFileSync(path.join(root, file), 'utf8').matchAll(/export (?:async )?function (\w+)/g)].map(m => m[1]);
const detalhe = { id: 4, origem: 'COMPRA_DIRETA', status: 'ENVIADO', desconto_total: 0,
  frete_tipo: 'SEM_FRETE', frete_modo: 'GLOBAL', frete_valor: 0, valor_fechado: 100, revisao_gestao: 'base-1',
  itens: [{ id: 1, quantidade: 2, valor_unitario: 50, valor_total: 100, insumo: { nome: 'Arame QA' }, unidade: { sigla: 'KG' }, apropriacao_id: 1 }],
  itensManuais: [{ id: 1, quantidade: 1, valor_unitario: 0, valor_total: 0, nome_manual: 'Areia QA', unidade_sigla_manual: 'M3', apropriacao_id: 1 }] };
const solicitacao = { id: 9, codigo: 'SOL-QA-9', area_responsavel: 'GEO', status_global: 'PENDENTE',
  tipo: { nome: 'COMPRA DIRETA', codigo: 'COMPRA_DIRETA' }, obra_id: 7, obra: { id: 7, nome: 'Obra QA' },
  descricao: 'Compra Direta QA', valor: 100, valor_total: 100, context_interacao: { pode_interagir: true },
  compra_direta: detalhe, anexos: [], historicos: [], apropriacoes: [], pagamentos: [], interacoes_pendentes: [] };
const apiCompras = nomes('src/services/compras.js').map(name => `export const ${name}=${({
  obterSolicitacaoCompraPorSolicitacao: 'async()=>structuredClone(window.compra)',
  editarGestaoCompraDireta: `async(id,p)=>{window.envios.push(p);await new Promise(r=>setTimeout(r,200));if(window.falhar)throw new Error('Compra mudou: feche e reabra o modal');
    if(p.acao==='QUANTIDADE'){const i=(p.item_tipo==='MANUAL'?window.compra.itensManuais:window.compra.itens).find(i=>i.id===p.item_id);i.quantidade=p.quantidade;i.valor_total=p.quantidade*i.valor_unitario;}
    else {for(const [k,v]of Object.entries(p))if(k.startsWith('frete_'))window.compra[k]=v;
      window.compra.freteCredor=p.frete_parceiro_id?{id:2,nome:'Transportadora QA',cpf_cnpj:'123'}:null;
      window.compra.freteFavorecido=p.frete_favorecido_id?{id:2,nome:'Transportadora QA',cpf_cnpj:'123'}:null;
      window.compra.freteFormaPagamento=p.frete_forma_pagamento_id?{id:1,nome:'PIX',codigo:'PIX'}:null;}
    window.compra.revisao_gestao='revisao-'+window.envios.length;window.sol.valor=window.compra.itens.reduce((s,i)=>s+i.valor_total,0)+(window.compra.frete_tipo==='SEM_FRETE'?0:Number(window.compra.frete_valor));window.sol.valor_total=window.sol.valor;
    return structuredClone(window.compra);}`,
  listarFormasPagamentoCompraDireta: 'async()=>[{id:1,nome:"PIX",codigo:"PIX",ativo:true},{id:2,nome:"Boleto",gera_boleto:true,ativo:true}]',
  uploadAnexoTemporarioCompra: 'async()=>({arquivo_url:"/uploads/compras/itens-temporarios/usuario-2/boleto.pdf",arquivo_nome_original:"Boleto QA.pdf"})'
})[name] || 'async()=>[]'};`).join('\n');
const apiSolicitacoes = nomes('src/services/solicitacoes.js').map(name => `export const ${name}=${name === 'getSolicitacaoById' ? 'async()=>structuredClone(window.sol)' : 'async()=>[]'};`).join('\n');
const fixture = `import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route}from'react-router-dom';
  import Detalhe from '/src/pages/SolicitacaoDetalhe/index.jsx';
  import{ThemeContext,TEMA_PADRAO}from'/src/contexts/ThemeContext.jsx';
  import '/src/index.css';import '/src/styles/design-tokens.css';import '/src/styles/componentes-padrao.css';import '/src/styles/escala.css';
  window.compra=${JSON.stringify(detalhe)};window.sol=${JSON.stringify(solicitacao)};window.envios=[];
  createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/solicitacoes/9']}><ThemeContext.Provider value={{tema:TEMA_PADRAO}}><Routes><Route path="/solicitacoes/:id" element={<Detalhe/>}/></Routes></ThemeContext.Provider></MemoryRouter>);`;
const server = await createServer({ root, configFile: false, logLevel: 'error', server: { host: '127.0.0.1', port: 0 },
  plugins: [{ name: 'compra-direta-gestao-qa', enforce: 'pre',
    resolveId(id, importer) {
      if (id === '/fixture.jsx') return '\0gestao-fixture.jsx';
      if (importer?.endsWith('/SolicitacaoDetalhe/index.jsx') && /^\.\/(Header|ApropriacoesDoContrato|AditivosDoContrato|Timeline|Conversa|FinanceiroCard|AcoesContrato|RetornoSolicitacaoBar|RecargaCartaoDetalhe|AdiantamentoDetalhe|CompraEtapas|ModalAlterarStatus)$/.test(id)) return '\0gestao-child-'+id.slice(2);
    },
    async load(id) {
      if (id === '\0gestao-fixture.jsx') return transformWithEsbuild(fixture, 'fixture.jsx', { loader: 'jsx', jsx: 'transform' });
      if (id.startsWith('\0gestao-child-')) return `import React from 'react';export default function Child(){return null};export const apoioDoRegistro=()=>'';export const formatarValorSolicitacao=s=>String(s?.valor||0);`;
    },
    transform(code, id) {
      if (id.endsWith('/src/contexts/AuthContext.jsx')) return `import{createContext}from'react';const sem=new URLSearchParams(location.search).get('sem');const permissoes=['compras.solicitacoes.visualizar','solicitacoes.lista.visualizar',...(sem==='acoes'?[]:['compras.compra_direta.editar_quantidade','compras.compra_direta.gerenciar_frete'])];
        export const AuthContext=createContext({});export const useAuth=()=>({user:{id:2,perfil:'USUARIO',area:'GEO',setor:{codigo:'GEO'},areas_permissoes_configuradas:true,areas_permissoes:permissoes,modulos_habilitados:['COMPRAS','SOLICITACOES']}});`;
      if (id.endsWith('/src/contexts/LiveUpdatesContext.jsx')) return 'export const useLiveUpdateSubscription=()=>{};export const useLiveUpdates=()=>({});';
      if (id.endsWith('/src/services/compras.js')) return apiCompras;
      if (id.endsWith('/src/services/solicitacoes.js')) return apiSolicitacoes;
      if (id.endsWith('/src/services/apropriacoes.js')) return 'export const listarApropriacoes=async()=>[{id:1,codigo:"01",descricao:"Material",obra_id:7}];';
      if (id.endsWith('/src/services/acoesPrincipais.js')) return 'export const getAcoesPrincipais=async()=>[];export const resolverAcaoPrincipal=()=>null;';
      if (id.endsWith('/src/services/listasPreferencias.js')) return nomes('src/services/listasPreferencias.js').map(n => `export const ${n}=async()=>({});`).join('\n');
      if (id.endsWith('/src/services/parceiros.js')) return `export const buscarParceiros=async()=>[{id:2,nome:'Transportadora QA',ativo:true,fornecedor:true,cpf_cnpj:'123'}];export const getParceiro=async()=>null;export const criarParceiro=async()=>null;`;
    },
    configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
      if (new URL(req.url, 'http://localhost').pathname !== '/fixture') return next();
      res.setHeader('Content-Type', 'text/html'); res.end(await vite.transformIndexHtml('/fixture', '<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
    }); }
  }, react()], optimizeDeps: { include: ['react', 'react-dom/client', 'react-router-dom'] } });
let browser;
const errors = [];
try {
  await server.listen(); browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
  const base = `http://127.0.0.1:${server.httpServer.address().port}/fixture`;
  await page.goto(base); await page.getByRole('button', { name: 'Gerenciar todos os itens', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Itens da compra direta', exact: true });
  await modal.getByRole('button', { name: /Arame QA/ }).click();
  await modal.getByLabel('Nova quantidade', { exact: true }).fill('2,5');
  await modal.getByLabel('Motivo da alteração', { exact: true }).fill('Ajuste de quantidade QA');
  await modal.getByRole('button', { name: 'Salvar quantidade', exact: true }).dblclick();
  await page.waitForFunction(() => window.compra.itens[0].quantidade === 2.5);
  assert.equal(await page.evaluate(() => window.envios.length), 1);
  assert.equal(await page.evaluate(() => window.sol.valor), 125);
  await modal.getByRole('button', { name: 'Frete da compra', exact: true }).click();
  await modal.getByLabel('Tratamento do frete', { exact: true }).selectOption('EMBUTIDO');
  await modal.getByLabel('Valor do frete', { exact: true }).fill('30,50');
  await modal.getByLabel('Motivo da alteração do frete', { exact: true }).fill('Inclusao de transporte');
  await modal.getByRole('button', { name: 'Salvar frete', exact: true }).dblclick();
  await page.waitForFunction(() => window.compra.frete_tipo === 'EMBUTIDO');
  assert.equal(await page.evaluate(() => window.envios.length), 2);
  await modal.getByRole('button', { name: 'Salvar frete', exact: true }).waitFor({ state: 'visible' });
  await modal.getByLabel('Tratamento do frete', { exact: true }).selectOption('TERCEIRO');
  await modal.getByLabel(/^Credor do frete/).fill('Transportadora');
  await modal.getByRole('button', { name: /Transportadora QA/ }).click();
  await modal.getByLabel('Forma de pagamento do frete', { exact: true }).selectOption('1');
  await modal.getByLabel('Usar o credor do frete como favorecido', { exact: true }).check();
  await modal.getByLabel('Chave PIX do frete', { exact: true }).fill('pix-qa');
  await modal.getByLabel('Data para pagamento', { exact: true }).fill('20/10/2026');
  await modal.getByLabel('Motivo da alteração do frete', { exact: true }).fill('Pagamento a transportadora');
  await modal.getByLabel('Dados para pagamento do frete', { exact: true }).fill('Conferir favorecido');
  await page.getByRole('button', { name: /Fechar aviso/ }).first().click().catch(() => {});
  await modal.screenshot({ path: path.join(output, 'frete-terceiro-desktop.png') });
  await modal.getByRole('button', { name: 'Salvar frete', exact: true }).click();
  await page.waitForFunction(() => window.envios.length === 3 && window.compra.frete_tipo === 'TERCEIRO');
  assert.equal(await page.evaluate(() => window.envios[2].frete_favorecido_id), 2);
  await modal.getByRole('button', { name: 'Salvar frete', exact: true }).waitFor({ state: 'visible' });
  await page.setViewportSize({ width: 700, height: 900 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await modal.getByLabel('Tratamento do frete', { exact: true }).scrollIntoViewIfNeeded();
  await modal.screenshot({ path: path.join(output, 'frete-tablet.png') });
  await modal.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.getByRole('button', { name: /^Itens da compra direta/ }).first().click();
  await page.getByRole('button', { name: 'Editar', exact: true }).first().click();
  await modal.getByLabel('Nova quantidade', { exact: true }).waitFor();
  await page.evaluate(() => { window.falhar = true; });
  await modal.getByLabel('Nova quantidade', { exact: true }).fill('3');
  await modal.getByLabel('Motivo da alteração', { exact: true }).fill('Nao perder ao falhar');
  await modal.getByRole('button', { name: 'Salvar quantidade', exact: true }).click();
  await page.getByText('Compra mudou: feche e reabra o modal', { exact: true }).first().waitFor();
  assert.equal(await modal.getByLabel('Nova quantidade', { exact: true }).inputValue(), '3');
  await page.goto(base + '?sem=acoes');
  assert.equal(await page.getByRole('button', { name: 'Gerenciar todos os itens', exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  console.log('Compra Direta UI: gerenciamento/edicao individual, quantidade fracionada, frete/PIX, duplo envio, erro sem perder formulario, ACL e layout aprovados. API em memoria.');
} catch (error) { console.error('Erros JS:', errors); throw error; }
finally { await browser?.close(); await server.close(); }
