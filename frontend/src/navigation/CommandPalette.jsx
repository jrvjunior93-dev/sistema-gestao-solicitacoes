import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';
import { getVisibleItems } from './navigationConfig';
import { buscarUniversal } from '../services/busca';
import { HiOutlineMagnifyingGlass, HiOutlineArrowRight } from 'react-icons/hi2';

function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function pareceCodigo(q) {
  return /\d/.test(q) || /^[a-z]{2,4}-/i.test(q);
}

// Destaca o trecho que casou (insensível a caixa e acento), preservando
// o texto original na tela.
function Realce({ texto, termo }) {
  const original = String(texto || '');
  const alvo = normalizar(original);
  const q = normalizar(termo).trim();
  if (!q) return original;
  const inicio = alvo.indexOf(q);
  if (inicio < 0) return original;
  return (
    <>
      {original.slice(0, inicio)}
      <mark>{original.slice(inicio, inicio + q.length)}</mark>
      {original.slice(inicio + q.length)}
    </>
  );
}

// BUSCA UNIVERSAL (Ctrl+K) — telas e ações da fonte única + registros
// (solicitações, obras, contratos, títulos, parceiros, colaboradores,
// usuários) agrupados por tipo. Cada grupo vem do backend já filtrado
// pela MESMA regra de visibilidade da tela correspondente: o usuário só
// encontra aqui o que já poderia ver nas listas.
export default function CommandPalette({ open, onClose, mode = 'navigate', onNavigate }) {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selecionado, setSelecionado] = useState(0);
  const [gruposRegistros, setGruposRegistros] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const abortRef = useRef(null);

  const itensTelas = useMemo(() => getVisibleItems(user), [user]);

  const telas = useMemo(() => {
    const q = normalizar(query).trim();
    if (!q) return itensTelas.slice(0, 12);
    const termos = q.split(/\s+/);
    return itensTelas
      .map((item) => {
        const alvo = `${normalizar(item.label)} ${normalizar(item.moduleLabel)} ${normalizar(item.desc)}`;
        if (!termos.every((t) => alvo.includes(t))) return null;
        return { item, ordem: normalizar(item.label).startsWith(q) ? 0 : 1 };
      })
      .filter(Boolean)
      .sort((a, b) => a.ordem - b.ordem)
      .map((r) => r.item)
      .slice(0, 5);
  }, [itensTelas, query]);

  // Registros: debounce de 300ms + cancelamento da requisição anterior.
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) {
      setGruposRegistros([]);
      setBuscando(false);
      return undefined;
    }
    setBuscando(true);
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const grupos = await buscarUniversal(q, { signal: controller.signal });
        setGruposRegistros(grupos);
        setBuscando(false);
      } catch (error) {
        if (error?.name !== 'AbortError') {
          setGruposRegistros([]);
          setBuscando(false);
        }
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [open, query]);

  // Telas/ações primeiro; termo com cara de código põe os registros no topo.
  const grupos = useMemo(() => {
    const grupoTelas = telas.length > 0
      ? [{ tipo: 'telas', rotulo: 'Telas e ações', itens: telas.map((item) => ({
          id: `tela-${item.id}`,
          tela: item,
          titulo: item.label,
          subtitulo: `${item.moduleLabel}${item.fixavel === 'acao' ? ' · ação' : ''}`,
          link: item.to
        })), verTodos: null }]
      : [];
    // "Arquivadas e canceladas" fica SEMPRE em último lugar absoluto.
    const foraDoFluxo = gruposRegistros.filter((grupo) => grupo.tipo === 'arquivadas');
    const ativos = gruposRegistros.filter((grupo) => grupo.tipo !== 'arquivadas');
    return pareceCodigo(query.trim())
      ? [...ativos, ...grupoTelas, ...foraDoFluxo]
      : [...grupoTelas, ...ativos, ...foraDoFluxo];
  }, [telas, gruposRegistros, query]);

  // Lista achatada para navegação por teclado (itens + "ver todos").
  const navegaveis = useMemo(() => {
    const lista = [];
    grupos.forEach((grupo) => {
      grupo.itens.forEach((item) => lista.push({ chave: `${grupo.tipo}-${item.id}`, item, grupo }));
      if (grupo.verTodos) {
        lista.push({
          chave: `${grupo.tipo}-vertodos`,
          item: { titulo: `Ver todos em ${grupo.rotulo}`, link: grupo.verTodos, ehVerTodos: true },
          grupo
        });
      }
    });
    return lista;
  }, [grupos]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelecionado(0);
      setGruposRegistros([]);
      const t = setTimeout(() => inputRef.current?.focus(), 10);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open]);

  useEffect(() => {
    setSelecionado(0);
  }, [query, gruposRegistros]);

  useEffect(() => {
    const el = listRef.current?.querySelector?.(`[data-idx="${selecionado}"]`);
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [selecionado]);

  if (!open) return null;

  const abrir = (link, title = '') => {
    onClose();
    if (typeof onNavigate === 'function') {
      onNavigate(link, { title });
      return;
    }
    navigate(link);
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelecionado((atual) => Math.min(atual + 1, navegaveis.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelecionado((atual) => Math.max(atual - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const alvo = navegaveis[selecionado];
      if (alvo) abrir(alvo.item.link, alvo.item.titulo);
    }
  };

  let indiceCorrente = -1;

  return (
    <div
      className="fx-cmdk-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="fx-cmdk"
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'new-tab' ? 'Buscar tela para abrir em nova aba' : 'Busca universal'}
        onKeyDown={onKeyDown}
      >
        <div className="fx-cmdk-input-wrap">
          <HiOutlineMagnifyingGlass aria-hidden="true" />
          <input
            ref={inputRef}
            className="fx-cmdk-input"
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={mode === 'new-tab'
              ? 'Buscar a tela ou registro para abrir em nova aba…'
              : 'Buscar telas, solicitações, obras, contratos, títulos, pessoas…'}
            aria-label={mode === 'new-tab' ? 'Buscar tela para abrir em nova aba' : 'Busca universal'}
            role="combobox"
            aria-expanded="true"
            aria-controls="fx-cmdk-resultados"
          />
          {buscando && <span className="fx-cmdk-buscando" aria-hidden="true" />}
          {mode === 'new-tab' && <span className="fx-cmdk-mode">Nova aba</span>}
          <kbd className="fx-search-kbd">Esc</kbd>
        </div>

        {navegaveis.length > 0 ? (
          <div id="fx-cmdk-resultados" ref={listRef} className="fx-cmdk-list" role="listbox">
            {grupos.map((grupo) => (
              <div key={grupo.tipo} className="fx-cmdk-grupo">
                <p className="fx-cmdk-grupo-titulo">{grupo.rotulo}</p>
                <ul role="presentation">
                  {grupo.itens.map((item) => {
                    indiceCorrente += 1;
                    const idx = indiceCorrente;
                    const Icone = item.tela?.icon;
                    return (
                      <li key={item.id} role="presentation">
                        <div
                          className={`fx-cmdk-item ${idx === selecionado ? 'fx-cmdk-item--ativo' : ''}`}
                          data-idx={idx}
                          role="option"
                          aria-selected={idx === selecionado}
                          style={item.tela ? { '--fx-cmdk-accent': `var(--module-${item.tela.moduleId})` } : undefined}
                          onMouseEnter={() => setSelecionado(idx)}
                        >
                          <button type="button" className="fx-cmdk-item-main" onClick={() => abrir(item.link, item.titulo)}>
                            {Icone && <Icone aria-hidden="true" />}
                            <span className="fx-cmdk-item-titulo">
                              <Realce texto={item.titulo} termo={query} />
                            </span>
                            {item.selo && (
                              <span className="fx-cmdk-selo">{item.selo}</span>
                            )}
                            <span className="fx-cmdk-item-module">
                              <Realce texto={item.subtitulo || ''} termo={query} />
                            </span>
                          </button>
                          {Array.isArray(item.acoes) && item.acoes.length > 0 && (
                            <span className="fx-cmdk-item-acoes">
                              {item.acoes.map((acao) => (
                                <button
                                  key={acao.rotulo}
                                  type="button"
                                  className="fx-cmdk-acao"
                                  onClick={() => abrir(acao.link, acao.rotulo)}
                                >
                                  {acao.rotulo}
                                </button>
                              ))}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                  {grupo.verTodos && (() => {
                    indiceCorrente += 1;
                    const idx = indiceCorrente;
                    return (
                      <li key={`${grupo.tipo}-vertodos`} role="presentation">
                        <button
                          type="button"
                          className={`fx-cmdk-vertodos ${idx === selecionado ? 'fx-cmdk-item--ativo' : ''}`}
                          data-idx={idx}
                          role="option"
                          aria-selected={idx === selecionado}
                          onMouseEnter={() => setSelecionado(idx)}
                          onClick={() => abrir(grupo.verTodos, `Ver todos em ${grupo.rotulo}`)}
                        >
                          <HiOutlineArrowRight aria-hidden="true" />
                          ver todos em {grupo.rotulo}
                        </button>
                      </li>
                    );
                  })()}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="fx-cmdk-empty">
            {query.trim().length >= 2 && !buscando
              ? `Nada encontrado para “${query}”.`
              : 'Digite para buscar telas e registros (2+ letras).'}
          </p>
        )}

        <div className="fx-cmdk-hint">
          <span>↑↓ navegar</span>
          <span>{mode === 'new-tab' ? 'Enter abrir em nova aba' : 'Enter abrir'}</span>
          <span>Esc fechar</span>
        </div>
      </div>
    </div>
  );
}
