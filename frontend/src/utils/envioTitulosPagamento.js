// A autorizacao nao e uma baixa. Ambos os envios usam titulos abertos e o backend
// revalida saldo, dossie e fila dentro da transacao antes de encaminhar.
export function tituloElegivelParaEnvioPagamento(titulo) {
  return String(titulo?.tipo).toUpperCase() === 'PAGAR'
    && ['ABERTO', 'PARCIAL'].includes(String(titulo?.status).toUpperCase())
    && Number(titulo?.valor_saldo) > 0
    && !(titulo?.filaPagamentosManuais || []).some((item) =>
      ['PENDENTE', 'NAO_PAGO', 'DIVERGENTE'].includes(String(item.status).toUpperCase()));
}

// Somente o contrato dono pode complementar a lista da solicitacao. O resumo
// vem do titulo no backend, nunca de situacao/valor da parcela na tela.
export function titulosParaEnvioComContrato(titulos, dadosContrato, solicitacaoId) {
  const porId = new Map((titulos || []).map(titulo => [Number(titulo.id), titulo]));
  if (dadosContrato?.contrato?.fluxo_novo
    && String(dadosContrato.contrato.solicitacao_id) === String(solicitacaoId)) {
    for (const parcela of dadosContrato.parcelas || []) {
      const titulo = parcela.titulo_pagamento;
      if (titulo?.id && Number(titulo.id) === Number(parcela.titulo_financeiro_id)) {
        porId.set(Number(titulo.id), { ...porId.get(Number(titulo.id)), ...titulo });
      }
    }
  }
  return [...porId.values()];
}
