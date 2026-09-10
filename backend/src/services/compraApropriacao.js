const DISTRIBUICAO_TOLERANCIA = 0.01;

function parseQuantidade(value) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const normalized = String(value).replace(/\s+/g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatarQuantidade(value) {
  const quantidade = parseQuantidade(value);
  return quantidade.toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(quantidade) ? 0 : 2,
    maximumFractionDigits: 4
  });
}

function obterRateiosCarregados(item, options = {}) {
  const quantidadeFallback = parseQuantidade(options.quantidadeFallback ?? item?.quantidade);

  if (Array.isArray(item?.apropriacoes) && item.apropriacoes.length > 0) {
    return item.apropriacoes.map((rateio) => ({
      id: rateio.id || null,
      apropriacao_id: Number(rateio.apropriacao_id || rateio.apropriacao?.id || 0) || null,
      quantidade_apropriada: parseQuantidade(rateio.quantidade_apropriada),
      apropriacao: rateio.apropriacao || null
    }));
  }

  if (item?.apropriacao_id || item?.apropriacao?.id) {
    return [
      {
        id: null,
        apropriacao_id: Number(item.apropriacao_id || item.apropriacao?.id || 0) || null,
        quantidade_apropriada: quantidadeFallback,
        apropriacao: item.apropriacao || null
      }
    ];
  }

  return [];
}

function construirResumoApropriacoes(item, options = {}) {
  const rateios = obterRateiosCarregados(item, options);
  const linhas = rateios.map((rateio) => {
    const nome =
      rateio.apropriacao?.descricao ||
      rateio.apropriacao?.nome ||
      rateio.apropriacao?.codigo ||
      (rateio.apropriacao_id ? `Apropriacao ${rateio.apropriacao_id}` : 'Apropriacao');

    return `${nome}: ${formatarQuantidade(rateio.quantidade_apropriada)}`;
  });

  return {
    rateios,
    linhas,
    texto: linhas.length ? linhas.join(' | ') : '-'
  };
}

function extrairRateiosPayload(item) {
  if (Array.isArray(item?.apropriacoes) && item.apropriacoes.length > 0) {
    return item.apropriacoes.map((rateio) => ({
      apropriacao_id: Number(rateio?.apropriacao_id || 0) || null,
      quantidade_apropriada: parseQuantidade(rateio?.quantidade_apropriada)
    }));
  }

  if (item?.apropriacao_id) {
    return [
      {
        apropriacao_id: Number(item.apropriacao_id) || null,
        quantidade_apropriada: parseQuantidade(item?.quantidade)
      }
    ];
  }

  return [];
}

function validarRateiosPayload({ rateios, quantidadeTotal }) {
  const total = parseQuantidade(quantidadeTotal);
  if (total <= 0) {
    return { ok: false, mensagem: 'Quantidade do item deve ser maior que zero.' };
  }

  if (!Array.isArray(rateios) || rateios.length === 0) {
    return { ok: false, mensagem: 'Informe ao menos uma apropriacao para o item.' };
  }

  const apropriacoesUsadas = new Set();
  let distribuido = 0;

  for (const rateio of rateios) {
    const apropriacaoId = Number(rateio?.apropriacao_id || 0);
    const quantidadeApropriada = parseQuantidade(rateio?.quantidade_apropriada);

    if (!apropriacaoId) {
      return { ok: false, mensagem: 'Todas as linhas de apropriacao precisam de uma apropriacao valida.' };
    }

    if (apropriacoesUsadas.has(apropriacaoId)) {
      return { ok: false, mensagem: 'Nao repita a mesma apropriacao no mesmo item.' };
    }

    if (quantidadeApropriada <= 0) {
      return { ok: false, mensagem: 'A quantidade apropriada deve ser maior que zero.' };
    }

    apropriacoesUsadas.add(apropriacaoId);
    distribuido += quantidadeApropriada;
  }

  const saldo = Number((total - distribuido).toFixed(4));
  if (Math.abs(saldo) > DISTRIBUICAO_TOLERANCIA) {
    return {
      ok: false,
      mensagem: `A distribuicao do item precisa fechar a quantidade total. Saldo atual: ${formatarQuantidade(saldo)}`
    };
  }

  return {
    ok: true,
    distribuido: Number(distribuido.toFixed(4)),
    saldo
  };
}

module.exports = {
  DISTRIBUICAO_TOLERANCIA,
  construirResumoApropriacoes,
  extrairRateiosPayload,
  formatarQuantidade,
  obterRateiosCarregados,
  parseQuantidade,
  validarRateiosPayload
};
