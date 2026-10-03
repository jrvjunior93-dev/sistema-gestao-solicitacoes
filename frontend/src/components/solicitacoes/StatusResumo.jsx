/**
 * StatusResumo — faixa de contadores de status no topo da listagem.
 *
 * Props:
 *   items : Array<{ label: string, quantidade: number, cor?: string }>
 *
 * Se nenhum item for passado, renderiza os defaults visuais (0).
 */

const DEFAULTS = [
  { label: 'Pendente',   quantidade: 0 },
  { label: 'Em análise', quantidade: 0 },
  { label: 'Aprovada',   quantidade: 0 },
  { label: 'Concluída',  quantidade: 0 },
];

export default function StatusResumo({ items = DEFAULTS }) {
  return (
    <div className="flex flex-wrap gap-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex min-w-[130px] flex-1 flex-col gap-1 rounded-xl border px-4 py-3"
          style={{
            background: 'var(--ui-surface)',
            borderColor: 'var(--ui-border)',
            boxShadow: 'var(--ui-shadow-sm)',
          }}
        >
          <p className="text-xs font-medium" style={{ color: 'var(--c-muted)' }}>
            {item.label}
          </p>
          <p
            className="text-3xl font-bold leading-none"
            style={{ color: item.cor ?? 'var(--c-text)' }}
          >
            {item.quantidade ?? 0}
          </p>
        </div>
      ))}
    </div>
  );
}
