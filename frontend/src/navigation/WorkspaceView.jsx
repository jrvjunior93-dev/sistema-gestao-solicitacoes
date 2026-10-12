import { useContext, useLayoutEffect, useRef } from 'react';
import { UNSAFE_LocationContext, useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { WorkspacePageContext } from './WorkspaceContext';
import { recordIdentity } from './workspaceModel';
import { workspaceRouteFromLocation } from './useWorkspaceTabs';

export const isWorkspacePilot = pathname => pathname === '/nova-solicitacao'
  || pathname === '/compras/delegacao'
  || pathname === '/solicitacoes' || pathname === '/solicitacoes-arquivadas'
  || /^\/solicitacoes\/\d+\/?$/.test(pathname);

function useScroll(key, memory, root) {
  useLayoutEffect(() => {
    const saved = memory.get(key + '|scroll') || { x: 0, y: 0 };
    let restoring = true;
    const restore = () => {
      window.scrollTo({ left: saved.x, top: saved.y, behavior: 'instant' });
      if (document.documentElement.scrollHeight >= saved.y + window.innerHeight) restoring = false;
    };
    restore();
    const observer = new ResizeObserver(() => { if (restoring) restore(); });
    if (root.current) observer.observe(root.current);
    const stop = () => { restoring = false; };
    const save = () => { if (!restoring) memory.set(key + '|scroll', { x: window.scrollX, y: window.scrollY }); };
    window.addEventListener('scroll', save, { passive: true });
    window.addEventListener('wheel', stop, { passive: true });
    window.addEventListener('touchstart', stop, { passive: true });
    const timeout = setTimeout(stop, 3000);
    return () => {
      save(); clearTimeout(timeout); observer.disconnect();
      window.removeEventListener('scroll', save); window.removeEventListener('wheel', stop); window.removeEventListener('touchstart', stop);
    };
  }, [key, memory, root]);
}

// Excecao auditada: um unico formulario novo, sem polling/SSE nem gravacao
// automatica. Listas e detalhes desmontam normalmente e usam adapters leves.
export default function WorkspaceView({ workspace, memory, enabled = true }) {
  const navigate = useNavigate();
  const outlet = useOutlet();
  const location = useLocation();
  const locationContext = useContext(UNSAFE_LocationContext);
  const retained = useRef(null);
  const root = useRef(null);
  const previous = useRef(null);
  const tab = workspace.tabs.find(t => t.id === workspace.activeId);
  const route = workspaceRouteFromLocation(location);
  const pageKey = tab.id + '|' + recordIdentity(route);
  useLayoutEffect(() => {
    const prefixes = new Set(workspace.tabs.flatMap(t => (t.entries || [{ route: t.route }])
      .map(e => t.id + '|' + recordIdentity(e.route))));
    // Mesmo se a etapa saiu do historico, o unico formulario vivo nao perde
    // seus slots. Listas/consultas antigas sem trabalho podem ser liberadas.
    if (retained.current) prefixes.add(retained.current.key);
    memory.pruneCleanPages(prefixes);
  }, [workspace.tabs, memory]);
  const blocked = previous.current && previous.current.key !== pageKey
    && [...memory.busy].some(key => key.startsWith(previous.current.key + '|'));
  const visible = blocked ? previous.current : { tabId: tab.id, key: pageKey, route, outlet, locationContext };
  useLayoutEffect(() => {
    if (blocked) navigate(visible.route, { replace: true, state: visible.locationContext.location.state });
  }, [blocked, visible.route, navigate]);
  useScroll(visible.key, memory, root);
  if (retained.current && (!workspace.tabs.some(t => t.id === retained.current.tabId)
    || memory.get(retained.current.key + '|discarded'))) {
    memory.delete(retained.current.key + '|discarded');
    retained.current = null;
  }
  const nova = enabled && visible.route.split('?')[0] === '/nova-solicitacao';
  if (nova && !retained.current) {
    retained.current = visible;
  }
  const frame = (node, active, keep = false) => (
    <WorkspacePageContext.Provider key={node.key} value={{ key: node.key, tabId: node.tabId, route: node.route, active, snapshot: enabled && isWorkspacePilot(node.route.split('?')[0]), memory }}>
      <UNSAFE_LocationContext.Provider value={node.locationContext}>
        <div hidden={!active} inert={!active ? '' : undefined} data-workspace-page={node.key} data-retained={keep || undefined}>
          {node.outlet}
        </div>
      </UNSAFE_LocationContext.Provider>
    </WorkspacePageContext.Provider>
  );
  previous.current = visible;
  return <div ref={root}>
    {retained.current && frame(retained.current, nova && retained.current.key === visible.key, true)}
    {!nova && frame(visible, true)}
  </div>;
}
