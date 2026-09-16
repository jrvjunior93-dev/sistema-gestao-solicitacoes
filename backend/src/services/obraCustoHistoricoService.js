const crypto = require('crypto');
const { Op } = require('sequelize');
const {
  CategoriaFinanceira,
  EmpresaGrupo,
  Obra,
  ObraCustoHistorico,
  ObraCustoHistoricoImportacao,
  Parceiro,
  sequelize
} = require('../models');
const { getFinanceiroObraScopeIds } = require('./authorizationService');
const { excelSerialDateToDate, sheetToArrayRows } = require('../utils/excelWorkbook');

const MAX_IMPORT_ROWS = 5000;
const INSERT_BATCH_SIZE = 250;

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function asNumber(value) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundCurrency(value) {
  return Number(asNumber(value).toFixed(2));
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function normalizeKey(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, '');
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function sanitizeText(value, max = 255) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

function parseCurrency(value) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  if (typeof value === 'number') {
    return roundCurrency(value);
  }

  let text = String(value)
    .replace(/[R$\s]/gi, '')
    .replace(/\u00a0/g, '')
    .trim();

  if (!text) {
    return 0;
  }

  const negative = text.startsWith('-') || text.endsWith('-');
  text = text.replace(/-/g, '');

  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');

  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      text = text.replace(/\./g, '').replace(',', '.');
    } else {
      text = text.replace(/,/g, '');
    }
  } else if (lastComma >= 0) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else {
    text = text.replace(/,/g, '');
  }

  const parsed = Number(text);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return roundCurrency(negative ? -parsed : parsed);
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatDateOnly(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDateOnly(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDateOnly(value);
  }

  if (typeof value === 'number') {
    const parsed = excelSerialDateToDate(value);
    return parsed ? formatDateOnly(parsed) : null;
  }

  const text = String(value).trim();
  const brMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (brMatch) {
    const year = Number(brMatch[3].length === 2 ? `20${brMatch[3]}` : brMatch[3]);
    return `${year}-${pad(brMatch[2])}-${pad(brMatch[1])}`;
  }

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${pad(isoMatch[2])}-${pad(isoMatch[3])}`;
  }

  return null;
}

function hashObject(payload) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
}

async function readWorkbookRows(file) {
  if (!file?.buffer) {
    throw createHttpError(400, 'Arquivo da importacao e obrigatorio.');
  }

  const rows = await sheetToArrayRows(file.buffer, {
    filename: file.originalname,
    raw: true,
    defval: ''
  });
  if (!rows.length) {
    throw createHttpError(400, 'A planilha nao possui abas para importacao.');
  }

  return rows;
}

function findHeaderRow(rows) {
  for (let index = 0; index < rows.length; index += 1) {
    const normalized = rows[index].map(normalizeKey);
    if (normalized.includes('baixa') && normalized.includes('debito')) {
      return index;
    }
  }

  return -1;
}

function mapHeader(row = []) {
  const columns = {};
  row.forEach((header, index) => {
    const key = normalizeKey(header);
    if (!key) return;

    if (key === 'baixa' || key === 'databaixa' || key === 'datapagamento') columns.data_pagamento = index;
    if (key === 'vencto' || key === 'vencimento' || key === 'datavencimento') columns.data_vencimento = index;
    if (key.includes('clientefornecedor') || key === 'fornecedor' || key === 'credor' || key === 'parceiro') columns.parceiro_nome = index;
    if (key === 'tituloparcela' || key === 'titulo' || key === 'parcela') columns.titulo_parcela = index;
    if (key === 'documento' || key === 'numerodocumento') columns.documento = index;
    if (key === 'planofinanceiro' || key === 'categoriafinanceira' || key === 'categoria') columns.plano_financeiro = index;
    if (key === 'credito') columns.credito = index;
    if (key === 'debito') columns.debito = index;
    if (key === 'saldo') columns.saldo = index;
  });
  return columns;
}

function extractMetadata(rows, headerRowIndex) {
  const metadata = {};
  rows.slice(0, Math.max(headerRowIndex, 0)).forEach((row) => {
    const label = normalizeKey(row[0]);
    const value = sanitizeText(row[4] || row[1] || '', 255);
    if (!value) return;
    if (label === 'empresa') metadata.empresa = value;
    if (label === 'obra' || label === 'centrodecusto') metadata.obra = value;
  });
  return metadata;
}

function getCell(row, index) {
  if (index === undefined || index === null) return '';
  return row[index];
}

function splitCodeAndName(value) {
  const text = sanitizeText(value, 255) || '';
  const match = text.match(/^(\d+)\s*-\s*(.+)$/);
  if (match) {
    return {
      codigo: match[1],
      nome: match[2]
    };
  }
  return {
    codigo: null,
    nome: text
  };
}

function buildLookup(items, aliases = []) {
  const map = new Map();
  items.forEach((item) => {
    aliases.forEach((alias) => {
      const value = alias(item);
      const key = normalizeKey(value);
      if (key && !map.has(key)) {
        map.set(key, item);
      }
    });
  });
  return map;
}

async function assertObraAccess(req, obraId) {
  const scope = await getFinanceiroObraScopeIds(req.user);
  if (scope === null) {
    return;
  }

  const id = Number(obraId);
  if (!scope.includes(id)) {
    throw createHttpError(403, 'Acesso negado para esta obra');
  }
}

async function loadLookups() {
  const [obras, empresas, categorias, parceiros] = await Promise.all([
    Obra.findAll({ attributes: ['id', 'codigo', 'nome', 'empresa_grupo_id'] }),
    EmpresaGrupo.findAll({ attributes: ['id', 'codigo', 'nome', 'razao_social', 'cnpj'] }),
    CategoriaFinanceira.findAll({ attributes: ['id', 'nome', 'ativo'] }),
    Parceiro.findAll({ attributes: ['id', 'nome', 'cpf_cnpj', 'ativo'] })
  ]);

  return {
    obras,
    empresas,
    categorias,
    parceiros,
    obraLookup: buildLookup(obras, [
      (obra) => obra.codigo,
      (obra) => obra.nome,
      (obra) => obra.codigo ? `${obra.codigo} - ${obra.nome}` : obra.nome
    ]),
    empresaLookup: buildLookup(empresas, [
      (empresa) => empresa.codigo,
      (empresa) => empresa.nome,
      (empresa) => empresa.razao_social,
      (empresa) => empresa.cnpj,
      (empresa) => empresa.codigo ? `${empresa.codigo} - ${empresa.nome}` : empresa.nome
    ]),
    categoriaLookup: buildLookup(categorias, [
      (categoria) => categoria.nome
    ]),
    parceiroDocumentoLookup: buildLookup(parceiros, [
      (parceiro) => parceiro.cpf_cnpj
    ]),
    parceiroNomeLookup: buildLookup(parceiros, [
      (parceiro) => parceiro.nome
    ])
  };
}

function resolveCategoria(planoFinanceiro, categoriaLookup) {
  const raw = sanitizeText(planoFinanceiro, 255);
  if (!raw) return null;

  const direct = categoriaLookup.get(normalizeKey(raw));
  if (direct) return direct;

  const semCodigo = raw.replace(/^[\d.]+\s*-\s*/, '');
  return categoriaLookup.get(normalizeKey(semCodigo)) || null;
}

function resolveParceiro(nome, documento, lookups) {
  const doc = onlyDigits(documento);
  if (doc) {
    const byDoc = lookups.parceiroDocumentoLookup.get(normalizeKey(doc));
    if (byDoc) return byDoc;
  }

  const partnerName = sanitizeText(nome, 255);
  if (!partnerName) return null;
  return lookups.parceiroNomeLookup.get(normalizeKey(partnerName)) || null;
}

function buildLinhaPayload({ row, columns, defaults, metadata, lookups, rowNumber }) {
  const dataPagamento = parseDateOnly(getCell(row, columns.data_pagamento));
  const dataVencimento = parseDateOnly(getCell(row, columns.data_vencimento));
  const parceiroNome = sanitizeText(getCell(row, columns.parceiro_nome), 255);
  const tituloParcela = sanitizeText(getCell(row, columns.titulo_parcela), 120);
  const documento = sanitizeText(getCell(row, columns.documento), 160);
  const planoFinanceiro = sanitizeText(getCell(row, columns.plano_financeiro), 255);
  const credito = parseCurrency(getCell(row, columns.credito));
  const debito = parseCurrency(getCell(row, columns.debito));
  const saldo = parseCurrency(getCell(row, columns.saldo));
  const tipo = credito > 0 ? 'RECEBER' : 'PAGAR';
  const valor = roundCurrency(credito > 0 ? credito : debito > 0 ? debito : 0);
  const errors = [];

  const obra = defaults.obra
    || lookups.obraLookup.get(normalizeKey(metadata.obra))
    || lookups.obraLookup.get(normalizeKey(splitCodeAndName(metadata.obra).nome));
  const empresa = defaults.empresa
    || lookups.empresaLookup.get(normalizeKey(metadata.empresa))
    || (obra?.empresa_grupo_id ? lookups.empresas.find((item) => Number(item.id) === Number(obra.empresa_grupo_id)) : null);
  const categoria = defaults.categoria || resolveCategoria(planoFinanceiro, lookups.categoriaLookup);
  const parceiro = resolveParceiro(parceiroNome, null, lookups);

  if (!obra) errors.push('Obra nao identificada.');
  if (!dataPagamento) errors.push('Data de baixa/pagamento invalida.');
  if (valor <= 0) errors.push('Linha sem credito ou debito positivo para historico realizado.');

  const hashPayload = {
    obra_id: obra?.id || null,
    tipo,
    data_pagamento: dataPagamento,
    data_vencimento: dataVencimento,
    parceiro_nome: parceiroNome,
    titulo_parcela: tituloParcela,
    documento,
    plano_financeiro: planoFinanceiro,
    valor
  };

  return {
    row_number: rowNumber,
    status: errors.length ? 'ERRO' : 'VALIDA',
    erros: errors,
    obra_id: obra?.id || null,
    obra_nome: obra?.nome || metadata.obra || null,
    empresa_id: empresa?.id || null,
    empresa_nome: empresa?.nome || empresa?.razao_social || metadata.empresa || null,
    parceiro_id: parceiro?.id || null,
    parceiro_nome: parceiro?.nome || parceiroNome,
    parceiro_documento: parceiro?.cpf_cnpj || null,
    categoria_financeira_id: categoria?.id || null,
    categoria_nome: categoria?.nome || null,
    tipo,
    data_pagamento: dataPagamento,
    data_vencimento: dataVencimento,
    titulo_parcela: tituloParcela,
    documento,
    plano_financeiro: planoFinanceiro,
    descricao: parceiroNome,
    credito,
    debito,
    saldo,
    valor,
    hash_linha: hashObject(hashPayload)
  };
}

async function previewImportacaoCustosHistoricos(req, defaultsPayload = {}) {
  const rows = await readWorkbookRows(req.file);
  const headerRowIndex = findHeaderRow(rows);
  if (headerRowIndex < 0) {
    throw createHttpError(400, 'Nao foi possivel localizar o cabecalho da planilha.');
  }

  const header = rows[headerRowIndex] || [];
  const columns = mapHeader(header);
  if (columns.data_pagamento === undefined || columns.debito === undefined) {
    throw createHttpError(400, 'A planilha precisa conter as colunas Baixa e Debito.');
  }

  const lookups = await loadLookups();
  const defaults = {
    obra: defaultsPayload.obra_id
      ? lookups.obras.find((item) => Number(item.id) === Number(defaultsPayload.obra_id))
      : null,
    empresa: defaultsPayload.empresa_id
      ? lookups.empresas.find((item) => Number(item.id) === Number(defaultsPayload.empresa_id))
      : null,
    categoria: defaultsPayload.categoria_financeira_id
      ? lookups.categorias.find((item) => Number(item.id) === Number(defaultsPayload.categoria_financeira_id))
      : null
  };

  if (defaultsPayload.obra_id && !defaults.obra) {
    throw createHttpError(404, 'Obra informada nao encontrada.');
  }
  if (defaults.obra) {
    await assertObraAccess(req, defaults.obra.id);
  }

  const metadata = extractMetadata(rows, headerRowIndex);
  const dataRows = rows.slice(headerRowIndex + 1, headerRowIndex + 1 + MAX_IMPORT_ROWS);
  const linhas = dataRows
    .map((row, index) => buildLinhaPayload({
      row,
      columns,
      defaults,
      metadata,
      lookups,
      rowNumber: headerRowIndex + index + 2
    }))
    .filter((linha) => linha.valor > 0 || linha.status === 'ERRO');

  const existingHashes = linhas.length
    ? await ObraCustoHistorico.findAll({
        where: { hash_linha: { [Op.in]: linhas.map((linha) => linha.hash_linha) } },
        attributes: ['hash_linha']
      })
    : [];
  const duplicated = new Set(existingHashes.map((item) => item.hash_linha));

  const seenHashes = new Set();
  const linhasComStatus = linhas.map((linha) => {
    if (linha.status === 'VALIDA' && duplicated.has(linha.hash_linha)) {
      return {
        ...linha,
        status: 'DUPLICADA',
        erros: ['Linha ja importada anteriormente.']
      };
    }
    if (linha.status === 'VALIDA' && seenHashes.has(linha.hash_linha)) {
      return {
        ...linha,
        status: 'DUPLICADA',
        erros: ['Linha duplicada na propria planilha.']
      };
    }
    if (linha.status === 'VALIDA') {
      seenHashes.add(linha.hash_linha);
    }
    return linha;
  });

  const resumo = linhasComStatus.reduce((acc, linha) => {
    acc.total_lidos += 1;
    if (linha.status === 'VALIDA') {
      acc.importaveis += 1;
      acc.valor_total = roundCurrency(acc.valor_total + linha.valor);
      if (linha.tipo === 'RECEBER') {
        acc.credito_total = roundCurrency(acc.credito_total + linha.valor);
      } else {
        acc.debito_total = roundCurrency(acc.debito_total + linha.valor);
      }
    } else if (linha.status === 'DUPLICADA') {
      acc.duplicados += 1;
    } else {
      acc.erros += 1;
    }
    return acc;
  }, {
    total_lidos: 0,
    importaveis: 0,
    duplicados: 0,
    erros: 0,
    valor_total: 0,
    credito_total: 0,
    debito_total: 0
  });

  return {
    arquivo_nome: req.file.originalname,
    arquivo_hash: crypto.createHash('sha256').update(req.file.buffer).digest('hex'),
    preview_digest: hashObject(linhasComStatus),
    metadata,
    resumo,
    linhas: linhasComStatus
  };
}

function sanitizeLinhaConfirmacao(linha = {}) {
  return {
    obra_id: Number(linha.obra_id),
    empresa_id: linha.empresa_id ? Number(linha.empresa_id) : null,
    parceiro_id: linha.parceiro_id ? Number(linha.parceiro_id) : null,
    categoria_financeira_id: linha.categoria_financeira_id ? Number(linha.categoria_financeira_id) : null,
    tipo: String(linha.tipo || 'PAGAR').toUpperCase() === 'RECEBER' ? 'RECEBER' : 'PAGAR',
    data_pagamento: parseDateOnly(linha.data_pagamento),
    data_vencimento: parseDateOnly(linha.data_vencimento),
    parceiro_nome: sanitizeText(linha.parceiro_nome, 255),
    parceiro_documento: sanitizeText(linha.parceiro_documento || onlyDigits(linha.parceiro_documento), 32),
    titulo_parcela: sanitizeText(linha.titulo_parcela, 120),
    documento: sanitizeText(linha.documento, 160),
    plano_financeiro: sanitizeText(linha.plano_financeiro, 255),
    descricao: sanitizeText(linha.descricao || linha.parceiro_nome, 500),
    valor: roundCurrency(linha.valor),
    hash_linha: sanitizeText(linha.hash_linha, 64)
  };
}

async function confirmarImportacaoCustosHistoricos(req, payload = {}) {
  let dados = payload;
  if (req.file) {
    // O arquivo compacto substitui milhares de objetos JSON. A previa e
    // recalculada para garantir que o conteudo aprovado ainda corresponde
    // ao arquivo e aos cadastros no momento da confirmacao.
    const previaAtual = await previewImportacaoCustosHistoricos(req, payload);
    if (!payload.arquivo_hash || !payload.preview_digest
      || payload.arquivo_hash !== previaAtual.arquivo_hash
      || payload.preview_digest !== previaAtual.preview_digest) {
      throw createHttpError(409, 'A planilha ou sua pre-visualizacao mudou. Pre-visualize novamente antes de importar.');
    }
    dados = previaAtual;
  }

  const linhasValidas = Array.isArray(dados.linhas)
    ? dados.linhas.filter((linha) => String(linha.status || '').toUpperCase() === 'VALIDA')
    : [];

  if (!linhasValidas.length) {
    throw createHttpError(400, 'Nao ha linhas validas para importar.');
  }

  const sanitized = linhasValidas.map(sanitizeLinhaConfirmacao).filter((linha) =>
    linha.obra_id && linha.data_pagamento && linha.valor > 0 && linha.hash_linha
  );

  if (!sanitized.length) {
    throw createHttpError(400, 'Nao ha linhas validas para importar.');
  }

  const obraIds = [...new Set(sanitized.map((linha) => linha.obra_id))];
  await Promise.all(obraIds.map((obraId) => assertObraAccess(req, obraId)));

  const existingHashes = await ObraCustoHistorico.findAll({
    where: { hash_linha: { [Op.in]: sanitized.map((linha) => linha.hash_linha) } },
    attributes: ['hash_linha']
  });
  const duplicated = new Set(existingHashes.map((item) => item.hash_linha));
  const seenHashes = new Set();
  const rowsToCreate = sanitized.filter((linha) => {
    if (duplicated.has(linha.hash_linha) || seenHashes.has(linha.hash_linha)) {
      return false;
    }
    seenHashes.add(linha.hash_linha);
    return true;
  });

  return sequelize.transaction(async (transaction) => {
    const importacao = await ObraCustoHistoricoImportacao.create({
      arquivo_hash: sanitizeText(dados.arquivo_hash, 64) || hashObject({ linhas: sanitized }),
      arquivo_nome: sanitizeText(dados.arquivo_nome, 255) || 'importacao-historico.xlsx',
      status: 'CONFIRMADA',
      total_lidos: Array.isArray(dados.linhas) ? dados.linhas.length : sanitized.length,
      importados: rowsToCreate.length,
      duplicados: duplicated.size,
      erros: Array.isArray(dados.linhas)
        ? dados.linhas.filter((linha) => String(linha.status || '').toUpperCase() === 'ERRO').length
        : 0,
      valor_total: rowsToCreate.reduce((total, linha) => roundCurrency(total + linha.valor), 0),
      criado_por: req.user?.id || null
    }, { transaction });

    if (rowsToCreate.length) {
      for (let offset = 0; offset < rowsToCreate.length; offset += INSERT_BATCH_SIZE) {
        await ObraCustoHistorico.bulkCreate(rowsToCreate.slice(offset, offset + INSERT_BATCH_SIZE).map((linha) => ({
          ...linha,
          importacao_id: importacao.id,
          origem: 'HISTORICO_LEGADO',
          ativo: true,
          criado_por: req.user?.id || null
        })), { transaction });
      }
    }

    return {
      importacao,
      resumo: {
        importados: rowsToCreate.length,
        duplicados: duplicated.size,
        valor_total: Number(importacao.valor_total || 0)
      }
    };
  });
}

async function listarImportacoesCustosHistoricos(_req, filters = {}) {
  const limit = Math.min(Number(filters.limit || 20), 100);
  return ObraCustoHistoricoImportacao.findAll({
    order: [['createdAt', 'DESC']],
    limit
  });
}

module.exports = {
  confirmarImportacaoCustosHistoricos,
  listarImportacoesCustosHistoricos,
  previewImportacaoCustosHistoricos
};
