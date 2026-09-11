import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function ler(relativo) {
  return readFileSync(path.join(raiz, relativo), 'utf8');
}

function exigir(condicao, mensagem) {
  if (!condicao) throw new Error(mensagem);
}

const layout = ler('src/layout/Layout.jsx');
const hook = ler('src/navigation/useWorkspaceTabs.js');
const tabs = ler('src/navigation/WorkspaceTabs.jsx');
const busca = ler('src/navigation/CommandPalette.jsx');
const css = ler('src/styles/design-tokens.css');

exigir(layout.includes('<WorkspaceTabs'), 'Layout não renderiza a faixa de abas internas.');
exigir(layout.includes('onClickCapture={abrirLinkEmAbaInterna}'), 'Layout não captura Ctrl/Cmd+clique em links internos.');
exigir(layout.includes('onAuxClickCapture={abrirLinkEmAbaInterna}'), 'Layout não captura clique do meio em links internos.');
exigir(layout.includes('mode={buscaModo}'), 'Busca universal não diferencia navegação atual de nova aba.');

exigir(hook.includes('window.sessionStorage'), 'Abas internas não persistem durante a sessão.');
exigir(hook.includes('MAX_WORKSPACE_TABS = 12'), 'Limite operacional de abas foi removido.');
exigir(hook.includes('routeFromInternalAnchor'), 'Proteção para links internos não está disponível.');
exigir(hook.includes("(?:api|uploads|anexos)"), 'Anexos e endpoints podem ser capturados como abas internas.');
exigir(hook.includes("^\\/cotacao\\/"), 'Portal público de cotação pode ser capturado como aba autenticada.');

exigir(tabs.includes('role="tablist"'), 'Faixa de abas não expõe o padrão acessível tablist.');
exigir(tabs.includes('role="tab"'), 'Abas não expõem o papel acessível tab.');
exigir(tabs.includes("event.key === 'Delete'"), 'Abas não podem ser fechadas pelo teclado.');
exigir(tabs.includes("event.key === 'ArrowRight'"), 'Abas não suportam navegação por setas.');

exigir(busca.includes("mode === 'new-tab'"), 'Busca universal não informa o modo de nova aba.');
exigir(css.includes('.fx-workspace-tabs-scroll'), 'Estilos da faixa de abas não existem.');
exigir(/\.fx-workspace-tabs-scroll\s*\{[\s\S]*?overflow-x:\s*auto/.test(css), 'Faixa de abas não permite rolagem horizontal.');
exigir(css.includes('.fx-workspace-tab.is-active'), 'Aba ativa não possui estado visual próprio.');

console.log('Abas internas validadas com sucesso.');
