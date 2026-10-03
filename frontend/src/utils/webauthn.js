import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser';

export function suportaPasskeys() {
  return browserSupportsWebAuthn();
}

export function registrarPasskey(optionsJSON) {
  return startRegistration({ optionsJSON });
}

export function autenticarComPasskey(optionsJSON) {
  return startAuthentication({ optionsJSON });
}
