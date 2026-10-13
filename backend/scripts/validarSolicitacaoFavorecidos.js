'use strict';
const assert = require('node:assert/strict');
const { normalizarFavorecidos, resumirTitulosDivididos, dividirRateios } = require('../src/services/solicitacaoFavorecidosDomain');
const { paraCentavos } = require('../src/services/contratoParcelasService');
const { PIX_TEXTO_MAX } = require('../src/utils/pix');
const linha = (favorecido_id, valor, contrato_parcela_id) => ({ favorecido_id, forma_pagamento_id: 1, valor,
  ...(contrato_parcela_id == null ? {} : { contrato_parcela_id }), favorecido_chave_pix: 'pix@qa' });
assert.deepEqual(normalizarFavorecidos(undefined, { valorTotal: 1000 }), [], 'Legado sem divisao intacto');
assert.equal(normalizarFavorecidos([linha(1, 600), linha(2, 400)], { valorTotal: 1000 }).length, 2);
assert.equal(normalizarFavorecidos([linha(1, 0.1), linha(2, 0.2)], { valorTotal: 0.3 }).length, 2, 'Soma decimal exata');
assert.throws(() => normalizarFavorecidos([linha(1, 600), linha(2, 399.99)], { valorTotal: 1000 }), /soma/);
assert.throws(() => normalizarFavorecidos([linha(1, 0), linha(2, 1000)], { valorTotal: 1000 }), /valor invalido/);
assert.throws(() => normalizarFavorecidos([linha(1, 600), linha(1, 400)], { valorTotal: 1000 }), /repetidos/);
assert.throws(() => normalizarFavorecidos([{ ...linha(1, 600), titulo_financeiro_id: 99 }, linha(2, 400)], { valorTotal: 1000 }), /campos invalidos/);
assert.throws(() => normalizarFavorecidos([linha(1, true), linha(2, 999)], { valorTotal: 1000 }), /valor invalido/);
const parcelas = [{ contrato_parcela_id: 10, valor_medido: 1000 }, { contrato_parcela_id: 20, valor_medido: 500 }];
assert.equal(normalizarFavorecidos([linha(1, 600, 10), linha(2, 400, 10), linha(3, 500, 20)], { parcelas }).length, 3);
assert.throws(() => normalizarFavorecidos([linha(1, 600, 10), linha(2, 900, 20)], { parcelas }), /soma/);
assert.throws(() => normalizarFavorecidos([linha(1, 600, 10), linha(2, 400, 999)], { parcelas }), /parcelas solicitadas/);
assert.throws(() => normalizarFavorecidos([linha(1, 600, 10), linha(2, 400, 10)], { valorTotal: 1000 }), /parcelas solicitadas/);
assert.throws(() => normalizarFavorecidos([{ ...linha(1, 600), boleto_nomes: ['a.pdf'] }, { ...linha(2, 400), boleto_nomes: ['a.pdf'] }], { valorTotal: 1000 }), /repetir/);
assert.equal(normalizarFavorecidos([{ ...linha(1, 600), favorecido_chave_pix: 'x'.repeat(PIX_TEXTO_MAX) }, linha(2, 400)], { valorTotal: 1000 })[0].favorecido_chave_pix.length, PIX_TEXTO_MAX);
assert.throws(() => normalizarFavorecidos([{ ...linha(1, 600), favorecido_chave_pix: 'x'.repeat(PIX_TEXTO_MAX + 1) }, linha(2, 400)], { valorTotal: 1000 }), /limite/);
for (const valor of [true, [1], {}, '1e0', -1]) {
  assert.throws(() => normalizarFavorecidos([{ ...linha(1, 600), favorecido_id: valor }, linha(2, 400)], { valorTotal: 1000 }), /selecione/);
}
const titulo = (valor_original, valor_baixado, valor_saldo, status) => ({ valor_original, valor_baixado, valor_saldo, status });
const abertos = resumirTitulosDivididos([titulo(600, 0, 600, 'ABERTO'), titulo(400, 0, 400, 'ABERTO')]);
assert.equal(abertos.valor_original, 1000); assert.equal(abertos.editavel, true);
const umPago = resumirTitulosDivididos([titulo(600, 600, 0, 'QUITADO'), titulo(400, 0, 400, 'ABERTO')]);
assert.equal(umPago.valor_parcela_reconciliado, 1000, 'Nao redistribuir a parte ainda aberta');
assert.equal(umPago.valor_saldo, 400); assert.equal(umPago.editavel, false); assert.equal(umPago.status, 'PARCIAL');
const menor = resumirTitulosDivididos([titulo(600, 500, 0, 'PARCIAL'), titulo(400, 0, 400, 'ABERTO')]);
assert.equal(menor.valor_parcela_reconciliado, 900, 'Somente diferenca efetiva da parte quitada');
assert.equal(resumirTitulosDivididos([titulo(600, 500, 100, 'PARCIAL'), titulo(400, 0, 400, 'ABERTO')]).valor_parcela_reconciliado, 900, 'Reconciliacao fecha apenas a parte com baixa, nao a parte pendente');
assert.equal(resumirTitulosDivididos([titulo(600, 600, 0, 'QUITADO'), titulo(400, 400, 0, 'QUITADO')]).status, 'QUITADO');
assert.deepEqual(dividirRateios([0.01, 0.01, 0.01], [0.01, 0.01, 0.01]), [[0.01, 0, 0], [0, 0.01, 0], [0, 0, 0.01]]);
assert.throws(() => dividirRateios([600, 400], [999]), /nao fecham/);
assert.throws(() => dividirRateios([0, 1000], [1000]), /invalidos/);
// Deterministico: variedade de linhas/colunas e restos, inclusive valores
// cujos produtos excedem a precisao inteira de Number.
for (let n = 2; n <= 50; n += 1) {
  const partes = Array.from({ length: n }, (_, i) => (i + 1) * 123456789.01);
  const totalCent = partes.reduce((s, v) => s + paraCentavos(v), 0);
  const colunas = [Math.floor(totalCent / 3), Math.floor(totalCent / 7)];
  colunas.push(totalCent - colunas.reduce((s, v) => s + v, 0));
  const matriz = dividirRateios(partes, colunas.map(v => v / 100));
  matriz.forEach((row, i) => assert.equal(row.reduce((s, v) => s + paraCentavos(v), 0), paraCentavos(partes[i])));
  colunas.forEach((v, c) => assert.equal(matriz.reduce((s, row) => s + paraCentavos(row[c]), 0), v));
}
console.log('OK: soma exata por parcela/solicitacao, IDs e campos restritos, boletos distintos, PIX longo, agregado preserva partes abertas. Sem banco.');
