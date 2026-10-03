const { QueryTypes } = require('sequelize');
const {
  Categoria,
  Insumo,
  InsumoAlias,
  InsumoCodigoSequencia,
  SolicitacaoCompraItemManual,
  SolicitacaoCompraLog,
  Unidade
} = require('../models');

const SEQUENCIA_CHAVE = 'INSUMO_CODIGO_PADRAO';

class CatalogacaoInsumoError extends Error {
  constructor(message, status = 400, code = 'CATALOGACAO_INSUMO_INVALIDA', details = null) {
    super(message);
    this.name = 'CatalogacaoInsumoError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function normalizarNomeInsumo(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function formatarCodigoInsumo(numero) {
  return `INS-${String(numero).padStart(6, '0')}`;
}

async function obterMaiorCodigoExistente(transaction) {
  const rows = await Insumo.sequelize.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(codigo, 5) AS UNSIGNED)), 0) AS maior
       FROM insumos
      WHERE codigo REGEXP '^INS-[0-9]+$'`,
    { type: QueryTypes.SELECT, transaction }
  );
  return Number(rows?.[0]?.maior || 0);
}

async function obterSequenciaTravada(transaction) {
  let sequencia = await InsumoCodigoSequencia.findOne({
    where: { chave: SEQUENCIA_CHAVE },
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  if (sequencia) return sequencia;

  const maior = await obterMaiorCodigoExistente(transaction);
  try {
    await InsumoCodigoSequencia.create({
      chave: SEQUENCIA_CHAVE,
      ultimo_numero: maior
    }, { transaction });
  } catch (error) {
    if (error?.name !== 'SequelizeUniqueConstraintError') throw error;
  }

  sequencia = await InsumoCodigoSequencia.findOne({
    where: { chave: SEQUENCIA_CHAVE },
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  if (!sequencia) {
    throw new CatalogacaoInsumoError(
      'Nao foi possivel reservar a sequencia do codigo do insumo.',
      409,
      'INSUMO_SEQUENCIA_INDISPONIVEL'
    );
  }

  if (Number(sequencia.ultimo_numero || 0) < maior) {
    sequencia.ultimo_numero = maior;
    await sequencia.save({ transaction });
  }
  return sequencia;
}

async function gerarCodigoInsumo(transaction) {
  const sequencia = await obterSequenciaTravada(transaction);

  for (let tentativa = 0; tentativa < 20; tentativa += 1) {
    const proximo = Number(sequencia.ultimo_numero || 0) + 1;
    const codigo = formatarCodigoInsumo(proximo);
    sequencia.ultimo_numero = proximo;
    await sequencia.save({ transaction });

    const existe = await Insumo.count({ where: { codigo }, transaction });
    if (!existe) return codigo;
  }

  throw new CatalogacaoInsumoError(
    'Nao foi possivel gerar um codigo unico para o insumo.',
    409,
    'INSUMO_CODIGO_CONFLITO'
  );
}

async function buscarInsumoExato(nomeNormalizado, transaction) {
  if (!nomeNormalizado) return null;

  const aliases = await InsumoAlias.findAll({
    where: { alias_normalizado: nomeNormalizado, ativo: true },
    attributes: ['insumo_id'],
    transaction
  });
  const aliasIds = aliases.map((entry) => Number(entry.insumo_id)).filter(Boolean);

  const insumos = await Insumo.findAll({
    where: { ativo: true },
    include: [
      { model: Unidade, as: 'unidade', attributes: ['id', 'nome', 'sigla'] },
      { model: Categoria, as: 'categoria', attributes: ['id', 'nome'] }
    ],
    transaction
  });

  return insumos.find((insumo) => (
    normalizarNomeInsumo(insumo.nome) === nomeNormalizado || aliasIds.includes(Number(insumo.id))
  )) || null;
}

async function carregarInsumoCompleto(id, transaction = null) {
  return Insumo.findByPk(id, {
    include: [
      { model: Unidade, as: 'unidade', attributes: ['id', 'nome', 'sigla'] },
      { model: Categoria, as: 'categoria', attributes: ['id', 'nome'] },
      { model: InsumoAlias, as: 'aliases', where: { ativo: true }, required: false }
    ],
    transaction
  });
}

async function validarCadastroNovo(payload, transaction) {
  const nome = String(payload.nome || '').replace(/\s+/g, ' ').trim();
  const descricao = String(payload.descricao || '').trim() || null;
  const unidadeId = Number(payload.unidade_id || 0) || null;
  const unidadeManual = String(payload.unidade_manual || '').trim() || null;
  const categoriaId = Number(payload.categoria_id || 0) || null;

  if (!nome) {
    throw new CatalogacaoInsumoError('Informe o nome oficial do insumo.');
  }
  if (!unidadeId && !unidadeManual) {
    throw new CatalogacaoInsumoError('Selecione uma unidade ou informe a unidade manual.');
  }

  if (unidadeId) {
    const unidade = await Unidade.findByPk(unidadeId, { transaction });
    if (!unidade) throw new CatalogacaoInsumoError('Unidade do insumo nao encontrada.');
  }
  if (categoriaId) {
    const categoria = await Categoria.findByPk(categoriaId, { transaction });
    if (!categoria) throw new CatalogacaoInsumoError('Categoria do insumo nao encontrada.');
  }

  return {
    nome,
    nomeNormalizado: normalizarNomeInsumo(nome),
    descricao,
    unidade_id: unidadeId,
    unidade_manual: unidadeId ? null : unidadeManual,
    categoria_id: categoriaId
  };
}

async function registrarAlias({ itemManual, insumoId, transaction, corrigindo = false }) {
  const alias = String(itemManual.nome_manual || '').replace(/\s+/g, ' ').trim();
  const aliasNormalizado = normalizarNomeInsumo(alias);
  if (!aliasNormalizado) return;

  const insumo = await Insumo.findByPk(insumoId, { attributes: ['id', 'nome'], transaction });
  if (!insumo || normalizarNomeInsumo(insumo.nome) === aliasNormalizado) return;

  const existente = await InsumoAlias.findOne({
    where: { alias_normalizado: aliasNormalizado },
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  if (existente) {
    if (Number(existente.insumo_id) === Number(insumoId)) {
      if (!existente.ativo) await existente.update({ ativo: true }, { transaction });
      return;
    }
    if (corrigindo && Number(existente.origem_item_manual_id) === Number(itemManual.id)) {
      await existente.update({ insumo_id: insumoId, ativo: true }, { transaction });
      return;
    }
    throw new CatalogacaoInsumoError(
      'A descricao original ja esta vinculada como alias de outro insumo. Selecione o insumo sugerido.',
      409,
      'INSUMO_ALIAS_CONFLITO',
      { insumo_id: existente.insumo_id }
    );
  }

  await InsumoAlias.create({
    insumo_id: insumoId,
    alias,
    alias_normalizado: aliasNormalizado,
    origem_item_manual_id: itemManual.id,
    ativo: true
  }, { transaction });
}

async function catalogarItemManual({
  solicitacaoCompraId,
  itemManualId,
  usuarioId,
  payload,
  transaction: externalTransaction = null
}) {
  const ownsTransaction = !externalTransaction;
  const transaction = externalTransaction || await SolicitacaoCompraItemManual.sequelize.transaction();

  try {
    const itemManual = await SolicitacaoCompraItemManual.findOne({
      where: { id: itemManualId, solicitacao_compra_id: solicitacaoCompraId },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!itemManual) {
      throw new CatalogacaoInsumoError('Item manual nao encontrado nesta solicitacao.', 404, 'ITEM_MANUAL_NAO_ENCONTRADO');
    }

    const acao = String(payload.acao || '').trim().toUpperCase();
    const corrigindo = Boolean(payload.corrigir_vinculo);
    const motivo = String(payload.motivo || '').replace(/\s+/g, ' ').trim();
    if (!['CRIAR_INSUMO', 'VINCULAR_EXISTENTE'].includes(acao)) {
      throw new CatalogacaoInsumoError('Selecione uma acao de catalogacao valida.');
    }

    if (itemManual.insumo_catalogado_id && !corrigindo) {
      const insumoAtual = await carregarInsumoCompleto(itemManual.insumo_catalogado_id, transaction);
      if (ownsTransaction) await transaction.commit();
      return { itemManual, insumo: insumoAtual, ja_catalogado: true };
    }

    const insumoAnteriorId = itemManual.insumo_catalogado_id || null;
    let insumo;

    if (acao === 'VINCULAR_EXISTENTE') {
      const insumoId = Number(payload.insumo_id || 0);
      if (!insumoId) throw new CatalogacaoInsumoError('Selecione o insumo existente.');
      insumo = await Insumo.findOne({ where: { id: insumoId, ativo: true }, transaction });
      if (!insumo) throw new CatalogacaoInsumoError('Insumo existente nao encontrado ou inativo.', 404, 'INSUMO_NAO_ENCONTRADO');
    } else {
      const cadastro = await validarCadastroNovo(payload, transaction);
      const candidato = await buscarInsumoExato(cadastro.nomeNormalizado, transaction);
      if (candidato && !payload.confirmar_novo_duplicado) {
        throw new CatalogacaoInsumoError(
          'Ja existe um insumo com o mesmo nome ou alias. Vincule o item ao cadastro existente.',
          409,
          'INSUMO_DUPLICADO_SUGERIDO',
          { insumo: candidato.toJSON() }
        );
      }

      insumo = await Insumo.create({
        nome: cadastro.nome,
        codigo: await gerarCodigoInsumo(transaction),
        descricao: cadastro.descricao,
        unidade_id: cadastro.unidade_id,
        unidade_manual: cadastro.unidade_manual,
        categoria_id: cadastro.categoria_id,
        ativo: true
      }, { transaction });
    }

    await registrarAlias({ itemManual, insumoId: insumo.id, transaction, corrigindo });
    await itemManual.update({
      insumo_catalogado_id: insumo.id,
      catalogado_por: usuarioId,
      catalogado_em: new Date(),
      catalogacao_tipo: acao === 'CRIAR_INSUMO' ? 'NOVO' : 'EXISTENTE'
    }, { transaction });

    await SolicitacaoCompraLog.create({
      solicitacao_compra_id: solicitacaoCompraId,
      usuario_id: usuarioId,
      tipo_acao: corrigindo ? 'ITEM_MANUAL_CATALOGACAO_CORRIGIDA' : 'ITEM_MANUAL_CATALOGADO',
      descricao: corrigindo
        ? `Catalogacao do item manual "${itemManual.nome_manual}" corrigida.`
        : `Item manual "${itemManual.nome_manual}" catalogado como ${insumo.codigo || `insumo ${insumo.id}`}.`,
      metadados: JSON.stringify({
        item_manual_id: itemManual.id,
        insumo_anterior_id: insumoAnteriorId,
        insumo_id: insumo.id,
        catalogacao_tipo: acao === 'CRIAR_INSUMO' ? 'NOVO' : 'EXISTENTE',
        motivo: motivo || null
      })
    }, { transaction });

    const insumoCompleto = await carregarInsumoCompleto(insumo.id, transaction);
    if (ownsTransaction) await transaction.commit();
    return { itemManual, insumo: insumoCompleto, ja_catalogado: false };
  } catch (error) {
    if (ownsTransaction && !transaction.finished) await transaction.rollback();
    throw error;
  }
}

module.exports = {
  CatalogacaoInsumoError,
  catalogarItemManual,
  formatarCodigoInsumo,
  gerarCodigoInsumo,
  normalizarNomeInsumo
};
