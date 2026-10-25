'use strict';

const { Op } = require('sequelize');
const {
  FiscalCompany,
  FiscalDfeEvent,
  FiscalDfeDocument,
  FiscalDocumentLink,
  FiscalDivergence
} = require('../../../models');
const { registrarEventoSeguranca } = require('../../../services/securityLogService');
const {
  buildFiscalObjectKey,
  getFiscalObjectSignedUrl,
  uploadFiscalObject
} = require('./fiscalS3Service');

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function buildDocumentWhere(query = {}) {
  const where = {};
  if (query.company_id) where.fiscal_company_id = query.company_id;
  if (query.status) where.document_status = query.status;
  if (query.document_type) where.document_type = query.document_type;
  if (query.source) where.source = query.source;
  if (query.manifestation_status) where.manifestation_status = query.manifestation_status;
  if (query.issuer_cnpj) where.issuer_cnpj = query.issuer_cnpj;
  if (query.min_value || query.max_value) {
    where.total_value = {};
    if (query.min_value) where.total_value[Op.gte] = query.min_value;
    if (query.max_value) where.total_value[Op.lte] = query.max_value;
  }
  if (query.emission_start || query.emission_end) {
    where.emission_date = {};
    if (query.emission_start) where.emission_date[Op.gte] = query.emission_start;
    if (query.emission_end) where.emission_date[Op.lte] = query.emission_end;
  }
  if (query.has_xml !== undefined) {
    where.xml_storage_key = query.has_xml ? { [Op.ne]: null } : null;
  }
  if (query.has_pdf !== undefined) {
    if (query.has_pdf) {
      where[Op.and] = [
        ...(where[Op.and] || []),
        {
          [Op.or]: [
            { pdf_storage_key: { [Op.ne]: null } },
            { danfe_storage_key: { [Op.ne]: null } }
          ]
        }
      ];
    } else {
      where.pdf_storage_key = null;
      where.danfe_storage_key = null;
    }
  }
  if (query.q) {
    where[Op.or] = [
      { access_key: { [Op.like]: `%${query.q}%` } },
      { issuer_name: { [Op.like]: `%${query.q}%` } },
      { issuer_cnpj: { [Op.like]: `%${String(query.q).replace(/\D/g, '') || query.q}%` } },
      { document_number: { [Op.like]: `%${query.q}%` } }
    ];
  }
  return where;
}

async function listarDocumentosFiscais(query = {}) {
  const limit = query.limit || 50;
  const page = query.page || 1;
  const offset = (page - 1) * limit;

  const result = await FiscalDfeDocument.findAndCountAll({
    where: buildDocumentWhere(query),
    // A lista entrega identificacao e disponibilidade dos arquivos. O XML
    // parseado e o resumo completo continuam apenas no endpoint de detalhe.
    attributes: { exclude: ['parsed_xml_json', 'raw_summary_json'] },
    include: [
      { model: FiscalCompany, as: 'company', attributes: ['id', 'razao_social', 'cnpj', 'uf'], required: false }
    ],
    order: [['emission_date', 'DESC'], ['id', 'DESC']],
    limit,
    offset,
    distinct: true
  });

  return {
    data: result.rows,
    pagination: {
      total: result.count,
      page,
      limit,
      pages: Math.ceil(result.count / limit)
    }
  };
}

async function obterDocumentoFiscal(id) {
  const document = await FiscalDfeDocument.findByPk(id, {
    include: [
      { model: FiscalCompany, as: 'company', attributes: ['id', 'razao_social', 'cnpj', 'uf'], required: false },
      { model: FiscalDocumentLink, as: 'links', required: false },
      { model: FiscalDivergence, as: 'divergences', required: false },
      { model: FiscalDfeEvent, as: 'events', required: false }
    ],
    order: [
      [{ model: FiscalDfeEvent, as: 'events' }, 'event_date', 'DESC'],
      [{ model: FiscalDfeEvent, as: 'events' }, 'id', 'DESC'],
      [{ model: FiscalDivergence, as: 'divergences' }, 'id', 'DESC'],
      [{ model: FiscalDocumentLink, as: 'links' }, 'id', 'DESC']
    ]
  });

  if (!document) {
    throw createHttpError('Documento fiscal nao encontrado.', 404);
  }

  return document;
}

async function gerarUrlArquivoFiscal(req, id, tipoArquivo) {
  const document = await FiscalDfeDocument.findByPk(id, {
    include: [
      { model: FiscalCompany, as: 'company', attributes: ['id', 'razao_social', 'cnpj', 'uf'], required: false }
    ]
  });

  if (!document) {
    throw createHttpError('Documento fiscal nao encontrado.', 404);
  }

  const tipo = String(tipoArquivo || '').toLowerCase();
  const keyMap = {
    xml: document.xml_storage_key,
    pdf: document.pdf_storage_key || document.danfe_storage_key,
    danfe: document.danfe_storage_key || document.pdf_storage_key
  };
  const storageKey = keyMap[tipo];

  if (!storageKey) {
    throw createHttpError(`Arquivo ${tipo.toUpperCase()} nao disponivel para este documento fiscal.`, 404);
  }

  const url = await getFiscalObjectSignedUrl(storageKey);

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'FISCAL_DOCUMENT_SIGNED_URL',
    recursoTipo: 'FISCAL_DFE_DOCUMENT',
    recursoId: document.id,
    status: 'SUCCESS',
    descricao: 'URL assinada de arquivo fiscal gerada',
    metadata: {
      fiscal_company_id: document.fiscal_company_id,
      document_type: document.document_type,
      file_type: tipo,
      access_key: document.access_key,
      storage_key: storageKey
    }
  });

  return {
    url,
    expires_in_seconds: Number(process.env.FISCAL_S3_PRESIGNED_EXPIRES_SECONDS || 300),
    file_type: tipo,
    document_id: document.id
  };
}

function getFiscalFileExtension(file) {
  const normalized = String(file?.originalname || '').toLowerCase();
  if (normalized.endsWith('.png')) return 'png';
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'jpg';
  return 'pdf';
}

async function importarArquivoDocumentoFiscal(req, id, { file, body = {} } = {}) {
  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    throw createHttpError('Informe um arquivo fiscal valido.', 400);
  }

  const document = await FiscalDfeDocument.findByPk(id, {
    include: [
      { model: FiscalCompany, as: 'company', attributes: ['id', 'razao_social', 'cnpj', 'uf'], required: false }
    ]
  });

  if (!document) {
    throw createHttpError('Documento fiscal nao encontrado.', 404);
  }

  const fileType = String(body.file_type || body.type || 'danfe').trim().toLowerCase();
  if (!['danfe', 'pdf'].includes(fileType)) {
    throw createHttpError('Tipo de arquivo fiscal invalido. Use danfe ou pdf.', 400);
  }

  const extension = getFiscalFileExtension(file);
  const folder = fileType === 'danfe' ? 'danfe' : 'pdf';
  const filename = `${folder}.${extension}`;
  const storage = await uploadFiscalObject({
    key: buildFiscalObjectKey({
      cnpj: document.company?.cnpj || document.recipient_cnpj || document.issuer_cnpj || 'sem-cnpj',
      documentType: document.document_type || 'nfe',
      accessKey: document.access_key,
      folder,
      filename,
      date: document.emission_date || new Date()
    }),
    body: file.buffer,
    contentType: file.mimetype,
    metadata: {
      fiscal_document_id: document.id,
      fiscal_company_id: document.fiscal_company_id,
      file_type: fileType,
      access_key: document.access_key
    }
  });

  const updatePayload = fileType === 'danfe'
    ? { danfe_storage_key: storage.key }
    : { pdf_storage_key: storage.key };

  await document.update(updatePayload);

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'FISCAL_DOCUMENT_FILE_IMPORTED',
    recursoTipo: 'FISCAL_DFE_DOCUMENT',
    recursoId: document.id,
    status: 'SUCCESS',
    descricao: 'Arquivo fiscal manual importado',
    metadata: {
      fiscal_company_id: document.fiscal_company_id,
      file_type: fileType,
      storage_key: storage.key,
      access_key: document.access_key
    }
  });

  const updated = await obterDocumentoFiscal(document.id);

  return {
    document: updated,
    file_type: fileType,
    storage
  };
}

async function ignorarDocumentoFiscal(req, id, { motivo = null } = {}) {
  const document = await FiscalDfeDocument.findByPk(id);

  if (!document) {
    throw createHttpError('Documento fiscal nao encontrado.', 404);
  }

  if (document.document_status === 'ignored') {
    return document;
  }

  await document.update({
    document_status: 'ignored'
  });

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'FISCAL_DOCUMENT_IGNORED',
    recursoTipo: 'FISCAL_DFE_DOCUMENT',
    recursoId: document.id,
    status: 'SUCCESS',
    descricao: 'Documento fiscal marcado como ignorado',
    metadata: {
      fiscal_company_id: document.fiscal_company_id,
      access_key: document.access_key,
      motivo: String(motivo || '').slice(0, 500)
    }
  });

  return obterDocumentoFiscal(document.id);
}

async function criarVinculoDocumentoFiscal(req, id, payload = {}) {
  if(payload.pedido_id || payload.pedido_item_id) throw createHttpError('Use a conferencia de NF-e e pedidos para vincular compras e suas parcelas.',409);
  const document = await FiscalDfeDocument.findByPk(id);

  if (!document) {
    throw createHttpError('Documento fiscal nao encontrado.', 404);
  }

  const targetFields = [
    'solicitacao_id',
    'solicitacao_compra_id',
    'pedido_id',
    'pedido_item_id',
    'financeiro_titulo_id',
    'obra_id',
    'centro_custo_id',
    'apropriacao_id',
    'plano_financeiro_id',
    'fornecedor_id'
  ];

  const linkPayload = targetFields.reduce((acc, field) => {
    acc[field] = payload[field] || null;
    return acc;
  }, {});

  const link = await FiscalDocumentLink.create({
    fiscal_dfe_document_id: document.id,
    ...linkPayload,
    link_status: 'manually_linked',
    confidence_score: 100,
    matched_by: 'manual',
    matched_reason: payload.matched_reason || null,
    created_by: req.user?.id || null,
    confirmed_by: req.user?.id || null,
    confirmed_at: new Date()
  });

  const shouldMarkLinkedToOrder = Boolean(payload.pedido_id || payload.pedido_item_id);
  if (shouldMarkLinkedToOrder && document.document_status !== 'cancelled') {
    await document.update({ document_status: 'linked_to_order' });
  }

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'FISCAL_DOCUMENT_MANUAL_LINKED',
    recursoTipo: 'FISCAL_DFE_DOCUMENT',
    recursoId: document.id,
    status: 'SUCCESS',
    descricao: 'Documento fiscal vinculado manualmente',
    metadata: {
      fiscal_company_id: document.fiscal_company_id,
      access_key: document.access_key,
      link_id: link.id,
      targets: linkPayload
    }
  });

  return obterDocumentoFiscal(document.id);
}

async function criarDivergenciaDocumentoFiscal(req, id, payload = {}) {
  const document = await FiscalDfeDocument.findByPk(id);

  if (!document) {
    throw createHttpError('Documento fiscal nao encontrado.', 404);
  }

  if (payload.fiscal_document_link_id) {
    const link = await FiscalDocumentLink.findOne({
      where: {
        id: payload.fiscal_document_link_id,
        fiscal_dfe_document_id: document.id
      }
    });

    if (!link) {
      throw createHttpError('Vinculo fiscal informado nao pertence a este documento.', 400);
    }
  }

  const divergence = await FiscalDivergence.create({
    fiscal_dfe_document_id: document.id,
    fiscal_document_link_id: payload.fiscal_document_link_id || null,
    divergence_type: payload.divergence_type || 'other',
    severity: payload.severity || 'medium',
    description: payload.description,
    expected_value: payload.expected_value || null,
    actual_value: payload.actual_value || null,
    status: 'open'
  });

  if (!['cancelled', 'ignored'].includes(document.document_status)) {
    await document.update({ document_status: 'with_divergence' });
  }

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'FISCAL_DIVERGENCE_CREATED',
    recursoTipo: 'FISCAL_DFE_DOCUMENT',
    recursoId: document.id,
    status: 'SUCCESS',
    descricao: 'Divergencia fiscal registrada manualmente',
    metadata: {
      fiscal_company_id: document.fiscal_company_id,
      access_key: document.access_key,
      divergence_id: divergence.id,
      divergence_type: divergence.divergence_type,
      severity: divergence.severity
    }
  });

  return obterDocumentoFiscal(document.id);
}

async function atualizarDivergenciaDocumentoFiscal(req, id, divergenceId, payload = {}) {
  const document = await FiscalDfeDocument.findByPk(id);

  if (!document) {
    throw createHttpError('Documento fiscal nao encontrado.', 404);
  }

  const divergence = await FiscalDivergence.findOne({
    where: {
      id: divergenceId,
      fiscal_dfe_document_id: document.id
    }
  });

  if (!divergence) {
    throw createHttpError('Divergencia fiscal nao encontrada.', 404);
  }

  const status = payload.status || 'open';
  await divergence.update({
    status,
    resolved_by: ['resolved', 'ignored'].includes(status) ? req.user?.id || null : null,
    resolved_at: ['resolved', 'ignored'].includes(status) ? new Date() : null
  });

  if (document.document_status === 'with_divergence') {
    const openCount = await FiscalDivergence.count({
      where: {
        fiscal_dfe_document_id: document.id,
        status: 'open'
      }
    });

    if (openCount === 0) {
      const linkCount = await FiscalDocumentLink.count({
        where: { fiscal_dfe_document_id: document.id }
      });
      await document.update({ document_status: linkCount > 0 ? 'linked_to_order' : 'pending_link' });
    }
  }

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'FISCAL_DIVERGENCE_UPDATED',
    recursoTipo: 'FISCAL_DFE_DOCUMENT',
    recursoId: document.id,
    status: 'SUCCESS',
    descricao: 'Divergencia fiscal atualizada',
    metadata: {
      fiscal_company_id: document.fiscal_company_id,
      access_key: document.access_key,
      divergence_id: divergence.id,
      divergence_status: status
    }
  });

  return obterDocumentoFiscal(document.id);
}

async function validarDocumentoFiscal(req, id) {
  const document = await FiscalDfeDocument.findByPk(id);

  if (!document) {
    throw createHttpError('Documento fiscal nao encontrado.', 404);
  }

  if (['ignored', 'cancelled'].includes(document.document_status)) {
    throw createHttpError('Documento fiscal ignorado ou cancelado nao pode ser validado.', 400);
  }

  const openDivergences = await FiscalDivergence.count({
    where: {
      fiscal_dfe_document_id: document.id,
      status: 'open'
    }
  });

  if (openDivergences > 0) {
    throw createHttpError('Resolva ou ignore as divergencias abertas antes de validar o documento fiscal.', 400);
  }

  await document.update({
    document_status: 'validated'
  });

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'FISCAL_DOCUMENT_VALIDATED',
    recursoTipo: 'FISCAL_DFE_DOCUMENT',
    recursoId: document.id,
    status: 'SUCCESS',
    descricao: 'Documento fiscal validado manualmente',
    metadata: {
      fiscal_company_id: document.fiscal_company_id,
      access_key: document.access_key
    }
  });

  return obterDocumentoFiscal(document.id);
}

module.exports = {
  atualizarDivergenciaDocumentoFiscal,
  criarDivergenciaDocumentoFiscal,
  criarVinculoDocumentoFiscal,
  gerarUrlArquivoFiscal,
  ignorarDocumentoFiscal,
  importarArquivoDocumentoFiscal,
  listarDocumentosFiscais,
  obterDocumentoFiscal,
  validarDocumentoFiscal
};
