function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function asNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundQty(value) {
  return Number(asNumber(value).toFixed(3));
}

function obterReferenciaItem(registro) {
  return {
    itemTipo: normalizeText(registro?.item_tipo),
    itemReferenciaId: Number(
      registro?.item_referencia_id
      || registro?.solicitacao_compra_item_id
      || registro?.solicitacao_compra_item_manual_id
      || 0
    )
  };
}

function buildCompraItemKey(registro) {
  const { itemTipo, itemReferenciaId } = obterReferenciaItem(registro);
  return `${itemTipo}:${itemReferenciaId}`;
}

function buildCompraFornecedorItemKey(fornecedorCompraId, registro) {
  return `${Number(fornecedorCompraId || 0)}:${buildCompraItemKey(registro)}`;
}

function montarMapaAlocacoesAtivasPorItem(alocacoes = []) {
  const mapa = new Map();

  for (const alocacao of alocacoes || []) {
    if (normalizeText(alocacao?.status) !== 'ATIVA') continue;
    const key = buildCompraItemKey(alocacao);
    mapa.set(key, roundQty((mapa.get(key) || 0) + asNumber(alocacao.quantidade_alocada)));
  }

  return mapa;
}

function montarMapaAlocacoesAtivasPorFornecedorItem(alocacoes = []) {
  const mapa = new Map();

  for (const alocacao of alocacoes || []) {
    if (normalizeText(alocacao?.status) !== 'ATIVA') continue;
    const key = buildCompraFornecedorItemKey(alocacao.fornecedor_compra_id, alocacao);
    mapa.set(key, roundQty((mapa.get(key) || 0) + asNumber(alocacao.quantidade_alocada)));
  }

  return mapa;
}

function montarMapaAlocacoesAtivasPorResposta(alocacoes = []) {
  const mapa = new Map();

  for (const alocacao of alocacoes || []) {
    if (normalizeText(alocacao?.status) !== 'ATIVA') continue;
    const respostaItemId = Number(alocacao?.resposta_item_id || 0);
    if (!respostaItemId) continue;
    mapa.set(
      respostaItemId,
      roundQty((mapa.get(respostaItemId) || 0) + asNumber(alocacao.quantidade_alocada))
    );
  }

  return mapa;
}

function isOfertaSaldo(registro) {
  return normalizeText(registro?.escopo_disponibilidade) === 'OFERTA_SALDO';
}

function calcularDisponibilidadeFornecedorItem({
  fornecedorCompraId,
  item,
  quantidadeDisponivel,
  mapaAlocacoesFornecedorItem,
  mapaAlocacoesResposta
}) {
  const key = buildCompraFornecedorItemKey(fornecedorCompraId, item);
  const respostaItemId = Number(item?.id || item?.resposta_item_id || 0);
  const quantidadeAlocada = roundQty(
    isOfertaSaldo(item)
      ? (respostaItemId ? mapaAlocacoesResposta?.get(respostaItemId) || 0 : 0)
      : mapaAlocacoesFornecedorItem?.get(key) || 0
  );
  const quantidadeTotalDisponivel = roundQty(quantidadeDisponivel);

  return {
    key,
    quantidade_alocada: quantidadeAlocada,
    quantidade_disponivel: quantidadeTotalDisponivel,
    saldo_disponivel: roundQty(Math.max(0, quantidadeTotalDisponivel - quantidadeAlocada))
  };
}

function calcularNovaDisponibilidadeLiberada({
  fornecedorCompraId,
  respostasAnteriores = [],
  respostasNovas = [],
  mapaAlocacoesFornecedorItem,
  mapaAlocacoesResposta
}) {
  const disponibilidadesAnteriores = new Map();
  const itens = [];

  for (const resposta of respostasAnteriores || []) {
    disponibilidadesAnteriores.set(
      buildCompraItemKey(resposta),
      calcularDisponibilidadeFornecedorItem({
        fornecedorCompraId,
        item: resposta,
        quantidadeDisponivel: resposta.quantidade_disponivel,
        mapaAlocacoesFornecedorItem,
        mapaAlocacoesResposta
      })
    );
  }

  for (const resposta of respostasNovas || []) {
    const itemKey = buildCompraItemKey(resposta);
    const anterior = disponibilidadesAnteriores.get(itemKey) || { saldo_disponivel: 0 };
    const atual = calcularDisponibilidadeFornecedorItem({
      fornecedorCompraId,
      item: resposta,
      quantidadeDisponivel: resposta.quantidade_disponivel,
      mapaAlocacoesFornecedorItem,
      mapaAlocacoesResposta
    });
    const quantidadeLiberada = roundQty(Math.max(0, atual.saldo_disponivel - anterior.saldo_disponivel));
    if (quantidadeLiberada <= 0) continue;

    itens.push({
      item_key: itemKey,
      quantidade_alocada_anteriormente: atual.quantidade_alocada,
      disponibilidade_anterior: anterior.saldo_disponivel,
      disponibilidade_nova: atual.saldo_disponivel,
      quantidade_liberada: quantidadeLiberada
    });
  }

  return {
    quantidade_liberada_total: roundQty(itens.reduce((total, item) => total + item.quantidade_liberada, 0)),
    itens
  };
}

module.exports = {
  buildCompraFornecedorItemKey,
  buildCompraItemKey,
  calcularDisponibilidadeFornecedorItem,
  calcularNovaDisponibilidadeLiberada,
  montarMapaAlocacoesAtivasPorFornecedorItem,
  montarMapaAlocacoesAtivasPorResposta,
  montarMapaAlocacoesAtivasPorItem,
  isOfertaSaldo,
  roundQty
};
