const {
  Parceiro,
  PaymentBeneficiary,
  PaymentBeneficiaryAuditLog,
  sequelize
} = require('../models');
const { registrarEventoSeguranca } = require('./securityLogService');

const { PIX_TIPOS_CHAVE, PIX_TEXTO_MAX } = require('../utils/pix');

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeToken(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeCpfCnpj(value) {
  return onlyDigits(value);
}

function normalizePixKey(tipo, chave) {
  const normalizedType = normalizeToken(tipo);
  const raw = normalizeText(chave);
  if (['CPF', 'CNPJ', 'TELEFONE'].includes(normalizedType)) {
    return onlyDigits(raw);
  }
  if (normalizedType === 'EMAIL') {
    return raw.toLowerCase();
  }
  return raw;
}

function validateBeneficiaryPayload(payload = {}, { partial = false } = {}) {
  const data = {};

  if (!partial || payload.parceiro_id !== undefined) {
    const parceiroId = Number(payload.parceiro_id);
    if (!Number.isInteger(parceiroId) || parceiroId <= 0) {
      throw createHttpError(400, 'Parceiro do favorecido e obrigatorio.');
    }
    data.parceiro_id = parceiroId;
  }

  if (!partial || payload.nome !== undefined) {
    const nome = normalizeText(payload.nome);
    if (!nome) throw createHttpError(400, 'Nome do favorecido e obrigatorio.');
    data.nome = nome;
  }

  if (!partial || payload.cpf_cnpj !== undefined) {
    const cpfCnpj = normalizeCpfCnpj(payload.cpf_cnpj);
    if (!cpfCnpj) throw createHttpError(400, 'CPF/CNPJ do favorecido e obrigatorio.');
    data.cpf_cnpj = cpfCnpj;
  }

  if (!partial || payload.pix_tipo_chave !== undefined) {
    const tipoChave = normalizeToken(payload.pix_tipo_chave);
    if (!PIX_TIPOS_CHAVE.includes(tipoChave)) {
      throw createHttpError(400, 'Tipo de chave PIX invalido.');
    }
    data.pix_tipo_chave = tipoChave;
  }

  if (!partial || payload.pix_chave !== undefined) {
    const tipoChave = data.pix_tipo_chave || normalizeToken(payload.pix_tipo_chave);
    const chave = normalizePixKey(tipoChave, payload.pix_chave);
    if (!chave) throw createHttpError(400, 'Chave PIX do favorecido e obrigatoria.');
    if (chave.length > (tipoChave === 'COPIA_COLA' ? PIX_TEXTO_MAX : 255)) {
      throw createHttpError(400, 'Chave PIX excede o tamanho permitido.');
    }
    data.pix_chave = chave;
  }

  const optionalTextFields = [
    'metodo_preferencial',
    'banco_codigo',
    'agencia',
    'agencia_digito',
    'conta',
    'conta_digito',
    'tipo_conta'
  ];

  for (const field of optionalTextFields) {
    if (payload[field] !== undefined) {
      const value = normalizeText(payload[field]);
      data[field] = value || null;
    }
  }

  if (payload.ativo !== undefined) {
    data.ativo = Boolean(payload.ativo);
  }

  if (!data.metodo_preferencial && !partial) {
    data.metodo_preferencial = 'PIX_CHAVE';
  }

  return data;
}

function toSnapshot(instance) {
  if (!instance) return null;
  const data = typeof instance.get === 'function' ? instance.get({ plain: true }) : instance;
  return {
    id: data.id,
    parceiro_id: data.parceiro_id,
    nome: data.nome,
    cpf_cnpj: data.cpf_cnpj,
    metodo_preferencial: data.metodo_preferencial,
    pix_tipo_chave: data.pix_tipo_chave,
    pix_chave: data.pix_chave,
    banco_codigo: data.banco_codigo,
    agencia: data.agencia,
    agencia_digito: data.agencia_digito,
    conta: data.conta,
    conta_digito: data.conta_digito,
    tipo_conta: data.tipo_conta,
    ativo: Boolean(data.ativo),
    validado_em: data.validado_em || null,
    validado_por: data.validado_por || null
  };
}

async function registrarAuditoria(req, {
  beneficiaryId,
  parceiroId,
  acao,
  snapshotAnterior = null,
  snapshotNovo = null,
  campoAlterado = null,
  valorAnterior = null,
  valorNovo = null,
  transaction = null
}) {
  await PaymentBeneficiaryAuditLog.create({
    payment_beneficiary_id: beneficiaryId || null,
    parceiro_id: parceiroId || null,
    acao,
    campo_alterado: campoAlterado,
    valor_anterior: valorAnterior == null ? null : String(valorAnterior),
    valor_novo: valorNovo == null ? null : String(valorNovo),
    snapshot_anterior: snapshotAnterior,
    snapshot_novo: snapshotNovo,
    alterado_por: req.user?.id || null,
    alterado_em: new Date(),
    ip: req.ip || null,
    user_agent: req.get?.('user-agent') || null
  }, { transaction });
}

async function listBeneficiariesByPartner(req, filters = {}) {
  const parceiroId = Number(filters.parceiro_id);
  const where = {};
  if (Number.isInteger(parceiroId) && parceiroId > 0) {
    where.parceiro_id = parceiroId;
  }

  return PaymentBeneficiary.findAll({
    where,
    include: [{ model: Parceiro, as: 'parceiro', attributes: ['id', 'nome', 'cpf_cnpj'] }],
    order: [['ativo', 'DESC'], ['nome', 'ASC']]
  });
}

async function createBeneficiary(req, payload = {}) {
  const data = validateBeneficiaryPayload(payload);
  const parceiro = await Parceiro.findByPk(data.parceiro_id);
  if (!parceiro || parceiro.ativo === false) {
    throw createHttpError(404, 'Parceiro nao encontrado ou inativo.');
  }

  return sequelize.transaction(async (transaction) => {
    const beneficiary = await PaymentBeneficiary.create({
      ...data,
      ativo: data.ativo !== undefined ? data.ativo : true,
      created_by: req.user?.id || null,
      updated_by: req.user?.id || null
    }, { transaction });

    await registrarAuditoria(req, {
      beneficiaryId: beneficiary.id,
      parceiroId: beneficiary.parceiro_id,
      acao: 'CREATE',
      snapshotNovo: toSnapshot(beneficiary),
      transaction
    });

    await registrarEventoSeguranca({
      req,
      usuarioId: req.user?.id || null,
      tipoEvento: 'PAYMENT_BENEFICIARY_CREATED',
      recursoTipo: 'PAYMENT_BENEFICIARY',
      recursoId: beneficiary.id,
      status: 'SUCCESS',
      descricao: 'Favorecido bancario criado',
      metadata: { parceiro_id: beneficiary.parceiro_id }
    });

    return beneficiary;
  });
}

async function updateBeneficiary(req, id, payload = {}) {
  const beneficiary = await PaymentBeneficiary.findByPk(id);
  if (!beneficiary) throw createHttpError(404, 'Favorecido nao encontrado.');

  const data = validateBeneficiaryPayload({
    ...payload,
    parceiro_id: payload.parceiro_id ?? beneficiary.parceiro_id,
    pix_tipo_chave: payload.pix_tipo_chave ?? beneficiary.pix_tipo_chave
  }, { partial: true });

  return sequelize.transaction(async (transaction) => {
    const snapshotAnterior = toSnapshot(beneficiary);
    await beneficiary.update({
      ...data,
      updated_by: req.user?.id || null
    }, { transaction });

    const snapshotNovo = toSnapshot(beneficiary);
    const changedFields = Object.keys(snapshotNovo).filter(
      (field) => JSON.stringify(snapshotAnterior?.[field] ?? null) !== JSON.stringify(snapshotNovo?.[field] ?? null)
    );

    if (changedFields.length === 0) {
      return beneficiary;
    }

    for (const field of changedFields) {
      await registrarAuditoria(req, {
        beneficiaryId: beneficiary.id,
        parceiroId: beneficiary.parceiro_id,
        acao: 'UPDATE',
        campoAlterado: field,
        valorAnterior: snapshotAnterior?.[field],
        valorNovo: snapshotNovo?.[field],
        snapshotAnterior,
        snapshotNovo,
        transaction
      });
    }

    await registrarEventoSeguranca({
      req,
      usuarioId: req.user?.id || null,
      tipoEvento: 'PAYMENT_BENEFICIARY_UPDATED',
      recursoTipo: 'PAYMENT_BENEFICIARY',
      recursoId: beneficiary.id,
      status: 'SUCCESS',
      descricao: 'Favorecido bancario atualizado',
      metadata: { campos: changedFields }
    });

    return beneficiary;
  });
}

async function deactivateBeneficiary(req, id) {
  const beneficiary = await PaymentBeneficiary.findByPk(id);
  if (!beneficiary) throw createHttpError(404, 'Favorecido nao encontrado.');

  const snapshotAnterior = toSnapshot(beneficiary);
  await beneficiary.update({
    ativo: false,
    updated_by: req.user?.id || null
  });

  await registrarAuditoria(req, {
    beneficiaryId: beneficiary.id,
    parceiroId: beneficiary.parceiro_id,
    acao: 'DEACTIVATE',
    campoAlterado: 'ativo',
    valorAnterior: snapshotAnterior.ativo,
    valorNovo: false,
    snapshotAnterior,
    snapshotNovo: toSnapshot(beneficiary)
  });

  return beneficiary;
}

async function validateBeneficiary(req, id) {
  const beneficiary = await PaymentBeneficiary.findByPk(id);
  if (!beneficiary) throw createHttpError(404, 'Favorecido nao encontrado.');
  if (!beneficiary.nome || !beneficiary.cpf_cnpj || !beneficiary.pix_tipo_chave || !beneficiary.pix_chave) {
    throw createHttpError(400, 'Favorecido com dados PIX incompletos.');
  }

  const snapshotAnterior = toSnapshot(beneficiary);
  await beneficiary.update({
    validado_em: new Date(),
    validado_por: req.user?.id || null,
    updated_by: req.user?.id || null
  });

  await registrarAuditoria(req, {
    beneficiaryId: beneficiary.id,
    parceiroId: beneficiary.parceiro_id,
    acao: 'VALIDATE',
    snapshotAnterior,
    snapshotNovo: toSnapshot(beneficiary)
  });

  return beneficiary;
}

async function getBeneficiaryAuditLogs(req, id) {
  return PaymentBeneficiaryAuditLog.findAll({
    where: { payment_beneficiary_id: id },
    order: [['alterado_em', 'DESC'], ['id', 'DESC']],
    limit: 200
  });
}

module.exports = {
  createBeneficiary,
  deactivateBeneficiary,
  getBeneficiaryAuditLogs,
  listBeneficiariesByPartner,
  normalizePixKey,
  toSnapshot,
  updateBeneficiary,
  validateBeneficiary,
  validateBeneficiaryPayload
};
