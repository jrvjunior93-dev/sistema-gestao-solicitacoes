'use strict';
const crypto = require('node:crypto');
const cents = value => Math.round(Number(value || 0) * 100);
function falhar(message) { const error = new Error(message); error.statusCode = 400; throw error; }
function inteiro(value) {
  const result = cents(value);
  if (!Number.isSafeInteger(result) || result < 0 || result > 99999999999999) falhar('Valor financeiro invalido.');
  return result;
}
// Cada linha e coluna fecha em centavos. O residuo vai aos maiores restos;
// linhas seguintes usam o saldo dos instrumentos, sem recriar seus valores.
function repartir(total, pesos) {
  const soma = pesos.reduce((a, b) => a + b, 0);
  if (!soma || total > soma) falhar('Soma dos instrumentos diferente do total pago.');
  const result = pesos.map(peso => Number(BigInt(total) * BigInt(peso) / BigInt(soma)));
  let restante = total - result.reduce((a, b) => a + b, 0);
  const ordem = pesos.map((peso, index) => ({ index, resto: BigInt(total) * BigInt(peso) % BigInt(soma) }))
    .sort((a, b) => a.resto === b.resto ? a.index - b.index : a.resto > b.resto ? -1 : 1);
  for (const { index } of ordem) if (restante && result[index] < pesos[index]) { result[index]++; restante--; }
  if (restante) falhar('Nao foi possivel fechar o rateio.');
  return result;
}
function planejarRateioFila(itens, componentes) {
  if (!itens?.length || itens.length > 200 || !componentes?.length || componentes.length > 60) falhar('Limite de titulos/instrumentos excedido.');
  const valores = itens.map(item => inteiro(item.valor_pago));
  const saldos = componentes.map(item => inteiro(item.valor_pago));
  if (!Number.isSafeInteger(valores.reduce((a, b) => a + b, 0)) || !Number.isSafeInteger(saldos.reduce((a, b) => a + b, 0))) falhar('Total do lote acima do limite monetario seguro.');
  if (valores.some(value => !value) || saldos.some(value => !value) || valores.reduce((a, b) => a + b, 0) !== saldos.reduce((a, b) => a + b, 0)) {
    falhar('A soma dos instrumentos deve ser igual ao total pago dos titulos.');
  }
  const alocacoes = itens.map((item, index) => {
    const partes = repartir(valores[index], saldos);
    const encargos = ['juros', 'multa', 'desconto'].map(key => {
      const total = inteiro(item[key]);
      // Encargos podem superar uma parte; nao sao capacidades financeiras.
      const soma = partes.reduce((a, b) => a + b, 0);
      const result = partes.map(peso => Number(BigInt(total) * BigInt(peso) / BigInt(soma)));
      let resto = total - result.reduce((a, b) => a + b, 0);
      for (let i = partes.length - 1; i >= 0 && resto; i--) if (partes[i]) { result[i] += resto; resto = 0; }
      return result;
    });
    return partes.flatMap((pago, componente) => {
      saldos[componente] -= pago;
      if (!pago) return [];
      const principal = pago - encargos[0][componente] - encargos[1][componente] + encargos[2][componente];
      if (principal <= 0) falhar('Cada parte deve liquidar principal positivo. Confira valores e encargos.');
      return [{ fila_id: item.fila_id, componente, valor_pago: pago / 100, valor: principal / 100,
        juros: encargos[0][componente] / 100, multa: encargos[1][componente] / 100, desconto: encargos[2][componente] / 100 }];
    });
  });
  if (alocacoes.flat().length > 1000) falhar('Rateio acima de 1000 movimentos. Divida o lote.');
  return alocacoes;
}
function hashLiquidacao(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
module.exports = { planejarRateioFila, hashLiquidacao };
