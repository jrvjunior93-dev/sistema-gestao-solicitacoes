'use strict';
// Configuracao e assinatura reais, ambiente ficticio. Nao le .env nem banco/rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const jwt = require('jsonwebtoken');
function carregar(file, deps, extras = {}) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src', file), 'utf8'), {
    module, console, ...extras, require(id) { if (id in deps) return deps[id]; throw Error('Import nao isolado: ' + id); }
  });
  return module.exports;
}
function configuracao(variables = {}) {
  return carregar('config/env.js', { path, dotenv: { config() {} } }, {
    __dirname: path.resolve(__dirname, '../src/config'),
    process: { env: { JWT_SECRET: 'segredo-ficticio-somente-qa-sessao', AUTH_COOKIE_SECURE: 'true', ...variables } }
  }).env;
}
const env = configuracao();
assert.equal(env.jwtExpiresIn, '12h');
assert.equal(configuracao({ JWT_EXPIRES_IN: '' }).jwtExpiresIn, '12h');
assert.equal(configuracao({ JWT_EXPIRES_IN: ' 12h ' }).jwtExpiresIn, '12h');
assert.equal(configuracao({ JWT_EXPIRES_IN: '8h' }).jwtExpiresIn, '8h', 'Configuracao explicita deve ser ajustada no deploy, nao ignorada');
assert.match(fs.readFileSync(path.resolve(__dirname, '../.env.example'), 'utf8'), /^JWT_EXPIRES_IN=12h$/m);
const inicio = Math.floor(Date.now() / 1000);
const service = carregar('services/authSessionService.js', { crypto: require('node:crypto'), jsonwebtoken: jwt, '../config/env': { env } }, { Date: { now: () => inicio * 1000 } });
const token = service.buildAuthToken({ id: 9, token_version: 3, iat: inicio });
const decoded = jwt.verify(token, env.jwtSecret, { clockTimestamp: inicio });
assert.equal(decoded.exp - decoded.iat, 12 * 3600);
for (const segundos of [8 * 3600, 11 * 3600, 12 * 3600 - 1]) assert.equal(jwt.verify(token, env.jwtSecret, { clockTimestamp: inicio + segundos }).id, 9);
assert.throws(() => jwt.verify(token, env.jwtSecret, { clockTimestamp: inicio + 12 * 3600 }), /jwt expired/);
assert.throws(() => jwt.verify(token, 'outra-chave-de-fixture'), /invalid signature/);
const antigo = jwt.sign({ id: 9, iat: inicio }, env.jwtSecret, { expiresIn: '8h' });
assert.throws(() => jwt.verify(antigo, env.jwtSecret, { clockTimestamp: inicio + 8 * 3600 }), /jwt expired/, 'Nao estende tokens antigos');
assert.equal(service.decodeTokenExpiry(token), (inicio + 12 * 3600) * 1000);
const cookies = [], headers = [];
service.setAuthCookies({ cookie: (...args) => cookies.push(args), set: (...args) => headers.push(args) }, token, 'csrf-fixture');
assert.equal(cookies.length, 2);
assert.equal(cookies[0][0], env.authCookieName); assert.equal(cookies[1][0], env.csrfCookieName);
assert.equal(cookies[0][2].maxAge, 12 * 3600 * 1000); assert.equal(cookies[1][2].maxAge, cookies[0][2].maxAge);
assert.equal(cookies[0][2].httpOnly, true); assert.equal(cookies[1][2].httpOnly, false);
assert(cookies.every(c => c[2].secure && c[2].sameSite === 'lax' && c[2].path === '/'));
assert.equal(headers[0][0], env.csrfHeaderName);
const challenge = service.buildMfaChallengeToken({ id: 9, token_version: 3 });
const mfa = jwt.verify(challenge, env.jwtSecret);
assert.equal(mfa.exp - mfa.iat, 5 * 60, 'Desafio MFA nao herda as 12 horas');
assert.equal(service.verifyMfaChallengeToken(challenge).purpose, 'MFA_CHALLENGE');
assert.throws(() => service.verifyMfaChallengeToken(token), /MFA challenge invalido/);
const removidos = [];
service.clearAuthCookies({ clearCookie: (...args) => removidos.push(args) });
assert.equal(removidos.length, 2);
console.log('Sessao 12h: padrao/exemplo, JWT valido apos 8h e expirado em 12h, cookies/CSRF alinhados, tokens antigos e MFA preservados. Sem .env/banco/rede.');
