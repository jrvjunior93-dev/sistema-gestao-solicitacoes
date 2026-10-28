import { inputPrice, merchandise } from './decimalCompras.js';

// A digitacao pode estar incompleta/invalida. Mostrar pendencia, nunca derrubar a tela.
// Esta adaptacao e apenas visual: a API continua rejeitando dados invalidos.
export function previewMercadorias(items) {
  const errors = [];
  const rows = items.map((item, index) => {
    try { return { ...item, price: inputPrice(item.price) }; }
    catch (error) { errors.push(`Item ${index + 1}: ${error.message}`); return { ...item, price: '0' }; }
  });
  try { return { ...merchandise(rows), errors }; }
  catch (error) { return { total: 0, lines: rows.map(() => 0), errors: [...errors, error.message] }; }
}
