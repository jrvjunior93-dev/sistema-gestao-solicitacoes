'use strict';
function falhar(message) { const error = new Error(message); error.statusCode = 400; throw error; }
const cents = value => Math.round(Number(value || 0) * 100);
// Distribuicao em centavos: o ultimo cheque recebe o residuo, sem criar titulos
// derivados nem alterar o principal/identidade da autorizacao do proprietario.
function distribuirCheques(parcelas, totalPago, valores) {
  if (!Array.isArray(parcelas) || !parcelas.length || parcelas.length > 60) falhar('Informe entre 1 e 60 cheques.');
  const total = cents(totalPago);
  const pesos = parcelas.map(parcela => cents(parcela.valor_pago));
  if (pesos.some(valor => !Number.isSafeInteger(valor) || valor <= 0) || pesos.reduce((a, b) => a + b, 0) !== total) {
    falhar('A soma dos cheques deve ser igual ao valor pago do titulo.');
  }
  const usados = new Set();
  const totais = ['juros', 'multa', 'desconto'].map(key => cents(valores[key]));
  const acumulado = [0, 0, 0];
  return parcelas.map((parcela, index) => {
    const chave = parcela.usar_cheque_terceiro ? `carteira:${parcela.cheque_terceiro_id}`
      : `proprio:${parcela.cheque_numero}:${parcela.cheque_banco || ''}:${parcela.cheque_agencia || ''}:${parcela.cheque_conta || ''}`;
    if (usados.has(chave)) falhar('O mesmo cheque nao pode ser usado mais de uma vez.');
    usados.add(chave);
    const rateio = totais.map((valor, i) => {
      const result = index === parcelas.length - 1 ? valor - acumulado[i] : Number(BigInt(valor) * BigInt(pesos[index]) / BigInt(total));
      acumulado[i] += result; return result;
    });
    const principal = pesos[index] - rateio[0] - rateio[1] + rateio[2];
    if (principal <= 0) falhar('Cada cheque deve liquidar principal positivo. Confira valores e encargos.');
    return { ...parcela, valor: principal / 100, juros: rateio[0] / 100, multa: rateio[1] / 100, desconto: rateio[2] / 100 };
  });
}
function conferirChequesUnicosLote(itens) {
  const usados = new Set();
  for (const item of itens) for (const cheque of item.parcelas_cheque || [item]) {
    if (!cheque.cheque_terceiro_id && !cheque.cheque_numero) continue;
    const key = cheque.usar_cheque_terceiro ? `carteira:${cheque.cheque_terceiro_id}`
      : `proprio:${item.conta_bancaria_id}:${cheque.cheque_numero}:${cheque.cheque_banco || ''}:${cheque.cheque_agencia || ''}:${cheque.cheque_conta || ''}`;
    if (usados.has(key)) falhar('O mesmo cheque nao pode pagar mais de um item/parcela no lote.');
    usados.add(key);
  }
}
module.exports = { distribuirCheques, conferirChequesUnicosLote };
