'use strict';
const assert = require('node:assert/strict');
const domain = require('../src/services/pagamentoAutorizacaoValorDomain');
module.exports = async ({ iniciar, fila, dados, req, validators }) => {
  const preparar = () => {
    iniciar();
    const { filas, titulos } = dados();
    filas[0].autorizacao_valor_json = domain.auditoria({ valor_snapshot: 213, snapshot_json: { juros: 10, multa: 3 } }, 113, 31);
    filas[0].valor_previsto = 100;
    return { filas, titulos };
  };
  const pagar = (valor, key = 'parcial', extra = {}) => fila.registrarBaixasFila(req,
    validators.validateManualPaymentQueueProcessBody({ idempotency_key: key, itens: [{ fila_id: 1, conta_bancaria_id: 5,
      forma_pagamento_id: 2, data_baixa: '2026-10-26', valor_pago: valor, juros: 10, multa: 3, ...extra }] }));
  preparar(); await assert.rejects(pagar(114), /ultrapassa o valor autorizado/);
  assert.equal(dados().movimentos.length, 0); assert.equal(dados().titulos[0].valor_saldo, 200);
  await pagar(113);
  assert.equal(dados().titulos[0].valor_original, 200);
  assert.equal(dados().titulos[0].valor_saldo, 100); assert.equal(dados().titulos[0].status, 'PARCIAL');
  assert.equal(dados().filas[0].status, 'BAIXADO', 'Autorizacao consumida, titulo continua parcial');
  await pagar(113); assert.equal(dados().movimentos.length, 1, 'Retry nao duplica baixa');
  await fila.estornarBaixaFila(req, 1, { motivo: 'Conta errada', idempotency_key: 'parcial-estorno' });
  assert.equal(dados().titulos[0].valor_saldo, 200);
  assert.equal(dados().filas[1].autorizacao_valor_json.limite, 113);
  assert.equal(dados().filas[1].valor_previsto, 100, 'Estorno nao libera o saldo inteiro');
  preparar(); await pagar(63, 'menor', { motivo: 'Pagamento menor que a autorizacao' });
  assert.equal(dados().titulos[0].valor_saldo, 150);
  assert.equal(dados().filas[0].status, 'DIVERGENTE');
  await fila.resolverItemFila(req, 1, { acao: 'REABRIR' });
  assert.equal(dados().filas[1].autorizacao_valor_json.limite, 50, 'Reabertura desconta desembolso ja realizado');
  assert.equal(dados().filas[1].valor_previsto, 50);
  assert.throws(() => domain.conferirPagamento(dados().filas[1], 51), /ultrapassa/);
  assert.equal(dados().filas[0].autorizacao_valor_json.valor_autorizado, 113, 'Registro de origem preservado');
  console.log('OK baixa parcial autorizada: teto antes da escrita, encargos, saldo original, replay, estorno e limite residual na reabertura.');
};
if (require.main === module) require('./validarFilaBaixaEstorno');
