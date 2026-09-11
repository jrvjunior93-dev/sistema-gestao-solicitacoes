const crypto = require('crypto');
const { Op } = require('sequelize');
const {
  CartaoFinanceiro,
  ChequeTerceiro,
  ChequeTerceiroMovimento,
  ConciliacaoBancaria,
  ContaBancaria,
  Contrato,
  ContratoCredor,
  EmpresaGrupo,
  Apropriacao,
  sequelize,
  CategoriaFinanceira,
  FaturaCartaoFinanceiro,
  FormaPagamentoFinanceira,
  Historico,
  IntegracaoSiengeFila,
  MovimentoFinanceiro,
  Obra,
  Parceiro,
  PaymentBatch,
  PaymentBatchItem,
  PaymentBeneficiary,
  PaymentIntent,
  PagamentoManualFilaItem,
  PedidoCompraTitulo,
  PedidoCompraFrete,
  SecurityEventLog,
  Solicitacao,
  SolicitacaoCompra,
  SolicitacaoCompraAlocacao,
  SolicitacaoRecargaCartao,
  TipoSolicitacao,
  TituloFinanceiroImposto,
  TituloFinanceiroRateio,
  TituloFinanceiro,
  User
} = require('../models');
const {
  canAccessFinanceiro,
  canViewSolicitacaoFinanceiro,
  canDeleteTitulosFinanceiros,
  getFinanceiroObraScopeIds
} = require('./authorizationService');
const {
  obterOuCriarFaturaCartao,
  vincularTituloAFatura
} = require('./faturaCartaoFinanceiroService');
const { contaExigeSessao, obterSessaoAbertaParaConta } = require('./financeiroCaixaSessionHelper');
const { registrarEventoSeguranca } = require('./securityLogService');
const { normalizeTipoIntercompany } = require('../constants/intercompany');
const {
  buildIntercompanyCartaoPayload
} = require('./tituloIntercompanyCartaoHelper');
const { sincronizarStatusSolicitacaoPorBaixaTitulos } = require('./solicitacaoFinanceiroStatusService');
const { reabrirConciliacoesPorMovimentos } = require('./conciliacaoEstornoService');
const { assertTituloDisponivelParaBaixa } = require('./tituloBloqueioRetornoObraService');
const { resolveTituloStatusFilter } = require('../utils/tituloFinanceiroStatusFilter');

const FORMAS_COBRANCA = ['BOLETO', 'PIX', 'OUTROS'];
const STATUS_COBRANCA = ['NAO_APLICAVEL', 'PENDENTE_EMISSAO', 'EMITIDO', 'PAGO_BANCO', 'CONCILIADO', 'CANCELADO'];
const PAYMENT_INTENT_INACTIVE_STATUSES = ['CANCELADO', 'REJEITADO', 'REJEITADO_BANCO', 'FALHA_INTEGRACAO'];
const STATUS_TITULO_EDITAVEL = ['PREVISAO', 'ABERTO'];
const STATUS_TITULO_INICIAL = ['PREVISAO', 'ABERTO'];

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function formatCurrency(value) {
  const number = Number(value || 0);
  return number.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function parseCurrencyFilter(value, fieldLabel) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const raw = String(value).trim().replace(/[R$\s]/gi, '');
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw createHttpError(400, `${fieldLabel} inválido.`);
  }
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

function getHoje() {
  return new Date().toISOString().slice(0, 10);
}

function roundCurrency(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function toCurrencyNumber(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value).trim().replace(/[R$\s]/gi, '');
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizarStatusTituloInicial(status) {
  const normalized = String(status || '').trim().toUpperCase();
  return STATUS_TITULO_INICIAL.includes(normalized) ? normalized : 'ABERTO';
}

function buildTituloCodigoSearchTerms(value) {
  const term = String(value || '').trim();
  if (!term) return [];

  const terms = new Set([term]);
  const digits = term.replace(/\D/g, '');

  if (digits) {
    const unpadded = String(Number(digits));
    const normalizedDigits = unpadded === '0' ? digits.replace(/^0+/, '') || '0' : unpadded;
    const padded = normalizedDigits.padStart(6, '0');

    terms.add(normalizedDigits);
    terms.add(padded);
    terms.add(`TIT-${padded}`);
    terms.add(`TIT-${normalizedDigits}`);
  }

  return Array.from(terms).filter(Boolean);
}

function buildTituloCodigoSearchConditions(value) {
  return buildTituloCodigoSearchTerms(value).map((term) => ({
    codigo: { [Op.like]: `%${term}%` }
  }));
}

function addMonths(dateString, amount) {
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;
  const day = date.getDate();
  date.setMonth(date.getMonth() + Number(amount || 0), 1);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

function distribuirParcelas(valorTotal, quantidade) {
  const totalCentavos = Math.round(Number(valorTotal || 0) * 100);
  const base = Math.floor(totalCentavos / quantidade);
  let resto = totalCentavos - (base * quantidade);
  return Array.from({ length: quantidade }, () => {
    const centavos = base + (resto > 0 ? 1 : 0);
    if (resto > 0) resto -= 1;
    return roundCurrency(centavos / 100);
  });
}

function somarValores(values = []) {
  return roundCurrency(values.reduce((acc, value) => acc + Number(value || 0), 0));
}

function getValoresParcelas({ valorTotal, quantidade, parcelas = [], contexto = 'pagamento' }) {
  const quantidadeNormalizada = Math.max(Number(quantidade || 1), 1);
  const parcelasArray = Array.isArray(parcelas) ? parcelas : [];
  const temValoresInformados = parcelasArray.some((parcela) => parcela?.valor != null);

  if (temValoresInformados) {
    if (parcelasArray.length < quantidadeNormalizada) {
      throw createHttpError(400, `Informe o valor de todas as parcelas do ${contexto}.`);
    }

    const valores = Array.from({ length: quantidadeNormalizada }, (_, index) => {
      const valor = Number(parcelasArray[index]?.valor);
      if (!Number.isFinite(valor) || valor <= 0) {
        throw createHttpError(400, `Informe um valor valido para a parcela ${index + 1} do ${contexto}.`);
      }
      return roundCurrency(valor);
    });

    return valores;
  }

  const total = Number(valorTotal);
  if (!Number.isFinite(total) || total <= 0) {
    throw createHttpError(400, `Informe o valor do ${contexto}.`);
  }

  return distribuirParcelas(total, quantidadeNormalizada);
}

function assertValoresIguais({ atual, esperado, mensagem }) {
  if (Math.abs(roundCurrency(atual) - roundCurrency(esperado)) > 0.009) {
    throw createHttpError(400, mensagem);
  }
}

function normalizarImpostosTitulo(payload = {}, valorTitulo = 0) {
  const impostos = Array.isArray(payload.impostos) ? payload.impostos : [];
  const descontoFinanceiro = roundCurrency(toCurrencyNumber(
    payload.desconto_financeiro ?? payload.desconto_titulo ?? payload.desconto_concedido ?? 0
  ));
  const normalizados = impostos
    .map((item) => {
      const valor = roundCurrency(toCurrencyNumber(item?.valor));
      if (!Number.isFinite(valor) || valor <= 0) return null;
      const tipo = String(item.tipo_imposto || item.tipo || 'IMPOSTO').trim().slice(0, 60);
      const descricao = item.descricao ? String(item.descricao).trim().slice(0, 180) : null;
      const isDescontoDuplicado = descontoFinanceiro > 0
        && (
          String(tipo || '').trim().toUpperCase() === 'DESCONTO'
          || String(descricao || '').trim().toUpperCase() === 'DESCONTO'
        );
      if (isDescontoDuplicado) return null;
      return {
        tipo_imposto: tipo,
        descricao,
        natureza: String(item.natureza || 'RETENCAO').trim().toUpperCase() === 'ACRESCIMO' ? 'ACRESCIMO' : 'RETENCAO',
        base_calculo: item.base_calculo != null ? roundCurrency(toCurrencyNumber(item.base_calculo)) : roundCurrency(valorTitulo),
        aliquota: item.aliquota != null ? toCurrencyNumber(item.aliquota) : null,
        valor,
        observacoes: item.observacoes || null
      };
    })
    .filter(Boolean);

  if (descontoFinanceiro > 0) {
    normalizados.push({
      tipo_imposto: 'DESCONTO',
      descricao: 'Desconto concedido',
      natureza: 'RETENCAO',
      base_calculo: roundCurrency(valorTitulo),
      aliquota: null,
      valor: descontoFinanceiro,
      observacoes: payload.desconto_observacoes || null
    });
  }

  const totalRetencoes = somarValores(normalizados
    .filter((item) => item.natureza === 'RETENCAO')
    .map((item) => item.valor));
  const totalAcrescimos = somarValores(normalizados
    .filter((item) => item.natureza === 'ACRESCIMO')
    .map((item) => item.valor));
  const valorBruto = roundCurrency(payload.valor_bruto != null ? toCurrencyNumber(payload.valor_bruto) : valorTitulo);
  const valorLiquido = roundCurrency(Math.max(valorBruto - totalRetencoes + totalAcrescimos, 0));

  return {
    impostos: normalizados,
    valorBruto,
    valorImpostos: roundCurrency(totalRetencoes - totalAcrescimos),
    valorLiquido
  };
}

function escalarImpostosParaTitulo(impostos = [], valorParcela = 0, valorBase = 0) {
  if (!Array.isArray(impostos) || impostos.length === 0) return [];
  const base = Number(valorBase || 0);
  const fator = base > 0 ? Number(valorParcela || 0) / base : 1;
  return impostos.map((item) => ({
    ...item,
    base_calculo: item.base_calculo != null ? roundCurrency(Number(item.base_calculo) * fator) : null,
    valor: roundCurrency(Number(item.valor || 0) * fator)
  })).filter((item) => item.valor > 0);
}

function calcularValoresParcelaComImpostos(impostosResumo = {}, valorParcela = 0, valorBase = 0) {
  const base = Number(valorBase || 0);
  const fator = base > 0 ? Number(valorParcela || 0) / base : 1;
  const valorBruto = roundCurrency(Number(impostosResumo.valorBruto || valorParcela || 0) * fator);
  const valorImpostos = roundCurrency(Number(impostosResumo.valorImpostos || 0) * fator);
  const valorLiquido = roundCurrency(Math.max(valorBruto - valorImpostos, 0));

  return {
    valorBruto,
    valorImpostos,
    valorLiquido
  };
}

async function normalizarRateiosTitulo(req, payload = {}, defaultObra, defaultApropriacao, valorTitulo = 0) {
  const rateiosPayload = Array.isArray(payload.rateios) ? payload.rateios.filter(Boolean) : [];
  if (rateiosPayload.length === 0) {
    return [];
  }

  const valorBase = roundCurrency(valorTitulo);
  const tipoRateio = String(payload.tipo_rateio || rateiosPayload[0]?.tipo_rateio || '').trim().toUpperCase() === 'VALOR'
    ? 'VALOR'
    : 'PERCENTUAL';

  const normalizados = [];
  for (const [index, item] of rateiosPayload.entries()) {
    const obraId = Number(item.obra_id || item.centro_custo_id || defaultObra?.id);
    if (!Number.isInteger(obraId) || obraId <= 0) {
      throw createHttpError(400, `Informe a obra/centro de custo do rateio ${index + 1}.`);
    }

    const obra = obraId === Number(defaultObra?.id)
      ? defaultObra
      : await validarObraTitulo(req, obraId);
    const apropriacaoId = item.apropriacao_id ? Number(item.apropriacao_id) : null;
    const apropriacao = apropriacaoId
      ? await validarApropriacaoTitulo(apropriacaoId, obra.id)
      : obraId === Number(defaultObra?.id)
        ? defaultApropriacao
        : null;

    const percentualInformado = item.percentual != null ? Number(item.percentual) : null;
    const valorInformado = item.valor_rateio != null ? Number(item.valor_rateio) : item.valor != null ? Number(item.valor) : null;
    const valorRateio = tipoRateio === 'VALOR'
      ? roundCurrency(valorInformado)
      : roundCurrency(valorBase * (percentualInformado || 0) / 100);
    const percentual = tipoRateio === 'VALOR'
      ? (valorBase > 0 ? roundCurrency((valorRateio / valorBase) * 100) : 0)
      : roundCurrency(percentualInformado);

    // No rateio por VALOR o proprio valor (>= 1 centavo) e a garantia; o percentual aqui e
    // so informativo e, arredondado a 2 casas, zera para fracoes minimas — exigir > 0
    // prendia contrato valido em AGUARDANDO_APROVACAO para sempre (auditoria v4).
    const percentualInvalido = tipoRateio === 'VALOR'
      ? (!Number.isFinite(percentual) || percentual < 0)
      : (!Number.isFinite(percentual) || percentual <= 0);
    if (!Number.isFinite(valorRateio) || valorRateio <= 0 || percentualInvalido) {
      throw createHttpError(400, `Informe percentual ou valor valido para o rateio ${index + 1}.`);
    }

    normalizados.push({
      obra_id: obra.id,
      apropriacao_id: apropriacao?.id || null,
      tipo_rateio: tipoRateio,
      percentual,
      valor_rateio: valorRateio,
      observacoes: item.observacoes || null
    });
  }

  if (tipoRateio === 'VALOR') {
    assertValoresIguais({
      atual: somarValores(normalizados.map((item) => item.valor_rateio)),
      esperado: valorBase,
      mensagem: 'A soma do rateio por valor precisa bater com o valor total do titulo.'
    });
  } else {
    assertValoresIguais({
      atual: somarValores(normalizados.map((item) => item.percentual)),
      esperado: 100,
      mensagem: 'A soma do rateio percentual precisa ser igual a 100%.'
    });
  }

  return normalizados;
}

function escalarRateiosParaTitulo(rateios = [], valorParcela = 0, valorBase = 0) {
  if (!Array.isArray(rateios) || rateios.length === 0) return [];
  const base = Number(valorBase || 0);
  const fator = base > 0 ? Number(valorParcela || 0) / base : 1;
  return rateios.map((item) => ({
    ...item,
    valor_rateio: roundCurrency(Number(item.valor_rateio || 0) * fator)
  }));
}

async function gravarComplementosTitulo({
  titulo,
  rateios = [],
  impostos = [],
  valorBase,
  valorParcela,
  valorRateioParcela = valorParcela,
  usuarioId,
  transaction
}) {
  const rateiosTitulo = escalarRateiosParaTitulo(rateios, valorRateioParcela, valorBase);
  if (rateiosTitulo.length > 0) {
    await TituloFinanceiroRateio.bulkCreate(
      rateiosTitulo.map((item) => ({
        ...item,
        titulo_financeiro_id: titulo.id,
        criado_por: usuarioId || null,
        atualizado_por: usuarioId || null
      })),
      { transaction }
    );
  }

  const impostosTitulo = escalarImpostosParaTitulo(impostos, valorParcela, valorBase);
  if (impostosTitulo.length > 0) {
    await TituloFinanceiroImposto.bulkCreate(
      impostosTitulo.map((item) => ({
        ...item,
        titulo_financeiro_id: titulo.id,
        criado_por: usuarioId || null,
        atualizado_por: usuarioId || null
      })),
      { transaction }
    );
  }
}

function normalizarTipoTitulo(value) {
  return String(value || 'PAGAR').trim().toUpperCase();
}

function normalizarFormaRecebimento(value) {
  return value ? String(value || '').trim().toUpperCase() : null;
}

function exigirFormaRecebimentoBaixa(value) {
  const formaRecebimento = normalizarFormaRecebimento(value);
  if (!formaRecebimento) {
    throw createHttpError(
      400,
      'Forma de pagamento e obrigatoria para registrar a baixa do titulo.'
    );
  }
  return formaRecebimento;
}

function resolverTipoOperacionalFormaPagamento(formaPagamento) {
  const text = [formaPagamento?.tipo, formaPagamento?.codigo, formaPagamento?.nome]
    .filter(Boolean)
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  const tokens = text.split(/[^A-Z0-9_]+/).filter(Boolean);

  if (
    Boolean(formaPagamento?.exige_cartao)
    || Boolean(formaPagamento?.gera_fatura)
    || tokens.some((token) => ['CARTAO', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'CREDITO', 'DEBITO'].includes(token))
  ) return 'CARTAO';
  if (Boolean(formaPagamento?.exige_cheque) || tokens.includes('CHEQUE')) return 'CHEQUE';

  return ['DINHEIRO', 'PIX', 'TRANSFERENCIA', 'BOLETO', 'PERMUTA', 'BENS', 'OUTROS']
    .find((tipo) => tokens.includes(tipo)) || null;
}

async function resolverFormaPagamentoBaixa(payload = {}, options = {}) {
  const formaPagamentoId = Number(payload.forma_pagamento_id || 0);
  const formaRecebimentoInformada = normalizarFormaRecebimento(payload.forma_recebimento);
  if (!Number.isInteger(formaPagamentoId) || formaPagamentoId <= 0) {
    return {
      formaPagamento: null,
      formaPagamentoId: null,
      formaRecebimento: exigirFormaRecebimentoBaixa(formaRecebimentoInformada)
    };
  }

  const formaPagamento = await FormaPagamentoFinanceira.findByPk(formaPagamentoId, {
    transaction: options.transaction
  });
  if (!formaPagamento || formaPagamento.ativo === false) {
    throw createHttpError(400, 'A forma de pagamento selecionada nao existe ou esta inativa.');
  }

  const formaRecebimento = resolverTipoOperacionalFormaPagamento(formaPagamento);
  if (!formaRecebimento) {
    throw createHttpError(400, 'A forma de pagamento selecionada nao possui tipo compativel com a baixa financeira.');
  }
  if (formaRecebimentoInformada && formaRecebimentoInformada !== formaRecebimento) {
    throw createHttpError(400, 'A forma de pagamento nao corresponde ao tipo operacional informado.');
  }

  return { formaPagamento, formaPagamentoId, formaRecebimento };
}

async function resolverCartaoBaixa({ formaRecebimento, cartaoId, conta, empresaBaixaId, dataMovimento, usuarioId, transaction }) {
  if (String(formaRecebimento || '').toUpperCase() !== 'CARTAO') {
    if (cartaoId) {
      throw createHttpError(400, 'Cartao deve ser informado apenas quando a forma de recebimento for CARTAO.');
    }

    return {
      cartao: null,
      conta: conta || null,
      fatura: null,
      formaRecebimento
    };
  }

  if (!cartaoId) {
    throw createHttpError(400, 'Informe o cartao utilizado na baixa.');
  }

  const cartao = await CartaoFinanceiro.findByPk(cartaoId, {
    include: [{ model: ContaBancaria, as: 'contaBancaria' }],
    transaction
  });

  if (!cartao || cartao.ativo === false) {
    throw createHttpError(400, 'Cartao financeiro invalido ou inativo.');
  }

  const tipoCartao = String(cartao.tipo || 'CREDITO').trim().toUpperCase();

  if (tipoCartao === 'DEBITO') {
    const contaCartao = cartao.contaBancaria || (cartao.conta_bancaria_id
      ? await ContaBancaria.findByPk(cartao.conta_bancaria_id, { transaction })
      : null);

    if (!contaCartao || contaCartao.ativo === false) {
      throw createHttpError(400, 'Cartao de debito precisa ter uma conta bancaria ativa vinculada.');
    }

    if (conta && Number(conta.id) !== Number(contaCartao.id)) {
      throw createHttpError(400, 'A conta bancaria informada deve ser a mesma vinculada ao cartao de debito.');
    }

    if (Number(contaCartao.empresa_id || 0) !== Number(empresaBaixaId || 0)) {
      throw createHttpError(400, 'A conta bancaria vinculada ao cartao de debito deve pertencer a empresa pagadora.');
    }

    return {
      cartao,
      conta: contaCartao,
      fatura: null,
      formaRecebimento: 'CARTAO_DEBITO'
    };
  }

  const { fatura } = await obterOuCriarFaturaCartao({
    cartaoId: cartao.id,
    dataCompra: dataMovimento,
    usuarioId,
    transaction
  });
  const contaCartao = cartao.contaBancaria || (cartao.conta_bancaria_id
    ? await ContaBancaria.findByPk(cartao.conta_bancaria_id, { transaction })
    : null);

  if (!contaCartao || contaCartao.ativo === false) {
    throw createHttpError(400, 'Cartao de credito precisa ter uma conta bancaria ativa vinculada.');
  }

  if (conta && Number(conta.id) !== Number(contaCartao.id)) {
    throw createHttpError(400, 'A conta bancaria informada deve ser a mesma vinculada ao cartao de credito.');
  }

  if (Number(contaCartao.empresa_id || 0) !== Number(empresaBaixaId || 0)) {
    throw createHttpError(400, 'A conta bancaria vinculada ao cartao de credito deve pertencer a empresa pagadora.');
  }

  return {
    cartao,
    conta: contaCartao,
    fatura,
    formaRecebimento: 'CARTAO_CREDITO'
  };
}

function normalizarFormaCobranca(value) {
  if (!value) return null;
  const normalized = String(value || '').trim().toUpperCase();
  return FORMAS_COBRANCA.includes(normalized) ? normalized : null;
}

function normalizarStatusCobranca(value) {
  if (!value) return null;
  const normalized = String(value || '').trim().toUpperCase();
  return STATUS_COBRANCA.includes(normalized) ? normalized : null;
}

function getTipoFormaPagamento(formaPagamento) {
  return `${formaPagamento?.tipo || ''} ${formaPagamento?.codigo || ''} ${formaPagamento?.nome || ''}`.toUpperCase();
}

function isFormaCartao(formaPagamento) {
  return Boolean(formaPagamento?.exige_cartao) || getTipoFormaPagamento(formaPagamento).includes('CARTAO');
}

function isFormaCartaoComFatura(formaPagamento) {
  return Boolean(formaPagamento?.gera_fatura);
}

function isFormaBoleto(formaPagamento) {
  return getTipoFormaPagamento(formaPagamento).includes('BOLETO');
}

function isFormaPix(formaPagamento) {
  return getTipoFormaPagamento(formaPagamento).includes('PIX');
}

function isFormaOutros(formaPagamento) {
  const value = getTipoFormaPagamento(formaPagamento);
  return value.includes('OUTROS') || value.includes('OUTRO');
}

function isFormaCheque(formaPagamento) {
  return getTipoFormaPagamento(formaPagamento).includes('CHEQUE');
}

function getParcelaPayload(parcelas = [], index) {
  if (!Array.isArray(parcelas)) return {};
  return parcelas[index] || {};
}

function buildChequeFields(formaPagamento, parcela, index) {
  if (!isFormaCheque(formaPagamento)) {
    return {
      cheque_numero: null,
      cheque_banco: null,
      cheque_agencia: null,
      cheque_conta: null,
      cheque_emitente: null
    };
  }

  const chequeNumero = String(parcela?.cheque_numero || '').trim();
  const chequeEmitente = String(parcela?.cheque_emitente || '').trim();

  return {
    cheque_numero: chequeNumero || null,
    cheque_banco: parcela.cheque_banco || null,
    cheque_agencia: parcela.cheque_agencia || null,
    cheque_conta: parcela.cheque_conta || null,
    cheque_emitente: chequeEmitente || null
  };
}

function isChequeFormaRecebimento(formaRecebimento) {
  return String(formaRecebimento || '').trim().toUpperCase().includes('CHEQUE');
}

function getTituloTipo(titulo) {
  return String(titulo?.tipo || '').trim().toUpperCase();
}

function getTituloParceiroNome(titulo) {
  return (
    titulo?.parceiro?.nome
    || titulo?.parceiro?.razao_social
    || titulo?.parceiro?.nome_fantasia
    || titulo?.parceiro_nome
    || null
  );
}

function getTituloParceiroDocumento(titulo) {
  return titulo?.parceiro?.cpf_cnpj || titulo?.parceiro_documento || null;
}

function gerarCodigoChequeTerceiro() {
  return `CHQ-${crypto.randomUUID().slice(0, 10).toUpperCase()}`;
}

function normalizarChequePayload(payload = {}) {
  return {
    numero_cheque: String(payload.cheque_numero || payload.numero_cheque || '').trim() || null,
    titular_nome: String(payload.cheque_emitente || payload.titular_nome || '').trim() || null,
    titular_documento: String(payload.titular_documento || '').trim() || null,
    banco: String(payload.cheque_banco || payload.banco || '').trim() || null,
    agencia: String(payload.cheque_agencia || payload.agencia || '').trim() || null,
    conta: String(payload.cheque_conta || payload.conta || '').trim() || null
  };
}

function buildChequeMovimentoFields(formaRecebimento, payload = {}) {
  if (!isChequeFormaRecebimento(formaRecebimento) || payload.usar_cheque_terceiro) {
    return {
      cheque_numero: null,
      cheque_emitente: null,
      cheque_titular_documento: null,
      cheque_banco: null,
      cheque_agencia: null,
      cheque_conta: null,
      cheque_data_emissao: null,
      cheque_data_vencimento: null
    };
  }
  const cheque = normalizarChequePayload(payload);
  return {
    cheque_numero: cheque.numero_cheque,
    cheque_emitente: cheque.titular_nome,
    cheque_titular_documento: cheque.titular_documento,
    cheque_banco: cheque.banco,
    cheque_agencia: cheque.agencia,
    cheque_conta: cheque.conta,
    cheque_data_emissao: payload.data_emissao || null,
    cheque_data_vencimento: payload.data_vencimento || null
  };
}

async function obterChequeTerceiroDisponivel(chequeTerceiroId, transaction) {
  const id = Number(chequeTerceiroId);
  if (!Number.isInteger(id) || id <= 0) {
    throw createHttpError(400, 'Selecione o cheque de terceiro que sera usado na baixa.');
  }

  const cheque = await ChequeTerceiro.findOne({
    where: { id, status: 'EM_CARTEIRA' },
    transaction,
    lock: transaction?.LOCK?.UPDATE
  });

  if (!cheque) {
    throw createHttpError(400, 'Cheque de terceiro indisponivel ou ja utilizado.');
  }

  return cheque;
}

async function registrarChequeTerceiroRecebido({
  req,
  titulo,
  movimento,
  payload = {},
  valor,
  dataMovimento,
  transaction
}) {
  if (!ChequeTerceiro || !movimento) return null;

  const chequePayload = normalizarChequePayload(payload);
  const titularNome = chequePayload.titular_nome || getTituloParceiroNome(titulo) || 'Titular nao informado';
  const numeroCheque = chequePayload.numero_cheque || payload.documento_referencia || `MOV-${movimento.id}`;

  const cheque = await ChequeTerceiro.create({
    codigo: gerarCodigoChequeTerceiro(),
    titulo_financeiro_id: titulo.id,
    movimento_financeiro_id: movimento.id,
    movimento_entrada_id: movimento.id,
    parceiro_entregou_id: titulo.parceiro_id || null,
    empresa_id: titulo.empresa_id || movimento.empresa_id || null,
    obra_origem_id: titulo.obra_id || null,
    origem_tipo: 'RECEBIMENTO_TITULO',
    cliente_nome: getTituloParceiroNome(titulo),
    titular_nome: titularNome,
    titular_documento: chequePayload.titular_documento || getTituloParceiroDocumento(titulo),
    banco: chequePayload.banco,
    agencia: chequePayload.agencia,
    conta: chequePayload.conta,
    numero_cheque: numeroCheque,
    valor: roundCurrency(valor),
    data_emissao: payload.data_emissao || dataMovimento || null,
    data_vencimento: payload.data_vencimento || dataMovimento || null,
    data_entrada: dataMovimento || null,
    status: 'EM_CARTEIRA',
    observacoes: payload.observacoes || 'Cheque de terceiro registrado automaticamente pela baixa de recebimento.',
    criado_por: req.user?.id || null,
    atualizado_por: req.user?.id || null
  }, { transaction });

  await ChequeTerceiroMovimento.create({
    cheque_terceiro_id: cheque.id,
    tipo_evento: 'ENTRADA',
    status_anterior: null,
    status_novo: 'EM_CARTEIRA',
    empresa_destino_id: cheque.empresa_id,
    titulo_financeiro_id: titulo.id,
    movimento_financeiro_id: movimento.id,
    valor: roundCurrency(valor),
    data_evento: dataMovimento,
    observacoes: 'Cheque registrado automaticamente pela baixa do titulo a receber.',
    criado_por: req.user?.id || null
  }, { transaction });

  return cheque;
}

async function consumirChequeTerceiroPagamento({
  req,
  chequeTerceiroId,
  movimento,
  valor,
  transaction
}) {
  if (!ChequeTerceiro || !movimento) return null;

  const cheque = await obterChequeTerceiroDisponivel(chequeTerceiroId, transaction);
  if (cheque.empresa_id && movimento.empresa_id && Number(cheque.empresa_id) !== Number(movimento.empresa_id)) {
    throw createHttpError(400, 'O cheque de terceiro pertence a outra empresa do grupo.');
  }
  const diferenca = Math.abs(roundCurrency(cheque.valor) - roundCurrency(valor));
  if (diferenca >= 0.01) {
    throw createHttpError(
      400,
      'O valor do cheque de terceiro precisa ser igual ao valor da baixa ou parcela selecionada.'
    );
  }

  await cheque.update({
    status: 'UTILIZADO',
    movimento_saida_id: movimento.id,
    data_saida: movimento.data_movimento || null,
    atualizado_por: req.user?.id || null
  }, { transaction });

  await ChequeTerceiroMovimento.create({
    cheque_terceiro_id: cheque.id,
    tipo_evento: 'UTILIZACAO',
    status_anterior: 'EM_CARTEIRA',
    status_novo: 'UTILIZADO',
    empresa_origem_id: cheque.empresa_id || null,
    titulo_financeiro_id: movimento.titulo_financeiro_id || null,
    movimento_financeiro_id: movimento.id,
    baixa_grupo_id: movimento.baixa_grupo_id || null,
    valor: roundCurrency(valor),
    data_evento: movimento.data_movimento,
    observacoes: 'Cheque utilizado em pagamento de titulo financeiro.',
    criado_por: req.user?.id || null
  }, { transaction });

  return cheque;
}

function resolveVencimentoParcela({ formaPagamento, parcela, dataVencimentoBase, dataCompra, index }) {
  if (isFormaCartao(formaPagamento)) {
    return addMonths(dataVencimentoBase || dataCompra, index);
  }

  if (parcela?.data_vencimento) {
    return parcela.data_vencimento;
  }

  if (isFormaBoleto(formaPagamento) || isFormaCheque(formaPagamento) || isFormaOutros(formaPagamento)) {
    const label = isFormaCheque(formaPagamento) ? 'cheque' : isFormaOutros(formaPagamento) ? 'guia de pagamento' : 'boleto';
    throw createHttpError(400, `Informe o vencimento do ${label} da parcela ${index + 1}.`);
  }

  if (!dataVencimentoBase) {
    throw createHttpError(400, 'Data de vencimento e obrigatoria para gerar o titulo.');
  }

  return addMonths(dataVencimentoBase, index);
}

function getStatusCobrancaInicial(tipo, formaCobranca, statusCobranca = null) {
  const tipoNormalizado = String(tipo || '').toUpperCase();
  if (tipoNormalizado === 'PAGAR') {
    return 'NAO_APLICAVEL';
  }
  if (tipoNormalizado !== 'RECEBER') {
    return 'NAO_APLICAVEL';
  }

  if (statusCobranca) {
    return statusCobranca;
  }

  return formaCobranca ? 'PENDENTE_EMISSAO' : 'NAO_APLICAVEL';
}

function buildCobrancaFields(payload = {}, tipo) {
  const tipoNormalizado = String(tipo || '').toUpperCase();
  const linhaDigitavel = payload.linha_digitavel || null;
  const codigoBarras = payload.codigo_barras || null;

  if (tipoNormalizado === 'PAGAR') {
    return {
      forma_cobranca: normalizarFormaCobranca(payload.forma_cobranca) || (linhaDigitavel || codigoBarras ? 'BOLETO' : null),
      status_cobranca: 'NAO_APLICAVEL',
      banco_cobranca: payload.banco_cobranca || null,
      nosso_numero: null,
      linha_digitavel: linhaDigitavel,
      codigo_barras: codigoBarras,
      identificador_externo: null,
      boleto_emitido_em: null
    };
  }

  if (tipoNormalizado !== 'RECEBER') {
    return {
      forma_cobranca: null,
      status_cobranca: 'NAO_APLICAVEL',
      banco_cobranca: null,
      nosso_numero: null,
      linha_digitavel: null,
      codigo_barras: null,
      identificador_externo: null,
      boleto_emitido_em: null
    };
  }

  const formaCobranca = normalizarFormaCobranca(payload.forma_cobranca);
  const statusCobranca = getStatusCobrancaInicial(
    tipo,
    formaCobranca,
    normalizarStatusCobranca(payload.status_cobranca)
  );

  return {
    forma_cobranca: formaCobranca,
    status_cobranca: statusCobranca,
    banco_cobranca: payload.banco_cobranca || null,
    nosso_numero: payload.nosso_numero || null,
    linha_digitavel: payload.linha_digitavel || null,
    codigo_barras: payload.codigo_barras || null,
    identificador_externo: payload.identificador_externo || null,
    boleto_emitido_em: payload.boleto_emitido_em || null
  };
}

function buildUpdatedCobrancaFields(titulo, payload = {}) {
  const tipoTitulo = String(titulo?.tipo || '').toUpperCase();
  if (!['RECEBER', 'PAGAR'].includes(tipoTitulo)) {
    throw createHttpError(400, 'Somente titulos financeiros podem receber dados bancarios.');
  }

  if (tipoTitulo === 'PAGAR') {
    const linhaDigitavel = payload.linha_digitavel !== undefined ? payload.linha_digitavel : titulo.linha_digitavel;
    const codigoBarras = payload.codigo_barras !== undefined ? payload.codigo_barras : titulo.codigo_barras;

    return {
      forma_cobranca: payload.forma_cobranca !== undefined
        ? normalizarFormaCobranca(payload.forma_cobranca)
        : normalizarFormaCobranca(titulo.forma_cobranca) || (linhaDigitavel || codigoBarras ? 'BOLETO' : null),
      status_cobranca: 'NAO_APLICAVEL',
      banco_cobranca: payload.banco_cobranca !== undefined ? payload.banco_cobranca : titulo.banco_cobranca,
      nosso_numero: null,
      linha_digitavel: linhaDigitavel || null,
      codigo_barras: codigoBarras || null,
      identificador_externo: null,
      boleto_emitido_em: null
    };
  }

  const formaCobranca = payload.forma_cobranca !== undefined
    ? normalizarFormaCobranca(payload.forma_cobranca)
    : normalizarFormaCobranca(titulo.forma_cobranca);

  let statusCobranca = payload.status_cobranca !== undefined
    ? normalizarStatusCobranca(payload.status_cobranca)
    : normalizarStatusCobranca(titulo.status_cobranca);

  if (!statusCobranca) {
    statusCobranca = getStatusCobrancaInicial(titulo.tipo, formaCobranca);
  }

  if (statusCobranca !== 'NAO_APLICAVEL' && !formaCobranca) {
    throw createHttpError(400, 'Informe a forma de cobranca antes de definir o status da cobranca.');
  }

  return {
    forma_cobranca: formaCobranca,
    status_cobranca: statusCobranca,
    banco_cobranca: payload.banco_cobranca !== undefined ? payload.banco_cobranca : titulo.banco_cobranca,
    nosso_numero: payload.nosso_numero !== undefined ? payload.nosso_numero : titulo.nosso_numero,
    linha_digitavel: payload.linha_digitavel !== undefined ? payload.linha_digitavel : titulo.linha_digitavel,
    codigo_barras: payload.codigo_barras !== undefined ? payload.codigo_barras : titulo.codigo_barras,
    identificador_externo: payload.identificador_externo !== undefined ? payload.identificador_externo : titulo.identificador_externo,
    boleto_emitido_em: payload.boleto_emitido_em !== undefined ? payload.boleto_emitido_em : titulo.boleto_emitido_em
  };
}

function sugestaoTipoTitulo(solicitacao) {
  const tipoNome = String(solicitacao?.tipo?.nome || '').trim().toUpperCase();
  const areaResponsavel = String(solicitacao?.area_responsavel || '').trim().toUpperCase();

  if (tipoNome.includes('COMPRA') || areaResponsavel === 'COMPRAS') {
    return 'PAGAR';
  }

  return 'RECEBER';
}

function descricaoPadraoTitulo(solicitacao) {
  const codigo = String(solicitacao?.codigo || '').trim();
  const tipoNome = String(solicitacao?.tipo?.nome || '').trim();
  const descricao = String(solicitacao?.descricao || '').trim();
  const partes = [codigo, tipoNome].filter(Boolean);
  const prefixo = partes.join(' - ');

  if (!prefixo && !descricao) {
    return 'Titulo financeiro gerado por solicitacao';
  }

  if (!descricao) {
    return prefixo;
  }

  return `${prefixo}: ${descricao}`.slice(0, 255);
}

function descricaoPadraoTituloManual(tipo) {
  return tipo === 'RECEBER'
    ? 'Titulo financeiro manual de recebimento'
    : 'Titulo financeiro manual de pagamento';
}

function getSetorUsuario(req) {
  return req.user?.setor?.codigo || req.user?.area || req.user?.setor?.nome || 'FINANCEIRO';
}

async function assertFinanceAccess(req) {
  const allowed = await canAccessFinanceiro(req.user);
  if (allowed) {
    return;
  }

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'AUTHZ_DENIED',
    recursoTipo: 'FINANCEIRO',
    recursoId: req.originalUrl,
    status: 'DENIED',
    descricao: 'Usuario sem permissao para acessar rotas do modulo financeiro'
  });

  throw createHttpError(403, 'Acesso negado para o modulo financeiro');
}

async function assertObraScope(req, obraId, resourceType, resourceId, description) {
  const obrasPermitidas = await getFinanceiroObraScopeIds(req.user);
  if (obrasPermitidas === null) {
    return;
  }

  if (obrasPermitidas.length > 0 && obrasPermitidas.includes(Number(obraId))) {
    return;
  }

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'AUTHZ_DENIED',
    recursoTipo: resourceType,
    recursoId: resourceId != null ? String(resourceId) : String(obraId),
    status: 'DENIED',
    descricao: description,
    metadata: {
      obra_id: Number(obraId) || null
    }
  });

  throw createHttpError(403, 'Acesso negado para esta obra');
}

function buildTituloInclude({ includeMovimentos = false } = {}) {
  const include = [
    {
      model: Obra,
      as: 'obra',
      attributes: ['id', 'nome', 'codigo', 'empresa_grupo_id']
    },
    {
      model: Parceiro,
      as: 'parceiro',
      attributes: ['id', 'nome', 'cpf_cnpj', 'telefone', 'email']
    },
    {
      model: Solicitacao,
      as: 'solicitacao',
      attributes: ['id', 'codigo', 'descricao', 'status_global', 'area_responsavel']
    },
    {
      model: CategoriaFinanceira,
      as: 'categoriaFinanceira',
      attributes: ['id', 'nome', 'tipo']
    },
    {
      model: EmpresaGrupo,
      as: 'empresa',
      attributes: ['id', 'codigo', 'nome', 'razao_social', 'cnpj']
    },
    {
      model: EmpresaGrupo,
      as: 'empresaContraparte',
      attributes: ['id', 'codigo', 'nome', 'razao_social', 'cnpj']
    },
    {
      model: EmpresaGrupo,
      as: 'empresaOrigem',
      attributes: ['id', 'codigo', 'nome', 'razao_social', 'cnpj']
    },
    {
      model: EmpresaGrupo,
      as: 'empresaDestino',
      attributes: ['id', 'codigo', 'nome', 'razao_social', 'cnpj']
    },
    {
      model: FormaPagamentoFinanceira,
      as: 'formaPagamento',
      attributes: ['id', 'nome', 'codigo', 'tipo', 'permite_parcelamento', 'gera_fatura', 'gera_boleto', 'exige_cartao']
    },
    {
      model: CartaoFinanceiro,
      as: 'cartao',
      attributes: ['id', 'nome', 'titular', 'tipo', 'bandeira', 'ultimos_digitos', 'dia_fechamento', 'dia_vencimento']
    },
    {
      model: FaturaCartaoFinanceiro,
      as: 'faturaCartao',
      attributes: ['id', 'competencia', 'data_fechamento', 'data_vencimento', 'valor_total', 'status']
    },
    {
      model: TituloFinanceiroRateio,
      as: 'rateios',
      include: [
        {
          model: Obra,
          as: 'obra',
          attributes: ['id', 'nome', 'codigo', 'empresa_grupo_id']
        },
        {
          model: Apropriacao,
          as: 'apropriacao',
          attributes: ['id', 'codigo', 'descricao']
        }
      ]
    },
    {
      model: TituloFinanceiroImposto,
      as: 'impostos'
    },
    {
      model: User,
      as: 'criadoPor',
      attributes: ['id', 'nome', 'email']
    },
    {
      model: IntegracaoSiengeFila,
      as: 'integracaoSienge',
      attributes: [
        'id',
        'origem_modulo',
        'status',
        'tentativas',
        'enviado_em',
        'ultimo_erro',
        'external_title_id',
        'updatedAt'
      ]
    },
    {
      model: PagamentoManualFilaItem,
      as: 'filaPagamentosManuais',
      where: { status: { [Op.in]: ['PENDENTE', 'NAO_PAGO', 'DIVERGENTE'] } },
      required: false,
      separate: true,
      attributes: [
        'id',
        'status',
        'valor_previsto',
        'valor_informado',
        'data_baixa',
        'motivo',
        'selecionado_em',
        'processado_em'
      ],
      order: [['createdAt', 'DESC']]
    }
  ];

  if (includeMovimentos) {
    include.push({
      model: MovimentoFinanceiro,
      as: 'movimentos',
      include: [
        {
          model: FormaPagamentoFinanceira,
          as: 'formaPagamento',
          attributes: ['id', 'nome', 'codigo', 'tipo']
        },
        {
          model: ContaBancaria,
          as: 'contaBancaria',
          attributes: ['id', 'nome', 'banco', 'agencia', 'conta', 'empresa_id']
        },
        {
          model: CartaoFinanceiro,
          as: 'cartao',
          attributes: ['id', 'nome', 'titular', 'tipo', 'bandeira', 'ultimos_digitos', 'conta_bancaria_id']
        },
        {
          model: EmpresaGrupo,
          as: 'empresa',
          attributes: ['id', 'codigo', 'nome', 'razao_social', 'cnpj']
        },
        {
          model: EmpresaGrupo,
          as: 'empresaOrigem',
          attributes: ['id', 'codigo', 'nome', 'razao_social', 'cnpj']
        },
        {
          model: EmpresaGrupo,
          as: 'empresaDestino',
          attributes: ['id', 'codigo', 'nome', 'razao_social', 'cnpj']
        },
        {
          model: User,
          as: 'criadoPor',
          attributes: ['id', 'nome', 'email']
        },
        {
          model: User,
          as: 'estornadoPor',
          attributes: ['id', 'nome', 'email']
        }
      ],
      separate: true,
      order: [['data_movimento', 'DESC'], ['createdAt', 'DESC']]
    });
    include.push({
      model: PaymentIntent,
      as: 'paymentIntents',
      include: [
        {
          model: PaymentBeneficiary,
          as: 'beneficiary',
          attributes: ['id', 'nome', 'cpf_cnpj', 'pix_tipo_chave', 'pix_chave', 'ativo']
        },
        {
          model: PaymentBatchItem,
          as: 'batchItems',
          include: [{
            model: PaymentBatch,
            as: 'batch',
            attributes: ['id', 'codigo', 'status', 'valor_total', 'quantidade_itens', 'sent_at']
          }]
        }
      ],
      separate: true,
      order: [['createdAt', 'DESC']]
    });
  }

  return include;
}

async function obterSolicitacoesContratuaisPorParceiros(parceiroIds = []) {
  const ids = Array.from(new Set(
    parceiroIds.map((id) => Number(id)).filter(Boolean)
  ));
  if (ids.length === 0) return [];

  const vinculos = await ContratoCredor.findAll({
    where: {
      parceiro_id: { [Op.in]: ids },
      ativo: true
    },
    attributes: ['id'],
    include: [{
      model: Contrato,
      as: 'contrato',
      required: true,
      attributes: ['solicitacao_id'],
      where: {
        fluxo_novo: true,
        solicitacao_id: { [Op.ne]: null }
      }
    }]
  });

  return Array.from(new Set(
    vinculos
      .map((vinculo) => Number(vinculo.contrato?.solicitacao_id))
      .filter(Boolean)
  ));
}

async function carregarSolicitacaoFinanceira(req, solicitacaoId) {
  const solicitacao = await Solicitacao.findByPk(solicitacaoId, {
    include: [
      {
        model: Obra,
        as: 'obra',
        attributes: ['id', 'nome', 'codigo', 'empresa_grupo_id']
      },
      {
        model: Parceiro,
        as: 'parceiro',
        attributes: ['id', 'nome', 'cpf_cnpj', 'telefone', 'email', 'ativo']
      },
      {
        model: TipoSolicitacao,
        as: 'tipo',
        attributes: ['id', 'nome']
      }
    ]
  });

  if (!solicitacao) {
    throw createHttpError(404, 'Solicitacao nao encontrada');
  }

  await assertObraScope(
    req,
    solicitacao.obra_id,
    'SOLICITACAO',
    solicitacao.id,
    'Usuario tentou acessar titulo financeiro de solicitacao fora do seu escopo de obra'
  );

  return solicitacao;
}

async function validarCategoriaFinanceira(categoriaId, tipoTitulo) {
  if (!categoriaId) {
    return null;
  }

  const categoria = await CategoriaFinanceira.findByPk(categoriaId);
  if (!categoria || categoria.ativo === false) {
    throw createHttpError(400, 'Categoria financeira invalida.');
  }

  const tipoCategoria = String(categoria.tipo || '').trim().toUpperCase();
  if (tipoCategoria && tipoCategoria !== 'AMBOS' && tipoCategoria !== tipoTitulo) {
    throw createHttpError(400, 'Categoria financeira incompativel com o tipo do titulo.');
  }

  return categoria;
}

function validarCategoriaDreTitulo(categoria, payload = {}) {
  if (!categoria) {
    throw createHttpError(
      400,
      'Categoria financeira e obrigatoria para todos os titulos financeiros. Informe a classificacao correta antes de salvar.'
    );
  }

  if (payload.considera_dre === false) {
    return;
  }

  if (categoria.considera_dre === false) {
    throw createHttpError(
      400,
      'A categoria financeira selecionada esta marcada fora da DRE. Escolha uma categoria de DRE ou desmarque Considerar na DRE.'
    );
  }

  if (!String(categoria.dre_grupo || '').trim()) {
    throw createHttpError(
      400,
      'A categoria financeira selecionada nao possui grupo DRE. Classifique a categoria antes de criar titulo considerado na DRE.'
    );
  }
}

async function validarFormaPagamentoFinanceira(
  formaPagamentoId,
  payload = {},
  { dispensarCartaoInstrucional = false, permitirPendente = false } = {}
) {
  if (!formaPagamentoId) {
    // Titulos automaticos de contrato nascem como PREVISAO. A forma real pertence a medicao e
    // sera gravada antes de o titulo passar a ABERTO; nenhum titulo manual ou ja aberto recebe
    // esta dispensa.
    if (permitirPendente) return null;
    throw createHttpError(
      400,
      'Forma de pagamento e obrigatoria para todos os titulos financeiros. Informe a forma correta antes de salvar.'
    );
  }

  const forma = await FormaPagamentoFinanceira.findByPk(formaPagamentoId);
  if (!forma || forma.ativo === false) {
    throw createHttpError(400, 'Forma de pagamento invalida.');
  }

  const quantidadeParcelas = Math.max(Number(payload.quantidade_parcelas || 1), 1);
  if (quantidadeParcelas > 1 && forma.permite_parcelamento === false && !isFormaPix(forma) && !isFormaOutros(forma)) {
    throw createHttpError(400, 'A forma de pagamento selecionada nao permite parcelamento.');
  }

  // No fluxo novo de CONTRATO, "Cartao" e a instrucao combinada com o fornecedor — os dados
  // para pagamento ficam no historico da solicitacao. Nao representa uma baixa ja realizada em
  // um cartao corporativo cadastrado. A dispensa so pode vir pela opcao interna do servico;
  // payload HTTP nao consegue liga-la e os demais titulos continuam exigindo `cartao_id`.
  if (forma.exige_cartao && !payload.cartao_id && !dispensarCartaoInstrucional) {
    throw createHttpError(400, 'Informe o cartao utilizado nesta forma de pagamento.');
  }

  if (forma.exige_cartao && payload.cartao_id) {
    const cartao = await CartaoFinanceiro.findByPk(payload.cartao_id);
    if (!cartao || cartao.ativo === false) {
      throw createHttpError(400, 'Cartao financeiro invalido ou inativo.');
    }

    const tipoForma = `${forma.tipo || ''} ${forma.codigo || ''}`.toUpperCase();
    const tipoCartaoEsperado = tipoForma.includes('DEBITO')
      ? 'DEBITO'
      : tipoForma.includes('CREDITO')
        ? 'CREDITO'
        : null;
    const tipoCartao = String(cartao.tipo || 'CREDITO').trim().toUpperCase();

    if (tipoCartaoEsperado && tipoCartao !== tipoCartaoEsperado) {
      throw createHttpError(
        400,
        tipoCartaoEsperado === 'CREDITO'
          ? 'Selecione um cartao de credito para esta forma de pagamento.'
          : 'Selecione um cartao de debito para esta forma de pagamento.'
      );
    }

    if (forma.gera_fatura && tipoCartao !== 'CREDITO') {
      throw createHttpError(400, 'Somente cartoes de credito podem gerar fatura.');
    }
  }

  return forma;
}

async function baixarTituloCartaoNoAto({
  req,
  titulo,
  formaPagamento,
  pagamentoPayload = {},
  dataMovimento,
  transaction
}) {
  if (!isFormaCartao(formaPagamento) || !pagamentoPayload.cartao_id) {
    return null;
  }

  const cartao = await CartaoFinanceiro.findByPk(pagamentoPayload.cartao_id, {
    include: [{ model: ContaBancaria, as: 'contaBancaria' }],
    transaction
  });

  if (!cartao || cartao.ativo === false) {
    throw createHttpError(400, 'Cartao financeiro invalido ou inativo.');
  }

  const tipoCartao = String(cartao.tipo || 'CREDITO').trim().toUpperCase();
  const isCartaoCreditoComFatura = tipoCartao === 'CREDITO' && Boolean(formaPagamento?.gera_fatura);
  if (tipoCartao !== 'DEBITO' && !isCartaoCreditoComFatura) {
    return null;
  }

  const conta = cartao.contaBancaria;
  if (!conta || conta.ativo === false) {
    throw createHttpError(
      400,
      tipoCartao === 'CREDITO'
        ? 'Cartao de credito precisa ter uma conta bancaria ativa vinculada para baixar no ato do registro.'
        : 'Cartao de debito precisa ter uma conta bancaria ativa vinculada para baixar no ato do registro.'
    );
  }

  if (!titulo.empresa_id) {
    throw createHttpError(
      400,
      `Titulo ${titulo.codigo || titulo.id} sem empresa vinculada. Corrija a empresa antes de usar cartao.`
    );
  }

  const empresaBaixaId = await validarEmpresaBaixa({
    empresaId: conta.empresa_id,
    conta
  });
  const movimentoIntercompanyFields = await validarIntercompanyBaixa({
    payload: {
      intercompany: titulo.intercompany,
      intercompany_group_id: titulo.intercompany_group_id,
      tipo_intercompany: titulo.tipo_intercompany,
      motivo_intercompany: titulo.motivo_intercompany,
      elimina_consolidado: titulo.elimina_consolidado,
      transferencia_interna: titulo.transferencia_interna
    },
    titulo,
    empresaBaixaId
  });
  const dataBaixa = dataMovimento || titulo.data_compra || titulo.data_vencimento || getHoje();
  const valorBaixa = roundCurrency(titulo.valor_saldo || titulo.valor_original);
  if (valorBaixa <= 0) {
    return null;
  }

  const caixaSessao = await obterSessaoAbertaParaConta(conta, dataBaixa, { transaction });
  const movimento = await MovimentoFinanceiro.create({
    titulo_financeiro_id: titulo.id,
    fatura_cartao_id: tipoCartao === 'CREDITO' ? titulo.fatura_cartao_id || null : null,
    cartao_id: cartao.id,
    conta_bancaria_id: conta.id,
    empresa_id: empresaBaixaId,
    ...movimentoIntercompanyFields,
    caixa_sessao_id: caixaSessao?.id || null,
    forma_recebimento: tipoCartao === 'CREDITO' ? 'CARTAO_CREDITO' : 'CARTAO_DEBITO',
    tipo_movimento: 'BAIXA',
    status: 'ATIVO',
    valor: valorBaixa,
    juros: 0,
    multa: 0,
    desconto: 0,
    valor_quitacao: valorBaixa,
    data_movimento: dataBaixa,
    observacoes: `Baixa automatica por cartao de ${tipoCartao === 'CREDITO' ? 'credito' : 'debito'} ${cartao.nome || cartao.id}`,
    criado_por: req.user?.id || null
  }, { transaction });

  await titulo.update({
    valor_baixado: roundCurrency(Number(titulo.valor_baixado || 0) + valorBaixa),
    valor_saldo: 0,
    status: 'QUITADO',
    data_quitacao: dataBaixa,
    atualizado_por: req.user?.id || null
  }, { transaction });

  await sincronizarRealizacaoCompraPorTitulo({
    titulo,
    statusTitulo: 'QUITADO',
    transaction
  });

  await sincronizarStatusSolicitacaoPorBaixaTitulos({
    solicitacaoId: titulo.solicitacao_id,
    usuarioId: req.user?.id || null,
    setor: getSetorUsuario(req),
    transaction,
    observacao: `Status atualizado automaticamente apos baixa por cartao de ${tipoCartao === 'CREDITO' ? 'credito' : 'debito'}.`
  });

  return { movimento, cartao, conta, valorBaixa, dataBaixa, tipoCartao };
}

async function validarParceiro(parceiroId) {
  const parceiro = await Parceiro.findByPk(parceiroId);
  if (!parceiro || parceiro.ativo === false) {
    throw createHttpError(400, 'Parceiro invalido.');
  }
  return parceiro;
}

function validarCompatibilidadeParceiroTitulo(parceiro, tipoTitulo) {
  const tipo = normalizarTipoTitulo(tipoTitulo);
  if (tipo === 'PAGAR' && parceiro.fornecedor === false && parceiro.corretor === false) {
    throw createHttpError(400, 'O parceiro selecionado nao esta marcado como fornecedor ou corretor.');
  }

  if (tipo === 'RECEBER' && parceiro.cliente === false) {
    throw createHttpError(400, 'O parceiro selecionado nao esta marcado como cliente.');
  }
}

async function marcarSolicitacaoComTituloCadastrado({ solicitacao, usuarioId, setor, transaction }) {
  if (!solicitacao?.id) return;

  const statusAnterior = solicitacao.status_global || null;
  const statusNovo = 'TITULO_CADASTRADO';

  if (String(statusAnterior || '').trim().toUpperCase() === statusNovo) {
    return;
  }

  await solicitacao.update(
    { status_global: statusNovo },
    { transaction }
  );

  await Historico.create(
    {
      solicitacao_id: solicitacao.id,
      usuario_responsavel_id: usuarioId || null,
      setor: setor || solicitacao.area_responsavel || 'FINANCEIRO',
      acao: 'STATUS_ALTERADO',
      status_anterior: statusAnterior,
      status_novo: statusNovo,
      observacao: 'Status atualizado automaticamente apos criacao de titulo financeiro.'
    },
    { transaction }
  );
}

async function validarObraTitulo(req, obraId, { pularEscopoObra = false } = {}) {
  const obra = await Obra.findByPk(obraId, {
    attributes: ['id', 'nome', 'codigo', 'tipo_centro_custo', 'empresa_grupo_id']
  });

  if (!obra) {
    throw createHttpError(400, 'Obra invalida.');
  }

  // Aprovacao de contrato (D36): a permissao estrita basta — o aprovador e um papel
  // central e nao precisa de vinculo em usuarios_obras com a obra do contrato. Sem isto,
  // aprovar exigia vinculo e rejeitar nao, e 10/14 ADMIN nao aprovariam nada.
  if (pularEscopoObra) return obra;

  await assertObraScope(
    req,
    obra.id,
    'TITULO_FINANCEIRO',
    obra.id,
    'Usuario tentou criar ou acessar titulo financeiro de obra fora do seu escopo'
  );

  return obra;
}

async function validarApropriacaoTitulo(apropriacaoId, obraId) {
  if (!apropriacaoId) {
    return null;
  }

  const apropriacao = await Apropriacao.findByPk(apropriacaoId);
  if (!apropriacao || apropriacao.ativo === false) {
    throw createHttpError(400, 'Apropriacao informada nao foi encontrada.');
  }
  if (apropriacao.somadora === true) {
    throw createHttpError(400, 'Selecione uma apropriacao analitica. Apropriacoes somadoras nao podem receber lancamentos.');
  }

  if (Number(apropriacao.obra_id) !== Number(obraId)) {
    throw createHttpError(400, 'A apropriacao informada nao pertence a obra/centro de custo selecionado.');
  }

  return apropriacao;
}

async function validarContaBancaria(contaBancariaId) {
  if (!contaBancariaId) {
    return null;
  }
  const conta = await ContaBancaria.findByPk(contaBancariaId);
  if (!conta || conta.ativo === false) {
    throw createHttpError(400, 'Conta bancaria invalida.');
  }
  return conta;
}

async function validarEmpresaGrupo(empresaId) {
  if (!empresaId) {
    return null;
  }
  const id = Number(empresaId);
  if (!Number.isInteger(id) || id <= 0) {
    throw createHttpError(400, 'Empresa do grupo invalida.');
  }
  const empresa = await EmpresaGrupo.findByPk(id);
  if (!empresa || empresa.ativo === false) {
    throw createHttpError(400, 'Empresa do grupo invalida ou inativa.');
  }
  return empresa;
}

async function validarEmpresaBaixa({ empresaId, conta }) {
  const empresa = await validarEmpresaGrupo(empresaId);
  if (!empresa) {
    throw createHttpError(400, 'Empresa pagadora e obrigatoria para registrar a baixa.');
  }

  const empresaBaixaId = Number(empresa.id);
  if (conta && !conta.empresa_id) {
    throw createHttpError(400, 'A conta bancaria selecionada nao possui empresa vinculada.');
  }

  if (conta?.empresa_id && Number(conta.empresa_id) !== empresaBaixaId) {
    throw createHttpError(400, 'A empresa pagadora deve ser a mesma vinculada a conta bancaria selecionada.');
  }

  return empresaBaixaId;
}

function resolverEmpresaTitulo({ obra }) {
  const empresaDaObra = obra?.empresa_grupo_id ? Number(obra.empresa_grupo_id) : null;

  if (!Number.isInteger(empresaDaObra) || empresaDaObra <= 0) {
    throw createHttpError(
      400,
      'A obra/centro de custo selecionado nao possui empresa do grupo vinculada. Corrija o cadastro antes de gerar titulo.'
    );
  }

  return empresaDaObra;
}

async function resolverEmpresaTituloParaBaixa(titulo = {}) {
  const empresaAtualId = titulo?.empresa_id ? Number(titulo.empresa_id) : null;
  if (Number.isInteger(empresaAtualId) && empresaAtualId > 0) {
    await validarEmpresaGrupo(empresaAtualId);
    return empresaAtualId;
  }

  let obra = titulo?.obra || null;
  if (!obra && titulo?.obra_id) {
    obra = await Obra.findByPk(titulo.obra_id, {
      attributes: ['id', 'nome', 'codigo', 'empresa_grupo_id']
    });
  }

  const empresaDaObra = obra?.empresa_grupo_id ? Number(obra.empresa_grupo_id) : null;
  if (!Number.isInteger(empresaDaObra) || empresaDaObra <= 0) {
    throw createHttpError(
      400,
      'Titulo sem empresa vinculada e a obra/centro de custo do titulo nao possui empresa do grupo vinculada. Corrija o cadastro antes de registrar baixa.'
    );
  }

  await validarEmpresaGrupo(empresaDaObra);
  if (typeof titulo.setDataValue === 'function') {
    titulo.setDataValue('empresa_id', empresaDaObra);
  } else {
    titulo.empresa_id = empresaDaObra;
  }
  return empresaDaObra;
}

function resolverCompetenciaTitulo(payload = {}) {
  const competenciaData = payload.competencia_data || null;
  if (!competenciaData) {
    throw createHttpError(
      400,
      'Competencia DRE e obrigatoria para todos os titulos financeiros. Informe a competencia economica real do lancamento.'
    );
  }

  return competenciaData;
}

function resolverCompetenciaCriacaoTitulo() {
  // A competencia de novos titulos acompanha o dia em que o registro e criado.
  // Nao usa vencimento, emissao ou um valor enviado pela interface.
  return getHoje();
}

async function validarIntercompanyTitulo(payload = {}) {
  const isIntercompany = Boolean(payload.intercompany);

  if (!isIntercompany) {
    return {
      intercompany: false,
      empresa_contraparte_id: null,
      intercompany_group_id: null,
      empresa_origem_id: null,
      empresa_destino_id: null,
      tipo_intercompany: null,
      motivo_intercompany: null,
      elimina_consolidado: false,
      transferencia_interna: false
    };
  }

  const tipoIntercompany = normalizeTipoIntercompany(payload.tipo_intercompany);
  if (!tipoIntercompany) {
    throw createHttpError(400, 'Tipo e obrigatorio para movimentos entre empresas.');
  }

  const [empresaOrigem, empresaDestino, empresaContraparte] = await Promise.all([
    validarEmpresaGrupo(payload.empresa_origem_id),
    validarEmpresaGrupo(payload.empresa_destino_id),
    validarEmpresaGrupo(payload.empresa_contraparte_id)
  ]);

  if (!empresaOrigem || !empresaDestino) {
    throw createHttpError(400, 'Empresa origem e empresa destino sao obrigatorias para movimentos entre empresas.');
  }
  if (Number(empresaOrigem.id) === Number(empresaDestino.id)) {
    throw createHttpError(400, 'Empresa origem e empresa destino nao podem ser iguais.');
  }
  if (!empresaContraparte) {
    throw createHttpError(400, 'Empresa contraparte e obrigatoria para movimentos entre empresas.');
  }

  return {
    intercompany: true,
    empresa_contraparte_id: Number(empresaContraparte.id),
    intercompany_group_id: payload.intercompany_group_id || `IC-${crypto.randomUUID()}`,
    empresa_origem_id: Number(empresaOrigem.id),
    empresa_destino_id: Number(empresaDestino.id),
    tipo_intercompany: tipoIntercompany,
    motivo_intercompany: payload.motivo_intercompany || null,
    elimina_consolidado: payload.elimina_consolidado !== false,
    transferencia_interna: payload.transferencia_interna !== false
  };
}

async function resolverIntercompanyPagamento({
  formaPagamento,
  pagamentoPayload = {},
  empresaTituloId,
  tipoTitulo,
  intercompanyFieldsPadrao
}) {
  if (!isFormaCartao(formaPagamento) || !pagamentoPayload.cartao_id) {
    return intercompanyFieldsPadrao;
  }

  const cartao = await CartaoFinanceiro.findByPk(pagamentoPayload.cartao_id, {
    include: [{
      model: ContaBancaria,
      as: 'contaBancaria',
      attributes: ['id', 'nome', 'empresa_id', 'ativo']
    }]
  });

  if (!cartao || cartao.ativo === false) {
    throw createHttpError(400, 'Cartao financeiro invalido ou inativo.');
  }

  const conta = cartao.contaBancaria;
  if (!conta || conta.ativo === false) {
    throw createHttpError(400, 'O cartao precisa ter uma conta financeira ativa vinculada.');
  }

  const empresaCartaoId = Number(conta.empresa_id);
  if (!Number.isInteger(empresaCartaoId) || empresaCartaoId <= 0) {
    throw createHttpError(
      400,
      'A conta vinculada ao cartao precisa ter uma empresa do grupo configurada.'
    );
  }

  const intercompanyCartao = buildIntercompanyCartaoPayload({
    empresaTituloId,
    empresaCartaoId,
    tipoTitulo,
    cartaoNome: cartao.nome
  });

  return intercompanyCartao.intercompany
    ? validarIntercompanyTitulo(intercompanyCartao)
    : intercompanyCartao;
}

function buildMovimentoIntercompanyFields(titulo = {}) {
  return {
    intercompany_group_id: titulo.intercompany_group_id || null,
    empresa_origem_id: titulo.empresa_origem_id || null,
    empresa_destino_id: titulo.empresa_destino_id || null,
    tipo_intercompany: titulo.tipo_intercompany || null,
    motivo_intercompany: titulo.motivo_intercompany || null,
    elimina_consolidado: Boolean(titulo.elimina_consolidado),
    transferencia_interna: Boolean(titulo.transferencia_interna)
  };
}

function normalizeNaturezaIntercompanyBaixa(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return null;
  if ([
    'OPERACIONAL_TERCEIRO',
    'TRANSFERENCIA_INTERNA',
    'REEMBOLSO_COMPENSACAO'
  ].includes(normalized)) {
    return normalized;
  }
  return null;
}

function buildIntercompanyBaixaPorNatureza(payload = {}) {
  const natureza = normalizeNaturezaIntercompanyBaixa(payload.natureza_intercompany_baixa);
  if (!natureza) return null;

  if (natureza === 'TRANSFERENCIA_INTERNA') {
    return {
      tipo_intercompany: 'COBERTURA_CAIXA',
      elimina_consolidado: true,
      transferencia_interna: true
    };
  }

  if (natureza === 'REEMBOLSO_COMPENSACAO') {
    return {
      tipo_intercompany: 'REEMBOLSO',
      elimina_consolidado: true,
      transferencia_interna: false
    };
  }

  return {
    tipo_intercompany: 'TRANSFERENCIA_OPERACIONAL',
    elimina_consolidado: false,
    transferencia_interna: false
  };
}

function buildTituloIntercompanyUpdateFromBaixa(fields = {}) {
  if (!fields.intercompany_group_id || !fields.tipo_intercompany) return {};
  return {
    intercompany: true,
    intercompany_group_id: fields.intercompany_group_id,
    empresa_origem_id: fields.empresa_origem_id || null,
    empresa_destino_id: fields.empresa_destino_id || null,
    tipo_intercompany: fields.tipo_intercompany,
    motivo_intercompany: fields.motivo_intercompany || null,
    elimina_consolidado: fields.elimina_consolidado === true,
    transferencia_interna: fields.transferencia_interna === true
  };
}

async function validarIntercompanyBaixa({ payload = {}, titulo = {}, empresaBaixaId }) {
  const empresaTituloId = await resolverEmpresaTituloParaBaixa(titulo);

  const empresasDiferentes = Boolean(
    empresaTituloId &&
    empresaBaixaId &&
    Number(empresaTituloId) !== Number(empresaBaixaId)
  );

  if (!empresasDiferentes) {
    if (payload.intercompany && !titulo.intercompany) {
      throw createHttpError(
        400,
        'A baixa so deve ser marcada como Entre Empresas quando a empresa da baixa for diferente da empresa do titulo.'
      );
    }
    return buildMovimentoIntercompanyFields(titulo);
  }

  if (!payload.intercompany) {
    throw createHttpError(
      400,
      'A empresa da baixa e diferente da empresa do titulo. Marque a baixa como Entre Empresas e informe o tipo.'
    );
  }

  const naturezaFields = buildIntercompanyBaixaPorNatureza(payload);
  const tipoIntercompany = normalizeTipoIntercompany(naturezaFields?.tipo_intercompany || payload.tipo_intercompany);
  if (!tipoIntercompany) {
    throw createHttpError(400, 'Tipo e obrigatorio quando outra empresa paga ou recebe a baixa.');
  }

  const isPagar = String(titulo.tipo || '').toUpperCase() === 'PAGAR';
  return {
    intercompany_group_id: payload.intercompany_group_id || `IC-BAIXA-${crypto.randomUUID()}`,
    empresa_origem_id: isPagar ? Number(empresaBaixaId) : Number(empresaTituloId),
    empresa_destino_id: isPagar ? Number(empresaTituloId) : Number(empresaBaixaId),
    tipo_intercompany: tipoIntercompany,
    motivo_intercompany: payload.motivo_intercompany || null,
    elimina_consolidado: naturezaFields
      ? naturezaFields.elimina_consolidado
      : payload.elimina_consolidado !== false,
    transferencia_interna: naturezaFields
      ? naturezaFields.transferencia_interna
      : payload.transferencia_interna !== false
  };
}

async function carregarTituloPorId(req, tituloId, { includeMovimentos = false } = {}) {
  await assertFinanceAccess(req);

  const titulo = await TituloFinanceiro.findByPk(tituloId, {
    include: buildTituloInclude({ includeMovimentos })
  });

  if (!titulo) {
    throw createHttpError(404, 'Titulo financeiro nao encontrado');
  }

  await assertObraScope(
    req,
    titulo.obra_id,
    'TITULO_FINANCEIRO',
    titulo.id,
    'Usuario tentou acessar titulo financeiro fora do seu escopo de obra'
  );

  return titulo;
}

async function carregarTituloParaBaixaComLock(req, tituloId, transaction, options = {}) {
  if (!options.autorizadoPorFilaPagamento) {
    await assertFinanceAccess(req);
  }

  const titulo = await TituloFinanceiro.findByPk(tituloId, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  if (!titulo) {
    throw createHttpError(404, 'Titulo financeiro nao encontrado');
  }
  assertTituloDisponivelParaBaixa(titulo);

  if (!options.autorizadoPorFilaPagamento) {
    await assertObraScope(
      req,
      titulo.obra_id,
      'TITULO_FINANCEIRO',
      titulo.id,
      'Usuario tentou acessar titulo financeiro fora do seu escopo de obra'
    );
  }

  return titulo;
}

function assertTituloEditavel(titulo) {
  const status = String(titulo?.status || '').trim().toUpperCase();
  const valorBaixado = Number(titulo?.valor_baixado || 0);
  const movimentosAtivos = Array.isArray(titulo?.movimentos)
    ? titulo.movimentos.filter((item) => String(item?.status || '').trim().toUpperCase() === 'ATIVO')
    : [];
  const paymentIntentsAtivos = Array.isArray(titulo?.paymentIntents)
    ? titulo.paymentIntents.filter((intent) => {
        const intentStatus = String(intent?.status || '').trim().toUpperCase();
        return !PAYMENT_INTENT_INACTIVE_STATUSES.includes(intentStatus);
      })
    : [];

  if (!STATUS_TITULO_EDITAVEL.includes(status)) {
    throw createHttpError(400, 'Somente titulos em aberto ou previsao podem ser editados.');
  }

  if (valorBaixado > 0 || movimentosAtivos.length > 0) {
    throw createHttpError(400, 'Titulo com baixa registrada nao pode ser editado. Estorne a baixa antes de corrigir o lancamento.');
  }

  if (paymentIntentsAtivos.length > 0) {
    throw createHttpError(400, 'Titulo com pagamento em massa vinculado nao pode ser editado. Cancele ou rejeite o pagamento antes de corrigir o lancamento.');
  }
}

async function atualizarTitulo(req, tituloId, payload = {}) {
  await assertFinanceAccess(req);

  const titulo = await carregarTituloPorId(req, tituloId, { includeMovimentos: true });
  assertTituloEditavel(titulo);

  const tipo = normalizarTipoTitulo(payload.tipo || titulo.tipo);
  if (!['PAGAR', 'RECEBER'].includes(tipo)) {
    throw createHttpError(400, 'Tipo de titulo invalido.');
  }
  const statusTitulo = normalizarStatusTituloInicial(payload.status || titulo.status);

  const obraId = Number(payload.obra_id);
  if (!Number.isInteger(obraId) || obraId <= 0) {
    throw createHttpError(400, 'Obra/Centro de custo e obrigatorio para editar o titulo.');
  }

  const parceiroId = Number(payload.parceiro_id);
  if (!Number.isInteger(parceiroId) || parceiroId <= 0) {
    throw createHttpError(400, 'Parceiro e obrigatorio para editar o titulo.');
  }

  const valorOriginal = toCurrencyNumber(payload.valor);
  if (!Number.isFinite(valorOriginal) || valorOriginal <= 0) {
    throw createHttpError(400, 'Valor invalido para editar o titulo.');
  }

  const descricao = String(payload.descricao || '').trim();
  if (!descricao) {
    throw createHttpError(400, 'Descricao e obrigatoria para editar o titulo.');
  }

  if (titulo.fatura_cartao_id && roundCurrency(valorOriginal) !== roundCurrency(titulo.valor_original)) {
    throw createHttpError(
      400,
      'Titulo vinculado a fatura de cartao nao permite alterar valor por esta tela. Ajuste a fatura ou cancele o lancamento de origem.'
    );
  }

  if (statusTitulo === 'PREVISAO' && titulo.fatura_cartao_id) {
    throw createHttpError(400, 'Titulo vinculado a fatura de cartao nao pode ser convertido para previsao.');
  }

  const [obra, parceiro, categoria] = await Promise.all([
    validarObraTitulo(req, obraId),
    validarParceiro(parceiroId),
    validarCategoriaFinanceira(payload.categoria_financeira_id, tipo)
  ]);
  const empresaTituloId = resolverEmpresaTitulo({
    empresaIdInformada: payload.empresa_id,
    obra
  });
  await validarEmpresaGrupo(empresaTituloId);
  const apropriacao = await validarApropriacaoTitulo(payload.apropriacao_id, obra.id);

  validarCompatibilidadeParceiroTitulo(parceiro, tipo);
  validarCategoriaDreTitulo(categoria, payload);
  const intercompanyFields = await validarIntercompanyTitulo(payload);
  const competenciaData = resolverCompetenciaTitulo(payload);
  const atualizarImpostos = Array.isArray(payload.impostos);
  const atualizarRateios = Array.isArray(payload.rateios);
  const impostosResumo = atualizarImpostos
    ? normalizarImpostosTitulo(payload, valorOriginal)
    : {
        valorBruto: roundCurrency(payload.valor_bruto || titulo.valor_bruto || valorOriginal),
        valorImpostos: roundCurrency(payload.valor_impostos || titulo.valor_impostos || 0),
        valorLiquido: roundCurrency(payload.valor_liquido || titulo.valor_liquido || valorOriginal),
        impostos: []
      };
  const rateiosTitulo = atualizarRateios
    ? await normalizarRateiosTitulo(req, payload, obra, apropriacao, valorOriginal)
    : [];
  const valorLiquidoTitulo = impostosResumo.valorLiquido;

  const antes = {
    tipo: titulo.tipo,
    empresa_id: titulo.empresa_id,
    obra_id: titulo.obra_id,
    apropriacao_id: titulo.apropriacao_id,
    parceiro_id: titulo.parceiro_id,
    categoria_financeira_id: titulo.categoria_financeira_id,
    status: titulo.status,
    valor_original: roundCurrency(titulo.valor_original),
    data_vencimento: titulo.data_vencimento,
    competencia_data: titulo.competencia_data,
    considera_dre: titulo.considera_dre,
    intercompany: titulo.intercompany
  };

  await titulo.update({
    obra_id: obra.id,
    apropriacao_id: apropriacao?.id || null,
    empresa_id: empresaTituloId,
    ...intercompanyFields,
    parceiro_id: parceiro.id,
    categoria_financeira_id: categoria?.id || null,
    tipo,
    status: statusTitulo,
    descricao,
    numero_documento: payload.numero_documento || null,
    valor_original: valorLiquidoTitulo,
    valor_bruto: impostosResumo.valorBruto,
    valor_impostos: impostosResumo.valorImpostos,
    valor_liquido: impostosResumo.valorLiquido,
    valor_saldo: valorLiquidoTitulo,
    valor_baixado: 0,
    possui_rateio: atualizarRateios ? rateiosTitulo.length > 0 : Boolean(titulo.possui_rateio),
    data_emissao: payload.data_emissao || null,
    data_vencimento: payload.data_vencimento,
    data_quitacao: null,
    competencia_data: competenciaData,
    considera_dre: payload.considera_dre !== false,
    observacoes: payload.observacoes || null,
    ...buildCobrancaFields(payload, tipo),
    atualizado_por: req.user?.id || null
  });

  if (atualizarRateios) {
    await TituloFinanceiroRateio.destroy({
      where: { titulo_financeiro_id: titulo.id }
    });
  }

  if (atualizarImpostos) {
    await TituloFinanceiroImposto.destroy({
      where: { titulo_financeiro_id: titulo.id }
    });
  }

  if (atualizarRateios || atualizarImpostos) {
    await gravarComplementosTitulo({
      titulo,
      rateios: rateiosTitulo,
      impostos: impostosResumo.impostos,
      valorBase: valorOriginal,
      valorParcela: valorOriginal,
      valorRateioParcela: valorLiquidoTitulo,
      usuarioId: req.user?.id || null
    });
  }

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'FINANCIAL_TITLE_UPDATED',
    recursoTipo: 'TITULO_FINANCEIRO',
    recursoId: titulo.id,
    status: 'SUCCESS',
    descricao: 'Titulo financeiro editado antes da baixa',
    metadata: {
      antes,
      depois: {
        tipo,
        empresa_id: empresaTituloId,
        obra_id: obra.id,
        apropriacao_id: apropriacao?.id || null,
        parceiro_id: parceiro.id,
        categoria_financeira_id: categoria?.id || null,
        status: statusTitulo,
        valor_original: valorLiquidoTitulo,
        valor_bruto: impostosResumo.valorBruto,
        valor_impostos: impostosResumo.valorImpostos,
        valor_liquido: impostosResumo.valorLiquido,
        possui_rateio: atualizarRateios ? rateiosTitulo.length > 0 : Boolean(titulo.possui_rateio),
        data_vencimento: payload.data_vencimento,
        competencia_data: competenciaData,
        considera_dre: payload.considera_dre !== false,
        intercompany: Boolean(intercompanyFields.intercompany)
      }
    }
  });

  return carregarTituloPorId(req, titulo.id, { includeMovimentos: true });
}

async function listarTitulos(req, filters = {}) {
  await assertFinanceAccess(req);

  const where = {};
  const obraFiltro = Number(filters.obra_id);
  const obrasPermitidas = await getFinanceiroObraScopeIds(req.user);
  const paginated = ['1', 'true', 'sim'].includes(String(filters.paginated || '').trim().toLowerCase());
  const emptyPaginatedResult = () => ({
    data: [],
    pagination: {
      page: 1,
      limit: 0,
      total: 0,
      total_pages: 0
    }
  });

  if (obrasPermitidas === null) {
    if (obraFiltro) {
      where.obra_id = obraFiltro;
    }
  } else if (obrasPermitidas.length > 0) {
    if (obraFiltro && !obrasPermitidas.includes(obraFiltro)) {
      await assertObraScope(
        req,
        obraFiltro,
        'TITULO_FINANCEIRO',
        null,
        'Usuario tentou listar titulos financeiros de obra fora do seu escopo'
      );
    }

    where.obra_id = obraFiltro || { [Op.in]: obrasPermitidas };
  } else {
    if (obraFiltro) {
      await assertObraScope(
        req,
        obraFiltro,
        'TITULO_FINANCEIRO',
        null,
        'Usuario tentou listar titulos financeiros sem vinculo de obra'
      );
    }
    return paginated ? emptyPaginatedResult() : [];
  }

  if (filters.tipo) {
    where.tipo = filters.tipo;
  }
  if (filters.status) {
    const statusFilter = resolveTituloStatusFilter(filters.status);
    where.status = statusFilter.statuses.length === 1
      ? statusFilter.statuses[0]
      : { [Op.in]: statusFilter.statuses };

    if (statusFilter.vencido) {
      where[Op.and] = [
        ...(Array.isArray(where[Op.and]) ? where[Op.and] : []),
        { data_vencimento: { [Op.lt]: getHoje() } },
        { valor_saldo: { [Op.gt]: 0 } }
      ];
    }
  }
  if (filters.codigo) {
    where[Op.and] = [
      ...(Array.isArray(where[Op.and]) ? where[Op.and] : []),
      { [Op.or]: buildTituloCodigoSearchConditions(filters.codigo) }
    ];
  }
  if (filters.empresa_id) {
    where.empresa_id = Number(filters.empresa_id);
  }
  if (filters.numero_documento) {
    where.numero_documento = { [Op.like]: `%${filters.numero_documento}%` };
  }
  if (filters.descricao) {
    where.descricao = { [Op.like]: `%${filters.descricao}%` };
  }
  if (filters.parceiro_id) {
    const parceiroId = Number(filters.parceiro_id);
    const solicitacoesContratuais = await obterSolicitacoesContratuaisPorParceiros([parceiroId]);

    // A previsao nasce vinculada ao contratado, mas a aprovacao da medicao troca corretamente o
    // credor financeiro pelo favorecido que efetivamente recebera. O filtro por credor deve manter
    // a trilha completa do contrato sem desfazer essa troca: encontra o titulo tanto pelo recebedor
    // atual quanto pelo vinculo contratual de origem. `origem_titulo` impede trazer outro titulo
    // eventual que por acaso esteja na mesma solicitacao.
    where[Op.and] = [
      ...(Array.isArray(where[Op.and]) ? where[Op.and] : []),
      {
        [Op.or]: [
          { parceiro_id: parceiroId },
          ...(solicitacoesContratuais.length > 0 ? [{
            origem_titulo: 'CONTRATO',
            solicitacao_id: { [Op.in]: solicitacoesContratuais }
          }] : [])
        ]
      }
    ];
  }
  if (filters.categoria_financeira_id) {
    where.categoria_financeira_id = Number(filters.categoria_financeira_id);
  }
  if (filters.forma_pagamento_id) {
    where.forma_pagamento_id = Number(filters.forma_pagamento_id);
  }
  if (filters.cartao_id) {
    where.cartao_id = Number(filters.cartao_id);
  }
  if (filters.solicitacao_id) {
    where.solicitacao_id = Number(filters.solicitacao_id);
  }
  const valorMinimo = parseCurrencyFilter(filters.valor_min, 'Valor mínimo');
  const valorMaximo = parseCurrencyFilter(filters.valor_max, 'Valor máximo');
  if (valorMinimo !== null && valorMaximo !== null && valorMinimo > valorMaximo) {
    throw createHttpError(400, 'O valor mínimo não pode ser maior que o valor máximo.');
  }
  if (valorMinimo !== null || valorMaximo !== null) {
    where.valor_original = {};
    if (valorMinimo !== null) where.valor_original[Op.gte] = valorMinimo;
    if (valorMaximo !== null) where.valor_original[Op.lte] = valorMaximo;
  }
  if (filters.data_emissao_inicial || filters.data_emissao_final) {
    where.data_emissao = {};
    if (filters.data_emissao_inicial) {
      where.data_emissao[Op.gte] = filters.data_emissao_inicial;
    }
    if (filters.data_emissao_final) {
      where.data_emissao[Op.lte] = filters.data_emissao_final;
    }
  }
  if (filters.vencimento_inicial || filters.vencimento_final) {
    where.data_vencimento = {};
    if (filters.vencimento_inicial) {
      where.data_vencimento[Op.gte] = filters.vencimento_inicial;
    }
    if (filters.vencimento_final) {
      where.data_vencimento[Op.lte] = filters.vencimento_final;
    }
  }
  if (filters.q) {
    const term = String(filters.q).trim();
    const parceirosContratuais = term
      ? await Parceiro.findAll({
        where: {
          [Op.or]: [
            { nome: { [Op.like]: `%${term}%` } },
            { cpf_cnpj: { [Op.like]: `%${term}%` } }
          ]
        },
        attributes: ['id']
      })
      : [];
    const solicitacoesContratuais = await obterSolicitacoesContratuaisPorParceiros(
      parceirosContratuais.map((parceiro) => parceiro.id)
    );
    where[Op.or] = [
      ...buildTituloCodigoSearchConditions(term),
      { descricao: { [Op.like]: `%${term}%` } },
      { numero_documento: { [Op.like]: `%${term}%` } },
      { '$parceiro.nome$': { [Op.like]: `%${term}%` } },
      { '$parceiro.cpf_cnpj$': { [Op.like]: `%${term}%` } },
      { '$obra.nome$': { [Op.like]: `%${term}%` } },
      { '$obra.codigo$': { [Op.like]: `%${term}%` } },
      { '$solicitacao.codigo$': { [Op.like]: `%${term}%` } },
      ...(solicitacoesContratuais.length > 0 ? [{
        origem_titulo: 'CONTRATO',
        solicitacao_id: { [Op.in]: solicitacoesContratuais }
      }] : [])
    ];
  }

  const queryOptions = {
    where,
    include: buildTituloInclude(),
    order: [
      ['data_vencimento', 'ASC'],
      ['createdAt', 'DESC']
    ],
    distinct: true,
    subQuery: false
  };

  if (paginated) {
    const rawLimit = String(filters.limit || '25').trim().toLowerCase();
    const listAll = rawLimit === 'all' || rawLimit === 'todos';
    const pageSize = listAll ? null : Math.min(Math.max(Number(rawLimit) || 25, 1), 500);
    const page = Math.max(Number(filters.page) || 1, 1);
    const result = await TituloFinanceiro.findAndCountAll({
      ...queryOptions,
      ...(listAll ? {} : {
        limit: pageSize,
        offset: (page - 1) * pageSize
      })
    });

    return {
      data: result.rows,
      pagination: {
        page,
        limit: listAll ? 'all' : pageSize,
        total: result.count,
        total_pages: listAll ? 1 : Math.max(Math.ceil(result.count / pageSize), 1)
      }
    };
  }

  return TituloFinanceiro.findAll(queryOptions);
}

async function listarBaixasRealizadas(req, filters = {}) {
  await assertFinanceAccess(req);

  const obrasPermitidas = await getFinanceiroObraScopeIds(req.user);
  const obraFiltro = Number(filters.obra_id);
  const tituloWhere = {};
  const movimentoWhere = {
    tipo_movimento: 'BAIXA'
  };

  if (obrasPermitidas === null) {
    if (obraFiltro) {
      tituloWhere.obra_id = obraFiltro;
    }
  } else if (obrasPermitidas.length > 0) {
    if (obraFiltro && !obrasPermitidas.includes(obraFiltro)) {
      await assertObraScope(
        req,
        obraFiltro,
        'MOVIMENTO_FINANCEIRO',
        null,
        'Usuario tentou listar baixas financeiras de obra fora do seu escopo'
      );
    }

    tituloWhere.obra_id = obraFiltro || { [Op.in]: obrasPermitidas };
  } else {
    if (obraFiltro) {
      await assertObraScope(
        req,
        obraFiltro,
        'MOVIMENTO_FINANCEIRO',
        null,
        'Usuario tentou listar baixas financeiras sem vinculo de obra'
      );
    }
    return [];
  }

  if (filters.tipo) {
    tituloWhere.tipo = filters.tipo;
  }
  if (filters.parceiro_id) {
    tituloWhere.parceiro_id = Number(filters.parceiro_id);
  }
  if (filters.categoria_financeira_id) {
    tituloWhere.categoria_financeira_id = Number(filters.categoria_financeira_id);
  }
  if (filters.conta_bancaria_id) {
    movimentoWhere.conta_bancaria_id = Number(filters.conta_bancaria_id);
  }

  const statusMovimento = String(filters.status_movimento || 'ATIVO').toUpperCase();
  if (statusMovimento && statusMovimento !== 'TODOS') {
    movimentoWhere.status = statusMovimento;
  }

  if (filters.data_inicial || filters.data_final) {
    movimentoWhere.data_movimento = {};
    if (filters.data_inicial) {
      movimentoWhere.data_movimento[Op.gte] = filters.data_inicial;
    }
    if (filters.data_final) {
      movimentoWhere.data_movimento[Op.lte] = filters.data_final;
    }
  }

  if (filters.q) {
    const term = String(filters.q).trim();
    movimentoWhere[Op.or] = [
      { documento_referencia: { [Op.like]: `%${term}%` } },
      { observacoes: { [Op.like]: `%${term}%` } },
      { '$titulo.codigo$': { [Op.like]: `%${term}%` } },
      { '$titulo.descricao$': { [Op.like]: `%${term}%` } },
      { '$titulo.numero_documento$': { [Op.like]: `%${term}%` } },
      { '$titulo.parceiro.nome$': { [Op.like]: `%${term}%` } },
      { '$titulo.parceiro.cpf_cnpj$': { [Op.like]: `%${term}%` } },
      { '$titulo.obra.nome$': { [Op.like]: `%${term}%` } },
      { '$titulo.obra.codigo$': { [Op.like]: `%${term}%` } }
    ];
  }

  return MovimentoFinanceiro.findAll({
    where: movimentoWhere,
    include: [
      {
        model: TituloFinanceiro,
        as: 'titulo',
        required: true,
        where: tituloWhere,
        include: [
          {
            model: Obra,
            as: 'obra',
            attributes: ['id', 'nome', 'codigo', 'empresa_grupo_id']
          },
          {
            model: Parceiro,
            as: 'parceiro',
            attributes: ['id', 'nome', 'cpf_cnpj']
          },
          {
            model: CategoriaFinanceira,
            as: 'categoriaFinanceira',
            attributes: ['id', 'nome', 'tipo']
          }
        ]
      },
      {
        model: ContaBancaria,
        as: 'contaBancaria',
        attributes: ['id', 'nome', 'banco', 'agencia', 'conta']
      },
      {
        model: User,
        as: 'criadoPor',
        attributes: ['id', 'nome', 'email']
      },
      {
        model: User,
        as: 'estornadoPor',
        attributes: ['id', 'nome', 'email']
      }
    ],
    order: [
      ['data_movimento', 'DESC'],
      ['createdAt', 'DESC']
    ],
    limit: Number(filters.limit || 200),
    subQuery: false
  });
}

async function listarTitulosPorSolicitacao(req, solicitacaoId) {
  const acessoFinanceiroCompleto = await canAccessFinanceiro(req.user);
  if (!acessoFinanceiroCompleto && !(await canViewSolicitacaoFinanceiro(req.user))) {
    await registrarEventoSeguranca({
      req,
      usuarioId: req.user?.id || null,
      tipoEvento: 'AUTHZ_DENIED',
      recursoTipo: 'SOLICITACAO_FINANCEIRO',
      recursoId: String(solicitacaoId),
      status: 'DENIED',
      descricao: 'Usuario sem permissao para visualizar a aba financeira da solicitacao'
    });
    throw createHttpError(403, 'Acesso negado para a aba financeira da solicitacao');
  }

  const solicitacao = await carregarSolicitacaoFinanceira(req, solicitacaoId);

  const consulta = {
    where: {
      solicitacao_id: solicitacao.id
    },
    order: [
      ['data_vencimento', 'ASC'],
      ['createdAt', 'DESC']
    ]
  };

  if (acessoFinanceiroCompleto) {
    consulta.include = buildTituloInclude();
  } else {
    // Leitura operacional da Obra: somente o resumo exibido dentro da solicitacao. Dados de banco,
    // documentos, impostos, rateios, integracoes e beneficiarios permanecem restritos ao modulo.
    consulta.attributes = [
      'id',
      'solicitacao_id',
      'tipo',
      'status',
      'descricao',
      'valor_original',
      'valor_baixado',
      'valor_saldo',
      'data_vencimento'
    ];
    consulta.include = [{
      model: Parceiro,
      as: 'parceiro',
      attributes: ['id', 'nome']
    }];
  }

  return TituloFinanceiro.findAll(consulta);
}

async function criarTituloPorSolicitacao(req, solicitacaoId, payload = {}) {
  await assertFinanceAccess(req);
  const solicitacao = await carregarSolicitacaoFinanceira(req, solicitacaoId);
  const recargaAutomatica = await SolicitacaoRecargaCartao.findOne({
    where: { solicitacao_id: solicitacao.id },
    attributes: ['id', 'titulo_financeiro_id']
  });
  if (recargaAutomatica) {
    throw createHttpError(409, 'A Recarga de Cartao ja possui titulo automatico e nao aceita outro lancamento manual.');
  }

  const tipo = normalizarTipoTitulo(payload.tipo || sugestaoTipoTitulo(solicitacao));
  if (!['PAGAR', 'RECEBER'].includes(tipo)) {
    throw createHttpError(400, 'Tipo de titulo invalido.');
  }
  const statusTitulo = normalizarStatusTituloInicial(payload.status);

  const parceiroPadraoId = Number(payload.parceiro_id || solicitacao.parceiro_id);

  const valorSolicitacao = Number(solicitacao.valor != null ? solicitacao.valor : payload.valor);
  if (!Number.isFinite(valorSolicitacao) || valorSolicitacao <= 0) {
    throw createHttpError(400, 'Valor invalido para gerar o titulo.');
  }

  const empresaTituloId = resolverEmpresaTitulo({
    empresaIdInformada: payload.empresa_id,
    obra: solicitacao.obra
  });

  const [, categoriaPadrao] = await Promise.all([
    validarEmpresaGrupo(empresaTituloId),
    validarCategoriaFinanceira(payload.categoria_financeira_id, tipo)
  ]);
  validarCategoriaDreTitulo(categoriaPadrao, payload);
  const intercompanyFieldsPadrao = await validarIntercompanyTitulo(payload);

  const pagamentosPayload = Array.isArray(payload.pagamentos) && payload.pagamentos.length > 0
    ? payload.pagamentos
    : [payload];

  const pagamentos = [];
  for (const [pagamentoIndex, pagamentoPayload] of pagamentosPayload.entries()) {
    const parceiroIdPagamento = Number(pagamentoPayload.parceiro_id || parceiroPadraoId);
    if (!Number.isInteger(parceiroIdPagamento) || parceiroIdPagamento <= 0) {
      throw createHttpError(400, `Parceiro e obrigatorio para o titulo ${pagamentoIndex + 1}.`);
    }
    const parceiroPagamento = await validarParceiro(parceiroIdPagamento);
    validarCompatibilidadeParceiroTitulo(parceiroPagamento, tipo);
    const beneficiaryId = Number(pagamentoPayload.payment_beneficiary_id || 0);
    let paymentBeneficiary = null;
    if (beneficiaryId > 0) {
      paymentBeneficiary = await PaymentBeneficiary.findOne({
        where: {
          id: beneficiaryId,
          parceiro_id: parceiroIdPagamento,
          ativo: true
        }
      });
      if (!paymentBeneficiary) {
        throw createHttpError(400, `Favorecido PIX invalido para o titulo ${pagamentoIndex + 1}.`);
      }
    }
    const categoriaPagamento = pagamentoPayload.categoria_financeira_id
      ? await validarCategoriaFinanceira(pagamentoPayload.categoria_financeira_id, tipo)
      : categoriaPadrao;
    validarCategoriaDreTitulo(categoriaPagamento, { ...payload, ...pagamentoPayload });
    const formaPagamento = await validarFormaPagamentoFinanceira(pagamentoPayload.forma_pagamento_id, pagamentoPayload);
    const intercompanyFields = await resolverIntercompanyPagamento({
      formaPagamento,
      pagamentoPayload,
      empresaTituloId,
      tipoTitulo: tipo,
      intercompanyFieldsPadrao
    });
    const quantidadeParcelas = Math.max(
      Number(pagamentoPayload.quantidade_parcelas || pagamentoPayload.parcelas?.length || 1),
      1
    );
    const dataCompra = pagamentoPayload.data_compra || payload.data_compra || payload.data_emissao || getHoje();
    const dataVencimento = pagamentoPayload.data_vencimento || payload.data_vencimento || solicitacao.data_vencimento;
    const parcelas = Array.isArray(pagamentoPayload.parcelas) ? pagamentoPayload.parcelas : [];
    const valorPagamentoInformado = pagamentoPayload.valor != null
      ? Number(pagamentoPayload.valor)
      : pagamentosPayload.length === 1
        ? valorSolicitacao
        : undefined;
    const valoresParcelas = getValoresParcelas({
      valorTotal: valorPagamentoInformado,
      quantidade: quantidadeParcelas,
      parcelas,
      contexto: `pagamento ${pagamentoIndex + 1}`
    });
    const totalPagamento = somarValores(valoresParcelas);

    if (valorPagamentoInformado != null) {
      assertValoresIguais({
        atual: totalPagamento,
        esperado: valorPagamentoInformado,
        mensagem: `A soma das parcelas do pagamento ${pagamentoIndex + 1} deve bater com o valor informado para ele.`
      });
    }

    pagamentos.push({
      parceiro: parceiroPagamento,
      paymentBeneficiary,
      categoria: categoriaPagamento,
      formaPagamento,
      intercompanyFields,
      payload: pagamentoPayload,
      quantidadeParcelas,
      valoresParcelas,
      totalPagamento,
      dataCompra,
      dataVencimento,
      grupoParcelamentoId: quantidadeParcelas > 1 ? `PARC-${crypto.randomUUID()}` : null
    });
  }

  const valorOriginal = somarValores(pagamentos.map((pagamento) => pagamento.totalPagamento));
  assertValoresIguais({
    atual: valorOriginal,
    esperado: valorSolicitacao,
    mensagem: 'A soma dos titulos gerados precisa bater com o valor da solicitacao.'
  });

  const impostosResumo = normalizarImpostosTitulo(payload, valorOriginal);
  const rateiosTitulo = await normalizarRateiosTitulo(
    req,
    payload,
    solicitacao.obra,
    null,
    valorOriginal
  );
  const descricaoBase = String(payload.descricao || descricaoPadraoTitulo(solicitacao)).trim();

  const transaction = await sequelize.transaction();
  const titulosCriados = [];
  const baixasCartaoNoAto = [];
  try {
    for (const [pagamentoIndex, pagamento] of pagamentos.entries()) {
      for (let index = 0; index < pagamento.quantidadeParcelas; index += 1) {
        const numeroParcela = index + 1;
        const valorParcela = pagamento.valoresParcelas[index];
        const parcelaPayload = getParcelaPayload(pagamento.payload.parcelas, index);
        const vencimentoParcela = resolveVencimentoParcela({
          formaPagamento: pagamento.formaPagamento,
          parcela: parcelaPayload,
          dataVencimentoBase: pagamento.dataVencimento,
          dataCompra: pagamento.dataCompra,
          index
        });
        const totalParcelasDoGrupo = pagamento.quantidadeParcelas;
        const prefixoForma = pagamentos.length > 1 ? `Forma ${pagamentoIndex + 1} - ` : '';
        const descricaoParcela = totalParcelasDoGrupo > 1
          ? `${prefixoForma}${descricaoBase}`.slice(0, 205) + ` - Parcela ${numeroParcela}/${totalParcelasDoGrupo}`
          : `${prefixoForma}${descricaoBase}`.slice(0, 255);
        const valoresParcela = calcularValoresParcelaComImpostos(impostosResumo, valorParcela, valorOriginal);
        const chequeFields = buildChequeFields(pagamento.formaPagamento, parcelaPayload, index);
        const cobrancaPayload = {
          ...payload,
          forma_cobranca: parcelaPayload.forma_cobranca || pagamento.payload.forma_cobranca || payload.forma_cobranca,
          banco_cobranca: parcelaPayload.banco_cobranca || pagamento.payload.banco_cobranca || payload.banco_cobranca,
          linha_digitavel: parcelaPayload.linha_digitavel || pagamento.payload.linha_digitavel || payload.linha_digitavel,
          codigo_barras: parcelaPayload.codigo_barras || pagamento.payload.codigo_barras || payload.codigo_barras
        };

        const titulo = await TituloFinanceiro.create({
          solicitacao_id: solicitacao.id,
          obra_id: solicitacao.obra_id,
          apropriacao_id: solicitacao.apropriacao_id || null,
          empresa_id: empresaTituloId,
          ...pagamento.intercompanyFields,
          parceiro_id: pagamento.parceiro.id,
          payment_beneficiary_id: pagamento.paymentBeneficiary?.id || null,
          categoria_financeira_id: pagamento.categoria?.id || categoriaPadrao?.id || null,
          forma_pagamento_id: pagamento.formaPagamento?.id || null,
          cartao_id: pagamento.payload.cartao_id || null,
          grupo_parcelamento_id: pagamento.grupoParcelamentoId,
          numero_parcela: totalParcelasDoGrupo > 1 ? numeroParcela : null,
          total_parcelas: totalParcelasDoGrupo > 1 ? totalParcelasDoGrupo : null,
          data_compra: pagamento.dataCompra,
          competencia_data: resolverCompetenciaCriacaoTitulo(),
          considera_dre: pagamento.payload.considera_dre !== false,
          origem_titulo: 'SOLICITACAO',
          tipo,
          status: statusTitulo,
          descricao: descricaoParcela || descricaoPadraoTitulo(solicitacao),
          numero_documento: parcelaPayload.numero_documento || pagamento.payload.numero_documento || payload.numero_documento || chequeFields.cheque_numero || null,
          ...chequeFields,
          valor_original: valoresParcela.valorLiquido,
          valor_bruto: valoresParcela.valorBruto,
          valor_impostos: valoresParcela.valorImpostos,
          valor_liquido: valoresParcela.valorLiquido,
          possui_rateio: rateiosTitulo.length > 0,
          valor_saldo: valoresParcela.valorLiquido,
          valor_baixado: 0,
          data_emissao: payload.data_emissao || getHoje(),
          data_vencimento: vencimentoParcela,
          data_quitacao: null,
          observacoes: parcelaPayload.observacoes || pagamento.payload.observacoes || payload.observacoes || null,
          ...buildCobrancaFields(cobrancaPayload, tipo),
          criado_por: req.user?.id || null,
          atualizado_por: req.user?.id || null
        }, { transaction });

        await gravarComplementosTitulo({
          titulo,
          rateios: rateiosTitulo,
          impostos: impostosResumo.impostos,
          valorBase: valorOriginal,
          valorParcela,
          valorRateioParcela: valoresParcela.valorLiquido,
          usuarioId: req.user?.id || null,
          transaction
        });

        if (statusTitulo !== 'PREVISAO' && pagamento.formaPagamento?.gera_fatura && pagamento.payload.cartao_id) {
          const { fatura } = await obterOuCriarFaturaCartao({
            cartaoId: pagamento.payload.cartao_id,
            dataCompra: pagamento.dataCompra,
            parcelaOffset: index,
            usuarioId: req.user?.id || null,
            transaction
          });
          await vincularTituloAFatura({ titulo, fatura, transaction });
        }

        const baixaCartaoNoAto = statusTitulo === 'PREVISAO'
          ? null
          : await baixarTituloCartaoNoAto({
            req,
            titulo,
            formaPagamento: pagamento.formaPagamento,
            pagamentoPayload: pagamento.payload,
            dataMovimento: pagamento.dataCompra,
            transaction
          });
        if (baixaCartaoNoAto) {
          baixasCartaoNoAto.push(baixaCartaoNoAto);
        }

        titulosCriados.push(titulo);
      }
    }

    await Historico.create({
      solicitacao_id: solicitacao.id,
      usuario_responsavel_id: req.user?.id || null,
      setor: getSetorUsuario(req),
      acao: 'TITULO_FINANCEIRO_CRIADO',
      observacao: `${titulosCriados.length} titulo(s) ${tipo} gerado(s) no valor de ${formatCurrency(valorOriginal)}`
    }, { transaction });

    await marcarSolicitacaoComTituloCadastrado({
      solicitacao,
      usuarioId: req.user?.id || null,
      setor: getSetorUsuario(req),
      transaction
    });

    await transaction.commit();

    const tituloCompleto = await carregarTituloPorId(req, titulosCriados[0].id);
    if (titulosCriados.length > 1) {
      tituloCompleto.setDataValue('parcelas_geradas', titulosCriados.map((titulo) => titulo.id));
    }

    await registrarEventoSeguranca({
      req,
      usuarioId: req.user?.id || null,
      tipoEvento: 'FINANCIAL_TITLE_CREATED',
      recursoTipo: 'TITULO_FINANCEIRO',
      recursoId: titulosCriados[0]?.id || null,
      status: 'SUCCESS',
      descricao: titulosCriados.length > 1 ? 'Titulos financeiros gerados a partir da solicitacao' : 'Titulo financeiro gerado a partir da solicitacao',
      metadata: {
        solicitacao_id: solicitacao.id,
        obra_id: solicitacao.obra_id,
        parceiro_id: titulosCriados[0]?.parceiro_id || parceiroPadraoId || null,
        tipo,
        valor_original: valorOriginal,
        quantidade_titulos: titulosCriados.length,
        pagamentos: pagamentos.map((pagamento) => ({
          valor: pagamento.totalPagamento,
          parceiro_id: pagamento.parceiro.id,
          payment_beneficiary_id: pagamento.paymentBeneficiary?.id || null,
          quantidade_parcelas: pagamento.quantidadeParcelas,
          grupo_parcelamento_id: pagamento.grupoParcelamentoId,
          forma_pagamento_id: pagamento.formaPagamento?.id || null,
          cartao_id: pagamento.payload.cartao_id || null
        }))
      }
    });

    if (baixasCartaoNoAto.length > 0) {
      await registrarEventoSeguranca({
        req,
        usuarioId: req.user?.id || null,
        tipoEvento: 'FINANCIAL_CARD_SETTLED_ON_CREATE',
        recursoTipo: 'TITULO_FINANCEIRO',
        recursoId: titulosCriados[0]?.id || null,
        status: 'SUCCESS',
        descricao: 'Titulo financeiro baixado automaticamente por cartao no ato da criacao',
        metadata: {
          origem: 'SOLICITACAO',
          quantidade_movimentos: baixasCartaoNoAto.length,
          movimentos: baixasCartaoNoAto.map((baixa) => ({
            movimento_id: baixa.movimento.id,
            cartao_id: baixa.cartao.id,
            tipo_cartao: baixa.tipoCartao,
            conta_bancaria_id: baixa.conta.id,
            valor: baixa.valorBaixa,
            data_movimento: baixa.dataBaixa
          }))
        }
      });
    }

    return tituloCompleto;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function criarTituloManual(req, payload = {}, options = {}) {
  const {
    transaction: externalTransaction = null,
    origemTitulo = 'MANUAL',
    registrarSeguranca = true,
    retornarTitulosCriados = false,
    // Uso interno (aprovacao de contrato): o chamador ja impos permissao ESTRITA propria,
    // mais forte que o acesso ao modulo financeiro. Sem isto, ADMIN/USUARIO com a permissao
    // de aprovar eram barrados aqui — regressao apontada em auditoria.
    pularAcessoFinanceiro = false,
    // Uso interno dos titulos automaticos de contrato/aditivo. A forma "Cartao" descreve como o
    // fornecedor recebera; nao significa que um cartao financeiro do cadastro ja foi utilizado.
    dispensarCartaoInstrucional = false,
    // Uso interno do cronograma automatico de contratos. O titulo ainda e PREVISAO e recebe a
    // forma efetiva somente na aprovacao da medicao.
    permitirFormaPagamentoPendente = false
  } = options;
  if (!pularAcessoFinanceiro) await assertFinanceAccess(req);

  const tipo = normalizarTipoTitulo(payload.tipo || 'PAGAR');
  if (!['PAGAR', 'RECEBER'].includes(tipo)) {
    throw createHttpError(400, 'Tipo de titulo invalido.');
  }
  const statusTitulo = normalizarStatusTituloInicial(payload.status);
  const permitirFormaPagamentoPendenteNaPrevisao = Boolean(
    permitirFormaPagamentoPendente
    && statusTitulo === 'PREVISAO'
    && ['CONTRATO', 'PEDIDO_COMPRA'].includes(origemTitulo)
  );

  const obraId = Number(payload.obra_id);
  if (!Number.isInteger(obraId) || obraId <= 0) {
    throw createHttpError(400, 'Obra e obrigatoria para criar o titulo.');
  }

  const parceiroId = Number(payload.parceiro_id);
  if (!Number.isInteger(parceiroId) || parceiroId <= 0) {
    throw createHttpError(400, 'Parceiro e obrigatorio para criar o titulo.');
  }

  const valorOriginal = Number(payload.valor);
  if (!Number.isFinite(valorOriginal) || valorOriginal <= 0) {
    throw createHttpError(400, 'Valor invalido para criar o titulo.');
  }

  const descricao = String(payload.descricao || '').trim();
  if (!descricao) {
    throw createHttpError(400, 'Descricao e obrigatoria para criar o titulo manual.');
  }

  const [obra, parceiro, categoriaPadrao] = await Promise.all([
    validarObraTitulo(req, obraId, { pularEscopoObra: pularAcessoFinanceiro }),
    validarParceiro(parceiroId),
    validarCategoriaFinanceira(payload.categoria_financeira_id, tipo)
  ]);
  const empresaTituloId = resolverEmpresaTitulo({
    empresaIdInformada: payload.empresa_id,
    obra
  });
  await validarEmpresaGrupo(empresaTituloId);
  const apropriacao = await validarApropriacaoTitulo(payload.apropriacao_id, obra.id);

  validarCompatibilidadeParceiroTitulo(parceiro, tipo);
  validarCategoriaDreTitulo(categoriaPadrao, payload);
  const intercompanyFieldsPadrao = await validarIntercompanyTitulo(payload);

  const pagamentosPayload = Array.isArray(payload.pagamentos) && payload.pagamentos.length > 0
    ? payload.pagamentos
    : [payload];

  const pagamentos = [];
  for (const [pagamentoIndex, pagamentoPayload] of pagamentosPayload.entries()) {
    const parceiroPagamentoId = Number(pagamentoPayload.parceiro_id || parceiroId);
    if (!Number.isInteger(parceiroPagamentoId) || parceiroPagamentoId <= 0) {
      throw createHttpError(400, `Parceiro obrigatorio no pagamento ${pagamentoIndex + 1}.`);
    }
    const parceiroPagamento = parceiroPagamentoId === parceiro.id
      ? parceiro
      : await validarParceiro(parceiroPagamentoId);
    validarCompatibilidadeParceiroTitulo(parceiroPagamento, tipo);
    const categoriaPagamento = pagamentoPayload.categoria_financeira_id
      ? await validarCategoriaFinanceira(pagamentoPayload.categoria_financeira_id, tipo)
      : categoriaPadrao;
    validarCategoriaDreTitulo(categoriaPagamento, payload);
    const formaPagamento = await validarFormaPagamentoFinanceira(
      pagamentoPayload.forma_pagamento_id,
      pagamentoPayload,
      {
        dispensarCartaoInstrucional,
        permitirPendente: permitirFormaPagamentoPendenteNaPrevisao
      }
    );
    const intercompanyFields = await resolverIntercompanyPagamento({
      formaPagamento,
      pagamentoPayload,
      empresaTituloId,
      tipoTitulo: tipo,
      intercompanyFieldsPadrao
    });
    const quantidadeParcelas = Math.max(
      Number(pagamentoPayload.quantidade_parcelas || pagamentoPayload.parcelas?.length || 1),
      1
    );
    const dataCompra = pagamentoPayload.data_compra || payload.data_compra || payload.data_emissao || getHoje();
    const dataVencimento = pagamentoPayload.data_vencimento || payload.data_vencimento;
    const parcelas = Array.isArray(pagamentoPayload.parcelas) ? pagamentoPayload.parcelas : [];
    const valorPagamentoInformado = pagamentoPayload.valor != null
      ? Number(pagamentoPayload.valor)
      : pagamentosPayload.length === 1
        ? valorOriginal
        : undefined;
    const valoresParcelas = getValoresParcelas({
      valorTotal: valorPagamentoInformado,
      quantidade: quantidadeParcelas,
      parcelas,
      contexto: `pagamento ${pagamentoIndex + 1}`
    });
    const totalPagamento = somarValores(valoresParcelas);

    if (valorPagamentoInformado != null) {
      assertValoresIguais({
        atual: totalPagamento,
        esperado: valorPagamentoInformado,
        mensagem: `A soma das parcelas do pagamento ${pagamentoIndex + 1} deve bater com o valor informado para ele.`
      });
    }

    pagamentos.push({
      parceiro: parceiroPagamento,
      categoria: categoriaPagamento,
      formaPagamento,
      intercompanyFields,
      payload: pagamentoPayload,
      quantidadeParcelas,
      valoresParcelas,
      totalPagamento,
      dataCompra,
      dataVencimento,
      grupoParcelamentoId: quantidadeParcelas > 1 ? `PARC-${crypto.randomUUID()}` : null
    });
  }

  const valorTotalPagamentos = somarValores(pagamentos.map((pagamento) => pagamento.totalPagamento));
  assertValoresIguais({
    atual: valorTotalPagamentos,
    esperado: valorOriginal,
    mensagem: 'A soma das formas de pagamento precisa bater com o valor do titulo.'
  });

  const impostosResumo = normalizarImpostosTitulo(payload, valorOriginal);
  const rateiosTitulo = await normalizarRateiosTitulo(req, payload, obra, apropriacao, valorOriginal);
  const ownsTransaction = !externalTransaction;
  const transaction = externalTransaction || await sequelize.transaction();
  const titulosCriados = [];
  const baixasCartaoNoAto = [];
  const origemFreteId = Number(payload.origem_frete_id || 0);

  try {
    for (const [pagamentoIndex, pagamento] of pagamentos.entries()) {
      for (let index = 0; index < pagamento.quantidadeParcelas; index += 1) {
        const numeroParcela = index + 1;
        const valorParcela = pagamento.valoresParcelas[index];
        const parcelaPayload = getParcelaPayload(pagamento.payload.parcelas, index);
        const vencimentoParcela = resolveVencimentoParcela({
          formaPagamento: pagamento.formaPagamento,
          parcela: parcelaPayload,
          dataVencimentoBase: pagamento.dataVencimento,
          dataCompra: pagamento.dataCompra,
          index
        });
        const prefixoForma = pagamentos.length > 1 ? `Forma ${pagamentoIndex + 1} - ` : '';
        const descricaoParcela = pagamento.quantidadeParcelas > 1
          ? `${prefixoForma}${descricao}`.slice(0, 205) + ` - Parcela ${numeroParcela}/${pagamento.quantidadeParcelas}`
          : `${prefixoForma}${descricao}`.slice(0, 255);
        const valoresParcela = calcularValoresParcelaComImpostos(impostosResumo, valorParcela, valorOriginal);
        const chequeFields = buildChequeFields(pagamento.formaPagamento, parcelaPayload, index);
        const cobrancaPayload = {
          ...payload,
          forma_cobranca: parcelaPayload.forma_cobranca || pagamento.payload.forma_cobranca || payload.forma_cobranca,
          banco_cobranca: parcelaPayload.banco_cobranca || pagamento.payload.banco_cobranca || payload.banco_cobranca,
          linha_digitavel: parcelaPayload.linha_digitavel || pagamento.payload.linha_digitavel || payload.linha_digitavel,
          codigo_barras: parcelaPayload.codigo_barras || pagamento.payload.codigo_barras || payload.codigo_barras
        };

        const titulo = await TituloFinanceiro.create({
          // ERA FIXO EM `null` — e por isso o titulo do CONTRATO nascia sem a solicitacao dele (24/08).
          //
          // `criarTituloManual` e o caminho de "titulo lancado a mao", e o nome explica o `null`
          // original: nao havia quem chamasse com uma solicitacao. A aprovacao do contrato passou a
          // chamar (PI-16), e o campo continuava sendo descartado em silencio — quem passasse
          // `solicitacao_id` no payload nao recebia erro nenhum, so um titulo sem vinculo.
          //
          // Quem nao informa continua gravando `null`, exatamente como antes.
          solicitacao_id: Number(payload.solicitacao_id) || null,
          obra_id: obra.id,
          apropriacao_id: apropriacao?.id || null,
          empresa_id: empresaTituloId,
          ...pagamento.intercompanyFields,
          parceiro_id: pagamento.parceiro.id,
          categoria_financeira_id: pagamento.categoria?.id || categoriaPadrao?.id || null,
          forma_pagamento_id: pagamento.formaPagamento?.id || null,
          cartao_id: pagamento.payload.cartao_id || null,
          grupo_parcelamento_id: pagamento.grupoParcelamentoId,
          numero_parcela: pagamento.quantidadeParcelas > 1 ? numeroParcela : null,
          total_parcelas: pagamento.quantidadeParcelas > 1 ? pagamento.quantidadeParcelas : null,
          data_compra: pagamento.dataCompra,
          competencia_data: resolverCompetenciaCriacaoTitulo(),
          considera_dre: payload.considera_dre !== false,
          origem_titulo: origemTitulo,
          tipo,
          status: statusTitulo,
          descricao: descricaoParcela || descricaoPadraoTituloManual(tipo),
          numero_documento: parcelaPayload.numero_documento || pagamento.payload.numero_documento || payload.numero_documento || chequeFields.cheque_numero || null,
          ...chequeFields,
          valor_original: valoresParcela.valorLiquido,
          valor_bruto: valoresParcela.valorBruto,
          valor_impostos: valoresParcela.valorImpostos,
          valor_liquido: valoresParcela.valorLiquido,
          possui_rateio: rateiosTitulo.length > 0,
          valor_saldo: valoresParcela.valorLiquido,
          valor_baixado: 0,
          data_emissao: payload.data_emissao || getHoje(),
          data_vencimento: vencimentoParcela,
          data_quitacao: null,
          observacoes: parcelaPayload.observacoes || pagamento.payload.observacoes || payload.observacoes || null,
          ...buildCobrancaFields(cobrancaPayload, tipo),
          criado_por: req.user?.id || null,
          atualizado_por: req.user?.id || null
        }, { transaction });

        await gravarComplementosTitulo({
          titulo,
          rateios: rateiosTitulo,
          impostos: impostosResumo.impostos,
          valorBase: valorOriginal,
          valorParcela,
          valorRateioParcela: valoresParcela.valorLiquido,
          usuarioId: req.user?.id || null,
          transaction
        });

        if (statusTitulo !== 'PREVISAO' && pagamento.formaPagamento?.gera_fatura && pagamento.payload.cartao_id) {
          const { fatura } = await obterOuCriarFaturaCartao({
            cartaoId: pagamento.payload.cartao_id,
            dataCompra: pagamento.dataCompra,
            parcelaOffset: index,
            usuarioId: req.user?.id || null,
            transaction
          });
          await vincularTituloAFatura({ titulo, fatura, transaction });
        }

        const baixaCartaoNoAto = statusTitulo === 'PREVISAO'
          ? null
          : await baixarTituloCartaoNoAto({
            req,
            titulo,
            formaPagamento: pagamento.formaPagamento,
            pagamentoPayload: pagamento.payload,
            dataMovimento: pagamento.dataCompra,
            transaction
          });
        if (baixaCartaoNoAto) {
          baixasCartaoNoAto.push(baixaCartaoNoAto);
        }

        titulosCriados.push(titulo);
      }
    }

    if (origemFreteId) {
      const frete = await PedidoCompraFrete.findOne({
        where: {
          id: origemFreteId,
          tipo: 'TERCEIRO',
          status_financeiro: 'PENDENTE_TITULO',
          titulo_financeiro_id: null
        },
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      if (!frete) {
        throw createHttpError(400, 'Frete do pedido nao encontrado ou ja vinculado a um titulo financeiro.');
      }

      if (tipo !== 'PAGAR') {
        throw createHttpError(400, 'Frete de pedido so pode gerar titulo a pagar.');
      }

      if (roundCurrency(frete.valor_total) !== roundCurrency(valorOriginal)) {
        throw createHttpError(400, 'Valor do titulo precisa ser igual ao valor do frete do pedido.');
      }

      const tituloFrete = titulosCriados[0] || null;
      await frete.update({
        titulo_financeiro_id: tituloFrete?.id || null,
        status_financeiro: 'TITULO_GERADO'
      }, { transaction });

      if (Number(frete.solicitacao_id || 0) > 0 && tituloFrete) {
        const codigoTitulo = tituloFrete.codigo || `#${tituloFrete.id}`;
        const codigoPedido = `PC-${String(frete.pedido_compra_id || '').padStart(5, '0')}`;
        await Historico.create({
          solicitacao_id: frete.solicitacao_id,
          usuario_responsavel_id: req.user?.id || null,
          setor: 'FINANCEIRO',
          acao: 'TITULO_FRETE_GERADO',
          observacao: `Titulo financeiro ${codigoTitulo} gerado para frete do pedido ${codigoPedido}.`,
          descricao: `${codigoTitulo} vinculado ao frete de terceiro no valor de ${formatCurrency(frete.valor_total)}.`,
          metadata: JSON.stringify({
            tipo: 'FRETE_PEDIDO_COMPRA',
            pedido_compra_id: frete.pedido_compra_id,
            solicitacao_compra_id: frete.solicitacao_compra_id,
            frete_id: frete.id,
            titulo_financeiro_id: tituloFrete.id,
            titulo_codigo: tituloFrete.codigo || null,
            valor_total: roundCurrency(frete.valor_total)
          })
        }, { transaction });
      }
    }

    if (ownsTransaction) {
      await transaction.commit();
    }
  } catch (error) {
    if (ownsTransaction) {
      await transaction.rollback();
    }
    throw error;
  }

  if (registrarSeguranca) {
    await registrarEventoSeguranca({
      req,
      usuarioId: req.user?.id || null,
      tipoEvento: 'FINANCIAL_TITLE_CREATED',
      recursoTipo: 'TITULO_FINANCEIRO',
      recursoId: titulosCriados[0]?.id || null,
      status: 'SUCCESS',
      descricao: titulosCriados.length > 1 ? 'Titulos financeiros criados manualmente' : 'Titulo financeiro criado manualmente',
      metadata: {
        origem: origemTitulo,
        origem_frete_id: origemFreteId || null,
        obra_id: obra.id,
        parceiro_id: titulosCriados[0]?.parceiro_id || parceiro.id,
        tipo,
        valor_original: roundCurrency(valorOriginal),
        quantidade_titulos: titulosCriados.length,
        pagamentos: pagamentos.map((pagamento) => ({
          valor: pagamento.totalPagamento,
          parceiro_id: pagamento.parceiro.id,
          quantidade_parcelas: pagamento.quantidadeParcelas,
          grupo_parcelamento_id: pagamento.grupoParcelamentoId,
          forma_pagamento_id: pagamento.formaPagamento?.id || null,
          cartao_id: pagamento.payload.cartao_id || null
        }))
      }
    });

    if (baixasCartaoNoAto.length > 0) {
      await registrarEventoSeguranca({
        req,
        usuarioId: req.user?.id || null,
        tipoEvento: 'FINANCIAL_CARD_SETTLED_ON_CREATE',
        recursoTipo: 'TITULO_FINANCEIRO',
        recursoId: titulosCriados[0]?.id || null,
        status: 'SUCCESS',
        descricao: 'Titulo financeiro baixado automaticamente por cartao no ato da criacao',
        metadata: {
          origem: origemTitulo,
          quantidade_movimentos: baixasCartaoNoAto.length,
          movimentos: baixasCartaoNoAto.map((baixa) => ({
            movimento_id: baixa.movimento.id,
            cartao_id: baixa.cartao.id,
            tipo_cartao: baixa.tipoCartao,
            conta_bancaria_id: baixa.conta.id,
            valor: baixa.valorBaixa,
            data_movimento: baixa.dataBaixa
          }))
        }
      });
    }
  }

  if (retornarTitulosCriados) {
    return {
      titulo: titulosCriados[0] || null,
      titulos: titulosCriados
    };
  }

  const tituloCompleto = await carregarTituloPorId(req, titulosCriados[0].id);
  if (titulosCriados.length > 1) {
    tituloCompleto.setDataValue('parcelas_geradas', titulosCriados.map((titulo) => titulo.id));
  }
  return tituloCompleto;
}

async function criarTituloManualComBaixaAtomica(req, payload = {}, { transaction: externalTransaction = null } = {}) {
  await assertFinanceAccess(req);

  const tipo = normalizarTipoTitulo(payload.tipo || 'PAGAR');
  if (!['PAGAR', 'RECEBER'].includes(tipo)) {
    throw createHttpError(400, 'Tipo de titulo invalido.');
  }

  const obraId = Number(payload.obra_id);
  if (!Number.isInteger(obraId) || obraId <= 0) {
    throw createHttpError(400, 'Obra e obrigatoria para criar o titulo.');
  }

  const parceiroId = Number(payload.parceiro_id);
  if (!Number.isInteger(parceiroId) || parceiroId <= 0) {
    throw createHttpError(400, 'Parceiro e obrigatorio para criar o titulo.');
  }

  const valorOriginal = Number(payload.valor);
  if (!Number.isFinite(valorOriginal) || valorOriginal <= 0) {
    throw createHttpError(400, 'Valor invalido para criar o titulo.');
  }

  const dataVencimento = payload.data_vencimento;
  if (!dataVencimento) {
    throw createHttpError(400, 'Data de vencimento e obrigatoria para criar o titulo.');
  }

  const dataMovimento = payload.data_movimento;
  if (!dataMovimento) {
    throw createHttpError(400, 'Data do movimento e obrigatoria para registrar a baixa.');
  }

  const descricao = String(payload.descricao || '').trim();
  if (!descricao) {
    throw createHttpError(400, 'Descricao e obrigatoria para criar o titulo manual.');
  }

  const contaBancariaId = Number(payload.conta_bancaria_id);
  if (!Number.isInteger(contaBancariaId) || contaBancariaId <= 0) {
    throw createHttpError(400, 'Conta bancaria e obrigatoria para registrar a baixa.');
  }

  const [obra, parceiro, categoria, conta] = await Promise.all([
    validarObraTitulo(req, obraId),
    validarParceiro(parceiroId),
    validarCategoriaFinanceira(payload.categoria_financeira_id, tipo),
    validarContaBancaria(contaBancariaId)
  ]);
  const empresaBaixaId = await validarEmpresaBaixa({
    empresaId: payload.empresa_id,
    conta
  });
  const empresaTituloId = resolverEmpresaTitulo({ obra });
  await validarEmpresaGrupo(empresaTituloId);
  const apropriacao = await validarApropriacaoTitulo(payload.apropriacao_id, obra.id);

  validarCompatibilidadeParceiroTitulo(parceiro, tipo);
  validarCategoriaDreTitulo(categoria, payload);
  const tituloIntercompanyFields = {
    intercompany: false,
    empresa_contraparte_id: null,
    intercompany_group_id: null,
    empresa_origem_id: null,
    empresa_destino_id: null,
    tipo_intercompany: null,
    motivo_intercompany: null,
    elimina_consolidado: false,
    transferencia_interna: false
  };
  const movimentoIntercompanyFields = await validarIntercompanyBaixa({
    payload,
    titulo: {
      tipo,
      empresa_id: empresaTituloId,
      ...tituloIntercompanyFields
    },
    empresaBaixaId
  });

  const valorBaixa = roundCurrency(payload.valor);
  const juros = roundCurrency(payload.juros || 0);
  const multa = roundCurrency(payload.multa || 0);
  const desconto = roundCurrency(payload.desconto || 0);
  const valorQuitacao = roundCurrency(valorBaixa + juros + multa - desconto);

  if (valorBaixa <= 0) {
    throw createHttpError(400, 'Valor da baixa deve ser maior que zero.');
  }

  if (valorQuitacao <= 0) {
    throw createHttpError(400, 'Valor final da quitacao deve ser maior que zero.');
  }

  const formaRecebimento = exigirFormaRecebimentoBaixa(payload.forma_recebimento);
  const ownTransaction = !externalTransaction;
  const transaction = externalTransaction || await sequelize.transaction();

  try {
    const caixaSessao = await obterSessaoAbertaParaConta(conta, dataMovimento, { transaction });
    const titulo = await TituloFinanceiro.create({
      solicitacao_id: null,
      obra_id: obra.id,
      apropriacao_id: apropriacao?.id || null,
      empresa_id: empresaTituloId,
      ...tituloIntercompanyFields,
      parceiro_id: parceiro.id,
      categoria_financeira_id: categoria?.id || null,
      tipo,
      status: 'ABERTO',
      descricao: descricao.slice(0, 255) || descricaoPadraoTituloManual(tipo),
      numero_documento: payload.numero_documento || null,
      valor_original: roundCurrency(valorOriginal),
      valor_saldo: roundCurrency(valorOriginal),
      valor_baixado: 0,
      data_emissao: payload.data_emissao || getHoje(),
      data_compra: payload.data_compra || payload.data_movimento || null,
      competencia_data: resolverCompetenciaCriacaoTitulo(),
      considera_dre: payload.considera_dre !== false,
      data_vencimento: dataVencimento,
      data_quitacao: null,
      observacoes: payload.observacoes || null,
      ...buildCobrancaFields(payload, tipo),
      criado_por: req.user?.id || null,
      atualizado_por: req.user?.id || null
    }, { transaction });

    const novoValorBaixado = roundCurrency(Number(titulo.valor_baixado || 0) + valorBaixa);
    const novoEstado = calcularStatusTitulo({
      valorOriginal: Number(titulo.valor_original || 0),
      valorBaixado: novoValorBaixado
    });

    const movimento = await MovimentoFinanceiro.create({
      titulo_financeiro_id: titulo.id,
      conta_bancaria_id: conta.id,
      empresa_id: empresaBaixaId,
      ...movimentoIntercompanyFields,
      caixa_sessao_id: caixaSessao?.id || null,
      forma_recebimento: formaRecebimento,
      tipo_permuta: payload.tipo_permuta || null,
      categoria_bem: payload.categoria_bem || null,
      descricao_bem: payload.descricao_bem || null,
      valor_referencia_bem: payload.valor_referencia_bem ?? null,
      documento_referencia: payload.documento_referencia || payload.cheque_numero || null,
      ...buildChequeMovimentoFields(formaRecebimento, payload),
      tipo_movimento: 'BAIXA',
      status: 'ATIVO',
      valor: valorBaixa,
      juros,
      multa,
      desconto,
      valor_quitacao: valorQuitacao,
      data_movimento: dataMovimento,
      observacoes: payload.observacoes || null,
      criado_por: req.user?.id || null
    }, { transaction });

    if (isChequeFormaRecebimento(formaRecebimento)) {
      const tipoTitulo = getTituloTipo(titulo);
      if (tipoTitulo === 'RECEBER') {
        await registrarChequeTerceiroRecebido({
          req,
          titulo,
          movimento,
          payload,
          valor: valorBaixa,
          dataMovimento: payload.data_movimento,
          transaction
        });
      } else if (tipoTitulo === 'PAGAR' && payload.usar_cheque_terceiro) {
        await consumirChequeTerceiroPagamento({
          req,
          chequeTerceiroId: payload.cheque_terceiro_id,
          movimento,
          valor: valorBaixa,
          transaction
        });
      }
    }

    await titulo.update({
      valor_baixado: novoValorBaixado,
      valor_saldo: novoEstado.valor_saldo,
      status: novoEstado.status,
      data_quitacao: novoEstado.status === 'QUITADO' ? dataMovimento : null,
      status_cobranca: titulo.forma_cobranca ? 'CONCILIADO' : titulo.status_cobranca,
      atualizado_por: req.user?.id || null
    }, { transaction });

    await sincronizarRealizacaoCompraPorTitulo({
      titulo,
      statusTitulo: novoEstado.status,
      transaction
    });

    const afterCommit = async () => {
      await registrarEventoSeguranca({
        req,
        usuarioId: req.user?.id || null,
        tipoEvento: 'FINANCIAL_TITLE_CREATED',
        recursoTipo: 'TITULO_FINANCEIRO',
        recursoId: titulo.id,
        status: 'SUCCESS',
        descricao: 'Titulo financeiro criado manualmente',
        metadata: {
          origem: 'MANUAL_CONCILIACAO',
          obra_id: obra.id,
          parceiro_id: parceiro.id,
          tipo,
          valor_original: roundCurrency(valorOriginal)
        }
      });

      await registrarEventoSeguranca({
        req,
        usuarioId: req.user?.id || null,
        tipoEvento: 'FINANCIAL_TITLE_SETTLED',
        recursoTipo: 'TITULO_FINANCEIRO',
        recursoId: titulo.id,
        status: 'SUCCESS',
        descricao: 'Baixa financeira registrada no titulo',
        metadata: {
          movimento_id: movimento.id,
          conta_bancaria_id: conta.id,
          forma_recebimento: formaRecebimento,
          ...(isChequeFormaRecebimento(formaRecebimento) && !payload.usar_cheque_terceiro
            ? buildChequeMovimentoFields(formaRecebimento, payload)
            : {}),
          tipo_permuta: payload.tipo_permuta || null,
          categoria_bem: payload.categoria_bem || null,
          valor: valorBaixa,
          juros,
          multa,
          desconto,
          valor_quitacao: valorQuitacao
        }
      });
    };

    if (ownTransaction) {
      await transaction.commit();
      await afterCommit();
    }

    return {
      titulo,
      movimento,
      afterCommit: ownTransaction ? null : afterCommit
    };
  } catch (error) {
    if (ownTransaction) {
      await transaction.rollback();
    }
    throw error;
  }
}

function calcularStatusTitulo({ valorOriginal, valorBaixado }) {
  const saldo = roundCurrency(valorOriginal - valorBaixado);
  if (saldo <= 0) {
    return {
      status: 'QUITADO',
      valor_saldo: 0
    };
  }

  if (valorBaixado > 0) {
    return {
      status: 'PARCIAL',
      valor_saldo: saldo
    };
  }

  return {
    status: 'ABERTO',
    valor_saldo: saldo
  };
}

async function sincronizarRealizacaoCompraPorTitulo({
  titulo,
  statusTitulo,
  transaction
}) {
  const solicitacaoPrincipalId = Number(titulo?.solicitacao_id || 0);
  if (!solicitacaoPrincipalId) return;

  const solicitacaoCompra = await SolicitacaoCompra.findOne({
    where: { solicitacao_principal_id: solicitacaoPrincipalId },
    attributes: ['id'],
    transaction
  });

  if (!solicitacaoCompra) return;

  const isQuitado = String(statusTitulo || '').toUpperCase() === 'QUITADO';
  const update = isQuitado
    ? {
        status_financeiro: 'REALIZADO',
        titulo_financeiro_id: titulo.id,
        valor_realizado: sequelize.literal('valor_total'),
        realizado_em: new Date()
      }
    : {
        status_financeiro: 'PREVISTO',
        titulo_financeiro_id: null,
        valor_realizado: 0,
        realizado_em: null
      };

  const vinculosPedido = await PedidoCompraTitulo.findAll({
    where: { titulo_financeiro_id: titulo.id },
    attributes: ['pedido_compra_id'],
    transaction,
    raw: true
  });
  const pedidoIds = [...new Set(vinculosPedido.map((item) => Number(item.pedido_compra_id)).filter(Boolean))];

  await SolicitacaoCompraAlocacao.update(update, {
    where: {
      solicitacao_compra_id: solicitacaoCompra.id,
      status: 'ATIVA',
      ...(pedidoIds.length ? { pedido_compra_id: { [Op.in]: pedidoIds } } : {})
    },
    transaction
  });

  if (pedidoIds.length) {
    const { sincronizarStatusFinanceiroPedidos } = require('./pedidoCompraFinanceiroService');
    await sincronizarStatusFinanceiroPedidos(pedidoIds, transaction);
  }
}


async function baixarTitulo(req, tituloId, payload = {}, options = {}) {
  const valorBaixa = roundCurrency(payload.valor);
  const juros = roundCurrency(payload.juros || 0);
  const multa = roundCurrency(payload.multa || 0);
  const desconto = roundCurrency(payload.desconto || 0);
  const valorQuitacao = roundCurrency(valorBaixa + juros + multa - desconto);

  if (valorBaixa <= 0) {
    throw createHttpError(400, 'Valor da baixa deve ser maior que zero.');
  }

  if (valorQuitacao <= 0) {
    throw createHttpError(400, 'Valor final da quitacao deve ser maior que zero.');
  }

  const formaBaixa = await resolverFormaPagamentoBaixa(payload);
  const formaRecebimento = formaBaixa.formaRecebimento;
  const conta = await validarContaBancaria(payload.conta_bancaria_id);
  const empresaBaixaId = await validarEmpresaBaixa({
    empresaId: payload.empresa_id,
    conta
  });

  const ownTransaction = !options.transaction;
  const transaction = options.transaction || await sequelize.transaction();
  try {
    const titulo = await carregarTituloParaBaixaComLock(req, tituloId, transaction, {
      autorizadoPorFilaPagamento: options.autorizadoPorFilaPagamento === true
    });
    const statusAtual = String(titulo.status || '').trim().toUpperCase();

    if (!['ABERTO', 'PARCIAL'].includes(statusAtual)) {
      throw createHttpError(400, 'Somente titulos em aberto ou parcial podem receber baixa.');
    }

    const saldoAtual = roundCurrency(titulo.valor_saldo);
    // A fila manual pode liberar pontualmente um valor divergente depois de uma
    // segunda pessoa autorizar a baixa com justificativa. Fora desse fluxo, a
    // protecao original continua valendo integralmente.
    if (valorBaixa > saldoAtual && options.autorizarValorAcimaSaldo !== true) {
      // A trava de pagar mais que o saldo cai SO para parcela de contrato do fluxo novo (item 33,
      // 23/08): la o excedente e descontado da ultima parcela. Para todo o resto do Financeiro ela
      // continua exatamente como estava — e quem decide isso e a propria regra do contrato.
      const { liberarBaixaAcimaDoSaldo } = require('./medicaoContratoService');
      const liberado = await liberarBaixaAcimaDoSaldo(
        titulo.id,
        roundCurrency(valorBaixa - saldoAtual),
        transaction
      );
      if (!liberado) {
        throw createHttpError(400, 'Valor da baixa nao pode ser maior que o saldo do titulo.');
      }
    }

    const empresaTituloId = await resolverEmpresaTituloParaBaixa(titulo);
    const movimentoIntercompanyFields = await validarIntercompanyBaixa({
      payload,
      titulo,
      empresaBaixaId
    });

    const novoValorBaixado = roundCurrency(Number(titulo.valor_baixado || 0) + valorBaixa);
    const novoEstado = calcularStatusTitulo({
      valorOriginal: Number(titulo.valor_original || 0),
      valorBaixado: novoValorBaixado
    });

    const cartaoBaixa = await resolverCartaoBaixa({
      formaRecebimento,
      cartaoId: payload.cartao_id,
      conta,
      empresaBaixaId,
      dataMovimento: payload.data_movimento,
      usuarioId: req.user?.id || null,
      transaction
    });
    const contaMovimento = cartaoBaixa.conta || conta;
    const formaMovimento = cartaoBaixa.formaRecebimento;

    if (formaMovimento === 'DINHEIRO') {
      if (!contaMovimento) {
        throw createHttpError(400, 'Selecione o caixa fisico usado na baixa em dinheiro.');
      }
      if (!contaExigeSessao(contaMovimento)) {
        throw createHttpError(
          400,
          'A baixa em dinheiro deve usar uma conta de caixa fisico com controle de abertura e fechamento.'
        );
      }
    }

    const caixaSessao = contaMovimento
      ? await obterSessaoAbertaParaConta(contaMovimento, payload.data_movimento, {
        transaction,
        exigir: formaMovimento === 'DINHEIRO'
      })
      : null;
    const movimento = await MovimentoFinanceiro.create({
      titulo_financeiro_id: titulo.id,
      conta_bancaria_id: contaMovimento?.id || null,
      baixa_grupo_id: payload.baixa_grupo_id || null,
      baixa_componente_id: payload.baixa_componente_id || null,
      fatura_cartao_id: cartaoBaixa.fatura?.id || null,
      cartao_id: cartaoBaixa.cartao?.id || null,
      empresa_id: empresaBaixaId,
      ...movimentoIntercompanyFields,
      caixa_sessao_id: caixaSessao?.id || null,
      forma_pagamento_id: formaBaixa.formaPagamentoId,
      forma_recebimento: formaMovimento,
      tipo_permuta: payload.tipo_permuta || null,
      categoria_bem: payload.categoria_bem || null,
      descricao_bem: payload.descricao_bem || null,
      valor_referencia_bem: payload.valor_referencia_bem ?? null,
      documento_referencia: payload.documento_referencia || payload.cheque_numero || null,
      ...buildChequeMovimentoFields(formaMovimento, payload),
      tipo_movimento: 'BAIXA',
      status: 'ATIVO',
      valor: valorBaixa,
      juros,
      multa,
      desconto,
      valor_quitacao: valorQuitacao,
      data_movimento: payload.data_movimento,
      observacoes: payload.observacoes || null,
      criado_por: req.user?.id || null
    }, { transaction });

    if (isChequeFormaRecebimento(formaMovimento)) {
      const tipoTitulo = getTituloTipo(titulo);
      if (tipoTitulo === 'RECEBER') {
        await registrarChequeTerceiroRecebido({
          req,
          titulo,
          movimento,
          payload,
          valor: valorBaixa,
          dataMovimento: payload.data_movimento,
          transaction
        });
      } else if (tipoTitulo === 'PAGAR' && payload.usar_cheque_terceiro) {
        await consumirChequeTerceiroPagamento({
          req,
          chequeTerceiroId: payload.cheque_terceiro_id,
          movimento,
          valor: valorBaixa,
          transaction
        });
      }
    }

    const tituloIntercompanyUpdate = options.skipTituloIntercompanyUpdate
      ? {}
      : buildTituloIntercompanyUpdateFromBaixa(movimentoIntercompanyFields);

    await titulo.update({
      empresa_id: empresaTituloId,
      cartao_id: cartaoBaixa.cartao?.id || titulo.cartao_id || null,
      fatura_cartao_id: cartaoBaixa.fatura?.id || titulo.fatura_cartao_id || null,
      ...tituloIntercompanyUpdate,
      valor_baixado: novoValorBaixado,
      valor_saldo: novoEstado.valor_saldo,
      status: novoEstado.status,
      data_quitacao: novoEstado.status === 'QUITADO' ? payload.data_movimento : null,
      status_cobranca: titulo.forma_cobranca ? 'CONCILIADO' : titulo.status_cobranca,
      atualizado_por: req.user?.id || null
    }, { transaction });

    await sincronizarRealizacaoCompraPorTitulo({
      titulo,
      statusTitulo: novoEstado.status,
      transaction
    });

    await sincronizarStatusSolicitacaoPorBaixaTitulos({
      solicitacaoId: titulo.solicitacao_id,
      usuarioId: req.user?.id || null,
      setor: getSetorUsuario(req),
      transaction
    });

    if (cartaoBaixa.fatura) {
      await vincularTituloAFatura({
        titulo,
        fatura: cartaoBaixa.fatura,
        transaction
      });
    }

    if (titulo.solicitacao_id) {
      await Historico.create({
        solicitacao_id: titulo.solicitacao_id,
        usuario_responsavel_id: req.user?.id || null,
        setor: getSetorUsuario(req),
        acao: 'TITULO_FINANCEIRO_BAIXADO',
        observacao: `Baixa de ${formatCurrency(valorBaixa)} registrada no titulo financeiro #${titulo.id}`
      }, { transaction });
    }

    if (ownTransaction) {
      await transaction.commit();
    }

    if (!options.skipSecurityEvent) await registrarEventoSeguranca({
      req,
      usuarioId: req.user?.id || null,
      tipoEvento: 'FINANCIAL_TITLE_SETTLED',
      recursoTipo: 'TITULO_FINANCEIRO',
      recursoId: titulo.id,
      status: 'SUCCESS',
      descricao: 'Baixa financeira registrada no titulo',
        metadata: {
          movimento_id: movimento.id,
          conta_bancaria_id: contaMovimento?.id || null,
          cartao_id: cartaoBaixa.cartao?.id || null,
          fatura_cartao_id: cartaoBaixa.fatura?.id || null,
          empresa_baixa_id: empresaBaixaId,
          intercompany_group_id: movimentoIntercompanyFields.intercompany_group_id || null,
          tipo_intercompany: movimentoIntercompanyFields.tipo_intercompany || null,
          forma_recebimento: formaMovimento,
          ...(isChequeFormaRecebimento(formaMovimento) && !payload.usar_cheque_terceiro
            ? buildChequeMovimentoFields(formaMovimento, payload)
            : {}),
          tipo_permuta: payload.tipo_permuta || null,
          categoria_bem: payload.categoria_bem || null,
        valor: valorBaixa,
        juros,
        multa,
        desconto,
        valor_quitacao: valorQuitacao
      }
    });

    if (!ownTransaction) {
      return {
        id: titulo.id,
        codigo: titulo.codigo,
        status: novoEstado.status,
        valor_baixado: novoValorBaixado,
        valor_saldo: novoEstado.valor_saldo,
        movimento_financeiro_id: movimento.id,
        movimento
      };
    }

    const tituloCompleto = await carregarTituloPorId(req, titulo.id, { includeMovimentos: true });
    const tituloJson = typeof tituloCompleto?.toJSON === 'function'
      ? tituloCompleto.toJSON()
      : tituloCompleto;
    const movimentoGerado = Array.isArray(tituloJson?.movimentos)
      ? tituloJson.movimentos.find((item) => Number(item?.id) === Number(movimento.id))
      : null;

    return {
      ...tituloJson,
      movimento_financeiro_id: movimento.id,
      movimento: movimentoGerado || {
        id: movimento.id,
        tipo_movimento: movimento.tipo_movimento,
        status: movimento.status,
        conta_bancaria_id: movimento.conta_bancaria_id,
        cartao_id: movimento.cartao_id,
        fatura_cartao_id: movimento.fatura_cartao_id,
        valor: movimento.valor,
        valor_quitacao: movimento.valor_quitacao,
        data_movimento: movimento.data_movimento
      }
    };
  } catch (error) {
    if (ownTransaction) {
      await transaction.rollback();
    }
    throw error;
  }
}

async function validarCartaoBaixaParcelada({ formaRecebimento, cartaoId, empresaBaixaId, transaction }) {
  if (String(formaRecebimento || '').toUpperCase() !== 'CARTAO') {
    if (cartaoId) {
      throw createHttpError(400, 'Cartao deve ser informado apenas quando a forma de recebimento for CARTAO.');
    }
    return null;
  }

  if (!cartaoId) {
    throw createHttpError(400, 'Informe o cartao utilizado na baixa parcelada.');
  }

  const cartao = await CartaoFinanceiro.findByPk(cartaoId, {
    include: [{ model: ContaBancaria, as: 'contaBancaria' }],
    transaction
  });

  if (!cartao || cartao.ativo === false) {
    throw createHttpError(400, 'Cartao financeiro invalido ou inativo.');
  }

  const contaCartao = cartao.contaBancaria;
  if (contaCartao?.empresa_id && Number(contaCartao.empresa_id) !== Number(empresaBaixaId)) {
    throw createHttpError(400, 'O cartao informado deve pertencer a empresa pagadora.');
  }

  return cartao;
}

function appendObservacaoBaixaAgrupada(observacoes, grupoParcelamentoId) {
  const atual = String(observacoes || '').trim();
  const complemento = `Quitado por baixa agrupada parcelada ${grupoParcelamentoId}.`;
  return atual ? `${atual}\n${complemento}` : complemento;
}

async function baixarTitulosParceladosEmMassa(req, payload = {}) {
  await assertFinanceAccess(req);

  const tituloIds = Array.isArray(payload.titulo_ids)
    ? Array.from(new Set(payload.titulo_ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)))
    : [];
  if (tituloIds.length === 0) {
    throw createHttpError(400, 'Selecione ao menos um titulo para a baixa parcelada.');
  }

  const formaBaixa = await resolverFormaPagamentoBaixa(payload);
  const formaRecebimento = formaBaixa.formaRecebimento;
  if (!['CHEQUE', 'CARTAO'].includes(formaRecebimento)) {
    throw createHttpError(400, 'Baixa parcelada em massa esta disponivel apenas para CHEQUE ou CARTAO.');
  }

  const conta = await validarContaBancaria(payload.conta_bancaria_id);
  if (!conta) {
    throw createHttpError(400, 'Conta bancaria e obrigatoria para gerar parcelas conciliaveis.');
  }
  const empresaBaixaId = await validarEmpresaBaixa({
    empresaId: payload.empresa_id,
    conta
  });

  let titulos = [];
  for (const tituloId of tituloIds) {
    const titulo = await carregarTituloPorId(req, tituloId, { includeMovimentos: false });
    const statusAtual = String(titulo.status || '').trim().toUpperCase();
    if (!['ABERTO', 'PARCIAL'].includes(statusAtual)) {
      throw createHttpError(400, `Titulo ${titulo.codigo || titulo.id} nao esta aberto ou parcial.`);
    }
    const saldo = roundCurrency(titulo.valor_saldo);
    if (saldo <= 0) {
      throw createHttpError(400, `Titulo ${titulo.codigo || titulo.id} nao possui saldo em aberto.`);
    }
    await resolverEmpresaTituloParaBaixa(titulo);
    titulos.push(titulo);
  }

  let tipoTitulo = String(titulos[0]?.tipo || '').toUpperCase();
  if (!['PAGAR', 'RECEBER'].includes(tipoTitulo)) {
    throw createHttpError(400, 'Tipo dos titulos selecionados invalido para baixa parcelada.');
  }
  const tituloTipoDiferente = titulos.find((titulo) => String(titulo.tipo || '').toUpperCase() !== tipoTitulo);
  if (tituloTipoDiferente) {
    throw createHttpError(400, 'Selecione apenas titulos do mesmo tipo para baixa agrupada.');
  }

  const parcelas = Array.isArray(payload.parcelas) ? payload.parcelas : [];
  if (parcelas.length === 0) {
    throw createHttpError(400, 'Informe as parcelas da baixa agrupada.');
  }

  let totalTitulos = somarValores(titulos.map((titulo) => Number(titulo.valor_saldo || 0)));
  const totalParcelas = somarValores(parcelas.map((parcela) => Number(parcela.valor || 0)));
  assertValoresIguais({
    atual: totalParcelas,
    esperado: totalTitulos,
    mensagem: 'A soma das parcelas precisa ser igual ao saldo total dos titulos selecionados.'
  });

  const grupoParcelamentoId = `BAIXA-${crypto.randomUUID()}`;
  let referenciaTitulo = titulos[0];
  let codigosOriginais = titulos.map((titulo) => titulo.codigo || `#${titulo.id}`).join(', ');
  const transaction = await sequelize.transaction();
  let transactionCommitted = false;

  try {
    const cartao = await validarCartaoBaixaParcelada({
      formaRecebimento,
      cartaoId: payload.cartao_id,
      empresaBaixaId,
      transaction
    });

    const titulosBloqueados = [];
    for (const tituloId of tituloIds) {
      const titulo = await carregarTituloParaBaixaComLock(req, tituloId, transaction);
      const statusAtual = String(titulo.status || '').trim().toUpperCase();
      if (!['ABERTO', 'PARCIAL'].includes(statusAtual)) {
        throw createHttpError(400, `Titulo ${titulo.codigo || titulo.id} nao esta aberto ou parcial.`);
      }
      const saldo = roundCurrency(titulo.valor_saldo);
      if (saldo <= 0) {
        throw createHttpError(400, `Titulo ${titulo.codigo || titulo.id} nao possui saldo em aberto.`);
      }
      await resolverEmpresaTituloParaBaixa(titulo);
      titulosBloqueados.push(titulo);
    }

    tipoTitulo = String(titulosBloqueados[0]?.tipo || '').toUpperCase();
    if (!['PAGAR', 'RECEBER'].includes(tipoTitulo)) {
      throw createHttpError(400, 'Tipo dos titulos selecionados invalido para baixa parcelada.');
    }
    const tituloTipoDiferenteBloqueado = titulosBloqueados.find((titulo) => String(titulo.tipo || '').toUpperCase() !== tipoTitulo);
    if (tituloTipoDiferenteBloqueado) {
      throw createHttpError(400, 'Selecione apenas titulos do mesmo tipo para baixa agrupada.');
    }

    totalTitulos = somarValores(titulosBloqueados.map((titulo) => Number(titulo.valor_saldo || 0)));
    assertValoresIguais({
      atual: totalParcelas,
      esperado: totalTitulos,
      mensagem: 'A soma das parcelas precisa ser igual ao saldo total dos titulos selecionados.'
    });

    titulos = titulosBloqueados;
    referenciaTitulo = titulos[0];
    codigosOriginais = titulos.map((titulo) => titulo.codigo || `#${titulo.id}`).join(', ');

    const movimentosOriginais = [];
    for (const titulo of titulos) {
      const saldo = roundCurrency(titulo.valor_saldo);
      const empresaTituloId = await resolverEmpresaTituloParaBaixa(titulo);
      const movimentoIntercompanyFields = await validarIntercompanyBaixa({
        payload: Number(empresaTituloId) === Number(empresaBaixaId)
          ? { ...payload, intercompany: false }
          : payload,
        titulo,
        empresaBaixaId
      });
      const caixaSessao = await obterSessaoAbertaParaConta(conta, payload.data_movimento, { transaction });
      const movimentoOriginal = await MovimentoFinanceiro.create({
        titulo_financeiro_id: titulo.id,
        conta_bancaria_id: conta.id,
        cartao_id: cartao?.id || null,
        empresa_id: empresaBaixaId,
        ...movimentoIntercompanyFields,
        caixa_sessao_id: caixaSessao?.id || null,
        forma_pagamento_id: formaBaixa.formaPagamentoId,
        forma_recebimento: formaRecebimento,
        documento_referencia: grupoParcelamentoId,
        tipo_movimento: 'BAIXA',
        status: 'AGRUPADO',
        valor: saldo,
        juros: 0,
        multa: 0,
        desconto: 0,
        valor_quitacao: saldo,
        data_movimento: payload.data_movimento,
        observacoes: payload.observacoes || 'Baixa agrupada parcelada.',
        criado_por: req.user?.id || null
      }, { transaction });
      movimentosOriginais.push(movimentoOriginal);

      await titulo.update({
        empresa_id: Number(empresaTituloId),
        ...buildTituloIntercompanyUpdateFromBaixa(movimentoIntercompanyFields),
        valor_baixado: roundCurrency(Number(titulo.valor_baixado || 0) + saldo),
        valor_saldo: 0,
        status: 'QUITADO',
        data_quitacao: payload.data_movimento,
        observacoes: appendObservacaoBaixaAgrupada(titulo.observacoes, grupoParcelamentoId),
        atualizado_por: req.user?.id || null
      }, { transaction });

      await sincronizarRealizacaoCompraPorTitulo({
        titulo,
        statusTitulo: 'QUITADO',
        transaction
      });

      if (titulo.solicitacao_id) {
        await Historico.create({
          solicitacao_id: titulo.solicitacao_id,
          usuario_responsavel_id: req.user?.id || null,
          setor: getSetorUsuario(req),
          acao: 'TITULO_FINANCEIRO_BAIXADO_AGRUPADO',
          observacao: `Titulo financeiro ${titulo.codigo || `#${titulo.id}`} quitado por baixa agrupada ${grupoParcelamentoId}.`
        }, { transaction });
      }
    }

    const parcelasCriadas = [];
    for (const [index, parcela] of parcelas.entries()) {
      const numeroParcela = index + 1;
      const valorParcela = roundCurrency(parcela.valor);
      const documentoReferencia = parcela.documento_referencia
        || parcela.cheque_numero
        || `${grupoParcelamentoId}-${numeroParcela}`;
      const tituloParcela = await TituloFinanceiro.create({
        solicitacao_id: referenciaTitulo.solicitacao_id || null,
        obra_id: referenciaTitulo.obra_id || null,
        apropriacao_id: referenciaTitulo.apropriacao_id || null,
        empresa_id: empresaBaixaId,
        parceiro_id: referenciaTitulo.parceiro_id,
        categoria_financeira_id: referenciaTitulo.categoria_financeira_id || null,
        forma_pagamento_id: formaBaixa.formaPagamentoId,
        cartao_id: cartao?.id || null,
        grupo_parcelamento_id: grupoParcelamentoId,
        numero_parcela: numeroParcela,
        total_parcelas: parcelas.length,
        competencia_data: referenciaTitulo.competencia_data || parcela.data_movimento,
        considera_dre: false,
        possui_rateio: false,
        origem_titulo: 'BAIXA_MASSA_PARCELADA',
        tipo: tipoTitulo,
        status: 'QUITADO',
        descricao: `Baixa agrupada ${grupoParcelamentoId} - parcela ${numeroParcela}/${parcelas.length}`,
        numero_documento: documentoReferencia,
        cheque_numero: parcela.cheque_numero || null,
        cheque_banco: parcela.cheque_banco || null,
        cheque_agencia: parcela.cheque_agencia || null,
        cheque_conta: parcela.cheque_conta || null,
        cheque_emitente: parcela.cheque_emitente || null,
        valor_original: valorParcela,
        valor_bruto: valorParcela,
        valor_impostos: 0,
        valor_liquido: valorParcela,
        valor_saldo: 0,
        valor_baixado: valorParcela,
        data_emissao: payload.data_movimento,
        data_vencimento: parcela.data_movimento,
        data_quitacao: parcela.data_movimento,
        observacoes: [
          payload.observacoes || 'Parcela gerada por baixa agrupada.',
          `Titulos originais: ${codigosOriginais}.`
        ].filter(Boolean).join('\n'),
        criado_por: req.user?.id || null,
        atualizado_por: req.user?.id || null
      }, { transaction });

      const caixaSessao = await obterSessaoAbertaParaConta(conta, parcela.data_movimento, { transaction });
      const movimentoParcela = await MovimentoFinanceiro.create({
        titulo_financeiro_id: tituloParcela.id,
        conta_bancaria_id: conta.id,
        cartao_id: cartao?.id || null,
        empresa_id: empresaBaixaId,
        caixa_sessao_id: caixaSessao?.id || null,
        forma_pagamento_id: formaBaixa.formaPagamentoId,
        forma_recebimento: formaRecebimento === 'CARTAO' ? 'CARTAO_PARCELADO' : 'CHEQUE_PARCELADO',
        documento_referencia: documentoReferencia,
        ...buildChequeMovimentoFields(formaRecebimento, parcela),
        tipo_movimento: 'BAIXA',
        status: 'ATIVO',
        valor: valorParcela,
        juros: 0,
        multa: 0,
        desconto: 0,
        valor_quitacao: valorParcela,
        data_movimento: parcela.data_movimento,
        observacoes: [
          parcela.observacoes || null,
          `Parcela ${numeroParcela}/${parcelas.length} da baixa agrupada ${grupoParcelamentoId}.`,
          `Titulos originais: ${codigosOriginais}.`
        ].filter(Boolean).join('\n'),
        criado_por: req.user?.id || null
      }, { transaction });

      if (formaRecebimento === 'CHEQUE') {
        if (tipoTitulo === 'RECEBER') {
          await registrarChequeTerceiroRecebido({
            req,
            titulo: tituloParcela,
            movimento: movimentoParcela,
            payload: parcela,
            valor: valorParcela,
            dataMovimento: parcela.data_movimento,
            transaction
          });
        } else if (tipoTitulo === 'PAGAR' && parcela.usar_cheque_terceiro) {
          await consumirChequeTerceiroPagamento({
            req,
            chequeTerceiroId: parcela.cheque_terceiro_id,
            movimento: movimentoParcela,
            valor: valorParcela,
            transaction
          });
        }
      }

      parcelasCriadas.push({
        titulo_id: tituloParcela.id,
        codigo: tituloParcela.codigo,
        movimento_id: movimentoParcela.id,
        numero_parcela: numeroParcela,
        data_movimento: parcela.data_movimento,
        valor: valorParcela
      });
    }

    const solicitacaoIdsSincronizar = Array.from(new Set(titulos
      .map((titulo) => Number(titulo.solicitacao_id || 0))
      .filter((id) => Number.isInteger(id) && id > 0)));

    for (const solicitacaoId of solicitacaoIdsSincronizar) {
      await sincronizarStatusSolicitacaoPorBaixaTitulos({
        solicitacaoId,
        usuarioId: req.user?.id || null,
        setor: getSetorUsuario(req),
        transaction,
        observacao: 'Status atualizado automaticamente apos baixa agrupada de titulos financeiros.'
      });
    }

    await transaction.commit();
    transactionCommitted = true;

    await registrarEventoSeguranca({
      req,
      usuarioId: req.user?.id || null,
      tipoEvento: 'FINANCIAL_MASS_SETTLEMENT_INSTALLMENTS',
      recursoTipo: 'TITULO_FINANCEIRO',
      recursoId: null,
      status: 'SUCCESS',
      descricao: 'Baixa em massa agrupada e parcelada registrada',
      metadata: {
        grupo_parcelamento_id: grupoParcelamentoId,
        titulo_ids: tituloIds,
        movimento_ids_agrupados: movimentosOriginais.map((movimento) => movimento.id),
        parcelas: parcelasCriadas,
        forma_pagamento_id: formaBaixa.formaPagamentoId,
        forma_recebimento: formaRecebimento,
        conta_bancaria_id: conta.id,
        cartao_id: cartao?.id || null,
        empresa_baixa_id: empresaBaixaId,
        total: totalTitulos
      }
    });

    return {
      grupo_parcelamento_id: grupoParcelamentoId,
      total: totalTitulos,
      titulos_originais: titulos.map((titulo) => ({
        id: titulo.id,
        codigo: titulo.codigo
      })),
      parcelas: parcelasCriadas
    };
  } catch (error) {
    if (!transactionCommitted) {
      await transaction.rollback();
    }
    throw error;
  }
}

async function baixarTituloPorConciliacoes(req, tituloId, payload = {}) {
  const titulo = await carregarTituloPorId(req, tituloId, { includeMovimentos: false });
  const statusAtual = String(titulo.status || '').trim().toUpperCase();

  if (!['ABERTO', 'PARCIAL'].includes(statusAtual)) {
    throw createHttpError(400, 'Somente titulos em aberto ou parcial podem receber baixa.');
  }

  const conciliacaoIds = Array.isArray(payload.conciliacao_ids)
    ? [...new Set(payload.conciliacao_ids.map((id) => Number(id)).filter(Boolean))]
    : [];
  if (!conciliacaoIds.length) {
    throw createHttpError(400, 'Selecione ao menos um lancamento bancario para conciliar.');
  }

  const conciliacoes = await ConciliacaoBancaria.findAll({
    where: { id: { [Op.in]: conciliacaoIds } },
    order: [['data_movimento', 'ASC'], ['id', 'ASC']]
  });
  if (conciliacoes.length !== conciliacaoIds.length) {
    throw createHttpError(404, 'Um ou mais lancamentos bancarios nao foram encontrados.');
  }

  const tipoTitulo = String(titulo.tipo || '').trim().toUpperCase();
  const saldoAtual = roundCurrency(titulo.valor_saldo);
  const totalSelecionado = roundCurrency(conciliacoes.reduce((acc, conciliacao) => (
    acc + Math.abs(Number(conciliacao.valor || 0))
  ), 0));

  if (totalSelecionado <= 0) {
    throw createHttpError(400, 'Os lancamentos selecionados nao possuem valor para baixa.');
  }
  if (totalSelecionado > saldoAtual) {
    throw createHttpError(400, 'A soma dos lancamentos bancarios nao pode ser maior que o saldo do titulo.');
  }

  const preparadas = [];
  for (const conciliacao of conciliacoes) {
    const statusConciliacao = String(conciliacao.status || '').trim().toUpperCase();
    if (statusConciliacao !== 'PENDENTE') {
      throw createHttpError(400, `Lancamento bancario #${conciliacao.id} nao esta pendente.`);
    }
    if (conciliacao.movimento_financeiro_id) {
      throw createHttpError(400, `Lancamento bancario #${conciliacao.id} ja possui movimento vinculado.`);
    }

    const tipoEsperado = Number(conciliacao.valor || 0) >= 0 ? 'RECEBER' : 'PAGAR';
    if (tipoEsperado !== tipoTitulo) {
      throw createHttpError(400, 'Todos os lancamentos selecionados devem ter o mesmo sentido financeiro do titulo.');
    }

    const conta = await validarContaBancaria(conciliacao.conta_bancaria_id);
    const empresaBaixaId = await validarEmpresaBaixa({
      empresaId: conciliacao.empresa_id || conta.empresa_id,
      conta
    });
    await validarIntercompanyBaixa({
      payload,
      titulo,
      empresaBaixaId
    });

    preparadas.push({
      conciliacao,
      conta,
      empresaBaixaId,
      valor: roundCurrency(Math.abs(Number(conciliacao.valor || 0)))
    });
  }

  const resultados = [];
  for (const item of preparadas) {
    const { conciliacao, conta, empresaBaixaId, valor } = item;
    const baixa = await baixarTitulo(req, titulo.id, {
      ...payload,
      valor,
      juros: 0,
      multa: 0,
      desconto: 0,
      data_movimento: conciliacao.data_movimento,
      conta_bancaria_id: conta.id,
      empresa_id: empresaBaixaId,
      documento_referencia: payload.documento_referencia || conciliacao.documento || null,
      observacoes: payload.observacoes || `Baixa conciliada pelo lancamento bancario #${conciliacao.id}`
    });

    await conciliacao.update({
      movimento_financeiro_id: baixa.movimento_financeiro_id,
      titulo_financeiro_id: titulo.id,
      status: 'CONCILIADO',
      confirmado_por: req.user?.id || null,
      confirmado_em: new Date()
    });

    resultados.push({
      conciliacao_id: conciliacao.id,
      movimento_financeiro_id: baixa.movimento_financeiro_id,
      valor,
      data_movimento: conciliacao.data_movimento
    });
  }

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'FINANCIAL_TITLE_SETTLED_FROM_BANK_RECONCILIATION',
    recursoTipo: 'TITULO_FINANCEIRO',
    recursoId: titulo.id,
    status: 'SUCCESS',
    descricao: 'Titulo financeiro baixado a partir de multiplos lancamentos bancarios',
    metadata: {
      conciliacao_ids: resultados.map((item) => item.conciliacao_id),
      movimentos: resultados,
      valor_total: totalSelecionado
    }
  });

  const tituloAtualizado = await carregarTituloPorId(req, titulo.id, { includeMovimentos: true });
  const tituloJson = typeof tituloAtualizado?.toJSON === 'function'
    ? tituloAtualizado.toJSON()
    : tituloAtualizado;

  return {
    ...tituloJson,
    conciliacoes_processadas: resultados
  };
}

async function estornarMovimentoTitulo(req, tituloId, movimentoId, payload = {}) {
  const titulo = await carregarTituloPorId(req, tituloId, { includeMovimentos: false });
  const movimento = await MovimentoFinanceiro.findOne({
    where: {
      id: movimentoId,
      titulo_financeiro_id: titulo.id
    }
  });

  if (!movimento) {
    throw createHttpError(404, 'Movimento financeiro nao encontrado.');
  }

  if (String(movimento.tipo_movimento || '').toUpperCase() !== 'BAIXA') {
    throw createHttpError(400, 'Somente baixas podem ser estornadas.');
  }

  if (String(movimento.status || '').toUpperCase() !== 'ATIVO') {
    throw createHttpError(400, 'Esta baixa ja foi estornada.');
  }

  if (movimento.baixa_grupo_id) {
    throw createHttpError(
      409,
      'Este movimento pertence a uma baixa com multiplas fontes. Estorne o grupo completo na tela de Baixas com Multiplas Fontes.'
    );
  }

  const novoValorBaixado = roundCurrency(Number(titulo.valor_baixado || 0) - Number(movimento.valor || 0));
  const valorBaixadoNormalizado = novoValorBaixado < 0 ? 0 : novoValorBaixado;
  const novoEstado = calcularStatusTitulo({
    valorOriginal: Number(titulo.valor_original || 0),
    valorBaixado: valorBaixadoNormalizado
  });

  const transaction = await sequelize.transaction();
  let conciliacoesReabertas = [];
  try {
    await movimento.update({
      status: 'ESTORNADO',
      observacoes: payload.observacoes
        ? `${String(movimento.observacoes || '').trim()}\nEstorno: ${payload.observacoes}`.trim()
        : movimento.observacoes,
      estornado_por: req.user?.id || null,
      estornado_em: new Date()
    }, { transaction });

    const tipoTitulo = getTituloTipo(titulo);
    if (tipoTitulo === 'PAGAR') {
      const chequeUtilizado = await ChequeTerceiro.findOne({
        where: {
          status: 'UTILIZADO',
          [Op.or]: [
            { movimento_saida_id: movimento.id },
            { movimento_financeiro_id: movimento.id }
          ]
        },
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (chequeUtilizado) {
        await chequeUtilizado.update({
          status: 'EM_CARTEIRA',
          movimento_saida_id: null,
          data_saida: null,
          atualizado_por: req.user?.id || null
        }, { transaction });
        await ChequeTerceiroMovimento.create({
          cheque_terceiro_id: chequeUtilizado.id,
          tipo_evento: 'ESTORNO_UTILIZACAO',
          status_anterior: 'UTILIZADO',
          status_novo: 'EM_CARTEIRA',
          empresa_destino_id: chequeUtilizado.empresa_id || null,
          titulo_financeiro_id: titulo.id,
          movimento_financeiro_id: movimento.id,
          baixa_grupo_id: movimento.baixa_grupo_id || null,
          valor: roundCurrency(movimento.valor),
          data_evento: new Date().toISOString().slice(0, 10),
          observacoes: payload.observacoes || 'Cheque devolvido a carteira pelo estorno da baixa.',
          criado_por: req.user?.id || null
        }, { transaction });
      }
    } else if (tipoTitulo === 'RECEBER') {
      const chequeRecebido = await ChequeTerceiro.findOne({
        where: {
          [Op.or]: [
            { movimento_entrada_id: movimento.id },
            { movimento_financeiro_id: movimento.id }
          ]
        },
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (chequeRecebido) {
        if (String(chequeRecebido.status).toUpperCase() !== 'EM_CARTEIRA') {
          throw createHttpError(409, 'O cheque recebido ja possui movimentacao posterior. Reverta primeiro a utilizacao ou o deposito.');
        }
        await chequeRecebido.update({
          status: 'CANCELADO',
          atualizado_por: req.user?.id || null
        }, { transaction });
        await ChequeTerceiroMovimento.create({
          cheque_terceiro_id: chequeRecebido.id,
          tipo_evento: 'ESTORNO_ENTRADA',
          status_anterior: 'EM_CARTEIRA',
          status_novo: 'CANCELADO',
          empresa_origem_id: chequeRecebido.empresa_id || null,
          titulo_financeiro_id: titulo.id,
          movimento_financeiro_id: movimento.id,
          valor: roundCurrency(movimento.valor),
          data_evento: new Date().toISOString().slice(0, 10),
          observacoes: payload.observacoes || 'Entrada cancelada pelo estorno da baixa de recebimento.',
          criado_por: req.user?.id || null
        }, { transaction });
      }
    }

    await titulo.update({
      valor_baixado: valorBaixadoNormalizado,
      valor_saldo: novoEstado.valor_saldo,
      status: novoEstado.status,
      data_quitacao: novoEstado.status === 'QUITADO' ? titulo.data_quitacao : null,
      status_cobranca: titulo.forma_cobranca ? 'EMITIDO' : titulo.status_cobranca,
      atualizado_por: req.user?.id || null
    }, { transaction });

    await sincronizarRealizacaoCompraPorTitulo({
      titulo,
      statusTitulo: novoEstado.status,
      transaction
    });

    await sincronizarStatusSolicitacaoPorBaixaTitulos({
      solicitacaoId: titulo.solicitacao_id,
      usuarioId: req.user?.id || null,
      setor: getSetorUsuario(req),
      transaction,
      observacao: 'Status atualizado automaticamente apos estorno de baixa financeira.'
    });

    if (titulo.solicitacao_id) {
      await Historico.create({
        solicitacao_id: titulo.solicitacao_id,
        usuario_responsavel_id: req.user?.id || null,
        setor: getSetorUsuario(req),
        acao: 'TITULO_FINANCEIRO_ESTORNADO',
        observacao: `Estorno da baixa ${movimento.id} registrado no titulo financeiro #${titulo.id}`
      }, { transaction });
    }

    conciliacoesReabertas = await reabrirConciliacoesPorMovimentos({
      movimentoIds: [movimento.id],
      usuarioId: req.user?.id || null,
      transaction
    });

    await transaction.commit();

    await registrarEventoSeguranca({
      req,
      usuarioId: req.user?.id || null,
      tipoEvento: 'FINANCIAL_TITLE_REVERSAL',
      recursoTipo: 'TITULO_FINANCEIRO',
      recursoId: titulo.id,
      status: 'SUCCESS',
      descricao: 'Baixa financeira estornada',
      metadata: {
        movimento_id: movimento.id,
        valor_estornado: Number(movimento.valor || 0),
        conciliacoes_reabertas: conciliacoesReabertas
      }
    });

    return carregarTituloPorId(req, titulo.id, { includeMovimentos: true });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function atualizarCobrancaTitulo(req, tituloId, payload = {}) {
  const titulo = await carregarTituloPorId(req, tituloId, { includeMovimentos: false });
  const cobranca = buildUpdatedCobrancaFields(titulo, payload);

  await titulo.update({
    ...cobranca,
    atualizado_por: req.user?.id || null
  });

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'FINANCIAL_COLLECTION_UPDATED',
    recursoTipo: 'TITULO_FINANCEIRO',
    recursoId: titulo.id,
    status: 'SUCCESS',
    descricao: 'Dados de cobranca atualizados no titulo financeiro',
    metadata: {
      forma_cobranca: cobranca.forma_cobranca,
      status_cobranca: cobranca.status_cobranca,
      banco_cobranca: cobranca.banco_cobranca,
      nosso_numero: cobranca.nosso_numero,
      identificador_externo: cobranca.identificador_externo,
      boleto_emitido_em: cobranca.boleto_emitido_em
    }
  });

  return carregarTituloPorId(req, titulo.id, { includeMovimentos: true });
}

function normalizarLabelEventoAuditoria(tipoEvento) {
  switch (String(tipoEvento || '').trim().toUpperCase()) {
    case 'FINANCIAL_TITLE_CREATED':
      return 'Titulo criado';
    case 'FINANCIAL_COLLECTION_UPDATED':
      return 'Cobranca atualizada';
    case 'FINANCIAL_TITLE_SETTLED':
      return 'Baixa registrada';
    case 'FINANCIAL_TITLE_REVERSAL':
      return 'Baixa estornada';
    default:
      return String(tipoEvento || 'Evento financeiro')
        .trim()
        .replace(/_/g, ' ')
        .toLowerCase();
  }
}

function normalizarMetadataAuditoria(metadata) {
  if (!metadata) return {};
  if (typeof metadata === 'object') return metadata;
  try {
    const parsed = JSON.parse(metadata);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function extrairMovimentoIdsAuditoria(metadata = {}) {
  const ids = [metadata.movimento_id, metadata.movimento_financeiro_id];
  if (Array.isArray(metadata.movimentos)) {
    metadata.movimentos.forEach((item) => {
      ids.push(item?.movimento_id, item?.movimento_financeiro_id);
    });
  }

  return [...new Set(ids
    .map((id) => Number(id || 0))
    .filter((id) => Number.isInteger(id) && id > 0))];
}

function serializarEmpresaAuditoria(empresa) {
  if (!empresa) return null;
  return {
    id: empresa.id,
    codigo: empresa.codigo || null,
    nome: empresa.nome || empresa.razao_social || null,
    razao_social: empresa.razao_social || null
  };
}

function serializarContaAuditoria(conta) {
  if (!conta) return null;
  return {
    id: conta.id,
    nome: conta.nome || null,
    banco: conta.banco || null,
    agencia: conta.agencia || null,
    conta: conta.conta || null
  };
}

async function listarAuditoriaTitulo(req, tituloId) {
  const titulo = await carregarTituloPorId(req, tituloId, { includeMovimentos: false });

  const eventos = await SecurityEventLog.findAll({
    where: {
      recurso_tipo: 'TITULO_FINANCEIRO',
      recurso_id: String(titulo.id)
    },
    include: [
      {
        model: User,
        as: 'usuario',
        attributes: ['id', 'nome', 'email']
      }
    ],
    order: [['createdAt', 'DESC']],
    limit: 50
  });

  const eventosComMetadata = eventos.map((evento) => ({
    evento,
    metadata: normalizarMetadataAuditoria(evento.metadata)
  }));
  const movimentoIds = [...new Set(eventosComMetadata.flatMap(({ metadata }) => (
    extrairMovimentoIdsAuditoria(metadata)
  )))];
  const empresaIdsDiretos = [...new Set(eventosComMetadata
    .map(({ metadata }) => Number(metadata.empresa_baixa_id || 0))
    .filter((id) => Number.isInteger(id) && id > 0))];
  const contaIdsDiretos = [...new Set(eventosComMetadata
    .map(({ metadata }) => Number(metadata.conta_bancaria_id || 0))
    .filter((id) => Number.isInteger(id) && id > 0))];

  const [movimentos, empresasDiretas, contasDiretas] = await Promise.all([
    movimentoIds.length
      ? MovimentoFinanceiro.findAll({
          where: { id: { [Op.in]: movimentoIds } },
          attributes: ['id', 'empresa_id', 'conta_bancaria_id'],
          include: [
            {
              model: EmpresaGrupo,
              as: 'empresa',
              required: false,
              attributes: ['id', 'codigo', 'nome', 'razao_social']
            },
            {
              model: ContaBancaria,
              as: 'contaBancaria',
              required: false,
              attributes: ['id', 'nome', 'banco', 'agencia', 'conta']
            }
          ]
        })
      : [],
    empresaIdsDiretos.length
      ? EmpresaGrupo.findAll({
          where: { id: { [Op.in]: empresaIdsDiretos } },
          attributes: ['id', 'codigo', 'nome', 'razao_social']
        })
      : [],
    contaIdsDiretos.length
      ? ContaBancaria.findAll({
          where: { id: { [Op.in]: contaIdsDiretos } },
          attributes: ['id', 'nome', 'banco', 'agencia', 'conta']
        })
      : []
  ]);

  const movimentoMap = new Map(movimentos.map((movimento) => [Number(movimento.id), movimento]));
  const empresaMap = new Map(empresasDiretas.map((empresa) => [Number(empresa.id), empresa]));
  const contaMap = new Map(contasDiretas.map((conta) => [Number(conta.id), conta]));

  return eventosComMetadata.map(({ evento, metadata }) => {
    const fontesFinanceiras = extrairMovimentoIdsAuditoria(metadata)
      .map((movimentoId) => movimentoMap.get(movimentoId))
      .filter(Boolean)
      .map((movimento) => ({
        movimento_id: movimento.id,
        empresa: serializarEmpresaAuditoria(movimento.empresa),
        conta_bancaria: serializarContaAuditoria(movimento.contaBancaria)
      }));

    const empresaDireta = empresaMap.get(Number(metadata.empresa_baixa_id || 0));
    const contaDireta = contaMap.get(Number(metadata.conta_bancaria_id || 0));
    const referenciaDiretaJaRepresentada = fontesFinanceiras.some((fonte) => (
      (!empresaDireta || Number(fonte.empresa?.id || 0) === Number(empresaDireta.id))
      && (!contaDireta || Number(fonte.conta_bancaria?.id || 0) === Number(contaDireta.id))
    ));

    if ((empresaDireta || contaDireta) && !referenciaDiretaJaRepresentada) {
      fontesFinanceiras.push({
        movimento_id: Number(metadata.movimento_id || metadata.movimento_financeiro_id || 0) || null,
        empresa: serializarEmpresaAuditoria(empresaDireta),
        conta_bancaria: serializarContaAuditoria(contaDireta)
      });
    }

    return {
      id: evento.id,
      tipo_evento: evento.tipo_evento,
      label: normalizarLabelEventoAuditoria(evento.tipo_evento),
      status: evento.status,
      descricao: evento.descricao,
      criado_em: evento.createdAt,
      usuario: evento.usuario
        ? {
            id: evento.usuario.id,
            nome: evento.usuario.nome,
            email: evento.usuario.email
          }
        : null,
      metadata: evento.metadata || null,
      fontes_financeiras: fontesFinanceiras
    };
  });
}

async function importarCodigosBarrasTitulos(req, payload = {}) {
  await assertFinanceAccess(req);

  const itens = Array.isArray(payload.itens) ? payload.itens : [];
  if (itens.length === 0) {
    throw createHttpError(400, 'Informe ao menos um titulo para importar codigo de barras.');
  }

  const resultado = {
    importados: 0,
    ignorados: 0,
    erros: []
  };

  for (const [index, item] of itens.entries()) {
    const linha = index + 1;
    const tituloId = Number(item?.id || item?.titulo_id || 0);
    const codigo = String(item?.codigo || item?.codigo_titulo || item?.titulo || '').trim();
    const linhaDigitavel = String(item?.linha_digitavel || item?.linha || '').trim();
    const codigoBarras = String(item?.codigo_barras || item?.barras || '').trim();
    const bancoBoleto = String(item?.banco_boleto || item?.banco || '').trim();

    if (!tituloId && !codigo) {
      resultado.ignorados += 1;
      resultado.erros.push({ linha, erro: 'Informe id ou codigo do titulo.' });
      continue;
    }

    if (!linhaDigitavel && !codigoBarras) {
      resultado.ignorados += 1;
      resultado.erros.push({ linha, titulo: codigo || tituloId, erro: 'Informe linha digitavel ou codigo de barras.' });
      continue;
    }

    const where = tituloId
      ? { id: tituloId }
      : { codigo };
    const titulo = await TituloFinanceiro.findOne({ where });

    if (!titulo) {
      resultado.ignorados += 1;
      resultado.erros.push({ linha, titulo: codigo || tituloId, erro: 'Titulo nao encontrado.' });
      continue;
    }

    if (titulo.obra_id) {
      await assertObraScope(
        req,
        titulo.obra_id,
        'TITULO_FINANCEIRO',
        titulo.id,
        'Usuario sem permissao para importar codigo de barras deste titulo'
      );
    }

    await titulo.update({
      linha_digitavel: linhaDigitavel || titulo.linha_digitavel || null,
      codigo_barras: codigoBarras || titulo.codigo_barras || null,
      banco_boleto: bancoBoleto || titulo.banco_boleto || null
    });

    await registrarEventoSeguranca({
      req,
      usuarioId: req.user?.id || null,
      tipoEvento: 'FINANCIAL_TITLE_BARCODE_IMPORTED',
      recursoTipo: 'TITULO_FINANCEIRO',
      recursoId: String(titulo.id),
      status: 'SUCCESS',
      descricao: 'Codigo de barras/linha digitavel importado em massa',
      metadata: {
        codigo: titulo.codigo,
        linha_digitavel_informada: Boolean(linhaDigitavel),
        codigo_barras_informado: Boolean(codigoBarras)
      }
    });

    resultado.importados += 1;
  }

  return resultado;
}

async function excluirTitulosEmMassa(req, payload = {}) {
  await assertFinanceAccess(req);
  const canDelete = await canDeleteTitulosFinanceiros(req.user);
  if (!canDelete) {
    await registrarEventoSeguranca({
      req,
      usuarioId: req.user?.id || null,
      tipoEvento: 'AUTHZ_DENIED',
      recursoTipo: 'TITULO_FINANCEIRO',
      recursoId: 'excluir-em-massa',
      status: 'DENIED',
      descricao: 'Usuario sem permissao para excluir titulos financeiros'
    });

    throw createHttpError(403, 'Usuario sem permissao para excluir titulos financeiros.');
  }

  const ids = Array.isArray(payload.titulo_ids)
    ? payload.titulo_ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
    : [];

  const idsUnicos = [...new Set(ids)];
  if (idsUnicos.length === 0) {
    throw createHttpError(400, 'Selecione ao menos um titulo para excluir.');
  }

  const titulos = await TituloFinanceiro.unscoped().findAll({
    where: {
      id: { [Op.in]: idsUnicos },
      deleted_at: null
    },
    attributes: ['id', 'codigo', 'status', 'obra_id']
  });

  if (titulos.length !== idsUnicos.length) {
    throw createHttpError(404, 'Um ou mais titulos selecionados nao foram encontrados ou ja foram excluidos.');
  }

  const statusInvalidos = titulos.filter((titulo) => (
    !['ABERTO', 'PARCIAL'].includes(String(titulo.status || '').trim().toUpperCase())
  ));
  if (statusInvalidos.length > 0) {
    throw createHttpError(
      400,
      `Somente titulos abertos ou parciais podem ser excluidos. Revise: ${statusInvalidos.map((titulo) => titulo.codigo || titulo.id).join(', ')}.`
    );
  }

  for (const titulo of titulos) {
    if (titulo.obra_id) {
      await assertObraScope(
        req,
        titulo.obra_id,
        'TITULO_FINANCEIRO',
        titulo.id,
        'Usuario sem permissao para excluir este titulo financeiro'
      );
    }
  }

  const movimentosAtivos = await MovimentoFinanceiro.count({
    where: {
      titulo_financeiro_id: { [Op.in]: idsUnicos },
      status: 'ATIVO'
    }
  });
  if (movimentosAtivos > 0) {
    throw createHttpError(400, 'Nao e possivel excluir titulos com movimentos financeiros ativos. Estorne as baixas antes.');
  }

  const pagamentosAtivos = await PaymentIntent.count({
    where: {
      titulo_financeiro_id: { [Op.in]: idsUnicos },
      status: { [Op.notIn]: PAYMENT_INTENT_INACTIVE_STATUSES }
    }
  });
  if (pagamentosAtivos > 0) {
    throw createHttpError(400, 'Nao e possivel excluir titulos com pagamento bancario ativo.');
  }

  const agora = new Date();
  const motivo = String(payload.motivo || 'Exclusao em massa pela tela de titulos financeiros').trim().slice(0, 255);

  await TituloFinanceiro.unscoped().update(
    {
      status: 'EXCLUIDO',
      deleted_at: agora,
      deleted_by: req.user?.id || null,
      deleted_reason: motivo,
      atualizado_por: req.user?.id || null
    },
    {
      where: {
        id: { [Op.in]: idsUnicos },
        deleted_at: null
      }
    }
  );

  // Titulo de contrato do fluxo novo: o valor volta como saldo para a parcela final e o
  // comprometimento e desfeito (PI-6). Silencioso para titulo que nao e de contrato.
  // require aqui dentro para nao criar ciclo entre os dois servicos.
  const { devolverSaldoDeTitulosExcluidos } = require('./medicaoContratoService');
  await devolverSaldoDeTitulosExcluidos(idsUnicos, { usuarioId: req.user?.id || null, motivo });

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'FINANCIAL_TITLES_SOFT_DELETED',
    recursoTipo: 'TITULO_FINANCEIRO',
    recursoId: idsUnicos.join(','),
    status: 'SUCCESS',
    descricao: 'Titulos financeiros excluidos logicamente em massa',
    metadata: {
      total: idsUnicos.length,
      motivo,
      titulos: titulos.map((titulo) => ({
        id: titulo.id,
        codigo: titulo.codigo
      }))
    }
  });

  return {
    excluidos: idsUnicos.length,
    ids: idsUnicos
  };
}

async function listarChequesTerceirosDisponiveis(req, filters = {}) {
  await assertFinanceAccess(req);

  const where = { status: 'EM_CARTEIRA' };
  const empresaId = Number(filters.empresa_id || 0);
  if (empresaId > 0) where.empresa_id = empresaId;
  const termo = String(filters.q || filters.busca || '').trim();
  if (termo) {
    where[Op.or] = [
      { codigo: { [Op.like]: `%${termo}%` } },
      { numero_cheque: { [Op.like]: `%${termo}%` } },
      { titular_nome: { [Op.like]: `%${termo}%` } },
      { cliente_nome: { [Op.like]: `%${termo}%` } },
      { titular_documento: { [Op.like]: `%${termo}%` } }
    ];
  }

  const limite = Math.min(Math.max(Number(filters.limit || 100), 1), 300);
  const cheques = await ChequeTerceiro.findAll({
    where,
    include: [
      {
        model: Parceiro,
        as: 'parceiroEntregou',
        attributes: ['id', 'nome', 'cpf_cnpj'],
        required: false
      }
    ],
    order: [
      ['data_vencimento', 'ASC'],
      ['id', 'ASC']
    ],
    limit: limite
  });

  return cheques.map((cheque) => (typeof cheque.toJSON === 'function' ? cheque.toJSON() : cheque));
}

module.exports = {
  atualizarCobrancaTitulo,
  atualizarTitulo,
  baixarTitulo,
  baixarTitulosParceladosEmMassa,
  baixarTituloPorConciliacoes,
  carregarTituloPorId,
  criarTituloManual,
  criarTituloManualComBaixaAtomica,
  criarTituloPorSolicitacao,
  estornarMovimentoTitulo,
  excluirTitulosEmMassa,
  importarCodigosBarrasTitulos,
  listarChequesTerceirosDisponiveis,
  listarAuditoriaTitulo,
  listarBaixasRealizadas,
  listarTitulos,
  listarTitulosPorSolicitacao,
  resolverTipoOperacionalFormaPagamento,
  sincronizarRealizacaoCompraPorTitulo,
  sincronizarStatusSolicitacaoPorBaixaTitulos
};
