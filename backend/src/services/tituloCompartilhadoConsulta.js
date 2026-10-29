'use strict';
const leitura = require('./tituloCompartilhadoLeitura');
const { centavos, dinheiro } = require('./tituloRenegociacaoDomain');
const plain = v => v?.toJSON ? v.toJSON() : v;
async function porSolicitacao(req, titulos, solicitacaoId, { transaction, incluirComprovantes = false } = {}) {
  const mapa = await leitura.mapa(titulos.map(plain), transaction);
  return Promise.all(titulos.map(async titulo => {
    const t = plain(titulo), linhas = mapa.get(Number(t.id));
    if (!linhas) return titulo;
    const indices = linhas.map((a, i) => Number(a.solicitacao_id) === Number(solicitacaoId) ? i : -1).filter(i => i >= 0);
    const soma = fn => dinheiro(indices.reduce((s, i) => s + centavos(Number(fn(i)).toFixed(2)), 0));
    // A aba da origem mostra sua participação, não o valor integral da compra.
    // DTO explícito: dados de outras origens jamais passam ao usuário da Obra.
    const valor = soma(i => linhas[i].valor), pago = soma(i => linhas.baixas.pago[i]), saldo = soma(i => linhas.baixas.saldo[i]);
    const status = ['CANCELADO', 'ESTORNADO'].includes(t.status) ? t.status : Number(saldo) === 0 ? 'QUITADO' : Number(pago) > 0 ? 'PARCIAL' : 'ABERTO';
    return { id: t.id, codigo: t.codigo, solicitacao_id: Number(solicitacaoId), tipo: t.tipo,
      origem_titulo: t.origem_titulo, compartilhamento_id: t.compartilhamento_id,
      descricao: `Título compartilhado · participação desta solicitação`, status,
      valor_original: valor, valor_baixado: pago,
      valor_saldo: saldo, data_vencimento: t.data_vencimento,
      parceiro: t.parceiro, formaPagamento: t.formaPagamento, forma_pagamento_id: t.forma_pagamento_id,
      filaPagamentosManuais: [], comprovantesSolicitacao: [], somente_participacao: true,
      comprovantesCompartilhados: incluirComprovantes
        ? await require('./comprovanteCompartilhadoSolicitacaoService').listar(t.id, Number(solicitacaoId), transaction) : [] };
  }));
}
module.exports = { porSolicitacao };
