// Mascara posicional: substituir dia/mes/ano nunca desloca os outros campos.
const POSICOES = [0, 1, 3, 4, 6, 7, 8, 9];
export function editarDataBR(texto, inicio, fim, insercao = '', apagar = '') {
  const slots = '__/__/____'.split('');
  for (const p of POSICOES) if (/\d/.test(texto[p] || '')) slots[p] = texto[p];
  let cursor = Math.max(0, Math.min(10, inicio ?? 0));
  const final = Math.max(cursor, Math.min(10, fim ?? cursor));
  for (const p of POSICOES) if (p >= cursor && p < final) slots[p] = '_';
  if (apagar && cursor === final) {
    const p = apagar === 'atras' ? POSICOES.filter(p => p < cursor).at(-1) : POSICOES.find(p => p >= cursor);
    if (p != null) { slots[p] = '_'; cursor = p; }
  }
  // Colagem de ISO ou DD/MM/AAAA completo substitui o campo, nao concatena anos.
  let valor = String(insercao || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) valor = `${valor.slice(8)}/${valor.slice(5, 7)}/${valor.slice(0, 4)}`;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(valor)) {
    return { texto: valor, cursor: 10 };
  }
  const digitos = valor.replace(/\D/g, '');
  for (const digito of digitos) {
    const p = POSICOES.find(p => p >= cursor);
    if (p == null) break;
    slots[p] = digito; cursor = p + 1;
    if (cursor === 2 || cursor === 5) cursor++;
  }
  return { texto: slots.some(c => /\d/.test(c)) ? slots.join('') : '', cursor };
}
