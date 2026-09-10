const { ensureAllowedKeys, sanitizeString, ValidationError } = require('../middlewares/validation');
const { onlyDigits, isValidCnpj, isValidCpfCnpj, isValidPixDocument } = require('../utils/cpfCnpj');

function isBlank(value) {
  return value == null || String(value).trim() === '';
}

function parseInteger(value, fieldName, { required = false } = {}) {
  if (isBlank(value)) {
    if (required) throw new ValidationError(`${fieldName} e obrigatorio.`);
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationError(`${fieldName} invalido.`);
  }
  return parsed;
}

function parseBoolean(value) {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'sim', 'yes'].includes(String(value).trim().toLowerCase());
}

function parseDateOnly(value, fieldName, { required = false } = {}) {
  if (isBlank(value)) {
    if (required) throw new ValidationError(`${fieldName} e obrigatorio.`);
    return undefined;
  }
  return sanitizeString(value, fieldName, { required: true, max: 10, pattern: /^\d{4}-\d{2}-\d{2}$/ });
}

function parseDecimal(value, fieldName, { required = false, min = null } = {}) {
  if (isBlank(value)) {
    if (required) throw new ValidationError(`${fieldName} e obrigatorio.`);
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || (min !== null && parsed < min)) {
    throw new ValidationError(`${fieldName} invalido.`);
  }
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

function parseEnum(value, fieldName, allowedValues, { required = false } = {}) {
  if (isBlank(value)) {
    if (required) throw new ValidationError(`${fieldName} e obrigatorio.`);
    return undefined;
  }
  const normalized = String(value).trim().toUpperCase();
  if (!allowedValues.includes(normalized)) throw new ValidationError(`${fieldName} invalido.`);
  return normalized;
}

function parseOptionalText(value, fieldName, max = 255) {
  if (value === undefined) return undefined;
  if (isBlank(value)) return null;
  return sanitizeString(value, fieldName, { required: false, max });
}

function parseRequiredText(value, fieldName, max = 255) {
  if (isBlank(value)) throw new ValidationError(`${fieldName} e obrigatoria.`);
  return sanitizeString(value, fieldName, { required: true, max });
}

function cleanUndefined(data) {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}

function parseCpfCnpj(value, fieldName, { required = false, cnpjOnly = false } = {}) {
  if (isBlank(value)) {
    if (required) throw new ValidationError(`${fieldName} e obrigatorio.`);
    return undefined;
  }
  const valid = cnpjOnly ? isValidCnpj(value) : isValidCpfCnpj(value);
  if (!valid) throw new ValidationError(`${fieldName} invalido.`);
  return onlyDigits(value);
}

function validatePaymentBeneficiaryCreateBody(payload = {}) {
  ensureAllowedKeys(payload, [
    'parceiro_id',
    'nome',
    'cpf_cnpj',
    'metodo_preferencial',
    'pix_tipo_chave',
    'pix_chave',
    'banco_codigo',
    'agencia',
    'agencia_digito',
    'conta',
    'conta_digito',
    'tipo_conta',
    'ativo'
  ], 'Favorecido bancario');

  const pixTipoChave = parseEnum(payload.pix_tipo_chave, 'Tipo de chave PIX', ['CPF', 'CNPJ', 'EMAIL', 'TELEFONE', 'ALEATORIA'], { required: true });
  let pixChave = sanitizeString(payload.pix_chave, 'Chave PIX', { required: true, max: 180 });
  if (!isValidPixDocument(pixChave, pixTipoChave)) {
    throw new ValidationError(`Chave PIX ${pixTipoChave} invalida.`);
  }
  if (['CPF', 'CNPJ'].includes(pixTipoChave)) pixChave = onlyDigits(pixChave);

  return cleanUndefined({
    parceiro_id: parseInteger(payload.parceiro_id, 'Parceiro', { required: true }),
    nome: sanitizeString(payload.nome, 'Nome favorecido', { required: true, max: 180 }),
    cpf_cnpj: parseCpfCnpj(payload.cpf_cnpj, 'CPF/CNPJ favorecido', { required: true }),
    metodo_preferencial: parseEnum(payload.metodo_preferencial || 'PIX_CHAVE', 'Metodo preferencial', ['PIX_CHAVE'], { required: true }),
    pix_tipo_chave: pixTipoChave,
    pix_chave: pixChave,
    banco_codigo: parseOptionalText(payload.banco_codigo, 'Codigo do banco', 10),
    agencia: parseOptionalText(payload.agencia, 'Agencia', 20),
    agencia_digito: parseOptionalText(payload.agencia_digito, 'Digito da agencia', 5),
    conta: parseOptionalText(payload.conta, 'Conta', 30),
    conta_digito: parseOptionalText(payload.conta_digito, 'Digito da conta', 5),
    tipo_conta: parseOptionalText(payload.tipo_conta, 'Tipo de conta', 30),
    ativo: parseBoolean(payload.ativo)
  });
}

function validatePaymentBeneficiaryUpdateBody(payload = {}) {
  const data = validatePaymentBeneficiaryCreateBody({ ...payload, parceiro_id: payload.parceiro_id || 1 });
  if (payload.parceiro_id === undefined) delete data.parceiro_id;
  return data;
}

function validatePaymentBatchCreateBody(payload = {}) {
  ensureAllowedKeys(payload, ['titulo_ids', 'payment_account_id', 'data_programada'], 'Lote de pagamento');
  const tituloIds = Array.isArray(payload.titulo_ids)
    ? payload.titulo_ids.map((id) => parseInteger(id, 'Titulo')).filter(Boolean)
    : [];
  if (!tituloIds.length) throw new ValidationError('Informe ao menos um titulo para gerar o lote.');
  return {
    titulo_ids: tituloIds,
    payment_account_id: parseInteger(payload.payment_account_id, 'Conta pagadora', { required: true }),
    data_programada: parseDateOnly(payload.data_programada, 'Data programada', { required: true })
  };
}

function validatePaymentMfaBody(payload = {}) {
  ensureAllowedKeys(payload, ['codigo_mfa', 'mfa_code', 'justificativa'], 'MFA');
  return cleanUndefined({
    codigo_mfa: parseOptionalText(payload.codigo_mfa, 'Codigo MFA', 12),
    mfa_code: parseOptionalText(payload.mfa_code, 'Codigo MFA', 12),
    justificativa: parseOptionalText(payload.justificativa, 'Justificativa', 500)
  });
}

function validatePaymentRejectBody(payload = {}) {
  ensureAllowedKeys(payload, ['justificativa'], 'Rejeicao de lote');
  return {
    justificativa: parseRequiredText(payload.justificativa, 'Justificativa', 500)
  };
}

function validatePaymentCancelBody(payload = {}) {
  ensureAllowedKeys(payload, ['justificativa', 'codigo_mfa', 'mfa_code'], 'Cancelamento de lote');
  return cleanUndefined({
    justificativa: parseOptionalText(payload.justificativa, 'Justificativa', 500),
    codigo_mfa: parseOptionalText(payload.codigo_mfa, 'Codigo MFA', 12),
    mfa_code: parseOptionalText(payload.mfa_code, 'Codigo MFA', 12)
  });
}

function validatePaymentBatchItemParams(params = {}) {
  ensureAllowedKeys(params, ['id', 'itemId'], 'Parametros do item do lote de pagamento');
  return {
    id: String(parseInteger(params.id, 'Lote de pagamento', { required: true })),
    itemId: String(parseInteger(params.itemId, 'Item do lote de pagamento', { required: true }))
  };
}

function validatePaymentAccountBody(payload = {}) {
  ensureAllowedKeys(payload, [
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
    'client_id_ref',
    'client_secret_ref',
    'certificate_ref',
    'ambiente',
    'ativo'
  ], 'Conta pagadora');
  return cleanUndefined({
    ...payload,
    conta_bancaria_id: parseInteger(payload.conta_bancaria_id, 'Conta bancaria', { required: payload.conta_bancaria_id !== undefined }),
    empresa_id: payload.empresa_id ? parseInteger(payload.empresa_id, 'Empresa') : payload.empresa_id,
    cnpj_pagador: parseCpfCnpj(payload.cnpj_pagador, 'CNPJ pagador', {
      required: payload.cnpj_pagador !== undefined,
      cnpjOnly: true
    }),
    provider_id: payload.provider_id ? parseInteger(payload.provider_id, 'Provider') : payload.provider_id,
    ambiente: payload.ambiente ? parseEnum(payload.ambiente, 'Ambiente', ['HOMOLOGACAO', 'PRODUCAO']) : payload.ambiente,
    ativo: parseBoolean(payload.ativo)
  });
}

function validateManualPaymentQueueCreateBody(payload = {}) {
  ensureAllowedKeys(payload, ['titulo_ids', 'idempotency_key'], 'Envio para fila de pagamentos');
  const tituloIds = Array.isArray(payload.titulo_ids)
    ? Array.from(new Set(payload.titulo_ids.map((id) => parseInteger(id, 'Titulo')).filter(Boolean)))
    : [];
  if (tituloIds.length === 0) throw new ValidationError('Selecione ao menos um titulo para pagamento.');
  if (tituloIds.length > 200) throw new ValidationError('Envie no maximo 200 titulos por operacao.');
  return cleanUndefined({
    titulo_ids: tituloIds,
    idempotency_key: parseOptionalText(payload.idempotency_key, 'Chave de idempotencia', 80)
  });
}

function validateManualPaymentQueueQuery(payload = {}) {
  ensureAllowedKeys(payload, ['status', 'q'], 'Consulta da fila de pagamentos');
  return cleanUndefined({
    status: parseEnum(payload.status, 'Status', ['PENDENTE', 'NAO_PAGO', 'DIVERGENTE', 'BAIXADO', 'RESOLVIDO', 'TODOS']),
    q: parseOptionalText(payload.q, 'Busca', 120)
  });
}

function validateManualPaymentQueueProcessBody(payload = {}) {
  ensureAllowedKeys(payload, ['itens', 'idempotency_key'], 'Baixa da fila de pagamentos');
  if (!Array.isArray(payload.itens) || payload.itens.length === 0) {
    throw new ValidationError('Selecione ao menos um item da fila para registrar a baixa.');
  }
  if (payload.itens.length > 200) throw new ValidationError('Registre no maximo 200 baixas por operacao.');

  const ids = new Set();
  const itens = payload.itens.map((item, index) => {
    ensureAllowedKeys(item, ['fila_id', 'data_baixa', 'conta_bancaria_id', 'valor_pago', 'motivo'], `Item ${index + 1}`);
    const filaId = parseInteger(item.fila_id, `Item ${index + 1}`, { required: true });
    if (ids.has(filaId)) throw new ValidationError(`O item ${filaId} foi informado mais de uma vez.`);
    ids.add(filaId);
    return cleanUndefined({
      fila_id: filaId,
      data_baixa: parseDateOnly(item.data_baixa, `Data da baixa do item ${index + 1}`, { required: true }),
      conta_bancaria_id: parseInteger(item.conta_bancaria_id, `Conta pagadora do item ${index + 1}`, { required: true }),
      valor_pago: parseDecimal(item.valor_pago, `Valor pago do item ${index + 1}`, { required: true, min: 0.01 }),
      motivo: parseOptionalText(item.motivo, `Observacao do item ${index + 1}`, 500)
    });
  });

  return cleanUndefined({
    itens,
    idempotency_key: parseOptionalText(payload.idempotency_key, 'Chave de idempotencia', 80)
  });
}

function validateManualPaymentQueueResultBody(payload = {}) {
  ensureAllowedKeys(payload, ['status', 'motivo'], 'Resultado do pagamento');
  return {
    status: parseEnum(payload.status, 'Status', ['NAO_PAGO'], { required: true }),
    motivo: parseRequiredText(payload.motivo, 'Justificativa', 500)
  };
}

function validateManualPaymentQueueResolveBody(payload = {}) {
  ensureAllowedKeys(payload, ['acao', 'motivo'], 'Resolucao da fila de pagamentos');
  return cleanUndefined({
    acao: parseEnum(payload.acao, 'Acao', ['REABRIR', 'ENCERRAR'], { required: true }),
    motivo: parseOptionalText(payload.motivo, 'Observacao', 500)
  });
}

module.exports = {
  validatePaymentAccountBody,
  validatePaymentBatchItemParams,
  validatePaymentBatchCreateBody,
  validatePaymentBeneficiaryCreateBody,
  validatePaymentBeneficiaryUpdateBody,
  validateManualPaymentQueueCreateBody,
  validateManualPaymentQueueProcessBody,
  validateManualPaymentQueueQuery,
  validateManualPaymentQueueResolveBody,
  validateManualPaymentQueueResultBody,
  validatePaymentCancelBody,
  validatePaymentRejectBody,
  validatePaymentMfaBody
};
