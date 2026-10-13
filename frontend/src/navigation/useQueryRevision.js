import { useCallback, useLayoutEffect, useRef } from 'react';

// Apenas ciclo de vida da consulta. Nao guarda DTO nem modifica o escopo
// enviado ao servidor; respostas de outra consulta/desmontagem sao ignoradas.
export default function useQueryRevision(identity = '') {
  const revision = useRef(0);
  useLayoutEffect(() => {
    revision.current += 1;
    return () => { revision.current += 1; };
  }, [identity]);
  const begin = useCallback(() => ++revision.current, []);
  const isCurrent = useCallback(token => token === revision.current, []);
  const capture = useCallback(() => revision.current, []);
  return { begin, isCurrent, capture };
}
