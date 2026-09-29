import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePosicaoFlutuante } from '../../../hooks/usePosicaoFlutuante';

/*
  Ação de card só com ícone, com estado legível à distância e tooltip.

  Indisponível usa `aria-disabled` em vez de `disabled`: o botão continua
  focável e o tooltip continua aparecendo (ao passar o mouse e no foco pelo
  teclado) dizendo POR QUE a ação não está disponível. O clique é ignorado.

  O tooltip sai por PORTAL no `body` e é posto pelo `usePosicaoFlutuante`
  (29/09): o card do mês tem `overflow: clip` e `container-type`, que
  recortavam o balão do lápis na borda esquerda. Fora do card ele nunca é
  cortado, vira de lado quando não cabe e fica sempre dentro da janela.
  Texto longo quebra em até ~240px.
*/
export default function CrIconAction({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  disabledReason = '',
  contextLabel = ''
}) {
  const [aberto, setAberto] = useState(false);
  const botaoRef = useRef(null);
  const balaoRef = useRef(null);
  const posicao = usePosicaoFlutuante(botaoRef, balaoRef, aberto, { ancorarADireita: true });
  const tooltip = disabled && disabledReason ? `${label} — ${disabledReason}` : label;
  const abrir = () => setAberto(true);
  const fechar = () => setAberto(false);
  return (
    <span
      className="tooltip-wrap cr-icon-tip"
      onMouseEnter={abrir}
      onMouseLeave={fechar}
      onFocus={abrir}
      onBlur={fechar}
    >
      <button
        ref={botaoRef}
        type="button"
        className="cr-icon-button"
        aria-disabled={disabled || undefined}
        aria-label={contextLabel ? `${tooltip} (${contextLabel})` : tooltip}
        onKeyDown={(event) => {
          if (event.key === 'Escape') fechar();
        }}
        onClick={(event) => {
          if (disabled) {
            event.preventDefault();
            return;
          }
          onClick?.(event);
        }}
      >
        <Icon aria-hidden="true" />
      </button>
      {aberto && posicao && typeof document !== 'undefined'
        ? createPortal(
          <span
            ref={balaoRef}
            className="tooltip-content cr-icon-tip__float"
            aria-hidden="true"
            style={posicao.estilo}
          >
            <span className="cr-icon-tip__text">{tooltip}</span>
          </span>,
          document.body
        )
        : null}
    </span>
  );
}
