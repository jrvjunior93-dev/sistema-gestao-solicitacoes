const { Op } = require('sequelize');
const { Parceiro, ParceiroCategoria, FornecedorCompra } = require('../models');

const PIX_TIPOS_CHAVE = ['CPF', 'CNPJ', 'EMAIL', 'TELEFONE', 'ALEATORIA'];

function normalizarCpfCnpj(value) {
  return String(value || '').replace(/\D/g, '');
}

function hasRepeatedDigits(value) {
  return /^(\d)\1+$/.test(value);
}

function isValidCpf(value) {
  const cpf = normalizarCpfCnpj(value);
  if (cpf.length !== 11 || hasRepeatedDigits(cpf)) return false;

  let sum = 0;
  for (let index = 0; index < 9; index += 1) sum += Number(cpf[index]) * (10 - index);
  let digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== Number(cpf[9])) return false;

  sum = 0;
  for (let index = 0; index < 10; index += 1) sum += Number(cpf[index]) * (11 - index);
  digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  return digit === Number(cpf[10]);
}

function isValidCnpj(value) {
  const cnpj = normalizarCpfCnpj(value);
  if (cnpj.length !== 14 || hasRepeatedDigits(cnpj)) return false;

  const calc = (factors) => {
    const sum = factors.reduce((acc, factor, index) => acc + Number(cnpj[index]) * factor, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  return calc([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(cnpj[12])
    && calc([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(cnpj[13]);
}

function isValidCpfCnpj(value) {
  const documento = normalizarCpfCnpj(value);
  if (documento.length === 11) return isValidCpf(documento);
  if (documento.length === 14) return isValidCnpj(documento);
  return false;
}

function inferirTipoPessoa(cpfCnpj, tipoPessoaInformado) {
  const tipoInformado = String(tipoPessoaInformado || '')
    .trim()
    .toUpperCase();

  if (tipoInformado === 'F' || tipoInformado === 'J') {
    return tipoInformado;
  }

  if (cpfCnpj.length === 11) return 'F';
  if (cpfCnpj.length === 14) return 'J';
  return '';
}

function parseBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'sim', 'yes'].includes(String(value).trim().toLowerCase());
}

function sanitizeText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function sanitizePixTipo(value, fieldName) {
  const text = String(value || '').trim().toUpperCase();
  if (!text) return null;
  if (!PIX_TIPOS_CHAVE.includes(text)) {
    throw new Error(`${fieldName} invalido.`);
  }
  return text;
}

function sanitizePixChave(value) {
  const text = String(value || '').trim();
  return text ? text.slice(0, 255) : null;
}

function sanitizeDateOnly(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error('Informe uma data de nascimento valida.');
  }

  return text;
}

function sanitizePositiveInteger(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} invalido.`);
  }
  return parsed;
}

function normalizeParceiroPayload(payload = {}, { partial = false } = {}) {
  const cpfCnpj = normalizarCpfCnpj(payload.cpf_cnpj);
  const nome = String(payload.nome || '').trim();
  const telefone = String(payload.telefone || '').trim();
  let cliente = partial
    ? (payload.cliente !== undefined ? parseBoolean(payload.cliente, false) : undefined)
    : parseBoolean(payload.cliente, false);
  let fornecedor = partial
    ? (payload.fornecedor !== undefined ? parseBoolean(payload.fornecedor, false) : undefined)
    : parseBoolean(payload.fornecedor, false);
  let corretor = partial
    ? (payload.corretor !== undefined ? parseBoolean(payload.corretor, false) : undefined)
    : parseBoolean(payload.corretor, false);
  let testemunha = partial
    ? (payload.testemunha !== undefined ? parseBoolean(payload.testemunha, false) : undefined)
    : parseBoolean(payload.testemunha, false);

  if (!partial && !cliente && !fornecedor && !corretor && !testemunha) {
    cliente = true;
    fornecedor = true;
  }

  const tipoPessoa = inferirTipoPessoa(cpfCnpj, payload.tipo_pessoa);

  if (!partial) {
    if (!cpfCnpj || !isValidCpfCnpj(cpfCnpj)) {
      throw new Error('Informe um CPF/CNPJ valido.');
    }
    if (!nome) {
      throw new Error('Informe o nome do parceiro.');
    }
    if (!testemunha && !telefone) {
      throw new Error('Informe o telefone do parceiro.');
    }
    if (!tipoPessoa) {
      throw new Error('Nao foi possivel identificar o tipo de pessoa.');
    }
  }

  const data = {
    cpf_cnpj: cpfCnpj || undefined,
    nome: nome || undefined,
    telefone: telefone || undefined,
    email: partial
      ? (payload.email !== undefined ? sanitizeText(payload.email) : undefined)
      : sanitizeText(payload.email),
    rg: partial
      ? (payload.rg !== undefined ? sanitizeText(payload.rg) : undefined)
      : sanitizeText(payload.rg),
    data_nascimento: partial
      ? (payload.data_nascimento !== undefined ? sanitizeDateOnly(payload.data_nascimento) : undefined)
      : sanitizeDateOnly(payload.data_nascimento),
    nacionalidade: partial
      ? (payload.nacionalidade !== undefined ? sanitizeText(payload.nacionalidade) : undefined)
      : sanitizeText(payload.nacionalidade),
    profissao: partial
      ? (payload.profissao !== undefined ? sanitizeText(payload.profissao) : undefined)
      : sanitizeText(payload.profissao),
    estado_civil: partial
      ? (payload.estado_civil !== undefined ? sanitizeText(payload.estado_civil) : undefined)
      : sanitizeText(payload.estado_civil),
    endereco: partial
      ? (payload.endereco !== undefined ? sanitizeText(payload.endereco) : undefined)
      : sanitizeText(payload.endereco),
    numero: partial
      ? (payload.numero !== undefined ? sanitizeText(payload.numero) : undefined)
      : sanitizeText(payload.numero),
    complemento: partial
      ? (payload.complemento !== undefined ? sanitizeText(payload.complemento) : undefined)
      : sanitizeText(payload.complemento),
    bairro: partial
      ? (payload.bairro !== undefined ? sanitizeText(payload.bairro) : undefined)
      : sanitizeText(payload.bairro),
    cep: partial
      ? (payload.cep !== undefined ? sanitizeText(payload.cep) : undefined)
      : sanitizeText(payload.cep),
    municipio: partial
      ? (payload.municipio !== undefined ? sanitizeText(payload.municipio) : undefined)
      : sanitizeText(payload.municipio),
    estado: partial
      ? (payload.estado !== undefined ? (sanitizeText(payload.estado)?.toUpperCase() || null) : undefined)
      : (sanitizeText(payload.estado)?.toUpperCase() || null),
    tipo_pessoa: tipoPessoa || undefined,
    cliente,
    fornecedor,
    corretor,
    testemunha,
    conjuge_nome: partial
      ? (payload.conjuge_nome !== undefined ? sanitizeText(payload.conjuge_nome) : undefined)
      : sanitizeText(payload.conjuge_nome),
    conjuge_parceiro_id: partial
      ? (payload.conjuge_parceiro_id !== undefined ? sanitizePositiveInteger(payload.conjuge_parceiro_id, 'Conjuge') : undefined)
      : sanitizePositiveInteger(payload.conjuge_parceiro_id, 'Conjuge'),
    regime_bens: partial
      ? (payload.regime_bens !== undefined ? sanitizeText(payload.regime_bens) : undefined)
      : sanitizeText(payload.regime_bens),
    creci: partial
      ? (payload.creci !== undefined ? sanitizeText(payload.creci) : undefined)
      : sanitizeText(payload.creci),
    pix_chave_fixa_1_tipo: partial
      ? (payload.pix_chave_fixa_1_tipo !== undefined ? sanitizePixTipo(payload.pix_chave_fixa_1_tipo, 'Tipo da chave PIX fixa 1') : undefined)
      : sanitizePixTipo(payload.pix_chave_fixa_1_tipo, 'Tipo da chave PIX fixa 1'),
    pix_chave_fixa_1: partial
      ? (payload.pix_chave_fixa_1 !== undefined ? sanitizePixChave(payload.pix_chave_fixa_1) : undefined)
      : sanitizePixChave(payload.pix_chave_fixa_1),
    pix_chave_fixa_2_tipo: partial
      ? (payload.pix_chave_fixa_2_tipo !== undefined ? sanitizePixTipo(payload.pix_chave_fixa_2_tipo, 'Tipo da chave PIX fixa 2') : undefined)
      : sanitizePixTipo(payload.pix_chave_fixa_2_tipo, 'Tipo da chave PIX fixa 2'),
    pix_chave_fixa_2: partial
      ? (payload.pix_chave_fixa_2 !== undefined ? sanitizePixChave(payload.pix_chave_fixa_2) : undefined)
      : sanitizePixChave(payload.pix_chave_fixa_2),
    pix_chave_variavel_tipo: partial
      ? (payload.pix_chave_variavel_tipo !== undefined ? sanitizePixTipo(payload.pix_chave_variavel_tipo, 'Tipo da chave PIX variavel') : undefined)
      : sanitizePixTipo(payload.pix_chave_variavel_tipo, 'Tipo da chave PIX variavel'),
    pix_chave_variavel: partial
      ? (payload.pix_chave_variavel !== undefined ? sanitizePixChave(payload.pix_chave_variavel) : undefined)
      : sanitizePixChave(payload.pix_chave_variavel),
    cadastro_incompleto: partial
      ? (payload.cadastro_incompleto !== undefined ? parseBoolean(payload.cadastro_incompleto, false) : undefined)
      : false,
    ativo: partial
      ? (payload.ativo !== undefined ? parseBoolean(payload.ativo, true) : undefined)
      : (payload.ativo === undefined ? true : parseBoolean(payload.ativo, true))
  };

  if (!partial) {
    return data;
  }

  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  );
}

function parseCategoriaIds(value) {
  if (!Array.isArray(value)) return [];
  const ids = value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);
  return Array.from(new Set(ids));
}

async function validarCategorias(categoriaIds = [], options = {}) {
  if (!categoriaIds.length) return;
  const categorias = await ParceiroCategoria.findAll({
    where: {
      id: categoriaIds,
      ativo: true
    },
    transaction: options.transaction
  });

  if (categorias.length !== categoriaIds.length) {
    throw new Error('Categoria de parceiro invalida.');
  }
}

async function ensureParceiroUnico(cpfCnpj, parceiroId = null, options = {}) {
  const existente = await Parceiro.findOne({
    where: {
      cpf_cnpj: cpfCnpj,
      ...(parceiroId ? { id: { [Op.ne]: parceiroId } } : {})
    },
    transaction: options.transaction
  });

  if (existente) {
    throw new Error('Ja existe um parceiro com este CPF/CNPJ.');
  }
}

async function buscarParceiros({
  q = '',
  nome = '',
  cpf_cnpj = '',
  fornecedor,
  cliente,
  corretor,
  testemunha,
  categoria_id,
  incluir_categorias = '0',
  incluir_fornecedores_compra = '0',
  ativo = '1',
  limit = 10
} = {}) {
  const where = {};
  const filtros = [];
  const termoBusca = String(q || '').trim();
  const documento = normalizarCpfCnpj(cpf_cnpj || termoBusca);
  const termoNome = String(nome || termoBusca).trim();
  const categoriaId = Number(categoria_id) || null;

  if (String(ativo || '1').trim() !== '0') {
    where.ativo = true;
  }

  if (fornecedor !== undefined && fornecedor !== null && fornecedor !== '') {
    where.fornecedor = parseBoolean(fornecedor, true);
  }

  if (cliente !== undefined && cliente !== null && cliente !== '') {
    where.cliente = parseBoolean(cliente, true);
  }

  if (corretor !== undefined && corretor !== null && corretor !== '') {
    where.corretor = parseBoolean(corretor, true);
  }

  if (testemunha !== undefined && testemunha !== null && testemunha !== '') {
    where.testemunha = parseBoolean(testemunha, true);
  }

  if (termoNome || documento) {
    const or = [];

    if (termoNome) {
      or.push({
        nome: {
          [Op.like]: `%${termoNome}%`
        }
      });
    }

    if (documento) {
      or.push({
        cpf_cnpj: {
          [Op.like]: `%${documento}%`
        }
      });
    }

    filtros.push({ [Op.or]: or });
  }

  if (filtros.length > 0) {
    where[Op.and] = filtros;
  }

  const include = [];

  if (categoriaId) {
    include.push({
      model: ParceiroCategoria,
      as: 'categorias',
      through: { attributes: [] },
      where: { id: categoriaId, ativo: true },
      required: true
    });
  } else if (String(incluir_categorias || '0').trim() === '1') {
    include.push({
      model: ParceiroCategoria,
      as: 'categorias',
      through: { attributes: [] },
      where: { ativo: true },
      required: false
    });
  }

  if (String(incluir_fornecedores_compra || '0').trim() === '1') {
    include.push({
      model: FornecedorCompra,
      as: 'fornecedoresCompra',
      attributes: ['id', 'nome', 'cnpj'],
      where: { ativo: true },
      required: false
    });
  }

  const shouldReturnAll = String(limit || '').trim().toLowerCase() === 'all';
  const options = {
    where,
    include,
    order: [['nome', 'ASC']],
    distinct: true
  };

  if (!shouldReturnAll) {
    options.limit = Math.min(Math.max(Number(limit) || 10, 1), 200);
  }

  return Parceiro.findAll(options);
}

async function criarParceiro(payload, options = {}) {
  const categoriaIds = parseCategoriaIds(payload?.categoria_ids);
  const data = normalizeParceiroPayload(payload);
  await ensureParceiroUnico(data.cpf_cnpj, null, options);
  await validarCategorias(categoriaIds, options);
  const parceiro = await Parceiro.create(data, { transaction: options.transaction });

  if (categoriaIds.length) {
    await parceiro.setCategorias(categoriaIds, { transaction: options.transaction });
  }

  return parceiro;
}

async function atualizarParceiro(id, payload, options = {}) {
  const parceiro = await Parceiro.findByPk(id, { transaction: options.transaction });
  if (!parceiro) {
    throw new Error('Parceiro nao encontrado.');
  }

  const data = normalizeParceiroPayload(payload, { partial: true });
  const hasCategorias = Object.prototype.hasOwnProperty.call(payload || {}, 'categoria_ids');
  const categoriaIds = parseCategoriaIds(payload?.categoria_ids);

  if (data.cpf_cnpj) {
    if (!isValidCpfCnpj(data.cpf_cnpj)) {
      throw new Error('Informe um CPF/CNPJ valido.');
    }
    await ensureParceiroUnico(data.cpf_cnpj, parceiro.id, options);
    data.tipo_pessoa = inferirTipoPessoa(data.cpf_cnpj, payload.tipo_pessoa);
  }

  const clienteResolvido = data.cliente !== undefined ? data.cliente : parceiro.cliente;
  const fornecedorResolvido = data.fornecedor !== undefined ? data.fornecedor : parceiro.fornecedor;
  const corretorResolvido = data.corretor !== undefined ? data.corretor : parceiro.corretor;

  if (clienteResolvido === false && fornecedorResolvido === false && corretorResolvido === false) {
    data.cliente = true;
    data.fornecedor = true;
  }

  await parceiro.update(data, { transaction: options.transaction });

  if (hasCategorias) {
    await validarCategorias(categoriaIds, options);
    await parceiro.setCategorias(categoriaIds, { transaction: options.transaction });
  }

  return parceiro;
}

module.exports = {
  atualizarParceiro,
  buscarParceiros,
  criarParceiro,
  isValidCpfCnpj,
  normalizarCpfCnpj
};
