'use strict';

const {
  ensureAllowedKeys,
  sanitizeString,
  ValidationError
} = require('../../../middlewares/validation');
const {
  FISCAL_AMBIENTES_SEFAZ,
  FISCAL_DOCUMENT_STATUSES,
  FISCAL_DOCUMENT_TYPES,
  FISCAL_SYNC_STATUSES
} = require('../constants/fiscalPermissions');
const { onlyDigits, isValidCnpj } = require('../../../utils/cpfCnpj');

const FISCAL_DOCUMENT_SOURCES = ['sefaz_distribution', 'manual_upload', 'batch_import'];
const FISCAL_MANIFESTATION_STATUSES = [
  'not_required',
  'pending',
  'ciencia_operacao',
  'confirmacao_operacao',
  'desconhecimento_operacao',
  'operacao_nao_realizada'
];

function digitsOnly(value) {
  return onlyDigits(value);
}

function parseOptionalInteger(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new ValidationError(`${fieldName} invalido.`);
  }
  return normalized;
}

function parseOptionalBoolean(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'sim', 's'].includes(normalized)) return true;
  if (['false', '0', 'nao', 'não', 'n'].includes(normalized)) return false;
  throw new ValidationError('Valor booleano invalido.');
}

function parseEnum(value, fieldName, allowed, { required = false, fallback = null } = {}) {
  const normalized = sanitizeString(value, fieldName, { required, max: 60 }).toLowerCase();
  if (!normalized) return fallback;
  if (!allowed.includes(normalized)) {
    throw new ValidationError(`${fieldName} invalido.`);
  }
  return normalized;
}

function parseUf(value, { required = false } = {}) {
  const uf = sanitizeString(value, 'UF', {
    required,
    max: 2,
    pattern: /^[A-Za-z]{2}$/
  }).toUpperCase();
  return uf || null;
}

function parseCnpj(value, { required = false } = {}) {
  const normalized = digitsOnly(value);
  if (!normalized) {
    if (required) throw new ValidationError('CNPJ e obrigatorio.');
    return null;
  }
  if (!isValidCnpj(normalized)) {
    throw new ValidationError('CNPJ invalido.');
  }
  return normalized;
}

function parseDateOnly(value, fieldName) {
  const normalized = sanitizeString(value, fieldName, { max: 20 });
  if (!normalized) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new ValidationError(`${fieldName} deve estar no formato AAAA-MM-DD.`);
  }
  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`${fieldName} invalida.`);
  }
  return date;
}

function parseDateOnlyString(value, fieldName) {
  const parsed = parseDateOnly(value, fieldName);
  return parsed ? parsed.toISOString().slice(0, 10) : null;
}

function parseOptionalDecimal(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = Number(String(value).replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new ValidationError(`${fieldName} invalido.`);
  }
  return normalized;
}

function parseOptionalSecret(value, fieldName, max = 500) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value);
  if (normalized.length > max) {
    throw new ValidationError(`${fieldName} excede o tamanho permitido.`);
  }
  return normalized;
}

function validateFiscalCompanyCreateBody(body = {}) {
  ensureAllowedKeys(body, [
    'empresa_id',
    'razao_social',
    'nome_fantasia',
    'cnpj',
    'uf',
    'inscricao_estadual',
    'ambiente_sefaz',
    'ativo',
    'modulo_fiscal_habilitado',
    'observacoes'
  ], 'Empresa fiscal');

  return {
    empresa_id: parseOptionalInteger(body.empresa_id, 'Empresa do grupo'),
    razao_social: sanitizeString(body.razao_social, 'Razao social', { required: true, max: 180 }),
    nome_fantasia: sanitizeString(body.nome_fantasia, 'Nome fantasia', { max: 180 }) || null,
    cnpj: parseCnpj(body.cnpj, { required: true }),
    uf: parseUf(body.uf, { required: true }),
    inscricao_estadual: sanitizeString(body.inscricao_estadual, 'Inscricao estadual', { max: 40 }) || null,
    ambiente_sefaz: parseEnum(body.ambiente_sefaz, 'Ambiente SEFAZ', FISCAL_AMBIENTES_SEFAZ, { fallback: 'homologacao' }),
    ativo: parseOptionalBoolean(body.ativo),
    modulo_fiscal_habilitado: parseOptionalBoolean(body.modulo_fiscal_habilitado),
    observacoes: sanitizeString(body.observacoes, 'Observacoes', { max: 2000 }) || null
  };
}

function validateFiscalCompanyUpdateBody(body = {}) {
  ensureAllowedKeys(body, [
    'empresa_id', 'razao_social', 'nome_fantasia', 'cnpj', 'uf',
    'inscricao_estadual', 'ambiente_sefaz', 'ativo',
    'modulo_fiscal_habilitado', 'observacoes'
  ], 'Empresa fiscal');
  const parsed = {
    empresa_id: body.empresa_id === undefined ? undefined : parseOptionalInteger(body.empresa_id, 'Empresa do grupo'),
    razao_social: body.razao_social === undefined ? undefined : sanitizeString(body.razao_social, 'Razao social', { required: true, max: 180 }),
    nome_fantasia: body.nome_fantasia === undefined ? undefined : (sanitizeString(body.nome_fantasia, 'Nome fantasia', { max: 180 }) || null),
    cnpj: body.cnpj === undefined ? undefined : parseCnpj(body.cnpj, { required: true }),
    uf: body.uf === undefined ? undefined : parseUf(body.uf, { required: true }),
    inscricao_estadual: body.inscricao_estadual === undefined ? undefined : (sanitizeString(body.inscricao_estadual, 'Inscricao estadual', { max: 40 }) || null),
    ambiente_sefaz: body.ambiente_sefaz === undefined ? undefined : parseEnum(body.ambiente_sefaz, 'Ambiente SEFAZ', FISCAL_AMBIENTES_SEFAZ),
    ativo: parseOptionalBoolean(body.ativo),
    modulo_fiscal_habilitado: parseOptionalBoolean(body.modulo_fiscal_habilitado),
    observacoes: body.observacoes === undefined ? undefined : (sanitizeString(body.observacoes, 'Observacoes', { max: 2000 }) || null)
  };
  const result = {};
  Object.keys(body).forEach((key) => {
    if (parsed[key] !== undefined) {
      result[key] = parsed[key];
    }
  });

  if (Object.keys(result).length === 0) {
    throw new ValidationError('Informe ao menos um campo para atualizar.');
  }

  return result;
}

function validateFiscalCompanyQuery(query = {}) {
  ensureAllowedKeys(query, ['q', 'ativo', 'limit', 'page'], 'Filtro de empresas fiscais');
  return {
    q: sanitizeString(query.q, 'Busca', { max: 120 }) || null,
    ativo: parseOptionalBoolean(query.ativo),
    limit: Math.min(parseOptionalInteger(query.limit || 50, 'Limite') || 50, 200),
    page: parseOptionalInteger(query.page || 1, 'Pagina') || 1
  };
}

function validateFiscalDocumentQuery(query = {}) {
  ensureAllowedKeys(query, [
    'company_id',
    'status',
    'document_type',
    'source',
    'manifestation_status',
    'issuer_cnpj',
    'emission_start',
    'emission_end',
    'min_value',
    'max_value',
    'has_xml',
    'has_pdf',
    'q',
    'limit',
    'page'
  ], 'Filtro de documentos fiscais');

  const result = {
    company_id: parseOptionalInteger(query.company_id, 'Empresa fiscal'),
    status: parseEnum(query.status, 'Status do documento', FISCAL_DOCUMENT_STATUSES, { fallback: null }),
    document_type: parseEnum(query.document_type, 'Tipo documental', FISCAL_DOCUMENT_TYPES, { fallback: null }),
    source: parseEnum(query.source, 'Origem do documento', FISCAL_DOCUMENT_SOURCES, { fallback: null }),
    manifestation_status: parseEnum(query.manifestation_status, 'Status da manifestacao', FISCAL_MANIFESTATION_STATUSES, { fallback: null }),
    issuer_cnpj: parseCnpj(query.issuer_cnpj),
    emission_start: parseDateOnlyString(query.emission_start, 'Emissao inicial'),
    emission_end: parseDateOnlyString(query.emission_end, 'Emissao final'),
    min_value: parseOptionalDecimal(query.min_value, 'Valor minimo'),
    max_value: parseOptionalDecimal(query.max_value, 'Valor maximo'),
    has_xml: parseOptionalBoolean(query.has_xml),
    has_pdf: parseOptionalBoolean(query.has_pdf),
    q: sanitizeString(query.q, 'Busca', { max: 120 }) || null,
    limit: Math.min(parseOptionalInteger(query.limit || 50, 'Limite') || 50, 200),
    page: parseOptionalInteger(query.page || 1, 'Pagina') || 1
  };

  if (result.emission_start && result.emission_end && result.emission_start > result.emission_end) {
    throw new ValidationError('Emissao inicial nao pode ser posterior a emissao final.');
  }

  if (result.min_value !== null && result.max_value !== null && result.min_value > result.max_value) {
    throw new ValidationError('Valor minimo nao pode ser maior que o valor maximo.');
  }

  return result;
}

function validateFiscalOperationalReportQuery(query = {}) {
  ensureAllowedKeys(query, [
    'company_id',
    'data_inicio',
    'data_fim',
    'status',
    'source'
  ], 'Filtro do relatorio fiscal operacional');

  const result = {
    company_id: parseOptionalInteger(query.company_id, 'Empresa fiscal'),
    data_inicio: parseDateOnlyString(query.data_inicio, 'Data inicial'),
    data_fim: parseDateOnlyString(query.data_fim, 'Data final'),
    status: parseEnum(query.status, 'Status do documento', FISCAL_DOCUMENT_STATUSES, { fallback: null }),
    source: parseEnum(query.source, 'Origem do documento', FISCAL_DOCUMENT_SOURCES, { fallback: null })
  };

  if (result.data_inicio && result.data_fim && result.data_inicio > result.data_fim) {
    throw new ValidationError('Data inicial nao pode ser posterior a data final.');
  }

  return result;
}

function validateFiscalSyncLogQuery(query = {}) {
  ensureAllowedKeys(query, ['company_id', 'status', 'document_type', 'limit', 'page'], 'Filtro de logs fiscais');
  return {
    company_id: parseOptionalInteger(query.company_id, 'Empresa fiscal'),
    status: parseEnum(query.status, 'Status do log', ['success', 'error', 'blocked', 'skipped'], { fallback: null }),
    document_type: parseEnum(query.document_type, 'Tipo documental', FISCAL_DOCUMENT_TYPES, { fallback: null }),
    limit: Math.min(parseOptionalInteger(query.limit || 50, 'Limite') || 50, 200),
    page: parseOptionalInteger(query.page || 1, 'Pagina') || 1
  };
}

function validateFiscalSyncLogRawUrlQuery(query = {}) {
  ensureAllowedKeys(query, ['type'], 'URL de payload bruto fiscal');
  return {
    type: parseEnum(query.type, 'Tipo de payload bruto', ['request', 'response'], { fallback: 'response' })
  };
}

function validateFiscalSyncStateQuery(query = {}) {
  ensureAllowedKeys(query, ['company_id', 'status', 'document_type', 'ambiente_sefaz', 'limit', 'page'], 'Filtro de estados de sincronizacao fiscal');
  return {
    company_id: parseOptionalInteger(query.company_id, 'Empresa fiscal'),
    status: parseEnum(query.status, 'Status de sincronizacao', FISCAL_SYNC_STATUSES, { fallback: null }),
    document_type: parseEnum(query.document_type, 'Tipo documental', FISCAL_DOCUMENT_TYPES, { fallback: null }),
    ambiente_sefaz: parseEnum(query.ambiente_sefaz, 'Ambiente SEFAZ', FISCAL_AMBIENTES_SEFAZ, { fallback: null }),
    limit: Math.min(parseOptionalInteger(query.limit || 50, 'Limite') || 50, 200),
    page: parseOptionalInteger(query.page || 1, 'Pagina') || 1
  };
}

function validateFiscalSyncRunBody(body = {}) {
  ensureAllowedKeys(body, ['company_id', 'document_type'], 'Sincronizacao fiscal manual');
  return {
    company_id: parseOptionalInteger(body.company_id, 'Empresa fiscal'),
    document_type: parseEnum(body.document_type, 'Tipo documental', FISCAL_DOCUMENT_TYPES, { fallback: 'nfe' })
  };
}

function validateFiscalDocumentLinkBody(body = {}) {
  ensureAllowedKeys(body, [
    'solicitacao_id',
    'solicitacao_compra_id',
    'pedido_id',
    'pedido_item_id',
    'financeiro_titulo_id',
    'obra_id',
    'centro_custo_id',
    'apropriacao_id',
    'plano_financeiro_id',
    'fornecedor_id',
    'matched_reason'
  ], 'Vinculo de documento fiscal');

  const result = {
    solicitacao_id: parseOptionalInteger(body.solicitacao_id, 'Solicitacao'),
    solicitacao_compra_id: parseOptionalInteger(body.solicitacao_compra_id, 'Solicitacao de compra'),
    pedido_id: parseOptionalInteger(body.pedido_id, 'Pedido'),
    pedido_item_id: parseOptionalInteger(body.pedido_item_id, 'Item do pedido'),
    financeiro_titulo_id: parseOptionalInteger(body.financeiro_titulo_id, 'Titulo financeiro'),
    obra_id: parseOptionalInteger(body.obra_id, 'Obra'),
    centro_custo_id: parseOptionalInteger(body.centro_custo_id, 'Centro de custo'),
    apropriacao_id: parseOptionalInteger(body.apropriacao_id, 'Apropriacao'),
    plano_financeiro_id: parseOptionalInteger(body.plano_financeiro_id, 'Plano financeiro'),
    fornecedor_id: parseOptionalInteger(body.fornecedor_id, 'Fornecedor'),
    matched_reason: sanitizeString(body.matched_reason, 'Motivo do vinculo', { max: 1000 }) || null
  };

  const hasTarget = Object.entries(result)
    .some(([key, value]) => key !== 'matched_reason' && value);

  if (!hasTarget) {
    throw new ValidationError('Informe ao menos um registro para vincular ao documento fiscal.');
  }

  return result;
}

function validateFiscalLinkSearchQuery(query = {}) {
  ensureAllowedKeys(query, ['type', 'q', 'limit'], 'Busca de vinculos fiscais');

  return {
    type: parseEnum(query.type, 'Tipo de busca', [
      'solicitacao',
      'solicitacao_compra',
      'pedido',
      'pedido_item',
      'titulo',
      'obra',
      'fornecedor',
      'centro_custo',
      'apropriacao',
      'plano_financeiro'
    ], { required: true }),
    q: sanitizeString(query.q, 'Busca', { max: 120 }) || null,
    limit: Math.min(parseOptionalInteger(query.limit || 20, 'Limite') || 20, 50)
  };
}

function validateFiscalDivergenceCreateBody(body = {}) {
  ensureAllowedKeys(body, [
    'fiscal_document_link_id',
    'divergence_type',
    'severity',
    'description',
    'expected_value',
    'actual_value'
  ], 'Divergencia fiscal');

  return {
    fiscal_document_link_id: parseOptionalInteger(body.fiscal_document_link_id, 'Vinculo fiscal'),
    divergence_type: parseEnum(body.divergence_type, 'Tipo de divergencia', [
      'supplier_mismatch',
      'value_mismatch',
      'quantity_mismatch',
      'item_mismatch',
      'missing_order',
      'missing_receipt',
      'duplicate_invoice',
      'cancelled_document',
      'unknown_cost_center',
      'unknown_financial_plan',
      'other'
    ], { fallback: 'other' }),
    severity: parseEnum(body.severity, 'Severidade', ['low', 'medium', 'high', 'critical'], { fallback: 'medium' }),
    description: sanitizeString(body.description, 'Descricao da divergencia', { required: true, max: 2000 }),
    expected_value: sanitizeString(body.expected_value, 'Valor esperado', { max: 255 }) || null,
    actual_value: sanitizeString(body.actual_value, 'Valor encontrado', { max: 255 }) || null
  };
}

function validateFiscalDivergenceUpdateBody(body = {}) {
  ensureAllowedKeys(body, ['status'], 'Atualizacao de divergencia fiscal');

  return {
    status: parseEnum(body.status, 'Status da divergencia', ['open', 'resolved', 'ignored'], { required: true })
  };
}

function validateFiscalDivergenceParams(params = {}) {
  ensureAllowedKeys(params, ['id', 'divergenceId'], 'Parametros da divergencia fiscal');

  const id = parseOptionalInteger(params.id, 'Documento fiscal');
  const divergenceId = parseOptionalInteger(params.divergenceId, 'Divergencia fiscal');
  if (!id || !divergenceId) {
    throw new ValidationError('Parametros da divergencia fiscal invalidos.');
  }

  return { id, divergenceId };
}

function validateFiscalDivergenceQuery(query = {}) {
  ensureAllowedKeys(query, [
    'company_id',
    'status',
    'severity',
    'divergence_type',
    'q',
    'limit',
    'page'
  ], 'Filtro de divergencias fiscais');

  return {
    company_id: parseOptionalInteger(query.company_id, 'Empresa fiscal'),
    status: parseEnum(query.status, 'Status da divergencia', ['open', 'resolved', 'ignored'], { fallback: null }),
    severity: parseEnum(query.severity, 'Severidade', ['low', 'medium', 'high', 'critical'], { fallback: null }),
    divergence_type: parseEnum(query.divergence_type, 'Tipo de divergencia', [
      'supplier_mismatch',
      'value_mismatch',
      'quantity_mismatch',
      'item_mismatch',
      'missing_order',
      'missing_receipt',
      'duplicate_invoice',
      'cancelled_document',
      'unknown_cost_center',
      'unknown_financial_plan',
      'other'
    ], { fallback: null }),
    q: sanitizeString(query.q, 'Busca', { max: 120 }) || null,
    limit: Math.min(parseOptionalInteger(query.limit || 50, 'Limite') || 50, 200),
    page: parseOptionalInteger(query.page || 1, 'Pagina') || 1
  };
}

function validateFiscalDocumentLinkParams(params = {}) {
  ensureAllowedKeys(params, ['id', 'linkId'], 'Parametros do vinculo fiscal');

  const id = parseOptionalInteger(params.id, 'Documento fiscal');
  const linkId = parseOptionalInteger(params.linkId, 'Vinculo fiscal');
  if (!id || !linkId) {
    throw new ValidationError('Parametros do vinculo fiscal invalidos.');
  }

  return { id, linkId };
}

function validateFiscalDocumentLinkUpdateBody(body = {}) {
  ensureAllowedKeys(body, ['status'], 'Atualizacao de vinculo fiscal');

  return {
    status: parseEnum(body.status, 'Status do vinculo fiscal', ['confirmed', 'rejected'], { required: true })
  };
}

function validateFiscalCertificateQuery(query = {}) {
  ensureAllowedKeys(query, ['company_id', 'is_active'], 'Filtro de certificados fiscais');
  return {
    company_id: parseOptionalInteger(query.company_id, 'Empresa fiscal'),
    is_active: parseOptionalBoolean(query.is_active)
  };
}

function validateFiscalCertificateCreateBody(body = {}) {
  ensureAllowedKeys(body, [
    'fiscal_company_id',
    'certificate_alias',
    'storage_type',
    'certificate_path',
    'certificate_s3_key',
    'password',
    'valid_from',
    'valid_until',
    'serial_number',
    'issuer',
    'subject',
    'is_active'
  ], 'Certificado fiscal');

  const storageType = parseEnum(
    body.storage_type,
    'Tipo de armazenamento',
    ['local_secure_path', 's3_private', 'secrets_manager'],
    { fallback: 'local_secure_path' }
  );

  return {
    fiscal_company_id: (() => {
      const id = parseOptionalInteger(body.fiscal_company_id, 'Empresa fiscal');
      if (!id) throw new ValidationError('Empresa fiscal e obrigatoria.');
      return id;
    })(),
    certificate_alias: sanitizeString(body.certificate_alias, 'Alias do certificado', { required: true, max: 120 }),
    storage_type: storageType,
    certificate_path: sanitizeString(body.certificate_path, 'Caminho do certificado', { max: 500 }) || null,
    certificate_s3_key: sanitizeString(body.certificate_s3_key, 'Chave S3 do certificado', { max: 500 }) || null,
    password: parseOptionalSecret(body.password, 'Senha do certificado'),
    valid_from: parseDateOnly(body.valid_from, 'Validade inicial'),
    valid_until: parseDateOnly(body.valid_until, 'Validade final'),
    serial_number: sanitizeString(body.serial_number, 'Numero de serie', { max: 160 }) || null,
    issuer: sanitizeString(body.issuer, 'Emissor', { max: 2000 }) || null,
    subject: sanitizeString(body.subject, 'Titular', { max: 2000 }) || null,
    is_active: parseOptionalBoolean(body.is_active)
  };
}

function parseAccountingReferenceMonth(value) {
  const month = parseOptionalInteger(value, 'Mes de referencia');
  if (!month || month < 1 || month > 12) {
    throw new ValidationError('Mes de referencia deve estar entre 1 e 12.');
  }
  return month;
}

function parseAccountingReferenceYear(value) {
  const year = parseOptionalInteger(value, 'Ano de referencia');
  if (!year || year < 2000 || year > 2100) {
    throw new ValidationError('Ano de referencia invalido.');
  }
  return year;
}

function validateFiscalAccountingBatchQuery(query = {}) {
  ensureAllowedKeys(query, [
    'company_id',
    'status',
    'reference_month',
    'reference_year',
    'limit',
    'page'
  ], 'Filtro de lotes contabeis fiscais');

  return {
    company_id: parseOptionalInteger(query.company_id, 'Empresa fiscal'),
    status: parseEnum(query.status, 'Status do lote contabil', ['draft', 'generated', 'sent', 'cancelled'], { fallback: null }),
    reference_month: query.reference_month ? parseAccountingReferenceMonth(query.reference_month) : null,
    reference_year: query.reference_year ? parseAccountingReferenceYear(query.reference_year) : null,
    limit: Math.min(parseOptionalInteger(query.limit || 50, 'Limite') || 50, 200),
    page: parseOptionalInteger(query.page || 1, 'Pagina') || 1
  };
}

function validateFiscalAccountingBatchCreateBody(body = {}) {
  ensureAllowedKeys(body, [
    'fiscal_company_id',
    'reference_month',
    'reference_year'
  ], 'Lote contabil fiscal');

  const fiscalCompanyId = parseOptionalInteger(body.fiscal_company_id, 'Empresa fiscal');
  if (!fiscalCompanyId) {
    throw new ValidationError('Empresa fiscal e obrigatoria para gerar o lote contabil.');
  }

  return {
    fiscal_company_id: fiscalCompanyId,
    reference_month: parseAccountingReferenceMonth(body.reference_month),
    reference_year: parseAccountingReferenceYear(body.reference_year)
  };
}

function validateFiscalSyncStateStatus(status) {
  return parseEnum(status, 'Status de sincronizacao', FISCAL_SYNC_STATUSES, { fallback: 'idle' });
}

module.exports = {
  digitsOnly,
  validateFiscalAccountingBatchCreateBody,
  validateFiscalAccountingBatchQuery,
  validateFiscalCertificateCreateBody,
  validateFiscalCertificateQuery,
  validateFiscalCompanyCreateBody,
  validateFiscalCompanyQuery,
  validateFiscalCompanyUpdateBody,
  validateFiscalDivergenceCreateBody,
  validateFiscalDivergenceParams,
  validateFiscalDivergenceQuery,
  validateFiscalDivergenceUpdateBody,
  validateFiscalDocumentLinkParams,
  validateFiscalDocumentLinkBody,
  validateFiscalDocumentLinkUpdateBody,
  validateFiscalLinkSearchQuery,
  validateFiscalDocumentQuery,
  validateFiscalOperationalReportQuery,
  validateFiscalSyncLogRawUrlQuery,
  validateFiscalSyncLogQuery,
  validateFiscalSyncRunBody,
  validateFiscalSyncStateQuery,
  validateFiscalSyncStateStatus
};
