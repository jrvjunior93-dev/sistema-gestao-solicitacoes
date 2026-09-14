const crypto = require('crypto');
const { PDFParse } = require('pdf-parse');
const { Op } = require('sequelize');
const {
  ContaBancaria,
  PagamentoManualFilaItem,
  Parceiro,
  PaymentBeneficiary,
  Solicitacao,
  TituloFinanceiro,
  sequelize
} = require('../models');
const { uploadToS3 } = require('./s3');
const { registrarEventoSeguranca } = require('./securityLogService');

const MAX_TEXT_LENGTH = 120000;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const AUTO_MATCH_SCORE = 90;
const AUTO_MATCH_MARGIN = 20;

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function compact(value, max = 255) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max) || null;
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function comparableDigits(value) {
  return digits(value).replace(/^0+/, '') || '0';
}

function normalizedName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .toUpperCase();
}

function parseMoney(value) {
  const raw = String(value || '').replace(/R\$/gi, '').replace(/\s/g, '').trim();
  if (!raw) return null;
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw;
  const parsed = Number(normalized.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? Math.round((parsed + Number.EPSILON) * 100) / 100 : null;
}

function parseDate(value) {
  const match = String(value || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  const date = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : iso;
}

function capture(text, regex, group = 1, max = 255) {
  const value = text.match(regex)?.[group];
  return compact(value, max);
}

function extractSolReference(text, fileName = '') {
  const contentMatch = String(text || '').match(/\bSOL\s*[-:]?\s*(\d{1,12})\b/i);
  const fileMatch = String(fileName || '').match(/\bSOL\s*[-_ ]?\s*(\d{1,12})\b/i);
  const number = contentMatch?.[1] || fileMatch?.[1];
  return number ? `SOL-${Number(number)}` : null;
}

function extractNumericRepresentation(text) {
  const block = capture(
    text,
    /Representa(?:c|ç)[aã]o num[eé]rica do c[oó]digo de barras:\s*([\d.\s]+?)(?=\n\s*Institui)/i,
    1,
    180
  ) || capture(text, /C[oó]digo de barras:\s*([\d\s.]+?)(?=\n\s*Data do pagamento)/i, 1, 180);
  const value = digits(block);
  return value.length >= 40 && value.length <= 54 ? value : null;
}

function baseResult({ banco, tipo, text, fileName }) {
  return {
    parser_version: '1.0.0',
    banco,
    tipo,
    status_documento: 'CONFIRMADO',
    valor: null,
    data_pagamento: null,
    identificador_transacao: null,
    autenticacao: null,
    referencia_solicitacao: extractSolReference(text, fileName),
    linha_digitavel: null,
    pagador_nome: null,
    pagador_documento: null,
    favorecido_nome: null,
    favorecido_documento: null,
    conta_origem_agencia: null,
    conta_origem_numero: null,
    conta_destino_agencia: null,
    conta_destino_numero: null,
    texto_reconhecido: true
  };
}

function parseBancoBrasilPix(text, fileName) {
  const result = baseResult({ banco: 'BANCO_DO_BRASIL', tipo: 'PIX', text, fileName });
  result.identificador_transacao = capture(text, /^ID:\s*([^\n]+)/im, 1, 160);
  result.valor = parseMoney(capture(text, /^VALOR:\s*R?\$?\s*([^\n]+)/im));
  result.data_pagamento = parseDate(capture(text, /^DATA:\s*([^\n]+)/im));
  result.pagador_nome = capture(text, /^CLIENTE:\s*([^\n]+)/im);
  result.pagador_documento = capture(text, /^CNPJ DO PAGADOR:\s*([^\n]+)/im);
  result.favorecido_nome = capture(text, /^PAGO PARA:\s*([^\n]+)/im);
  result.favorecido_documento = capture(text, /^PAGO PARA:[\s\S]*?^CNPJ:\s*([^\n]+)/im);
  result.autenticacao = capture(text, /^AUTENTICACAO SISBB:\s*([^\n]+)/im, 1, 160);
  const source = text.match(/^AGENCIA:\s*([^\s]+)\s+CONTA:\s*([^\n]+)/im);
  result.conta_origem_agencia = compact(source?.[1], 40);
  result.conta_origem_numero = compact(source?.[2], 60);
  return result;
}

function parseCaixaPix(text, fileName) {
  const result = baseResult({ banco: 'CAIXA', tipo: 'PIX', text, fileName });
  result.identificador_transacao = capture(text, /ID da transa(?:c|ç)[aã]o:\s*([^\n]+)/i, 1, 160);
  result.status_documento = normalizedName(capture(text, /Situa(?:c|ç)[aã]o:\s*([^\n]+?)(?=\s{2,}|Data e Hora)/i)) || 'CONFIRMADO';
  result.valor = parseMoney(capture(text, /Valor Atualizado:\s*R?\$?\s*([^\n]+)/i));
  result.data_pagamento = parseDate(capture(text, /Data e Hora:\s*([^\n]+)/i));
  result.pagador_nome = capture(text, /Origem[\s\S]*?Nome:\s*([^\n]+)/i);
  result.pagador_documento = capture(text, /Origem[\s\S]*?CNPJ:\s*([^\n]+)/i);
  result.favorecido_nome = capture(text, /Destino[\s\S]*?Nome:\s*([^\n]+)/i);
  result.favorecido_documento = capture(text, /Destino[\s\S]*?(?:CPF|CNPJ):\s*([^\n]+)/i);
  result.autenticacao = capture(text, /C[oó]digo da opera(?:c|ç)[aã]o:\s*([^\n]+)/i, 1, 160);
  return result;
}

function parseCaixaBoleto(text, fileName) {
  const result = baseResult({ banco: 'CAIXA', tipo: 'BOLETO', text, fileName });
  result.linha_digitavel = extractNumericRepresentation(text);
  result.valor = parseMoney(capture(text, /Valor Pago \(R\$\):\s*([^\n]+)/i));
  result.data_pagamento = parseDate(capture(text, /Data de Efetiva(?:c|ç)[aã]o\s*\/\s*Agendamento:\s*([^\n]+)/i));
  result.pagador_nome = capture(text, /Pagador Final\s*\/\s*Efetivo[\s\S]*?Nome:\s*([^\n]+)/i);
  result.pagador_documento = capture(text, /Pagador Final\s*\/\s*Efetivo[\s\S]*?CPF\/CNPJ:\s*([^\n]+)/i);
  result.favorecido_nome = capture(text, /Benefici[aá]rio original\s*\/\s*Cedente[\s\S]*?Nome Fantasia:\s*([^\n]+)/i);
  result.favorecido_documento = capture(text, /Benefici[aá]rio original\s*\/\s*Cedente[\s\S]*?CPF\/CNPJ:\s*([^\n]+)/i);
  result.autenticacao = capture(text, /C[oó]digo da opera(?:c|ç)[aã]o:\s*([^\n]+)/i, 1, 160);
  const account = capture(text, /Conta de d[eé]bito:\s*([^\n]+)/i, 1, 120);
  const accountParts = String(account || '').split(/[|/]/).map((part) => part.trim()).filter(Boolean);
  result.conta_origem_agencia = accountParts.length >= 2 ? accountParts.at(-2) : null;
  result.conta_origem_numero = accountParts.at(-1) || null;
  return result;
}

function parseCaixaDarf(text, fileName) {
  const result = baseResult({ banco: 'CAIXA', tipo: 'DARF', text, fileName });
  result.linha_digitavel = extractNumericRepresentation(text);
  result.valor = parseMoney(capture(text, /Valor total:\s*([^\n]+)/i));
  result.data_pagamento = parseDate(capture(text, /Data do pagamento:\s*([^\n]+)/i));
  result.identificador_transacao = capture(text, /N[uú]mero do documento:\s*([^\n]+)/i, 1, 160);
  result.autenticacao = capture(text, /Autentica(?:c|ç)[aã]o:\s*([^\n]+)/i, 1, 160);
  result.pagador_nome = capture(text, /^Nome:\s*([^\n]+)/im);
  const account = capture(text, /Conta de d[eé]bito:\s*([^\n]+)/i, 1, 120);
  const accountParts = String(account || '').split('/').map((part) => part.trim()).filter(Boolean);
  result.conta_origem_agencia = accountParts.length >= 2 ? accountParts.at(-2) : null;
  result.conta_origem_numero = accountParts.at(-1) || null;
  return result;
}

function parseCaixaTev(text, fileName) {
  const result = baseResult({ banco: 'CAIXA', tipo: 'TEV', text, fileName });
  result.valor = parseMoney(capture(text, /^Valor:\s*R?\$?\s*([^\n]+)/im));
  result.data_pagamento = parseDate(capture(text, /Data de d[eé]bito:\s*([^\n]+)/i));
  result.identificador_transacao = capture(text, /C[oó]digo da opera(?:c|ç)[aã]o:\s*([^\n]+)/i, 1, 160);
  result.autenticacao = capture(text, /Chave de seguran(?:c|ç)a:\s*([^\n]+)/i, 1, 160);
  result.favorecido_nome = capture(text, /Nome destinat[aá]rio:\s*([^\n]+)/i);
  const source = capture(text, /Conta origem:\s*([^\n]+)/i, 1, 120);
  const destination = capture(text, /Conta destino:\s*([^\n]+)/i, 1, 120);
  const sourceParts = String(source || '').split('/').map((part) => part.trim()).filter(Boolean);
  const destinationParts = String(destination || '').split('/').map((part) => part.trim()).filter(Boolean);
  result.conta_origem_agencia = sourceParts.length >= 2 ? sourceParts.at(-2) : null;
  result.conta_origem_numero = sourceParts.at(-1) || null;
  result.conta_destino_agencia = destinationParts.length >= 2 ? destinationParts.at(-2) : null;
  result.conta_destino_numero = destinationParts.at(-1) || null;
  return result;
}

function parseSicrediPix(text, fileName) {
  const result = baseResult({ banco: 'SICREDI', tipo: 'PIX', text, fileName });
  result.valor = parseMoney(capture(text, /^Valor:\s*R?\$?\s*([^\n]+)/im));
  result.data_pagamento = parseDate(capture(text, /Realizado em:\s*([^\n]+)/i));
  result.identificador_transacao = capture(text, /ID da transa(?:c|ç)[aã]o:\s*([^\n]+)/i, 1, 160);
  result.autenticacao = capture(text, /Autentica(?:c|ç)[aã]o Eletr[oô]nica:\s*([^\n]+)/i, 1, 160);
  result.pagador_nome = capture(text, /Nome do pagador:\s*([^\n]+)/i);
  result.pagador_documento = capture(text, /CNPJ do pagador:\s*([^\n]+)/i);
  result.favorecido_nome = capture(text, /Nome do destinat[aá]rio:\s*([^\n]+)/i);
  result.favorecido_documento = capture(text, /CNPJ do destinat[aá]rio:\s*([^\n]+)/i);
  const source = capture(text, /Cooperativa e conta origem:\s*([^\n]+)/i, 1, 120);
  const sourceParts = String(source || '').split('/').map((part) => part.trim()).filter(Boolean);
  result.conta_origem_agencia = sourceParts[0] || null;
  result.conta_origem_numero = sourceParts[1] || null;
  return result;
}

function parseReceiptText(text, fileName = '') {
  const normalized = String(text || '').replace(/\r/g, '').slice(0, MAX_TEXT_LENGTH);
  if (/Comprovante de pagamento de DARF NUMERADO/i.test(normalized)) return parseCaixaDarf(normalized, fileName);
  if (/Comprovante de Pagamento de Boleto/i.test(normalized)) return parseCaixaBoleto(normalized, fileName);
  if (/\bTEV Enviada\b/i.test(normalized)) return parseCaixaTev(normalized, fileName);
  if (/Comprovante de Transa(?:c|ç)[aã]o Pix/i.test(normalized)) return parseCaixaPix(normalized, fileName);
  if (/SISBB[\s\S]*Comprovante Pix/i.test(normalized)) return parseBancoBrasilPix(normalized, fileName);
  if (/Comprovante de Pagamento Pix[\s\S]*Sicredi/i.test(normalized)) return parseSicrediPix(normalized, fileName);
  return {
    ...baseResult({ banco: 'NAO_IDENTIFICADO', tipo: 'NAO_IDENTIFICADO', text: normalized, fileName }),
    status_documento: 'REVISAR',
    texto_reconhecido: false
  };
}

async function extractPdfText(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText({ first: 20 });
    return String(result?.text || '').slice(0, MAX_TEXT_LENGTH);
  } finally {
    await parser.destroy();
  }
}

async function parsePdfFile(file) {
  const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const text = await extractPdfText(file.buffer);
  if (!text.trim()) throw createHttpError(422, `O PDF ${file.originalname} nao possui texto pesquisavel.`);
  const transactionIds = [...text.matchAll(/ID da transa(?:c|ç)[aã]o:\s*([^\n]+)/gi)].map((match) => compact(match[1], 160)).filter(Boolean);
  const operationIds = [...text.matchAll(/C[oó]digo da opera(?:c|ç)[aã]o:\s*([^\n]+)/gi)].map((match) => compact(match[1], 160)).filter(Boolean);
  if (new Set(transactionIds).size > 1 || new Set(operationIds).size > 1) {
    throw createHttpError(422, `O PDF ${file.originalname} parece conter mais de um pagamento. Separe um comprovante por arquivo.`);
  }
  return {
    arquivo_nome: String(file.originalname || 'comprovante.pdf').slice(0, 255),
    arquivo_hash: hash,
    dados: parseReceiptText(text, file.originalname)
  };
}

function roundCurrency(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function scoreCandidate(receipt, queueItem) {
  const title = queueItem.titulo || {};
  const beneficiary = title.paymentBeneficiary || title.parceiro || {};
  let score = 0;
  const reasons = [];
  const receiptBarcode = digits(receipt.linha_digitavel);
  const titleBarcodes = [title.linha_digitavel, title.codigo_barras].map(digits).filter(Boolean);
  if (receiptBarcode && titleBarcodes.includes(receiptBarcode)) {
    score += 120;
    reasons.push('Código do pagamento igual ao título');
  }

  const solCode = normalizedName(receipt.referencia_solicitacao).replace(/\s/g, '');
  const titleSolCode = normalizedName(title.solicitacao?.codigo).replace(/\s/g, '');
  if (solCode && titleSolCode && solCode === titleSolCode) {
    score += 100;
    reasons.push('Solicitação informada no comprovante');
  }

  const amount = roundCurrency(receipt.valor);
  const expectedValues = [queueItem.valor_previsto, title.valor_saldo, title.valor_original].map(roundCurrency);
  if (amount > 0 && expectedValues.includes(amount)) {
    score += 50;
    reasons.push('Valor igual');
  }

  const receiptDoc = digits(receipt.favorecido_documento);
  const titleDoc = digits(beneficiary.cpf_cnpj || title.parceiro?.cpf_cnpj);
  if (receiptDoc && titleDoc && receiptDoc === titleDoc) {
    score += 45;
    reasons.push('Documento do favorecido igual');
  } else if (receiptDoc.length >= 6 && titleDoc.includes(receiptDoc)) {
    score += 25;
    reasons.push('Trecho visível do documento confere');
  }

  const receiptName = normalizedName(receipt.favorecido_nome);
  const titleName = normalizedName(beneficiary.nome || title.parceiro?.nome);
  if (receiptName.length >= 6 && titleName.length >= 6 && (receiptName === titleName || receiptName.includes(titleName) || titleName.includes(receiptName))) {
    score += 25;
    reasons.push('Nome do favorecido confere');
  }

  if (receipt.data_pagamento && title.data_vencimento === receipt.data_pagamento) {
    score += 10;
    reasons.push('Data igual ao vencimento');
  }
  return { score, reasons };
}

async function findAccount(receipt, loadedAccounts = null) {
  if (!receipt.conta_origem_numero) return null;
  const accounts = loadedAccounts || await ContaBancaria.findAll({
      where: { ativo: true, empresa_id: { [Op.ne]: null } },
      attributes: ['id', 'nome', 'banco', 'agencia', 'conta', 'empresa_id']
    });
  const accountNumber = comparableDigits(receipt.conta_origem_numero);
  const agencyNumber = comparableDigits(receipt.conta_origem_agencia);
  const matches = accounts.filter((account) => {
    if (comparableDigits(account.conta) !== accountNumber) return false;
    if (!receipt.conta_origem_agencia) return true;
    return comparableDigits(account.agencia) === agencyNumber;
  });
  if (matches.length !== 1) return null;
  return matches[0].toJSON();
}

async function loadQueueRows() {
  return PagamentoManualFilaItem.findAll({
    where: { status: 'PENDENTE', comprovante_hash: null },
    include: [{
      model: TituloFinanceiro,
      as: 'titulo',
      required: true,
      attributes: [
        'id', 'codigo', 'descricao', 'numero_documento', 'valor_original', 'valor_saldo',
        'data_vencimento', 'linha_digitavel', 'codigo_barras', 'solicitacao_id'
      ],
      include: [
        { model: Parceiro, as: 'parceiro', attributes: ['id', 'nome', 'cpf_cnpj'] },
        { model: PaymentBeneficiary, as: 'paymentBeneficiary', attributes: ['id', 'nome', 'cpf_cnpj'] },
        { model: Solicitacao, as: 'solicitacao', attributes: ['id', 'codigo', 'descricao'] }
      ]
    }],
    order: [['selecionado_em', 'ASC'], ['id', 'ASC']],
    limit: 500
  });
}

function getQueueCandidates(receipt, rows) {
  return rows.map((row) => {
    const scored = scoreCandidate(receipt, row);
    return {
      fila_id: row.id,
      titulo_id: row.titulo.id,
      titulo_codigo: row.titulo.codigo,
      titulo_descricao: row.titulo.descricao,
      favorecido: row.titulo.paymentBeneficiary?.nome || row.titulo.parceiro?.nome || null,
      documento: row.titulo.paymentBeneficiary?.cpf_cnpj || row.titulo.parceiro?.cpf_cnpj || null,
      valor_previsto: Number(row.valor_previsto || 0),
      valor_saldo: Number(row.titulo.valor_saldo || 0),
      vencimento: row.titulo.data_vencimento,
      score: scored.score,
      motivos: scored.reasons
    };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.fila_id - b.fila_id).slice(0, 8);
}

async function buildPreview(parsed, queueRows, accounts) {
  const duplicate = await PagamentoManualFilaItem.findOne({
    where: { comprovante_hash: parsed.arquivo_hash },
    include: [{ model: TituloFinanceiro, as: 'titulo', attributes: ['id', 'codigo'] }]
  });
  const candidates = duplicate ? [] : getQueueCandidates(parsed.dados, queueRows);
  const top = candidates[0] || null;
  const next = candidates[1] || null;
  const auto = Boolean(top && top.score >= AUTO_MATCH_SCORE && (!next || top.score - next.score >= AUTO_MATCH_MARGIN));
  return {
    ...parsed,
    duplicado: duplicate ? {
      fila_id: duplicate.id,
      titulo_codigo: duplicate.titulo?.codigo || null
    } : null,
    conta_sugerida: duplicate ? null : await findAccount(parsed.dados, accounts),
    candidatos: candidates,
    fila_sugerida_id: auto ? top.fila_id : null,
    exige_revisao: !duplicate && !auto
  };
}

async function previewReceipts(files = []) {
  if (!Array.isArray(files) || files.length === 0) throw createHttpError(400, 'Selecione ao menos um comprovante PDF.');
  if (files.length > 10) throw createHttpError(400, 'Envie no maximo 10 comprovantes por operacao.');
  if (files.reduce((total, file) => total + Number(file?.size || file?.buffer?.length || 0), 0) > MAX_TOTAL_BYTES) {
    throw createHttpError(400, 'O conjunto de comprovantes excede o limite total de 50 MB.');
  }
  const parsedFiles = [];
  for (const file of files) parsedFiles.push(await parsePdfFile(file));
  const repeatedHashes = parsedFiles.map((item) => item.arquivo_hash).filter((hash, index, list) => list.indexOf(hash) !== index);
  if (repeatedHashes.length) throw createHttpError(409, 'O mesmo arquivo foi selecionado mais de uma vez.');
  const [queueRows, accounts] = await Promise.all([
    loadQueueRows(),
    ContaBancaria.findAll({
      where: { ativo: true, empresa_id: { [Op.ne]: null } },
      attributes: ['id', 'nome', 'banco', 'agencia', 'conta', 'empresa_id']
    })
  ]);
  const previews = [];
  for (const parsed of parsedFiles) previews.push(await buildPreview(parsed, queueRows, accounts));
  return {
    arquivos: previews,
    titulos_pendentes: queueRows.map((row) => ({
      fila_id: row.id,
      titulo_id: row.titulo.id,
      titulo_codigo: row.titulo.codigo,
      titulo_descricao: row.titulo.descricao,
      favorecido: row.titulo.paymentBeneficiary?.nome || row.titulo.parceiro?.nome || null,
      valor_previsto: Number(row.valor_previsto || 0),
      valor_saldo: Number(row.titulo.valor_saldo || 0),
      vencimento: row.titulo.data_vencimento
    }))
  };
}

function parseMappings(value) {
  let mappings;
  try {
    mappings = typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    throw createHttpError(400, 'Os vinculos dos comprovantes sao invalidos.');
  }
  if (!Array.isArray(mappings) || mappings.length === 0) throw createHttpError(400, 'Confirme ao menos um comprovante.');
  if (mappings.length > 10) throw createHttpError(400, 'Confirme no maximo 10 comprovantes por operacao.');
  return mappings.map((item) => ({
    arquivo_hash: String(item?.arquivo_hash || '').trim().toLowerCase(),
    fila_id: Number(item?.fila_id)
  }));
}

async function linkReceipts(req, files = [], rawMappings) {
  const mappings = parseMappings(rawMappings);
  if (!Array.isArray(files) || files.length === 0 || files.length > 10) throw createHttpError(400, 'Reenvie de 1 a 10 comprovantes PDF.');
  if (files.reduce((total, file) => total + Number(file?.size || file?.buffer?.length || 0), 0) > MAX_TOTAL_BYTES) {
    throw createHttpError(400, 'O conjunto de comprovantes excede o limite total de 50 MB.');
  }
  const parsedFiles = [];
  for (const file of files) parsedFiles.push({ file, ...(await parsePdfFile(file)) });
  const fileByHash = new Map(parsedFiles.map((item) => [item.arquivo_hash, item]));
  if (fileByHash.size !== parsedFiles.length) throw createHttpError(409, 'O mesmo arquivo foi enviado mais de uma vez.');
  if (mappings.some((mapping) => !/^[a-f0-9]{64}$/.test(mapping.arquivo_hash) || !Number.isInteger(mapping.fila_id) || mapping.fila_id <= 0)) {
    throw createHttpError(400, 'Um ou mais vinculos sao invalidos.');
  }
  if (mappings.some((mapping) => !fileByHash.has(mapping.arquivo_hash))) {
    throw createHttpError(400, 'Um comprovante da confirmacao nao corresponde aos arquivos enviados.');
  }
  if (new Set(mappings.map((item) => item.arquivo_hash)).size !== mappings.length) {
    throw createHttpError(409, 'Cada comprovante pode ser vinculado apenas uma vez nesta operacao.');
  }
  if (new Set(mappings.map((item) => item.fila_id)).size !== mappings.length) {
    throw createHttpError(409, 'Cada titulo pode receber apenas um comprovante nesta operacao.');
  }

  const validated = await sequelize.transaction(async (transaction) => {
    const queueRows = await PagamentoManualFilaItem.findAll({
      where: { id: { [Op.in]: mappings.map((item) => item.fila_id) } },
      include: [{ model: TituloFinanceiro, as: 'titulo', attributes: ['id', 'codigo', 'status', 'valor_saldo'] }],
      transaction,
      lock: transaction.LOCK.UPDATE,
      order: [['id', 'ASC']]
    });
    if (queueRows.length !== mappings.length) throw createHttpError(404, 'Um ou mais itens da fila nao foram encontrados.');
    for (const row of queueRows) {
      if (row.status !== 'PENDENTE') throw createHttpError(409, `O titulo ${row.titulo?.codigo || row.id} nao esta mais pendente na fila.`);
      if (row.comprovante_hash) throw createHttpError(409, `O titulo ${row.titulo?.codigo || row.id} ja possui comprovante vinculado.`);
    }
    const duplicates = await PagamentoManualFilaItem.findAll({
      where: { comprovante_hash: { [Op.in]: mappings.map((item) => item.arquivo_hash) } },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (duplicates.length) throw createHttpError(409, 'Um ou mais comprovantes ja foram vinculados anteriormente.');
    return queueRows.map((row) => ({ id: row.id, titulo_codigo: row.titulo?.codigo || null }));
  });

  const uploads = new Map();
  for (const mapping of mappings) {
    const parsed = fileByHash.get(mapping.arquivo_hash);
    const url = await uploadToS3(parsed.file, `financeiro/fila-pagamentos/${mapping.fila_id}/comprovantes`);
    uploads.set(mapping.fila_id, { parsed, url });
  }

  await sequelize.transaction(async (transaction) => {
    for (const mapping of [...mappings].sort((a, b) => a.fila_id - b.fila_id)) {
      const row = await PagamentoManualFilaItem.findByPk(mapping.fila_id, {
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!row || row.status !== 'PENDENTE' || row.comprovante_hash) {
        throw createHttpError(409, `O item ${mapping.fila_id} mudou enquanto os comprovantes eram processados. Atualize a fila.`);
      }
      const { parsed, url } = uploads.get(mapping.fila_id);
      const account = await findAccount(parsed.dados);
      await row.update({
        comprovante_nome: parsed.arquivo_nome,
        comprovante_url: url,
        comprovante_hash: parsed.arquivo_hash,
        comprovante_banco: parsed.dados.banco,
        comprovante_tipo: parsed.dados.tipo,
        comprovante_identificador: parsed.dados.identificador_transacao || parsed.dados.autenticacao || parsed.dados.linha_digitavel,
        comprovante_dados_json: parsed.dados,
        comprovante_vinculado_por: req.user?.id || null,
        comprovante_vinculado_em: new Date(),
        valor_informado: parsed.dados.valor || row.valor_informado,
        data_baixa: parsed.dados.data_pagamento || row.data_baixa,
        conta_bancaria_id: account?.id || row.conta_bancaria_id
      }, { transaction });
    }
  });

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'MANUAL_PAYMENT_RECEIPTS_LINKED',
    recursoTipo: 'PAGAMENTO_MANUAL_FILA',
    recursoId: validated.map((item) => item.id).join(','),
    status: 'SUCCESS',
    descricao: 'Comprovantes PDF vinculados a titulos da fila de pagamentos',
    metadata: {
      quantidade: validated.length,
      fila_ids: validated.map((item) => item.id),
      titulos: validated.map((item) => item.titulo_codigo)
    }
  });

  return { quantidade: validated.length, itens: validated };
}

module.exports = {
  extractPdfText,
  linkReceipts,
  parsePdfFile,
  parseReceiptText,
  previewReceipts,
  scoreCandidate
};
