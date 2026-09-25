'use strict';

const { Op } = require('sequelize');
const {
  Anexo,
  CategoriaFinanceira,
  Historico,
  Parceiro,
  RhColaborador,
  RhTicketLote,
  RhTicketLoteItem,
  Solicitacao,
  StatusArea,
  TipoSolicitacao,
  TituloFinanceiro,
  TituloFinanceiroRateio,
  sequelize
} = require('../models');
const gerarCodigoSolicitacao = require('./solicitacao/gerarCodigo');
const { uploadToS3 } = require('./s3');
const { ValidationError } = require('../middlewares/validation');

function moeda(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function competenciaValida(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''));
}

function vencimentoPadrao(competencia) {
  if (!competenciaValida(competencia)) throw new ValidationError('Informe a competencia no formato AAAA-MM.');
  const data = new Date(`${competencia}-10T12:00:00.000Z`);
  while ([0, 6].includes(data.getUTCDay())) data.setUTCDate(data.getUTCDate() - 1);
  return data.toISOString().slice(0, 10);
}

function statusDoLote(lote) {
  const titulo = lote.titulo;
  if (!titulo) return lote.status;
  if (String(titulo.status).toUpperCase() === 'CANCELADO') return 'CANCELADO';
  if (String(titulo.status).toUpperCase() === 'QUITADO' || Number(titulo.valor_saldo || 0) <= 0) return 'PAGO';
  if (String(titulo.status).toUpperCase() === 'ABERTO') return 'NA_FILA';
  return 'SOLICITADO';
}

async function garantirTipoSolicitacaoTicket(transaction) {
  const chaveLock = 'fluxy_rh_dp_tipo_ticket';
  const [locks] = await sequelize.query(
    'SELECT GET_LOCK(:chave, 10) AS adquirido',
    { replacements: { chave: chaveLock }, transaction }
  );
  if (Number(locks?.[0]?.adquirido) !== 1) {
    throw new ValidationError('Nao foi possivel preparar o tipo de solicitacao do ticket. Tente novamente.', 409);
  }

  try {
    const existente = await TipoSolicitacao.findOne({
      where: { codigo_interno: 'TICKET_COLABORADORES' },
      transaction
    });
    if (existente) {
      if (!existente.ativo) await existente.update({ ativo: true }, { transaction });
      return existente;
    }
    return TipoSolicitacao.create({
      nome: 'TICKET DE COLABORADORES',
      codigo_interno: 'TICKET_COLABORADORES',
      comportamento: JSON.stringify({ somente_sistema: true, fluxo: 'RH_DP_TICKET' }),
      disponivel_para_obras: false,
      ativo: true
    }, { transaction });
  } finally {
    await sequelize.query(
      'SELECT RELEASE_LOCK(:chave) AS liberado',
      { replacements: { chave: chaveLock }, transaction }
    );
  }
}

async function listarStatusTicket({ competencia, colaboradorIds = [] }) {
  if (!competenciaValida(competencia)) throw new ValidationError('Informe a competencia no formato AAAA-MM.');
  const whereItem = {};
  const ids = [...new Set((colaboradorIds || []).map(Number).filter((id) => id > 0))];
  if (ids.length) whereItem.colaborador_id = { [Op.in]: ids };
  const itens = await RhTicketLoteItem.findAll({
    where: whereItem,
    include: [{
      model: RhTicketLote,
      as: 'lote',
      required: true,
      where: { competencia },
      include: [{ model: TituloFinanceiro, as: 'titulo', required: false }]
    }],
    order: [['id', 'DESC']]
  });
  const porColaborador = new Map();
  itens.forEach((item) => {
    if (!porColaborador.has(Number(item.colaborador_id))) {
      porColaborador.set(Number(item.colaborador_id), {
        colaborador_id: Number(item.colaborador_id),
        lote_id: Number(item.lote_id),
        solicitacao_id: Number(item.lote.solicitacao_id),
        valor_ticket: moeda(item.valor_ticket),
        status: statusDoLote(item.lote)
      });
    }
  });
  return [...porColaborador.values()];
}

async function criarLoteTicket(dados, arquivo, usuario) {
  const competencia = String(dados.competencia || '').trim();
  if (!competenciaValida(competencia)) throw new ValidationError('Informe a competencia no formato AAAA-MM.');
  const colaboradorIds = [...new Set((dados.colaborador_ids || []).map(Number).filter((id) => id > 0))];
  const idempotencyKey = String(dados.idempotency_key || '').trim();
  if (!/^[A-Za-z0-9._:-]{12,80}$/.test(idempotencyKey)) throw new ValidationError('Chave de idempotencia do lote invalida.');
  if (!colaboradorIds.length) throw new ValidationError('Selecione ao menos um colaborador para o lote de ticket.');
  const carregarReplay = async () => {
    const existente = await RhTicketLote.findOne({ where: { idempotency_key: idempotencyKey } });
    if (!existente) return null;
    const [solicitacao, titulo] = await Promise.all([
      Solicitacao.findByPk(existente.solicitacao_id),
      TituloFinanceiro.findByPk(existente.titulo_financeiro_id)
    ]);
    return { lote: existente, solicitacao, titulo, total: moeda(existente.valor_total), data_vencimento: existente.data_vencimento, idempotent_replay: true };
  };
  const replay = await carregarReplay();
  if (replay) return replay;

  if (!arquivo) throw new ValidationError('Anexe o boleto do lote de ticket.');
  const parceiroId = Number(dados.parceiro_id);
  const categoriaId = Number(dados.categoria_financeira_id);
  if (!parceiroId || !categoriaId) throw new ValidationError('Informe o fornecedor e a categoria financeira do ticket.');

  const vencimentoAutomatico = vencimentoPadrao(competencia);
  const dataVencimento = String(dados.data_vencimento || vencimentoAutomatico);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataVencimento) || dataVencimento > `${competencia}-10`) {
    throw new ValidationError('O vencimento do ticket deve ser o dia 10 ou uma data anterior por antecipacao.');
  }

  const arquivoUrl = await uploadToS3(arquivo, `rh/tickets/${competencia}`);
  try {
    return await sequelize.transaction(async (transaction) => {
    const [colaboradores, parceiro, categoria] = await Promise.all([
      RhColaborador.findAll({
        where: { id: { [Op.in]: colaboradorIds }, status: 'ATIVO' },
        order: [['id', 'ASC']],
        transaction,
        lock: transaction.LOCK.UPDATE
      }),
      Parceiro.findByPk(parceiroId, { transaction }),
      CategoriaFinanceira.findByPk(categoriaId, { transaction })
    ]);
    if (colaboradores.length !== colaboradorIds.length) throw new ValidationError('Um ou mais colaboradores nao estao ativos ou nao foram encontrados.');
    if (!parceiro) throw new ValidationError('Fornecedor do ticket nao encontrado.');
    if (!categoria) throw new ValidationError('Categoria financeira nao encontrada.');
    const tipo = await garantirTipoSolicitacaoTicket(transaction);
    const empresaIds = [...new Set(colaboradores.map((c) => Number(c.empresa_grupo_id)))];
    if (empresaIds.length !== 1) throw new ValidationError('Gere um lote de ticket por empresa.');
    if (colaboradores.some((c) => !c.obra_id)) throw new ValidationError('Todos os colaboradores selecionados precisam estar lotados em uma obra.');
    if (colaboradores.some((c) => !(Number(c.valor_ticket) > 0))) throw new ValidationError('Todos os selecionados precisam ter valor de ticket maior que zero.');

    const duplicados = await RhTicketLoteItem.findAll({
      where: { colaborador_id: { [Op.in]: colaboradorIds } },
      include: [{ model: RhTicketLote, as: 'lote', required: true, where: { competencia, status: { [Op.ne]: 'CANCELADO' } } }],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (duplicados.length) throw new ValidationError('Um ou mais colaboradores ja possuem ticket solicitado nesta competencia.', 409);

    const total = moeda(colaboradores.reduce((soma, c) => soma + Number(c.valor_ticket || 0), 0));
    const codigo = await gerarCodigoSolicitacao();
    const obraRepresentante = Number(colaboradores[0].obra_id);
    const solicitacao = await Solicitacao.create({
      codigo,
      obra_id: obraRepresentante,
      parceiro_id: parceiroId,
      tipo_solicitacao_id: tipo.id,
      descricao: `Ticket de colaboradores ${competencia} - ${colaboradores.length} colaborador(es)`,
      justificativa: 'Lote de beneficio gerado pelo Departamento Pessoal.',
      valor: total,
      status_global: 'PENDENTE',
      area_responsavel: 'GEO',
      criado_por: usuario.id,
      data_vencimento: dataVencimento
    }, { transaction });
    await Promise.all([
      StatusArea.create({ solicitacao_id: solicitacao.id, setor: 'GEO', status: 'PENDENTE', observacao: 'Ticket aguardando conferencia do GEO.' }, { transaction }),
      Historico.create({ solicitacao_id: solicitacao.id, usuario_responsavel_id: usuario.id, setor: 'GEO', acao: 'SOLICITACAO_CRIADA', status_novo: 'PENDENTE', observacao: 'Lote de ticket criado pelo DP.' }, { transaction }),
      Anexo.create({ solicitacao_id: solicitacao.id, tipo: 'BOLETO_TICKET', nome_original: arquivo.originalname, caminho_arquivo: arquivoUrl, area_origem: 'DP', uploaded_by: usuario.id }, { transaction })
    ]);

    const titulo = await TituloFinanceiro.create({
      solicitacao_id: solicitacao.id,
      obra_id: null,
      empresa_id: empresaIds[0],
      parceiro_id: parceiroId,
      categoria_financeira_id: categoriaId,
      competencia_data: `${competencia}-01`,
      considera_dre: true,
      possui_rateio: true,
      origem_titulo: 'RH_DP_TICKET',
      tipo: 'PAGAR',
      status: 'PREVISAO',
      descricao: `Ticket colaboradores ${competencia}`,
      numero_documento: codigo,
      valor_original: total,
      valor_bruto: total,
      valor_impostos: 0,
      valor_liquido: total,
      valor_saldo: total,
      valor_baixado: 0,
      data_emissao: new Date().toISOString().slice(0, 10),
      data_vencimento: dataVencimento,
      criado_por: usuario.id,
      atualizado_por: usuario.id
    }, { transaction });

    const lote = await RhTicketLote.create({
      competencia,
      idempotency_key: idempotencyKey,
      empresa_grupo_id: empresaIds[0],
      parceiro_id: parceiroId,
      categoria_financeira_id: categoriaId,
      solicitacao_id: solicitacao.id,
      titulo_financeiro_id: titulo.id,
      data_vencimento: dataVencimento,
      valor_total: total,
      status: 'SOLICITADO',
      criado_por: usuario.id,
      atualizado_por: usuario.id
    }, { transaction });
    await RhTicketLoteItem.bulkCreate(colaboradores.map((c) => ({
      lote_id: lote.id,
      colaborador_id: c.id,
      obra_id: c.obra_id,
      valor_ticket: moeda(c.valor_ticket)
    })), { transaction });

    const porObra = new Map();
    colaboradores.forEach((c) => porObra.set(Number(c.obra_id), moeda((porObra.get(Number(c.obra_id)) || 0) + Number(c.valor_ticket))));
    await TituloFinanceiroRateio.bulkCreate([...porObra.entries()].map(([obraId, valor]) => ({
      titulo_financeiro_id: titulo.id,
      obra_id: obraId,
      tipo_rateio: 'VALOR',
      percentual: total > 0 ? Number(((valor / total) * 100).toFixed(6)) : 0,
      valor_rateio: valor,
      observacoes: 'Rateio automatico do ticket pela lotacao atual dos colaboradores.',
      criado_por: usuario.id,
      atualizado_por: usuario.id
    })), { transaction });
      return { lote, solicitacao, titulo, total, data_vencimento: dataVencimento };
    });
  } catch (error) {
    // Dois cliques concorrentes com a mesma chave podem atravessar a leitura inicial. A restricao
    // unica no banco vence a corrida; o segundo retorno passa a ser o replay do primeiro lote.
    if (error?.name === 'SequelizeUniqueConstraintError') {
      const replayConcorrente = await carregarReplay();
      if (replayConcorrente) return replayConcorrente;
    }
    throw error;
  }
}

async function sincronizarTicketComSolicitacao(solicitacaoId, status, usuarioId = null, transactionAtual = null) {
  const normalizado = String(status || '').trim().toUpperCase();
  if (!['LIBERADO', 'APROVADA', 'CANCELADA', 'REJEITADA'].includes(normalizado)) return null;
  const executar = async (transaction) => {
    const lote = await RhTicketLote.findOne({
      where: { solicitacao_id: Number(solicitacaoId) },
      include: [{ model: TituloFinanceiro, as: 'titulo' }],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!lote?.titulo) return null;
    if (['LIBERADO', 'APROVADA'].includes(normalizado) && lote.titulo.status === 'PREVISAO') {
      await lote.titulo.update({ status: 'ABERTO', atualizado_por: usuarioId }, { transaction });
      await lote.update({ status: 'NA_FILA', atualizado_por: usuarioId }, { transaction });
      return 'NA_FILA';
    }
    if (['CANCELADA', 'REJEITADA'].includes(normalizado) && Number(lote.titulo.valor_baixado || 0) <= 0) {
      await lote.titulo.update({ status: 'CANCELADO', valor_saldo: 0, atualizado_por: usuarioId }, { transaction });
      await lote.update({ status: 'CANCELADO', atualizado_por: usuarioId }, { transaction });
      return 'CANCELADO';
    }
    return null;
  };
  return transactionAtual ? executar(transactionAtual) : sequelize.transaction(executar);
}

module.exports = { criarLoteTicket, listarStatusTicket, sincronizarTicketComSolicitacao, vencimentoPadrao };
