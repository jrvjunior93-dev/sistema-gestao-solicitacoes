import { useEffect, useRef } from 'react';
import { HiOutlinePlus, HiOutlineXMark } from 'react-icons/hi2';
import { MAX_WORKSPACE_TABS } from './useWorkspaceTabs';

export default function WorkspaceTabs({
  tabs,
  activeId,
  canOpen,
  onActivate,
  onClose,
  onNewTab
}) {
  const tabRefs = useRef(new Map());

  useEffect(() => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    tabRefs.current.get(activeId)?.scrollIntoView?.({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'nearest'
    });
  }, [activeId]);

  const handleKeyDown = (event, index, tabId) => {
    let nextIndex = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;

    if (nextIndex !== null) {
      event.preventDefault();
      const next = tabs[nextIndex];
      onActivate(next.id);
      requestAnimationFrame(() => tabRefs.current.get(next.id)?.focus());
      return;
    }

    if (event.key === 'Delete') {
      event.preventDefault();
      onClose(tabId);
    }
  };

  return (
    <div className="fx-workspace-tabs" aria-label="Abas abertas no sistema">
      <div className="fx-workspace-tabs-scroll" role="tablist" aria-label="Telas abertas">
        {tabs.map((tab, index) => {
          const active = tab.id === activeId;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                if (node) tabRefs.current.set(tab.id, node);
                else tabRefs.current.delete(tab.id);
              }}
              type="button"
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              className={`fx-workspace-tab ${active ? 'is-active' : ''}`}
              title={`${tab.title} — pressione Delete para fechar`}
              onClick={(event) => {
                if (event.target.closest('[data-workspace-tab-close]')) {
                  onClose(tab.id);
                  return;
                }
                onActivate(tab.id);
              }}
              onKeyDown={(event) => handleKeyDown(event, index, tab.id)}
            >
              <span className="fx-workspace-tab-label">{tab.title}</span>
              <span
                className="fx-workspace-tab-close"
                data-workspace-tab-close
                aria-hidden="true"
              >
                <HiOutlineXMark />
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className="fx-workspace-tab-new"
        onClick={onNewTab}
        disabled={!canOpen}
        title={canOpen
          ? 'Abrir nova aba interna (Ctrl+clique também abre links em uma nova aba)'
          : `Limite de ${MAX_WORKSPACE_TABS} abas atingido`}
        aria-label={canOpen ? 'Abrir nova aba interna' : `Limite de ${MAX_WORKSPACE_TABS} abas atingido`}
      >
        <HiOutlinePlus aria-hidden="true" />
      </button>
    </div>
  );
}
