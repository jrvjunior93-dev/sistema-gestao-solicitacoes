const { Op } = require('sequelize');
const {
  ContaBancaria,
  EmpresaGrupo,
  PaymentAccount,
  PaymentBeneficiary,
  PaymentIntent,
  TituloFinanceiro
} = require('../models');
const { canPreparePagamentos } = require('./authorizationService');
const { assertTituloDisponivelParaBaixa, tituloEstaBloqueado } = require('./tituloBloqueioRetornoObraService');

const ACTIVE_INTENT_STATUSES = [
  'RASCUNHO',
  'PENDENTE_DADOS_FAVORECIDO',
  'PRONTO_PARA_LOTE',
  'EM_LOTE',
  'PENDENTE_APROVACAO',
  'APROVADO',
  'ENFILEIRADO',
  'ENVIANDO',
  'ENVIADO_AO_BANCO',
  'PROCESSANDO_BANCO',
  'CONFIRMADO_BANCO',
  'AGUARDANDO_CONFIRMACAO_BAIXA'
];

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function onlyDigits(value) {
  return String(value || '').replace(/\D+/g, '');
}

async function validateUserCanPrepareBatch(req) {
  if (!(await canPreparePagamentos(req.user))) {
    throw createHttpError(403, 'Usuario sem permissao para preparar lote de pagamento.');
  }
}

async function validateBeneficiaryComplete(beneficiary) {
  if (!beneficiary || beneficiary.ativo === false) {
    throw createHttpError(400, 'Favorecido bancario ativo e obrigatorio.');
  }
  if (!beneficiary.nome || !beneficiary.cpf_cnpj || !beneficiary.pix_tipo_chave || !beneficiary.pix_chave) {
    throw createHttpError(400, 'Favorecido bancario com dados PIX incompletos.');
  }
  if (String(beneficiary.pix_tipo_chave).toUpperCase() === 'COPIA_COLA') {
    throw createHttpError(400, 'Pix Copia e Cola deve ser pago pela fila manual. O lote bancario automatico atual aceita apenas pagamento por chave Pix.');
  }
  return true;
}

async function validatePaymentAccount(paymentAccountId) {
  const account = await PaymentAccount.findByPk(paymentAccountId, {
    include: [{ model: ContaBancaria, as: 'contaBancaria' }]
  });
  if (!account || account.ativo === false) {
    throw createHttpError(400, 'Conta pagadora nao encontrada ou inativa.');
  }
  if (!account.empresa_id) {
    throw createHttpError(400, 'Conta pagadora sem empresa pagadora vinculada.');
  }
  const empresa = await EmpresaGrupo.findByPk(account.empresa_id);
  if (!empresa || empresa.ativo === false) {
    throw createHttpError(400, 'Empresa pagadora da conta nao encontrada ou inativa.');
  }
  if (onlyDigits(account.cnpj_pagador).length !== 14) {
    throw createHttpError(400, 'Conta pagadora sem CNPJ pagador valido.');
  }
  if (!account.conta_bancaria_id || !account.contaBancaria) {
    throw createHttpError(400, 'Conta pagadora sem conta bancaria financeira vinculada.');
  }
  if (!account.contaBancaria.empresa_id) {
    throw createHttpError(400, 'Conta bancaria financeira vinculada ao pagamento nao possui empresa vinculada.');
  }
  if (Number(account.contaBancaria.empresa_id) !== Number(account.empresa_id)) {
    throw createHttpError(400, 'Empresa da conta bancaria financeira diverge da empresa pagadora configurada.');
  }
  const requiredFields = [
    ['provider_id', 'provider de pagamento'],
    ['banco_codigo', 'codigo do banco'],
    ['agencia', 'agencia'],
    ['conta', 'conta'],
    ['tipo_conta', 'tipo de conta'],
    ['convenio', 'convenio']
  ];
  for (const [field, label] of requiredFields) {
    if (!account[field]) {
      throw createHttpError(400, `Conta pagadora sem ${label}.`);
    }
  }
  return account;
}

async function validateNoActiveIntent(tituloId, { transaction = null } = {}) {
  const existing = await PaymentIntent.findOne({
    where: {
      titulo_financeiro_id: tituloId,
      status: { [Op.in]: ACTIVE_INTENT_STATUSES }
    },
    transaction
  });

  if (existing) {
    throw createHttpError(409, 'Titulo ja possui pagamento bancario ativo.');
  }
}

async function validateTituloEligibleForPayment(titulo, { beneficiary = null, transaction = null } = {}) {
  if (!titulo) throw createHttpError(404, 'Titulo financeiro nao encontrado.');
  assertTituloDisponivelParaBaixa(titulo);
  if (String(titulo.tipo || '').toUpperCase() !== 'PAGAR') {
    throw createHttpError(400, 'Apenas titulos a pagar podem entrar em lote.');
  }
  if (!['ABERTO', 'PARCIAL'].includes(String(titulo.status || '').toUpperCase())) {
    throw createHttpError(400, 'Titulo precisa estar ABERTO ou PARCIAL.');
  }
  if (toNumber(titulo.valor_saldo) <= 0) {
    throw createHttpError(400, 'Titulo sem saldo disponivel para pagamento.');
  }
  if (titulo.parceiro && titulo.parceiro.ativo === false) {
    throw createHttpError(400, 'Parceiro do titulo esta inativo.');
  }

  if (beneficiary) {
    await validateBeneficiaryComplete(beneficiary);
  }
  if (titulo.pagamento_favorecido) {
    const p = titulo.pagamento_favorecido;
    // O banco nao pode ignorar uma instrucao corrigida e escolher o cadastro
    // antigo do credor. Exigir correspondencia explicita; nunca autoatualizar
    // cadastro global, remessa ou snapshot que ja tenha sido autorizado.
    const doc = v => String(v || '').replace(/\D/g, '');
    if (!beneficiary || Number(titulo.payment_beneficiary_id) !== Number(beneficiary.id)
      || !p.cpf_cnpj || doc(beneficiary.cpf_cnpj) !== doc(p.cpf_cnpj)
      || (p.favorecido_chave_pix && String(beneficiary.pix_chave || '').trim() !== p.favorecido_chave_pix)
      || (!p.favorecido_chave_pix && p.dados_pagamento)) {
      throw createHttpError(409, 'Favorecido corrigido no titulo. Confira e vincule os mesmos dados no cadastro bancario antes de montar remessa, ou utilize a fila manual.');
    }
  }

  await validateNoActiveIntent(titulo.id, { transaction });
  return true;
}

module.exports = {
  ACTIVE_INTENT_STATUSES,
  validateBeneficiaryComplete,
  validateNoActiveIntent,
  validatePaymentAccount,
  validateTituloEligibleForPayment,
  validateUserCanPrepareBatch,
  tituloEstaBloqueado
};
