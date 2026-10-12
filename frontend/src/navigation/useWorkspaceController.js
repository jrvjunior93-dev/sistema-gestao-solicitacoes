import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { MAX_WORKSPACE_TABS, normalizeWorkspaceRoute, resolveWorkspaceTitle, workspaceRouteFromLocation } from './useWorkspaceTabs';
import { completedNewKey, makeEntry, makeTab, markerKey, moveTab, positionTab, recordIdentity, scrollCaptureEvent, workspaceAccessIdentity } from './workspaceModel';

const storageKey = id => `fluxy_workspace_tabs_v1:${Number(id) || 'anonimo'}`;
function replaceStage(active, route, type, state) {
  const same = recordIdentity(active.route) === recordIdentity(route);
  // Um replace legado para consulta nao pode tornar o formulario retido
  // inacessivel. Somente sucesso explicito remove a etapa de criacao.
  const preserveNew = recordIdentity(active.route) === '/nova-solicitacao'
    && !same && !state?.[completedNewKey];
  return same || (type === 'REPLACE' && !preserveNew);
}
function findNewRequest(tabs, route) {
  if (recordIdentity(route) !== '/nova-solicitacao') return null;
  for (const tab of tabs) {
    const cursor = tab.entries.findLastIndex(e => recordIdentity(e.route) === '/nova-solicitacao');
    if (cursor >= 0) {
      const restored = positionTab(tab, cursor);
      return restored.route === route ? restored : moveTab(restored, { ...restored.entries[cursor], route }, true);
    }
  }
  return null;
}
function load(user, route) {
  let tabs = [];
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(storageKey(user?.id)) || 'null');
    tabs = (saved?.tabs || []).slice(0, MAX_WORKSPACE_TABS).flatMap(old => {
      const route = normalizeWorkspaceRoute(old.route);
      if (!route || !old.id) return [];
      const entries = Array.isArray(old.entries) ? old.entries.slice(-64).flatMap(e => {
        const route = normalizeWorkspaceRoute(e.route);
        return route && e.id ? [{ id: String(e.id), route, title: resolveWorkspaceTitle(user, route), preferredTitle: false }] : [];
      }) : [];
      const tab = makeTab(makeEntry(route, resolveWorkspaceTitle(user, route)));
      return [entries.length ? positionTab({ ...tab, id: String(old.id), entries }, Math.max(0, Math.min(Number(old.cursor) || 0, entries.length - 1)))
        : { ...tab, id: String(old.id) }];
    });
  } catch { /* Storage indisponivel nao impede navegar. */ }
  let active = tabs.find(t => recordIdentity(t.route) === recordIdentity(route));
  if (!active) {
    active = makeTab(makeEntry(route, resolveWorkspaceTitle(user, route)));
    // URL inicial desconhecida no limite entra como etapa, nao expulsa aba.
    if (tabs.length >= MAX_WORKSPACE_TABS) {
      active = moveTab(tabs[0], makeEntry(route, resolveWorkspaceTitle(user, route)));
      tabs[0] = active;
    } else tabs.push(active);
  }
  return { owner: user?.id, scope: workspaceAccessIdentity(user), tabs, activeId: active.id };
}

export default function useWorkspaceController(user) {
  const location = useLocation();
  const navigate = useNavigate();
  const type = useNavigationType();
  const route = workspaceRouteFromLocation(location);
  const [state, setState] = useState(() => load(user, route));
  const ref = useRef(state);
  const rendered = useRef(state);
  const pending = useRef(null);
  const locationRef = useRef(location);
  const userRef = useRef(user); userRef.current = user;
  // Mudanca de usuario efetivo nao deixa uma renderizacao usar o workspace antigo.
  if (state.scope !== workspaceAccessIdentity(user)) {
    const next = load(user, route); setState(next);
  }
  const update = useCallback(fn => {
    const next = fn(ref.current);
    ref.current = next; setState(next);
    return next;
  }, []);
  const go = useCallback((tab, replace = true) => {
    // Captura o ultimo scroll antes de o novo DOM reduzir a altura da pagina.
    // Nao depende de esperar o evento assincrono de scroll para abrir a aba.
    window.dispatchEvent(new Event(scrollCaptureEvent));
    // BrowserRouter usa startTransition: o update local pode chegar antes
    // da URL. Nao reconciliar a URL antiga sobre a aba recem-aberta, nem
    // montar um Outlet antigo no namespace do destino durante esse intervalo.
    pending.current = { fromKey: locationRef.current.key, previous: rendered.current };
    navigate(tab.route, { replace, state: { [markerKey]: { owner: userRef.current?.id, tabId: tab.id, entryId: tab.entries[tab.cursor].id } } });
  }, [navigate]);

  const waitingForRoute = state.scope === workspaceAccessIdentity(user)
    && pending.current?.fromKey === location.key;

  // Resolver identidade ANTES de montar o Outlet. Um efeito tardio montaria
  // a pagina nova por um frame no namespace da aba/registro anterior.
  if (!waitingForRoute) {
    const current = state;
    const mark = location.state?.[markerKey];
    const marked = mark?.owner === user?.id && current.tabs.find(t => t.id === mark.tabId);
    const cursor = marked ? marked.entries.findIndex(e => e.id === mark.entryId && e.route === route) : -1;
    let next = current;
    if (marked && cursor >= 0) {
      if (marked.id !== current.activeId || marked.cursor !== cursor) {
        next = { ...current, activeId: marked.id, tabs: current.tabs.map(t => t.id === marked.id ? positionTab(t, cursor) : t) };
      }
    } else {
      const active = current.tabs.find(t => t.id === current.activeId);
      const restoredNew = findNewRequest(current.tabs, route);
      const existing = restoredNew || current.tabs.find(t => recordIdentity(t.route) === recordIdentity(route));
      if (existing && (existing.id !== active.id || existing.route !== active.route || existing.cursor !== active.cursor)) {
        next = { ...current, activeId: existing.id, tabs: current.tabs.map(t => t.id === existing.id ? existing : t) };
      }
      else if (active.route !== route) {
        const changed = moveTab(active, makeEntry(route, resolveWorkspaceTitle(user, route)), replaceStage(active, route, type, location.state));
        next = { ...current, tabs: current.tabs.map(t => t.id === active.id ? changed : t) };
      }
    }
    if (next !== current) setState(next);
  }

  useEffect(() => {
    // Um efeito de um commit anterior tambem pode executar depois do clique.
    if (locationRef.current.key !== location.key || pending.current?.fromKey === location.key) return;
    const mark = location.state?.[markerKey];
    const current = ref.current;
    let next = current;
    let tagged = false;
    if (mark?.owner === user?.id) {
      const tab = current.tabs.find(t => t.id === mark.tabId);
      const cursor = tab?.entries.findIndex(e => e.id === mark.entryId && e.route === route);
      if (tab && cursor >= 0) {
        tagged = true;
        if (current.activeId !== tab.id || tab.cursor !== cursor) {
          next = { ...current, activeId: tab.id, tabs: current.tabs.map(t => t.id === tab.id ? positionTab(t, cursor) : t) };
        }
      }
    }
    if (!tagged) {
      const active = current.tabs.find(t => t.id === current.activeId);
      const existing = current.tabs.find(t => recordIdentity(t.route) === recordIdentity(route));
      if (existing && existing.id !== active?.id) next = { ...current, activeId: existing.id };
      else if (active?.route !== route) {
        const changed = moveTab(active, makeEntry(route, resolveWorkspaceTitle(user, route)), replaceStage(active, route, type, location.state));
        next = { ...current, tabs: current.tabs.map(t => t.id === active.id ? changed : t) };
      }
    }
    if (next !== current) update(() => next);
    // Marca tambem links/navigate legados para POP conhecer a aba e a etapa.
    if (!tagged) {
      const tab = next.tabs.find(t => t.id === next.activeId);
      navigate(route, { replace: true, state: { ...location.state, [markerKey]: { owner: user?.id, tabId: tab.id, entryId: tab.entries[tab.cursor].id } } });
    }
  }, [route, location.key, type, user?.id, navigate, update]);

  useEffect(() => {
    try { window.sessionStorage.setItem(storageKey(state.owner), JSON.stringify({ version: 2, tabs: state.tabs, activeId: state.activeId })); }
    catch { /* Somente metadados, nunca campos ou binarios. */ }
  }, [state]);

  const activateTab = useCallback(id => {
    const tab = ref.current.tabs.find(t => t.id === id);
    if (!tab) return false;
    if (ref.current.activeId === id && workspaceRouteFromLocation(locationRef.current) === tab.route) return true;
    update(s => ({ ...s, activeId: id })); go(tab, false); return true;
  }, [go, update]);
  const openTab = useCallback((value, title = '') => {
    const route = normalizeWorkspaceRoute(value);
    if (!route) return false;
    const current = ref.current;
    const restoredNew = findNewRequest(current.tabs, route);
    if (restoredNew) {
      update(s => ({ ...s, activeId: restoredNew.id, tabs: s.tabs.map(t => t.id === restoredNew.id ? restoredNew : t) }));
      go(restoredNew, false); return true;
    }
    const existing = current.tabs.find(t => recordIdentity(t.route) === recordIdentity(route));
    if (existing) {
      if (existing.route === route) return activateTab(existing.id);
      const changed = moveTab(existing, { ...existing.entries[existing.cursor], route }, true);
      update(s => ({ ...s, activeId: existing.id, tabs: s.tabs.map(t => t.id === existing.id ? changed : t) }));
      go(changed, false); return true;
    }
    if (current.tabs.length >= MAX_WORKSPACE_TABS) return false;
    const active = current.tabs.find(t => t.id === current.activeId);
    const tab = makeTab(makeEntry(route, resolveWorkspaceTitle(userRef.current, route, title), Boolean(title)),
      { tabId: active.id, entryId: active.entries[active.cursor].id });
    update(s => ({ ...s, tabs: [...s.tabs, tab], activeId: tab.id }));
    go(tab, false); return true;
  }, [activateTab, go, update]);
  const closeTab = useCallback(id => {
    const current = ref.current;
    const index = current.tabs.findIndex(t => t.id === id);
    if (index < 0) return false;
    const tabs = current.tabs.filter(t => t.id !== id);
    if (!tabs.length) tabs.push(makeTab(makeEntry('/', 'Início')));
    const activeId = current.activeId === id ? tabs[Math.min(index, tabs.length - 1)].id : current.activeId;
    update(s => ({ ...s, tabs, activeId }));
    if (current.activeId === id) go(tabs.find(t => t.id === activeId));
    return true;
  }, [go, update]);
  const back = useCallback((fallback = '/') => {
    const current = ref.current;
    const tab = current.tabs.find(t => t.id === current.activeId);
    if (tab.cursor > 0) {
      const changed = positionTab(tab, tab.cursor - 1);
      update(s => ({ ...s, tabs: s.tabs.map(t => t.id === tab.id ? changed : t) })); go(changed); return;
    }
    const origin = current.tabs.find(t => t.id === tab.origin?.tabId);
    const cursor = origin?.entries.findIndex(e => e.id === tab.origin.entryId);
    if (origin && cursor >= 0) {
      const changed = positionTab(origin, cursor);
      update(s => ({ ...s, activeId: origin.id, tabs: s.tabs.map(t => t.id === origin.id ? changed : t) })); go(changed); return;
    }
    navigate(fallback, { replace: true });
  }, [go, navigate, update]);
  const renameTab = useCallback((id, title, expectedRoute) => {
    const clean = String(title || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const current = ref.current;
    const tab = current.tabs.find(t => t.id === id);
    if (!clean || !tab || tab.route !== expectedRoute || tab.title === clean) return;
    const entries = tab.entries.map((e, i) => i === tab.cursor ? { ...e, title: clean, preferredTitle: true } : e);
    update(s => ({ ...s, tabs: s.tabs.map(t => t.id === id ? positionTab({ ...t, entries }, tab.cursor) : t) }));
  }, [update]);
  const visibleState = waitingForRoute ? pending.current.previous : state;
  // Refs de navegacao so recebem renders confirmados. Uma tentativa de
  // render concorrente/suspensa nao pode modificar o workspace do usuario.
  useLayoutEffect(() => {
    ref.current = state;
    locationRef.current = location;
    if (!waitingForRoute) { rendered.current = state; pending.current = null; }
  }, [state, location, waitingForRoute]);
  return useMemo(() => ({ tabs: visibleState.tabs, activeId: visibleState.activeId, canOpen: visibleState.tabs.length < MAX_WORKSPACE_TABS,
    activateTab, openTab, closeTab, back, renameTab }), [visibleState, activateTab, openTab, closeTab, back, renameTab]);
}
