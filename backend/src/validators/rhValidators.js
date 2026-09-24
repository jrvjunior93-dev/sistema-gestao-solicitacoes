const {
  ensureAllowedKeys,
  ValidationError,
  sanitizeString
} = require('../middlewares/validation');
const { TIPOS_GERENCIAIS_EMPRESA_GRUPO } = require('../constants/empresaGrupo');
const { onlyDigits, isValidCpf, isValidCnpj, isValidCpfCnpj } = require('../utils/cpfCnpj');

const RH_TIPOS_VINCULO = ['CLT', 'NAO_CLT'];
const RH_FORMAS_CALCULO_GERENCIAL = ['MENSAL', 'DIARIA'];
const RH_STATUS_COLABORADOR = ['ATIVO', 'INATIVO', 'AFASTADO'];
const RH_STATUS_DOCUMENTO = ['ENVIADO', 'CONFERIDO', 'REJEITADO', 'SUBSTITUIDO'];
const RH_VALIDADE_STATUS = ['SEM_VALIDADE', 'VALIDO', 'A_VENCER', 'VENCIDO'];
const RH_TIPOS_IMPORTACAO = ['JORNADA', 'EVENTO_VARIAVEL', 'DESCONTO'];
const RH_STATUS_IMPORTACAO = ['PREVIEW', 'CONFIRMADA', 'CANCELADA'];
const RH_STATUS_APURACAO = ['RASCUNHO', 'CONFERIDA'];
const RH_STATUS_APURACAO_ITEM = ['PENDENTE', 'CONFERIDO'];
const RH_STATUS_FECHAMENTO = ['FECHADO', 'ESTORNADO'];
const RH_DIAS_BASE_APURACAO = [20, 22, 30];

function isBlank(value) {
  return value == null || String(value).trim() === '';
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

function parseDiasBaseApuracao(value) {
  const parsed = parseInteger(value, 'Dias base') || 30;
  if (!RH_DIAS_BASE_APURACAO.includes(parsed)) {
    throw new ValidationError('Dias base deve ser 20, 22 ou 30.');
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

function parseCompetencia(value, fieldName, { required = false } = {}) {
  if (isBlank(value)) {
    if (required) {
      throw new ValidationError(`${fieldName} e obrigatorio.`);
    }
    return undefined;
  }

  const normalized = sanitizeString(value, fieldName, {
    required: true,
    max: 7,
    pattern: /^\d{4}-\d{2}$/
  });

  const [year, month] = normalized.split('-').map(Number);
  if (month < 1 || month > 12 || year < 2000 || year > 2100) {
    throw new ValidationError(`${fieldName} invalida.`);
  }

  return normalized;
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

function normalizeDigits(value) {
  return onlyDigits(value);
}

function parseCpf(value, fieldName, { required = false } = {}) {
  if (isBlank(value)) {
    if (required) {
      throw new ValidationError(`${fieldName} e obrigatorio.`);
    }
    return undefined;
  }

  const digits = normalizeDigits(value);
  if (!isValidCpf(digits)) {
    throw new ValidationError(`${fieldName} invalido.`);
  }
  return digits;
}

function parseCpfCnpj(value, fieldName, { cnpjOnly = false } = {}) {
  if (isBlank(value)) {
    return undefined;
  }

  const digits = normalizeDigits(value);
  if (cnpjOnly ? !isValidCnpj(digits) : !isValidCpfCnpj(digits)) {
    throw new ValidationError(`${fieldName} invalido.`);
  }
  return digits;
}

function validateRhEmpresaGrupoQuery(query = {}) {
  ensureAllowedKeys(query, ['q', 'ativo', 'tipo_empresa', 'tipo_gerencial', 'holding_id', 'consolidar_no_grupo'], 'Consulta de empresas do grupo');

  return {
    q: parseOptionalText(query.q, 'Busca', 120),
    ativo: parseBoolean(query.ativo, 'Ativo'),
    tipo_empresa: parseEnum(query.tipo_empresa, 'Tipo de empresa', ['HOLDING', 'OPERACIONAL']),
    tipo_gerencial: parseEnum(query.tipo_gerencial, 'Tipo gerencial', TIPOS_GERENCIAIS_EMPRESA_GRUPO),
    consolidar_no_grupo: parseBoolean(query.consolidar_no_grupo, 'Consolidar no grupo'),
    holding_id: parseInteger(query.holding_id, 'Holding')
  };
}

function validateRhEmpresaGrupoCreateBody(body = {}) {
  ensureAllowedKeys(body, [
    'codigo',
    'nome',
    'razao_social',
    'cnpj',
    'tipo_empresa',
    'tipo_gerencial',
    'empresa_caixa',
    'empresa_operacional',
    'consolidar_no_grupo',
    'elimina_intercompany',
    'holding_id',
    'ativo'
  ], 'Empresa do grupo');

  return {
    codigo: parseOptionalText(body.codigo, 'Codigo', 60),
    nome: parseOptionalText(body.nome, 'Nome', 160, { required: true }),
    razao_social: parseOptionalText(body.razao_social, 'Razao social', 200),
    cnpj: parseCpfCnpj(body.cnpj, 'CNPJ', { cnpjOnly: true }),
    tipo_empresa: parseEnum(body.tipo_empresa, 'Tipo de empresa', ['HOLDING', 'OPERACIONAL']),
    tipo_gerencial: parseEnum(body.tipo_gerencial, 'Tipo gerencial', TIPOS_GERENCIAIS_EMPRESA_GRUPO),
    empresa_caixa: parseBoolean(body.empresa_caixa, 'Empresa caixa'),
    empresa_operacional: parseBoolean(body.empresa_operacional, 'Empresa operacional'),
    consolidar_no_grupo: parseBoolean(body.consolidar_no_grupo, 'Consolidar no grupo'),
    elimina_intercompany: parseBoolean(body.elimina_intercompany, 'Eliminar entre empresas'),
    holding_id: parseInteger(body.holding_id, 'Holding'),
    ativo: parseBoolean(body.ativo, 'Ativo')
  };
}

function validateRhEmpresaGrupoUpdateBody(body = {}) {
  ensureAllowedKeys(body, [
    'codigo',
    'nome',
    'razao_social',
    'cnpj',
    'tipo_empresa',
    'tipo_gerencial',
    'empresa_caixa',
    'empresa_operacional',
    'consolidar_no_grupo',
    'elimina_intercompany',
    'holding_id',
    'ativo'
  ], 'Atualizacao de empresa do grupo');

  const payload = {
    codigo: parseOptionalText(body.codigo, 'Codigo', 60),
    nome: parseOptionalText(body.nome, 'Nome', 160),
    razao_social: parseOptionalText(body.razao_social, 'Razao social', 200),
    cnpj: parseCpfCnpj(body.cnpj, 'CNPJ', { cnpjOnly: true }),
    tipo_empresa: parseEnum(body.tipo_empresa, 'Tipo de empresa', ['HOLDING', 'OPERACIONAL']),
    tipo_gerencial: parseEnum(body.tipo_gerencial, 'Tipo gerencial', TIPOS_GERENCIAIS_EMPRESA_GRUPO),
    empresa_caixa: parseBoolean(body.empresa_caixa, 'Empresa caixa'),
    empresa_operacional: parseBoolean(body.empresa_operacional, 'Empresa operacional'),
    consolidar_no_grupo: parseBoolean(body.consolidar_no_grupo, 'Consolidar no grupo'),
    elimina_intercompany: parseBoolean(body.elimina_intercompany, 'Eliminar entre empresas'),
    holding_id: parseInteger(body.holding_id, 'Holding'),
    ativo: parseBoolean(body.ativo, 'Ativo')
  };

  const normalized = Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  );

  if (!Object.keys(normalized).length) {
    throw new ValidationError('Nenhum campo valido informado para atualizar a empresa do grupo.');
  }

  return normalized;
}

function normalizePagamentoPayload(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value == null) {
    return {};
  }

  ensureAllowedKeys(
    value,
    [
      'favorecido_nome',
      'favorecido_documento',
      'banco',
      'agencia',
      'conta',
      'tipo_conta',
      'chave_pix',
      'chave_pix_secundaria',
      'chave_pix_variavel',
      'observacoes'
    ],
    'Pagamento do colaborador'
  );

  return {
    favorecido_nome: parseOptionalText(value.favorecido_nome, 'Favorecido', 180),
    favorecido_documento: parseCpf(value.favorecido_documento, 'CPF do favorecido'),
    banco: parseOptionalText(value.banco, 'Banco', 80),
    agencia: parseOptionalText(value.agencia, 'Agencia', 30),
    conta: parseOptionalText(value.conta, 'Conta', 40),
    tipo_conta: parseOptionalText(value.tipo_conta, 'Tipo de conta', 30),
    chave_pix: parseOptionalText(value.chave_pix, 'Chave PIX principal', 120),
    chave_pix_secundaria: parseOptionalText(value.chave_pix_secundaria, 'Chave PIX fixa 2', 120),
    chave_pix_variavel: parseOptionalText(value.chave_pix_variavel, 'Chave PIX variavel', 120),
    observacoes: parseOptionalText(value.observacoes, 'Observacoes do pagamento', 2000)
  };
}

function validateRhColaboradorQuery(query = {}) {
  ensureAllowedKeys(
    query,
    ['q', 'empresa_grupo_id', 'obra_id', 'setor_id', 'tipo_vinculo', 'status'],
    'Consulta de colaboradores RH/DP'
  );

  return {
    q: parseOptionalText(query.q, 'Busca', 120),
    empresa_grupo_id: parseInteger(query.empresa_grupo_id, 'Empresa do grupo'),
    obra_id: parseInteger(query.obra_id, 'Obra'),
    setor_id: parseInteger(query.setor_id, 'Setor'),
    tipo_vinculo: parseEnum(query.tipo_vinculo, 'Tipo de vinculo', RH_TIPOS_VINCULO),
    status: parseEnum(query.status, 'Status', RH_STATUS_COLABORADOR)
  };
}

function validateRhRelatorioOperacionalQuery(query = {}) {
  ensureAllowedKeys(
    query,
    ['periodo', 'data_inicial', 'data_final', 'empresa_grupo_id', 'obra_id', 'tipo_vinculo', 'status'],
    'Relatorio operacional RH/DP'
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
    empresa_grupo_id: parseInteger(query.empresa_grupo_id, 'Empresa do grupo'),
    obra_id: parseInteger(query.obra_id, 'Obra'),
    tipo_vinculo: parseEnum(query.tipo_vinculo, 'Tipo de vinculo', RH_TIPOS_VINCULO),
    status: parseEnum(query.status, 'Status', RH_STATUS_COLABORADOR)
  };
}

function validateRhColaboradorCreateBody(body = {}) {
  ensureAllowedKeys(
    body,
    [
      'empresa_grupo_id',
      'obra_id',
      'setor_id',
      'nome',
      'cpf',
      'matricula',
      'rg',
      'telefone',
      'email',
      'cargo',
      'tipo_vinculo',
      'data_inicio',
      'data_admissao',
      'data_demissao',
      'data_nascimento',
      'status',
      'salario_base',
      'valor_contratual',
      'forma_calculo_gerencial',
      'valor_diaria',
      'pagamento_automatico_40_60',
      'observacoes',
      'pagamento'
    ],
    'Colaborador RH/DP'
  );

  return {
    empresa_grupo_id: parseInteger(body.empresa_grupo_id, 'Empresa do grupo', { required: true }),
    obra_id: parseInteger(body.obra_id, 'Obra'),
    setor_id: parseInteger(body.setor_id, 'Setor'),
    nome: parseOptionalText(body.nome, 'Nome', 180, { required: true }),
    cpf: parseCpf(body.cpf, 'CPF', { required: true }),
    matricula: parseOptionalText(body.matricula, 'Matricula', 60),
    rg: parseOptionalText(body.rg, 'RG', 30),
    telefone: parseOptionalText(body.telefone, 'Telefone', 30),
    email: parseOptionalText(body.email, 'Email', 160),
    cargo: parseOptionalText(body.cargo, 'Cargo', 120),
    tipo_vinculo: parseEnum(body.tipo_vinculo, 'Tipo de vinculo', RH_TIPOS_VINCULO, { required: true }),
    data_inicio: parseDateOnly(body.data_inicio, 'Data de inicio'),
    data_admissao: parseDateOnly(body.data_admissao, 'Data de admissao'),
    data_demissao: parseDateOnly(body.data_demissao, 'Data de demissao'),
    data_nascimento: parseDateOnly(body.data_nascimento, 'Data de nascimento'),
    status: parseEnum(body.status, 'Status', RH_STATUS_COLABORADOR) || 'ATIVO',
    salario_base: parseDecimal(body.salario_base, 'Salario base', { min: 0 }),
    valor_contratual: parseDecimal(body.valor_contratual, 'Valor contratual', { min: 0 }),
    forma_calculo_gerencial: parseEnum(
      body.forma_calculo_gerencial,
      'Forma de calculo gerencial',
      RH_FORMAS_CALCULO_GERENCIAL
    ) || 'MENSAL',
    valor_diaria: parseDecimal(body.valor_diaria, 'Valor da diaria', { min: 0 }),
    pagamento_automatico_40_60: body.pagamento_automatico_40_60 === true
      || String(body.pagamento_automatico_40_60 || '').toLowerCase() === 'true',
    observacoes: parseOptionalText(body.observacoes, 'Observacoes', 4000),
    pagamento: normalizePagamentoPayload(body.pagamento)
  };
}

function validateRhColaboradorUpdateBody(body = {}) {
  ensureAllowedKeys(
    body,
    [
      'empresa_grupo_id',
      'obra_id',
      'setor_id',
      'nome',
      'cpf',
      'matricula',
      'rg',
      'telefone',
      'email',
      'cargo',
      'tipo_vinculo',
      'data_inicio',
      'data_admissao',
      'data_demissao',
      'data_nascimento',
      'status',
      'salario_base',
      'valor_contratual',
      'forma_calculo_gerencial',
      'valor_diaria',
      'pagamento_automatico_40_60',
      'observacoes',
      'pagamento'
    ],
    'Atualizacao de colaborador RH/DP'
  );

  const payload = {
    empresa_grupo_id: parseInteger(body.empresa_grupo_id, 'Empresa do grupo'),
    obra_id: parseInteger(body.obra_id, 'Obra'),
    setor_id: parseInteger(body.setor_id, 'Setor'),
    nome: parseOptionalText(body.nome, 'Nome', 180),
    cpf: parseCpf(body.cpf, 'CPF'),
    matricula: parseOptionalText(body.matricula, 'Matricula', 60),
    rg: parseOptionalText(body.rg, 'RG', 30),
    telefone: parseOptionalText(body.telefone, 'Telefone', 30),
    email: parseOptionalText(body.email, 'Email', 160),
    cargo: parseOptionalText(body.cargo, 'Cargo', 120),
    tipo_vinculo: parseEnum(body.tipo_vinculo, 'Tipo de vinculo', RH_TIPOS_VINCULO),
    data_inicio: parseDateOnly(body.data_inicio, 'Data de inicio'),
    data_admissao: parseDateOnly(body.data_admissao, 'Data de admissao'),
    data_demissao: parseDateOnly(body.data_demissao, 'Data de demissao'),
    data_nascimento: parseDateOnly(body.data_nascimento, 'Data de nascimento'),
    status: parseEnum(body.status, 'Status', RH_STATUS_COLABORADOR),
    salario_base: parseDecimal(body.salario_base, 'Salario base', { min: 0 }),
    valor_contratual: parseDecimal(body.valor_contratual, 'Valor contratual', { min: 0 }),
    forma_calculo_gerencial: parseEnum(
      body.forma_calculo_gerencial,
      'Forma de calculo gerencial',
      RH_FORMAS_CALCULO_GERENCIAL
    ),
    valor_diaria: parseDecimal(body.valor_diaria, 'Valor da diaria', { min: 0 }),
    pagamento_automatico_40_60: Object.prototype.hasOwnProperty.call(body, 'pagamento_automatico_40_60')
      ? body.pagamento_automatico_40_60 === true
        || String(body.pagamento_automatico_40_60 || '').toLowerCase() === 'true'
      : undefined,
    observacoes: parseOptionalText(body.observacoes, 'Observacoes', 4000),
    pagamento: Object.prototype.hasOwnProperty.call(body, 'pagamento')
      ? normalizePagamentoPayload(body.pagamento)
      : undefined
  };

  const normalized = Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  );

  if (!Object.keys(normalized).length) {
    throw new ValidationError('Nenhum campo valido informado para atualizar o colaborador.');
  }

  return normalized;
}

function validateRhDocumentoTipoQuery(query = {}) {
  ensureAllowedKeys(
    query,
    ['colaborador_id', 'tipo_vinculo', 'ativo'],
    'Consulta de tipos de documento RH/DP'
  );

  return {
    colaborador_id: parseInteger(query.colaborador_id, 'Colaborador'),
    tipo_vinculo: parseEnum(query.tipo_vinculo, 'Tipo de vinculo', RH_TIPOS_VINCULO),
    ativo: parseBoolean(query.ativo, 'Ativo')
  };
}

function validateRhDocumentoQuery(query = {}) {
  ensureAllowedKeys(
    query,
    [
      'q',
      'colaborador_id',
      'empresa_grupo_id',
      'obra_id',
      'tipo_vinculo',
      'tipo_documento_id',
      'status',
      'validade_status',
      'page',
      'limit',
      'incluir_historico'
    ],
    'Consulta de documentos RH/DP'
  );

  return {
    q: parseOptionalText(query.q, 'Busca', 120),
    colaborador_id: parseInteger(query.colaborador_id, 'Colaborador'),
    empresa_grupo_id: parseInteger(query.empresa_grupo_id, 'Empresa do grupo'),
    obra_id: parseInteger(query.obra_id, 'Obra'),
    tipo_vinculo: parseEnum(query.tipo_vinculo, 'Tipo de vinculo', RH_TIPOS_VINCULO),
    tipo_documento_id: parseInteger(query.tipo_documento_id, 'Tipo de documento'),
    status: parseEnum(query.status, 'Status', RH_STATUS_DOCUMENTO),
    validade_status: parseEnum(query.validade_status, 'Status da validade', RH_VALIDADE_STATUS),
    page: parseInteger(query.page, 'Pagina'),
    limit: parseInteger(query.limit, 'Limite'),
    incluir_historico: parseBoolean(query.incluir_historico, 'Incluir historico') || false
  };
}

function validateRhDocumentoCreateBody(body = {}) {
  ensureAllowedKeys(
    body,
    ['colaborador_id', 'tipo_documento_id', 'validade', 'status', 'observacoes'],
    'Documento RH/DP'
  );

  return {
    colaborador_id: parseInteger(body.colaborador_id, 'Colaborador', { required: true }),
    tipo_documento_id: parseInteger(body.tipo_documento_id, 'Tipo de documento', { required: true }),
    validade: parseDateOnly(body.validade, 'Validade'),
    status: parseEnum(body.status, 'Status', RH_STATUS_DOCUMENTO) || 'ENVIADO',
    observacoes: parseOptionalText(body.observacoes, 'Observacoes', 4000)
  };
}

function validateRhDocumentoUpdateBody(body = {}) {
  ensureAllowedKeys(
    body,
    ['tipo_documento_id', 'validade', 'status', 'observacoes'],
    'Atualizacao de documento RH/DP'
  );

  const payload = {
    tipo_documento_id: parseInteger(body.tipo_documento_id, 'Tipo de documento'),
    validade: parseDateOnly(body.validade, 'Validade'),
    status: parseEnum(body.status, 'Status', RH_STATUS_DOCUMENTO),
    observacoes: parseOptionalText(body.observacoes, 'Observacoes', 4000)
  };

  const normalized = Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  );

  if (!Object.keys(normalized).length) {
    throw new ValidationError('Nenhum campo valido informado para atualizar o documento.');
  }

  return normalized;
}

function validateRhImportacaoQuery(query = {}) {
  ensureAllowedKeys(
    query,
    ['tipo', 'competencia', 'empresa_grupo_id', 'obra_id', 'tipo_vinculo', 'status'],
    'Consulta de importacoes RH/DP'
  );

  return {
    tipo: parseEnum(query.tipo, 'Tipo de importacao', RH_TIPOS_IMPORTACAO),
    competencia: parseCompetencia(query.competencia, 'Competencia'),
    empresa_grupo_id: parseInteger(query.empresa_grupo_id, 'Empresa do grupo'),
    obra_id: parseInteger(query.obra_id, 'Obra'),
    tipo_vinculo: parseEnum(query.tipo_vinculo, 'Tipo de vinculo', RH_TIPOS_VINCULO),
    status: parseEnum(query.status, 'Status da importacao', RH_STATUS_IMPORTACAO)
  };
}

function validateRhImportacaoCreateBody(body = {}) {
  ensureAllowedKeys(
    body,
    ['tipo', 'competencia', 'empresa_grupo_id', 'obra_id', 'tipo_vinculo', 'observacoes'],
    'Importacao RH/DP'
  );

  return {
    tipo: parseEnum(body.tipo, 'Tipo de importacao', RH_TIPOS_IMPORTACAO, { required: true }),
    competencia: parseCompetencia(body.competencia, 'Competencia', { required: true }),
    empresa_grupo_id: parseInteger(body.empresa_grupo_id, 'Empresa do grupo'),
    obra_id: parseInteger(body.obra_id, 'Obra', { required: true }),
    tipo_vinculo: parseEnum(body.tipo_vinculo, 'Tipo de vinculo', RH_TIPOS_VINCULO),
    observacoes: parseOptionalText(body.observacoes, 'Observacoes', 4000)
  };
}

function validateRhApuracaoQuery(query = {}) {
  ensureAllowedKeys(
    query,
    ['competencia', 'empresa_grupo_id', 'obra_id', 'tipo_vinculo', 'status'],
    'Consulta de apuracoes RH/DP'
  );

  return {
    competencia: parseCompetencia(query.competencia, 'Competencia'),
    empresa_grupo_id: parseInteger(query.empresa_grupo_id, 'Empresa do grupo'),
    obra_id: parseInteger(query.obra_id, 'Obra'),
    tipo_vinculo: parseEnum(query.tipo_vinculo, 'Tipo de vinculo', RH_TIPOS_VINCULO),
    status: parseEnum(query.status, 'Status da apuracao', RH_STATUS_APURACAO)
  };
}

function validateRhApuracaoCreateBody(body = {}) {
  ensureAllowedKeys(
    body,
    ['competencia', 'empresa_grupo_id', 'obra_id', 'tipo_vinculo', 'dias_base', 'observacoes'],
    'Apuracao RH/DP'
  );

  return {
    competencia: parseCompetencia(body.competencia, 'Competencia', { required: true }),
    empresa_grupo_id: parseInteger(body.empresa_grupo_id, 'Empresa do grupo'),
    obra_id: parseInteger(body.obra_id, 'Obra'),
    tipo_vinculo: parseEnum(body.tipo_vinculo, 'Tipo de vinculo', RH_TIPOS_VINCULO),
    dias_base: parseDiasBaseApuracao(body.dias_base),
    observacoes: parseOptionalText(body.observacoes, 'Observacoes', 4000)
  };
}

function validateRhApuracaoItemParams(params = {}) {
  ensureAllowedKeys(params, ['id', 'itemId'], 'Parametros da apuracao RH/DP');

  return {
    id: String(parseInteger(params.id, 'Apuracao RH/DP')),
    itemId: String(parseInteger(params.itemId, 'Item da apuracao RH/DP'))
  };
}

function validateRhApuracaoItemUpdateBody(body = {}) {
  ensureAllowedKeys(
    body,
    ['ajuste_credito_manual', 'ajuste_debito_manual', 'observacoes', 'status', 'chave_pix_titulo'],
    'Item da apuracao RH/DP'
  );

  const payload = {
    ajuste_credito_manual: parseDecimal(body.ajuste_credito_manual, 'Ajuste de credito manual', { min: 0 }),
    ajuste_debito_manual: parseDecimal(body.ajuste_debito_manual, 'Ajuste de debito manual', { min: 0 }),
    observacoes: parseOptionalText(body.observacoes, 'Observacoes', 4000),
    status: parseEnum(body.status, 'Status do item da apuracao', RH_STATUS_APURACAO_ITEM),
    chave_pix_titulo: parseOptionalText(body.chave_pix_titulo, 'Chave PIX do titulo', 120)
  };

  const normalized = Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  );

  if (!Object.keys(normalized).length) {
    throw new ValidationError('Nenhum campo valido informado para atualizar o item da apuracao.');
  }

  return normalized;
}

function validateRhFechamentoQuery(query = {}) {
  ensureAllowedKeys(
    query,
    ['apuracao_id', 'competencia', 'empresa_grupo_id', 'obra_id', 'status'],
    'Consulta de fechamentos RH/DP'
  );

  return {
    apuracao_id: parseInteger(query.apuracao_id, 'Apuracao RH/DP'),
    competencia: parseCompetencia(query.competencia, 'Competencia'),
    empresa_grupo_id: parseInteger(query.empresa_grupo_id, 'Empresa do grupo'),
    obra_id: parseInteger(query.obra_id, 'Obra'),
    status: parseEnum(query.status, 'Status do fechamento', RH_STATUS_FECHAMENTO)
  };
}

function validateRhFecharApuracaoBody(body = {}) {
  ensureAllowedKeys(
    body,
    [
      'data_fechamento',
      'data_vencimento',
      'data_vencimento_40',
      'data_vencimento_60',
      'ajustes_titulos',
      'categoria_financeira_id',
      'observacoes'
    ],
    'Fechamento RH/DP'
  );

  const ajustesTitulos = body.ajustes_titulos === undefined
    ? undefined
    : (() => {
        if (!Array.isArray(body.ajustes_titulos) || body.ajustes_titulos.length > 500) {
          throw new ValidationError('Ajustes dos titulos invalidos.');
        }
        const ids = new Set();
        return body.ajustes_titulos.map((item, index) => {
          ensureAllowedKeys(
            item || {},
            ['apuracao_evento_id', 'valor_40', 'valor_60', 'observacao'],
            `Ajuste do titulo ${index + 1}`
          );
          const id = parseInteger(item?.apuracao_evento_id, 'Item da apuracao', { required: true });
          if (ids.has(id)) throw new ValidationError(`O item #${id} foi informado mais de uma vez nos ajustes.`);
          ids.add(id);
          return {
            apuracao_evento_id: id,
            valor_40: parseDecimal(item?.valor_40, 'Valor de 40%', { required: true, min: 0 }),
            valor_60: parseDecimal(item?.valor_60, 'Valor de 60%', { required: true, min: 0 }),
            observacao: parseOptionalText(item?.observacao, 'Observacao do ajuste', 1000)
          };
        });
      })();

  return {
    data_fechamento: parseDateOnly(body.data_fechamento, 'Data de fechamento'),
    data_vencimento: parseDateOnly(body.data_vencimento, 'Data de vencimento'),
    data_vencimento_40: parseDateOnly(body.data_vencimento_40, 'Vencimento de 40%'),
    data_vencimento_60: parseDateOnly(body.data_vencimento_60, 'Vencimento de 60%'),
    ajustes_titulos: ajustesTitulos,
    categoria_financeira_id: parseInteger(body.categoria_financeira_id, 'Categoria financeira'),
    observacoes: parseOptionalText(body.observacoes, 'Observacoes', 4000)
  };
}

function validateRhReabrirFechamentoBody(body = {}) {
  ensureAllowedKeys(body, ['justificativa'], 'Reabertura de fechamento RH/DP');

  return {
    justificativa: parseOptionalText(body.justificativa, 'Justificativa', 4000, { required: true })
  };
}

module.exports = {
  RH_STATUS_COLABORADOR,
  RH_FORMAS_CALCULO_GERENCIAL,
  RH_STATUS_DOCUMENTO,
  RH_STATUS_APURACAO,
  RH_STATUS_APURACAO_ITEM,
  RH_STATUS_FECHAMENTO,
  RH_STATUS_IMPORTACAO,
  RH_TIPOS_VINCULO,
  RH_TIPOS_IMPORTACAO,
  RH_VALIDADE_STATUS,
  validateRhApuracaoCreateBody,
  validateRhApuracaoItemParams,
  validateRhApuracaoItemUpdateBody,
  validateRhApuracaoQuery,
  validateRhColaboradorCreateBody,
  validateRhColaboradorQuery,
  validateRhColaboradorUpdateBody,
  validateRhDocumentoCreateBody,
  validateRhDocumentoQuery,
  validateRhDocumentoTipoQuery,
  validateRhDocumentoUpdateBody,
  validateRhFechamentoQuery,
  validateRhFecharApuracaoBody,
  validateRhReabrirFechamentoBody,
  validateRhRelatorioOperacionalQuery,
  validateRhImportacaoCreateBody,
  validateRhImportacaoQuery,
  validateRhEmpresaGrupoCreateBody,
  validateRhEmpresaGrupoQuery,
  validateRhEmpresaGrupoUpdateBody
};
