'use strict';

const { Op } = require('sequelize');
const { sequelize, RhSolicitacao, RhSolicitacaoHistorico, RhColaborador,
  CrResponsavelObra, Obra } = require('../models');
const { ValidationError } = require('../middlewares/validation');
const { getUserObraIds } = require('./authorizationService');
const { codigoDoSetor } = require('../utils/codigoDoSetor');
const { ehTransferencia, hojeLocal, dataIso } = require('./rhPessoalDomain');
const { vinculoAberto, registrarVinculo } = require('./rhVinculoObraService');
const { comAtividade, marcarLida } = require('./rhSolicitacaoAtividadeService');

const camposColaborador = ['id', 'nome', 'matricula', 'cargo', 'obra_id'];
const camposObra = ['id', 'nome', 'codigo'];
const tiposTransferencia = { [Op.or]: [{ tipo: 'TROCA_OBRA' }, { tipo: 'MOVIMENTACAO', subtipo: 'TRANSFERENCIA_OBRA' }] };
const dadosDe = s => typeof s.dados_json === 'string' ? JSON.parse(s.dados_json) : (s.dados_json || {});

async function responsaveis(usuarioId, transaction) {
  const hoje = hojeLocal();
  return CrResponsavelObra.findAll({ where: {
    ...(usuarioId ? { user_id: usuarioId } : {}), ativo: true,
    papel: { [Op.in]: ['RESPONSAVEL', 'SUBSTITUTO'] },
    vigencia_inicio: { [Op.lte]: hoje },
    [Op.or]: [{ vigencia_fim: null }, { vigencia_fim: { [Op.gte]: hoje } }]
  }, transaction });
}

async function obrasResponsavel(user, transaction) {
  return [...new Set((await responsaveis(user.id, transaction)).map(r => Number(r.obra_id)))];
}

async function configuracao(user) {
  const ids = await obrasResponsavel(user);
  const obras = await Obra.findAll({ where: { ativo: true }, attributes: camposObra, order: [['nome', 'ASC']] });
  return { obras: obras.map(o => o.get({ plain: true })), obras_responsavel_ids: ids };
}

async function diretorio(user, filtros = {}) {
  const vinculadas = await getUserObraIds(user);
  const responsavelIds = await obrasResponsavel(user);
  if (!vinculadas.length && !responsavelIds.length) {
    throw new ValidationError('O diretorio global esta disponivel para usuarios vinculados a obras.', 403);
  }
  const busca = String(filtros.busca || '').trim().slice(0, 100);
  const pagina = Math.max(1, Math.min(100000, Number.parseInt(filtros.pagina, 10) || 1));
  const where = { status: 'ATIVO' };
  if (busca) where[Op.or] = ['nome', 'matricula', 'cargo'].map(campo => ({ [campo]: { [Op.like]: `%${busca}%` } }));
  const { count, rows } = await RhColaborador.findAndCountAll({ where,
    attributes: camposColaborador,
    include: [{ model: Obra, as: 'obra', attributes: camposObra, required: false }],
    order: [['nome', 'ASC'], ['id', 'ASC']], limit: 50, offset: (pagina - 1) * 50
  });
  return { total: count, pagina, itens: rows.map(r => r.get({ plain: true })) };
}

function ladoAprovador(s) {
  const d = dadosDe(s);
  return Number(d.obra_aprovadora_id || d.obra_destino_id);
}

async function exigirAcesso(s, user, transaction) {
  if (!s || !ehTransferencia(s)) throw new ValidationError('Transferencia nao encontrada.', 404);
  const ids = await obrasResponsavel(user, transaction);
  if (!ids.includes(Number(s.obra_id)) && !ids.includes(Number(dadosDe(s).obra_destino_id))) {
    throw new ValidationError('Acesso restrito aos responsaveis vigentes das obras envolvidas.', 403);
  }
  return ids;
}

// Projeção explícita: nunca devolver dados_json arbitrário, salário ou documentos
// do colaborador, inclusive em pedidos legados.
function resumo(s, ids, usuarioId) {
  const d = dadosDe(s);
  return { id: s.id, colaborador_id: s.colaborador_id, colaborador: s.colaborador,
    obra_id: s.obra_id, obra: s.obra, obra_destino_id: Number(d.obra_destino_id),
    obra_aprovadora_id: ladoAprovador(s), situacao: s.situacao,
    justificativa: s.justificativa, motivo_rejeicao: s.motivo_rejeicao,
    createdAt: s.createdAt, updatedAt: s.updatedAt, decidida_em: s.decidida_em,
    pode_decidir: s.situacao === 'ABERTA' && ids.includes(ladoAprovador(s)) && Number(s.criada_por) !== Number(usuarioId),
    pode_cancelar: ['ABERTA', 'RASCUNHO'].includes(s.situacao)
      && ids.includes(Number(d.obra_solicitante_id || s.obra_id)),
    pode_enviar: s.situacao === 'RASCUNHO' && ids.includes(Number(d.obra_solicitante_id || s.obra_id)) };
}

const includes = [
  { model: RhColaborador, as: 'colaborador', attributes: camposColaborador, required: false },
  { model: Obra, as: 'obra', attributes: camposObra, required: false }
];

async function listar(user) {
  const ids = await obrasResponsavel(user);
  if (!ids.length) return [];
  // JSON é parametrizado pelo Sequelize. Não há busca global antes da autorização.
  const solicitacoes = await RhSolicitacao.findAll({ where: { [Op.and]: [tiposTransferencia, {
    [Op.or]: [{ obra_id: { [Op.in]: ids } }, ...ids.map(id => sequelize.where(
      sequelize.cast(sequelize.json('dados_json.obra_destino_id'), 'UNSIGNED'), id))]
  }] }, include: includes });
  const linhas = solicitacoes.filter(ehTransferencia).map(s => resumo(s.get({ plain: true }), ids, user.id));
  const destinos = [...new Set(linhas.map(s => s.obra_destino_id))];
  const obras = destinos.length ? await Obra.findAll({ where: { id: destinos }, attributes: camposObra }) : [];
  const nomes = new Map(obras.map(o => [Number(o.id), o.nome]));
  return comAtividade(linhas.map(s => ({ ...s, obra_destino_nome: nomes.get(s.obra_destino_id) })), user.id);
}

async function historico(s, user, acao, descricao, transaction) {
  return RhSolicitacaoHistorico.create({ solicitacao_id: s.id, usuario_id: user.id,
    setor: codigoDoSetor(user), acao, descricao, situacao_nova: s.situacao }, { transaction });
}

async function abrir(user, payload) {
  return sequelize.transaction(async transaction => {
    const colaborador = await RhColaborador.findByPk(payload.colaborador_id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!colaborador || colaborador.status !== 'ATIVO' || !colaborador.obra_id) {
      throw new ValidationError('Selecione um colaborador ativo que ja esteja vinculado a uma obra.');
    }
    const origem = Number(colaborador.obra_id);
    const destino = Number(payload.obra_destino_id);
    const solicitante = Number(payload.obra_solicitante_id);
    if (!Number.isInteger(destino) || destino <= 0 || origem === destino || ![origem, destino].includes(solicitante)) {
      throw new ValidationError('Informe obras de origem e destino diferentes e a obra que esta solicitando.');
    }
    const ids = await obrasResponsavel(user, transaction);
    if (!ids.includes(solicitante)) throw new ValidationError('Somente o responsavel vigente da obra pode solicitar a transferencia.', 403);
    const aprovadora = solicitante === origem ? destino : origem;
    const ativos = await responsaveis(null, transaction);
    if (!ativos.some(r => Number(r.obra_id) === aprovadora && Number(r.user_id) !== Number(user.id))) {
      throw new ValidationError('Cadastre outro responsavel ou substituto vigente na obra que aprovara a transferencia.');
    }
    const obras = await Obra.findAll({ where: { id: [origem, destino], ativo: true }, transaction });
    if (obras.length !== 2) throw new ValidationError('As duas obras precisam estar ativas.');
    const existente = await RhSolicitacao.findOne({ where: { colaborador_id: colaborador.id,
      situacao: { [Op.in]: ['ABERTA', 'RASCUNHO'] }, ...tiposTransferencia }, transaction });
    if (existente) throw new ValidationError(`Ja existe uma transferencia em andamento (#${existente.id}).`, 409);
    const motivo = String(payload.justificativa || '').trim();
    if (!motivo || motivo.length > 2000) throw new ValidationError('Informe a justificativa (ate 2000 caracteres).');
    const s = await RhSolicitacao.create({ tipo: 'MOVIMENTACAO', subtipo: 'TRANSFERENCIA_OBRA',
      colaborador_id: colaborador.id, obra_id: origem, situacao: 'ABERTA', criada_por: user.id,
      setor_origem: codigoDoSetor(user), justificativa: motivo,
      dados_json: { obra_destino_id: destino, obra_solicitante_id: solicitante, obra_aprovadora_id: aprovadora }
    }, { transaction });
    await historico(s, user, 'ABERTURA', `Transferencia da obra ${origem} para ${destino}. Aguardando a obra ${aprovadora}.`, transaction);
    return { id: s.id };
  });
}

async function agir(user, id, acao, texto) {
  if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw new ValidationError('Transferencia invalida.');
  return sequelize.transaction(async transaction => {
    const s = await RhSolicitacao.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    const ids = await exigirAcesso(s, user, transaction);
    const d = dadosDe(s);
    const motivo = String(texto || '').trim();
    if (motivo.length > 2000) throw new ValidationError('O texto deve ter ate 2000 caracteres.');
    if (acao === 'comentar') {
      if (!motivo) throw new ValidationError('Informe o comentario.');
      await historico(s, user, 'COMENTARIO', motivo, transaction);
      return { id: s.id };
    }
    if (['enviar', 'cancelar'].includes(acao)) {
      if (!ids.includes(Number(d.obra_solicitante_id || s.obra_id))) throw new ValidationError('Somente a obra solicitante pode executar esta acao.', 403);
    } else if (!ids.includes(ladoAprovador(s)) || Number(s.criada_por) === Number(user.id)) {
      throw new ValidationError('A decisao deve ser feita por outro responsavel da obra aprovadora.', 403);
    }
    const novoStatus = { aprovar: 'APROVADA', rejeitar: 'REJEITADA', cancelar: 'CANCELADA', enviar: 'ABERTA' }[acao];
    if (!novoStatus) throw new ValidationError('Acao invalida.');
    if (s.situacao === novoStatus && acao !== 'enviar') return { id: s.id, situacao: s.situacao };
    if (acao === 'enviar' ? s.situacao !== 'RASCUNHO' : !['ABERTA', ...(acao === 'cancelar' ? ['RASCUNHO'] : [])].includes(s.situacao)) {
      throw new ValidationError('A transferencia ja foi decidida ou nao esta aberta. Atualize a lista.', 409);
    }
    if (acao === 'rejeitar' && !motivo) throw new ValidationError('Informe o motivo da rejeicao.');
    if (acao === 'aprovar') {
      const colaborador = await RhColaborador.findByPk(s.colaborador_id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!colaborador || colaborador.status !== 'ATIVO' || Number(colaborador.obra_id) !== Number(s.obra_id)) {
        throw new ValidationError('O colaborador mudou de obra ou nao esta ativo. Cancele e abra uma nova transferencia.', 409);
      }
      const destino = await Obra.findByPk(d.obra_destino_id, { transaction });
      if (!destino?.ativo) throw new ValidationError('A obra de destino nao esta ativa.');
      const aberto = await vinculoAberto(colaborador.id, transaction);
      const hoje = hojeLocal();
      if (!aberto || Number(aberto.obra_id) !== Number(s.obra_id) || dataIso(aberto.vigencia_inicio) > hoje
          || dataIso(colaborador.data_admissao || colaborador.data_inicio) > hoje
          || (colaborador.data_demissao && dataIso(colaborador.data_demissao) < hoje)) {
        throw new ValidationError('O vinculo atual nao permite transferencia hoje. Confira a admissao e o historico de lotacao.', 409);
      }
      if (dataIso(aberto.vigencia_inicio) === hoje) {
        // Não gerar intervalo negativo quando ocorrerem duas mudanças no mesmo dia.
        // A trajetória intradiária fica auditada no histórico das solicitações.
        await aberto.update({ obra_id: destino.id, motivo: 'TROCA_OBRA', solicitacao_id: s.id }, { transaction });
      } else {
        await registrarVinculo({ colaboradorId: colaborador.id, obraId: destino.id,
          setorId: colaborador.setor_id, vigenciaInicio: hoje, motivo: 'TROCA_OBRA',
          solicitacaoId: s.id, criadoPor: user.id }, transaction);
      }
      await colaborador.update({ obra_id: destino.id, atualizado_por: user.id }, { transaction });
      s.dados_json = { ...d, data_vigencia: hoje };
    }
    await s.update({ situacao: novoStatus, dados_json: s.dados_json,
      ...(acao !== 'enviar' ? { decidida_por: user.id, decidida_em: new Date() } : {}),
      ...(acao === 'rejeitar' ? { motivo_rejeicao: motivo } : {}) }, { transaction });
    await historico(s, user, acao.toUpperCase(), motivo || `Transferencia: ${novoStatus}.`, transaction);
    return { id: s.id, situacao: s.situacao };
  });
}

async function detalhe(user, id) {
  const s = await RhSolicitacao.findByPk(id, { include: includes });
  const ids = await exigirAcesso(s, user);
  const eventos = await RhSolicitacaoHistorico.findAll({ where: { solicitacao_id: id }, order: [['id', 'ASC']] });
  const max = eventos.reduce((n, h) => Math.max(n, Number(h.id)), 0);
  await marcarLida(id, user.id, max);
  return { ...resumo(s.get({ plain: true }), ids, user.id), historicos: eventos };
}

module.exports = { configuracao, diretorio, listar, abrir, agir, detalhe, exigirAcesso, obrasResponsavel };
