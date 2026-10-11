const { Op, fn, col, literal } = require('sequelize');
const {
  sequelize,
  Obra,
  Parceiro,
  ProvisaoCategoriaMacro,
  ProvisaoFinanceira,
  ProvisaoFinanceiraAnexo,
  ProvisaoFinanceiraHistorico,
  User
} = require('../models');
const { getPresignedUrl, uploadToS3 } = require('./s3');
const { sanitizeFileNameForStorage } = require('../utils/fileName');
const {
  canCreateProvisoes,
  canEditProvisoes,
  canManageProvisoesCategorias,
  canManageProvisoesStatus,
  canViewProvisoesDashboard,
  getUserObraScopeIds,
  isBusinessAdmin
} = require('./authorizationService');
const { gerarCodigoProvisionamentoFinanceiro } = require('./provisaoFinanceira/gerarCodigo');
const { registrarHistoricoProvisionamento } = require('./provisaoFinanceira/historico');
const { obterProvisionamentoFluxoConfig } = require('./provisionamentoFluxoConfigService');

const STATUS_PROVISAO = ['previsto', 'em_analise', 'aprovado', 'cancelado', 'realizado'];
const STATUS_ABERTOS = ['previsto', 'em_analise', 'aprovado'];
const STATUS_PENDENTES = ['previsto', 'em_analise'];
const PRIORIDADES = ['baixa', 'media', 'alta', 'critica'];
const MAX_LIST_LIMIT = 200;

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeText(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function normalizeDateOnly(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function normalizeAmount(value) {
  if (value == null || value === '') return null;
  const raw = String(value).trim().replace(/[R$\s]/gi, '');
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return Number(parsed.toFixed(2));
}

function parseInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parsePage(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return STATUS_PROVISAO.includes(normalized) ? normalized : null;
}

function normalizePriority(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return PRIORIDADES.includes(normalized) ? normalized : null;
}

function normalizeSortField(value) {
  const map = {
    codigo: 'codigo',
    obra: 'obra',
    categoria_macro: 'categoria_macro',
    descricao: 'descricao',
    fornecedor_texto: 'fornecedor_texto',
    valor_previsto: 'valor_previsto',
    data_prevista_desembolso: 'data_prevista_desembolso',
    createdat: 'createdAt',
    usuario_criacao: 'usuario_criacao'
  };

  return map[String(value || '').trim().toLowerCase()] || 'data_prevista_desembolso';
}

function normalizeSortDirection(value) {
  return String(value || '').trim().toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
}

function combineWhere(...conditions) {
  const valid = conditions.filter((item) => item && Object.keys(item).length > 0);
  if (!valid.length) return {};
  if (valid.length === 1) return valid[0];
  return { [Op.and]: valid };
}

function toPlainUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    nome: user.nome,
    email: user.email,
    perfil: user.perfil
  };
}

function formatDateOnly(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateOnly(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function addDays(date, amount) {
  const base = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  base.setDate(base.getDate() + amount);
  return base;
}

function startOfWeek(date) {
  const base = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekDay = base.getDay();
  const diff = weekDay === 0 ? -6 : 1 - weekDay;
  base.setDate(base.getDate() + diff);
  return base;
}

function formatWeekLabel(date) {
  const start = startOfWeek(date);
  const end = addDays(start, 6);
  return `${String(start.getDate()).padStart(2, '0')}/${String(start.getMonth() + 1).padStart(2, '0')} - ${String(end.getDate()).padStart(2, '0')}/${String(end.getMonth() + 1).padStart(2, '0')}`;
}

async function getScopedObraIds(user) {
  if (isBusinessAdmin(user)) {
    return null;
  }

  return getUserObraScopeIds(user);
}

async function listScopedObras(user) {
  const obraIds = await getScopedObraIds(user);
  const where = {};

  if (Array.isArray(obraIds)) {
    if (!obraIds.length) {
      return [];
    }
    where.id = { [Op.in]: obraIds };
  }

  const obras = await Obra.findAll({
    where,
    attributes: ['id', 'codigo', 'nome', 'ativo', 'tipo_centro_custo'],
    order: [['nome', 'ASC']]
  });

  return obras.map((obra) => ({
    id: obra.id,
    codigo: obra.codigo,
    nome: obra.nome,
    tipo_centro_custo: obra.tipo_centro_custo,
    ativo: obra.ativo !== false
  }));
}

async function listCriadoresFiltro(user) {
  const obraIds = await getScopedObraIds(user);
  const where = {};

  if (Array.isArray(obraIds)) {
    if (!obraIds.length) {
      return [];
    }
    where.obra_id = { [Op.in]: obraIds };
  }

  const registros = await ProvisaoFinanceira.findAll({
    where,
    attributes: [[fn('DISTINCT', col('usuario_criacao_id')), 'usuario_criacao_id']],
    raw: true
  });

  const ids = registros
    .map((item) => Number(item.usuario_criacao_id))
    .filter((item) => Number.isInteger(item) && item > 0);

  if (!ids.length) {
    return [];
  }

  const usuarios = await User.findAll({
    where: { id: { [Op.in]: ids } },
    attributes: ['id', 'nome', 'email'],
    order: [['nome', 'ASC']]
  });

  return usuarios.map((usuario) => ({
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email
  }));
}

async function assertObraScopeAccess(user, obraId) {
  const obraIds = await getScopedObraIds(user);
  if (obraIds === null) {
    return;
  }

  const normalized = Number(obraId);
  if (!obraIds.includes(normalized)) {
    throw createHttpError(403, 'Acesso negado para esta obra no modulo de provisionamento.');
  }
}

async function validateObra(obraId, user, transaction) {
  await assertObraScopeAccess(user, obraId);

  const obra = await Obra.findByPk(obraId, {
    attributes: ['id', 'codigo', 'nome'],
    transaction
  });

  if (!obra) {
    throw createHttpError(400, 'Obra invalida.');
  }

  if (!String(obra.codigo || '').trim()) {
    throw createHttpError(400, 'A obra precisa ter codigo para gerar provisao.');
  }

  return obra;
}

async function resolveCategoriaMacro({ categoria_macro_id, item_macro, transaction }) {
  if (item_macro) {
    const normalizedName = String(item_macro).trim().toLowerCase();
    let categoria = await ProvisaoCategoriaMacro.findOne({
      where: sequelize.where(fn('LOWER', col('nome')), normalizedName),
      transaction
    });

    if (categoria) {
      if (categoria.ativo === false) {
        await categoria.update({ ativo: true }, { transaction });
      }
      return categoria;
    }

    categoria = await ProvisaoCategoriaMacro.create({
      nome: String(item_macro).trim(),
      ativo: true
    }, { transaction });

    return categoria;
  }

  if (!categoria_macro_id) {
    throw createHttpError(400, 'Informe a categoria macro ou um item macro valido.');
  }

  const categoria = await ProvisaoCategoriaMacro.findByPk(categoria_macro_id, { transaction });
  if (!categoria) {
    throw createHttpError(400, 'Categoria macro invalida.');
  }
  if (categoria.ativo === false) {
    throw createHttpError(400, 'Categoria macro inativa.');
  }

  return categoria;
}

async function resolveFornecedor({ fornecedor_id, fornecedor_texto, transaction }) {
  const parceiroId = parseInteger(fornecedor_id);
  if (!parceiroId) {
    return {
      fornecedor_id: null,
      fornecedor_texto: normalizeText(fornecedor_texto)
    };
  }

  const parceiro = await Parceiro.findByPk(parceiroId, {
    attributes: ['id', 'nome', 'cpf_cnpj'],
    transaction
  });

  if (!parceiro) {
    throw createHttpError(400, 'Fornecedor invalido.');
  }

  return {
    fornecedor_id: parceiro.id,
    fornecedor_texto: normalizeText(fornecedor_texto) || parceiro.nome
  };
}

function serializeHistorico(item) {
  return {
    id: item.id,
    acao: item.acao,
    status_anterior: item.status_anterior,
    status_novo: item.status_novo,
    descricao: item.descricao,
    comentario: item.comentario,
    dados_antes_json: item.dados_antes_json,
    dados_depois_json: item.dados_depois_json,
    metadata_json: item.metadata_json,
    createdAt: item.createdAt,
    usuario: toPlainUser(item.usuario)
  };
}

function getIncludesListagem() {
  return [
    { model: Obra, as: 'obra', attributes: ['id', 'codigo', 'nome', 'ativo'] },
    { model: ProvisaoCategoriaMacro, as: 'categoriaMacro', attributes: ['id', 'nome', 'ativo'] },
    { model: User, as: 'usuarioCriacao', attributes: ['id', 'nome', 'email', 'perfil'] }
  ];
}

function getOrder(sortBy, sortDir) {
  switch (sortBy) {
    case 'codigo':
      return [
        [literal("CAST(SUBSTRING_INDEX(`ProvisaoFinanceira`.`codigo`, '-', -1) AS UNSIGNED)"), sortDir],
        ['codigo', sortDir],
        ['createdAt', 'DESC']
      ];
    case 'obra':
      return [[{ model: Obra, as: 'obra' }, 'nome', sortDir], ['createdAt', 'DESC']];
    case 'categoria_macro':
      return [[{ model: ProvisaoCategoriaMacro, as: 'categoriaMacro' }, 'nome', sortDir], ['createdAt', 'DESC']];
    case 'descricao':
      return [['descricao', sortDir], ['createdAt', 'DESC']];
    case 'fornecedor_texto':
      return [['fornecedor_texto', sortDir], ['createdAt', 'DESC']];
    case 'valor_previsto':
      return [['valor_previsto', sortDir], ['createdAt', 'DESC']];
    case 'usuario_criacao':
      return [[{ model: User, as: 'usuarioCriacao' }, 'nome', sortDir], ['createdAt', 'DESC']];
    case 'createdAt':
      return [['createdAt', sortDir]];
    case 'data_prevista_desembolso':
    default:
      return [['data_prevista_desembolso', sortDir], ['createdAt', 'DESC']];
  }
}

async function findProvisionamentoScoped(id, user, options = {}) {
  const provisionamento = await ProvisaoFinanceira.findByPk(id, {
    include: options.include || [],
    transaction: options.transaction
  });

  if (!provisionamento) {
    throw createHttpError(404, 'Provisao financeira nao encontrada.');
  }

  await assertObraScopeAccess(user, provisionamento.obra_id);
  return provisionamento;
}

async function listCategoriasProvisionamento(query, user) {
  const includeInactive = String(query.incluir_inativas || '').trim() === '1';
  const where = {};

  if (!includeInactive || !(await canManageProvisoesCategorias(user))) {
    where.ativo = true;
  }

  return ProvisaoCategoriaMacro.findAll({
    where,
    order: [['ordem_exibicao', 'ASC'], ['nome', 'ASC']]
  });
}

async function createCategoriaProvisionamento(payload) {
  const nome = normalizeText(payload.nome);
  if (!nome) {
    throw createHttpError(400, 'Informe o nome da categoria macro.');
  }

  const existente = await ProvisaoCategoriaMacro.findOne({
    where: sequelize.where(fn('LOWER', col('nome')), nome.toLowerCase())
  });
  if (existente) {
    throw createHttpError(400, 'Ja existe categoria macro com esse nome.');
  }

  return ProvisaoCategoriaMacro.create({
    nome,
    descricao: normalizeText(payload.descricao),
    ordem_exibicao: parseInteger(payload.ordem_exibicao),
    ativo: payload.ativo === false ? false : true
  });
}

async function updateCategoriaProvisionamento(id, payload) {
  const categoria = await ProvisaoCategoriaMacro.findByPk(id);
  if (!categoria) {
    throw createHttpError(404, 'Categoria macro nao encontrada.');
  }

  const nome = Object.prototype.hasOwnProperty.call(payload, 'nome')
    ? normalizeText(payload.nome)
    : categoria.nome;
  if (!nome) {
    throw createHttpError(400, 'Informe o nome da categoria macro.');
  }

  const existente = await ProvisaoCategoriaMacro.findOne({
    where: {
      id: { [Op.ne]: categoria.id },
      [Op.and]: [sequelize.where(fn('LOWER', col('nome')), nome.toLowerCase())]
    }
  });
  if (existente) {
    throw createHttpError(400, 'Ja existe categoria macro com esse nome.');
  }

  await categoria.update({
    nome,
    descricao: Object.prototype.hasOwnProperty.call(payload, 'descricao')
      ? normalizeText(payload.descricao)
      : categoria.descricao,
    ordem_exibicao: Object.prototype.hasOwnProperty.call(payload, 'ordem_exibicao')
      ? parseInteger(payload.ordem_exibicao)
      : categoria.ordem_exibicao,
    ativo: Object.prototype.hasOwnProperty.call(payload, 'ativo')
      ? Boolean(payload.ativo)
      : categoria.ativo
  });

  return categoria;
}

async function updateCategoriaProvisionamentoStatus(id, ativo) {
  const categoria = await ProvisaoCategoriaMacro.findByPk(id);
  if (!categoria) {
    throw createHttpError(404, 'Categoria macro nao encontrada.');
  }

  await categoria.update({ ativo: Boolean(ativo) });
  return categoria;
}

async function getProvisionamentoContext(user) {
  const [obras, criadoresFiltro, configuracaoFluxo] = await Promise.all([
    listScopedObras(user),
    listCriadoresFiltro(user),
    obterProvisionamentoFluxoConfig()
  ]);

  return {
    modulo: 'provisionamento-financeiro',
    permissoes: {
      superadmin: isBusinessAdmin(user),
      pode_criar: await canCreateProvisoes(user),
      pode_editar: await canEditProvisoes(user),
      pode_dashboard: await canViewProvisoesDashboard(user),
      pode_categorias: await canManageProvisoesCategorias(user),
      pode_status: await canManageProvisoesStatus(user)
    },
    obras_acesso: obras,
    obras_criacao: obras,
    criadores_filtro: criadoresFiltro,
    prioridades_disponiveis: PRIORIDADES,
    status_disponiveis: STATUS_PROVISAO,
    configuracao_fluxo: configuracaoFluxo
  };
}

async function montarDetalheProvisionamento(id, user, options = {}) {
  const provisionamento = await findProvisionamentoScoped(id, user, {
    include: [
      ...getIncludesListagem(),
      { model: User, as: 'usuarioAtualizacao', attributes: ['id', 'nome', 'email', 'perfil'] },
      { model: User, as: 'aprovadoPor', attributes: ['id', 'nome', 'email', 'perfil'] },
      { model: User, as: 'canceladoPor', attributes: ['id', 'nome', 'email', 'perfil'] },
      { model: Parceiro, as: 'fornecedor', attributes: ['id', 'nome', 'cpf_cnpj'] }
    ],
    transaction: options.transaction
  });

  const [historicos, anexos] = await Promise.all([
    ProvisaoFinanceiraHistorico.findAll({
      where: { provisao_financeira_id: id },
      include: [{ model: User, as: 'usuario', attributes: ['id', 'nome', 'email', 'perfil'] }],
      order: [['createdAt', 'DESC']],
      transaction: options.transaction
    }),
    ProvisaoFinanceiraAnexo.findAll({
      where: { provisao_financeira_id: id },
      include: [{ model: User, as: 'uploadUser', attributes: ['id', 'nome', 'email', 'perfil'] }],
      order: [['createdAt', 'DESC']],
      transaction: options.transaction
    })
  ]);

  const json = provisionamento.toJSON();
  json.historicos = historicos.map(serializeHistorico);
  json.anexos = anexos.map((anexo) => ({
    ...anexo.toJSON(),
    uploadUser: toPlainUser(anexo.uploadUser)
  }));
  return json;
}

async function construirConsultaListagem(query, user) {
  const where = {};
  const obraIds = await getScopedObraIds(user);
  if (Array.isArray(obraIds)) {
    if (!obraIds.length) {
      return { empty: true, where: {}, order: getOrder('data_prevista_desembolso', 'DESC') };
    }
    where.obra_id = { [Op.in]: obraIds };
  }

  const obraId = parseInteger(query.obra_id);
  const categoriaId = parseInteger(query.categoria_macro_id);
  const criadorId = parseInteger(query.usuario_criacao_id);
  const status = normalizeStatus(query.status);
  const prioridade = normalizePriority(query.prioridade);
  const busca = normalizeText(query.busca);
  const fornecedor = normalizeText(query.fornecedor);
  const dataInicial = normalizeDateOnly(query.data_inicial);
  const dataFinal = normalizeDateOnly(query.data_final);
  const valorMinimo = normalizeAmount(query.valor_minimo);
  const valorMaximo = normalizeAmount(query.valor_maximo);
  const sortBy = normalizeSortField(query.sort_by);
  const sortDir = normalizeSortDirection(query.sort_dir);

  if (obraId) {
    await assertObraScopeAccess(user, obraId);
    where.obra_id = obraId;
  }

  if (categoriaId) where.categoria_macro_id = categoriaId;
  if (criadorId) where.usuario_criacao_id = criadorId;
  if (status) where.status = status;
  if (prioridade) where.prioridade = prioridade;

  if (dataInicial || dataFinal) {
    where.data_prevista_desembolso = {};
    if (dataInicial) where.data_prevista_desembolso[Op.gte] = dataInicial;
    if (dataFinal) where.data_prevista_desembolso[Op.lte] = dataFinal;
  }

  if (valorMinimo != null || valorMaximo != null) {
    where.valor_previsto = {};
    if (valorMinimo != null) where.valor_previsto[Op.gte] = valorMinimo;
    if (valorMaximo != null) where.valor_previsto[Op.lte] = valorMaximo;
  }

  const searchBlocks = [];
  if (busca) {
    searchBlocks.push(
      { codigo: { [Op.like]: `%${busca}%` } },
      { descricao: { [Op.like]: `%${busca}%` } },
      { fornecedor_texto: { [Op.like]: `%${busca}%` } }
    );
  }
  if (fornecedor) {
    searchBlocks.push({ fornecedor_texto: { [Op.like]: `%${fornecedor}%` } });
  }
  if (searchBlocks.length) {
    where[Op.and] = [
      ...(Array.isArray(where[Op.and]) ? where[Op.and] : []),
      { [Op.or]: searchBlocks }
    ];
  }

  return {
    empty: false,
    where,
    order: getOrder(sortBy, sortDir)
  };
}

async function listProvisionamentos(query, user) {
  const page = parsePage(query.page, 1);
  const limit = Math.min(parsePage(query.limit, 25), MAX_LIST_LIMIT);
  const offset = (page - 1) * limit;
  const consulta = await construirConsultaListagem(query, user);

  if (consulta.empty) {
    return {
      items: [],
      meta: { page, limit, total: 0, pages: 0 },
      resumo: { total_registros_filtrados: 0, valor_total_filtrado: 0 }
    };
  }

  const { rows, count } = await ProvisaoFinanceira.findAndCountAll({
    where: consulta.where,
    include: getIncludesListagem(),
    order: consulta.order,
    limit,
    offset,
    distinct: true
  });

  const totalValor = await ProvisaoFinanceira.sum('valor_previsto', {
    where: consulta.where
  });

  return {
    items: rows,
    meta: {
      page,
      limit,
      total: count,
      pages: count > 0 ? Math.ceil(count / limit) : 0
    },
    resumo: {
      total_registros_filtrados: count,
      valor_total_filtrado: Number(totalValor || 0)
    }
  };
}

async function getProvisionamentoById(id, user) {
  return montarDetalheProvisionamento(id, user);
}

async function createProvisionamento(payload, user) {
  const transaction = await sequelize.transaction();

  try {
    const obraId = parseInteger(payload.obra_id);
    const dataPrevista = normalizeDateOnly(payload.data_prevista_desembolso);
    const descricao = normalizeText(payload.descricao);
    const valorPrevisto = normalizeAmount(payload.valor_previsto);
    const comentario = normalizeText(payload.comentario);
    const prioridade = normalizePriority(payload.prioridade);

    if (!obraId) throw createHttpError(400, 'Obra e obrigatoria.');
    if (!dataPrevista) throw createHttpError(400, 'Data prevista de desembolso e obrigatoria.');
    if (!descricao) throw createHttpError(400, 'Descricao e obrigatoria.');
    if (valorPrevisto == null || valorPrevisto <= 0) throw createHttpError(400, 'Informe um valor previsto maior que zero.');

    await validateObra(obraId, user, transaction);
    const categoria = await resolveCategoriaMacro({
      categoria_macro_id: parseInteger(payload.categoria_macro_id),
      item_macro: normalizeText(payload.item_macro),
      transaction
    });
    const fornecedor = await resolveFornecedor({
      fornecedor_id: payload.fornecedor_id,
      fornecedor_texto: payload.fornecedor_texto,
      transaction
    });
    const codigo = await gerarCodigoProvisionamentoFinanceiro({ obraId, transaction });

    const provisionamento = await ProvisaoFinanceira.create({
      codigo,
      obra_id: obraId,
      categoria_macro_id: categoria.id,
      descricao,
      fornecedor_id: fornecedor.fornecedor_id,
      fornecedor_texto: fornecedor.fornecedor_texto,
      data_prevista_desembolso: dataPrevista,
      valor_previsto: valorPrevisto,
      comentario,
      status: 'previsto',
      prioridade,
      usuario_criacao_id: user.id,
      usuario_atualizacao_id: user.id
    }, { transaction });

    await registrarHistoricoProvisionamento({
      provisao_financeira_id: provisionamento.id,
      usuario_id: user.id,
      acao: 'CRIADA',
      status_novo: provisionamento.status,
      descricao: 'Provisao financeira criada.',
      dados_depois: provisionamento.toJSON(),
      transaction
    });

    await transaction.commit();
    return montarDetalheProvisionamento(provisionamento.id, user);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function updateProvisionamento(id, payload, user) {
  const transaction = await sequelize.transaction();

  try {
    const provisionamento = await findProvisionamentoScoped(id, user, { transaction });
    const statusAtual = normalizeStatus(provisionamento.status);
    if (['cancelado', 'realizado'].includes(statusAtual)) {
      throw createHttpError(400, 'Esta provisao nao pode mais ser editada.');
    }

    const categoria = await resolveCategoriaMacro({
      categoria_macro_id: parseInteger(payload.categoria_macro_id) || provisionamento.categoria_macro_id,
      item_macro: normalizeText(payload.item_macro),
      transaction
    });

    const fornecedor = await resolveFornecedor({
      fornecedor_id: payload.fornecedor_id ?? provisionamento.fornecedor_id,
      fornecedor_texto: payload.fornecedor_texto ?? provisionamento.fornecedor_texto,
      transaction
    });

    const before = provisionamento.toJSON();
    const descricao = normalizeText(payload.descricao) || provisionamento.descricao;
    const dataPrevista = normalizeDateOnly(payload.data_prevista_desembolso) || provisionamento.data_prevista_desembolso;
    const valorPrevisto = normalizeAmount(payload.valor_previsto);

    await provisionamento.update({
      categoria_macro_id: categoria.id,
      descricao,
      fornecedor_id: fornecedor.fornecedor_id,
      fornecedor_texto: fornecedor.fornecedor_texto,
      data_prevista_desembolso: dataPrevista,
      valor_previsto: valorPrevisto == null ? provisionamento.valor_previsto : valorPrevisto,
      comentario: Object.prototype.hasOwnProperty.call(payload, 'comentario')
        ? normalizeText(payload.comentario)
        : provisionamento.comentario,
      prioridade: Object.prototype.hasOwnProperty.call(payload, 'prioridade')
        ? normalizePriority(payload.prioridade)
        : provisionamento.prioridade,
      usuario_atualizacao_id: user.id
    }, { transaction });

    await registrarHistoricoProvisionamento({
      provisao_financeira_id: provisionamento.id,
      usuario_id: user.id,
      acao: 'EDITADA',
      status_anterior: before.status,
      status_novo: provisionamento.status,
      descricao: 'Provisao financeira atualizada.',
      dados_antes: before,
      dados_depois: provisionamento.toJSON(),
      transaction
    });

    await transaction.commit();
    return montarDetalheProvisionamento(provisionamento.id, user);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function addComentarioProvisionamento(id, comentario, user) {
  const provisionamento = await findProvisionamentoScoped(id, user);
  if (!normalizeText(comentario)) {
    throw createHttpError(400, 'Informe o comentario.');
  }

  await registrarHistoricoProvisionamento({
    provisao_financeira_id: provisionamento.id,
    usuario_id: user.id,
    acao: 'COMENTARIO_ADICIONADO',
    status_novo: provisionamento.status,
    descricao: 'Comentario registrado na provisao financeira.',
    comentario: normalizeText(comentario),
    metadata: { origem: 'detalhe' }
  });

  return montarDetalheProvisionamento(provisionamento.id, user);
}

async function listAnexosProvisionamento(id, user) {
  const provisionamento = await findProvisionamentoScoped(id, user);
  const anexos = await ProvisaoFinanceiraAnexo.findAll({
    where: { provisao_financeira_id: provisionamento.id },
    include: [{ model: User, as: 'uploadUser', attributes: ['id', 'nome', 'email', 'perfil'] }],
    order: [['createdAt', 'DESC']]
  });

  return anexos.map((anexo) => ({
    ...anexo.toJSON(),
    uploadUser: toPlainUser(anexo.uploadUser)
  }));
}

async function uploadAnexosProvisionamento(id, files, user) {
  const provisionamento = await findProvisionamentoScoped(id, user);
  if (!Array.isArray(files) || !files.length) {
    throw createHttpError(400, 'Nenhum arquivo enviado.');
  }

  for (const file of files) {
    const path = await uploadToS3(file, `provisoes-financeiras/${provisionamento.codigo}`);
    const nomeOriginal = sanitizeFileNameForStorage(file.originalname);
    const anexo = await ProvisaoFinanceiraAnexo.create({
      provisao_financeira_id: provisionamento.id,
      nome_original: nomeOriginal,
      caminho_arquivo: path,
      uploaded_by: user.id,
      area_origem: user?.setor_id ? String(user.setor_id) : null
    });

    await registrarHistoricoProvisionamento({
      provisao_financeira_id: provisionamento.id,
      usuario_id: user.id,
      acao: 'ANEXO_ADICIONADO',
      status_novo: provisionamento.status,
      descricao: nomeOriginal,
      metadata: { anexo_id: anexo.id, caminho_arquivo: anexo.caminho_arquivo }
    });
  }

  return listAnexosProvisionamento(provisionamento.id, user);
}

async function getAnexoProvisionamentoLink(anexoId, user) {
  const anexo = await ProvisaoFinanceiraAnexo.findByPk(anexoId);
  if (!anexo) {
    throw createHttpError(404, 'Anexo da provisao nao encontrado.');
  }

  await findProvisionamentoScoped(anexo.provisao_financeira_id, user);
  return {
    url: await getPresignedUrl(anexo.caminho_arquivo, 300)
  };
}

async function alterarStatusProvisionamento(id, acao, comentario, user) {
  const transaction = await sequelize.transaction();

  try {
    const provisionamento = await findProvisionamentoScoped(id, user, { transaction });
    const statusAtual = normalizeStatus(provisionamento.status);
    const comentarioNormalizado = normalizeText(comentario);

    if (acao === 'aprovar') {
      if (statusAtual !== 'em_analise') {
        throw createHttpError(400, 'Somente provisoes em analise podem ser aprovadas.');
      }

      await provisionamento.update({
        status: 'aprovado',
        aprovado_por_id: user.id,
        aprovado_em: new Date(),
        usuario_atualizacao_id: user.id
      }, { transaction });

      await registrarHistoricoProvisionamento({
        provisao_financeira_id: provisionamento.id,
        usuario_id: user.id,
        acao: 'APROVADA',
        status_anterior: statusAtual,
        status_novo: 'aprovado',
        descricao: 'Provisao financeira aprovada.',
        comentario: comentarioNormalizado,
        transaction
      });
    } else if (acao === 'cancelar') {
      if (statusAtual === 'cancelado') {
        throw createHttpError(400, 'A provisao ja esta cancelada.');
      }
      if (statusAtual === 'realizado') {
        throw createHttpError(400, 'Provisoes realizadas nao podem ser canceladas.');
      }
      if (!comentarioNormalizado) {
        throw createHttpError(400, 'Informe o motivo do cancelamento.');
      }

      await provisionamento.update({
        status: 'cancelado',
        cancelado_por_id: user.id,
        cancelado_em: new Date(),
        usuario_atualizacao_id: user.id
      }, { transaction });

      await registrarHistoricoProvisionamento({
        provisao_financeira_id: provisionamento.id,
        usuario_id: user.id,
        acao: 'CANCELADA',
        status_anterior: statusAtual,
        status_novo: 'cancelado',
        descricao: 'Provisao financeira cancelada.',
        comentario: comentarioNormalizado,
        transaction
      });
    } else if (acao === 'realizar') {
      if (statusAtual !== 'aprovado') {
        throw createHttpError(400, 'Somente provisoes aprovadas podem ser marcadas como realizadas.');
      }

      await provisionamento.update({
        status: 'realizado',
        realizado_em: new Date(),
        usuario_atualizacao_id: user.id
      }, { transaction });

      await registrarHistoricoProvisionamento({
        provisao_financeira_id: provisionamento.id,
        usuario_id: user.id,
        acao: 'REALIZADA',
        status_anterior: statusAtual,
        status_novo: 'realizado',
        descricao: 'Provisao financeira marcada como realizada.',
        comentario: comentarioNormalizado,
        transaction
      });
    } else if (acao === 'analise') {
      if (statusAtual !== 'previsto') {
        throw createHttpError(400, 'Somente provisoes previstas podem entrar em analise.');
      }

      await provisionamento.update({
        status: 'em_analise',
        usuario_atualizacao_id: user.id
      }, { transaction });

      await registrarHistoricoProvisionamento({
        provisao_financeira_id: provisionamento.id,
        usuario_id: user.id,
        acao: 'EM_ANALISE',
        status_anterior: statusAtual,
        status_novo: 'em_analise',
        descricao: 'Provisao financeira enviada para analise.',
        comentario: comentarioNormalizado,
        transaction
      });
    } else if (acao === 'reabrir') {
      if (!['em_analise', 'aprovado'].includes(statusAtual)) {
        throw createHttpError(400, 'Somente provisoes em analise ou aprovadas podem voltar para previsto.');
      }

      await provisionamento.update({
        status: 'previsto',
        usuario_atualizacao_id: user.id
      }, { transaction });

      await registrarHistoricoProvisionamento({
        provisao_financeira_id: provisionamento.id,
        usuario_id: user.id,
        acao: 'REABERTA',
        status_anterior: statusAtual,
        status_novo: 'previsto',
        descricao: 'Provisao financeira retornou para previsto.',
        comentario: comentarioNormalizado,
        transaction
      });
    } else {
      throw createHttpError(400, 'Acao de status invalida.');
    }

    await transaction.commit();
    return montarDetalheProvisionamento(provisionamento.id, user);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function getDashboardProvisionamento(query, user) {
  const obraIds = await getScopedObraIds(user);
  const obraId = parseInteger(query.obra_id);
  const categoriaId = parseInteger(query.categoria_macro_id);
  const status = normalizeStatus(query.status);
  const prioridade = normalizePriority(query.prioridade);
  const dataInicial = normalizeDateOnly(query.data_inicial);
  const dataFinal = normalizeDateOnly(query.data_final);

  const whereScope = {};
  if (Array.isArray(obraIds)) {
    if (!obraIds.length) {
      return {
        escopo: { global: false, obras_restritas: 0 },
        periodo: { data_inicial: dataInicial, data_final: dataFinal },
        cards: { total_periodo: 0, total_proximos_7_dias: 0, total_proximos_30_dias: 0, quantidade_abertas: 0 },
        graficos: { por_mes: [], por_obra: [], por_categoria: [], curva_semanal: [], pipeline_status: [] },
        alertas: {
          vencidas_nao_tratadas: { quantidade: 0, itens: [] },
          itens_criticos_proximos: { quantidade: 0, itens: [] },
          obras_concentracao_alta: []
        }
      };
    }
    whereScope.obra_id = { [Op.in]: obraIds };
  }

  if (obraId) {
    await assertObraScopeAccess(user, obraId);
    whereScope.obra_id = obraId;
  }

  const whereFilters = {};
  if (categoriaId) whereFilters.categoria_macro_id = categoriaId;
  if (status) whereFilters.status = status;
  if (prioridade) whereFilters.prioridade = prioridade;
  if (dataInicial || dataFinal) {
    whereFilters.data_prevista_desembolso = {};
    if (dataInicial) whereFilters.data_prevista_desembolso[Op.gte] = dataInicial;
    if (dataFinal) whereFilters.data_prevista_desembolso[Op.lte] = dataFinal;
  }

  const whereBase = combineWhere(whereScope, whereFilters);
  const today = parseDateOnly(formatDateOnly(new Date()));
  const todayText = formatDateOnly(today);
  const plus7Text = formatDateOnly(addDays(today, 7));
  const plus30Text = formatDateOnly(addDays(today, 30));
  const exprMes = literal("DATE_FORMAT(data_prevista_desembolso, '%Y-%m')");

  const whereAtivoPeriodo = combineWhere(whereBase, { status: { [Op.ne]: 'cancelado' } });
  const whereAbertas = combineWhere(whereBase, { status: { [Op.in]: STATUS_ABERTOS } });
  const where7Dias = combineWhere(whereBase, {
    status: { [Op.in]: STATUS_ABERTOS },
    data_prevista_desembolso: { [Op.gte]: todayText, [Op.lte]: plus7Text }
  });
  const where30Dias = combineWhere(whereBase, {
    status: { [Op.in]: STATUS_ABERTOS },
    data_prevista_desembolso: { [Op.gte]: todayText, [Op.lte]: plus30Text }
  });

  const [
    totalPeriodo,
    total7Dias,
    total30Dias,
    quantidadeAbertas,
    pipelineStatusRaw,
    porMesRaw,
    porObraRaw,
    porCategoriaRaw,
    alertasVencidasRaw,
    alertasCriticosRaw,
    curvaSemanalRaw
  ] = await Promise.all([
    ProvisaoFinanceira.sum('valor_previsto', { where: whereAtivoPeriodo }),
    ProvisaoFinanceira.sum('valor_previsto', { where: where7Dias }),
    ProvisaoFinanceira.sum('valor_previsto', { where: where30Dias }),
    ProvisaoFinanceira.count({ where: whereAbertas }),
    ProvisaoFinanceira.findAll({
      where: whereBase,
      attributes: ['status', [fn('COUNT', col('id')), 'quantidade'], [fn('SUM', col('valor_previsto')), 'total_valor']],
      group: ['status'],
      raw: true
    }),
    ProvisaoFinanceira.findAll({
      where: whereAtivoPeriodo,
      attributes: [[exprMes, 'mes'], [fn('COUNT', col('id')), 'quantidade'], [fn('SUM', col('valor_previsto')), 'total_valor']],
      group: [exprMes],
      order: [[exprMes, 'ASC']],
      raw: true
    }),
    ProvisaoFinanceira.findAll({
      where: whereAtivoPeriodo,
      attributes: ['obra_id', [fn('COUNT', col('id')), 'quantidade'], [fn('SUM', col('valor_previsto')), 'total_valor']],
      group: ['obra_id'],
      order: [[literal('total_valor'), 'DESC']],
      limit: 10,
      raw: true
    }),
    ProvisaoFinanceira.findAll({
      where: whereAtivoPeriodo,
      attributes: ['categoria_macro_id', [fn('COUNT', col('id')), 'quantidade'], [fn('SUM', col('valor_previsto')), 'total_valor']],
      group: ['categoria_macro_id'],
      order: [[literal('total_valor'), 'DESC']],
      limit: 10,
      raw: true
    }),
    ProvisaoFinanceira.findAll({
      where: combineWhere(whereBase, {
        status: { [Op.in]: STATUS_PENDENTES },
        data_prevista_desembolso: { [Op.lt]: todayText }
      }),
      include: [{ model: Obra, as: 'obra', attributes: ['id', 'codigo', 'nome'] }],
      attributes: ['id', 'codigo', 'data_prevista_desembolso', 'valor_previsto', 'status', 'prioridade', 'obra_id'],
      order: [['data_prevista_desembolso', 'ASC']],
      limit: 10
    }),
    ProvisaoFinanceira.findAll({
      where: combineWhere(whereBase, {
        prioridade: 'critica',
        status: { [Op.in]: STATUS_ABERTOS },
        data_prevista_desembolso: { [Op.gte]: todayText, [Op.lte]: plus7Text }
      }),
      include: [{ model: Obra, as: 'obra', attributes: ['id', 'codigo', 'nome'] }],
      attributes: ['id', 'codigo', 'data_prevista_desembolso', 'valor_previsto', 'status', 'prioridade', 'obra_id'],
      order: [['data_prevista_desembolso', 'ASC']],
      limit: 10
    }),
    ProvisaoFinanceira.findAll({
      where: whereAtivoPeriodo,
      attributes: ['data_prevista_desembolso', 'valor_previsto'],
      raw: true
    })
  ]);

  const obrasMap = new Map(
    (await Obra.findAll({
      where: { id: { [Op.in]: porObraRaw.map((item) => Number(item.obra_id)).filter(Boolean) } },
      attributes: ['id', 'codigo', 'nome']
    })).map((obra) => [Number(obra.id), { id: obra.id, codigo: obra.codigo, nome: obra.nome }])
  );

  const categoriasMap = new Map(
    (await ProvisaoCategoriaMacro.findAll({
      where: { id: { [Op.in]: porCategoriaRaw.map((item) => Number(item.categoria_macro_id)).filter(Boolean) } },
      attributes: ['id', 'nome']
    })).map((categoria) => [Number(categoria.id), { id: categoria.id, nome: categoria.nome }])
  );

  const porObra = porObraRaw.map((item) => ({
    obra_id: Number(item.obra_id),
    obra: obrasMap.get(Number(item.obra_id)) || null,
    quantidade: Number(item.quantidade || 0),
    total_valor: Number(item.total_valor || 0)
  }));

  const porCategoria = porCategoriaRaw.map((item) => ({
    categoria_macro_id: Number(item.categoria_macro_id),
    categoria: categoriasMap.get(Number(item.categoria_macro_id)) || null,
    quantidade: Number(item.quantidade || 0),
    total_valor: Number(item.total_valor || 0)
  }));

  const totalAtivo = Number(totalPeriodo || 0);
  const obrasConcentracaoAlta = porObra
    .filter((item) => totalAtivo > 0)
    .map((item) => ({
      ...item,
      percentual: Number(((item.total_valor / totalAtivo) * 100).toFixed(2))
    }))
    .filter((item) => item.percentual >= 35)
    .sort((a, b) => b.percentual - a.percentual)
    .slice(0, 5);

  const curvaSemanalMap = new Map();
  curvaSemanalRaw.forEach((item) => {
    const date = parseDateOnly(item.data_prevista_desembolso);
    if (!date) return;
    const start = startOfWeek(date);
    const key = formatDateOnly(start);
    const current = curvaSemanalMap.get(key) || {
      semana_inicio: key,
      semana_label: formatWeekLabel(start),
      total_valor: 0,
      quantidade: 0
    };
    current.total_valor += Number(item.valor_previsto || 0);
    current.quantidade += 1;
    curvaSemanalMap.set(key, current);
  });

  return {
    escopo: {
      global: obraIds === null,
      obras_restritas: Array.isArray(obraIds) ? obraIds.length : null
    },
    periodo: { data_inicial: dataInicial, data_final: dataFinal },
    cards: {
      total_periodo: Number(totalPeriodo || 0),
      total_proximos_7_dias: Number(total7Dias || 0),
      total_proximos_30_dias: Number(total30Dias || 0),
      quantidade_abertas: Number(quantidadeAbertas || 0)
    },
    graficos: {
      por_mes: porMesRaw.map((item) => ({
        mes: item.mes,
        quantidade: Number(item.quantidade || 0),
        total_valor: Number(item.total_valor || 0)
      })),
      por_obra: porObra,
      por_categoria: porCategoria,
      curva_semanal: Array.from(curvaSemanalMap.values()).sort((a, b) => String(a.semana_inicio).localeCompare(String(b.semana_inicio))),
      pipeline_status: pipelineStatusRaw.map((item) => ({
        status: item.status,
        quantidade: Number(item.quantidade || 0),
        total_valor: Number(item.total_valor || 0)
      }))
    },
    alertas: {
      vencidas_nao_tratadas: {
        quantidade: alertasVencidasRaw.length,
        itens: alertasVencidasRaw.map((item) => ({
          id: item.id,
          codigo: item.codigo,
          data_prevista_desembolso: item.data_prevista_desembolso,
          valor_previsto: Number(item.valor_previsto || 0),
          status: item.status,
          prioridade: item.prioridade,
          obra: item.obra ? { id: item.obra.id, codigo: item.obra.codigo, nome: item.obra.nome } : null
        }))
      },
      itens_criticos_proximos: {
        quantidade: alertasCriticosRaw.length,
        itens: alertasCriticosRaw.map((item) => ({
          id: item.id,
          codigo: item.codigo,
          data_prevista_desembolso: item.data_prevista_desembolso,
          valor_previsto: Number(item.valor_previsto || 0),
          status: item.status,
          prioridade: item.prioridade,
          obra: item.obra ? { id: item.obra.id, codigo: item.obra.codigo, nome: item.obra.nome } : null
        }))
      },
      obras_concentracao_alta: obrasConcentracaoAlta
    }
  };
}

module.exports = {
  PRIORIDADES,
  STATUS_PROVISAO,
  addComentarioProvisionamento,
  alterarStatusProvisionamento,
  createCategoriaProvisionamento,
  createProvisionamento,
  getAnexoProvisionamentoLink,
  getDashboardProvisionamento,
  getProvisionamentoById,
  getProvisionamentoContext,
  listAnexosProvisionamento,
  listCategoriasProvisionamento,
  listProvisionamentos,
  updateCategoriaProvisionamento,
  updateCategoriaProvisionamentoStatus,
  updateProvisionamento
};
