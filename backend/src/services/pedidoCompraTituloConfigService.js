const { Op } = require('sequelize');
const { CategoriaFinanceira, ConfiguracaoSistema } = require('../models');

const CHAVE_CATEGORIAS_TITULO_PEDIDO_COMPRA = 'COMPRAS_TITULOS_CATEGORIAS_FINANCEIRAS';

function idsPositivos(valores) {
  return [...new Set((Array.isArray(valores) ? valores : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))];
}

function parseConfig(valor) {
  if (!valor) return {};
  try {
    const data = typeof valor === 'string' ? JSON.parse(valor) : valor;
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function normalizarConfig(raw = {}) {
  const categoriaIds = idsPositivos(raw.categoria_ids);
  const categoriaPadraoId = Number(raw.categoria_padrao_id || 0);
  return {
    categoria_padrao_id: Number.isInteger(categoriaPadraoId) && categoriaPadraoId > 0
      ? categoriaPadraoId
      : null,
    categoria_ids: categoriaIds
  };
}

async function listarCategoriasPagarAtivas(transaction = null) {
  return CategoriaFinanceira.findAll({
    where: { ativo: true, tipo: { [Op.in]: ['PAGAR', 'AMBOS'] } },
    attributes: ['id', 'nome', 'tipo', 'considera_dre', 'dre_grupo', 'dre_subgrupo'],
    order: [['nome', 'ASC'], ['id', 'ASC']],
    transaction
  });
}

async function obterConfiguracaoCategoriasTituloPedido({ transaction = null } = {}) {
  const [item, categorias] = await Promise.all([
    ConfiguracaoSistema.findOne({
      where: { chave: CHAVE_CATEGORIAS_TITULO_PEDIDO_COMPRA },
      order: [['id', 'DESC']],
      transaction
    }),
    listarCategoriasPagarAtivas(transaction)
  ]);
  const config = normalizarConfig(parseConfig(item?.valor));
  const idsAtivos = new Set(categorias.map((categoria) => Number(categoria.id)));
  const categoriaIds = config.categoria_ids.filter((id) => idsAtivos.has(id));
  const categoriaPadraoId = idsAtivos.has(Number(config.categoria_padrao_id))
    ? Number(config.categoria_padrao_id)
    : null;

  // Configuracao ainda vazia preserva a operacao existente: todas as categorias PAGAR/AMBOS
  // ficam disponiveis, mas nenhuma e escolhida silenciosamente como padrao.
  const categoriasHabilitadas = categoriaIds.length
    ? categorias.filter((categoria) => categoriaIds.includes(Number(categoria.id)))
    : categorias;

  return {
    categoria_padrao_id: categoriaPadraoId,
    categoria_ids: categoriaIds,
    configurada: categoriaIds.length > 0,
    categorias: categoriasHabilitadas.map((categoria) => categoria.toJSON()),
    categorias_disponiveis: categorias.map((categoria) => categoria.toJSON())
  };
}

async function salvarConfiguracaoCategoriasTituloPedido(payload = {}, { transaction = null } = {}) {
  const config = normalizarConfig(payload);
  if (!config.categoria_ids.length) {
    const error = new Error('Habilite ao menos uma categoria financeira para os titulos de pedidos.');
    error.statusCode = 400;
    throw error;
  }
  if (!config.categoria_padrao_id || !config.categoria_ids.includes(config.categoria_padrao_id)) {
    const error = new Error('A categoria padrao precisa estar entre as categorias habilitadas.');
    error.statusCode = 400;
    throw error;
  }

  const categorias = await CategoriaFinanceira.findAll({
    where: {
      id: { [Op.in]: config.categoria_ids },
      ativo: true,
      tipo: { [Op.in]: ['PAGAR', 'AMBOS'] }
    },
    attributes: ['id'],
    transaction
  });
  if (categorias.length !== config.categoria_ids.length) {
    const error = new Error('Uma ou mais categorias estao inativas ou nao aceitam titulos a pagar.');
    error.statusCode = 400;
    throw error;
  }

  const valor = JSON.stringify(config);
  const existente = await ConfiguracaoSistema.findOne({
    where: { chave: CHAVE_CATEGORIAS_TITULO_PEDIDO_COMPRA },
    order: [['id', 'DESC']],
    transaction
  });
  if (existente) await existente.update({ valor }, { transaction });
  else await ConfiguracaoSistema.create({ chave: CHAVE_CATEGORIAS_TITULO_PEDIDO_COMPRA, valor }, { transaction });

  return obterConfiguracaoCategoriasTituloPedido({ transaction });
}

async function validarCategoriaTituloPedido(categoriaId, { transaction = null } = {}) {
  const id = Number(categoriaId || 0);
  const config = await obterConfiguracaoCategoriasTituloPedido({ transaction });
  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error('Selecione a categoria financeira dos titulos.');
    error.statusCode = 400;
    throw error;
  }
  if (config.configurada && !config.categoria_ids.includes(id)) {
    const error = new Error('A categoria financeira nao esta habilitada para titulos de pedidos de compra.');
    error.statusCode = 400;
    throw error;
  }
  return id;
}

module.exports = {
  CHAVE_CATEGORIAS_TITULO_PEDIDO_COMPRA,
  normalizarConfig,
  obterConfiguracaoCategoriasTituloPedido,
  salvarConfiguracaoCategoriasTituloPedido,
  validarCategoriaTituloPedido
};
