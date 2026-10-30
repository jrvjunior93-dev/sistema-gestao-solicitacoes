'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { encargosParcelas } = require('../src/services/solicitacaoEncargosDomain');
const { validateFinanceTituloCreateFromSolicitacaoBody: validar } = require('../src/validators/financialValidators');
const f = require('./validarCartaoOpcionalSolicitacao');
test('centavos distribuidos uma vez, inclusive parcelas desiguais e empates', () => {
  assert.deepEqual(encargosParcelas({juros:0.02,multa:0.01},[1,1,1]),[{juros:0.01,multa:0.01},{juros:0.01,multa:0},{juros:0,multa:0}]);
  const rows=encargosParcelas({juros:23.71,multa:12.09},[23.11,7.39,169.5]);
  for(const [key,total] of [['juros',2371],['multa',1209]]) assert.equal(rows.reduce((s,r)=>s+Math.round(r[key]*100),0),total);
  assert.throws(()=>encargosParcelas({juros:-1},[10]));
  assert.throws(()=>encargosParcelas({multa:1},[0]));
  assert.throws(()=>validar({categoria_financeira_id:1,juros:-1}));
  assert.equal(validar({categoria_financeira_id:1,juros:12.34,multa:2}).juros,12.34);
});
test('criacao real preserva principal e armazena encargos separados por parcela', async () => {
  f.reset();
  await f.isolated.exports.criarTituloPorSolicitacao(f.req,100,{tipo:'PAGAR',status:'ABERTO',parceiro_id:1,categoria_financeira_id:1,
    juros:10.01,multa:3.01,pagamentos:[f.pagamento(3,undefined,200,3)]});
  assert.equal(f.state.titulos.length,3);
  for(const [key,total] of [['valor_original',20000],['valor_saldo',20000],['juros',1001],['multa',301]])
    assert.equal(f.state.titulos.reduce((s,t)=>s+Math.round(t[key]*100),0),total,key);
  assert.equal(f.state.movimentos.length,0);
});
test('cartao real quita principal mais encargos e recalcula fatura sem inflar principal', async () => {
  f.reset(); let recalculos=0;
  const anterior=f.faturaMocks.recalcularFaturaCartao;
  f.faturaMocks.recalcularFaturaCartao=async()=>{recalculos++;};
  try {
    await f.isolated.exports.criarTituloPorSolicitacao(f.req,100,{tipo:'PAGAR',status:'ABERTO',parceiro_id:1,categoria_financeira_id:1,
      juros:10,multa:2,pagamentos:[f.pagamento(1,10)]});
    assert.equal(f.state.titulos[0].valor_original,200);
    assert.equal(f.state.movimentos[0].valor,200);
    assert.equal(f.state.movimentos[0].valor_quitacao,212);
    assert.equal(recalculos,1);
  } finally {f.faturaMocks.recalcularFaturaCartao=anterior;}
});
