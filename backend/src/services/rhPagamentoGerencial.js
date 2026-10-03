'use strict';

// Regra gerencial: divisor fixo de 30, teto no mensal e reconhecimento integral
// quando todos os dias do calendario da competencia foram informados.
function baseMensalProporcional(salario, dias, competencia) {
  const valor = Number(salario);
  const quantidade = Number(dias);
  const [ano, mes] = String(competencia || '').split('-').map(Number);
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  if (!(valor >= 0) || !Number.isInteger(quantidade) || quantidade < 0
    || !Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12
    || quantidade > ultimoDia) {
    throw new Error('Base proporcional gerencial invalida.');
  }
  const calculado = quantidade === ultimoDia ? valor : Math.min(valor, valor * quantidade / 30);
  return Math.round((calculado + Number.EPSILON) * 100) / 100;
}

module.exports = { baseMensalProporcional };
