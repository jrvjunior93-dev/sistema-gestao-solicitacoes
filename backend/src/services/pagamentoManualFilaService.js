const crypto = require('crypto');
const { Op } = require('sequelize');
const {
  Anexo,
  ContaBancaria,
  Contrato,
  CartaoFinanceiro,
  ChequeTerceiro,
  EmpresaGrupo,
  FormaPagamentoFinanceira,
  Obra,
  SecurityEventLog,
  PagamentoAutorizacaoItem,
  PagamentoAutorizacaoLote,
  PagamentoManualFilaItem,
  PagamentoFilaLiquidacao,
  PagamentoManualFilaComprovante,
  Parceiro,
  PaymentBeneficiary,
  PaymentIntent,
  Solicitacao,
  TituloFinanceiro,
  User,
  sequelize
} = require('../models');
const { baixarTitulo, estornarMovimentoTitulo } = require('./tituloFinanceiroService');
const { recordEvent } = require('./pagamentoAutorizacaoEventosService');
const { assertTituloDisponivelParaBaixa } = require('./tituloBloqueioRetornoObraService');
const { registrarEventoSeguranca, getRequestIp } = require('./securityLogService');
const { atualizarAnaliseAoEnfileirar } = require('./analiseProprietarioService');
const { resolverSolicitacoesDosTitulos, registrarVinculosContratuaisAoEnfileirar } = require('./tituloSolicitacaoContratoService');
const { sincronizarDossiesComFila } = require('./pagamentoAutorizacaoFilaService');
const { uploadToS3, getPresignedUrl } = require('./s3');
const { canAccessSolicitacaoFile } = require('./fileAccessService');
const { canAccessFilaPagamentos, getFinanceiroObraScopeIds } = require('./authorizationService');
const { encaminharSolicitacaoParaFinanceiroAoEnfileirar } = require('./solicitacaoFinanceiroStatusService');
const { env } = require('../config/env');
const { userHasNominalAreaPermission } = require('./authorizationService');
const { resolvePaymentQueueGate } = require('./paymentOwnerApprovalPolicy');
const { tipoInstrumento, instrumentoPayload } = require('./pagamentoFilaInstrumentoDomain');
const { pendenteComprovanteFila, wherePendenteComprovante, whereSemEstornoFila, podeAnexarComprovanteFila } = require('./pagamentoFilaComprovanteDomain');
const { registrarComprovantesFilaNoHistorico } = require('./pagamentoFilaHistoricoService');
const { calcularValoresFila, filaSemBaixaAtualizavel } = require('./pagamentoFilaValoresDomain');
const { distribuirCheques, conferirChequesUnicosLote } = require('./pagamentoFilaChequesDomain');

const ACTIVE_STATUSES = ['PENDENTE', 'NAO_PAGO', 'DIVERGENTE', 'EM_EDICAO'];
const PAYMENT_INTENT_INACTIVE_STATUSES = ['CANCELADO', 'REJEITADO', 'REJEITADO_BANCO', 'FALHA_INTEGRACAO', 'BAIXADO'];

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function roundCurrency(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function filaInclude() {
  return [
    {
      model: PagamentoManualFilaComprovante,
      as: 'comprovantes',
      attributes: ['id', 'nome', 'hash', 'banco', 'tipo', 'vinculado_em'],
      separate: true,
      order: [['id', 'ASC']]
    },
    {
      model: TituloFinanceiro,
      as: 'titulo',
      required: true,
      attributes: [
        'id', 'codigo', 'descricao', 'numero_documento', 'status', 'tipo',
        'valor_original', 'valor_saldo', 'valor_baixado', 'juros', 'multa', 'data_vencimento',
        'forma_pagamento_id', 'empresa_id', 'linha_digitavel', 'codigo_barras',
        'banco_cobranca', 'observacoes', 'solicitacao_id', 'favorecido_pagamento_id',
        'cartao_id', 'fatura_cartao_id', 'origem_titulo', 'status_interno_pagar'
      ],
      include: [
        { model: Parceiro, as: 'parceiro', attributes: ['id', 'nome', 'cpf_cnpj', 'telefone', 'email'] },
        { model: Parceiro, as: 'favorecidoPagamento', attributes: ['id', 'nome', 'cpf_cnpj'] },
        {
          model: PaymentBeneficiary,
          as: 'paymentBeneficiary',
          attributes: [
            'id', 'nome', 'cpf_cnpj', 'metodo_preferencial', 'pix_tipo_chave', 'pix_chave',
            'banco_codigo', 'agencia', 'agencia_digito', 'conta', 'conta_digito', 'tipo_conta'
          ]
        },
        { model: FormaPagamentoFinanceira, as: 'formaPagamento', attributes: ['id', 'nome', 'codigo', 'tipo', 'exige_cartao', 'gera_fatura'] },
        { model: Obra, as: 'obra', attributes: ['id', 'codigo', 'nome', 'empresa_grupo_id'] },
        { model: EmpresaGrupo, as: 'empresa', attributes: ['id', 'codigo', 'nome', 'razao_social', 'cnpj'] },
        {
          model: Solicitacao,
          as: 'solicitacao',
          attributes: [
            'id', 'codigo', 'descricao', 'favorecido_id', 'favorecido_chave_pix',
            'dados_pagamento', 'forma_pagamento_id'
          ],
          include: [
            { model: Parceiro, as: 'favorecido', attributes: ['id', 'nome', 'cpf_cnpj'] },
            {
              model: FormaPagamentoFinanceira,
              as: 'formaPagamento',
              attributes: ['id', 'nome', 'codigo', 'tipo']
            }
          ]
        }
      ]
    },
    {
      model: ContaBancaria,
      as: 'contaBancaria',
      attributes: ['id', 'nome', 'banco', 'agencia', 'conta', 'tipo_conta', 'tipo_operacional', 'empresa_id']
    },
    { model: User, as: 'selecionadoPor', attributes: ['id', 'nome', 'email'] },
    { model: User, as: 'processadoPor', attributes: ['id', 'nome', 'email'] },
    { model: User, as: 'resolvidoPor', attributes: ['id', 'nome', 'email'] }
  ];
}

function matchesSearch(item, rawTerm) {
  const term = String(rawTerm || '').trim().toLocaleLowerCase('pt-BR');
  if (!term) return true;
  const titulo = item?.titulo || {};
  const beneficiary = titulo.paymentBeneficiary || {};
  return [
    titulo.codigo,
    titulo.descricao,
    titulo.numero_documento,
    titulo.parceiro?.nome,
    titulo.parceiro?.cpf_cnpj,
    beneficiary.nome,
    beneficiary.cpf_cnpj,
    titulo.obra?.nome,
    titulo.obra?.codigo,
    titulo.solicitacao?.codigo
  ].some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(term));
}

async function listarFilaPagamentos(req, filters = {}) {
  const status = String(filters.status || 'PENDENTE').trim().toUpperCase();
  const where = status === 'PENDENTE_COMPROVANTE' ? wherePendenteComprovante()
    : status === 'BAIXADO' ? { status: { [Op.in]: ['BAIXADO', 'RESOLVIDO'] },
      movimento_financeiro_id: { [Op.gt]: 0 }, [Op.and]: whereSemEstornoFila() }
    : status === 'PENDENTE' ? { status: { [Op.in]: ['PENDENTE', 'EM_EDICAO'] } }
      : (status && status !== 'TODOS' ? { status } : { status: { [Op.ne]: 'CANCELADO' } });
  const rows = await PagamentoManualFilaItem.findAll({
    where,
    include: filaInclude(),
    order: [['selecionado_em', 'ASC'], ['id', 'ASC']],
    limit: 500
  });
  const data = rows
    .filter((item) => matchesSearch(item, filters.q))
    .map((item) => ({ ...item.toJSON(),
      desconto: Number(item.instrumento_pagamento_json?.desconto || 0),
      // Leitura tambem cobre filas antigas, sem reescrever historico de pagamentos.
      valor_previsto: filaSemBaixaAtualizavel(item) ? roundCurrency(item.titulo.valor_saldo) : item.valor_previsto,
      // Filas antigas podem ter sido criadas antes dos encargos do titulo.
      // Pagamentos executados preservam o snapshot; saldo parcial nao repete encargos.
      juros: item.status === 'PENDENTE' && filaSemBaixaAtualizavel(item)
        ? (Number(item.titulo.valor_baixado || 0) > 0 ? 0 : roundCurrency(item.titulo.juros)) : item.juros,
      multa: item.status === 'PENDENTE' && filaSemBaixaAtualizavel(item)
        ? (Number(item.titulo.valor_baixado || 0) > 0 ? 0 : roundCurrency(item.titulo.multa)) : item.multa,
      pendente_comprovante: pendenteComprovanteFila(item) }));
  // Rejeicao e uma decisao, nao um pagamento executavel. Projecao somente leitura:
  // nenhum registro de fila e criado e o id negativo nunca passa no validator de baixa.
  const historicoAutorizacoes = await PagamentoAutorizacaoItem.findAll({
    include: [filaInclude().find(include => include.as === 'titulo')], order: [['id', 'DESC']]
  });
  const filasAtivas = await PagamentoManualFilaItem.findAll({ where: { status: { [Op.in]: ACTIVE_STATUSES } },
    attributes: ['titulo_financeiro_id'] });
  const ocupados = new Set(filasAtivas.map(item => Number(item.titulo_financeiro_id)));
  const vistos = new Set();
  const rejeitados = [];
  for (const item of historicoAutorizacoes) {
    const tituloId = Number(item.titulo_financeiro_id);
    if (vistos.has(tituloId)) continue;
    vistos.add(tituloId);
    const titulo = item.titulo;
    if (item.status !== 'REJEITADO' || ocupados.has(tituloId) || !titulo ||
      !['ABERTO', 'PARCIAL'].includes(titulo.status) || Number(titulo.valor_saldo) <= 0) continue;
    rejeitados.push({ id: -Number(item.id), titulo_financeiro_id: tituloId, titulo: titulo.toJSON ? titulo.toJSON() : titulo,
      status: 'NAO_PAGO', somente_consulta: true, origem: 'REJEICAO_PROPRIETARIO',
      motivo: item.motivo_decisao, autorizacao_lote_id: item.lote_id, valor_previsto: item.valor_snapshot,
      selecionado_em: item.decidido_em, comprovantes: [] });
  }
  if (['NAO_PAGO', 'TODOS'].includes(status)) data.push(...rejeitados.filter(item => matchesSearch(item, filters.q)));
  const solicitacaoIds = Array.from(new Set(
    data
      .map((item) => Number(item?.titulo?.solicitacao_id || item?.titulo?.solicitacao?.id))
      .filter((id) => Number.isInteger(id) && id > 0)
  ));
  const boletos = solicitacaoIds.length > 0
    ? await Anexo.findAll({
        where: {
          solicitacao_id: { [Op.in]: solicitacaoIds },
          tipo: 'BOLETO',
          deleted_at: null
        },
        attributes: ['id', 'solicitacao_id', 'nome_original'],
        order: [['id', 'ASC']],
        raw: true
      })
    : [];
  const boletosPorSolicitacao = boletos.reduce((acc, boleto) => {
    const id = Number(boleto.solicitacao_id);
    if (!acc.has(id)) acc.set(id, []);
    acc.get(id).push({ id: Number(boleto.id), nome: boleto.nome_original });
    return acc;
  }, new Map());
  data.forEach((item) => {
    const solicitacao = item?.titulo?.solicitacao;
    if (!solicitacao) return;
    solicitacao.boletos = boletosPorSolicitacao.get(Number(solicitacao.id)) || [];
  });
  await require('./instrucaoFinanceiraFavorecidoService').anexarInstrucoes(data.map(item => item.titulo).filter(Boolean));
  const counts = await PagamentoManualFilaItem.findAll({
    attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'total']],
    group: ['status'],
    raw: true
  });
  const resumo = counts.reduce((acc, item) => {
    acc[String(item.status || '').toUpperCase()] = Number(item.total || 0);
    return acc;
  }, {});
  resumo.NAO_PAGO = Number(resumo.NAO_PAGO || 0) + rejeitados.length;
  resumo.PENDENTE = Number(resumo.PENDENTE || 0) + Number(resumo.EM_EDICAO || 0);
  resumo.BAIXADO = await PagamentoManualFilaItem.count({ where: {
    status: { [Op.in]: ['BAIXADO', 'RESOLVIDO'] }, movimento_financeiro_id: { [Op.gt]: 0 },
    [Op.and]: whereSemEstornoFila()
  }, include: [{ model: TituloFinanceiro, as: 'titulo', required: true, attributes: [] }] });
  resumo.PENDENTE_COMPROVANTE = await PagamentoManualFilaItem.count({ where: wherePendenteComprovante(),
    include: [{ model: TituloFinanceiro, as: 'titulo', required: true, attributes: [] }] });
  return { data, resumo };
}

async function listarContasPagadorasFila() {
  return ContaBancaria.findAll({
    where: { ativo: true, empresa_id: { [Op.ne]: null } },
    attributes: ['id', 'nome', 'banco', 'agencia', 'conta', 'tipo_conta', 'tipo_operacional', 'empresa_id'],
    include: [{ model: EmpresaGrupo, as: 'empresa', attributes: ['id', 'codigo', 'nome', 'razao_social', 'cnpj'] }],
    order: [['nome', 'ASC']]
  });
}

async function listarInstrumentosFila() {
  // Rota restrita a registrar baixas; nao concede acesso aos cadastros administrativos.
  const [formas, cartoes, cheques] = await Promise.all([
    FormaPagamentoFinanceira.findAll({ where: { ativo: true },
      attributes: ['id', 'nome', 'codigo', 'tipo', 'exige_cartao', 'gera_fatura'], order: [['nome', 'ASC']] }),
    CartaoFinanceiro.findAll({ where: { ativo: true },
      attributes: ['id', 'nome', 'tipo', 'conta_bancaria_id'], order: [['nome', 'ASC']] }),
    ChequeTerceiro.findAll({ where: { status: 'EM_CARTEIRA' },
      attributes: ['id', 'codigo', 'numero_cheque', 'titular_nome', 'valor', 'empresa_id', 'data_vencimento'],
      include: [{ model: EmpresaGrupo, as: 'empresa', attributes: ['id', 'nome', 'ativo'], required: false }],
      order: [['data_vencimento', 'ASC'], ['id', 'ASC']] })
  ]);
  return { formas, cartoes, cheques };
}

async function resolverInstrumentoFila(titulo, payload, transaction, rateioInterno = false) {
  if (titulo.fatura_cartao_id) throw createHttpError(409, 'Titulo ja vinculado a fatura: use o pagamento da fatura.');
  const instrumento = instrumentoPayload(payload);
  instrumento.forma_pagamento_id = payload.forma_pagamento_id || titulo.forma_pagamento_id || undefined;
  const forma = instrumento.forma_pagamento_id
    ? await FormaPagamentoFinanceira.findByPk(instrumento.forma_pagamento_id, { transaction }) : null;
  if (instrumento.forma_pagamento_id && (!forma || forma.ativo === false)) {
    throw createHttpError(400, 'Forma de pagamento inexistente ou inativa.');
  }
  const tipo = tipoInstrumento(forma);
  const temCheque = Object.keys(instrumento).some(key => key.startsWith('cheque_') ||
    ['titular_documento', 'data_emissao', 'data_vencimento'].includes(key));
  if (tipo !== 'CHEQUE' && (temCheque || instrumento.usar_cheque_terceiro || instrumento.parcelas_cheque)) {
    throw createHttpError(400, 'Dados de cheque permitidos somente para pagamento em cheque.');
  }
  if (tipo !== 'CARTAO' && instrumento.cartao_id) throw createHttpError(400, 'Cartao permitido somente para pagamento com cartao.');
  if (tipo === 'CARTAO') {
    const cartao = instrumento.cartao_id && await CartaoFinanceiro.findByPk(instrumento.cartao_id, { transaction });
    if (!cartao || cartao.ativo === false) throw createHttpError(400, 'Informe um cartao ativo utilizado no pagamento.');
    const tipoCartao = String(cartao.tipo || 'CREDITO').toUpperCase();
    const texto = `${forma.tipo} ${forma.codigo} ${forma.nome}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    if ((texto.includes('DEBITO') && tipoCartao !== 'DEBITO') ||
      ((texto.includes('CREDITO') || forma.gera_fatura) && tipoCartao !== 'CREDITO')) {
      throw createHttpError(400, 'O tipo do cartao deve corresponder a forma de pagamento selecionada.');
    }
    if (Number(payload.conta_bancaria_id) !== Number(cartao.conta_bancaria_id)) {
      throw createHttpError(400, 'A conta pagadora deve ser a vinculada ao cartao utilizado.');
    }
    // A fatura existente soma o valor integral do titulo. Nao vincular saldo parcial
    // ou valor divergente como se toda a compra tivesse sido realizada no cartao.
    if (!rateioInterno && tipoCartao === 'CREDITO' && (Number(titulo.valor_baixado || 0) > 0 ||
      calcularValoresFila(payload.valor_pago, titulo.valor_saldo, payload).principal !== roundCurrency(titulo.valor_saldo))) {
      throw createHttpError(400, 'Pagamento com cartao de credito deve quitar o titulo integralmente, sem baixa anterior.');
    }
  }
  if (tipo === 'CHEQUE') {
    if (instrumento.parcelas_cheque) {
      if (temCheque || instrumento.usar_cheque_terceiro) throw createHttpError(400, 'Informe os cheques nas parcelas, sem dados de cheque unico.');
      distribuirCheques(instrumento.parcelas_cheque, payload.valor_pago, calcularValoresFila(payload.valor_pago, titulo.valor_saldo, payload));
      instrumento.parcelas_cheque = await Promise.all(instrumento.parcelas_cheque.map(async parcela => {
        const campos = await resolverInstrumentoFila(titulo, { ...parcela, forma_pagamento_id: instrumento.forma_pagamento_id }, transaction);
        return { ...campos, valor_pago: parcela.valor_pago };
      }));
      return instrumento;
    }
    if (instrumento.usar_cheque_terceiro) {
      if (!instrumento.cheque_terceiro_id) throw createHttpError(400, 'Selecione um cheque disponivel da carteira.');
      if (temCheque && Object.keys(instrumento).some(key => key !== 'cheque_terceiro_id' &&
        (key.startsWith('cheque_') || ['titular_documento', 'data_emissao', 'data_vencimento'].includes(key)))) {
        throw createHttpError(400, 'Cheque da carteira nao aceita dados substitutos do documento.');
      }
    } else if (!instrumento.cheque_numero || !instrumento.cheque_emitente || instrumento.cheque_terceiro_id) {
      throw createHttpError(400, 'Informe numero e emitente do cheque proprio.');
    }
  }
  return instrumento;
}

async function bloquearTitulosDaFila(filaIds, transaction) {
  const candidatos = await PagamentoManualFilaItem.findAll({ where: { id: { [Op.in]: filaIds } },
    attributes: ['titulo_financeiro_id'], transaction });
  return TituloFinanceiro.findAll({ where: { id: { [Op.in]: candidatos.map(item => item.titulo_financeiro_id) } },
    attributes: ['id'], transaction, lock: transaction.LOCK.UPDATE, order: [['id', 'ASC']] });
}

async function enfileirarTitulos(req, payload = {}, options = {}) {
  const podeEnviarDiretamente = !options.autorizacaoInterna
    && await userHasNominalAreaPermission(req.user, ['financeiro.fila_pagamentos.preparar']);
  if (!options.autorizacaoInterna && !podeEnviarDiretamente) {
    throw createHttpError(403, 'Permissao de enviar para a fila de pagamentos obrigatoria.');
  }
  const gate = resolvePaymentQueueGate({
    mode: env.paymentOwnerApprovalMode,
    internalAuthorization: Boolean(options.autorizacaoInterna),
    directQueuePermission: podeEnviarDiretamente
  });
  if (gate === 'PAUSED') {
    throw createHttpError(423, 'O envio para a fila esta temporariamente pausado pela governanca de pagamentos.');
  }
  if (gate === 'AUTHORIZATION_REQUIRED') {
    throw createHttpError(409, 'Envie os titulos para autorizacao do proprietario antes da fila de pagamentos.');
  }
  if (options.autorizacaoInterna && !Number.isInteger(Number(options.autorizacaoLoteId))) {
    throw createHttpError(403, 'Contexto interno de autorizacao invalido.');
  }
  const tituloIds = [...new Set((payload.titulo_ids || []).map(Number))].sort((a, b) => a - b);
  if (!tituloIds.length || tituloIds.length > 200 || tituloIds.some(id => !Number.isSafeInteger(id) || id <= 0)) {
    throw createHttpError(400, 'Selecione entre 1 e 200 titulos validos para pagamento.');
  }
  const obrasPermitidas = await getFinanceiroObraScopeIds(req.user);
  const requestKey = payload.idempotency_key || crypto.randomUUID();
  const itemKeys = tituloIds.map((tituloId) => `${requestKey}:${tituloId}`.slice(0, 120));

  const executar = options.transaction
    ? callback => callback(options.transaction)
    : callback => sequelize.transaction(callback);
  const resultado = await executar(async (transaction) => {
    // Lock do titulo serializa as duas vias; escopo e conferido inclusive no replay.
    const titulos = await TituloFinanceiro.findAll({
      where: { id: { [Op.in]: tituloIds } },
      include: [{ model: FormaPagamentoFinanceira, as: 'formaPagamento',
        attributes: ['id', 'nome', 'codigo', 'tipo', 'exige_cartao', 'gera_fatura'] }],
      transaction, lock: transaction.LOCK.UPDATE, order: [['id', 'ASC']]
    });
    if (titulos.length !== tituloIds.length) throw createHttpError(404, 'Um ou mais titulos nao foram encontrados.');
    for (const titulo of titulos) {
      if (obrasPermitidas !== null && !obrasPermitidas.includes(Number(titulo.obra_id))) {
        throw createHttpError(403, `O titulo ${titulo.codigo || titulo.id} nao pertence a uma obra do seu acesso.`);
      }
      if (String(titulo.tipo || '').toUpperCase() !== 'PAGAR') {
        throw createHttpError(400, `O titulo ${titulo.codigo || titulo.id} nao pertence ao Contas a Pagar.`);
      }
      // Acesso primeiro; nem replay/enqueue alternativo pode contornar a revisao.
      if (titulo.origem_titulo === 'RH_DP' && titulo.status_interno_pagar === 'EM EDICAO DP') {
        assertTituloDisponivelParaBaixa(titulo);
      }
    }
    const repetidos = await PagamentoManualFilaItem.findAll({
      where: { idempotency_key: { [Op.in]: itemKeys } },
      transaction
    });
    if (repetidos.some(item => (!options.autorizacaoInterna && Number(item.selecionado_por) !== Number(req.user.id)) ||
      !tituloIds.includes(Number(item.titulo_financeiro_id)))) {
      throw createHttpError(409, 'A chave de envio ja foi utilizada por outra operacao.');
    }

    const existentes = await PagamentoManualFilaItem.findAll({
      where: { titulo_financeiro_id: { [Op.in]: tituloIds }, status: { [Op.in]: ACTIVE_STATUSES } },
      transaction
    });
    // Nao atualiza entradas reutilizadas nem trava fila -> titulo contra a baixa.
    // A criacao e serializada pelo titulo e protegida pelo indice ativo unico.
    // Preserva entrada ativa e seus comprovantes/valor/responsavel, mesmo com outra chave.
    const porTitulo = new Map(repetidos.map(item => [Number(item.titulo_financeiro_id), item]));
    existentes.forEach(item => porTitulo.set(Number(item.titulo_financeiro_id), item));
    const novos = titulos.filter(titulo => !porTitulo.has(Number(titulo.id)));

    const intentsAtivos = await PaymentIntent.findAll({
      where: {
        titulo_financeiro_id: { [Op.in]: novos.map(titulo => titulo.id) },
        status: { [Op.notIn]: PAYMENT_INTENT_INACTIVE_STATUSES }
      },
      attributes: ['titulo_financeiro_id'],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (intentsAtivos.length > 0) {
      throw createHttpError(409, 'Um ou mais titulos ja possuem pagamento bancario em andamento.');
    }

    if (options.autorizacaoInterna) {
      const lote = await PagamentoAutorizacaoLote.findByPk(Number(options.autorizacaoLoteId), {
        transaction, lock: transaction.LOCK.UPDATE
      });
      if (options.autorizacaoRevisao !== undefined &&
        Number(lote?.revisao_autorizacao || 0) !== Number(options.autorizacaoRevisao)) {
        throw createHttpError(409, 'Autorizacao revogada ou alterada. Atualize o lote antes de reenviar.');
      }
      const autorizados = await PagamentoAutorizacaoItem.findAll({ where: {
        lote_id: Number(options.autorizacaoLoteId), titulo_financeiro_id: { [Op.in]: novos.map(titulo => titulo.id) }, status: 'AUTORIZADO'
      }, transaction });
      if (autorizados.length !== novos.length) throw createHttpError(409, 'Um ou mais titulos nao possuem autorizacao digital neste lote.');
    }

    for (const titulo of novos) {
      if (!['ABERTO', 'PARCIAL'].includes(String(titulo.status || '').toUpperCase()) || roundCurrency(titulo.valor_saldo) <= 0) {
        throw createHttpError(400, `O titulo ${titulo.codigo || titulo.id} nao possui saldo disponivel para pagamento.`);
      }
      if (titulo.fatura_cartao_id) {
        throw createHttpError(400, `O titulo ${titulo.codigo || titulo.id} usa cartao e deve ser baixado pelo fluxo da fatura do cartao.`);
      }
      assertTituloDisponivelParaBaixa(titulo);
    }

    const criados = await Promise.all(novos.map((titulo) => PagamentoManualFilaItem.create({
      titulo_financeiro_id: titulo.id,
      status: 'PENDENTE',
      valor_previsto: roundCurrency(titulo.valor_saldo),
      juros: Number(titulo.valor_baixado || 0) > 0 ? 0 : roundCurrency(titulo.juros),
      multa: Number(titulo.valor_baixado || 0) > 0 ? 0 : roundCurrency(titulo.multa),
      data_vencimento_prevista: titulo.data_vencimento || null,
      selecionado_por: req.user?.id || null,
      selecionado_em: new Date(),
      idempotency_key: `${requestKey}:${titulo.id}`.slice(0, 120)
    }, { transaction })));

    if (!options.autorizacaoInterna && criados.length) {
      // Falha de auditoria deve reverter tambem a criacao da fila. Nenhum
      // usuario e registrado como decisor digital ou como o proprietario.
      await SecurityEventLog.create({ usuario_id: req.user.id, tipo_evento: 'MANUAL_PAYMENT_QUEUE_PREPARED',
        recurso_tipo: 'PAGAMENTO_MANUAL_FILA', recurso_id: requestKey, status: 'SUCCESS',
        descricao: 'Titulos encaminhados diretamente para pagamento por usuario com permissao de enviar para a fila',
        ip_origem: getRequestIp(req), user_agent: String(req.headers?.['user-agent'] || '').slice(0, 255),
        metadata: { modo: env.paymentOwnerApprovalMode, origem: 'ENVIO_DIRETO',
          ...(req.dev_user_switch ? { dev_user_switch: req.dev_user_switch } : {}),
          titulos: novos.map((titulo) => ({ id: Number(titulo.id), saldo: roundCurrency(titulo.valor_saldo), vencimento: titulo.data_vencimento })) }
      }, { transaction });
    }
    criados.forEach(item => porTitulo.set(Number(item.titulo_financeiro_id), item));
    const itens = titulos.map(titulo => porTitulo.get(Number(titulo.id)));
    await sincronizarDossiesComFila({ req, itensFila: itens, transaction,
      origem: options.autorizacaoInterna ? 'AUTORIZACAO_DIGITAL' : 'ENVIO_DIRETO' });
    await atualizarAnaliseAoEnfileirar(novos, transaction);

    const vinculosSolicitacoes = await resolverSolicitacoesDosTitulos(novos, transaction);
    await registrarVinculosContratuaisAoEnfileirar({ titulos: novos, vinculos: vinculosSolicitacoes,
      usuarioId: req.user?.id || null, transaction });
    const solicitacaoIdsEnvio = [...new Set([...vinculosSolicitacoes.values()].map(v => v.solicitacao_id).filter(Boolean))].sort((a, b) => a - b);
    const contratosEnvio = solicitacaoIdsEnvio.length ? await Contrato.findAll({
      where: { solicitacao_id: { [Op.in]: solicitacaoIdsEnvio }, fluxo_novo: true },
      attributes: ['solicitacao_id'], transaction
    }) : [];
    const solicitacoesContrato = new Set(contratosEnvio.map(c => Number(c.solicitacao_id)));
    for (const solicitacaoId of solicitacaoIdsEnvio) {
      const solicitacao = await Solicitacao.findByPk(solicitacaoId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!solicitacao) continue;
      await encaminharSolicitacaoParaFinanceiroAoEnfileirar({
        solicitacao,
        usuarioId: req.user?.id || null,
        transaction,
        retornarParaObra: solicitacoesContrato.has(solicitacaoId),
        titulos: novos.filter(t => vinculosSolicitacoes.get(Number(t.id))?.solicitacao_id === solicitacaoId)
      });
    }
    const processados = itens.filter(item => !ACTIVE_STATUSES.includes(item.status)).length;
    return { itens, criados: criados.length, jaNaFila: itens.length - criados.length - processados, processados };
  });

  const items = resultado.itens;

  const registrarEnvio = () => registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'MANUAL_PAYMENT_QUEUE_CREATED',
    recursoTipo: 'PAGAMENTO_MANUAL_FILA',
    recursoId: requestKey,
    status: 'SUCCESS',
    descricao: 'Titulos encaminhados para a fila de pagamentos',
    metadata: {
      titulo_ids: tituloIds,
      quantidade: items.length, criados: resultado.criados, ja_na_fila: resultado.jaNaFila, ja_processados: resultado.processados,
      autorizacao_lote_id: options.autorizacaoLoteId || null,
      origem: options.autorizacaoInterna ? 'AUTORIZACAO_DIGITAL' : 'ENVIO_DIRETO'
    }
  });
  if (options.transaction) options.transaction.afterCommit(registrarEnvio);
  else await registrarEnvio();

  return {
    quantidade: items.length,
    criados: resultado.criados,
    ja_na_fila: resultado.jaNaFila,
    ja_processados: resultado.processados,
    ids: items.map((item) => item.id),
    itens: items.map((item) => ({ id: Number(item.id), titulo_financeiro_id: Number(item.titulo_financeiro_id) }))
  };
}

function enfileirarTitulosAutorizados(req, payload, autorizacaoLoteId, autorizacaoRevisao) {
  return enfileirarTitulos(req, payload, { autorizacaoInterna: true, autorizacaoLoteId, autorizacaoRevisao });
}

async function anexarComprovanteFila(req, filaId, file) {
  const id = Number(filaId);
  if (!Number.isInteger(id) || id <= 0 || !file?.buffer?.length) {
    throw createHttpError(400, 'Selecione um comprovante PDF valido.');
  }
  if (file.buffer.subarray(0, 5).toString() !== '%PDF-') {
    throw createHttpError(400, 'O comprovante selecionado nao e um PDF valido.');
  }
  const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const itemAtual = await PagamentoManualFilaItem.findByPk(id);
  if (!podeAnexarComprovanteFila(itemAtual)) {
    throw createHttpError(409, 'O item nao permite anexar comprovantes.');
  }
  if (itemAtual.comprovante_hash === hash) return sincronizarComprovanteRepetido(req, id);
  const comprovanteExistente = await PagamentoManualFilaItem.findOne({ where: { comprovante_hash: hash } });
  if (comprovanteExistente) throw createHttpError(409, 'Este comprovante ja foi vinculado a outro titulo.');
  const comprovanteNovoExistente = await PagamentoManualFilaComprovante.findOne({ where: { hash } });
  if (comprovanteNovoExistente?.fila_id === id) return sincronizarComprovanteRepetido(req, id);
  if (comprovanteNovoExistente) throw createHttpError(409, 'Este comprovante ja foi vinculado a outro titulo.');
  const url = await uploadToS3(file, `financeiro/fila-pagamentos/${id}/comprovantes`);
  return sequelize.transaction(async (transaction) => {
    const item = await PagamentoManualFilaItem.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!podeAnexarComprovanteFila(item)) {
      throw createHttpError(409, 'O item nao permite anexar comprovantes.');
    }
    if (item.comprovante_hash === hash) {
      await registrarComprovantesFilaNoHistorico(req, item, transaction);
      return item;
    }
    const existente = await PagamentoManualFilaItem.findOne({ where: { comprovante_hash: hash }, transaction });
    if (existente) throw createHttpError(409, 'Este comprovante ja foi vinculado a outro titulo.');
    const existenteNovo = await PagamentoManualFilaComprovante.findOne({ where: { hash }, transaction });
    if (existenteNovo?.fila_id === id) {
      await registrarComprovantesFilaNoHistorico(req, item, transaction);
      return item;
    }
    if (existenteNovo) throw createHttpError(409, 'Este comprovante ja foi vinculado a outro titulo.');
    const vinculadoEm = new Date();
    await PagamentoManualFilaComprovante.create({
      fila_id: id, nome: file.originalname, url, hash, tipo: 'PDF',
      vinculado_por: req.user?.id || null, vinculado_em: vinculadoEm
    }, { transaction });
    if (!item.comprovante_hash) {
      await item.update({
        comprovante_nome: file.originalname,
        comprovante_url: url,
        comprovante_hash: hash,
        comprovante_tipo: 'PDF',
        comprovante_vinculado_por: req.user?.id || null,
        comprovante_vinculado_em: vinculadoEm
      }, { transaction });
    }
    await registrarComprovantesFilaNoHistorico(req, item, transaction);
    return item;
  });
}

async function sincronizarComprovanteRepetido(req, id) {
  return sequelize.transaction(async transaction => {
    const item = await PagamentoManualFilaItem.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!podeAnexarComprovanteFila(item)) throw createHttpError(409, 'O item nao permite anexar comprovantes.');
    await registrarComprovantesFilaNoHistorico(req, item, transaction);
    return item;
  });
}

async function obterComprovanteFila(req, filaId) {
  const item = await PagamentoManualFilaItem.findByPk(filaId, {
    attributes: ['id', 'titulo_financeiro_id', 'comprovante_nome', 'comprovante_url'],
    include: [{ model: TituloFinanceiro, as: 'titulo', attributes: ['id', 'solicitacao_id'] }]
  });
  if (!item?.comprovante_url) throw createHttpError(404, 'Comprovante nao encontrado.');
  const acesso = item.titulo?.solicitacao_id
    ? await canAccessSolicitacaoFile(req, item.titulo.solicitacao_id)
    : { allowed: await canAccessFilaPagamentos(req.user) };
  if (!acesso.allowed) throw createHttpError(403, 'Acesso negado ao comprovante.');
  return { nome: item.comprovante_nome, url: await getPresignedUrl(item.comprovante_url, 300, { strict: true }) };
}

async function obterComprovanteAdicionalFila(req, filaId, comprovanteId) {
  const filaNumerica = Number(filaId);
  const comprovanteNumerico = Number(comprovanteId);
  if (!Number.isInteger(filaNumerica) || filaNumerica <= 0
    || !Number.isInteger(comprovanteNumerico) || comprovanteNumerico <= 0) {
    throw createHttpError(400, 'Identificador de comprovante invalido.');
  }
  const item = await PagamentoManualFilaItem.findByPk(filaNumerica, {
    attributes: ['id', 'titulo_financeiro_id'],
    include: [{ model: TituloFinanceiro, as: 'titulo', attributes: ['id', 'solicitacao_id'] }]
  });
  const comprovante = item && await PagamentoManualFilaComprovante.findOne({
    where: { id: comprovanteNumerico, fila_id: item.id }, attributes: ['nome', 'url']
  });
  if (!comprovante?.url) throw createHttpError(404, 'Comprovante nao encontrado.');
  const acesso = item.titulo?.solicitacao_id
    ? await canAccessSolicitacaoFile(req, item.titulo.solicitacao_id)
    : { allowed: await canAccessFilaPagamentos(req.user) };
  if (!acesso.allowed) throw createHttpError(403, 'Acesso negado ao comprovante.');
  return { nome: comprovante.nome, url: await getPresignedUrl(comprovante.url, 300, { strict: true }) };
}

async function carregarEmpresaTitulo(titulo, transaction) {
  if (titulo.empresa_id) return Number(titulo.empresa_id);
  const obra = titulo.obra_id
    ? await Obra.findByPk(titulo.obra_id, { attributes: ['empresa_grupo_id'], transaction })
    : null;
  return obra?.empresa_grupo_id ? Number(obra.empresa_grupo_id) : null;
}

function classificarDivergenciaPagamento(valorPago, saldoAtual, valorPrevisto) {
  const pago = roundCurrency(valorPago);
  const saldo = roundCurrency(saldoAtual);
  const previsto = roundCurrency(valorPrevisto);
  if (pago < saldo) return 'PARCIAL';
  if (pago > saldo) return 'ACIMA_SALDO';
  if (pago !== previsto) return 'DIFERENTE_PREVISTO';
  return '';
}

async function processarItemFila(req, itemPayload, requestKey, transaction, liquidacao = null) {
  const filaItem = await PagamentoManualFilaItem.findByPk(itemPayload.fila_id, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (!filaItem) throw createHttpError(404, `Item da fila ${itemPayload.fila_id} nao encontrado.`);

  const itemKey = `${requestKey}:${filaItem.id}`.slice(0, 120);
  if (filaItem.idempotency_key === itemKey && ['BAIXADO', 'DIVERGENTE'].includes(String(filaItem.status).toUpperCase())) {
    await registrarComprovantesFilaNoHistorico(req, filaItem, transaction);
    return { filaItem, idempotente: true };
  }
  if (String(filaItem.status || '').toUpperCase() !== 'PENDENTE') {
    throw createHttpError(409, `O item ${filaItem.id} nao esta mais pendente de pagamento.`);
  }

  const titulo = await TituloFinanceiro.findByPk(filaItem.titulo_financeiro_id, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (!titulo) throw createHttpError(404, 'Titulo financeiro nao encontrado.');
  if (!['ABERTO', 'PARCIAL'].includes(String(titulo.status || '').toUpperCase()) || roundCurrency(titulo.valor_saldo) <= 0) {
    throw createHttpError(409, `O titulo ${titulo.codigo || titulo.id} nao esta mais disponivel para baixa.`);
  }
  assertTituloDisponivelParaBaixa(titulo);

  // Somente a liquidacao interna ja validada pode usar a empresa da carteira.
  // Nao ha flag no payload publico que dispense a conta dos demais pagamentos.
  const carteiraCompartilhada = liquidacao?.fonte?.usar_cheque_terceiro === true;
  const conta = carteiraCompartilhada ? null : await ContaBancaria.findByPk(itemPayload.conta_bancaria_id, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (!carteiraCompartilhada && (!conta || conta.ativo === false || !conta.empresa_id)) {
    throw createHttpError(400, `A conta pagadora do titulo ${titulo.codigo || titulo.id} e invalida ou nao possui empresa.`);
  }

  const empresaPagadoraId = carteiraCompartilhada ? liquidacao.fonte.empresa_id : conta.empresa_id;
  const empresaTituloId = await carregarEmpresaTitulo(titulo, transaction);
  const baixaEntreEmpresas = Boolean(empresaTituloId && Number(empresaPagadoraId) !== empresaTituloId);

  const valorPago = roundCurrency(itemPayload.valor_pago);
  const encargos = { juros: itemPayload.juros ?? filaItem.juros, multa: itemPayload.multa ?? filaItem.multa,
    desconto: itemPayload.desconto ?? filaItem.instrumento_pagamento_json?.desconto ?? 0 };
  const valores = calcularValoresFila(itemPayload.valor_pago, titulo.valor_saldo, encargos);
  const instrumento = liquidacao?.instrumento || await resolverInstrumentoFila(titulo, { ...itemPayload, ...encargos }, transaction);
  const saldoAtual = roundCurrency(titulo.valor_saldo);
  const tipoDivergencia = valores.divergencia;
  const divergente = Boolean(tipoDivergencia);
  const motivo = String(itemPayload.motivo || '').trim();

  if (divergente && !motivo) {
    const descricaoDivergencia = tipoDivergencia === 'PARCIAL'
      ? 'pagamento parcial'
      : tipoDivergencia === 'ACIMA_SALDO'
        ? 'pagamento acima do saldo'
        : 'valor diferente do previsto na fila';
    throw createHttpError(
      400,
      `Informe a justificativa do ${descricaoDivergencia} para o titulo ${titulo.codigo || titulo.id}.`
    );
  }

  const commonUpdate = {
    instrumento_pagamento_json: { ...instrumento, desconto: valores.desconto },
    juros: valores.juros,
    multa: valores.multa,
    valor_previsto: saldoAtual,
    valor_informado: valorPago,
    data_baixa: itemPayload.data_baixa,
    conta_bancaria_id: conta?.id || null,
    processado_por: req.user?.id || null,
    processado_em: new Date(),
    idempotency_key: itemKey
  };

  if (valores.principal > saldoAtual) {
    await filaItem.update({ ...commonUpdate, status: 'DIVERGENTE', motivo }, { transaction });
    return { filaItem, titulo, baixaRegistrada: false, divergente: true };
  }

  const payloadBaixa = {
    empresa_id: empresaPagadoraId,
    conta_bancaria_id: conta?.id || null,
    ...instrumento,
    forma_recebimento: instrumento.forma_pagamento_id ? undefined : 'TRANSFERENCIA',
    valor: valores.principal,
    juros: valores.juros,
    multa: valores.multa,
    desconto: valores.desconto,
    data_movimento: itemPayload.data_baixa,
    observacoes: motivo || `Baixa registrada pela fila de pagamentos #${filaItem.id}.`,
    intercompany: baixaEntreEmpresas,
    natureza_intercompany_baixa: baixaEntreEmpresas ? 'OPERACIONAL_TERCEIRO' : undefined,
    tipo_intercompany: baixaEntreEmpresas ? 'TRANSFERENCIA_OPERACIONAL' : undefined,
    motivo_intercompany: baixaEntreEmpresas
      ? `Conta pagadora definida na fila manual #${filaItem.id}.`
      : undefined
  };
  const optionsBaixa = {
    transaction,
    autorizadoPorFilaPagamento: true,
    skipSecurityEvent: true
  };
  const baixa = liquidacao ? await liquidacao.baixar(titulo, valores, payloadBaixa, optionsBaixa)
    : await baixarInstrumentosFila(req, titulo.id, instrumento, valorPago, valores, payloadBaixa, optionsBaixa);

  await filaItem.update({
    ...commonUpdate,
    instrumento_pagamento_json: { ...commonUpdate.instrumento_pagamento_json,
      movimentos_financeiros_ids: baixa.movimentos_financeiros_ids },
    status: divergente ? 'DIVERGENTE' : 'BAIXADO',
    motivo: motivo || null,
    movimento_financeiro_id: baixa.movimento_financeiro_id || baixa.movimento?.id || null
  }, { transaction });

  await registrarComprovantesFilaNoHistorico(req, filaItem, transaction, titulo);
  return { filaItem, titulo, baixa, baixaRegistrada: true, divergente };
}

async function baixarInstrumentosFila(req, tituloId, instrumento, totalPago, valores, payload, options) {
  if (!instrumento.parcelas_cheque) {
    const baixa = await baixarTitulo(req, tituloId, payload, options);
    return { ...baixa, movimentos_financeiros_ids: [baixa.movimento_financeiro_id || baixa.movimento?.id].filter(Boolean) };
  }
  const { parcelas_cheque, ...base } = instrumento;
  const parcelas = distribuirCheques(parcelas_cheque, totalPago, valores);
  const ids = [];
  let primeira;
  for (const parcela of parcelas) {
    const baixa = await baixarTitulo(req, tituloId, { ...payload, ...base, ...parcela }, options);
    primeira ||= baixa;
    ids.push(baixa.movimento_financeiro_id || baixa.movimento?.id);
  }
  return { ...primeira, movimentos_financeiros_ids: ids };
}

async function registrarBaixasFila(req, payload = {}) {
  if (!payload.instrumentos_lote) conferirChequesUnicosLote(payload.itens);
  const requestKey = payload.idempotency_key || crypto.randomUUID();
  const resultados = await sequelize.transaction(async (transaction) => {
    await bloquearTitulosDaFila(payload.itens.map(item => item.fila_id), transaction);
    const ordered = [...payload.itens].sort((a, b) => Number(a.fila_id) - Number(b.fila_id));
    if (payload.instrumentos_lote) {
      const { registrarLiquidacaoFila } = require('./pagamentoFilaLiquidacaoService');
      return registrarLiquidacaoFila(req, ordered, payload.instrumentos_lote, requestKey, transaction,
        { processarItemFila, resolverInstrumentoFila });
    }
    const processed = [];
    for (const item of ordered) {
      if (item.parcelas_cartao?.length) {
        const { registrarLiquidacaoFila } = require('./pagamentoFilaLiquidacaoService');
        const { parcelas_cartao, ...base } = item;
        processed.push(...await registrarLiquidacaoFila(req, [base], { tipo: 'CARTAO',
          forma_pagamento_id: item.forma_pagamento_id, componentes: parcelas_cartao },
          crypto.createHash('sha256').update(`fila-cartoes:${requestKey}:${item.fila_id}`).digest('hex'), transaction,
        { processarItemFila, resolverInstrumentoFila }));
      } else processed.push(await processarItemFila(req, item, requestKey, transaction));
    }
    return processed;
  });

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'MANUAL_PAYMENT_QUEUE_SETTLED',
    recursoTipo: 'PAGAMENTO_MANUAL_FILA',
    recursoId: requestKey,
    status: 'SUCCESS',
    descricao: 'Itens da fila de pagamentos processados',
    metadata: {
      fila_ids: payload.itens.map((item) => item.fila_id),
      baixados: resultados.filter((item) => item.baixaRegistrada).length,
      divergentes: resultados.filter((item) => item.divergente).length,
      pendentes_comprovante: resultados.filter((item) => pendenteComprovanteFila(item.filaItem)).map(item => item.filaItem.id)
    }
  });

  return {
    quantidade: resultados.length,
    baixados: resultados.filter((item) => item.baixaRegistrada).length,
    divergentes: resultados.filter((item) => item.divergente).length,
    pendentes_comprovante: resultados.filter((item) => pendenteComprovanteFila(item.filaItem)).length,
    itens_pendentes_comprovante: resultados.filter((item) => pendenteComprovanteFila(item.filaItem)).map(item => ({
      fila_id: item.filaItem.id, titulo_financeiro_id: item.filaItem.titulo_financeiro_id, titulo_codigo: item.titulo?.codigo || null
    }))
  };
}

function motivoComAprovacao(motivoAtual, justificativa) {
  const original = String(motivoAtual || '').trim();
  const aprovacao = `Aprovacao da divergencia: ${String(justificativa || '').trim()}`;
  return [original, aprovacao].filter(Boolean).join('\n').slice(0, 1000);
}

async function aprovarDivergenciasFila(req, payload = {}) {
  const requestKey = payload.idempotency_key || crypto.randomUUID();
  const orderedIds = [...payload.fila_ids].sort((a, b) => Number(a) - Number(b));
  const resultados = await sequelize.transaction(async (transaction) => {
    await bloquearTitulosDaFila(orderedIds, transaction);
    const processed = [];

    for (const filaId of orderedIds) {
      const current = await PagamentoManualFilaItem.findByPk(filaId, {
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!current) throw createHttpError(404, `Item da fila ${filaId} nao encontrado.`);

      const itemKey = `${requestKey}:${current.id}`.slice(0, 120);
      if (String(current.status || '').toUpperCase() === 'RESOLVIDO' && current.idempotency_key === itemKey) {
        await registrarComprovantesFilaNoHistorico(req, current, transaction);
        processed.push({ item: current, baixaRegistrada: Boolean(current.movimento_financeiro_id), idempotente: true });
        continue;
      }
      if (String(current.status || '').toUpperCase() !== 'DIVERGENTE') {
        throw createHttpError(409, `O item ${current.id} nao possui divergencia pendente de aprovacao.`);
      }
      if (!current.comprovante_hash || !current.comprovante_url) {
        throw createHttpError(400, `Anexe o comprovante do item ${current.id} antes de autorizar a baixa.`);
      }

      const titulo = await TituloFinanceiro.findByPk(current.titulo_financeiro_id, {
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!titulo) throw createHttpError(404, 'Titulo financeiro nao encontrado.');

      let movimentoId = current.movimento_financeiro_id || null;
      let baixaRegistrada = false;

      if (!movimentoId) {
        if (!['ABERTO', 'PARCIAL'].includes(String(titulo.status || '').toUpperCase()) || roundCurrency(titulo.valor_saldo) <= 0) {
          throw createHttpError(409, `O titulo ${titulo.codigo || titulo.id} nao esta mais disponivel para baixa.`);
        }
        assertTituloDisponivelParaBaixa(titulo);

        const conta = await ContaBancaria.findByPk(current.conta_bancaria_id, {
          transaction,
          lock: transaction.LOCK.UPDATE
        });
        if (!conta || conta.ativo === false || !conta.empresa_id) {
          throw createHttpError(400, `A conta pagadora do titulo ${titulo.codigo || titulo.id} e invalida ou nao possui empresa.`);
        }
        const empresaTituloId = await carregarEmpresaTitulo(titulo, transaction);
        const baixaEntreEmpresas = Boolean(empresaTituloId && Number(conta.empresa_id) !== empresaTituloId);

        const valorPago = roundCurrency(current.valor_informado);
        const valores = calcularValoresFila(current.valor_informado, titulo.valor_saldo, {
          juros: current.juros, multa: current.multa, desconto: current.instrumento_pagamento_json?.desconto || 0 });
        if (valorPago <= 0 || !current.data_baixa) {
          throw createHttpError(409, `A divergencia do titulo ${titulo.codigo || titulo.id} nao possui dados completos para a baixa.`);
        }

        const instrumento = await resolverInstrumentoFila(titulo, { ...(current.instrumento_pagamento_json || {}),
          conta_bancaria_id: conta.id, valor_pago: valorPago, juros: current.juros, multa: current.multa,
          desconto: valores.desconto }, transaction);
        const baixa = await baixarInstrumentosFila(req, titulo.id, instrumento, valorPago, valores, {
          empresa_id: conta.empresa_id,
          conta_bancaria_id: conta.id,
          ...instrumento,
          forma_recebimento: (current.instrumento_pagamento_json?.forma_pagamento_id || titulo.forma_pagamento_id) ? undefined : 'TRANSFERENCIA',
          valor: valores.principal,
          juros: valores.juros,
          multa: valores.multa,
          desconto: valores.desconto,
          data_movimento: current.data_baixa,
          observacoes: `Baixa divergente autorizada na fila #${current.id}. ${payload.justificativa}`,
          intercompany: baixaEntreEmpresas,
          natureza_intercompany_baixa: baixaEntreEmpresas ? 'OPERACIONAL_TERCEIRO' : undefined,
          tipo_intercompany: baixaEntreEmpresas ? 'TRANSFERENCIA_OPERACIONAL' : undefined,
          motivo_intercompany: baixaEntreEmpresas
            ? `Conta pagadora definida na fila manual #${current.id}. ${payload.justificativa}`
            : undefined
        }, {
          transaction,
          autorizadoPorFilaPagamento: true,
          autorizarValorAcimaSaldo: true,
          skipSecurityEvent: true
        });
        movimentoId = baixa.movimento_financeiro_id || baixa.movimento?.id || null;
        await current.update({ instrumento_pagamento_json: { ...current.instrumento_pagamento_json,
          movimentos_financeiros_ids: baixa.movimentos_financeiros_ids } }, { transaction });
        baixaRegistrada = true;
      }

      await current.update({
        status: 'RESOLVIDO',
        movimento_financeiro_id: movimentoId,
        motivo: motivoComAprovacao(current.motivo, payload.justificativa),
        resolvido_por: req.user?.id || null,
        resolvido_em: new Date(),
        idempotency_key: itemKey
      }, { transaction });
      await registrarComprovantesFilaNoHistorico(req, current, transaction, titulo);
      processed.push({ item: current, baixaRegistrada, idempotente: false });
    }

    return processed;
  });

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'MANUAL_PAYMENT_DIVERGENCE_APPROVED',
    recursoTipo: 'PAGAMENTO_MANUAL_FILA',
    recursoId: requestKey,
    status: 'SUCCESS',
    descricao: 'Divergencias de pagamento autorizadas',
    metadata: {
      fila_ids: orderedIds,
      quantidade: resultados.length,
      baixas_registradas: resultados.filter((item) => item.baixaRegistrada && !item.idempotente).length,
      justificativa: payload.justificativa
    }
  });

  return {
    quantidade: resultados.length,
    baixas_registradas: resultados.filter((item) => item.baixaRegistrada && !item.idempotente).length
  };
}

async function informarNaoPagamento(req, id, payload = {}) {
  const item = await sequelize.transaction(async (transaction) => {
    const current = await PagamentoManualFilaItem.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!current) throw createHttpError(404, 'Item da fila nao encontrado.');
    if (String(current.status || '').toUpperCase() !== 'PENDENTE') {
      throw createHttpError(409, 'Somente itens pendentes podem ser marcados como nao pagos.');
    }
    return current.update({
      status: 'NAO_PAGO',
      motivo: payload.motivo,
      processado_por: req.user?.id || null,
      processado_em: new Date()
    }, { transaction });
  });

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'MANUAL_PAYMENT_NOT_PAID',
    recursoTipo: 'PAGAMENTO_MANUAL_FILA',
    recursoId: item.id,
    status: 'SUCCESS',
    descricao: 'Titulo informado como nao pago',
    metadata: { titulo_financeiro_id: item.titulo_financeiro_id, motivo: payload.motivo }
  });
  return item;
}

async function resolverItemFila(req, id, payload = {}) {
  const result = await sequelize.transaction(async (transaction) => {
    await bloquearTitulosDaFila([Number(id)], transaction);
    const current = await PagamentoManualFilaItem.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!current) throw createHttpError(404, 'Item da fila nao encontrado.');
    if (!['NAO_PAGO', 'DIVERGENTE'].includes(String(current.status || '').toUpperCase())) {
      throw createHttpError(409, 'Este item nao possui uma pendencia para resolver.');
    }

    if (payload.acao === 'ENCERRAR') {
      const item = await current.update({
        status: 'RESOLVIDO',
        motivo: payload.motivo || current.motivo,
        resolvido_por: req.user?.id || null,
        resolvido_em: new Date()
      }, { transaction });
      return { item, reaberto: null };
    }

    const titulo = await TituloFinanceiro.findByPk(current.titulo_financeiro_id, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!titulo || !['ABERTO', 'PARCIAL'].includes(String(titulo.status || '').toUpperCase()) || roundCurrency(titulo.valor_saldo) <= 0) {
      throw createHttpError(409, 'O titulo nao possui saldo aberto para retornar a fila.');
    }
    assertTituloDisponivelParaBaixa(titulo);
    const autorizacao = await conferirAutorizacaoRetorno(current, transaction);
    await current.update({
      status: 'RESOLVIDO',
      motivo: current.motivo,
      resolvido_por: req.user?.id || null,
      resolvido_em: new Date()
    }, { transaction });
    const reaberto = await PagamentoManualFilaItem.create({
      titulo_financeiro_id: titulo.id,
      status: 'PENDENTE',
      valor_previsto: roundCurrency(titulo.valor_saldo),
      juros: Number(titulo.valor_baixado || 0) > 0 ? 0 : roundCurrency(titulo.juros),
      multa: Number(titulo.valor_baixado || 0) > 0 ? 0 : roundCurrency(titulo.multa),
      motivo: null,
      data_vencimento_prevista: titulo.data_vencimento || null,
      selecionado_por: req.user?.id || null,
      selecionado_em: new Date()
    }, { transaction });
    await transferirAutorizacaoRetorno(req, autorizacao, current, reaberto, transaction, 'DEVOLUCAO_NAO_PAGO');
    return { item: current, reaberto };
  });
  const item = result.item;

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: payload.acao === 'REABRIR' ? 'MANUAL_PAYMENT_QUEUE_REOPENED' : 'MANUAL_PAYMENT_QUEUE_RESOLVED',
    recursoTipo: 'PAGAMENTO_MANUAL_FILA',
    recursoId: item.id,
    status: 'SUCCESS',
    descricao: payload.acao === 'REABRIR' ? 'Pendencia devolvida para a fila' : 'Pendencia encerrada',
    metadata: {
      titulo_financeiro_id: item.titulo_financeiro_id,
      novo_item_fila_id: result.reaberto?.id || null,
      motivo: payload.acao === 'REABRIR' ? null : (payload.motivo || null)
    }
  });
  return { item, reaberto: result.reaberto };
}

async function conferirAutorizacaoRetorno(item, transaction) {
  const candidato = await PagamentoAutorizacaoItem.findOne({ where: { titulo_financeiro_id: item.titulo_financeiro_id },
    order: [['id', 'DESC']], transaction });
  if (!candidato) return null; // Fila legada/direta: nao fabrica aprovacao digital.
  const lote = await PagamentoAutorizacaoLote.findByPk(candidato.lote_id, { transaction, lock: transaction.LOCK.UPDATE });
  const atual = await PagamentoAutorizacaoItem.findByPk(candidato.id, { transaction, lock: transaction.LOCK.UPDATE });
  if (!lote || !['AGUARDANDO', 'AUTORIZADO', 'CONCLUIDO'].includes(lote.status)
    || !atual || atual.status !== 'ENFILEIRADO' || Number(atual.fila_item_id) !== Number(item.id)) {
    throw createHttpError(409, 'A autorizacao deste titulo mudou. Confira o lote atual antes de devolver para a fila.');
  }
  return atual;
}

async function transferirAutorizacaoRetorno(req, autorizacao, anterior, novo, transaction, origem) {
  if (!autorizacao) return;
  await autorizacao.update({ fila_item_id: novo.id }, { transaction });
  await recordEvent({ loteId: autorizacao.lote_id, itemId: autorizacao.id, userId: req.user.id,
    type: 'ITEM_DEVOLVIDO_FILA', data: { fila_item_anterior_id: anterior.id, fila_item_id: novo.id, origem }, transaction });
}

async function estornarBaixaFila(req, id, payload) {
  const candidato = await PagamentoManualFilaItem.findByPk(id, { attributes: ['instrumento_pagamento_json'] });
  if (candidato?.instrumento_pagamento_json?.liquidacao_id) return estornarLiquidacaoFila(req, id, candidato.instrumento_pagamento_json.liquidacao_id, payload);
  const key = `${payload.idempotency_key}:${id}`.slice(0, 120);
  const result = await sequelize.transaction(async transaction => {
    await bloquearTitulosDaFila([Number(id)], transaction);
    const current = await PagamentoManualFilaItem.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!current) throw createHttpError(404, 'Item da fila nao encontrado.');
    const anterior = current.instrumento_pagamento_json || {};
    if (anterior.estorno?.chave === key) return { item: current, reaberto_id: anterior.estorno.reaberto_id, idempotente: true };
    if (!['BAIXADO', 'DIVERGENTE', 'RESOLVIDO'].includes(current.status) || !current.movimento_financeiro_id || anterior.estorno) {
      throw createHttpError(409, 'Este item nao possui baixa ativa para estornar.');
    }
    const autorizacao = await conferirAutorizacaoRetorno(current, transaction);
    const ids = [...new Set(anterior.movimentos_financeiros_ids?.length ? anterior.movimentos_financeiros_ids : [current.movimento_financeiro_id])].sort((a, b) => a - b);
    let titulo;
    for (const movimentoId of ids) {
      titulo = await estornarMovimentoTitulo(req, current.titulo_financeiro_id, movimentoId,
        { observacoes: payload.motivo }, { transaction, skipSecurityEvent: true, estornoFila: true });
    }
    assertTituloDisponivelParaBaixa(titulo);
    if (!['ABERTO', 'PARCIAL'].includes(titulo.status) || roundCurrency(titulo.valor_saldo) <= 0) {
      throw createHttpError(409, 'O titulo nao ficou disponivel para retornar a fila.');
    }
    await current.update({ status: 'RESOLVIDO', resolvido_por: req.user.id, resolvido_em: new Date(),
      motivo: `${String(current.motivo || '').trim()}\nEstorno: ${payload.motivo}`.trim() }, { transaction });
    const reaberto = await PagamentoManualFilaItem.create({ titulo_financeiro_id: titulo.id, status: 'PENDENTE',
      valor_previsto: roundCurrency(titulo.valor_saldo), data_vencimento_prevista: titulo.data_vencimento,
      juros: Number(titulo.valor_baixado || 0) > 0 ? 0 : roundCurrency(titulo.juros),
      multa: Number(titulo.valor_baixado || 0) > 0 ? 0 : roundCurrency(titulo.multa),
      selecionado_por: req.user.id, selecionado_em: new Date() }, { transaction });
    await current.update({ instrumento_pagamento_json: { ...anterior,
      estorno: { chave: key, motivo: payload.motivo, usuario_id: req.user.id, em: new Date().toISOString(), reaberto_id: reaberto.id } } }, { transaction });
    await transferirAutorizacaoRetorno(req, autorizacao, current, reaberto, transaction, 'ESTORNO_BAIXA');
    await SecurityEventLog.create({ usuario_id: req.user.id, tipo_evento: 'MANUAL_PAYMENT_QUEUE_REVERSED',
      recurso_tipo: 'PAGAMENTO_MANUAL_FILA', recurso_id: String(current.id), status: 'SUCCESS',
      descricao: 'Baixa estornada e saldo devolvido para a fila', ip_origem: getRequestIp(req),
      metadata: { movimentos_ids: ids, reaberto_id: reaberto.id, motivo: payload.motivo } }, { transaction });
    return { item: current, reaberto_id: reaberto.id, idempotente: false };
  });
  return { fila_id: result.item.id, reaberto_id: result.reaberto_id, idempotente: result.idempotente };
}

async function estornarLiquidacaoFila(req, anchorId, grupoId, payload) {
  const { obterGrupoParaEstorno, devolverCarteiraGrupo } = require('./pagamentoFilaLiquidacaoService');
  return sequelize.transaction(async transaction => {
    // Trava titulos antes do grupo, mesma ordem da liquidacao, evitando inversao.
    const referencia = await PagamentoFilaLiquidacao.findByPk(grupoId, { transaction });
    if (!referencia?.dados?.fila_ids?.includes(Number(anchorId))) throw createHttpError(409, 'Item nao pertence ao grupo.');
    await bloquearTitulosDaFila(referencia.dados.fila_ids, transaction);
    const { grupo, filas } = await obterGrupoParaEstorno(req, grupoId, transaction);
    if (grupo.status === 'ESTORNADO') return { fila_id: Number(anchorId), reaberto_ids: grupo.dados.reaberto_ids, idempotente: true };
    const reabertos = [];
    for (const fila of filas) {
      const current = await PagamentoManualFilaItem.findByPk(fila.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!['BAIXADO', 'DIVERGENTE', 'RESOLVIDO'].includes(current.status) || current.instrumento_pagamento_json?.estorno
        || Number(current.instrumento_pagamento_json?.liquidacao_id) !== Number(grupo.id)) throw createHttpError(409, 'Grupo ja possui processamento posterior.');
      const autorizacao = await conferirAutorizacaoRetorno(current, transaction);
      let titulo;
      for (const parte of grupo.dados.alocacoes.filter(item => Number(item.fila_id) === Number(fila.id))) {
        titulo = await estornarMovimentoTitulo(req, current.titulo_financeiro_id, parte.movimento_id,
          { observacoes: payload.motivo }, { transaction, skipSecurityEvent: true, estornoFila: true, filaLiquidacaoId: grupo.id });
      }
      assertTituloDisponivelParaBaixa(titulo);
      if (!titulo || !['ABERTO', 'PARCIAL'].includes(titulo.status) || Number(titulo.valor_saldo) <= 0) throw createHttpError(409, 'Saldo do grupo nao ficou disponivel.');
      const novo = await PagamentoManualFilaItem.create({ titulo_financeiro_id: titulo.id, status: 'PENDENTE',
        valor_previsto: titulo.valor_saldo, data_vencimento_prevista: titulo.data_vencimento,
        juros: Number(titulo.valor_baixado || 0) > 0 ? 0 : roundCurrency(titulo.juros),
        multa: Number(titulo.valor_baixado || 0) > 0 ? 0 : roundCurrency(titulo.multa), selecionado_por: req.user.id, selecionado_em: new Date() }, { transaction });
      await current.update({ status: 'RESOLVIDO', resolvido_por: req.user.id, resolvido_em: new Date(),
        instrumento_pagamento_json: { ...current.instrumento_pagamento_json, estorno: { motivo: payload.motivo, reaberto_id: novo.id, grupo_id: grupo.id } } }, { transaction });
      await transferirAutorizacaoRetorno(req, autorizacao, current, novo, transaction, 'ESTORNO_GRUPO_BAIXA');
      reabertos.push(novo.id);
    }
    await devolverCarteiraGrupo(req, grupo, transaction);
    await grupo.update({ status: 'ESTORNADO', estornado_por: req.user.id, estornado_em: new Date(),
      dados: { ...grupo.dados, reaberto_ids: reabertos, motivo_estorno: payload.motivo } }, { transaction });
    await SecurityEventLog.create({ usuario_id: req.user.id, tipo_evento: 'MANUAL_PAYMENT_QUEUE_GROUP_REVERSED',
      recurso_tipo: 'PAGAMENTO_FILA_LIQUIDACAO', recurso_id: String(grupo.id), status: 'SUCCESS',
      descricao: 'Grupo completo estornado', metadata: { reaberto_ids: reabertos, motivo: payload.motivo } }, { transaction });
    return { fila_id: Number(anchorId), reaberto_ids: reabertos, idempotente: false };
  });
}

module.exports = {
  anexarComprovanteFila,
  aprovarDivergenciasFila,
  classificarDivergenciaPagamento,
  enfileirarTitulos,
  enfileirarTitulosAutorizados,
  informarNaoPagamento,
  listarContasPagadorasFila,
  listarInstrumentosFila,
  resolverInstrumentoFila,
  listarFilaPagamentos,
  obterComprovanteFila,
  obterComprovanteAdicionalFila,
  registrarBaixasFila,
  estornarBaixaFila,
  resolverItemFila
};
