import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Executa a regra real do controller sem carregar modelos ou conectar ao banco.
const controller = fs.readFileSync(path.join(root, '../backend/src/controllers/SolicitacaoController.js'), 'utf8');
const regra = controller.match(/const campoObrigatorio = \(campo\) => \{[\s\S]*?\n      \};/g)
  .find(trecho => trecho.includes('ehMedicaoFluxoNovo'));
assert.ok(regra, 'Regra de obrigatoriedade do controller encontrada');
for (const novo of [false, true]) {
  const obrigatorio = vm.runInNewContext(`${regra}; campoObrigatorio`, {
    ehMedicaoFluxoNovo: novo, usaFluxoRecargaCartao: false,
    camposNovaSolicitacao: { forma_pagamento: { obrigatorio: true }, favorecido: { obrigatorio: true }, credor: { obrigatorio: true } }
  });
  assert.equal(obrigatorio('forma_pagamento'), !novo);
  assert.equal(obrigatorio('favorecido'), !novo);
  assert.equal(obrigatorio('credor'), true, 'Demais regras nao sao relaxadas');
}

const tipo = { id: 7, nome: 'MEDICAO', codigo_interno: 'MEDICAO' };
const contratos = [
  { id: 10, codigo: 'CT-LEG', ref_contrato: 'Contrato legado', fluxo_novo: false, status: 'ATIVO' },
  { id: 11, codigo: 'CT-NOV', ref_contrato: 'Contrato novo', fluxo_novo: true, solicitacao_id: 100, disponivel_medicao: true, status: 'ATIVO' }
];
const modules = {
  auth: 'export const useAuth = () => ({ user: { id: 1, perfil: "SUPERADMIN", setor: "GEO" } });',
  fechar: 'export const useFecharAoSair = () => {};',
  acesso: 'export const hasEnabledModule = () => true;',
  obras: 'export const getMinhasObras = async () => [{ id: 20, codigo: "20", nome: "Obra teste", tipo_centro_custo: "OBRA" }];',
  tiposSolicitacao: `export const getTiposSolicitacao = async () => ${JSON.stringify([tipo])};
    export const getTiposSolicitacaoDisponiveis = async () => ({ tipos: ${JSON.stringify([tipo])}, contexto: 'OBRA', destino_inicial: { codigo: 'GEO' }, areas_configuracao_campos: ['GEO'] });`,
  solicitacoes: `export const createSolicitacao = async payload => { window.payloadEnviado = payload; return { id: 900, codigo: 'TESTE' }; };
    export const getApropriacaoPadraoSolicitacao = async () => null;
    export const getObrasDistribuicaoCentroCusto = async () => [];
    export const getSaldoDespesaEventual = async () => null;
    export const getUsuariosAtivosCadastroObra = async () => [];
    export const solicitarRetornoSolicitacao = async () => null;`,
  uploads: 'export const uploadArquivos = async () => [];',
  tiposSubContrato: 'export const getTiposSubContrato = async () => [];',
  contratos: `export const getContratos = async () => ${JSON.stringify(contratos)};
    export const getFormasPagamentoFluxos = async () => ({ formas: [
      { id: 1, nome: 'PIX', codigo: 'PIX' }, { id: 2, nome: 'Boleto', codigo: 'BOLETO' }, { id: 3, nome: 'Transferencia', codigo: 'TRANSFERENCIA' }
    ] });
    export const getLimiteJuridico = async () => ({ limite: 50000 });
    export const criarContratoFluxoNovo = async () => null;
    export const uploadContratoAnexos = async () => null;
    export const uploadNegociacaoContrato = async () => null;
    export const uploadDocumentacaoJuridicaContrato = async () => null;`,
  parceiros: 'export const buscarParceiros = async () => []; export const criarCredorNovaSolicitacao = async () => null;',
  apropriacoes: 'export const listarApropriacoes = async () => [];',
  configuracoesSistema: `export const getAutomacaoDestinoNovaSolicitacao = async () => ({ regras: {}, destinos_disponiveis: [] });
    export const getCamposNovaSolicitacao = async () => ({ regras: { GEO: { tipos: { 7: { campos: {
      forma_pagamento: { visivel: !location.search.includes('oculto'), obrigatorio: true },
      favorecido: { visivel: false, obrigatorio: false }, credor: { visivel: false, obrigatorio: false },
      apropriacao_principal: { visivel: false, obrigatorio: false },
      apropriacoes_contrato: { visivel: false, obrigatorio: false },
      descricao: { visivel: false, obrigatorio: false },
      data_vencimento: { visivel: false, obrigatorio: false }
    } } } } } });`,
  nulo: 'export default function Nulo() { return null; }',
  contratoNovo: 'export const LIMITE_DETALHES_CONTRATO = 50000; export const MAXIMO_PARCELAS_CONTRATO = 100; export default function Bloco() { return null; }',
  medicao: `import React from 'react'; export default function Bloco() { return React.createElement('p', { 'data-testid': 'pagamento-fluxo-novo' }, 'Pagamento proprio do fluxo novo'); }`,
  rateio: 'export const numeroDoCampo = value => Number(value); export default function Rateio() { return null; }',
  padrao: `import React from 'react';
    export function Pagina({ children }) { return React.createElement('main', null, children); }
    export function PageHeader({ titulo, acoes }) { return React.createElement('header', null, titulo, acoes); }
    export function BlocoConteudo({ titulo, children }) { return React.createElement('section', null, React.createElement('h2', null, titulo), children); }
    export function CampoForm({ label, children, erro }) { return React.createElement('label', null, label, children, erro); }
    export function FormSecao({ legenda, children }) { return React.createElement('fieldset', null, React.createElement('legend', null, legenda), children); }
    export function Avisos() { return null; }
    export function useAvisos() { return { avisos: [], fechar: () => {}, avisar: { erro: console.error, alerta: console.error, sucesso: () => {} } }; }
    export function useConfirmacao() { return { confirmar: async () => ({ ok: true }), elementoConfirmacao: null }; }`
};
const fixture = `import React from 'react'; import { createRoot } from 'react-dom/client'; import { MemoryRouter } from 'react-router-dom';
  import NovaSolicitacao from '/src/pages/NovaSolicitacao.jsx';
  createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter, null, React.createElement(NovaSolicitacao)));`;
const server = await createServer({
  root, configFile: false, logLevel: 'error', server: { host: '127.0.0.1', port: 0 },
  plugins: [{
    name: 'pagamento-medicao-fixture', enforce: 'pre',
    resolveId(id) {
      if (id === '/fixture.jsx') return '\0fixture-medicao';
      const service = id.match(/services\/(\w+)$/)?.[1];
      if (service && modules[service]) return `\0medicao:${service}`;
      if (id.endsWith('contexts/AuthContext')) return '\0medicao:auth';
      if (id.endsWith('hooks/useFecharAoSair')) return '\0medicao:fechar';
      if (id.endsWith('utils/acessoProduto')) return '\0medicao:acesso';
      if (id.endsWith('components/padrao')) return '\0medicao:padrao';
      if (id.endsWith('/BlocoContratoFluxoNovo')) return '\0medicao:contratoNovo';
      if (id.endsWith('/BlocoMedicaoContrato')) return '\0medicao:medicao';
      if (id.endsWith('/RateioApropriacoesContrato')) return '\0medicao:rateio';
      if (/\/(ModalConferenciaCredores|ModalAditivoContrato|RecargaCartaoFields|CadastroRapidoFavorecidoButton)$/.test(id)) return '\0medicao:nulo';
    },
    load(id) {
      if (id === '\0fixture-medicao') return fixture;
      if (id.startsWith('\0medicao:')) return modules[id.slice('\0medicao:'.length)];
    },
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (new URL(req.url || '/', 'http://localhost').pathname !== '/fixture') return next();
        res.setHeader('Content-Type', 'text/html');
        res.end(await vite.transformIndexHtml('/fixture', '<html><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
      });
    }
  }, react()], optimizeDeps: { include: ['react', 'react-dom/client', 'react-router-dom'] }
});
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const oculto of [false, true]) {
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/fixture${oculto ? '?oculto' : ''}`);
    await page.getByPlaceholder('Digite o código ou nome da obra/centro de custo').fill('Obra teste');
    await page.getByRole('button', { name: /Obra teste/ }).click();
    await page.locator('select[name="tipo_solicitacao_id"]').selectOption('7');
    const contrato = page.getByPlaceholder('Digite o código ou o título do contrato');
    await contrato.fill('CT-LEG');
    await contrato.press('Enter');
    const forma = page.locator('select[name="forma_pagamento_id"]');
    assert.equal(await forma.count(), oculto ? 0 : 1, 'Medicao legada obedece visibilidade configurada');
    if (!oculto) {
      assert.equal(await forma.evaluate(el => el.required), true, 'Obrigatoriedade configurada preservada');
      await forma.selectOption('1');
      await page.locator('input[name="favorecido_chave_pix"]').waitFor();
      await forma.selectOption('3');
      await page.locator('textarea[name="dados_pagamento"]').waitFor();
      await forma.selectOption('2');
      assert.equal(await page.locator('input[name="favorecido_chave_pix"]').count(), 0, 'Boleto nao pede PIX');
      assert.equal(await page.getByPlaceholder('Buscar por nome, telefone, CPF/CNPJ ou PIX').count(), 0, 'Boleto nao pede favorecido separado');
    }
    await contrato.fill('CT-NOV');
    await contrato.press('Enter');
    await page.getByTestId('pagamento-fluxo-novo').waitFor();
    assert.equal(await forma.count(), 0, 'Fluxo novo nao duplica o pagamento generico');
    await contrato.fill('CT-LEG');
    await contrato.press('Enter');
    assert.equal(await page.getByTestId('pagamento-fluxo-novo').count(), 0);
    if (!oculto) {
      await forma.selectOption('2');
      await page.locator('input[name="valor"]').fill('500,00');
      await page.locator('input[name="data_inicio_medicao"]').fill('01/10/2026');
      await page.locator('input[name="data_fim_medicao"]').fill('05/10/2026');
      // Boleto conta como documento da medicao; upload e API sao simulados, sem escrita externa.
      const blocoPagamento = page.getByRole('group', { name: 'Pagamento da medição' });
      await blocoPagamento.locator('input[type="file"]').setInputFiles({ name: 'boleto.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nteste') });
      await page.getByRole('button', { name: 'Criar Solicitação', exact: true }).click();
      await page.waitForFunction(() => Boolean(window.payloadEnviado));
      const payload = await page.evaluate(() => window.payloadEnviado);
      assert.equal(Number(payload.forma_pagamento_id), 2);
      assert.equal(Number(payload.contrato_id), 10);
      assert.equal(payload.boleto_anexo_nome, 'boleto.pdf');
      assert.ok(!payload.medicao_pagamento, 'Legado permanece na API generica');
    }
    assert.deepEqual(errors, [], 'Pagina sem erros de execucao');
    await page.close();
  }
  console.log('OK: medicao legada configuravel, PIX/transferencia/boleto, payload de envio e pagamento separado do fluxo novo; controller preserva as exigencias corretas.');
} finally { await browser.close(); await server.close(); }
