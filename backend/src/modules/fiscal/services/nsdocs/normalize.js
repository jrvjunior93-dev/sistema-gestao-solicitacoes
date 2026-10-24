'use strict';

const { gunzipSync, inflateSync } = require('node:zlib');
const { TextDecoder, isDeepStrictEqual } = require('node:util');
const { fail } = require('./config');
const { cnpj, providerDate } = require('./contract');

const MAX_BODY_BYTES = 1024 * 1024;

function decodeListBody(body, encoding) {
  if (!Buffer.isBuffer(body) || body.length > MAX_BODY_BYTES) fail('NSDOCS_RESPOSTA_LIMITE');
  let decoded;
  try {
    // Contrato v2: sem Content-Encoding, o corpo de sucesso ainda pode ser gzip.
    const selected = encoding || 'gzip';
    if (selected === 'gzip') decoded = gunzipSync(body, { maxOutputLength: MAX_BODY_BYTES });
    else if (selected === 'deflate') decoded = inflateSync(body, { maxOutputLength: MAX_BODY_BYTES });
    else if (selected === 'identity') decoded = body;
    else fail('NSDOCS_ENCODING_INVALIDO');
  } catch (error) {
    if (error.code === 'NSDOCS_ENCODING_INVALIDO') throw error;
    fail('NSDOCS_RESPOSTA_COMPACTADA_INVALIDA');
  }
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decoded));
    if (!Array.isArray(value) || value.length > 100) fail('NSDOCS_LISTA_INVALIDA');
    return value;
  } catch (error) {
    if (error.code === 'NSDOCS_LISTA_INVALIDA') throw error;
    fail('NSDOCS_JSON_INVALIDO');
  }
}

function text(value, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f]/.test(value)) {
    fail('NSDOCS_CAMPO_INVALIDO');
  }
  return value.trim();
}

function moneyCents(value) {
  const cleaned = text(value, 40).replace(/^R\$\s*/, '');
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{2}$/.test(cleaned)) fail('NSDOCS_VALOR_INVALIDO');
  const cents = Number(cleaned.replace(/[.,]/g, ''));
  if (!Number.isSafeInteger(cents)) fail('NSDOCS_VALOR_INVALIDO');
  return cents;
}

function identifier(value, max) {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) fail('NSDOCS_ID_INVALIDO');
    return String(value);
  }
  return text(value, max);
}

function normalizePage(rows, request, total) {
  if (!Array.isArray(rows) || rows.length > request.limit) fail('NSDOCS_LISTA_INVALIDA');
  if (!Number.isSafeInteger(total) || total < 0 || total < request.offset + rows.length) fail('NSDOCS_TOTAL_INVALIDO');
  if (!rows.length && total > request.offset) fail('NSDOCS_PAGINA_INCONSISTENTE');
  const documents = [], unsupported = [], keys = new Map(), ids = new Set();
  let duplicates = 0;
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) fail('NSDOCS_DOCUMENTO_INVALIDO');
    if (cnpj(row.empresa_cnpj) !== request.companyCnpj) fail('NSDOCS_EMPRESA_FORA_DO_ESCOPO');
    const providerId = identifier(row.id, 64);
    if (!/^\d+$/.test(providerId)) fail('NSDOCS_ID_INVALIDO');
    const model = text(row.modelo, 30);
    if (model !== 'NF-e') {
      unsupported.push({ provider_id: providerId, model, reason: 'MODELO_NAO_IMPLEMENTADO' });
      continue;
    }
    if (typeof row.chave_acesso !== 'string' || !/^\d{44}$/.test(row.chave_acesso)) fail('NSDOCS_CHAVE_INVALIDA');
    const issuerCnpj = cnpj(row.emitente_cnpj), recipientCnpj = cnpj(row.destinatario_cnpj);
    if (![issuerCnpj, recipientCnpj].includes(request.companyCnpj)) fail('NSDOCS_PARTICIPANTE_DIVERGENTE');
    const receivedDate = providerDate(row.data_recebimento);
    if (receivedDate < request.startDate || receivedDate > request.endDate) fail('NSDOCS_DATA_FORA_DO_PERIODO');
    if (row.status !== request.status) fail('NSDOCS_STATUS_DIVERGENTE');
    const document = {
      provider: 'nsdocs', api_version: 'v2', provider_id: providerId,
      company_cnpj: request.companyCnpj, model: 'nfe', access_key: row.chave_acesso,
      identity: `nsdocs:v2:${request.companyCnpj}:nfe:${row.chave_acesso}`,
      issuer_cnpj: issuerCnpj, issuer_name: text(row.emitente_nome),
      recipient_cnpj: recipientCnpj, recipient_name: text(row.destinatario_nome),
      number: identifier(row.numero, 30), issued_on: providerDate(row.data_emissao),
      received_on: receivedDate, total_cents: moneyCents(row.valor),
      fiscal_status: text(row.situacao, 80), provider_usage_status: row.status,
      validation_state: 'unverified_metadata', source_mode: 'fixture'
    };
    const previous = keys.get(document.identity);
    if (previous) {
      // Nao descartar mudancas fiscais como se fossem mera repeticao.
      if (!isDeepStrictEqual(previous, document)) fail('NSDOCS_DUPLICIDADE_CONFLITANTE');
      duplicates += 1;
    } else {
      if (ids.has(providerId)) fail('NSDOCS_ID_CONFLITANTE');
      ids.add(providerId);
      keys.set(document.identity, document);
      documents.push(document);
    }
  }
  const consumed = request.offset + rows.length;
  const more = consumed < total;
  // Nunca anunciar janela concluida no limite de 2000; exige particionar datas.
  const partitionRequired = consumed >= 2000 || (more && rows.length < request.limit);
  return {
    documents, unsupported, duplicates, total, raw_count: rows.length,
    next_offset: more && !partitionRequired ? consumed : null,
    partition_required: partitionRequired, window_complete: !more && !partitionRequired,
    persisted: false, real_calls: false
  };
}

module.exports = { MAX_BODY_BYTES, decodeListBody, moneyCents, normalizePage };
