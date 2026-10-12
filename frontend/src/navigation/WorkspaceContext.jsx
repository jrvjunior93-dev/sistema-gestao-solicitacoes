import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';

export const WorkspaceContext = createContext(null);
export const WorkspacePageContext = createContext(null);
export const useWorkspace = () => useContext(WorkspaceContext);
export const useWorkspaceActive = () => useContext(WorkspacePageContext)?.active !== false;
const slotKey = (page, name) => page.key + '|' + encodeURIComponent(String(name));
export function useWorkspaceRestored(name) {
  const page = useContext(WorkspacePageContext);
  return useRef(Boolean(page?.snapshot && page.memory.has(slotKey(page, name)))).current;
}

// Memoria da sessao, nao localStorage: dados pessoais e File nao vao para disco.
export function createWorkspaceMemory() {
  const values = new Map();
  const dirty = new Set();
  const busy = new Set();
  const flows = new Map();
  return {
    get: key => values.get(key),
    delete: key => values.delete(key),
    has: key => values.has(key),
    set: (key, value) => values.set(key, value),
    dirty, busy,
    hasFlow: key => flows.has(key),
    getFlow(key, tabId) {
      const flow = flows.get(key);
      if (flow && tabId) flow.tabs.add(tabId);
      return flow?.value;
    },
    setFlow(key, value, tabId) {
      const tabs = flows.get(key)?.tabs || new Set();
      if (tabId) tabs.add(tabId);
      flows.set(key, { value, tabs });
    },
    clearFlow(key) {
      flows.delete(key);
      // Limpar somente paginas que registraram este fluxo, nao outras abas.
      for (const [slot, value] of values) {
        if (slot.endsWith('|flow') && value === key) {
          this.clearPage(slot.slice(0, -5));
        }
      }
    },
    deleteTab(tabId) {
      for (const key of values.keys()) if (key.startsWith(tabId + '|')) values.delete(key);
      for (const key of dirty) if (key.startsWith(tabId + '|')) dirty.delete(key);
      for (const key of busy) if (key.startsWith(tabId + '|')) busy.delete(key);
      for (const [key, flow] of flows) {
        flow.tabs.delete(tabId);
        if (!flow.tabs.size) flows.delete(key);
      }
    },
    clearPage(prefix) {
      for (const key of values.keys()) if (key.startsWith(prefix + '|')) values.delete(key);
      for (const key of dirty) if (key.startsWith(prefix + '|')) dirty.delete(key);
      for (const key of busy) if (key.startsWith(prefix + '|')) busy.delete(key);
      values.set(prefix + '|discarded', true);
    },
    pruneCleanPages(prefixes) {
      // Somente historico ja descartado, sem rascunho/operacao. Trabalho
      // pendente e preservado mesmo fora das 64 etapas; nunca e expulso.
      const protectedPages = new Set([...dirty, ...busy].map(key => key.slice(0, key.lastIndexOf('|'))));
      for (const key of values.keys()) {
        const page = key.slice(0, key.lastIndexOf('|'));
        if (!prefixes.has(page) && !protectedPages.has(page)) values.delete(key);
      }
    },
    stats: () => ({ slots: values.size, dirty: dirty.size, busy: busy.size, flows: flows.size })
  };
}

// Adapter opt-in. Sem Provider, o componente conserva exatamente useState.
export function useWorkspaceState(name, initial) {
  const page = useContext(WorkspacePageContext);
  const key = page?.snapshot && name != null ? slotKey(page, name) : null;
  const [value, setValue] = useState(() => {
    if (key && page.memory.has(key)) return page.memory.get(key);
    const value = typeof initial === 'function' ? initial() : initial;
    if (key) page.memory.set(key, value);
    return value;
  });
  const ref = useRef(value);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const setter = useCallback(update => {
    if (!mounted.current) return;
    const next = typeof update === 'function' ? update(ref.current) : update;
    ref.current = next;
    if (key) page.memory.set(key, next);
    setValue(next);
  }, [key, page?.memory]);
  return [value, setter];
}

export function useWorkspaceWork(dirty, busy = false, name = 'work') {
  const page = useContext(WorkspacePageContext);
  const key = page ? slotKey(page, name) : null;
  useLayoutEffect(() => {
    if (!page?.snapshot) return;
    if (dirty) page.memory.dirty.add(key); else page.memory.dirty.delete(key);
    if (busy) page.memory.busy.add(key); else page.memory.busy.delete(key);
    // dirty pertence ao snapshot, nao ao tempo de montagem. Busy nunca e restaurado.
    return () => { page.memory.busy.delete(key); };
  }, [key, page?.memory, dirty, busy]);
}

export function useWorkspaceTitle(title) {
  const page = useContext(WorkspacePageContext);
  const workspace = useWorkspace();
  useEffect(() => {
    if (page?.active && title) workspace?.renameTab?.(page.tabId, title, page.route);
  }, [page?.active, page?.tabId, page?.route, title, workspace?.renameTab]);
}

export function useWorkspaceClearPage() {
  const page = useContext(WorkspacePageContext);
  return useCallback(() => { if (page) page.memory.clearPage(page.key); }, [page?.key, page?.memory]);
}

export function useWorkspaceEdicaoSolicitacao() {
  const [value, set] = useWorkspaceState('edicao:modal', null);
  const setter = useCallback(data => {
    if (!data) { set(null); return; }
    const s = data.solicitacao;
    // O alvo nao substitui uma resposta autorizada do servidor. Valores,
    // vencimentos e permissoes sao lidos novamente antes de mostrar o modal.
    set({ campo: data.campo, solicitacao: { id: s.id } });
  }, [set]);
  return [value, setter];
}

export function useWorkspaceForget(names) {
  const page = useContext(WorkspacePageContext);
  return () => {
    if (!page) return;
    names.forEach(name => {
      const key = slotKey(page, name);
      page.memory.delete(key); page.memory.dirty.delete(key); page.memory.busy.delete(key);
    });
  };
}

export function useWorkspaceScroll(ref, name, ready = true) {
  const page = useContext(WorkspacePageContext);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!ready || !page?.snapshot || !el) return;
    const key = page.key + '|scroll:' + name;
    const saved = page.memory.get(key) || { left: 0, top: 0 };
    let restoring = true;
    const restore = () => {
      el.scrollLeft = saved.left; el.scrollTop = saved.top;
      if (el.scrollLeft === saved.left && el.scrollTop === saved.top) restoring = false;
    };
    restore();
    const resize = new ResizeObserver(() => { if (restoring) restore(); });
    if (el.firstElementChild) resize.observe(el.firstElementChild);
    const stop = () => { restoring = false; };
    const save = () => { if (!restoring) page.memory.set(key, { left: el.scrollLeft, top: el.scrollTop }); };
    el.addEventListener('scroll', save, { passive: true });
    el.addEventListener('pointerdown', stop, { passive: true });
    const timer = setTimeout(stop, 3000);
    return () => { save(); clearTimeout(timer); resize.disconnect(); el.removeEventListener('scroll', save); el.removeEventListener('pointerdown', stop); };
  }, [page?.key, page?.memory, ref, name, ready]);
}
