/**
 * PAGINAÇÃO PADRÃO (R16b, 02/09) — um dono para o rodapé de lista paginada.
 *
 * Nasceu de uma lacuna achada na leva do RH/DP: telas com paginação de
 * servidor reinventavam o rodapé cada uma do seu jeito (`app-page-actions`
 * com dois botões, cor `slate` fixa, texto miúdo), e o único markup pronto
 * estava trancado DENTRO do `ListaAvancada`, sem como ser usado por fora.
 * Vinte rodapés diferentes não é padrão — o componente cresce (R16b).
 *
 * Mostra a POSIÇÃO e o TOTAL, não só as setas: "Página 3 de 12 · 240
 * registros". Sem isso a pessoa não sabe se vale continuar clicando.
 *
 * Uso:
 *   <Paginacao
 *     pagina={pagina}
 *     totalPaginas={totalPaginas}
 *     total={meta.total}
 *     carregando={carregando}
 *     aoMudarPagina={(p) => setFiltros((f) => ({ ...f, page: p }))}
 *   />
 */
export default function Paginacao({
  pagina = 1,
  totalPaginas = 1,
  total,
  rotuloRegistro = 'registro',
  carregando = false,
  aoMudarPagina
}) {
  // Uma página só não precisa de rodapé: dois botões desligados e um texto
  // que não informa nada só ocupam o lugar.
  if (!totalPaginas || totalPaginas <= 1) return null;

  const atual = Math.min(Math.max(1, pagina), totalPaginas);
  const contagem = Number.isFinite(Number(total))
    ? ` · ${total} ${rotuloRegistro}${Number(total) === 1 ? '' : 's'}`
    : '';

  return (
    <nav className="app-paginacao" aria-label="Paginação">
      <button
        type="button"
        className="btn btn-outline"
        disabled={atual <= 1 || carregando}
        onClick={() => aoMudarPagina(atual - 1)}
      >
        Anterior
      </button>
      {/* aria-live: quem navega por teclado ou leitor de tela precisa ouvir
          que a página mudou — o foco continua no mesmo botão. */}
      <span className="app-paginacao-posicao" aria-live="polite">
        Página {atual} de {totalPaginas}{contagem}
      </span>
      <button
        type="button"
        className="btn btn-outline"
        disabled={atual >= totalPaginas || carregando}
        onClick={() => aoMudarPagina(atual + 1)}
      >
        Próxima
      </button>
    </nav>
  );
}
