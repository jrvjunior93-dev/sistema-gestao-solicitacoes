'use strict';

function centavos(value, nome) {
  const numero = Number(value ?? 0);
  const cents = Math.round((numero + Number.EPSILON) * 100);
  if (!Number.isFinite(numero) || numero < 0 || !Number.isSafeInteger(cents) || cents > 99999999999999) {
    const error = new Error(`${nome} deve ser um valor monetario nao negativo valido.`);
    error.statusCode = 400;
    throw error;
  }
  return cents;
}

function calcularTotalComEncargos(saldo, dados = {}) {
  const saldoCents = centavos(saldo, 'Saldo');
  const juros = centavos(dados.juros, 'Juros');
  const multa = centavos(dados.multa, 'Multa');
  const totalEsperado = centavos((saldoCents + juros + multa) / 100, 'Total previsto') / 100;
  return { juros: juros / 100, multa: multa / 100, totalEsperado };
}

// Valor pago e o desembolso TOTAL; apenas o principal abate o saldo do titulo.
function calcularValoresFila(valorPago, saldo, dados = {}) {
  const pago = centavos(valorPago, 'Valor pago');
  const saldoCents = centavos(saldo, 'Saldo');
  const encargos = calcularTotalComEncargos(saldo, dados);
  const juros = centavos(encargos.juros, 'Juros');
  const multa = centavos(encargos.multa, 'Multa');
  const principal = pago - juros - multa;
  if (principal <= 0) {
    const error = new Error('Valor pago deve ser maior que a soma de juros e multa.');
    error.statusCode = 400;
    throw error;
  }
  return { principal: principal / 100, ...encargos,
    divergencia: principal < saldoCents ? 'PARCIAL' : principal > saldoCents ? 'ACIMA_SALDO' : '' };
}

function filaSemBaixaAtualizavel(item) {
  return ['PENDENTE', 'NAO_PAGO', 'DIVERGENTE'].includes(item.status)
    && !Number(item.movimento_financeiro_id);
}

module.exports = { calcularValoresFila, calcularTotalComEncargos, filaSemBaixaAtualizavel };
