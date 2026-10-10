'use strict';

const { Op } = require('sequelize');
const { sequelize, RhSolicitacao, RhSolicitacaoHistorico, RhColaborador, RhColaboradorPagamento,
  Obra, CrResponsavelObra, User, TituloFinanceiro, FormaPagamentoFinanceira } = require('../models');
const { ValidationError } = require('../middlewares/validation');
const auth = require('./authorizationService');
const { userBelongsToDpSetor } = require('./setorCapabilityService');
const { codigoDoSetor } = require('../utils/codigoDoSetor');
const { garantirCodigoRhSolicitacao } = require('./rhSolicitacaoCodigoService');
const { FLUXO, calcularLinha, recebimento, validarPeriodo, texto } = require('./rhPagamentoSolicitacaoDomain');
const { ensureCategoriaFinanceiraPagar, syncParceiroFavorecido, syncFavorecidoBancarioRh,
  buildTituloRhPayload } = require('./rhFechamentoService');

const dadosDe = s => typeof s.dados_json === 'string' ? JSON.parse(s.dados_json) : s.dados_json || {};
const plain = s => s?.get ? s.get({ plain: true }) : s;
async function ehDp(user) {
  return (auth.isBusinessAdmin(user) || await userBelongsToDpSetor(user))
    && await auth.canEditRhDpApuracao(user);
}

async function exigirLocal(user, obraId, transaction, bloquear = false) {
  const estrito = await auth.getRhDpObraScopeIds(user);
  const ids = Array.isArray(estrito) ? estrito
    : await auth.userHasAreaPermission(user, ['rh_dp.solicitacoes.ver_todas']) ? null : await auth.getUserObraIds(user);
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
    : await auth.userHasAreaPermission(user, ['rh_dp.solicitacoes.ver_todas']) ? null : await auth.getUserObraIds(user);
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
  return { solicitacao: plain(s), responsaveis: (await responsaveis(s.obra_id)).map(plain),
    avisos: (await avisosAnteriores(dadosDe(s), undefined, req.user)).map(plain), pode_conferir: await ehDp(req.user),
    pode_enviar_fila: await ehDp(req.user) && await auth.canExecuteRhDpFechamento(req.user)
      && await auth.userHasNominalAreaPermission(req.user, ['financeiro.fila_pagamentos.preparar']) };
}

async function iniciar(req, payload) {
  const id = await sequelize.transaction(async transaction => {
    // Lock do local serializa a criacao/reabertura do rascunho do mesmo usuario.
    const obra = await exigirLocal(req.user, Number(payload.obra_id), transaction, true);
    const existente = await RhSolicitacao.findOne({ where: { obra_id: obra.id, criada_por: req.user.id,
      tipo: 'JORNADA', subtipo: FLUXO, situacao: 'RASCUNHO',
      colaborador_id: payload.colaborador_id ? Number(payload.colaborador_id) : null }, transaction });
    if (existente) return existente.id;
    const lista = await colaboradores(obra.id, transaction);
    if (payload.colaborador_id && !lista.some(c => Number(c.id) === Number(payload.colaborador_id))) {
      throw new ValidationError('O colaborador nao esta ativo neste local.', 409);
    }
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const s = await RhSolicitacao.create({ tipo: 'JORNADA', subtipo: FLUXO, obra_id: obra.id,
      colaborador_id: payload.colaborador_id ? Number(payload.colaborador_id) : null,
      criada_por: req.user.id, setor_origem: codigoDoSetor(req.user), situacao: 'RASCUNHO',
      dados_json: { fluxo_pagamento: FLUXO, solicitacao_independente: true, revisao: 0, competencia: hoje.slice(0, 7), data_vencimento: hoje,
        linhas: lista.map(c => ({ colaborador_id: c.id, nome: c.nome, cpf: c.cpf,
          empresa_grupo_id: c.empresa_grupo_id, forma_calculo_gerencial: c.forma_calculo_gerencial,
          salario_base: Number(c.salario_base || 0), valor_diaria: Number(c.valor_diaria || 0),
          selecionado: Boolean(payload.colaborador_id && Number(payload.colaborador_id) === Number(c.id)),
          dias: c.forma_calculo_gerencial === 'DIARIA' ? 0 : 30, faltas: 0, acrescimos: 0, descontos: 0,
          parcela_40: false, parcela_60: false, conferido_obra: false, conferido_dp: false,
          conta_salario: recebimento({ modo_recebimento: 'CONTA_SALARIO' }, c, c.pagamento || {}),
          ...recebimento({ modo_recebimento: c.pagamento?.chave_pix || c.pix_chave ? 'PIX' : 'CONTA_SALARIO' }, c, c.pagamento || {}) })) } }, { transaction });
    await garantirCodigoRhSolicitacao(s, transaction);
    await historico(s, req, 'RASCUNHO', 'Rascunho de pagamento criado.', null, transaction);
    return s.id;
  });
  return mostrar(req, id);
}

async function salvar(req, id, payload) {
  await sequelize.transaction(async transaction => {
    const s = await buscar(req, id, transaction, true);
    const dp = await ehDp(req.user);
    if (!['RASCUNHO', 'ABERTA'].includes(s.situacao)
      || (s.situacao === 'RASCUNHO' ? Number(s.criada_por) !== Number(req.user.id) : !dp)) {
      throw new ValidationError('Esta solicitacao nao pode ser alterada por este usuario.', 403);
    }
    const anterior = dadosDe(s);
    if (Number(payload.revisao) !== Number(anterior.revisao)) throw new ValidationError('A solicitacao foi atualizada. Reabra antes de editar.', 409);
    validarPeriodo(payload);
    if (!Array.isArray(payload.linhas) || payload.linhas.length !== anterior.linhas.length) {
      throw new ValidationError('Lista de colaboradores invalida.');
    }
    const porId = new Map(payload.linhas.map(l => [Number(l.colaborador_id), l]));
    if (porId.size !== anterior.linhas.length) throw new ValidationError('Colaborador repetido.');
    const vigentes = s.situacao === 'RASCUNHO' ? await colaboradores(s.obra_id, transaction) : null;
    const ativos = vigentes && new Set(vigentes.map(c => Number(c.id)));
    const responsaveisIds = new Set((await responsaveis(s.obra_id, transaction)).map(r => Number(r.id)));
    const linhas = anterior.linhas.map(original => {
      const l = porId.get(Number(original.colaborador_id));
      if (!l) throw new ValidationError('Colaborador nao pertence a esta solicitacao.');
      if (l.selecionado && ativos && !ativos.has(Number(original.colaborador_id))) {
        throw new ValidationError(`${original.nome} nao esta mais ativo neste local. Desmarque-o.`, 409);
      }
      const calculo = calcularLinha(l, original);
      const dadosConta = recebimento(l, original);
      let reembolso = null;
      if (l.reembolso && l.selecionado && calculo.descontos > 0) {
        if (!responsaveisIds.has(Number(l.reembolso.responsavel_id))) throw new ValidationError('Selecione um responsavel vigente do local.');
        reembolso = { responsavel_id: Number(l.reembolso.responsavel_id),
          ...recebimento(l.reembolso, { nome: l.reembolso.favorecido_nome, cpf: l.reembolso.favorecido_documento }) };
      }
      const campos = { selecionado: Boolean(l.selecionado), dias: calculo.dias, faltas: calculo.faltas,
        acrescimos: calculo.acrescimos, descontos: calculo.descontos,
        parcela_40: !calculo.diaria && Boolean(l.parcela_40), parcela_60: !calculo.diaria && Boolean(l.parcela_60),
        observacoes: texto(l.observacoes, 1000), ...dadosConta, reembolso,
        desconto_sem_reembolso: Boolean(l.desconto_sem_reembolso) };
      const mudou = Object.keys(campos).some(k => JSON.stringify(campos[k] ?? null) !== JSON.stringify(original[k] ?? null));
      // Alterar dados invalida a conferencia anterior. A marcacao explicita pode conferir a nova versao.
      return { ...original, ...campos, ...calculo,
        conferido_obra: dp ? original.conferido_obra : Boolean(l.conferido_obra),
        conferido_dp: dp ? Boolean(l.conferido_dp) && (!mudou || l.conferir_alteracoes === true) : false };
    });
    await s.update({ dados_json: { ...anterior, competencia: payload.competencia,
      data_vencimento: payload.data_vencimento, linhas, revisao: Number(anterior.revisao) + 1,
      salvo_por: req.user.id, salvo_em: new Date().toISOString() } }, { transaction });
    await historico(s, req, 'PAGAMENTO_AJUSTADO', `Pagamento salvo (revisao ${anterior.revisao + 1}).`, s.situacao, transaction);
  });
  return mostrar(req, id);
}

async function enviar(req, id, payload) {
  await sequelize.transaction(async transaction => {
    const s = await buscar(req, id, transaction, true);
    const d = dadosDe(s);
    const dp = await ehDp(req.user);
    // Repeticao da mesma solicitacao devolve o resultado, nunca cria novos titulos.
    if (s.situacao === 'APROVADA' || (!dp && s.situacao === 'ABERTA')) return;
    if (Number(payload.revisao) !== Number(d.revisao)) throw new ValidationError('Salve/reabra a versao atual antes de enviar.', 409);
    if (!['RASCUNHO', 'ABERTA'].includes(s.situacao)
      || (s.situacao === 'RASCUNHO' && Number(s.criada_por) !== Number(req.user.id))
      || (!dp && s.situacao !== 'RASCUNHO')) throw new ValidationError('Envio nao permitido.', 403);
    validarPeriodo(d);
    const selecionados = d.linhas.filter(l => l.selecionado);
    if (!selecionados.length || selecionados.length > 100) throw new ValidationError('Selecione entre 1 e 100 colaboradores.');
    if (selecionados.some(l => !l[dp ? 'conferido_dp' : 'conferido_obra'])) throw new ValidationError('Marque os colaboradores selecionados como conferidos.');
    await require('../modules/custosRecebiveis/services/bloqueioObraService')
      .assertObrasSemTrava([s.obra_id], 'Pagamento DP por solicitacao');
    if (!dp) {
      const ativos = new Set((await colaboradores(s.obra_id, transaction)).map(c => Number(c.id)));
      if (selecionados.some(l => !ativos.has(Number(l.colaborador_id)))) throw new ValidationError('Um colaborador nao esta mais ativo neste local.', 409);
      await s.update({ situacao: 'ABERTA', dados_json: { ...d, revisao: d.revisao + 1,
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
    const titulos = [];
    for (const l of selecionados) {
      const calculo = calcularLinha(l, l);
      if (calculo.liquido <= 0) throw new ValidationError(`Pagamento de ${l.nome} precisa ser maior que zero.`);
      const destinos = [{ dados: l, valor: calculo.liquido, sufixo: 'SALARIO' }];
      if (l.reembolso && calculo.descontos > 0) {
        if (!responsaveisIds.has(Number(l.reembolso.responsavel_id))) throw new ValidationError('Responsavel do reembolso nao esta mais vigente.', 409);
        destinos.push({ dados: l.reembolso, valor: calculo.descontos, sufixo: 'REEMBOLSO' });
      }
      for (const destino of destinos) {
        const conta = recebimento(destino.dados, { ...destino.dados,
          nome: destino.dados.favorecido_nome, cpf: destino.dados.favorecido_documento }, {}, true);
        const favorecido = { colaborador: l, favorecidoNome: conta.favorecido_nome,
          favorecidoDocumento: conta.favorecido_documento, chavePix: conta.chave_pix,
          banco: conta.banco, agencia: conta.agencia, conta: conta.conta, tipoConta: conta.tipo_conta,
          usuarioId: req.user.id };
        const parceiro = await syncParceiroFavorecido(favorecido, transaction);
        const beneficiario = await syncFavorecidoBancarioRh({ ...favorecido, parceiro }, transaction);
        const forma = conta.modo_recebimento === 'PIX' ? formaPix : formaConta;
        if (!forma) throw new ValidationError('Cadastre a forma Pix/Transferencia ativa antes de enviar.', 409);
        const payloadTitulo = buildTituloRhPayload({ apuracao: { competencia: d.competencia, obra_id: s.obra_id },
          item: { colaborador: { id: l.colaborador_id, nome: l.nome }, observacoes: l.observacoes }, parceiro,
          dataVencimento: d.data_vencimento, categoriaFinanceiraId: categoria.id,
          empresaId: l.empresa_grupo_id, usuarioId: req.user.id, valor: destino.valor,
          paymentBeneficiaryId: beneficiario.id });
        const titulo = await TituloFinanceiro.create({ ...payloadTitulo, possui_rateio: false,
          forma_pagamento_id: forma.id,
          numero_documento: `RHDP-${d.competencia}-COL-${l.colaborador_id}-SOL-${s.id}-${destino.sufixo}`,
          descricao: `${s.codigo} - ${destino.sufixo === 'REEMBOLSO' ? 'Reembolso de vale' : `Salario ${calculo.percentual}%`} - ${conta.favorecido_nome}`.slice(0, 255),
          observacoes: `${payloadTitulo.observacoes} | Solicitacao RH: ${s.codigo} | Bruto: ${calculo.bruto} | Acrescimos: ${calculo.acrescimos} | Descontos: ${calculo.descontos}` }, { transaction });
        titulos.push({ id: titulo.id, codigo: titulo.codigo, colaborador_id: l.colaborador_id,
          tipo: destino.sufixo, valor: destino.valor, responsavel_id: destino.dados.responsavel_id || null });
      }
    }
    // Mesma transacao: governanca/permissao da fila continuam sendo verificadas pelo servico canonico.
    await require('./pagamentoManualFilaService').enfileirarTitulos(req, {
      titulo_ids: titulos.map(t => t.id), idempotency_key: `RH-PAGAMENTO-${s.id}` }, { transaction });
    const anterior = s.situacao;
    await s.update({ situacao: 'APROVADA', decidida_por: req.user.id, decidida_em: new Date(),
      dados_json: { ...d, revisao: d.revisao + 1, titulos, enviado_fila_em: new Date().toISOString() } }, { transaction });
    await historico(s, req, 'TITULOS_GERADOS', `${titulos.length} titulo(s) criado(s) e enviado(s) para a fila.`, anterior, transaction);
  });
  return mostrar(req, id);
}

module.exports = { iniciar, mostrar, salvar, enviar, ehDp };
