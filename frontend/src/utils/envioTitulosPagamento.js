// A autorizacao nao e uma baixa. Ambos os envios usam titulos abertos e o backend
// revalida saldo, dossie e fila dentro da transacao antes de encaminhar.
export function tituloElegivelParaEnvioPagamento(titulo) {
  return String(titulo?.tipo).toUpperCase() === 'PAGAR'
    && ['ABERTO', 'PARCIAL'].includes(String(titulo?.status).toUpperCase())
    && Number(titulo?.valor_saldo) > 0
    && !(titulo?.filaPagamentosManuais || []).some((item) =>
      ['PENDENTE', 'NAO_PAGO', 'DIVERGENTE'].includes(String(item.status).toUpperCase()));
}
