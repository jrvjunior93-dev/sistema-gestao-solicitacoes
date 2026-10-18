const CODIGO = 'PASSKEY_NAO_CONCLUIDA';

// Usado exclusivamente no catch da cerimonia local, nunca em respostas HTTP.
// NotAllowedError tambem cobre timeout/recusa do navegador; nao inferir causa.
export function normalizarErroPasskey(erro) {
  const vistos = new Set();
  let causa = erro;
  while (causa && typeof causa === 'object' && !vistos.has(causa)) {
    vistos.add(causa);
    if (['NotAllowedError', 'AbortError'].includes(causa.name) || causa.code === 'ERROR_CEREMONY_ABORTED'
      || causa.message === 'Authentication was not completed') {
      const amigavel = new Error('Confirmação por passkey não concluída.');
      amigavel.code = CODIGO; amigavel.cause = erro;
      return amigavel;
    }
    causa = causa.cause;
  }
  return erro;
}
export const passkeyInterrompida = erro => erro?.code === CODIGO;
export function mensagemPasskeyInterrompida(confirmados = 0) {
  return `Confirmação por passkey não concluída. ${confirmados > 0
    ? `${confirmados} título(s) já confirmado(s); os demais não foram alterados.`
    : 'Nenhuma decisão foi enviada.'} Você pode tentar novamente.`;
}
