const {
  ensureAllowedKeys,
  ValidationError,
  sanitizeString
} = require('../middlewares/validation');
const { COMERCIAL_FORMA_RECEBIMENTO } = require('./commercialValidators');
const { TIPOS_INTERCOMPANY } = require('../constants/intercompany');
const {
  CLASSIFICACOES_GERENCIAIS_FINANCEIRAS
} = require('../constants/categoriaFinanceiraGerencial');
const { onlyDigits, isValidCpfCnpj } = require('../utils/cpfCnpj');
const { STATUS_TITULO_FILTROS_CALCULADOS } = require('../utils/tituloFinanceiroStatusFilter');

const CATEGORIAS_BEM = ['VEICULO', 'IMOVEL', 'TERRENO', 'SERVICO', 'MATERIAL', 'CREDITO', 'OUTROS'];
const FORMAS_COBRANCA = ['BOLETO', 'PIX', 'OUTROS'];
const STATUS_COBRANCA = ['NAO_APLICAVEL', 'PENDENTE_EMISSAO', 'EMITIDO', 'PAGO_BANCO', 'CONCILIADO', 'CANCELADO'];
const STATUS_TITULO = ['PREVISAO', 'ABERTO', 'PARCIAL', 'QUITADO', 'CANCELADO', 'ESTORNADO'];
const STATUS_TITULO_INICIAL = ['PREVISAO', 'ABERTO'];
const NATUREZAS_INTERCOMPANY_BAIXA = ['OPERACIONAL_TERCEIRO', 'TRANSFERENCIA_INTERNA', 'REEMBOLSO_COMPENSACAO'];
const CAMPOS_INTERCOMPANY_TITULO = [
  'intercompany_group_id',
  'empresa_origem_id',
  'empresa_destino_id',
  'tipo_intercompany',
  'motivo_intercompany',
  'elimina_consolidado',
  'transferencia_interna'
];

function isBlank(value) {
  return value == null || String(value).trim() === '';
}

function parseInteger(value, fieldName, { required = false, positiveOnly = true } = {}) {
  if (isBlank(value)) {
    if (required) {
      throw new ValidationError(`${fieldName} e obrigatorio.`);
    }
    return undefined;
  }

  const normalized = String(value).trim();
  if (!/^-?\d+$/.test(normalized)) {
    throw new ValidationError(`${fieldName} invalido.`);
  }

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed)) {
    throw new ValidationError(`${fieldName} invalido.`);
  }

  if (positiveOnly && parsed <= 0) {
    throw new ValidationError(`${fieldName} invalido.`);
  }

  return parsed;
}

function parseDecimal(value, fieldName, { required = false, min = null } = {}) {
  if (isBlank(value)) {
    if (required) {
      throw new ValidationError(`${fieldName} e obrigatorio.`);
    }
    return undefined;
  }

  const raw = String(value).trim().replace(/[R$\s]/gi, '');
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw;
  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) {
    throw new ValidationError(`${fieldName} invalido.`);
  }

  if (min != null && parsed < min) {
    throw new ValidationError(`${fieldName} invalido.`);
  }

  return parsed;
}

function parseDateOnly(value, fieldName, { required = false } = {}) {
  if (isBlank(value)) {
    if (required) {
      throw new ValidationError(`${fieldName} e obrigatorio.`);
    }
    return undefined;
  }

  const normalized = sanitizeString(value, fieldName, {
    required: true,
    max: 10,
    pattern: /^\d{4}-\d{2}-\d{2}$/
  });

  const date = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`${fieldName} invalido.`);
  }

  return normalized;
}

function parseOptionalText(value, fieldName, max, { required = false } = {}) {
  if (isBlank(value)) {
    if (required) {
      throw new ValidationError(`${fieldName} e obrigatorio.`);
    }
    return undefined;
  }

  return sanitizeString(value, fieldName, {
    required,
    max
  });
}

function parseOptionalCpfCnpj(value, fieldName) {
  if (isBlank(value)) return undefined;
  if (!isValidCpfCnpj(value)) throw new ValidationError(`${fieldName} invalido.`);
  return onlyDigits(value);
}

function parseNullableText(value, fieldName, max) {
  if (value === undefined) {
    return undefined;
  }
  if (isBlank(value)) {
    return null;
  }

  return sanitizeString(value, fieldName, {
    required: false,
    max
  });
}

function normalizeCodigoBanco(value, fieldName) {
  const codigo = String(value || '').replace(/\D/g, '');
  if (!codigo) {
    throw new ValidationError(`${fieldName} deve conter o codigo numerico do banco.`);
  }
  if (codigo.length > 8) {
    throw new ValidationError(`${fieldName} deve ter no maximo 8 digitos.`);
  }
  return codigo;
}

function parseOptionalCodigoBanco(value, fieldName) {
  if (isBlank(value)) {
    return undefined;
  }
  return normalizeCodigoBanco(value, fieldName);
}

function parseNullableCodigoBanco(value, fieldName) {
  if (value === undefined) {
    return undefined;
  }
  if (isBlank(value)) {
    return null;
  }
  return normalizeCodigoBanco(value, fieldName);
}

function parseParcelasTitulo(value) {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ValidationError('Parcelas devem ser enviadas em lista.');
  }

  return value.map((item, index) => {
    ensureAllowedKeys(
      item || {},
      [
        'valor',
        'data_vencimento',
      'numero_documento',
      'banco_cobranca',
      'linha_digitavel',
      'codigo_barras',
      'observacoes',
      'cheque_numero',
        'cheque_banco',
        'cheque_agencia',
        'cheque_conta',
        'cheque_emitente'
      ],
      `Parcela ${index + 1}`
    );

    return {
      valor: parseDecimal(item?.valor, `Valor da parcela ${index + 1}`, { min: 0.01 }),
      data_vencimento: parseDateOnly(item?.data_vencimento, `Vencimento da parcela ${index + 1}`),
      numero_documento: parseOptionalText(item?.numero_documento, `Documento da parcela ${index + 1}`, 120),
      banco_cobranca: parseOptionalCodigoBanco(item?.banco_cobranca, `Codigo do banco da parcela ${index + 1}`),
      linha_digitavel: parseOptionalText(item?.linha_digitavel, `Linha digitavel da parcela ${index + 1}`, 255),
      codigo_barras: parseOptionalText(item?.codigo_barras, `Codigo de barras da parcela ${index + 1}`, 255),
      observacoes: parseOptionalText(item?.observacoes, `Observacoes da parcela ${index + 1}`, 1000),
      cheque_numero: parseOptionalText(item?.cheque_numero, `Numero do cheque ${index + 1}`, 60),
      cheque_banco: parseOptionalText(item?.cheque_banco, `Banco do cheque ${index + 1}`, 120),
      cheque_agencia: parseOptionalText(item?.cheque_agencia, `Agencia do cheque ${index + 1}`, 40),
      cheque_conta: parseOptionalText(item?.cheque_conta, `Conta do cheque ${index + 1}`, 60),
      cheque_emitente: parseOptionalText(item?.cheque_emitente, `Emitente do cheque ${index + 1}`, 160)
    };
  });
}

function parsePagamentosTitulo(value) {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ValidationError('Pagamentos devem ser enviados em lista.');
  }

  return value.map((item, index) => {
    ensureAllowedKeys(
      item || {},
      [
        'valor',
        'data_vencimento',
        'numero_documento',
        'banco_cobranca',
        'linha_digitavel',
        'codigo_barras',
        'observacoes',
        'parceiro_id',
        'categoria_financeira_id',
        'forma_pagamento_id',
        'cartao_id',
        'quantidade_parcelas',
        'data_compra',
        'parcelas'
      ],
      `Pagamento ${index + 1}`
    );

    return {
      valor: parseDecimal(item?.valor, `Valor do pagamento ${index + 1}`, { min: 0.01 }),
      data_vencimento: parseDateOnly(item?.data_vencimento, `Vencimento do pagamento ${index + 1}`),
      numero_documento: parseOptionalText(item?.numero_documento, `Documento do pagamento ${index + 1}`, 120),
      banco_cobranca: parseOptionalCodigoBanco(item?.banco_cobranca, `Codigo do banco do pagamento ${index + 1}`),
      linha_digitavel: parseOptionalText(item?.linha_digitavel, `Linha digitavel do pagamento ${index + 1}`, 255),
      codigo_barras: parseOptionalText(item?.codigo_barras, `Codigo de barras do pagamento ${index + 1}`, 255),
      observacoes: parseOptionalText(item?.observacoes, `Observacoes do pagamento ${index + 1}`, 1000),
      parceiro_id: parseInteger(item?.parceiro_id, `Parceiro do pagamento ${index + 1}`),
      categoria_financeira_id: parseInteger(item?.categoria_financeira_id, `Categoria financeira do pagamento ${index + 1}`),
      forma_pagamento_id: parseInteger(item?.forma_pagamento_id, `Forma de pagamento ${index + 1}`, { required: true }),
      cartao_id: parseInteger(item?.cartao_id, `Cartao ${index + 1}`),
      quantidade_parcelas: parseInteger(item?.quantidade_parcelas, `Quantidade de parcelas ${index + 1}`),
      data_compra: parseDateOnly(item?.data_compra, `Data da compra ${index + 1}`),
      parcelas: parseParcelasTitulo(item?.parcelas)
    };
  });
}

function parseRateiosTitulo(value) {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ValidationError('Rateios devem ser enviados em lista.');
  }

  return value.map((item, index) => {
    ensureAllowedKeys(
      item || {},
      [
        'obra_id',
        'centro_custo_id',
        'apropriacao_id',
        'tipo_rateio',
        'percentual',
        'valor_rateio',
        'valor',
        'observacoes'
      ],
      `Rateio ${index + 1}`
    );

    const tipoRateio = parseEnum(item?.tipo_rateio, `Tipo de rateio ${index + 1}`, ['PERCENTUAL', 'VALOR']);

    return {
      obra_id: parseInteger(item?.obra_id || item?.centro_custo_id, `Obra do rateio ${index + 1}`),
      apropriacao_id: parseInteger(item?.apropriacao_id, `Apropriacao do rateio ${index + 1}`),
      tipo_rateio: tipoRateio,
      percentual: tipoRateio === 'PERCENTUAL'
        ? parseDecimal(item?.percentual, `Percentual do rateio ${index + 1}`, { min: 0.000001 })
        : parseDecimal(item?.percentual, `Percentual do rateio ${index + 1}`, { min: 0 }),
      valor_rateio: tipoRateio === 'VALOR'
        ? parseDecimal(
          item?.valor_rateio != null ? item.valor_rateio : item?.valor,
          `Valor do rateio ${index + 1}`,
          { min: 0.01 }
        )
        : parseDecimal(
          item?.valor_rateio != null ? item.valor_rateio : item?.valor,
          `Valor do rateio ${index + 1}`,
          { min: 0 }
        ),
      observacoes: parseOptionalText(item?.observacoes, `Observacoes do rateio ${index + 1}`, 1000)
    };
  });
}

function parseImpostosTitulo(value) {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ValidationError('Impostos devem ser enviados em lista.');
  }

  return value.map((item, index) => {
    ensureAllowedKeys(
      item || {},
      [
        'tipo_imposto',
        'tipo',
        'descricao',
        'natureza',
        'base_calculo',
        'aliquota',
        'valor',
        'observacoes'
      ],
      `Imposto ${index + 1}`
    );

    return {
      tipo_imposto: parseOptionalText(item?.tipo_imposto || item?.tipo, `Tipo do imposto ${index + 1}`, 60),
      descricao: parseOptionalText(item?.descricao, `Descricao do imposto ${index + 1}`, 180),
      natureza: parseEnum(item?.natureza, `Natureza do imposto ${index + 1}`, ['RETENCAO', 'ACRESCIMO']),
      base_calculo: parseDecimal(item?.base_calculo, `Base do imposto ${index + 1}`, { min: 0 }),
      aliquota: parseDecimal(item?.aliquota, `Aliquota do imposto ${index + 1}`, { min: 0 }),
      valor: parseDecimal(item?.valor, `Valor do imposto ${index + 1}`, { min: 0.01 }),
      observacoes: parseOptionalText(item?.observacoes, `Observacoes do imposto ${index + 1}`, 1000)
    };
  });
}

function parseEnum(value, fieldName, allowedValues = [], { required = false } = {}) {
  if (isBlank(value)) {
    if (required) {
      throw new ValidationError(`${fieldName} e obrigatorio.`);
    }
    return undefined;
  }

  const normalized = String(value).trim().toUpperCase();
  if (!allowedValues.includes(normalized)) {
    throw new ValidationError(`${fieldName} invalido.`);
  }

  return normalized;
}

function parseNullableEnum(value, fieldName, allowedValues = []) {
  if (value === undefined) {
    return undefined;
  }
  if (isBlank(value)) {
    return null;
  }

  return parseEnum(value, fieldName, allowedValues, { required: false });
}

function parseNullableDateOnly(value, fieldName) {
  if (value === undefined) {
    return undefined;
  }
  if (isBlank(value)) {
    return null;
  }

  return parseDateOnly(value, fieldName, { required: false });
}

function parseBoolean(value, fieldName) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'sim'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'nao', 'não'].includes(normalized)) {
    return false;
  }

  throw new ValidationError(`${fieldName} invalido.`);
}

function validateFinanceTituloQuery(query = {}) {
  ensureAllowedKeys(
    query,
    [
      'tipo',
      'status',
      'q',
      'codigo',
      'empresa_id',
      'obra_id',
      'apropriacao_id',
      'parceiro_id',
      'categoria_financeira_id',
      'forma_pagamento_id',
      'cartao_id',
      'solicitacao_id',
      'numero_documento',
      'descricao',
      'valor_min',
      'valor_max',
      'data_emissao_inicial',
      'data_emissao_final',
      'vencimento_inicial',
      'vencimento_final',
      'paginated',
      'page',
      'limit'
    ],
    'Consulta de titulos financeiros'
  );

  const dataEmissaoInicial = parseDateOnly(query.data_emissao_inicial, 'Emissao inicial');
  const dataEmissaoFinal = parseDateOnly(query.data_emissao_final, 'Emissao final');
  const vencimentoInicial = parseDateOnly(query.vencimento_inicial, 'Vencimento inicial');
  const vencimentoFinal = parseDateOnly(query.vencimento_final, 'Vencimento final');
  const valorMinimo = parseDecimal(query.valor_min, 'Valor minimo', { min: 0 });
  const valorMaximo = parseDecimal(query.valor_max, 'Valor maximo', { min: 0 });

  if (dataEmissaoInicial && dataEmissaoFinal && dataEmissaoInicial > dataEmissaoFinal) {
    throw new ValidationError('Emissao inicial nao pode ser maior que emissao final.');
  }

  if (vencimentoInicial && vencimentoFinal && vencimentoInicial > vencimentoFinal) {
    throw new ValidationError('Vencimento inicial nao pode ser maior que vencimento final.');
  }

  if (valorMinimo !== undefined && valorMaximo !== undefined && valorMinimo > valorMaximo) {
    throw new ValidationError('Valor minimo nao pode ser maior que valor maximo.');
  }

  return {
    tipo: parseEnum(query.tipo, 'Tipo', ['PAGAR', 'RECEBER']),
    status: parseEnum(query.status, 'Status', [
      ...STATUS_TITULO,
      ...STATUS_TITULO_FILTROS_CALCULADOS,
      'ATIVA',
      'CANCELADA'
    ]),
    q: parseOptionalText(query.q, 'Busca', 120),
    codigo: parseOptionalText(query.codigo, 'Codigo do titulo', 40),
    empresa_id: parseInteger(query.empresa_id, 'Empresa do grupo'),
    obra_id: parseInteger(query.obra_id, 'Obra'),
    parceiro_id: parseInteger(query.parceiro_id, 'Parceiro'),
    categoria_financeira_id: parseInteger(query.categoria_financeira_id, 'Categoria financeira'),
    forma_pagamento_id: parseInteger(query.forma_pagamento_id, 'Forma de pagamento'),
    cartao_id: parseInteger(query.cartao_id, 'Cartao'),
    solicitacao_id: parseInteger(query.solicitacao_id, 'Solicitacao'),
    numero_documento: parseOptionalText(query.numero_documento, 'Numero do documento', 120),
    descricao: parseOptionalText(query.descricao, 'Descricao', 120),
    valor_min: valorMinimo,
    valor_max: valorMaximo,
    data_emissao_inicial: dataEmissaoInicial,
    data_emissao_final: dataEmissaoFinal,
    vencimento_inicial: vencimentoInicial,
    vencimento_final: vencimentoFinal,
    paginated: parseBoolean(query.paginated, 'Paginado'),
    page: parseInteger(query.page, 'Pagina'),
    limit: parseOptionalText(query.limit, 'Limite', 20)
  };
}

function validateFinanceFluxoCaixaQuery(query = {}) {
  ensureAllowedKeys(
    query,
    ['periodo', 'data_inicial', 'data_final', 'obra_id'],
    'Consulta de fluxo de caixa'
  );

  const dataInicial = parseDateOnly(query.data_inicial, 'Data inicial');
  const dataFinal = parseDateOnly(query.data_final, 'Data final');

  if ((dataInicial && !dataFinal) || (!dataInicial && dataFinal)) {
    throw new ValidationError('Informe data inicial e data final para o filtro personalizado.');
  }

  if (dataInicial && dataFinal && dataInicial > dataFinal) {
    throw new ValidationError('Data inicial nao pode ser maior que a data final.');
  }

  return {
    periodo: parseEnum(
      query.periodo,
      'Periodo',
      ['HOJE', '7_DIAS', '30_DIAS', '90_DIAS', 'MES_ATUAL', 'PROXIMO_MES', 'PERSONALIZADO']
    ),
    data_inicial: dataInicial,
    data_final: dataFinal,
    obra_id: parseInteger(query.obra_id, 'Obra')
  };
}

function validateFinanceFluxoConsolidadoQuery(query = {}) {
  ensureAllowedKeys(
    query,
    [
      'periodo',
      'data_inicial',
      'data_final',
      'holding_id',
      'empresa_id',
      'obra_id',
      'excluir_intercompany'
    ],
    'Consulta de fluxo de caixa consolidado'
  );

  const base = validateFinanceFluxoCaixaQuery({
    periodo: query.periodo,
    data_inicial: query.data_inicial,
    data_final: query.data_final,
    obra_id: query.obra_id
  });

  return {
    ...base,
    holding_id: parseInteger(query.holding_id, 'Holding'),
    empresa_id: parseInteger(query.empresa_id, 'Empresa do grupo'),
    excluir_intercompany: parseBoolean(query.excluir_intercompany, 'Excluir entre empresas')
  };
}

function validateFinanceDreQuery(query = {}) {
  ensureAllowedKeys(
    query,
    ['periodo', 'data_inicial', 'data_final', 'empresa_id', 'holding_id', 'obra_id', 'excluir_intercompany'],
    'Consulta de DRE'
  );

  const base = validateFinanceFluxoCaixaQuery({
    periodo: query.periodo,
    data_inicial: query.data_inicial,
    data_final: query.data_final,
    obra_id: query.obra_id
  });

  return {
    ...base,
    empresa_id: parseInteger(query.empresa_id, 'Empresa do grupo'),
    holding_id: parseInteger(query.holding_id, 'Holding'),
    excluir_intercompany: parseBoolean(query.excluir_intercompany, 'Excluir entre empresas')
  };
}

function validateFinanceDreComparativoQuery(query = {}) {
  ensureAllowedKeys(
    query,
    ['periodo', 'data_inicial', 'data_final', 'empresa_id', 'holding_id', 'obra_id', 'excluir_intercompany', 'meses'],
    'Consulta de comparativo mensal da DRE'
  );

  const base = validateFinanceDreQuery({
    periodo: query.periodo,
    data_inicial: query.data_inicial,
    data_final: query.data_final,
    empresa_id: query.empresa_id,
    holding_id: query.holding_id,
    obra_id: query.obra_id,
    excluir_intercompany: query.excluir_intercompany
  });
  const meses = parseInteger(query.meses, 'Meses');

  return {
    ...base,
    meses: meses ? Math.min(Math.max(meses, 1), 24) : undefined
  };
}

function validateFinanceEndividamentoQuery(query = {}) {
  ensureAllowedKeys(
    query,
    ['periodo', 'data_inicial', 'data_final', 'empresa_id', 'holding_id', 'obra_id', 'excluir_intercompany', 'limit'],
    'Consulta de endividamento financeiro'
  );

  const base = validateFinanceFluxoCaixaQuery({
    periodo: query.periodo,
    data_inicial: query.data_inicial,
    data_final: query.data_final,
    obra_id: query.obra_id
  });
  const limit = parseInteger(query.limit, 'Limite');

  return {
    ...base,
    empresa_id: parseInteger(query.empresa_id, 'Empresa do grupo'),
    holding_id: parseInteger(query.holding_id, 'Holding'),
    excluir_intercompany: parseBoolean(query.excluir_intercompany, 'Excluir entre empresas'),
    limit: limit ? Math.min(limit, 500) : undefined
  };
}

function validateFinanceFinanciamentoBancarioQuery(query = {}) {
  ensureAllowedKeys(
    query,
    [
        'status',
        'q',
        'empresa_id',
        'conta_bancaria_id',
        'parceiro_id',
        'limit'
      ],
    'Consulta de financiamentos bancarios'
  );

  const limit = parseInteger(query.limit, 'Limite');

  return {
    status: parseEnum(query.status, 'Status', ['RASCUNHO', 'ATIVO', 'LIQUIDADO', 'CANCELADO']),
      q: parseOptionalText(query.q, 'Busca', 120),
      empresa_id: parseInteger(query.empresa_id, 'Empresa do grupo'),
      conta_bancaria_id: parseInteger(query.conta_bancaria_id, 'Conta bancaria'),
      parceiro_id: parseInteger(query.parceiro_id, 'Instituicao financeira'),
      limit: limit ? Math.min(limit, 500) : undefined
    };
}

function validateFinanceFinanciamentoBancarioCreateBody(body = {}) {
  ensureAllowedKeys(
      body,
      [
        'conta_bancaria_id',
        'empresa_id',
        'parceiro_id',
        'categoria_financeira_id',
        'numero_contrato',
      'documento_referencia',
      'tipo_contrato',
      'sistema_amortizacao',
      'taxa_juros_mensal',
      'data_contrato',
      'data_credito',
      'primeiro_vencimento',
      'quantidade_parcelas',
      'valor_credito',
      'valor_juros_total',
      'valor_iof',
      'valor_tarifas',
      'observacoes'
    ],
    'Cadastro de financiamento bancario'
  );

  const dataContrato = parseDateOnly(body.data_contrato, 'Data do contrato', { required: true });
  const dataCredito = parseDateOnly(body.data_credito, 'Data do credito', { required: true });
  const primeiroVencimento = parseDateOnly(body.primeiro_vencimento, 'Primeiro vencimento', { required: true });
  const quantidadeParcelas = parseInteger(body.quantidade_parcelas, 'Quantidade de parcelas', { required: true });

  if (quantidadeParcelas > 240) {
    throw new ValidationError('Quantidade de parcelas nao pode ser maior que 240.');
  }

    return {
      conta_bancaria_id: parseInteger(body.conta_bancaria_id, 'Conta bancaria do credito', { required: true }),
      empresa_id: parseInteger(body.empresa_id, 'Empresa do grupo', { required: true }),
      parceiro_id: parseInteger(body.parceiro_id, 'Instituicao financeira', { required: true }),
    categoria_financeira_id: parseInteger(body.categoria_financeira_id, 'Categoria financeira das parcelas', { required: true }),
    numero_contrato: parseOptionalText(body.numero_contrato, 'Numero do contrato', 120, { required: true }),
    documento_referencia: parseOptionalText(body.documento_referencia, 'Documento de referencia', 120),
    tipo_contrato: parseOptionalText(body.tipo_contrato, 'Tipo de contrato', 80),
    sistema_amortizacao: parseEnum(body.sistema_amortizacao || 'FIXO', 'Sistema de amortizacao', ['FIXO', 'PRICE', 'SAC']),
    taxa_juros_mensal: parseDecimal(body.taxa_juros_mensal, 'Taxa de juros mensal', { min: 0 }),
    data_contrato: dataContrato,
    data_credito: dataCredito,
    primeiro_vencimento: primeiroVencimento,
    quantidade_parcelas: quantidadeParcelas,
    valor_credito: parseDecimal(body.valor_credito, 'Valor do credito', { required: true, min: 0.01 }),
    valor_juros_total: parseDecimal(body.valor_juros_total, 'Valor total de juros', { min: 0 }),
    valor_iof: parseDecimal(body.valor_iof, 'Valor de IOF', { min: 0 }),
    valor_tarifas: parseDecimal(body.valor_tarifas, 'Valor de tarifas', { min: 0 }),
    observacoes: parseOptionalText(body.observacoes, 'Observacoes', 4000)
  };
}

function validateFinanceIntercompanyQuery(query = {}) {
  ensureAllowedKeys(
    query,
    [
      'periodo',
      'data_inicial',
      'data_final',
      'holding_id',
      'empresa_id',
      'tipo_intercompany',
      'status',
      'elimina_consolidado',
      'limit'
    ],
    'Consulta de movimentos entre empresas'
  );

  const base = validateFinanceFluxoCaixaQuery({
    periodo: query.periodo,
    data_inicial: query.data_inicial,
    data_final: query.data_final
  });
  const limit = parseInteger(query.limit, 'Limite');

  return {
    ...base,
    holding_id: parseInteger(query.holding_id, 'Holding'),
    empresa_id: parseInteger(query.empresa_id, 'Empresa do grupo'),
    tipo_intercompany: parseEnum(query.tipo_intercompany, 'Tipo', TIPOS_INTERCOMPANY),
    status: parseEnum(query.status, 'Status', [...STATUS_TITULO, 'ATIVA', 'CANCELADA']),
    elimina_consolidado: parseBoolean(query.elimina_consolidado, 'Eliminar no consolidado'),
    limit: limit ? Math.min(limit, 1000) : undefined
  };
}

function validateFinanceBaixasQuery(query = {}) {
  ensureAllowedKeys(
    query,
    [
      'tipo',
      'status_movimento',
      'q',
      'obra_id',
      'parceiro_id',
      'categoria_financeira_id',
      'conta_bancaria_id',
      'data_inicial',
      'data_final',
      'limit'
    ],
    'Consulta de baixas financeiras'
  );

  const dataInicial = parseDateOnly(query.data_inicial, 'Data inicial');
  const dataFinal = parseDateOnly(query.data_final, 'Data final');

  if (dataInicial && dataFinal && dataInicial > dataFinal) {
    throw new ValidationError('Data inicial nao pode ser maior que data final.');
  }

  const limit = parseInteger(query.limit, 'Limite');

  return {
    tipo: parseEnum(query.tipo, 'Tipo', ['PAGAR', 'RECEBER']),
    status_movimento: parseEnum(query.status_movimento, 'Status da baixa', ['ATIVO', 'ESTORNADO', 'TODOS']),
    q: parseOptionalText(query.q, 'Busca', 120),
    obra_id: parseInteger(query.obra_id, 'Obra'),
    parceiro_id: parseInteger(query.parceiro_id, 'Parceiro'),
    categoria_financeira_id: parseInteger(query.categoria_financeira_id, 'Categoria financeira'),
    conta_bancaria_id: parseInteger(query.conta_bancaria_id, 'Conta bancaria'),
    data_inicial: dataInicial,
    data_final: dataFinal,
    limit: limit ? Math.min(limit, 500) : undefined
  };
}

function validateFinanceRelatorioAnaliticoQuery(query = {}) {
  ensureAllowedKeys(
    query,
    [
      'tipo',
      'status_titulo',
      'status_movimento',
      'q',
      'obra_id',
      'parceiro_id',
      'categoria_financeira_id',
      'conta_bancaria_id',
      'data_inicial',
      'data_final',
      'vencimento_inicial',
      'vencimento_final',
      'limit'
    ],
    'Consulta de relatorio financeiro analitico'
  );

  const dataInicial = parseDateOnly(query.data_inicial, 'Data inicial');
  const dataFinal = parseDateOnly(query.data_final, 'Data final');
  const vencimentoInicial = parseDateOnly(query.vencimento_inicial, 'Vencimento inicial');
  const vencimentoFinal = parseDateOnly(query.vencimento_final, 'Vencimento final');

  if (dataInicial && dataFinal && dataInicial > dataFinal) {
    throw new ValidationError('Data inicial nao pode ser maior que data final.');
  }

  if (vencimentoInicial && vencimentoFinal && vencimentoInicial > vencimentoFinal) {
    throw new ValidationError('Vencimento inicial nao pode ser maior que vencimento final.');
  }

  const limit = parseInteger(query.limit, 'Limite');

  return {
    tipo: parseEnum(query.tipo, 'Tipo', ['PAGAR', 'RECEBER']),
    status_titulo: parseEnum(query.status_titulo, 'Status do titulo', STATUS_TITULO),
    status_movimento: parseEnum(query.status_movimento, 'Status da baixa', ['ATIVO', 'ESTORNADO', 'TODOS', 'SEM_BAIXA']),
    q: parseOptionalText(query.q, 'Busca', 120),
    obra_id: parseInteger(query.obra_id, 'Obra'),
    parceiro_id: parseInteger(query.parceiro_id, 'Parceiro'),
    categoria_financeira_id: parseInteger(query.categoria_financeira_id, 'Categoria financeira'),
    conta_bancaria_id: parseInteger(query.conta_bancaria_id, 'Conta bancaria'),
    data_inicial: dataInicial,
    data_final: dataFinal,
    vencimento_inicial: vencimentoInicial,
    vencimento_final: vencimentoFinal,
    limit: limit ? Math.min(limit, 1000) : undefined
  };
}

function validateFinanceiroObrasQuery(query = {}) {
  ensureAllowedKeys(
    query,
    [
      'analise',
      'periodo',
      'data_inicial',
      'data_final',
      'obra_id',
      'empresa_id',
      'tipo',
      'parceiro_id',
      'categoria_financeira_id',
      'incluir_historico',
      'q',
      'limit'
    ],
    'Consulta de financeiro de obras'
  );

  const dataInicial = parseDateOnly(query.data_inicial, 'Data inicial');
  const dataFinal = parseDateOnly(query.data_final, 'Data final');

  if (dataInicial && dataFinal && dataInicial > dataFinal) {
    throw new ValidationError('Data inicial nao pode ser maior que data final.');
  }

  const limit = parseInteger(query.limit, 'Limite');

  return {
    analise: parseEnum(query.analise, 'Analise', ['REALIZADO', 'COMPROMETIDO', 'A_REALIZAR']),
    periodo: parseEnum(query.periodo, 'Periodo', ['HOJE', '7_DIAS', '30_DIAS', '90_DIAS', 'MES_ATUAL', 'PROXIMO_MES', 'PERSONALIZADO']),
    data_inicial: dataInicial,
    data_final: dataFinal,
    obra_id: parseInteger(query.obra_id, 'Obra'),
    empresa_id: parseInteger(query.empresa_id, 'Empresa'),
    tipo: parseEnum(query.tipo, 'Tipo', ['PAGAR', 'RECEBER']),
    parceiro_id: parseInteger(query.parceiro_id, 'Parceiro'),
    categoria_financeira_id: parseInteger(query.categoria_financeira_id, 'Categoria financeira'),
    incluir_historico: parseBoolean(query.incluir_historico, 'Incluir historico legado'),
    q: parseOptionalText(query.q, 'Busca', 120),
    limit: limit ? Math.min(limit, 3000) : undefined
  };
}

function validateFinanceConciliacaoQuery(query = {}) {
  ensureAllowedKeys(
    query,
    ['status', 'conta_bancaria_id', 'data_inicial', 'data_final', 'page', 'page_size'],
    'Consulta de conciliacao bancaria'
  );

  const dataInicial = parseDateOnly(query.data_inicial, 'Data inicial');
  const dataFinal = parseDateOnly(query.data_final, 'Data final');

  if (dataInicial && dataFinal && dataInicial > dataFinal) {
    throw new ValidationError('Data inicial nao pode ser maior que a data final.');
  }

  return {
    status: parseEnum(query.status, 'Status', ['PENDENTE', 'CONCILIADO', 'IGNORADO', 'TODOS']),
    conta_bancaria_id: parseInteger(query.conta_bancaria_id, 'Conta bancaria'),
    data_inicial: dataInicial,
    data_final: dataFinal,
    page: parseInteger(query.page, 'Pagina'),
    page_size: parseInteger(query.page_size, 'Quantidade por pagina')
  };
}

function validateFinanceConciliacaoImportacoesQuery(query = {}) {
  ensureAllowedKeys(
    query,
    ['conta_bancaria_id', 'data_inicial', 'data_final', 'limit'],
    'Historico de importacoes OFX'
  );

  const dataInicial = parseDateOnly(query.data_inicial, 'Data inicial');
  const dataFinal = parseDateOnly(query.data_final, 'Data final');

  if (dataInicial && dataFinal && dataInicial > dataFinal) {
    throw new ValidationError('Data inicial nao pode ser maior que a data final.');
  }

  return {
    conta_bancaria_id: parseInteger(query.conta_bancaria_id, 'Conta bancaria'),
    data_inicial: dataInicial,
    data_final: dataFinal,
    limit: parseInteger(query.limit, 'Limite')
  };
}

function validateFinanceConciliacaoImportBody(body = {}) {
  ensureAllowedKeys(
    body,
    ['conta_bancaria_id'],
    'Importacao de OFX'
  );

  return {
    conta_bancaria_id: parseInteger(body.conta_bancaria_id, 'Conta bancaria')
  };
}

function validateFinanceConciliacaoConfirmBody(body = {}) {
  ensureAllowedKeys(
    body,
    ['movimento_financeiro_id', 'movimento_financeiro_ids'],
    'Confirmacao de conciliacao bancaria'
  );

  const movimentoIds = Array.isArray(body.movimento_financeiro_ids)
    ? [...new Set(body.movimento_financeiro_ids
      .map((id) => parseInteger(id, 'Movimento financeiro'))
      .filter(Boolean))]
    : [];

  return {
    movimento_financeiro_id: movimentoIds.length
      ? undefined
      : parseInteger(body.movimento_financeiro_id, 'Movimento financeiro', { required: true }),
    movimento_financeiro_ids: movimentoIds
  };
}

function validateFinanceConciliacaoCorrigirContaBody(body = {}) {
  ensureAllowedKeys(
    body,
    ['conta_bancaria_id', 'motivo'],
    'Correcao da conta da conciliacao bancaria'
  );

  return {
    conta_bancaria_id: parseInteger(body.conta_bancaria_id, 'Conta bancaria', { required: true }),
    motivo: parseOptionalText(body.motivo, 'Justificativa', 255, { required: true })
  };
}

function validateFinanceConciliacaoTransferenciaBody(body = {}) {
  ensureAllowedKeys(
    body,
    ['conta_contraparte_id', 'tipo_transferencia', 'descricao', 'tipo_intercompany', 'motivo_intercompany', 'elimina_consolidado'],
    'Conciliacao bancaria por transferencia'
  );

  return {
    conta_contraparte_id: parseInteger(body.conta_contraparte_id, 'Conta contraparte', { required: true }),
    tipo_transferencia: parseEnum(body.tipo_transferencia, 'Tipo de transferencia', ['ENTRE_EMPRESAS', 'MESMA_TITULARIDADE']),
    descricao: parseOptionalText(body.descricao, 'Descricao', 255),
    tipo_intercompany: parseEnum(body.tipo_intercompany, 'Tipo', TIPOS_INTERCOMPANY),
    motivo_intercompany: parseOptionalText(body.motivo_intercompany, 'Motivo', 255),
    elimina_consolidado: parseBoolean(body.elimina_consolidado, 'Eliminar no consolidado')
  };
}

function validateFinanceConciliacaoEstornoTransferenciaBody(body = {}) {
  ensureAllowedKeys(
    body,
    ['motivo'],
    'Estorno de conciliacao bancaria'
  );

  return {
    motivo: parseOptionalText(body.motivo, 'Motivo do estorno', 255, { required: true })
  };
}

function validateFinanceRelatorioConciliacaoQuery(query = {}) {
  ensureAllowedKeys(
    query,
    ['periodo', 'data_inicial', 'data_final', 'conta_bancaria_id', 'status', 'tipo_conciliacao', 'natureza', 'busca'],
    'Consulta do relatorio de conciliacao bancaria'
  );

  const dataInicial = parseDateOnly(query.data_inicial, 'Data inicial');
  const dataFinal = parseDateOnly(query.data_final, 'Data final');
  if ((dataInicial && !dataFinal) || (!dataInicial && dataFinal)) {
    throw new ValidationError('Informe data inicial e data final para o filtro personalizado.');
  }
  if (dataInicial && dataFinal && dataInicial > dataFinal) {
    throw new ValidationError('Data inicial nao pode ser maior que a data final.');
  }

  return {
    periodo: parseEnum(query.periodo, 'Periodo', ['HOJE', '7_DIAS', '30_DIAS', '90_DIAS', 'MES_ATUAL', 'PROXIMO_MES', 'PERSONALIZADO']),
    data_inicial: dataInicial,
    data_final: dataFinal,
    conta_bancaria_id: parseInteger(query.conta_bancaria_id, 'Conta bancaria'),
    status: parseEnum(query.status, 'Status', ['TODOS', 'CONCILIADO', 'PENDENTE', 'IGNORADO', 'REMOVIDO']),
    tipo_conciliacao: parseEnum(query.tipo_conciliacao, 'Tipo de conciliacao', ['TODOS', 'TRANSFERENCIA', 'TITULO', 'FATURA_CARTAO', 'TARIFA', 'ESTORNO_TARIFA', 'ESTORNO_BANCARIO', 'CREDITO_ROTATIVO', 'MOVIMENTO', 'SEM_VINCULO']),
    natureza: parseEnum(query.natureza, 'Natureza', ['TODAS', 'ENTRADA', 'SAIDA']),
    busca: parseOptionalText(query.busca, 'Busca', 120)
  };
}

function validateFinanceConciliacaoTarifaBody(body = {}) {
  ensureAllowedKeys(
    body,
    ['codigo', 'descricao'],
    'Conciliacao bancaria por tarifa'
  );

  return {
    codigo: parseOptionalText(body.codigo, 'Codigo da tarifa', 80, { required: true }),
    descricao: parseOptionalText(body.descricao, 'Descricao', 255)
  };
}

function validateFinanceConciliacaoEstornoTarifaBody(body = {}) {
  ensureAllowedKeys(
    body,
    ['codigo', 'movimento_tarifa_id', 'descricao'],
    'Conciliacao bancaria por estorno de tarifa'
  );

  const codigo = parseOptionalText(body.codigo, 'Codigo da tarifa', 80);
  const movimentoTarifaId = parseInteger(body.movimento_tarifa_id, 'Movimento da tarifa');
  if (!codigo && !movimentoTarifaId) {
    throw new ValidationError('Codigo da tarifa e obrigatorio.');
  }

  return {
    codigo,
    movimento_tarifa_id: movimentoTarifaId,
    descricao: parseOptionalText(body.descricao, 'Descricao', 255)
  };
}

function validateFinanceConciliacaoEstornoBancarioBody(body = {}) {
  ensureAllowedKeys(
    body,
    ['conciliacao_origem_id', 'motivo'],
    'Confirmacao de estorno bancario'
  );

  return {
    conciliacao_origem_id: parseInteger(body.conciliacao_origem_id, 'Lancamento bancario original', { required: true }),
    motivo: parseOptionalText(body.motivo, 'Justificativa', 255, { required: true })
  };
}

function validateFinanceConciliacaoCreditoRotativoBody(body = {}) {
  ensureAllowedKeys(
    body,
    ['descricao'],
    'Conciliacao bancaria de credito rotativo'
  );

  return {
    descricao: parseOptionalText(body.descricao, 'Descricao', 255)
  };
}

function validateFinanceConciliacaoCriarTituloBody(body = {}) {
  ensureAllowedKeys(
    body,
    [
      'tipo',
      'obra_id',
      'parceiro_id',
      'valor',
      'data_vencimento',
      'data_emissao',
      'descricao',
      'empresa_id',
      'categoria_financeira_id',
      'observacoes',
      'numero_documento',
      'competencia_data',
      'considera_dre',
      'conta_bancaria_id',
      'forma_recebimento',
      'tipo_permuta',
      'categoria_bem',
      'descricao_bem',
      'valor_referencia_bem',
      'documento_referencia',
      'juros',
      'multa',
      'desconto',
      'data_movimento'
    ],
    'Criacao rapida de titulo na conciliacao bancaria'
  );

  const formaRecebimento = parseEnum(
    body.forma_recebimento,
    'Forma de recebimento',
    COMERCIAL_FORMA_RECEBIMENTO,
    { required: true }
  );

  return {
    tipo: parseEnum(body.tipo, 'Tipo', ['PAGAR', 'RECEBER'], { required: true }),
    obra_id: parseInteger(body.obra_id, 'Obra', { required: true }),
    parceiro_id: parseInteger(body.parceiro_id, 'Parceiro', { required: true }),
    valor: parseDecimal(body.valor, 'Valor', { required: true, min: 0.01 }),
    data_vencimento: parseDateOnly(body.data_vencimento, 'Data de vencimento', { required: true }),
    data_emissao: parseDateOnly(body.data_emissao, 'Data de emissao'),
    descricao: parseOptionalText(body.descricao, 'Descricao', 255, { required: true }),
    empresa_id: parseInteger(body.empresa_id, 'Empresa pagadora', { required: true }),
    categoria_financeira_id: parseInteger(body.categoria_financeira_id, 'Categoria financeira', { required: true }),
    observacoes: parseOptionalText(body.observacoes, 'Observacoes', 4000),
    numero_documento: parseOptionalText(body.numero_documento, 'Numero do documento', 120),
    competencia_data: parseDateOnly(body.competencia_data, 'Data de competencia'),
    considera_dre: parseBoolean(body.considera_dre, 'Considera DRE'),
    conta_bancaria_id: parseInteger(body.conta_bancaria_id, 'Conta bancaria', { required: true }),
    forma_recebimento: formaRecebimento,
    tipo_permuta: parseOptionalText(body.tipo_permuta, 'Tipo de permuta', 80),
    categoria_bem: parseEnum(body.categoria_bem, 'Categoria do bem', CATEGORIAS_BEM),
    descricao_bem: parseOptionalText(body.descricao_bem, 'Descricao do bem', 255),
    valor_referencia_bem: parseDecimal(body.valor_referencia_bem, 'Valor de referencia do bem', { min: 0 }),
    documento_referencia: parseOptionalText(body.documento_referencia, 'Documento de referencia', 120),
    juros: parseDecimal(body.juros, 'Juros', { min: 0 }),
    multa: parseDecimal(body.multa, 'Multa', { min: 0 }),
    desconto: parseDecimal(body.desconto, 'Desconto', { min: 0 }),
    data_movimento: parseDateOnly(body.data_movimento, 'Data do movimento', { required: true })
  };
}

function validateFinanceConciliacaoConciliarSugeridosBody(body = {}) {
  ensureAllowedKeys(
    body,
    ['conta_bancaria_id', 'data_inicial', 'data_final', 'status'],
    'Conciliacao em lote por sugestoes'
  );

  const dataInicial = parseDateOnly(body.data_inicial, 'Data inicial');
  const dataFinal = parseDateOnly(body.data_final, 'Data final');

  if (dataInicial && dataFinal && dataInicial > dataFinal) {
    throw new ValidationError('Data inicial nao pode ser maior que a data final.');
  }

  return {
    conta_bancaria_id: parseInteger(body.conta_bancaria_id, 'Conta bancaria'),
    data_inicial: dataInicial,
    data_final: dataFinal,
    status: parseEnum(body.status, 'Status', ['PENDENTE', 'TODOS'])
  };
}

function validateFinanceConciliacaoMovimentosQuery(query = {}) {
  ensureAllowedKeys(
    query,
    ['data_inicial', 'data_final', 'documento', 'numero_documento', 'valor_inicial', 'valor_final', 'limit'],
    'Consulta de movimentos para associacao manual'
  );

  const dataInicial = parseDateOnly(query.data_inicial, 'Data inicial');
  const dataFinal = parseDateOnly(query.data_final, 'Data final');
  const valorInicial = parseDecimal(query.valor_inicial, 'Valor inicial', { min: 0 });
  const valorFinal = parseDecimal(query.valor_final, 'Valor final', { min: 0 });

  if (dataInicial && dataFinal && dataInicial > dataFinal) {
    throw new ValidationError('Data inicial nao pode ser maior que a data final.');
  }

  if (
    valorInicial !== undefined &&
    valorFinal !== undefined &&
    valorInicial > valorFinal
  ) {
    throw new ValidationError('Valor inicial nao pode ser maior que o valor final.');
  }

  return {
    data_inicial: dataInicial,
    data_final: dataFinal,
    documento: parseOptionalText(query.documento, 'Documento', 120),
    numero_documento: parseOptionalText(query.numero_documento, 'Numero do documento', 120),
    valor_inicial: valorInicial,
    valor_final: valorFinal,
    limit: parseInteger(query.limit, 'Limite')
  };
}

function validateFinanceTituloCreateFromSolicitacaoBody(body = {}) {
  ensureAllowedKeys(
    body,
    [
      'tipo',
      'status',
      'empresa_id',
      'parceiro_id',
      'valor',
      'data_vencimento',
      'data_emissao',
      'descricao',
      'categoria_financeira_id',
      'observacoes',
      'numero_documento',
      'forma_cobranca',
      'status_cobranca',
      'banco_cobranca',
      'nosso_numero',
      'linha_digitavel',
      'codigo_barras',
      'identificador_externo',
      'boleto_emitido_em',
      'forma_pagamento_id',
      'cartao_id',
      'quantidade_parcelas',
      'data_compra',
      'competencia_data',
      'considera_dre',
      'intercompany',
      'empresa_contraparte_id',
      ...CAMPOS_INTERCOMPANY_TITULO,
      'parcelas',
      'pagamentos',
      'tipo_rateio',
      'rateios',
      'impostos',
      'valor_bruto',
      'valor_liquido'
    ],
    'Geracao de titulo financeiro'
  );

  return {
    tipo: parseEnum(body.tipo, 'Tipo', ['PAGAR', 'RECEBER']),
    status: parseEnum(body.status, 'Status', STATUS_TITULO_INICIAL),
    empresa_id: parseInteger(body.empresa_id, 'Empresa do grupo'),
    parceiro_id: parseInteger(body.parceiro_id, 'Parceiro'),
    valor: parseDecimal(body.valor, 'Valor', { min: 0.01 }),
    data_vencimento: parseDateOnly(body.data_vencimento, 'Data de vencimento'),
    data_emissao: parseDateOnly(body.data_emissao, 'Data de emissao'),
    descricao: parseOptionalText(body.descricao, 'Descricao', 255),
    categoria_financeira_id: parseInteger(body.categoria_financeira_id, 'Categoria financeira', { required: true }),
    observacoes: parseOptionalText(body.observacoes, 'Observacoes', 4000),
    numero_documento: parseOptionalText(body.numero_documento, 'Numero do documento', 120),
    forma_cobranca: parseEnum(body.forma_cobranca, 'Forma de cobranca', FORMAS_COBRANCA),
    status_cobranca: parseEnum(body.status_cobranca, 'Status da cobranca', STATUS_COBRANCA),
    banco_cobranca: parseOptionalCodigoBanco(body.banco_cobranca, 'Codigo do banco da cobranca'),
    nosso_numero: parseOptionalText(body.nosso_numero, 'Nosso numero', 120),
    linha_digitavel: parseOptionalText(body.linha_digitavel, 'Linha digitavel', 255),
    codigo_barras: parseOptionalText(body.codigo_barras, 'Codigo de barras', 255),
    identificador_externo: parseOptionalText(body.identificador_externo, 'Identificador externo', 120),
    boleto_emitido_em: parseDateOnly(body.boleto_emitido_em, 'Data de emissao do boleto'),
    forma_pagamento_id: parseInteger(body.forma_pagamento_id, 'Forma de pagamento'),
    cartao_id: parseInteger(body.cartao_id, 'Cartao'),
    quantidade_parcelas: parseInteger(body.quantidade_parcelas, 'Quantidade de parcelas'),
    data_compra: parseDateOnly(body.data_compra, 'Data da compra'),
    competencia_data: parseDateOnly(body.competencia_data, 'Data de competencia'),
    considera_dre: parseBoolean(body.considera_dre, 'Considera DRE'),
    intercompany: parseBoolean(body.intercompany, 'Entre Empresas'),
    empresa_contraparte_id: parseInteger(body.empresa_contraparte_id, 'Empresa contraparte'),
    intercompany_group_id: parseOptionalText(body.intercompany_group_id, 'Grupo entre empresas', 80),
    empresa_origem_id: parseInteger(body.empresa_origem_id, 'Empresa origem'),
    empresa_destino_id: parseInteger(body.empresa_destino_id, 'Empresa destino'),
    tipo_intercompany: parseEnum(body.tipo_intercompany, 'Tipo', TIPOS_INTERCOMPANY),
    motivo_intercompany: parseOptionalText(body.motivo_intercompany, 'Motivo', 255),
    elimina_consolidado: parseBoolean(body.elimina_consolidado, 'Eliminar no consolidado'),
    transferencia_interna: parseBoolean(body.transferencia_interna, 'Transferencia interna'),
    parcelas: parseParcelasTitulo(body.parcelas),
    pagamentos: parsePagamentosTitulo(body.pagamentos),
    tipo_rateio: parseEnum(body.tipo_rateio, 'Tipo de rateio', ['PERCENTUAL', 'VALOR']),
    rateios: parseRateiosTitulo(body.rateios),
    impostos: parseImpostosTitulo(body.impostos),
    valor_bruto: parseDecimal(body.valor_bruto, 'Valor bruto', { min: 0.01 }),
    valor_liquido: parseDecimal(body.valor_liquido, 'Valor liquido', { min: 0.01 })
  };
}

function validateFinanceTituloCreateBody(body = {}) {
  ensureAllowedKeys(
    body,
    [
      'tipo',
      'status',
      'empresa_id',
      'obra_id',
      'apropriacao_id',
      'parceiro_id',
      'valor',
      'data_vencimento',
      'data_emissao',
      'descricao',
      'categoria_financeira_id',
      'observacoes',
      'numero_documento',
      'forma_cobranca',
      'status_cobranca',
      'banco_cobranca',
      'nosso_numero',
      'linha_digitavel',
      'codigo_barras',
      'identificador_externo',
      'boleto_emitido_em',
      'forma_pagamento_id',
      'cartao_id',
      'quantidade_parcelas',
      'data_compra',
      'competencia_data',
      'considera_dre',
      'intercompany',
      'empresa_contraparte_id',
      ...CAMPOS_INTERCOMPANY_TITULO,
      'parcelas',
      'pagamentos',
      'tipo_rateio',
      'rateios',
      'impostos',
      'desconto_financeiro',
      'valor_bruto',
      'valor_liquido',
      'origem_frete_id'
    ],
    'Criacao manual de titulo financeiro'
  );

  return {
    tipo: parseEnum(body.tipo, 'Tipo', ['PAGAR', 'RECEBER'], { required: true }),
    status: parseEnum(body.status, 'Status', STATUS_TITULO_INICIAL),
    empresa_id: parseInteger(body.empresa_id, 'Empresa do grupo'),
    obra_id: parseInteger(body.obra_id, 'Obra/Centro de custo', { required: true }),
    apropriacao_id: parseInteger(body.apropriacao_id, 'Apropriacao'),
    parceiro_id: parseInteger(body.parceiro_id, 'Parceiro', { required: true }),
    valor: parseDecimal(body.valor, 'Valor', { required: true, min: 0.01 }),
    data_vencimento: parseDateOnly(body.data_vencimento, 'Data de vencimento'),
    data_emissao: parseDateOnly(body.data_emissao, 'Data de emissao'),
    descricao: parseOptionalText(body.descricao, 'Descricao', 255, { required: true }),
    categoria_financeira_id: parseInteger(body.categoria_financeira_id, 'Categoria financeira', { required: true }),
    observacoes: parseOptionalText(body.observacoes, 'Observacoes', 4000),
    numero_documento: parseOptionalText(body.numero_documento, 'Numero do documento', 120),
    forma_cobranca: parseEnum(body.forma_cobranca, 'Forma de cobranca', FORMAS_COBRANCA),
    status_cobranca: parseEnum(body.status_cobranca, 'Status da cobranca', STATUS_COBRANCA),
    banco_cobranca: parseOptionalCodigoBanco(body.banco_cobranca, 'Codigo do banco da cobranca'),
    nosso_numero: parseOptionalText(body.nosso_numero, 'Nosso numero', 120),
    linha_digitavel: parseOptionalText(body.linha_digitavel, 'Linha digitavel', 255),
    codigo_barras: parseOptionalText(body.codigo_barras, 'Codigo de barras', 255),
    identificador_externo: parseOptionalText(body.identificador_externo, 'Identificador externo', 120),
    boleto_emitido_em: parseDateOnly(body.boleto_emitido_em, 'Data de emissao do boleto'),
    forma_pagamento_id: parseInteger(body.forma_pagamento_id, 'Forma de pagamento'),
    cartao_id: parseInteger(body.cartao_id, 'Cartao'),
    quantidade_parcelas: parseInteger(body.quantidade_parcelas, 'Quantidade de parcelas'),
    data_compra: parseDateOnly(body.data_compra, 'Data da compra'),
    competencia_data: parseDateOnly(body.competencia_data, 'Data de competencia'),
    considera_dre: parseBoolean(body.considera_dre, 'Considera DRE'),
    intercompany: parseBoolean(body.intercompany, 'Entre Empresas'),
    empresa_contraparte_id: parseInteger(body.empresa_contraparte_id, 'Empresa contraparte'),
    intercompany_group_id: parseOptionalText(body.intercompany_group_id, 'Grupo entre empresas', 80),
    empresa_origem_id: parseInteger(body.empresa_origem_id, 'Empresa origem'),
    empresa_destino_id: parseInteger(body.empresa_destino_id, 'Empresa destino'),
    tipo_intercompany: parseEnum(body.tipo_intercompany, 'Tipo', TIPOS_INTERCOMPANY),
    motivo_intercompany: parseOptionalText(body.motivo_intercompany, 'Motivo', 255),
    elimina_consolidado: parseBoolean(body.elimina_consolidado, 'Eliminar no consolidado'),
    transferencia_interna: parseBoolean(body.transferencia_interna, 'Transferencia interna'),
    parcelas: parseParcelasTitulo(body.parcelas),
    pagamentos: parsePagamentosTitulo(body.pagamentos),
    tipo_rateio: parseEnum(body.tipo_rateio, 'Tipo de rateio', ['PERCENTUAL', 'VALOR']),
    rateios: parseRateiosTitulo(body.rateios),
    impostos: parseImpostosTitulo(body.impostos),
    desconto_financeiro: parseDecimal(body.desconto_financeiro, 'Desconto financeiro', { min: 0 }),
    valor_bruto: parseDecimal(body.valor_bruto, 'Valor bruto', { min: 0.01 }),
    valor_liquido: parseDecimal(body.valor_liquido, 'Valor liquido', { min: 0.01 }),
    origem_frete_id: parseInteger(body.origem_frete_id, 'Frete do pedido')
  };
}

function validateFinanceTituloUpdateBody(body = {}) {
  ensureAllowedKeys(
    body,
    [
      'tipo',
      'status',
      'empresa_id',
      'obra_id',
      'apropriacao_id',
      'parceiro_id',
      'valor',
      'data_vencimento',
      'data_emissao',
      'descricao',
      'categoria_financeira_id',
      'observacoes',
      'numero_documento',
      'forma_cobranca',
      'status_cobranca',
      'banco_cobranca',
      'nosso_numero',
      'linha_digitavel',
      'codigo_barras',
      'identificador_externo',
      'boleto_emitido_em',
      'competencia_data',
      'considera_dre',
      'intercompany',
      'empresa_contraparte_id',
      ...CAMPOS_INTERCOMPANY_TITULO,
      'tipo_rateio',
      'rateios',
      'impostos',
      'desconto_financeiro',
      'valor_bruto',
      'valor_liquido'
    ],
    'Edicao de titulo financeiro'
  );

  return {
    tipo: parseEnum(body.tipo, 'Tipo', ['PAGAR', 'RECEBER'], { required: true }),
    status: parseEnum(body.status, 'Status', STATUS_TITULO_INICIAL),
    empresa_id: parseInteger(body.empresa_id, 'Empresa do grupo'),
    obra_id: parseInteger(body.obra_id, 'Obra/Centro de custo', { required: true }),
    apropriacao_id: parseInteger(body.apropriacao_id, 'Apropriacao'),
    parceiro_id: parseInteger(body.parceiro_id, 'Parceiro', { required: true }),
    valor: parseDecimal(body.valor, 'Valor', { required: true, min: 0.01 }),
    data_vencimento: parseDateOnly(body.data_vencimento, 'Data de vencimento', { required: true }),
    data_emissao: parseDateOnly(body.data_emissao, 'Data de emissao'),
    descricao: parseOptionalText(body.descricao, 'Descricao', 255, { required: true }),
    categoria_financeira_id: parseInteger(body.categoria_financeira_id, 'Categoria financeira', { required: true }),
    observacoes: parseOptionalText(body.observacoes, 'Observacoes', 4000),
    numero_documento: parseOptionalText(body.numero_documento, 'Numero do documento', 120),
    forma_cobranca: parseEnum(body.forma_cobranca, 'Forma de cobranca', FORMAS_COBRANCA),
    status_cobranca: parseEnum(body.status_cobranca, 'Status da cobranca', STATUS_COBRANCA),
    banco_cobranca: parseOptionalCodigoBanco(body.banco_cobranca, 'Codigo do banco da cobranca'),
    nosso_numero: parseOptionalText(body.nosso_numero, 'Nosso numero', 120),
    linha_digitavel: parseOptionalText(body.linha_digitavel, 'Linha digitavel', 255),
    codigo_barras: parseOptionalText(body.codigo_barras, 'Codigo de barras', 255),
    identificador_externo: parseOptionalText(body.identificador_externo, 'Identificador externo', 120),
    boleto_emitido_em: parseDateOnly(body.boleto_emitido_em, 'Data de emissao do boleto'),
    competencia_data: parseDateOnly(body.competencia_data, 'Data de competencia', { required: true }),
    considera_dre: parseBoolean(body.considera_dre, 'Considera DRE'),
    intercompany: parseBoolean(body.intercompany, 'Entre Empresas'),
    empresa_contraparte_id: parseInteger(body.empresa_contraparte_id, 'Empresa contraparte'),
    intercompany_group_id: parseOptionalText(body.intercompany_group_id, 'Grupo entre empresas', 80),
    empresa_origem_id: parseInteger(body.empresa_origem_id, 'Empresa origem'),
    empresa_destino_id: parseInteger(body.empresa_destino_id, 'Empresa destino'),
    tipo_intercompany: parseEnum(body.tipo_intercompany, 'Tipo', TIPOS_INTERCOMPANY),
    motivo_intercompany: parseOptionalText(body.motivo_intercompany, 'Motivo', 255),
    elimina_consolidado: parseBoolean(body.elimina_consolidado, 'Eliminar no consolidado'),
    transferencia_interna: parseBoolean(body.transferencia_interna, 'Transferencia interna'),
    tipo_rateio: parseEnum(body.tipo_rateio, 'Tipo de rateio', ['PERCENTUAL', 'VALOR']),
    rateios: parseRateiosTitulo(body.rateios),
    impostos: parseImpostosTitulo(body.impostos),
    desconto_financeiro: parseDecimal(body.desconto_financeiro, 'Desconto financeiro', { min: 0 }),
    valor_bruto: parseDecimal(body.valor_bruto, 'Valor bruto', { min: 0.01 }),
    valor_liquido: parseDecimal(body.valor_liquido, 'Valor liquido', { min: 0.01 })
  };
}

function validateFinanceTituloCobrancaBody(body = {}) {
  ensureAllowedKeys(
    body,
    [
      'forma_cobranca',
      'status_cobranca',
      'banco_cobranca',
      'nosso_numero',
      'linha_digitavel',
      'codigo_barras',
      'identificador_externo',
      'boleto_emitido_em'
    ],
    'Atualizacao de cobranca do titulo financeiro'
  );

  return {
    forma_cobranca: parseNullableEnum(body.forma_cobranca, 'Forma de cobranca', FORMAS_COBRANCA),
    status_cobranca: parseNullableEnum(body.status_cobranca, 'Status da cobranca', STATUS_COBRANCA),
    banco_cobranca: parseNullableCodigoBanco(body.banco_cobranca, 'Codigo do banco da cobranca'),
    nosso_numero: parseNullableText(body.nosso_numero, 'Nosso numero', 120),
    linha_digitavel: parseNullableText(body.linha_digitavel, 'Linha digitavel', 255),
    codigo_barras: parseNullableText(body.codigo_barras, 'Codigo de barras', 255),
    identificador_externo: parseNullableText(body.identificador_externo, 'Identificador externo', 120),
    boleto_emitido_em: parseNullableDateOnly(body.boleto_emitido_em, 'Data de emissao do boleto')
  };
}

function validateFinanceTituloMovimentoParams(params = {}) {
  const tituloId = parseInteger(params.id, 'Titulo financeiro', { required: true });
  const movimentoId = parseInteger(params.movimentoId, 'Movimento financeiro', { required: true });

  return {
    id: String(tituloId),
    movimentoId: String(movimentoId)
  };
}

function validateFinanceTituloBaixaBody(body = {}) {
  ensureAllowedKeys(
    body,
    [
      'empresa_id',
      'conta_bancaria_id',
      'cartao_id',
      'forma_pagamento_id',
      'forma_recebimento',
      'tipo_permuta',
      'categoria_bem',
      'descricao_bem',
      'valor_referencia_bem',
      'documento_referencia',
      'valor',
      'juros',
      'multa',
      'desconto',
      'data_movimento',
      'observacoes',
      'usar_cheque_terceiro',
      'cheque_terceiro_id',
      'cheque_numero',
      'cheque_emitente',
      'cheque_banco',
      'cheque_agencia',
      'cheque_conta',
      'titular_documento',
      'data_emissao',
      'data_vencimento',
      'intercompany',
      'natureza_intercompany_baixa',
      'tipo_intercompany',
      'motivo_intercompany',
      'elimina_consolidado',
      'transferencia_interna'
    ],
    'Baixa de titulo financeiro'
  );

  const formaPagamentoId = parseInteger(body.forma_pagamento_id, 'Forma de pagamento');
  const formaRecebimento = parseEnum(
    body.forma_recebimento,
    'Forma de recebimento',
    COMERCIAL_FORMA_RECEBIMENTO,
    { required: true }
  );

  const contaBancariaId = parseInteger(body.conta_bancaria_id, 'Conta bancaria');
  const cartaoId = parseInteger(body.cartao_id, 'Cartao');
  const usarChequeTerceiro = parseBoolean(body.usar_cheque_terceiro, 'Usar cheque de terceiro');
  const chequeTerceiroId = parseInteger(body.cheque_terceiro_id, 'Cheque de terceiro');
  const empresaId = parseInteger(body.empresa_id, 'Empresa pagadora', { required: true });
  if (formaRecebimento === 'DINHEIRO' && !contaBancariaId) {
    throw new ValidationError('Selecione o caixa fisico usado na baixa em dinheiro.');
  }
  const exigeContaBancaria = (
    (!formaRecebimento || !['CARTAO', 'PERMUTA', 'BENS', 'OUTROS'].includes(formaRecebimento))
    && !(formaRecebimento === 'CHEQUE' && usarChequeTerceiro)
  );

  if (exigeContaBancaria && !contaBancariaId) {
    throw new ValidationError('Conta bancaria e obrigatoria para esta forma de recebimento.');
  }

  if (formaRecebimento === 'CARTAO' && !cartaoId) {
    throw new ValidationError('Informe o cartao utilizado na baixa.');
  }

  if (usarChequeTerceiro && !chequeTerceiroId) {
    throw new ValidationError('Selecione o cheque de terceiro que sera usado na baixa.');
  }

  const chequeNumero = parseOptionalText(body.cheque_numero, 'Numero do cheque', 60);
  const chequeEmitente = parseOptionalText(body.cheque_emitente, 'Emitente do cheque', 160);
  if (formaRecebimento === 'CHEQUE' && !usarChequeTerceiro && (!chequeNumero || !chequeEmitente)) {
    throw new ValidationError('Informe numero e emitente do cheque usado na baixa.');
  }

  return {
    empresa_id: empresaId,
    conta_bancaria_id: contaBancariaId,
    cartao_id: cartaoId,
    forma_pagamento_id: formaPagamentoId,
    forma_recebimento: formaRecebimento,
    tipo_permuta: parseOptionalText(body.tipo_permuta, 'Tipo de permuta', 80),
    categoria_bem: parseEnum(body.categoria_bem, 'Categoria do bem', CATEGORIAS_BEM),
    descricao_bem: parseOptionalText(body.descricao_bem, 'Descricao do bem', 255),
    valor_referencia_bem: parseDecimal(body.valor_referencia_bem, 'Valor de referencia do bem', { min: 0 }),
    documento_referencia: parseOptionalText(body.documento_referencia, 'Documento de referencia', 120),
    valor: parseDecimal(body.valor, 'Valor', { required: true, min: 0.01 }),
    juros: parseDecimal(body.juros, 'Juros', { min: 0 }),
    multa: parseDecimal(body.multa, 'Multa', { min: 0 }),
    desconto: parseDecimal(body.desconto, 'Desconto', { min: 0 }),
    data_movimento: parseDateOnly(body.data_movimento, 'Data do movimento', { required: true }),
    observacoes: parseOptionalText(body.observacoes, 'Observacoes', 4000),
    usar_cheque_terceiro: usarChequeTerceiro,
    cheque_terceiro_id: chequeTerceiroId,
    cheque_numero: chequeNumero,
    cheque_emitente: chequeEmitente,
    cheque_banco: parseOptionalText(body.cheque_banco, 'Banco do cheque', 120),
    cheque_agencia: parseOptionalText(body.cheque_agencia, 'Agencia do cheque', 40),
    cheque_conta: parseOptionalText(body.cheque_conta, 'Conta do cheque', 60),
    titular_documento: parseOptionalCpfCnpj(body.titular_documento, 'CPF/CNPJ do titular do cheque'),
    data_emissao: parseDateOnly(body.data_emissao, 'Data de emissao do cheque'),
    data_vencimento: parseDateOnly(body.data_vencimento, 'Data de vencimento do cheque'),
    intercompany: parseBoolean(body.intercompany, 'Entre Empresas'),
    natureza_intercompany_baixa: parseEnum(body.natureza_intercompany_baixa, 'Natureza da baixa entre empresas', NATUREZAS_INTERCOMPANY_BAIXA),
    tipo_intercompany: parseEnum(body.tipo_intercompany, 'Tipo', TIPOS_INTERCOMPANY),
    motivo_intercompany: parseOptionalText(body.motivo_intercompany, 'Motivo', 255),
    elimina_consolidado: parseBoolean(body.elimina_consolidado, 'Eliminar no consolidado'),
    transferencia_interna: parseBoolean(body.transferencia_interna, 'Transferencia interna')
  };
}

function validateFinanceTituloBaixaParceladaBody(body = {}) {
  ensureAllowedKeys(
    body,
    [
      'titulo_ids',
      'empresa_id',
      'conta_bancaria_id',
      'cartao_id',
      'forma_pagamento_id',
      'forma_recebimento',
      'data_movimento',
      'observacoes',
      'parcelas',
      'intercompany',
      'natureza_intercompany_baixa',
      'tipo_intercompany',
      'motivo_intercompany',
      'elimina_consolidado',
      'transferencia_interna'
    ],
    'Baixa parcelada em massa'
  );

  if (!Array.isArray(body.titulo_ids) || body.titulo_ids.length === 0) {
    throw new ValidationError('Selecione ao menos um titulo para a baixa parcelada.');
  }

  if (body.titulo_ids.length > 100) {
    throw new ValidationError('A baixa parcelada permite ate 100 titulos por operacao.');
  }

  const tituloIds = Array.from(new Set(body.titulo_ids.map((id) => (
    parseInteger(id, 'Titulo financeiro', { required: true })
  ))));

  const formaPagamentoId = parseInteger(body.forma_pagamento_id, 'Forma de pagamento');
  const formaRecebimento = parseEnum(
    body.forma_recebimento,
    'Forma de recebimento',
    COMERCIAL_FORMA_RECEBIMENTO,
    { required: true }
  );

  if (!['CHEQUE', 'CARTAO'].includes(formaRecebimento)) {
    throw new ValidationError('Baixa parcelada em massa esta disponivel apenas para CHEQUE ou CARTAO.');
  }

  const contaBancariaId = parseInteger(body.conta_bancaria_id, 'Conta bancaria', { required: true });
  const cartaoId = parseInteger(body.cartao_id, 'Cartao');
  if (formaRecebimento === 'CARTAO' && !cartaoId) {
    throw new ValidationError('Informe o cartao utilizado na baixa parcelada.');
  }

  if (!Array.isArray(body.parcelas) || body.parcelas.length === 0) {
    throw new ValidationError('Informe as parcelas da baixa agrupada.');
  }

  if (body.parcelas.length > 60) {
    throw new ValidationError('A baixa parcelada permite ate 60 parcelas.');
  }

  const parcelas = body.parcelas.map((item, index) => {
    ensureAllowedKeys(
      item || {},
      [
        'data_movimento',
        'valor',
        'documento_referencia',
        'observacoes',
        'cheque_numero',
        'cheque_emitente',
        'cheque_banco',
        'cheque_agencia',
        'cheque_conta',
        'data_emissao',
        'data_vencimento',
        'usar_cheque_terceiro',
        'cheque_terceiro_id',
        'titular_documento'
      ],
      `Parcela ${index + 1} da baixa agrupada`
    );

    const usarChequeTerceiro = parseBoolean(item?.usar_cheque_terceiro, `Usar cheque de terceiro na parcela ${index + 1}`);
    const chequeTerceiroId = parseInteger(item?.cheque_terceiro_id, `Cheque de terceiro da parcela ${index + 1}`);
    const parcela = {
      data_movimento: parseDateOnly(item?.data_movimento, `Data da parcela ${index + 1}`, { required: true }),
      valor: parseDecimal(item?.valor, `Valor da parcela ${index + 1}`, { required: true, min: 0.01 }),
      documento_referencia: parseOptionalText(item?.documento_referencia, `Documento da parcela ${index + 1}`, 120),
      observacoes: parseOptionalText(item?.observacoes, `Observacoes da parcela ${index + 1}`, 1000),
      cheque_numero: parseOptionalText(item?.cheque_numero, `Numero do cheque da parcela ${index + 1}`, 60),
      cheque_emitente: parseOptionalText(item?.cheque_emitente, `Emitente do cheque da parcela ${index + 1}`, 160),
      cheque_banco: parseOptionalText(item?.cheque_banco, `Banco do cheque da parcela ${index + 1}`, 120),
      cheque_agencia: parseOptionalText(item?.cheque_agencia, `Agencia do cheque da parcela ${index + 1}`, 40),
      cheque_conta: parseOptionalText(item?.cheque_conta, `Conta do cheque da parcela ${index + 1}`, 60),
      titular_documento: parseOptionalCpfCnpj(item?.titular_documento, `CPF/CNPJ do titular do cheque da parcela ${index + 1}`),
      data_emissao: parseDateOnly(item?.data_emissao, `Data de emissao do cheque da parcela ${index + 1}`),
      data_vencimento: parseDateOnly(item?.data_vencimento, `Data de vencimento do cheque da parcela ${index + 1}`),
      usar_cheque_terceiro: usarChequeTerceiro,
      cheque_terceiro_id: chequeTerceiroId
    };

    if (formaRecebimento === 'CHEQUE' && usarChequeTerceiro && !chequeTerceiroId) {
      throw new ValidationError(`Selecione o cheque de terceiro da parcela ${index + 1}.`);
    }

    if (formaRecebimento === 'CHEQUE' && !usarChequeTerceiro && (!parcela.cheque_numero || !parcela.cheque_emitente)) {
      throw new ValidationError(`Informe numero e emitente do cheque na parcela ${index + 1}.`);
    }

    return parcela;
  });

  return {
    titulo_ids: tituloIds,
    empresa_id: parseInteger(body.empresa_id, 'Empresa pagadora', { required: true }),
    conta_bancaria_id: contaBancariaId,
    cartao_id: cartaoId,
    forma_pagamento_id: formaPagamentoId,
    forma_recebimento: formaRecebimento,
    data_movimento: parseDateOnly(body.data_movimento, 'Data do movimento', { required: true }),
    observacoes: parseOptionalText(body.observacoes, 'Observacoes', 4000),
    parcelas,
    intercompany: parseBoolean(body.intercompany, 'Entre Empresas'),
    natureza_intercompany_baixa: parseEnum(body.natureza_intercompany_baixa, 'Natureza da baixa entre empresas', NATUREZAS_INTERCOMPANY_BAIXA),
    tipo_intercompany: parseEnum(body.tipo_intercompany, 'Tipo', TIPOS_INTERCOMPANY),
    motivo_intercompany: parseOptionalText(body.motivo_intercompany, 'Motivo', 255),
    elimina_consolidado: parseBoolean(body.elimina_consolidado, 'Eliminar no consolidado'),
    transferencia_interna: parseBoolean(body.transferencia_interna, 'Transferencia interna')
  };
}

function validateFinanceTituloBaixaConciliacoesBody(body = {}) {
  ensureAllowedKeys(
    body,
    [
      'conciliacao_ids',
      'forma_recebimento',
      'documento_referencia',
      'observacoes',
      'intercompany',
      'natureza_intercompany_baixa',
      'tipo_intercompany',
      'motivo_intercompany',
      'elimina_consolidado',
      'transferencia_interna'
    ],
    'Baixa por conciliacoes bancarias'
  );

  if (!Array.isArray(body.conciliacao_ids) || body.conciliacao_ids.length === 0) {
    throw new ValidationError('Selecione ao menos um lancamento bancario para conciliar.');
  }
  if (body.conciliacao_ids.length > 50) {
    throw new ValidationError('Selecione no maximo 50 lancamentos bancarios por baixa.');
  }

  const conciliacaoIds = [...new Set(body.conciliacao_ids.map((id, index) => (
    parseInteger(id, `Lancamento bancario ${index + 1}`, { required: true })
  )))];

  return {
    conciliacao_ids: conciliacaoIds,
    forma_recebimento: parseEnum(
      body.forma_recebimento,
      'Forma de recebimento',
      COMERCIAL_FORMA_RECEBIMENTO,
      { required: true }
    ),
    documento_referencia: parseOptionalText(body.documento_referencia, 'Documento de referencia', 120),
    observacoes: parseOptionalText(body.observacoes, 'Observacoes', 4000),
    intercompany: parseBoolean(body.intercompany, 'Entre Empresas'),
    natureza_intercompany_baixa: parseEnum(body.natureza_intercompany_baixa, 'Natureza da baixa entre empresas', NATUREZAS_INTERCOMPANY_BAIXA),
    tipo_intercompany: parseEnum(body.tipo_intercompany, 'Tipo', TIPOS_INTERCOMPANY),
    motivo_intercompany: parseOptionalText(body.motivo_intercompany, 'Motivo', 255),
    elimina_consolidado: parseBoolean(body.elimina_consolidado, 'Eliminar no consolidado'),
    transferencia_interna: parseBoolean(body.transferencia_interna, 'Transferencia interna')
  };
}

function validateFinanceTituloEstornoBody(body = {}) {
  ensureAllowedKeys(body, ['observacoes'], 'Estorno de baixa financeira');

  return {
    observacoes: parseOptionalText(body.observacoes, 'Observacoes', 4000)
  };
}

function validateFinanceBoletoTituloQuery(query = {}) {
  ensureAllowedKeys(
    query,
    [
      'q',
      'codigo',
      'empresa_id',
      'numero_documento',
      'obra_id',
      'empreendimento_id',
      'parceiro_id',
      'status_cobranca',
      'origem',
      'vencimento_inicial',
      'vencimento_final'
    ],
    'Consulta de boletos financeiros'
  );

  const vencimentoInicial = parseDateOnly(query.vencimento_inicial, 'Vencimento inicial');
  const vencimentoFinal = parseDateOnly(query.vencimento_final, 'Vencimento final');

  if (vencimentoInicial && vencimentoFinal && vencimentoInicial > vencimentoFinal) {
    throw new ValidationError('Vencimento inicial nao pode ser maior que vencimento final.');
  }

  return {
    q: parseOptionalText(query.q, 'Busca', 120),
    codigo: parseOptionalText(query.codigo, 'Codigo do titulo', 40),
    empresa_id: parseInteger(query.empresa_id, 'Empresa do grupo'),
    numero_documento: parseOptionalText(query.numero_documento, 'Numero do documento', 120),
    obra_id: parseInteger(query.obra_id, 'Obra'),
    empreendimento_id: parseInteger(query.empreendimento_id, 'Empreendimento'),
    parceiro_id: parseInteger(query.parceiro_id, 'Cliente'),
    status_cobranca: parseEnum(query.status_cobranca, 'Status da cobranca', STATUS_COBRANCA),
    origem: parseEnum(query.origem, 'Origem', ['COMERCIAL', 'MANUAL', 'TODOS']),
    vencimento_inicial: vencimentoInicial,
    vencimento_final: vencimentoFinal
  };
}

function validateFinanceCadastroContaBody(body = {}) {
  ensureAllowedKeys(
    body,
    [
      'nome',
      'banco',
      'agencia',
      'conta',
      'ofx_bank_id',
      'ofx_branch_id',
      'ofx_account_id',
      'tipo_conta',
      'empresa_id',
      'tipo_operacional',
      'exige_abertura_fechamento',
      'saldo_inicial',
      'ativo'
    ],
    'Conta bancaria'
  );

  return {
    nome: parseOptionalText(body.nome, 'Nome', 120),
    banco: parseOptionalText(body.banco, 'Banco', 120),
    agencia: parseOptionalText(body.agencia, 'Agencia', 40),
    conta: parseOptionalText(body.conta, 'Conta', 60),
    ofx_bank_id: parseOptionalText(body.ofx_bank_id, 'Banco OFX', 20),
    ofx_branch_id: parseOptionalText(body.ofx_branch_id, 'Agencia OFX', 40),
    ofx_account_id: parseOptionalText(body.ofx_account_id, 'Identificador OFX da conta', 80),
    tipo_conta: parseOptionalText(body.tipo_conta, 'Tipo de conta', 40),
    empresa_id: parseInteger(body.empresa_id, 'Empresa do grupo'),
    tipo_operacional: parseEnum(body.tipo_operacional, 'Tipo operacional', ['BANCARIA', 'CAIXA_INTERNO']),
    exige_abertura_fechamento: parseBoolean(body.exige_abertura_fechamento, 'Exige abertura e fechamento'),
    saldo_inicial: parseDecimal(body.saldo_inicial, 'Saldo inicial'),
    ativo: parseBoolean(body.ativo, 'Ativo')
  };
}

function validateFinanceCadastroCategoriaBody(body = {}) {
  ensureAllowedKeys(
    body,
    ['nome', 'tipo', 'descricao', 'dre_grupo', 'dre_subgrupo', 'dre_ordem', 'considera_dre', 'classificacao_gerencial', 'ativo'],
    'Categoria financeira'
  );

  return {
    nome: parseOptionalText(body.nome, 'Nome', 120),
    tipo: parseEnum(body.tipo, 'Tipo', ['PAGAR', 'RECEBER', 'AMBOS']),
    descricao: parseOptionalText(body.descricao, 'Descricao', 255),
    dre_grupo: parseOptionalText(body.dre_grupo, 'Grupo DRE', 80),
    dre_subgrupo: parseOptionalText(body.dre_subgrupo, 'Subgrupo DRE', 120),
    dre_ordem: parseInteger(body.dre_ordem, 'Ordem DRE'),
    considera_dre: parseBoolean(body.considera_dre, 'Considera DRE'),
    classificacao_gerencial: parseEnum(body.classificacao_gerencial, 'Classificacao gerencial', CLASSIFICACOES_GERENCIAIS_FINANCEIRAS),
    ativo: parseBoolean(body.ativo, 'Ativo')
  };
}

function validateFinanceCaixaQuery(query = {}) {
  ensureAllowedKeys(
    query,
    ['conta_bancaria_id', 'empresa_id', 'status', 'limit'],
    'Consulta de caixas financeiros'
  );

  return {
    conta_bancaria_id: parseInteger(query.conta_bancaria_id, 'Conta financeira'),
    empresa_id: parseInteger(query.empresa_id, 'Empresa do grupo'),
    status: parseEnum(query.status, 'Status', ['ABERTO', 'FECHADO', 'TODOS']),
    limit: parseInteger(query.limit, 'Limite')
  };
}

function validateFinanceCaixaAberturaBody(body = {}) {
  ensureAllowedKeys(
    body,
    ['conta_bancaria_id', 'data_abertura', 'saldo_abertura', 'observacoes'],
    'Abertura de caixa'
  );

  return {
    conta_bancaria_id: parseInteger(body.conta_bancaria_id, 'Conta financeira', { required: true }),
    data_abertura: parseDateOnly(body.data_abertura, 'Data de abertura'),
    saldo_abertura: parseDecimal(body.saldo_abertura, 'Saldo de abertura'),
    observacoes: parseOptionalText(body.observacoes, 'Observacoes', 4000)
  };
}

function validateFinanceCaixaFechamentoBody(body = {}) {
  ensureAllowedKeys(
    body,
    ['data_fechamento', 'saldo_informado', 'observacoes'],
    'Fechamento de caixa'
  );

  return {
    data_fechamento: parseDateOnly(body.data_fechamento, 'Data de fechamento'),
    saldo_informado: parseDecimal(body.saldo_informado, 'Saldo informado', { required: true }),
    observacoes: parseOptionalText(body.observacoes, 'Observacoes', 4000)
  };
}

function validateFinanceCaixaMovimentoBody(body = {}) {
  ensureAllowedKeys(
    body,
    ['natureza', 'data_movimento', 'valor', 'descricao', 'documento_referencia'],
    'Movimento de caixa fisico'
  );

  return {
    natureza: parseEnum(body.natureza, 'Natureza', ['ENTRADA', 'SAIDA'], { required: true }),
    data_movimento: parseDateOnly(body.data_movimento, 'Data do movimento'),
    valor: parseDecimal(body.valor, 'Valor', { required: true }),
    descricao: parseOptionalText(body.descricao, 'Descricao', 4000),
    documento_referencia: parseOptionalText(body.documento_referencia, 'Documento', 120)
  };
}

function validateFinanceCaixaMovimentoEstornoBody(body = {}) {
  ensureAllowedKeys(body, ['motivo'], 'Estorno de movimento de caixa fisico');
  return {
    motivo: parseOptionalText(body.motivo, 'Motivo', 1000)
  };
}

function validateFinanceCaixaMovimentoParams(params = {}) {
  ensureAllowedKeys(params, ['id', 'movimentoId'], 'Movimento de caixa fisico');
  return {
    id: parseInteger(params.id, 'Caixa financeiro', { required: true }),
    movimentoId: parseInteger(params.movimentoId, 'Movimento financeiro', { required: true })
  };
}

function validateFinanceTransferenciaQuery(query = {}) {
  ensureAllowedKeys(
    query,
    ['empresa_id', 'conta_bancaria_id', 'status', 'data_inicial', 'data_final', 'limit'],
    'Consulta de transferencias financeiras'
  );

  const dataInicial = parseDateOnly(query.data_inicial, 'Data inicial');
  const dataFinal = parseDateOnly(query.data_final, 'Data final');

  if (dataInicial && dataFinal && dataInicial > dataFinal) {
    throw new ValidationError('Data inicial nao pode ser maior que data final.');
  }

  return {
    empresa_id: parseInteger(query.empresa_id, 'Empresa do grupo'),
    conta_bancaria_id: parseInteger(query.conta_bancaria_id, 'Conta financeira'),
    status: parseEnum(query.status, 'Status', ['ATIVA', 'CANCELADA', 'TODOS']),
    data_inicial: dataInicial,
    data_final: dataFinal,
    limit: parseInteger(query.limit, 'Limite')
  };
}

function validateFinanceTransferenciaBody(body = {}) {
  ensureAllowedKeys(
    body,
    [
      'empresa_id',
      'tipo_transferencia',
      'conta_origem_id',
      'conta_destino_id',
      'data_transferencia',
      'valor',
      'descricao',
      'tipo_intercompany',
      'motivo_intercompany',
      'elimina_consolidado'
    ],
    'Transferencia financeira'
  );

  return {
    empresa_id: parseInteger(body.empresa_id, 'Empresa do grupo'),
    tipo_transferencia: parseEnum(body.tipo_transferencia, 'Tipo de transferencia', ['ENTRE_EMPRESAS', 'MESMA_TITULARIDADE']),
    conta_origem_id: parseInteger(body.conta_origem_id, 'Conta de origem', { required: true }),
    conta_destino_id: parseInteger(body.conta_destino_id, 'Conta de destino', { required: true }),
    data_transferencia: parseDateOnly(body.data_transferencia, 'Data da transferencia'),
    valor: parseDecimal(body.valor, 'Valor da transferencia', { required: true, min: 0.01 }),
    descricao: parseOptionalText(body.descricao, 'Descricao', 255),
    tipo_intercompany: parseEnum(body.tipo_intercompany, 'Tipo', TIPOS_INTERCOMPANY),
    motivo_intercompany: parseOptionalText(body.motivo_intercompany, 'Motivo', 255),
    elimina_consolidado: parseBoolean(body.elimina_consolidado, 'Eliminar no consolidado')
  };
}

function validateFinanceTransferenciaCancelBody(body = {}) {
  ensureAllowedKeys(body, ['observacoes'], 'Cancelamento de transferencia financeira');

  return {
    observacoes: parseOptionalText(body.observacoes, 'Observacoes', 4000)
  };
}

function validateFinanceTarifasBancariasConfigBody(body = {}) {
  ensureAllowedKeys(body, ['itens'], 'Configuracao de tarifas bancarias');
  if (!Array.isArray(body.itens)) {
    throw new ValidationError('Tarifas bancarias devem ser enviadas em lista.');
  }

  return {
    itens: body.itens.map((item, index) => {
      ensureAllowedKeys(
        item || {},
        ['codigo', 'nome', 'descricao', 'categoria_financeira_id', 'ativo'],
        `Tarifa bancaria ${index + 1}`
      );

      return {
        codigo: parseOptionalText(item?.codigo, `Codigo da tarifa ${index + 1}`, 80, { required: true }),
        nome: parseOptionalText(item?.nome, `Nome da tarifa ${index + 1}`, 80, { required: true }),
        descricao: parseOptionalText(item?.descricao, `Descricao da tarifa ${index + 1}`, 255),
        categoria_financeira_id: parseInteger(item?.categoria_financeira_id, `Categoria financeira da tarifa ${index + 1}`, { required: true }),
        ativo: parseBoolean(item?.ativo, `Ativo da tarifa ${index + 1}`)
      };
    })
  };
}

module.exports = {
  FORMAS_COBRANCA,
  STATUS_COBRANCA,
  validateFinanceConciliacaoCriarTituloBody,
  validateFinanceConciliacaoConciliarSugeridosBody,
  validateFinanceConciliacaoConfirmBody,
  validateFinanceConciliacaoCorrigirContaBody,
  validateFinanceConciliacaoCreditoRotativoBody,
  validateFinanceConciliacaoEstornoBancarioBody,
  validateFinanceConciliacaoEstornoTarifaBody,
  validateFinanceConciliacaoTarifaBody,
  validateFinanceConciliacaoTransferenciaBody,
  validateFinanceConciliacaoEstornoTransferenciaBody,
  validateFinanceConciliacaoImportBody,
  validateFinanceConciliacaoImportacoesQuery,
  validateFinanceConciliacaoMovimentosQuery,
  validateFinanceConciliacaoQuery,
  validateFinanceCaixaAberturaBody,
  validateFinanceCaixaFechamentoBody,
  validateFinanceCaixaMovimentoBody,
  validateFinanceCaixaMovimentoEstornoBody,
  validateFinanceCaixaMovimentoParams,
  validateFinanceCaixaQuery,
  validateFinanceTransferenciaBody,
  validateFinanceTransferenciaCancelBody,
  validateFinanceTransferenciaQuery,
  validateFinanceTarifasBancariasConfigBody,
  validateFinanceCadastroCategoriaBody,
  validateFinanceCadastroContaBody,
  validateFinanceBoletoTituloQuery,
  validateFinanceBaixasQuery,
  validateFinanceDreQuery,
  validateFinanceDreComparativoQuery,
  validateFinanceEndividamentoQuery,
  validateFinanceFinanciamentoBancarioCreateBody,
  validateFinanceFinanciamentoBancarioQuery,
  validateFinanceFluxoCaixaQuery,
  validateFinanceFluxoConsolidadoQuery,
  validateFinanceiroObrasQuery,
  validateFinanceIntercompanyQuery,
  validateFinanceRelatorioAnaliticoQuery,
  validateFinanceRelatorioConciliacaoQuery,
  validateFinanceTituloBaixaBody,
  validateFinanceTituloBaixaParceladaBody,
  validateFinanceTituloBaixaConciliacoesBody,
  validateFinanceTituloCobrancaBody,
  validateFinanceTituloCreateBody,
  validateFinanceTituloCreateFromSolicitacaoBody,
  validateFinanceTituloUpdateBody,
  validateFinanceTituloEstornoBody,
  validateFinanceTituloMovimentoParams,
  validateFinanceTituloQuery
};
