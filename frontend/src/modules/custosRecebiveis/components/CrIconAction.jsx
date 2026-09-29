/*
  Ação de card só com ícone, com estado legível à distância e tooltip.

  Indisponível usa `aria-disabled` em vez de `disabled`: o botão continua
  focável e o tooltip continua aparecendo (ao passar o mouse e no foco pelo
  teclado) dizendo POR QUE a ação não está disponível. O clique é ignorado.
*/
export default function CrIconAction({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  disabledReason = '',
  contextLabel = ''
}) {
  const tooltip = disabled && disabledReason ? `${label} — ${disabledReason}` : label;
  return (
    <span className="tooltip-wrap cr-icon-tip">
      <button
        type="button"
        className="cr-icon-button"
        aria-disabled={disabled || undefined}
        aria-label={contextLabel ? `${tooltip} (${contextLabel})` : tooltip}
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
      <span className="tooltip-content" aria-hidden="true">{tooltip}</span>
    </span>
  );
}
