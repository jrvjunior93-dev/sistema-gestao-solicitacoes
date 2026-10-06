import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const detalhe = fs.readFileSync(path.join(root, 'src/pages/SolicitacaoDetalhe/index.jsx'), 'utf8');
assert(!detalhe.includes('aprovarSolicitacaoPorTipo') && !detalhe.includes('aprovandoSolicitacao'));
assert(!detalhe.includes('Aprovar solicitação'));
assert(detalhe.includes('aprovar_diretoria:') && detalhe.includes('<AcoesContrato'));
const catalogoSource = detalhe.match(/const catalogoAcoes = (\{[\s\S]*?\n  \});/)[1];
const catalogo = vm.runInNewContext(`(${catalogoSource})`, {
  podeAlterarStatus: true, podeEnviarSetor: true, podeAprovarDiretoria: true,
  isFinanceiro: true, podeAcessarModuloFinanceiro: true, solicitacaoEhContrato: true,
  aprovarDiretoria() {}, setModalStatus() {}, setModalEnviarSetor() {}, rolarAte() { return () => {}; }
});
assert.equal(catalogo.aprovar_solicitacao, undefined, 'Mapeamento antigo nao pode reintroduzir aprovacao generica');
assert.equal(catalogo.aprovar_diretoria.disponivel, true);
const fixture = `
  import React, { useState } from 'react';
  import { createRoot } from 'react-dom/client';
  import RetornoSolicitacaoBar from '/src/pages/SolicitacaoDetalhe/RetornoSolicitacaoBar.jsx';
  import '/src/index.css';import '/src/styles/design-tokens.css';
  import '/src/components/lista-avancada/lista-avancada.css';import '/src/styles/escala.css';
  import '/src/styles/componentes-padrao.css';import '/src/styles/responsive-system.css';
  const caso=new URLSearchParams(location.search).get('caso')||'aprovado';
  window.caso=caso;window.etapa=caso==='ciclo'?'acompanhamento':'aprovado';
  window.devolucoes=[];
  function Tela() {
    const [etapa, setEtapa] = useState(window.etapa);
    window.mudarEtapa=(value)=>{window.etapa=value;setEtapa(value)};
    const pendentes=caso==='pendente'||etapa==='decisao';
    const aprovado=etapa==='aprovado'&&caso!=='colega';
    const podeDevolver=aprovado&&!['pendente','sem-permissao'].includes(caso);
    const acompanhamento=['acompanhamento','pedido-pendente'].includes(etapa);
    return <div className='layout-shell fluxy-app-shell'><main className='layout-main'><div className='layout-content-shell'><RetornoSolicitacaoBar
      solicitacao={{ id: 42, contexto_interacao: {
        pode_interagir: !acompanhamento,setor_usuario:'OBRA',pode_solicitar_retorno:true,
        setor_atual:acompanhamento||etapa==='decisao'?'FINANCEIRO':'OBRA',
        pedido_retorno_pendente:etapa==='pedido-pendente'?{id:17}:null,
        pedidos_retorno_para_decisao:pendentes?[{id:18,solicitado_por:12,setor_solicitante:'GEO',solicitante:{nome:'Solicitante'},motivo:'Corrigir dados'}]:[],
        retorno_aprovado:aprovado?{pedido_id:17,solicitado_por:11,setor_destino:'FINANCEIRO',pode_devolver:podeDevolver,
          motivo_indisponivel:caso==='pendente'?'Decida os pedidos de retorno pendentes antes de devolver.':caso==='sem-permissao'?'Permissao necessaria para devolver.':null}:null,
        devolucao_retorno: podeDevolver ? { pedido_id: 17, setor_destino: 'FINANCEIRO' } : null
      } }}
      onMudou={() => setEtapa(window.etapa)}
    /></div></main></div>;
  }
  createRoot(document.getElementById('root')).render(<Tela />);
`;
const servicos = `
  export async function devolverSolicitacaoAposRetorno(id,pedidoId) {
    window.devolucoes.push({id,pedidoId});
    await new Promise(r=>setTimeout(r,180));
    if(window.caso==='falha')throw new Error('Falha simulada na devolucao');
    window.etapa='devolvido';
    return { solicitacao: { id, area_responsavel: 'FINANCEIRO' } };
  }
  export async function cancelarRetornoSolicitacao() { throw new Error('Acao inesperada'); }
  export async function decidirRetornoSolicitacao(id,payload) {window.etapa=payload.aprovar?'aprovado':'acompanhamento'}
  export async function solicitarRetornoSolicitacao() {window.etapa='pedido-pendente'}
`;

const server = await createServer({
  root, configFile: false, logLevel: 'error', server: { host: '127.0.0.1', port: 0 },
  css: { postcss: path.join(root, 'postcss.config.js') },
  plugins: [{
    name: 'fixture-devolucao-retorno', enforce: 'pre',
    resolveId(id) { if (id === '/fixture.jsx') return '\0fixture-devolucao-retorno.jsx'; },
    async load(id) {
      if (id === '\0fixture-devolucao-retorno.jsx') {
        return transformWithEsbuild(fixture, 'fixture.jsx', { loader: 'jsx', jsx: 'transform' });
      }
    },
    transform(code, id) { if (id.endsWith('/src/services/solicitacoes.js')) return servicos; },
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (req.url?.split('?')[0] !== '/fixture') return next();
        res.setHeader('Content-Type', 'text/html');
        res.end(await vite.transformIndexHtml('/fixture', '<html lang="pt-BR"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
      });
    }
  }, react()],
  optimizeDeps: { include: ['react', 'react-dom/client'] }
});
await server.listen();
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.setDefaultTimeout(10000);
  const erros = [];
  page.on('pageerror', (error) => { erros.push(error.message); console.error(error.message); });
  const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
  await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await page.goto(`${origin}/fixture`);
  const faixa=page.getByTestId('devolucao-retorno-aprovado');
  await faixa.waitFor();
  await page.reload();await faixa.waitFor();
  const botao = page.getByRole('button', { name: 'Devolver para FINANCEIRO' });
  await botao.evaluate(el=>{el.click();el.click()});
  const confirmacao = page.getByRole('dialog', { name: 'Devolver solicitação ao setor anterior' });
  await confirmacao.getByRole('button', { name: 'Cancelar' }).click();
  assert.equal(await page.evaluate(() => (window.devolucoes || []).length), 0, 'Cancelar nao deve mover a solicitacao');
  await botao.click();
  await confirmacao.getByRole('button', { name: 'Devolver para FINANCEIRO' }).evaluate(el=>{el.click();el.click()});
  await page.getByTestId('devolucao-retorno-aprovado').waitFor({ state: 'hidden' });
  assert.deepEqual(await page.evaluate(() => window.devolucoes), [{id:42,pedidoId:17}]);
  await page.goto(`${origin}/fixture?caso=pendente`);
  await faixa.waitFor();
  assert.equal(await botao.isDisabled(),true);
  await page.getByTestId('pedidos-retorno-decisao').waitFor();
  await page.goto(`${origin}/fixture?caso=sem-permissao`);await faixa.waitFor();
  assert.equal(await botao.isDisabled(),true);
  await page.goto(`${origin}/fixture?caso=colega`);
  await page.waitForFunction(()=>typeof window.mudarEtapa==='function');
  assert.equal(await faixa.count(),0);
  await page.goto(`${origin}/fixture?caso=ciclo`);
  await page.getByRole('button',{name:'Solicitar retorno',exact:true}).click();
  await page.getByLabel('Por que precisa do retorno?').fill('Preciso corrigir os dados');
  await page.getByRole('button',{name:'Enviar pedido',exact:true}).evaluate(el=>{el.click();el.click()});
  await page.getByText('Retorno solicitado',{exact:true}).waitFor();
  await page.evaluate(()=>window.mudarEtapa('decisao'));
  await page.getByRole('button',{name:'Aprovar retorno',exact:true}).click();
  await faixa.waitFor();assert.equal(await botao.isEnabled(),true);
  const evidencias=path.join(root,'../qa/evidencias/retorno-aprovado-2026-10-06');
  fs.mkdirSync(evidencias,{recursive:true});
  await page.screenshot({path:path.join(evidencias,'desktop-claro.png'),fullPage:true});
  await page.evaluate(()=>document.documentElement.classList.add('dark'));
  await page.screenshot({path:path.join(evidencias,'desktop-escuro.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:path.join(evidencias,'mobile-escuro.png'),fullPage:true});
  await page.goto(`${origin}/fixture?caso=falha`);await botao.click();
  await confirmacao.getByRole('button',{name:'Devolver para FINANCEIRO'}).click();
  await page.getByText('Falha simulada na devolucao',{exact:true}).waitFor();
  assert.equal(await botao.isEnabled(),true);
  assert.equal(await faixa.count(),1,'Falha nao deve esconder a faixa');
  assert.deepEqual(erros, []);
  console.log('OK: faixa apos aprovacao/F5, pendencias, permissoes, duplo clique, erro/retry, confirmacao, temas e celular; aprovacao generica removida e fluxos especificos preservados.');
} finally {
  await browser.close();
  await server.close();
}
