const assert = require('assert');
const {
  apropriacaoPodeReceberLancamento,
  selecionarApropriacoesOperacionais,
  selecionarApropriacoesOperacionaisPorObra,
  sugerirIdsMacros
} = require('../src/services/apropriacaoSelecaoService');

const obra110 = [
  { id: 1, obra_id: 64, codigo: '1', somadora: true, ativo: true },
  { id: 2, obra_id: 64, codigo: '1.1', apropriacao_pai_id: 1, somadora: true, ativo: true },
  { id: 3, obra_id: 64, codigo: '1.1.1', apropriacao_pai_id: 2, somadora: false, ativo: true },
  { id: 4, obra_id: 64, codigo: '2', somadora: true, ativo: true }
];

const obra109 = [
  { id: 10, obra_id: 63, codigo: '1', somadora: true, ativo: true },
  { id: 11, obra_id: 63, codigo: '1.01', apropriacao_pai_id: 10, somadora: true, ativo: true },
  { id: 12, obra_id: 63, codigo: '1.02', apropriacao_pai_id: 10, somadora: true, ativo: true },
  { id: 13, obra_id: 63, codigo: '2', somadora: true, ativo: true },
  { id: 14, obra_id: 63, codigo: '2.01', apropriacao_pai_id: 13, somadora: true, ativo: true },
  { id: 15, obra_id: 63, codigo: '3', somadora: true, ativo: true },
  { id: 16, obra_id: 63, codigo: '3.01', apropriacao_pai_id: 15, somadora: true, ativo: true }
];

assert.deepStrictEqual(sugerirIdsMacros(obra110), [1, 4]);
assert.deepStrictEqual(sugerirIdsMacros(obra109), [11, 12, 14, 16]);

const obra110Configurada = obra110.map((item) => ({
  ...item,
  macro_formulario: item.id === 1
}));
assert.deepStrictEqual(
  selecionarApropriacoesOperacionais(obra110Configurada).map((item) => item.id),
  [1]
);
assert.strictEqual(apropriacaoPodeReceberLancamento(obra110Configurada[0]), true);
assert.strictEqual(apropriacaoPodeReceberLancamento(obra110[1]), false);
assert.strictEqual(apropriacaoPodeReceberLancamento(obra110[2]), true);

const todas = selecionarApropriacoesOperacionaisPorObra([
  ...obra110Configurada,
  ...obra109
]);
assert.deepStrictEqual(
  todas.filter((item) => item.obra_id === 64).map((item) => item.id),
  [1]
);
assert.deepStrictEqual(
  todas.filter((item) => item.obra_id === 63).map((item) => item.id),
  []
);

console.log('Validacao de etapas macro concluida com sucesso.');
