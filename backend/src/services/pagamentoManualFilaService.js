const crypto = require('crypto');
const { Op } = require('sequelize');
const {
  ContaBancaria,
  EmpresaGrupo,
  FormaPagamentoFinanceira,
  Obra,
  PagamentoManualFilaItem,
  Parceiro,
  PaymentBeneficiary,
  PaymentIntent,
  Solicitacao,
  TituloFinanceiro,
  User,
  sequelize
} = require('../models');
const { baixarTitulo } = require('./tituloFinanceiroService');
const { assertTituloDisponivelParaBaixa } = require('./tituloBloqueioRetornoObraService');
const { registrarEventoSeguranca } = require('./securityLogService');

const ACTIVE_STATUSES = ['PENDENTE', 'NAO_PAGO', 'DIVERGENTE'];
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
      model: TituloFinanceiro,
      as: 'titulo',
      required: true,
      attributes: [
        'id', 'codigo', 'descricao', 'numero_documento', 'status', 'tipo',
        'valor_original', 'valor_saldo', 'valor_baixado', 'data_vencimento',
        'forma_pagamento_id', 'empresa_id', 'linha_digitavel', 'codigo_barras',
        'banco_cobranca', 'observacoes', 'solicitacao_id'
      ],
      include: [
        { model: Parceiro, as: 'parceiro', attributes: ['id', 'nome', 'cpf_cnpj', 'telefone', 'email'] },
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
        { model: Solicitacao, as: 'solicitacao', attributes: ['id', 'codigo', 'descricao'] }
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
  const where = status && status !== 'TODOS' ? { status } : {};
  const rows = await PagamentoManualFilaItem.findAll({
    where,
    include: filaInclude(),
    order: [['selecionado_em', 'ASC'], ['id', 'ASC']],
    limit: 500
  });
  const data = rows.filter((item) => matchesSearch(item, filters.q));
  const counts = await PagamentoManualFilaItem.findAll({
    attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'total']],
    group: ['status'],
    raw: true
  });
  const resumo = counts.reduce((acc, item) => {
    acc[String(item.status || '').toUpperCase()] = Number(item.total || 0);
    return acc;
  }, {});
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

async function enfileirarTitulos(req, payload = {}) {
  const tituloIds = payload.titulo_ids || [];
  const requestKey = payload.idempotency_key || crypto.randomUUID();
  const itemKeys = tituloIds.map((tituloId) => `${requestKey}:${tituloId}`.slice(0, 120));

  const items = await sequelize.transaction(async (transaction) => {
    const repetidos = await PagamentoManualFilaItem.findAll({
      where: { idempotency_key: { [Op.in]: itemKeys } },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (repetidos.length === tituloIds.length) return repetidos;
    if (repetidos.length > 0) {
      throw createHttpError(409, 'A tentativa anterior foi recebida parcialmente. Atualize a consulta antes de reenviar.');
    }

    const titulos = await TituloFinanceiro.findAll({
      where: { id: { [Op.in]: tituloIds } },
      include: [{
        model: FormaPagamentoFinanceira,
        as: 'formaPagamento',
        attributes: ['id', 'nome', 'codigo', 'tipo', 'exige_cartao', 'gera_fatura']
      }],
      transaction,
      lock: transaction.LOCK.UPDATE,
      order: [['id', 'ASC']]
    });
    if (titulos.length !== tituloIds.length) throw createHttpError(404, 'Um ou mais titulos nao foram encontrados.');

    const existentes = await PagamentoManualFilaItem.findAll({
      where: { titulo_financeiro_id: { [Op.in]: tituloIds }, status: { [Op.in]: ACTIVE_STATUSES } },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (existentes.length > 0) {
      throw createHttpError(409, 'Um ou mais titulos ja estao na fila de pagamentos. Atualize a consulta e tente novamente.');
    }

    const intentsAtivos = await PaymentIntent.findAll({
      where: {
        titulo_financeiro_id: { [Op.in]: tituloIds },
        status: { [Op.notIn]: PAYMENT_INTENT_INACTIVE_STATUSES }
      },
      attributes: ['titulo_financeiro_id'],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (intentsAtivos.length > 0) {
      throw createHttpError(409, 'Um ou mais titulos ja possuem pagamento bancario em andamento.');
    }

    for (const titulo of titulos) {
      if (String(titulo.tipo || '').toUpperCase() !== 'PAGAR') {
        throw createHttpError(400, `O titulo ${titulo.codigo || titulo.id} nao pertence ao Contas a Pagar.`);
      }
      if (!['ABERTO', 'PARCIAL'].includes(String(titulo.status || '').toUpperCase()) || roundCurrency(titulo.valor_saldo) <= 0) {
        throw createHttpError(400, `O titulo ${titulo.codigo || titulo.id} nao possui saldo disponivel para pagamento.`);
      }
      if (titulo.formaPagamento?.exige_cartao || titulo.formaPagamento?.gera_fatura) {
        throw createHttpError(400, `O titulo ${titulo.codigo || titulo.id} usa cartao e deve ser baixado pelo fluxo da fatura do cartao.`);
      }
      assertTituloDisponivelParaBaixa(titulo);
    }

    return Promise.all(titulos.map((titulo) => PagamentoManualFilaItem.create({
      titulo_financeiro_id: titulo.id,
      status: 'PENDENTE',
      valor_previsto: roundCurrency(titulo.valor_saldo),
      data_vencimento_prevista: titulo.data_vencimento || null,
      selecionado_por: req.user?.id || null,
      selecionado_em: new Date(),
      idempotency_key: `${requestKey}:${titulo.id}`.slice(0, 120)
    }, { transaction })));
  });

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'MANUAL_PAYMENT_QUEUE_CREATED',
    recursoTipo: 'PAGAMENTO_MANUAL_FILA',
    recursoId: requestKey,
    status: 'SUCCESS',
    descricao: 'Titulos encaminhados para a fila de pagamentos',
    metadata: { titulo_ids: tituloIds, quantidade: items.length }
  });

  return { quantidade: items.length, ids: items.map((item) => item.id) };
}

async function carregarEmpresaTitulo(titulo, transaction) {
  if (titulo.empresa_id) return Number(titulo.empresa_id);
  const obra = titulo.obra_id
    ? await Obra.findByPk(titulo.obra_id, { attributes: ['empresa_grupo_id'], transaction })
    : null;
  return obra?.empresa_grupo_id ? Number(obra.empresa_grupo_id) : null;
}

async function processarItemFila(req, itemPayload, requestKey, transaction) {
  const filaItem = await PagamentoManualFilaItem.findByPk(itemPayload.fila_id, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (!filaItem) throw createHttpError(404, `Item da fila ${itemPayload.fila_id} nao encontrado.`);

  const itemKey = `${requestKey}:${filaItem.id}`.slice(0, 120);
  if (filaItem.idempotency_key === itemKey && ['BAIXADO', 'DIVERGENTE'].includes(String(filaItem.status).toUpperCase())) {
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

  const conta = await ContaBancaria.findByPk(itemPayload.conta_bancaria_id, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (!conta || conta.ativo === false || !conta.empresa_id) {
    throw createHttpError(400, `A conta pagadora do titulo ${titulo.codigo || titulo.id} e invalida ou nao possui empresa.`);
  }

  const empresaTituloId = await carregarEmpresaTitulo(titulo, transaction);
  if (empresaTituloId && Number(conta.empresa_id) !== empresaTituloId) {
    throw createHttpError(400, `A conta pagadora do titulo ${titulo.codigo || titulo.id} deve pertencer a empresa do titulo.`);
  }

  const valorPago = roundCurrency(itemPayload.valor_pago);
  const saldoAtual = roundCurrency(titulo.valor_saldo);
  const valorPrevisto = roundCurrency(filaItem.valor_previsto);
  const commonUpdate = {
    valor_informado: valorPago,
    data_baixa: itemPayload.data_baixa,
    conta_bancaria_id: conta.id,
    processado_por: req.user?.id || null,
    processado_em: new Date(),
    idempotency_key: itemKey
  };

  if (valorPago > saldoAtual) {
    const motivo = itemPayload.motivo || `Valor informado (${valorPago.toFixed(2)}) maior que o saldo atual (${saldoAtual.toFixed(2)}).`;
    await filaItem.update({ ...commonUpdate, status: 'DIVERGENTE', motivo }, { transaction });
    return { filaItem, titulo, baixaRegistrada: false, divergente: true };
  }

  const baixa = await baixarTitulo(req, titulo.id, {
    empresa_id: conta.empresa_id,
    conta_bancaria_id: conta.id,
    forma_pagamento_id: titulo.forma_pagamento_id || undefined,
    forma_recebimento: titulo.forma_pagamento_id ? undefined : 'TRANSFERENCIA',
    valor: valorPago,
    juros: 0,
    multa: 0,
    desconto: 0,
    data_movimento: itemPayload.data_baixa,
    observacoes: itemPayload.motivo || `Baixa registrada pela fila de pagamentos #${filaItem.id}.`
  }, {
    transaction,
    autorizadoPorFilaPagamento: true,
    skipSecurityEvent: true
  });

  const divergente = valorPago !== valorPrevisto || valorPago < saldoAtual;
  const motivo = divergente
    ? (itemPayload.motivo || `Pagamento divergente: previsto na fila ${valorPrevisto.toFixed(2)}, saldo antes da baixa ${saldoAtual.toFixed(2)} e pago ${valorPago.toFixed(2)}.`)
    : (itemPayload.motivo || null);
  await filaItem.update({
    ...commonUpdate,
    status: divergente ? 'DIVERGENTE' : 'BAIXADO',
    motivo,
    movimento_financeiro_id: baixa.movimento_financeiro_id || baixa.movimento?.id || null
  }, { transaction });

  return { filaItem, titulo, baixa, baixaRegistrada: true, divergente };
}

async function registrarBaixasFila(req, payload = {}) {
  const requestKey = payload.idempotency_key || crypto.randomUUID();
  const resultados = await sequelize.transaction(async (transaction) => {
    const ordered = [...payload.itens].sort((a, b) => Number(a.fila_id) - Number(b.fila_id));
    const processed = [];
    for (const item of ordered) {
      processed.push(await processarItemFila(req, item, requestKey, transaction));
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
      divergentes: resultados.filter((item) => item.divergente).length
    }
  });

  return {
    quantidade: resultados.length,
    baixados: resultados.filter((item) => item.baixaRegistrada).length,
    divergentes: resultados.filter((item) => item.divergente).length
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
    const processed = [];

    for (const filaId of orderedIds) {
      const current = await PagamentoManualFilaItem.findByPk(filaId, {
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!current) throw createHttpError(404, `Item da fila ${filaId} nao encontrado.`);

      const itemKey = `${requestKey}:${current.id}`.slice(0, 120);
      if (String(current.status || '').toUpperCase() === 'RESOLVIDO' && current.idempotency_key === itemKey) {
        processed.push({ item: current, baixaRegistrada: Boolean(current.movimento_financeiro_id), idempotente: true });
        continue;
      }
      if (String(current.status || '').toUpperCase() !== 'DIVERGENTE') {
        throw createHttpError(409, `O item ${current.id} nao possui divergencia pendente de aprovacao.`);
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
        if (empresaTituloId && Number(conta.empresa_id) !== empresaTituloId) {
          throw createHttpError(400, `A conta pagadora do titulo ${titulo.codigo || titulo.id} deve pertencer a empresa do titulo.`);
        }

        const valorPago = roundCurrency(current.valor_informado);
        if (valorPago <= 0 || !current.data_baixa) {
          throw createHttpError(409, `A divergencia do titulo ${titulo.codigo || titulo.id} nao possui dados completos para a baixa.`);
        }

        const baixa = await baixarTitulo(req, titulo.id, {
          empresa_id: conta.empresa_id,
          conta_bancaria_id: conta.id,
          forma_pagamento_id: titulo.forma_pagamento_id || undefined,
          forma_recebimento: titulo.forma_pagamento_id ? undefined : 'TRANSFERENCIA',
          valor: valorPago,
          juros: 0,
          multa: 0,
          desconto: 0,
          data_movimento: current.data_baixa,
          observacoes: `Baixa divergente autorizada na fila #${current.id}. ${payload.justificativa}`
        }, {
          transaction,
          autorizadoPorFilaPagamento: true,
          autorizarValorAcimaSaldo: true,
          skipSecurityEvent: true
        });
        movimentoId = baixa.movimento_financeiro_id || baixa.movimento?.id || null;
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
    await current.update({
      status: 'RESOLVIDO',
      motivo: payload.motivo || current.motivo,
      resolvido_por: req.user?.id || null,
      resolvido_em: new Date()
    }, { transaction });
    const reaberto = await PagamentoManualFilaItem.create({
      titulo_financeiro_id: titulo.id,
      status: 'PENDENTE',
      valor_previsto: roundCurrency(titulo.valor_saldo),
      motivo: payload.motivo || null,
      data_vencimento_prevista: titulo.data_vencimento || null,
      selecionado_por: req.user?.id || null,
      selecionado_em: new Date()
    }, { transaction });
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
      motivo: payload.motivo || null
    }
  });
  return { item, reaberto: result.reaberto };
}

module.exports = {
  aprovarDivergenciasFila,
  enfileirarTitulos,
  informarNaoPagamento,
  listarContasPagadorasFila,
  listarFilaPagamentos,
  registrarBaixasFila,
  resolverItemFila
};
