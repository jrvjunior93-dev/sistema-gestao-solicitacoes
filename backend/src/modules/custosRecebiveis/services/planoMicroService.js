'use strict';

const crypto = require('crypto');
const { Op } = require('sequelize');
const db = require('../../../models');
const {
  createWorkbookBuffer,
  sheetToArrayRows
} = require('../../../utils/excelWorkbook');
const {
  resolverEscopoObras,
  usuarioPodeAcessarObra
} = require('../policies/obraScopePolicy');
const {
  MODEL_COLUMNS,
  normalizeCode,
  normalizeText,
  validatePlanoMicroRows
} = require('../validators/planoMicroValidator');

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 10000;
const DIVERGENCE_TOLERANCE_PCT = 5;
const BUSINESS_ERROR_NAME = 'CustosRecebiveisBusinessError';
const VALID_COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;

function createBusinessError(statusCode, code, message, details = null) {
  const error = new Error(message);
  error.name = BUSINESS_ERROR_NAME;
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
}

function getDependencies(overrides = {}) {
  return {
    sequelize: db.sequelize,
    Obra: db.Obra,
    Contrato: db.Contrato,
    EmpresaGrupo: db.EmpresaGrupo,
    Apropriacao: db.Apropriacao,
    User: db.User,
    CrPlanoObra: db.CrPlanoObra,
    CrPlanoItem: db.CrPlanoItem,
    CrPlanoMacroVinculo: db.CrPlanoMacroVinculo,
    CrImportacao: db.CrImportacao,
    CrResponsavelObra: db.CrResponsavelObra,
    CrCompetencia: db.CrCompetencia,
    CrAuditoria: db.CrAuditoria,
    resolverEscopoObras,
    usuarioPodeAcessarObra,
    ...overrides
  };
}

function asPlain(instance) {
  return instance?.toJSON ? instance.toJSON() : { ...(instance || {}) };
}

function parseJson(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizePositiveInteger(value, fieldLabel) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createBusinessError(400, 'CR_INVALID_ID', `${fieldLabel} invalido.`);
  }
  return parsed;
}

function normalizeReason(value) {
  return normalizeText(value, 2000);
}

function normalizeSearch(value) {
  return normalizeText(value, 120);
}

function competenciaReferencia(value, now = new Date()) {
  const informed = String(value || '').trim();
  if (informed) {
    if (!VALID_COMPETENCIA.test(informed)) {
      throw createBusinessError(
        400,
        'CR_COMPETENCIA_INVALIDA',
        'Competencia invalida. Use AAAA-MM.'
      );
    }
    return informed;
  }
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return `${year}-${month}`;
}

function prazoCompetenciaReferencia(competencia) {
  const [year, month] = competencia.split('-').map(Number);
  const deadline = new Date(year, month, 0, 18, 0, 0, 0);
  const holidays = new Set(String(process.env.CR_FERIADOS || '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item)));
  const dateKey = () => (
    `${deadline.getFullYear()}-${String(deadline.getMonth() + 1).padStart(2, '0')}-${String(deadline.getDate()).padStart(2, '0')}`
  );
  while (deadline.getDay() === 0 || deadline.getDay() === 6 || holidays.has(dateKey())) {
    deadline.setDate(deadline.getDate() - 1);
  }
  return deadline;
}

function assertSpreadsheetFile(file) {
  if (!file?.buffer || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    throw createBusinessError(400, 'CR_FILE_REQUIRED', 'Selecione um arquivo .xlsx.');
  }
  if (file.buffer.length > MAX_FILE_BYTES) {
    throw createBusinessError(400, 'CR_FILE_TOO_LARGE', 'O arquivo excede o limite de 10 MB.');
  }
  if (!String(file.originalname || '').toLowerCase().endsWith('.xlsx')) {
    throw createBusinessError(400, 'CR_FILE_FORMAT_INVALID', 'Envie somente o modelo .xlsx.');
  }
}

async function assertObraScope(user, obraId, dependencies) {
  if (!(await dependencies.usuarioPodeAcessarObra(user, obraId))) {
    throw createBusinessError(403, 'CR_OBRA_FORA_ESCOPO', 'Acesso negado para esta obra.');
  }
}

function serializePlanHeader(plan) {
  if (!plan) return null;
  const plain = asPlain(plan);
  return {
    id: Number(plain.id),
    obra_id: Number(plain.obra_id),
    versao: Number(plain.versao),
    situacao: plain.situacao,
    motivo_versao: plain.motivo_versao || null,
    total_micro: Number(plain.total_micro || 0),
    divergencia_macro_pct: plain.divergencia_macro_pct == null
      ? null
      : Number(plain.divergencia_macro_pct),
    publicado_por: plain.publicado_por ? Number(plain.publicado_por) : null,
    publicado_em: plain.publicado_em || null,
    createdAt: plain.createdAt || null,
    updatedAt: plain.updatedAt || null
  };
}

function serializeImport(importacao) {
  const plain = asPlain(importacao);
  return {
    id: Number(plain.id),
    obra_id: Number(plain.obra_id),
    plano_id: plain.plano_id ? Number(plain.plano_id) : null,
    arquivo_nome: plain.arquivo_nome,
    arquivo_hash: plain.arquivo_hash,
    linhas_total: Number(plain.linhas_total || 0),
    linhas_validas: Number(plain.linhas_validas || 0),
    linhas_rejeitadas: Number(plain.linhas_rejeitadas || 0),
    resultado: parseJson(plain.resultado_json, {}),
    usuario_id: Number(plain.usuario_id),
    usuario: plain.usuario ? {
      id: Number(plain.usuario.id),
      nome: plain.usuario.nome
    } : null,
    createdAt: plain.createdAt || null
  };
}

function serializeObra(obra) {
  const plain = asPlain(obra);
  return {
    id: Number(plain.id),
    codigo: plain.codigo || null,
    nome: plain.nome,
    cidade: plain.cidade || null,
    classificacao: plain.classificacao || null,
    tipo_centro_custo: plain.tipo_centro_custo || null,
    planilha_geral: plain.planilha_geral == null ? null : Number(plain.planilha_geral),
    margem_custo_esperada: plain.margem_custo_esperada == null
      ? null
      : Number(plain.margem_custo_esperada),
    empresa: plain.empresaGrupo ? {
      id: Number(plain.empresaGrupo.id),
      codigo: plain.empresaGrupo.codigo || null,
      nome: plain.empresaGrupo.nome || plain.empresaGrupo.razao_social || null
    } : null
  };
}

function serializeMacro(macro) {
  const plain = asPlain(macro);
  return {
    id: Number(plain.id),
    codigo: plain.codigo,
    descricao: plain.descricao || null,
    valor_orcado: Number(plain.valor_orcado || 0),
    somadora: Boolean(plain.somadora),
    apropriacao_pai_id: plain.apropriacao_pai_id ? Number(plain.apropriacao_pai_id) : null
  };
}

function serializePlanItems(items = []) {
  const plains = items.map(asPlain);
  const codeById = new Map(plains.map((item) => [Number(item.id), item.codigo]));
  return plains.map((item) => ({
    id: Number(item.id),
    plano_id: Number(item.plano_id),
    codigo: item.codigo,
    descricao: item.descricao,
    unidade: item.unidade || null,
    quantidade: Number(item.quantidade || 0),
    custo_unitario: Number(item.custo_unitario || 0),
    valor_total: Number(item.valor_total || 0),
    etapa_macro_codigo: item.etapa_macro_codigo || null,
    item_pai_id: item.item_pai_id ? Number(item.item_pai_id) : null,
    codigo_pai: item.item_pai_id ? codeById.get(Number(item.item_pai_id)) || null : null,
    somadora: Boolean(item.somadora),
    ordem: Number(item.ordem || 0),
    vinculos_macro: (item.vinculosMacro || []).map((vinculo) => ({
      apropriacao_id: Number(vinculo.apropriacao_id),
      apropriacao: vinculo.apropriacao ? serializeMacro(vinculo.apropriacao) : null
    }))
  }));
}

async function listarObrasNoEscopo(user, query = {}, overrides = {}) {
  const dependencies = getDependencies(overrides);
  const escopo = await dependencies.resolverEscopoObras(user);
  if (!escopo.todas && escopo.obraIds.length === 0) {
    return { items: [], total: 0 };
  }

  const where = {
    ativo: true,
    tipo_centro_custo: 'OBRA'
  };
  if (!escopo.todas) {
    where.id = { [Op.in]: escopo.obraIds };
  }

  const classificacao = normalizeCode(query.classificacao);
  if (['PUBLICA', 'PRIVADA'].includes(classificacao)) {
    where.classificacao = classificacao;
  }

  const search = normalizeSearch(query.q || query.busca);
  if (search) {
    where[Op.or] = [
      { codigo: { [Op.like]: `%${search}%` } },
      { nome: { [Op.like]: `%${search}%` } },
      { cidade: { [Op.like]: `%${search}%` } }
    ];
  }

  const obras = await dependencies.Obra.findAll({
    where,
    attributes: [
      'id',
      'codigo',
      'nome',
      'cidade',
      'classificacao',
      'tipo_centro_custo',
      'planilha_geral',
      'margem_custo_esperada',
      'empresa_grupo_id'
    ],
    include: [{
      model: dependencies.EmpresaGrupo,
      as: 'empresaGrupo',
      attributes: ['id', 'codigo', 'nome', 'razao_social'],
      required: false
    }],
    order: [['nome', 'ASC']]
  });

  const obraIds = obras.map((obra) => Number(obra.id));
  if (!obraIds.length) return { items: [], total: 0 };

  const selectedCompetencia = competenciaReferencia(query.competencia);
  const [plans, responsaveis, competencias, contratos] = await Promise.all([
    dependencies.CrPlanoObra.findAll({
      where: { obra_id: { [Op.in]: obraIds } },
      order: [['obra_id', 'ASC'], ['versao', 'DESC']]
    }),
    dependencies.CrResponsavelObra.findAll({
      where: {
        obra_id: { [Op.in]: obraIds },
        papel: 'RESPONSAVEL',
        ativo: true
      },
      include: [{
        model: dependencies.User,
        as: 'usuario',
        attributes: ['id', 'nome'],
        required: false
      }],
      order: [['vigencia_inicio', 'DESC']]
    }),
    dependencies.CrCompetencia.findAll({
      where: {
        obra_id: { [Op.in]: obraIds },
        competencia: selectedCompetencia
      }
    }),
    dependencies.Contrato.findAll({
      where: {
        obra_id: { [Op.in]: obraIds },
        ativo: true
      },
      attributes: ['id', 'obra_id', 'codigo', 'ref_contrato', 'valor_total'],
      order: [['obra_id', 'ASC'], ['id', 'ASC']]
    })
  ]);

  const planByObra = new Map();
  const publishedPlanByObra = new Map();
  plans.forEach((plan) => {
    const obraId = Number(plan.obra_id);
    if (!planByObra.has(obraId)) planByObra.set(obraId, serializePlanHeader(plan));
    if (plan.situacao === 'PUBLICADA' && !publishedPlanByObra.has(obraId)) {
      publishedPlanByObra.set(obraId, serializePlanHeader(plan));
    }
  });
  const responsavelByObra = new Map();
  responsaveis.forEach((responsavel) => {
    const plain = asPlain(responsavel);
    const obraId = Number(plain.obra_id);
    if (!responsavelByObra.has(obraId) && plain.usuario) {
      responsavelByObra.set(obraId, {
        id: Number(plain.usuario.id),
        nome: plain.usuario.nome
      });
    }
  });
  const competenciaByObra = new Map(
    competencias.map((competencia) => [
      Number(competencia.obra_id),
      {
        competencia: competencia.competencia,
        estado: competencia.estado
      }
    ])
  );
  const contratosByObra = new Map();
  contratos.forEach((contratoValue) => {
    const contrato = asPlain(contratoValue);
    const obraId = Number(contrato.obra_id);
    const current = contratosByObra.get(obraId) || {
      quantidade: 0,
      valor_total: 0,
      referencias: []
    };
    current.quantidade += 1;
    current.valor_total += Number(contrato.valor_total || 0);
    const referencia = contrato.ref_contrato || contrato.codigo;
    if (referencia) current.referencias.push(String(referencia));
    contratosByObra.set(obraId, current);
  });

  const items = obras.map((obra) => {
    const serialized = serializeObra(obra);
    const latestPlan = planByObra.get(serialized.id) || null;
    const publishedPlan = publishedPlanByObra.get(serialized.id) || null;
    const contractSummary = contratosByObra.get(serialized.id) || null;
    const competenciaContexto = competenciaByObra.get(serialized.id) || null;
    return {
      ...serialized,
      responsavel: responsavelByObra.get(serialized.id) || null,
      plano_atual: latestPlan,
      plano_publicado: publishedPlan,
      contrato: contractSummary ? {
        referencia: contractSummary.referencias[0] || null,
        referencias: contractSummary.referencias,
        quantidade: contractSummary.quantidade,
        valor_total: Math.round(contractSummary.valor_total * 100) / 100
      } : null,
      valor_orcado: Number(
        publishedPlan?.total_micro
        ?? latestPlan?.total_micro
        ?? serialized.planilha_geral
        ?? 0
      ),
      origem_valor_orcado: publishedPlan
        ? 'PLANO_PUBLICADO'
        : (latestPlan ? 'PLANO_RASCUNHO' : 'CADASTRO_OBRA'),
      situacao_orcamento: publishedPlan
        ? 'ORCAMENTO_PUBLICADO'
        : (latestPlan ? 'RASCUNHO' : 'PENDENTE'),
      competencia_atual: competenciaContexto,
      competencia_referencia: selectedCompetencia,
      reabertura_permitida: competenciaContexto?.estado === 'FINALIZADA'
        || prazoCompetenciaReferencia(selectedCompetencia) <= new Date()
    };
  });

  return { items, total: items.length };
}

async function findObra(obraId, dependencies, options = {}) {
  const obra = await dependencies.Obra.findByPk(obraId, {
    attributes: [
      'id',
      'codigo',
      'nome',
      'cidade',
      'classificacao',
      'planilha_geral',
      'margem_custo_esperada',
      'empresa_grupo_id'
    ],
    include: [{
      model: dependencies.EmpresaGrupo,
      as: 'empresaGrupo',
      attributes: ['id', 'codigo', 'nome', 'razao_social'],
      required: false
    }],
    transaction: options.transaction,
    lock: options.lock
  });
  if (!obra) {
    throw createBusinessError(404, 'CR_OBRA_NOT_FOUND', 'Obra nao encontrada.');
  }
  return obra;
}

async function obterPlanoObra(user, obraIdValue, query = {}, overrides = {}) {
  const dependencies = getDependencies(overrides);
  const obraId = normalizePositiveInteger(obraIdValue, 'Obra');
  await assertObraScope(user, obraId, dependencies);
  const obra = await findObra(obraId, dependencies);

  const [plans, macros, imports] = await Promise.all([
    dependencies.CrPlanoObra.findAll({
      where: { obra_id: obraId },
      order: [['versao', 'DESC']]
    }),
    dependencies.Apropriacao.findAll({
      where: { obra_id: obraId, ativo: true },
      attributes: [
        'id',
        'codigo',
        'descricao',
        'valor_orcado',
        'somadora',
        'apropriacao_pai_id'
      ],
      order: [['codigo', 'ASC']]
    }),
    dependencies.CrImportacao.findAll({
      where: { obra_id: obraId },
      include: [{
        model: dependencies.User,
        as: 'usuario',
        attributes: ['id', 'nome'],
        required: false
      }],
      order: [['createdAt', 'DESC']],
      limit: 50
    })
  ]);

  const selectedPlanId = Number(query.plano_id || query.planoId);
  let selectedPlan = Number.isInteger(selectedPlanId) && selectedPlanId > 0
    ? plans.find((plan) => Number(plan.id) === selectedPlanId)
    : null;
  if (!selectedPlan) {
    selectedPlan = plans[0] || null;
  }

  let items = [];
  if (selectedPlan) {
    items = await dependencies.CrPlanoItem.findAll({
      where: { plano_id: selectedPlan.id },
      include: [{
        model: dependencies.CrPlanoMacroVinculo,
        as: 'vinculosMacro',
        required: false,
        include: [{
          model: dependencies.Apropriacao,
          as: 'apropriacao',
          attributes: [
            'id',
            'codigo',
            'descricao',
            'valor_orcado',
            'somadora',
            'apropriacao_pai_id'
          ],
          required: false
        }]
      }],
      order: [['ordem', 'ASC'], ['codigo', 'ASC']]
    });
  }

  return {
    obra: serializeObra(obra),
    planos: plans.map(serializePlanHeader),
    plano_atual: selectedPlan ? {
      ...serializePlanHeader(selectedPlan),
      itens: serializePlanItems(items)
    } : null,
    macros: macros.map(serializeMacro),
    importacoes: imports.map(serializeImport),
    configuracao: {
      tolerancia_divergencia_pct: DIVERGENCE_TOLERANCE_PCT
    }
  };
}

async function gerarModeloPlanoMicro(user, obraIdValue, overrides = {}) {
  const dependencies = getDependencies(overrides);
  const obraId = normalizePositiveInteger(obraIdValue, 'Obra');
  await assertObraScope(user, obraId, dependencies);
  const [obra, macros] = await Promise.all([
    findObra(obraId, dependencies),
    dependencies.Apropriacao.findAll({
      where: { obra_id: obraId, ativo: true },
      attributes: ['codigo', 'descricao', 'valor_orcado', 'somadora'],
      order: [['codigo', 'ASC']]
    })
  ]);

  return createWorkbookBuffer([
    {
      name: 'ESTRUTURA_MICRO',
      rows: [MODEL_COLUMNS],
      columns: [
        { width: 18 },
        { width: 46 },
        { width: 14 },
        { width: 16 },
        { width: 18 },
        { width: 24 },
        { width: 18 }
      ]
    },
    {
      name: 'MACRO_REFERENCIA',
      rows: [
        ['codigo', 'descricao', 'valor_orcado', 'somadora'],
        ...macros.map((macro) => [
          macro.codigo,
          macro.descricao || '',
          Number(macro.valor_orcado || 0),
          macro.somadora ? 'SIM' : 'NAO'
        ])
      ],
      columns: [
        { width: 22 },
        { width: 50 },
        { width: 18 },
        { width: 12 }
      ]
    },
    {
      name: 'INSTRUCOES',
      rows: [
        ['Obra', `${obra.codigo || obra.id} - ${obra.nome}`],
        ['Regra', 'Preencha somente a aba ESTRUTURA_MICRO.'],
        ['Codigos', 'codigo deve ser unico. codigo_pai deve existir na mesma planilha.'],
        ['Valores', 'quantidade e custo_unitario devem ser numeros maiores ou iguais a zero.'],
        ['Macro', 'etapa_macro_codigo deve usar um codigo da aba MACRO_REFERENCIA.'],
        ['Versionamento', 'Cada arquivo novo cria uma versao em rascunho e nunca altera apropriacoes.']
      ],
      columns: [{ width: 20 }, { width: 90 }]
    }
  ]);
}

async function validarArquivoPlanoMicro(user, obraIdValue, file, overrides = {}) {
  const dependencies = getDependencies(overrides);
  const obraId = normalizePositiveInteger(obraIdValue, 'Obra');
  await assertObraScope(user, obraId, dependencies);
  assertSpreadsheetFile(file);

  const [obra, macros, arrayRows] = await Promise.all([
    findObra(obraId, dependencies),
    dependencies.Apropriacao.findAll({
      where: { obra_id: obraId, ativo: true },
      attributes: ['id', 'codigo', 'descricao', 'valor_orcado', 'somadora'],
      order: [['codigo', 'ASC']]
    }),
    sheetToArrayRows(file.buffer, {
      filename: file.originalname,
      raw: true
    })
  ]);

  if (arrayRows.length - 1 > MAX_ROWS) {
    throw createBusinessError(
      400,
      'CR_FILE_ROWS_LIMIT',
      `A planilha excede o limite de ${MAX_ROWS} linhas.`
    );
  }

  const validation = validatePlanoMicroRows(arrayRows, macros.map(asPlain));
  return {
    obra: serializeObra(obra),
    arquivo: {
      nome: String(file.originalname || '').slice(0, 255),
      tamanho: file.buffer.length,
      hash: crypto.createHash('sha256').update(file.buffer).digest('hex')
    },
    ...validation
  };
}

async function resolveExistingImportResult(importacao, dependencies, options = {}) {
  const plan = importacao?.plano_id
    ? await dependencies.CrPlanoObra.findByPk(importacao.plano_id, {
      transaction: options.transaction
    })
    : null;
  return {
    idempotente: true,
    importacao: serializeImport(importacao),
    plano: serializePlanHeader(plan)
  };
}

async function importarPlanoMicro(user, obraIdValue, file, payload = {}, overrides = {}) {
  const dependencies = getDependencies(overrides);
  const obraId = normalizePositiveInteger(obraIdValue, 'Obra');
  const validation = await validarArquivoPlanoMicro(user, obraId, file, overrides);
  if (validation.errors.length > 0) {
    throw createBusinessError(
      422,
      'CR_IMPORT_VALIDATION_FAILED',
      'A planilha possui erros. Corrija as linhas rejeitadas antes de importar.',
      validation
    );
  }

  const reason = normalizeReason(payload.motivo_versao);
  let result;

  try {
    result = await dependencies.sequelize.transaction(async (transaction) => {
      await dependencies.Obra.findByPk(obraId, {
        attributes: ['id'],
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      const existingImport = await dependencies.CrImportacao.findOne({
        where: {
          obra_id: obraId,
          arquivo_hash: validation.arquivo.hash
        },
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (existingImport) {
        return resolveExistingImportResult(existingImport, dependencies, { transaction });
      }

      const latestPlan = await dependencies.CrPlanoObra.findOne({
        where: { obra_id: obraId },
        order: [['versao', 'DESC']],
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (latestPlan && !reason) {
        throw createBusinessError(
          422,
          'CR_VERSION_REASON_REQUIRED',
          'Informe o motivo da nova versao para reimportar a planilha.'
        );
      }

      const plan = await dependencies.CrPlanoObra.create({
        obra_id: obraId,
        versao: Number(latestPlan?.versao || 0) + 1,
        situacao: 'RASCUNHO',
        motivo_versao: reason || null,
        total_micro: validation.summary.total_micro,
        divergencia_macro_pct: validation.summary.divergencia_macro_pct
      }, { transaction });

      const validRows = validation.rows.filter((row) => row.errors.length === 0);
      await dependencies.CrPlanoItem.bulkCreate(validRows.map((row, index) => ({
        plano_id: plan.id,
        codigo: row.codigo,
        descricao: row.descricao,
        unidade: row.unidade || null,
        quantidade: row.quantidade,
        custo_unitario: row.custo_unitario,
        valor_total: row.valor_total,
        etapa_macro_codigo: row.etapa_macro_codigo || null,
        item_pai_id: null,
        somadora: row.somadora,
        ordem: index + 1
      })), { transaction });

      const createdItems = await dependencies.CrPlanoItem.findAll({
        where: { plano_id: plan.id },
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      const itemByCode = new Map(createdItems.map((item) => [item.codigo, item]));

      for (const row of validRows) {
        if (!row.codigo_pai) continue;
        const item = itemByCode.get(row.codigo);
        const parent = itemByCode.get(row.codigo_pai);
        if (item && parent) {
          await dependencies.CrPlanoItem.update(
            { item_pai_id: parent.id },
            { where: { id: item.id }, transaction }
          );
        }
      }

      const links = validRows
        .filter((row) => row.apropriacao_id)
        .map((row) => ({
          plano_item_id: itemByCode.get(row.codigo)?.id,
          apropriacao_id: row.apropriacao_id,
          observacao: 'Vinculo criado pela importacao da planilha micro'
        }))
        .filter((link) => link.plano_item_id);
      if (links.length) {
        await dependencies.CrPlanoMacroVinculo.bulkCreate(links, { transaction });
      }

      const importacao = await dependencies.CrImportacao.create({
        obra_id: obraId,
        plano_id: plan.id,
        arquivo_nome: validation.arquivo.nome,
        arquivo_hash: validation.arquivo.hash,
        linhas_total: validation.summary.linhas_total,
        linhas_validas: validation.summary.linhas_validas,
        linhas_rejeitadas: validation.summary.linhas_rejeitadas,
        resultado_json: {
          total_micro: validation.summary.total_micro,
          total_macro_referencia: validation.summary.total_macro_referencia,
          divergencia_macro_pct: validation.summary.divergencia_macro_pct,
          avisos: validation.warnings
        },
        usuario_id: user.id
      }, { transaction });

      await dependencies.CrAuditoria.create({
        obra_id: obraId,
        usuario_id: user.id,
        evento: 'PLANO_MICRO_IMPORTADO',
        descricao: `Plano micro v${plan.versao} importado como rascunho`,
        payload_json: {
          plano_id: plan.id,
          versao: plan.versao,
          importacao_id: importacao.id,
          arquivo_hash: validation.arquivo.hash,
          linhas_total: validation.summary.linhas_total,
          total_micro: validation.summary.total_micro
        },
        origem: 'web'
      }, { transaction });

      return {
        idempotente: false,
        importacao: serializeImport(importacao),
        plano: serializePlanHeader(plan)
      };
    });
  } catch (error) {
    if (error?.name !== 'SequelizeUniqueConstraintError') throw error;
    const existingImport = await dependencies.CrImportacao.findOne({
      where: {
        obra_id: obraId,
        arquivo_hash: validation.arquivo.hash
      }
    });
    if (!existingImport) throw error;
    result = await resolveExistingImportResult(existingImport, dependencies);
  }

  return result;
}

async function resolverObraIdPorPlano(planoIdValue, overrides = {}) {
  const dependencies = getDependencies(overrides);
  const planoId = normalizePositiveInteger(planoIdValue, 'Plano');
  const plan = await dependencies.CrPlanoObra.findByPk(planoId, {
    attributes: ['id', 'obra_id']
  });
  return plan ? Number(plan.obra_id) : null;
}

async function publicarPlanoMicro(user, planoIdValue, payload = {}, overrides = {}) {
  const dependencies = getDependencies(overrides);
  const planoId = normalizePositiveInteger(planoIdValue, 'Plano');
  const initialPlan = await dependencies.CrPlanoObra.findByPk(planoId, {
    attributes: ['id', 'obra_id']
  });
  if (!initialPlan) {
    throw createBusinessError(404, 'CR_PLAN_NOT_FOUND', 'Versao do plano nao encontrada.');
  }
  const obraId = Number(initialPlan.obra_id);
  await assertObraScope(user, obraId, dependencies);
  const justification = normalizeReason(payload.justificativa_divergencia || payload.justificativa);

  const result = await dependencies.sequelize.transaction(async (transaction) => {
    await dependencies.Obra.findByPk(obraId, {
      attributes: ['id'],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const plan = await dependencies.CrPlanoObra.findByPk(planoId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!plan) {
      throw createBusinessError(404, 'CR_PLAN_NOT_FOUND', 'Versao do plano nao encontrada.');
    }
    if (plan.situacao === 'PUBLICADA') {
      return { idempotente: true, plano: serializePlanHeader(plan) };
    }
    if (plan.situacao !== 'RASCUNHO') {
      throw createBusinessError(
        409,
        'CR_PLAN_NOT_DRAFT',
        'Somente uma versao em rascunho pode ser publicada.'
      );
    }

    const items = await dependencies.CrPlanoItem.findAll({
      where: { plano_id: planoId },
      attributes: ['id', 'somadora'],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!items.length) {
      throw createBusinessError(422, 'CR_PLAN_EMPTY', 'O plano nao possui itens para publicar.');
    }
    const leafIds = items.filter((item) => !item.somadora).map((item) => Number(item.id));
    const linkedRows = leafIds.length
      ? await dependencies.CrPlanoMacroVinculo.findAll({
        where: { plano_item_id: { [Op.in]: leafIds } },
        attributes: ['plano_item_id'],
        transaction
      })
      : [];
    const linkedIds = new Set(linkedRows.map((item) => Number(item.plano_item_id)));
    const missingLinks = leafIds.filter((id) => !linkedIds.has(id));
    if (missingLinks.length) {
      throw createBusinessError(
        422,
        'CR_MACRO_LINK_REQUIRED',
        'Todos os itens micro de custo precisam estar vinculados a uma etapa macro antes da publicacao.',
        { itens_sem_vinculo: missingLinks.length }
      );
    }

    const divergence = Math.abs(Number(plan.divergencia_macro_pct || 0));
    if (divergence > DIVERGENCE_TOLERANCE_PCT && !justification) {
      throw createBusinessError(
        422,
        'CR_DIVERGENCE_JUSTIFICATION_REQUIRED',
        `A divergencia excede ${DIVERGENCE_TOLERANCE_PCT}%. Informe uma justificativa para publicar.`,
        {
          divergencia_macro_pct: Number(plan.divergencia_macro_pct),
          tolerancia_pct: DIVERGENCE_TOLERANCE_PCT
        }
      );
    }

    await dependencies.CrPlanoObra.update({
      situacao: 'SUBSTITUIDA'
    }, {
      where: {
        obra_id: obraId,
        situacao: 'PUBLICADA',
        id: { [Op.ne]: planoId }
      },
      transaction
    });

    const publishedAt = new Date();
    await plan.update({
      situacao: 'PUBLICADA',
      publicado_por: user.id,
      publicado_em: publishedAt
    }, { transaction });

    await dependencies.CrAuditoria.create({
      obra_id: obraId,
      usuario_id: user.id,
      evento: 'PLANO_MICRO_PUBLICADO',
      descricao: `Plano micro v${plan.versao} publicado`,
      payload_json: {
        plano_id: plan.id,
        versao: plan.versao,
        total_micro: Number(plan.total_micro || 0),
        divergencia_macro_pct: plan.divergencia_macro_pct == null
          ? null
          : Number(plan.divergencia_macro_pct),
        justificativa_divergencia: justification || null
      },
      origem: 'web'
    }, { transaction });

    return { idempotente: false, plano: serializePlanHeader(plan) };
  });

  return result;
}

module.exports = {
  BUSINESS_ERROR_NAME,
  DIVERGENCE_TOLERANCE_PCT,
  MAX_FILE_BYTES,
  MAX_ROWS,
  createBusinessError,
  gerarModeloPlanoMicro,
  importarPlanoMicro,
  listarObrasNoEscopo,
  obterPlanoObra,
  publicarPlanoMicro,
  resolverObraIdPorPlano,
  serializePlanItems,
  validarArquivoPlanoMicro
};
