'use strict';

// Codigo exibido da solicitacao, nunca o ID interno do titulo ou da SC.
// EXISTS preserva uma linha por titulo, inclusive em lotes e negociacoes.
function filtroSolicitacaoCodigo(codigo, sequelize) {
  const termo = String(codigo || '').trim().toUpperCase();
  if (!termo || termo.length > 40) throw Object.assign(new Error('Codigo da solicitacao invalido.'), { statusCode: 400 });
  const numero = /^(?:SOL[-\s]*)?0*(\d+)$/i.exec(termo)?.[1];
  const comparacao = `UPPER(TRIM(so.codigo)) = ${sequelize.escape(termo)}`
    + (numero ? ` OR UPPER(TRIM(so.codigo)) REGEXP ${sequelize.escape(`^(SOL[- ]*)?0*${numero}$`)}` : '');
  return sequelize.literal(`EXISTS (SELECT 1 FROM solicitacoes so WHERE (${comparacao}) AND (
    so.id = TituloFinanceiro.solicitacao_id
    OR EXISTS (SELECT 1 FROM titulos_compartilhados_origens tc
      WHERE tc.titulo_financeiro_id = TituloFinanceiro.id AND tc.solicitacao_id = so.id)
    OR EXISTS (SELECT 1 FROM titulo_renegociacao_alocacoes ra
      WHERE ra.titulo_destino_id = TituloFinanceiro.id AND ra.solicitacao_id = so.id)
  ))`);
}

module.exports = { filtroSolicitacaoCodigo };
