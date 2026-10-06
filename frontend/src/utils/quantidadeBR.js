// Apenas entrada humana pt-BR. Valores canonicos da API/rascunho nao passam
// por este parser: "2.000" vindo de DECIMAL pode representar duas unidades.
export function parseQuantidadeDigitadaBR(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const texto = String(value ?? '').trim();
  if (!texto) return null;
  let normalizado;
  // Itens sao DECIMAL(12,2): preservar as duas casas do campo anterior evita
  // arredondamento silencioso ao persistir uma fracao mais precisa.
  if (/^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(texto)) {
    normalizado = texto.replace(/\./g, '').replace(',', '.');
  } else if (/^[+-]?\d+\.\d{1,2}$/.test(texto)) {
    // Compatibilidade com decimal digitado com ponto (2.50). Um grupo de
    // tres casas, como 2.500, segue a convencao brasileira de milhares.
    normalizado = texto;
  } else {
    return null;
  }
  const quantidade = Number(normalizado);
  return Number.isFinite(quantidade) ? quantidade : null;
}

export function formatarQuantidadeCanonicaBR(value) {
  if (value === '' || value === null || value === undefined) return '';
  const quantidade = Number(value);
  return Number.isFinite(quantidade)
    ? quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 4 })
    : '';
}
