import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HiOutlineBars3,
  HiOutlineChevronDoubleUp,
  HiOutlineChevronDown,
  HiOutlineChevronUp
} from 'react-icons/hi2';
import { TIPO_BLOCOS, usePreferenciaDeLista } from '../../contexts/PreferenciasContext';

/* =====================================================================
   ORDEM DOS CARDS DO PAINEL DO GESTOR (29/09/2026)
   ---------------------------------------------------------------------
   Mesma técnica do "Ordenar por" do Dashboard de Custos e Recebíveis
   (CrDashboardView) e dos BlocosPersonalizaveis:
   - preferência POR USUÁRIO no banco (`usePreferenciaDeLista`, tipo
     `blocos`), uma lista por aba: `painel-gestor:ordem:<aba>`;
   - valor `{ criterio, ordemManual: [id, ...] }`. Escolher critério não
     apaga a ordem manual; arrastar (ou mover pelos botões/teclado) passa o
     critério para MANUAL — voltar ao manual reencontra o arranjo;
   - item fora da ordem salva vai para o fim, por nome; item escondido pelos
     filtros mantém a posição dele na ordem salva.

   OLHO FECHADO: os valores chegam null. Critério POR VALOR não tem como
   ordenar — e ordenar pelo último valor conhecido entregaria o ranking dos
   valores ocultos. Então o critério por valor CAI PARA NOME enquanto o olho
   estiver fechado (a escolha salva não muda; ao abrir, volta a valer) e a
   tela avisa em uma linha. Ordem manual e critérios sem valor seguem iguais.
   ===================================================================== */

export const CRITERIO_MANUAL = 'MANUAL';
const CELULAR_ORDEM = '(max-width: 767px)';
export const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

function lerOrdemManual(valor) {
  if (!Array.isArray(valor)) return [];
  const vistos = new Set();
  return valor
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0 && !vistos.has(id) && vistos.add(id));
}

function mesclarOrdemVisivel(ordemSalva, visiveisNovaOrdem) {
  const visiveis = new Set(visiveisNovaOrdem);
  const completa = [
    ...ordemSalva,
    ...visiveisNovaOrdem.filter((id) => !ordemSalva.includes(id))
  ];
  const fila = visiveisNovaOrdem.slice();
  return completa.map((id) => (visiveis.has(id) ? fila.shift() : id));
}

/**
 * `criterios`: [{ id, rotulo, porValor?, comparar(a, b) }]. O critério
 * MANUAL é acrescentado aqui. `getNome` é o desempate e o substituto dos
 * critérios por valor com o olho fechado.
 */
export function useOrdemCards({ storageKey, criterios, padrao, itens, getId, getNome, oculto }) {
  const [preferencia, gravarPreferencia] = usePreferenciaDeLista(storageKey, TIPO_BLOCOS);
  const validos = useMemo(
    () => new Set([...criterios.map((item) => item.id), CRITERIO_MANUAL]),
    [criterios]
  );
  const criterio = validos.has(preferencia?.criterio) ? preferencia.criterio : padrao;
  const ordemManual = useMemo(() => lerOrdemManual(preferencia?.ordemManual), [preferencia]);
  const definicao = criterios.find((item) => item.id === criterio);
  const caiParaNome = Boolean(oculto && definicao?.porValor);

  const porNome = useCallback(
    (a, b) => collator.compare(String(getNome(a) || ''), String(getNome(b) || '')),
    [getNome]
  );

  const ordenados = useMemo(() => {
    const lista = (itens || []).slice();
    if (criterio === CRITERIO_MANUAL) {
      const posicao = new Map(ordemManual.map((id, indice) => [id, indice]));
      const indice = (item) => (posicao.has(Number(getId(item)))
        ? posicao.get(Number(getId(item)))
        : Number.POSITIVE_INFINITY);
      return lista.sort((a, b) => {
        const ia = indice(a);
        const ib = indice(b);
        if (ia !== ib) return ia < ib ? -1 : 1;
        return porNome(a, b);
      });
    }
    if (!definicao || caiParaNome) return lista.sort(porNome);
    return lista.sort((a, b) => definicao.comparar(a, b) || porNome(a, b));
  }, [caiParaNome, criterio, definicao, getId, itens, ordemManual, porNome]);

  const idsVisiveis = useMemo(() => ordenados.map((item) => Number(getId(item))), [getId, ordenados]);

  const gravar = useCallback((proximoCriterio, proximaOrdem) => {
    gravarPreferencia(
      proximoCriterio === padrao && !proximaOrdem.length
        ? null
        : { criterio: proximoCriterio, ordemManual: proximaOrdem }
    );
  }, [gravarPreferencia, padrao]);

  const alterarCriterio = useCallback((proximo) => {
    gravar(validos.has(proximo) ? proximo : padrao, ordemManual);
  }, [gravar, ordemManual, padrao, validos]);

  /* Move um item VISÍVEL para `destino` (índice na lista visível). */
  const mover = useCallback((id, destino) => {
    const ids = idsVisiveis.slice();
    const origem = ids.indexOf(Number(id));
    if (origem < 0) return null;
    const alvo = Math.max(0, Math.min(ids.length - 1, destino));
    if (alvo === origem) return null;
    ids.splice(alvo, 0, ids.splice(origem, 1)[0]);
    gravar(CRITERIO_MANUAL, mesclarOrdemVisivel(ordemManual, ids));
    return { posicao: alvo + 1, total: ids.length };
  }, [gravar, idsVisiveis, ordemManual]);

  return {
    criterio,
    criterios: [...criterios, { id: CRITERIO_MANUAL, rotulo: 'Ordem manual (arrastar)' }],
    ordenados,
    modoManual: criterio === CRITERIO_MANUAL,
    caiParaNome,
    alterarCriterio,
    mover
  };
}

export function ControleOrdenacao({ ordem, rotuloAcessivel }) {
  return (
    <div className="pg-ordem">
      <label className="pg-ordem__campo">
        <span>Ordenar por</span>
        {/* Seletor de CONTEXTO (ordem de exibição), não recorte de lista. */}
        <select
          value={ordem.criterio}
          onChange={(evento) => ordem.alterarCriterio(evento.target.value)}
          aria-label={rotuloAcessivel}
          title="A ordem escolhida fica salva para você. Na ordem manual, arraste os cards ou use os botões de mover."
        >
          {ordem.criterios.map((opcao) => (
            <option key={opcao.id} value={opcao.id}>{opcao.rotulo}</option>
          ))}
        </select>
      </label>
      {ordem.caiParaNome ? <span className="pg-ordem__dica">Valores ocultos: ordem por nome.</span> : null}
    </div>
  );
}

function useEhCelular() {
  const [ehCelular, setEhCelular] = useState(() => (
    typeof window !== 'undefined' && Boolean(window.matchMedia?.(CELULAR_ORDEM).matches)
  ));
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const media = window.matchMedia(CELULAR_ORDEM);
    const ouvinte = (evento) => setEhCelular(evento.matches);
    media.addEventListener('change', ouvinte);
    return () => media.removeEventListener('change', ouvinte);
  }, []);
  return ehCelular;
}

/**
 * Grade de cards. Fora do modo manual renderiza os cards direto na grade;
 * no modo manual cada card ganha a barra de mover (alça com teclado +
 * botões) e, fora do celular, o arrasto HTML5.
 */
export function GradeOrdenavel({ ordem, getId, getNome, className, renderItem }) {
  const ehCelular = useEhCelular();
  const podeArrastar = ordem.modoManual && !ehCelular;
  const [arrastando, setArrastando] = useState(null);
  const [alvo, setAlvo] = useState(null);
  const [anuncio, setAnuncio] = useState('');
  const alcasRef = useRef(new Map());
  const focoPendenteRef = useRef(null);
  const ids = ordem.ordenados.map((item) => Number(getId(item)));

  const mover = (item, destino, { focar = false } = {}) => {
    const id = Number(getId(item));
    const resultado = ordem.mover(id, destino);
    if (!resultado) return;
    setAnuncio(`${getNome(item) || 'Item'} movido para a posição ${resultado.posicao} de ${resultado.total}.`);
    if (focar) focoPendenteRef.current = id;
  };

  const chaveIds = ids.join(',');
  useEffect(() => {
    const id = focoPendenteRef.current;
    if (!id) return;
    focoPendenteRef.current = null;
    alcasRef.current.get(id)?.focus();
  }, [chaveIds]);

  const encerrar = () => { setArrastando(null); setAlvo(null); };

  return (
    <>
      {/* Sem texto de apoio: a alça "≡ 1º" e os botões de mover são o
          controle; a instrução completa fica no title/aria de cada um. */}
      <span className="sr-only" aria-live="polite">{anuncio}</span>
      <div
        className={className}
        data-ordem-manual={ordem.modoManual || undefined}
        onDragLeave={(evento) => {
          if (!evento.currentTarget.contains(evento.relatedTarget)) setAlvo(null);
        }}
      >
        {ordem.ordenados.map((item, posicao) => {
          const id = Number(getId(item));
          const card = renderItem(item);
          if (!ordem.modoManual) return <div key={id} className="pg-ordem-item">{card}</div>;
          const nome = getNome(item);
          const total = ids.length;
          return (
            <div
              key={id}
              className="pg-ordem-item"
              data-manual="true"
              data-arrastando={arrastando === id || undefined}
              data-alvo={alvo?.id === id ? alvo.lado : undefined}
              data-item-id={id}
              draggable={podeArrastar}
              onDragStart={(evento) => {
                if (!podeArrastar) return;
                evento.dataTransfer.effectAllowed = 'move';
                evento.dataTransfer.setData('text/plain', String(id));
                setArrastando(id);
              }}
              onDragOver={(evento) => {
                if (!podeArrastar || arrastando == null) return;
                evento.preventDefault();
                evento.dataTransfer.dropEffect = 'move';
                if (arrastando === id) { if (alvo) setAlvo(null); return; }
                const lado = ids.indexOf(arrastando) < posicao ? 'depois' : 'antes';
                if (alvo?.id !== id || alvo?.lado !== lado) setAlvo({ id, lado });
              }}
              onDrop={(evento) => {
                if (!podeArrastar || arrastando == null) return;
                evento.preventDefault();
                const origem = ordem.ordenados.find((outro) => Number(getId(outro)) === arrastando);
                if (origem) mover(origem, posicao);
                encerrar();
              }}
              onDragEnd={encerrar}
            >
              <div className="pg-ordem-item__barra">
                <button
                  type="button"
                  className="pg-ordem-item__alca"
                  title={podeArrastar
                    ? 'Arraste o card ou use os botões de mover. A ordem fica salva para você.'
                    : 'Use os botões de mover. A ordem fica salva para você.'}
                  ref={(elemento) => {
                    if (elemento) alcasRef.current.set(id, elemento);
                    else alcasRef.current.delete(id);
                  }}
                  aria-label={`Mover ${nome}: posição ${posicao + 1} de ${total}. `
                    + 'Setas movem uma posição; Home leva ao início; End, ao fim.'}
                  onKeyDown={(evento) => {
                    const mapa = {
                      ArrowUp: posicao - 1,
                      ArrowLeft: posicao - 1,
                      ArrowDown: posicao + 1,
                      ArrowRight: posicao + 1,
                      Home: 0,
                      End: total - 1
                    };
                    if (!(evento.key in mapa)) return;
                    evento.preventDefault();
                    mover(item, mapa[evento.key], { focar: true });
                  }}
                >
                  <HiOutlineBars3 aria-hidden="true" />
                  <span>{posicao + 1}º</span>
                </button>
                <span className="pg-ordem-item__acoes">
                  <span className="tooltip-wrap">
                    <button type="button" className="pg-ordem-item__botao" aria-label={`Mover ${nome} para o início`} disabled={posicao === 0} onClick={() => mover(item, 0, { focar: true })}>
                      <HiOutlineChevronDoubleUp aria-hidden="true" />
                    </button>
                    <span className="tooltip-content" aria-hidden="true">Mover para o início</span>
                  </span>
                  <span className="tooltip-wrap">
                    <button type="button" className="pg-ordem-item__botao" aria-label={`Mover ${nome} uma posição antes`} disabled={posicao === 0} onClick={() => mover(item, posicao - 1, { focar: true })}>
                      <HiOutlineChevronUp aria-hidden="true" />
                    </button>
                    <span className="tooltip-content" aria-hidden="true">Mover para antes</span>
                  </span>
                  <span className="tooltip-wrap">
                    <button type="button" className="pg-ordem-item__botao" aria-label={`Mover ${nome} uma posição depois`} disabled={posicao === total - 1} onClick={() => mover(item, posicao + 1, { focar: true })}>
                      <HiOutlineChevronDown aria-hidden="true" />
                    </button>
                    <span className="tooltip-content" aria-hidden="true">Mover para depois</span>
                  </span>
                </span>
              </div>
              {card}
            </div>
          );
        })}
      </div>
    </>
  );
}
