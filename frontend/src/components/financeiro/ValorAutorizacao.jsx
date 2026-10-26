const moeda = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export function conferirValorAutorizacao(item, valor) {
  const texto = String(valor ?? item.valor_snapshot);
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(texto) || Number(texto) <= 0 || Number(texto) > Number(item.valor_snapshot)) {
    throw Error('Informe um valor maior que zero e até o valor enviado para autorização.');
  }
  const s = item.snapshot_json || {};
  if (Number(texto) <= Number(s.juros || 0) + Number(s.multa || 0)) throw Error('O valor deve cobrir os encargos e parte do principal.');
  return Number(texto);
}
export default function ValorAutorizacao({ item, value, onChange, disabled }) {
  const original = Number(item.valor_snapshot), atual = Number(value ?? original);
  return <div className="pa-valor-autorizacao">
    <label>Valor a autorizar<input type="number" inputMode="decimal" min="0.01" step="0.01" max={original}
      aria-label={`Valor a autorizar de ${item.snapshot_json?.codigo || item.titulo_financeiro_id}`}
      value={value ?? original.toFixed(2)} disabled={disabled} onChange={e => onChange(e.target.value)} /></label>
    {atual > 0 && atual < original && <small>Valor editado pelo proprietário · {moeda(original - atual)} permanece pendente no título. O valor original será preservado.</small>}
  </div>;
}
