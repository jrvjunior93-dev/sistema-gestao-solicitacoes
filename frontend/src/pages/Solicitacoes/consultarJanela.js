// Reconstitui somente a janela que o usuario ja carregou. O backend aceita
// limites discretos; 75/150/300 seriam silenciosamente tratados como 25.
export async function consultarJanela(params, page, limit, accumulated, request) {
  const base = Number(limit) || 25;
  const count = accumulated ? page * base : base;
  const batch = accumulated ? [25, 50, 100, 200].find(n => n >= count) || 200 : base;
  const items = [];
  let last;
  for (let n = 1; n <= Math.ceil(count / batch); n++) {
    last = await request({ ...params, page: String(accumulated ? n : page), limit: String(batch) });
    const rows = Array.isArray(last) ? last : last?.items || [];
    items.push(...rows);
    if (rows.length < batch) break;
  }
  return { items: items.slice(0, count), meta: last?.meta };
}
