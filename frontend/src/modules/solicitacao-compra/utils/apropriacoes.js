const DISTRIBUICAO_TOLERANCIA = 0.01;

export function parseQuantidade(value) {
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

export function formatarQuantidade(value) {
  const quantidade = parseQuantidade(value);
  return quantidade.toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(quantidade) ? 0 : 2,
    maximumFractionDigits: 4
  });
}

export function criarRateioBase(quantidade = '') {
  return {
    apropriacao_id: '',
    quantidade_apropriada: quantidade ? String(quantidade) : ''
  };
}

function resolverApropriacaoId(rateio) {
  return rateio?.apropriacao_id || rateio?.apropriacao?.id || rateio?.id_apropriacao || '';
}

export function normalizarRateiosEntrada(item) {
  if (Array.isArray(item?.apropriacoes) && item.apropriacoes.length > 0) {
    return item.apropriacoes.map((rateio) => ({
      apropriacao_id: resolverApropriacaoId(rateio) ? String(resolverApropriacaoId(rateio)) : '',
      quantidade_apropriada:
        rateio?.quantidade_apropriada !== null && rateio?.quantidade_apropriada !== undefined
          ? String(rateio.quantidade_apropriada)
          : ''
    }));
  }

  if (item?.apropriacao_id) {
    return [
      {
        apropriacao_id: String(item.apropriacao_id),
        quantidade_apropriada:
          item?.quantidade !== null && item?.quantidade !== undefined ? String(item.quantidade) : ''
      }
    ];
  }

  return [];
}

export function sincronizarItemComRateios(item) {
  const rateios = normalizarRateiosEntrada(item).filter(
    (rateio) => rateio.apropriacao_id || rateio.quantidade_apropriada
  );

  return {
    ...item,
    apropriacoes: rateios,
    apropriacao_id: rateios[0]?.apropriacao_id || ''
  };
}

export function aplicarApropriacaoUnica(item, apropriacaoId) {
  if (!apropriacaoId) {
    return {
      ...item,
      apropriacao_id: '',
      apropriacoes: []
    };
  }

  return sincronizarItemComRateios({
    ...item,
    apropriacoes: [
      {
        apropriacao_id: String(apropriacaoId),
        quantidade_apropriada: item?.quantidade ? String(item.quantidade) : ''
      }
    ]
  });
}

export function calcularResumoRateios(item) {
  const total = parseQuantidade(item?.quantidade);
  const distribuido = normalizarRateiosEntrada(item).reduce(
    (acc, rateio) => acc + parseQuantidade(rateio.quantidade_apropriada),
    0
  );
  const saldo = Number((total - distribuido).toFixed(4));

  return {
    total,
    distribuido: Number(distribuido.toFixed(4)),
    saldo,
    fechado: Math.abs(saldo) <= DISTRIBUICAO_TOLERANCIA && total > 0
  };
}

export function validarRateiosItem(item) {
  const total = parseQuantidade(item?.quantidade);
  if (total <= 0) {
    return { ok: false, mensagem: 'Informe uma quantidade maior que zero.' };
  }

  const rateios = normalizarRateiosEntrada(item);
  if (!rateios.length) {
    return { ok: false, mensagem: 'Informe ao menos uma apropriação.' };
  }

  const apropriacoesUsadas = new Set();

  for (const rateio of rateios) {
    const apropriacaoId = String(rateio.apropriacao_id || '').trim();
    const quantidade = parseQuantidade(rateio.quantidade_apropriada);

    if (!apropriacaoId) {
      return { ok: false, mensagem: 'Preencha todas as apropriações do item.' };
    }

    if (apropriacoesUsadas.has(apropriacaoId)) {
      return { ok: false, mensagem: 'Não repita a mesma apropriação no item.' };
    }

    if (quantidade <= 0) {
      return { ok: false, mensagem: 'A quantidade apropriada deve ser maior que zero.' };
    }

    apropriacoesUsadas.add(apropriacaoId);
  }

  const resumo = calcularResumoRateios(item);
  if (!resumo.fechado) {
    return {
      ok: false,
      mensagem: `A distribuicao precisa fechar a quantidade total. Saldo atual: ${formatarQuantidade(resumo.saldo)}`
    };
  }

  return { ok: true };
}

export function encontrarApropriacaoPorId(catalogo, apropriacaoId) {
  return (catalogo || []).find((apropriacao) => Number(apropriacao.id) === Number(apropriacaoId)) || null;
}

export function montarLinhasResumoApropriacao(item, catalogo = []) {
  if (Array.isArray(item?.apropriacao_linhas) && item.apropriacao_linhas.length > 0) {
    return item.apropriacao_linhas.filter(Boolean);
  }

  if (Array.isArray(item?.apropriacoes) && item.apropriacoes.length > 0) {
    return item.apropriacoes.map((rateio) => {
      const apropriacao = rateio?.apropriacao || encontrarApropriacaoPorId(catalogo, rateio?.apropriacao_id);
      const nome =
        apropriacao?.descricao ||
        apropriacao?.nome ||
        apropriacao?.codigo ||
        (rateio?.apropriacao_id ? `Apropriacao ${rateio.apropriacao_id}` : 'Apropriacao');

      return `${nome}: ${formatarQuantidade(rateio?.quantidade_apropriada)}`;
    });
  }

  if (item?.apropriacao_label) {
    return [item.apropriacao_label];
  }

  if (item?.apropriacao?.codigo || item?.apropriacao?.descricao || item?.apropriacao?.nome) {
    return [item.apropriacao?.descricao || item.apropriacao?.nome || item.apropriacao?.codigo];
  }

  if (item?.apropriacao_id) {
    const apropriacao = encontrarApropriacaoPorId(catalogo, item.apropriacao_id);
    const nome = apropriacao?.descricao || apropriacao?.nome || apropriacao?.codigo || `Apropriacao ${item.apropriacao_id}`;
    const quantidade = item?.quantidade_apropriada ?? item?.quantidade;
    return [quantidade ? `${nome}: ${formatarQuantidade(quantidade)}` : nome];
  }

  return [];
}

export function montarTextoResumoApropriacao(item, catalogo = []) {
  const linhas = montarLinhasResumoApropriacao(item, catalogo);
  return linhas.length ? linhas.join(' | ') : '-';
}
