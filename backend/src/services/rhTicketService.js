'use strict';

const { Op } = require('sequelize');
const { createHash } = require('crypto');
const {
  Anexo,
  CategoriaFinanceira,
  FormaPagamentoFinanceira,
  Historico,
  Parceiro,
  RhColaborador,
  RhColaboradorPagamento,
  RhTicketLote,
  RhTicketLoteItem,
  Solicitacao,
  SolicitacaoFavorecido,
  StatusArea,
  TipoSolicitacao,
  TituloFinanceiro,
  TituloFinanceiroRateio,
  sequelize
} = require('../models');
const gerarCodigoSolicitacao = require('./solicitacao/gerarCodigo');
const { uploadToS3 } = require('./s3');
const { ValidationError } = require('../middlewares/validation');
const { syncParceiroFavorecido, syncFavorecidoBancarioRh } = require('./rhFechamentoService');
const { getRhDpObraScopeIds } = require('./authorizationService');

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

function statusDoLote(lote, titulo = lote.titulo) {
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
    include: [{ model: TituloFinanceiro, as: 'titulo', required: false }, {
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
        status: statusDoLote(item.lote, item.titulo || item.lote.titulo)
      });
    }
  });
  return [...porColaborador.values()];
}

async function criarLoteTicket(dados, arquivo, usuario) {
  const competencia = String(dados.competencia || '').trim();
  if (!competenciaValida(competencia)) throw new ValidationError('Informe a competencia no formato AAAA-MM.');
  if (!Array.isArray(dados.colaborador_ids) || dados.colaborador_ids.some(id => !Number.isSafeInteger(Number(id)) || Number(id) <= 0)) {
    throw new ValidationError('Lista de colaboradores do lote invalida.');
  }
  const colaboradorIds = [...new Set(dados.colaborador_ids.map(Number))].sort((a, b) => a - b);
  const idempotencyKey = String(dados.idempotency_key || '').trim();
  if (!/^[A-Za-z0-9._:-]{12,80}$/.test(idempotencyKey)) throw new ValidationError('Chave de idempotencia do lote invalida.');
  if (!colaboradorIds.length) throw new ValidationError('Selecione ao menos um colaborador para o lote de ticket.');
  const formaPagamento = String(dados.forma_pagamento || 'BOLETO').trim().toUpperCase();
  if (!['BOLETO', 'PIX'].includes(formaPagamento)) throw new ValidationError('Selecione Boleto ou Pix para o lote.');
  const pix = formaPagamento === 'PIX';
  const parceiroId = pix ? null : Number(dados.parceiro_id);
  const categoriaId = Number(dados.categoria_financeira_id);
  if (!Number.isSafeInteger(categoriaId) || categoriaId <= 0 || (!pix && (!Number.isSafeInteger(parceiroId) || parceiroId <= 0))) throw new ValidationError('Informe a categoria financeira e, para boleto, o fornecedor do ticket.');
  const vencimentoAutomatico = vencimentoPadrao(competencia);
  const dataVencimento = String(dados.data_vencimento || vencimentoAutomatico);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataVencimento) || dataVencimento > `${competencia}-10`
    || !Number.isFinite(Date.parse(`${dataVencimento}T12:00:00Z`))
    || new Date(`${dataVencimento}T12:00:00Z`).toISOString().slice(0, 10) !== dataVencimento) {
    throw new ValidationError('O vencimento do ticket deve ser o dia 10 ou uma data anterior por antecipacao.');
  }
  const pagamentosPix = pix ? dados.pagamentos_pix : [];
  const chaves = new Map();
  if (pix) {
    if (dados.pix_revisado !== true || !Array.isArray(pagamentosPix) || pagamentosPix.length !== colaboradorIds.length) {
      throw new ValidationError('Revise e confirme a chave Pix de todos os colaboradores do lote.');
    }
    for (const pagamento of pagamentosPix) {
      const id = Number(pagamento?.colaborador_id);
      const chave = typeof pagamento?.chave_pix === 'string' ? pagamento.chave_pix.trim() : '';
      if (!colaboradorIds.includes(id) || chaves.has(id) || !chave || chave.length > 8192) {
        throw new ValidationError('Informe uma chave Pix de ate 8192 caracteres para cada colaborador selecionado, sem repetir colaboradores.');
      }
      chaves.set(id, chave);
    }
    if (arquivo) throw new ValidationError('O lote Pix nao utiliza boleto. Remova o arquivo ou escolha Boleto.');
  }
  const requestHash = createHash('sha256').update(JSON.stringify({ competencia, colaboradorIds,
    formaPagamento, parceiroId, categoriaId, dataVencimento,
    pix: colaboradorIds.map(id => chaves.get(id) || null) })).digest('hex');
  const scopeIds = await getRhDpObraScopeIds(usuario);
  const carregarReplay = async (transaction) => {
    const existente = await RhTicketLote.findOne({ where: { idempotency_key: idempotencyKey }, transaction });
    if (!existente) return null;
    if (Number(existente.criado_por) !== Number(usuario.id)) throw new ValidationError('Este lote pertence a outro usuario.', 403);
    if (existente.request_hash && existente.request_hash !== requestHash) throw new ValidationError('Esta chave ja foi usada em outro envio de ticket. Reabra o modal para um novo lote.', 409);
    const [solicitacao, titulo] = await Promise.all([
      Solicitacao.findByPk(existente.solicitacao_id, { transaction }),
      TituloFinanceiro.findByPk(existente.titulo_financeiro_id, { transaction })
    ]);
    const itens = await RhTicketLoteItem.findAll({ where: { lote_id: existente.id }, transaction });
    if (Array.isArray(scopeIds) && itens.some(i => !scopeIds.includes(Number(i.obra_id)))) throw new ValidationError('Acesso negado ao lote fora das obras/centros de custo permitidos.', 403);
    const titulosIds = [...new Set(itens.map(i => Number(i.titulo_financeiro_id)).filter(Boolean))];
    const titulos = titulosIds.length ? await TituloFinanceiro.findAll({ where: { id: { [Op.in]: titulosIds } }, transaction }) : [titulo];
    return { lote: existente, solicitacao, titulo, titulos, total: moeda(existente.valor_total), data_vencimento: existente.data_vencimento, idempotent_replay: true };
  };
  const replay = await carregarReplay();
  if (replay) return replay;

  if (!pix && !arquivo) throw new ValidationError('Anexe o boleto do lote de ticket.');
  // Nao enviar arquivo ao S3 de uma selecao fora do escopo. A transacao abaixo
  // repete a conferencia sob lock, pois a lotacao pode mudar entre as consultas.
  if (arquivo && Array.isArray(scopeIds)) {
    const selecionados = await RhColaborador.findAll({
      where: { id: { [Op.in]: colaboradorIds }, status: 'ATIVO' },
      attributes: ['id', 'obra_id']
    });
    if (selecionados.length !== colaboradorIds.length || selecionados.some(c => !scopeIds.includes(Number(c.obra_id)))) {
      throw new ValidationError('Acesso negado a um colaborador fora das obras/centros de custo permitidos.', 403);
    }
  }
  const arquivoUrl = arquivo ? await uploadToS3(arquivo, `rh/tickets/${competencia}`) : null;
  try {
    return await sequelize.transaction(async (transaction) => {
    const [colaboradores, parceiro, categoria, forma] = await Promise.all([
      RhColaborador.findAll({
        where: { id: { [Op.in]: colaboradorIds }, status: 'ATIVO' },
        order: [['id', 'ASC']],
        include: [{ model: RhColaboradorPagamento, as: 'pagamento', required: false }],
        transaction,
        lock: transaction.LOCK.UPDATE
      }),
      pix ? null : Parceiro.findByPk(parceiroId, { transaction }),
      CategoriaFinanceira.findByPk(categoriaId, { transaction }),
      FormaPagamentoFinanceira.findOne({ where: { tipo: formaPagamento, ativo: true }, transaction })
    ]);
    if (colaboradores.length !== colaboradorIds.length) throw new ValidationError('Um ou mais colaboradores nao estao ativos ou nao foram encontrados.');
    if (!pix && !parceiro) throw new ValidationError('Fornecedor do ticket nao encontrado.');
    if (!categoria) throw new ValidationError('Categoria financeira nao encontrada.');
    if (!forma) throw new ValidationError(`Cadastre a forma ${pix ? 'Pix' : 'Boleto'} ativa antes de gerar o ticket.`, 409);
    if (Array.isArray(scopeIds) && colaboradores.some(c => !scopeIds.includes(Number(c.obra_id)))) throw new ValidationError('Acesso negado a um colaborador fora das obras/centros de custo permitidos.', 403);
    const replayTravado = await carregarReplay(transaction);
    if (replayTravado) return replayTravado;
    const tipo = await garantirTipoSolicitacaoTicket(transaction);
    const empresaIds = [...new Set(colaboradores.map((c) => Number(c.empresa_grupo_id)))];
    if (empresaIds.length !== 1) throw new ValidationError('Gere um lote de ticket por empresa.');
    if (colaboradores.some((c) => !c.obra_id)) throw new ValidationError('Todos os colaboradores selecionados precisam estar lotados em uma obra.');
    if (colaboradores.some((c) => !Number.isFinite(Number(c.valor_ticket)) || !(moeda(c.valor_ticket) > 0))) throw new ValidationError('Todos os selecionados precisam ter valor de ticket maior que zero.');

    const duplicados = await RhTicketLoteItem.findAll({
      where: { colaborador_id: { [Op.in]: colaboradorIds } },
      include: [{ model: RhTicketLote, as: 'lote', required: true, where: { competencia, status: { [Op.ne]: 'CANCELADO' } } }],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (duplicados.length) throw new ValidationError('Um ou mais colaboradores ja possuem ticket solicitado nesta competencia.', 409);

    const total = moeda(colaboradores.reduce((soma, c) => soma + moeda(c.valor_ticket), 0));
    const destinos = [];
    if (pix) {
      for (const c of colaboradores) {
        const pagamento = c.pagamento || {};
        const favorecido = { colaborador: c, favorecidoNome: pagamento.favorecido_nome || c.nome,
          favorecidoDocumento: pagamento.favorecido_documento || c.cpf, chavePix: chaves.get(Number(c.id)), usuarioId: usuario.id };
        const parceiroColaborador = await syncParceiroFavorecido(favorecido, transaction);
        const beneficiario = await syncFavorecidoBancarioRh({ ...favorecido, parceiro: parceiroColaborador, isolado: true }, transaction);
        destinos.push({ colaborador: c, parceiro: parceiroColaborador, beneficiario, chave: favorecido.chavePix, valor: moeda(c.valor_ticket) });
      }
    } else destinos.push({ parceiro, valor: total });
    const codigo = await gerarCodigoSolicitacao();
    const obraRepresentante = Number(colaboradores[0].obra_id);
    const solicitacao = await Solicitacao.create({
      codigo,
      obra_id: obraRepresentante,
      parceiro_id: destinos[0].parceiro.id,
      forma_pagamento_id: forma.id,
      ...(pix && destinos.length === 1 ? { favorecido_id: destinos[0].parceiro.id, favorecido_chave_pix: destinos[0].chave } : {}),
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
      Historico.create({ solicitacao_id: solicitacao.id, usuario_responsavel_id: usuario.id, setor: 'GEO', acao: 'SOLICITACAO_CRIADA', status_novo: 'PENDENTE',
        observacao: `Lote de ticket criado pelo DP. Pagamento: ${formaPagamento}. ${destinos.length} titulo(s) em previsao.`,
        metadata: JSON.stringify({ forma_pagamento: formaPagamento, colaboradores: colaboradores.map(c => ({ colaborador_id: c.id, nome: c.nome, valor: moeda(c.valor_ticket) })) }) }, { transaction }),
      ...(arquivo ? [Anexo.create({ solicitacao_id: solicitacao.id, tipo: 'BOLETO', nome_original: arquivo.originalname, caminho_arquivo: arquivoUrl, area_origem: 'DP', uploaded_by: usuario.id }, { transaction })] : [])
    ]);

    const titulos = [];
    for (const destino of destinos) {
    const titulo = await TituloFinanceiro.create({
      solicitacao_id: solicitacao.id,
      obra_id: destino.colaborador ? destino.colaborador.obra_id : null,
      empresa_id: empresaIds[0],
      parceiro_id: destino.parceiro.id,
      payment_beneficiary_id: destino.beneficiario?.id || null,
      favorecido_pagamento_id: pix ? destino.parceiro.id : null,
      forma_pagamento_id: forma.id,
      categoria_financeira_id: categoriaId,
      competencia_data: `${competencia}-01`,
      considera_dre: true,
      possui_rateio: !pix,
      origem_titulo: 'RH_DP_TICKET',
      tipo: 'PAGAR',
      status: 'PREVISAO',
      descricao: (destino.colaborador ? `Ticket ${competencia} - ${destino.colaborador.nome}` : `Ticket colaboradores ${competencia}`).slice(0, 255),
      numero_documento: codigo,
      valor_original: destino.valor,
      valor_bruto: destino.valor,
      valor_impostos: 0,
      valor_liquido: destino.valor,
      valor_saldo: destino.valor,
      valor_baixado: 0,
      data_emissao: new Date().toISOString().slice(0, 10),
      data_vencimento: dataVencimento,
      criado_por: usuario.id,
      atualizado_por: usuario.id
    }, { transaction });
    titulos.push(titulo);
    destino.titulo = titulo;
    if (pix) await SolicitacaoFavorecido.create({ solicitacao_id: solicitacao.id, ordem: titulos.length,
      favorecido_id: destino.parceiro.id, nome_favorecido: destino.beneficiario.nome,
      cpf_cnpj: destino.beneficiario.cpf_cnpj, forma_pagamento_id: forma.id,
      forma_pagamento_nome: forma.nome, forma_pagamento_tipo: 'PIX', valor: destino.valor,
      favorecido_chave_pix: destino.chave, titulo_financeiro_id: titulo.id, criado_por: usuario.id }, { transaction });
    }
    // Campo historico do lote continua apontando para o primeiro titulo.
    // Nos lotes novos, cada item referencia seu titulo; nos antigos usa-se o lote.
    const titulo = titulos[0];

    const lote = await RhTicketLote.create({
      competencia,
      forma_pagamento: formaPagamento,
      request_hash: requestHash,
      idempotency_key: idempotencyKey,
      empresa_grupo_id: empresaIds[0],
      parceiro_id: destinos[0].parceiro.id,
      categoria_financeira_id: categoriaId,
      solicitacao_id: solicitacao.id,
      titulo_financeiro_id: titulo.id,
      data_vencimento: dataVencimento,
      valor_total: total,
      status: 'SOLICITADO',
      criado_por: usuario.id,
      atualizado_por: usuario.id
    }, { transaction });
    const titulosPorColaborador = new Map(destinos.filter(d => d.colaborador).map(d => [Number(d.colaborador.id), d.titulo.id]));
    await RhTicketLoteItem.bulkCreate(colaboradores.map((c) => ({
      lote_id: lote.id,
      colaborador_id: c.id,
      titulo_financeiro_id: pix ? titulosPorColaborador.get(Number(c.id)) : titulo.id,
      obra_id: c.obra_id,
      valor_ticket: moeda(c.valor_ticket)
    })), { transaction });

    if (!pix) {
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
    }
      return { lote, solicitacao, titulo, titulos, total, data_vencimento: dataVencimento };
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
    if (!lote) return null;
    const itens = await RhTicketLoteItem.findAll({ where: { lote_id: lote.id }, transaction });
    const ids = [...new Set(itens.map(i => Number(i.titulo_financeiro_id)).filter(Boolean))];
    const titulos = ids.length ? await TituloFinanceiro.findAll({ where: { id: { [Op.in]: ids }, solicitacao_id: Number(solicitacaoId) },
      order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE }) : (lote.titulo ? [lote.titulo] : []);
    if (!titulos.length || (ids.length && titulos.length !== ids.length)) throw new ValidationError('Vinculo dos titulos do ticket incompleto. Confira o lote antes de alterar o status.', 409);
    if (['LIBERADO', 'APROVADA'].includes(normalizado) && titulos.some(t => t.status === 'PREVISAO')) {
      for (const titulo of titulos.filter(t => t.status === 'PREVISAO')) await titulo.update({ status: 'ABERTO', atualizado_por: usuarioId }, { transaction });
      await lote.update({ status: 'NA_FILA', atualizado_por: usuarioId }, { transaction });
      return 'NA_FILA';
    }
    if (['CANCELADA', 'REJEITADA'].includes(normalizado) && titulos.every(t => Number(t.valor_baixado || 0) <= 0)) {
      for (const titulo of titulos) await titulo.update({ status: 'CANCELADO', valor_saldo: 0, atualizado_por: usuarioId }, { transaction });
      await lote.update({ status: 'CANCELADO', atualizado_por: usuarioId }, { transaction });
      return 'CANCELADO';
    }
    return null;
  };
  return transactionAtual ? executar(transactionAtual) : sequelize.transaction(executar);
}

module.exports = { criarLoteTicket, listarStatusTicket, sincronizarTicketComSolicitacao, vencimentoPadrao };
