'use strict';

// Exclusao logica nao e um status de fluxo nem arquivamento por usuario.
// O bypass de permissao nao reativa um registro excluido.
function solicitacaoIndisponivel(solicitacao) {
  return !solicitacao || solicitacao.cancelada === true || solicitacao.cancelada === 1;
}

module.exports = { solicitacaoIndisponivel };
