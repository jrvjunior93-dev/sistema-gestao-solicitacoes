export default function ComprasPlaceholder({
  titulo,
  descricao,
  mostrarAguardando = true
}) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">{titulo}</h1>
        <p className="page-subtitle">{descricao}</p>
      </div>

      <div className="card space-y-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2">
            <h2 className="text-base font-semibold text-[var(--c-text)]">
              Módulo Compras
            </h2>
            <p className="text-sm text-[var(--c-muted)] max-w-3xl">
              A espinha dorsal do módulo foi integrada ao sistema atual com rotas,
              permissões e serviços. As telas operacionais detalhadas serão acopladas
              na próxima etapa, sobre a mesma base já preparada no backend.
            </p>
          </div>

          {mostrarAguardando && (
            <span className="inline-flex items-center rounded-full border border-[var(--c-border)] px-3 py-1 text-xs font-medium text-[var(--c-muted)]">
              Implantação em etapas
            </span>
          )}
        </div>

        <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface-soft)] p-4">
          <p className="text-sm text-[var(--c-text)]">
            Esta página já está reservada no sistema em produção para o módulo de compras.
          </p>
        </div>
      </div>
    </div>
  );
}
