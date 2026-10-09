// A autorizacao nao e uma baixa. Ambos os envios usam titulos abertos e o backend
// revalida saldo, dossie e fila dentro da transacao antes de encaminhar.
export function tituloElegivelParaEnvioPagamento(titulo) {
  return String(titulo?.tipo).toUpperCase() === 'PAGAR'
    && ['ABERTO', 'PARCIAL'].includes(String(titulo?.status).toUpperCase())
    && Number(titulo?.valor_saldo) > 0
    && !(titulo?.filaPagamentosManuais || []).some((item) =>
      ['PENDENTE', 'NAO_PAGO', 'DIVERGENTE'].includes(String(item.status).toUpperCase()));
}

// Indicacao operacional separada do estado financeiro: na fila nao e quitado.
export function rotuloOperacionalPagamento(titulo) {
  if (!titulo || !['ABERTO', 'PARCIAL'].includes(String(titulo.status).toUpperCase()) || Number(titulo.valor_saldo) <= 0) return '';
  const ativa = [...(titulo.filaPagamentosManuais || [])]
    .filter(item => ['PENDENTE', 'NAO_PAGO', 'DIVERGENTE'].includes(String(item.status).toUpperCase()))
    .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))[0];
  if (ativa) return { PENDENTE: 'Na fila', NAO_PAGO: 'Não pago', DIVERGENTE: 'Divergente' }[String(ativa.status).toUpperCase()];
  if (titulo.status_interno_pagar === 'EM ANÁLISE DO PROPRIETÁRIO') return 'Em análise do proprietário';
  return '';
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
