'use strict';

/**
 * Leitura do segredo TOTP sem derrubar a rota (20/08).
 *
 * `users.mfa_totp_secret` e um campo com getter que DECIFRA o valor (AES-256-GCM, chave
 * `MFA_ENCRYPTION_KEY`). Quando o valor guardado nao decifra com a chave atual — banco restaurado
 * de outro ambiente, chave rotacionada, registro corrompido — o getter lanca. E como toda leitura
 * e um simples `user.mfa_totp_secret`, a excecao escapa de dentro de um `if` e vira **500 opaco**
 * no login: a tela mostra "erro" e ninguem descobre que o problema e a chave.
 *
 * Aqui a falha vira um valor: `SEGREDO_ILEGIVEL`. Quem chama decide o que fazer, e a decisao e
 * sempre a mesma — **recusar com mensagem clara, nunca liberar**. Tratar segredo ilegivel como
 * "usuario sem MFA" seria transformar uma falha de infraestrutura em bypass de segundo fator.
 */

// O sentinela vem do proprio getter (ver `sensitiveFieldCrypto`): quem decide que o valor nao
// decifrou e a leitura do campo, nao este servico.
const { VALOR_ILEGIVEL } = require('./sensitiveFieldCrypto');

const SEGREDO_ILEGIVEL = VALOR_ILEGIVEL;

const MENSAGEM_ILEGIVEL = 'O segundo fator deste usuario nao pode ser lido neste ambiente '
  + '(MFA_ENCRYPTION_KEY nao confere com o dado gravado). Procure o administrador do sistema.';

/** Devolve o segredo decifrado, `null` se nao houver, ou `SEGREDO_ILEGIVEL` se nao decifrar. */
function lerSegredoTotp(user) {
  // O `try` ficou de proposito: getters de outros modelos (ou versoes antigas deste) ainda podem
  // lancar, e este servico e a fronteira que promete nao propagar isso.
  try {
    return user?.mfa_totp_secret ?? null;
  } catch (erro) {
    return SEGREDO_ILEGIVEL;
  }
}

function segredoIlegivel(valor) {
  return valor === SEGREDO_ILEGIVEL;
}

module.exports = { lerSegredoTotp, segredoIlegivel, SEGREDO_ILEGIVEL, MENSAGEM_ILEGIVEL };
