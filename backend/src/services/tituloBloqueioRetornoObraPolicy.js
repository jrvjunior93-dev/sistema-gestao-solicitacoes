'use strict';

const MENSAGEM_PADRAO = 'Baixa bloqueada: a Obra solicitou o retorno da solicitacao vinculada a este titulo enquanto ela estava no Financeiro.';

function normalizarSetor(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/[\s-]+/g, '_')
    .toUpperCase();
}

function ehPedidoObraParaSolicitacaoNoFinanceiro(pedido) {
  return normalizarSetor(pedido?.setor_solicitante) === 'OBRA'
    && normalizarSetor(pedido?.setor_atual_pedido) === 'FINANCEIRO';
}

function tituloEstaBloqueado(titulo) {
  return titulo?.bloqueado_retorno_obra === true
    || Number(titulo?.bloqueado_retorno_obra) === 1;
}

function assertTituloDisponivelParaBaixa(titulo) {
  if (!tituloEstaBloqueado(titulo)) return;
  const error = new Error(titulo.bloqueio_retorno_motivo || MENSAGEM_PADRAO);
  error.statusCode = 409;
  error.code = 'TITULO_BLOQUEADO_RETORNO_OBRA';
  throw error;
}

module.exports = {
  MENSAGEM_PADRAO,
  assertTituloDisponivelParaBaixa,
  ehPedidoObraParaSolicitacaoNoFinanceiro,
  normalizarSetor,
  tituloEstaBloqueado
};
