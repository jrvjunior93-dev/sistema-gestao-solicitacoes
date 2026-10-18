import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { normalizarErroPasskey } from './passkeyInterrompida';

export function suportaPasskeys() {
  return browserSupportsWebAuthn();
}

export function registrarPasskey(optionsJSON) {
  return startRegistration({ optionsJSON });
}

export async function autenticarComPasskey(optionsJSON) {
  try { return await startAuthentication({ optionsJSON }); }
  catch (erro) { throw normalizarErroPasskey(erro); }
}
