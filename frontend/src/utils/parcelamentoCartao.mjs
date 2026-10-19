export function previaParcelasCartao(cartao, config, valor) {
  const count = Number(config?.quantidade_parcelas ?? 1);
  const data = config?.data_compra;
  if (!cartao || String(cartao.tipo).toUpperCase() !== 'CREDITO') throw Error('Selecione um cartão de crédito.');
  if (!Number.isInteger(count) || count < 1 || count > 60) throw Error('Informe de 1 a 60 parcelas.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data || '') || Number(data.slice(0, 4)) < 1900) throw Error('Informe a data completa da compra.');
  const compra = new Date(`${data}T12:00:00Z`);
  if (Number.isNaN(compra.getTime()) || compra.toISOString().slice(0, 10) !== data) throw Error('Data da compra inválida.');
  const closing = Number(cartao.dia_fechamento), due = Number(cartao.dia_vencimento);
  if (![closing, due].every(day => Number.isInteger(day) && day >= 1 && day <= 31)) throw Error('Configure fechamento e vencimento do cartão.');
  const cents = Math.round(Number(valor) * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents < count) throw Error('Confira o valor pago e a quantidade de parcelas.');
  const base = Math.floor(cents / count), rest = cents % count;
  const month = compra.getUTCMonth() + (compra.getUTCDate() <= closing ? 0 : 1);
  const atDay = (offset, day) => {
    const first = new Date(Date.UTC(compra.getUTCFullYear(), offset, 1, 12));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0, 12)).getUTCDate();
    return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, last), 12)).toISOString().slice(0, 10);
  };
  return Array.from({ length: count }, (_, index) => ({ numero_parcela: index + 1, quantidade_parcelas: count,
    competencia: atDay(month + index, 1).slice(0, 7),
    data_fechamento: atDay(month + index, closing), data_vencimento: atDay(month + index + (due > closing ? 0 : 1), due),
    valor: (base + (index < rest ? 1 : 0)) / 100 }));
}

export const chaveBaixaCartao = () => globalThis.crypto.randomUUID();
export const comCalendarioCartao = (value, cartao) => ({ ...value,
  calendario: { dia_fechamento: Number(cartao?.dia_fechamento), dia_vencimento: Number(cartao?.dia_vencimento) } });

// Espelha apenas os valores pagos do rateio canonico. Encargos/principal seguem
// calculados no backend; a previa precisa somar as parcelas de CADA titulo.
export function valoresRateadosCartoes(valoresTitulos, componentes) {
  const cents = value => Math.round(Number(value) * 100);
  const saldos = componentes.map(item => cents(item.valor_pago));
  const titulos = valoresTitulos.map(cents);
  if (!Number.isSafeInteger(titulos.reduce((s,v)=>s+v,0)) || !Number.isSafeInteger(saldos.reduce((s,v)=>s+v,0))) throw Error('Total acima do limite monetário seguro.');
  if ([...saldos, ...titulos].some(v => !Number.isSafeInteger(v) || v <= 0)
    || titulos.reduce((s,v)=>s+v,0) !== saldos.reduce((s,v)=>s+v,0)) throw Error('Feche a soma dos cartões para conferir as parcelas.');
  const result = componentes.map(() => []);
  for (const total of titulos) {
    const soma = saldos.reduce((s,v)=>s+v,0);
    const partes = saldos.map(peso => Number(BigInt(total) * BigInt(peso) / BigInt(soma)));
    let resto = total - partes.reduce((s,v)=>s+v,0);
    const ordem = saldos.map((peso,index)=>({index,resto:BigInt(total)*BigInt(peso)%BigInt(soma)}))
      .sort((a,b)=>a.resto===b.resto?a.index-b.index:a.resto>b.resto?-1:1);
    for (const item of ordem) if (resto && partes[item.index] < saldos[item.index]) { partes[item.index]++; resto--; }
    partes.forEach((valor,index)=>{saldos[index]-=valor;if(valor)result[index].push(valor/100);});
  }
  return result;
}
