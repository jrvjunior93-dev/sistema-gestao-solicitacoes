const { env } = require('../../config/env');
const { createBancoDoBrasilError } = require('./bancoDoBrasilErrors');

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function toPositiveInteger(value, fieldName) {
  const digits = digitsOnly(value);
  const parsed = Number(digits);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createBancoDoBrasilError(400, `${fieldName} invalido ou nao configurado.`, 'BB_PAYLOAD_INVALID');
  }
  return parsed;
}

function toBankAgencyInteger(value, fieldName) {
  const normalized = String(value || '').trim();
  const agencyWithoutDigit = normalized.includes('-')
    ? normalized.split('-')[0]
    : normalized;
  return toPositiveInteger(agencyWithoutDigit, fieldName);
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

function toDdMmYyyyString(value, fieldName, options = {}) {
  const normalized = String(value || '').slice(0, 10);
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw createBancoDoBrasilError(400, `${fieldName} deve estar no formato YYYY-MM-DD.`, 'BB_PAYLOAD_INVALID');
  }
  if (options.rejectRetroactive !== false && normalized < todayIsoSaoPaulo()) {
    throw createBancoDoBrasilError(400, `${fieldName} nao pode ser retroativa para envio BB.`, 'BB_PAYMENT_DATE_RETROACTIVE');
  }
  return `${match[3]}${match[2]}${match[1]}`;
}

function truncate(value, max) {
  return String(value || '').trim().slice(0, max);
}

function getSnapshot(intent, key) {
  return intent?.beneficiary_snapshot?.[key] || intent?.beneficiary?.[key] || null;
}

function mapPixKeyFields(intent) {
  const pixTipo = String(getSnapshot(intent, 'pix_tipo_chave') || '').trim().toUpperCase();
  const pixChave = String(getSnapshot(intent, 'pix_chave') || '').trim();
  const cpfCnpj = digitsOnly(getSnapshot(intent, 'cpf_cnpj'));

  if (!pixTipo || !pixChave) {
    throw createBancoDoBrasilError(400, 'Favorecido sem chave PIX completa.', 'BB_PIX_KEY_MISSING');
  }

  if (pixTipo === 'EMAIL') {
    return { formaIdentificacao: 2, email: pixChave, ...mapCpfCnpj(cpfCnpj, false) };
  }

  if (pixTipo === 'TELEFONE') {
    const phone = digitsOnly(pixChave).replace(/^55/, '');
    if (phone.length < 10) {
      throw createBancoDoBrasilError(400, 'Chave PIX telefone invalida para o Banco do Brasil.', 'BB_PIX_PHONE_INVALID');
    }
    return {
      formaIdentificacao: 1,
      dddTelefone: Number(phone.slice(0, 2)),
      telefone: Number(phone.slice(2)),
      ...mapCpfCnpj(cpfCnpj, false)
    };
  }

  if (pixTipo === 'ALEATORIA') {
    return { formaIdentificacao: 4, identificacaoAleatoria: pixChave, ...mapCpfCnpj(cpfCnpj, false) };
  }

  if (pixTipo === 'CPF' || pixTipo === 'CNPJ') {
    return { formaIdentificacao: 3, ...mapCpfCnpj(digitsOnly(pixChave) || cpfCnpj, true) };
  }

  if (pixTipo === 'COPIA_COLA') {
    throw createBancoDoBrasilError(400, 'Pix Copia e Cola nao pode ser enviado como chave Pix. Utilize a fila manual.', 'BB_PIX_COPY_PASTE_UNSUPPORTED');
  }
  throw createBancoDoBrasilError(400, `Tipo de chave PIX nao suportado: ${pixTipo}`, 'BB_PIX_KEY_TYPE_UNSUPPORTED');
}

function mapCpfCnpj(value, required) {
  const digits = digitsOnly(value);
  if (!digits) {
    if (required) throw createBancoDoBrasilError(400, 'CPF/CNPJ do favorecido e obrigatorio para esta chave PIX.', 'BB_TAX_ID_MISSING');
    return {};
  }
  if (digits.length === 11) return { cpf: Number(digits) };
  if (digits.length === 14) return { cnpj: Number(digits) };
  if (required) throw createBancoDoBrasilError(400, 'CPF/CNPJ do favorecido deve ter 11 ou 14 digitos.', 'BB_TAX_ID_INVALID');
  return {};
}

function resolvePaymentAccount(account = {}) {
  return {
    numeroContrato: toPositiveInteger(env.bbNumeroContratoPagamento || account.convenio, 'Numero do contrato BB'),
    agenciaDebito: toBankAgencyInteger(env.bbAgenciaDebito || account.agencia, 'Agencia de debito BB'),
    contaCorrenteDebito: toPositiveInteger(env.bbContaCorrenteDebito || account.conta, 'Conta corrente de debito BB'),
    digitoVerificadorContaCorrente: String(env.bbDigitoContaCorrenteDebito || account.conta_digito || '').trim().slice(0, 1)
  };
}

function resolveNumeroRequisicao(batch, override) {
  const numero = Number(override || batch?.id);
  if (!Number.isInteger(numero) || numero <= 0 || numero > 999999) {
    throw createBancoDoBrasilError(400, 'NumeroRequisicao BB precisa ser um inteiro positivo de ate 6 digitos.', 'BB_REQUEST_NUMBER_INVALID');
  }
  return numero;
}

function mapIntentToTransfer(item, batch) {
  const intent = item?.intent || {};
  const titulo = intent?.titulo || {};
  const dataPagamento = intent.data_pagamento || batch.data_programada;
  const valor = Number(intent.valor || item.valor || 0);
  if (!valor || valor <= 0) {
    throw createBancoDoBrasilError(400, 'Valor do pagamento invalido para envio BB.', 'BB_PAYMENT_VALUE_INVALID');
  }

  return {
    data: toDdMmYyyyString(dataPagamento, 'Data de pagamento'),
    valor: Number(valor.toFixed(2)),
    documentoDebito: Number(intent.id || item.payment_intent_id || item.sequencia || 0),
    documentoCredito: Number(titulo.id || intent.titulo_financeiro_id || intent.id || 0),
    descricaoPagamento: truncate(titulo.numero_documento || titulo.codigo || `FLUXY ${intent.id || item.sequencia}`, 40),
    descricaoPagamentoInstantaneo: truncate(intent.correlation_id || batch.codigo || `FLUXY ${batch.id}`, 35),
    ...mapPixKeyFields(intent)
  };
}

function mapBatchToPixTransferRequest(batch, options = {}) {
  const items = Array.isArray(batch?.items) ? batch.items : [];
  if (!items.length) {
    throw createBancoDoBrasilError(400, 'Lote sem itens para envio BB.', 'BB_EMPTY_BATCH');
  }
  if (items.length > 320) {
    throw createBancoDoBrasilError(400, 'Lote PIX BB permite no maximo 320 transferencias.', 'BB_BATCH_LIMIT');
  }

  return {
    numeroRequisicao: resolveNumeroRequisicao(batch, options.numeroRequisicao),
    ...resolvePaymentAccount(batch.paymentAccount),
    tipoPagamento: 126,
    listaTransferencias: items.map((item) => mapIntentToTransfer(item, batch))
  };
}

module.exports = {
  mapBatchToPixTransferRequest,
  toDdMmYyyyString,
  toDdMmYyyyNumber: toDdMmYyyyString
};
