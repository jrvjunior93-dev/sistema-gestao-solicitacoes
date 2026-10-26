'use strict';
const assert = require('node:assert/strict');
module.exports = async function(h) {
  const { preparar, digital, dono, getState } = h;
  const body = valores => ({ item_ids: [1, 3], valores_autorizados: valores });
  const confirmar = (opcoes, valores) => digital.authorizeSelection(dono, { ...body(valores), selecao_id: opcoes.selecao_id, credential: { id: 'qa' } });
  const valores = [{ item_id: 1, valor: 60 }, { item_id: 3, valor: 10 }];
  await preparar();
  const originais = getState().TituloFinanceiro.map(t => [t.valor_saldo, t.valor_original, t.valor_baixado]);
  const hashes = getState().PagamentoAutorizacaoItem.map(i => [i.snapshot_hash, JSON.stringify(i.snapshot_json)]);
  const opcoes = await digital.selectionOptions(dono, body(valores));
  const antes = JSON.stringify(getState());
  await assert.rejects(confirmar(opcoes, [{ item_id: 1, valor: 61 }, valores[1]]), /selecao ou um dossie mudou/);
  assert.equal(JSON.stringify(getState()), antes, 'Valor adulterado nao grava decisao/fila/counter');
  const nova = await digital.selectionOptions(dono, body(valores));
  await confirmar(nova, valores);
  assert.deepEqual(getState().TituloFinanceiro.map(t => [t.valor_saldo, t.valor_original, t.valor_baixado]), originais);
  assert.deepEqual(getState().PagamentoAutorizacaoItem.map(i => [i.snapshot_hash, JSON.stringify(i.snapshot_json)]), hashes);
  assert.deepEqual(getState().PagamentoManualFilaItem.map(i => i.valor_previsto), [60, 10]);
  assert(getState().PagamentoManualFilaItem.every(i => i.autorizacao_valor_json.usuario_id === 31));
  assert.equal(getState().PagamentoAutorizacaoEvento.filter(e => e.tipo === 'ITEM_AUTORIZADO' && e.dados_json.autorizacao_valor).length, 2);
  await assert.rejects(confirmar(nova, valores), /ja utilizada/);
  for (const valor of [0, -1, NaN, Infinity, true, null, '', '1e1', '2.999', 101]) {
    await preparar();
    await assert.rejects(digital.selectionOptions(dono, body([{ item_id: 1, valor }])), { statusCode: 400 });
    assert.equal(getState().PagamentoManualFilaItem.length, 0);
  }
  await preparar(); getState().PagamentoAutorizador[0].limite_por_lote = 65;
  const limitada = await digital.selectionOptions(dono, body(valores)); await confirmar(limitada, valores);
  // Mesmo contrato assinado tambem na decisao individual/visao por lote.
  await preparar();
  const decisions = [{ item_id: 1, decisao: 'AUTORIZAR', valor_autorizado: 50 }];
  await digital.authenticationOptions(dono, 1, decisions);
  await assert.rejects(digital.decideBatch(dono, 1, { decisoes: [{ ...decisions[0], valor_autorizado: 55 }], credential: { id: 'qa' } }), /diferente da decisao/);
  await digital.authenticationOptions(dono, 1, decisions);
  await digital.decideBatch(dono, 1, { decisoes: decisions, credential: { id: 'qa' } });
  assert.equal(getState().PagamentoManualFilaItem[0].valor_previsto, 50);
  assert.equal(getState().TituloFinanceiro[0].valor_saldo, 100);
  console.log('OK valor parcial: selecao/individual, assinatura do valor, limite nominal, auditoria, titulo/snapshot intactos, replay e entradas invalidas.');
};
if (require.main === module) require('./validarAnaliseProprietario');
