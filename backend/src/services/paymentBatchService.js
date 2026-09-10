const crypto = require('crypto');
const { Op } = require('sequelize');
const { env } = require('../config/env');
const {
  ContaBancaria,
  EmpresaGrupo,
  Obra,
  Parceiro,
  PaymentAccount,
  PaymentApproval,
  PaymentBatch,
  PaymentBatchItem,
  PaymentBeneficiary,
  PaymentIntent,
  PaymentProvider,
  PaymentTransaction,
  TituloFinanceiro,
  sequelize
} = require('../models');
const { registrarEventoSeguranca } = require('./securityLogService');
const {
  canApprovePagamentos,
  canPreparePagamentos,
  canSendPagamentosBanco
} = require('./authorizationService');
const { toSnapshot: beneficiarySnapshot } = require('./paymentBeneficiaryService');
const { validatePaymentBatchIntegrity } = require('./paymentBatchIntegrityService');
const { verifyMfaStepUp } = require('./paymentApprovalService');
const {
  ACTIVE_INTENT_STATUSES,
  validateBeneficiaryComplete,
  validatePaymentAccount,
  validateTituloEligibleForPayment,
  validateUserCanPrepareBatch,
  tituloEstaBloqueado
} = require('./paymentEligibilityService');

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeIdList(list) {
  return [...new Set(
    (Array.isArray(list) ? list : [])
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item > 0)
  )];
}

function isTruthyFilter(value) {
  return ['1', 'true', 'sim', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function todayIsoSaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function todayCode() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds())
  ].join('');
}

function buildBatchCode() {
  return `PAY-${todayCode()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function buildIdempotencyKey(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function snapshotTitulo(titulo) {
  const data = titulo.get({ plain: true });
  return {
    id: data.id,
    codigo: data.codigo,
    tipo: data.tipo,
    status: data.status,
    descricao: data.descricao,
    numero_documento: data.numero_documento,
    valor_original: data.valor_original,
    valor_saldo: data.valor_saldo,
    valor_baixado: data.valor_baixado,
    data_vencimento: data.data_vencimento,
    obra_id: data.obra_id,
    empresa_id: data.empresa_id,
    parceiro_id: data.parceiro_id,
    parceiro: data.parceiro ? {
      id: data.parceiro.id,
      nome: data.parceiro.nome,
      cpf_cnpj: data.parceiro.cpf_cnpj
    } : null
  };
}

function snapshotPaymentAccount(account) {
  const plain = account?.get ? account.get({ plain: true }) : account || {};
  return {
    id: Number(plain.id || 0),
    conta_bancaria_id: Number(plain.conta_bancaria_id || 0),
    empresa_id: Number(plain.empresa_id || 0),
    cnpj_pagador: String(plain.cnpj_pagador || '').replace(/\D+/g, ''),
    provider_id: Number(plain.provider_id || 0),
    banco_codigo: String(plain.banco_codigo || '').trim(),
    agencia: String(plain.agencia || '').trim(),
    agencia_digito: String(plain.agencia_digito || '').trim(),
    conta: String(plain.conta || '').trim(),
    conta_digito: String(plain.conta_digito || '').trim(),
    tipo_conta: String(plain.tipo_conta || '').trim().toUpperCase(),
    convenio: String(plain.convenio || '').trim(),
    ambiente: String(plain.ambiente || '').trim().toUpperCase(),
    conta_bancaria_empresa_id: Number(plain.contaBancaria?.empresa_id || 0)
  };
}

function snapshotProvider(provider) {
  const plain = provider?.get ? provider.get({ plain: true }) : provider || {};
  return {
    id: Number(plain.id || 0),
    codigo: String(plain.codigo || '').trim().toUpperCase(),
    ambiente: String(plain.ambiente || '').trim().toUpperCase(),
    config_ref: String(plain.config_ref || '').trim(),
    runtime_env: String(env.bbPaymentsEnv || '').trim().toLowerCase(),
    runtime_mode: String(env.bbProviderMode || '').trim().toLowerCase(),
    base_url: String(env.bbPaymentsBaseUrl || '').trim(),
    oauth_url: String(env.bbOauthTokenUrl || '').trim()
  };
}

async function listarTitulosElegiveis(req, filters = {}) {
  await validateUserCanPrepareBatch(req);

  const where = {
    tipo: 'PAGAR',
    status: { [Op.in]: ['ABERTO', 'PARCIAL'] },
    valor_saldo: { [Op.gt]: 0 }
  };

  if (filters.obra_id) where.obra_id = Number(filters.obra_id);
  if (filters.parceiro_id) where.parceiro_id = Number(filters.parceiro_id);
  if (filters.categoria_financeira_id) where.categoria_financeira_id = Number(filters.categoria_financeira_id);
  if (filters.empresa_id) where.empresa_id = Number(filters.empresa_id);
  if (
    isTruthyFilter(filters.somente_rh_dp)
    || isTruthyFilter(filters.apenas_rh_dp)
    || isTruthyFilter(filters.origem_rh_dp)
  ) {
    where.origem_titulo = 'RH_DP';
  }
  if (filters.vencimento_inicial || filters.vencimento_final) {
    where.data_vencimento = {};
    if (filters.vencimento_inicial) where.data_vencimento[Op.gte] = filters.vencimento_inicial;
    if (filters.vencimento_final) where.data_vencimento[Op.lte] = filters.vencimento_final;
  }

  const titulos = await TituloFinanceiro.findAll({
    where,
    include: [
      {
        model: Parceiro,
        as: 'parceiro',
        attributes: ['id', 'nome', 'cpf_cnpj', 'ativo'],
        include: [{
          model: PaymentBeneficiary,
          as: 'paymentBeneficiaries',
          required: false,
          attributes: ['id', 'nome', 'cpf_cnpj', 'pix_tipo_chave', 'pix_chave', 'ativo', 'validado_em', 'createdAt', 'updatedAt']
        }]
      },
      { model: Obra, as: 'obra', attributes: ['id', 'codigo', 'nome'] },
      { model: EmpresaGrupo, as: 'empresa', attributes: ['id', 'codigo', 'nome', 'razao_social'] },
      {
        model: PaymentIntent,
        as: 'paymentIntents',
        required: false,
        where: { status: { [Op.in]: ACTIVE_INTENT_STATUSES } },
        attributes: ['id', 'status']
      }
    ],
    order: [['data_vencimento', 'ASC'], ['id', 'ASC']],
    limit: 200
  });

  return titulos.map((titulo) => {
    const plain = titulo.get({ plain: true });
    const activeIntent = (plain.paymentIntents || [])[0] || null;
    const beneficiaries = (plain.parceiro?.paymentBeneficiaries || [])
      .slice()
      .sort((a, b) => {
        const activeDelta = Number(b.ativo === true) - Number(a.ativo === true);
        if (activeDelta) return activeDelta;
        return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
      });
    const beneficiary = beneficiaries[0] || null;
    const pendencias = [];

    if (activeIntent) pendencias.push('Titulo ja possui pagamento ativo.');
    if (tituloEstaBloqueado(plain)) {
      pendencias.push(plain.bloqueio_retorno_motivo || 'Baixa bloqueada por pedido de retorno da Obra.');
    }
    if (!beneficiary) pendencias.push('Favorecido bancario nao cadastrado.');
    if (beneficiary && (!beneficiary.pix_tipo_chave || !beneficiary.pix_chave)) {
      pendencias.push('Favorecido sem chave PIX completa.');
    }

    return {
      ...plain,
      paymentIntents: undefined,
      paymentBeneficiaries: undefined,
      favorecido_pagamento: beneficiary,
      elegivel_pagamento: pendencias.length === 0,
      pendencias_pagamento: pendencias
    };
  });
}

async function createBatchFromTitulos(req, payload = {}) {
  await validateUserCanPrepareBatch(req);

  const tituloIds = normalizeIdList(payload.titulo_ids);
  if (!tituloIds.length) {
    throw createHttpError(400, 'Informe ao menos um titulo para gerar o lote.');
  }

  const paymentAccountId = Number(payload.payment_account_id);
  const dataProgramada = String(payload.data_programada || '').trim();
  if (!Number.isInteger(paymentAccountId) || paymentAccountId <= 0) {
    throw createHttpError(400, 'Conta pagadora e obrigatoria.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataProgramada)) {
    throw createHttpError(400, 'Data programada invalida.');
  }
  if (dataProgramada < todayIsoSaoPaulo()) {
    throw createHttpError(400, 'Data programada nao pode ser retroativa para pagamento Banco do Brasil.');
  }

  return sequelize.transaction(async (transaction) => {
    const paymentAccount = await validatePaymentAccount(paymentAccountId);
    const provider = await PaymentProvider.findByPk(paymentAccount.provider_id, { transaction });
    if (!provider || provider.ativo === false) {
      throw createHttpError(400, 'Provider da conta pagadora nao existe ou esta inativo.');
    }
    if (String(provider.ambiente || '').toUpperCase() !== String(paymentAccount.ambiente || '').toUpperCase()) {
      throw createHttpError(400, 'Ambiente do provider diverge do ambiente da conta pagadora.');
    }
    const titulos = await TituloFinanceiro.findAll({
      where: { id: { [Op.in]: tituloIds } },
      include: [
        { model: Parceiro, as: 'parceiro', attributes: ['id', 'nome', 'cpf_cnpj', 'ativo'] },
        { model: Obra, as: 'obra', attributes: ['id', 'codigo', 'nome'] }
      ],
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (titulos.length !== tituloIds.length) {
      throw createHttpError(404, 'Um ou mais titulos nao foram encontrados.');
    }

    const batch = await PaymentBatch.create({
      codigo: buildBatchCode(),
      provider_id: provider.id,
      payment_account_id: paymentAccount.id,
      empresa_id: paymentAccount.empresa_id,
      status: 'RASCUNHO',
      quantidade_itens: 0,
      valor_total: 0,
      data_programada: dataProgramada,
      idempotency_key: buildIdempotencyKey('batch'),
      correlation_id: buildIdempotencyKey('corr'),
      payment_account_snapshot: snapshotPaymentAccount(paymentAccount),
      provider_snapshot: snapshotProvider(provider),
      aprovacao_status: 'RASCUNHO',
      created_by: req.user?.id || null
    }, { transaction });

    let total = 0;
    let sequencia = 1;
    for (const titulo of titulos) {
      const beneficiary = titulo.payment_beneficiary_id
        ? await PaymentBeneficiary.findOne({
            where: {
              id: titulo.payment_beneficiary_id,
              parceiro_id: titulo.parceiro_id,
              ativo: true
            },
            transaction
          })
        : await PaymentBeneficiary.findOne({
            where: { parceiro_id: titulo.parceiro_id, ativo: true },
            order: [['updatedAt', 'DESC'], ['id', 'DESC']],
            transaction
          });

      await validateBeneficiaryComplete(beneficiary);
      await validateTituloEligibleForPayment(titulo, { beneficiary, transaction });
      if (!titulo.empresa_id) {
        throw createHttpError(400, `Titulo ${titulo.codigo || `#${titulo.id}`} nao possui empresa do titulo vinculada.`);
      }

      const valor = Number(titulo.valor_saldo || 0);
      const intent = await PaymentIntent.create({
        titulo_financeiro_id: titulo.id,
        payment_account_id: paymentAccount.id,
        payment_beneficiary_id: beneficiary.id,
        provider_id: provider.id,
        metodo: 'PIX_CHAVE',
        valor,
        data_pagamento: dataProgramada,
        status: 'EM_LOTE',
        idempotency_key: buildIdempotencyKey(`intent-${titulo.id}`),
        correlation_id: buildIdempotencyKey(`corr-${titulo.id}`),
        beneficiary_snapshot: beneficiarySnapshot(beneficiary),
        titulo_snapshot: snapshotTitulo(titulo),
        created_by: req.user?.id || null,
        updated_by: req.user?.id || null
      }, { transaction });

      await PaymentBatchItem.create({
        payment_batch_id: batch.id,
        payment_intent_id: intent.id,
        sequencia,
        status: 'EM_LOTE',
        valor
      }, { transaction });

      total += valor;
      sequencia += 1;
    }

    await batch.update({
      quantidade_itens: titulos.length,
      valor_total: total
    }, { transaction });

    await registrarEventoSeguranca({
      req,
      usuarioId: req.user?.id || null,
      tipoEvento: 'PAYMENT_BATCH_CREATED',
      recursoTipo: 'PAYMENT_BATCH',
      recursoId: batch.id,
      status: 'SUCCESS',
      descricao: 'Lote de pagamento criado',
      metadata: { quantidade_itens: titulos.length, valor_total: total }
    });

    return getBatchDetail(req, batch.id, { transaction });
  });
}

async function listBatches(req, filters = {}) {
  const where = {};
  if (filters.status) where.status = String(filters.status).trim().toUpperCase();

  return PaymentBatch.findAll({
    where,
    include: [
      { model: PaymentProvider, as: 'provider', attributes: ['id', 'codigo', 'nome', 'ambiente'] },
      {
        model: PaymentAccount,
        as: 'paymentAccount',
        include: [{ model: ContaBancaria, as: 'contaBancaria', attributes: ['id', 'nome', 'banco', 'agencia', 'conta', 'empresa_id'] }]
      }
    ],
    order: [['createdAt', 'DESC']],
    limit: 100
  });
}

async function getBatchDetail(req, id, { transaction = null } = {}) {
  const batch = await PaymentBatch.findByPk(id, {
    include: [
      { model: PaymentProvider, as: 'provider', attributes: ['id', 'codigo', 'nome', 'ambiente'] },
      {
        model: PaymentAccount,
        as: 'paymentAccount',
        include: [{ model: ContaBancaria, as: 'contaBancaria', attributes: ['id', 'nome', 'banco', 'agencia', 'conta', 'empresa_id'] }]
      },
      {
        model: PaymentBatchItem,
        as: 'items',
        include: [{
          model: PaymentIntent,
          as: 'intent',
          include: [
            { model: TituloFinanceiro, as: 'titulo', include: [{ model: Parceiro, as: 'parceiro', attributes: ['id', 'nome', 'cpf_cnpj'] }] },
            { model: PaymentBeneficiary, as: 'beneficiary' }
          ]
        }]
      }
    ],
    order: [[{ model: PaymentBatchItem, as: 'items' }, 'sequencia', 'ASC']],
    transaction
  });

  if (!batch) throw createHttpError(404, 'Lote de pagamento nao encontrado.');
  const [approvals, transactions] = await Promise.all([
    PaymentApproval.findAll({
      where: { entity_type: 'BATCH', entity_id: batch.id },
      order: [['createdAt', 'ASC']],
      transaction
    }),
    PaymentTransaction.findAll({
      where: { payment_batch_id: batch.id },
      order: [['createdAt', 'DESC']],
      limit: 20,
      transaction
    })
  ]);
  batch.setDataValue('approvals', approvals);
  batch.setDataValue('transactions', transactions);
  const actorId = Number(req.user?.id || 0);
  const isCreator = actorId > 0 && Number(batch.created_by || 0) === actorId;
  const actorApproved = approvals.some(
    (approval) => (
      approval.acao === 'APPROVE'
      && approval.status === 'APROVADO'
      && Number(approval.aprovado_por) === actorId
    )
  );
  const [actorCanPrepare, actorCanApprove, actorCanSend] = await Promise.all([
    canPreparePagamentos(req.user),
    canApprovePagamentos(req.user),
    canSendPagamentosBanco(req.user)
  ]);
  batch.setDataValue('action_capabilities', {
    is_creator: isCreator,
    can_submit: Boolean(actorCanPrepare && isCreator && ['RASCUNHO', 'EM_REVISAO'].includes(String(batch.status || '').toUpperCase())),
    can_approve: Boolean(actorCanApprove && !isCreator && batch.status === 'PENDENTE_APROVACAO'),
    can_send: Boolean(
      actorCanSend
      && isCreator
      && !actorApproved
      && batch.status === 'APROVADO'
    ),
    can_reprocess: Boolean(
      actorCanSend
      && isCreator
      && !actorApproved
      && ['FALHA_INTEGRACAO', 'REJEITADO'].includes(String(batch.status || '').toUpperCase())
    )
  });
  return batch;
}

async function submitBatchForApproval(req, id) {
  let submittedBatchId = Number(id);
  await sequelize.transaction(async (transaction) => {
    const batch = await validatePaymentBatchIntegrity(id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
      expectedBatchStatuses: ['RASCUNHO', 'EM_REVISAO'],
      expectedIntentStatuses: ['EM_LOTE'],
      phaseLabel: 'envio para aprovacao'
    });
    submittedBatchId = batch.id;
    if (Number(batch.created_by || 0) !== Number(req.user?.id || 0)) {
      throw createHttpError(403, 'Somente o criador do lote pode submete-lo para aprovacao.');
    }

    await batch.update({
      status: 'PENDENTE_APROVACAO',
      aprovacao_status: 'PENDENTE',
      submitted_by: req.user?.id || null,
      submitted_at: new Date()
    }, { transaction });

    const intentIds = batch.items.map((item) => item.payment_intent_id);
    await PaymentIntent.update(
      { status: 'PENDENTE_APROVACAO', updated_by: req.user?.id || null },
      { where: { id: { [Op.in]: intentIds } }, transaction }
    );
    await PaymentBatchItem.update(
      { status: 'PENDENTE_APROVACAO' },
      { where: { payment_batch_id: batch.id }, transaction }
    );
  });

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'PAYMENT_BATCH_SUBMITTED',
    recursoTipo: 'PAYMENT_BATCH',
    recursoId: submittedBatchId,
    status: 'SUCCESS',
    descricao: 'Lote submetido para aprovacao'
  });

  return getBatchDetail(req, id);
}

async function cancelBatch(req, id, payload = {}) {
  const motivo = String(payload.justificativa || '').trim() || 'Lote cancelado pela operacao financeira.';

  await sequelize.transaction(async (transaction) => {
    const batch = await PaymentBatch.findByPk(id, {
      include: [{ model: PaymentBatchItem, as: 'items' }],
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!batch) throw createHttpError(404, 'Lote de pagamento nao encontrado.');

    const statusAtual = String(batch.status || '').toUpperCase();
    const cancelableStatuses = ['RASCUNHO', 'EM_REVISAO', 'PENDENTE_APROVACAO', 'APROVADO'];
    if (!cancelableStatuses.includes(statusAtual)) {
      throw createHttpError(400, 'Lote nao pode ser cancelado neste status.');
    }
    if (['PENDENTE_APROVACAO', 'APROVADO'].includes(statusAtual)) {
      await verifyMfaStepUp(req, payload.codigo_mfa || payload.mfa_code);
    }

    const intentIds = (batch.items || []).map((item) => item.payment_intent_id);

    await batch.update({
      status: 'CANCELADO',
      aprovacao_status: statusAtual === 'PENDENTE_APROVACAO' || statusAtual === 'APROVADO'
        ? 'CANCELADO'
        : batch.aprovacao_status,
      closed_at: new Date()
    }, { transaction });

    if (intentIds.length) {
      await PaymentIntent.update(
        {
          status: 'CANCELADO',
          cancelado_em: new Date(),
          motivo_cancelamento: motivo,
          updated_by: req.user?.id || null
        },
        {
          where: { id: { [Op.in]: intentIds } },
          transaction
        }
      );

      await PaymentBatchItem.update(
        {
          status: 'CANCELADO',
          erro_codigo: 'CANCELADO_OPERACAO',
          erro_mensagem: motivo
        },
        {
          where: { payment_batch_id: batch.id },
          transaction
        }
      );
    }
  });

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'PAYMENT_BATCH_CANCELLED',
    recursoTipo: 'PAYMENT_BATCH',
    recursoId: id,
    status: 'SUCCESS',
    descricao: 'Lote de pagamento cancelado antes do envio ao banco',
    metadata: { justificativa: motivo }
  });

  return getBatchDetail(req, id);
}

async function listPaymentAccounts(req) {
  return PaymentAccount.findAll({
    include: [
      { model: PaymentProvider, as: 'provider', attributes: ['id', 'codigo', 'nome', 'ambiente'] },
      { model: ContaBancaria, as: 'contaBancaria', attributes: ['id', 'nome', 'banco', 'agencia', 'conta', 'empresa_id'] },
      { model: EmpresaGrupo, as: 'empresa', attributes: ['id', 'codigo', 'nome', 'razao_social', 'cnpj'] }
    ],
    order: [['ativo', 'DESC'], ['id', 'ASC']]
  });
}

async function listProviders(req) {
  return PaymentProvider.findAll({
    order: [['codigo', 'ASC'], ['ambiente', 'ASC']]
  });
}

module.exports = {
  cancelBatch,
  createBatchFromTitulos,
  getBatchDetail,
  listBatches,
  listPaymentAccounts,
  listProviders,
  listarTitulosElegiveis,
  submitBatchForApproval
};
