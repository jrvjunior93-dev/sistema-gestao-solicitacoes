import { Children, cloneElement, useRef } from 'react';
import { TIPO_COLUNAS, usePreferenciaDeLista } from '../contexts/PreferenciasContext';
import { PainelColunas } from '../components/padrao/TabelaPadrao';

// Opt-in para tabelas com campos editaveis que nao podem virar cards/ordenar linhas.
export default function useColunasOperacionais(colunas, storageKey) {
  const [preferencia, gravar] = usePreferenciaDeLista(storageKey, TIPO_COLUNAS);
  const arrastando = useRef(null);
  const ids = colunas.map(c => c.key);
  const conhecidas = value => [...new Set(Array.isArray(value) ? value.filter(id => ids.includes(id)) : [])];
  const ordemSalva = conhecidas(preferencia?.ordem);
  const ordem = [...ordemSalva, ...ids.filter(id => !ordemSalva.includes(id))];
  const ocultas = conhecidas(preferencia?.ocultas);
  const visiveisSalvas = conhecidas(preferencia?.visiveis);
  const visiveis = ids.filter(id => !Array.isArray(preferencia?.visiveis) || visiveisSalvas.includes(id)
    || !ocultas.includes(id) || colunas.find(c => c.key === id)?.sempreVisivel);
  const salvar = (novaOrdem, novasVisiveis) => gravar({ ordem: novaOrdem, visiveis: novasVisiveis,
    ocultas: ids.filter(id => !novasVisiveis.includes(id)) });
  const mostrar = id => { if (ids.includes(id) && !visiveis.includes(id)) salvar(ordem, [...visiveis, id]); };
  const alternar = id => {
    if (!ids.includes(id) || colunas.find(c => c.key === id)?.sempreVisivel) return;
    if (visiveis.includes(id) && visiveis.length <= 1) return;
    salvar(ordem, visiveis.includes(id) ? visiveis.filter(x => x !== id) : [...visiveis, id]);
  };
  const reordenar = (id, alvo) => {
    const de = ordem.indexOf(id), para = ordem.indexOf(alvo);
    if (de < 0 || para < 0 || de === para) return;
    const proxima = [...ordem]; proxima.splice(para, 0, proxima.splice(de, 1)[0]);
    salvar(proxima, visiveis);
  };
  const painel = <PainelColunas colunas={colunas.map(c => ({ ...c, id: c.key }))}
    ordem={ordem} visiveis={visiveis} aoAlternar={alternar} aoReordenar={reordenar}
    aoMover={(id, passo) => reordenar(id, ordem[ordem.indexOf(id) + passo])}
    aoRestaurar={() => gravar(null)} />;
  const disponiveis = originais => ordem.filter(id => visiveis.includes(id))
    .map(id => originais.find(c => c.key === id)).filter(Boolean);
  const arrastoCabecalho = coluna => ({
    onDragOver: event => { if (arrastando.current) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } },
    onDrop: event => {
      if (!arrastando.current) return;
      event.preventDefault(); reordenar(arrastando.current, coluna.key); arrastando.current = null;
    }
  });
  const alca = coluna => <button type="button" draggable className="mr-1 cursor-grab text-[var(--c-muted)]"
    aria-label={`Arrastar coluna ${coluna.titulo}`} title={`Arraste para reposicionar ${coluna.titulo}`}
    onClick={event => event.stopPropagation()}
    onDragStart={event => { arrastando.current = coluna.key; event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', coluna.key); event.stopPropagation(); }}
    onDragEnd={() => { arrastando.current = null; }}>⋮⋮</button>;
  return { painel, mostrar, disponiveis, arrastoCabecalho, alca };
}

// Mapeia cabecalho E celulas pelo mesmo catalogo declarado. As chaves por coluna
// preservam inputs/foco ao reordenar; campos ocultos permanecem nos drafts da tela.
export function LinhaColunasOperacionais({ originais, visiveis, configuracao, cabecalho = false, children, ...props }) {
  const celulas = Children.toArray(children);
  const porColuna = new Map(originais.map((coluna, indice) => [coluna.key, celulas[indice]]));
  return <tr {...props}>{visiveis.map(coluna => {
    const celula = porColuna.get(coluna.key);
    if (!celula) return null;
    return cloneElement(celula, { key: coluna.key, 'data-coluna': coluna.key,
      ...(cabecalho ? configuracao.arrastoCabecalho(coluna) : {}) },
    cabecalho ? <>{configuracao.alca(coluna)}{celula.props.children}</> : celula.props.children);
  })}</tr>;
}
