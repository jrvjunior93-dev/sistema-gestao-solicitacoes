'use strict';

const assert = require('node:assert/strict');
const {
  validateFinanceConciliacaoRendimentoBody,
  validateFinanceTarifasBancariasConfigBody,
  validateFinanceRelatorioConciliacaoQuery
} = require('../src/validators/financialValidators');
const { normalizeTarifaBancariaConfigItem } = require('../src/services/financeiroCadastroService');
const { categoriaFinanceiraAptaParaRendimento } = require('../src/services/conciliacaoBancariaService');
const { obterNaturezaMovimento } = require('../src/services/caixaFinanceiroService');
const { summarizeDreRows } = require('../src/services/relatorioFinanceiroService');

const tarifaLegada = normalizeTarifaBancariaConfigItem({ codigo: 'TAR_PIX', nome: 'TAR PIX' });
assert.equal(tarifaLegada.tipo_atalho, 'TARIFA');
const rendimento = normalizeTarifaBancariaConfigItem({
  codigo: 'RENDIMENTO_CONTA', nome: 'Rendimento da conta', tipo_atalho: 'RENDIMENTO', categoria_financeira_id: 7
}, 0, { requireCategoria: true });
assert.equal(rendimento.tipo_atalho, 'RENDIMENTO');
assert.throws(() => normalizeTarifaBancariaConfigItem({ codigo: 'X', nome: 'X', tipo_atalho: 'TRANSFERENCIA' }), /Tipo do atalho/);

const corpoAtalho = validateFinanceTarifasBancariasConfigBody({ itens: [{
  codigo: rendimento.codigo,
  nome: rendimento.nome,
  tipo_atalho: 'RENDIMENTO',
  categoria_financeira_id: 7,
  ativo: true
}] });
assert.equal(corpoAtalho.itens[0].tipo_atalho, 'RENDIMENTO');
assert.equal(validateFinanceConciliacaoRendimentoBody({ codigo: 'RENDIMENTO_CONTA' }).codigo, 'RENDIMENTO_CONTA');
assert.throws(() => validateFinanceConciliacaoRendimentoBody({ codigo: 'RENDIMENTO_CONTA', valor: 100 }), /nao permitido|não permitido|invalido|inválido/i);
assert.equal(validateFinanceRelatorioConciliacaoQuery({ tipo_conciliacao: 'RENDIMENTO' }).tipo_conciliacao, 'RENDIMENTO');

const categoria = { id: 7, nome: 'Rendimentos de Conta-Corrente', tipo: 'RECEBER', ativo: true, considera_dre: true, dre_grupo: 'Resultado financeiro' };
assert.equal(categoriaFinanceiraAptaParaRendimento(categoria), true);
assert.equal(categoriaFinanceiraAptaParaRendimento({ ...categoria, tipo: 'PAGAR' }), false);
assert.equal(categoriaFinanceiraAptaParaRendimento({ ...categoria, considera_dre: false }), false);
assert.equal(categoriaFinanceiraAptaParaRendimento({ ...categoria, classificacao_gerencial: 'TRANSFERENCIA_INTERNA' }), false);

assert.equal(obterNaturezaMovimento({ tipo_movimento: 'RENDIMENTO_BANCARIO' }), 'ENTRADA');
assert.equal(obterNaturezaMovimento({ tipo_movimento: 'TARIFA_BANCARIA' }), 'SAIDA');
const resumo = summarizeDreRows([], [], [{
  tipo_movimento: 'RENDIMENTO_BANCARIO', valor: 12.34, categoriaFinanceira: categoria
}]);
assert.equal(resumo.resumo.receitas, 12.34);
assert.equal(resumo.resumo.despesas, 0);
assert.equal(resumo.resumo.movimentos_avulsos_considerados, 1);

console.log('Atalhos de rendimento OFX: configuracao, validacao, caixa e DRE OK.');
