export function parseDateSmart(valor) {
  if (!valor) return null;

  const texto = String(valor).trim();
  const matchDateOnly = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (matchDateOnly) {
    const ano = Number(matchDateOnly[1]);
    const mes = Number(matchDateOnly[2]) - 1;
    const dia = Number(matchDateOnly[3]);
    const dataLocal = new Date(ano, mes, dia, 12, 0, 0, 0);
    return Number.isNaN(dataLocal.getTime()) ? null : dataLocal;
  }

  const data = new Date(texto);
  return Number.isNaN(data.getTime()) ? null : data;
}

export function formatarDataLocalPtBr(valor) {
  const data = parseDateSmart(valor);
  if (!data) return '-';
  return data.toLocaleDateString('pt-BR');
}

export function timestampOrdenacaoData(valor) {
  const texto = String(valor || '').trim();
  const matchDateOnly = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (matchDateOnly) {
    const ano = Number(matchDateOnly[1]);
    const mes = Number(matchDateOnly[2]);
    const dia = Number(matchDateOnly[3]);
    return (ano * 10000) + (mes * 100) + dia;
  }

  const data = new Date(texto);
  const ts = data.getTime();
  return Number.isNaN(ts) ? null : ts;
}
