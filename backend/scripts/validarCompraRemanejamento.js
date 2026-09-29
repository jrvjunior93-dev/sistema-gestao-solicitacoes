const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  calcularDisponibilidadeFornecedorItem,
  montarMapaAlocacoesAtivasPorFornecedorItem
} = require('../src/services/comprasDisponibilidadeService');

function readSource(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');
}

function validarSaldoHistoricoDestino() {
  const alocacoes = [{
    fornecedor_compra_id: 20,
    item_tipo: 'CADASTRADO',
    solicitacao_compra_item_id: 71,
    quantidade_alocada: 6,
    status: 'ATIVA'
  }];
  const mapa = montarMapaAlocacoesAtivasPorFornecedorItem(alocacoes);
  const disponibilidade = calcularDisponibilidadeFornecedorItem({
    fornecedorCompraId: 20,
    item: { item_tipo: 'CADASTRADO', item_referencia_id: 71 },
    quantidadeDisponivel: 10,
    mapaAlocacoesFornecedorItem: mapa
  });

  assert.strictEqual(disponibilidade.quantidade_alocada, 6);
  assert.strictEqual(disponibilidade.saldo_disponivel, 4);
}

function validarGuardasDoBackend() {
  const source = readSource('src/services/pedidoCompraService.js');

  assert(source.includes('montarAlocacoesNormalizadas(\n    solicitacao,'), 'Remanejamento deve reutilizar a normalizacao do fechamento.');
  assert(source.includes('await assertPedidoSemVinculoFinanceiroParaCancelamento(pedidoOrigem.id'), 'Pedido de origem sem guarda financeira.');
  assert(source.includes('await assertPedidoSemVinculoFinanceiroParaCancelamento(pedidoDestinoExistente.id'), 'Pedido de destino sem guarda financeira.');
  assert(source.includes('custos_origem_reduzidos: custosRemovidos'), 'Auditoria dos custos removidos nao encontrada.');
  assert(source.includes("modo: 'REABERTURA'"), 'Sincronizacao da cotacao reaberta nao encontrada.');
  assert(source.includes("{ status: 'FINALIZADA' }"), 'Finalizacao sincronizada das cotacoes nao encontrada.');
  assert(source.includes("{ status: 'RESPONDIDO' }"), 'Reativacao da resposta apos cancelamento nao encontrada.');
  assert(source.includes("statusConfig.codigo === 'CANCELADO'"), 'Mudanca generica para CANCELADO precisa usar o fluxo completo.');
  assert(source.includes("tipoAcao: pedidoJaCancelado ? 'PEDIDO_CANCELAMENTO_REGULARIZADO'"), 'Regularizacao idempotente de cancelamento legado nao encontrada.');
  assert(source.includes("acao: 'ITEM_CANCELADO_REMANEJADO'"), 'Auditoria do remanejamento de item cancelado nao encontrada.');
  assert(source.includes('quantidade_disponivel_remanejamento'), 'Saldo seguro de remanejamento do item cancelado nao exposto.');
  assert(!source.includes('COMPRA_FECHAMENTO_PARCIAL_REQUER_JUSTIFICATIVA'), 'Fechamento parcial nao deve exigir justificativa.');
}

function validarFretes() {
  const source = readSource('src/services/pedidoCompraFreteService.js');

  assert(source.includes('async function sincronizarRateiosFretesPendentesPedido'), 'Sincronizacao dos rateios de frete nao encontrada.');
  assert(source.includes('FRETE_PEDIDO_CANCELADO_AUTOMATICAMENTE'), 'Cancelamento de frete sem itens nao auditado.');
}

function validarFrontend() {
  const source = readSource('../frontend/src/modules/solicitacao-compra/pages/PedidoCompraDetalhe.jsx');
  const cotacaoSource = readSource('../frontend/src/modules/solicitacao-compra/pages/GerenciarCotacaoSolicitacao.jsx');

  assert(source.includes('saldo_disponivel_fornecedor'), 'Saldo do fornecedor nao apresentado no remanejamento.');
  assert(source.includes('quantidadeMaximaEfetiva'), 'Limite visual do remanejamento nao considera o destino.');
  assert(source.includes("String(status).toUpperCase() === 'CANCELADO'"), 'Cancelamento pelo seletor de status nao solicita motivo.');
  assert(source.includes('!itemEditando.removido || pedidoCancelado'), 'Item de pedido cancelado nao foi liberado para remanejamento.');
  assert(!cotacaoSource.includes("rotuloCampo: 'Justificativa do fechamento parcial'"), 'A interface ainda pede justificativa no fechamento parcial.');
  assert(/Saldo que permanecer(?:a|á) aberto/.test(cotacaoSource), 'Confirmacao do fechamento parcial precisa informar o saldo remanescente.');
}

validarSaldoHistoricoDestino();
validarGuardasDoBackend();
validarFretes();
validarFrontend();

console.log('Validacao da reabertura e do remanejamento de compras concluida com sucesso.');
