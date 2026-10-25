import { useCallback, useEffect, useRef, useState } from 'react';
import { getFiscalDocuments } from '../services/fiscalApi';

const TAMANHO = 50;
// Uma consulta ativa por vez. Trocar filtros invalida a resposta antiga e
// guarda somente a consulta mais recente para depois. Sem rajada no banco.
export default function useDocumentosPaginados() {
  const [state, setState] = useState({ documents: [], total: 0, page: 1, pages: 1, loading: true, error: '' });
  const [numerada, setNumerada] = useState(true);
  const active = useRef(null), queued = useRef(null), revision = useRef(0), mounted = useRef(true);
  const applied = useRef({}), mode = useRef(true), last = useRef({ filters: {}, page: 1, append: false });
  const current = useRef(state); current.current = state;
  const fetchPage = useCallback((filters, page, append = false) => {
    if (!mounted.current) return Promise.resolve();
    const key = JSON.stringify([filters, page, append]);
    if (active.current) {
      if (append || (!queued.current && active.current.key === key)) return active.current.promise;
      revision.current++;
      queued.current?.resolve();
      setState(s => ({ ...s, loading: true, error: '', documents: [], total: 0, pages: 1 }));
      return new Promise(resolve => { queued.current = { filters, page, append, resolve }; });
    }
    const controller = new AbortController(), ticket = ++revision.current;
    const record = { controller, ticket, key };
    active.current = record; last.current = { filters, page, append };
    setState(s => ({ ...s, loading: true, error: '', ...(append ? {} : { documents: [], total: 0, pages: 1 }) }));
    record.promise = (async () => { try {
      const result = await getFiscalDocuments({ ...filters, page, limit: TAMANHO }, { signal: controller.signal });
      if (!mounted.current || ticket !== revision.current) return;
      const rows = result?.data || [], meta = result?.pagination;
      const total = Number(meta?.total ?? rows.length), pages = Math.max(1, Number(meta?.pages ?? 1));
      if (!Array.isArray(rows) || rows.length > TAMANHO || !Number.isSafeInteger(total) || total < 0 || !Number.isSafeInteger(pages)) throw Error('Resposta de paginação fiscal inválida');
      if (page > pages) { active.current = null; return fetchPage(filters, pages, false); }
      setState(s => {
        const seen = new Map((append ? s.documents : []).map(d => [String(d.id), d]));
        for (const row of rows) seen.set(String(row.id), row);
        return { documents: [...seen.values()], total, pages, page, loading: false, error: '' };
      });
    } catch (error) {
      if (!mounted.current || ticket !== revision.current || error.name === 'AbortError') return;
      setState(s => ({ ...s, loading: false, error: error.message || 'Erro ao buscar documentos fiscais' }));
    } finally {
      if (active.current?.ticket === ticket) active.current = null;
      if (mounted.current && queued.current) {
        const q = queued.current; queued.current = null;
        fetchPage(q.filters, q.page, q.append).finally(q.resolve);
      }
    } })();
    return record.promise;
  }, []);
  const load = useCallback((filters = applied.current) => {
    applied.current = { ...filters };
    return fetchPage(applied.current, 1);
  }, [fetchPage]);
  const next = useCallback(() => {
    const s = current.current;
    if (!s.loading && !s.error && s.page < s.pages) return fetchPage(applied.current, s.page + 1, !mode.current);
  }, [fetchPage]);
  const go = useCallback(page => {
    if (!active.current && Number.isInteger(page) && page >= 1 && page <= current.current.pages) return fetchPage(applied.current, page);
  }, [fetchPage]);
  const retry = useCallback(() => {
    if (!active.current) { const r = last.current; return fetchPage(r.filters, r.page, r.append); }
  }, [fetchPage]);
  const toggle = useCallback(() => {
    if (active.current) return;
    mode.current = !mode.current; setNumerada(mode.current);
    return fetchPage(applied.current, 1);
  }, [fetchPage]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; revision.current++; active.current?.controller.abort(); active.current = null; queued.current?.resolve(); queued.current = null; };
  }, []);
  return { ...state, numerada, load, next, go, retry, toggle };
}
