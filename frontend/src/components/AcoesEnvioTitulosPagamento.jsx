export default function AcoesEnvioTitulosPagamento({ ids = [], podeAutorizar = false,
  podeFila = false, autorizacaoDisponivel = false, enviando = false, aoEnviar }) {
  return <div className="app-actionbar">
    {podeAutorizar && <button type="button" className="btn btn-outline btn-sm"
      disabled={enviando || !ids.length || !autorizacaoDisponivel}
      title={!autorizacaoDisponivel ? 'Autorização digital indisponível ou pausada.' : undefined}
      onClick={() => aoEnviar('AUTORIZACAO', ids)}>
      {enviando ? 'Enviando...' : 'Enviar para autorização'}
    </button>}
    {podeFila && <button type="button" className="btn btn-outline btn-sm"
      disabled={enviando || !ids.length} onClick={() => aoEnviar('FILA', ids)}>
      {enviando ? 'Enviando...' : 'Enviar para fila de pagamentos'}
    </button>}
  </div>;
}
