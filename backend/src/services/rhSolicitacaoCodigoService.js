'use strict';

/**
 * Codigo humano das solicitacoes RH/DP.
 *
 * O id continua sendo a chave tecnica e o codigo e derivado dele dentro da mesma transacao. Assim
 * nao existe contador paralelo sujeito a corrida, nem risco de duas solicitacoes receberem o mesmo
 * numero em cliques simultaneos.
 */
async function garantirCodigoRhSolicitacao(solicitacao, transaction = null) {
  if (!solicitacao || solicitacao.codigo) return solicitacao;
  const codigo = `RH-${String(solicitacao.id).padStart(6, '0')}`;
  await solicitacao.update({ codigo }, { transaction });
  return solicitacao;
}

module.exports = { garantirCodigoRhSolicitacao };
