import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { listarPaginaSolicitacoesCompra } from '../../../services/compras';
import { useWorkspaceState } from '../../../navigation/WorkspaceContext';

export default function useSolicitacoesCompraPaginadas({ obraId, busca, statuses, scopeKey }) {
  const filters = JSON.stringify([scopeKey, obraId, String(busca || '').trim(), [...statuses].sort()]);
  const [position, setPosition] = useWorkspaceState('compras:paginacao', { filters, page: 1 });
  const page = position?.filters === filters && Number.isInteger(position.page) && position.page > 0 ? position.page : 1;
  const identity = JSON.stringify([filters, page]);
  const params = useMemo(() => ({ page, limit: 50, visao: 'resumo', q: String(busca || '').trim(), status: [...statuses].sort().join(','), ...(obraId ? { obra_id: obraId } : {}) }), [identity]);
  const [state, setState] = useState({ data: [], pagination: { page: 1, pages: 1, total: 0, limit: 50 }, statuses: [], loading: true, error: null });
  const sequence = useRef(0), flight = useRef(null), current = useRef(identity), timer = useRef(null), alive = useRef(true);
  useLayoutEffect(() => {
    alive.current = true;
    current.current = identity; sequence.current += 1;
    flight.current?.controller.abort(); window.clearTimeout(timer.current);
    setState({ data: [], pagination: { page, pages: 1, total: 0, limit: 50 }, statuses: [], loading: true, error: null });
    if (position?.filters !== filters) setPosition({ filters, page: 1 });
    return () => { sequence.current += 1; flight.current?.controller.abort(); window.clearTimeout(timer.current); };
  }, [identity]);
  useEffect(() => () => { alive.current = false; sequence.current += 1; flight.current?.controller.abort(); window.clearTimeout(timer.current); }, []);

  const refresh = useCallback(() => {
    window.clearTimeout(timer.current);
    if (current.current !== identity || !alive.current) return Promise.resolve();
    if (flight.current?.identity === identity && !flight.current.controller.signal.aborted) return flight.current.promise;
    const revision = ++sequence.current, previous = flight.current;
    previous?.controller.abort();
    const controller = new AbortController();
    const task = { identity, controller, promise: null };
    const valid = () => alive.current && revision === sequence.current && identity === current.current && !controller.signal.aborted;
    // A nova consulta so comeca quando a anterior foi encerrada/cancelada.
    task.promise = (async () => {
      if (previous) await previous.promise.catch(() => {});
      if (!valid()) return;
      setState(s => ({ ...s, loading: true, error: null }));
      try {
        const result = await listarPaginaSolicitacoesCompra(params, { signal: controller.signal });
        if (!valid()) return;
        setState({ data: result.data, pagination: result.pagination, statuses: result.filters?.statuses || [], loading: false, error: null });
      } catch (error) {
        if (!valid()) return;
        setState(s => ({ ...s, data: [], loading: false, error }));
      } finally { if (flight.current === task) flight.current = null; }
    })();
    flight.current = task;
    return task.promise;
  }, [identity, params]);

  useEffect(() => {
    timer.current = window.setTimeout(() => refresh(), busca ? 300 : 0);
    return () => window.clearTimeout(timer.current);
  }, [refresh]);
  const changePage = useCallback(next => {
    if (Number.isInteger(next) && next > 0) setPosition({ filters, page: next });
  }, [filters, setPosition]);
  return { ...state, identity, refresh, changePage };
}
