const assert = require('assert');
const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(backendRoot, '..');

function read(relativePath) {
  return fs.readFileSync(path.resolve(repositoryRoot, relativePath), 'utf8');
}

function validateRemovedBbAutomaticRelease() {
  const files = [
    'backend/src/config/env.js',
    'backend/src/services/paymentExecutionService.js',
    'backend/src/services/bancoDoBrasilPayments/BancoDoBrasilPaymentProvider.js',
    'backend/src/services/bancoDoBrasilPayments/bancoDoBrasilPayloadMapper.js',
    'backend/.env.example'
  ];
  const source = files.map(read).join('\n');
  assert(!source.includes('BB_AUTO_LIBERAR_LOTE'), 'BB_AUTO_LIBERAR_LOTE ainda existe no runtime.');
  assert(!source.includes('bbAutoLiberarLote'), 'Flag bbAutoLiberarLote ainda existe no runtime.');
  assert(!source.includes('/liberar-pagamentos'), 'Endpoint de liberacao automatica ainda existe no provider.');
  assert(!source.includes('BB_RELEASE_BATCH'), 'Job de liberacao automatica ainda existe no runtime.');
}

function validatePaymentSegregationAndIdempotency() {
  const execution = read('backend/src/services/paymentExecutionService.js');
  const authorization = read('backend/src/services/authorizationService.js');
  const frontendAuthorization = read('frontend/src/utils/acessoProduto.js');

  assert(execution.includes('assertBatchOwnedByUser'), 'Envio nao valida propriedade do lote.');
  assert(execution.includes('assertSenderDidNotApprove'), 'Envio nao bloqueia o aprovador.');
  assert(execution.includes('dedupe_key'), 'Job de envio nao possui chave de deduplicacao.');
  assert(execution.includes('ENVIO_INDETERMINADO'), 'Timeout de envio nao possui estado indeterminado.');
  assert(execution.includes('ensureStableBbRequestId'), 'Numero de requisicao BB nao e estavel.');
  assert(
    authorization.includes("userHasAreaPermission(user, ['financeiro.pagamentos.enviar_banco'])")
      && authorization.includes("!userHasAreaPermission(user, ['financeiro.pagamentos.aprovar'])"),
    'Backend nao separa permissao de aprovacao e envio.'
  );
  assert(
    frontendAuthorization.includes("hasPermissao(user, 'financeiro.pagamentos.enviar_banco')")
      && frontendAuthorization.includes("!hasPermissao(user, 'financeiro.pagamentos.aprovar')"),
    'Frontend nao reflete segregacao de aprovacao e envio.'
  );
}

function validateIdentityHardening() {
  const previousKey = process.env.MFA_ENCRYPTION_KEY;
  process.env.MFA_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  delete require.cache[require.resolve('../src/services/sensitiveFieldCrypto')];
  const cryptoService = require('../src/services/sensitiveFieldCrypto');
  const encrypted = cryptoService.encryptSensitiveValue('JBSWY3DPEHPK3PXP');
  assert(encrypted.startsWith('enc:v1:'), 'Segredo MFA nao foi envelopado.');
  assert.strictEqual(
    cryptoService.decryptSensitiveValue(encrypted),
    'JBSWY3DPEHPK3PXP',
    'Segredo MFA nao sobreviveu ao ciclo de criptografia.'
  );
  if (previousKey === undefined) delete process.env.MFA_ENCRYPTION_KEY;
  else process.env.MFA_ENCRYPTION_KEY = previousKey;

  const auth = read('backend/src/middlewares/auth.js');
  const controller = read('backend/src/controllers/AuthController.js');
  const users = read('backend/src/controllers/UsuarioController.js');
  assert(auth.includes('AUTH_TOKEN_REVOKED') && auth.includes('decoded.token_version'), 'Middleware nao revoga token versionado.');
  assert(controller.includes("User.increment('token_version'"), 'Logout nao revoga sessoes.');
  assert(users.includes('token_version: Number(usuario.token_version || 0) + 1'), 'Troca de senha nao revoga sessoes.');
}

function validateWebhookAndCorsHardening() {
  const google = read('backend/src/services/crmWebhookGoogleService.js');
  const d4sign = read('backend/src/controllers/ComercialContratoDocumentoController.js');
  const bb = read('backend/src/services/paymentExecutionService.js');
  const metaController = read('backend/src/controllers/CrmWebhookMetaController.js');
  const installation = read('backend/src/services/installationConfig.js');

  assert(google.includes('CRM_GOOGLE_WEBHOOK_SECRET nao configurado'), 'Webhook Google ainda pode aceitar sem segredo.');
  assert(d4sign.includes('if (!secret) return false'), 'Webhook D4Sign ainda pode aceitar sem segredo.');
  assert(bb.includes('BB_WEBHOOK_MTLS_REQUIRED'), 'Webhook BB nao exige confirmacao mTLS quando configurada.');
  assert(!metaController.includes("console.log('[META WEBHOOK] HEADERS"), 'Webhook Meta ainda registra headers completos.');
  assert(!installation.includes('sistema-gestao-solicitacoes-*.vercel.app'), 'CORS legado ainda aceita wildcard de preview.');
}

function validateUploadsDecisionIsPreserved() {
  const app = read('backend/src/app.js');
  const s3 = read('backend/src/services/s3.js');
  assert(app.includes("'/uploads'") && app.includes('express.static'), 'Rota legada /uploads foi alterada antes do inventario.');
  assert(s3.includes("process.env.NODE_ENV !== 'production'"), 'Fallback local nao esta limitado a ambiente nao produtivo.');
}

function validateFinancialTitleGranularActions() {
  const { ALL_PERMISSION_KEYS } = require('../src/constants/moduloPermissoes');
  const routes = read('backend/src/routes.js');
  const frontend = read('frontend/src/pages/FinanceiroTitulos.jsx');

  assert(ALL_PERMISSION_KEYS.has('financeiro.titulos.exportar'), 'Permissao de exportar titulos ausente.');
  assert(ALL_PERMISSION_KEYS.has('financeiro.titulos.importar_codigos'), 'Permissao de importar codigos ausente.');
  assert(
    routes.includes("userHasAreaPermission(req.user, ['financeiro.titulos.importar_codigos'])")
      && routes.includes("router.post('/financeiro/titulos/importar-codigos-barras', allowTituloImportarCodigos"),
    'Importacao de codigos nao esta protegida pela permissao granular.'
  );
  const app = read('frontend/src/App.jsx');
  assert(app.includes('path="financeiro/cadastros" element={<FinanceiroRoute permissionKey="financeiro.cadastros.visualizar">'),
    'Acesso direto a Cadastros nao respeita permissao granular.');
  assert(app.includes('permissionKey ? !canAccessFinanceiroArea(user, permissionKey) : !canAccessFinanceiro(user)'),
    'FinanceiroRoute nao verifica sua permissao granular.');
  assert(frontend.includes("hasPermissao(user, 'financeiro.titulos.exportar')"), 'Botao Exportar titulos nao respeita permissao granular.');
  assert(frontend.includes("hasPermissao(user, 'financeiro.titulos.importar_codigos')"), 'Botao Importar codigos nao respeita permissao granular.');
}

validateRemovedBbAutomaticRelease();
validatePaymentSegregationAndIdempotency();
validateIdentityHardening();
validateWebhookAndCorsHardening();
validateUploadsDecisionIsPreserved();
validateFinancialTitleGranularActions();

console.log('Validacoes do hardening de seguranca concluidas com sucesso.');
