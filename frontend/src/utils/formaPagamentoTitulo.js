// Apresentacao apenas: nunca usar esta previsao para escolher a forma da baixa.
const ROTULOS = {
  DINHEIRO: 'Dinheiro', PIX: 'Pix', CARTAO: 'Cartão', TRANSFERENCIA: 'Transferência',
  BOLETO: 'Boleto', CHEQUE: 'Cheque', PERMUTA: 'Permuta', BENS: 'Bens', OUTROS: 'Outros'
};

export function apresentarFormaPagamentoTitulo(titulo) {
  const forma = titulo?.formaPagamento;
  if (titulo?.forma_pagamento_id || forma?.id || forma?.nome || forma?.codigo) {
    return { nome: forma?.nome || '', codigo: forma?.codigo || '', sub: forma?.codigo || '', prevista: false };
  }
  const codigos = titulo?.tipo === 'RECEBER' && titulo.origem_titulo === 'COMERCIAL'
    && Array.isArray(titulo.formas_recebimento_previstas_contrato)
    ? [...new Set(titulo.formas_recebimento_previstas_contrato.filter(v => typeof v === 'string')
      .map(v => v.trim().toUpperCase()).filter(Boolean))].sort() : [];
  return {
    nome: codigos.map(codigo => ROTULOS[codigo] || codigo).join(' / '),
    codigo: codigos.join(' / '),
    sub: codigos.length ? 'Prevista no contrato' : '',
    prevista: codigos.length > 0
  };
}
