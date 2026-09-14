'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  isDevUserSwitchRuntimeEnabled,
  normalizeUserIds,
  parseConfiguredUserIds
} = require('../src/services/devUserSwitchService');

assert.strictEqual(isDevUserSwitchRuntimeEnabled({
  deploymentEnvironment: 'development',
  devUserSwitchEnabled: true
}), true, 'development com flag explicita deve habilitar');

assert.strictEqual(isDevUserSwitchRuntimeEnabled({
  deploymentEnvironment: 'dev',
  devUserSwitchEnabled: true
}), true, 'alias dev com flag explicita deve habilitar');

for (const deploymentEnvironment of ['', 'production', 'main', 'homologacao', 'staging']) {
  assert.strictEqual(isDevUserSwitchRuntimeEnabled({
    deploymentEnvironment,
    devUserSwitchEnabled: true
  }), false, `${deploymentEnvironment || 'ambiente vazio'} nao pode habilitar a troca`);
}

assert.strictEqual(isDevUserSwitchRuntimeEnabled({
  deploymentEnvironment: 'development',
  devUserSwitchEnabled: false
}), false, 'ambiente development sem flag deve permanecer bloqueado');

assert.deepStrictEqual(normalizeUserIds(['2', 2, 3, 0, -1, 'x']), [2, 3]);
assert.deepStrictEqual(parseConfiguredUserIds('{"user_ids":[4,"5",4]}'), [4, 5]);
assert.deepStrictEqual(parseConfiguredUserIds('invalido'), []);

const authMiddleware = fs.readFileSync(
  path.resolve(__dirname, '../src/middlewares/auth.js'),
  'utf8'
);
assert.match(authMiddleware, /actor_token_version/);
assert.match(authMiddleware, /isDevUserSwitchRuntimeEnabled\(\)/);
assert.match(authMiddleware, /targetId !== Number\(user\.id\)/);

const routes = fs.readFileSync(path.resolve(__dirname, '../src/routes.js'), 'utf8');
assert.match(routes, /auth\/dev-user-switch\/assume', requireMfaCompletion, requireCustosRecebiveisCompletion/);
assert.match(routes, /configuracoes\/dev-user-switch', permit\(\['SUPERADMIN'\]\)/);

console.log('Troca rapida de usuarios exclusiva de desenvolvimento validada com sucesso.');
