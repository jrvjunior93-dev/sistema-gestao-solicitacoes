export default function PaginacaoConsulta({ pagina = 1, paginas = 1, total = 0, ocupado, aoMudar }) {
  const atual = Math.min(Math.max(1, pagina), Math.max(1, paginas));
  return <nav aria-label="Paginação da consulta" className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
    <span aria-live="polite">{total} registro(s) · Página {atual} de {Math.max(1, paginas)}</span>
    <div className="flex gap-2">
      <button type="button" className="btn btn-outline btn-sm" disabled={ocupado || atual <= 1} onClick={() => aoMudar(atual - 1)}>Anterior</button>
      <button type="button" className="btn btn-outline btn-sm" disabled={ocupado || atual >= paginas} onClick={() => aoMudar(atual + 1)}>Próxima</button>
    </div>
  </nav>;
}
