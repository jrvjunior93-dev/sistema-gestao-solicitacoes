import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureId = '\0compra-apropriacao-fixture';
const modules = {
  '\0compra-apropriacao-auth': 'export const useAuth = () => ({ user: { id: 1, nome: "Teste" } });',
  '\0compra-apropriacao-obras': 'export const getMinhasObras = async () => [{ id: 20, codigo: "20", nome: "Obra teste" }];',
  '\0compra-apropriacao-apropriacoes': 'export const listarApropriacoes = async () => [{ id: 1, codigo: "00.001.001", descricao: "Administração" }];',
  '\0compra-apropriacao-parceiros': 'export const buscarParceiros = async () => []; export const criarCredorCompraDireta = async () => null;',
  '\0compra-apropriacao-preview': 'export default function CompraPreviewModal() { return null; }',
  '\0compra-apropriacao-compras': `
    export const baixarModeloItensSolicitacaoCompra = async () => null;
    export const baixarModeloItensCompraDireta = async () => null;
    export const importarItensSolicitacaoCompra = async () => [];
    export const importarItensCompraDireta = async () => [];
    export const listarFormasPagamentoCompraDireta = async () => [];
    export const listarInsumos = async () => [];
    export const listarUnidades = async () => [];
    export const obterUrlAssinadaCompra = async () => null;
    export const obterEtapasCompraSolicitacao = async () => null;
    export const uploadAnexoTemporarioCompra = async () => null;
  `,
  '\0compra-apropriacao-padrao': `
    import React from 'react';
    export function Pagina({ children }) { return React.createElement('main', null, children); }
    export function PageHeader({ titulo }) { return React.createElement('h1', null, titulo); }
    export function BlocoConteudo({ titulo, acoes, children }) {
      return React.createElement('section', null, React.createElement('h2', null, titulo), acoes, children);
    }
    export function CampoForm({ label, children, erro }) {
      return React.createElement('label', null, label, children, erro ? React.createElement('span', null, erro) : null);
    }
    export function FormSecao({ children }) { return React.createElement('div', null, children); }
    export function StatGrid({ children }) { return React.createElement('div', null, children); }
    export function StatTile({ label, valor }) { return React.createElement('p', null, label + ': ' + valor); }
    export function Avisos() { return null; }
    export function useAvisos() {
      return { avisos: [], fechar: () => {}, avisar: { erro: () => {}, alerta: () => {}, sucesso: () => {} } };
    }
    export function useConfirmacao() { return { confirmar: async () => ({ ok: true }), elementoConfirmacao: null }; }
    export function TabelaPadrao({ itens, colunas, acoesLinha }) {
      return React.createElement('section', { 'data-testid': 'itens-grade' }, itens.map((item, index) =>
        React.createElement('div', { key: index, 'data-testid': 'item-' + index },
          colunas.filter((coluna) => ['insumo', 'unidade', 'quantidade', 'apropriacao'].includes(coluna.id))
            .map((coluna) => React.createElement('div', { key: coluna.id, 'data-coluna': coluna.id }, coluna.render(item))),
          acoesLinha?.(item)
        )
      ));
    }
  `
};

const fixture = `
  import React from 'react';
  import { createRoot } from 'react-dom/client';
  import { MemoryRouter } from 'react-router-dom';
  import NovaSolicitacaoCompra from '/src/modules/solicitacao-compra/pages/NovaSolicitacaoCompra.jsx';
  const direta = new URLSearchParams(location.search).has('direta');
  createRoot(document.getElementById('root')).render(
    React.createElement(MemoryRouter, { initialEntries: [
      (direta ? '/solicitacoes-compra-direta/nova' : '/solicitacoes-compra/nova') + '?obra_id=20'
    ] }, React.createElement(NovaSolicitacaoCompra, { modoCompraDireta: direta }))
  );
`;

const server = await createServer({
  root,
  configFile: false,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
  plugins: [{
    name: 'compra-apropriacao-fixture',
    enforce: 'pre',
    resolveId(id, importer) {
      if (id === '/fixture.jsx') return fixtureId;
      if (!importer?.endsWith('/NovaSolicitacaoCompra.jsx')) return undefined;
      if (id.endsWith('contexts/AuthContext')) return '\0compra-apropriacao-auth';
      if (id.endsWith('services/obras')) return '\0compra-apropriacao-obras';
      if (id.endsWith('services/apropriacoes')) return '\0compra-apropriacao-apropriacoes';
      if (id.endsWith('services/parceiros')) return '\0compra-apropriacao-parceiros';
      if (id.endsWith('services/compras')) return '\0compra-apropriacao-compras';
      if (id.endsWith('components/padrao')) return '\0compra-apropriacao-padrao';
      if (id.endsWith('components/CompraPreviewModal')) return '\0compra-apropriacao-preview';
      return undefined;
    },
    load(id) {
      if (id === fixtureId) return fixture;
      return modules[id];
    },
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (new URL(req.url || '/', 'http://localhost').pathname !== '/fixture') return next();
        res.setHeader('Content-Type', 'text/html');
        res.end(await vite.transformIndexHtml('/fixture', '<html><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
      });
    }
  }, react()],
  optimizeDeps: { include: ['react', 'react-dom/client', 'react-router-dom'] }
});

await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const direta of [false, true]) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const suffix = direta ? '?direta' : '';
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/fixture${suffix}`);
    await page.getByRole('button', { name: 'Item manual' }).click();
    assert.equal(await page.getByRole('dialog').count(), 0, 'Item manual deve ser adicionado sem modal');

    const row = page.getByTestId('item-0');
    await row.getByRole('textbox', { name: 'Nome do insumo' }).fill('Cimento');
    await row.locator('input[aria-label="Unidade do item"]').fill('sc');
    await row.getByRole('button', { name: /Apropriar Cimento/ }).click();

    const modal = page.getByRole('dialog', { name: 'Apropriar item' });
    await modal.waitFor();
    await modal.getByRole('combobox').fill('00.001.001');
    await modal.getByRole('combobox').press('Enter');
    await modal.getByRole('button', { name: 'Salvar distribuição' }).click();
    await modal.waitFor({ state: 'hidden' });
    await row.getByText(/Administração: 1/).waitFor();

    await row.getByRole('button', { name: /Editar apropriação Cimento/ }).click();
    await modal.getByRole('button', { name: 'Adicionar apropriação' }).click();
    await modal.getByRole('button', { name: 'Cancelar' }).click();
    await modal.waitFor({ state: 'hidden' });
    assert.equal(await row.getByText(/Administração: 1/).count(), 1, 'Cancelar não altera o rateio salvo');
    assert.deepEqual(errors, [], `Erro de execução em ${direta ? 'Compra Direta' : 'Solicitação de Compra'}`);
    await page.close();
  }
  console.log('OK: item manual inline e apropriação por modal nas duas modalidades; salvar e cancelar preservados.');
} finally {
  await browser.close();
  await server.close();
}
