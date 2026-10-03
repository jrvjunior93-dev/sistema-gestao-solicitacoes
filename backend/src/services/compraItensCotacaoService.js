function chaveItem(tipo, id) {
  const numero = Number(id);
  return ['CADASTRADO', 'MANUAL'].includes(tipo) && Number.isInteger(numero) && numero > 0
    ? `${tipo}:${numero}` : null;
}

function obterChavesItensEmCotacao(cotacoes, itens, manuais) {
  const chaves = new Set();
  const elegiveisSemSelecao = [
    ...itens.filter((item) => !item.status_aprovacao || item.status_aprovacao === 'APROVADO')
      .map((item) => chaveItem('CADASTRADO', item.id)),
    ...manuais.filter((item) => !item.status_aprovacao || item.status_aprovacao === 'APROVADO')
      .map((item) => chaveItem('MANUAL', item.id))
  ].filter(Boolean);

  for (const cotacao of cotacoes) {
    if (['CANCELADA', 'CANCELADO'].includes(String(cotacao.status || '').toUpperCase())) continue;
    const selecionados = cotacao.itensSelecionados || [];
    if (!selecionados.length) {
      // Cotacoes antigas sem selecao explicita enviavam todos os itens cotaveis.
      elegiveisSemSelecao.forEach((chave) => chaves.add(chave));
      continue;
    }
    for (const selecionado of selecionados) {
      const tipo = String(selecionado.item_tipo || '').toUpperCase();
      const id = tipo === 'MANUAL'
        ? selecionado.solicitacao_compra_item_manual_id
        : selecionado.solicitacao_compra_item_id;
      const chave = chaveItem(tipo, id);
      if (chave) chaves.add(chave);
    }
  }
  return chaves;
}

module.exports = { obterChavesItensEmCotacao };
