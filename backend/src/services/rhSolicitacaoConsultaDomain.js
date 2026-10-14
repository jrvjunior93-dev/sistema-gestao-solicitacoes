'use strict';

const { FLUXO, normalizarAndamento, situacaoPagamento } = require('./rhPagamentoSolicitacaoDomain');

const dadosDe = pedido => typeof pedido?.dados_json === 'string'
  ? JSON.parse(pedido.dados_json) : pedido?.dados_json || {};
const ehPagamento = pedido => pedido?.subtipo === FLUXO;

// Uma unica regra para lista, modal e destaque. Rascunho de pagamento nao
// enviado permanece privado do autor, mesmo para DP e administradores.
function visivelNaConsulta(pedido, usuarioId) {
  if (ehPagamento(pedido) && dadosDe(pedido).rascunho_excluido) return false;
  return !(ehPagamento(pedido) && pedido.situacao === 'RASCUNHO'
    && (!usuarioId || Number(pedido.criada_por) !== Number(usuarioId)));
}

function normalizarConsulta(pedido) {
  const plano = pedido.get ? pedido.get({ plain: true }) : { ...pedido };
  if (ehPagamento(plano)) {
    plano.dados_json = normalizarAndamento(dadosDe(plano));
    plano.situacao = situacaoPagamento(plano.dados_json, plano.situacao);
  }
  return plano;
}

function colaboradoresDoPedido(pedido) {
  const ids = pedido.colaborador_id ? [Number(pedido.colaborador_id)] : [];
  // Pagamentos coletivos nao possuem FK individual. As linhas do snapshot
  // selecionadas sao o vinculo, sem consultar/regravar cadastro ou financeiro.
  if (ehPagamento(pedido)) {
    ids.push(...(dadosDe(pedido).linhas || []).filter(l => l.selecionado !== false
      || ['ENVIADO', 'EM_EDICAO', 'CANCELADO'].includes(l.pagamento_estado))
      .map(l => Number(l.colaborador_id)));
  }
  return [...new Set(ids.filter(id => Number.isSafeInteger(id) && id > 0))];
}

module.exports = { visivelNaConsulta, normalizarConsulta, colaboradoresDoPedido };
