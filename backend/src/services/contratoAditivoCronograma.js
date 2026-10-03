'use strict';

const { paraCentavos } = require('./contratoParcelasService');
const { normalizarDataIso } = require('./contratoAditivoVigencia');

function lerCronograma(valor) {
  if (Array.isArray(valor)) return valor;
  if (typeof valor !== 'string' || !valor.trim()) return [];
  try {
    const json = JSON.parse(valor);
    return Array.isArray(json) ? json : [];
  } catch {
    return [];
  }
}

/**
 * Valida o cronograma financeiro separado da vigencia contratual. Os vencimentos podem ocorrer
 * durante ou depois da execucao; o que precisa fechar e a soma em centavos e a sequencia das
 * parcelas. Datas repetidas sao aceitas quando fizerem parte da negociacao.
 */
function validarCronogramaParcelas({ parcelas, totalCent, maximoParcelas }) {
  const lista = lerCronograma(parcelas);
  const maximo = Number(maximoParcelas);

  if (lista.length === 0) {
    return { valida: false, mensagem: 'Adicione ao menos uma parcela ao cronograma do aditivo.' };
  }
  if (Number.isInteger(maximo) && maximo >= 0 && lista.length > maximo) {
    return {
      valida: false,
      mensagem: `O cronograma deste aditivo aceita no maximo ${maximo} parcela(s).`
    };
  }

  const normalizadas = [];
  for (const [indice, parcela] of lista.entries()) {
    const numero = Number(parcela?.numero);
    const valorCent = paraCentavos(parcela?.valor);
    const vencimento = normalizarDataIso(parcela?.vencimento);
    if (numero !== indice + 1 || !Number.isFinite(valorCent) || valorCent <= 0 || !vencimento) {
      return { valida: false, mensagem: `Parcela ${indice + 1} do cronograma invalida.` };
    }
    normalizadas.push({ numero, valor: valorCent / 100, valor_cent: valorCent, vencimento });
  }

  const esperadoCent = Number(totalCent);
  const somaCent = normalizadas.reduce((acc, parcela) => acc + parcela.valor_cent, 0);
  if (!Number.isSafeInteger(esperadoCent) || esperadoCent <= 0 || somaCent !== esperadoCent) {
    return {
      valida: false,
      mensagem: 'A soma das parcelas deve ser exatamente igual ao valor distribuido no aditivo.',
      soma_cent: somaCent,
      esperado_cent: esperadoCent
    };
  }

  return {
    valida: true,
    parcelas: normalizadas.map(({ valor_cent: _valorCent, ...parcela }) => parcela),
    soma_cent: somaCent
  };
}

module.exports = { lerCronograma, validarCronogramaParcelas };
