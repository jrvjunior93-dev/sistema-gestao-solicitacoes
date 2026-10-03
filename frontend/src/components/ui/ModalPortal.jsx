import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

let modaisAbertos = 0;
let overflowAnterior = '';
let paddingDireitoAnterior = '';

/*
 * PILHA DE MODAIS (02/09) — o Escape fecha APENAS o de cima.
 *
 * Antes cada ModalPortal registrava seu próprio `keydown` no documento, sem
 * noção de quem estava por cima. Com a confirmação do sistema aberta sobre
 * um modal de detalhe — "Atestar documento" dentro da solicitação, por
 * exemplo — um único Escape disparava os DOIS: cancelava a confirmação
 * (certo) e fechava o detalhe junto (surpreendente). Atinge toda tela que
 * abra confirmação de dentro de modal.
 *
 * A pilha é módulo-único de propósito, pela mesma razão do contador de
 * rolagem logo acima: duas cópias seriam duas pilhas, e cada uma se acharia
 * dona do topo.
 */
const pilhaDeModais = [];

function bloquearRolagemDocumento() {
  if (modaisAbertos === 0) {
    overflowAnterior = document.body.style.overflow;
    paddingDireitoAnterior = document.body.style.paddingRight;
    const larguraBarra = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    document.body.style.overflow = 'hidden';
    if (larguraBarra > 0) {
      document.body.style.paddingRight = `${larguraBarra}px`;
    }
  }
  modaisAbertos += 1;
}

function liberarRolagemDocumento() {
  modaisAbertos = Math.max(0, modaisAbertos - 1);
  if (modaisAbertos === 0) {
    document.body.style.overflow = overflowAnterior;
    document.body.style.paddingRight = paddingDireitoAnterior;
  }
}

export default function ModalPortal({ children, onClose, closeOnEscape = true }) {
  const focoAnterior = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    focoAnterior.current = document.activeElement;
    bloquearRolagemDocumento();

    // Ordem de montagem = ordem de empilhamento: o último a montar é o que
    // o usuário está vendo por cima.
    const marca = Symbol('modal');
    pilhaDeModais.push(marca);

    function handleKeyDown(event) {
      if (event.key !== 'Escape' || !closeOnEscape || !onCloseRef.current) return;
      // Só o de cima responde. Sem isso, um Escape fecha a pilha inteira.
      if (pilhaDeModais[pilhaDeModais.length - 1] !== marca) return;
      event.preventDefault();
      onCloseRef.current();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const posicao = pilhaDeModais.indexOf(marca);
      if (posicao !== -1) pilhaDeModais.splice(posicao, 1);
      liberarRolagemDocumento();
      if (focoAnterior.current instanceof HTMLElement && document.contains(focoAnterior.current)) {
        focoAnterior.current.focus({ preventScroll: true });
      }
    };
  }, [closeOnEscape]);

  if (typeof document === 'undefined') return null;

  /*
   * PORTAL NAO PODE ACIONAR O CARD QUE O ABRIU (21/09).
   *
   * O portal muda o DOM para `document.body`, mas o React preserva a arvore
   * logica: um clique dentro do modal ainda sobe ate os componentes que o
   * renderizaram. Quando o disparador mora num `BlocoConteudo` cujo card
   * inteiro abre/recolhe, clicar numa area vazia do modal chegava ao card,
   * recolhia o bloco e desmontava o modal. Para o usuario, parecia que o
   * modal aceitava clique fora mesmo sem ter essa regra.
   *
   * A fronteira do portal interrompe somente a propagacao para a tela que
   * esta por baixo. Os controles internos continuam recebendo normalmente
   * `pointerdown`, `mousedown` e `click`; modais que implementam uma acao
   * explicita no proprio fundo tambem continuam podendo executa-la antes de
   * o evento chegar aqui.
   */
  const isolarEventoDaTela = (event) => event.stopPropagation();

  return createPortal(
    <div
      className="app-modal-portal"
      data-modal-portal
      onPointerDown={isolarEventoDaTela}
      onMouseDown={isolarEventoDaTela}
      onClick={isolarEventoDaTela}
    >
      {children}
    </div>,
    document.body
  );
}
