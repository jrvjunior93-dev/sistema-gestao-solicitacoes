import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from './WorkspaceContext';

// Intencao explicita das listas aderidas. Portais publicos/downloads e
// etapas de formulario nao passam por esta fachada.
export default function useWorkspaceOpenRecord(onLimit) {
  const workspace = useWorkspace();
  const navigate = useNavigate();
  return useCallback((route, title = '') => {
    if (!workspace) { navigate(route); return true; }
    const opened = workspace.openTab(route, title);
    if (!opened && !workspace.canOpen) {
      onLimit?.('Limite de 12 abas atingido. Feche uma aba para abrir outra.');
    }
    return opened;
  }, [workspace, navigate, onLimit]);
}
