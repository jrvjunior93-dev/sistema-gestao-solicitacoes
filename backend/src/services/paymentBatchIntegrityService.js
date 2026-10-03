const crypto = require('crypto');
const { env } = require('../config/env');
const {
  ContaBancaria,
  Parceiro,
  PaymentAccount,
  PaymentBatch,
  PaymentBatchItem,
  PaymentBeneficiary,
  PaymentIntent,
  PaymentProvider,
  TituloFinanceiro
} = require('../models');
const { assertTituloDisponivelParaBaixa } = require('./tituloBloqueioRetornoObraService');

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeStatus(value) {
  return String(value || '').trim().toUpperCase();
}

function toCurrencyNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function sameMoney(a, b) {
  return Math.abs(toCurrencyNumber(a) - toCurrencyNumber(b)) <= 0.009;
}

function onlyDigits(value) {
  return String(value || '').replace(/\D+/g, '');
}

function getTitleLabel(titulo) {
  return titulo?.codigo || `#${titulo?.id || '-'}`;
}

function getSnapshotValue(snapshot, field) {
  return snapshot && Object.prototype.hasOwnProperty.call(snapshot, field) ? snapshot[field] : null;
}

function buildCurrentPaymentAccountSnapshot(batch) {
  return {
    id: Number(batch.paymentAccount?.id || 0),
    conta_bancaria_id: Number(batch.paymentAccount?.conta_bancaria_id || 0),
    empresa_id: Number(batch.paymentAccount?.empresa_id || 0),
    cnpj_pagador: onlyDigits(batch.paymentAccount?.cnpj_pagador),
    provider_id: Number(batch.paymentAccount?.provider_id || 0),
    banco_codigo: String(batch.paymentAccount?.banco_codigo || '').trim(),
    agencia: String(batch.paymentAccount?.agencia || '').trim(),
    agencia_digito: String(batch.paymentAccount?.agencia_digito || '').trim(),
    conta: String(batch.paymentAccount?.conta || '').trim(),
    conta_digito: String(batch.paymentAccount?.conta_digito || '').trim(),
    tipo_conta: normalizeStatus(batch.paymentAccount?.tipo_conta),
    convenio: String(batch.paymentAccount?.convenio || '').trim(),
    ambiente: normalizeStatus(batch.paymentAccount?.ambiente),
    conta_bancaria_empresa_id: Number(batch.paymentAccount?.contaBancaria?.empresa_id || 0)
  };
}

function buildCurrentProviderSnapshot(batch) {
  return {
    id: Number(batch.provider?.id || 0),
    codigo: normalizeStatus(batch.provider?.codigo),
    ambiente: normalizeStatus(batch.provider?.ambiente),
    config_ref: String(batch.provider?.config_ref || '').trim(),
    runtime_env: String(env.bbPaymentsEnv || '').trim().toLowerCase(),
    runtime_mode: String(env.bbProviderMode || '').trim().toLowerCase(),
    base_url: String(env.bbPaymentsBaseUrl || '').trim(),
    oauth_url: String(env.bbOauthTokenUrl || '').trim()
  };
}

function assertFrozenSnapshotMatches(label, frozenSnapshot, currentSnapshot) {
  if (!frozenSnapshot || typeof frozenSnapshot !== 'object') {
    throw createHttpError(409, `${label} nao possui snapshot de seguranca. Cancele e gere um novo lote.`);
  }

  for (const [field, currentValue] of Object.entries(currentSnapshot)) {
    if (!Object.prototype.hasOwnProperty.call(frozenSnapshot, field)) {
      continue;
    }
    if (String(frozenSnapshot[field] ?? '') !== String(currentValue ?? '')) {
      throw createHttpError(
        409,
        `${label} foi alterada no campo ${field} depois da criacao do lote. Cancele e gere um novo lote.`
      );
    }
  }
}

function buildIntegrityHash(snapshot) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(snapshot))
    .digest('hex');
}

function validateBeneficiarySnapshot(intent, beneficiary, tituloLabel) {
  const snapshot = intent?.beneficiary_snapshot || {};
  const checks = [
    ['nome', beneficiary?.nome, getSnapshotValue(snapshot, 'nome')],
    ['cpf_cnpj', onlyDigits(beneficiary?.cpf_cnpj), onlyDigits(getSnapshotValue(snapshot, 'cpf_cnpj'))],
    ['pix_tipo_chave', normalizeStatus(beneficiary?.pix_tipo_chave), normalizeStatus(getSnapshotValue(snapshot, 'pix_tipo_chave'))],
    ['pix_chave', String(beneficiary?.pix_chave || '').trim(), String(getSnapshotValue(snapshot, 'pix_chave') || '').trim()]
  ];

  for (const [field, current, frozen] of checks) {
    if (String(current || '') !== String(frozen || '')) {
      throw createHttpError(
        409,
        `Favorecido do titulo ${tituloLabel} foi alterado no campo ${field} depois da montagem do lote. Gere um novo lote para aprovar dados bancarios atualizados.`
      );
    }
  }
}

async function validatePaymentBatchIntegrity(batchId, options = {}) {
  const {
    transaction = null,
    lock = null,
    expectedBatchStatuses = [],
    expectedIntentStatuses = [],
    phaseLabel = 'operacao'
  } = options;

  const batch = await PaymentBatch.findByPk(batchId, {
    include: [
      {
        model: PaymentAccount,
        as: 'paymentAccount',
        include: [{ model: ContaBancaria, as: 'contaBancaria' }]
      },
      { model: PaymentProvider, as: 'provider' },
      {
        model: PaymentBatchItem,
        as: 'items',
        include: [{
          model: PaymentIntent,
          as: 'intent',
          include: [
            {
              model: TituloFinanceiro,
              as: 'titulo',
              include: [{ model: Parceiro, as: 'parceiro', attributes: ['id', 'nome', 'cpf_cnpj'] }]
            },
            { model: PaymentBeneficiary, as: 'beneficiary' }
          ]
        }]
      }
    ],
    transaction,
    lock
  });

  if (!batch) throw createHttpError(404, 'Lote de pagamento nao encontrado.');

  const batchStatus = normalizeStatus(batch.status);
  if (expectedBatchStatuses.length && !expectedBatchStatuses.map(normalizeStatus).includes(batchStatus)) {
    throw createHttpError(400, `Lote nao esta em status valido para ${phaseLabel}.`);
  }

  if (!batch.paymentAccount || batch.paymentAccount.ativo === false) {
    throw createHttpError(400, 'Conta pagadora do lote nao esta ativa ou nao existe mais.');
  }
  if (!batch.paymentAccount.empresa_id) {
    throw createHttpError(400, 'Conta pagadora do lote nao possui empresa pagadora.');
  }
  if (!batch.paymentAccount.contaBancaria?.empresa_id) {
    throw createHttpError(400, 'Conta bancaria interna da conta pagadora nao possui empresa vinculada.');
  }
  if (Number(batch.paymentAccount.empresa_id) !== Number(batch.paymentAccount.contaBancaria.empresa_id)) {
    throw createHttpError(400, 'Empresa da conta bancaria interna diverge da empresa pagadora do lote.');
  }
  if (Number(batch.empresa_id || 0) !== Number(batch.paymentAccount.empresa_id)) {
    throw createHttpError(400, 'Empresa gravada no lote diverge da empresa da conta pagadora.');
  }
  assertFrozenSnapshotMatches(
    'Conta pagadora',
    batch.payment_account_snapshot,
    buildCurrentPaymentAccountSnapshot(batch)
  );
  assertFrozenSnapshotMatches(
    'Configuracao do provider',
    batch.provider_snapshot,
    buildCurrentProviderSnapshot(batch)
  );

  const items = Array.isArray(batch.items) ? batch.items : [];
  if (!items.length) throw createHttpError(400, 'Lote sem itens para validar.');

  const allowedIntentStatuses = expectedIntentStatuses.map(normalizeStatus);
  let total = 0;
  const itemSnapshots = [];
  for (const item of items) {
    const intent = item.intent;
    if (!intent) throw createHttpError(400, `Item #${item.id} sem intencao de pagamento vinculada.`);

    const titulo = intent.titulo;
    const tituloLabel = getTitleLabel(titulo || { id: intent.titulo_financeiro_id });
    if (!titulo) throw createHttpError(404, `Titulo ${tituloLabel} nao encontrado para pagamento.`);
    assertTituloDisponivelParaBaixa(titulo);

    const intentStatus = normalizeStatus(intent.status);
    if (allowedIntentStatuses.length && !allowedIntentStatuses.includes(intentStatus)) {
      throw createHttpError(400, `Titulo ${tituloLabel} nao esta em status valido para ${phaseLabel}.`);
    }
    if (!sameMoney(item.valor, intent.valor)) {
      throw createHttpError(409, `Valor do item do titulo ${tituloLabel} diverge da intencao de pagamento.`);
    }
    if (Number(intent.payment_account_id) !== Number(batch.payment_account_id)) {
      throw createHttpError(409, `Conta pagadora da intencao do titulo ${tituloLabel} diverge da conta do lote.`);
    }
    if (Number(intent.provider_id) !== Number(batch.provider_id)) {
      throw createHttpError(409, `Provider da intencao do titulo ${tituloLabel} diverge do provider do lote.`);
    }
    if (!['ABERTO', 'PARCIAL'].includes(normalizeStatus(titulo.status))) {
      throw createHttpError(409, `Titulo ${tituloLabel} nao esta mais aberto para pagamento.`);
    }
    if (toCurrencyNumber(titulo.valor_saldo) < toCurrencyNumber(intent.valor)) {
      throw createHttpError(409, `Saldo atual do titulo ${tituloLabel} e menor que o valor do lote.`);
    }
    if (getSnapshotValue(intent.titulo_snapshot, 'empresa_id') && Number(getSnapshotValue(intent.titulo_snapshot, 'empresa_id')) !== Number(titulo.empresa_id)) {
      throw createHttpError(409, `Empresa do titulo ${tituloLabel} foi alterada depois da montagem do lote.`);
    }
    if (getSnapshotValue(intent.titulo_snapshot, 'parceiro_id') && Number(getSnapshotValue(intent.titulo_snapshot, 'parceiro_id')) !== Number(titulo.parceiro_id)) {
      throw createHttpError(409, `Credor do titulo ${tituloLabel} foi alterado depois da montagem do lote.`);
    }
    if (!sameMoney(getSnapshotValue(intent.titulo_snapshot, 'valor_saldo'), intent.valor)) {
      throw createHttpError(409, `Snapshot financeiro do titulo ${tituloLabel} nao corresponde ao valor da intencao.`);
    }
    if (!intent.beneficiary || intent.beneficiary.ativo === false) {
      throw createHttpError(400, `Favorecido do titulo ${tituloLabel} nao esta ativo.`);
    }
    validateBeneficiarySnapshot(intent, intent.beneficiary, tituloLabel);

    itemSnapshots.push({
      sequencia: Number(item.sequencia || 0),
      item_id: Number(item.id || 0),
      payment_intent_id: Number(intent.id || 0),
      titulo_financeiro_id: Number(titulo.id || 0),
      titulo_codigo: titulo.codigo || null,
      titulo_empresa_id: Number(titulo.empresa_id || 0),
      titulo_parceiro_id: Number(titulo.parceiro_id || 0),
      titulo_valor_saldo: toCurrencyNumber(titulo.valor_saldo),
      titulo_status: normalizeStatus(titulo.status),
      payment_account_id: Number(intent.payment_account_id || 0),
      payment_beneficiary_id: Number(intent.payment_beneficiary_id || 0),
      provider_id: Number(intent.provider_id || 0),
      metodo: normalizeStatus(intent.metodo),
      valor: toCurrencyNumber(intent.valor),
      data_pagamento: intent.data_pagamento || null,
      beneficiary_snapshot: {
        nome: intent.beneficiary?.nome || null,
        cpf_cnpj: onlyDigits(intent.beneficiary?.cpf_cnpj),
        pix_tipo_chave: normalizeStatus(intent.beneficiary?.pix_tipo_chave),
        pix_chave: String(intent.beneficiary?.pix_chave || '').trim()
      }
    });

    total += toCurrencyNumber(item.valor);
  }

  if (Number(batch.quantidade_itens || 0) !== items.length) {
    throw createHttpError(409, 'Quantidade de itens do lote diverge dos itens gravados.');
  }
  if (!sameMoney(batch.valor_total, total)) {
    throw createHttpError(409, 'Valor total do lote diverge da soma dos itens.');
  }

  const integritySnapshot = {
    batch_id: Number(batch.id || 0),
    provider_id: Number(batch.provider_id || 0),
    payment_account_id: Number(batch.payment_account_id || 0),
    empresa_id: Number(batch.empresa_id || 0),
    conta_bancaria_id: Number(batch.paymentAccount?.conta_bancaria_id || 0),
    conta_bancaria_empresa_id: Number(batch.paymentAccount?.contaBancaria?.empresa_id || 0),
    payment_account_snapshot: batch.payment_account_snapshot,
    provider_snapshot: batch.provider_snapshot,
    quantidade_itens: items.length,
    valor_total: toCurrencyNumber(batch.valor_total),
    data_programada: batch.data_programada || null,
    items: itemSnapshots.sort((a, b) => a.sequencia - b.sequencia || a.payment_intent_id - b.payment_intent_id)
  };

  batch.setDataValue('integrity_snapshot', integritySnapshot);
  batch.setDataValue('integrity_hash', buildIntegrityHash(integritySnapshot));

  return batch;
}

module.exports = {
  validatePaymentBatchIntegrity
};
