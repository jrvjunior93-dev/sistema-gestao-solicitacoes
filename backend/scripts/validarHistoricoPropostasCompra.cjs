'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { montarHistoricoPropostasCompra } = require('../src/services/historicoPropostasCompra');
function fixture() {
  const item = (id, resposta, nome, qty, preco, total) => ({ id, resposta_item_id: resposta, descricao: nome,
    quantidade_pedido: qty, preco_unitario: preco, valor_total: total, unidade: 'un',
    respostaItem: { id: resposta, updatedAt: '2026-10-29T17:07:00Z', preco: '999', token: 'NAO_EXPORTAR',
      cotacaoFornecedor: { id: 327, token: 'NAO_EXPORTAR', condicao_pagamento: 'CONDICAO_ATUAL_NAO_ORIGINAL' } } });
  const pedido = (id, rodada, status, total, itens, horario) => ({ id, solicitacao_compra_id: 724,
    fechamento_id: 280 + rodada, fechamento: { id: 280 + rodada, solicitacao_compra_id: 724, numero_rodada: rodada, tipo: 'PARCIAL' },
    fornecedor: { nome: 'Mercado Pago', documento: 'NAO_EXPORTAR' }, criado_por: 15, criador: { nome: 'Comprador' },
    status, valor_total: total, createdAt: horario, itens, token: 'NAO_EXPORTAR' });
  return [
    pedido(315, 3, 'FECHADO_FORNECEDOR', '251.82', [item(909, 2114, 'Cones', '10', '25.1820000000', '251.82')], '2026-10-29T17:07:16Z'),
    pedido(313, 1, 'CANCELADO', '0.00', [item(906, 2110, 'Cones', '10', '25.1820000000', '251.82'),
      item(907, 2111, 'Tela', '50', '2.3998000000', '119.99')], '2026-10-29T16:48:53Z'),
    pedido(314, 2, 'FECHADO_FORNECEDOR', '119.99', [item(908, 2113, 'Tela', '50', '2.3998000000', '119.99')], '2026-10-29T17:05:44Z')
  ];
}
test('SOL6758 conserva tres rodadas, cancelado e itens; nao altera registros nem inventa links', () => {
  const pedidos = fixture(), antes = JSON.stringify(pedidos), r = montarHistoricoPropostasCompra(724, pedidos);
  assert.deepEqual(r.map(p => p.pedido_id), [313, 314, 315]);
  assert.deepEqual(r.map(p => p.rodada), [1, 2, 3]);
  assert.equal(r[0].status_pedido, 'CANCELADO'); assert.equal(r[0].valor_atual_pedido, '0.00');
  assert.equal(r[0].soma_itens_registrados, 371.81); assert.equal(r[0].itens.length, 2);
  assert.equal(r[1].itens[0].preco_unitario, '2.3998000000');
  assert.equal(r[1].itens[0].resposta_atualizada_apos_pedido, true);
  assert.equal(r[2].itens[0].resposta_atualizada_apos_pedido, false);
  assert(!JSON.stringify(r).includes('NAO_EXPORTAR')); assert(!JSON.stringify(r).includes('CONDICAO_ATUAL_NAO_ORIGINAL'));
  assert(r.every(p => p.recuperado && p.fonte === 'REGISTROS_ATUAIS_DO_PEDIDO'));
  assert.equal(JSON.stringify(pedidos), antes);
});
test('ausencias permanecem desconhecidas; nao inferir rodada, condicao ou cotacao por fornecedor', () => {
  const p = fixture()[0]; delete p.fechamento; delete p.itens[0].respostaItem;
  p.itens[0].valor_total = null;
  const [r] = montarHistoricoPropostasCompra(724, [p]);
  assert.equal(r.rodada, null); assert.equal(r.condicao_pagamento_pedido, null);
  assert.equal(r.itens[0].resposta_item_id, 2114); assert.equal(r.itens[0].cotacao_fornecedor_id, null);
  assert.equal(r.soma_itens_registrados, null);
});
test('somente compra autorizada; rodada de outra compra nao e aproveitada', () => {
  const p = fixture()[0]; p.fechamento.solicitacao_compra_id = 999;
  assert.equal(montarHistoricoPropostasCompra(999, [p]).length, 0);
  assert.equal(montarHistoricoPropostasCompra(724, [p])[0].rodada, null);
});
test('Date do ORM ordena por instante, sem ordenar dias da semana; itens removidos preservados', () => {
  const p = fixture(); p[0].createdAt = new Date('2026-10-30T10:00:00Z');
  p[1].createdAt = new Date('2026-10-29T10:00:00Z'); p[2].createdAt = new Date('2026-11-02T10:00:00Z');
  p[0].itens[0].removido = true; p[0].itens[0].quantidade_cancelada = '3.000';
  const r = montarHistoricoPropostasCompra(724, p.map(v => ({ toJSON: () => v })));
  assert.deepEqual(r.map(v => v.pedido_id), [313, 315, 314]);
  assert.equal(r[1].itens[0].removido, true); assert.equal(r[1].itens[0].quantidade_cancelada, '3.000');
});
test('vazio nao cria historia sintetica; zero e diferente de desconhecido', () => {
  assert.deepEqual(montarHistoricoPropostasCompra(724, []), []);
  const p = fixture()[0]; p.itens[0].valor_total = '0.00'; p.condicao_pagamento = '6 parcelas';
  const [r] = montarHistoricoPropostasCompra(724, [p]);
  assert.equal(r.soma_itens_registrados, 0); assert.equal(r.condicao_pagamento_pedido, '6 parcelas');
});
