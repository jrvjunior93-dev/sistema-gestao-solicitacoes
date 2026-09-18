import assert from 'node:assert/strict';
import {
  comentariosDaEtapa,
  comentariosDoItem,
  comentariosDoItemPedido
} from '../src/pages/SolicitacaoDetalhe/comentariosCompra.js';

const comentarios = [
  { id: 1, escopo: 'ITEM', referencia_id: 88, item_tipo: 'CADASTRADO', descricao: 'Na análise GEO' },
  { id: 2, escopo: 'ITEM', referencia_id: 88, item_tipo: 'MANUAL', descricao: 'Outro item de mesmo ID' },
  { id: 3, escopo: 'ITEM_APROVADO', referencia_id: 88, item_tipo: 'CADASTRADO', descricao: 'Após aprovação' },
  { id: 4, escopo: 'COTACAO', referencia_id: 12, descricao: 'Comentário geral da cotação' },
  { id: 5, escopo: 'PEDIDO_ITEM', referencia_id: 501, descricao: 'No pedido' },
  { id: 6, escopo: 'ENTREGA', referencia_id: 501, descricao: 'Na entrega' },
  { id: 7, escopo: 'PEDIDO', referencia_id: 21, descricao: 'Comentário geral do pedido' },
  { id: 8, escopo: 'ITEM', referencia_id: 89, item_tipo: 'CADASTRADO', descricao: 'Outro item' },
  { id: 9, escopo: 'PEDIDO_ITEM', referencia_id: 503, descricao: 'Em outro pedido do mesmo item' }
];

const item = { id: 88, item_tipo: 'CADASTRADO' };
const pedidos = [{ itens: [
  { id: 501, solicitacao_compra_item_id: 88 },
  { id: 502, solicitacao_compra_item_manual_id: 88 },
  { id: 503, solicitacao_compra_item_id: 88 }
] }];
assert.deepEqual(comentariosDoItem(comentarios, item, pedidos).map(({ id }) => id), [1, 3, 5, 6, 9]);
assert.deepEqual(comentariosDoItemPedido(comentarios, {
  id: 501, solicitacao_compra_item_id: 88
}, pedidos).map(({ id }) => id), [1, 3, 5, 6, 9]);
assert.deepEqual(comentariosDoItemPedido(comentarios, {
  id: 502, solicitacao_compra_item_manual_id: 88
}, pedidos).map(({ id }) => id), [2]);
assert.deepEqual(comentariosDoItemPedido(comentarios, { id: 501 }).map(({ id }) => id), [5, 6]);
assert.deepEqual(comentariosDaEtapa(comentarios, 'COTACAO', 12).map(({ id }) => id), [4]);
assert.deepEqual(comentariosDaEtapa(comentarios, 'PEDIDO', 21).map(({ id }) => id), [7]);

console.log('Continuidade dos comentários por item e isolamento por etapa: OK');
