const {
  ContaBancaria,
  EmpresaGrupo,
  MovimentoFinanceiro,
  PaymentAccount,
  PaymentBatch,
  PaymentBatchItem,
  PaymentBeneficiary,
  PaymentIntent,
  PaymentReconciliation,
  TituloFinanceiro,
  sequelize
} = require('../models');
const { carregarContaBancaria, obterSessaoAbertaParaConta } = require('./financeiroCaixaSessionHelper');
const { registrarEventoSeguranca } = require('./securityLogService');
const { normalizeTipoIntercompany } = require('../constants/intercompany');
const { sincronizarStatusSolicitacaoPorBaixaTitulos } = require('./solicitacaoFinanceiroStatusService');
const { sincronizarContratoComercialPorTituloFinanceiro } = require('./comercialService');

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function roundCurrency(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function calcularStatusTitulo({ valorOriginal, valorBaixado }) {
  const saldo = roundCurrency(valorOriginal - valorBaixado);
  if (saldo <= 0) {
    return { status: 'QUITADO', valor_saldo: 0 };
  }
  return { status: 'PARCIAL', valor_saldo: saldo };
}

async function recalcularStatusLotePorIntent(intentId, { transaction = null } = {}) {
  const batchItems = await PaymentBatchItem.findAll({
    where: { payment_intent_id: intentId },
    transaction,
    lock: transaction?.LOCK?.UPDATE
  });

  for (const batchItem of batchItems) {
    await batchItem.update({ status: 'BAIXADO' }, { transaction });

    const items = await PaymentBatchItem.findAll({
      where: { payment_batch_id: batchItem.payment_batch_id },
      include: [{ model: PaymentIntent, as: 'intent', attributes: ['id', 'status'] }],
      transaction,
      lock: transaction?.LOCK?.UPDATE
    });

    const statuses = items.map((item) => String(item.intent?.status || item.status || '').toUpperCase());
    const allBaixado = statuses.length > 0 && statuses.every((status) => status === 'BAIXADO');
    const hasBaixado = statuses.some((status) => status === 'BAIXADO');
    const hasAguardandoBaixa = statuses.some((status) => status === 'AGUARDANDO_CONFIRMACAO_BAIXA');
    const hasRejeitado = statuses.some((status) => ['REJEITADO_BANCO', 'FALHA_INTEGRACAO'].includes(status));

    let nextStatus = null;
    const updatePayload = {};

    if (allBaixado) {
      nextStatus = 'BAIXADO';
      updatePayload.closed_at = new Date();
    } else if (hasBaixado && hasRejeitado && !hasAguardandoBaixa) {
      nextStatus = 'PARCIALMENTE_REJEITADO';
    } else if (hasBaixado || hasAguardandoBaixa) {
      nextStatus = 'AGUARDANDO_CONFIRMACAO_BAIXA';
    }

    if (nextStatus) {
      await PaymentBatch.update(
        {
          status: nextStatus,
          ...updatePayload
        },
        {
          where: { id: batchItem.payment_batch_id },
          transaction
        }
      );
    }
  }
}

function buildIntercompanyBaixaPagamento({ payload = {}, titulo, empresaBaixaId }) {
  const empresaTituloId = titulo?.empresa_id ? Number(titulo.empresa_id) : null;
  const empresasDiferentes = Boolean(
    empresaTituloId &&
    empresaBaixaId &&
    Number(empresaTituloId) !== Number(empresaBaixaId)
  );

  if (!empresasDiferentes) {
    return {
      intercompany_group_id: null,
      empresa_origem_id: null,
      empresa_destino_id: null,
      tipo_intercompany: null,
      motivo_intercompany: null,
      elimina_consolidado: false,
      transferencia_interna: false
    };
  }

  if (!payload.intercompany) {
    throw createHttpError(
      400,
      'Empresa do titulo diverge da empresa pagadora do lote. Marque a baixa como Entre Empresas e informe o tipo.'
    );
  }

  const tipoIntercompany = normalizeTipoIntercompany(payload.tipo_intercompany);
  if (!tipoIntercompany) {
    throw createHttpError(400, 'Tipo e obrigatorio quando outra empresa paga o titulo.');
  }

  const isPagar = String(titulo.tipo || '').toUpperCase() === 'PAGAR';
  return {
    intercompany_group_id: payload.intercompany_group_id || `IC-PAGAMENTO-${titulo.id}`,
    empresa_origem_id: isPagar ? Number(empresaBaixaId) : Number(empresaTituloId),
    empresa_destino_id: isPagar ? Number(empresaTituloId) : Number(empresaBaixaId),
    tipo_intercompany: tipoIntercompany,
    motivo_intercompany: payload.motivo_intercompany || null,
    elimina_consolidado: payload.elimina_consolidado !== false,
    transferencia_interna: payload.transferencia_interna !== false
  };
}

async function listPaymentsAwaitingBaixaConfirmation(req) {
  return PaymentIntent.findAll({
    where: { status: 'AGUARDANDO_CONFIRMACAO_BAIXA' },
    include: [
      {
        model: TituloFinanceiro,
        as: 'titulo',
        include: [{ model: EmpresaGrupo, as: 'empresa', attributes: ['id', 'codigo', 'nome', 'razao_social'] }]
      },
      {
        model: PaymentAccount,
        as: 'paymentAccount',
        include: [
          { model: ContaBancaria, as: 'contaBancaria', attributes: ['id', 'nome', 'banco', 'agencia', 'conta', 'empresa_id'] },
          { model: EmpresaGrupo, as: 'empresa', attributes: ['id', 'codigo', 'nome', 'razao_social', 'cnpj'] }
        ]
      },
      { model: PaymentBeneficiary, as: 'beneficiary', attributes: ['id', 'nome', 'cpf_cnpj', 'pix_tipo_chave', 'pix_chave'] }
    ],
    order: [['confirmado_banco_em', 'ASC'], ['id', 'ASC']]
  });
}

async function confirmBaixaFromPaymentIntent(req, id, payload = {}) {
  return sequelize.transaction(async (transaction) => {
    const intent = await PaymentIntent.findByPk(id, {
      include: [{ model: PaymentAccount, as: 'paymentAccount' }],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!intent) throw createHttpError(404, 'Intencao de pagamento nao encontrada.');
    if (String(intent.status || '').toUpperCase() !== 'AGUARDANDO_CONFIRMACAO_BAIXA') {
      throw createHttpError(400, 'Pagamento nao esta aguardando confirmacao de baixa.');
    }
    if (!intent.confirmado_banco_em) {
      throw createHttpError(400, 'Pagamento ainda nao possui data/hora de confirmacao bancaria registrada.');
    }

    const existing = await PaymentReconciliation.findOne({
      where: { payment_intent_id: intent.id },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (existing?.movimento_financeiro_id) {
      throw createHttpError(409, 'Pagamento ja possui baixa vinculada.');
    }

    const titulo = await TituloFinanceiro.findByPk(intent.titulo_financeiro_id, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!titulo) throw createHttpError(404, 'Titulo financeiro nao encontrado.');
    if (!['ABERTO', 'PARCIAL'].includes(String(titulo.status || '').toUpperCase())) {
      throw createHttpError(400, 'Titulo nao permite baixa neste status.');
    }
    if (!titulo.empresa_id) {
      throw createHttpError(400, 'Titulo financeiro nao possui empresa do titulo vinculada.');
    }

    const valorBaixa = roundCurrency(intent.valor);
    const saldoAtual = roundCurrency(titulo.valor_saldo);
    if (valorBaixa <= 0 || valorBaixa > saldoAtual) {
      throw createHttpError(400, 'Valor do pagamento incompativel com saldo do titulo.');
    }

    const dataMovimento = payload.data_movimento || today();
    const paymentAccount = intent.paymentAccount;
    if (!paymentAccount?.empresa_id) {
      throw createHttpError(400, 'Conta pagadora do pagamento nao possui empresa pagadora vinculada.');
    }
    const contaBancariaId = intent.paymentAccount?.conta_bancaria_id || null;
    if (!contaBancariaId) {
      throw createHttpError(400, 'Conta pagadora do pagamento nao possui conta bancaria vinculada.');
    }
    const contaBancaria = contaBancariaId
      ? await carregarContaBancaria(contaBancariaId, { transaction })
      : null;
    if (!contaBancaria?.empresa_id) {
      throw createHttpError(400, 'Conta bancaria vinculada ao pagamento nao possui empresa vinculada.');
    }
    if (Number(contaBancaria.empresa_id) !== Number(paymentAccount.empresa_id)) {
      throw createHttpError(400, 'Empresa da conta bancaria diverge da empresa pagadora do lote.');
    }
    const intercompanyFields = buildIntercompanyBaixaPagamento({
      payload,
      titulo,
      empresaBaixaId: paymentAccount.empresa_id
    });
    const caixaSessao = contaBancaria
      ? await obterSessaoAbertaParaConta(contaBancaria, dataMovimento, { transaction })
      : null;
    const novoValorBaixado = roundCurrency(Number(titulo.valor_baixado || 0) + valorBaixa);
    const novoEstado = calcularStatusTitulo({
      valorOriginal: Number(titulo.valor_original || 0),
      valorBaixado: novoValorBaixado
    });

    const movimento = await MovimentoFinanceiro.create({
      titulo_financeiro_id: titulo.id,
      conta_bancaria_id: contaBancaria?.id || null,
      empresa_id: paymentAccount.empresa_id,
      ...intercompanyFields,
      caixa_sessao_id: caixaSessao?.id || null,
      forma_recebimento: 'PIX',
      documento_referencia: intent.correlation_id,
      tipo_movimento: 'BAIXA',
      status: 'ATIVO',
      valor: valorBaixa,
      juros: 0,
      multa: 0,
      desconto: 0,
      valor_quitacao: valorBaixa,
      data_movimento: dataMovimento,
      observacoes: payload.observacoes || `Baixa confirmada a partir do pagamento bancario #${intent.id}.`,
      criado_por: req.user?.id || null
    }, { transaction });

    await titulo.update({
      valor_baixado: novoValorBaixado,
      valor_saldo: novoEstado.valor_saldo,
      status: novoEstado.status,
      data_quitacao: novoEstado.status === 'QUITADO' ? dataMovimento : null,
      atualizado_por: req.user?.id || null
    }, { transaction });

    await sincronizarContratoComercialPorTituloFinanceiro({
      tituloId: titulo.id,
      usuarioId: req.user?.id || null,
      transaction,
      motivo: 'CONFIRMACAO_PAGAMENTO_BANCARIO'
    });

    await sincronizarStatusSolicitacaoPorBaixaTitulos({
      solicitacaoId: titulo.solicitacao_id,
      usuarioId: req.user?.id || null,
      setor: 'FINANCEIRO',
      transaction
    });

    await intent.update({
      status: 'BAIXADO',
      baixa_confirmada_em: new Date(),
      baixa_confirmada_por: req.user?.id || null,
      updated_by: req.user?.id || null
    }, { transaction });

    await recalcularStatusLotePorIntent(intent.id, { transaction });

    const reconciliationPayload = {
      movimento_financeiro_id: movimento.id,
      conciliacao_bancaria_id: existing?.conciliacao_bancaria_id || null,
      status: 'BAIXADO',
      matched_by: 'MANUAL_FINANCEIRO',
      matched_at: new Date(),
      created_by: existing?.created_by || req.user?.id || null
    };
    if (existing) {
      await existing.update(reconciliationPayload, { transaction });
    } else {
      await PaymentReconciliation.create({
        payment_intent_id: intent.id,
        ...reconciliationPayload
      }, { transaction });
    }

    await registrarEventoSeguranca({
      req,
      usuarioId: req.user?.id || null,
      tipoEvento: 'PAYMENT_INTENT_BAIXA_CONFIRMED',
      recursoTipo: 'PAYMENT_INTENT',
      recursoId: intent.id,
      status: 'SUCCESS',
      descricao: 'Baixa semiautomatica confirmada',
      metadata: { titulo_financeiro_id: titulo.id, movimento_financeiro_id: movimento.id }
    });

    return { intent, titulo, movimento };
  });
}

module.exports = {
  confirmBaixaFromPaymentIntent,
  listPaymentsAwaitingBaixaConfirmation,
  recalcularStatusLotePorIntent
};
