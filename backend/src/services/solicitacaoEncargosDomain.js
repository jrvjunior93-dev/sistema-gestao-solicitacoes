'use strict';
const { calcularTotalComEncargos } = require('./pagamentoFilaValoresDomain');
// Maiores restos, centavos inteiros: o encargo global nao se repete por parcela.
function distribuirEncargo(total, bases) {
  if (!bases.length || bases.some(v => !Number.isFinite(Number(v)) || Number(v) <= 0 || !Number.isSafeInteger(Math.round(Number(v)*100)))) throw Object.assign(new Error('Principal invalido para distribuir encargos.'), { statusCode: 400 });
  const cents = BigInt(Math.round(total * 100));
  const pesos = bases.map(v => BigInt(Math.round(Number(v) * 100)));
  const soma = pesos.reduce((a,b) => a+b, 0n);
  if (soma <= 0n) throw Object.assign(new Error('Principal invalido para distribuir encargos.'), { statusCode: 400 });
  const rows = pesos.map((p,i) => ({ i, valor: cents*p/soma, resto: cents*p%soma }));
  let sobra = cents - rows.reduce((a,r) => a+r.valor, 0n);
  for (const r of [...rows].sort((a,b) => a.resto === b.resto ? a.i-b.i : a.resto > b.resto ? -1 : 1)) {
    if (sobra > 0n) { r.valor++; sobra--; }
  }
  return rows.map(r => Number(r.valor)/100);
}
function encargosParcelas(payload, bases) {
  const total = calcularTotalComEncargos(0, { juros: payload.juros, multa: payload.multa });
  const juros = distribuirEncargo(total.juros, bases), multa = distribuirEncargo(total.multa, bases);
  return bases.map((_,i) => ({ juros: juros[i], multa: multa[i] }));
}
module.exports = { encargosParcelas };
