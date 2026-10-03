'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

const novaCompra = read('frontend/src/modules/solicitacao-compra/pages/NovaSolicitacaoCompra.jsx');
const controller = read('backend/src/controllers/SolicitacaoCompraController.js');
const cotacao = read('backend/src/services/comprasCotacao.js');
const pedido = read('backend/src/services/pedidoCompraService.js');
const detalheCompra = read('frontend/src/modules/solicitacao-compra/pages/SolicitacaoCompraDetalheView.jsx');
const detalheSolicitacao = read('frontend/src/pages/SolicitacaoDetalhe/index.jsx');
const detalheItem = read('frontend/src/modules/solicitacao-compra/components/ItemCompraDetalhe.jsx');
const routes = read('backend/src/routes.js');

assert(
  novaCompra.includes("unidade_sigla: unidadeManual || unidadeCadastrada?.sigla || unidadeCadastrada?.nome || ''"),
  'A unidade padrao do insumo deve ser carregada ao adicionar o item.'
);
assert(
  novaCompra.includes('placeholder="Digite ou selecione a UN"')
    && novaCompra.includes('<datalist id={`unidades-item-${item.__indice}`}>'),
  'O campo de unidade deve aceitar pesquisa nas unidades e texto livre.'
);
assert(
  novaCompra.includes("unidade_sigla_manual: itemAtual?.manual ? unidadeSigla : (unidade ? '' : texto)"),
  'Uma unidade nao cadastrada deve ser preservada como unidade manual do item.'
);
assert(
  controller.includes('informe uma unidade cadastrada ou uma UN livre')
    && controller.includes('unidade_id: unidadeManual ? null'),
  'O backend deve exigir e persistir a unidade livre do item cadastrado.'
);
assert(
  controller.includes('async cadastrarUnidadeItem(req, res)')
    && controller.includes("tipoAcao: 'ITEM_UNIDADE_CADASTRADA'")
    && routes.includes('/itens/:itemId/cadastrar-unidade'),
  'GEO ou usuario autorizado deve conseguir cadastrar a UN livre com auditoria.'
);
assert(
  detalheItem.includes("return { label: 'UN pendente', className: 'is-pending' }")
    && detalheItem.includes('onCadastrarUnidade(item)'),
  'O gerenciamento do item deve sinalizar e permitir cadastrar a UN pendente.'
);

for (const [source, label] of [
  [cotacao, 'cotacao'],
  [pedido, 'pedido'],
  [detalheCompra, 'detalhe da compra'],
  [detalheSolicitacao, 'detalhe da solicitacao']
]) {
  assert(
    source.includes('unidade_sigla_manual || item.unidade')
      || source.includes('item?.unidade_sigla_manual || item?.unidade'),
    `${label}: a unidade informada no item deve prevalecer sobre a unidade padrao do insumo.`
  );
}

console.log('Unidade editavel dos itens de Compra Direta e Solicitacao de Compra validada com sucesso.');
