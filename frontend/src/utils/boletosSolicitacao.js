const TIPOS = ['BOLETO', 'BOLETO_COMPRA', 'BOLETO_FRETE'];
export function tipoBoletoSolicitacao(arquivo) {
  return String(arquivo?.tipo || '').trim().toUpperCase();
}
export function ehBoletoSolicitacao(arquivo) {
  return TIPOS.includes(tipoBoletoSolicitacao(arquivo)) && !arquivo?.deleted_at;
}
export function rotuloBoletoSolicitacao(arquivo) {
  return { BOLETO: 'Boleto da solicitação', BOLETO_COMPRA: 'Boleto da compra', BOLETO_FRETE: 'Boleto do frete' }[tipoBoletoSolicitacao(arquivo)] || 'Boleto';
}
