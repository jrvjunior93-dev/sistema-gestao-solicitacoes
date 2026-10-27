'use strict';
// Services reais com modelos/transacoes em memoria; sem .env, SQL, AWS ou APIs.
const assert = require('node:assert/strict');
const { h, reset, fila, input } = require('./validarCartaoParcelamentoBaixa');
const { validateManualPaymentQueueProcessBody: validate } = require('../src/validators/paymentValidators');
const { state, req, registro, cartoes } = h;
const cents = value => Math.round(Number(value) * 100);
const sum = rows => rows.reduce((total, row) => total + cents(row.valor_total), 0);
function setup(values = [35000]) {
  reset();
  if (!cartoes.some(card => card.id === 11)) cartoes.push({ ...cartoes[0], id: 11, nome: 'Credito QA repetido' });
  for (const card of cartoes.filter(card => [10, 11].includes(card.id))) {
    Object.assign(card, { ativo: true, dia_fechamento: 10, dia_vencimento: 20 });
  }
  state.titulos = values.map((value, index) => registro({ ...state.titulos[0], id: index + 1,
    codigo: `TIT-REPETIDO-${index + 1}`, valor_original: value, valor_saldo: value, valor_baixado: 0 }));
  state.titulos.forEach(titulo => h.colocarNaFila(titulo));
  return values.map((valor_pago, index) => ({ fila_id: index + 1, valor_pago,
    data_baixa: '2026-10-27', conta_bancaria_id: 5 }));
}
const part = (cartao_id, valor_pago, data_compra, quantidade_parcelas = 12) => ({
  cartao_id, valor_pago, parcelamento_cartao: { quantidade_parcelas, data_compra }
});
const individual = (itens, componentes, key) => validate({ idempotency_key: key,
  itens: itens.map(item => ({ ...item, forma_pagamento_id: 1, parcelas_cartao: componentes })) });
const shared = (itens, componentes, key) => validate({ idempotency_key: key, itens,
  instrumentos_lote: { tipo: 'CARTAO', forma_pagamento_id: 1, componentes } });
function checkParts(expected, titleId = 1) {
  const moves = state.movimentos.filter(row => row.tipo_movimento === 'BAIXA' && row.titulo_financeiro_id === titleId);
  assert.equal(moves.length, expected.length);
  assert.equal(new Set(moves.map(row => row.cartao_baixa_chave)).size, expected.length);
  expected.forEach((item, index) => {
    const move = moves[index];
    assert.equal(move.cartao_id, item.cartao_id);
    const rows = state.parcelas.filter(row => row.movimento_financeiro_id === move.id);
    assert.equal(rows.length, item.parcelamento_cartao.quantidade_parcelas);
    assert(rows.every(row => row.data_compra === item.parcelamento_cartao.data_compra));
    assert.equal(rows.reduce((total, row) => total + cents(row.valor), 0), cents(item.valor_pago));
  });
}
async function main() {
  // Caso informado: tres passagens, duas no mesmo cartao em dias diferentes.
  let itens = setup();
  const parts = [part(10, 10000, '2026-10-26'), part(11, 10000, '2026-10-23'), part(11, 15000, '2026-10-22')];
  let body = individual(itens, parts, 'qa-repetido-tres-passagens');
  await fila.registrarBaixasFila(req, body);
  checkParts(parts);
  assert.equal(state.parcelas.length, 36); assert.equal(state.faturas.length, 24);
  assert.equal(sum(state.faturas), 3500000); assert.equal(state.titulos[0].valor_saldo, 0);
  const snapshot = JSON.stringify([state.movimentos, state.parcelas, state.faturas, state.grupos]);
  await fila.registrarBaixasFila(req, body);
  assert.equal(JSON.stringify([state.movimentos, state.parcelas, state.faturas, state.grupos]), snapshot);
  const modified = JSON.parse(JSON.stringify(body)); modified.itens[0].parcelas_cartao[1].parcelamento_cartao.data_compra = '2026-10-24';
  await assert.rejects(fila.registrarBaixasFila(req, modified), /Chave|chave/);
  assert.equal(JSON.stringify([state.movimentos, state.parcelas, state.faturas, state.grupos]), snapshot);
  // Fatura paga bloqueia o estorno de todo o grupo; depois, estorno restaura saldo.
  req.user.scope = [99];
  await assert.rejects(fila.estornarBaixaFila(req, 1, { motivo: 'QA ACL', idempotency_key: 'qa-estorno-sem-escopo' }), /Acesso negado/);
  req.user.scope = null;
  state.faturas[0].status = 'PAGA';
  await assert.rejects(fila.estornarBaixaFila(req, 1, { motivo: 'QA', idempotency_key: 'qa-estorno-repetido' }), /fatura|processamento posterior/);
  assert(state.movimentos.every(row => row.status === 'ATIVO'));
  state.faturas[0].status = 'ABERTA';
  await fila.estornarBaixaFila(req, 1, { motivo: 'QA', idempotency_key: 'qa-estorno-repetido' });
  assert.equal(state.titulos[0].valor_saldo, 35000);
  assert(state.parcelas.every(row => row.status === 'ESTORNADA')); assert.equal(sum(state.faturas), 0);

  // Compras ate identicas sao passagens distintas; so o reenvio do grupo e replay.
  itens = setup([2000]);
  const sameDay = [part(10, 1000, '2026-10-23'), part(10, 1000, '2026-10-23')];
  body = individual(itens, sameDay, 'qa-mesmo-dia-mesmo-valor');
  await fila.registrarBaixasFila(req, body); checkParts(sameDay);
  assert.equal(state.parcelas.length, 24); assert.equal(state.faturas.length, 12); assert.equal(sum(state.faturas), 200000);
  await fila.registrarBaixasFila(req, body); assert.equal(state.movimentos.length, 2); assert.equal(state.parcelas.length, 24);

  // Mesmo cartao antes/depois do fechamento, com quantidades de parcelas diferentes.
  itens = setup([300]);
  body = individual(itens, [part(10, 100, '2026-10-09', 2), part(10, 200, '2026-10-11', 3)], 'qa-fechamentos-distintos');
  await fila.registrarBaixasFila(req, body); checkParts(body.itens[0].parcelas_cartao);
  assert.deepEqual(state.faturas.map(row => row.competencia).sort(), ['2026-10', '2026-11', '2026-12', '2027-01']);
  assert.equal(sum(state.faturas), 30000);

  // Baixa em massa mantem cada componente, inclusive atraves do rateio entre titulos.
  itens = setup([10000, 25000]);
  body = shared(itens, parts, 'qa-lote-mesmo-cartao');
  await fila.registrarBaixasFila(req, body);
  assert.equal(state.movimentos.length, 6); assert.equal(state.parcelas.length, 72);
  assert.equal(state.faturas.length, 24); assert.equal(sum(state.faturas), 3500000);
  assert.equal(new Set(state.movimentos.map(row => row.cartao_baixa_chave)).size, 6);
  assert.deepEqual(Array.from(state.grupos[0].dados.componentes, row => row.cartao_id), [10, 11, 11]);
  assert(state.titulos.every(row => row.valor_saldo === 0));
  await fila.registrarBaixasFila(req, body); assert.equal(state.movimentos.length, 6); assert.equal(state.parcelas.length, 72);

  // Fatura fechada na segunda passagem: rollback desfaz a primeira tambem.
  itens = setup([300]);
  state.faturas.push(registro({ id: 1, cartao_id: 10, competencia: '2026-11', status: 'FECHADA', valor_total: 0 }));
  body = individual(itens, [part(10, 100, '2026-10-09', 1), part(10, 200, '2026-10-11', 1)], 'qa-rollback-passagens');
  await assert.rejects(fila.registrarBaixasFila(req, body), /fechada|aberta|processada/);
  assert.equal(state.movimentos.length, 0); assert.equal(state.parcelas.length, 0); assert.equal(state.grupos.length, 0);
  assert.equal(state.faturas.length, 1); assert.equal(state.titulos[0].valor_saldo, 300);

  // Controles anteriores continuam ativos.
  itens = setup([2000]);
  body = individual(itens, sameDay, 'qa-controles-passagens');
  req.user.scope = [99];
  await assert.rejects(h.isolated.exports.baixarTitulo(req, 1, input({ valor: 2000 })), /Acesso negado/);
  assert.equal(state.movimentos.length, 0); req.user.scope = null;
  h.formas[0].permite_parcelamento = false;
  try { await assert.rejects(fila.registrarBaixasFila(req, body), /nao permite parcelamento/); }
  finally { h.formas[0].permite_parcelamento = true; }
  cartoes[0].ativo = false;
  try { await assert.rejects(fila.registrarBaixasFila(req, body), /cartao ativo/); }
  finally { cartoes[0].ativo = true; }
  assert.equal(state.movimentos.length, 0);
  await assert.rejects(fila.registrarBaixasFila(req, individual(itens,
    [part(10, 1000, '2026-10-23'), part(10, 999, '2026-10-23')], 'qa-soma-invalida')), /Soma|soma/);
  assert.throws(() => individual(itens, [part(10, 2000, '2026-02-30')], 'qa-data-invalida'));
  assert.equal(state.movimentos.length, 0);
  console.log('OK: mesmo cartao em datas diferentes/iguais, compras identicas, caso35000/36parcelas, lote/rateio, fechamento, replay sem duplicacao, chave alterada, estorno/fatura paga, rollback, ACL, cartao ativo e somas. Sem banco ou rede.');
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { main };
