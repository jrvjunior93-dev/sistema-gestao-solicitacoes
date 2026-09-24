'use strict';

const { Op } = require('sequelize');
const {
  CentroCustoTipoSolicitacao,
  Obra,
  TipoSolicitacao,
  TipoSubContrato,
  sequelize
} = require('../models');
const { isObraCentroCusto } = require('../constants/centroCusto');
const { enrichTipoSolicitacao, normalizeTipoSolicitacaoBehavior } = require('./tipoSolicitacaoBehaviorService');

function erroNegocio(mensagem, statusCode = 400) {
  return Object.assign(new Error(mensagem), { statusCode });
}

function normalizarIds(valores) {
  return [...new Set((Array.isArray(valores) ? valores : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))];
}

async function carregarDestino(destinoId, transaction = null) {
  const id = Number(destinoId);
  if (!Number.isInteger(id) || id <= 0) throw erroNegocio('Obra/Centro de Custo invalido.');
  const destino = await Obra.findByPk(id, {
    attributes: ['id', 'codigo', 'nome', 'ativo', 'tipo_centro_custo'],
    transaction
  });
  if (!destino || destino.ativo === false) throw erroNegocio('Obra/Centro de Custo nao encontrado ou inativo.', 404);
  return destino;
}

function tipoPodeSerAbertoManualmente(tipo) {
  return tipo?.ativo !== false && normalizeTipoSolicitacaoBehavior(tipo)?.somente_sistema !== true;
}

function tipoPodeSerConfigurado(tipo) {
  return normalizeTipoSolicitacaoBehavior(tipo)?.somente_sistema !== true;
}

function enriquecerTipoComSubtipos(tipo) {
  const plain = enrichTipoSolicitacao(tipo);
  const vinculados = Array.isArray(plain?.subtiposVinculados) ? plain.subtiposVinculados : [];
  plain.subtipos = vinculados
    .map((subtipo) => ({ ...subtipo, tipo_macro_id: Number(plain.id) }))
    .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
  delete plain.subtiposVinculados;
  return plain;
}

async function listarTiposDisponiveis(destinoId, { transaction = null } = {}) {
  const destino = await carregarDestino(destinoId, transaction);
  const ehObra = isObraCentroCusto(destino.tipo_centro_custo);
  let tipos;

  if (ehObra) {
    tipos = await TipoSolicitacao.findAll({
      where: { ativo: true, disponivel_para_obras: true },
      include: [{
        model: TipoSubContrato,
        as: 'subtiposVinculados',
        required: false,
        where: { ativo: true },
        attributes: ['id', 'nome', 'tipo_macro_id', 'ativo']
      }],
      order: [['nome', 'ASC'], [{ model: TipoSubContrato, as: 'subtiposVinculados' }, 'nome', 'ASC']],
      transaction
    });
  } else {
    const vinculos = await CentroCustoTipoSolicitacao.findAll({
      where: { centro_custo_id: destino.id, ativo: true },
      attributes: ['tipo_solicitacao_id'],
      transaction
    });
    const ids = vinculos.map((item) => Number(item.tipo_solicitacao_id));
    tipos = ids.length === 0 ? [] : await TipoSolicitacao.findAll({
      where: { id: { [Op.in]: ids }, ativo: true },
      include: [{
        model: TipoSubContrato,
        as: 'subtiposVinculados',
        required: false,
        where: { ativo: true },
        attributes: ['id', 'nome', 'tipo_macro_id', 'ativo']
      }],
      order: [['nome', 'ASC'], [{ model: TipoSubContrato, as: 'subtiposVinculados' }, 'nome', 'ASC']],
      transaction
    });
  }

  return {
    destino: destino.get({ plain: true }),
    contexto: ehObra ? 'OBRA' : 'CENTRO_CUSTO',
    tipos: tipos.filter(tipoPodeSerAbertoManualmente).map(enriquecerTipoComSubtipos)
  };
}

async function assertTipoDisponivelNoDestino(destino, tipo, { transaction = null } = {}) {
  if (!destino || destino.ativo === false) {
    throw erroNegocio('Obra/Centro de Custo nao encontrado ou inativo.', 404);
  }
  if (!tipo || !tipoPodeSerAbertoManualmente(tipo)) {
    throw erroNegocio('Tipo de solicitacao indisponivel para abertura.');
  }

  if (isObraCentroCusto(destino.tipo_centro_custo)) {
    if (tipo.disponivel_para_obras !== true && Number(tipo.disponivel_para_obras) !== 1) {
      throw erroNegocio('Tipo de solicitacao nao permitido para Obras.', 403);
    }
    return true;
  }

  const vinculo = await CentroCustoTipoSolicitacao.findOne({
    where: {
      centro_custo_id: destino.id,
      tipo_solicitacao_id: tipo.id,
      ativo: true
    },
    attributes: ['id'],
    transaction
  });
  if (!vinculo) throw erroNegocio('Tipo de solicitacao nao permitido para este Centro de Custo.', 403);
  return true;
}

async function obterConfiguracao() {
  const [tipos, centrosCusto, vinculos] = await Promise.all([
    TipoSolicitacao.findAll({ order: [['nome', 'ASC']] }),
    Obra.findAll({
      where: { ativo: true, tipo_centro_custo: { [Op.ne]: 'OBRA' } },
      attributes: ['id', 'codigo', 'nome', 'tipo_centro_custo'],
      order: [['codigo', 'ASC'], ['nome', 'ASC']]
    }),
    CentroCustoTipoSolicitacao.findAll({ where: { ativo: true }, attributes: ['centro_custo_id', 'tipo_solicitacao_id'] })
  ]);

  const tiposConfiguraveis = tipos.filter(tipoPodeSerConfigurado);
  const idsConfiguraveis = new Set(tiposConfiguraveis.map((tipo) => Number(tipo.id)));

  const tiposPorCentroCusto = {};
  vinculos.forEach((item) => {
    if (!idsConfiguraveis.has(Number(item.tipo_solicitacao_id))) return;
    const chave = String(item.centro_custo_id);
    if (!tiposPorCentroCusto[chave]) tiposPorCentroCusto[chave] = [];
    tiposPorCentroCusto[chave].push(Number(item.tipo_solicitacao_id));
  });

  return {
    tipos: tiposConfiguraveis.map(enrichTipoSolicitacao),
    centros_custo: centrosCusto,
    tipos_obras: tiposConfiguraveis
      .filter((tipo) => tipo.disponivel_para_obras === true || Number(tipo.disponivel_para_obras) === 1)
      .map((tipo) => Number(tipo.id)),
    tipos_por_centro_custo: tiposPorCentroCusto
  };
}

async function salvarConfiguracao({ escopo, centroCustoId, tipos, usuarioId }) {
  const escopoNormalizado = String(escopo || '').trim().toUpperCase();
  if (!Array.isArray(tipos)) throw erroNegocio('A lista de tipos e obrigatoria.');
  const ids = normalizarIds(tipos);

  return sequelize.transaction(async (transaction) => {
    const tiposCadastrados = await TipoSolicitacao.findAll({
      attributes: ['id', 'ativo', 'comportamento', 'codigo_interno', 'nome'],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const tiposConfiguraveis = tiposCadastrados.filter(tipoPodeSerConfigurado);
    const idsConfiguraveis = new Set(tiposConfiguraveis.map((tipo) => Number(tipo.id)));
    if (ids.some((id) => !idsConfiguraveis.has(id))) {
      throw erroNegocio('Um ou mais tipos informados nao existem ou sao de uso interno do sistema.');
    }

    if (escopoNormalizado === 'OBRA') {
      const idsManuais = [...idsConfiguraveis];
      if (idsManuais.length) {
        await TipoSolicitacao.update(
          { disponivel_para_obras: false },
          { where: { id: { [Op.in]: idsManuais } }, transaction }
        );
      }
      if (ids.length) {
        await TipoSolicitacao.update(
          { disponivel_para_obras: true },
          { where: { id: { [Op.in]: ids } }, transaction }
        );
      }
      return { escopo: 'OBRA', tipos: ids };
    }

    if (escopoNormalizado !== 'CENTRO_CUSTO') throw erroNegocio('Escopo de configuracao invalido.');
    const centroCusto = await carregarDestino(centroCustoId, transaction);
    if (isObraCentroCusto(centroCusto.tipo_centro_custo)) {
      throw erroNegocio('O destino selecionado e uma Obra, nao um Centro de Custo.');
    }

    await CentroCustoTipoSolicitacao.update(
      { ativo: false, atualizado_por: usuarioId || null },
      { where: { centro_custo_id: centroCusto.id }, transaction }
    );
    for (const tipoId of ids) {
      const existente = await CentroCustoTipoSolicitacao.findOne({
        where: { centro_custo_id: centroCusto.id, tipo_solicitacao_id: tipoId },
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (existente) {
        await existente.update({ ativo: true, atualizado_por: usuarioId || null }, { transaction });
      } else {
        await CentroCustoTipoSolicitacao.create({
          centro_custo_id: centroCusto.id,
          tipo_solicitacao_id: tipoId,
          ativo: true,
          criado_por: usuarioId || null,
          atualizado_por: usuarioId || null
        }, { transaction });
      }
    }
    return { escopo: 'CENTRO_CUSTO', centro_custo_id: centroCusto.id, tipos: ids };
  });
}

module.exports = {
  assertTipoDisponivelNoDestino,
  listarTiposDisponiveis,
  obterConfiguracao,
  salvarConfiguracao
};
