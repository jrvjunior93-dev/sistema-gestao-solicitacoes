const FONTE_RATEIO_TITULO = 'RATEIO_TITULO';
const FONTE_RATEIO_SOLICITACAO = 'RATEIO_SOLICITACAO';
const FONTE_APROPRIACAO_TITULO = 'APROPRIACAO_TITULO';
const FONTE_APROPRIACAO_SOLICITACAO = 'APROPRIACAO_SOLICITACAO';
const FONTE_SEM_APROPRIACAO = 'SEM_APROPRIACAO';

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundCurrency(value) {
  return Number(asNumber(value).toFixed(2));
}

function apropriacaoEhSomadora(apropriacao) {
  return apropriacao?.somadora === true || Number(apropriacao?.somadora) === 1;
}

function somarOrcamentoAnalitico(apropriacoes = []) {
  return roundCurrency(
    (Array.isArray(apropriacoes) ? apropriacoes : [])
      .filter((apropriacao) => !apropriacaoEhSomadora(apropriacao))
      .reduce((total, apropriacao) => total + asNumber(apropriacao?.valor_orcado), 0)
  );
}

function pesoRateio(item) {
  const valor = asNumber(item?.valor_rateio);
  if (valor > 0) return valor;

  const percentual = asNumber(item?.percentual);
  if (percentual > 0) return percentual;

  const quantidade = asNumber(item?.quantidade);
  if (quantidade > 0) return quantidade;

  return 0;
}

function normalizarRateios(rateios = []) {
  const agrupados = new Map();

  for (const item of Array.isArray(rateios) ? rateios : []) {
    const apropriacaoId = Number(item?.apropriacao_id || item?.apropriacao?.id || 0) || null;
    const obraId = Number(item?.obra_id || item?.apropriacao?.obra_id || 0) || null;
    const peso = pesoRateio(item);
    if (peso <= 0) continue;

    const chave = `${obraId || 'OBRA_PADRAO'}:${apropriacaoId || 'SEM_APROPRIACAO'}`;
    const atual = agrupados.get(chave) || {
      apropriacao_id: apropriacaoId,
      obra_id: obraId,
      peso: 0
    };
    atual.peso += peso;
    agrupados.set(chave, atual);
  }

  return Array.from(agrupados.values());
}

function fonteSimples(fonte, apropriacaoId, obraId = null) {
  const id = Number(apropriacaoId || 0) || null;
  if (!id) return null;
  return {
    fonte,
    rateios: [{ apropriacao_id: id, obra_id: Number(obraId || 0) || null, peso: 1 }]
  };
}

function selecionarFonteApropriacao({ titulo = null, solicitacao = null } = {}) {
  // Uma unica fonte e escolhida por lancamento. Fontes mais especificas impedem
  // que o mesmo valor seja somado novamente pelos vinculos de fallback.
  const rateiosTitulo = normalizarRateios(titulo?.rateios);
  if (rateiosTitulo.length > 0) {
    return { fonte: FONTE_RATEIO_TITULO, rateios: rateiosTitulo };
  }

  const rateiosSolicitacao = normalizarRateios(solicitacao?.apropriacoes);
  if (rateiosSolicitacao.length > 0) {
    return { fonte: FONTE_RATEIO_SOLICITACAO, rateios: rateiosSolicitacao };
  }

  return fonteSimples(FONTE_APROPRIACAO_TITULO, titulo?.apropriacao_id, titulo?.obra_id)
    || fonteSimples(FONTE_APROPRIACAO_SOLICITACAO, solicitacao?.apropriacao_id, solicitacao?.obra_id)
    || {
      fonte: FONTE_SEM_APROPRIACAO,
      rateios: [{ apropriacao_id: null, obra_id: Number(titulo?.obra_id || solicitacao?.obra_id || 0) || null, peso: 1 }]
    };
}

function distribuirCentavos(valor, fonteApropriacao) {
  const centavos = Math.round(roundCurrency(valor) * 100);
  const rateios = fonteApropriacao?.rateios || [];
  const pesoTotal = rateios.reduce((total, item) => total + asNumber(item.peso), 0);

  if (centavos <= 0 || rateios.length === 0 || pesoTotal <= 0) {
    return [];
  }

  const calculados = rateios.map((item, indice) => {
    const exato = centavos * asNumber(item.peso) / pesoTotal;
    const base = Math.floor(exato);
    return {
      ...item,
      indice,
      centavos: base,
      fracao: exato - base
    };
  });

  let restante = centavos - calculados.reduce((total, item) => total + item.centavos, 0);
  const ordemResto = [...calculados].sort((a, b) => b.fracao - a.fracao || a.indice - b.indice);
  for (let indice = 0; indice < restante; indice += 1) {
    ordemResto[indice % ordemResto.length].centavos += 1;
  }

  return calculados
    .sort((a, b) => a.indice - b.indice)
    .map(({ indice, fracao, centavos: valorCentavos, ...item }) => ({
      ...item,
      valor: valorCentavos / 100,
      fonte: fonteApropriacao.fonte
    }));
}

function distribuirPorApropriacao({ valor, titulo = null, solicitacao = null } = {}) {
  return distribuirCentavos(
    valor,
    selecionarFonteApropriacao({ titulo, solicitacao })
  );
}

module.exports = {
  FONTE_RATEIO_TITULO,
  FONTE_RATEIO_SOLICITACAO,
  FONTE_APROPRIACAO_TITULO,
  FONTE_APROPRIACAO_SOLICITACAO,
  FONTE_SEM_APROPRIACAO,
  apropriacaoEhSomadora,
  distribuirPorApropriacao,
  normalizarRateios,
  selecionarFonteApropriacao,
  somarOrcamentoAnalitico
};
