import assert from 'node:assert/strict';
import { normalizarErroPasskey, passkeyInterrompida, mensagemPasskeyInterrompida } from '../src/utils/passkeyInterrompida.js';
for (const erro of [
  {name:'NotAllowedError',message:'The operation either timed out or was not allowed. See: https://www.w3.org/'},
  {name:'AbortError'}, {code:'ERROR_CEREMONY_ABORTED'},
  {name:'WebAuthnError',cause:{name:'NotAllowedError'}},
  Error('Authentication was not completed')
]) {
  const normalizado=normalizarErroPasskey(erro);
  assert(passkeyInterrompida(normalizado));assert.equal(normalizado.cause,erro);
  assert(!/w3\.org|timed out/.test(normalizado.message));
}
for (const erro of [Error('Falha de rede'),{name:'SecurityError',message:'RP ID invalido'},
  {name:'NotSupportedError'},{code:'ERROR_INVALID_RP_ID'}, {status:403,message:'Sem permissao'},null]) {
  assert.equal(normalizarErroPasskey(erro),erro);assert(!passkeyInterrompida(erro));
}
const ciclico={name:'SecurityError'};ciclico.cause=ciclico;assert.equal(normalizarErroPasskey(ciclico),ciclico);
assert.match(mensagemPasskeyInterrompida(),/Nenhuma decisão foi enviada/);
assert.match(mensagemPasskeyInterrompida(2),/2 título\(s\) já confirmado\(s\)/);
assert(!mensagemPasskeyInterrompida(2).includes('Nenhuma decisão'));
console.log('Passkey: cancelamento/timeout sem causa presumida, SDK/cause, erros reais preservados e mensagem de lotes parciais aprovados. Sem rede.');
