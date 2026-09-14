const {
  ContaBancaria,
  EmpresaGrupo,
  PaymentAccount,
  PaymentBatch,
  PaymentProvider,
  sequelize
} = require('../models');
const { Op } = require('sequelize');
const { registrarEventoSeguranca } = require('./securityLogService');

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function onlyDigits(value) {
  return String(value || '').replace(/\D+/g, '');
}

function cleanString(value, maxLength = 255) {
  const text = String(value || '').trim();
  return text ? text.slice(0, maxLength) : null;
}

async function resolveProvider(providerId, { transaction = null } = {}) {
  if (providerId) {
    const provider = await PaymentProvider.findByPk(providerId, { transaction });
    if (!provider) throw createHttpError(404, 'Provider de pagamento nao encontrado.');
    return provider;
  }

  const provider = await PaymentProvider.findOne({
    where: { codigo: 'BB', ambiente: 'HOMOLOGACAO', ativo: true },
    order: [['id', 'ASC']],
    transaction
  });
  if (!provider) throw createHttpError(400, 'Provider BB/HOMOLOGACAO nao configurado.');
  return provider;
}

async function validatePayload(payload = {}, { partial = false } = {}) {
  const data = {};
  let contaBancaria = null;
  let empresa = null;

  if (!partial || payload.conta_bancaria_id != null) {
    const contaBancariaId = Number(payload.conta_bancaria_id);
    if (!Number.isInteger(contaBancariaId) || contaBancariaId <= 0) {
      throw createHttpError(400, 'Conta bancaria interna e obrigatoria.');
    }
    contaBancaria = await ContaBancaria.findByPk(contaBancariaId);
    if (!contaBancaria) throw createHttpError(404, 'Conta bancaria interna nao encontrada.');
    if (!contaBancaria.empresa_id) {
      throw createHttpError(400, 'A conta bancaria interna precisa estar vinculada a uma empresa do grupo antes de virar conta pagadora.');
    }
    data.conta_bancaria_id = contaBancariaId;
    empresa = await EmpresaGrupo.findByPk(Number(contaBancaria.empresa_id));
    if (!empresa || empresa.ativo === false) {
      throw createHttpError(400, 'A empresa vinculada a conta bancaria interna e invalida ou inativa.');
    }
    data.empresa_id = Number(empresa.id);
  }

  if (!partial || payload.cnpj_pagador != null) {
    const cnpjPagador = onlyDigits(payload.cnpj_pagador);
    if (cnpjPagador.length !== 14) throw createHttpError(400, 'CNPJ pagador deve conter 14 digitos.');
    data.cnpj_pagador = cnpjPagador;
  }

  if (payload.provider_id != null) {
    const providerId = Number(payload.provider_id);
    if (!Number.isInteger(providerId) || providerId <= 0) {
      throw createHttpError(400, 'Provider invalido.');
    }
    data.provider_id = providerId;
  }

  const requiredStrings = ['banco_codigo', 'agencia', 'conta', 'tipo_conta', 'convenio'];
  for (const field of requiredStrings) {
    if (!partial || payload[field] != null) {
      const value = cleanString(payload[field], 80);
      if (!value) throw createHttpError(400, `Campo ${field} e obrigatorio.`);
      data[field] = value;
    }
  }

  for (const field of ['agencia_digito', 'conta_digito', 'client_id_ref', 'client_secret_ref', 'certificate_ref']) {
    if (payload[field] !== undefined) {
      data[field] = cleanString(payload[field], 255);
    }
  }

  const contaBancariaIdParaValidar = data.conta_bancaria_id || payload.conta_bancaria_id;
  const empresaIdParaValidar = data.empresa_id;
  if (contaBancariaIdParaValidar && empresaIdParaValidar) {
    if (!contaBancaria) {
      contaBancaria = await ContaBancaria.findByPk(Number(contaBancariaIdParaValidar));
    }
    if (!empresa) {
      empresa = await EmpresaGrupo.findByPk(Number(empresaIdParaValidar));
    }
    if (!contaBancaria?.empresa_id) {
      throw createHttpError(400, 'A conta bancaria interna precisa estar vinculada a uma empresa do grupo antes de virar conta pagadora.');
    }
    if (!empresa || empresa.ativo === false) {
      throw createHttpError(400, 'Empresa pagadora invalida ou inativa.');
    }
    if (Number(contaBancaria.empresa_id) !== Number(empresa.id)) {
      throw createHttpError(400, 'A empresa pagadora deve ser a mesma vinculada a conta bancaria interna.');
    }
  }

  if (payload.ambiente !== undefined) {
    const ambiente = String(payload.ambiente || '').trim().toUpperCase();
    if (!['HOMOLOGACAO', 'PRODUCAO'].includes(ambiente)) {
      throw createHttpError(400, 'Ambiente de pagamento invalido.');
    }
    data.ambiente = ambiente;
  }

  if (payload.ativo !== undefined) {
    data.ativo = Boolean(payload.ativo);
  }

  return data;
}

function snapshot(account) {
  if (!account) return null;
  const data = account.get ? account.get({ plain: true }) : account;
  return {
    id: data.id,
    conta_bancaria_id: data.conta_bancaria_id,
    empresa_id: data.empresa_id,
    cnpj_pagador: data.cnpj_pagador,
    provider_id: data.provider_id,
    banco_codigo: data.banco_codigo,
    agencia: data.agencia,
    agencia_digito: data.agencia_digito,
    conta: data.conta,
    conta_digito: data.conta_digito,
    tipo_conta: data.tipo_conta,
    convenio: data.convenio,
    ambiente: data.ambiente,
    ativo: data.ativo,
    client_id_ref: data.client_id_ref ? '[ref]' : null,
    client_secret_ref: data.client_secret_ref ? '[ref]' : null,
    certificate_ref: data.certificate_ref ? '[ref]' : null
  };
}

async function createPaymentAccount(req, payload = {}) {
  const data = await validatePayload(payload);

  return sequelize.transaction(async (transaction) => {
    const provider = await resolveProvider(data.provider_id, { transaction });
    data.ambiente = data.ambiente || provider.ambiente || 'HOMOLOGACAO';
    if (String(provider.ambiente || '').toUpperCase() !== String(data.ambiente || '').toUpperCase()) {
      throw createHttpError(400, 'Ambiente do provider deve ser o mesmo da conta pagadora.');
    }
    const account = await PaymentAccount.create({
      ...data,
      provider_id: provider.id,
      banco_codigo: data.banco_codigo || '001',
      ambiente: data.ambiente || provider.ambiente || 'HOMOLOGACAO',
      ativo: data.ativo !== undefined ? data.ativo : true,
      created_by: req.user?.id || null,
      updated_by: req.user?.id || null
    }, { transaction });

    await registrarEventoSeguranca({
      req,
      usuarioId: req.user?.id || null,
      tipoEvento: 'PAYMENT_ACCOUNT_CREATED',
      recursoTipo: 'PAYMENT_ACCOUNT',
      recursoId: account.id,
      status: 'SUCCESS',
      descricao: 'Conta pagadora criada',
      metadata: { snapshot: snapshot(account) }
    });

    return account;
  });
}

async function updatePaymentAccount(req, id, payload = {}) {
  const account = await PaymentAccount.findByPk(id);
  if (!account) throw createHttpError(404, 'Conta pagadora nao encontrada.');

  const previous = snapshot(account);
  const data = await validatePayload(payload, { partial: true });
  const criticalFields = [
    'conta_bancaria_id',
    'empresa_id',
    'cnpj_pagador',
    'provider_id',
    'banco_codigo',
    'agencia',
    'agencia_digito',
    'conta',
    'conta_digito',
    'tipo_conta',
    'convenio',
    'ambiente',
    'ativo'
  ];
  const changesCriticalConfiguration = criticalFields.some(
    (field) => (
      Object.prototype.hasOwnProperty.call(data, field)
      && String(data[field] ?? '') !== String(account[field] ?? '')
    )
  );
  if (changesCriticalConfiguration) {
    const activeBatch = await PaymentBatch.findOne({
      where: {
        payment_account_id: account.id,
        status: {
          [Op.in]: [
            'RASCUNHO',
            'EM_REVISAO',
            'PENDENTE_APROVACAO',
            'APROVADO',
            'ENFILEIRADO',
            'ENVIANDO',
            'ENVIADO_AO_BANCO',
            'PROCESSANDO_BANCO',
            'ENVIO_INDETERMINADO',
            'AGUARDANDO_CONFIRMACAO_BAIXA'
          ]
        }
      },
      attributes: ['id', 'codigo', 'status']
    });
    if (activeBatch) {
      throw createHttpError(
        409,
        `Conta pagadora possui lote ativo ${activeBatch.codigo || `#${activeBatch.id}`} em status ${activeBatch.status}. Cancele ou conclua o lote antes de alterar dados bancarios.`
      );
    }
  }
  const providerIdFinal = data.provider_id || account.provider_id;
  const providerFinal = await resolveProvider(providerIdFinal);
  const ambienteFinal = data.ambiente || account.ambiente;
  if (String(providerFinal.ambiente || '').toUpperCase() !== String(ambienteFinal || '').toUpperCase()) {
    throw createHttpError(400, 'Ambiente do provider deve ser o mesmo da conta pagadora.');
  }
  const contaBancariaIdFinal = data.conta_bancaria_id || account.conta_bancaria_id;
  const empresaIdFinal = data.empresa_id !== undefined ? data.empresa_id : account.empresa_id;
  if (contaBancariaIdFinal && empresaIdFinal) {
    const contaBancaria = await ContaBancaria.findByPk(Number(contaBancariaIdFinal));
    if (!contaBancaria?.empresa_id) {
      throw createHttpError(400, 'A conta bancaria interna precisa estar vinculada a uma empresa do grupo antes de virar conta pagadora.');
    }
    if (Number(contaBancaria.empresa_id) !== Number(empresaIdFinal)) {
      throw createHttpError(400, 'A empresa pagadora deve ser a mesma vinculada a conta bancaria interna.');
    }
  }

  await account.update({
    ...data,
    updated_by: req.user?.id || null
  });

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'PAYMENT_ACCOUNT_UPDATED',
    recursoTipo: 'PAYMENT_ACCOUNT',
    recursoId: account.id,
    status: 'SUCCESS',
    descricao: 'Conta pagadora atualizada',
    metadata: {
      snapshot_anterior: previous,
      snapshot_novo: snapshot(account)
    }
  });

  return account;
}

module.exports = {
  createPaymentAccount,
  updatePaymentAccount
};
