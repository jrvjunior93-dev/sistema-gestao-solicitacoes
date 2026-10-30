'use strict';
const { sumMoney } = require('../utils/decimalCompras');
const plain = value => value?.toJSON ? value.toJSON() : value;
const instante = value => { const t = value ? new Date(value).getTime() : NaN; return Number.isFinite(t) ? t : 0; };

// Projecao de registros atuais. Nunca reconstruir tokens ou uma versao original inexistente.
function montarHistoricoPropostasCompra(compraId, pedidos = []) {
  return pedidos.map(plain)
    .filter(p => Number(p.solicitacao_compra_id) === Number(compraId))
    .sort((a, b) => instante(a.createdAt) - instante(b.createdAt) || Number(a.id) - Number(b.id))
    .map(p => {
      const fechamento = plain(p.fechamento);
      const rodadaValida = fechamento && Number(fechamento.solicitacao_compra_id) === Number(compraId);
      const itens = (p.itens || []).map(plain).map(i => {
        const resposta = plain(i.respostaItem);
        const cotacao = plain(resposta?.cotacaoFornecedor);
        const atualizadaDepois = resposta?.updatedAt && p.createdAt
          ? new Date(resposta.updatedAt).getTime() > new Date(p.createdAt).getTime() : false;
        return {
          pedido_item_id: i.id,
          item_tipo: i.item_tipo || null,
          solicitacao_compra_item_id: i.solicitacao_compra_item_id || null,
          solicitacao_compra_item_manual_id: i.solicitacao_compra_item_manual_id || null,
          resposta_item_id: i.resposta_item_id || null,
          cotacao_fornecedor_id: cotacao?.id || null,
          descricao: i.descricao || 'Descricao nao registrada',
          unidade: i.unidade || null,
          quantidade: i.quantidade_pedido ?? null,
          preco_unitario: i.preco_unitario ?? null,
          valor_total: i.valor_total ?? null,
          removido: Boolean(i.removido),
          quantidade_cancelada: i.quantidade_cancelada ?? null,
          resposta_atualizada_apos_pedido: Boolean(atualizadaDepois)
        };
      });
      return {
        recuperado: true,
        fonte: 'REGISTROS_ATUAIS_DO_PEDIDO',
        pedido_id: p.id,
        fechamento_id: p.fechamento_id || null,
        rodada: rodadaValida ? fechamento.numero_rodada : null,
        tipo_fechamento: rodadaValida ? fechamento.tipo : null,
        status_pedido: p.status || null,
        fornecedor_nome: p.fornecedor?.nome || 'Fornecedor nao identificado',
        criado_em: p.createdAt || null,
        atualizado_em: p.updatedAt || null,
        autor_id: p.criado_por || null,
        autor_nome: p.criador?.nome || null,
        condicao_pagamento_pedido: p.condicao_pagamento || null,
        valor_atual_pedido: p.valor_total ?? null,
        soma_itens_registrados: itens.every(i => i.valor_total !== null)
          ? (itens.length ? sumMoney(itens.map(i => i.valor_total)) : null) : null,
        itens
      };
    });
}
module.exports = { montarHistoricoPropostasCompra };
