const { Op } = require('sequelize');
const { lerSegredoTotp, segredoIlegivel, MENSAGEM_ILEGIVEL } = require('./mfaSecretService');
const { PaymentApproval, PaymentBatch, PaymentBatchItem, PaymentIntent, User, sequelize } = require('../models');
const { verifyTotpCode } = require('./mfaService');
const { validatePaymentBatchIntegrity } = require('./paymentBatchIntegrityService');
const { registrarEventoSeguranca } = require('./securityLogService');

const REQUIRED_PAYMENT_BATCH_APPROVALS = 1;

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function verifyMfaStepUp(req, codigo) {
  const user = await User.findByPk(req.user?.id, {
    attributes: ['id', 'mfa_totp_enabled', 'mfa_totp_secret']
  });

  if (!user?.mfa_totp_enabled) {
    throw createHttpError(403, 'MFA obrigatorio para esta operacao.');
  }
  // Aprovacao de pagamento e o lugar onde um segredo ilegivel jamais pode virar liberacao.
  const segredo = lerSegredoTotp(user);
  if (segredoIlegivel(segredo)) {
    throw createHttpError(503, MENSAGEM_ILEGIVEL);
  }
  if (!segredo) {
    throw createHttpError(403, 'MFA obrigatorio para esta operacao.');
  }

  const normalizedCode = String(codigo || '').replace(/\s+/g, '').trim();
  if (!/^\d{6}$/.test(normalizedCode)) {
    throw createHttpError(400, 'Codigo MFA deve ter 6 digitos.');
  }

  if (!verifyTotpCode(segredo, normalizedCode)) {
    throw createHttpError(403, 'Codigo MFA invalido.');
  }

  return new Date();
}

async function countValidApprovals(batchId, { transaction = null } = {}) {
  return PaymentApproval.count({
    where: {
      entity_type: 'BATCH',
      entity_id: batchId,
      acao: 'APPROVE',
      status: 'APROVADO'
    },
    transaction
  });
}

function getBatchIntegrityHash(batch) {
  const integrityHash = batch?.getDataValue?.('integrity_hash');
  if (!integrityHash) {
    throw createHttpError(500, 'Hash de integridade do lote nao foi gerado pela validacao.');
  }
  return integrityHash;
}

async function assertApprovalHashesMatchCurrentBatch(batch, { transaction = null, requireMinimumApprovals = false } = {}) {
  const currentHash = getBatchIntegrityHash(batch);
  const approvals = await PaymentApproval.findAll({
    where: {
      entity_type: 'BATCH',
      entity_id: batch.id,
      acao: 'APPROVE',
      status: 'APROVADO'
    },
    order: [['aprovado_em', 'ASC'], ['id', 'ASC']],
    transaction
  });

  if (requireMinimumApprovals && approvals.length < REQUIRED_PAYMENT_BATCH_APPROVALS) {
    throw createHttpError(400, `Lote exige ${REQUIRED_PAYMENT_BATCH_APPROVALS} aprovacao valida.`);
  }

  for (const approval of approvals) {
    if (!approval.snapshot_hash) {
      throw createHttpError(409, 'Lote possui aprovacao sem hash de integridade. Gere um novo lote para garantir rastreabilidade completa.');
    }
    if (approval.snapshot_hash !== currentHash) {
      throw createHttpError(409, 'Os dados do lote mudaram depois da aprovacao. Gere um novo lote para coletar novas aprovacoes.');
    }
  }

  return true;
}

async function approveBatchWithMfa(req, id, payload = {}) {
  const mfaVerifiedAt = await verifyMfaStepUp(req, payload.codigo_mfa || payload.mfa_code);

  return sequelize.transaction(async (transaction) => {
    const batch = await validatePaymentBatchIntegrity(id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
      expectedBatchStatuses: ['PENDENTE_APROVACAO'],
      expectedIntentStatuses: ['PENDENTE_APROVACAO'],
      phaseLabel: 'aprovacao'
    });

    if (Number(batch.created_by) === Number(req.user?.id)) {
      throw createHttpError(403, 'Criador do lote nao pode aprovar o proprio lote nesta versao.');
    }
    const approvalAlreadyRegistered = await PaymentApproval.findOne({
      where: {
        entity_type: 'BATCH',
        entity_id: batch.id,
        acao: 'APPROVE',
        status: 'APROVADO',
        aprovado_por: req.user.id
      },
      transaction
    });
    if (approvalAlreadyRegistered) {
      throw createHttpError(409, 'Este usuario ja aprovou este lote.');
    }
    await assertApprovalHashesMatchCurrentBatch(batch, { transaction });

    const integrityHash = getBatchIntegrityHash(batch);

    await PaymentApproval.create({
      entity_type: 'BATCH',
      entity_id: batch.id,
      nivel: 1,
      acao: 'APPROVE',
      status: 'APROVADO',
      aprovado_por: req.user.id,
      aprovado_em: new Date(),
      justificativa: payload.justificativa || null,
      mfa_verified_at: mfaVerifiedAt,
      snapshot_hash: integrityHash
    }, { transaction });

    const approvals = await countValidApprovals(batch.id, { transaction });
    if (approvals >= REQUIRED_PAYMENT_BATCH_APPROVALS) {
      const intentIds = batch.items.map((item) => item.payment_intent_id);
      await batch.update({
        status: 'APROVADO',
        aprovacao_status: 'APROVADO'
      }, { transaction });
      await PaymentIntent.update(
        { status: 'APROVADO', aprovado_em: new Date(), aprovado_por: req.user.id, updated_by: req.user.id },
        { where: { id: { [Op.in]: intentIds } }, transaction }
      );
      await PaymentBatchItem.update(
        { status: 'APROVADO' },
        { where: { payment_batch_id: batch.id }, transaction }
      );
    }

    await registrarEventoSeguranca({
      req,
      usuarioId: req.user?.id || null,
      tipoEvento: 'PAYMENT_BATCH_APPROVED',
      recursoTipo: 'PAYMENT_BATCH',
      recursoId: batch.id,
      status: 'SUCCESS',
      descricao: 'Lote de pagamento aprovado',
      metadata: { approvals }
    });

    return batch;
  });
}

async function rejectBatch(req, id, payload = {}) {
  const justificativa = String(payload.justificativa || '').trim();
  if (!justificativa) {
    throw createHttpError(400, 'Justificativa obrigatoria para rejeitar lote de pagamento.');
  }

  const batch = await PaymentBatch.findByPk(id, {
    include: [{ model: PaymentBatchItem, as: 'items' }]
  });
  if (!batch) throw createHttpError(404, 'Lote de pagamento nao encontrado.');
  if (!['PENDENTE_APROVACAO', 'APROVADO'].includes(String(batch.status || '').toUpperCase())) {
    throw createHttpError(400, 'Lote nao pode ser rejeitado neste status.');
  }

  await sequelize.transaction(async (transaction) => {
    await PaymentApproval.create({
      entity_type: 'BATCH',
      entity_id: batch.id,
      nivel: 1,
      acao: 'REJECT',
      status: 'REJEITADO',
      aprovado_por: req.user.id,
      aprovado_em: new Date(),
      justificativa
    }, { transaction });

    const intentIds = batch.items.map((item) => item.payment_intent_id);
    await batch.update({ status: 'REJEITADO', aprovacao_status: 'REJEITADO' }, { transaction });
    await PaymentIntent.update(
      { status: 'CANCELADO', cancelado_em: new Date(), motivo_cancelamento: justificativa, updated_by: req.user.id },
      { where: { id: { [Op.in]: intentIds } }, transaction }
    );
    await PaymentBatchItem.update(
      { status: 'REJEITADO' },
      { where: { payment_batch_id: batch.id }, transaction }
    );
  });

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'PAYMENT_BATCH_REJECTED',
    recursoTipo: 'PAYMENT_BATCH',
    recursoId: batch.id,
    status: 'SUCCESS',
    descricao: 'Lote de pagamento rejeitado'
  });

  return batch;
}

module.exports = {
  REQUIRED_PAYMENT_BATCH_APPROVALS,
  assertApprovalHashesMatchCurrentBatch,
  approveBatchWithMfa,
  countValidApprovals,
  rejectBatch,
  verifyMfaStepUp
};
