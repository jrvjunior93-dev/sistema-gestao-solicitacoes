const assert = require('node:assert/strict');
const { obterChavesItensEmCotacao } = require('../src/services/compraItensCotacaoService');

const itens = [
  { id: 88, status_aprovacao: 'APROVADO' },
  { id: 89, status_aprovacao: 'REJEITADO' },
  { id: 90, status_aprovacao: null }
];
const manuais = [{ id: 88, status_aprovacao: 'APROVADO' }];

const chaves = obterChavesItensEmCotacao([
  { status: 'ENVIADO', itensSelecionados: [
    { item_tipo: 'CADASTRADO', solicitacao_compra_item_id: 88 },
    { item_tipo: 'CADASTRADO', solicitacao_compra_item_id: 88 }
  ] },
  { status: 'RESPONDIDO', itensSelecionados: [
    { item_tipo: 'MANUAL', solicitacao_compra_item_manual_id: 88 }
  ] },
  { status: 'CANCELADA', itensSelecionados: [
    { item_tipo: 'CADASTRADO', solicitacao_compra_item_id: 89 }
  ] }
], itens, manuais);
assert.deepEqual([...chaves].sort(), ['CADASTRADO:88', 'MANUAL:88']);

const legado = obterChavesItensEmCotacao([
  { status: 'ENVIADO', itensSelecionados: [] }
], itens, manuais);
assert.deepEqual([...legado].sort(), ['CADASTRADO:88', 'CADASTRADO:90', 'MANUAL:88']);
assert.deepEqual([...obterChavesItensEmCotacao([], itens, manuais)], []);

console.log('Itens em cotacao ativa por fornecedor: OK');
