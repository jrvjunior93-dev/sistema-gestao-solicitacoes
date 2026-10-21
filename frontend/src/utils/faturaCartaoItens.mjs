// Projecao de leitura: nao recalcula a fatura nem modifica o payload da API.
export function itensDaFatura(fatura = {}) {
  const linhas = [];
  const vistos = new Set();
  const titulos = new Map((fatura?.titulos || []).map(titulo => [String(titulo.id), titulo]));
  const adicionar = linha => {
    if (vistos.has(linha.id)) return;
    vistos.add(linha.id);
    linhas.push(linha);
  };

  (fatura?.titulos || []).forEach((titulo, index) => adicionar({
    id: `titulo:${titulo.id ?? `indice-${index}`}`,
    titulo,
    tituloId: titulo.id,
    dataCompra: titulo.data_compra || null,
    numeroParcela: titulo.numero_parcela,
    quantidadeParcelas: titulo.total_parcelas,
    valorNestaFatura: titulo.valor_original
  }));

  (fatura?.compras_rateadas || []).forEach((item, index) => {
    const tituloId = item.titulo_financeiro_id ?? item.titulo?.id;
    const titulo = { ...titulos.get(String(tituloId)), ...item.titulo };
    // Um titulo pode ter varias partes legitimas na mesma fatura. Nao deduplicar
    // por titulo: a identidade e da parcela ou do movimento que gerou a parte.
    const parcela = item.parcela_cartao_id ?? (String(item.id || '').startsWith('parcela-') ? item.id : null);
    adicionar({
      id: parcela != null ? `parcela:${parcela}` : `movimento:${item.id ?? `indice-${index}`}`,
      titulo,
      tituloId,
      dataCompra: item.data_compra || item.data_movimento || titulo.data_compra || null,
      numeroParcela: item.numero_parcela,
      quantidadeParcelas: item.quantidade_parcelas,
      // Nunca usar o valor integral do titulo para uma parcela/rateio, nem
      // mesmo quando a parcela vale zero ou o total do titulo esta disponivel.
      valorNestaFatura: item.valor_quitacao
    });
  });
  return linhas;
}

export function parcelaDaFatura(linha) {
  return linha.numeroParcela && linha.quantidadeParcelas
    ? `${linha.numeroParcela}/${linha.quantidadeParcelas}` : '—';
}
