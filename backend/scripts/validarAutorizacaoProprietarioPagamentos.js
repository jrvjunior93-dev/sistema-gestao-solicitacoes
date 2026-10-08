'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { parsePaymentOwnerApprovalMode } = require('../src/config/env');
const { resolvePaymentQueueGate } = require('../src/services/paymentOwnerApprovalPolicy');
const {
  sha256,
  classifyWebauthnVerificationError,
  sanitizeDecisionDiagnosticMessage
} = require('../src/services/pagamentoAutorizacaoService');
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
assert.strictEqual(classifyWebauthnVerificationError(new Error('Unexpected authentication response challenge')), 'CHALLENGE_MISMATCH');
assert.strictEqual(classifyWebauthnVerificationError(new Error('Unexpected authentication response origin')), 'ORIGIN_MISMATCH');
assert.strictEqual(classifyWebauthnVerificationError(new Error('Unexpected RP ID hash')), 'RP_ID_MISMATCH');
assert.strictEqual(classifyWebauthnVerificationError(new Error('Invalid signature')), 'SIGNATURE_INVALID');
assert.strictEqual(classifyWebauthnVerificationError(new Error('Credential public key was invalid')), 'PUBLIC_KEY_INVALID');
assert.strictEqual(classifyWebauthnVerificationError(new Error('Unknown verifier failure with sensitive values')), 'UNCLASSIFIED');
const diagnosticSecret = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';
const sanitizedDiagnostic = sanitizeDecisionDiagnosticMessage(new Error(`Unexpected token ${diagnosticSecret} at https://refactor-dev.jrfluxy.com.br`));
assert(!sanitizedDiagnostic.includes(diagnosticSecret), 'Diagnostico nao pode registrar tokens WebAuthn.');
assert(!sanitizedDiagnostic.includes('https://'), 'Diagnostico nao pode registrar a origem completa.');

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
assert(
  approvalService.includes('[payment-owner-webauthn-verification-failed]'),
  'Falhas WebAuthn devem produzir diagnostico seguro no backend.'
);
assert(
  approvalService.includes('[payment-owner-decision-failed]'),
  'Falhas da decisao devem identificar a etapa segura no backend.'
);
assert(
  !/await\s+recordEvent\(\{\s*loteId\s*,/.test(approvalService),
  'Eventos da decisao devem mapear explicitamente loteId: lotId para evitar ReferenceError.'
);
assert(
  approvalService.includes("throw httpError(403, 'Nao foi possivel validar a passkey neste dispositivo."),
  'Falhas WebAuthn devem retornar resposta operacional controlada.'
);

const pushService = fs.readFileSync(path.resolve(__dirname, '../src/services/webPushService.js'), 'utf8');
assert(!pushService.includes('valor_total'), 'Push nao pode expor valores financeiros.');
assert(!pushService.includes('credor'), 'Push nao pode expor credores.');
assert(pushService.includes('[payment-owner-push-${marker}]'), 'Push deve produzir diagnostico seguro de configuracao e entrega.');
assert(pushService.includes("reason: 'VAPID_NOT_CONFIGURED'"), 'Push deve distinguir ambiente sem VAPID.');
assert(pushService.includes("reason: 'NO_ACTIVE_SUBSCRIPTIONS'"), 'Push deve distinguir autorizador sem assinatura ativa.');
assert(pushService.includes("logPushDiagnostic('error', 'delivery-failed'"), 'Push deve identificar rejeicoes do provedor sem expor a assinatura.');
assert(pushService.includes("logPushDiagnostic('info', 'delivery-summary'"), 'Push deve resumir quantas assinaturas receberam o aviso.');
assert(approvalService.includes('push_subscribed: pushSubscribed'), 'Sessao deve informar se a assinatura push esta ativa no backend.');

const approvalPage = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/FinanceiroAutorizacoesPagamento.jsx'), 'utf8');
assert(approvalPage.includes('Valor do título'), 'Tela movel deve identificar o valor individual do titulo junto ao item.');
assert(approvalPage.includes('money(item.valor_snapshot)'), 'Valor exibido no item deve vir do snapshot individual autorizado.');
assert(approvalPage.includes('resumoSolicitacaoAutorizacao(snapshot)'), 'Resumo deve preservar descricao dos demais tipos e ocultar itens de compras.');
assert(approvalPage.includes('caps.push_subscribed'), 'Tela deve reconciliar a assinatura do navegador com o backend.');

const rateLimitStore = fs.readFileSync(path.resolve(__dirname, '../src/services/rateLimitStore.js'), 'utf8');
assert(rateLimitStore.includes('client.pTTL(namespacedKey)'), 'Rate limit deve usar o metodo pTTL da API do Redis.');
assert(!rateLimitStore.includes('client.pTtl('), 'Rate limit nao pode usar o metodo Redis inexistente pTtl.');
assert(rateLimitStore.includes('error.statusCode = 503;'), 'Falha do Redis obrigatorio deve retornar indisponibilidade controlada.');

const rateLimitMiddleware = fs.readFileSync(path.resolve(__dirname, '../src/middlewares/rateLimit.js'), 'utf8');
assert(rateLimitMiddleware.includes('return next(error);'), 'Rate limit deve encaminhar rejeicoes assincronas ao tratador de erros.');

console.log('Autorizacao do proprietario validada: OFF preserva legado, gates, schema, permissoes, hashes e cache seguro.');
