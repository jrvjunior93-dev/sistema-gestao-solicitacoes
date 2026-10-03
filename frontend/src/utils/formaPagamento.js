function normalizar(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

export function tokensFormaPagamento(forma) {
  const dados = forma || {};
  return normalizar([dados.codigo, dados.tipo, dados.nome].filter(Boolean).join(' '))
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
}

export function formaPagamentoEhPix(forma) {
  return tokensFormaPagamento(forma).includes('PIX');
}

export function formaPagamentoEhBoleto(forma) {
  return forma?.gera_boleto === true || tokensFormaPagamento(forma).includes('BOLETO');
}

export function formaPagamentoEhTransferencia(forma) {
  const tokens = tokensFormaPagamento(forma);
  return tokens.includes('TRANSFERENCIA') || tokens.includes('TED') || tokens.includes('DOC');
}

export function chavePixPreferencial(parceiro) {
  if (!parceiro) return '';
  return [
    parceiro.pix_chave_fixa_1,
    parceiro.pix_chave_fixa_2,
    parceiro.pix_chave_variavel
  ].map((chave) => String(chave || '').trim()).find(Boolean) || '';
}
