'use strict';
const { centavos, ratear } = require('./tituloRenegociacaoDomain');
const valor = value => centavos(Number(value || 0).toFixed(2));

function distribuirMovimento(movimento, pesos) {
  const principal = ratear(valor(movimento.valor), pesos);
  const juros = ratear(valor(movimento.juros), pesos);
  const multa = ratear(valor(movimento.multa), pesos);
  const bruto = principal.map((p, i) => p + juros[i] + multa[i]);
  const desconto = ratear(valor(movimento.desconto), bruto);
  const quitacao = bruto.map((v, i) => v - desconto[i]);
  if (quitacao.some(v => v < 0) || quitacao.reduce((s, v) => s + v, 0) !== valor(movimento.valor_quitacao)) {
    throw new Error('Movimento da negociação possui componentes inconsistentes.');
  }
  return pesos.map((_, i) => ({ valor: principal[i] / 100, juros: juros[i] / 100,
    multa: multa[i] / 100, desconto: desconto[i] / 100, valor_quitacao: quitacao[i] / 100 }));
}

// Distribui as baixas pela capacidade RESTANTE de cada origem, em ordem estável.
// A última baixa absorve os centavos residuais. Assim os relatórios por período,
// o saldo por obra e o saldo do contrato usam exatamente a mesma distribuição.
// Estorno recompõe a distribuição usando somente as baixas ainda ativas.
function alocarBaixas(alocacoes, movimentos, valorBaixado) {
  const original = alocacoes.map(a => valor(a.valor));
  const restantes = [...original];
  const porMovimento = new Map();
  const ordenados = [...movimentos].sort((a, b) => Number(a.id) - Number(b.id));
  for (const m of ordenados) {
    const ativo = m.status === 'ATIVO';
    const pesos = ativo ? restantes : original;
    const principal = valor(m.valor);
    if (ativo && principal > restantes.reduce((s, v) => s + v, 0)) {
      throw new Error('Baixas excedem o valor das parcelas negociadas.');
    }
    const parcelas = distribuirMovimento(m, pesos);
    porMovimento.set(Number(m.id), parcelas);
    if (ativo) parcelas.forEach((p, i) => { restantes[i] -= valor(p.valor); });
  }
  const pago = original.map((v, i) => v - restantes[i]);
  if (pago.reduce((s, v) => s + v, 0) !== valor(valorBaixado)) {
    throw new Error('Saldo da negociação diverge das baixas ativas.');
  }
  return { porMovimento, pago: pago.map(v => v / 100), saldo: restantes.map(v => v / 100) };
}

module.exports = { alocarBaixas, distribuirMovimento };
