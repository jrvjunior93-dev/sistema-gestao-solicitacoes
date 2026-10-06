const { Op } = require('sequelize');
const { FornecedorCompra, Parceiro, sequelize } = require('../models');
const {
  atualizarParceiro,
  criarParceiro,
  normalizarCpfCnpj
} = require('./parceiroService');

function sanitizeText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function parseCategorias(raw) {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw.map((c) => String(c).trim()).filter(Boolean);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map((c) => String(c).trim()).filter(Boolean) : null;
    } catch {
      return raw.split(',').map((c) => c.trim()).filter(Boolean);
    }
  }
  return null;
}

function buildParceiroPayload(payload = {}, parceiroExistente = null) {
  const cpfCnpj = normalizarCpfCnpj(payload.cpf_cnpj || payload.cnpj);
  const nome = sanitizeText(payload.nome);
  const telefone = sanitizeText(payload.telefone || payload.whatsapp);

  if (!cpfCnpj) {
    throw new Error('Informe o CPF/CNPJ do fornecedor para manter o cadastro centralizado em Pessoas.');
  }

  if (!nome && !parceiroExistente) {
    throw new Error('Informe o nome do fornecedor.');
  }

  const base = {
    fornecedor: true,
    ativo: true
  };

  if (nome) base.nome = nome;
  if (telefone !== null || !parceiroExistente) base.telefone = telefone;
  if (payload.email !== undefined || !parceiroExistente) base.email = sanitizeText(payload.email);
  if (payload.cep !== undefined) base.cep = sanitizeText(payload.cep);
  if (payload.cidade !== undefined) base.municipio = sanitizeText(payload.cidade);
  if (payload.estado !== undefined) base.estado = sanitizeText(payload.estado)?.toUpperCase().slice(0, 2) || null;
  if (payload.categoria_ids !== undefined) base.categoria_ids = payload.categoria_ids;
  for (const campo of ['nome_fantasia', 'representante_nome', 'representante_cpf', 'representante_cargo']) {
    // Chamadores antigos que nao enviam estes campos nao apagam dados de Pessoas.
    if (payload[campo] !== undefined) base[campo] = sanitizeText(payload[campo]);
  }

  if (!parceiroExistente) {
    base.cpf_cnpj = cpfCnpj;
    base.cliente = false;
    base.corretor = false;
    base.testemunha = false;
    if (payload.tipo_pessoa) base.tipo_pessoa = payload.tipo_pessoa;
  }

  return { cpfCnpj, data: base };
}

async function sincronizarFornecedorCompraComParceiro(parceiro, payload = {}, options = {}) {
  const transaction = options.transaction;
  const documento = normalizarCpfCnpj(parceiro.cpf_cnpj || payload.cpf_cnpj || payload.cnpj);
  const categorias = parseCategorias(payload.categoria_insumos);
  const dadosFornecedor = {
    parceiro_id: parceiro.id,
    nome: String(parceiro.nome || payload.nome || '').trim(),
    cnpj: documento || null,
    email: parceiro.email || sanitizeText(payload.email),
    whatsapp: parceiro.telefone || sanitizeText(payload.whatsapp || payload.telefone),
    contato: sanitizeText(payload.contato),
    observacoes: sanitizeText(payload.observacoes),
    categoria_insumos: categorias,
    cidade: parceiro.municipio || sanitizeText(payload.cidade),
    estado: parceiro.estado || (sanitizeText(payload.estado)?.toUpperCase().slice(0, 2) || null),
    cep: parceiro.cep || sanitizeText(payload.cep),
    ativo: true
  };

  const where = {
    [Op.or]: [
      { parceiro_id: parceiro.id },
      ...(documento ? [{ cnpj: documento }] : [])
    ]
  };

  // Nao vincular dois IDs de fornecedores ao mesmo cadastro central na edicao.
  if (options.fornecedorExistente) {
    const duplicado = await FornecedorCompra.findOne({
      where: { ...where, id: { [Op.ne]: options.fornecedorExistente.id } }, transaction
    });
    if (duplicado) {
      throw new Error('Este CPF/CNPJ ja pertence a outro fornecedor de Compras. Edite o cadastro existente.');
    }
  }
  // Na edicao, inclusive de um avulso legado, manter o ID referenciado pelas cotacoes.
  let fornecedor = options.fornecedorExistente || await FornecedorCompra.findOne({ where, transaction });

  if (fornecedor) {
    await fornecedor.update(dadosFornecedor, { transaction });
  } else {
    fornecedor = await FornecedorCompra.create(dadosFornecedor, { transaction });
  }

  return fornecedor;
}

async function criarOuAtualizarFornecedorCentralizado(payload = {}, options = {}) {
  const transaction = options.transaction;
  const { cpfCnpj } = buildParceiroPayload(payload);
  let parceiro = await Parceiro.findOne({
    where: { cpf_cnpj: cpfCnpj },
    transaction
  });

  const { data } = buildParceiroPayload(payload, parceiro);

  if (parceiro) {
    parceiro = await atualizarParceiro(parceiro.id, data, { transaction });
  } else {
    parceiro = await criarParceiro(data, { transaction });
  }

  return sincronizarFornecedorCompraComParceiro(parceiro, payload, {
    transaction, fornecedorExistente: options.fornecedorExistente
  });
}

async function criarOuAtualizarFornecedorCentralizadoEmTransacao(payload = {}) {
  return sequelize.transaction((transaction) => (
    criarOuAtualizarFornecedorCentralizado(payload, { transaction })
  ));
}

module.exports = {
  criarOuAtualizarFornecedorCentralizado,
  criarOuAtualizarFornecedorCentralizadoEmTransacao,
  sincronizarFornecedorCompraComParceiro
};
