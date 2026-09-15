const {
  ensureAllowedKeys,
  ValidationError,
  sanitizeString
} = require('../middlewares/validation');

const COMERCIAL_FORMA_RECEBIMENTO = [
  'DINHEIRO',
  'PIX',
  'CARTAO',
  'TRANSFERENCIA',
  'BOLETO',
  'CHEQUE',
  'PERMUTA',
  'BENS',
  'OUTROS'
];

const UNIDADE_STATUS = [
  'DISPONIVEL',
  'RESERVADA',
  'VENDIDA',
  'DISTRATADA',
  'BLOQUEADA'
];

const CONTRATO_STATUS = [
  'RASCUNHO',
  'ATIVO',
  'INADIMPLENTE',
  'QUITADO',
  'DISTRATADO',
  'CANCELADO'
];

const TABELA_PRECO_STATUS = [
  'RASCUNHO',
  'ATIVA',
  'ARQUIVADA'
];

const PARCELA_TIPOS = [
  'ENTRADA',
  'PARCELA',
  'INTERMEDIARIA',
  'CHAVES',
  'BALAO',
  'OUTRA'
];

const PARCELA_REAJUSTE_TIPOS = [
  'FIXA',
  'REAJUSTAVEL'
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

function normalizeCompradoresContrato(compradores = [], parceiroPrincipalId = null) {
  if (compradores == null || compradores === '') {
    return undefined;
  }
  if (!Array.isArray(compradores)) {
    throw new ValidationError('Compradores deve ser uma lista.');
  }

  const principalId = parseInteger(parceiroPrincipalId, 'Cliente') || null;
  const vistos = new Set();
  const normalizados = [];

  compradores.forEach((item, index) => {
    const parceiroId = parseInteger(item?.parceiro_id ?? item?.id ?? item, `Comprador ${index + 1}`);
    if (!parceiroId || vistos.has(parceiroId)) return;
    vistos.add(parceiroId);

    normalizados.push({
      parceiro_id: parceiroId,
      ordem: index + 1,
      principal: Boolean(item?.principal) || (principalId && Number(parceiroId) === Number(principalId)),
      percentual_participacao: parseDecimal(item?.percentual_participacao, `Percentual comprador ${index + 1}`, { min: 0 })
    });
  });

  if (principalId && !vistos.has(principalId)) {
    normalizados.unshift({
      parceiro_id: principalId,
      ordem: 1,
      principal: true,
      percentual_participacao: undefined
    });
  }

  if (!normalizados.length) {
    throw new ValidationError('Informe ao menos um comprador.');
  }

  const principalIndex = principalId
    ? normalizados.findIndex((item) => Number(item.parceiro_id) === Number(principalId))
    : normalizados.findIndex((item) => item.principal);

  normalizados.forEach((item, index) => {
    item.ordem = index + 1;
    item.principal = index === (principalIndex >= 0 ? principalIndex : 0);
  });

  return normalizados;
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

function parseCodigoUnidade(value, { required = false } = {}) {
  if (isBlank(value)) {
    if (required) throw new ValidationError('Codigo e obrigatorio.');
    return undefined;
  }
  const normalized = String(value).trim();
  if (!/^\d+$/.test(normalized)) {
    throw new ValidationError('Codigo deve ser um numero inteiro positivo.');
  }
  const num = Number(normalized);
  if (!Number.isInteger(num) || num <= 0) {
    throw new ValidationError('Codigo deve ser um numero inteiro positivo.');
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

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function isValidCpfDigits(value) {
  const digits = onlyDigits(value);
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;

  const calculateDigit = (base) => {
    const sum = base
      .split('')
      .reduce((total, digit, index) => total + Number(digit) * (base.length + 1 - index), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  const digit1 = calculateDigit(digits.slice(0, 9));
  const digit2 = calculateDigit(digits.slice(0, 10));
  return digit1 === Number(digits[9]) && digit2 === Number(digits[10]);
}

function isValidCnpjDigits(value) {
  const digits = onlyDigits(value);
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;

  const calculateDigit = (base, weights) => {
    const sum = base
      .split('')
      .reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  const digit1 = calculateDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const digit2 = calculateDigit(digits.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digit1 === Number(digits[12]) && digit2 === Number(digits[13]);
}

function parseCpf(value, fieldName, { required = false } = {}) {
  const normalized = parseOptionalText(value, fieldName, 20, { required });
  if (normalized === undefined) return undefined;
  if (!isValidCpfDigits(normalized)) {
    throw new ValidationError(`${fieldName} invalido.`);
  }
  return normalized;
}

function validateWitnessPair(nome, cpf, label) {
  const hasNome = Boolean(String(nome || '').trim());
  const hasCpf = Boolean(String(cpf || '').trim());
  if (hasNome !== hasCpf) {
    throw new ValidationError(`${label}: informe nome e CPF juntos.`);
  }
}

function parseCpfCnpj(value, fieldName, { required = false } = {}) {
  const normalized = parseOptionalText(value, fieldName, 30, { required });
  if (normalized === undefined) return undefined;
  const digits = onlyDigits(normalized);
  if (!isValidCpfDigits(digits) && !isValidCnpjDigits(digits)) {
    throw new ValidationError(`${fieldName} invalido.`);
  }
  return digits;
}

function parseEnum(value, fieldName, allowedValues = [], { required = false } = {}) {
  if (isBlank(value)) {
    if (required) {
      throw new ValidationError(`${fieldName} e obrigatorio.`);
    }
    return undefined;
  }

  const normalized = String(value || '').trim().toUpperCase();
  if (!allowedValues.includes(normalized)) {
    throw new ValidationError(`${fieldName} invalido.`);
  }

  return normalized;
}

function parseCommercialOption(value, fieldName, { required = false, fallback, max = 60 } = {}) {
  const normalized = parseOptionalText(value, fieldName, max, { required });
  if (normalized === undefined) return fallback;
  return normalized.trim().toUpperCase();
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

function validateComercialEmpreendimentoQuery(query = {}) {
  ensureAllowedKeys(query, ['q', 'ativo', 'obra_id'], 'Consulta de empreendimentos');

  return {
    q: parseOptionalText(query.q, 'Busca', 120),
    ativo: parseBoolean(query.ativo, 'Ativo'),
    obra_id: parseInteger(query.obra_id, 'Obra')
  };
}

function validateComercialEmpreendimentoCreateBody(body = {}) {
  ensureAllowedKeys(
    body,
    ['obra_id', 'codigo', 'nome', 'descricao', 'endereco', 'numero', 'bairro', 'cidade', 'estado', 'cep', 'ativo'],
    'Empreendimento'
  );

  return {
    obra_id: parseInteger(body.obra_id, 'Obra'),
    codigo: parseOptionalText(body.codigo, 'Codigo', 60),
    nome: parseOptionalText(body.nome, 'Nome', 160, { required: true }),
    descricao: parseOptionalText(body.descricao, 'Descricao', 255),
    endereco: parseOptionalText(body.endereco, 'Endereco', 255),
    numero: parseOptionalText(body.numero, 'Numero', 60),
    bairro: parseOptionalText(body.bairro, 'Bairro', 120),
    cidade: parseOptionalText(body.cidade, 'Cidade', 120),
    estado: parseOptionalText(body.estado, 'Estado', 2),
    cep: parseOptionalText(body.cep, 'CEP', 20),
    ativo: parseBoolean(body.ativo, 'Ativo')
  };
}

function validateComercialEmpreendimentoUpdateBody(body = {}) {
  ensureAllowedKeys(
    body,
    ['obra_id', 'codigo', 'nome', 'descricao', 'endereco', 'numero', 'bairro', 'cidade', 'estado', 'cep', 'ativo'],
    'Empreendimento'
  );

  const data = Object.fromEntries(
    Object.entries({
      obra_id: parseInteger(body.obra_id, 'Obra'),
      codigo: parseOptionalText(body.codigo, 'Codigo', 60),
      nome: parseOptionalText(body.nome, 'Nome', 160),
      descricao: parseOptionalText(body.descricao, 'Descricao', 255),
      endereco: parseOptionalText(body.endereco, 'Endereco', 255),
      numero: parseOptionalText(body.numero, 'Numero', 60),
      bairro: parseOptionalText(body.bairro, 'Bairro', 120),
      cidade: parseOptionalText(body.cidade, 'Cidade', 120),
      estado: parseOptionalText(body.estado, 'Estado', 2),
      cep: parseOptionalText(body.cep, 'CEP', 20),
      ativo: parseBoolean(body.ativo, 'Ativo')
    }).filter(([, value]) => value !== undefined)
  );

  if (!Object.keys(data).length) {
    throw new ValidationError('Nenhum campo valido informado para atualizar o empreendimento.');
  }
  return data;
}

function validateComercialUnidadeQuery(query = {}) {
  ensureAllowedKeys(query, ['q', 'ativo', 'empreendimento_id', 'situacao'], 'Consulta de unidades comerciais');

  return {
    q: parseOptionalText(query.q, 'Busca', 120),
    ativo: parseBoolean(query.ativo, 'Ativo'),
    empreendimento_id: parseInteger(query.empreendimento_id, 'Empreendimento'),
    situacao: parseEnum(query.situacao, 'Situacao', UNIDADE_STATUS)
  };
}

function validateComercialUnidadeCreateBody(body = {}) {
  ensureAllowedKeys(
    body,
    [
      'empreendimento_id',
      'parceiro_reserva_id',
      'codigo',
      'nome',
      'bloco',
      'torre',
      'pavimento',
      'tipologia',
      'metragem_privativa',
      'fracao_ideal',
      'valor_tabela',
      'valor_base_venda',
      'situacao',
      'reservado_ate',
      'observacoes',
      'ativo'
    ],
    'Unidade comercial'
  );

  return {
    empreendimento_id: parseInteger(body.empreendimento_id, 'Empreendimento', { required: true }),
    parceiro_reserva_id: parseInteger(body.parceiro_reserva_id, 'Parceiro da reserva'),
    codigo: parseCodigoUnidade(body.codigo, { required: true }),
    nome: parseOptionalText(body.nome, 'Nome', 160),
    bloco: parseOptionalText(body.bloco, 'Bloco', 60),
    torre: parseOptionalText(body.torre, 'Torre', 60),
    pavimento: parseOptionalText(body.pavimento, 'Pavimento', 60),
    tipologia: parseOptionalText(body.tipologia, 'Tipologia', 80),
    metragem_privativa: parseDecimal(body.metragem_privativa, 'Metragem privativa', { min: 0 }),
    fracao_ideal: parseDecimal(body.fracao_ideal, 'Fracao ideal', { min: 0 }),
    valor_tabela: parseDecimal(body.valor_tabela, 'Valor tabela', { min: 0 }),
    valor_base_venda: parseDecimal(body.valor_base_venda, 'Valor base de venda', { min: 0 }),
    situacao: parseEnum(body.situacao, 'Situacao', UNIDADE_STATUS),
    reservado_ate: parseDateOnly(body.reservado_ate, 'Reservado ate'),
    observacoes: parseOptionalText(body.observacoes, 'Observacoes', 4000),
    ativo: parseBoolean(body.ativo, 'Ativo')
  };
}

function validateComercialUnidadeUpdateBody(body = {}) {
  ensureAllowedKeys(
    body,
    [
      'empreendimento_id',
      'parceiro_reserva_id',
      'codigo',
      'nome',
      'bloco',
      'torre',
      'pavimento',
      'tipologia',
      'metragem_privativa',
      'fracao_ideal',
      'valor_tabela',
      'valor_base_venda',
      'situacao',
      'reservado_ate',
      'observacoes',
      'ativo'
    ],
    'Unidade comercial'
  );

  const data = Object.fromEntries(
    Object.entries({
      empreendimento_id: parseInteger(body.empreendimento_id, 'Empreendimento'),
      parceiro_reserva_id: parseInteger(body.parceiro_reserva_id, 'Parceiro da reserva'),
      codigo: parseCodigoUnidade(body.codigo),
      nome: parseOptionalText(body.nome, 'Nome', 160),
      bloco: parseOptionalText(body.bloco, 'Bloco', 60),
      torre: parseOptionalText(body.torre, 'Torre', 60),
      pavimento: parseOptionalText(body.pavimento, 'Pavimento', 60),
      tipologia: parseOptionalText(body.tipologia, 'Tipologia', 80),
      metragem_privativa: parseDecimal(body.metragem_privativa, 'Metragem privativa', { min: 0 }),
      fracao_ideal: parseDecimal(body.fracao_ideal, 'Fracao ideal', { min: 0 }),
      valor_tabela: parseDecimal(body.valor_tabela, 'Valor tabela', { min: 0 }),
      valor_base_venda: parseDecimal(body.valor_base_venda, 'Valor base de venda', { min: 0 }),
      situacao: parseEnum(body.situacao, 'Situacao', UNIDADE_STATUS),
      reservado_ate: parseDateOnly(body.reservado_ate, 'Reservado ate'),
      observacoes: parseOptionalText(body.observacoes, 'Observacoes', 4000),
      ativo: parseBoolean(body.ativo, 'Ativo')
    }).filter(([, value]) => value !== undefined)
  );

  if (!Object.keys(data).length) {
    throw new ValidationError('Nenhum campo valido informado para atualizar a unidade comercial.');
  }
  return data;
}

function normalizeParcelas(parcelas) {
  if (!Array.isArray(parcelas) || parcelas.length === 0) {
    throw new ValidationError('Informe ao menos uma parcela para o contrato comercial.');
  }

  return parcelas.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new ValidationError(`Parcela ${index + 1} invalida.`);
    }

    ensureAllowedKeys(
      item,
      [
        'sequencia', 'descricao', 'tipo_parcela', 'forma_recebimento_prevista',
        'periodicidade', 'reajuste_tipo', 'data_vencimento', 'competencia_data',
        'valor', 'observacoes', 'cheque_numero', 'cheque_titular_nome',
        'cheque_titular_documento', 'cheque_banco', 'cheque_agencia',
        'cheque_conta', 'cheque_data_emissao'
      ],
      `Parcela ${index + 1}`
    );

    const formaRecebimento = parseCommercialOption(
      item.forma_recebimento_prevista,
      `Forma de recebimento prevista da parcela ${index + 1}`,
      { max: 60 }
    );
    const isCheque = formaRecebimento === 'CHEQUE';

    return {
      sequencia: index + 1,
      descricao: parseOptionalText(item.descricao, `Descricao da parcela ${index + 1}`, 160, { required: true }),
      tipo_parcela: parseCommercialOption(item.tipo_parcela, `Tipo da parcela ${index + 1}`, { fallback: 'PARCELA' }),
      forma_recebimento_prevista: formaRecebimento,
      periodicidade: parseOptionalText(item.periodicidade, `Periodicidade da parcela ${index + 1}`, 30),
      reajuste_tipo: parseCommercialOption(item.reajuste_tipo, `Tipo de reajuste da parcela ${index + 1}`, { fallback: 'FIXA' }),
      data_vencimento: parseDateOnly(item.data_vencimento, `Vencimento da parcela ${index + 1}`, { required: true }),
      competencia_data: parseDateOnly(item.competencia_data, `Competencia DRE da parcela ${index + 1}`, { required: true }),
      valor: parseDecimal(item.valor, `Valor da parcela ${index + 1}`, { required: true, min: 0.01 }),
      observacoes: parseOptionalText(item.observacoes, `Observacoes da parcela ${index + 1}`, 1000),
      cheque_numero: parseOptionalText(item.cheque_numero, `Numero do cheque da parcela ${index + 1}`, 60, { required: isCheque }),
      cheque_titular_nome: parseOptionalText(item.cheque_titular_nome, `Titular do cheque da parcela ${index + 1}`, 180, { required: isCheque }),
      cheque_titular_documento: parseCpfCnpj(
        item.cheque_titular_documento,
        `CPF/CNPJ do titular do cheque da parcela ${index + 1}`,
        { required: isCheque }
      ),
      cheque_banco: parseOptionalText(item.cheque_banco, `Banco do cheque da parcela ${index + 1}`, 80, { required: isCheque }),
      cheque_agencia: parseOptionalText(item.cheque_agencia, `Agencia do cheque da parcela ${index + 1}`, 30),
      cheque_conta: parseOptionalText(item.cheque_conta, `Conta do cheque da parcela ${index + 1}`, 40),
      cheque_data_emissao: parseDateOnly(item.cheque_data_emissao, `Data de emissao do cheque da parcela ${index + 1}`, { required: isCheque })
    };
  });
}

function normalizeTabelaPrecoItens(itens) {
  if (!Array.isArray(itens) || itens.length === 0) {
    throw new ValidationError('Informe ao menos um item para a tabela de preco.');
  }

  return itens.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new ValidationError(`Item ${index + 1} da tabela de preco invalido.`);
    }

    ensureAllowedKeys(
      item,
      ['unidade_comercial_id', 'valor_tabela', 'valor_minimo', 'observacoes'],
      `Item ${index + 1} da tabela de preco`
    );

    return {
      unidade_comercial_id: parseInteger(item.unidade_comercial_id, `Unidade do item ${index + 1}`, { required: true }),
      valor_tabela: parseDecimal(item.valor_tabela, `Valor tabela do item ${index + 1}`, { required: true, min: 0.01 }),
      valor_minimo: parseDecimal(item.valor_minimo, `Valor minimo do item ${index + 1}`, { min: 0 }),
      observacoes: parseOptionalText(item.observacoes, `Observacoes do item ${index + 1}`, 1000)
    };
  });
}

function validateComercialContratoQuery(query = {}) {
  ensureAllowedKeys(
    query,
    ['q', 'status', 'empreendimento_id', 'unidade_comercial_id', 'parceiro_id'],
    'Consulta de contratos comerciais'
  );

  return {
    q: parseOptionalText(query.q, 'Busca', 120),
    status: parseEnum(query.status, 'Status', CONTRATO_STATUS),
    empreendimento_id: parseInteger(query.empreendimento_id, 'Empreendimento'),
    unidade_comercial_id: parseInteger(query.unidade_comercial_id, 'Unidade comercial'),
    parceiro_id: parseInteger(query.parceiro_id, 'Cliente')
  };
}

function validateComercialRelatorioOperacionalQuery(query = {}) {
  ensureAllowedKeys(
    query,
    ['periodo', 'data_inicial', 'data_final', 'empreendimento_id', 'obra_id', 'status'],
    'Relatorio comercial operacional'
  );

  const dataInicial = parseDateOnly(query.data_inicial, 'Data inicial');
  const dataFinal = parseDateOnly(query.data_final, 'Data final');

  if ((dataInicial && !dataFinal) || (!dataInicial && dataFinal)) {
    throw new ValidationError('Informe data inicial e data final para filtrar por periodo personalizado.');
  }

  if (dataInicial && dataFinal && dataInicial > dataFinal) {
    throw new ValidationError('Data inicial nao pode ser maior que a data final.');
  }

  return {
    periodo: parseEnum(query.periodo, 'Periodo', ['MES_ATUAL', '30_DIAS', '90_DIAS', 'ANO_ATUAL']),
    data_inicial: dataInicial,
    data_final: dataFinal,
    empreendimento_id: parseInteger(query.empreendimento_id, 'Empreendimento'),
    obra_id: parseInteger(query.obra_id, 'Obra'),
    status: parseEnum(query.status, 'Status', CONTRATO_STATUS)
  };
}

function validateComercialTabelaPrecoQuery(query = {}) {
  ensureAllowedKeys(
    query,
    ['q', 'empreendimento_id', 'status'],
    'Consulta de tabelas de preco'
  );

  return {
    q: parseOptionalText(query.q, 'Busca', 120),
    empreendimento_id: parseInteger(query.empreendimento_id, 'Empreendimento'),
    status: parseEnum(query.status, 'Status da tabela', TABELA_PRECO_STATUS)
  };
}

function validateComercialTabelaPrecoCreateBody(body = {}) {
  ensureAllowedKeys(
    body,
    ['empreendimento_id', 'codigo', 'nome', 'status', 'vigencia_inicio', 'vigencia_fim', 'observacoes', 'itens'],
    'Tabela de preco'
  );

  return {
    empreendimento_id: parseInteger(body.empreendimento_id, 'Empreendimento', { required: true }),
    codigo: parseOptionalText(body.codigo, 'Codigo', 60),
    nome: parseOptionalText(body.nome, 'Nome', 160, { required: true }),
    status: parseEnum(body.status, 'Status da tabela', TABELA_PRECO_STATUS) || 'RASCUNHO',
    vigencia_inicio: parseDateOnly(body.vigencia_inicio, 'Vigencia inicial'),
    vigencia_fim: parseDateOnly(body.vigencia_fim, 'Vigencia final'),
    observacoes: parseOptionalText(body.observacoes, 'Observacoes', 4000),
    itens: normalizeTabelaPrecoItens(body.itens)
  };
}

function validateComercialTabelaPrecoUpdateBody(body = {}) {
  ensureAllowedKeys(
    body,
    ['codigo', 'nome', 'status', 'vigencia_inicio', 'vigencia_fim', 'observacoes', 'itens'],
    'Atualizacao de tabela de preco'
  );

  const payload = {
    codigo: parseOptionalText(body.codigo, 'Codigo', 60),
    nome: parseOptionalText(body.nome, 'Nome', 160),
    status: parseEnum(body.status, 'Status da tabela', TABELA_PRECO_STATUS),
    vigencia_inicio: parseDateOnly(body.vigencia_inicio, 'Vigencia inicial'),
    vigencia_fim: parseDateOnly(body.vigencia_fim, 'Vigencia final'),
    observacoes: parseOptionalText(body.observacoes, 'Observacoes', 4000),
    itens: Object.prototype.hasOwnProperty.call(body, 'itens') ? normalizeTabelaPrecoItens(body.itens) : undefined
  };

  const normalized = Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  );

  if (!Object.keys(normalized).length) {
    throw new ValidationError('Nenhum campo valido informado para atualizar a tabela de preco.');
  }

  return normalized;
}

function validateComercialContratoCreateBody(body = {}) {
  ensureAllowedKeys(
    body,
    [
      'empreendimento_id',
      'unidade_comercial_id',
      'unidades',
      'parceiro_id',
      'compradores',
      'corretor_parceiro_id',
      'obra_id',
      'categoria_financeira_id',
      'numero',
      'status',
      'data_contrato',
      'valor_total',
      'valor_entrada',
      'desconto_concedido',
      'indice_reajuste',
      'corretor_nome',
      'comissao_percentual',
      'competencia_comissao_data',
      'possui_vaga_garagem',
      'quantidade_vagas_garagem',
      'vagas_garagem_posicao',
      'local_assinatura',
      'data_assinatura',
      'testemunha_1_nome',
      'testemunha_1_cpf',
      'testemunha_2_nome',
      'testemunha_2_cpf',
      'observacoes',
      'parcelas'
    ],
    'Contrato comercial'
  );

  const data = {
    empreendimento_id: parseInteger(body.empreendimento_id, 'Empreendimento', { required: true }),
    unidade_comercial_id: parseInteger(body.unidade_comercial_id, 'Unidade comercial'),
    unidades: Array.isArray(body.unidades)
      ? body.unidades.map((item, index) => ({
          unidade_comercial_id: parseInteger(item?.unidade_comercial_id, `Unidade ${index + 1}`, { required: true }),
          valor_cadastro_referencia: parseDecimal(item?.valor_cadastro_referencia, `Valor de cadastro da unidade ${index + 1}`, { min: 0 }),
          valor_atribuido: parseDecimal(item?.valor_atribuido, `Valor da unidade ${index + 1}`, { min: 0.01 }),
          principal: Boolean(item?.principal)
        }))
      : undefined,
    parceiro_id: parseInteger(body.parceiro_id, 'Cliente', { required: true }),
    compradores: normalizeCompradoresContrato(body.compradores, body.parceiro_id),
    corretor_parceiro_id: Object.prototype.hasOwnProperty.call(body, 'corretor_parceiro_id')
      ? (parseInteger(body.corretor_parceiro_id, 'Corretor') ?? null)
      : undefined,
    obra_id: parseInteger(body.obra_id, 'Obra', { required: true }),
    categoria_financeira_id: parseInteger(body.categoria_financeira_id, 'Categoria financeira'),
    numero: parseOptionalText(body.numero, 'Numero do contrato', 120, { required: true }),
    status: parseEnum(body.status, 'Status', CONTRATO_STATUS) || 'ATIVO',
    data_contrato: parseDateOnly(body.data_contrato, 'Data do contrato', { required: true }),
    valor_total: parseDecimal(body.valor_total, 'Valor total', { min: 0.01 }),
    valor_entrada: parseDecimal(body.valor_entrada, 'Valor de entrada', { min: 0 }),
    desconto_concedido: parseDecimal(body.desconto_concedido, 'Desconto concedido', { min: 0 }),
    indice_reajuste: parseOptionalText(body.indice_reajuste, 'Indice de reajuste', 60),
    corretor_nome: parseOptionalText(body.corretor_nome, 'Corretor', 160),
    comissao_percentual: parseDecimal(body.comissao_percentual, 'Comissao percentual', { min: 0 }),
    competencia_comissao_data: parseDateOnly(body.competencia_comissao_data, 'Competencia DRE da comissao'),
    possui_vaga_garagem: parseBoolean(body.possui_vaga_garagem, 'Possui vaga de garagem') || false,
    quantidade_vagas_garagem: parseInteger(body.quantidade_vagas_garagem, 'Quantidade de vagas de garagem'),
    vagas_garagem_posicao: parseOptionalText(body.vagas_garagem_posicao, 'Posicao das vagas de garagem', 255),
    local_assinatura: parseOptionalText(body.local_assinatura, 'Local de assinatura', 160),
    data_assinatura: parseDateOnly(body.data_assinatura, 'Data de assinatura'),
    testemunha_1_nome: parseOptionalText(body.testemunha_1_nome, 'Nome da testemunha 1', 160),
    testemunha_1_cpf: parseCpf(body.testemunha_1_cpf, 'CPF da testemunha 1'),
    testemunha_2_nome: parseOptionalText(body.testemunha_2_nome, 'Nome da testemunha 2', 160),
    testemunha_2_cpf: parseCpf(body.testemunha_2_cpf, 'CPF da testemunha 2'),
    observacoes: parseOptionalText(body.observacoes, 'Observacoes', 4000),
    parcelas: normalizeParcelas(body.parcelas)
  };

  if (!data.unidade_comercial_id && !data.unidades?.length) {
    throw new ValidationError('Informe ao menos uma unidade comercial.');
  }

  if (data.possui_vaga_garagem && !data.quantidade_vagas_garagem) {
    throw new ValidationError('Quantidade de vagas de garagem e obrigatoria quando houver vaga.');
  }

  if (!data.possui_vaga_garagem) {
    data.quantidade_vagas_garagem = null;
    data.vagas_garagem_posicao = null;
  }

  const dataAssinatura = data.data_assinatura || data.data_contrato;
  data.data_assinatura = dataAssinatura;
  data.data_contrato = dataAssinatura;

  const temCorretor = Boolean(data.corretor_parceiro_id);
  if (temCorretor && Number(data.comissao_percentual || 0) <= 0) {
    throw new ValidationError('Comissao percentual e obrigatoria quando houver corretor.');
  }

  if (temCorretor) {
    data.competencia_comissao_data = dataAssinatura;
  } else {
    data.corretor_nome = null;
    data.comissao_percentual = null;
    data.competencia_comissao_data = null;
  }

  validateWitnessPair(data.testemunha_1_nome, data.testemunha_1_cpf, 'Testemunha 1');
  validateWitnessPair(data.testemunha_2_nome, data.testemunha_2_cpf, 'Testemunha 2');

  data.parcelas = data.parcelas.map((parcela) => ({
    ...parcela,
    competencia_data: dataAssinatura
  }));

  return data;
}

function validateComercialContratoUpdateBody(body = {}) {
  ensureAllowedKeys(
    body,
    [
      'status',
      'compradores',
      'unidades',
      'categoria_financeira_id',
      'corretor_parceiro_id',
      'desconto_concedido',
      'indice_reajuste',
      'corretor_nome',
      'comissao_percentual',
      'competencia_comissao_data',
      'possui_vaga_garagem',
      'quantidade_vagas_garagem',
      'vagas_garagem_posicao',
      'local_assinatura',
      'data_assinatura',
      'testemunha_1_nome',
      'testemunha_1_cpf',
      'testemunha_2_nome',
      'testemunha_2_cpf',
      'observacoes'
    ],
    'Atualizacao de contrato comercial'
  );

  const payload = {
    status: parseEnum(body.status, 'Status', CONTRATO_STATUS),
    compradores: Object.prototype.hasOwnProperty.call(body, 'compradores')
      ? normalizeCompradoresContrato(body.compradores)
      : undefined,
    unidades: Object.prototype.hasOwnProperty.call(body, 'unidades')
      ? (Array.isArray(body.unidades)
          ? body.unidades.map((item, index) => ({
              unidade_comercial_id: parseInteger(item?.unidade_comercial_id, `Unidade ${index + 1}`, { required: true }),
              valor_cadastro_referencia: parseDecimal(item?.valor_cadastro_referencia, `Valor de cadastro da unidade ${index + 1}`, { min: 0 }),
              valor_atribuido: parseDecimal(item?.valor_atribuido, `Valor da unidade ${index + 1}`, { min: 0.01 }),
              principal: Boolean(item?.principal)
            }))
          : (() => { throw new ValidationError('Unidades deve ser uma lista.'); })())
      : undefined,
    categoria_financeira_id: parseInteger(body.categoria_financeira_id, 'Categoria financeira'),
    corretor_parceiro_id: Object.prototype.hasOwnProperty.call(body, 'corretor_parceiro_id')
      ? (parseInteger(body.corretor_parceiro_id, 'Corretor') ?? null)
      : undefined,
    desconto_concedido: parseDecimal(body.desconto_concedido, 'Desconto concedido', { min: 0 }),
    indice_reajuste: parseOptionalText(body.indice_reajuste, 'Indice de reajuste', 60),
    corretor_nome: Object.prototype.hasOwnProperty.call(body, 'corretor_nome')
      ? (parseOptionalText(body.corretor_nome, 'Corretor', 160) ?? null)
      : undefined,
    comissao_percentual: parseDecimal(body.comissao_percentual, 'Comissao percentual', { min: 0 }),
    competencia_comissao_data: Object.prototype.hasOwnProperty.call(body, 'competencia_comissao_data')
      ? (parseDateOnly(body.competencia_comissao_data, 'Competencia DRE da comissao') ?? null)
      : undefined,
    possui_vaga_garagem: parseBoolean(body.possui_vaga_garagem, 'Possui vaga de garagem'),
    quantidade_vagas_garagem: parseInteger(body.quantidade_vagas_garagem, 'Quantidade de vagas de garagem'),
    vagas_garagem_posicao: parseOptionalText(body.vagas_garagem_posicao, 'Posicao das vagas de garagem', 255),
    local_assinatura: parseOptionalText(body.local_assinatura, 'Local de assinatura', 160),
    data_assinatura: parseDateOnly(body.data_assinatura, 'Data de assinatura'),
    testemunha_1_nome: Object.prototype.hasOwnProperty.call(body, 'testemunha_1_nome')
      ? (parseOptionalText(body.testemunha_1_nome, 'Nome da testemunha 1', 160) ?? null)
      : undefined,
    testemunha_1_cpf: Object.prototype.hasOwnProperty.call(body, 'testemunha_1_cpf')
      ? (parseCpf(body.testemunha_1_cpf, 'CPF da testemunha 1') ?? null)
      : undefined,
    testemunha_2_nome: Object.prototype.hasOwnProperty.call(body, 'testemunha_2_nome')
      ? (parseOptionalText(body.testemunha_2_nome, 'Nome da testemunha 2', 160) ?? null)
      : undefined,
    testemunha_2_cpf: Object.prototype.hasOwnProperty.call(body, 'testemunha_2_cpf')
      ? (parseCpf(body.testemunha_2_cpf, 'CPF da testemunha 2') ?? null)
      : undefined,
    observacoes: parseOptionalText(body.observacoes, 'Observacoes', 4000)
  };

  const normalized = Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  );

  if (!Object.keys(normalized).length) {
    throw new ValidationError('Nenhum campo valido informado para atualizar o contrato comercial.');
  }

  return normalized;
}

function validateComercialContratoDistratoBody(body = {}) {
  ensureAllowedKeys(
    body,
    ['data_distrato', 'motivo_distrato', 'observacoes'],
    'Distrato de contrato comercial'
  );

  return {
    data_distrato: parseDateOnly(body.data_distrato, 'Data do distrato', { required: true }),
    motivo_distrato: parseOptionalText(body.motivo_distrato, 'Motivo do distrato', 255, { required: true }),
    observacoes: parseOptionalText(body.observacoes, 'Observacoes', 4000)
  };
}

function validateComercialContratoTrocaUnidadeBody(body = {}) {
  ensureAllowedKeys(
    body,
    ['unidade_comercial_origem_id', 'unidade_comercial_destino_id', 'novo_valor_total', 'data_efetiva', 'competencia_data', 'observacoes'],
    'Troca de unidade do contrato comercial'
  );

  return {
    unidade_comercial_origem_id: parseInteger(body.unidade_comercial_origem_id, 'Unidade de origem'),
    unidade_comercial_destino_id: parseInteger(body.unidade_comercial_destino_id, 'Nova unidade', { required: true }),
    novo_valor_total: parseDecimal(body.novo_valor_total, 'Novo valor total', { min: 0.01 }),
    data_efetiva: parseDateOnly(body.data_efetiva, 'Data efetiva'),
    competencia_data: parseDateOnly(body.competencia_data, 'Competencia DRE do ajuste'),
    observacoes: parseOptionalText(body.observacoes, 'Observacoes', 4000)
  };
}

module.exports = {
  COMERCIAL_FORMA_RECEBIMENTO,
  CONTRATO_STATUS,
  PARCELA_TIPOS,
  TABELA_PRECO_STATUS,
  UNIDADE_STATUS,
  validateComercialContratoDistratoBody,
  validateComercialContratoCreateBody,
  validateComercialContratoQuery,
  validateComercialRelatorioOperacionalQuery,
  validateComercialContratoTrocaUnidadeBody,
  validateComercialContratoUpdateBody,
  validateComercialEmpreendimentoCreateBody,
  validateComercialEmpreendimentoQuery,
  validateComercialEmpreendimentoUpdateBody,
  validateComercialTabelaPrecoCreateBody,
  validateComercialTabelaPrecoQuery,
  validateComercialTabelaPrecoUpdateBody,
  validateComercialUnidadeCreateBody,
  validateComercialUnidadeQuery,
  validateComercialUnidadeUpdateBody
};
