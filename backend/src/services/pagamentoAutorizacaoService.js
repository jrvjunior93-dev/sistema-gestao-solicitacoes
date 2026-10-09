const crypto = require('crypto');
const { Op } = require('sequelize');
const { env } = require('../config/env');
const {
  Anexo,
  EmpresaGrupo,
  FormaPagamentoFinanceira,
  Obra,
  PagamentoAutorizador,
  PagamentoAutorizacaoDocumento,
  PagamentoAutorizacaoItem,
  PagamentoAutorizacaoLote,
  Parceiro,
  PaymentBeneficiary,
  PaymentIntent,
  PagamentoManualFilaItem,
  Solicitacao,
  TituloFinanceiro,
  User,
  WebauthnCredential,
  sequelize
} = require('../models');
const { userHasNominalAreaPermission, getFinanceiroObraScopeIds } = require('./authorizationService');
const { marcarAnaliseProprietario, registrarAnaliseRecusada } = require('./analiseProprietarioService');
const { enfileirarTitulosAutorizados } = require('./pagamentoManualFilaService');
const { sha256, recordEvent } = require('./pagamentoAutorizacaoEventosService');
const { copyStorageObject, getPresignedUrl } = require('./s3');
const { saveChallenge, consumeChallenge } = require('./webauthnChallengeStore');
const { isConfigured: isPushConfigured, saveSubscription, removeSubscription, hasActiveSubscription, sendPendingAuthorizationNotification } = require('./webPushService');
const { registrarEventoSeguranca } = require('./securityLogService');

const PERMISSIONS = Object.freeze({
  VIEW: 'financeiro.autorizacoes_pagamento.visualizar',
  PREPARE: 'financeiro.autorizacoes_pagamento.preparar',
  DECIDE: 'financeiro.autorizacoes_pagamento.decidir',
  CONFIGURE: 'financeiro.autorizacoes_pagamento.configurar',
  AUDIT: 'financeiro.autorizacoes_pagamento.auditar'
});

function httpError(statusCode, message, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}

function roundCurrency(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function maskDocument(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length <= 4) return digits ? `***${digits}` : null;
  return `${'*'.repeat(Math.max(3, digits.length - 4))}${digits.slice(-4)}`;
}

function maskPaymentValue(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (text.length <= 4) return `***${text}`;
  return `${'*'.repeat(Math.min(8, text.length - 4))}${text.slice(-4)}`;
}

function assertFeatureAvailable({ allowPausedRead = false } = {}) {
  if (env.paymentOwnerApprovalMode === 'OFF') throw httpError(404, 'Funcionalidade nao habilitada.', 'PAYMENT_OWNER_APPROVAL_OFF');
  if (!allowPausedRead && env.paymentOwnerApprovalMode === 'PAUSED') {
    throw httpError(423, 'Autorizacoes de pagamento temporariamente pausadas.', 'PAYMENT_OWNER_APPROVAL_PAUSED');
  }
}

function assertNoDevSwitch(req) {
  if (req.dev_user_switch || req.auth?.dev_user_switch) {
    throw httpError(403, 'Passkeys e decisoes ficam bloqueadas durante o modo Testar usuario.');
  }
}

async function hasPermission(user, permission) {
  return userHasNominalAreaPermission(user, [permission]);
}

async function assertPermission(user, permission) {
  if (!await hasPermission(user, permission)) throw httpError(403, 'Permissao nominal obrigatoria para esta operacao.');
}

async function getAuthorizer(userId) {
  return PagamentoAutorizador.findOne({ where: { usuario_id: userId, ativo: true } });
}

async function assertActiveAuthorizer(user) {
  await assertPermission(user, PERMISSIONS.DECIDE);
  const authorizer = await getAuthorizer(user.id);
  if (!authorizer) throw httpError(403, 'Usuario nao cadastrado como autorizador nominal de pagamentos.');
  return authorizer;
}

async function capabilitiesForUser(user) {
  const mode = env.paymentOwnerApprovalMode;
  const base = { mode, enabled: mode !== 'OFF', paused: mode === 'PAUSED', prepare_required: false, can_view: false, can_prepare: false, can_decide: false, can_configure: false, passkey_count: 0, push_available: isPushConfigured(), push_subscribed: false, push_public_key: isPushConfigured() ? env.webPushVapidPublicKey : null };
  if (!user?.id || mode === 'OFF') return base;
  const [canView, canPrepare, canDecidePermission, canConfigure, authorizer, passkeyCount, pushSubscribed] = await Promise.all([
    hasPermission(user, PERMISSIONS.VIEW),
    hasPermission(user, PERMISSIONS.PREPARE),
    hasPermission(user, PERMISSIONS.DECIDE),
    hasPermission(user, PERMISSIONS.CONFIGURE),
    getAuthorizer(user.id),
    WebauthnCredential.count({ where: { usuario_id: user.id, ativo: true } }),
    hasActiveSubscription(user.id)
  ]);
  return {
    ...base,
    can_view: canView || canPrepare || (canDecidePermission && Boolean(authorizer)),
    can_prepare: canPrepare,
    can_decide: canDecidePermission && Boolean(authorizer),
    can_configure: canConfigure,
    prepare_required: mode === 'ENFORCED' || (mode === 'PILOT' && canPrepare),
    pilot: Boolean(authorizer?.piloto),
    passkey_count: passkeyCount,
    push_subscribed: pushSubscribed
  };
}

function titleInclude() {
  return [
    { model: Parceiro, as: 'parceiro', attributes: ['id', 'nome', 'cpf_cnpj'] },
    { model: Parceiro, as: 'favorecidoPagamento', attributes: ['id', 'nome', 'cpf_cnpj'] },
    { model: Obra, as: 'obra', attributes: ['id', 'codigo', 'nome'] },
    { model: EmpresaGrupo, as: 'empresa', attributes: ['id', 'codigo', 'nome'] },
    { model: Solicitacao, as: 'solicitacao', attributes: ['id', 'codigo', 'descricao'] },
    { model: FormaPagamentoFinanceira, as: 'formaPagamento', attributes: ['id', 'nome', 'codigo', 'tipo'] },
    { model: PaymentBeneficiary, as: 'paymentBeneficiary', attributes: ['id', 'nome', 'cpf_cnpj', 'metodo_preferencial', 'pix_tipo_chave', 'pix_chave', 'banco_codigo', 'agencia', 'conta', 'tipo_conta'] }
  ];
}

function buildSnapshot(title) {
  const creditor = title.favorecidoPagamento || title.parceiro;
  return {
    titulo_id: Number(title.id),
    codigo: title.codigo || null,
    descricao: title.descricao,
    valor_saldo: roundCurrency(title.valor_saldo),
    // Omitir zeros mantem hashes de dossies legados sem encargos inalterados.
    ...(Number(title.valor_baixado || 0) <= 0 && (Number(title.juros || 0) || Number(title.multa || 0)) ? {
      juros: roundCurrency(title.juros), multa: roundCurrency(title.multa),
      valor_total: roundCurrency(Number(title.valor_saldo) + Number(title.juros || 0) + Number(title.multa || 0))
    } : {}),
    data_vencimento: title.data_vencimento,
    empresa: title.empresa ? { id: Number(title.empresa.id), nome: title.empresa.nome } : null,
    obra: title.obra ? { id: Number(title.obra.id), codigo: title.obra.codigo, nome: title.obra.nome } : null,
    credor: creditor ? { id: Number(creditor.id), nome: creditor.nome, documento_mascarado: maskDocument(creditor.cpf_cnpj) } : null,
    solicitacao: title.solicitacao ? { codigo: title.solicitacao.codigo, descricao: title.solicitacao.descricao } : null,
    forma_pagamento: title.formaPagamento ? { id: Number(title.formaPagamento.id), nome: title.formaPagamento.nome, codigo: title.formaPagamento.codigo, tipo: title.formaPagamento.tipo } : null,
    favorecido_pagamento: title.paymentBeneficiary ? {
      id: Number(title.paymentBeneficiary.id), nome: title.paymentBeneficiary.nome,
      documento_mascarado: maskDocument(title.paymentBeneficiary.cpf_cnpj),
      metodo: title.paymentBeneficiary.metodo_preferencial,
      pix_tipo: title.paymentBeneficiary.pix_tipo_chave,
      pix_mascarado: maskPaymentValue(title.paymentBeneficiary.pix_chave),
      banco: title.paymentBeneficiary.banco_codigo,
      agencia_mascarada: maskPaymentValue(title.paymentBeneficiary.agencia),
      conta_mascarada: maskPaymentValue(title.paymentBeneficiary.conta),
      tipo_conta: title.paymentBeneficiary.tipo_conta
    } : null
  };
}

async function createBatch(req, payload = {}) {
  assertFeatureAvailable();
  await assertPermission(req.user, PERMISSIONS.PREPARE);
  const titleIds = Array.from(new Set((payload.titulo_ids || []).map(Number).filter((id) => Number.isInteger(id) && id > 0)));
  if (!titleIds.length || titleIds.length > 200) throw httpError(400, 'Selecione entre 1 e 200 titulos para autorizacao.');
  const idempotencyKey = String(payload.idempotency_key || crypto.randomUUID()).slice(0, 120);
  const obrasPermitidas = await getFinanceiroObraScopeIds(req.user);
  const existing = await PagamentoAutorizacaoLote.findOne({ where: { idempotency_key: idempotencyKey } });
  if (existing) return getBatch(req, existing.id);

  const result = await sequelize.transaction(async (transaction) => {
    const titles = await TituloFinanceiro.findAll({ where: { id: { [Op.in]: titleIds } }, include: titleInclude(), transaction, lock: transaction.LOCK.UPDATE, order: [['id', 'ASC']] });
    if (titles.length !== titleIds.length) throw httpError(404, 'Um ou mais titulos nao foram encontrados.');
    if (obrasPermitidas !== null && titles.some((title) => !obrasPermitidas.includes(Number(title.obra_id)))) {
      throw httpError(403, 'Um ou mais titulos nao pertencem a uma obra do seu acesso.');
    }
    const concurrentDuplicate = await PagamentoAutorizacaoLote.findOne({ where: { idempotency_key: idempotencyKey }, transaction, lock: transaction.LOCK.UPDATE });
    if (concurrentDuplicate) return concurrentDuplicate;
    const activeItems = await PagamentoAutorizacaoItem.findAll({
      where: { titulo_financeiro_id: { [Op.in]: titleIds }, status: { [Op.in]: ['PENDENTE', 'AUTORIZADO'] } }, transaction, lock: transaction.LOCK.UPDATE
    });
    if (activeItems.length) throw httpError(409, 'Um ou mais titulos ja aguardam autorizacao do proprietario.');
    const snapshots = titles.map((title) => {
      if (String(title.tipo).toUpperCase() !== 'PAGAR' || !['ABERTO', 'PARCIAL'].includes(String(title.status).toUpperCase()) || roundCurrency(title.valor_saldo) <= 0) {
        throw httpError(409, `O titulo ${title.codigo || title.id} nao esta elegivel para pagamento.`);
      }
      return buildSnapshot(title);
    });
    const solicitationIds = Array.from(new Set(titles.map((title) => Number(title.solicitacao_id)).filter(Boolean)));
    const attachments = solicitationIds.length ? await Anexo.findAll({
      where: { solicitacao_id: { [Op.in]: solicitationIds }, deleted_at: null },
      attributes: ['id', 'solicitacao_id', 'tipo', 'nome_original', 'caminho_arquivo'], transaction, order: [['id', 'ASC']]
    }) : [];
    const attachmentsBySolicitation = attachments.reduce((map, attachment) => {
      const key = Number(attachment.solicitacao_id);
      if (!map.has(key)) map.set(key, []);
      if (attachment.caminho_arquivo) map.get(key).push(attachment);
      return map;
    }, new Map());
    const dossierMaterial = snapshots.map((snapshot) => {
      const title = titles.find((candidate) => Number(candidate.id) === snapshot.titulo_id);
      const documents = (attachmentsBySolicitation.get(Number(title?.solicitacao_id)) || []).map((attachment) => ({
        origem_id: Number(attachment.id), nome: attachment.nome_original || `Documento ${attachment.id}`,
        origem_tipo: attachment.tipo || 'ANEXO', source_url: attachment.caminho_arquivo,
        arquivo_hash: sha256({ source_url: attachment.caminho_arquivo })
      }));
      return { snapshot, documents: documents.map(({ source_url, ...document }) => document), sourceDocuments: documents };
    });
    const dossierHash = sha256(dossierMaterial.map(({ snapshot, documents }) => ({ snapshot, documents })));
    const now = new Date();
    // Metadado legado NOT NULL: preservado para compatibilidade do schema.
    // Nao representa mais um prazo operacional de decisao do lote.
    const expiresAt = new Date(now.getTime() + env.paymentOwnerApprovalTtlHours * 60 * 60 * 1000);
    const lot = await PagamentoAutorizacaoLote.create({
      codigo: `TMP-${crypto.randomUUID()}`,
      status: 'AGUARDANDO', modo: env.paymentOwnerApprovalMode,
      valor_total: snapshots.reduce((sum, item) => sum + (item.valor_total ?? item.valor_saldo), 0),
      quantidade_itens: snapshots.length, dossie_hash: dossierHash,
      idempotency_key: idempotencyKey, criado_por: req.user.id, expira_em: expiresAt,
      observacao: payload.observacao || null
    }, { transaction });
    // O ID auto-incrementado ja e exclusivo, inclusive em criacoes concorrentes.
    // O codigo temporario acima atende NOT NULL/UNIQUE ate obtermos esse ID.
    // Atualizar na mesma transacao antes de copiar documentos preserva rollback.
    await lot.update({ codigo: `LOTE-${lot.id}` }, { transaction });
    for (const dossierItem of dossierMaterial) {
      const { snapshot, sourceDocuments } = dossierItem;
      const item = await PagamentoAutorizacaoItem.create({ lote_id: lot.id, titulo_financeiro_id: snapshot.titulo_id, status: 'PENDENTE', valor_snapshot: snapshot.valor_total ?? snapshot.valor_saldo, vencimento_snapshot: snapshot.data_vencimento, snapshot_json: snapshot, snapshot_hash: sha256(snapshot) }, { transaction });
      for (const document of sourceDocuments) {
        const arquivoUrlSnapshot = await copyStorageObject(document.source_url, `financeiro/autorizacoes/${lot.codigo}`);
        await PagamentoAutorizacaoDocumento.create({ item_id: item.id, origem_tipo: document.origem_tipo, origem_id: document.origem_id, nome: document.nome, arquivo_url_snapshot: arquivoUrlSnapshot, arquivo_hash: document.arquivo_hash }, { transaction });
      }
    }
    await recordEvent({ loteId: lot.id, userId: req.user.id, type: 'LOTE_CRIADO', data: { titulo_ids: titleIds, dossie_hash: dossierHash }, transaction });
    await marcarAnaliseProprietario({ titulos: titles, usuarioId: req.user.id, transaction, origem: 'DIGITAL', loteId: lot.id });
    return lot;
  });
  const authorizerIds = await PagamentoAutorizador.findAll({ where: { ativo: true }, attributes: ['usuario_id'] });
  sendPendingAuthorizationNotification(authorizerIds.map((item) => Number(item.usuario_id))).catch((error) => {
    console.error('Falha nao bloqueante ao notificar autorizadores de pagamento:', error.message);
  });
  return getBatch(req, result.id);
}

async function assertCanRead(user) {
  const caps = await capabilitiesForUser(user);
  if (!caps.can_view && !caps.can_decide && !caps.can_configure) throw httpError(403, 'Acesso negado as autorizacoes de pagamento.');
  return caps;
}

function lotInclude() {
  return [
    { model: User, as: 'criadoPor', attributes: ['id', 'nome'] },
    { model: User, as: 'decididoPor', attributes: ['id', 'nome'] },
    { model: PagamentoAutorizacaoItem, as: 'itens', include: [
      { model: PagamentoAutorizacaoDocumento, as: 'documentos', attributes: ['id', 'nome', 'origem_tipo', 'arquivo_hash'] },
      // O defaultScope do titulo filtra deleted_at. Mantem LEFT JOIN para nao
      // eliminar o historico nem mover esta juncao para a subquery dos lotes.
      { model: TituloFinanceiro, as: 'titulo', attributes: ['id', 'status', 'valor_baixado'], required: false,
        // Contexto atual, somente leitura, fora do material assinado. Nao
        // modificar snapshots legados nem invalidar autorizacoes existentes.
        include: [{ model: Solicitacao, as: 'solicitacao', attributes: ['id', 'justificativa'], required: false }] }
    ] }
  ];
}

async function listBatches(req, query = {}) {
  assertFeatureAvailable({ allowPausedRead: true });
  await assertCanRead(req.user);
  const status = String(query.status || '').trim().toUpperCase();
  return PagamentoAutorizacaoLote.findAll({ where: status ? { status } : {}, include: lotInclude(), order: [['createdAt', 'DESC']], limit: 100 });
}

async function getBatch(req, id) {
  assertFeatureAvailable({ allowPausedRead: true });
  await assertCanRead(req.user);
  const lot = await PagamentoAutorizacaoLote.findByPk(id, { include: lotInclude() });
  if (!lot) throw httpError(404, 'Lote de autorizacao nao encontrado.');
  return lot;
}

async function openDocument(req, documentId) {
  assertFeatureAvailable({ allowPausedRead: true });
  await assertCanRead(req.user);
  const document = await PagamentoAutorizacaoDocumento.findByPk(documentId, { include: [{ model: PagamentoAutorizacaoItem, as: 'item', attributes: ['lote_id'] }] });
  if (!document) throw httpError(404, 'Documento nao encontrado.');
  return { nome: document.nome, url: await getPresignedUrl(document.arquivo_url_snapshot, 180, { strict: true }) };
}

function assertWebauthnConfig() {
  if (!env.webauthnRpId || !env.webauthnOrigins.length) throw httpError(503, 'WebAuthn nao configurado neste ambiente.');
}

async function webauthnLib() {
  return import('@simplewebauthn/server');
}

function credentialForLibrary(row) {
  return { id: row.credential_id, publicKey: Uint8Array.from(Buffer.from(row.public_key, 'base64')), counter: Number(row.counter || 0), transports: row.transports || undefined };
}

function classifyWebauthnVerificationError(error) {
  const message = String(error?.message || '').toLowerCase();
  if (!message) return 'UNKNOWN';
  if (message.includes('challenge')) return 'CHALLENGE_MISMATCH';
  if (message.includes('origin')) return 'ORIGIN_MISMATCH';
  if (message.includes('rp id') || message.includes('rpid') || message.includes('relying party')) return 'RP_ID_MISMATCH';
  if (message.includes('signature')) return 'SIGNATURE_INVALID';
  if (message.includes('public key')) return 'PUBLIC_KEY_INVALID';
  if (message.includes('counter')) return 'COUNTER_INVALID';
  if (message.includes('user verification') || message.includes('user verified')) return 'USER_VERIFICATION_REQUIRED';
  if (message.includes('credential')) return 'CREDENTIAL_INVALID';
  return 'UNCLASSIFIED';
}

function logWebauthnVerificationFailure({ req, lotId, error, reason }) {
  console.error('[payment-owner-webauthn-verification-failed]', JSON.stringify({
    action: 'AUTHENTICATE',
    reason: reason || classifyWebauthnVerificationError(error),
    error_name: String(error?.name || 'Error').slice(0, 80),
    user_id: Number(req.user?.id) || null,
    lote_id: Number(lotId) || null
  }));
}

function sanitizeDecisionDiagnosticMessage(error) {
  return String(error?.message || '')
    .replace(/https?:\/\/[^\s"']+/gi, '[origin]')
    .replace(/[A-Za-z0-9_-]{20,}/g, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

function logPaymentDecisionFailure({ req, lotId, stage, error }) {
  console.error('[payment-owner-decision-failed]', JSON.stringify({
    stage,
    error_name: String(error?.name || 'Error').slice(0, 80),
    error_code: String(error?.original?.code || error?.code || '').slice(0, 80) || null,
    status_code: Number(error?.statusCode || error?.status) || null,
    message: sanitizeDecisionDiagnosticMessage(error) || null,
    user_id: Number(req.user?.id) || null,
    lote_id: Number(lotId) || null
  }));
}

async function registrationOptions(req) {
  assertFeatureAvailable(); assertNoDevSwitch(req); assertWebauthnConfig();
  await assertActiveAuthorizer(req.user);
  const credentials = await WebauthnCredential.findAll({ where: { usuario_id: req.user.id, ativo: true } });
  const { generateRegistrationOptions } = await webauthnLib();
  const options = await generateRegistrationOptions({
    rpName: env.webauthnRpName, rpID: env.webauthnRpId,
    userName: req.user.email || String(req.user.id), userDisplayName: req.user.nome || String(req.user.id),
    userID: Uint8Array.from(Buffer.from(String(req.user.id))), attestationType: 'none',
    excludeCredentials: credentials.map((item) => ({ id: item.credential_id, transports: item.transports || undefined })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' }
  });
  await saveChallenge({ purpose: 'register', userId: req.user.id }, { challenge: options.challenge });
  return options;
}

async function verifyRegistration(req, payload = {}) {
  assertFeatureAvailable(); assertNoDevSwitch(req); assertWebauthnConfig();
  await assertActiveAuthorizer(req.user);
  const stored = await consumeChallenge({ purpose: 'register', userId: req.user.id });
  if (!stored?.challenge) throw httpError(409, 'Desafio de cadastro expirado. Inicie novamente.');
  const { verifyRegistrationResponse } = await webauthnLib();
  const verification = await verifyRegistrationResponse({ response: payload.credential, expectedChallenge: stored.challenge, expectedOrigin: env.webauthnOrigins, expectedRPID: env.webauthnRpId, requireUserVerification: true });
  if (!verification.verified || !verification.registrationInfo) throw httpError(400, 'Nao foi possivel validar a passkey.');
  const info = verification.registrationInfo;
  await WebauthnCredential.create({
    usuario_id: req.user.id,
    credential_id: info.credential.id,
    public_key: Buffer.from(info.credential.publicKey).toString('base64'),
    counter: Number(info.credential.counter || 0),
    transports: payload.credential?.response?.transports || info.credential.transports || null,
    device_type: info.credentialDeviceType || null,
    backed_up: Boolean(info.credentialBackedUp),
    nome_dispositivo: String(payload.nome_dispositivo || 'Dispositivo pessoal').slice(0, 120),
    ativo: true
  });
  await registrarEventoSeguranca({ req, usuarioId: req.user.id, tipoEvento: 'PAYMENT_OWNER_PASSKEY_REGISTERED', recursoTipo: 'WEBAUTHN_CREDENTIAL', recursoId: info.credential.id, status: 'SUCCESS', descricao: 'Passkey cadastrada para autorizacao de pagamentos' });
  return { verified: true };
}

async function listPasskeys(req) {
  assertFeatureAvailable({ allowPausedRead: true }); assertNoDevSwitch(req);
  await assertActiveAuthorizer(req.user);
  return WebauthnCredential.findAll({
    where: { usuario_id: req.user.id, ativo: true },
    attributes: ['id', 'nome_dispositivo', 'device_type', 'backed_up', 'ultimo_uso_em', 'createdAt'],
    order: [['createdAt', 'ASC']]
  });
}

async function revokePasskey(req, credentialId) {
  assertFeatureAvailable({ allowPausedRead: true }); assertNoDevSwitch(req);
  await assertActiveAuthorizer(req.user);
  const credential = await WebauthnCredential.findOne({ where: { id: Number(credentialId), usuario_id: req.user.id, ativo: true } });
  if (!credential) throw httpError(404, 'Passkey ativa nao encontrada.');
  await credential.update({ ativo: false });
  await registrarEventoSeguranca({ req, usuarioId: req.user.id, tipoEvento: 'PAYMENT_OWNER_PASSKEY_REVOKED', recursoTipo: 'WEBAUTHN_CREDENTIAL', recursoId: String(credential.id), status: 'SUCCESS', descricao: 'Passkey revogada para autorizacao de pagamentos' });
  return { revoked: true };
}

function normalizeDecisions(decisions) {
  if (!Array.isArray(decisions) || !decisions.length) throw httpError(400, 'Selecione ao menos um item para decidir.');
  const result = decisions.map((item) => ({ item_id: Number(item.item_id), decisao: String(item.decisao || '').toUpperCase(), motivo: item.motivo ? String(item.motivo).trim().slice(0, 500) : null })).sort((a, b) => a.item_id - b.item_id);
  if (result.length > 200 || result.some(item => !Number.isSafeInteger(item.item_id) || item.item_id <= 0) ||
    new Set(result.map(item => item.item_id)).size !== result.length) throw httpError(400, 'Itens de decisao invalidos ou repetidos.');
  if (result.some(item => item.decisao === 'REVOGAR') && result.some(item => item.decisao !== 'REVOGAR')) {
    throw httpError(400, 'Revogacao nao pode ser combinada com autorizacao ou rejeicao.');
  }
  return result;
}

async function authenticationOptions(req, lotId, decisions) {
  assertFeatureAvailable(); assertNoDevSwitch(req); assertWebauthnConfig();
  await assertActiveAuthorizer(req.user);
  const lot = await PagamentoAutorizacaoLote.findByPk(lotId);
  const normalized = normalizeDecisions(decisions);
  const revogando = normalized.every(item => item.decisao === 'REVOGAR');
  if (!lot || (!revogando && lot.status !== 'AGUARDANDO')) throw httpError(409, 'Lote nao esta disponivel para decisao.');
  if (!revogando && Number(lot.criado_por) === Number(req.user.id)) throw httpError(403, 'O preparador nao pode autorizar o proprio lote.');
  if (normalized.some((item) => !['AUTORIZAR', 'REJEITAR', 'REVOGAR'].includes(item.decisao))) throw httpError(400, 'Decisao invalida.');
  if (normalized.some((item) => ['REJEITAR', 'REVOGAR'].includes(item.decisao) && !item.motivo)) throw httpError(400, 'Informe o motivo para rejeitar ou revogar um pagamento.');
  const availableItems = await PagamentoAutorizacaoItem.count({ where: { lote_id: lotId, id: { [Op.in]: normalized.map((item) => item.item_id) }, status: revogando ? { [Op.in]: ['AUTORIZADO', 'ENFILEIRADO'] } : 'PENDENTE' } });
  if (availableItems !== normalized.length) throw httpError(409, 'Um ou mais itens ja foram decididos ou nao pertencem ao lote.');
  const credentials = await WebauthnCredential.findAll({ where: { usuario_id: req.user.id, ativo: true } });
  if (!credentials.length) throw httpError(409, 'Cadastre uma passkey antes de autorizar pagamentos.');
  const { generateAuthenticationOptions } = await webauthnLib();
  const options = await generateAuthenticationOptions({ rpID: env.webauthnRpId, userVerification: 'required', allowCredentials: credentials.map((item) => ({ id: item.credential_id, transports: item.transports || undefined })) });
  await saveChallenge({ purpose: 'decide', userId: req.user.id, lotId }, { challenge: options.challenge, decisions_hash: sha256(normalized), dossie_hash: lot.dossie_hash, revisao_autorizacao: Number(lot.revisao_autorizacao || 0) });
  return options;
}

async function decideBatch(req, lotId, payload = {}) {
  let stage = 'PRECONDITIONS';
  try {
    assertFeatureAvailable(); assertNoDevSwitch(req); assertWebauthnConfig();
    const authorizer = await assertActiveAuthorizer(req.user);
    const decisions = normalizeDecisions(payload.decisoes);
    const revogando = decisions.every(item => item.decisao === 'REVOGAR');
    if (decisions.some((item) => !['AUTORIZAR', 'REJEITAR', 'REVOGAR'].includes(item.decisao))) throw httpError(400, 'Decisao invalida.');
    stage = 'CHALLENGE_CONSUME';
    const stored = await consumeChallenge({ purpose: 'decide', userId: req.user.id, lotId });
    if (!stored?.challenge || stored.decisions_hash !== sha256(decisions)) throw httpError(409, 'Desafio expirado ou diferente da decisao confirmada.');
    const credentialId = payload.credential?.id;

    let shouldEnqueue = false;
    stage = 'TRANSACTION_START';
    const lot = await sequelize.transaction(async (transaction) => {
    stage = 'CREDENTIAL_LOCK';
      const credential = await WebauthnCredential.findOne({ where: { usuario_id: req.user.id, credential_id: credentialId, ativo: true }, transaction, lock: transaction.LOCK.UPDATE });
    if (!credential) throw httpError(403, 'Passkey nao reconhecida para este autorizador.');
    stage = 'WEBAUTHN_LIBRARY';
    const { verifyAuthenticationResponse } = await webauthnLib();
    let verification;
    try {
      stage = 'WEBAUTHN_VERIFY';
      verification = await verifyAuthenticationResponse({ response: payload.credential, expectedChallenge: stored.challenge, expectedOrigin: env.webauthnOrigins, expectedRPID: env.webauthnRpId, credential: credentialForLibrary(credential), requireUserVerification: true });
    } catch (error) {
      logWebauthnVerificationFailure({ req, lotId, error });
      throw httpError(403, 'Nao foi possivel validar a passkey neste dispositivo. Tente novamente; se persistir, recadastre a passkey.', 'PAYMENT_OWNER_WEBAUTHN_VERIFICATION_FAILED');
    }
    if (!verification.verified) {
      logWebauthnVerificationFailure({ req, lotId, error: null, reason: 'NOT_VERIFIED' });
      throw httpError(403, 'Confirmacao biometrica invalida.', 'PAYMENT_OWNER_WEBAUTHN_NOT_VERIFIED');
    }
    // Igual ao envio direto/criacao: titulos em ordem estavel antes de lote/item.
    // Releitura bloqueada dos itens abaixo rejeita uma decisao que ficou obsoleta.
    stage = 'TITLES_LOCK';
    const candidatos = await PagamentoAutorizacaoItem.findAll({ where: {
      lote_id: lotId, id: { [Op.in]: decisions.map(item => item.item_id) }
    }, attributes: ['titulo_financeiro_id'], transaction });
    await TituloFinanceiro.findAll({ where: { id: { [Op.in]: candidatos.map(item => Number(item.titulo_financeiro_id)) } },
      attributes: ['id'], transaction, lock: transaction.LOCK.UPDATE, order: [['id', 'ASC']] });
    stage = 'LOT_LOCK';
    const currentLot = await PagamentoAutorizacaoLote.findByPk(lotId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!currentLot || (!revogando && currentLot.status !== 'AGUARDANDO')) throw httpError(409, 'Lote indisponivel para decisao.');
    if (!revogando && Number(currentLot.criado_por) === Number(req.user.id)) throw httpError(403, 'O preparador nao pode autorizar o proprio lote.');
    if (Number(stored.revisao_autorizacao || 0) !== Number(currentLot.revisao_autorizacao || 0)) throw httpError(409, 'Autorizacao alterada. Recarregue antes de decidir.');
    if (stored.dossie_hash !== currentLot.dossie_hash) throw httpError(409, 'O dossie foi alterado. Recarregue antes de decidir.');
    stage = 'ITEMS_LOCK';
    const items = await PagamentoAutorizacaoItem.findAll({ where: { lote_id: lotId, id: { [Op.in]: decisions.map((item) => item.item_id) }, status: revogando ? { [Op.in]: ['AUTORIZADO', 'ENFILEIRADO'] } : 'PENDENTE' }, transaction, lock: transaction.LOCK.UPDATE });
    if (items.length !== decisions.length) throw httpError(409, 'Um ou mais itens ja foram decididos ou nao pertencem ao lote.');
    if (authorizer.limite_por_lote && decisions.filter((item) => item.decisao === 'AUTORIZAR').reduce((sum, decision) => sum + roundCurrency(items.find((item) => Number(item.id) === decision.item_id)?.valor_snapshot), 0) > Number(authorizer.limite_por_lote)) throw httpError(403, 'O valor autorizado excede o limite nominal deste autorizador.');
    for (const decision of decisions) {
      const item = items.find((candidate) => Number(candidate.id) === decision.item_id);
      if (decision.decisao === 'REVOGAR') {
        if (!decision.motivo) throw httpError(400, 'Informe o motivo da revogacao.');
        const title = await TituloFinanceiro.findByPk(item.titulo_financeiro_id, { transaction, lock: transaction.LOCK.UPDATE });
        if (!title || title.status !== 'ABERTO' || Number(title.valor_baixado || 0) > 0 || roundCurrency(title.valor_saldo) <= 0) {
          throw httpError(409, 'Titulo baixado, mesmo parcialmente, nao permite revogar a autorizacao.');
        }
        const outrosCiclos = await PagamentoAutorizacaoItem.findAll({ where: { titulo_financeiro_id: title.id,
          status: { [Op.in]: ['PENDENTE', 'AUTORIZADO', 'ENFILEIRADO'] } }, attributes: ['id', 'lote_id'], transaction,
          lock: transaction.LOCK.UPDATE, order: [['id', 'ASC']] });
        if (outrosCiclos.some(candidate => Number(candidate.id) > Number(item.id) && Number(candidate.lote_id) !== Number(lotId))) {
          throw httpError(409, 'Existe um ciclo de autorizacao mais recente para este titulo. Abra o lote atual para revogar.');
        }
        const bankPayment = await PaymentIntent.findOne({ where: { titulo_financeiro_id: title.id,
          status: { [Op.notIn]: ['CANCELADO', 'REJEITADO', 'REJEITADO_BANCO', 'FALHA_INTEGRACAO', 'BAIXADO'] } }, transaction, lock: transaction.LOCK.UPDATE });
        if (bankPayment) throw httpError(409, 'Pagamento bancario em andamento: cancele esse fluxo antes de revogar.');
        const fila = await PagamentoManualFilaItem.findAll({ where: { titulo_financeiro_id: title.id,
          status: { [Op.in]: ['PENDENTE', 'NAO_PAGO', 'DIVERGENTE'] } }, transaction, lock: transaction.LOCK.UPDATE, order: [['id', 'ASC']] });
        if (fila.some(row => row.movimento_financeiro_id)) throw httpError(409, 'A fila ja registrou baixa; revogacao indisponivel.');
        for (const row of fila) await row.update({ status: 'RESOLVIDO', resolvido_por: req.user.id, resolvido_em: new Date(),
          motivo: `Autorizacao revogada pelo proprietario: ${decision.motivo}` }, { transaction });
        await item.update({ status: 'PENDENTE', fila_item_id: null, decidido_em: null, motivo_decisao: null }, { transaction });
        await recordEvent({ loteId: lotId, itemId: item.id, userId: req.user.id, type: 'ITEM_AUTORIZACAO_REVOGADA',
          data: { motivo: decision.motivo, fila_ids: fila.map(row => row.id), revisao_anterior: Number(currentLot.revisao_autorizacao || 0) }, transaction });
        await marcarAnaliseProprietario({ titulos: [title], usuarioId: req.user.id, transaction, origem: 'REVOGACAO_DIGITAL', loteId: lotId });
      } else if (decision.decisao === 'AUTORIZAR') {
        stage = 'ITEM_REVALIDATION';
        const title = await TituloFinanceiro.findByPk(item.titulo_financeiro_id, { include: titleInclude(), transaction, lock: transaction.LOCK.UPDATE });
        const storedDocuments = await PagamentoAutorizacaoDocumento.findAll({ where: { item_id: item.id }, attributes: ['origem_id', 'nome', 'origem_tipo', 'arquivo_hash'], transaction, order: [['origem_id', 'ASC']] });
        const currentAttachments = title?.solicitacao_id ? await Anexo.findAll({ where: { solicitacao_id: title.solicitacao_id, deleted_at: null }, attributes: ['id', 'tipo', 'nome_original', 'caminho_arquivo'], transaction, order: [['id', 'ASC']] }) : [];
        const storedMaterial = {
          snapshot: item.snapshot_json,
          documents: storedDocuments.map((document) => ({ origem_id: Number(document.origem_id), nome: document.nome, origem_tipo: document.origem_tipo, arquivo_hash: document.arquivo_hash }))
        };
        const currentMaterial = {
          snapshot: title ? buildSnapshot(title) : null,
          documents: currentAttachments.filter((attachment) => attachment.caminho_arquivo).map((attachment) => ({ origem_id: Number(attachment.id), nome: attachment.nome_original || `Documento ${attachment.id}`, origem_tipo: attachment.tipo || 'ANEXO', arquivo_hash: sha256({ source_url: attachment.caminho_arquivo }) }))
        };
        const stillEligible = title && String(title.tipo).toUpperCase() === 'PAGAR' && ['ABERTO', 'PARCIAL'].includes(String(title.status).toUpperCase()) && roundCurrency(currentMaterial.snapshot.valor_total ?? title.valor_saldo) === roundCurrency(item.valor_snapshot) && sha256(storedMaterial) === sha256(currentMaterial);
        if (!stillEligible) {
          await item.update({ status: 'INVALIDADO', motivo_decisao: 'Titulo ou saldo alterado apos a montagem do dossie.', decidido_em: new Date() }, { transaction });
          await recordEvent({ loteId: lotId, itemId: item.id, userId: req.user.id, type: 'ITEM_INVALIDADO', data: { titulo_id: item.titulo_financeiro_id }, transaction });
          await registrarAnaliseRecusada({ tituloId: item.titulo_financeiro_id, usuarioId: req.user.id,
            motivo: 'Titulo ou saldo alterado apos a montagem do dossie.', resultado: 'INVALIDADO', transaction });
          continue;
        }
        await item.update({ status: 'AUTORIZADO', motivo_decisao: decision.motivo, decidido_em: new Date() }, { transaction });
        await recordEvent({ loteId: lotId, itemId: item.id, userId: req.user.id, type: 'ITEM_AUTORIZADO', data: { snapshot_hash: item.snapshot_hash }, transaction });
      } else {
        if (!decision.motivo) throw httpError(400, 'Informe o motivo para rejeitar um pagamento.');
        await item.update({ status: 'REJEITADO', motivo_decisao: decision.motivo, decidido_em: new Date() }, { transaction });
        await recordEvent({ loteId: lotId, itemId: item.id, userId: req.user.id, type: 'ITEM_REJEITADO', data: { motivo: decision.motivo }, transaction });
        await registrarAnaliseRecusada({ tituloId: item.titulo_financeiro_id, usuarioId: req.user.id,
          motivo: decision.motivo, resultado: 'REJEITADO', transaction });
      }
    }
    stage = 'CREDENTIAL_UPDATE';
    await credential.update({ counter: Number(verification.authenticationInfo.newCounter || credential.counter), ultimo_uso_em: new Date() }, { transaction });
    stage = 'LOT_STATUS';
    const currentItems = await PagamentoAutorizacaoItem.findAll({ where: { lote_id: lotId },
      transaction, lock: transaction.LOCK.UPDATE, order: [['id', 'ASC']] });
    const pending = currentItems.some(item => item.status === 'PENDENTE');
    const authorized = currentItems.filter(item => item.status === 'AUTORIZADO').length;
    const enqueued = currentItems.some(item => item.status === 'ENFILEIRADO');
    shouldEnqueue = !revogando && authorized > 0;
    const nextStatus = pending ? 'AGUARDANDO' : (authorized ? 'AUTORIZADO' : (enqueued ? 'CONCLUIDO' : 'REJEITADO'));
    await currentLot.update({ status: nextStatus, decidido_por: req.user.id, decidido_em: new Date(),
      ...(revogando ? { revisao_autorizacao: Number(currentLot.revisao_autorizacao || 0) + 1 } : {}) }, { transaction });
    return currentLot;
  });

    if (shouldEnqueue) {
      stage = 'QUEUE_ENQUEUE';
      await enqueueAuthorizedItems(req, lotId, { skipPermission: true });
    }
    stage = 'RESPONSE_LOAD';
    return getBatch(req, lot.id);
  } catch (error) {
    if (!String(error?.code || '').startsWith('PAYMENT_OWNER_WEBAUTHN_')) {
      logPaymentDecisionFailure({ req, lotId, stage, error });
    }
    throw error;
  }
}

async function enqueueAuthorizedItems(req, lotId, options = {}) {
  assertFeatureAvailable();
  if (!options.skipPermission) await assertPermission(req.user, PERMISSIONS.PREPARE);
  const authorized = await PagamentoAutorizacaoItem.findAll({ where: { lote_id: lotId, status: 'AUTORIZADO' }, order: [['id', 'ASC']] });
  if (!authorized.length) return getBatch(req, lotId);
  const titleIds = authorized.map((item) => Number(item.titulo_financeiro_id));
  const lot = await PagamentoAutorizacaoLote.findByPk(lotId);
  const revisao = Number(lot?.revisao_autorizacao || 0);
  const key = `owner-auth-${lotId}-${revisao}-${sha256(titleIds).slice(0, 24)}`;
  await enfileirarTitulosAutorizados(req, { titulo_ids: titleIds, idempotency_key: key }, Number(lotId), revisao);
  return getBatch(req, lotId);
}

async function listAuthorizers(req) {
  assertFeatureAvailable({ allowPausedRead: true });
  await assertPermission(req.user, PERMISSIONS.CONFIGURE);
  return PagamentoAutorizador.findAll({ include: [{ model: User, as: 'usuario', attributes: ['id', 'nome', 'email', 'ativo'] }], order: [['id', 'ASC']] });
}

async function saveAuthorizer(req, payload = {}) {
  assertFeatureAvailable();
  await assertPermission(req.user, PERMISSIONS.CONFIGURE);
  const userId = Number(payload.usuario_id);
  const user = await User.findByPk(userId, { attributes: ['id', 'ativo'] });
  if (!user?.ativo) throw httpError(404, 'Usuario ativo nao encontrado.');
  const [row] = await PagamentoAutorizador.findOrCreate({ where: { usuario_id: userId }, defaults: { ativo: payload.ativo !== false, piloto: Boolean(payload.piloto), limite_por_lote: payload.limite_por_lote || null, configurado_por: req.user.id } });
  await row.update({ ativo: payload.ativo !== false, piloto: Boolean(payload.piloto), limite_por_lote: payload.limite_por_lote || null, configurado_por: req.user.id });
  await registrarEventoSeguranca({ req, usuarioId: req.user.id, tipoEvento: 'PAYMENT_OWNER_AUTHORIZER_CONFIGURED', recursoTipo: 'PAGAMENTO_AUTORIZADOR', recursoId: String(row.id), status: 'SUCCESS', descricao: 'Autorizador nominal de pagamentos atualizado', metadata: { usuario_id: userId, ativo: row.ativo, piloto: row.piloto } });
  return row;
}

async function subscribePush(req, payload = {}) {
  assertFeatureAvailable(); assertNoDevSwitch(req);
  await assertActiveAuthorizer(req.user);
  const result = await saveSubscription(req.user.id, payload.subscription);
  await registrarEventoSeguranca({ req, usuarioId: req.user.id, tipoEvento: 'PAYMENT_OWNER_PUSH_ENABLED', recursoTipo: 'WEB_PUSH_SUBSCRIPTION', recursoId: req.user.id, status: 'SUCCESS', descricao: 'Notificacoes push de autorizacao ativadas' });
  return result;
}

async function unsubscribePush(req, payload = {}) {
  assertFeatureAvailable({ allowPausedRead: true }); assertNoDevSwitch(req);
  await assertActiveAuthorizer(req.user);
  const result = await removeSubscription(req.user.id, payload.endpoint);
  await registrarEventoSeguranca({ req, usuarioId: req.user.id, tipoEvento: 'PAYMENT_OWNER_PUSH_DISABLED', recursoTipo: 'WEB_PUSH_SUBSCRIPTION', recursoId: req.user.id, status: 'SUCCESS', descricao: 'Notificacoes push de autorizacao desativadas' });
  return result;
}

module.exports = {
  PERMISSIONS,
  capabilitiesForUser,
  createBatch,
  listBatches,
  getBatch,
  openDocument,
  registrationOptions,
  verifyRegistration,
  listPasskeys,
  revokePasskey,
  authenticationOptions,
  decideBatch,
  enqueueAuthorizedItems,
  listAuthorizers,
  saveAuthorizer,
  subscribePush,
  unsubscribePush,
  sha256,
  classifyWebauthnVerificationError,
  sanitizeDecisionDiagnosticMessage
};
