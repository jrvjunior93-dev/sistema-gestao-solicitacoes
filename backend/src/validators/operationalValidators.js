const {
  ensureAllowedKeys,
  ValidationError,
  sanitizeString
} = require('../middlewares/validation');
const { onlyDigits, isValidCpfCnpj, isValidPixDocument } = require('../utils/cpfCnpj');

function isBlank(value) {
  return value == null || String(value).trim() === '';
}

function parseCpfCnpj(value, fieldName, { required = false } = {}) {
  if (isBlank(value)) {
    if (required) throw new ValidationError(`${fieldName} e obrigatorio.`);
    return undefined;
  }
  if (!isValidCpfCnpj(value)) throw new ValidationError(`${fieldName} invalido.`);
  return onlyDigits(value);
}

function parsePixDocument(value, type, fieldName = 'Chave PIX', { required = false } = {}) {
  const parsed = parseOptionalText(value, fieldName, 180, { required });
  const normalizedType = String(type || '').trim().toUpperCase();
  if (parsed && !isValidPixDocument(parsed, normalizedType)) {
    throw new ValidationError(`${fieldName} ${normalizedType} invalida.`);
  }
  return parsed && ['CPF', 'CNPJ'].includes(normalizedType) ? onlyDigits(parsed) : parsed;
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

function parseDecimal(
  value,
  fieldName,
  { required = false, min = null, scale = null, brazilianFormat = false } = {}
) {
  if (isBlank(value)) {
    if (required) {
      throw new ValidationError(`${fieldName} e obrigatorio.`);
    }
    return undefined;
  }

  const isNumericValue = typeof value === 'number';
  const raw = String(value).trim().replace(/[R$\s]/gi, '');
  let normalized = raw;

  if (brazilianFormat) {
    if (isNumericValue) {
      normalized = raw;
    } else if (raw.includes(',')) {
      const scalePattern = scale == null ? '\\d+' : `\\d{1,${scale}}`;
      const brazilianDecimalPattern = new RegExp(
        `^(?:\\d+|\\d{1,3}(?:\\.\\d{3})+)(?:,${scalePattern})?$`
      );
      if (!brazilianDecimalPattern.test(raw)) {
        throw new ValidationError(`${fieldName} invalido.`);
      }
      normalized = raw.replace(/\./g, '').replace(',', '.');
    } else if (/^\d{1,3}(?:\.\d{3})+$/.test(raw)) {
      normalized = raw.replace(/\./g, '');
    } else if (/^\d+(?:\.\d+)?$/.test(raw)) {
      normalized = raw;
    } else {
      throw new ValidationError(`${fieldName} invalido.`);
    }
  } else if (raw.includes(',')) {
    normalized = raw.replace(/\./g, '').replace(',', '.');
  }

  if (scale != null) {
    const [, decimalPart = ''] = normalized.split('.');
    if (decimalPart.length > scale) {
      throw new ValidationError(`${fieldName} invalido.`);
    }
  }

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) {
    throw new ValidationError(`${fieldName} invalido.`);
  }

  if (min != null && parsed < min) {
    throw new ValidationError(`${fieldName} invalido.`);
  }

  return parsed;
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

function getTodayDateOnly() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function parseCurrentOrFutureDateOnly(value, fieldName, options = {}) {
  const normalized = parseDateOnly(value, fieldName, options);
  if (normalized && normalized < getTodayDateOnly()) {
    throw new ValidationError(`${fieldName} nao pode ser anterior a data atual.`);
  }
  return normalized;
}

function parseOptionalUrl(value, fieldName) {
  if (isBlank(value)) {
    return undefined;
  }

  const normalized = sanitizeString(value, fieldName, {
    required: false,
    max: 500
  });

  try {
    const parsed = new URL(normalized);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('invalid');
    }
  } catch (error) {
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

function parseIdArray(value, fieldName, { required = false, maxItems = 500 } = {}) {
  const list = Array.isArray(value) ? value : [];

  if (required && list.length === 0) {
    throw new ValidationError(`${fieldName} e obrigatorio.`);
  }

  if (list.length > maxItems) {
    throw new ValidationError(`${fieldName} excede o limite permitido.`);
  }

  return [
    ...new Set(
      list.map((item) => parseInteger(item, fieldName, { required: true }))
    )
  ];
}

function validateContratoQuery(query = {}) {
  ensureAllowedKeys(query, ['obra_id', 'ref', 'codigo', 'modo'], 'Consulta de contratos');

  return {
    obra_id: parseInteger(query.obra_id, 'Obra'),
    ref: parseOptionalText(query.ref, 'Referencia', 255),
    codigo: parseOptionalText(query.codigo, 'Codigo', 255),
    modo: parseOptionalText(query.modo, 'Modo', 30)
  };
}

function validateContratoRelatorioOperacionalQuery(query = {}) {
  ensureAllowedKeys(
    query,
    ['obra_id', 'ref', 'codigo', 'ativo', 'data_inicio', 'data_fim'],
    'Relatorio operacional de contratos'
  );

  const dataInicio = parseDateOnly(query.data_inicio, 'Data inicial');
  const dataFim = parseDateOnly(query.data_fim, 'Data final');

  if (dataInicio && dataFim && dataInicio > dataFim) {
    throw new ValidationError('Data inicial nao pode ser maior que a data final.');
  }

  return {
    obra_id: parseInteger(query.obra_id, 'Obra'),
    ref: parseOptionalText(query.ref, 'Referencia', 255),
    codigo: parseOptionalText(query.codigo, 'Codigo', 255),
    ativo: parseBoolean(query.ativo, 'Ativo'),
    data_inicio: dataInicio,
    data_fim: dataFim
  };
}

function validateContratoCreateBody(body = {}) {
  ensureAllowedKeys(
    body,
    [
      'obra_id',
      'codigo',
      'ref_contrato',
      'fornecedor',
      'descricao',
      'itens_apropriacao',
      'valor_total',
      'tipo_macro_id',
      'tipo_sub_id',
      'ajuste_solicitado',
      'ajuste_pago',
      'apropriacoes',
      'credores'
    ],
    'Contrato'
  );

  const refContrato = parseOptionalText(body.ref_contrato, 'Ref. do contrato', 255);
  const fornecedor = parseOptionalText(body.fornecedor, 'Fornecedor', 255);

  if (!refContrato && !fornecedor) {
    throw new ValidationError('Ref. do contrato e obrigatoria.');
  }

  return {
    obra_id: parseInteger(body.obra_id, 'Obra', { required: true }),
    codigo: parseOptionalText(body.codigo, 'Codigo', 255, { required: true }),
    ref_contrato: refContrato,
    fornecedor,
    descricao: parseOptionalText(body.descricao, 'Descricao', 5000),
    itens_apropriacao: parseOptionalText(body.itens_apropriacao, 'Itens de apropriacao', 5000),
    valor_total: parseDecimal(body.valor_total, 'Valor total', { required: true, min: 0 }),
    tipo_macro_id: parseInteger(body.tipo_macro_id, 'Tipo macro'),
    tipo_sub_id: parseInteger(body.tipo_sub_id, 'Tipo sub'),
    ajuste_solicitado: parseDecimal(body.ajuste_solicitado, 'Ajuste solicitado', { min: 0 }),
    ajuste_pago: parseDecimal(body.ajuste_pago, 'Ajuste pago', { min: 0 }),
    apropriacoes: Array.isArray(body.apropriacoes) ? body.apropriacoes : undefined,
    credores: Array.isArray(body.credores) ? body.credores : undefined
  };
}

function validateContratoUpdateBody(body = {}) {
  ensureAllowedKeys(
    body,
    [
      'obra_id',
      'codigo',
      'ref_contrato',
      'fornecedor',
      'descricao',
      'itens_apropriacao',
      'valor_total',
      'tipo_macro_id',
      'tipo_sub_id',
      'ativo',
      'ajuste_solicitado',
      'ajuste_pago',
      'apropriacoes',
      'credores'
    ],
    'Atualizacao de contrato'
  );

  return {
    obra_id: parseInteger(body.obra_id, 'Obra'),
    codigo: parseOptionalText(body.codigo, 'Codigo', 255),
    ref_contrato: parseOptionalText(body.ref_contrato, 'Ref. do contrato', 255),
    fornecedor: parseOptionalText(body.fornecedor, 'Fornecedor', 255),
    descricao: parseOptionalText(body.descricao, 'Descricao', 5000),
    itens_apropriacao: parseOptionalText(body.itens_apropriacao, 'Itens de apropriacao', 5000),
    valor_total: parseDecimal(body.valor_total, 'Valor total', { min: 0 }),
    tipo_macro_id: parseInteger(body.tipo_macro_id, 'Tipo macro'),
    tipo_sub_id: parseInteger(body.tipo_sub_id, 'Tipo sub'),
    ativo: parseBoolean(body.ativo, 'Ativo'),
    ajuste_solicitado: parseDecimal(body.ajuste_solicitado, 'Ajuste solicitado', { min: 0 }),
    ajuste_pago: parseDecimal(body.ajuste_pago, 'Ajuste pago', { min: 0 }),
    apropriacoes: Array.isArray(body.apropriacoes) ? body.apropriacoes : undefined,
    credores: Array.isArray(body.credores) ? body.credores : undefined
  };
}

function validateCompraQuery(query = {}) {
  ensureAllowedKeys(query, ['obra_id', 'contexto', 'visao'], 'Consulta de compras');
  const contexto = parseOptionalText(query.contexto, 'Contexto', 40);
  const contextoNormalizado = contexto ? String(contexto).trim().toLowerCase() : undefined;
  if (contextoNormalizado && !['delegacao'].includes(contextoNormalizado)) {
    throw new ValidationError('Contexto de consulta invalido.');
  }
  const visao = parseOptionalText(query.visao, 'Visao', 40);
  const visaoNormalizada = visao ? String(visao).trim().toLowerCase() : undefined;
  if (visaoNormalizada && !['resumo', 'delegacao'].includes(visaoNormalizada)) {
    throw new ValidationError('Visao de consulta invalida.');
  }

  return {
    obra_id: parseInteger(query.obra_id, 'Obra'),
    contexto: contextoNormalizado,
    visao: visaoNormalizada
  };
}

  function validateCompraCreateBody(body = {}) {
    ensureAllowedKeys(
      body,
      ['obra_id', 'necessario_para', 'observacoes', 'link_geral', 'itens'],
    'Solicitacao de compra'
  );

  if (!Array.isArray(body.itens) || body.itens.length === 0) {
    throw new ValidationError('Informe ao menos um item.');
  }

  if (body.itens.length > 300) {
    throw new ValidationError('Quantidade de itens excede o limite permitido.');
  }

  body.itens.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new ValidationError(`Item ${index + 1} invalido.`);
    }
  });

  return {
    obra_id: parseInteger(body.obra_id, 'Obra', { required: true }),
    necessario_para: parseDateOnly(body.necessario_para, 'Necessario para'),
    observacoes: parseOptionalText(body.observacoes, 'Observacoes', 5000),
    link_geral: parseOptionalUrl(body.link_geral, 'Link geral'),
      itens: body.itens
    };
  }

  function validateCompraDiretaCreateBody(body = {}) {
    ensureAllowedKeys(
      body,
      [
        'obra_id',
        'tipo_solicitacao_id',
        'parceiro_id',
        'favorecido_id',
        'favorecido_chave_pix',
        'necessario_para',
        'observacoes',
        'dados_pagamento',
        'link_geral',
        'itens',
        'origem',
        'forma_pagamento_ids',
        'formas_pagamento',
        'desconto_total',
        'anexos_cabecalho',
        'frete_tipo',
        'frete_valor',
        'frete_data_vencimento',
        'frete_parceiro_id',
        'frete_dados_pagamento',
        'frete_forma_pagamento_id',
        'frete_favorecido_id',
        'frete_favorecido_chave_pix'
      ],
      'Compra direta'
    );

    if (!Array.isArray(body.itens) || body.itens.length === 0) {
      throw new ValidationError('Informe ao menos um item.');
    }

    if (body.itens.length > 300) {
      throw new ValidationError('Quantidade de itens excede o limite permitido.');
    }

    body.itens.forEach((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new ValidationError(`Item ${index + 1} invalido.`);
      }
    });

    if (body.anexos_cabecalho !== undefined && !Array.isArray(body.anexos_cabecalho)) {
      throw new ValidationError('Anexos da compra direta invalidos.');
    }

    const formaPagamentoIds = parseIdArray(body.forma_pagamento_ids, 'Forma de pagamento', {
      required: true,
      maxItems: 20
    });
    if (body.formas_pagamento !== undefined && !Array.isArray(body.formas_pagamento)) {
      throw new ValidationError('Valores por forma de pagamento invalidos.');
    }
    const formasPagamento = Array.isArray(body.formas_pagamento)
      ? body.formas_pagamento.map((item, index) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) {
            throw new ValidationError(`Forma de pagamento ${index + 1} invalida.`);
          }
          ensureAllowedKeys(
            item,
            ['id', 'valor', 'favorecido_id', 'chave_pix', 'dados_pagamento'],
            `Forma de pagamento ${index + 1}`
          );
          const formaNormalizada = {
            id: parseInteger(item.id, `Forma de pagamento ${index + 1}`, { required: true }),
            valor: parseDecimal(item.valor, `Valor da forma de pagamento ${index + 1}`, { min: 0.01, scale: 2, required: true })
          };
          const favorecidoId = parseInteger(item.favorecido_id, `Favorecido da forma de pagamento ${index + 1}`, { positiveOnly: true });
          const chavePix = parseOptionalText(item.chave_pix, `Chave PIX da forma de pagamento ${index + 1}`, 255);
          const dadosPagamento = parseOptionalText(item.dados_pagamento, `Dados da forma de pagamento ${index + 1}`, 1500);

          if (favorecidoId !== undefined && favorecidoId !== null) formaNormalizada.favorecido_id = favorecidoId;
          if (chavePix !== undefined && chavePix !== null) formaNormalizada.chave_pix = chavePix;
          if (dadosPagamento !== undefined && dadosPagamento !== null) formaNormalizada.dados_pagamento = dadosPagamento;
          return formaNormalizada;
        })
      : null;

    return {
      obra_id: parseInteger(body.obra_id, 'Obra', { required: true }),
      tipo_solicitacao_id: parseInteger(body.tipo_solicitacao_id, 'Tipo de solicitacao', { positiveOnly: true }),
      parceiro_id: parseInteger(body.parceiro_id, 'Credor', { positiveOnly: true }),
      favorecido_id: parseInteger(body.favorecido_id, 'Favorecido', { positiveOnly: true }),
      favorecido_chave_pix: parseOptionalText(body.favorecido_chave_pix, 'Chave PIX do favorecido', 255),
      necessario_para: parseDateOnly(body.necessario_para, 'Data de vencimento', { required: true }),
      observacoes: parseOptionalText(body.observacoes, 'Observacoes', 5000),
      dados_pagamento: parseOptionalText(body.dados_pagamento, 'Dados para pagamento', 1500),
      link_geral: parseOptionalUrl(body.link_geral, 'Link geral'),
      origem: 'COMPRA_DIRETA',
      forma_pagamento_ids: formaPagamentoIds,
      formas_pagamento: formasPagamento,
      desconto_total: parseDecimal(body.desconto_total, 'Desconto concedido', { min: 0, scale: 2 }) || 0,
      frete_tipo: parseOptionalText(body.frete_tipo, 'Tipo de frete', 20),
      frete_valor: parseDecimal(body.frete_valor, 'Valor do frete', { min: 0, scale: 2 }) || 0,
      frete_data_vencimento: parseDateOnly(body.frete_data_vencimento, 'Vencimento do frete'),
      frete_parceiro_id: parseInteger(body.frete_parceiro_id, 'Credor do frete', { positiveOnly: true }),
      frete_dados_pagamento: parseOptionalText(body.frete_dados_pagamento, 'Dados para pagamento do frete', 1500),
      frete_forma_pagamento_id: parseInteger(body.frete_forma_pagamento_id, 'Forma de pagamento do frete', { positiveOnly: true }),
      frete_favorecido_id: parseInteger(body.frete_favorecido_id, 'Favorecido do frete', { positiveOnly: true }),
      frete_favorecido_chave_pix: parseOptionalText(body.frete_favorecido_chave_pix, 'Chave PIX do frete', 255),
      anexos_cabecalho: body.anexos_cabecalho || [],
      itens: body.itens
    };
  }

function validateCompraIntegrarBody(body = {}) {
  ensureAllowedKeys(body, ['numero_sienge'], 'Integracao da solicitacao de compra');

  return {
    numero_sienge: parseOptionalText(body.numero_sienge, 'Numero do Sienge', 120, { required: true })
  };
}

function validateCompraEnviarBody(body = {}) {
  ensureAllowedKeys(body, ['fornecedores', 'itens'], 'Envio para fornecedores');

  if (!Array.isArray(body.fornecedores) || body.fornecedores.length === 0) {
    throw new ValidationError('Selecione ao menos um fornecedor.');
  }

  if (body.fornecedores.length > 100) {
    throw new ValidationError('Quantidade de fornecedores excede o limite permitido.');
  }

  const normalizarItemCotacao = (entry, index, contexto = 'Item') => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new ValidationError(`${contexto} ${index + 1} invalido.`);
    }

    ensureAllowedKeys(
      entry,
      ['item_tipo', 'item_referencia_id', 'item_key', 'solicitacao_compra_item_id', 'solicitacao_compra_item_manual_id'],
      `${contexto} ${index + 1}`
    );

    const itemKeyParts = String(entry.item_key || '').split(':');
    const tipoPeloItemKey = itemKeyParts.length === 2 ? itemKeyParts[0] : null;
    const referenciaPeloItemKey = itemKeyParts.length === 2 ? itemKeyParts[1] : null;
    const itemTipo = parseOptionalText(entry.item_tipo || tipoPeloItemKey, 'Tipo do item', 20, { required: true }).toUpperCase();
    if (!['CADASTRADO', 'MANUAL'].includes(itemTipo)) {
      throw new ValidationError(`Tipo do item ${index + 1} invalido.`);
    }

    const solicitacaoCompraItemId = parseInteger(entry.solicitacao_compra_item_id, `${contexto} ${index + 1}`, {
      positiveOnly: true
    });
    const solicitacaoCompraItemManualId = parseInteger(entry.solicitacao_compra_item_manual_id, `${contexto} ${index + 1}`, {
      positiveOnly: true
    });
    const referenciaInformada =
      entry.item_referencia_id ||
      referenciaPeloItemKey ||
      (itemTipo === 'CADASTRADO' ? solicitacaoCompraItemId : solicitacaoCompraItemManualId);

    return {
      item_tipo: itemTipo,
      item_referencia_id: parseInteger(referenciaInformada, `${contexto} ${index + 1}`, { required: true, positiveOnly: true }),
      item_key: parseOptionalText(entry.item_key, 'Chave do item', 80),
      solicitacao_compra_item_id: solicitacaoCompraItemId,
      solicitacao_compra_item_manual_id: solicitacaoCompraItemManualId
    };
  };

  const normalizarItensCotacao = (itensPayload, contexto) => {
    if (itensPayload === undefined) return undefined;
    if (!Array.isArray(itensPayload)) {
      throw new ValidationError(`Selecione ao menos um item para ${contexto}.`);
    }
    if (itensPayload.length === 0) return [];

    if (itensPayload.length > 500) {
      throw new ValidationError('Quantidade de itens excede o limite permitido.');
    }

    return itensPayload.map((entry, index) => normalizarItemCotacao(entry, index, 'Item'));
  };

  const fornecedores = body.fornecedores.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new ValidationError(`Fornecedor ${index + 1} invalido.`);
    }

    ensureAllowedKeys(
      entry,
      ['fornecedor_id', 'parceiro_id', 'nome', 'cnpj', 'documento', 'email', 'whatsapp', 'contato', 'itens'],
      `Fornecedor ${index + 1}`
    );

    const fornecedorId = parseInteger(entry.fornecedor_id, 'Fornecedor', { positiveOnly: true });
    const parceiroId = parseInteger(entry.parceiro_id, 'Parceiro', { positiveOnly: true });
    const nome = parseOptionalText(entry.nome, 'Nome do fornecedor', 255);
    const cnpj = parseCpfCnpj(entry.cnpj || entry.documento, 'CPF/CNPJ do fornecedor');
    const email = parseOptionalText(entry.email, 'Email do fornecedor', 255);
    const whatsapp = parseOptionalText(entry.whatsapp, 'WhatsApp do fornecedor', 100);
    const contato = parseOptionalText(entry.contato, 'Contato do fornecedor', 255);

    if (!fornecedorId && !parceiroId && !nome) {
      throw new ValidationError(`Fornecedor ${index + 1} invalido.`);
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(email)) {
      throw new ValidationError(`Email do fornecedor ${index + 1} invalido.`);
    }

    return {
      fornecedor_id: fornecedorId,
      parceiro_id: parceiroId,
      nome,
      cnpj,
      email,
      whatsapp,
      contato,
      itens: normalizarItensCotacao(entry.itens, `o fornecedor ${index + 1}`)
    };
  });

  let itens;
  if (body.itens !== undefined) {
    itens = normalizarItensCotacao(body.itens, 'cotacao');
  }

  return itens === undefined
    ? { fornecedores }
    : { fornecedores, itens };
}

function validateCompraCotacaoCancelBody(body = {}) {
  ensureAllowedKeys(body, ['motivo'], 'Cancelamento da cotacao');

  return {
    motivo: parseOptionalText(body.motivo, 'Motivo do cancelamento', 5000, { required: true })
  };
}

function validateCompraCotacaoRespostaInternaParams(params = {}) {
  ensureAllowedKeys(params, ['id', 'cotacaoId'], 'Cotacao da solicitacao de compra');
  return {
    id: parseInteger(params.id, 'Solicitacao de compra', { required: true, positiveOnly: true }),
    cotacaoId: parseInteger(params.cotacaoId, 'Cotacao', { required: true, positiveOnly: true })
  };
}

function validateCompraCotacaoRespostaInternaBody(body = {}) {
  ensureAllowedKeys(
    body,
    [
      'itens',
      'valor_minimo_pedido',
      'desconto_total',
      'condicao_pagamento',
      'prazo_entrega',
      'prazo_entrega_dias',
      'prazo_entrega_tipo',
      'difal_valor',
      'frete_tipo',
      'frete_modo',
      'frete_valor',
      'frete_data_vencimento',
      'frete_transportador_nome',
      'frete_transportador_cpf_cnpj',
      'observacao_resposta',
      'nova_oferta_saldo',
      'finalizar'
    ],
    'Resposta interna da cotacao'
  );

  if (!Array.isArray(body.itens) || body.itens.length === 0) {
    throw new ValidationError('Informe ao menos um item da resposta.');
  }
  if (body.itens.length > 500) {
    throw new ValidationError('Quantidade de itens da resposta excede o limite permitido.');
  }

  const itens = body.itens.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new ValidationError(`Item ${index + 1} da resposta invalido.`);
    }

    ensureAllowedKeys(
      entry,
      [
        'item_tipo',
        'item_referencia_id',
        'status_disponibilidade',
        'disponivel',
        'preco',
        'prazo',
        'data_chegada',
        'observacao',
        'quantidade_minima_item',
        'quantidade_disponivel',
        'ipi_valor',
        'icms_valor',
        'st_valor',
        'frete_valor'
      ],
      `Item ${index + 1} da resposta`
    );

    const itemTipo = parseOptionalText(entry.item_tipo, 'Tipo do item', 20, { required: true }).toUpperCase();
    if (!['CADASTRADO', 'MANUAL'].includes(itemTipo)) {
      throw new ValidationError(`Tipo do item ${index + 1} invalido.`);
    }

    const statusDisponibilidade = parseOptionalText(
      entry.status_disponibilidade || (entry.disponivel === false ? 'NAO_TEM' : 'DISPONIVEL'),
      'Disponibilidade',
      20,
      { required: true }
    ).toUpperCase();
    if (!['DISPONIVEL', 'NAO_TEM', 'PARA_CHEGAR'].includes(statusDisponibilidade)) {
      throw new ValidationError(`Disponibilidade do item ${index + 1} invalida.`);
    }

    return {
      item_tipo: itemTipo,
      item_referencia_id: parseInteger(entry.item_referencia_id, `Item ${index + 1}`, {
        required: true,
        positiveOnly: true
      }),
      status_disponibilidade: statusDisponibilidade,
      disponivel: statusDisponibilidade !== 'NAO_TEM',
      preco: parseDecimal(entry.preco, `Preco do item ${index + 1}`, {
        min: 0,
        scale: 10,
        brazilianFormat: true
      }),
      prazo: parseOptionalText(entry.prazo, `Prazo do item ${index + 1}`, 120),
      data_chegada: parseDateOnly(entry.data_chegada, `Data de chegada do item ${index + 1}`),
      observacao: parseOptionalText(entry.observacao, `Observacao do item ${index + 1}`, 5000),
      quantidade_minima_item: parseDecimal(
        entry.quantidade_minima_item,
        `Quantidade minima do item ${index + 1}`,
        { min: 0, scale: 3, brazilianFormat: true }
      ),
      quantidade_disponivel: parseDecimal(
        entry.quantidade_disponivel,
        `Quantidade disponivel do item ${index + 1}`,
        { min: 0, scale: 3, brazilianFormat: true }
      ),
      ipi_valor: parseDecimal(entry.ipi_valor, `IPI do item ${index + 1}`, {
        min: 0,
        scale: 2,
        brazilianFormat: true
      }) || 0,
      icms_valor: parseDecimal(entry.icms_valor, `ICMS do item ${index + 1}`, {
        min: 0,
        scale: 2,
        brazilianFormat: true
      }) || 0,
      st_valor: parseDecimal(entry.st_valor, `ST do item ${index + 1}`, {
        min: 0,
        scale: 2,
        brazilianFormat: true
      }) || 0,
      frete_valor: parseDecimal(entry.frete_valor, `Frete do item ${index + 1}`, {
        min: 0,
        scale: 2,
        brazilianFormat: true
      }) || 0
    };
  });

  return {
    itens,
    nova_oferta_saldo: parseBoolean(body.nova_oferta_saldo, 'Nova oferta para o saldo'),
    valor_minimo_pedido: parseDecimal(body.valor_minimo_pedido, 'Valor minimo do pedido', {
      min: 0,
      scale: 2,
      brazilianFormat: true
    }),
    desconto_total: parseDecimal(body.desconto_total, 'Desconto concedido', {
      min: 0,
      scale: 2,
      brazilianFormat: true
    }) || 0,
    condicao_pagamento: parseOptionalText(body.condicao_pagamento, 'Condicao de pagamento', 5000),
    prazo_entrega: parseOptionalText(body.prazo_entrega, 'Prazo de entrega', 120),
    prazo_entrega_dias: parseInteger(body.prazo_entrega_dias, 'Prazo de entrega em dias', {
      positiveOnly: true
    }),
    prazo_entrega_tipo: parseOptionalText(body.prazo_entrega_tipo, 'Tipo de prazo de entrega', 20),
    difal_valor: parseDecimal(body.difal_valor, 'DIFAL', {
      min: 0,
      scale: 2,
      brazilianFormat: true
    }) || 0,
    frete_tipo: parseOptionalText(body.frete_tipo, 'Tipo de frete', 20),
    frete_modo: parseOptionalText(body.frete_modo, 'Modo do frete', 20),
    frete_valor: parseDecimal(body.frete_valor, 'Valor do frete', {
      min: 0,
      scale: 2,
      brazilianFormat: true
    }) || 0,
    frete_data_vencimento: parseDateOnly(body.frete_data_vencimento, 'Data para pagamento do frete'),
    frete_transportador_nome: parseOptionalText(body.frete_transportador_nome, 'Transportador', 255),
    frete_transportador_cpf_cnpj: parseCpfCnpj(body.frete_transportador_cpf_cnpj, 'CPF/CNPJ do transportador'),
    observacao_resposta: parseOptionalText(body.observacao_resposta, 'Observacao da resposta', 5000),
    finalizar: body.finalizar !== false
  };
}

function validateCompraEncerrarBody(body = {}) {
  ensureAllowedKeys(
    body,
    [
      'vencedores',
      'alocacoes',
      'fechamento_parcial_confirmado',
      'justificativa',
      'fechamento_excedente_confirmado',
      'previsao_entrega',
      'previsoes_entrega',
      'justificativa_excedente'
    ],
    'Encerramento da cotacao'
  );

  const entradas = Array.isArray(body.alocacoes) && body.alocacoes.length
    ? body.alocacoes
    : body.vencedores;

  if (!Array.isArray(entradas) || entradas.length === 0) {
    throw new ValidationError('Selecione ao menos um vencedor.');
  }

  if (entradas.length > 500) {
    throw new ValidationError('Quantidade de vencedores excede o limite permitido.');
  }

  let previsoesEntrega;
  if (body.previsoes_entrega !== undefined) {
    if (!Array.isArray(body.previsoes_entrega) || !body.previsoes_entrega.length || body.previsoes_entrega.length > 500) {
      throw new ValidationError('Informe as previsões confirmadas por fornecedor.');
    }
    const ids = new Set();
    previsoesEntrega = body.previsoes_entrega.map((entrada) => {
      if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) throw new ValidationError('Previsão de fornecedor inválida.');
      ensureAllowedKeys(entrada, ['fornecedor_id', 'data_base', 'previsao', 'previsao_calculada', 'confirmada'], 'Previsão de entrega');
      const id = parseInteger(entrada.fornecedor_id, 'Fornecedor', { required: true });
      if (ids.has(id)) throw new ValidationError('Fornecedor repetido nas previsões.');
      ids.add(id);
      if (entrada.confirmada !== true) throw new ValidationError('Confirme a data de cada fornecedor.');
      const { dataValida } = require('../services/pedidoEntregaDomain');
      if (!dataValida(entrada.data_base) || !dataValida(entrada.previsao)
        || (!isBlank(entrada.previsao_calculada) && !dataValida(entrada.previsao_calculada))) {
        throw new ValidationError('Data de previsão inválida.');
      }
      return { fornecedor_id: id, data_base: parseDateOnly(entrada.data_base, 'Data base', { required: true }),
        previsao: parseDateOnly(entrada.previsao, 'Previsão confirmada', { required: true }),
        previsao_calculada: parseDateOnly(entrada.previsao_calculada, 'Previsão calculada'), confirmada: true };
    });
  }
  return {
    previsoes_entrega: previsoesEntrega,
    fechamento_parcial_confirmado: parseBoolean(
      body.fechamento_parcial_confirmado,
      'Confirmacao do fechamento parcial'
    ) || false,
    previsao_entrega: parseOptionalText(body.previsao_entrega, 'Previsao de entrega', 10),
    justificativa: parseOptionalText(body.justificativa, 'Justificativa', 2000),
    fechamento_excedente_confirmado: parseBoolean(
      body.fechamento_excedente_confirmado,
      'Confirmacao do fechamento acima da quantidade solicitada'
    ) || false,
    justificativa_excedente: parseOptionalText(
      body.justificativa_excedente,
      'Justificativa da quantidade excedente',
      2000
    ),
    vencedores: entradas.map((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new ValidationError(`Vencedor ${index + 1} invalido.`);
      }

      ensureAllowedKeys(
        entry,
        ['resposta_item_id', 'quantidade', 'quantidade_alocada', 'quantidade_pedido'],
        `Vencedor ${index + 1}`
      );

      return {
        resposta_item_id: parseInteger(entry.resposta_item_id, 'Resposta vencedora', {
          required: true
        }),
        quantidade_alocada: parseDecimal(
          entry.quantidade_alocada ?? entry.quantidade ?? entry.quantidade_pedido,
          'Quantidade alocada',
          { min: 0, scale: 3, brazilianFormat: true }
        )
      };
    })
  };
}

function validateCompraEncerrarSemPedidoBody(body = {}) {
  ensureAllowedKeys(
    body,
    ['confirmado', 'justificativa'],
    'Encerramento da cotacao sem pedido'
  );

  const confirmado = parseBoolean(
    body.confirmado,
    'Confirmacao do encerramento sem pedido'
  ) || false;
  if (!confirmado) {
    throw new ValidationError('Confirme que o saldo restante nao sera comprado.');
  }

  const justificativa = parseOptionalText(
    body.justificativa,
    'Justificativa',
    2000,
    { required: true }
  );
  if (justificativa.length < 10) {
    throw new ValidationError('A justificativa deve possuir ao menos 10 caracteres.');
  }

  return { confirmado: true, justificativa };
}

function validateCompraPedidoQuery(query = {}) {
  ensureAllowedKeys(query, ['obra_id', 'solicitacao_id', 'status', 'status_financeiro', 'q', 'visao'], 'Consulta de pedidos de compra');

  const visao = parseOptionalText(query.visao, 'Visao', 40);
  const visaoNormalizada = visao ? String(visao).trim().toLowerCase() : undefined;
  if (visaoNormalizada && visaoNormalizada !== 'resumo') {
    throw new ValidationError('Visao de consulta invalida.');
  }

  return {
    obra_id: parseInteger(query.obra_id, 'Obra'),
    solicitacao_id: parseInteger(query.solicitacao_id, 'Solicitacao de compra'),
    status: parseOptionalText(query.status, 'Status', 40),
    status_financeiro: parseOptionalText(query.status_financeiro, 'Status financeiro', 40),
    q: parseOptionalText(query.q, 'Busca', 120),
    visao: visaoNormalizada
  };
}

function validateCompraPedidoAuditoriaQuery(query = {}) {
  ensureAllowedKeys(
    query,
    ['obra_id', 'pedido_id', 'item_id', 'acao', 'q'],
    'Consulta de auditoria de pedidos de compra'
  );

  return {
    obra_id: parseInteger(query.obra_id, 'Obra'),
    pedido_id: parseInteger(query.pedido_id, 'Pedido de compra'),
    item_id: parseInteger(query.item_id, 'Item do pedido'),
    acao: parseOptionalText(query.acao, 'Acao', 60),
    q: parseOptionalText(query.q, 'Busca', 120)
  };
}

function validateCompraRelatorioFornecedoresQuery(query = {}) {
  ensureAllowedKeys(
    query,
    ['obra_id', 'data_inicio', 'data_fim'],
    'Consulta do relatorio de fornecedores de compras'
  );

  const dataInicio = parseDateOnly(query.data_inicio, 'Data inicial');
  const dataFim = parseDateOnly(query.data_fim, 'Data final');

  if (dataInicio && dataFim && dataInicio > dataFim) {
    throw new ValidationError('Data inicial nao pode ser maior que a data final.');
  }

  return {
    obra_id: parseInteger(query.obra_id, 'Obra'),
    data_inicio: dataInicio,
    data_fim: dataFim
  };
}

function validateCompraRelatorioComprasFornecedorQuery(query = {}) {
  ensureAllowedKeys(
    query,
    ['obra_id', 'data_inicio', 'data_fim'],
    'Consulta do relatorio de compras por fornecedor'
  );

  const dataInicio = parseDateOnly(query.data_inicio, 'Data inicial');
  const dataFim = parseDateOnly(query.data_fim, 'Data final');

  if (dataInicio && dataFim && dataInicio > dataFim) {
    throw new ValidationError('Data inicial nao pode ser maior que a data final.');
  }

  return {
    obra_id: parseInteger(query.obra_id, 'Obra'),
    data_inicio: dataInicio,
    data_fim: dataFim
  };
}

function validateCompraRelatorioComprasDiretasQuery(query = {}) {
  ensureAllowedKeys(
    query,
    ['obra_id', 'data_inicio', 'data_fim', 'solicitante_id', 'parceiro_id', 'status', 'q', 'item', 'limit'],
    'Consulta do relatorio de compras diretas'
  );

  const dataInicio = parseDateOnly(query.data_inicio, 'Data inicial');
  const dataFim = parseDateOnly(query.data_fim, 'Data final');

  if (dataInicio && dataFim && dataInicio > dataFim) {
    throw new ValidationError('Data inicial nao pode ser maior que a data final.');
  }

  const limit = parseInteger(query.limit, 'Limite');
  if (limit && (limit < 1 || limit > 5000)) {
    throw new ValidationError('Limite deve estar entre 1 e 5000.');
  }

  return {
    obra_id: parseInteger(query.obra_id, 'Obra'),
    data_inicio: dataInicio,
    data_fim: dataFim,
    solicitante_id: parseInteger(query.solicitante_id, 'Solicitante'),
    parceiro_id: parseInteger(query.parceiro_id, 'Credor'),
    status: parseOptionalText(query.status, 'Status', 80),
    q: parseOptionalText(query.q, 'Busca geral', 160),
    item: parseOptionalText(query.item, 'Item', 160),
    limit
  };
}

function validateCompraRelatorioPrecosInsumosQuery(query = {}) {
  ensureAllowedKeys(
    query,
    ['obra_id', 'data_inicio', 'data_fim'],
    'Consulta do relatorio de precos por insumo e fornecedor'
  );

  const dataInicio = parseDateOnly(query.data_inicio, 'Data inicial');
  const dataFim = parseDateOnly(query.data_fim, 'Data final');

  if (dataInicio && dataFim && dataInicio > dataFim) {
    throw new ValidationError('Data inicial nao pode ser maior que a data final.');
  }

  return {
    obra_id: parseInteger(query.obra_id, 'Obra'),
    data_inicio: dataInicio,
    data_fim: dataFim
  };
}

function validateCompraRelatorioEvolucaoQuery(query = {}) {
  ensureAllowedKeys(
    query,
    ['obra_id', 'data_inicio', 'data_fim'],
    'Consulta do relatorio de evolucao mensal de compras'
  );

  const dataInicio = parseDateOnly(query.data_inicio, 'Data inicial');
  const dataFim = parseDateOnly(query.data_fim, 'Data final');

  if (dataInicio && dataFim && dataInicio > dataFim) {
    throw new ValidationError('Data inicial nao pode ser maior que a data final.');
  }

  return {
    obra_id: parseInteger(query.obra_id, 'Obra'),
    data_inicio: dataInicio,
    data_fim: dataFim
  };
}

function validateCompraRelatorioEconomiaCotacoesQuery(query = {}) {
  ensureAllowedKeys(
    query,
    ['obra_id', 'data_inicio', 'data_fim'],
    'Consulta do relatorio de economia em cotacoes'
  );

  const dataInicio = parseDateOnly(query.data_inicio, 'Data inicial');
  const dataFim = parseDateOnly(query.data_fim, 'Data final');

  if (dataInicio && dataFim && dataInicio > dataFim) {
    throw new ValidationError('Data inicial nao pode ser maior que a data final.');
  }

  return {
    obra_id: parseInteger(query.obra_id, 'Obra'),
    data_inicio: dataInicio,
    data_fim: dataFim
  };
}

function validateCompraRelatorioCicloQuery(query = {}) {
  ensureAllowedKeys(
    query,
    ['obra_id', 'data_inicio', 'data_fim'],
    'Consulta do relatorio de ciclo de compras'
  );

  const dataInicio = parseDateOnly(query.data_inicio, 'Data inicial');
  const dataFim = parseDateOnly(query.data_fim, 'Data final');

  if (dataInicio && dataFim && dataInicio > dataFim) {
    throw new ValidationError('Data inicial nao pode ser maior que a data final.');
  }

  return {
    obra_id: parseInteger(query.obra_id, 'Obra'),
    data_inicio: dataInicio,
    data_fim: dataFim
  };
}

function validateCompraRelatorioDemandaPedidosQuery(query = {}) {
  ensureAllowedKeys(
    query,
    ['obra_id', 'data_inicio', 'data_fim'],
    'Consulta do relatorio de demanda e pedidos de compras'
  );

  const dataInicio = parseDateOnly(query.data_inicio, 'Data inicial');
  const dataFim = parseDateOnly(query.data_fim, 'Data final');

  if (dataInicio && dataFim && dataInicio > dataFim) {
    throw new ValidationError('Data inicial nao pode ser maior que a data final.');
  }

  return {
    obra_id: parseInteger(query.obra_id, 'Obra'),
    data_inicio: dataInicio,
    data_fim: dataFim
  };
}

function validateCompraRelatorioCategoriasInsumosQuery(query = {}) {
  ensureAllowedKeys(
    query,
    ['obra_id', 'data_inicio', 'data_fim'],
    'Consulta do relatorio de compras por categoria e insumo'
  );

  const dataInicio = parseDateOnly(query.data_inicio, 'Data inicial');
  const dataFim = parseDateOnly(query.data_fim, 'Data final');

  if (dataInicio && dataFim && dataInicio > dataFim) {
    throw new ValidationError('Data inicial nao pode ser maior que a data final.');
  }

  return {
    obra_id: parseInteger(query.obra_id, 'Obra'),
    data_inicio: dataInicio,
    data_fim: dataFim
  };
}

function validateCompraRelatorioPendenciasCotacoesQuery(query = {}) {
  ensureAllowedKeys(
    query,
    ['obra_id', 'data_inicio', 'data_fim'],
    'Consulta do relatorio de pendencias de cotacoes'
  );

  const dataInicio = parseDateOnly(query.data_inicio, 'Data inicial');
  const dataFim = parseDateOnly(query.data_fim, 'Data final');

  if (dataInicio && dataFim && dataInicio > dataFim) {
    throw new ValidationError('Data inicial nao pode ser maior que a data final.');
  }

  return {
    obra_id: parseInteger(query.obra_id, 'Obra'),
    data_inicio: dataInicio,
    data_fim: dataFim
  };
}

function validateCompraPedidoCreateBody(body = {}) {
  ensureAllowedKeys(body, ['fornecedor_compra_id'], 'Criacao de pedido de compra');

  return {
    fornecedor_compra_id: parseInteger(body.fornecedor_compra_id, 'Fornecedor', {
      required: true
    })
  };
}

function validateCompraPedidoItemAddBody(body = {}) {
  ensureAllowedKeys(body, ['resposta_item_id'], 'Inclusao de item no pedido');

  return {
    resposta_item_id: parseInteger(body.resposta_item_id, 'Resposta da cotacao', {
      required: true
    })
  };
}

function validateCompraPedidoStatusBody(body = {}) {
  ensureAllowedKeys(body, ['status'], 'Atualizacao de status do pedido');

  return {
    status: parseOptionalText(body.status, 'Status do pedido', 40, { required: true })
  };
}

function validateCompraPedidoReabrirBody(body = {}) {
  ensureAllowedKeys(body, ['motivo'], 'Reabertura de pedido para cotacao');

  return {
    motivo: parseOptionalText(body.motivo, 'Motivo da reabertura', 1000, { required: true })
  };
}

function validateCompraPedidoPrevisoesBody(body = {}) {
  ensureAllowedKeys(body, [
    'categoria_financeira_id', 'descricao', 'parcelas', 'comprovacao',
    'forma_pagamento_id', 'favorecido_pagamento_id', 'chave_pix', 'dados_pagamento',
    'boletos', 'fretes'
  ], 'Previsoes financeiras do pedido');
  if (!Array.isArray(body.parcelas) || body.parcelas.length === 0) {
    throw new ValidationError('Informe ao menos uma parcela da previsao.');
  }
  if (body.parcelas.length > 120) {
    throw new ValidationError('A previsao nao pode possuir mais de 120 parcelas.');
  }
  const comprovacao = body.comprovacao == null
    ? null
    : validateCompraPedidoDocumentoFinanceiroBody(body.comprovacao);
  const validarBoletos = (boletos, contexto) => {
    if (boletos == null) return [];
    if (!Array.isArray(boletos) || boletos.length > 120) {
      throw new ValidationError(`${contexto} deve possuir no maximo 120 arquivos.`);
    }
    return boletos.map((boleto, index) => {
      ensureAllowedKeys(boleto || {}, ['arquivo_url', 'arquivo_nome'], `${contexto} ${index + 1}`);
      return {
        arquivo_url: parseOptionalText(boleto?.arquivo_url, `URL de ${contexto.toLowerCase()} ${index + 1}`, 2000, { required: true }),
        arquivo_nome: parseOptionalText(boleto?.arquivo_nome, `Nome de ${contexto.toLowerCase()} ${index + 1}`, 255, { required: true })
      };
    });
  };
  const validarParcelas = (parcelas, contexto) => {
    if (!Array.isArray(parcelas) || parcelas.length === 0) {
      throw new ValidationError(`Informe ao menos uma parcela de ${contexto}.`);
    }
    if (parcelas.length > 120) throw new ValidationError(`${contexto} nao pode possuir mais de 120 parcelas.`);
    return parcelas.map((parcela, index) => {
      ensureAllowedKeys(parcela || {}, ['valor', 'data_vencimento'], `Parcela ${index + 1} de ${contexto}`);
      return {
        valor: parseDecimal(parcela?.valor, `Valor da parcela ${index + 1} de ${contexto}`, {
          required: true,
          min: 0.01,
          scale: 2,
          brazilianFormat: true
        }),
        data_vencimento: parseDateOnly(parcela?.data_vencimento, `Vencimento da parcela ${index + 1} de ${contexto}`, { required: true })
      };
    });
  };
  const fretes = body.fretes == null ? [] : body.fretes;
  if (!Array.isArray(fretes) || fretes.length > 50) {
    throw new ValidationError('A configuracao nao pode possuir mais de 50 fretes.');
  }
  return {
    categoria_financeira_id: parseInteger(body.categoria_financeira_id, 'Categoria financeira', { required: true }),
    descricao: parseOptionalText(body.descricao, 'Descricao', 255),
    forma_pagamento_id: parseInteger(body.forma_pagamento_id, 'Forma de pagamento', { required: true }),
    favorecido_pagamento_id: parseInteger(body.favorecido_pagamento_id, 'Favorecido', { required: true }),
    chave_pix: parseOptionalText(body.chave_pix, 'Chave PIX', 255),
    dados_pagamento: parseOptionalText(body.dados_pagamento, 'Dados para pagamento', 2000),
    boletos: validarBoletos(body.boletos, 'Boletos da compra'),
    comprovacao,
    parcelas: validarParcelas(body.parcelas, 'a compra'),
    fretes: fretes.map((frete, freteIndex) => {
      ensureAllowedKeys(frete || {}, [
        'frete_id', 'descricao', 'forma_pagamento_id', 'favorecido_pagamento_id',
        'chave_pix', 'dados_pagamento', 'boletos', 'parcelas'
      ], `Frete ${freteIndex + 1}`);
      return {
        frete_id: parseInteger(frete?.frete_id, `Frete ${freteIndex + 1}`, { required: true }),
        descricao: parseOptionalText(frete?.descricao, `Descricao do frete ${freteIndex + 1}`, 255),
        forma_pagamento_id: parseInteger(frete?.forma_pagamento_id, `Forma de pagamento do frete ${freteIndex + 1}`, { required: true }),
        favorecido_pagamento_id: parseInteger(frete?.favorecido_pagamento_id, `Favorecido do frete ${freteIndex + 1}`, { required: true }),
        chave_pix: parseOptionalText(frete?.chave_pix, `Chave PIX do frete ${freteIndex + 1}`, 255),
        dados_pagamento: parseOptionalText(frete?.dados_pagamento, `Dados para pagamento do frete ${freteIndex + 1}`, 2000),
        boletos: validarBoletos(frete?.boletos, `Boletos do frete ${freteIndex + 1}`),
        parcelas: validarParcelas(frete?.parcelas, `o frete ${freteIndex + 1}`)
      };
    })
  };
}

function validateCompraPedidoDocumentoFinanceiroBody(body = {}) {
  ensureAllowedKeys(
    body,
    ['tipo', 'numero_documento', 'arquivo_url', 'arquivo_nome', 'observacoes'],
    'Documento financeiro do pedido'
  );
  const tipo = parseOptionalText(body.tipo, 'Tipo do documento', 30, { required: true }).toUpperCase();
  if (!['NOTA_FISCAL', 'COMPROVANTE_COMPRA', 'OUTRA_CONFIRMACAO'].includes(tipo)) {
    throw new ValidationError('Tipo de documento financeiro invalido.');
  }
  const arquivoUrl = parseOptionalText(body.arquivo_url, 'URL do arquivo', 2000);
  const observacoes = parseOptionalText(body.observacoes, 'Observacoes', 2000);
  const numeroDocumento = parseOptionalText(body.numero_documento, 'Numero do documento', 120);
  if (!arquivoUrl && !observacoes && !numeroDocumento) {
    throw new ValidationError('Informe o numero, anexe um arquivo ou descreva a comprovacao da compra.');
  }
  return {
    tipo,
    numero_documento: numeroDocumento,
    arquivo_url: arquivoUrl,
    arquivo_nome: parseOptionalText(body.arquivo_nome, 'Nome do arquivo', 255),
    observacoes
  };
}

function validateCompraPedidoLiberarTitulosBody(body = {}) {
  ensureAllowedKeys(body, ['titulo_ids', 'forma_pagamento_id'], 'Liberacao financeira do pedido');
  if (!Array.isArray(body.titulo_ids) || body.titulo_ids.length === 0) {
    throw new ValidationError('Selecione ao menos uma previsao para liberar.');
  }
  return {
    titulo_ids: [...new Set(body.titulo_ids.map((id) => parseInteger(id, 'Titulo financeiro', { required: true })))],
    forma_pagamento_id: parseInteger(body.forma_pagamento_id, 'Forma de pagamento', { required: true })
  };
}

function validateCompraPedidoReaberturaParams(params = {}) {
  return {
    id: parseInteger(params.id, 'Pedido de compra', { required: true }),
    reaberturaId: parseInteger(params.reaberturaId, 'Pedido de reabertura', { required: true })
  };
}

function validateCompraPedidoDecisaoReaberturaBody(body = {}) {
  ensureAllowedKeys(body, ['decisao', 'motivo'], 'Decisao de reabertura do pedido');
  const decisao = parseOptionalText(body.decisao, 'Decisao', 20, { required: true }).toUpperCase();
  if (!['APROVAR', 'REJEITAR'].includes(decisao)) {
    throw new ValidationError('Decisao de reabertura invalida.');
  }
  return {
    decisao,
    motivo: parseOptionalText(body.motivo, 'Motivo da decisao', 1000, { required: true })
  };
}

function validateCompraPedidoStatusBatchBody(body = {}) {
  ensureAllowedKeys(body, ['pedido_ids', 'status'], 'Atualizacao em lote de pedidos');

  if (!Array.isArray(body.pedido_ids) || body.pedido_ids.length === 0) {
    throw new ValidationError('Selecione ao menos um pedido.');
  }

  if (body.pedido_ids.length > 100) {
    throw new ValidationError('Quantidade de pedidos excede o limite permitido.');
  }

  return {
    pedido_ids: body.pedido_ids.map((id) => parseInteger(id, 'Pedido', { required: true })),
    status: parseOptionalText(body.status, 'Status do pedido', 40, { required: true })
  };
}

function validateCompraSolicitacaoItemQuantidadeParams(params = {}) {
  return {
    id: parseInteger(params.id, 'Solicitacao de compra', { required: true }),
    itemId: parseInteger(params.itemId, 'Item da solicitacao de compra', { required: true })
  };
}

function parseCompraSolicitacaoItemTipo(value) {
  const itemTipo = parseOptionalText(value, 'Tipo do item', 20, { required: true }).toUpperCase();

  // Compra Direta usava INSUMO no frontend para representar o item cadastrado.
  return itemTipo === 'INSUMO' ? 'CADASTRADO' : itemTipo;
}

function validateCompraSolicitacaoItemQuantidadeBody(body = {}) {
  ensureAllowedKeys(body, ['item_tipo', 'quantidade', 'motivo'], 'Atualizacao de quantidade do item da solicitacao de compra');

  const itemTipo = parseCompraSolicitacaoItemTipo(body.item_tipo);
  if (!['CADASTRADO', 'MANUAL'].includes(itemTipo)) {
    throw new ValidationError('Tipo do item invalido.');
  }

  return {
    item_tipo: itemTipo,
    quantidade: parseDecimal(body.quantidade, 'Quantidade', { required: true, min: 0.01 }),
    motivo: parseOptionalText(body.motivo, 'Motivo da alteracao', 1000, { required: true })
  };
}

function validateCompraSolicitacaoItemApropriacoesBody(body = {}) {
  ensureAllowedKeys(body, ['item_tipo', 'apropriacao_id', 'apropriacoes', 'motivo'], 'Atualizacao de apropriacoes do item da solicitacao de compra');

  const itemTipo = parseCompraSolicitacaoItemTipo(body.item_tipo);
  if (!['CADASTRADO', 'MANUAL'].includes(itemTipo)) {
    throw new ValidationError('Tipo do item invalido.');
  }

  if (!Array.isArray(body.apropriacoes) && !body.apropriacao_id) {
    throw new ValidationError('Informe ao menos uma apropriacao para o item.');
  }

  return {
    item_tipo: itemTipo,
    apropriacao_id: parseInteger(body.apropriacao_id, 'Apropriacao', { required: false }),
    apropriacoes: Array.isArray(body.apropriacoes) ? body.apropriacoes : undefined,
    motivo: parseOptionalText(body.motivo, 'Motivo da alteracao', 1000, { required: true })
  };
}

function validateCompraCatalogarItemManualBody(body = {}) {
  ensureAllowedKeys(
    body,
    [
      'acao',
      'insumo_id',
      'nome',
      'descricao',
      'unidade_id',
      'unidade_manual',
      'categoria_id',
      'motivo',
      'corrigir_vinculo',
      'confirmar_novo_duplicado'
    ],
    'Catalogacao do item manual'
  );

  const acao = parseOptionalText(body.acao, 'Acao de catalogacao', 30, { required: true }).toUpperCase();
  if (!['CRIAR_INSUMO', 'VINCULAR_EXISTENTE'].includes(acao)) {
    throw new ValidationError('Acao de catalogacao invalida.');
  }

  const payload = {
    acao,
    motivo: parseOptionalText(body.motivo, 'Motivo da catalogacao', 1000),
    corrigir_vinculo: parseBoolean(body.corrigir_vinculo, 'Corrigir vinculo') || false,
    confirmar_novo_duplicado: parseBoolean(body.confirmar_novo_duplicado, 'Confirmar novo duplicado') || false
  };

  if (acao === 'VINCULAR_EXISTENTE') {
    payload.insumo_id = parseInteger(body.insumo_id, 'Insumo existente', { required: true });
    return payload;
  }

  payload.nome = parseOptionalText(body.nome, 'Nome do insumo', 255, { required: true });
  payload.descricao = parseOptionalText(body.descricao, 'Descricao do insumo', 5000);
  payload.unidade_id = parseInteger(body.unidade_id, 'Unidade', { required: false });
  payload.unidade_manual = parseOptionalText(body.unidade_manual, 'Unidade manual', 50);
  payload.categoria_id = parseInteger(body.categoria_id, 'Categoria', { required: false });

  if (!payload.unidade_id && !payload.unidade_manual) {
    throw new ValidationError('Selecione uma unidade ou informe a unidade manual.');
  }

  return payload;
}

function validateCompraSolicitacaoInativarMassaBody(body = {}) {
  ensureAllowedKeys(body, ['solicitacao_ids'], 'Inativacao em massa de solicitacoes de compra');

  return {
    solicitacao_ids: parseIdArray(body.solicitacao_ids, 'Solicitacoes de compra', {
      required: true,
      maxItems: 100
    })
  };
}

function validateCompraSolicitacaoEncaminharComprasMassaBody(body = {}) {
  ensureAllowedKeys(body, ['solicitacao_ids'], 'Encaminhamento em massa de solicitacoes de compra');

  return {
    solicitacao_ids: parseIdArray(body.solicitacao_ids, 'Solicitacoes de compra', {
      required: true,
      maxItems: 100
    })
  };
}

function validateCompraPedidoCancelBody(body = {}) {
  ensureAllowedKeys(
    body,
    [
      'motivo',
      'itens',
      'item_ids',
      'cancelar_cotacao',
      'cancelar_solicitacao_compra',
      'cancelar_solicitacao_principal'
    ],
    'Cancelamento do pedido'
  );

  return {
    motivo: parseOptionalText(body.motivo, 'Motivo', 5000),
    itens: Array.isArray(body.itens) ? body.itens : undefined,
    item_ids: Array.isArray(body.item_ids) ? body.item_ids : undefined,
    cancelar_cotacao: body.cancelar_cotacao === true,
    cancelar_solicitacao_compra: body.cancelar_solicitacao_compra === true,
    cancelar_solicitacao_principal: body.cancelar_solicitacao_principal === true
  };
}

function validateCompraSolicitacaoCancelBody(body = {}) {
  ensureAllowedKeys(
    body,
    [
      'motivo',
      'cancelar_cotacao',
      'cancelar_solicitacao_principal'
    ],
    'Cancelamento da solicitacao de compra'
  );

  return {
    motivo: parseOptionalText(body.motivo, 'Motivo', 5000, { required: true }),
    cancelar_cotacao: body.cancelar_cotacao === true,
    cancelar_solicitacao_principal: body.cancelar_solicitacao_principal === true
  };
}

function validateCompraPedidoRemanejarBody(body = {}) {
  ensureAllowedKeys(
    body,
    ['resposta_item_id_destino', 'quantidade', 'motivo'],
    'Remanejamento de item do pedido'
  );

  return {
    resposta_item_id_destino: parseInteger(body.resposta_item_id_destino, 'Resposta de destino', {
      required: true
    }),
    quantidade: parseDecimal(body.quantidade, 'Quantidade remanejada', {
      min: 0,
      scale: 3,
      brazilianFormat: true,
      required: true
    }),
    motivo: parseOptionalText(body.motivo, 'Motivo', 5000)
  };
}

function validateCompraPedidoComentarioBody(body = {}) {
  ensureAllowedKeys(body, ['comentario'], 'Comentario do pedido');

  return {
    comentario: parseOptionalText(body.comentario, 'Comentario', 5000, { required: true })
  };
}

function validateCompraCotacaoComentarioBody(body = {}) {
  ensureAllowedKeys(body, ['comentario'], 'Comentario da cotacao');

  return {
    comentario: parseOptionalText(body.comentario, 'Comentario', 5000, { required: true })
  };
}

function validateCompraPedidoEspelhoBody(body = {}) {
  ensureAllowedKeys(
    body,
    ['arquivo_url', 'arquivo_nome', 'arquivo_nome_original'],
    'Espelho do pedido'
  );

  return {
    arquivo_url: parseOptionalText(body.arquivo_url, 'Arquivo', 1000, { required: true }),
    arquivo_nome: parseOptionalText(body.arquivo_nome, 'Nome do arquivo', 255),
    arquivo_nome_original: parseOptionalText(body.arquivo_nome_original, 'Nome do arquivo', 255)
  };
}

function validateCompraPedidoFreteBody(body = {}) {
  ensureAllowedKeys(
    body,
    [
      'tipo',
      'momento',
      'criterio_rateio',
      'valor_total',
      'data_vencimento',
      'fornecedor_compra_id',
      'parceiro_id',
      'novo_fornecedor',
      'dados_pagamento',
      'observacoes',
      'rateios'
    ],
    'Frete do pedido'
  );

  const tipo = parseOptionalText(body.tipo, 'Tipo de frete', 30, { required: true })?.toUpperCase();
  const momento = parseOptionalText(body.momento, 'Momento do frete', 30)?.toUpperCase() || 'FECHAMENTO';
  const criterioRateio = parseOptionalText(body.criterio_rateio, 'Criterio de rateio', 30)?.toUpperCase() || 'VALOR_ITENS';
  const novoFornecedor = body.novo_fornecedor && typeof body.novo_fornecedor === 'object'
    ? {
        nome: parseOptionalText(body.novo_fornecedor.nome, 'Nome do fornecedor', 160),
        cpf_cnpj: parseCpfCnpj(body.novo_fornecedor.cpf_cnpj, 'CPF/CNPJ do fornecedor'),
        whatsapp: parseOptionalText(body.novo_fornecedor.whatsapp, 'WhatsApp do fornecedor', 32),
        telefone: parseOptionalText(body.novo_fornecedor.telefone, 'Telefone do fornecedor', 32),
        email: parseOptionalText(body.novo_fornecedor.email, 'Email do fornecedor', 160),
        contato: parseOptionalText(body.novo_fornecedor.contato, 'Contato do fornecedor', 160),
        observacoes: parseOptionalText(body.novo_fornecedor.observacoes, 'Observacoes do fornecedor', 1000)
      }
    : undefined;

  if (!['EMBUTIDO', 'TERCEIRO'].includes(tipo)) {
    throw new ValidationError('Tipo de frete invalido.');
  }
  if (!['FECHAMENTO', 'POSTERIOR'].includes(momento)) {
    throw new ValidationError('Momento do frete invalido.');
  }
  if (!['VALOR_ITENS', 'POR_ITEM'].includes(criterioRateio)) {
    throw new ValidationError('Criterio de rateio invalido.');
  }

  const dadosPagamento = body.dados_pagamento && typeof body.dados_pagamento === 'object'
    ? {
        pix: parsePixDocument(body.dados_pagamento.pix, body.dados_pagamento.tipo_chave_pix),
        tipo_chave_pix: parseOptionalText(body.dados_pagamento.tipo_chave_pix, 'Tipo da chave PIX', 30),
        banco: parseOptionalText(body.dados_pagamento.banco, 'Banco', 120),
        agencia: parseOptionalText(body.dados_pagamento.agencia, 'Agencia', 60),
        conta: parseOptionalText(body.dados_pagamento.conta, 'Conta', 80),
        favorecido: parseOptionalText(body.dados_pagamento.favorecido, 'Favorecido', 160),
        documento: parseCpfCnpj(body.dados_pagamento.documento, 'CPF/CNPJ do favorecido'),
        observacoes: parseOptionalText(body.dados_pagamento.observacoes, 'Observacoes de pagamento', 1000)
      }
    : parseOptionalText(body.dados_pagamento, 'Dados de pagamento', 1000);

  return {
    tipo,
    momento,
    criterio_rateio: criterioRateio,
    valor_total: parseDecimal(body.valor_total, 'Valor do frete', { required: true, min: 0.01 }),
    data_vencimento: parseDateOnly(body.data_vencimento, 'Data de vencimento'),
    fornecedor_compra_id: parseInteger(body.fornecedor_compra_id, 'Fornecedor'),
    parceiro_id: parseInteger(body.parceiro_id, 'Credor'),
    novo_fornecedor: novoFornecedor,
    dados_pagamento: dadosPagamento,
    rateios: Array.isArray(body.rateios)
      ? body.rateios.map((rateio) => ({
          pedido_compra_item_id: parseInteger(rateio?.pedido_compra_item_id, 'Item do pedido', { required: true }),
          valor_rateado: parseDecimal(rateio?.valor_rateado, 'Frete do item', { required: true, min: 0.01 })
        }))
      : undefined,
    observacoes: parseOptionalText(body.observacoes, 'Observacoes', 5000)
  };
}

function validateCompraPedidoFreteCancelBody(body = {}) {
  ensureAllowedKeys(body, ['motivo'], 'Cancelamento do frete do pedido');

  return {
    motivo: parseOptionalText(body.motivo, 'Motivo do cancelamento', 1000, { required: true })
  };
}

function validateCompraDelegacaoBody(body = {}) {
  ensureAllowedKeys(
    body,
    ['responsavel_id', 'prazo_compra', 'motivo_atraso', 'motivo_delegacao_vencida'],
    'Delegacao da solicitacao de compra'
  );

  return {
    responsavel_id: parseInteger(body.responsavel_id, 'Responsavel'),
    prazo_compra: parseDateOnly(body.prazo_compra, 'Prazo de compra'),
    motivo_atraso: parseOptionalText(body.motivo_atraso, 'Motivo do atraso', 5000),
    motivo_delegacao_vencida: parseOptionalText(
      body.motivo_delegacao_vencida,
      'Motivo da delegacao com prazo vencido',
      5000
    )
  };
}

function validateCompraPedidoItemUpdateBody(body = {}) {
  ensureAllowedKeys(
    body,
    ['quantidade_pedido', 'preco_unitario', 'observacoes'],
    'Atualizacao de item do pedido'
  );

  if (
    body.quantidade_pedido === undefined &&
    body.preco_unitario === undefined &&
    body.observacoes === undefined
  ) {
    throw new ValidationError('Informe ao menos um campo para atualizar o item do pedido.');
  }

  return {
    quantidade_pedido: parseDecimal(body.quantidade_pedido, 'Quantidade do pedido', {
      min: 0,
      scale: 2,
      brazilianFormat: true
    }),
    preco_unitario: parseDecimal(body.preco_unitario, 'Preco unitario', { min: 0 }),
    observacoes: parseOptionalText(body.observacoes, 'Observacoes', 5000)
  };
}

function validateCompraPedidoItemParams(params = {}) {
  ensureAllowedKeys(params, ['id', 'itemId'], 'Parametros do item do pedido');

  return {
    id: parseInteger(params.id, 'Pedido', { required: true }),
    itemId: parseInteger(params.itemId, 'Item do pedido', { required: true })
  };
}

function validateCompraPedidoFreteParams(params = {}) {
  ensureAllowedKeys(params, ['id', 'freteId'], 'Parametros do frete do pedido');

  return {
    id: parseInteger(params.id, 'Pedido', { required: true }),
    freteId: parseInteger(params.freteId, 'Frete do pedido', { required: true })
  };
}

function validateSolicitacaoPedidoCompraPdfParams(params = {}) {
  ensureAllowedKeys(params, ['id', 'pedidoId'], 'Parametros do PDF do pedido');

  return {
    id: parseInteger(params.id, 'Solicitacao', { required: true }),
    pedidoId: parseInteger(params.pedidoId, 'Pedido de compra', { required: true })
  };
}

function validateSolicitacaoCreateBody(body = {}) {
  ensureAllowedKeys(
    body,
    [
      'obra_id',
      'tipo_solicitacao_id',
      'tipo_macro_id',
      'tipo_sub_id',
      'descricao',
      'justificativa',
      'valor',
      'parceiro_id',
      'favorecido_id',
      'forma_pagamento_id',
      'favorecido_chave_pix',
      'boleto_anexo_nome',
      'despesa_eventual_declaracoes',
      'cartao_recarga_id',
      'apropriacao_id',
      'area_responsavel',
      'diretoria_fluxo_codigo',
      'codigo_contrato',
      'contrato_id',
      'data_vencimento',
      'data_demissao',
      'data_inicio_medicao',
      'data_fim_medicao',
      'itens_apropriacao',
      'ref_contrato_abertura',
      'apropriacoes_rateio',
      // Wireframe 2: parcelas do contrato do fluxo novo consumidas por esta medicao.
      'medicao_parcelas',
      // Dados de pagamento DA MEDICAO (itens 5 e 9, 23/08): favorecido, chave PIX, forma, contato e
      // o aceite. A lista de campos permitidos e uma allowlist — campo novo que nao entra aqui e
      // recusado com "contem campos nao permitidos", sem chegar ao controller.
      'medicao_pagamento',
      // Nomes dos arquivos selecionados antes da criacao. O upload real continua na rota de
      // anexos; a aprovacao da medicao confere o registro efetivamente gravado.
      'anexos_pendentes_nomes'
    ],
    'Solicitacao'
  );

  return {
    obra_id: parseInteger(body.obra_id, 'Obra', { required: true }),
    tipo_solicitacao_id: parseInteger(body.tipo_solicitacao_id, 'Tipo de solicitacao', { required: true }),
    tipo_macro_id: parseInteger(body.tipo_macro_id, 'Tipo macro'),
    tipo_sub_id: parseInteger(body.tipo_sub_id, 'Tipo sub'),
    descricao: body.descricao == null ? undefined : String(body.descricao),
    justificativa: parseOptionalText(body.justificativa, 'Justificativa', 5000),
    valor: body.valor === '' || body.valor == null ? undefined : parseDecimal(body.valor, 'Valor', { min: 0 }),
    parceiro_id: parseInteger(body.parceiro_id, 'Parceiro'),
    favorecido_id: parseInteger(body.favorecido_id, 'Favorecido'),
    forma_pagamento_id: parseInteger(body.forma_pagamento_id, 'Forma de pagamento'),
    favorecido_chave_pix: parseOptionalText(body.favorecido_chave_pix, 'Chave PIX do favorecido', 255),
    boleto_anexo_nome: parseOptionalText(body.boleto_anexo_nome, 'Arquivo do boleto', 255),
    despesa_eventual_declaracoes: body.despesa_eventual_declaracoes && typeof body.despesa_eventual_declaracoes === 'object'
      ? {
          despesa_pontual_nao_recorrente: body.despesa_eventual_declaracoes.despesa_pontual_nao_recorrente === true,
          sem_vinculo_contratual: body.despesa_eventual_declaracoes.sem_vinculo_contratual === true,
          nao_fracionada: body.despesa_eventual_declaracoes.nao_fracionada === true
        }
      : undefined,
    cartao_recarga_id: parseInteger(body.cartao_recarga_id, 'Cartao de recarga'),
    apropriacao_id: parseInteger(body.apropriacao_id, 'Apropriacao'),
    // Compatibilidade temporaria com frontends anteriores: o campo ainda e aceito, mas o
    // controller nao confia nele e sempre deriva o destino GEO no servidor.
    area_responsavel: parseOptionalText(body.area_responsavel, 'Area responsavel', 120),
    diretoria_fluxo_codigo: parseOptionalText(body.diretoria_fluxo_codigo, 'Diretoria de aprovacao', 120),
    codigo_contrato: parseOptionalText(body.codigo_contrato, 'Codigo do contrato', 255),
    contrato_id: parseInteger(body.contrato_id, 'Contrato'),
    data_vencimento: parseCurrentOrFutureDateOnly(body.data_vencimento, 'Data da solicitacao'),
    data_demissao: parseDateOnly(body.data_demissao, 'Data de demissao'),
    data_inicio_medicao: parseDateOnly(body.data_inicio_medicao, 'Data inicial da medicao'),
    data_fim_medicao: parseDateOnly(body.data_fim_medicao, 'Data final da medicao'),
    itens_apropriacao: parseOptionalText(body.itens_apropriacao, 'Itens de apropriacao', 5000),
    ref_contrato_abertura: parseOptionalText(body.ref_contrato_abertura, 'Ref. do contrato', 255),
    apropriacoes_rateio: Array.isArray(body.apropriacoes_rateio) ? body.apropriacoes_rateio : undefined,
    medicao_parcelas: Array.isArray(body.medicao_parcelas) ? body.medicao_parcelas : undefined,
    // Repassado como veio: quem valida campo a campo e `validarDadosDePagamento`, no servico, junto
    // da regra de negocio. Duplicar a validacao aqui criaria duas versoes da mesma exigencia.
    medicao_pagamento: body.medicao_pagamento && typeof body.medicao_pagamento === 'object'
      ? body.medicao_pagamento
      : undefined,
    anexos_pendentes_nomes: (() => {
      if (!Array.isArray(body.anexos_pendentes_nomes)) return undefined;
      if (body.anexos_pendentes_nomes.length > 20) {
        throw new ValidationError('Anexos da medicao excedem o limite permitido.');
      }
      return body.anexos_pendentes_nomes
        .map((nome) => parseOptionalText(nome, 'Nome do anexo da medicao', 255))
        .filter(Boolean);
    })()
  };
}

function validateSolicitacaoStatusBody(body = {}) {
  ensureAllowedKeys(body, ['status'], 'Atualizacao de status');

  return {
    status: parseOptionalText(body.status, 'Status', 120, { required: true })
  };
}

function validateSolicitacaoApropriacoesBody(body = {}) {
  ensureAllowedKeys(body, ['apropriacao_id', 'apropriacoes_rateio', 'motivo'], 'Atualizacao de apropriacoes da solicitacao');

  return {
    apropriacao_id: parseInteger(body.apropriacao_id, 'Apropriacao', { required: false }),
    apropriacoes_rateio: Array.isArray(body.apropriacoes_rateio) ? body.apropriacoes_rateio : undefined,
    motivo: parseOptionalText(body.motivo, 'Motivo da alteracao', 1000, { required: true })
  };
}

function validateSolicitacaoPedidoBody(body = {}) {
  ensureAllowedKeys(body, ['numero_pedido'], 'Atualizacao de pedido');

  return {
    numero_pedido: parseOptionalText(body.numero_pedido, 'Numero do pedido', 120)
  };
}

function validateSolicitacaoRefContratoBody(body = {}) {
  ensureAllowedKeys(body, ['contrato_id'], 'Atualizacao de contrato');

  return {
    contrato_id: parseInteger(body.contrato_id, 'Contrato', { required: true })
  };
}

function validateSolicitacaoValorBody(body = {}) {
  ensureAllowedKeys(body, ['valor'], 'Atualizacao de valor');

  return {
    valor: body.valor === '' || body.valor == null ? null : parseDecimal(body.valor, 'Valor', { min: 0 })
  };
}

function validateSolicitacaoDataVencimentoBody(body = {}) {
  ensureAllowedKeys(body, ['data_vencimento'], 'Atualizacao de data de vencimento');

  return {
    data_vencimento: parseCurrentOrFutureDateOnly(body.data_vencimento, 'Data da solicitacao')
  };
}

function validateSolicitacaoCredorBody(body = {}) {
  ensureAllowedKeys(body, ['parceiro_id'], 'Atualizacao de credor');

  return {
    parceiro_id: isBlank(body.parceiro_id)
      ? null
      : parseInteger(body.parceiro_id, 'Credor', { positiveOnly: true })
  };
}

function validateSolicitacaoCredorCreateBody(body = {}) {
  ensureAllowedKeys(
    body,
    ['nome', 'cpf_cnpj', 'telefone', 'email'],
    'Cadastro de credor da solicitacao'
  );

  return {
    nome: sanitizeString(body.nome, 'Nome do credor', { required: true, max: 255 }),
    cpf_cnpj: parseCpfCnpj(body.cpf_cnpj, 'CPF/CNPJ', { required: true }),
    telefone: sanitizeString(body.telefone, 'Telefone', { required: true, max: 32 }),
    email: sanitizeString(body.email, 'Email', { max: 255 })
  };
}

function validateSolicitacaoFavorecidoCreateBody(body = {}) {
  ensureAllowedKeys(
    body,
    ['nome', 'telefone', 'chave_pix', 'tipo_chave_pix', 'area_responsavel', 'tipo_solicitacao_id', 'tipo_sub_id'],
    'Cadastro rapido de favorecido'
  );

  const tipoChavePix = sanitizeString(body.tipo_chave_pix, 'Tipo da chave PIX', { max: 20 });

  return {
    nome: sanitizeString(body.nome, 'Nome do favorecido', { required: true, max: 255 }),
    telefone: sanitizeString(body.telefone, 'Telefone do favorecido', { required: true, max: 32 }),
    chave_pix: parsePixDocument(body.chave_pix, tipoChavePix, 'Chave PIX do favorecido', { required: true }),
    tipo_chave_pix: tipoChavePix,
    area_responsavel: sanitizeString(body.area_responsavel, 'Area responsavel', { required: true, max: 120 }),
    tipo_solicitacao_id: parseInteger(body.tipo_solicitacao_id, 'Tipo de solicitacao', { required: true }),
    tipo_sub_id: parseInteger(body.tipo_sub_id, 'Subtipo de solicitacao')
  };
}

function validateSolicitacaoResponsavelBody(body = {}) {
  ensureAllowedKeys(body, ['usuario_responsavel_id', 'prazo_compra'], 'Atribuicao de responsavel');

  return {
    usuario_responsavel_id: parseInteger(body.usuario_responsavel_id, 'Responsavel', { required: true }),
    prazo_compra: parseDateOnly(body.prazo_compra, 'Prazo de compra')
  };
}

function validateSolicitacaoComentarioBody(body = {}) {
  ensureAllowedKeys(body, ['descricao', 'mencoes'], 'Comentario');

  const mencoes = body.mencoes == null
    ? []
    : parseIdArray(body.mencoes, 'Mencoes', { maxItems: 50 });

  return {
    descricao: parseOptionalText(body.descricao, 'Comentario', 5000, { required: true }),
    mencoes
  };
}

function validateSolicitacaoArquivarMassaBody(body = {}) {
  ensureAllowedKeys(body, ['solicitacao_ids'], 'Arquivamento em massa');

  return {
    solicitacao_ids: parseIdArray(body.solicitacao_ids, 'Solicitacoes', {
      required: true,
      maxItems: 500
    })
  };
}

function validateSolicitacaoEnviarSetorBody(body = {}) {
  ensureAllowedKeys(body, ['setor_destino'], 'Envio de setor');

  return {
    setor_destino: parseOptionalText(body.setor_destino, 'Setor de destino', 120, {
      required: true
    })
  };
}

function validateSolicitacaoEnviarSetorMassaBody(body = {}) {
  ensureAllowedKeys(body, ['solicitacao_ids', 'setor_destino'], 'Envio em massa');

  return {
    solicitacao_ids: parseIdArray(body.solicitacao_ids, 'Solicitacoes', {
      required: true,
      maxItems: 500
    }),
    setor_destino: parseOptionalText(body.setor_destino, 'Setor de destino', 120, {
      required: true
    })
  };
}

module.exports = {
    validateCompraCreateBody,
    validateCompraDiretaCreateBody,
  validateCompraEncerrarBody,
  validateCompraEncerrarSemPedidoBody,
  validateCompraCotacaoCancelBody,
  validateCompraCotacaoRespostaInternaBody,
  validateCompraCotacaoRespostaInternaParams,
  validateCompraEnviarBody,
  validateCompraIntegrarBody,
  validateCompraPedidoCreateBody,
  validateCompraPedidoFreteParams,
  validateCompraPedidoItemAddBody,
  validateCompraPedidoItemParams,
  validateSolicitacaoPedidoCompraPdfParams,
  validateCompraPedidoCancelBody,
  validateCompraSolicitacaoCancelBody,
  validateCompraPedidoComentarioBody,
  validateCompraCotacaoComentarioBody,
  validateCompraPedidoEspelhoBody,
  validateCompraPedidoFreteCancelBody,
  validateCompraPedidoFreteBody,
  validateCompraPedidoRemanejarBody,
  validateCompraPedidoReabrirBody,
  validateCompraPedidoPrevisoesBody,
  validateCompraPedidoDocumentoFinanceiroBody,
  validateCompraPedidoLiberarTitulosBody,
  validateCompraPedidoReaberturaParams,
  validateCompraPedidoDecisaoReaberturaBody,
  validateCompraPedidoStatusBody,
  validateCompraPedidoStatusBatchBody,
  validateCompraSolicitacaoItemQuantidadeBody,
  validateCompraSolicitacaoItemQuantidadeParams,
  validateCompraSolicitacaoItemApropriacoesBody,
  validateCompraCatalogarItemManualBody,
  validateCompraSolicitacaoInativarMassaBody,
  validateCompraSolicitacaoEncaminharComprasMassaBody,
  validateCompraPedidoItemUpdateBody,
  validateCompraDelegacaoBody,
  validateCompraPedidoAuditoriaQuery,
  validateCompraPedidoQuery,
  validateCompraQuery,
  validateCompraRelatorioCategoriasInsumosQuery,
  validateCompraRelatorioCicloQuery,
  validateCompraRelatorioComprasDiretasQuery,
  validateCompraRelatorioComprasFornecedorQuery,
  validateCompraRelatorioDemandaPedidosQuery,
  validateCompraRelatorioEconomiaCotacoesQuery,
  validateCompraRelatorioEvolucaoQuery,
  validateCompraRelatorioFornecedoresQuery,
  validateCompraRelatorioPendenciasCotacoesQuery,
  validateCompraRelatorioPrecosInsumosQuery,
  validateContratoCreateBody,
  validateContratoQuery,
  validateContratoRelatorioOperacionalQuery,
  validateContratoUpdateBody,
  validateSolicitacaoArquivarMassaBody,
  validateSolicitacaoComentarioBody,
  validateSolicitacaoCreateBody,
  validateSolicitacaoApropriacoesBody,
  validateSolicitacaoCredorCreateBody,
  validateSolicitacaoCredorBody,
  validateSolicitacaoFavorecidoCreateBody,
  validateSolicitacaoDataVencimentoBody,
  validateSolicitacaoEnviarSetorBody,
  validateSolicitacaoEnviarSetorMassaBody,
  validateSolicitacaoPedidoBody,
  validateSolicitacaoRefContratoBody,
  validateSolicitacaoResponsavelBody,
  validateSolicitacaoStatusBody,
  validateSolicitacaoValorBody
};
