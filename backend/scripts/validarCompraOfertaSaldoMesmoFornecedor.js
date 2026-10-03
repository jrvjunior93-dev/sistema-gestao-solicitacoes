const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  calcularDisponibilidadeFornecedorItem,
  montarMapaAlocacoesAtivasPorFornecedorItem,
  montarMapaAlocacoesAtivasPorResposta
} = require('../src/services/comprasDisponibilidadeService');
const {
  validateCompraCotacaoRespostaInternaBody
} = require('../src/validators/operationalValidators');

const item = {
  id: 901,
  item_tipo: 'CADASTRADO',
  solicitacao_compra_item_id: 77,
  escopo_disponibilidade: 'OFERTA_SALDO'
};
const alocacoesAnteriores = [{
  resposta_item_id: 800,
  fornecedor_compra_id: 15,
  item_tipo: 'CADASTRADO',
  solicitacao_compra_item_id: 77,
  quantidade_alocada: 5,
  status: 'ATIVA'
}];

const mapaFornecedor = montarMapaAlocacoesAtivasPorFornecedorItem(alocacoesAnteriores);
const mapaResposta = montarMapaAlocacoesAtivasPorResposta(alocacoesAnteriores);
const novaOferta = calcularDisponibilidadeFornecedorItem({
  fornecedorCompraId: 15,
  item,
  quantidadeDisponivel: 5,
  mapaAlocacoesFornecedorItem: mapaFornecedor,
  mapaAlocacoesResposta: mapaResposta
});

assert.strictEqual(novaOferta.quantidade_alocada, 0);
assert.strictEqual(novaOferta.saldo_disponivel, 5);

const comConsumoDaNovaOferta = calcularDisponibilidadeFornecedorItem({
  fornecedorCompraId: 15,
  item,
  quantidadeDisponivel: 5,
  mapaAlocacoesFornecedorItem: mapaFornecedor,
  mapaAlocacoesResposta: montarMapaAlocacoesAtivasPorResposta([
    ...alocacoesAnteriores,
    { ...alocacoesAnteriores[0], resposta_item_id: 901, quantidade_alocada: 2 }
  ])
});

assert.strictEqual(comConsumoDaNovaOferta.quantidade_alocada, 2);
assert.strictEqual(comConsumoDaNovaOferta.saldo_disponivel, 3);

const payload = validateCompraCotacaoRespostaInternaBody({
  nova_oferta_saldo: true,
  finalizar: true,
  itens: [{
    item_tipo: 'CADASTRADO',
    item_referencia_id: 77,
    status_disponibilidade: 'DISPONIVEL',
    quantidade_disponivel: 5,
    preco: 123.45
  }]
});
assert.strictEqual(payload.nova_oferta_saldo, true);

const serviceSource = fs.readFileSync(
  path.resolve(__dirname, '../src/services/pedidoCompraService.js'),
  'utf8'
);
assert(serviceSource.includes('FECHAMENTO:${fechamento.id}:FRETE'));
assert(serviceSource.includes('ofertaSaldoGrupo'));

const frontendSource = fs.readFileSync(
  path.resolve(__dirname, '../../frontend/src/modules/solicitacao-compra/pages/GerenciarCotacaoSolicitacao.jsx'),
  'utf8'
);
assert(frontendSource.includes('Nova oferta para o saldo'));
assert(frontendSource.includes('nova_oferta_saldo'));

console.log('Validacao de nova oferta para saldo do mesmo fornecedor concluida com sucesso.');
