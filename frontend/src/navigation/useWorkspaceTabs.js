import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { findActiveNode, resolveLabel } from './navigationConfig';

export const MAX_WORKSPACE_TABS = 12;

const STORAGE_VERSION = 1;
const STORAGE_PREFIX = 'fluxy_workspace_tabs_v1';
const FALLBACK_ORIGIN = 'https://fluxy.local';

function storageKey(userId) {
  return `${STORAGE_PREFIX}:${Number(userId) || 'anonimo'}`;
}

function newTabId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function normalizeWorkspaceRoute(value) {
  const raw = String(value || '').trim();
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;

  try {
    const url = new URL(raw, FALLBACK_ORIGIN);
    if (url.origin !== FALLBACK_ORIGIN) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function workspaceRouteFromLocation(location) {
  return normalizeWorkspaceRoute(
    `${location?.pathname || '/'}${location?.search || ''}${location?.hash || ''}`
  ) || '/';
}

function cleanTitle(value, fallback = 'Tela') {
  const title = String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return title || fallback;
}

export function resolveWorkspaceTitle(user, route, preferredTitle = '') {
  if (preferredTitle) return cleanTitle(preferredTitle);

  const url = new URL(normalizeWorkspaceRoute(route) || '/', FALLBACK_ORIGIN);
  if (url.pathname === '/') return 'Início';

  const active = findActiveNode(user, url.pathname, url.search);
  if (active?.item) return cleanTitle(resolveLabel(active.item, user));

  const lastSegment = decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1) || 'Tela');
  return cleanTitle(lastSegment.replace(/[-_]+/g, ' '));
}

function sanitizeStoredTab(tab) {
  const route = normalizeWorkspaceRoute(tab?.route);
  if (!route) return null;
  return {
    id: cleanTitle(tab?.id, newTabId()),
    route,
    title: cleanTitle(tab?.title),
    preferredTitle: Boolean(tab?.preferredTitle)
  };
}

function loadStoredState(userId) {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(storageKey(userId)) || 'null');
    if (parsed?.version !== STORAGE_VERSION || !Array.isArray(parsed.tabs)) return null;
    const tabs = parsed.tabs
      .map(sanitizeStoredTab)
      .filter(Boolean)
      .slice(0, MAX_WORKSPACE_TABS);
    if (tabs.length === 0) return null;
    return {
      tabs,
      activeId: tabs.some((tab) => tab.id === parsed.activeId) ? parsed.activeId : tabs[0].id
    };
  } catch {
    return null;
  }
}

function initialState(user, route) {
  const stored = loadStoredState(user?.id);
  if (!stored) {
    const tab = {
      id: newTabId(),
      route,
      title: resolveWorkspaceTitle(user, route),
      preferredTitle: false
    };
    return { tabs: [tab], activeId: tab.id };
  }

  const existing = stored.tabs.find((tab) => tab.route === route);
  if (existing) return { ...stored, activeId: existing.id };

  const tab = {
    id: newTabId(),
    route,
    title: resolveWorkspaceTitle(user, route),
    preferredTitle: false
  };
  if (stored.tabs.length < MAX_WORKSPACE_TABS) {
    return { tabs: [...stored.tabs, tab], activeId: tab.id };
  }

  const activeIndex = Math.max(0, stored.tabs.findIndex((item) => item.id === stored.activeId));
  const tabs = stored.tabs.map((item, index) => (index === activeIndex ? tab : item));
  return { tabs, activeId: tab.id };
}

export function routeFromInternalAnchor(anchor) {
  if (!anchor || anchor.hasAttribute('download')) return null;
  const href = String(anchor.getAttribute('href') || '').trim();
  if (!href || href.startsWith('#')) return null;

  try {
    const base = typeof window !== 'undefined' ? window.location.origin : FALLBACK_ORIGIN;
    const url = new URL(href, base);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== base) return null;

    // Anexos, endpoints e o portal público do fornecedor não são telas do
    // workspace autenticado. Mesmo hospedados na mesma origem, continuam
    // abrindo no navegador para preservar download, preview e sessão pública.
    if (/^\/(?:api|uploads|anexos)(?:\/|$)/i.test(url.pathname)) return null;
    if (/^\/cotacao\/[^/]+\/?$/i.test(url.pathname)) return null;
    if (/\.(?:pdf|csv|xlsx?|docx?|png|jpe?g|gif|webp|svg|zip)(?:$|[?#])/i.test(url.pathname)) return null;

    return normalizeWorkspaceRoute(`${url.pathname}${url.search}${url.hash}`);
  } catch {
    return null;
  }
}

export default function useWorkspaceTabs(user) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentRoute = useMemo(() => workspaceRouteFromLocation(location), [location]);
  const [state, setState] = useState(() => initialState(user, currentRoute));

  // Navegações normais atualizam a aba ativa. Se o destino já estiver aberto,
  // apenas ativa a aba existente para não criar duas cópias acidentais.
  useEffect(() => {
    setState((current) => {
      const existing = current.tabs.find((tab) => tab.route === currentRoute);
      if (existing) {
        if (existing.id === current.activeId) return current;
        return { ...current, activeId: existing.id };
      }

      const activeIndex = current.tabs.findIndex((tab) => tab.id === current.activeId);
      const targetIndex = activeIndex >= 0 ? activeIndex : 0;
      const tabs = current.tabs.map((tab, index) => (
        index === targetIndex
          ? {
              ...tab,
              route: currentRoute,
              title: resolveWorkspaceTitle(user, currentRoute),
              preferredTitle: false
            }
          : tab
      ));
      return { tabs, activeId: tabs[targetIndex]?.id || current.activeId };
    });
  }, [currentRoute, user]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(storageKey(user?.id), JSON.stringify({
        version: STORAGE_VERSION,
        tabs: state.tabs,
        activeId: state.activeId
      }));
    } catch {
      // Ambientes corporativos podem bloquear storage; as abas continuam
      // funcionando durante a renderização atual.
    }
  }, [state, user?.id]);

  const activateTab = useCallback((tabId) => {
    const tab = state.tabs.find((item) => item.id === tabId);
    if (!tab) return false;
    setState((current) => ({ ...current, activeId: tab.id }));
    if (tab.route !== currentRoute) navigate(tab.route);
    return true;
  }, [currentRoute, navigate, state.tabs]);

  const openTab = useCallback((route, preferredTitle = '') => {
    const normalized = normalizeWorkspaceRoute(route);
    if (!normalized) return false;

    const existing = state.tabs.find((tab) => tab.route === normalized);
    if (existing) {
      setState((current) => ({ ...current, activeId: existing.id }));
      if (normalized !== currentRoute) navigate(normalized);
      return true;
    }

    if (state.tabs.length >= MAX_WORKSPACE_TABS) return false;
    const tab = {
      id: newTabId(),
      route: normalized,
      title: resolveWorkspaceTitle(user, normalized, preferredTitle),
      preferredTitle: Boolean(preferredTitle)
    };
    setState((current) => ({ tabs: [...current.tabs, tab], activeId: tab.id }));
    if (normalized !== currentRoute) navigate(normalized);
    return true;
  }, [currentRoute, navigate, state.tabs, user]);

  const closeTab = useCallback((tabId) => {
    const index = state.tabs.findIndex((tab) => tab.id === tabId);
    if (index < 0) return false;

    if (state.tabs.length === 1) {
      const home = {
        ...state.tabs[0],
        route: '/',
        title: 'Início',
        preferredTitle: false
      };
      setState({ tabs: [home], activeId: home.id });
      if (currentRoute !== '/') navigate('/');
      return true;
    }

    const tabs = state.tabs.filter((tab) => tab.id !== tabId);
    if (state.activeId !== tabId) {
      setState((current) => ({ ...current, tabs }));
      return true;
    }

    const nextTab = tabs[Math.min(index, tabs.length - 1)];
    setState({ tabs, activeId: nextTab.id });
    if (nextTab.route !== currentRoute) navigate(nextTab.route);
    return true;
  }, [currentRoute, navigate, state.activeId, state.tabs]);

  return {
    tabs: state.tabs,
    activeId: state.activeId,
    canOpen: state.tabs.length < MAX_WORKSPACE_TABS,
    activateTab,
    openTab,
    closeTab
  };
}
