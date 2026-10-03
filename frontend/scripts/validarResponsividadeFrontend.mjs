import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validarLayout } from './validarLayout.mjs';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = path.join(frontendRoot, 'src');

function read(relativePath) {
  return fs.readFileSync(path.join(frontendRoot, relativePath), 'utf8');
}

function fail(message) {
  throw new Error(`[responsividade] ${message}`);
}

function listFiles(directory, extensions, result = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      listFiles(absolutePath, extensions, result);
    } else if (extensions.some((extension) => entry.name.endsWith(extension))) {
      result.push(absolutePath);
    }
  }
  return result;
}

function resolveSourceImport(importPath) {
  const basePath = path.resolve(srcRoot, importPath);
  const candidates = [
    basePath,
    `${basePath}.jsx`,
    `${basePath}.js`,
    path.join(basePath, 'index.jsx'),
    path.join(basePath, 'index.js')
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

const app = read('src/App.jsx');
const layout = read('src/layout/Layout.jsx');
const main = read('src/main.jsx');
const indexCss = read('src/index.css');
const responsiveCss = read('src/styles/responsive-system.css');
const resizableTable = read('src/components/ResizableTable.jsx');
const modalPortal = read('src/components/ui/ModalPortal.jsx');
const gerenciarCotacao = read('src/modules/solicitacao-compra/pages/GerenciarCotacaoSolicitacao.jsx');
const html = read('index.html');

const routeCount = (app.match(/<Route\b/g) || []).length;
const lazyImports = [...app.matchAll(/lazy\(\(\)\s*=>\s*import\(['"](.+?)['"]\)\)/g)]
  .map((match) => match[1]);
const missingLazyImports = lazyImports.filter((importPath) => !resolveSourceImport(importPath));

if (routeCount === 0) fail('nenhuma rota foi encontrada em App.jsx.');
if (lazyImports.length === 0) fail('nenhuma pagina lazy foi encontrada em App.jsx.');
if (missingLazyImports.length > 0) {
  fail(`imports de rota inexistentes: ${missingLazyImports.join(', ')}`);
}

if (!/width=device-width/.test(html) || !/viewport-fit=cover/.test(html)) {
  fail('index.html precisa manter viewport responsivo com viewport-fit=cover.');
}

const indexImportPosition = main.indexOf("import './index.css'");
const responsiveImportPosition = main.indexOf("import './styles/responsive-system.css'");
if (responsiveImportPosition < 0 || responsiveImportPosition < indexImportPosition) {
  fail('responsive-system.css precisa ser carregado depois dos estilos historicos.');
}

// A reforma removeu a sidebar: o shell agora é o topo (fx-topbar) da
// fonte única, responsivo por CSS nos tokens. As garantias equivalentes:
// o Layout renderiza o topo novo, e os tokens tratam tablet e smartphone
// como viewport compacto.
const designTokensCss = read('src/styles/design-tokens.css');
if (!layout.includes('fx-topbar')) {
  fail('o shell precisa renderizar o topo da navegacao (fx-topbar).');
}
if (!designTokensCss.includes('@media (max-width: 1023px)')
  || !designTokensCss.includes('@media (max-width: 767px)')) {
  fail('o shell precisa tratar smartphone e tablet como viewport compacto.');
}
if (/\.layout-shell\.fluxy-app-shell\s*>\s*\*\s*\{[^}]*position\s*:\s*relative/s.test(indexCss)) {
  fail('a regra generica do shell voltou a sobrescrever o posicionamento do drawer.');
}
if (!responsiveCss.includes('.layout-shell.fluxy-app-shell > .sidebar')
  || !responsiveCss.includes('@media (max-width: 1023px)')
  || !responsiveCss.includes('@media (max-width: 767px)')) {
  fail('faltam garantias responsivas do shell para tablet ou smartphone.');
}
if (!resizableTable.includes('className="resizable-table-scroll"')
  || !resizableTable.includes('data-table-scroll')) {
  fail('tabelas redimensionaveis precisam de rolagem local.');
}

if (/\.layout-shell\.fluxy-app-shell\s*>\s*\.layout-main\s*\{[^}]*z-index\s*:/s.test(indexCss)
  || /\.layout-shell\.fluxy-app-shell\s*>\s*\.layout-main\s*\{[^}]*z-index\s*:/s.test(responsiveCss)) {
  fail('o conteudo principal nao pode criar um contexto de empilhamento abaixo dos modais.');
}
if (!modalPortal.includes("createPortal(")
  || !modalPortal.includes("document.body")
  || !modalPortal.includes("document.body.style.overflow = 'hidden'")) {
  fail('ModalPortal precisa renderizar no body e bloquear a rolagem de fundo.');
}
if (!indexCss.includes('.app-modal-overlay')
  || !indexCss.includes('.app-modal-surface--form')
  || !indexCss.includes('.layout-main :where(.modal-overlay, .fixed.inset-0)')) {
  fail('faltam o contrato global de modal ou a protecao dos overlays legados.');
}
const modaisCompraNoPortal = (gerenciarCotacao.match(/<ModalPortal\b/g) || []).length;
if (modaisCompraNoPortal < 4) {
  fail('os quatro overlays criticos da gestao de cotacao precisam usar ModalPortal.');
}

// Comentário que ENGOLE regras (acidente do merge de 02/09): um `/*` de
// cabeçalho de seção sem o `*/` fica aberto e comenta centenas de regras até
// o próximo `*/` — CSS válido, então build, minificação e navegador aceitam
// em silêncio. Detector: regra abrindo em COLUNA 0 dentro de um comentário
// (prosa que cita uma regra como exemplo é sempre indentada, e não dispara).
const cssFiles = listFiles(srcRoot, ['.css']);
for (const cssFile of cssFiles) {
  const css = fs.readFileSync(cssFile, 'utf8');
  for (const match of css.matchAll(/\/\*([\s\S]*?)\*\//g)) {
    const linhaRegra = match[1].split('\n')
      .find((line) => /^[.#:@[a-zA-Z-][^{}]*\{\s*$/.test(line));
    if (linhaRegra) {
      const linha = css.slice(0, match.index).split('\n').length;
      fail(`comentario iniciado em ${path.relative(frontendRoot, cssFile)}:${linha} `
        + `engole regras de CSS (ex.: "${linhaRegra.trim()}"). `
        + 'Provavelmente falta a linha "============================ */" de fechamento do cabecalho.');
    }
  }
}

// Fonte × bundle: toda classe definida nos .css do fonte precisa existir no
// CSS de produção. Se o dist tiver menos que o fonte, algo foi engolido no
// caminho (comentário aberto, minificação, purge…) — seja qual for o motivo.
const distAssets = path.join(frontendRoot, 'dist', 'assets');
let classesFonte = 0;
let bundleConferido = false;
if (fs.existsSync(distAssets)) {
  const distCss = fs.readdirSync(distAssets)
    .filter((name) => name.endsWith('.css'))
    .map((name) => fs.readFileSync(path.join(distAssets, name), 'utf8'))
    .join('\n');
  if (distCss) {
    bundleConferido = true;
    for (const cssFile of cssFiles) {
      const semComentarios = fs.readFileSync(cssFile, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      const nomes = new Set(
        [...semComentarios.matchAll(/\.([A-Za-z0-9_-]{3,})[\s,{:.[>~+]/g)].map((m) => m[1])
      );
      classesFonte += nomes.size;
      const ausentes = [...nomes].filter((nome) => !distCss.includes(nome));
      if (ausentes.length > 0) {
        fail(`${ausentes.length} classe(s) de ${path.relative(frontendRoot, cssFile)} `
          + `sumiram do CSS de producao (dist/assets): ${ausentes.slice(0, 10).join(', ')}`
          + `${ausentes.length > 10 ? '…' : ''}. Algo engoliu regras entre o fonte e o bundle — `
          + 'rode "npm run build" limpo e procure o trecho dessas classes no fonte.');
      }
    }
  }
}

// R13 — o cabeçalho da tela é FAIXA FIXA: gruda abaixo da topbar na rolagem
// (compacta, nunca some). A garantia estática é o sticky no CSS padrão; a
// medição real (posição após rolar) é da auditoria runtime das capturas.
const componentesPadraoCss = read('src/styles/componentes-padrao.css');
if (!/\.layout-main \.app-page-header \{[^}]*position:\s*sticky/s.test(componentesPadraoCss)
  || !/--pos-cabecalho-fixo/.test(componentesPadraoCss)) {
  fail('o cabeçalho da tela precisa ser fixo na rolagem (.app-page-header sticky com --pos-cabecalho-fixo) — R13.');
}

// Regras mecânicas de layout (docs/REGRAS-LAYOUT.md) sobre as telas do
// manifesto — reprovam a tela reformada que sair do padrão.
const regrasLayout = validarLayout();
regrasLayout.avisos.forEach((aviso) => console.warn('[layout] AVISO', aviso));
if (regrasLayout.falhas.length > 0) {
  regrasLayout.falhas.forEach((f) => console.error('[layout] FALHA', f));
  fail(`${regrasLayout.falhas.length} violação(ões) das regras mecânicas de layout — veja docs/REGRAS-LAYOUT.md.`);
}

const sourceFiles = listFiles(srcRoot, ['.jsx', '.js']);
const routeFiles = sourceFiles.filter((filePath) => {
  const content = fs.readFileSync(filePath, 'utf8');
  return content.includes('<table') || content.includes('<ResizableTable');
});
const namedScrollFiles = routeFiles.filter((filePath) => {
  const content = fs.readFileSync(filePath, 'utf8');
  return /overflow-x-auto|table-wrapper|table-responsive|app-table-shell|sol-table-wrapper|data-table-scroll|ResizableTable/.test(content);
});

console.log(JSON.stringify({
  ok: true,
  rotas_verificadas: routeCount,
  paginas_lazy_verificadas: lazyImports.length,
  arquivos_com_tabela: routeFiles.length,
  arquivos_com_wrapper_nomeado: namedScrollFiles.length,
  modais_criticos_com_portal: modaisCompraNoPortal,
  css_sem_comentario_engolindo_regras: cssFiles.length,
  classes_fonte_conferidas_no_bundle: bundleConferido
    ? classesFonte
    : 'nao conferido — dist ausente, rode npm run build antes',
  protecao_global_de_overlays: true,
  garantia_para_tabelas_historicas: responsiveCss.includes(':has(> table:not(.solicitacoes-table--mobile))'),
  breakpoints: ['smartphone <= 767px', 'tablet <= 1023px', 'desktop >= 1024px']
}, null, 2));
