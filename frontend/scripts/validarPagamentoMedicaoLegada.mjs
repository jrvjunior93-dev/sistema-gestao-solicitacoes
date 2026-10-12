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
    usaFluxoAdiantamento: false, camposFixosAdiantamento: new Set(),
    camposNovaSolicitacao: { forma_pagamento: { obrigatorio: true }, favorecido: { obrigatorio: true }, credor: { obrigatorio: true } }
  });
  assert.equal(obrigatorio('forma_pagamento'), !novo);
  assert.equal(obrigatorio('favorecido'), !novo);
  assert.equal(obrigatorio('credor'), true, 'Demais regras nao sao relaxadas');
}

const tipo = { id: 7, nome: 'MEDICAO', codigo_interno: 'MEDICAO' };
const tipoPagamentoComum = { id: 9, nome: 'PAGAMENTO QA', codigo_interno: 'PAGAMENTO_QA' };
const tipos = [tipo, tipoPagamentoComum];
const campos = `{
  forma_pagamento: { visivel: !location.search.includes('oculto'), obrigatorio: true },
  favorecido: { visivel: false, obrigatorio: false }, credor: { visivel: false, obrigatorio: false },
  apropriacao_principal: { visivel: false, obrigatorio: false },
  apropriacoes_contrato: { visivel: false, obrigatorio: false },
  descricao: { visivel: false, obrigatorio: false },
  justificativa: { visivel: false, obrigatorio: false },
  data_vencimento: { visivel: false, obrigatorio: false }
}`;
const contratos = [
  { id: 10, codigo: 'CT-LEG', ref_contrato: 'Contrato legado', fluxo_novo: false, status: 'ATIVO' },
  { id: 11, codigo: 'CT-NOV', ref_contrato: 'Contrato novo', fluxo_novo: true, solicitacao_id: 100, disponivel_medicao: true, status: 'ATIVO' }
];
const conversaoCentavos = fs.readFileSync(path.join(root, 'src/components/contratos/BlocoContratoFluxoNovo.jsx'), 'utf8')
  .match(/export function paraCentavosContrato\(v\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(conversaoCentavos, 'Conversao real de centavos encontrada');
const modules = {
  auth: `import { createContext } from 'react';
    const value = { user: { id: 1, perfil: 'SUPERADMIN', setor: 'GEO' } };
    export const AuthContext = createContext(value);
    export const useAuth = () => value;`,
  fechar: 'export const useFecharAoSair = () => {};',
  acesso: 'export const hasEnabledModule = () => true;',
  obras: 'export const getMinhasObras = async () => [{ id: 20, codigo: "20", nome: "Obra teste", tipo_centro_custo: "OBRA" }];',
  tiposSolicitacao: `export const getTiposSolicitacao = async () => ${JSON.stringify(tipos)};
    export const getTiposSolicitacaoDisponiveis = async () => ({ tipos: ${JSON.stringify(tipos)}, contexto: 'OBRA', destino_inicial: { codigo: 'GEO' }, areas_configuracao_campos: ['GEO'] });`,
  solicitacoes: `export const createSolicitacao = async payload => { window.payloadEnviado = payload; return { id: 900, codigo: 'TESTE' }; };
    export const getApropriacaoPadraoSolicitacao = async () => null;
    export const getObrasDistribuicaoCentroCusto = async () => [];
    export const getSaldoDespesaEventual = async () => null;
    export const getUsuariosAtivosCadastroObra = async () => [];
    export const solicitarRetornoSolicitacao = async () => null;`,
  uploads: `export const uploadArquivos = async payload => {
    window.uploadsEnviados = [...(window.uploadsEnviados || []), { ...payload, files: payload.files.map(f => f.name) }];
    return [];
  };`,
  tiposSubContrato: 'export const getTiposSubContrato = async () => [];',
  contratos: `export const getContratos = async () => ${JSON.stringify(contratos)};
    export const getContratoParcelas = async () => ({
      contrato: { id: 11, codigo: 'CT-NOV', fluxo_novo: true, contratados: [{ id: 71, nome: 'Credor QA', chave_pix: 'credor@pix' }] },
      saldo: { saldo: 500, comprometido: 0 },
      parcelas: [{ id: 51, numero: 1, valor: 500, valor_previsto: 500, vencimento: '2099-12-01', data_vencimento: '2099-12-01', editavel: true, medivel: true }]
    });
    export const getFormasPagamentoFluxos = async () => ({ formas: [
      { id: 1, nome: 'PIX', codigo: 'PIX' }, { id: 2, nome: 'Boleto', codigo: 'BOLETO' }, { id: 3, nome: 'Transferencia', codigo: 'TRANSFERENCIA' }
    ] });
    export const getFormasPagamentoMedicao = getFormasPagamentoFluxos;
    export const getLimiteJuridico = async () => ({ limite: 50000 });
    export const criarContratoFluxoNovo = async () => null;
    export const uploadContratoAnexos = async () => null;
    export const uploadNegociacaoContrato = async () => null;
    export const uploadDocumentacaoJuridicaContrato = async () => null;`,
  parceiros: `export const buscarParceiros = async ({ q }) => [
    { id: 71, nome: 'Credor QA', chave_pix: 'credor@pix' }, { id: 72, nome: 'Favorecido QA', chave_pix: 'segundo@pix' }
  ].filter(p => p.nome.toLowerCase().includes(q.toLowerCase())); export const criarCredorNovaSolicitacao = async () => null;`,
  apropriacoes: 'export const listarApropriacoes = async () => [];',
  configuracoesSistema: `export const getAutomacaoDestinoNovaSolicitacao = async () => ({ regras: {}, destinos_disponiveis: [] });
    export const getCamposNovaSolicitacao = async () => ({ regras: { GEO: { tipos: {
      7: { campos: ${campos} }, 9: { campos: ${campos} }
    } } } });`,
  nulo: 'export default function Nulo() { return null; }',
  contratoNovo: `${conversaoCentavos}\nexport const LIMITE_DETALHES_CONTRATO = 50000; export const MAXIMO_PARCELAS_CONTRATO = 24; export default function Bloco() { return null; }`,
  medicao: `import React from 'react'; import Real from '/src/components/contratos/BlocoMedicaoContrato.jsx';
    export default function Bloco(props) { return location.search.includes('real-novo')
      ? React.createElement(Real, props) : React.createElement('p', { 'data-testid': 'pagamento-fluxo-novo' }, 'Pagamento proprio do fluxo novo'); }`,
  rateio: 'export const numeroDoCampo = value => Number(value); export default function Rateio() { return null; }',
  padrao: `import React from 'react';
    export { default as TabelaPadrao } from '/src/components/padrao/TabelaPadrao.jsx';
    export function Pagina({ children }) { return React.createElement('main', null, children); }
    export function PageHeader({ titulo, acoes }) { return React.createElement('header', null, titulo, acoes); }
    export function BlocoConteudo({ titulo, children, 'data-testid': testId }) { return React.createElement('section', { 'data-testid': testId }, React.createElement('h2', null, titulo), children); }
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
      if (/\/AuthContext(?:\.jsx)?$/.test(id)) return '\0medicao:auth';
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
  for (const width of [1366, 390]) {
  for (const oculto of [false, true]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
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
      const blocoPagamento = page.getByTestId('nova-solicitacao-pagamento').getByRole('group', { name: 'Pagamento', exact: true });
      const seletor = blocoPagamento.locator('input[type="file"]');
      assert.equal(await seletor.evaluate(el => el.multiple), true);
      const pdf = name => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nteste') });
      await seletor.setInputFiles([pdf('boleto.pdf'), pdf('boleto-2.pdf')]);
      await seletor.setInputFiles(pdf('boleto-3.pdf'));
      await blocoPagamento.getByRole('button', { name: 'Remover boleto-2.pdf', exact: true }).click();
      assert.equal(await blocoPagamento.getByText('boleto-2.pdf', { exact: true }).count(), 0);
      await blocoPagamento.getByText('boleto.pdf', { exact: true }).waitFor();
      await blocoPagamento.getByText('boleto-3.pdf', { exact: true }).waitFor();
      await seletor.setInputFiles({ name: 'invalido.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('invalido') });
      assert.equal(await blocoPagamento.getByText('invalido.exe', { exact: true }).count(), 0);
      await page.getByRole('button', { name: 'Criar Solicitação', exact: true }).click();
      await page.waitForFunction(() => Boolean(window.payloadEnviado));
      const payload = await page.evaluate(() => window.payloadEnviado);
      assert.equal(Number(payload.forma_pagamento_id), 2);
      assert.equal(Number(payload.contrato_id), 10);
      assert.equal(payload.boleto_anexo_nome, 'boleto.pdf');
      assert.ok(!payload.medicao_pagamento, 'Legado permanece na API generica');
      const uploads = await page.evaluate(() => window.uploadsEnviados);
      assert.deepEqual(uploads.filter(u => u.tipo === 'BOLETO').map(u => u.files), [['boleto.pdf', 'boleto-3.pdf']]);
    }
    assert.deepEqual(errors, [], 'Pagina sem erros de execucao');
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/fixture?real-novo`);
  await page.getByPlaceholder('Digite o código ou nome da obra/centro de custo').fill('Obra teste');
  await page.getByRole('button', { name: /Obra teste/ }).click();
  await page.locator('select[name="tipo_solicitacao_id"]').selectOption('7');
  await page.getByPlaceholder('Digite o código ou o título do contrato').fill('CT-NOV');
  await page.getByPlaceholder('Digite o código ou o título do contrato').press('Enter');
  await page.locator('[name="forma_pagamento_medicao"]').selectOption('2');
  const input = page.getByLabel('Anexar boletos da medição', { exact: true });
  assert.equal(await input.evaluate(el => el.multiple), true);
  const pdf = name => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nQA') });
  await input.setInputFiles([pdf('novo-1.pdf'), pdf('novo-2.pdf')]);
  await input.setInputFiles(pdf('novo-3.pdf'));
  await page.getByRole('button', { name: 'Remover novo-2.pdf', exact: true }).click();
  await page.getByText('novo-1.pdf', { exact: true }).waitFor();
  await page.getByText('novo-3.pdf', { exact: true }).waitFor();
  await page.locator('.app-tabela input[type="checkbox"], .app-tabela-cards input[type="checkbox"]').first().check();
  await page.locator('[name="data_inicio_medicao"]').fill('01/10/2026');
  await page.locator('[name="data_fim_medicao"]').fill('05/10/2026');
  await page.locator('[name="dados_pagamento_confirmados"]').check();
  await page.getByRole('button', { name: 'Criar Solicitação', exact: true }).click();
  await page.waitForFunction(() => Boolean(window.payloadEnviado));
  const result = await page.evaluate(() => ({ payload: window.payloadEnviado, uploads: window.uploadsEnviados }));
  assert.equal(result.payload.medicao_pagamento.boleto_anexo_nome, 'novo-1.pdf');
  assert.equal(result.payload.boleto_anexo_nome, 'novo-1.pdf', 'Autoriza upload inicial de BOLETO no contrato novo');
  assert.deepEqual(result.uploads.filter(u => u.tipo === 'BOLETO').map(u => u.files), [['novo-1.pdf', 'novo-3.pdf']]);
  assert.deepEqual(errors, []);
  await page.close();
  const comum = await browser.newPage({ viewport: { width, height: 900 } });
  comum.setDefaultTimeout(10000);
  const errosComum = [];
  comum.on('pageerror', error => errosComum.push(error.message));
  await comum.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
  await comum.goto(`http://127.0.0.1:${server.httpServer.address().port}/fixture`);
  await comum.getByPlaceholder('Digite o código ou nome da obra/centro de custo').fill('Obra teste');
  await comum.getByRole('button', { name: /Obra teste/ }).click();
  await comum.locator('[name="tipo_solicitacao_id"]').selectOption('9');
  await comum.locator('[name="forma_pagamento_id"]').selectOption('2');
  await comum.locator('[name="valor"]').fill('500,00');
  const inputComum = comum.getByLabel('Anexar boletos', { exact: true });
  assert.equal(await inputComum.evaluate(el => el.multiple), true);
  await inputComum.setInputFiles([pdf('comum-1.pdf'), pdf('comum-2.pdf')]);
  await comum.getByRole('button', { name: 'Criar Solicitação', exact: true }).click();
  await comum.waitForFunction(() => Boolean(window.payloadEnviado));
  const enviadoComum = await comum.evaluate(() => ({ payload: window.payloadEnviado, uploads: window.uploadsEnviados }));
  assert.equal(Number(enviadoComum.payload.tipo_solicitacao_id), 9);
  assert.deepEqual(enviadoComum.uploads.filter(u => u.tipo === 'BOLETO').map(u => u.files), [['comum-1.pdf', 'comum-2.pdf']]);
  assert.deepEqual(errosComum, []);
  await comum.close();
  for (const novo of [false, true]) {
    const multi = await browser.newPage({ viewport: { width, height: 900 } });
    multi.setDefaultTimeout(10000);
    const erros = [], avisos = [];
    multi.on('pageerror', e => erros.push(e.message));
    multi.on('console', e => { if (e.type() === 'error') avisos.push(e.text()); });
    await multi.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
    await multi.goto(`http://127.0.0.1:${server.httpServer.address().port}/fixture${novo ? '?real-novo' : ''}`);
    await multi.getByPlaceholder('Digite o código ou nome da obra/centro de custo').fill('Obra teste');
    await multi.getByRole('button', { name: /Obra teste/ }).click();
    await multi.locator('[name="tipo_solicitacao_id"]').selectOption(novo ? '7' : '9');
    const dados = multi.getByTestId('nova-solicitacao-dados');
    const pagamento = multi.getByTestId('nova-solicitacao-pagamento');
    assert.equal(await dados.locator('[name="forma_pagamento_id"]').count(), 0, 'Pagamento nao fica nos dados da solicitacao');
    if (novo) {
      await multi.getByPlaceholder('Digite o código ou o título do contrato').fill('CT-NOV');
      await multi.getByPlaceholder('Digite o código ou o título do contrato').press('Enter');
      assert.equal(await dados.getByPlaceholder('Digite o código ou o título do contrato').count(), 1, 'Contrato pertence aos dados');
      await multi.locator('.app-tabela input[type="checkbox"], .app-tabela-cards input[type="checkbox"]').first().check();
      await multi.locator('[name="forma_pagamento_medicao"]').selectOption('1');
      await multi.locator('[name="data_inicio_medicao"]').fill('01/10/2026');
      await multi.locator('[name="data_fim_medicao"]').fill('05/10/2026');
      assert.equal(await dados.locator('[name="data_inicio_medicao"]').count(), 1, 'Periodo pertence aos dados');
      assert.equal(await pagamento.locator('[name="data_inicio_medicao"]').count(), 0);
    } else {
      await multi.locator('[name="forma_pagamento_id"]').selectOption('2');
      await multi.locator('[name="valor"]').fill('500,00');
      assert.equal(await pagamento.locator('[name="valor"]').evaluate(el => Boolean(el.compareDocumentPosition(document.querySelector('[name="forma_pagamento_id"]')) & Node.DOCUMENT_POSITION_FOLLOWING)), true, 'Valor vem antes da forma');
    }
    await multi.getByRole('button', { name: 'Adicionar novo favorecido', exact: true }).click();
    const partes = multi.getByTestId('parte-favorecido');
    await partes.nth(0).getByLabel('Valor do favorecido 1 *', { exact: true }).fill('300,00');
    if (novo) await multi.getByLabel('Chave PIX / Copia e Cola do favorecido 1 *', { exact: true }).fill('credor@pix');
    if (!novo) {
      await partes.nth(0).getByRole('combobox', { name: 'Favorecido 1 *', exact: true }).fill('Credor');
      await partes.nth(0).getByRole('button', { name: 'Credor QA', exact: true }).click();
      await multi.getByLabel('Boletos do favorecido 1', { exact: true }).setInputFiles([pdf('primeiro-1.pdf'), pdf('primeiro-2.pdf')]);
    }
    await partes.nth(1).getByRole('combobox', { name: 'Favorecido 2 *', exact: true }).fill('Favorecido');
    await partes.nth(1).getByRole('button', { name: 'Favorecido QA', exact: true }).click();
    await partes.nth(1).getByRole('combobox', { name: /^Forma de pagamento do favorecido 2/ }).selectOption(novo ? '2' : '1');
    await partes.nth(1).getByLabel('Valor do favorecido 2 *', { exact: true }).fill('199,99');
    if (!novo) {
      assert.equal((await pagamento.locator('[name="valor"]').inputValue()).replace(/[^\d,]/g, ''), '499,99', 'Total soma os centavos');
      assert.equal(await pagamento.locator('[name="valor"]').evaluate(el => el.readOnly), true);
    } else {
      await multi.waitForFunction(() => document.body.textContent.includes('R$ 499,99'));
    }
    if (novo) await multi.getByLabel('Boletos do favorecido 2', { exact: true }).setInputFiles([pdf('segundo-1.pdf'), pdf('segundo-2.pdf')]);
    else await multi.getByLabel('Chave PIX / Copia e Cola do favorecido 2 *', { exact: true }).fill('000201' + 'X'.repeat(1000));
    if (!novo) {
      await multi.getByRole('button', { name: 'Usar apenas o primeiro favorecido', exact: true }).click();
      assert.equal((await pagamento.locator('[name="valor"]').inputValue()).replace(/[^\d,]/g, ''), '300,00');
      assert.equal(await pagamento.locator('[name="valor"]').evaluate(el => el.readOnly), false);
      await multi.getByRole('button', { name: 'Adicionar novo favorecido', exact: true }).click();
      // No boleto simples o favorecido separado nao faz parte do cadastro legado.
      await partes.nth(0).getByRole('combobox', { name: 'Favorecido 1 *', exact: true }).fill('Credor');
      await partes.nth(0).getByRole('button', { name: 'Credor QA', exact: true }).click();
      await partes.nth(1).getByRole('combobox', { name: 'Favorecido 2 *', exact: true }).fill('Favorecido');
      await partes.nth(1).getByRole('button', { name: 'Favorecido QA', exact: true }).click();
      await partes.nth(1).getByRole('combobox', { name: /^Forma de pagamento do favorecido 2/ }).selectOption('1');
      await partes.nth(1).getByLabel('Valor do favorecido 2 *', { exact: true }).fill('199,99');
      await multi.getByLabel('Chave PIX / Copia e Cola do favorecido 2 *', { exact: true }).fill('000201' + 'X'.repeat(1000));
    }
    // Cancelar a divisao restaura somente os dados/arquivos da primeira parte.
    if (novo) {
      await multi.getByRole('button', { name: 'Usar apenas o primeiro favorecido', exact: true }).click();
      assert.equal(await multi.getByTestId('parte-favorecido').count(), 0);
      assert.equal(await multi.locator('[name="forma_pagamento_medicao"]').inputValue(), '1');
      assert.equal(await multi.getByText('segundo-1.pdf', { exact: true }).count(), 0);
      await multi.getByRole('button', { name: 'Adicionar novo favorecido', exact: true }).click();
      await partes.nth(0).getByLabel('Valor do favorecido 1 *', { exact: true }).fill('300,00');
      await partes.nth(1).getByRole('combobox', { name: 'Favorecido 2 *', exact: true }).fill('Favorecido');
      await partes.nth(1).getByRole('button', { name: 'Favorecido QA', exact: true }).click();
      await partes.nth(1).getByRole('combobox', { name: /^Forma de pagamento do favorecido 2/ }).selectOption('2');
      await partes.nth(1).getByLabel('Valor do favorecido 2 *', { exact: true }).fill('199,99');
      await multi.getByLabel('Boletos do favorecido 2', { exact: true }).setInputFiles([pdf('segundo-1.pdf'), pdf('segundo-2.pdf')]);
    }
    await partes.nth(1).getByLabel('Valor do favorecido 2 *', { exact: true }).fill('0,00');
    if (novo) await multi.locator('[name="dados_pagamento_confirmados"]').check();
    await multi.getByRole('button', { name: 'Criar Solicitação', exact: true }).click();
    await multi.waitForFunction(() => !window.payloadEnviado);
    assert.ok(avisos.some(a => a.includes('informe pessoa, valor e forma de pagamento')), JSON.stringify({ novo, avisos,
      invalidos: await multi.locator(':invalid').evaluateAll(els => els.map(e => ({ tag: e.tagName, nome: e.name, valor: e.value }))) }));
    await partes.nth(1).getByLabel('Valor do favorecido 2 *', { exact: true }).fill('200,00');
    await multi.getByRole('button', { name: 'Adicionar novo favorecido', exact: true }).click();
    await partes.nth(2).getByLabel('Valor do favorecido 3 *', { exact: true }).fill('25,00');
    if (novo) await multi.getByText('O total selecionado passa do saldo do contrato.', { exact: true }).waitFor();
    else assert.equal((await pagamento.locator('[name="valor"]').inputValue()).replace(/[^\d,]/g, ''), '525,00');
    await multi.getByRole('button', { name: 'Remover favorecido 3', exact: true }).click();
    assert.equal(await partes.count(), 2);
    if (!novo) assert.equal((await pagamento.locator('[name="valor"]').inputValue()).replace(/[^\d,]/g, ''), '500,00');
    if (novo) await multi.locator('[name="dados_pagamento_confirmados"]').check();
    await multi.getByRole('button', { name: 'Criar Solicitação', exact: true }).click();
    await multi.waitForFunction(() => Boolean(window.payloadEnviado));
    const resultado = await multi.evaluate(() => ({ payload: window.payloadEnviado, uploads: window.uploadsEnviados }));
    const pagos = novo ? resultado.payload.medicao_pagamento.pagamentos_favorecidos : resultado.payload.pagamentos_favorecidos;
    assert.equal(pagos.length, 2); assert.deepEqual(pagos.map(p => p.valor), [300, 200]);
    assert.deepEqual(pagos.map(p => p.favorecido_id), [71, 72]);
    assert.deepEqual(pagos.map(p => p.forma_pagamento_id), novo ? [1, 2] : [2, 1]);
    if (novo) assert.deepEqual(pagos.map(p => p.contrato_parcela_id), [51, 51]);
    else assert.equal(pagos[1].favorecido_chave_pix.length, 1006, 'Copia e Cola nao truncado');
    assert.deepEqual(resultado.uploads.filter(u => u.tipo === 'BOLETO').flatMap(u => u.files), novo
      ? ['segundo-1.pdf', 'segundo-2.pdf'] : ['primeiro-1.pdf', 'primeiro-2.pdf']);
    assert.deepEqual(erros, []);
    await multi.close();
  }
  console.log('OK boletos multiplos '+width+'px: selecao cumulativa, remocao individual e envio de todos no legado/fluxo novo.');
  }
  console.log('OK: medicao legada configuravel, PIX/transferencia/boleto, payload de envio e pagamento separado do fluxo novo; controller preserva as exigencias corretas.');
} finally { await browser.close(); await server.close(); }
