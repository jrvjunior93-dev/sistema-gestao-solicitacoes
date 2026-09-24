'use strict';

const { Op } = require('sequelize');
const { sequelize, RhSolicitacao, RhSolicitacaoHistorico, RhColaborador,
  CrResponsavelObra, Obra, Notificacao, NotificacaoDestinatario } = require('../models');
const { ValidationError } = require('../middlewares/validation');
const { getRhDpObraScopeIds, getUserObraIds, isSuperadmin, userHasAreaPermission } = require('./authorizationService');
const { codigoDoSetor } = require('../utils/codigoDoSetor');
const { ehTransferencia, hojeLocal, dataIso } = require('./rhPessoalDomain');
const { vinculoAberto, registrarVinculo } = require('./rhVinculoObraService');
const { comAtividade, marcarLida, marcarListaLida: registrarListaLida } = require('./rhSolicitacaoAtividadeService');
const { criarNotificacaoDireta } = require('./notificacoes');
const { garantirCodigoRhSolicitacao } = require('./rhSolicitacaoCodigoService');

const camposColaborador = ['id', 'nome', 'matricula', 'cargo', 'obra_id'];
const camposObra = ['id', 'nome', 'codigo'];
const tiposTransferencia = { [Op.or]: [{ tipo: 'TROCA_OBRA' }, { tipo: 'MOVIMENTACAO', subtipo: 'TRANSFERENCIA_OBRA' }] };
const SITUACOES_PENDENTES = ['RASCUNHO', 'ABERTA'];
const SITUACOES_RESOLVIDAS = ['APROVADA', 'REJEITADA', 'CANCELADA'];
const TIPO_NOTIFICACAO_TRANSFERENCIA = 'RH_TRANSFERENCIA_ATUALIZADA';
const dadosDe = s => typeof s.dados_json === 'string' ? JSON.parse(s.dados_json) : (s.dados_json || {});

async function responsaveis(usuarioId, transaction) {
  const hoje = hojeLocal();
  return CrResponsavelObra.findAll({
    where: {
      ...(usuarioId ? { user_id: usuarioId } : {}), ativo: true,
      papel: { [Op.in]: ['RESPONSAVEL', 'SUBSTITUTO'] },
      vigencia_inicio: { [Op.lte]: hoje },
      [Op.or]: [{ vigencia_fim: null }, { vigencia_fim: { [Op.gte]: hoje } }]
    },
    transaction
  });
}

async function obrasResponsavel(user, transaction) {
  if (isSuperadmin(user)) {
    const obras = await Obra.findAll({
      where: { ativo: true },
      attributes: ['id'],
      transaction
    });
    return obras.map(obra => Number(obra.id));
  }
  return [...new Set((await responsaveis(user.id, transaction)).map(r => Number(r.obra_id)))];
}

async function podeLerGlobalmente(user) {
  if (isSuperadmin(user)) return true;
  const escopoEstritoDaObra = await getRhDpObraScopeIds(user);
  if (Array.isArray(escopoEstritoDaObra)) return false;
  return userHasAreaPermission(user, ['rh_dp.solicitacoes.ver_todas']);
}

async function configuracao(user) {
  const ids = await obrasResponsavel(user);
  const obras = await Obra.findAll({ where: { ativo: true }, attributes: camposObra, order: [['nome', 'ASC']] });
  return {
    obras: obras.map(o => o.get({ plain: true })),
    obras_responsavel_ids: ids,
    acesso_global: await podeLerGlobalmente(user)
  };
}

async function diretorio(user, filtros = {}) {
  if (!(await podeLerGlobalmente(user))) {
    const vinculadas = await getUserObraIds(user);
    const responsavelIds = await obrasResponsavel(user);
    if (!vinculadas.length && !responsavelIds.length) {
      throw new ValidationError('O diretorio global esta disponivel para usuarios vinculados a obras.', 403);
    }
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

function resolverFluxoTransferencia(origem, destino, idsResponsavel = []) {
  const responsavelOrigem = idsResponsavel.includes(Number(origem));
  const responsavelDestino = idsResponsavel.includes(Number(destino));
  if (!responsavelOrigem && !responsavelDestino) {
    throw new ValidationError('Somente o responsavel vigente da obra atual ou da obra de destino pode solicitar a transferencia.', 403);
  }

  const aprovacaoAutomatica = responsavelOrigem && responsavelDestino;
  const obraSolicitanteId = responsavelOrigem ? Number(origem) : Number(destino);
  return {
    aprovacaoAutomatica,
    obraSolicitanteId,
    obraAprovadoraId: aprovacaoAutomatica
      ? null
      : (obraSolicitanteId === Number(origem) ? Number(destino) : Number(origem))
  };
}

async function exigirAcesso(s, user, transaction) {
  if (!s || !ehTransferencia(s)) throw new ValidationError('Transferencia nao encontrada.', 404);
  if (isSuperadmin(user)) {
    return [...new Set([Number(s.obra_id), Number(dadosDe(s).obra_destino_id)].filter(Number.isFinite))];
  }
  const ids = await obrasResponsavel(user, transaction);
  if (!ids.includes(Number(s.obra_id)) && !ids.includes(Number(dadosDe(s).obra_destino_id))) {
    throw new ValidationError('Acesso restrito aos responsaveis vigentes das obras envolvidas.', 403);
  }
  return ids;
}

async function exigirLeitura(s, user, transaction) {
  if (!s || !ehTransferencia(s)) throw new ValidationError('Transferencia nao encontrada.', 404);
  if (isSuperadmin(user)) {
    return [...new Set([Number(s.obra_id), Number(dadosDe(s).obra_destino_id)].filter(Number.isFinite))];
  }
  const ids = await obrasResponsavel(user, transaction);
  if (ids.includes(Number(s.obra_id)) || ids.includes(Number(dadosDe(s).obra_destino_id))) return ids;
  if (await podeLerGlobalmente(user)) return ids;
  throw new ValidationError('Acesso restrito aos responsaveis vigentes das obras envolvidas.', 403);
}

// Projeção explícita: nunca devolver dados_json arbitrário, salário ou documentos
// do colaborador, inclusive em pedidos legados.
function resumo(s, ids, usuarioId) {
  const d = dadosDe(s);
  return { id: s.id, codigo: s.codigo || `RH-${String(s.id).padStart(6, '0')}`, colaborador_id: s.colaborador_id, colaborador: s.colaborador,
    obra_id: s.obra_id, obra: s.obra, obra_destino_id: Number(d.obra_destino_id),
    obra_solicitante_id: Number(d.obra_solicitante_id),
    obra_aprovadora_id: d.aprovacao_automatica ? null : ladoAprovador(s),
    aprovacao_automatica: Boolean(d.aprovacao_automatica), data_vigencia: d.data_vigencia || null,
    situacao: s.situacao,
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

function montarEscopoTransferencias(acessoGlobal, ids, grupo = '') {
  const filtros = [tiposTransferencia];
  if (grupo === 'PENDENTES') filtros.push({ situacao: { [Op.in]: SITUACOES_PENDENTES } });
  if (grupo === 'RESOLVIDAS') filtros.push({ situacao: { [Op.in]: SITUACOES_RESOLVIDAS } });
  if (!acessoGlobal) {
    filtros.push({
      [Op.or]: [{ obra_id: { [Op.in]: ids } }, ...ids.map(id => sequelize.where(
        sequelize.cast(sequelize.json('dados_json.obra_destino_id'), 'UNSIGNED'), id))]
    });
  }
  return { [Op.and]: filtros };
}

async function listar(user, filtros = {}) {
  const acessoGlobal = await podeLerGlobalmente(user);
  const ids = await obrasResponsavel(user);
  const grupo = String(filtros.grupo || 'PENDENTES').trim().toUpperCase();
  if (!['PENDENTES', 'RESOLVIDAS', 'TODAS'].includes(grupo)) {
    throw new ValidationError('Grupo de transferencias invalido.');
  }
  const pagina = Math.max(1, Math.min(100000, Number.parseInt(filtros.pagina, 10) || 1));
  const limite = Math.max(1, Math.min(50, Number.parseInt(filtros.limite, 10) || 20));
  if (!acessoGlobal && !ids.length) {
    return { itens: [], total: 0, pagina, limite, total_paginas: 1, nao_lidas: 0 };
  }
  // JSON é parametrizado pelo Sequelize. A busca global e exclusiva do SUPERADMIN.
  const where = montarEscopoTransferencias(acessoGlobal, ids, grupo);
  const { count, rows: solicitacoes } = await RhSolicitacao.findAndCountAll({
    where,
    include: includes,
    distinct: true,
    order: [['updatedAt', 'DESC'], ['id', 'DESC']],
    limit: limite,
    offset: (pagina - 1) * limite
  });
  const linhas = solicitacoes.filter(ehTransferencia).map((registro) => {
    const s = registro.get({ plain: true });
    const idsPermitidos = isSuperadmin(user)
      ? [...new Set([Number(s.obra_id), Number(dadosDe(s).obra_destino_id)].filter(Number.isFinite))]
      : ids;
    return resumo(s, idsPermitidos, user.id);
  });
  const destinos = [...new Set(linhas.map(s => s.obra_destino_id))];
  const obras = destinos.length ? await Obra.findAll({ where: { id: destinos }, attributes: camposObra }) : [];
  const nomes = new Map(obras.map(o => [Number(o.id), o.nome]));
  const itens = await comAtividade(
    linhas.map(s => ({ ...s, obra_destino_nome: nomes.get(s.obra_destino_id) })),
    user.id
  );
  return {
    itens,
    total: Number(count || 0),
    pagina,
    limite,
    total_paginas: Math.max(1, Math.ceil(Number(count || 0) / limite)),
    nao_lidas: itens.filter(item => item.nao_lida).length
  };
}

async function notificarTransferencia(s, user, acao, transaction) {
  const d = dadosDe(s);
  const obraIds = [...new Set([Number(s.obra_id), Number(d.obra_destino_id)].filter(Number.isSafeInteger))];
  const vinculados = await responsaveis(null, transaction);
  const destinatarios = vinculados
    .filter(item => obraIds.includes(Number(item.obra_id)))
    .map(item => Number(item.user_id));
  if (s.criada_por) destinatarios.push(Number(s.criada_por));

  const rotulo = {
    ABERTURA: 'Nova transferencia aguardando analise',
    COMENTARIO: 'Nova interacao em uma transferencia',
    APROVAR: 'Transferencia aprovada',
    REJEITAR: 'Transferencia rejeitada',
    CANCELAR: 'Transferencia cancelada',
    ENVIAR: 'Transferencia enviada para aprovacao'
  }[acao] || 'Transferencia atualizada';

  await criarNotificacaoDireta({
    tipo: TIPO_NOTIFICACAO_TRANSFERENCIA,
    mensagem: `${rotulo} (#${s.id}). Acesse Transferencias das minhas obras.`,
    metadata: {
      rota: '/rh-dp/pessoal?aba=transferencias&secao=transferencias',
      rh_transferencia_id: Number(s.id)
    },
    created_by: user.id,
    destinatarios,
    transaction
  });
}

async function historico(s, user, acao, descricao, transaction) {
  return RhSolicitacaoHistorico.create({ solicitacao_id: s.id, usuario_id: user.id,
    setor: codigoDoSetor(user), acao, descricao, situacao_nova: s.situacao }, { transaction });
}

async function efetivarTransferencia(s, user, transaction) {
  const d = dadosDe(s);
  const colaborador = await RhColaborador.findByPk(s.colaborador_id, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });
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
  return hoje;
}

async function abrir(user, payload) {
  return sequelize.transaction(async transaction => {
    const colaborador = await RhColaborador.findByPk(payload.colaborador_id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!colaborador || colaborador.status !== 'ATIVO' || !colaborador.obra_id) {
      throw new ValidationError('Selecione um colaborador ativo que ja esteja vinculado a uma obra.');
    }
    const origem = Number(colaborador.obra_id);
    const destino = Number(payload.obra_destino_id);
    if (!Number.isInteger(destino) || destino <= 0 || origem === destino) {
      throw new ValidationError('Informe uma obra de destino diferente da obra atual.');
    }
    const ids = await obrasResponsavel(user, transaction);
    const fluxo = resolverFluxoTransferencia(origem, destino, ids);
    const obras = await Obra.findAll({ where: { id: [origem, destino], ativo: true }, transaction });
    if (obras.length !== 2) throw new ValidationError('As duas obras precisam estar ativas.');
    if (!fluxo.aprovacaoAutomatica) {
      const ativos = await responsaveis(null, transaction);
      if (!ativos.some(r => Number(r.obra_id) === fluxo.obraAprovadoraId && Number(r.user_id) !== Number(user.id))) {
        throw new ValidationError('Cadastre outro responsavel ou substituto vigente na obra que aprovara a transferencia.');
      }
    }
    const existente = await RhSolicitacao.findOne({ where: { colaborador_id: colaborador.id,
      situacao: { [Op.in]: ['ABERTA', 'RASCUNHO'] }, ...tiposTransferencia }, transaction });
    if (existente) throw new ValidationError(`Ja existe uma transferencia em andamento (#${existente.id}).`, 409);
    const motivo = String(payload.justificativa || '').trim();
    if (!motivo || motivo.length > 2000) throw new ValidationError('Informe a justificativa (ate 2000 caracteres).');
    const s = await RhSolicitacao.create({ tipo: 'MOVIMENTACAO', subtipo: 'TRANSFERENCIA_OBRA',
      colaborador_id: colaborador.id, obra_id: origem, situacao: 'ABERTA', criada_por: user.id,
      setor_origem: codigoDoSetor(user), justificativa: motivo,
      dados_json: { obra_destino_id: destino, obra_solicitante_id: fluxo.obraSolicitanteId,
        obra_aprovadora_id: fluxo.obraAprovadoraId, aprovacao_automatica: fluxo.aprovacaoAutomatica }
    }, { transaction });
    await garantirCodigoRhSolicitacao(s, transaction);
    if (fluxo.aprovacaoAutomatica) {
      await historico(s, user, 'ABERTURA',
        `Transferencia da obra ${origem} para ${destino} aberta com aprovacao automatica.`, transaction);
      const vigencia = await efetivarTransferencia(s, user, transaction);
      await s.update({ situacao: 'APROVADA', dados_json: s.dados_json,
        decidida_por: user.id, decidida_em: new Date() }, { transaction });
      await historico(s, user, 'APROVACAO_AUTOMATICA',
        `Transferencia da obra ${origem} para ${destino} efetivada em ${vigencia}; o solicitante responde pelas duas obras.`, transaction);
      return { id: s.id, situacao: s.situacao, aprovacao_automatica: true, data_vigencia: vigencia };
    }
    await historico(s, user, 'ABERTURA',
      `Transferencia da obra ${origem} para ${destino}. Aguardando a obra ${fluxo.obraAprovadoraId}.`, transaction);
    await notificarTransferencia(s, user, 'ABERTURA', transaction);
    return { id: s.id, situacao: s.situacao, aprovacao_automatica: false };
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
      await notificarTransferencia(s, user, 'COMENTARIO', transaction);
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
      await efetivarTransferencia(s, user, transaction);
    }
    await s.update({ situacao: novoStatus, dados_json: s.dados_json,
      ...(acao !== 'enviar' ? { decidida_por: user.id, decidida_em: new Date() } : {}),
      ...(acao === 'rejeitar' ? { motivo_rejeicao: motivo } : {}) }, { transaction });
    await historico(s, user, acao.toUpperCase(), motivo || `Transferencia: ${novoStatus}.`, transaction);
    await notificarTransferencia(s, user, acao.toUpperCase(), transaction);
    return { id: s.id, situacao: s.situacao };
  });
}

async function marcarListaLida(user) {
  const acessoGlobal = await podeLerGlobalmente(user);
  const ids = await obrasResponsavel(user);
  if (!acessoGlobal && !ids.length) return { marcadas: 0 };

  const acessiveis = await RhSolicitacao.findAll({
    where: montarEscopoTransferencias(acessoGlobal, ids, 'TODAS'),
    attributes: ['id'],
    raw: true
  });
  await registrarListaLida(acessiveis.map(item => item.id), user.id);

  const notificacoes = await Notificacao.findAll({
    where: { tipo: TIPO_NOTIFICACAO_TRANSFERENCIA },
    attributes: ['id'],
    raw: true
  });
  const notificacaoIds = notificacoes.map(item => Number(item.id));
  let marcadas = 0;
  if (notificacaoIds.length) {
    [marcadas] = await NotificacaoDestinatario.update(
      { lida_em: new Date() },
      { where: { usuario_id: user.id, lida_em: null, notificacao_id: { [Op.in]: notificacaoIds } } }
    );
  }
  return { marcadas };
}

async function detalhe(user, id) {
  const s = await RhSolicitacao.findByPk(id, { include: includes });
  const ids = await exigirLeitura(s, user);
  const eventos = await RhSolicitacaoHistorico.findAll({ where: { solicitacao_id: id }, order: [['id', 'ASC']] });
  const max = eventos.reduce((n, h) => Math.max(n, Number(h.id)), 0);
  await marcarLida(id, user.id, max);
  return { ...resumo(s.get({ plain: true }), ids, user.id), historicos: eventos };
}

module.exports = { configuracao, diretorio, listar, abrir, agir, detalhe, marcarListaLida, exigirAcesso,
  exigirLeitura, podeLerGlobalmente, obrasResponsavel, resolverFluxoTransferencia, montarEscopoTransferencias };
