'use strict';

const { Op } = require('sequelize');
const { createHash } = require('node:crypto');
const { sequelize, RhSolicitacao, RhSolicitacaoHistorico, RhColaborador, RhColaboradorPagamento,
  Obra, CrResponsavelObra, User, TituloFinanceiro, FormaPagamentoFinanceira } = require('../models');
const { ValidationError } = require('../middlewares/validation');
const auth = require('./authorizationService');
const { userBelongsToDpSetor } = require('./setorCapabilityService');
const { codigoDoSetor } = require('../utils/codigoDoSetor');
const { garantirCodigoRhSolicitacao } = require('./rhSolicitacaoCodigoService');
const { FLUXO, calcularLinha, recebimento, validarPeriodo, texto, valorReembolso, agruparReembolsos,
  normalizarAndamento, situacaoPagamento, grupoRevisao } = require('./rhPagamentoSolicitacaoDomain');
const { ensureCategoriaFinanceiraPagar, syncParceiroFavorecido, syncFavorecidoBancarioRh,
  buildTituloRhPayload } = require('./rhFechamentoService');

const dadosDe = s => normalizarAndamento(typeof s.dados_json === 'string' ? JSON.parse(s.dados_json) : s.dados_json || {});
const plain = s => s?.get ? s.get({ plain: true }) : s;
const { atualizarLinhaCadastro, contaIgual } = require('./rhPagamentoCadastroDomain');

async function cadastroAtual(s, dados, transaction) {
  const ids = dados.linhas.filter(l => !['ENVIADO', 'CANCELADO'].includes(l.pagamento_estado)).map(l => Number(l.colaborador_id));
  if (!ids.length || ['CANCELADA', 'REJEITADA'].includes(s.situacao)) return dados;
  // A autorizacao da solicitacao ocorre antes desta consulta. Nao inclui pessoas
  // novas nem revela cadastro de quem saiu da obra ao autor da solicitacao antiga.
  const lista = await RhColaborador.findAll({ where: { id: { [Op.in]: ids }, obra_id: s.obra_id },
    attributes: ['id', 'nome', 'cpf', 'forma_calculo_gerencial', 'salario_base', 'valor_diaria',
      'banco', 'agencia', 'conta', 'conta_tipo', 'pix_chave'],
    include: [{ model: RhColaboradorPagamento, as: 'pagamento', required: false }], transaction,
    ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}) });
  const porId = new Map(lista.map(c => [Number(c.id), plain(c)]));
  return { ...dados, linhas: dados.linhas.map(l => atualizarLinhaCadastro(l, porId.get(Number(l.colaborador_id)))) };
}

function exigirCadastroConferido(linha, atual) {
  if (linha.cadastro_versao ? linha.cadastro_versao !== atual.cadastro_versao : atual.cadastro_atualizado) {
    throw new ValidationError(`O cadastro de ${atual.nome} mudou. Use Atualizar cadastro e confira novamente antes de salvar ou enviar.`, 409);
  }
}
async function ehDp(user) {
  return (auth.isBusinessAdmin(user) || await userBelongsToDpSetor(user))
    && await auth.canEditRhDpApuracao(user);
}

async function exigirLocal(user, obraId, transaction, bloquear = false) {
  const estrito = await auth.getRhDpObraScopeIds(user);
  const ids = Array.isArray(estrito) ? estrito
    : await userBelongsToDpSetor(user) || await auth.userHasAreaPermission(user, ['rh_dp.solicitacoes.ver_todas']) ? null : await auth.getUserObraIds(user);
  if (!Number.isSafeInteger(Number(obraId)) || Number(obraId) <= 0
    || (Array.isArray(ids) && !ids.includes(Number(obraId)))) {
    throw new ValidationError('Acesso negado a esta obra/centro de custo.', 403);
  }
  const obra = await Obra.findByPk(obraId, { transaction, ...(bloquear ? { lock: transaction.LOCK.UPDATE } : {}) });
  if (!obra) throw new ValidationError('Obra/centro de custo nao encontrado.', 404);
  return obra;
}

async function responsaveis(obraId, transaction) {
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const vinculos = await CrResponsavelObra.findAll({ where: { obra_id: obraId, ativo: true,
    papel: { [Op.in]: ['RESPONSAVEL', 'SUBSTITUTO'] }, vigencia_inicio: { [Op.lte]: hoje },
    [Op.or]: [{ vigencia_fim: null }, { vigencia_fim: { [Op.gte]: hoje } }] }, transaction });
  if (!vinculos.length) return [];
  return User.findAll({ where: { id: { [Op.in]: vinculos.map(v => v.user_id) }, ativo: true },
    attributes: ['id', 'nome'], order: [['nome', 'ASC']], transaction });
}

async function colaboradores(obraId, transaction) {
  return RhColaborador.findAll({ where: { obra_id: obraId, status: 'ATIVO' },
    attributes: ['id', 'nome', 'cpf', 'obra_id', 'empresa_grupo_id', 'forma_calculo_gerencial',
      'valor_diaria', 'salario_base', 'banco', 'agencia', 'conta', 'conta_tipo', 'pix_chave'],
    include: [{ model: RhColaboradorPagamento, as: 'pagamento', required: false }],
    order: [['nome', 'ASC']], transaction });
}

async function historico(s, req, acao, descricao, anterior, transaction) {
  await RhSolicitacaoHistorico.create({ solicitacao_id: s.id, usuario_id: req.user.id,
    setor: codigoDoSetor(req.user), acao, descricao, situacao_anterior: anterior,
    situacao_nova: s.situacao }, { transaction });
}

async function buscar(req, id, transaction, bloquear = false) {
  const s = await RhSolicitacao.findByPk(id, { transaction, ...(bloquear ? { lock: transaction.LOCK.UPDATE } : {}) });
  if (!s || dadosDe(s).fluxo_pagamento !== FLUXO) throw new ValidationError('Solicitacao de pagamento nao encontrada.', 404);
  await exigirLocal(req.user, s.obra_id, transaction);
  if (dadosDe(s).rascunho_excluido) throw new ValidationError('Rascunho excluido.', 404);
  if (s.situacao === 'RASCUNHO' && Number(s.criada_por) !== Number(req.user.id)) {
    throw new ValidationError('Este rascunho pertence a outro usuario.', 403);
  }
  return s;
}

async function avisosAnteriores(dados, transaction, user) {
  const ids = (dados.linhas || []).filter(l => l.selecionado).map(l => Number(l.colaborador_id));
  if (!ids.length) return [];
  const estrito = await auth.getRhDpObraScopeIds(user);
  const obrasIds = Array.isArray(estrito) ? estrito
    : await userBelongsToDpSetor(user) || await auth.userHasAreaPermission(user, ['rh_dp.solicitacoes.ver_todas']) ? null : await auth.getUserObraIds(user);
  // Apenas leitura: nova solicitacao nunca acumula nem reaproveita um titulo anterior.
  return TituloFinanceiro.findAll({ where: { origem_titulo: 'RH_DP', tipo: 'PAGAR',
    ...(Array.isArray(obrasIds) ? { obra_id: { [Op.in]: obrasIds } } : {}),
    status: { [Op.notIn]: ['CANCELADO', 'ESTORNADO'] }, [Op.or]: ids.flatMap(id => [
      { numero_documento: { [Op.like]: `RHDP-${dados.competencia}-COL-${id}-%` } },
      { numero_documento: `RHDP-${dados.competencia}-COL-${id}` }
    ]) }, attributes: ['id', 'codigo', 'numero_documento', 'status', 'valor_original'], transaction });
}

async function mostrar(req, id) {
  const s = await buscar(req, id);
  const dados = await cadastroAtual(s, dadosDe(s));
  const podeGerenciar = await ehDp(req.user) && (!dados.titulos.length
    || (await auth.canExecuteRhDpFechamento(req.user)
      && await auth.userHasNominalAreaPermission(req.user, ['financeiro.fila_pagamentos.preparar'])));
  return { solicitacao: { ...plain(s), dados_json: dados, situacao: situacaoPagamento(dados, s.situacao) }, responsaveis: (await responsaveis(s.obra_id)).map(plain),
    pagamentos_financeiros: dados.titulos.length ? (await TituloFinanceiro.findAll({
      where: { id: { [Op.in]: dados.titulos.map(t => t.id) } },
      attributes: ['id', 'status', 'valor_baixado', 'status_interno_pagar'] })).map(plain) : [],
    avisos: (await avisosAnteriores(dadosDe(s), undefined, req.user)).map(plain), pode_conferir: await ehDp(req.user),
    pode_gerenciar_solicitacao: podeGerenciar && ['RASCUNHO', 'ABERTA', 'APROVADA', 'ENVIO_PARCIAL', 'EM_REVISAO'].includes(s.situacao),
    pode_excluir_rascunho: s.situacao === 'RASCUNHO' && Number(s.criada_por) === Number(req.user.id)
      && !dados.titulos.length && await auth.userHasAreaPermission(req.user, ['rh_dp.solicitacoes.abrir']),
    pode_enviar_fila: await ehDp(req.user) && await auth.canExecuteRhDpFechamento(req.user)
      && await auth.userHasNominalAreaPermission(req.user, ['financeiro.fila_pagamentos.preparar']) };
}

async function iniciar(req, payload, { persistir = true, transactionExterna = null, novo = false } = {}) {
  const individual = payload.colaborador_id == null ? null : Number(payload.colaborador_id);
  const ids = payload.colaborador_ids == null ? (individual == null ? null : [individual])
    : Array.isArray(payload.colaborador_ids) ? payload.colaborador_ids.map(Number) : [];
  if ((individual != null && (!Number.isSafeInteger(individual) || individual <= 0))
    || (ids && (!ids.length || ids.length > 100 || ids.some(id => !Number.isSafeInteger(id) || id <= 0)
      || new Set(ids).size !== ids.length))
    || (individual != null && (ids.length !== 1 || ids[0] !== individual))) {
    throw new ValidationError('Selecao de colaboradores invalida.');
  }
  const escopo = ids ? [...ids].sort((a, b) => a - b) : null;
  const colaboradorId = escopo?.length === 1 ? escopo[0] : null;
  const preparar = async transaction => {
    // Lock do local serializa a criacao/reabertura do rascunho do mesmo usuario.
    const obra = await exigirLocal(req.user, Number(payload.obra_id), transaction, persistir);
    const lista = await colaboradores(obra.id, transaction);
    if (escopo && escopo.some(id => !lista.some(c => Number(c.id) === id))) {
      throw new ValidationError('O colaborador nao esta ativo neste local.', 409);
    }
    const rascunhos = await RhSolicitacao.findAll({ where: { obra_id: obra.id, criada_por: req.user.id,
      tipo: 'JORNADA', subtipo: FLUXO, situacao: 'RASCUNHO',
      colaborador_id: colaboradorId }, order: [['id', 'DESC']], transaction });
    // Grupos diferentes nao compartilham edicoes nem incluem pessoas ocultas no pagamento.
    // Rascunhos legados continuam consultaveis, sem cortar/regravar suas linhas.
    const existente = rascunhos.find(s => {
      const dados = dadosDe(s);
      if (!escopo) return dados.colaboradores_escopo == null;
      const anteriores = dados.colaboradores_escopo
        || (s.colaborador_id ? (dados.linhas || []).map(l => Number(l.colaborador_id)) : []);
      return JSON.stringify([...anteriores].sort((a, b) => a - b)) === JSON.stringify(escopo);
    });
    if (existente) {
      if (novo) throw new ValidationError('Ja existe um rascunho salvo para este grupo. Reabra antes de editar.', 409);
      return existente.id;
    }
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const plano = { tipo: 'JORNADA', subtipo: FLUXO, obra_id: obra.id,
      colaborador_id: colaboradorId,
      criada_por: req.user.id, setor_origem: codigoDoSetor(req.user), situacao: 'RASCUNHO',
      dados_json: { fluxo_pagamento: FLUXO, solicitacao_independente: true, colaboradores_escopo: escopo,
        revisao: 0, competencia: hoje.slice(0, 7), data_vencimento: hoje,
        linhas: lista.filter(c => !escopo || escopo.includes(Number(c.id))).map(c => atualizarLinhaCadastro({ colaborador_id: c.id, nome: c.nome, cpf: c.cpf,
          empresa_grupo_id: c.empresa_grupo_id, forma_calculo_gerencial: c.forma_calculo_gerencial,
          salario_base: Number(c.salario_base || 0), valor_diaria: Number(c.valor_diaria || 0),
          selecionado: Boolean(escopo),
          dias: c.forma_calculo_gerencial === 'DIARIA' ? 0 : 30, faltas: 0, acrescimos: 0, descontos: 0,
          parcela_40: false, parcela_50: false, parcela_60: false, conferido_obra: false, conferido_dp: false,
          recebimento_personalizado: false,
          conta_salario: recebimento({ modo_recebimento: 'CONTA_SALARIO' }, c, c.pagamento || {}),
          ...recebimento({ modo_recebimento: c.pagamento?.chave_pix || c.pix_chave ? 'PIX' : 'CONTA_SALARIO' }, c, c.pagamento || {}) }, plain(c))) } };
    if (!persistir) return { solicitacao: { ...plano, id: null, codigo: null, dados_json: normalizarAndamento(plano.dados_json) },
      responsaveis: (await responsaveis(obra.id, transaction)).map(plain), pagamentos_financeiros: [],
      avisos: (await avisosAnteriores(plano.dados_json, transaction, req.user)).map(plain),
      pode_conferir: await ehDp(req.user), pode_enviar_fila: await ehDp(req.user)
        && await auth.canExecuteRhDpFechamento(req.user)
        && await auth.userHasNominalAreaPermission(req.user, ['financeiro.fila_pagamentos.preparar']) };
    const s = await RhSolicitacao.create(plano, { transaction });
    await garantirCodigoRhSolicitacao(s, transaction);
    await historico(s, req, 'RASCUNHO', 'Rascunho de pagamento criado.', null, transaction);
    return s.id;
  };
  const resultado = transactionExterna ? await preparar(transactionExterna)
    : persistir ? await sequelize.transaction(preparar) : await preparar(undefined);
  return transactionExterna ? resultado : typeof resultado === 'object' ? resultado : mostrar(req, resultado);
}

async function salvar(req, id, payload, transactionExterna = null) {
  const gravar = async transaction => {
    const s = await buscar(req, id, transaction, true);
    const dp = await ehDp(req.user);
    if (!['RASCUNHO', 'ABERTA', 'APROVADA', 'ENVIO_PARCIAL', 'EM_REVISAO'].includes(s.situacao)
      || (s.situacao === 'RASCUNHO' ? Number(s.criada_por) !== Number(req.user.id) : !dp)) {
      throw new ValidationError('Esta solicitacao nao pode ser alterada por este usuario.', 403);
    }
    const anterior = dadosDe(s);
    if (Number(payload.revisao) !== Number(anterior.revisao)) throw new ValidationError('A solicitacao foi atualizada. Reabra antes de editar.', 409);
    validarPeriodo(payload);
    if (anterior.titulos.length && payload.competencia !== anterior.competencia) {
      throw new ValidationError('A competencia nao pode mudar depois da geracao dos titulos.', 409);
    }
    if (!Array.isArray(payload.linhas) || payload.linhas.length !== anterior.linhas.length) {
      throw new ValidationError('Lista de colaboradores invalida.');
    }
    const porId = new Map(payload.linhas.map(l => [Number(l.colaborador_id), l]));
    if (porId.size !== anterior.linhas.length) throw new ValidationError('Colaborador repetido.');
    const atuais = await cadastroAtual(s, anterior, transaction);
    const cadastroPorId = new Map(atuais.linhas.map(l => [Number(l.colaborador_id), l]));
    const vigentes = s.situacao === 'RASCUNHO' ? await colaboradores(s.obra_id, transaction) : null;
    const ativos = vigentes && new Set(vigentes.map(c => Number(c.id)));
    const responsaveisIds = new Set((await responsaveis(s.obra_id, transaction)).map(r => Number(r.id)));
    const linhas = anterior.linhas.map(original => {
      const l = porId.get(Number(original.colaborador_id));
      if (!l) throw new ValidationError('Colaborador nao pertence a esta solicitacao.');
      if (['ENVIADO', 'CANCELADO'].includes(original.pagamento_estado)) return original;
      const atualizada = cadastroPorId.get(Number(original.colaborador_id));
      exigirCadastroConferido(l, atualizada);
      if (l.selecionado && ativos && !ativos.has(Number(original.colaborador_id))) {
        throw new ValidationError(`${original.nome} nao esta mais ativo neste local. Desmarque-o.`, 409);
      }
      const calculo = calcularLinha(l, atualizada);
      const dadosConta = recebimento(l, atualizada);
      let reembolso = null;
      if (l.reembolso && calculo.descontos > 0) {
        if (!responsaveisIds.has(Number(l.reembolso.responsavel_id))) throw new ValidationError('Selecione um responsavel vigente do local.');
        reembolso = { responsavel_id: Number(l.reembolso.responsavel_id),
          valor: valorReembolso({ nome: original.nome, descontos: calculo.descontos, reembolso: l.reembolso }),
          ...recebimento(l.reembolso, { nome: l.reembolso.favorecido_nome, cpf: l.reembolso.favorecido_documento }) };
      }
      const campos = { selecionado: Boolean(l.selecionado), dias: calculo.dias, faltas: calculo.faltas,
        acrescimos: calculo.acrescimos, descontos: calculo.descontos,
        parcela_40: !calculo.diaria && Boolean(l.parcela_40), parcela_60: !calculo.diaria && Boolean(l.parcela_60),
        parcela_50: !calculo.diaria && Boolean(l.parcela_50),
        observacoes: texto(l.observacoes, 1000), ...dadosConta, reembolso,
        recebimento_personalizado: dadosConta.modo_recebimento === 'OUTRA_CONTA'
          || (dadosConta.modo_recebimento === 'PIX' && !contaIgual(dadosConta, atualizada.pix_cadastro)),
        desconto_sem_reembolso: calculo.descontos > 0 && !reembolso };
      const mudou = Object.keys(campos).some(k => JSON.stringify(campos[k] ?? null)
        !== JSON.stringify((k === 'parcela_50' ? Boolean(original[k]) : original[k]) ?? null));
      // Alterar dados invalida a conferencia anterior. A marcacao explicita pode conferir a nova versao.
      return { ...atualizada, ...campos, ...calculo, cadastro_atualizado: false,
        conferido_obra: dp ? atualizada.conferido_obra : Boolean(l.conferido_obra),
        conferido_dp: dp ? Boolean(l.conferido_dp) && (!mudou || l.conferir_alteracoes === true) : false };
    });
    const dados = { ...anterior, competencia: payload.competencia,
      data_vencimento: payload.data_vencimento, linhas, revisao: Number(anterior.revisao) + 1,
      salvo_por: req.user.id, salvo_em: new Date().toISOString() };
    const situacaoAnterior = s.situacao;
    await s.update({ situacao: situacaoPagamento(dados, s.situacao), dados_json: dados }, { transaction });
    await historico(s, req, 'PAGAMENTO_AJUSTADO', `Pagamento salvo (revisao ${anterior.revisao + 1}).`, situacaoAnterior, transaction);
  };
  if (transactionExterna) { await gravar(transactionExterna); return; }
  await sequelize.transaction(gravar);
  return mostrar(req, id);
}

const preparar = (req, payload) => iniciar(req, payload, { persistir: false });
async function salvarNovo(req, payload) {
  const chave = String(payload.chave_idempotencia || '');
  if (!/^[a-zA-Z0-9-]{16,100}$/.test(chave)) throw new ValidationError('Chave do rascunho invalida.');
  const hash = createHash('sha256').update(JSON.stringify(payload.dados || {})).digest('hex');
  const id = await sequelize.transaction(async transaction => {
    await exigirLocal(req.user, payload.obra_id, transaction, true);
    const pedidos = await RhSolicitacao.findAll({ where: { obra_id: Number(payload.obra_id), criada_por: req.user.id,
      tipo: 'JORNADA', subtipo: FLUXO }, transaction });
    const replay = pedidos.find(s => dadosDe(s).chave_rascunho === chave);
    if (replay) {
      if (dadosDe(replay).hash_rascunho !== hash || dadosDe(replay).rascunho_excluido) {
        throw new ValidationError('O primeiro salvamento ja foi processado. Reabra o pagamento antes de editar.', 409);
      }
      return replay.id;
    }
    const novoId = await iniciar(req, payload, { transactionExterna: transaction, novo: true });
    await salvar(req, novoId, payload.dados || {}, transaction);
    const s = await buscar(req, novoId, transaction);
    await s.update({ dados_json: { ...dadosDe(s), chave_rascunho: chave, hash_rascunho: hash } }, { transaction });
    return novoId;
  });
  return mostrar(req, id);
}

async function excluirRascunho(req, id) {
  return sequelize.transaction(async transaction => {
    const s = await RhSolicitacao.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!s || dadosDe(s).fluxo_pagamento !== FLUXO) throw new ValidationError('Rascunho nao encontrado.', 404);
    await exigirLocal(req.user, s.obra_id, transaction);
    if (Number(s.criada_por) !== Number(req.user.id)) throw new ValidationError('Somente o autor pode excluir este rascunho.', 403);
    if (dadosDe(s).rascunho_excluido) return { id: s.id, excluido: true };
    if (s.situacao !== 'RASCUNHO' || dadosDe(s).titulos.length) {
      throw new ValidationError('Somente rascunhos sem pagamento enviado podem ser excluidos.', 409);
    }
    await s.update({ situacao: 'CANCELADA', dados_json: { ...dadosDe(s), rascunho_excluido: true,
      excluido_por: req.user.id, excluido_em: new Date().toISOString() } }, { transaction });
    await historico(s, req, 'RASCUNHO_EXCLUIDO', 'Rascunho excluido pelo autor; historico preservado.', 'RASCUNHO', transaction);
    return { id: s.id, excluido: true };
  });
}

async function enviar(req, id, payload) {
  await sequelize.transaction(async transaction => {
    const s = await buscar(req, id, transaction, true);
    const d = dadosDe(s);
    const dp = await ehDp(req.user);
    // Repeticao da mesma solicitacao devolve o resultado, nunca cria novos titulos.
    if (Number(payload.revisao) === Number(d.ultima_revisao_envio) || (!dp && s.situacao === 'ABERTA')) return;
    if (Number(payload.revisao) !== Number(d.revisao)) throw new ValidationError('Salve/reabra a versao atual antes de enviar.', 409);
    if (!['RASCUNHO', 'ABERTA', 'APROVADA', 'ENVIO_PARCIAL', 'EM_REVISAO'].includes(s.situacao)
      || (s.situacao === 'RASCUNHO' && Number(s.criada_por) !== Number(req.user.id))
      || (!dp && s.situacao !== 'RASCUNHO')) throw new ValidationError('Envio nao permitido.', 403);
    validarPeriodo(d);
    const selecionados = d.linhas.filter(l => l.selecionado && ['PENDENTE', 'EM_EDICAO'].includes(l.pagamento_estado));
    if (!selecionados.length || selecionados.length > 100) throw new ValidationError('Selecione entre 1 e 100 colaboradores.');
    const atuais = await cadastroAtual(s, d, transaction);
    for (const l of selecionados) exigirCadastroConferido(l, atuais.linhas.find(a => Number(a.colaborador_id) === Number(l.colaborador_id)));
    if (selecionados.some(l => !l[dp ? 'conferido_dp' : 'conferido_obra'])) throw new ValidationError('Marque os colaboradores selecionados como conferidos.');
    await require('../modules/custosRecebiveis/services/bloqueioObraService')
      .assertObrasSemTrava([s.obra_id], 'Pagamento DP por solicitacao');
    if (!dp) {
      const ativos = new Set((await colaboradores(s.obra_id, transaction)).map(c => Number(c.id)));
      if (selecionados.some(l => !ativos.has(Number(l.colaborador_id)))) throw new ValidationError('Um colaborador nao esta mais ativo neste local.', 409);
      await s.update({ situacao: 'ABERTA', dados_json: { ...d, revisao: d.revisao + 1,
        linhas: d.linhas.filter(l => l.selecionado),
        total_colaboradores: selecionados.length, enviado_em: new Date().toISOString() } }, { transaction });
      await historico(s, req, 'ENVIO', 'Pagamento solicitado ao DP.', 'RASCUNHO', transaction);
      return;
    }
    if (!await auth.canExecuteRhDpFechamento(req.user)
      || !await auth.userHasNominalAreaPermission(req.user, ['financeiro.fila_pagamentos.preparar'])) {
      throw new ValidationError('Permissoes de gerar titulos e enviar para a fila obrigatorias.', 403);
    }
    const categoria = await ensureCategoriaFinanceiraPagar(transaction);
    const responsaveisIds = new Set((await responsaveis(s.obra_id, transaction)).map(r => Number(r.id)));
    const formaPix = await FormaPagamentoFinanceira.findOne({ where: { tipo: 'PIX', ativo: true }, transaction });
    const formaConta = await FormaPagamentoFinanceira.findOne({ where: { tipo: 'TRANSFERENCIA', ativo: true }, transaction });
    const revisando = selecionados.filter(l => l.pagamento_estado === 'EM_EDICAO');
    const revisaoService = revisando.length ? require('./rhPagamentoSolicitacaoRevisaoService') : null;
    for (const l of revisando) {
      if (grupoRevisao(d, l.colaborador_id).some(id => !revisando.some(r => Number(r.colaborador_id) === id))) {
        throw new ValidationError('Selecione e confira todos os colaboradores do reembolso em revisao.', 409);
      }
    }
    const registros = revisando.length ? await revisaoService.travar(s, d, revisando.map(l => l.colaborador_id), transaction) : [];
    const titulos = d.titulos.map(t => ({ ...t }));
    const idsEnvio = [];
    const destinos = [];
    for (const l of selecionados) {
      const calculo = calcularLinha(l, l);
      if (calculo.liquido <= 0) throw new ValidationError(`Pagamento de ${l.nome} precisa ser maior que zero.`);
      destinos.push({ linha: l, dados: l, valor: calculo.liquido, sufixo: 'SALARIO', calculo });
      if (l.reembolso && calculo.descontos > 0) {
        if (!responsaveisIds.has(Number(l.reembolso.responsavel_id))) throw new ValidationError('Responsavel do reembolso nao esta mais vigente.', 409);
      }
    }
    destinos.push(...agruparReembolsos(selecionados).map(g => ({ ...g, sufixo: 'REEMBOLSO' })));
    for (const destino of destinos) {
        const l = destino.linha;
        const conta = recebimento(destino.dados, { ...destino.dados,
          nome: destino.dados.favorecido_nome, cpf: destino.dados.favorecido_documento }, {}, true);
        const favorecido = { colaborador: l, favorecidoNome: conta.favorecido_nome,
          favorecidoDocumento: conta.favorecido_documento, chavePix: conta.chave_pix,
          banco: conta.banco, agencia: conta.agencia, conta: conta.conta, tipoConta: conta.tipo_conta,
          usuarioId: req.user.id };
        const parceiro = await syncParceiroFavorecido(favorecido, transaction);
        // Snapshot por titulo: editar a conta deste pedido nao muda pagamentos anteriores.
        const beneficiario = await syncFavorecidoBancarioRh({ ...favorecido, parceiro, isolado: true }, transaction);
        const forma = conta.modo_recebimento === 'PIX' ? formaPix : formaConta;
        if (!forma) throw new ValidationError('Cadastre a forma Pix/Transferencia ativa antes de enviar.', 409);
        const payloadTitulo = buildTituloRhPayload({ apuracao: { competencia: d.competencia, obra_id: s.obra_id },
          item: { colaborador: { id: l.colaborador_id, nome: l.nome }, observacoes: l.observacoes }, parceiro,
          dataVencimento: d.data_vencimento, categoriaFinanceiraId: categoria.id,
          empresaId: l.empresa_grupo_id, usuarioId: req.user.id, valor: destino.valor,
          paymentBeneficiaryId: beneficiario.id });
        const existente = registros.find(r => !idsEnvio.includes(Number(r.ref.id)) && (destino.sufixo === 'SALARIO'
          ? r.ref.tipo === 'SALARIO' && Number(r.ref.colaborador_id) === Number(l.colaborador_id)
          : r.ref.tipo === 'REEMBOLSO' && Number(r.ref.responsavel_id) === Number(destino.responsavel_id)
            && Number(r.titulo.empresa_id) === Number(destino.empresa_id)));
        const dadosTitulo = { ...payloadTitulo, possui_rateio: false,
          forma_pagamento_id: forma.id,
          numero_documento: destino.sufixo === 'REEMBOLSO'
            ? `RHDP-${d.competencia}-SOL-${s.id}-RESP-${destino.responsavel_id}-EMP-${destino.empresa_id}-REEMBOLSO`
            : `RHDP-${d.competencia}-COL-${l.colaborador_id}-SOL-${s.id}-SALARIO`,
          descricao: `${s.codigo} - ${destino.sufixo === 'REEMBOLSO' ? 'Reembolso de vale' : `Salario ${destino.calculo.percentual}%`} - ${conta.favorecido_nome}`.slice(0, 255),
          observacoes: destino.sufixo === 'REEMBOLSO'
            ? `${payloadTitulo.observacoes} | Solicitacao RH: ${s.codigo}\nReembolsos de vale:\n${destino.origens.map(o => `${o.nome} (colaborador #${o.colaborador_id}): R$ ${o.valor.toFixed(2).replace('.', ',')}`).join('\n')}`
            : `${payloadTitulo.observacoes} | Solicitacao RH: ${s.codigo} | Bruto: ${destino.calculo.bruto} | Acrescimos: ${destino.calculo.acrescimos} | Descontos: ${destino.calculo.descontos}` };
        let titulo;
        if (existente) {
          const { criado_por, ...atualizacao } = dadosTitulo;
          titulo = await existente.titulo.update({ ...atualizacao, numero_documento: existente.titulo.numero_documento,
            atualizado_por: req.user.id }, { transaction });
          await revisaoService.sincronizarFila(existente, req, transaction);
        } else titulo = await TituloFinanceiro.create(dadosTitulo, { transaction });
        idsEnvio.push(Number(titulo.id));
        const ref = { id: titulo.id, codigo: titulo.codigo,
          ...(destino.sufixo === 'SALARIO' ? { colaborador_id: l.colaborador_id } : { origens: destino.origens }),
          tipo: destino.sufixo, valor: destino.valor, empresa_id: destino.empresa_id || l.empresa_grupo_id,
          responsavel_id: destino.responsavel_id || null };
        const index = titulos.findIndex(t => Number(t.id) === Number(titulo.id));
        if (index >= 0) titulos[index] = ref; else titulos.push(ref);
    }
    for (const r of registros.filter(r => !idsEnvio.includes(Number(r.ref.id)))) {
      if (r.ref.tipo !== 'REEMBOLSO') throw new ValidationError('Salario em revisao nao foi reenviado.', 409);
      await revisaoService.sincronizarFila(r, req, transaction, { cancelar: true });
      titulos.find(t => Number(t.id) === Number(r.ref.id)).cancelado = true;
    }
    // Mesma transacao: governanca/permissao da fila continuam sendo verificadas pelo servico canonico.
    await require('./pagamentoManualFilaService').enfileirarTitulos(req, {
      titulo_ids: idsEnvio, idempotency_key: `RH-PAGAMENTO-${s.id}-R${d.revisao}` }, { transaction });
    if (registros.length) await revisaoService.auditar(registros, s, req, transaction, 'RESENT', null);
    const anterior = s.situacao;
    const ids = new Set(selecionados.map(l => Number(l.colaborador_id)));
    const dados = { ...d, revisao: d.revisao + 1, ultima_revisao_envio: d.revisao, titulos,
      linhas: d.linhas.map(l => ids.has(Number(l.colaborador_id)) ? { ...l, pagamento_estado: 'ENVIADO', selecionado: false } : l),
      enviado_fila_em: new Date().toISOString() };
    await s.update({ situacao: situacaoPagamento(dados, 'ABERTA'), decidida_por: req.user.id, decidida_em: new Date(),
      dados_json: dados }, { transaction });
    await historico(s, req, revisando.length ? 'PAGAMENTOS_REENVIADOS' : 'TITULOS_GERADOS',
      `${idsEnvio.length} titulo(s) enviado(s) para a fila: ${idsEnvio.join(', ')}. Valores: ${titulos.filter(t => idsEnvio.includes(Number(t.id))).map(t => `${t.codigo}: ${t.valor}`).join('; ')}.`, anterior, transaction);
  });
  return mostrar(req, id);
}

async function revisar(req, id, payload) {
  await sequelize.transaction(async transaction => {
    const s = await buscar(req, id, transaction, true);
    const d = dadosDe(s);
    if (!await ehDp(req.user) || !await auth.canExecuteRhDpFechamento(req.user)
      || !await auth.userHasNominalAreaPermission(req.user, ['financeiro.fila_pagamentos.preparar'])) {
      throw new ValidationError('Permissoes de conferencia, geracao de titulos e fila obrigatorias.', 403);
    }
    if (!['EDITAR', 'CANCELAR'].includes(payload.acao)) throw new ValidationError('Acao de pagamento invalida.');
    const linha = d.linhas.find(l => Number(l.colaborador_id) === Number(payload.colaborador_id));
    if (!linha) throw new ValidationError('Colaborador nao pertence a solicitacao.', 404);
    if (payload.acao === 'CANCELAR' && linha.pagamento_estado === 'CANCELADO') return;
    if (payload.acao === 'EDITAR' && linha.pagamento_estado === 'EM_EDICAO') return;
    if (Number(payload.revisao) !== Number(d.revisao)) throw new ValidationError('A solicitacao foi atualizada. Reabra antes de continuar.', 409);
    if (!['ENVIADO', 'EM_EDICAO'].includes(linha.pagamento_estado)) throw new ValidationError('Pagamento ainda nao enviado para a fila.', 409);
    const motivo = texto(payload.motivo, 500);
    if (!motivo) throw new ValidationError('Informe o motivo da revisao ou cancelamento.');
    const ids = payload.acao === 'EDITAR' ? grupoRevisao(d, linha.colaborador_id) : [Number(linha.colaborador_id)];
    const service = require('./rhPagamentoSolicitacaoRevisaoService');
    const registros = await service.travar(s, d, ids, transaction);
    if (!registros.length) throw new ValidationError('Titulos deste pagamento nao encontrados.', 409);
    const anterior = s.situacao;
    if (payload.acao === 'EDITAR') {
      await service.bloquear(registros, req, transaction);
      d.linhas = d.linhas.map(l => ids.includes(Number(l.colaborador_id))
        ? { ...l, pagamento_estado: 'EM_EDICAO', selecionado: true, conferido_dp: false } : l);
    } else {
      await service.cancelar(registros, { ...d, codigo: s.codigo }, linha.colaborador_id, req, transaction);
      d.linhas = d.linhas.map(l => Number(l.colaborador_id) === Number(linha.colaborador_id)
        ? { ...l, pagamento_estado: 'CANCELADO', selecionado: false, cancelado_por: req.user.id,
          cancelado_em: new Date().toISOString(), motivo_cancelamento: motivo } : l);
    }
    d.revisao = Number(d.revisao) + 1;
    await service.auditar(registros, s, req, transaction, payload.acao === 'EDITAR' ? 'EDIT_LOCKED' : 'CANCELLED', motivo);
    await s.update({ situacao: situacaoPagamento(d, 'ABERTA'), dados_json: d }, { transaction });
    await historico(s, req, payload.acao === 'EDITAR' ? 'PAGAMENTO_EM_REVISAO' : 'PAGAMENTO_CANCELADO',
      `${payload.acao}: colaboradores ${ids.join(', ')}; titulos ${registros.map(r => `${r.titulo.codigo} (${r.ref.valor})`).join(', ')}. Motivo: ${motivo}`, anterior, transaction);
  });
  return mostrar(req, id);
}

// Acao propria, nao um PATCH livre de situacao: nenhum status pode forcar aprovacao/baixa.
async function alterarComposicao(req, id, payload, cancelarTudo) {
  if (!await ehDp(req.user)) throw new ValidationError('Somente o DP autorizado pode remover colaboradores ou cancelar a solicitacao.', 403);
  await sequelize.transaction(async transaction => {
    const s = await buscar(req, id, transaction, true);
    const d = dadosDe(s);
    if (d.titulos.length && (!await auth.canExecuteRhDpFechamento(req.user)
      || !await auth.userHasNominalAreaPermission(req.user, ['financeiro.fila_pagamentos.preparar']))) {
      throw new ValidationError('Permissoes de geracao de titulos e fila obrigatorias para cancelar pagamentos.', 403);
    }
    const motivo = texto(payload.motivo, 500);
    if (!motivo) throw new ValidationError('Informe o motivo.');
    const linha = cancelarTudo ? null : d.linhas.find(l => Number(l.colaborador_id) === Number(payload.colaborador_id));
    if (!cancelarTudo && !linha) throw new ValidationError('Colaborador nao pertence a solicitacao.', 404);
    if (cancelarTudo ? Boolean(d.cancelamento_dp) : Boolean(linha.removido_em)) return;
    if (!['RASCUNHO', 'ABERTA', 'APROVADA', 'ENVIO_PARCIAL', 'EM_REVISAO', 'CANCELADA'].includes(s.situacao)
      || (!cancelarTudo && s.situacao === 'CANCELADA')) throw new ValidationError('Esta solicitacao nao permite esta acao.', 409);
    if (Number(payload.revisao) !== Number(d.revisao)) throw new ValidationError('A solicitacao foi atualizada. Reabra antes de continuar.', 409);
    const ids = cancelarTudo ? d.linhas.map(l => Number(l.colaborador_id)) : [Number(linha.colaborador_id)];
    if (d.linhas.some(l => ids.includes(Number(l.colaborador_id)) && ['ENVIADO', 'EM_EDICAO'].includes(l.pagamento_estado)
      && !d.titulos.some(t => !t.cancelado && t.tipo === 'SALARIO' && Number(t.colaborador_id) === Number(l.colaborador_id)))) {
      throw new ValidationError('Titulo do pagamento enviado nao encontrado. Confira o financeiro antes de cancelar.', 409);
    }
    const service = require('./rhPagamentoSolicitacaoRevisaoService');
    // Toda a validacao ocorre antes de cancelar qualquer titulo. Baixa concorrente
    // serializa nos locks canonicos titulo->fila; estornos concluidos ficam intactos.
    const registros = await service.travar(s, d, ids, transaction, { permitirEstornoConcluido: true });
    if (cancelarTudo) {
      const ativos = d.titulos.filter(t => !t.cancelado);
      if (registros.length !== ativos.length) throw new ValidationError('Existem titulos sem vinculo seguro com os colaboradores. Confira antes de cancelar.', 409);
      for (const r of registros) {
        r.ref.cancelado = true;
        await service.sincronizarFila(r, req, transaction, { cancelar: true });
      }
    } else await service.cancelar(registros, { ...d, codigo: s.codigo }, linha.colaborador_id, req, transaction);
    const evento = { usuario_id: req.user.id, em: new Date().toISOString(), motivo };
    const anteriores = s.situacao;
    d.linhas = d.linhas.map(l => ids.includes(Number(l.colaborador_id)) ? { ...l,
      pagamento_estado: 'CANCELADO', selecionado: false, conferido_dp: false, conferido_obra: false,
      cancelado_por: req.user.id, cancelado_em: evento.em, motivo_cancelamento: motivo,
      ...(!cancelarTudo ? { removido_em: evento.em, removido_por: req.user.id, motivo_remocao: motivo } : {}) } : l);
    d.revisao = Number(d.revisao) + 1;
    if (cancelarTudo) d.cancelamento_dp = evento;
    await service.auditar(registros, s, req, transaction, cancelarTudo ? 'REQUEST_CANCELLED' : 'EMPLOYEE_REMOVED', motivo);
    await s.update({ situacao: cancelarTudo || d.linhas.every(l => l.pagamento_estado === 'CANCELADO')
      ? 'CANCELADA' : situacaoPagamento(d, s.situacao), dados_json: d }, { transaction });
    await historico(s, req, cancelarTudo ? 'SOLICITACAO_PAGAMENTO_CANCELADA' : 'COLABORADOR_REMOVIDO',
      `${cancelarTudo ? 'Solicitacao inteira cancelada' : `Colaborador removido: ${linha.nome} (#${linha.colaborador_id})`}. Motivo: ${motivo}. Titulos afetados: ${registros.map(r => r.titulo.codigo || r.titulo.id).join(', ') || 'nenhum'}.`, anteriores, transaction);
  });
  return mostrar(req, id);
}
const removerColaborador = (req, id, payload) => alterarComposicao(req, id, payload, false);
const cancelarSolicitacaoPagamento = (req, id, payload) => alterarComposicao(req, id, payload, true);
module.exports = { iniciar, preparar, salvarNovo, excluirRascunho, mostrar, salvar, enviar, revisar, ehDp,
  removerColaborador, cancelarSolicitacaoPagamento };
