const {
  CartaoFinanceiro,
  ContaBancaria,
  FaturaCartaoFinanceiro,
  FaturaCartaoTitulo,
  MovimentoFinanceiro,
  Parceiro,
  sequelize,
  TituloFinanceiro
} = require('../models');
const { canAccessFinanceiro, getFinanceiroObraScopeIds } = require('./authorizationService');
const { obterSessaoAbertaParaConta } = require('./financeiroCaixaSessionHelper');
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

function toDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function clampDay(year, monthIndex, day) {
  return Math.min(Math.max(Number(day || 1), 1), new Date(year, monthIndex + 1, 0).getDate());
}

function addMonths(base, amount) {
  return new Date(base.getFullYear(), base.getMonth() + amount, base.getDate());
}

function buildDate(year, monthIndex, day) {
  return new Date(year, monthIndex, clampDay(year, monthIndex, day));
}

function calcularDatasFatura(cartao, dataCompra, parcelaOffset = 0) {
  const compra = new Date(`${dataCompra}T00:00:00`);
  if (Number.isNaN(compra.getTime())) {
    throw createHttpError(400, 'Data de compra invalida para calcular fatura.');
  }

  const fechamentoDia = Number(cartao.dia_fechamento || 1);
  const vencimentoDia = Number(cartao.dia_vencimento || 1);
  const fechamentoBase = new Date(
    compra.getFullYear(),
    compra.getMonth() + (compra.getDate() <= fechamentoDia ? 0 : 1) + Number(parcelaOffset || 0),
    1
  );
  const dataFechamento = buildDate(fechamentoBase.getFullYear(), fechamentoBase.getMonth(), fechamentoDia);
  const vencimentoMonthOffset = vencimentoDia > fechamentoDia ? 0 : 1;
  const vencimentoBase = addMonths(dataFechamento, vencimentoMonthOffset);
  const dataVencimento = buildDate(vencimentoBase.getFullYear(), vencimentoBase.getMonth(), vencimentoDia);
  const dataInicioBase = addMonths(dataFechamento, -1);
  const dataInicio = buildDate(dataInicioBase.getFullYear(), dataInicioBase.getMonth(), fechamentoDia);
  dataInicio.setDate(dataInicio.getDate() + 1);

  return {
    competencia: `${dataFechamento.getFullYear()}-${String(dataFechamento.getMonth() + 1).padStart(2, '0')}`,
    data_inicio: toDateOnly(dataInicio),
    data_fechamento: toDateOnly(dataFechamento),
    data_vencimento: toDateOnly(dataVencimento)
  };
}

async function assertFinanceAccess(req) {
  const allowed = await canAccessFinanceiro(req.user);
  if (!allowed) {
    throw createHttpError(403, 'Acesso negado para o modulo financeiro');
  }
}

async function recalcularFaturaCartao(faturaId, { transaction = null } = {}) {
  const titulos = await TituloFinanceiro.findAll({
    where: { fatura_cartao_id: faturaId },
    attributes: ['valor_original'],
    transaction
  });
  const valorTotal = titulos.reduce((total, titulo) => roundCurrency(total + Number(titulo.valor_original || 0)), 0);
  await FaturaCartaoFinanceiro.update(
    { valor_total: valorTotal },
    { where: { id: faturaId }, transaction }
  );
  return valorTotal;
}

async function obterOuCriarFaturaCartao({ cartaoId, dataCompra, parcelaOffset = 0, usuarioId = null, transaction = null }) {
  const cartao = await CartaoFinanceiro.findByPk(cartaoId, { transaction });
  if (!cartao || cartao.ativo === false) {
    throw createHttpError(400, 'Cartao financeiro invalido ou inativo.');
  }
  if (String(cartao.tipo || 'CREDITO').trim().toUpperCase() !== 'CREDITO') {
    throw createHttpError(400, 'Somente cartoes de credito podem gerar fatura.');
  }

  const datas = calcularDatasFatura(cartao, dataCompra, parcelaOffset);
  const [fatura] = await FaturaCartaoFinanceiro.findOrCreate({
    where: {
      cartao_id: cartao.id,
      competencia: datas.competencia
    },
    defaults: {
      ...datas,
      conta_bancaria_id: cartao.conta_bancaria_id || null,
      valor_total: 0,
      status: 'ABERTA',
      criado_por: usuarioId,
      atualizado_por: usuarioId
    },
    transaction
  });

  return { fatura, cartao, datas };
}

async function vincularTituloAFatura({ titulo, fatura, transaction = null }) {
  await FaturaCartaoTitulo.findOrCreate({
    where: { titulo_financeiro_id: titulo.id },
    defaults: {
      fatura_cartao_id: fatura.id,
      titulo_financeiro_id: titulo.id
    },
    transaction
  });
  await titulo.update({
    fatura_cartao_id: fatura.id,
    cartao_id: fatura.cartao_id,
    data_vencimento: fatura.data_vencimento
  }, { transaction });
  await recalcularFaturaCartao(fatura.id, { transaction });
}

async function listarFaturasCartao(req, filters = {}) {
  await assertFinanceAccess(req);

  const where = {};
  if (filters.status) where.status = String(filters.status).toUpperCase();
  if (filters.cartao_id) where.cartao_id = Number(filters.cartao_id);

  return FaturaCartaoFinanceiro.findAll({
    where,
    include: [
      { model: CartaoFinanceiro, as: 'cartao', include: [{ model: ContaBancaria, as: 'contaBancaria', attributes: ['id', 'nome'] }] },
      {
        model: TituloFinanceiro,
        as: 'titulos',
        include: [{ model: Parceiro, as: 'parceiro', attributes: ['id', 'nome', 'cpf_cnpj'] }]
      }
    ],
    order: [['data_vencimento', 'DESC'], ['id', 'DESC']]
  });
}

async function carregarFaturaCartao(req, faturaId, { transaction = null } = {}) {
  await assertFinanceAccess(req);
  const fatura = await FaturaCartaoFinanceiro.findByPk(faturaId, {
    include: [
      { model: CartaoFinanceiro, as: 'cartao' },
      {
        model: TituloFinanceiro,
        as: 'titulos',
        include: [{ model: Parceiro, as: 'parceiro', attributes: ['id', 'nome', 'cpf_cnpj'] }]
      }
    ],
    transaction
  });

  if (!fatura) throw createHttpError(404, 'Fatura de cartao nao encontrada.');

  const obraIds = await getFinanceiroObraScopeIds(req.user);
  if (obraIds !== null) {
    const foraDoEscopo = (fatura.titulos || []).some((titulo) => !obraIds.includes(Number(titulo.obra_id || 0)));
    if (foraDoEscopo) throw createHttpError(403, 'Acesso negado para titulos desta fatura.');
  }

  return fatura;
}

function buildIntercompanyBaixaFatura({ payload = {}, titulo, empresaBaixaId }) {
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
      `Titulo ${titulo.codigo || titulo.id} pertence a empresa diferente da conta bancaria da baixa. Marque a baixa como Entre Empresas e informe o tipo.`
    );
  }

  const tipoIntercompany = normalizeTipoIntercompany(payload.tipo_intercompany);
  if (!tipoIntercompany) {
    throw createHttpError(400, 'Tipo e obrigatorio quando outra empresa paga a fatura.');
  }

  const isPagar = String(titulo.tipo || '').toUpperCase() === 'PAGAR';
  return {
    intercompany_group_id: payload.intercompany_group_id || `IC-FATURA-${titulo.id}`,
    empresa_origem_id: isPagar ? Number(empresaBaixaId) : Number(empresaTituloId),
    empresa_destino_id: isPagar ? Number(empresaTituloId) : Number(empresaBaixaId),
    tipo_intercompany: tipoIntercompany,
    motivo_intercompany: payload.motivo_intercompany || null,
    elimina_consolidado: payload.elimina_consolidado !== false,
    transferencia_interna: payload.transferencia_interna !== false
  };
}

async function baixarFaturaCartao(req, faturaId, payload = {}, { transaction: externalTransaction = null } = {}) {
  const transaction = externalTransaction || await sequelize.transaction();
  const ownTransaction = !externalTransaction;

  try {
    const fatura = await carregarFaturaCartao(req, faturaId, { transaction });
    if (!['ABERTA', 'FECHADA', 'PARCIAL'].includes(String(fatura.status || '').toUpperCase())) {
      throw createHttpError(400, 'Somente faturas abertas, fechadas ou parciais podem ser baixadas.');
    }

    const contaId = Number(payload.conta_bancaria_id || 0);
    if (!Number.isInteger(contaId) || contaId <= 0) {
      throw createHttpError(400, 'Conta bancaria e obrigatoria para baixar a fatura.');
    }
    const conta = await ContaBancaria.findByPk(contaId, { transaction });
    if (!conta || conta.ativo === false) {
      throw createHttpError(400, 'Conta bancaria invalida para baixar a fatura.');
    }
    if (!conta.empresa_id) {
      throw createHttpError(400, 'Conta bancaria da baixa da fatura nao possui empresa vinculada.');
    }

    const dataMovimento = payload.data_movimento || payload.data_pagamento || fatura.data_vencimento;
    if (!dataMovimento) throw createHttpError(400, 'Data de pagamento da fatura e obrigatoria.');
    const caixaSessao = await obterSessaoAbertaParaConta(conta, dataMovimento, { transaction });
    const contaCartaoId = Number(fatura.cartao?.conta_bancaria_id || 0);
    if (!Number.isInteger(contaCartaoId) || contaCartaoId <= 0) {
      throw createHttpError(
        400,
        'Cartao da fatura precisa ter uma conta bancaria vinculada para controlar o saldo do cartao.'
      );
    }
    const contaCartao = await ContaBancaria.findByPk(contaCartaoId, { transaction });
    if (!contaCartao || contaCartao.ativo === false) {
      throw createHttpError(400, 'Conta bancaria vinculada ao cartao esta invalida ou inativa.');
    }
    if (!contaCartao.empresa_id) {
      throw createHttpError(400, 'Conta bancaria vinculada ao cartao nao possui empresa vinculada.');
    }
    if (Number(contaCartao.id) === Number(conta.id)) {
      throw createHttpError(400, 'A conta que paga a fatura precisa ser diferente da conta de controle do cartao.');
    }
    const caixaSessaoCartao = await obterSessaoAbertaParaConta(contaCartao, dataMovimento, { transaction });

    const movimentos = [];
    const solicitacaoIdsSincronizar = new Set();
    for (const titulo of fatura.titulos || []) {
      const status = String(titulo.status || '').toUpperCase();
      if (!['ABERTO', 'PARCIAL'].includes(status)) continue;

      const valorBaixa = roundCurrency(titulo.valor_saldo || titulo.valor_original);
      if (valorBaixa <= 0) continue;
      if (!titulo.empresa_id) {
        throw createHttpError(400, `Titulo ${titulo.codigo || titulo.id} da fatura nao possui empresa vinculada.`);
      }
      const intercompanyFields = buildIntercompanyBaixaFatura({
        payload,
        titulo,
        empresaBaixaId: contaCartao.empresa_id
      });

      const movimento = await MovimentoFinanceiro.create({
        titulo_financeiro_id: titulo.id,
        fatura_cartao_id: fatura.id,
        cartao_id: fatura.cartao_id,
        conta_bancaria_id: contaCartao.id,
        empresa_id: contaCartao.empresa_id,
        ...intercompanyFields,
        caixa_sessao_id: caixaSessaoCartao?.id || null,
        forma_recebimento: 'CARTAO_CREDITO',
        tipo_movimento: 'BAIXA',
        status: 'ATIVO',
        valor: valorBaixa,
        juros: 0,
        multa: 0,
        desconto: 0,
        valor_quitacao: valorBaixa,
        data_movimento: dataMovimento,
        observacoes: payload.observacoes || `Baixa pela fatura do cartao ${fatura.competencia}`,
        criado_por: req.user?.id || null
      }, { transaction });

      await titulo.update({
        valor_baixado: roundCurrency(Number(titulo.valor_baixado || 0) + valorBaixa),
        valor_saldo: 0,
        status: 'QUITADO',
        data_quitacao: dataMovimento,
        atualizado_por: req.user?.id || null
      }, { transaction });

      await sincronizarContratoComercialPorTituloFinanceiro({
        tituloId: titulo.id,
        usuarioId: req.user?.id || null,
        transaction,
        motivo: 'BAIXA_FATURA_CARTAO'
      });

      if (titulo.solicitacao_id) {
        solicitacaoIdsSincronizar.add(Number(titulo.solicitacao_id));
      }

      movimentos.push(movimento);
    }

    for (const solicitacaoId of solicitacaoIdsSincronizar) {
      await sincronizarStatusSolicitacaoPorBaixaTitulos({
        solicitacaoId,
        usuarioId: req.user?.id || null,
        setor: 'FINANCEIRO',
        transaction,
        observacao: 'Status atualizado automaticamente apos baixa de titulo no cartao de credito.'
      });
    }

    const valorFatura = roundCurrency(await recalcularFaturaCartao(fatura.id, { transaction }));
    if (valorFatura <= 0) {
      throw createHttpError(400, 'Fatura de cartao sem valor para pagamento.');
    }

    const movimentoExistente = await MovimentoFinanceiro.findOne({
      where: {
        fatura_cartao_id: fatura.id,
        status: 'ATIVO',
        tipo_movimento: 'PAGAMENTO_FATURA'
      },
      transaction
    });
    if (movimentoExistente) {
      throw createHttpError(409, 'Pagamento desta fatura ja foi registrado.');
    }

    const documentoReferencia = `FATURA-CARTAO-${fatura.id}`;
    const observacoesPagamento = payload.observacoes || `Pagamento da fatura do cartao ${fatura.competencia}`;
    const movimentoContaReal = await MovimentoFinanceiro.create({
      titulo_financeiro_id: null,
      fatura_cartao_id: fatura.id,
      cartao_id: fatura.cartao_id,
      conta_bancaria_id: conta.id,
      empresa_id: conta.empresa_id,
      caixa_sessao_id: caixaSessao?.id || null,
      forma_recebimento: 'PAGAMENTO_FATURA_CARTAO',
      tipo_movimento: 'PAGAMENTO_FATURA',
      status: 'ATIVO',
      valor: -valorFatura,
      juros: 0,
      multa: 0,
      desconto: 0,
      valor_quitacao: -valorFatura,
      data_movimento: dataMovimento,
      documento_referencia: documentoReferencia,
      observacoes: observacoesPagamento,
      criado_por: req.user?.id || null
    }, { transaction });

    const movimentoContaCartao = await MovimentoFinanceiro.create({
      titulo_financeiro_id: null,
      fatura_cartao_id: fatura.id,
      cartao_id: fatura.cartao_id,
      conta_bancaria_id: contaCartao.id,
      empresa_id: contaCartao.empresa_id,
      caixa_sessao_id: caixaSessaoCartao?.id || null,
      forma_recebimento: 'CREDITO_FATURA_CARTAO',
      tipo_movimento: 'AJUSTE_CARTAO',
      status: 'ATIVO',
      valor: valorFatura,
      juros: 0,
      multa: 0,
      desconto: 0,
      valor_quitacao: valorFatura,
      data_movimento: dataMovimento,
      documento_referencia: documentoReferencia,
      observacoes: `Credito para zerar fatura do cartao ${fatura.competencia}`,
      criado_por: req.user?.id || null
    }, { transaction });

    await fatura.update({
      status: 'PAGA',
      conta_bancaria_id: conta.id,
      data_pagamento: dataMovimento,
      pago_por: req.user?.id || null,
      atualizado_por: req.user?.id || null,
      observacoes: payload.observacoes || fatura.observacoes
    }, { transaction });

    if (ownTransaction) {
      await transaction.commit();
    }

    await registrarEventoSeguranca({
      req,
      usuarioId: req.user?.id || null,
      tipoEvento: 'FINANCIAL_CARD_STATEMENT_SETTLED',
      recursoTipo: 'FATURA_CARTAO',
      recursoId: fatura.id,
      status: 'SUCCESS',
      descricao: 'Pagamento de fatura de cartao registrado com saida na conta real e credito na conta do cartao',
      metadata: {
        fatura_id: fatura.id,
        total_movimentos_baixa_titulos: movimentos.length,
        movimento_conta_real_id: movimentoContaReal.id,
        movimento_conta_cartao_id: movimentoContaCartao.id,
        conta_bancaria_id: conta.id,
        conta_cartao_id: contaCartao.id,
        valor_fatura: valorFatura
      }
    });

    return carregarFaturaCartao(req, fatura.id, { transaction: ownTransaction ? null : transaction });
  } catch (error) {
    if (ownTransaction) await transaction.rollback();
    throw error;
  }
}

module.exports = {
  baixarFaturaCartao,
  calcularDatasFatura,
  carregarFaturaCartao,
  listarFaturasCartao,
  obterOuCriarFaturaCartao,
  recalcularFaturaCartao,
  vincularTituloAFatura
};
