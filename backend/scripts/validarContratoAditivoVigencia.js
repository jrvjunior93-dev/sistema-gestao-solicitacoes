'use strict';

const assert = require('node:assert/strict');
const { validarNovaVigencia } = require('../src/services/contratoAditivoVigencia');
const { validarCronogramaParcelas } = require('../src/services/contratoAditivoCronograma');

const hoje = '2026-09-03';

function validar(caso, entrada, esperado) {
  const resultado = validarNovaVigencia({ ...entrada, hoje });
  assert.equal(resultado.valida, esperado.valida, `${caso}: validade divergente`);
  assert.equal(resultado.codigo, esperado.codigo, `${caso}: codigo divergente`);
}

validar('prorrogacao de contrato vigente', {
  vigenciaAtualFim: '2027-01-30',
  novaVigenciaFim: '2027-04-30'
}, { valida: true, codigo: 'PRORROGACAO_VALIDA' });

validar('data anterior a hoje', {
  vigenciaAtualFim: '2027-01-30',
  novaVigenciaFim: '2026-03-17'
}, { valida: false, codigo: 'DATA_RETROATIVA' });

validar('reducao futura de vigencia', {
  vigenciaAtualFim: '2027-01-30',
  novaVigenciaFim: '2026-12-30'
}, { valida: false, codigo: 'REDUCAO_NAO_SUPORTADA' });

validar('data igual a vigencia atual', {
  vigenciaAtualFim: '2027-01-30',
  novaVigenciaFim: '2027-01-30'
}, { valida: false, codigo: 'SEM_ALTERACAO' });

validar('contrato expirado prorrogado a partir de hoje', {
  vigenciaAtualFim: '2026-08-31',
  novaVigenciaFim: '2026-09-03'
}, { valida: true, codigo: 'PRORROGACAO_VALIDA' });

validar('legado sem vigencia recebe data atual', {
  vigenciaAtualFim: null,
  novaVigenciaFim: '2026-09-03'
}, { valida: true, codigo: 'PRORROGACAO_VALIDA' });

validar('vigencia pode terminar antes do cronograma financeiro', {
  vigenciaAtualFim: '2027-01-30',
  ultimaParcelaVencimento: '2027-01-30',
  novaVigenciaFim: '2027-04-30'
}, { valida: true, codigo: 'PRORROGACAO_VALIDA' });

validar('pedido pendente fica invalido se outro aditivo ampliar antes', {
  vigenciaAtualFim: '2029-01-30',
  ultimaParcelaVencimento: '2029-01-30',
  novaVigenciaFim: '2028-01-30'
}, { valida: false, codigo: 'REDUCAO_NAO_SUPORTADA' });

validar('legado sem vigencia nao recebe data retroativa', {
  vigenciaAtualFim: null,
  novaVigenciaFim: '2026-09-02'
}, { valida: false, codigo: 'DATA_RETROATIVA' });

validar('data inexistente', {
  vigenciaAtualFim: '2027-01-30',
  novaVigenciaFim: '2027-02-30'
}, { valida: false, codigo: 'DATA_INVALIDA' });

const cronogramaAposVigencia = validarCronogramaParcelas({
  totalCent: 500000,
  maximoParcelas: 6,
  parcelas: [
    { numero: 1, valor: 2500, vencimento: '2027-05-30' },
    { numero: 2, valor: 2500, vencimento: '2027-06-30' }
  ]
});
assert.equal(cronogramaAposVigencia.valida, true, 'vencimentos depois da vigencia devem ser aceitos');

const cronogramaComMaisParcelasQueDias = validarCronogramaParcelas({
  totalCent: 30000,
  maximoParcelas: 3,
  parcelas: [
    { numero: 1, valor: 100, vencimento: '2027-02-01' },
    { numero: 2, valor: 100, vencimento: '2027-03-01' },
    { numero: 3, valor: 100, vencimento: '2027-04-01' }
  ]
});
assert.equal(cronogramaComMaisParcelasQueDias.valida, true, 'quantidade nao depende dos dias da vigencia');

const cronogramaComMesmoVencimento = validarCronogramaParcelas({
  totalCent: 20000,
  maximoParcelas: 2,
  parcelas: [
    { numero: 1, valor: 100, vencimento: '2027-04-01' },
    { numero: 2, valor: 100, vencimento: '2027-04-01' }
  ]
});
assert.equal(cronogramaComMesmoVencimento.valida, true, 'negociacao pode ter parcelas na mesma data');

const cronogramaAcimaDoTeto = validarCronogramaParcelas({
  totalCent: 20000,
  maximoParcelas: 1,
  parcelas: [
    { numero: 1, valor: 100, vencimento: '2027-04-01' },
    { numero: 2, valor: 100, vencimento: '2027-05-01' }
  ]
});
assert.equal(cronogramaAcimaDoTeto.valida, false, 'teto global de parcelas deve ser preservado');

const cronogramaDivergente = validarCronogramaParcelas({
  totalCent: 500000,
  maximoParcelas: 2,
  parcelas: [
    { numero: 1, valor: 2000, vencimento: '2027-05-30' },
    { numero: 2, valor: 2000, vencimento: '2027-06-30' }
  ]
});
assert.equal(cronogramaDivergente.valida, false, 'soma divergente deve ser bloqueada');

console.log('Validacao das regras de vigencia dos aditivos concluida com sucesso.');
