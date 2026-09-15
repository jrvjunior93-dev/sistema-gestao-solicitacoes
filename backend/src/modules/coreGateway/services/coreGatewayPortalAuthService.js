'use strict';

const crypto = require('crypto');
const {
  ContratoComercial,
  ContratoComercialComprador,
  ContratoComercialUnidade,
  Empreendimento,
  Parceiro,
  UnidadeComercial,
  Sequelize
} = require('../../../models');

const { Op } = Sequelize;

const PORTAL_CONTRATO_STATUSES_AUTORIZADOS = Object.freeze([
  'ATIVO',
  'INADIMPLENTE',
  'QUITADO'
]);

function normalizeDocument(value) {
  return String(value || '').replace(/\D/g, '');
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function documentHash(value) {
  const normalized = normalizeDocument(value);
  return normalized ? sha256(normalized) : null;
}

function isValidSha256Hex(value) {
  return /^[a-f0-9]{64}$/i.test(String(value || '').trim());
}

function readPortalHeaders(req) {
  return {
    portalClientId: String(req.headers['x-fluxy-portal-client-id'] || '').trim(),
    documentHash: String(req.headers['x-fluxy-portal-client-document-hash'] || '').trim().toLowerCase()
  };
}

function sanitizeContrato(contrato, parceiroId) {
  const compradores = contrato.compradoresContrato || [];
  const comoTitular = Number(contrato.parceiro_id) === Number(parceiroId);
  const comoComprador = compradores.some((item) => Number(item.parceiro_id) === Number(parceiroId));

  const unidades = (contrato.unidadesContrato || []).map((item) => ({
    id: item.unidadeComercial?.id || item.unidade_comercial_id,
    codigo: item.unidadeComercial?.codigo || null,
    tipologia: item.unidadeComercial?.tipologia || null,
    principal: Boolean(item.principal),
    valor_atribuido: item.valor_atribuido
  }));
  if (!unidades.length && contrato.unidadeComercial) {
    unidades.push({
      id: contrato.unidadeComercial.id,
      codigo: contrato.unidadeComercial.codigo,
      tipologia: contrato.unidadeComercial.tipologia || null,
      principal: true,
      valor_atribuido: contrato.valor_total
    });
  }

  return {
    id: contrato.id,
    numero: contrato.numero,
    status: contrato.status,
    papel_cliente: comoTitular ? 'TITULAR' : 'COMPRADOR',
    comprador_vinculado: comoComprador,
    empreendimento: contrato.empreendimento ? {
      id: contrato.empreendimento.id,
      nome: contrato.empreendimento.nome,
      slug: null
    } : null,
    unidade: contrato.unidadeComercial ? {
      id: contrato.unidadeComercial.id,
      codigo: contrato.unidadeComercial.codigo,
      tipologia: contrato.unidadeComercial.tipologia || null
    } : null,
    unidades
  };
}

async function listarContratosAutorizados(parceiroId) {
  const contratos = await ContratoComercial.findAll({
    where: {
      status: { [Op.in]: PORTAL_CONTRATO_STATUSES_AUTORIZADOS },
      [Op.or]: [
        { parceiro_id: parceiroId },
        { '$compradoresContrato.parceiro_id$': parceiroId }
      ]
    },
    include: [
      {
        model: ContratoComercialComprador,
        as: 'compradoresContrato',
        attributes: ['id', 'parceiro_id', 'principal', 'ordem'],
        required: false
      },
      {
        model: Empreendimento,
        as: 'empreendimento',
        attributes: ['id', 'nome'],
        required: false
      },
      {
        model: UnidadeComercial,
        as: 'unidadeComercial',
        attributes: ['id', 'codigo', 'tipologia'],
        required: false
      },
      {
        model: ContratoComercialUnidade,
        as: 'unidadesContrato',
        separate: true,
        order: [['ordem', 'ASC']],
        include: [{
          model: UnidadeComercial,
          as: 'unidadeComercial',
          attributes: ['id', 'codigo', 'tipologia'],
          required: false
        }]
      }
    ],
    order: [
      ['data_contrato', 'DESC'],
      ['id', 'DESC']
    ]
  });

  const contratosUnicos = new Map();
  for (const contrato of contratos) {
    contratosUnicos.set(contrato.id, contrato);
  }

  return Array.from(contratosUnicos.values()).map((contrato) => sanitizeContrato(contrato, parceiroId));
}

async function autorizarClientePortal(req) {
  const { portalClientId, documentHash: receivedDocumentHash } = readPortalHeaders(req);
  const parceiroId = Number(portalClientId);

  if (!Number.isInteger(parceiroId) || parceiroId <= 0) {
    return {
      autorizado: false,
      motivo: 'PORTAL_CLIENT_ID_INVALIDO',
      mensagem: 'Cliente do portal nao informado ou invalido.'
    };
  }

  if (!isValidSha256Hex(receivedDocumentHash)) {
    return {
      autorizado: false,
      motivo: 'PORTAL_DOCUMENT_HASH_INVALIDO',
      mensagem: 'Hash do documento do cliente ausente ou invalido.'
    };
  }

  const parceiro = await Parceiro.findOne({
    where: {
      id: parceiroId,
      ativo: true,
      cliente: true
    },
    attributes: ['id', 'nome', 'cpf_cnpj', 'email', 'telefone', 'ativo', 'cliente']
  });

  if (!parceiro) {
    return {
      autorizado: false,
      motivo: 'PARCEIRO_CLIENTE_NAO_ENCONTRADO',
      mensagem: 'Cliente nao encontrado, inativo ou sem marcacao de cliente no Core.'
    };
  }

  const expectedDocumentHash = documentHash(parceiro.cpf_cnpj);
  if (!expectedDocumentHash || expectedDocumentHash !== receivedDocumentHash) {
    return {
      autorizado: false,
      motivo: 'DOCUMENTO_NAO_CONFERE',
      mensagem: 'Documento autenticado no Experience nao confere com o cliente oficial do Core.'
    };
  }

  const contratos = await listarContratosAutorizados(parceiro.id);
  if (contratos.length === 0) {
    return {
      autorizado: false,
      motivo: 'SEM_CONTRATO_ATIVO',
      mensagem: 'Cliente validado, mas sem contrato ativo, inadimplente ou quitado vinculado ao portal.',
      cliente: {
        id: parceiro.id,
        nome: parceiro.nome
      }
    };
  }

  return {
    autorizado: true,
    motivo: 'AUTORIZADO',
    cliente: {
      id: parceiro.id,
      nome: parceiro.nome,
      email_cadastrado: Boolean(parceiro.email),
      telefone_cadastrado: Boolean(parceiro.telefone)
    },
    contratos,
    total_contratos: contratos.length
  };
}

module.exports = {
  PORTAL_CONTRATO_STATUSES_AUTORIZADOS,
  autorizarClientePortal,
  documentHash,
  normalizeDocument,
  readPortalHeaders
};
