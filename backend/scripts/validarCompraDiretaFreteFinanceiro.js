'use strict';
// Services de titulo e frete reais com adaptadores em memoria. Sem models reais,
// dotenv, conexao de banco, conta bancaria ou rede.
const assert = require('node:assert/strict');
const qa = require('./validarCartaoOpcionalSolicitacao');
const { validateFinanceTituloCreateFromSolicitacaoBody: validar } = require('../src/validators/financialValidators');
const { state, models, solicitacao, req, registro, reset, pagamento } = qa;
const financeiro = qa.dependencies['./compraDiretaFreteFinanceiroService'];
const { criarTituloPorSolicitacao } = qa.isolated.exports;
let compra;
models.SolicitacaoCompra.findOne = async opts => {
  assert.equal(opts.where.solicitacao_principal_id, 100);
  if (opts.transaction) assert.equal(opts.lock, 'UPDATE');
  return compra ? registro(compra) : null;
};

function preparar() {
  reset();
  delete solicitacao.favorecido_id;
  compra = { id: 5, solicitacao_principal_id: 100, origem: 'COMPRA_DIRETA', frete_tipo: 'TERCEIRO', frete_valor: 50,
    frete_parceiro_id: 1, frete_favorecido_id: null, frete_forma_pagamento_id: 3,
    frete_data_vencimento: '2026-10-20', frete_favorecido_chave_pix: 'transporte@qa', valor_fechado: 150 };
}
const pFrete = () => ({ ...pagamento(3, null, 50), parceiro_id: 1, origem_frete: true });
const gerar = pagamentos => criarTituloPorSolicitacao(req, 100, validar({ tipo: 'PAGAR', status: 'ABERTO',
  parceiro_id: 1, categoria_financeira_id: 1, pagamentos }));
const fornecedor = () => ({ ...pagamento(3, null, 150), parceiro_id: 1 });
const autoFrete = () => state.titulos.push(registro({ id: 1, solicitacao_id: 100, tipo: 'PAGAR',
  status: 'ABERTO', origem_titulo: financeiro.ORIGEM_FRETE, parceiro_id: 1, valor_original: 50, valor_saldo: 50 }));

(async () => {
  preparar();
  solicitacao.favorecido_id = 7;
  models.Parceiro.findOne = async ({ where }) => ({ id: where.id, ativo: true });
  await gerar([fornecedor(), pFrete()]);
  assert.equal(state.titulos.length, 2);
  assert.equal(state.titulos[0].origem_titulo, 'SOLICITACAO');
  assert.equal(state.titulos[1].origem_titulo, financeiro.ORIGEM_FRETE);
  assert.equal(state.titulos[1].valor_original, 50);
  assert.equal(state.titulos[1].favorecido_pagamento_id, null, 'Frete sem favorecido nao herda favorecido do fornecedor');
  assert.equal(state.titulos[1].observacoes, 'Frete pago a terceiro.\nPIX: transporte@qa');
  await assert.rejects(() => gerar([fornecedor(), pFrete()]), /ja possui/);
  assert.equal(state.titulos.length, 2, 'Reenvio nao duplica titulos');

  preparar(); autoFrete(); const snapshot = JSON.stringify(state.titulos[0]);
  await gerar([fornecedor()]);
  assert.equal(JSON.stringify(state.titulos[0]), snapshot, 'Frete existente nao e reescrito');
  assert.equal(state.titulos.length, 2); assert.equal(state.titulos[1].valor_original, 150);
  assert.equal(state.titulos.reduce((s, t) => s + t.valor_original, 0), 200);
  await assert.rejects(() => gerar([fornecedor()]), /ja possui/);

  preparar(); autoFrete();
  await assert.rejects(() => gerar([fornecedor(), pFrete()]), /ja gerado/);
  assert.equal(state.titulos.length, 1, 'Corpo antigo nao duplica o frete automatico');
  preparar();
  await assert.rejects(() => gerar([{ ...fornecedor(), valor: 200 }]), /divisao/);
  for (const patch of [{ valor: 60 }, { parceiro_id: 2 }, { favorecido_pagamento_id: 9 },
    { forma_pagamento_id: 2 }, { quantidade_parcelas: 2 }]) {
    await assert.rejects(() => gerar([fornecedor(), { ...pFrete(), ...patch }]), /Preserve/);
    assert.equal(state.titulos.length, 0);
  }
  await assert.rejects(() => gerar([{ ...fornecedor(), valor: 160 }, pFrete()]), /soma dos titulos/);
  assert.equal(state.titulos.length, 0);

  // Leitura inicial nao autoriza persistir uma revisao obsoleta.
  preparar();
  const transactionOriginal = models.sequelize.transaction;
  models.sequelize.transaction = async (...args) => { compra.frete_valor = 60; return transactionOriginal(...args); };
  await assert.rejects(() => gerar([fornecedor(), pFrete()]), /alterados/);
  assert.equal(state.titulos.length, 0); assert.equal(state.rollbacks, 1);
  models.sequelize.transaction = transactionOriginal;

  // Sem frete e fora de Compra Direta: preservar geracao anterior; marcador
  // forjado de frete nao pode mudar origem de titulos de outro fluxo.
  preparar(); compra.frete_tipo = 'SEM_FRETE'; compra.frete_valor = 0;
  await gerar([{ ...fornecedor(), valor: 200 }]); assert.equal(state.titulos[0].origem_titulo, 'SOLICITACAO');
  reset(); compra = null;
  await assert.rejects(() => gerar([pFrete()]), /exclusivo/);
  assert.equal(state.titulos.length, 0);
  console.log('Compra Direta financeiro: geracao inicial completa ou somente fornecedor, snapshots servidor, marcador validado, replay e revisao obsoleta aprovados. Services reais, sem banco/rede.');
})().catch(error => { console.error(error); process.exitCode = 1; });
