import { useCallback, useRef, useState } from 'react';
import { useWorkspaceState } from './WorkspaceContext';

function sameInput(a, b) {
  if (Object.is(a, b)) return true;
  // Arquivos ficam apenas em memoria: nao serializar conteudo nem perder a
  // troca de um File por outro (JSON.stringify(File) seria sempre {}).
  if (typeof Blob !== 'undefined' && (a instanceof Blob || b instanceof Blob)) return false;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && sameInput(a[key], b[key]));
}

// O chamador fornece exclusivamente o formulario de inputs (nao o DTO).
// Guarda apenas campos diferentes da base; hidratar e sempre uma leitura
// autorizada nova. Restaurar nunca salva e conflitos nunca sao mesclados
// silenciosamente com uma revisao diferente.
export default function useWorkspaceRecordDraft(name, initial = null) {
  const [draft, store] = useWorkspaceState(name, null);
  const [value, render] = useState(initial);
  const [revision, setRevision] = useState(null);
  const current = useRef(value);
  const base = useRef(initial);
  const draftRef = useRef(draft);
  const revisionRef = useRef(null);
  draftRef.current = draft;
  const setValue = useCallback(update => {
    const next = typeof update === 'function' ? update(current.current) : update;
    current.current = next;
    render(next);
    if (!base.current || !revisionRef.current || !next) return;
    const fields = Object.fromEntries(Object.keys(base.current)
      .filter(key => !sameInput(next[key], base.current[key]))
      .map(key => [key, next[key]]));
    const saved = Object.keys(fields).length
      ? { revision: draftRef.current?.revision || revisionRef.current, fields } : null;
    draftRef.current = saved; store(saved);
  }, [store]);
  const hydrate = useCallback((fresh, freshRevision, { discard = false } = {}) => {
    base.current = fresh; revisionRef.current = freshRevision; setRevision(freshRevision);
    if (discard) { draftRef.current = null; store(null); }
    const fields = Object.fromEntries(Object.entries(draftRef.current?.fields || {})
      .filter(([key]) => Object.hasOwn(fresh, key)));
    current.current = { ...fresh, ...fields };
    render(current.current);
    return current.current;
  }, [store]);
  const discard = useCallback(() => {
    draftRef.current = null; store(null); current.current = base.current; render(base.current);
  }, [store]);
  const conceal = useCallback((fallback = null) => {
    current.current = fallback; base.current = null; revisionRef.current = null;
    setRevision(null); render(fallback);
  }, []);
  return { value, setValue, hydrate, discard, conceal, dirty: Boolean(draft),
    conflict: Boolean(draft && revision && draft.revision !== revision) };
}
