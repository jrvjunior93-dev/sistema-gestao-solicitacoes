'use strict';

// Rotas financeiras legadas que antes usavam apenas o acesso geral ao módulo.
// A chave da tabela é o método mais o template Express (ou o caminho normalizado
// do sub-router bancário). Ausência de mapeamento deve negar, nunca liberar.
const LOOKUP = [
  'financeiro.titulos.visualizar',
  'financeiro.titulos.criar',
  'financeiro.titulos.editar',
  'financeiro.titulos.baixar',
  'financeiro.conciliacao.visualizar',
  'financeiro.caixas.visualizar',
  'financeiro.cheques.visualizar',
  'financeiro.baixas_compostas.visualizar',
  'financeiro.fila_pagamentos.visualizar',
  'financeiro.bancos.visualizar',
  'financeiro.cadastros.visualizar',
  'financeiro.cartoes.visualizar',
  'financeiro.financiamentos.visualizar',
  'financeiro.baixas.visualizar',
  'financeiro.relatorios.visualizar',
  'financeiro.relatorios.analitico',
  'financeiro.relatorios.financeiro_obras'
];

const PERMISSOES_ROTAS_FINANCEIRAS = Object.freeze({
  'GET /financeiro/bancos/dashboard': ['financeiro.bancos.visualizar'],
  'GET /financeiro/bancos/cnab240-pagamentos': ['financeiro.bancos.visualizar'],
  'GET /financeiro/bancos/caixa-pagamentos/convenios': ['financeiro.bancos.visualizar'],
  'POST /financeiro/bancos/caixa-pagamentos/convenios': ['financeiro.bancos.configurar'],
  'PATCH /financeiro/bancos/caixa-pagamentos/convenios/:id': ['financeiro.bancos.configurar'],
  'GET /financeiro/bancos/caixa-pagamentos/titulos-elegiveis': ['financeiro.bancos.remessas'],
  'GET /financeiro/bancos/caixa-pagamentos/remessas': ['financeiro.bancos.remessas'],
  'POST /financeiro/bancos/caixa-pagamentos/remessas': ['financeiro.pagamentos.preparar'],
  'GET /financeiro/bancos/caixa-pagamentos/remessas/:id/download': ['financeiro.bancos.remessas'],

  'GET /financeiro/conciliacoes': ['financeiro.conciliacao.visualizar'],
  'GET /financeiro/conciliacoes/importacoes': ['financeiro.conciliacao.visualizar'],
  'POST /financeiro/conciliacoes/importar-ofx': ['financeiro.conciliacao.importar'],
  'POST /financeiro/conciliacoes/conciliar-sugeridos': ['financeiro.conciliacao.conciliar'],
  'GET /financeiro/conciliacoes/:id/movimentos': ['financeiro.conciliacao.visualizar'],
  'POST /financeiro/conciliacoes/:id/criar-titulo': ['financeiro.conciliacao.conciliar'],
  'POST /financeiro/conciliacoes/:id/confirmar': ['financeiro.conciliacao.conciliar'],
  'POST /financeiro/conciliacoes/:id/ignorar': ['financeiro.conciliacao.conciliar'],
  'POST /financeiro/conciliacoes/:id/remover': ['financeiro.conciliacao.conciliar'],
  'GET /financeiro/conciliacoes/:id/faturas-cartao': ['financeiro.conciliacao.visualizar'],
  'POST /financeiro/conciliacoes/:id/confirmar-fatura': ['financeiro.conciliacao.conciliar'],
  'POST /financeiro/conciliacoes/:id/confirmar-transferencia': ['financeiro.conciliacao.conciliar'],
  'POST /financeiro/conciliacoes/:id/confirmar-tarifa': ['financeiro.conciliacao.conciliar'],
  'POST /financeiro/conciliacoes/:id/confirmar-rendimento': ['financeiro.conciliacao.conciliar'],
  'GET /financeiro/conciliacoes/:id/tarifas-estorno': ['financeiro.conciliacao.visualizar'],
  'POST /financeiro/conciliacoes/:id/confirmar-estorno-tarifa': ['financeiro.conciliacao.estornar'],
  'POST /financeiro/conciliacoes/:id/confirmar-credito-rotativo': ['financeiro.conciliacao.conciliar'],

  'GET /financeiro/transferencias': ['financeiro.transferencias.visualizar'],
  'POST /financeiro/transferencias': ['financeiro.transferencias.criar'],
  'POST /financeiro/transferencias/:id/cancelar': ['financeiro.transferencias.cancelar'],
  'GET /financeiro/baixas': ['financeiro.baixas.visualizar'],
  'GET /financeiro/financiamentos-bancarios': ['financeiro.financiamentos.visualizar'],
  'POST /financeiro/financiamentos-bancarios': ['financeiro.financiamentos.gerenciar'],
  'GET /financeiro/financiamentos-bancarios/:id': ['financeiro.financiamentos.visualizar'],
  'GET /financeiro/financiamentos-bancarios/:id/auditoria': ['financeiro.financiamentos.visualizar'],
  'POST /financeiro/financiamentos-bancarios/:id/gerar-titulos': ['financeiro.financiamentos.gerar_titulos'],
  'PATCH /financeiro/financiamentos-bancarios/parcelas/:id': ['financeiro.financiamentos.gerenciar'],

  'GET /financeiro/titulos': ['financeiro.titulos.visualizar'],
  'GET /financeiro/status-internos-pagar': ['financeiro.titulos.visualizar', 'financeiro.titulos.status_interno'],
  'POST /financeiro/status-internos-pagar': ['financeiro.titulos.status_interno'],
  'PATCH /financeiro/titulos/status-interno-pagar': ['financeiro.titulos.status_interno'],
  'POST /financeiro/titulos/negociacoes/preview': ['financeiro.titulos.renegociar'],
  'POST /financeiro/titulos/negociacoes/confirmar': ['financeiro.titulos.renegociar'],
  'GET /financeiro/titulos/:id/negociacao': ['financeiro.titulos.visualizar'],
  'GET /financeiro/titulos/relatorio.pdf': ['financeiro.titulos.exportar'],
  'POST /financeiro/titulos/relatorio.pdf': ['financeiro.titulos.exportar'],
  'POST /financeiro/titulos': ['financeiro.titulos.criar'],
  'GET /financeiro/fretes-pedidos/pendentes': ['financeiro.titulos.visualizar'],
  'POST /financeiro/titulos/excluir-em-massa': ['financeiro.titulos.excluir'],
  'POST /financeiro/titulos/baixas/parceladas': ['financeiro.titulos.baixar'],
  'GET /financeiro/cheques-terceiros/disponiveis': ['financeiro.titulos.baixar', 'financeiro.baixas_compostas.criar'],
  'GET /financeiro/titulos/:id': ['financeiro.titulos.visualizar'],
  'GET /financeiro/titulos/:id/auditoria': ['financeiro.titulos.auditoria.visualizar'],
  'PATCH /financeiro/titulos/:id': ['financeiro.titulos.editar'],
  'PATCH /financeiro/titulos/:id/cobranca': ['financeiro.titulos.cobranca'],
  'POST /financeiro/titulos/:id/baixas/conciliacoes': ['financeiro.titulos.baixar'],
  'POST /financeiro/titulos/:id/baixas': ['financeiro.titulos.baixar'],
  'POST /financeiro/titulos/:id/movimentos/:movimentoId/estornar': ['financeiro.titulos.estornar'],

  'GET /financeiro/contas-bancarias': LOOKUP,
  'POST /financeiro/contas-bancarias': ['financeiro.cadastros.gerenciar'],
  'PATCH /financeiro/contas-bancarias/:id': ['financeiro.cadastros.gerenciar'],
  'GET /financeiro/categorias': LOOKUP,
  'POST /financeiro/categorias': ['financeiro.cadastros.gerenciar'],
  'PATCH /financeiro/categorias/:id': ['financeiro.cadastros.gerenciar'],
  'GET /financeiro/formas-pagamento': LOOKUP,
  'POST /financeiro/formas-pagamento': ['financeiro.cadastros.gerenciar'],
  'PATCH /financeiro/formas-pagamento/:id': ['financeiro.cadastros.gerenciar'],
  'GET /financeiro/tarifas-bancarias-atalhos': ['financeiro.cadastros.visualizar', 'financeiro.conciliacao.visualizar'],
  'GET /financeiro/cartoes': ['financeiro.cartoes.visualizar', 'financeiro.cadastros.visualizar', 'financeiro.titulos.baixar', 'financeiro.baixas_compostas.criar'],
  'POST /financeiro/cartoes': ['financeiro.cartoes.gerenciar'],
  'PATCH /financeiro/cartoes/:id': ['financeiro.cartoes.gerenciar'],
  'GET /financeiro/faturas-cartao': ['financeiro.cartoes.visualizar'],
  'GET /financeiro/faturas-cartao/:id': ['financeiro.cartoes.visualizar'],
  'POST /financeiro/faturas-cartao/:id/baixar': ['financeiro.cartoes.baixar_fatura']
});

function resolverPermissoesRotaFinanceira(req) {
  const caminhoCompleto = `${req?.baseUrl || ''}${req?.path || ''}`;
  const inicioFinanceiro = caminhoCompleto.indexOf('/financeiro/');
  const template = typeof req?.route?.path === 'string'
    ? req.route.path
    : (inicioFinanceiro >= 0 ? caminhoCompleto.slice(inicioFinanceiro) : caminhoCompleto)
      .replace(/\/\d+(?=\/|$)/g, '/:id');
  return PERMISSOES_ROTAS_FINANCEIRAS[`${String(req?.method || '').toUpperCase()} ${template}`] || [];
}

module.exports = { PERMISSOES_ROTAS_FINANCEIRAS, resolverPermissoesRotaFinanceira };
