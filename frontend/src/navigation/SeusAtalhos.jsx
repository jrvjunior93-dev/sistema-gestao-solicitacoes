import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  HiOutlinePlus, HiOutlineXMark, HiOutlineLockClosed, HiOutlineMagnifyingGlass, HiOutlineStar
} from 'react-icons/hi2';
import { AuthContext } from '../contexts/AuthContext';
import { getFixableItems, resolveLabel } from './navigationConfig';
import { useAtalhos } from './AtalhosContext';

// =====================================================================
// HOME — seção "Seus atalhos": acima dos cards de módulo, abaixo das
// pendências. Cards menores que os de módulo; arrastar reordena (só os
// pessoais — obrigatórios do setor ficam à esquerda com cadeado), "×"
// remove, card tracejado "Adicionar" abre o catálogo de destinos
// fixáveis. SEM LIMITE de atalhos: a seção mostra as duas primeiras
// fileiras e o resto fica atrás de "ver todos (n)".
// =====================================================================

const LARGURA_MIN_CARD = 172; // px — espelha o minmax() do grid no CSS

export default function SeusAtalhos() {
  const { user } = useContext(AuthContext);
  const { atalhos, fixados, fixar, remover, reordenar, carregando } = useAtalhos();
  const [expandido, setExpandido] = useState(false);
  const [colunas, setColunas] = useState(5);
  const [adicionarAberto, setAdicionarAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const gridRef = useRef(null);
  const dragIdRef = useRef(null);

  useEffect(() => {
    const el = gridRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const largura = entries[0]?.contentRect?.width || 0;
      setColunas(Math.max(2, Math.floor(largura / LARGURA_MIN_CARD)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const disponiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return getFixableItems(user)
      .filter((item) => !fixados.has(item.id))
      .filter((item) => {
        if (!termo) return true;
        const rotulo = resolveLabel(item, user);
        return `${rotulo} ${item.moduleLabel}`.toLowerCase().includes(termo);
      });
  }, [user, fixados, busca, adicionarAberto]);

  if (carregando) return null;

  // Duas fileiras: reserva 1 vaga para o card "Adicionar".
  const limiteColapsado = Math.max(1, colunas * 2 - 1);
  const visiveis = expandido ? atalhos : atalhos.slice(0, limiteColapsado);
  const ocultos = atalhos.length - visiveis.length;

  const aoSoltar = (idAlvo) => {
    const idOrigem = dragIdRef.current;
    dragIdRef.current = null;
    if (!idOrigem || idOrigem === idAlvo) return;
    const pessoais = atalhos.filter((item) => !item.obrigatorio).map((item) => item.id);
    const de = pessoais.indexOf(idOrigem);
    const para = pessoais.indexOf(idAlvo);
    if (de < 0 || para < 0) return;
    pessoais.splice(para, 0, pessoais.splice(de, 1)[0]);
    reordenar(pessoais);
  };

  return (
    <section className="hub-atalhos" aria-label="Seus atalhos">
      <div className="hub-atalhos-cabecalho">
        <h2 className="hub-pendencias-title">
          <HiOutlineStar aria-hidden="true" />
          Seus atalhos
        </h2>
        {ocultos > 0 && (
          <button type="button" className="hub-atalhos-vertodos" onClick={() => setExpandido(true)}>
            ver todos ({atalhos.length})
          </button>
        )}
        {expandido && atalhos.length > limiteColapsado && (
          <button type="button" className="hub-atalhos-vertodos" onClick={() => setExpandido(false)}>
            mostrar menos
          </button>
        )}
      </div>

      <ul className="hub-atalhos-grid" ref={gridRef}>
        {visiveis.map((item) => {
          const Icone = item.icon;
          const rotulo = resolveLabel(item, user);
          return (
            <li
              key={item.id}
              className={`hub-atalho-card ${item.obrigatorio ? 'hub-atalho-card--obrigatorio' : ''}`}
              draggable={!item.obrigatorio}
              onDragStart={() => { dragIdRef.current = item.id; }}
              onDragOver={(event) => { if (!item.obrigatorio) event.preventDefault(); }}
              onDrop={() => aoSoltar(item.id)}
              style={{ '--atalho-cor': `var(--module-${item.moduleId}, var(--c-muted))` }}
            >
              <Link to={item.to} className="hub-atalho-link" title={item.desc}>
                <span className="hub-atalho-icone" aria-hidden="true">
                  {Icone && <Icone />}
                </span>
                <span className="hub-atalho-rotulo">{rotulo}</span>
              </Link>
              {item.obrigatorio ? (
                <span
                  className="hub-atalho-cadeado"
                  title="Fixado pelo setor (não removível)"
                  aria-label="Fixado pelo setor"
                >
                  <HiOutlineLockClosed aria-hidden="true" />
                </span>
              ) : (
                <button
                  type="button"
                  className="hub-atalho-remover"
                  onClick={() => remover(item.id)}
                  title={`Remover ${rotulo} dos atalhos`}
                  aria-label={`Remover ${rotulo} dos atalhos`}
                >
                  <HiOutlineXMark aria-hidden="true" />
                </button>
              )}
            </li>
          );
        })}

        <li className="hub-atalho-card hub-atalho-card--adicionar">
          <button
            type="button"
            className="hub-atalho-adicionar"
            onClick={() => setAdicionarAberto(true)}
            aria-haspopup="dialog"
          >
            <HiOutlinePlus aria-hidden="true" />
            <span>Adicionar</span>
          </button>
        </li>
      </ul>

      {adicionarAberto && (
        <div
          className="hub-atalhos-modal-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setAdicionarAberto(false);
          }}
        >
          <div className="hub-atalhos-modal" role="dialog" aria-modal="true" aria-label="Adicionar atalho">
            <div className="hub-atalhos-modal-topo">
              <span className="hub-atalhos-modal-busca">
                <HiOutlineMagnifyingGlass aria-hidden="true" />
                <input
                  type="text"
                  placeholder="Buscar tela ou ação…"
                  value={busca}
                  onChange={(event) => setBusca(event.target.value)}
                  autoFocus
                />
              </span>
              <button
                type="button"
                className="hub-atalho-remover"
                onClick={() => setAdicionarAberto(false)}
                aria-label="Fechar"
              >
                <HiOutlineXMark aria-hidden="true" />
              </button>
            </div>
            <ul className="hub-atalhos-modal-lista">
              {disponiveis.length === 0 && (
                <li className="hub-atalhos-modal-vazio">Nenhum destino encontrado.</li>
              )}
              {disponiveis.map((item) => {
                const Icone = item.icon;
                const rotulo = resolveLabel(item, user);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="hub-atalhos-modal-item"
                      style={{ '--atalho-cor': `var(--module-${item.moduleId}, var(--c-muted))` }}
                      onClick={() => fixar(item.id)}
                    >
                      {Icone && <Icone aria-hidden="true" />}
                      <span className="hub-atalhos-modal-item-rotulo">{rotulo}</span>
                      <span className="hub-atalhos-modal-item-modulo">
                        {item.moduleLabel}
                        {item.fixavel === 'acao' ? ' · ação' : ''}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
