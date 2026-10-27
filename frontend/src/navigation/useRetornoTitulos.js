import { useWorkspace } from './WorkspaceContext';

// Retoma a etapa original com query, pagina e snapshot; uma URL direta tem
// fallback na carteira do titulo, sem depender do ultimo recorte de outra tela.
export function caminhoRetornoTitulos(workspace, tipo) {
  const tab = workspace?.tabs?.find(item => item.id === workspace.activeId);
  const origem = workspace?.tabs?.find(item => item.id === tab?.origin?.tabId);
  const origemCursor = origem?.entries?.findIndex(item => item.id === tab?.origin?.entryId);
  for (const [fonte, cursor] of [[tab, (tab?.cursor ?? 0) - 1], [origem, origemCursor]]) {
    const entradas = fonte?.entries || [];
    for (let i = Math.min(cursor ?? -1, entradas.length - 1); i >= 0; i--) {
      const route = entradas[i].route;
      if (/^\/financeiro\/(?:titulos|contas-a-pagar|contas-a-receber)(?:[?#]|$)/.test(route)) return route;
    }
  }
  return tipo === 'PAGAR' ? '/financeiro/titulos?tipo=pagar'
    : tipo === 'RECEBER' ? '/financeiro/titulos?tipo=receber' : '/financeiro/titulos';
}
export default function useRetornoTitulos(tipo) {
  return caminhoRetornoTitulos(useWorkspace(), tipo);
}
