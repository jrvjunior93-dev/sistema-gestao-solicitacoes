'use strict';

const { Op } = require('sequelize');
const {
  FiscalDfeDocument,
  FiscalDocumentLink,
  FornecedorCompra,
  Obra,
  Parceiro,
  PedidoCompra,
  Solicitacao,
  TituloFinanceiro
} = require('../../../models');
const { registrarEventoSeguranca } = require('../../../services/securityLogService');
const { obterDocumentoFiscal } = require('./fiscalDocumentService');

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function moneyNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function valueRange(value, tolerance = 0.01) {
  const base = moneyNumber(value);
  return {
    [Op.between]: [
      Math.max(base - tolerance, 0),
      base + tolerance
    ]
  };
}

function dateWindow(dateValue, daysBefore = 120, daysAfter = 180) {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;

  const start = new Date(date);
  start.setDate(start.getDate() - daysBefore);
  const end = new Date(date);
  end.setDate(end.getDate() + daysAfter);

  return {
    [Op.between]: [start, end]
  };
}

function buildTargets(link) {
  return {
    solicitacao_id: link.solicitacao_id || null,
    solicitacao_compra_id: link.solicitacao_compra_id || null,
    pedido_id: link.pedido_id || null,
    pedido_item_id: link.pedido_item_id || null,
    financeiro_titulo_id: link.financeiro_titulo_id || null,
    obra_id: link.obra_id || null,
    centro_custo_id: link.centro_custo_id || null,
    apropriacao_id: link.apropriacao_id || null,
    plano_financeiro_id: link.plano_financeiro_id || null,
    fornecedor_id: link.fornecedor_id || null
  };
}

async function linkAlreadyExists(documentId, targets) {
  const clauses = Object.entries(targets)
    .filter(([, value]) => value)
    .map(([field, value]) => ({ [field]: value }));

  if (!clauses.length) return true;

  const existing = await FiscalDocumentLink.findOne({
    where: {
      fiscal_dfe_document_id: documentId,
      [Op.or]: clauses
    }
  });

  return Boolean(existing);
}

async function createSuggestion(document, suggestion, createdBy) {
  const targets = buildTargets(suggestion);
  if (await linkAlreadyExists(document.id, targets)) return null;

  return FiscalDocumentLink.create({
    fiscal_dfe_document_id: document.id,
    ...targets,
    link_status: 'suggested',
    confidence_score: suggestion.confidence_score,
    matched_by: 'automatic',
    matched_reason: suggestion.matched_reason,
    created_by: createdBy || null
  });
}

async function findSupplierSuggestions(document) {
  const cnpj = digitsOnly(document.issuer_cnpj);
  if (!cnpj) return { parceiro: null, fornecedorCompra: null, suggestions: [] };

  const parceiro = await Parceiro.findOne({
    where: {
      fornecedor: true,
      cpf_cnpj: { [Op.like]: `%${cnpj}%` }
    },
    attributes: ['id', 'nome', 'cpf_cnpj']
  });

  const fornecedorCompra = await FornecedorCompra.findOne({
    where: {
      ativo: true,
      [Op.or]: [
        { cnpj: { [Op.like]: `%${cnpj}%` } },
        ...(parceiro ? [{ parceiro_id: parceiro.id }] : [])
      ]
    },
    attributes: ['id', 'parceiro_id', 'nome', 'cnpj']
  });

  const suggestions = [];
  if (parceiro) {
    suggestions.push({
      fornecedor_id: parceiro.id,
      confidence_score: 92,
      matched_reason: `Fornecedor sugerido por CNPJ do emitente (${cnpj}).`
    });
  }

  return { parceiro, fornecedorCompra, suggestions };
}

async function findTitleSuggestions(document, parceiro) {
  if (!parceiro) return [];

  const where = {
    parceiro_id: parceiro.id,
    valor_original: valueRange(document.total_value)
  };

  const vencimentoWindow = dateWindow(document.emission_date);
  if (vencimentoWindow) {
    where.data_vencimento = vencimentoWindow;
  }

  const rows = await TituloFinanceiro.findAll({
    where,
    attributes: ['id', 'codigo', 'descricao', 'valor_original', 'data_vencimento', 'obra_id'],
    order: [['id', 'DESC']],
    limit: 3
  });

  return rows.map((row) => ({
    financeiro_titulo_id: row.id,
    obra_id: row.obra_id || null,
    fornecedor_id: parceiro.id,
    confidence_score: 88,
    matched_reason: `Titulo sugerido por fornecedor e valor total iguais (${row.codigo || `#${row.id}`}).`
  }));
}

async function findSolicitacaoSuggestions(document, parceiro) {
  if (!parceiro) return [];

  const rows = await Solicitacao.findAll({
    where: {
      parceiro_id: parceiro.id,
      valor: valueRange(document.total_value)
    },
    attributes: ['id', 'codigo', 'descricao', 'valor', 'obra_id'],
    order: [['id', 'DESC']],
    limit: 3
  });

  return rows.map((row) => ({
    solicitacao_id: row.id,
    obra_id: row.obra_id || null,
    fornecedor_id: parceiro.id,
    confidence_score: 76,
    matched_reason: `Solicitacao sugerida por fornecedor e valor iguais (${row.codigo || `#${row.id}`}).`
  }));
}

async function findPedidoSuggestions(document, fornecedorCompra, parceiro) {
  if (!fornecedorCompra) return [];

  const rows = await PedidoCompra.findAll({
    where: {
      fornecedor_compra_id: fornecedorCompra.id,
      valor_total: valueRange(document.total_value)
    },
    attributes: ['id', 'solicitacao_compra_id', 'obra_id', 'valor_total', 'status'],
    order: [['id', 'DESC']],
    limit: 3
  });

  return rows.map((row) => ({
    pedido_id: row.id,
    solicitacao_compra_id: row.solicitacao_compra_id,
    obra_id: row.obra_id || null,
    fornecedor_id: parceiro?.id || fornecedorCompra.parceiro_id || null,
    confidence_score: 90,
    matched_reason: `Pedido de compra sugerido por fornecedor de compra e valor total iguais (#${row.id}).`
  }));
}

async function findObraSuggestion(document, candidateSuggestions) {
  const obraId = candidateSuggestions.find((item) => item.obra_id)?.obra_id;
  if (!obraId) return [];

  const obra = await Obra.findByPk(obraId, {
    attributes: ['id', 'nome', 'codigo']
  });

  if (!obra) return [];

  return [{
    obra_id: obra.id,
    confidence_score: 65,
    matched_reason: `Obra sugerida a partir dos vinculos encontrados (${obra.codigo || obra.nome}).`
  }];
}

async function sugerirVinculosDocumentoFiscal(req, documentId) {
  const document = await FiscalDfeDocument.findByPk(documentId);

  if (!document) {
    throw createHttpError('Documento fiscal nao encontrado.', 404);
  }

  if (['ignored', 'cancelled'].includes(document.document_status)) {
    throw createHttpError('Documento fiscal ignorado ou cancelado nao recebe sugestoes automaticas.', 400);
  }

  const supplierResult = await findSupplierSuggestions(document);
  const candidates = [
    ...supplierResult.suggestions,
    ...(await findPedidoSuggestions(document, supplierResult.fornecedorCompra, supplierResult.parceiro)),
    ...(await findTitleSuggestions(document, supplierResult.parceiro)),
    ...(await findSolicitacaoSuggestions(document, supplierResult.parceiro))
  ];

  candidates.push(...(await findObraSuggestion(document, candidates)));

  const created = [];
  for (const suggestion of candidates.sort((a, b) => Number(b.confidence_score || 0) - Number(a.confidence_score || 0)).slice(0, 8)) {
    const link = await createSuggestion(document, suggestion, req.user?.id || null);
    if (link) created.push(link);
  }

  if (created.length && !['with_divergence', 'linked_to_order'].includes(document.document_status)) {
    await document.update({ document_status: 'pending_link' });
  }

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'FISCAL_MATCHING_SUGGESTED',
    recursoTipo: 'FISCAL_DFE_DOCUMENT',
    recursoId: document.id,
    status: 'SUCCESS',
    descricao: 'Sugestoes de vinculo fiscal geradas',
    metadata: {
      fiscal_company_id: document.fiscal_company_id,
      access_key: document.access_key,
      created_count: created.length
    }
  });

  return {
    document: await obterDocumentoFiscal(document.id),
    created_count: created.length
  };
}

async function atualizarSugestaoVinculoFiscal(req, documentId, linkId, payload = {}) {
  const document = await FiscalDfeDocument.findByPk(documentId);

  if (!document) {
    throw createHttpError('Documento fiscal nao encontrado.', 404);
  }

  const link = await FiscalDocumentLink.findOne({
    where: {
      id: linkId,
      fiscal_dfe_document_id: document.id
    }
  });

  if (!link) {
    throw createHttpError('Vinculo fiscal nao encontrado.', 404);
  }

  const status = payload.status;
  if(link.purchase_link_key) throw createHttpError('Use a conferencia de pedidos para revisar ou encerrar este vinculo.',409);
  if(status==='confirmed'&&(link.pedido_id||link.pedido_item_id)) throw createHttpError('Confirme pedidos e parcelas no painel NF-e e pedidos, preservando escopo e historico.',409);
  if (!['confirmed', 'rejected'].includes(status)) {
    throw createHttpError('Status do vinculo fiscal invalido.', 400);
  }

  await link.update({
    link_status: status,
    confirmed_by: status === 'confirmed' ? req.user?.id || null : null,
    confirmed_at: status === 'confirmed' ? new Date() : null
  });

  if (status === 'confirmed' && (link.pedido_id || link.pedido_item_id) && document.document_status !== 'cancelled') {
    await document.update({ document_status: 'linked_to_order' });
  }

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'FISCAL_LINK_SUGGESTION_UPDATED',
    recursoTipo: 'FISCAL_DFE_DOCUMENT',
    recursoId: document.id,
    status: 'SUCCESS',
    descricao: 'Sugestao de vinculo fiscal atualizada',
    metadata: {
      fiscal_company_id: document.fiscal_company_id,
      access_key: document.access_key,
      link_id: link.id,
      link_status: status
    }
  });

  return obterDocumentoFiscal(document.id);
}

module.exports = {
  atualizarSugestaoVinculoFiscal,
  sugerirVinculosDocumentoFiscal
};
