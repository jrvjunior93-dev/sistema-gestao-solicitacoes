import { useEffect } from 'react';
import { useWorkspaceState } from '../../../navigation/WorkspaceContext';
import useWorkspaceRecordDraft from '../../../navigation/useWorkspaceRecordDraft';

// Catalogos simples: o chamador projeta somente seus campos editaveis.
// Nenhum registro/ACL volta da memoria; o alvo existe apenas na lista relida.
export default function useComprasCadastroWorkspace(name, rows, ready, initial, project) {
  const [editingId, setEditingId] = useWorkspaceState(name + ':id', null);
  const draft = useWorkspaceRecordDraft(name + ':inputs', initial);
  const item = rows.find(row => String(row.id) === String(editingId));
  const revision = row => JSON.stringify([row?.id || 'novo', row?.updatedAt, row?.updated_at, row ? project(row) : initial]);
  useEffect(() => {
    if (!ready || (editingId != null && !item)) { draft.conceal(initial); return; }
    draft.hydrate(item ? project(item) : initial, revision(item));
  }, [ready, editingId, item, initial, project, draft.hydrate, draft.conceal]);
  const open = row => {
    draft.hydrate(project(row), revision(row), { discard: true });
    setEditingId(row.id);
  };
  const clear = () => {
    draft.hydrate(initial, revision(null), { discard: true });
    setEditingId(null);
  };
  return { ...draft, editingId, item, open, clear,
    available: ready && (editingId == null || Boolean(item)) };
}
