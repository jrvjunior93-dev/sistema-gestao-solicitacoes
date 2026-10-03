import {
  formatarDataAnexoPendente,
  formatarTamanhoAnexoPendente
} from '../../utils/pendingAttachments';

export default function PendingAttachmentsList({
  items = [],
  onRemove,
  className = '',
  itemClassName = '',
  removeButtonClassName = 'text-[var(--c-primary)] font-semibold px-2'
}) {
  /*
    R25 — o padrão desta prop era `text-blue-600`: paleta crua morando no
    PADRÃO de um componente compartilhado, fora de qualquer tela do manifesto.
    O check de cor lê os arquivos das telas; uma tela que só usa o padrão
    herdava a dívida sem nenhuma linha de paleta crua no próprio arquivo, e
    o check passava. Por isso a correção é aqui, no padrão, e não em cada
    chamada: o azul não acompanhava o tema escuro.
  */
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  return (
    <div className={className || 'space-y-1'}>
      {items.map((item, index) => (
        <div
          key={item.id || `${item.nome || 'arquivo'}-${index}`}
          className={itemClassName || 'flex items-center justify-between gap-3 rounded border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-sm'}
        >
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{item.nome}</div>
            <div className="text-xs text-[var(--c-muted)]">
              {[item.tipo, formatarTamanhoAnexoPendente(item.tamanho), formatarDataAnexoPendente(item.data)]
                .filter(Boolean)
                .join(' • ')}
            </div>
          </div>
          {typeof onRemove === 'function' && (
            <button
              type="button"
              className={removeButtonClassName}
              onClick={() => onRemove(index)}
              aria-label={`Remover ${item.nome || 'arquivo'}`}
            >
              Remover
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
