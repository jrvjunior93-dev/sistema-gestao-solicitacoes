'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { parsePaymentOwnerApprovalMode } = require('../src/config/env');
const { resolvePaymentQueueGate } = require('../src/services/paymentOwnerApprovalPolicy');
const { sha256 } = require('../src/services/pagamentoAutorizacaoService');
const { ALL_PERMISSION_KEYS } = require('../src/constants/moduloPermissoes');

assert.strictEqual(parsePaymentOwnerApprovalMode(undefined), 'OFF');
assert.strictEqual(parsePaymentOwnerApprovalMode('invalido'), 'OFF');
assert.strictEqual(parsePaymentOwnerApprovalMode('pilot'), 'PILOT');
assert.strictEqual(resolvePaymentQueueGate({ mode: 'OFF' }), 'LEGACY');
assert.strictEqual(resolvePaymentQueueGate({ mode: 'PILOT', pilotParticipant: false }), 'LEGACY');
assert.strictEqual(resolvePaymentQueueGate({ mode: 'PILOT', pilotParticipant: true }), 'AUTHORIZATION_REQUIRED');
assert.strictEqual(resolvePaymentQueueGate({ mode: 'ENFORCED' }), 'AUTHORIZATION_REQUIRED');
assert.strictEqual(resolvePaymentQueueGate({ mode: 'PAUSED', internalAuthorization: true }), 'PAUSED');
assert.strictEqual(resolvePaymentQueueGate({ mode: 'ENFORCED', internalAuthorization: true }), 'INTERNAL_AUTHORIZED');
assert.strictEqual(sha256({ b: 2, a: 1 }), sha256({ a: 1, b: 2 }));

for (const key of [
  'financeiro.autorizacoes_pagamento.visualizar',
  'financeiro.autorizacoes_pagamento.preparar',
  'financeiro.autorizacoes_pagamento.decidir',
  'financeiro.autorizacoes_pagamento.configurar',
  'financeiro.autorizacoes_pagamento.auditar'
]) assert(ALL_PERMISSION_KEYS.has(key), `Permissao ausente: ${key}`);

const migration = fs.readFileSync(path.resolve(__dirname, '../migrations/202609300004_pagamento_autorizacao_proprietario.js'), 'utf8');
assert(!/\b(?:INSERT|UPDATE|DELETE|REPLACE)\s+/i.test(migration), 'Migration nao pode alterar dados.');
for (const table of ['pagamento_autorizacao_lotes', 'pagamento_autorizacao_itens', 'pagamento_autorizacao_eventos', 'pagamento_autorizadores', 'webauthn_credentials']) {
  assert(migration.includes(table), `Tabela ausente da migration: ${table}`);
}

const sw = fs.readFileSync(path.resolve(__dirname, '../../frontend/public/sw.js'), 'utf8');
assert(sw.includes("requestUrl.pathname.startsWith('/api/')"), 'Service worker deve excluir APIs do cache.');
const staticAssetsSource = sw.match(/const STATIC_ASSETS = (\[[^;]+\]);/)?.[1] || '';
assert(!staticAssetsSource.includes('financeiro/autorizacoes-pagamento'), 'Dossies nao podem ser pre-cacheados.');
assert(sw.includes('if (!STATIC_ASSETS.includes(requestUrl.pathname)) return;'), 'Somente ativos estaticos declarados podem ser servidos pelo cache.');

const approvalService = fs.readFileSync(path.resolve(__dirname, '../src/services/pagamentoAutorizacaoService.js'), 'utf8');
assert(approvalService.includes('O preparador nao pode autorizar o proprio lote.'), 'Segregacao entre preparacao e decisao ausente.');
assert(approvalService.includes('copyStorageObject'), 'Documentos do dossie devem ser copiados para area isolada.');
assert(approvalService.includes('sha256(storedMaterial) === sha256(currentMaterial)'), 'Revalidacao material do dossie ausente.');

const authorizationService = fs.readFileSync(path.resolve(__dirname, '../src/services/authorizationService.js'), 'utf8');
assert(
  /async function userHasNominalAreaPermission[\s\S]*?if \(isSuperadmin\(user\)\) return true;/.test(authorizationService),
  'SUPERADMIN deve preservar o bypass global das permissoes do modulo.'
);
assert(
  approvalService.includes('Usuario nao cadastrado como autorizador nominal de pagamentos.'),
  'Assinatura financeira deve continuar exigindo autorizador nominal ativo.'
);

const pushService = fs.readFileSync(path.resolve(__dirname, '../src/services/webPushService.js'), 'utf8');
assert(!pushService.includes('valor_total'), 'Push nao pode expor valores financeiros.');
assert(!pushService.includes('credor'), 'Push nao pode expor credores.');

console.log('Autorizacao do proprietario validada: OFF preserva legado, gates, schema, permissoes, hashes e cache seguro.');
