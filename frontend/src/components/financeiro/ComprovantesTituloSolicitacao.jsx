import { listarComprovantesFila } from '../../utils/comprovantesFila';

export default function ComprovantesTituloSolicitacao({ titulo, onAbrir }) {
  const comprovantes = (titulo.filaPagamentosManuais || []).flatMap(listarComprovantesFila);
  for (const arquivo of titulo.comprovantesSolicitacao || []) {
    comprovantes.push({ id: `solicitacao-${arquivo.id}`, nome: arquivo.nome_original,
      caminhoSolicitacao: arquivo.caminho_arquivo });
  }
  if (!comprovantes.length) return <span className="text-[var(--c-muted)]">Pendente</span>;
  return <div className="flex max-w-60 flex-col items-start gap-1">
    {comprovantes.map((comprovante) => (
      <button key={`${comprovante.filaId}-${comprovante.id || 'legado'}`}
        type="button" className="btn btn-outline btn-sm max-w-full"
        title={comprovante.caminhoSolicitacao ? `Comprovante vinculado à solicitação: ${comprovante.nome}` : comprovante.nome}
        onClick={() => onAbrir(comprovante.filaId, comprovante.id, comprovante.caminhoSolicitacao, comprovante.nome)}>
        <span className="min-w-0 truncate">{comprovante.caminhoSolicitacao ? 'Solicitação · ' : ''}{comprovante.nome}</span>
      </button>
    ))}
  </div>;
}
