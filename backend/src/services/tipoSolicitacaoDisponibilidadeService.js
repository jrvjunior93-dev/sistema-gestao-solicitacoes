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
const {
  enrichTipoSolicitacao,
  normalizeTipoSolicitacaoBehavior,
  serializeTipoSolicitacaoBehavior
} = require('./tipoSolicitacaoBehaviorService');

const TIPOS_AUTOMATICOS_CENTRO_CUSTO = Object.freeze([
  {
    chave: 'MARKETING',
    codigo: 'DESPESA_DE_MARKETING',
    nome: 'DESPESA DE MARKETING',
    areasConfiguracaoCampos: ['MARKETING']
  },
  {
    chave: 'COMERCIAL',
    codigo: 'DESPESA_COMERCIAL',
    nome: 'DESPESA COMERCIAL',
    areasConfiguracaoCampos: ['COMERCIAL']
  },
  {
    chave: 'ADMINISTRATIVO',
    codigo: 'DESPESA_ADMINISTRATIVA',
    nome: 'DESPESA ADMINISTRATIVA',
    areasConfiguracaoCampos: ['ADMINISTRATIVO', 'ESCRITORIO', 'ADMINISTRATIVO/ESCRITORIO']
  }
]);

function erroNegocio(mensagem, statusCode = 400) {
  return Object.assign(new Error(mensagem), { statusCode });
}

function normalizarIds(valores) {
  return [...new Set((Array.isArray(valores) ? valores : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))];
}

function normalizarToken(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function obterDefinicaoTipoAutomatico(destino) {
  if (!destino || isObraCentroCusto(destino.tipo_centro_custo)) return null;
  const tokens = new Set([
    normalizarToken(destino.codigo),
    normalizarToken(destino.nome)
  ].filter(Boolean).flatMap((token) => [token, ...token.split('_')]));
  if (tokens.has('MARKETING')) return TIPOS_AUTOMATICOS_CENTRO_CUSTO[0];
  if (tokens.has('COMERCIAL')) return TIPOS_AUTOMATICOS_CENTRO_CUSTO[1];
  if (tokens.has('ADMINISTRATIVO') || tokens.has('ESCRITORIO')) return TIPOS_AUTOMATICOS_CENTRO_CUSTO[2];
  return null;
}

function obterAreasConfiguracaoCamposDestino(destino) {
  const definicao = obterDefinicaoTipoAutomatico(destino);
  return definicao ? [...definicao.areasConfiguracaoCampos] : [];
}

async function garantirTiposAutomaticosCentroCusto({ transaction = null } = {}) {
  const tipos = [];
  for (const definicao of TIPOS_AUTOMATICOS_CENTRO_CUSTO) {
    let tipo = await TipoSolicitacao.findOne({
      where: {
        [Op.or]: [
          { codigo_interno: definicao.codigo },
          { nome: definicao.nome }
        ]
      },
      transaction
    });
    if (!tipo) {
      tipo = await TipoSolicitacao.create({
        nome: definicao.nome,
        codigo_interno: definicao.codigo,
        disponivel_para_obras: false,
        ativo: true,
        comportamento: serializeTipoSolicitacaoBehavior({
          mostrar_subtipo: true,
          exige_subtipo: false
        })
      }, { transaction });
    } else {
      const atualizacoes = {};
      if (tipo.nome !== definicao.nome) atualizacoes.nome = definicao.nome;
      if (tipo.codigo_interno !== definicao.codigo) atualizacoes.codigo_interno = definicao.codigo;
      if (tipo.ativo === false) atualizacoes.ativo = true;
      if (tipo.disponivel_para_obras !== false && Number(tipo.disponivel_para_obras) !== 0) {
        atualizacoes.disponivel_para_obras = false;
      }
      const comportamento = normalizeTipoSolicitacaoBehavior(tipo);
      if (comportamento.mostrar_subtipo !== true) {
        atualizacoes.comportamento = serializeTipoSolicitacaoBehavior({
          ...comportamento,
          mostrar_subtipo: true,
          exige_subtipo: false
        });
      }
      if (Object.keys(atualizacoes).length) await tipo.update(atualizacoes, { transaction });
    }
    tipos.push({ definicao, tipo });
  }
  return tipos;
}

async function obterTipoAutomaticoDestino(destino, transaction = null) {
  const definicao = obterDefinicaoTipoAutomatico(destino);
  if (!definicao) return null;
  const tipos = await garantirTiposAutomaticosCentroCusto({ transaction });
  return tipos.find((item) => item.definicao.codigo === definicao.codigo)?.tipo || null;
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
  const tipoAutomatico = ehObra ? null : await obterTipoAutomaticoDestino(destino, transaction);
  let tipos;

  if (tipoAutomatico) {
    tipos = await TipoSolicitacao.findAll({
      where: { id: tipoAutomatico.id, ativo: true },
      include: [{
        model: TipoSubContrato,
        as: 'subtiposVinculados',
        required: false,
        where: { ativo: true },
        attributes: ['id', 'nome', 'tipo_macro_id', 'ativo']
      }],
      transaction
    });
  } else if (ehObra) {
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
    tipo_automatico: Boolean(tipoAutomatico),
    // O fluxo continua entrando operacionalmente em GEO. Esta lista serve somente para
    // localizar a configuracao visual/obrigatoria do tipo automatico na tela "Campos da
    // Nova Solicitacao" (MARKETING, COMERCIAL ou ADMINISTRATIVO), sem hardcode de campos.
    areas_configuracao_campos: tipoAutomatico ? obterAreasConfiguracaoCamposDestino(destino) : [],
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

  const tipoAutomatico = await obterTipoAutomaticoDestino(destino, transaction);
  if (tipoAutomatico) {
    if (Number(tipoAutomatico.id) !== Number(tipo.id)) {
      throw erroNegocio('Este Centro de Custo aceita somente o tipo automatico configurado para ele.', 403);
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
  await garantirTiposAutomaticosCentroCusto();
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

  const tiposAutomaticosPorCentroCusto = {};
  const tipoPorCodigo = new Map(tiposConfiguraveis.map((tipo) => [normalizarToken(tipo.codigo_interno), Number(tipo.id)]));
  centrosCusto.forEach((centro) => {
    const definicao = obterDefinicaoTipoAutomatico(centro);
    if (!definicao) return;
    const tipoId = tipoPorCodigo.get(definicao.codigo);
    if (!tipoId) return;
    tiposPorCentroCusto[String(centro.id)] = [tipoId];
    tiposAutomaticosPorCentroCusto[String(centro.id)] = tipoId;
  });

  return {
    tipos: tiposConfiguraveis.map(enrichTipoSolicitacao),
    centros_custo: centrosCusto,
    tipos_obras: tiposConfiguraveis
      .filter((tipo) => tipo.disponivel_para_obras === true || Number(tipo.disponivel_para_obras) === 1)
      .map((tipo) => Number(tipo.id)),
    tipos_por_centro_custo: tiposPorCentroCusto,
    tipos_automaticos_por_centro_custo: tiposAutomaticosPorCentroCusto
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

    const tipoAutomatico = await obterTipoAutomaticoDestino(centroCusto, transaction);
    if (tipoAutomatico) {
      if (ids.length !== 1 || Number(ids[0]) !== Number(tipoAutomatico.id)) {
        throw erroNegocio('Este Centro de Custo possui um tipo automatico e unico, que nao pode ser substituido.');
      }
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
  garantirTiposAutomaticosCentroCusto,
  listarTiposDisponiveis,
  obterAreasConfiguracaoCamposDestino,
  obterConfiguracao,
  salvarConfiguracao
};
