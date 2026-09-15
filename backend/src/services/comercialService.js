const crypto = require('crypto');
const { Op } = require('sequelize');
const {
  sequelize,
  CategoriaFinanceira,
  ChequeTerceiro,
  ChequeTerceiroMovimento,
  ConfiguracaoSistema,
  ContratoComercial,
  ContratoComercialComprador,
  ContratoComercialDocumento,
  ContratoComercialEvento,
  ContratoComercialParcela,
  ContratoComercialUnidade,
  Empreendimento,
  Obra,
  Parceiro,
  TabelaPrecoComercial,
  TabelaPrecoComercialItem,
  TituloFinanceiro,
  UnidadeComercial,
  User
} = require('../models');
const { registrarEventoSeguranca } = require('./securityLogService');

const CHAVE_COMERCIAL_CATEGORIAS_CONTRATO = 'COMERCIAL_CATEGORIAS_CONTRATO_VENDA';
const CHAVE_COMERCIAL_PERMITIR_VENDA_MANUAL = 'COMERCIAL_PERMITIR_VENDA_MANUAL';
const STATUS_CONTRATO_BLOQUEIAM_UNIDADE = ['RASCUNHO', 'ATIVO', 'INADIMPLENTE', 'QUITADO'];
const STATUS_CONTRATO_SINCRONIZAVEIS_FINANCEIRO = ['ATIVO', 'INADIMPLENTE', 'QUITADO'];

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function roundCurrency(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function normalizeSearch(value) {
  return String(value || '').trim();
}

function normalizeOptionalText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function assertTestemunhaCompleta(nome, cpf, label) {
  const hasNome = Boolean(normalizeOptionalText(nome));
  const hasCpf = Boolean(normalizeOptionalText(cpf));
  if (hasNome !== hasCpf) {
    throw createHttpError(400, `${label}: informe nome e CPF juntos.`);
  }
}

function normalizeContractStatus(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) {
    return 'ATIVO';
  }
  return normalized;
}

function isSuperadminUser(user) {
  return String(user?.perfil || '').trim().toUpperCase() === 'SUPERADMIN';
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function serializeJson(value) {
  return value ? JSON.stringify(value) : null;
}

function parseMetadataJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizarIdList(lista) {
  if (!Array.isArray(lista)) return [];
  return Array.from(new Set(
    lista
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item > 0)
  ));
}

async function getComercialCategoriasContratoConfig() {
  const item = await ConfiguracaoSistema.findOne({
    where: { chave: CHAVE_COMERCIAL_CATEGORIAS_CONTRATO },
    order: [['id', 'DESC']]
  });

  if (!item?.valor) {
    return null;
  }

  try {
    return JSON.parse(item.valor);
  } catch {
    return null;
  }
}

async function getComercialPermitirVendaManual() {
  const item = await ConfiguracaoSistema.findOne({
    where: { chave: CHAVE_COMERCIAL_PERMITIR_VENDA_MANUAL },
    order: [['id', 'DESC']]
  });
  if (!item?.valor) return false;
  try {
    const parsed = JSON.parse(item.valor);
    return parsed === true || parsed?.permitir_venda_manual === true;
  } catch {
    return String(item.valor).trim().toLowerCase() === 'true';
  }
}

async function obterConfiguracaoUnidadesComerciais() {
  return { permitir_venda_manual: await getComercialPermitirVendaManual() };
}

async function atualizarConfiguracaoUnidadesComerciais(req, payload = {}) {
  if (typeof payload.permitir_venda_manual !== 'boolean') {
    throw createHttpError(400, 'Informe permitir_venda_manual como verdadeiro ou falso.');
  }
  const permitirVendaManual = payload.permitir_venda_manual;
  const valor = JSON.stringify({ permitir_venda_manual: permitirVendaManual });
  const existente = await ConfiguracaoSistema.findOne({
    where: { chave: CHAVE_COMERCIAL_PERMITIR_VENDA_MANUAL },
    order: [['id', 'DESC']]
  });
  if (existente) await existente.update({ valor });
  else await ConfiguracaoSistema.create({ chave: CHAVE_COMERCIAL_PERMITIR_VENDA_MANUAL, valor });

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'COMMERCIAL_UNIT_MANUAL_SALE_CONFIG_UPDATED',
    recursoTipo: 'CONFIGURACAO_SISTEMA',
    recursoId: CHAVE_COMERCIAL_PERMITIR_VENDA_MANUAL,
    status: 'SUCCESS',
    descricao: 'Configuracao de venda manual de unidades atualizada',
    metadata: { permitir_venda_manual: permitirVendaManual }
  });
  return obterConfiguracaoUnidadesComerciais();
}

async function ensureCategoriaPermitidaNoComercial(categoriaId, campo) {
  if (!categoriaId) {
    return;
  }

  const config = await getComercialCategoriasContratoConfig();
  const chave = campo === 'comissao' ? 'comissao_categoria_id' : 'contrato_venda_categoria_ids';
  const permitidas = new Set(normalizarIdList(config?.[chave]));

  if (campo === 'comissao' && !permitidas.size) {
    const compatibilidade = getComissaoCategoriaFinanceiraFromConfig(config);
    if (Number.isInteger(compatibilidade) && compatibilidade > 0) {
      permitidas.add(compatibilidade);
    }
  }

  if (campo === 'comissao' && !permitidas.size && !config?.[chave]) {
    return;
  }

  if (!permitidas.has(Number(categoriaId))) {
    throw createHttpError(
      400,
      campo === 'comissao'
        ? 'Categoria financeira da comissao nao esta liberada para contratos comerciais.'
        : 'Categoria financeira nao esta liberada para contratos comerciais.'
    );
  }
}

async function listarCategoriasFinanceirasComercial(filters = {}) {
  const config = await getComercialCategoriasContratoConfig();
  const permitidas = new Set([
    ...normalizarIdList(config?.contrato_venda_categoria_ids),
    ...normalizarIdList(config?.comissao_categoria_id)
  ]);
  const term = normalizeSearch(filters.q || filters.busca);
  const where = {
    ativo: true,
    tipo: { [Op.in]: ['PAGAR', 'RECEBER', 'AMBOS'] }
  };

  if (permitidas.size > 0) {
    where.id = { [Op.in]: Array.from(permitidas) };
  }

  if (term) {
    where[Op.or] = [
      { nome: { [Op.like]: `%${term}%` } },
      { dre_grupo: { [Op.like]: `%${term}%` } },
      { dre_subgrupo: { [Op.like]: `%${term}%` } }
    ];
  }

  const categorias = await CategoriaFinanceira.findAll({
    where,
    order: [['nome', 'ASC']]
  });

  return {
    categorias,
    config: config
      ? {
          contrato_venda_categoria_ids: normalizarIdList(config.contrato_venda_categoria_ids),
          comissao_categoria_id: Number(config.comissao_categoria_id) || null,
          opcoes_pagamento: config.opcoes_pagamento || {}
        }
      : null
  };
}

function getComissaoCategoriaFinanceiraFromConfig(config) {
  const categoriaFromSingle = Number(config?.comissao_categoria_id);
  if (Number.isInteger(categoriaFromSingle) && categoriaFromSingle > 0) {
    return categoriaFromSingle;
  }

  const lista = normalizarIdList(config?.comissao_categoria_ids);
  return lista[0] || null;
}

function mergeObservacoes(...values) {
  return values
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join('\n');
}

function buildEmpreendimentoInclude() {
  return [
    {
      model: Obra,
      as: 'obra',
      attributes: ['id', 'nome', 'codigo', 'empresa_grupo_id']
    }
  ];
}

function buildUnidadeInclude() {
  return [
    {
      model: Empreendimento,
      as: 'empreendimento',
      attributes: ['id', 'nome', 'codigo', 'obra_id']
    },
    {
      model: Parceiro,
      as: 'parceiroReserva',
      attributes: ['id', 'nome', 'cpf_cnpj', 'telefone', 'email']
    },
    {
      model: User,
      as: 'excluidoPor',
      attributes: ['id', 'nome', 'email'],
      required: false
    },
    {
      model: TabelaPrecoComercialItem,
      as: 'itensTabelaPreco',
      required: false,
      include: [
        {
          model: TabelaPrecoComercial,
          as: 'tabelaPreco',
          attributes: ['id', 'nome', 'status', 'vigencia_inicio', 'vigencia_fim']
        }
      ]
    }
  ];
}

function buildContratoInclude({ includeParcelas = false } = {}) {
  const include = [
    {
      model: Empreendimento,
      as: 'empreendimento',
      attributes: ['id', 'nome', 'codigo']
    },
    {
      model: UnidadeComercial,
      as: 'unidadeComercial',
      attributes: ['id', 'codigo', 'nome', 'situacao', 'tipologia', 'bloco', 'torre', 'pavimento', 'metragem_privativa', 'fracao_ideal', 'valor_tabela', 'valor_base_venda']
    },
    {
      model: ContratoComercialUnidade,
      as: 'unidadesContrato',
      separate: true,
      order: [['ordem', 'ASC'], ['id', 'ASC']],
      include: [{
        model: UnidadeComercial,
        as: 'unidadeComercial',
        attributes: ['id', 'empreendimento_id', 'codigo', 'nome', 'situacao', 'tipologia', 'bloco', 'torre', 'pavimento', 'metragem_privativa', 'fracao_ideal', 'valor_tabela', 'valor_base_venda']
      }]
    },
    {
      model: Parceiro,
      as: 'cliente',
      attributes: ['id', 'nome', 'cpf_cnpj', 'telefone', 'email']
    },
    {
      model: ContratoComercialComprador,
      as: 'compradoresContrato',
      separate: true,
      order: [['ordem', 'ASC'], ['id', 'ASC']],
      include: [
        {
          model: Parceiro,
          as: 'parceiro',
          attributes: ['id', 'nome', 'cpf_cnpj', 'telefone', 'email', 'conjuge_nome', 'conjuge_parceiro_id'],
          include: [
            {
              model: Parceiro,
              as: 'conjuge',
              attributes: ['id', 'nome', 'cpf_cnpj', 'telefone', 'email']
            }
          ]
        }
      ]
    },
    {
      model: Parceiro,
      as: 'corretorParceiro',
      attributes: ['id', 'nome', 'cpf_cnpj', 'telefone', 'email', 'corretor']
    },
    {
      model: Obra,
      as: 'obra',
      attributes: ['id', 'nome', 'codigo', 'empresa_grupo_id']
    },
  {
    model: CategoriaFinanceira,
    as: 'categoriaFinanceira',
    attributes: ['id', 'nome', 'tipo', 'dre_grupo', 'dre_subgrupo', 'considera_dre']
  },
  {
    model: CategoriaFinanceira,
    as: 'categoriaFinanceiraComissao',
    attributes: ['id', 'nome', 'tipo', 'dre_grupo', 'dre_subgrupo', 'considera_dre']
  },
    {
      model: TituloFinanceiro,
      as: 'tituloFinanceiroComissao',
      required: false,
      attributes: [
        'id',
        'status',
        'descricao',
        'valor_original',
        'valor_saldo',
        'valor_baixado',
        'data_vencimento',
        'data_quitacao'
      ]
    },
    {
      model: User,
      as: 'criadoPor',
      attributes: ['id', 'nome', 'email']
    },
    {
      model: User,
      as: 'atualizadoPor',
      attributes: ['id', 'nome', 'email']
    }
  ];

  if (includeParcelas) {
    include.push({
      model: ContratoComercialParcela,
      as: 'parcelas',
      separate: true,
      order: [['sequencia', 'ASC']],
      include: [
        {
          model: TituloFinanceiro,
          as: 'tituloFinanceiro',
          required: false,
          attributes: [
            'id',
            'status',
            'descricao',
            'valor_original',
            'valor_saldo',
            'valor_baixado',
            'empresa_id',
            'competencia_data',
            'considera_dre',
            'data_vencimento',
            'data_quitacao'
          ],
          include: [
            {
              model: ChequeTerceiro,
              as: 'chequesTerceiros',
              attributes: [
                'id',
                'codigo',
                'numero_cheque',
                'titular_nome',
                'titular_documento',
                'banco',
                'agencia',
                'conta',
                'valor',
                'data_emissao',
                'data_vencimento',
                'status'
              ]
            }
          ]
        }
      ]
    });
    include.push({
      model: ContratoComercialEvento,
      as: 'eventos',
      separate: true,
      order: [['data_evento', 'DESC'], ['id', 'DESC']],
      include: [
        {
          model: User,
          as: 'criadoPor',
          attributes: ['id', 'nome', 'email']
        }
      ]
    });
  }

  return include;
}

function buildTabelaPrecoInclude({ includeItens = true } = {}) {
  const include = [
    {
      model: Empreendimento,
      as: 'empreendimento',
      attributes: ['id', 'nome', 'codigo', 'obra_id']
    },
    {
      model: User,
      as: 'criadoPor',
      attributes: ['id', 'nome', 'email']
    },
    {
      model: User,
      as: 'atualizadoPor',
      attributes: ['id', 'nome', 'email']
    }
  ];

  if (includeItens) {
    include.push({
      model: TabelaPrecoComercialItem,
      as: 'itens',
      separate: true,
      order: [[{ model: UnidadeComercial, as: 'unidadeComercial' }, 'codigo', 'ASC']],
      include: [
        {
          model: UnidadeComercial,
          as: 'unidadeComercial',
          attributes: ['id', 'codigo', 'nome', 'bloco', 'torre', 'tipologia', 'metragem_privativa', 'fracao_ideal', 'situacao', 'valor_tabela', 'valor_base_venda']
        }
      ]
    });
  }

  return include;
}

async function ensureObraExists(obraId) {
  const obra = await Obra.findByPk(obraId, {
    attributes: ['id', 'nome', 'codigo', 'empresa_grupo_id']
  });

  if (!obra) {
    throw createHttpError(400, 'Obra invalida.');
  }

  return obra;
}

function getEmpresaObraParaTitulo(obra, contexto = 'obra') {
  const empresaId = obra?.empresa_grupo_id ? Number(obra.empresa_grupo_id) : null;
  if (!Number.isInteger(empresaId) || empresaId <= 0) {
    throw createHttpError(
      400,
      `A ${contexto} precisa estar vinculada a uma empresa do grupo antes de gerar titulos financeiros.`
    );
  }
  return empresaId;
}

async function ensureCategoriaFinanceiraReceber(categoriaId) {
  if (!categoriaId) {
    throw createHttpError(400, 'Categoria financeira e obrigatoria para contratos comerciais.');
  }

  const categoria = await CategoriaFinanceira.findByPk(categoriaId);
  if (!categoria || categoria.ativo === false) {
    throw createHttpError(400, 'Categoria financeira invalida.');
  }

  const tipo = String(categoria.tipo || '').trim().toUpperCase();
  if (!['RECEBER', 'AMBOS'].includes(tipo)) {
    throw createHttpError(400, 'Categoria financeira incompativel com contratos comerciais.');
  }

  if (categoria.considera_dre === false) {
    throw createHttpError(400, 'A categoria financeira do contrato comercial precisa estar marcada para DRE.');
  }

  if (!String(categoria.dre_grupo || '').trim()) {
    throw createHttpError(400, 'A categoria financeira do contrato comercial precisa ter grupo DRE classificado.');
  }

  return categoria;
}

async function ensureCategoriaFinanceiraPagar(categoriaId) {
  if (!categoriaId) {
    throw createHttpError(400, 'Categoria financeira da comissao e obrigatoria para gerar titulo de comissao.');
  }

  const categoria = await CategoriaFinanceira.findByPk(categoriaId);
  if (!categoria || categoria.ativo === false) {
    throw createHttpError(400, 'Categoria financeira da comissao invalida.');
  }

  const tipo = String(categoria.tipo || '').trim().toUpperCase();
  if (!['PAGAR', 'AMBOS'].includes(tipo)) {
    throw createHttpError(400, 'Categoria financeira da comissao incompativel com contas a pagar.');
  }

  if (categoria.considera_dre === false) {
    throw createHttpError(400, 'A categoria financeira da comissao precisa estar marcada para DRE.');
  }

  if (!String(categoria.dre_grupo || '').trim()) {
    throw createHttpError(400, 'A categoria financeira da comissao precisa ter grupo DRE classificado.');
  }

  return categoria;
}

async function ensureClienteParceiro(parceiroId) {
  const parceiro = await Parceiro.findByPk(parceiroId);
  if (!parceiro || parceiro.ativo === false) {
    throw createHttpError(400, 'Cliente invalido.');
  }

  if (parceiro.cliente === false) {
    throw createHttpError(400, 'O parceiro informado nao esta marcado como cliente.');
  }

  return parceiro;
}

function normalizarCompradoresPayload(compradores = [], parceiroPrincipalId = null) {
  const principalId = Number(parceiroPrincipalId || 0);
  const source = Array.isArray(compradores) && compradores.length
    ? compradores
    : (principalId ? [{ parceiro_id: principalId, principal: true }] : []);

  const vistos = new Set();
  const normalizados = [];

  source.forEach((item, index) => {
    const parceiroId = Number(item?.parceiro_id ?? item?.id ?? item);
    if (!Number.isInteger(parceiroId) || parceiroId <= 0 || vistos.has(parceiroId)) return;

    vistos.add(parceiroId);
    normalizados.push({
      parceiro_id: parceiroId,
      ordem: Number.isInteger(Number(item?.ordem)) && Number(item.ordem) > 0
        ? Number(item.ordem)
        : index + 1,
      principal: Boolean(item?.principal) || (principalId > 0 && parceiroId === principalId),
      percentual_participacao: item?.percentual_participacao != null && item.percentual_participacao !== ''
        ? roundCurrency(item.percentual_participacao)
        : null
    });
  });

  if (principalId > 0 && !vistos.has(principalId)) {
    normalizados.unshift({
      parceiro_id: principalId,
      ordem: 1,
      principal: true,
      percentual_participacao: null
    });
  }

  if (!normalizados.length) {
    throw createHttpError(400, 'Informe ao menos um comprador.');
  }

  const principalIndex = principalId > 0
    ? normalizados.findIndex((item) => Number(item.parceiro_id) === principalId)
    : normalizados.findIndex((item) => item.principal);

  normalizados.forEach((item, index) => {
    item.principal = index === (principalIndex >= 0 ? principalIndex : 0);
    item.ordem = index + 1;
  });

  return normalizados;
}

async function ensureCompradoresClientes(compradores = []) {
  const clientes = await Promise.all(compradores.map((item) => ensureClienteParceiro(item.parceiro_id)));
  return compradores.map((item, index) => ({
    ...item,
    parceiro: clientes[index]
  }));
}

async function salvarCompradoresContrato({ contratoId, compradores, transaction }) {
  await ContratoComercialComprador.destroy({
    where: { contrato_comercial_id: contratoId },
    transaction
  });

  const rows = compradores.map((item, index) => ({
    contrato_comercial_id: contratoId,
    parceiro_id: item.parceiro_id,
    ordem: index + 1,
    principal: Boolean(item.principal),
    percentual_participacao: item.percentual_participacao
  }));

  if (rows.length) {
    await ContratoComercialComprador.bulkCreate(rows, { transaction });
  }
}

async function ensureCorretorParceiro(parceiroId) {
  if (!parceiroId) {
    return null;
  }

  const parceiro = await Parceiro.findByPk(parceiroId);
  if (!parceiro || parceiro.ativo === false) {
    throw createHttpError(400, 'Corretor invalido.');
  }

  if (parceiro.corretor === false) {
    throw createHttpError(400, 'O parceiro informado nao esta marcado como corretor.');
  }

  return parceiro;
}

async function ensureEmpreendimentoExists(id) {
  const empreendimento = await Empreendimento.findByPk(id, {
    include: buildEmpreendimentoInclude()
  });
  if (!empreendimento) {
    throw createHttpError(404, 'Empreendimento nao encontrado.');
  }

  return empreendimento;
}

async function ensureUnidadeExists(id) {
  const unidade = await UnidadeComercial.findByPk(id, {
    include: buildUnidadeInclude()
  });

  if (!unidade) {
    throw createHttpError(404, 'Unidade comercial nao encontrada.');
  }

  return unidade;
}

async function ensureUniqueContratoNumero(numero, contratoId = null) {
  const where = {
    numero
  };

  if (contratoId) {
    where.id = { [Op.ne]: contratoId };
  }

  const existing = await ContratoComercial.findOne({ where });
  if (existing) {
    throw createHttpError(
      400,
      `Ja existe o contrato #${existing.id} com o codigo ${numero}, vinculado a unidade ${existing.unidade_comercial_id}.`
    );
  }
}

function buildContratoNumeroPadrao(empreendimento, unidade) {
  return [
    empreendimento?.codigo,
    unidade?.torre,
    unidade?.codigo
  ]
    .map((value) => normalizeOptionalText(value))
    .filter(Boolean)
    .join(' - ');
}

function resolveContratoNumeroCadastro(numeroInformado, empreendimento, unidade) {
  const numeroCalculado = buildContratoNumeroPadrao(empreendimento, unidade);

  // O backend e a fonte de verdade para impedir que rascunhos locais antigos ou
  // clientes desatualizados enviem o codigo de outra unidade.
  return numeroCalculado || normalizeOptionalText(numeroInformado);
}

function buildUnidadeTorreWhere(torre) {
  const normalized = normalizeOptionalText(torre);
  if (normalized) {
    return { torre: normalized };
  }

  return {
    [Op.or]: [
      { torre: null },
      { torre: '' }
    ]
  };
}

async function ensureUniqueUnidadeCodigo(empreendimentoId, codigo, torre = null, unidadeId = null) {
  const where = {
    empreendimento_id: empreendimentoId,
    codigo,
    ...buildUnidadeTorreWhere(torre)
  };

  if (unidadeId) {
    where.id = { [Op.ne]: unidadeId };
  }

  const existing = await UnidadeComercial.findOne({ where });
  if (existing) {
    throw createHttpError(400, 'Ja existe uma unidade com este codigo nesta torre do empreendimento.');
  }
}

async function localizarContratoBloqueanteDaUnidade(unidadeId, contratoId = null, transaction = null) {
  const contratoWhere = {
    status: { [Op.in]: STATUS_CONTRATO_BLOQUEIAM_UNIDADE }
  };
  if (contratoId) contratoWhere.id = { [Op.ne]: contratoId };

  const [vinculo, legado] = await Promise.all([
    ContratoComercialUnidade.findOne({
      where: { unidade_comercial_id: unidadeId },
      include: [{ model: ContratoComercial, as: 'contrato', required: true, where: contratoWhere }],
      transaction,
      lock: transaction ? transaction.LOCK.UPDATE : undefined
    }),
    ContratoComercial.findOne({
      where: { ...contratoWhere, unidade_comercial_id: unidadeId },
      transaction,
      lock: transaction ? transaction.LOCK.UPDATE : undefined
    })
  ]);
  return vinculo?.contrato || legado || null;
}

async function ensureUnidadeDisponivelParaContrato(unidade, parceiroId, contratoId = null, transaction = null) {
  if (unidade.ativo === false) {
    throw createHttpError(400, 'A unidade foi excluida e nao pode receber contrato comercial.');
  }

  const situacao = String(unidade.situacao || '').trim().toUpperCase();
  const reservaParceiroId = Number(unidade.parceiro_reserva_id || 0);

  if (situacao === 'BLOQUEADA') {
    throw createHttpError(400, 'A unidade esta bloqueada e nao pode receber contrato comercial.');
  }

  if (situacao === 'RESERVADA' && reservaParceiroId && reservaParceiroId !== Number(parceiroId)) {
    throw createHttpError(400, 'A unidade esta reservada para outro cliente.');
  }

  const existing = await localizarContratoBloqueanteDaUnidade(unidade.id, contratoId, transaction);
  if (existing) {
    throw createHttpError(400, 'A unidade ja possui um contrato comercial ativo ou reservado.');
  }

  // VENDIDA sem contrato ativo e uma inconsistencia recuperavel. O novo contrato
  // assume o vinculo e preserva a situacao vendida de forma idempotente.
}

function normalizarUnidadesContratoPayload(unidades = [], unidadeLegadaId = null, valorTotal = null) {
  const source = Array.isArray(unidades) && unidades.length
    ? unidades
    : (unidadeLegadaId ? [{ unidade_comercial_id: unidadeLegadaId, valor_atribuido: valorTotal, principal: true }] : []);
  const seen = new Set();
  const normalized = source.map((item, index) => {
    const unidadeId = Number(item?.unidade_comercial_id || item?.id || 0);
    if (!Number.isInteger(unidadeId) || unidadeId <= 0) {
      throw createHttpError(400, `Unidade invalida na posicao ${index + 1}.`);
    }
    if (seen.has(unidadeId)) throw createHttpError(400, 'A mesma unidade nao pode aparecer duas vezes no contrato.');
    seen.add(unidadeId);
    const valorAtribuido = roundCurrency(item?.valor_atribuido);
    if (!(valorAtribuido > 0)) throw createHttpError(400, `Informe o valor real da unidade na posicao ${index + 1}.`);
    return {
      unidade_comercial_id: unidadeId,
      ordem: index + 1,
      principal: Boolean(item?.principal),
      valor_cadastro_referencia: item?.valor_cadastro_referencia != null
        ? roundCurrency(item.valor_cadastro_referencia)
        : null,
      valor_atribuido: valorAtribuido
    };
  });
  if (!normalized.length) throw createHttpError(400, 'Informe ao menos uma unidade para o contrato.');
  const principais = normalized.filter((item) => item.principal);
  if (principais.length > 1) throw createHttpError(400, 'Somente uma unidade pode ser marcada como principal.');
  if (!principais.length) normalized[0].principal = true;
  const soma = roundCurrency(normalized.reduce((total, item) => total + item.valor_atribuido, 0));
  if (valorTotal != null && Math.abs(soma - roundCurrency(valorTotal)) > 0.02) {
    throw createHttpError(400, 'A soma dos valores reais das unidades deve fechar o valor total do contrato.');
  }
  return normalized;
}

async function carregarUnidadesContratoParaGravacao(unidadesNormalizadas, empreendimentoId, parceiroId, contratoId, transaction) {
  const ids = unidadesNormalizadas.map((item) => item.unidade_comercial_id).sort((a, b) => a - b);
  const unidades = await UnidadeComercial.findAll({
    where: { id: { [Op.in]: ids } },
    order: [['id', 'ASC']],
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (unidades.length !== ids.length) throw createHttpError(400, 'Uma ou mais unidades informadas nao existem.');
  const porId = new Map(unidades.map((item) => [Number(item.id), item]));
  for (const item of unidadesNormalizadas) {
    const unidade = porId.get(item.unidade_comercial_id);
    if (Number(unidade.empreendimento_id) !== Number(empreendimentoId)) {
      throw createHttpError(400, `A unidade ${unidade.codigo} nao pertence ao empreendimento informado.`);
    }
    await ensureUnidadeDisponivelParaContrato(unidade, parceiroId, contratoId, transaction);
  }
  return unidadesNormalizadas.map((item) => ({ ...item, unidade: porId.get(item.unidade_comercial_id) }));
}

async function salvarUnidadesContrato({ contratoId, unidades, usuarioId, transaction }) {
  await ContratoComercialUnidade.destroy({ where: { contrato_comercial_id: contratoId }, transaction });
  await ContratoComercialUnidade.bulkCreate(unidades.map(({ unidade, ...item }) => ({
    ...item,
    contrato_comercial_id: contratoId,
    confirmado_por: usuarioId || null,
    confirmado_em: new Date()
  })), { transaction });
}

async function listarUnidadeIdsContrato(contrato, transaction = null) {
  const vinculos = await ContratoComercialUnidade.findAll({
    where: { contrato_comercial_id: contrato.id },
    attributes: ['unidade_comercial_id'],
    transaction
  });
  const ids = vinculos.map((item) => Number(item.unidade_comercial_id)).filter((id) => id > 0);
  if (!ids.length && Number(contrato.unidade_comercial_id || 0) > 0) ids.push(Number(contrato.unidade_comercial_id));
  return [...new Set(ids)];
}

function getSituacaoUnidadePorStatusContrato(status) {
  const normalized = normalizeContractStatus(status);
  if (['ATIVO', 'INADIMPLENTE', 'QUITADO'].includes(normalized)) {
    return 'VENDIDA';
  }
  if (normalized === 'RASCUNHO') {
    return 'RESERVADA';
  }
  if (['DISTRATADO', 'CANCELADO'].includes(normalized)) {
    return 'DISPONIVEL';
  }
  return 'DISPONIVEL';
}

async function sincronizarSituacaoUnidade(contrato, transaction) {
  const unidadeIds = await listarUnidadeIdsContrato(contrato, transaction);
  if (!unidadeIds.length) return;
  const novaSituacao = getSituacaoUnidadePorStatusContrato(contrato.status);
  const payload = {
    situacao: novaSituacao
  };

  if (novaSituacao === 'RESERVADA') {
    payload.parceiro_reserva_id = contrato.parceiro_id;
  } else {
    payload.parceiro_reserva_id = null;
    payload.reservado_ate = null;
  }

  for (const unidadeId of unidadeIds.sort((a, b) => a - b)) {
    if (novaSituacao === 'DISPONIVEL') {
      const bloqueante = await localizarContratoBloqueanteDaUnidade(unidadeId, contrato.id, transaction);
      if (bloqueante) continue;
    }
    await UnidadeComercial.update(payload, { where: { id: unidadeId }, transaction });
  }
}

function totalParcelas(parcelas = []) {
  return roundCurrency(parcelas.reduce((total, item) => total + Number(item.valor || 0), 0));
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isDescricaoParcelaGenerica(value) {
  const normalized = normalizeSearchText(value);
  return !normalized || /^parcela\s+\d+$/.test(normalized);
}

function normalizarParcelasContrato(parcelas = []) {
  let sequenciaBoleto = 0;

  return parcelas.map((parcela, index) => {
    const formaRecebimento = String(parcela.forma_recebimento_prevista || '').trim().toUpperCase();
    const sequencia = Number(parcela.sequencia || 0) > 0 ? Number(parcela.sequencia) : index + 1;
    const proximaParcela = {
      ...parcela,
      sequencia,
      reajuste_tipo: String(parcela.reajuste_tipo || 'FIXA').trim().toUpperCase() === 'REAJUSTAVEL'
        ? 'REAJUSTAVEL'
        : 'FIXA'
    };

    if (formaRecebimento === 'BOLETO') {
      sequenciaBoleto += 1;
      proximaParcela.sequencia_boleto = sequenciaBoleto;
      if (isDescricaoParcelaGenerica(proximaParcela.descricao)) {
        proximaParcela.descricao = `Parcela ${sequenciaBoleto}`;
      }
    }

    return proximaParcela;
  });
}

function calcularValorComissao(valorTotal, percentual) {
  const valor = roundCurrency(valorTotal || 0);
  const percent = Number(percentual || 0);
  if (!valor || !Number.isFinite(percent) || percent <= 0) {
    return 0;
  }

  return roundCurrency((valor * percent) / 100);
}

function calcularIndicadoresFinanceirosContrato(parcelas = []) {
  const hoje = getToday();
  const resumo = {
    total_parcelas: parcelas.length,
    parcelas_abertas: 0,
    parcelas_parciais: 0,
    parcelas_quitadas: 0,
    parcelas_canceladas: 0,
    parcelas_vencidas: 0,
    valor_em_aberto: 0,
    valor_vencido: 0,
    proximo_vencimento: null,
    status_sugerido: 'ATIVO'
  };

  for (const parcela of parcelas) {
    const titulo = parcela?.tituloFinanceiro;
    const status = String(titulo?.status || 'ABERTO').trim().toUpperCase();
    const saldo = roundCurrency(titulo?.valor_saldo ?? parcela?.valor_original ?? 0);
    // O titulo e a fonte operacional depois que a agenda comercial foi gerada.
    // Edicoes feitas no Financeiro precisam refletir imediatamente na cobranca,
    // ainda que a data espelhada da parcela ainda esteja sendo sincronizada.
    const vencimento = titulo?.data_vencimento || parcela?.data_vencimento || null;

    if (status === 'QUITADO') {
      resumo.parcelas_quitadas += 1;
      continue;
    }

    if (status === 'CANCELADO') {
      resumo.parcelas_canceladas += 1;
      continue;
    }

    if (status === 'PARCIAL') {
      resumo.parcelas_parciais += 1;
    } else {
      resumo.parcelas_abertas += 1;
    }

    resumo.valor_em_aberto = roundCurrency(resumo.valor_em_aberto + saldo);

    if (vencimento && vencimento < hoje && saldo > 0) {
      resumo.parcelas_vencidas += 1;
      resumo.valor_vencido = roundCurrency(resumo.valor_vencido + saldo);
    }

    if (vencimento && saldo > 0 && (!resumo.proximo_vencimento || vencimento < resumo.proximo_vencimento)) {
      resumo.proximo_vencimento = vencimento;
    }
  }

  if (resumo.valor_em_aberto <= 0 && resumo.total_parcelas > 0) {
    resumo.status_sugerido = 'QUITADO';
  } else if (resumo.parcelas_vencidas > 0) {
    resumo.status_sugerido = 'INADIMPLENTE';
  } else {
    resumo.status_sugerido = 'ATIVO';
  }

  return resumo;
}

function mergeIndicadoresNoContrato(contrato) {
  if (!contrato) return contrato;
  const plain = typeof contrato.toJSON === 'function' ? contrato.toJSON() : { ...contrato };
  const indicadores = calcularIndicadoresFinanceirosContrato(plain.parcelas || []);
  return {
    ...plain,
    indicadoresFinanceiros: indicadores
  };
}

async function sincronizarContratoComercialPorTituloEditado({ tituloId, dataVencimento, usuarioId }) {
  const idTitulo = Number(tituloId || 0);
  if (!Number.isInteger(idTitulo) || idTitulo <= 0) return [];

  return sequelize.transaction(async (transaction) => {
    const parcelasVinculadas = await ContratoComercialParcela.findAll({
      where: { titulo_financeiro_id: idTitulo },
      attributes: ['id', 'contrato_comercial_id', 'data_vencimento'],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!parcelasVinculadas.length) return [];

    const vencimentoAtualizado = String(dataVencimento || '').trim() || null;
    if (vencimentoAtualizado) {
      await ContratoComercialParcela.update(
        { data_vencimento: vencimentoAtualizado },
        {
          where: { titulo_financeiro_id: idTitulo },
          transaction
        }
      );
    }

    const contratosIds = Array.from(new Set(
      parcelasVinculadas
        .map((parcela) => Number(parcela.contrato_comercial_id || 0))
        .filter((id) => id > 0)
    ));
    const resultados = [];

    for (const contratoId of contratosIds) {
      const contrato = await ContratoComercial.findByPk(contratoId, {
        attributes: ['id', 'numero', 'status'],
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!contrato) continue;

      const parcelasContrato = await ContratoComercialParcela.findAll({
        where: { contrato_comercial_id: contratoId },
        attributes: ['id', 'data_vencimento', 'valor_original'],
        include: [{
          model: TituloFinanceiro,
          as: 'tituloFinanceiro',
          required: false,
          attributes: ['id', 'status', 'valor_saldo', 'data_vencimento']
        }],
        transaction
      });
      const indicadores = calcularIndicadoresFinanceirosContrato(parcelasContrato);
      const statusAnterior = String(contrato.status || '').trim().toUpperCase();
      const statusSugerido = String(indicadores.status_sugerido || 'ATIVO').trim().toUpperCase();
      const podeSincronizarStatus = STATUS_CONTRATO_SINCRONIZAVEIS_FINANCEIRO.includes(statusAnterior);

      if (podeSincronizarStatus && statusAnterior !== statusSugerido) {
        await contrato.update({
          status: statusSugerido,
          atualizado_por: usuarioId || null
        }, { transaction });

        await registrarEventoContratoComercial({
          transaction,
          contratoId,
          tipoEvento: 'STATUS_FINANCEIRO_SINCRONIZADO',
          descricao: `Status atualizado automaticamente de ${statusAnterior} para ${statusSugerido} apos edicao do titulo financeiro.`,
          metadata: {
            titulo_financeiro_id: idTitulo,
            status_anterior: statusAnterior,
            status_novo: statusSugerido,
            data_vencimento: vencimentoAtualizado,
            indicadores
          },
          usuarioId
        });
      }

      resultados.push({
        contrato_id: contratoId,
        status_anterior: statusAnterior,
        status_atual: podeSincronizarStatus ? statusSugerido : statusAnterior,
        indicadores
      });
    }

    return resultados;
  });
}

async function registrarEventoContratoComercial({ transaction, contratoId, tipoEvento, dataEvento, descricao, metadata, usuarioId }) {
  return ContratoComercialEvento.create({
    contrato_comercial_id: contratoId,
    tipo_evento: tipoEvento,
    data_evento: dataEvento || getToday(),
    descricao,
    metadata_json: serializeJson(metadata),
    criado_por: usuarioId || null
  }, { transaction });
}

async function contratoPossuiDocumentoAssinado(contratoId) {
  const signedStatuses = ['ASSINADO', 'FINALIZADO', 'CONCLUIDO'];
  const documento = await ContratoComercialDocumento.findOne({
    where: {
      contrato_comercial_id: contratoId,
      [Op.or]: [
        { status: { [Op.in]: signedStatuses } },
        { d4sign_status: { [Op.in]: signedStatuses } },
        { d4sign_finalizado_em: { [Op.ne]: null } }
      ]
    }
  });

  return Boolean(documento);
}

async function ensureTabelaPrecoExists(id) {
  const tabela = await TabelaPrecoComercial.findByPk(id, {
    include: buildTabelaPrecoInclude()
  });

  if (!tabela) {
    throw createHttpError(404, 'Tabela de preco nao encontrada.');
  }

  return tabela;
}

async function ensureUnidadesTabelaPreco(empreendimentoId, itens = []) {
  const unidadeIds = [...new Set(itens.map((item) => Number(item.unidade_comercial_id || 0)).filter((value) => value > 0))];
  if (!unidadeIds.length) {
    throw createHttpError(400, 'Informe ao menos uma unidade valida para a tabela de preco.');
  }

  const unidades = await UnidadeComercial.findAll({
    where: {
      id: unidadeIds,
      ativo: true
    }
  });

  if (unidades.length !== unidadeIds.length) {
    throw createHttpError(400, 'Uma ou mais unidades informadas na tabela de preco sao invalidas.');
  }

  for (const unidade of unidades) {
    if (Number(unidade.empreendimento_id) !== Number(empreendimentoId)) {
      throw createHttpError(400, 'Todas as unidades da tabela de preco devem pertencer ao empreendimento informado.');
    }
  }

  return unidades;
}

async function aplicarTabelaPrecoNasUnidades(tabela, transaction) {
  const itens = await TabelaPrecoComercialItem.findAll({
    where: {
      tabela_preco_comercial_id: tabela.id
    },
    transaction
  });

  for (const item of itens) {
    await UnidadeComercial.update(
      {
        valor_tabela: roundCurrency(item.valor_tabela)
      },
      {
        where: {
          id: item.unidade_comercial_id,
          ativo: true
        },
        transaction
      }
    );
  }
}

async function listarEmpreendimentos(filters = {}) {
  const where = {};
  const term = normalizeSearch(filters.q);

  if (term) {
    where[Op.or] = [
      { nome: { [Op.like]: `%${term}%` } },
      { codigo: { [Op.like]: `%${term}%` } },
      { cidade: { [Op.like]: `%${term}%` } }
    ];
  }

  if (filters.ativo !== undefined) {
    where.ativo = Boolean(filters.ativo);
  }

  if (filters.obra_id) {
    where.obra_id = Number(filters.obra_id);
  }

  return Empreendimento.findAll({
    where,
    include: buildEmpreendimentoInclude(),
    order: [['nome', 'ASC']]
  });
}

async function listarObrasComerciais() {
  return Obra.findAll({
    attributes: ['id', 'codigo', 'nome', 'empresa_grupo_id', 'tipo_centro_custo', 'ativo'],
    where: { ativo: true },
    order: [
      ['nome', 'ASC'],
      ['codigo', 'ASC']
    ]
  });
}

async function criarEmpreendimento(payload = {}) {
  if (payload.obra_id) {
    await ensureObraExists(payload.obra_id);
  }

  return Empreendimento.create({
    obra_id: payload.obra_id || null,
    codigo: payload.codigo || null,
    nome: payload.nome,
    descricao: payload.descricao || null,
    endereco: payload.endereco || null,
    numero: payload.numero || null,
    bairro: payload.bairro || null,
    cidade: payload.cidade || null,
    estado: payload.estado || null,
    cep: payload.cep || null,
    ativo: payload.ativo !== undefined ? payload.ativo : true
  });
}

async function atualizarEmpreendimento(id, payload = {}) {
  const empreendimento = await ensureEmpreendimentoExists(id);
  if (payload.obra_id) {
    await ensureObraExists(payload.obra_id);
  }

  await empreendimento.update(payload);
  return ensureEmpreendimentoExists(id);
}

async function listarUnidadesComerciais(filters = {}) {
  const where = {};
  const term = normalizeSearch(filters.q);

  if (filters.ativo !== undefined) {
    where.ativo = Boolean(filters.ativo);
  }

  if (filters.empreendimento_id) {
    where.empreendimento_id = Number(filters.empreendimento_id);
  }

  if (filters.situacao) {
    where.situacao = filters.situacao;
  }

  if (term) {
    where[Op.or] = [
      { codigo: { [Op.like]: `%${term}%` } },
      { nome: { [Op.like]: `%${term}%` } },
      { bloco: { [Op.like]: `%${term}%` } },
      { torre: { [Op.like]: `%${term}%` } },
      { tipologia: { [Op.like]: `%${term}%` } }
    ];
  }

  return UnidadeComercial.findAll({
    where,
    include: buildUnidadeInclude(),
    order: [['codigo', 'ASC']]
  });
}

async function criarUnidadeComercial(payload = {}) {
  await ensureEmpreendimentoExists(payload.empreendimento_id);
  if (String(payload.situacao || '').trim().toUpperCase() === 'VENDIDA' && !(await getComercialPermitirVendaManual())) {
    throw createHttpError(400, 'A situacao VENDIDA e definida por um contrato de venda. A venda manual esta desativada.');
  }
  const torre = normalizeOptionalText(payload.torre);
  await ensureUniqueUnidadeCodigo(payload.empreendimento_id, payload.codigo, torre);

  if (payload.parceiro_reserva_id) {
    await ensureClienteParceiro(payload.parceiro_reserva_id);
  }

  const unidade = await UnidadeComercial.create({
    empreendimento_id: payload.empreendimento_id,
    parceiro_reserva_id: payload.parceiro_reserva_id || null,
    codigo: payload.codigo,
    nome: payload.nome || null,
    bloco: payload.bloco || null,
    torre,
    pavimento: payload.pavimento || null,
    tipologia: payload.tipologia || null,
    metragem_privativa: payload.metragem_privativa ?? null,
    fracao_ideal: payload.fracao_ideal ?? null,
    valor_tabela: payload.valor_tabela ?? null,
    valor_base_venda: payload.valor_base_venda ?? null,
    situacao: payload.situacao || 'DISPONIVEL',
    reservado_ate: payload.reservado_ate || null,
    observacoes: payload.observacoes || null,
    ativo: payload.ativo !== undefined ? payload.ativo : true
  });

  return ensureUnidadeExists(unidade.id);
}

async function atualizarUnidadeComercial(id, payload = {}) {
  const unidade = await ensureUnidadeExists(id);
  if (unidade.ativo === false) {
    throw createHttpError(409, 'Unidade excluida nao pode ser editada.');
  }
  if (payload.ativo === false) {
    throw createHttpError(400, 'Use a acao Excluir unidade para preservar o motivo e a auditoria.');
  }
  const empreendimentoId = payload.empreendimento_id || unidade.empreendimento_id;

  if (payload.empreendimento_id) {
    await ensureEmpreendimentoExists(payload.empreendimento_id);
  }

  const updatePayload = { ...payload };
  const deveValidarCodigo = Object.prototype.hasOwnProperty.call(payload, 'codigo')
    || Object.prototype.hasOwnProperty.call(payload, 'torre')
    || Object.prototype.hasOwnProperty.call(payload, 'empreendimento_id');
  const codigo = Object.prototype.hasOwnProperty.call(payload, 'codigo') ? payload.codigo : unidade.codigo;
  const torre = Object.prototype.hasOwnProperty.call(payload, 'torre') ? normalizeOptionalText(payload.torre) : unidade.torre;

  if (deveValidarCodigo) {
    await ensureUniqueUnidadeCodigo(empreendimentoId, codigo, torre, unidade.id);
  }

  if (Object.prototype.hasOwnProperty.call(updatePayload, 'torre')) {
    updatePayload.torre = normalizeOptionalText(updatePayload.torre);
  }

  if (payload.parceiro_reserva_id) {
    await ensureClienteParceiro(payload.parceiro_reserva_id);
  }

  const situacaoAtual = String(unidade.situacao || '').trim().toUpperCase();
  const novaSituacao = String(payload.situacao || situacaoAtual).trim().toUpperCase();
  if (novaSituacao === 'VENDIDA' && situacaoAtual !== 'VENDIDA' && !(await getComercialPermitirVendaManual())) {
    throw createHttpError(400, 'A situacao VENDIDA e definida por um contrato de venda. A venda manual esta desativada.');
  }

  await unidade.update(updatePayload);
  return ensureUnidadeExists(id);
}

async function excluirUnidadeComercial(req, id, payload = {}) {
  const transaction = await sequelize.transaction();
  let unidade;
  try {
    unidade = await UnidadeComercial.findByPk(Number(id), {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!unidade) {
      throw createHttpError(404, 'Unidade comercial nao encontrada.');
    }

    if (unidade.ativo === false && unidade.excluido_em) {
      await transaction.commit();
      return ensureUnidadeExists(unidade.id);
    }

    const situacao = String(unidade.situacao || '').trim().toUpperCase();
    if (situacao === 'RESERVADA' || unidade.parceiro_reserva_id) {
      throw createHttpError(409, 'Cancele a reserva da unidade antes de exclui-la.');
    }

    const contratoBloqueante = await localizarContratoBloqueanteDaUnidade(unidade.id, null, transaction);
    if (contratoBloqueante) {
      throw createHttpError(
        409,
        `A unidade nao pode ser excluida porque esta vinculada ao contrato ${contratoBloqueante.numero || `#${contratoBloqueante.id}`}.`
      );
    }

    const motivo = normalizeOptionalText(payload.motivo);
    await unidade.update({
      ativo: false,
      excluido_em: new Date(),
      excluido_por: req.user?.id || null,
      motivo_exclusao: motivo
    }, { transaction });

    await transaction.commit();

    await registrarEventoSeguranca({
      req,
      usuarioId: req.user?.id || null,
      tipoEvento: 'COMMERCIAL_UNIT_SOFT_DELETED',
      recursoTipo: 'UNIDADE_COMERCIAL',
      recursoId: unidade.id,
      status: 'SUCCESS',
      descricao: 'Unidade comercial excluida logicamente',
      metadata: {
        empreendimento_id: unidade.empreendimento_id,
        codigo: unidade.codigo,
        nome: unidade.nome,
        torre: unidade.torre,
        situacao: unidade.situacao,
        motivo
      }
    });

    return ensureUnidadeExists(unidade.id);
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }
    throw error;
  }
}

async function listarTabelasPrecoComerciais(filters = {}) {
  const where = {};
  const term = normalizeSearch(filters.q);

  if (filters.empreendimento_id) {
    where.empreendimento_id = Number(filters.empreendimento_id);
  }

  if (filters.status) {
    where.status = String(filters.status).trim().toUpperCase();
  }

  if (term) {
    where[Op.or] = [
      { nome: { [Op.like]: `%${term}%` } },
      { codigo: { [Op.like]: `%${term}%` } }
    ];
  }

  return TabelaPrecoComercial.findAll({
    where,
    include: buildTabelaPrecoInclude(),
    order: [['createdAt', 'DESC']]
  });
}

async function criarTabelaPrecoComercial(req, payload = {}) {
  const empreendimento = await ensureEmpreendimentoExists(payload.empreendimento_id);
  await ensureUnidadesTabelaPreco(empreendimento.id, payload.itens || []);

  const transaction = await sequelize.transaction();
  try {
    const tabela = await TabelaPrecoComercial.create({
      empreendimento_id: empreendimento.id,
      codigo: payload.codigo || null,
      nome: payload.nome,
      status: payload.status || 'RASCUNHO',
      vigencia_inicio: payload.vigencia_inicio || null,
      vigencia_fim: payload.vigencia_fim || null,
      observacoes: payload.observacoes || null,
      criado_por: req.user?.id || null,
      atualizado_por: req.user?.id || null
    }, { transaction });

    for (const item of payload.itens || []) {
      await TabelaPrecoComercialItem.create({
        tabela_preco_comercial_id: tabela.id,
        unidade_comercial_id: item.unidade_comercial_id,
        valor_tabela: roundCurrency(item.valor_tabela),
        valor_minimo: item.valor_minimo != null ? roundCurrency(item.valor_minimo) : null,
        observacoes: item.observacoes || null
      }, { transaction });
    }

    if (String(tabela.status).toUpperCase() === 'ATIVA') {
      await TabelaPrecoComercial.update(
        {
          status: 'ARQUIVADA',
          atualizado_por: req.user?.id || null
        },
        {
          where: {
            empreendimento_id: empreendimento.id,
            id: { [Op.ne]: tabela.id },
            status: 'ATIVA'
          },
          transaction
        }
      );
      await aplicarTabelaPrecoNasUnidades(tabela, transaction);
    }

    await transaction.commit();

    await registrarEventoSeguranca({
      req,
      usuarioId: req.user?.id || null,
      tipoEvento: 'COMMERCIAL_PRICE_TABLE_CREATED',
      recursoTipo: 'TABELA_PRECO_COMERCIAL',
      recursoId: tabela.id,
      status: 'SUCCESS',
      descricao: 'Tabela de preco comercial criada',
      metadata: {
        empreendimento_id: empreendimento.id,
        total_itens: payload.itens?.length || 0,
        status: tabela.status
      }
    });

    return ensureTabelaPrecoExists(tabela.id);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function atualizarTabelaPrecoComercial(req, id, payload = {}) {
  const tabela = await ensureTabelaPrecoExists(id);
  const transaction = await sequelize.transaction();
  try {
    const updateData = {
      ...payload,
      atualizado_por: req.user?.id || null
    };

    if (payload.itens) {
      await ensureUnidadesTabelaPreco(tabela.empreendimento_id, payload.itens);
      await TabelaPrecoComercialItem.destroy({
        where: { tabela_preco_comercial_id: tabela.id },
        transaction
      });

      for (const item of payload.itens) {
        await TabelaPrecoComercialItem.create({
          tabela_preco_comercial_id: tabela.id,
          unidade_comercial_id: item.unidade_comercial_id,
          valor_tabela: roundCurrency(item.valor_tabela),
          valor_minimo: item.valor_minimo != null ? roundCurrency(item.valor_minimo) : null,
          observacoes: item.observacoes || null
        }, { transaction });
      }
    }

    delete updateData.itens;

    await tabela.update(updateData, { transaction });

    if (String(updateData.status || tabela.status).toUpperCase() === 'ATIVA') {
      await TabelaPrecoComercial.update(
        {
          status: 'ARQUIVADA',
          atualizado_por: req.user?.id || null
        },
        {
          where: {
            empreendimento_id: tabela.empreendimento_id,
            id: { [Op.ne]: tabela.id },
            status: 'ATIVA'
          },
          transaction
        }
      );
      await aplicarTabelaPrecoNasUnidades(tabela, transaction);
    }

    await transaction.commit();
    return ensureTabelaPrecoExists(tabela.id);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function ativarTabelaPrecoComercial(req, id) {
  const tabela = await ensureTabelaPrecoExists(id);
  const transaction = await sequelize.transaction();
  try {
    await TabelaPrecoComercial.update(
      {
        status: 'ARQUIVADA',
        atualizado_por: req.user?.id || null
      },
      {
        where: {
          empreendimento_id: tabela.empreendimento_id,
          id: { [Op.ne]: tabela.id },
          status: 'ATIVA'
        },
        transaction
      }
    );

    await tabela.update({
      status: 'ATIVA',
      atualizado_por: req.user?.id || null
    }, { transaction });

    await aplicarTabelaPrecoNasUnidades(tabela, transaction);
    await transaction.commit();

    return ensureTabelaPrecoExists(tabela.id);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function anexarIndicadoresContratos(contratos = [], { manterParcelas = false } = {}) {
  const lista = Array.isArray(contratos) ? contratos : [contratos];
  const ids = lista.map((item) => Number(item?.id || 0)).filter((value) => value > 0);
  if (!ids.length) {
    return Array.isArray(contratos) ? [] : null;
  }

  const parcelas = await ContratoComercialParcela.findAll({
    where: {
      contrato_comercial_id: ids
    },
    include: [
      {
        model: TituloFinanceiro,
        as: 'tituloFinanceiro',
        required: false,
        attributes: ['id', 'status', 'valor_original', 'valor_saldo', 'valor_baixado', 'data_vencimento', 'data_quitacao']
      }
    ],
    order: [['sequencia', 'ASC']]
  });

  const porContrato = new Map();
  for (const parcela of parcelas) {
    const contratoId = Number(parcela.contrato_comercial_id);
    if (!porContrato.has(contratoId)) {
      porContrato.set(contratoId, []);
    }
    porContrato.get(contratoId).push(typeof parcela.toJSON === 'function' ? parcela.toJSON() : parcela);
  }

  const normalizados = lista.map((contrato) => {
    const plain = typeof contrato.toJSON === 'function' ? contrato.toJSON() : { ...contrato };
    const parcelasContrato = porContrato.get(Number(plain.id)) || plain.parcelas || [];
    const compradoresContrato = Array.isArray(plain.compradoresContrato) ? plain.compradoresContrato : [];
    const unidadesContrato = Array.isArray(plain.unidadesContrato) ? plain.unidadesContrato : [];
    const unidades = unidadesContrato.length
      ? unidadesContrato
        .map((item) => ({
          id: item.id,
          contrato_comercial_id: item.contrato_comercial_id,
          unidade_comercial_id: item.unidade_comercial_id,
          ordem: item.ordem,
          principal: Boolean(item.principal),
          valor_cadastro_referencia: item.valor_cadastro_referencia,
          valor_atribuido: item.valor_atribuido,
          unidade: item.unidadeComercial
        }))
        .sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0))
      : [{
          unidade_comercial_id: plain.unidade_comercial_id,
          ordem: 1,
          principal: true,
          valor_cadastro_referencia: plain.unidadeComercial?.valor_base_venda ?? plain.unidadeComercial?.valor_tabela ?? null,
          valor_atribuido: plain.valor_total,
          unidade: plain.unidadeComercial
        }].filter((item) => item.unidade_comercial_id);
    const compradores = compradoresContrato.length
      ? compradoresContrato
        .map((item) => ({
          id: item.id,
          contrato_comercial_id: item.contrato_comercial_id,
          parceiro_id: item.parceiro_id,
          ordem: item.ordem,
          principal: Boolean(item.principal),
          percentual_participacao: item.percentual_participacao,
          parceiro: item.parceiro
        }))
        .sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0))
      : [{
          parceiro_id: plain.parceiro_id,
          ordem: 1,
          principal: true,
          percentual_participacao: 100,
          parceiro: plain.cliente
        }].filter((item) => item.parceiro_id);
    const eventos = Array.isArray(plain.eventos)
      ? plain.eventos.map((evento) => ({
          ...evento,
          metadata: parseMetadataJson(evento.metadata_json)
        }))
      : undefined;

    return {
      ...plain,
      unidades,
      compradores,
      parcelas: manterParcelas ? parcelasContrato : plain.parcelas,
      eventos,
      indicadoresFinanceiros: calcularIndicadoresFinanceirosContrato(parcelasContrato)
    };
  });

  return Array.isArray(contratos) ? normalizados : normalizados[0];
}

async function listarContratosComerciais(filters = {}) {
  const where = {
    status: { [Op.ne]: 'EXCLUIDO' }
  };
  const term = normalizeSearch(filters.q);

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.empreendimento_id) {
    where.empreendimento_id = Number(filters.empreendimento_id);
  }

  if (filters.unidade_comercial_id) {
    const unidadeId = Number(filters.unidade_comercial_id);
    const vinculos = await ContratoComercialUnidade.findAll({
      where: { unidade_comercial_id: unidadeId },
      attributes: ['contrato_comercial_id']
    });
    const ids = vinculos.map((item) => Number(item.contrato_comercial_id));
    const legados = await ContratoComercial.findAll({
      where: { unidade_comercial_id: unidadeId },
      attributes: ['id']
    });
    ids.push(...legados.map((item) => Number(item.id)));
    where.id = { [Op.in]: [...new Set(ids)] };
  }

  if (filters.parceiro_id) {
    where.parceiro_id = Number(filters.parceiro_id);
  }

  if (term) {
    where[Op.or] = [
      { numero: { [Op.like]: `%${term}%` } },
      { corretor_nome: { [Op.like]: `%${term}%` } }
    ];
  }

  const contratos = await ContratoComercial.findAll({
    where,
    include: buildContratoInclude(),
    order: [['createdAt', 'DESC']]
  });

  return anexarIndicadoresContratos(contratos);
}

async function carregarContratoComercial(id) {
  const contrato = await ContratoComercial.findByPk(id, {
    include: buildContratoInclude({ includeParcelas: true })
  });

  if (!contrato) {
    throw createHttpError(404, 'Contrato comercial nao encontrado.');
  }

  return anexarIndicadoresContratos(contrato, { manterParcelas: true });
}

function buildTituloContratoPayload({ contrato, parcela, categoriaFinanceiraId, empresaId, usuarioId }) {
  if (!Number.isInteger(Number(empresaId)) || Number(empresaId) <= 0) {
    throw createHttpError(400, 'Empresa do contrato comercial e obrigatoria para gerar titulo financeiro.');
  }

  const formaPrevista = String(parcela.forma_recebimento_prevista || '').trim().toUpperCase();
  const formaCobranca = ['BOLETO', 'PIX', 'OUTROS'].includes(formaPrevista) ? formaPrevista : null;
  const sequenciaDocumento = formaPrevista === 'BOLETO'
    ? (parcela.sequencia_boleto || parcela.sequencia)
    : parcela.sequencia;

  return {
    solicitacao_id: null,
    obra_id: contrato.obra_id,
    empresa_id: Number(empresaId),
    parceiro_id: contrato.parceiro_id,
    categoria_financeira_id: categoriaFinanceiraId,
    competencia_data: parcela.competencia_data,
    considera_dre: true,
    origem_titulo: 'COMERCIAL',
    tipo: 'RECEBER',
    status: 'ABERTO',
    descricao: `${contrato.numero} - ${parcela.descricao}`.slice(0, 255),
    numero_documento: `${contrato.numero}/${String(sequenciaDocumento).padStart(2, '0')}`.slice(0, 120),
    valor_original: roundCurrency(parcela.valor),
    valor_saldo: roundCurrency(parcela.valor),
    valor_baixado: 0,
    data_emissao: contrato.data_contrato || getToday(),
    data_vencimento: parcela.data_vencimento,
    data_quitacao: null,
    forma_cobranca: formaCobranca,
    status_cobranca: formaCobranca ? 'PENDENTE_EMISSAO' : 'NAO_APLICAVEL',
    banco_cobranca: null,
    nosso_numero: null,
    linha_digitavel: null,
    codigo_barras: null,
    identificador_externo: null,
    boleto_emitido_em: null,
    observacoes: parcela.observacoes || contrato.observacoes || null,
    criado_por: usuarioId || null,
    atualizado_por: usuarioId || null
  };
}

function buildTituloComissaoPayload({ contrato, corretorParceiro, categoriaFinanceiraId, empresaId, usuarioId }) {
  if (!Number.isInteger(Number(empresaId)) || Number(empresaId) <= 0) {
    throw createHttpError(400, 'Empresa do contrato comercial e obrigatoria para gerar titulo de comissao.');
  }

  const valorComissao = calcularValorComissao(contrato.valor_total, contrato.comissao_percentual);
  if (!contrato.competencia_comissao_data) {
    throw createHttpError(400, 'Competencia DRE da comissao e obrigatoria para gerar titulo de comissao.');
  }

  return {
    solicitacao_id: null,
    obra_id: contrato.obra_id,
    empresa_id: Number(empresaId),
    parceiro_id: corretorParceiro.id,
    categoria_financeira_id: categoriaFinanceiraId,
    competencia_data: contrato.competencia_comissao_data,
    considera_dre: true,
    origem_titulo: 'COMERCIAL',
    tipo: 'PAGAR',
    status: 'ABERTO',
    descricao: `Comissao de corretagem - ${contrato.numero}`.slice(0, 255),
    numero_documento: `COM-${contrato.numero}`.slice(0, 120),
    valor_original: valorComissao,
    valor_saldo: valorComissao,
    valor_baixado: 0,
    data_emissao: contrato.data_contrato || getToday(),
    data_vencimento: contrato.data_contrato || getToday(),
    data_quitacao: null,
    forma_cobranca: null,
    status_cobranca: 'NAO_APLICAVEL',
    banco_cobranca: null,
    nosso_numero: null,
    linha_digitavel: null,
    codigo_barras: null,
    identificador_externo: null,
    boleto_emitido_em: null,
    observacoes: contrato.observacoes || null,
    criado_por: usuarioId || null,
    atualizado_por: usuarioId || null
  };
}

async function sincronizarTituloComissao({
  req,
  transaction,
  contrato,
  corretorParceiro,
  categoriaFinanceiraComissaoId,
  empresaId
}) {
  const contratoAtual = await ContratoComercial.findByPk(contrato.id, { transaction });
  const tituloExistente = contratoAtual?.titulo_financeiro_comissao_id
    ? await TituloFinanceiro.findByPk(contratoAtual.titulo_financeiro_comissao_id, { transaction })
    : null;

  const valorComissao = calcularValorComissao(contrato.valor_total, contrato.comissao_percentual);
  const statusContrato = normalizeContractStatus(contrato.status);
  const deveGerar = Boolean(corretorParceiro && valorComissao > 0 && !['DISTRATADO', 'CANCELADO'].includes(statusContrato));

  if (!deveGerar) {
    if (tituloExistente) {
      if (Number(tituloExistente.valor_baixado || 0) > 0) {
        throw createHttpError(400, 'Nao e possivel remover ou cancelar a comissao com pagamento ja registrado.');
      }

      await tituloExistente.update({
        status: 'CANCELADO',
        valor_saldo: 0,
        atualizado_por: req.user?.id || null
      }, { transaction });
    }

    return tituloExistente;
  }

  if (!categoriaFinanceiraComissaoId) {
    return tituloExistente;
  }

  // A comissao deve usar categoria de pagamentos (PAGAR), independente do contrato.
  await ensureCategoriaFinanceiraPagar(categoriaFinanceiraComissaoId);
  await ensureCategoriaPermitidaNoComercial(categoriaFinanceiraComissaoId, 'comissao');

  const payload = buildTituloComissaoPayload({
    contrato,
    corretorParceiro,
    categoriaFinanceiraId: categoriaFinanceiraComissaoId,
    empresaId,
    usuarioId: req.user?.id || null
  });

  if (!tituloExistente) {
    return TituloFinanceiro.create(payload, { transaction });
  }

  if (Number(tituloExistente.valor_baixado || 0) > 0) {
    const parceiroAlterado = Number(tituloExistente.parceiro_id) !== Number(payload.parceiro_id);
    const valorAlterado = roundCurrency(tituloExistente.valor_original) !== roundCurrency(payload.valor_original);
    const categoriaAlterada = Number(tituloExistente.categoria_financeira_id || 0) !== Number(payload.categoria_financeira_id || 0);
    const empresaAlterada = Number(tituloExistente.empresa_id || 0) !== Number(payload.empresa_id || 0);

    if (parceiroAlterado || valorAlterado || categoriaAlterada || empresaAlterada) {
      throw createHttpError(400, 'Nao e possivel alterar corretor, categoria, empresa ou valor da comissao com pagamento ja registrado.');
    }
  }

  const valorBaixado = roundCurrency(tituloExistente.valor_baixado || 0);
  const valorSaldo = roundCurrency(payload.valor_original - valorBaixado);

  await tituloExistente.update({
    parceiro_id: payload.parceiro_id,
    empresa_id: payload.empresa_id,
    categoria_financeira_id: payload.categoria_financeira_id,
    competencia_data: payload.competencia_data,
    considera_dre: payload.considera_dre,
    origem_titulo: payload.origem_titulo,
    descricao: payload.descricao,
    numero_documento: payload.numero_documento,
    valor_original: payload.valor_original,
    valor_saldo: valorSaldo < 0 ? 0 : valorSaldo,
    status: valorSaldo <= 0 ? 'QUITADO' : (valorBaixado > 0 ? 'PARCIAL' : 'ABERTO'),
    data_emissao: payload.data_emissao,
    data_vencimento: payload.data_vencimento,
    observacoes: payload.observacoes,
    atualizado_por: req.user?.id || null
  }, { transaction });

  return tituloExistente;
}

async function criarContratoComercial(req, payload = {}) {
  const compradoresNormalizados = normalizarCompradoresPayload(payload.compradores, payload.parceiro_id);
  const unidadesInformadas = Array.isArray(payload.unidades) ? payload.unidades : [];
  const unidadePrincipalInformada = unidadesInformadas.find((item) => item?.principal) || unidadesInformadas[0] || null;
  const unidadePrincipalId = unidadePrincipalInformada?.unidade_comercial_id || payload.unidade_comercial_id;
  const [empreendimento, unidade, cliente, corretorParceiro, obra, compradoresValidados] = await Promise.all([
    ensureEmpreendimentoExists(payload.empreendimento_id),
    ensureUnidadeExists(unidadePrincipalId),
    ensureClienteParceiro(payload.parceiro_id),
    ensureCorretorParceiro(payload.corretor_parceiro_id),
    ensureObraExists(payload.obra_id),
    ensureCompradoresClientes(compradoresNormalizados)
  ]);

  await ensureCategoriaFinanceiraReceber(payload.categoria_financeira_id);
  await ensureCategoriaPermitidaNoComercial(payload.categoria_financeira_id, 'contrato');

  const empresaContratoId = getEmpresaObraParaTitulo(obra, 'obra do contrato comercial');

  if (Number(unidade.empreendimento_id) !== Number(empreendimento.id)) {
    throw createHttpError(400, 'A unidade selecionada nao pertence ao empreendimento informado.');
  }

  if (empreendimento.obra_id && Number(empreendimento.obra_id) !== Number(obra.id)) {
    throw createHttpError(400, 'O empreendimento esta vinculado a outra obra.');
  }

  const numeroContrato = resolveContratoNumeroCadastro(payload.numero, empreendimento, unidade);
  await ensureUniqueContratoNumero(numeroContrato);

  const dataAssinatura = payload.data_assinatura || payload.data_contrato;
  const configCategoriasComerciais = await getComercialCategoriasContratoConfig();
  const categoriaFinanceiraComissaoId = corretorParceiro
    ? getComissaoCategoriaFinanceiraFromConfig(configCategoriasComerciais)
    : null;
  const comissaoPercentual = corretorParceiro ? payload.comissao_percentual : null;

  if (corretorParceiro && Number(comissaoPercentual || 0) <= 0) {
    throw createHttpError(400, 'Comissao percentual e obrigatoria quando houver corretor.');
  }

  assertTestemunhaCompleta(payload.testemunha_1_nome, payload.testemunha_1_cpf, 'Testemunha 1');
  assertTestemunhaCompleta(payload.testemunha_2_nome, payload.testemunha_2_cpf, 'Testemunha 2');

  const parcelasContrato = normalizarParcelasContrato(payload.parcelas).map((parcela) => ({
    ...parcela,
    competencia_data: dataAssinatura
  }));
  const totalCalculado = totalParcelas(parcelasContrato);
  const valorTotalInformado = payload.valor_total != null ? roundCurrency(payload.valor_total) : totalCalculado;

  if (roundCurrency(valorTotalInformado) !== roundCurrency(totalCalculado)) {
    throw createHttpError(400, 'O valor total do contrato deve ser igual a soma das parcelas.');
  }
  const unidadesNormalizadas = normalizarUnidadesContratoPayload(
    unidadesInformadas,
    unidade.id,
    valorTotalInformado
  );

  const transaction = await sequelize.transaction();
  try {
    const unidadesValidadas = await carregarUnidadesContratoParaGravacao(
      unidadesNormalizadas,
      empreendimento.id,
      cliente.id,
      null,
      transaction
    );
    const unidadePrincipal = unidadesValidadas.find((item) => item.principal) || unidadesValidadas[0];
    const contrato = await ContratoComercial.create({
      empreendimento_id: empreendimento.id,
      unidade_comercial_id: unidadePrincipal.unidade_comercial_id,
      parceiro_id: cliente.id,
      corretor_parceiro_id: corretorParceiro?.id || null,
      obra_id: obra.id,
      categoria_financeira_id: payload.categoria_financeira_id || null,
      categoria_financeira_comissao_id: categoriaFinanceiraComissaoId,
      numero: numeroContrato,
      status: payload.status || 'ATIVO',
      data_contrato: dataAssinatura,
      valor_total: valorTotalInformado,
      valor_entrada: roundCurrency(payload.valor_entrada || 0),
      desconto_concedido: roundCurrency(payload.desconto_concedido || 0),
      indice_reajuste: payload.indice_reajuste || null,
      corretor_nome: corretorParceiro?.nome || null,
      comissao_percentual: comissaoPercentual ?? null,
      competencia_comissao_data: corretorParceiro ? dataAssinatura : null,
      possui_vaga_garagem: Boolean(payload.possui_vaga_garagem),
      quantidade_vagas_garagem: payload.possui_vaga_garagem ? (payload.quantidade_vagas_garagem || null) : null,
      vagas_garagem_posicao: payload.possui_vaga_garagem ? (payload.vagas_garagem_posicao || null) : null,
      local_assinatura: payload.local_assinatura || null,
      data_assinatura: dataAssinatura,
      testemunha_1_nome: payload.testemunha_1_nome || null,
      testemunha_1_cpf: payload.testemunha_1_cpf || null,
      testemunha_2_nome: payload.testemunha_2_nome || null,
      testemunha_2_cpf: payload.testemunha_2_cpf || null,
      observacoes: payload.observacoes || null,
      criado_por: req.user?.id || null,
      atualizado_por: req.user?.id || null
    }, { transaction });

    await salvarCompradoresContrato({
      contratoId: contrato.id,
      compradores: compradoresValidados,
      transaction
    });
    await salvarUnidadesContrato({
      contratoId: contrato.id,
      unidades: unidadesValidadas,
      usuarioId: req.user?.id || null,
      transaction
    });

    for (const parcela of parcelasContrato) {
      const titulo = await TituloFinanceiro.create(
        buildTituloContratoPayload({
          contrato,
          parcela,
          categoriaFinanceiraId: payload.categoria_financeira_id,
          empresaId: empresaContratoId,
          usuarioId: req.user?.id || null
        }),
        { transaction }
      );

      await ContratoComercialParcela.create({
        contrato_comercial_id: contrato.id,
        titulo_financeiro_id: titulo.id,
        sequencia: parcela.sequencia,
        tipo_parcela: parcela.tipo_parcela,
        descricao: parcela.descricao,
        forma_recebimento_prevista: parcela.forma_recebimento_prevista || null,
        periodicidade: parcela.periodicidade || null,
        reajuste_tipo: parcela.reajuste_tipo || 'FIXA',
        data_vencimento: parcela.data_vencimento,
        competencia_data: parcela.competencia_data,
        valor_original: roundCurrency(parcela.valor),
        observacoes: parcela.observacoes || null
      }, { transaction });

      if (String(parcela.forma_recebimento_prevista || '').trim().toUpperCase() === 'CHEQUE') {
        const cheque = await ChequeTerceiro.create({
          codigo: `CHQ-${crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`,
          titulo_financeiro_id: titulo.id,
          parceiro_entregou_id: cliente.id,
          titular_parceiro_id: null,
          empresa_id: empresaContratoId,
          obra_origem_id: obra.id,
          origem_tipo: 'CONTRATO_COMERCIAL',
          motivo_origem: `Contrato ${contrato.numero} - ${parcela.descricao}`.slice(0, 255),
          data_entrada: dataAssinatura,
          cliente_nome: cliente.nome,
          titular_nome: parcela.cheque_titular_nome,
          titular_documento: parcela.cheque_titular_documento,
          banco: parcela.cheque_banco,
          agencia: parcela.cheque_agencia || null,
          conta: parcela.cheque_conta || null,
          numero_cheque: parcela.cheque_numero,
          valor: roundCurrency(parcela.valor),
          data_emissao: parcela.cheque_data_emissao,
          data_vencimento: parcela.data_vencimento,
          status: 'EM_CARTEIRA',
          observacoes: parcela.observacoes || `Cheque recebido no contrato ${contrato.numero}.`,
          criado_por: req.user?.id || null,
          atualizado_por: req.user?.id || null
        }, { transaction });

        await ChequeTerceiroMovimento.create({
          cheque_terceiro_id: cheque.id,
          tipo_evento: 'ENTRADA',
          status_anterior: null,
          status_novo: 'EM_CARTEIRA',
          empresa_origem_id: null,
          empresa_destino_id: empresaContratoId,
          titulo_financeiro_id: titulo.id,
          valor: roundCurrency(parcela.valor),
          data_evento: dataAssinatura,
          observacoes: `Cheque recebido no contrato ${contrato.numero}.`,
          metadata_json: {
            origem: 'CONTRATO_COMERCIAL',
            contrato_id: contrato.id,
            parcela_sequencia: parcela.sequencia
          },
          criado_por: req.user?.id || null
        }, { transaction });
      }
    }

    const tituloComissao = await sincronizarTituloComissao({
      req,
      transaction,
      contrato,
      corretorParceiro,
      categoriaFinanceiraComissaoId,
      empresaId: empresaContratoId
    });

    if (tituloComissao && Number(contrato.titulo_financeiro_comissao_id || 0) !== Number(tituloComissao.id || 0)) {
      await contrato.update({
        titulo_financeiro_comissao_id: tituloComissao.id,
        corretor_nome: corretorParceiro?.nome || contrato.corretor_nome || null,
        atualizado_por: req.user?.id || null
      }, { transaction });
    }

    await sincronizarSituacaoUnidade(contrato, transaction);
    await transaction.commit();

    await registrarEventoSeguranca({
      req,
      usuarioId: req.user?.id || null,
      tipoEvento: 'COMMERCIAL_CONTRACT_CREATED',
      recursoTipo: 'CONTRATO_COMERCIAL',
      recursoId: contrato.id,
      status: 'SUCCESS',
      descricao: 'Contrato comercial criado com geracao de parcelas e titulos financeiros',
      metadata: {
        empreendimento_id: empreendimento.id,
        unidade_comercial_id: unidadePrincipal.unidade_comercial_id,
        unidades_comerciais_ids: unidadesValidadas.map((item) => item.unidade_comercial_id),
        parceiro_id: cliente.id,
        compradores: compradoresValidados.map((item) => item.parceiro_id),
        corretor_parceiro_id: corretorParceiro?.id || null,
        obra_id: obra.id,
        valor_total: valorTotalInformado,
        total_parcelas: parcelasContrato.length,
        titulo_financeiro_comissao_id: tituloComissao?.id || null
      }
    });

    return carregarContratoComercial(contrato.id);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function atualizarContratoComercial(req, id, payload = {}) {
  const contrato = await carregarContratoComercial(id);
  const atualizarCompradores = Object.prototype.hasOwnProperty.call(payload, 'compradores');
  const atualizarUnidades = Object.prototype.hasOwnProperty.call(payload, 'unidades');
  const unidadesNormalizadas = atualizarUnidades
    ? normalizarUnidadesContratoPayload(
        payload.unidades,
        contrato.unidade_comercial_id,
        payload.valor_total != null ? payload.valor_total : contrato.valor_total
      )
    : null;
  const compradoresValidados = atualizarCompradores
    ? await ensureCompradoresClientes(normalizarCompradoresPayload(payload.compradores, contrato.parceiro_id))
    : null;

  if (Object.prototype.hasOwnProperty.call(payload, 'categoria_financeira_id')) {
    await ensureCategoriaFinanceiraReceber(payload.categoria_financeira_id);
    await ensureCategoriaPermitidaNoComercial(payload.categoria_financeira_id, 'contrato');
  }

  let corretorParceiro = contrato.corretorParceiro || null;
  if (Object.prototype.hasOwnProperty.call(payload, 'corretor_parceiro_id')) {
    corretorParceiro = await ensureCorretorParceiro(payload.corretor_parceiro_id);
  }

  const obraContrato = Object.prototype.hasOwnProperty.call(payload, 'obra_id')
    ? await ensureObraExists(payload.obra_id)
    : (contrato.obra || await ensureObraExists(contrato.obra_id));
  const empresaContratoId = getEmpresaObraParaTitulo(obraContrato, 'obra do contrato comercial');

  const atualizarDataAssinatura =
    Object.prototype.hasOwnProperty.call(payload, 'data_assinatura') ||
    Object.prototype.hasOwnProperty.call(payload, 'data_contrato');
  const dataAssinaturaEfetiva = atualizarDataAssinatura
    ? (payload.data_assinatura || payload.data_contrato || null)
    : (contrato.data_assinatura || contrato.data_contrato || null);
  const comissaoPercentualEfetiva = Object.prototype.hasOwnProperty.call(payload, 'comissao_percentual')
    ? payload.comissao_percentual
    : contrato.comissao_percentual;

  if (corretorParceiro && Number(comissaoPercentualEfetiva || 0) <= 0) {
    throw createHttpError(400, 'Comissao percentual e obrigatoria quando houver corretor.');
  }

  const testemunha1Nome = Object.prototype.hasOwnProperty.call(payload, 'testemunha_1_nome')
    ? payload.testemunha_1_nome
    : contrato.testemunha_1_nome;
  const testemunha1Cpf = Object.prototype.hasOwnProperty.call(payload, 'testemunha_1_cpf')
    ? payload.testemunha_1_cpf
    : contrato.testemunha_1_cpf;
  const testemunha2Nome = Object.prototype.hasOwnProperty.call(payload, 'testemunha_2_nome')
    ? payload.testemunha_2_nome
    : contrato.testemunha_2_nome;
  const testemunha2Cpf = Object.prototype.hasOwnProperty.call(payload, 'testemunha_2_cpf')
    ? payload.testemunha_2_cpf
    : contrato.testemunha_2_cpf;

  assertTestemunhaCompleta(testemunha1Nome, testemunha1Cpf, 'Testemunha 1');
  assertTestemunhaCompleta(testemunha2Nome, testemunha2Cpf, 'Testemunha 2');

  const transaction = await sequelize.transaction();
  try {
    const unidadesAnterioresIds = atualizarUnidades ? await listarUnidadeIdsContrato(contrato, transaction) : [];
    const unidadesValidadas = atualizarUnidades
      ? await carregarUnidadesContratoParaGravacao(
          unidadesNormalizadas,
          contrato.empreendimento_id,
          contrato.parceiro_id,
          contrato.id,
          transaction
        )
      : null;
    const updateData = {
      ...payload,
      atualizado_por: req.user?.id || null
    };
    delete updateData.compradores;
    delete updateData.unidades;
    if (unidadesValidadas) {
      const principal = unidadesValidadas.find((item) => item.principal) || unidadesValidadas[0];
      updateData.unidade_comercial_id = principal.unidade_comercial_id;
    }

    const dataAssinaturaAtualizada = atualizarDataAssinatura
      ? (payload.data_assinatura || payload.data_contrato || null)
      : null;

    if (atualizarDataAssinatura) {
      updateData.data_assinatura = dataAssinaturaAtualizada;
      updateData.data_contrato = dataAssinaturaAtualizada;
    }

    if (payload.status) {
      updateData.status = normalizeContractStatus(payload.status);
    }

    updateData.corretor_parceiro_id = corretorParceiro?.id || null;
    updateData.corretor_nome = corretorParceiro?.nome || null;
    updateData.comissao_percentual = corretorParceiro ? comissaoPercentualEfetiva : null;
    const configCategoriasComerciais = await getComercialCategoriasContratoConfig();
    const categoriaFinanceiraComissaoAtual = getComissaoCategoriaFinanceiraFromConfig(configCategoriasComerciais);

    updateData.categoria_financeira_comissao_id = corretorParceiro ? categoriaFinanceiraComissaoAtual : null;
    updateData.competencia_comissao_data = corretorParceiro ? dataAssinaturaEfetiva : null;

    if (Object.prototype.hasOwnProperty.call(payload, 'possui_vaga_garagem') && !payload.possui_vaga_garagem) {
      updateData.quantidade_vagas_garagem = null;
      updateData.vagas_garagem_posicao = null;
    }

    if (['DISTRATADO', 'CANCELADO'].includes(updateData.status)) {
      const possuiBaixa = (contrato.parcelas || []).some((parcela) => Number(parcela.tituloFinanceiro?.valor_baixado || 0) > 0);
      if (possuiBaixa) {
        throw createHttpError(
          400,
          'Nao e possivel cancelar ou distratar contrato com parcelas que ja possuem recebimento registrado.'
        );
      }

      const tituloIds = (contrato.parcelas || [])
        .map((parcela) => Number(parcela.titulo_financeiro_id || parcela.tituloFinanceiro?.id || 0))
        .filter((value) => value > 0);

      if (tituloIds.length) {
        await TituloFinanceiro.update(
          {
            status: 'CANCELADO',
            valor_saldo: 0,
            atualizado_por: req.user?.id || null
          },
          {
            where: {
              id: tituloIds
            },
            transaction
          }
        );
      }
    }

    if (payload.categoria_financeira_id !== undefined) {
      const tituloIds = (contrato.parcelas || [])
        .map((parcela) => Number(parcela.titulo_financeiro_id || parcela.tituloFinanceiro?.id || 0))
        .filter((value) => value > 0);

      if (tituloIds.length) {
        await TituloFinanceiro.update(
          {
            categoria_financeira_id: payload.categoria_financeira_id || null,
            empresa_id: empresaContratoId,
            atualizado_por: req.user?.id || null
          },
          {
            where: {
              id: tituloIds,
              valor_baixado: 0
            },
            transaction
          }
        );
      }
    }

    if (atualizarDataAssinatura) {
      const tituloIds = (contrato.parcelas || [])
        .map((parcela) => Number(parcela.titulo_financeiro_id || parcela.tituloFinanceiro?.id || 0))
        .filter((value) => value > 0);

      await ContratoComercialParcela.update(
        { competencia_data: dataAssinaturaAtualizada },
        {
          where: { contrato_comercial_id: contrato.id },
          transaction
        }
      );

      if (tituloIds.length) {
        await TituloFinanceiro.update(
          {
            competencia_data: dataAssinaturaAtualizada,
            atualizado_por: req.user?.id || null
          },
          {
            where: {
              id: { [Op.in]: tituloIds },
              valor_baixado: 0
            },
            transaction
          }
        );

        await ChequeTerceiro.update(
          {
            data_entrada: dataAssinaturaAtualizada,
            atualizado_por: req.user?.id || null
          },
          {
            where: {
              titulo_financeiro_id: { [Op.in]: tituloIds },
              status: 'EM_CARTEIRA'
            },
            transaction
          }
        );
      }
    }

    await ContratoComercial.update(updateData, {
      where: { id: contrato.id },
      transaction
    });

    if (atualizarCompradores) {
      await salvarCompradoresContrato({
        contratoId: contrato.id,
        compradores: compradoresValidados,
        transaction
      });
    }
    if (unidadesValidadas) {
      await salvarUnidadesContrato({
        contratoId: contrato.id,
        unidades: unidadesValidadas,
        usuarioId: req.user?.id || null,
        transaction
      });
    }

    const contratoAtualizado = await ContratoComercial.findByPk(contrato.id, { transaction });
    const tituloComissao = await sincronizarTituloComissao({
      req,
      transaction,
      contrato: contratoAtualizado,
      corretorParceiro,
      categoriaFinanceiraComissaoId: contratoAtualizado.categoria_financeira_comissao_id,
      empresaId: empresaContratoId
    });

    if (tituloComissao && Number(contratoAtualizado.titulo_financeiro_comissao_id || 0) !== Number(tituloComissao.id || 0)) {
      await contratoAtualizado.update({
        titulo_financeiro_comissao_id: tituloComissao.id,
        atualizado_por: req.user?.id || null
      }, { transaction });
    }

    await sincronizarSituacaoUnidade(contratoAtualizado, transaction);
    if (unidadesValidadas) {
      const novasIds = new Set(unidadesValidadas.map((item) => item.unidade_comercial_id));
      for (const unidadeId of unidadesAnterioresIds.filter((item) => !novasIds.has(item))) {
        const bloqueante = await localizarContratoBloqueanteDaUnidade(unidadeId, contrato.id, transaction);
        if (!bloqueante) {
          await UnidadeComercial.update({
            situacao: 'DISPONIVEL', parceiro_reserva_id: null, reservado_ate: null
          }, { where: { id: unidadeId }, transaction });
        }
      }
    }

    await transaction.commit();

    await registrarEventoSeguranca({
      req,
      usuarioId: req.user?.id || null,
      tipoEvento: 'COMMERCIAL_CONTRACT_UPDATED',
      recursoTipo: 'CONTRATO_COMERCIAL',
      recursoId: contrato.id,
      status: 'SUCCESS',
      descricao: 'Contrato comercial atualizado',
      metadata: {
        campos: Object.keys(payload || {})
      }
    });

    return carregarContratoComercial(contrato.id);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function sincronizarStatusFinanceiroContratoComercial(req, id) {
  const contrato = await carregarContratoComercial(id);
  const statusAtual = normalizeContractStatus(contrato.status);
  if (['DISTRATADO', 'CANCELADO', 'RASCUNHO'].includes(statusAtual)) {
    return contrato;
  }

  const statusSugerido = contrato.indicadoresFinanceiros?.status_sugerido || 'ATIVO';
  if (statusSugerido === statusAtual) {
    return contrato;
  }

  const transaction = await sequelize.transaction();
  try {
    await ContratoComercial.update(
      {
        status: statusSugerido,
        atualizado_por: req.user?.id || null
      },
      {
        where: { id: contrato.id },
        transaction
      }
    );

    await registrarEventoContratoComercial({
      transaction,
      contratoId: contrato.id,
      tipoEvento: 'SINCRONIZACAO_FINANCEIRA',
      dataEvento: getToday(),
      descricao: `Status ajustado de ${statusAtual} para ${statusSugerido} com base no financeiro`,
      metadata: {
        status_anterior: statusAtual,
        status_novo: statusSugerido,
        indicadores: contrato.indicadoresFinanceiros
      },
      usuarioId: req.user?.id || null
    });

    const contratoAtualizado = await ContratoComercial.findByPk(contrato.id, { transaction });
    await sincronizarSituacaoUnidade(contratoAtualizado, transaction);
    await transaction.commit();

    return carregarContratoComercial(contrato.id);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function distratarContratoComercial(req, id, payload = {}) {
  const contrato = await carregarContratoComercial(id);
  const statusAtual = normalizeContractStatus(contrato.status);
  if (['DISTRATADO', 'CANCELADO'].includes(statusAtual)) {
    throw createHttpError(400, 'O contrato comercial ja esta encerrado.');
  }

  const possuiBaixa = (contrato.parcelas || []).some((parcela) => Number(parcela.tituloFinanceiro?.valor_baixado || 0) > 0);
  if (possuiBaixa) {
    throw createHttpError(400, 'Nao e possivel distratar contrato com recebimentos ja registrados.');
  }

  const transaction = await sequelize.transaction();
  try {
    const tituloIds = (contrato.parcelas || [])
      .map((parcela) => Number(parcela.titulo_financeiro_id || parcela.tituloFinanceiro?.id || 0))
      .filter((value) => value > 0);

    if (tituloIds.length) {
      await TituloFinanceiro.update(
        {
          status: 'CANCELADO',
          valor_saldo: 0,
          atualizado_por: req.user?.id || null
        },
        {
          where: { id: tituloIds },
          transaction
        }
      );
    }

    await ContratoComercial.update(
      {
        status: 'DISTRATADO',
        data_distrato: payload.data_distrato,
        motivo_distrato: payload.motivo_distrato,
        observacoes: mergeObservacoes(contrato.observacoes, payload.observacoes),
        atualizado_por: req.user?.id || null
      },
      {
        where: { id: contrato.id },
        transaction
      }
    );

    const contratoAtualizado = await ContratoComercial.findByPk(contrato.id, { transaction });
    const tituloComissao = await sincronizarTituloComissao({
      req,
      transaction,
      contrato: contratoAtualizado,
      corretorParceiro: contrato.corretorParceiro || null,
      categoriaFinanceiraComissaoId: contratoAtualizado.categoria_financeira_comissao_id,
      empresaId: getEmpresaObraParaTitulo(contrato.obra, 'obra do contrato comercial')
    });

    if (tituloComissao && Number(contratoAtualizado.titulo_financeiro_comissao_id || 0) !== Number(tituloComissao.id || 0)) {
      await contratoAtualizado.update({
        titulo_financeiro_comissao_id: tituloComissao.id,
        atualizado_por: req.user?.id || null
      }, { transaction });
    }

    await registrarEventoContratoComercial({
      transaction,
      contratoId: contrato.id,
      tipoEvento: 'DISTRATO',
      dataEvento: payload.data_distrato,
      descricao: payload.motivo_distrato,
      metadata: {
        observacoes: payload.observacoes || null
      },
      usuarioId: req.user?.id || null
    });

    await sincronizarSituacaoUnidade(contratoAtualizado, transaction);
    await transaction.commit();

    return carregarContratoComercial(contrato.id);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function reduzirTitulosPorTrocaUnidade({ parcelas, diferenca, transaction, usuarioId, observacoes }) {
  let restante = roundCurrency(Math.abs(diferenca));
  const elegiveis = [...(parcelas || [])]
    .filter((parcela) => {
      const titulo = parcela.tituloFinanceiro;
      const status = String(titulo?.status || '').toUpperCase();
      return titulo && Number(titulo.valor_baixado || 0) === 0 && ['ABERTO', 'PARCIAL'].includes(status);
    })
    .sort((a, b) => Number(b.sequencia || 0) - Number(a.sequencia || 0));

  for (const parcela of elegiveis) {
    if (restante <= 0) break;
    const titulo = await TituloFinanceiro.findByPk(parcela.tituloFinanceiro.id, { transaction });
    const parcelaDb = await ContratoComercialParcela.findByPk(parcela.id, { transaction });
    const valorOriginal = roundCurrency(titulo.valor_original);
    const abatimento = Math.min(valorOriginal, restante);
    const novoValor = roundCurrency(valorOriginal - abatimento);

    await titulo.update({
      valor_original: novoValor,
      valor_saldo: novoValor,
      status: novoValor <= 0 ? 'CANCELADO' : 'ABERTO',
      observacoes: mergeObservacoes(titulo.observacoes, observacoes),
      atualizado_por: usuarioId || null
    }, { transaction });

    await parcelaDb.update({
      valor_original: novoValor,
      observacoes: mergeObservacoes(parcelaDb.observacoes, observacoes)
    }, { transaction });

    restante = roundCurrency(restante - abatimento);
  }

  if (restante > 0) {
    throw createHttpError(400, 'Nao ha saldo aberto suficiente para reduzir o valor do contrato na troca de unidade.');
  }
}

async function trocarUnidadeContratoComercial(req, id, payload = {}) {
  const contrato = await carregarContratoComercial(id);
  const statusAtual = normalizeContractStatus(contrato.status);
  if (['DISTRATADO', 'CANCELADO'].includes(statusAtual)) {
    throw createHttpError(400, 'Nao e possivel trocar a unidade de um contrato encerrado.');
  }

  const unidadesContrato = Array.isArray(contrato.unidades) ? contrato.unidades : [];
  const unidadeOrigemId = Number(
    payload.unidade_comercial_origem_id
    || (unidadesContrato.length === 1 ? unidadesContrato[0].unidade_comercial_id : 0)
    || contrato.unidade_comercial_id
  );
  if (unidadesContrato.length > 1 && !payload.unidade_comercial_origem_id) {
    throw createHttpError(400, 'Informe qual unidade do contrato sera substituida.');
  }
  const vinculoOrigem = unidadesContrato.find((item) => Number(item.unidade_comercial_id) === unidadeOrigemId);
  if (!vinculoOrigem) throw createHttpError(400, 'A unidade de origem nao pertence ao contrato.');

  const unidadeDestino = await ensureUnidadeExists(payload.unidade_comercial_destino_id);
  if (unidadesContrato.some((item) => Number(item.unidade_comercial_id) === Number(unidadeDestino.id))) {
    throw createHttpError(400, 'A unidade de destino ja pertence ao contrato.');
  }
  if (unidadesContrato.length > 1 && Number(unidadeDestino.empreendimento_id) !== Number(contrato.empreendimento_id)) {
    throw createHttpError(400, 'Em contrato multiunidade, a troca deve permanecer no mesmo empreendimento.');
  }

  await ensureUnidadeDisponivelParaContrato(unidadeDestino, contrato.parceiro_id, contrato.id);
  const empreendimentoDestino = await ensureEmpreendimentoExists(unidadeDestino.empreendimento_id);
  const obraDestino = empreendimentoDestino.obra_id ? await ensureObraExists(empreendimentoDestino.obra_id) : await ensureObraExists(contrato.obra_id);
  const empresaDestinoId = getEmpresaObraParaTitulo(obraDestino, 'obra do contrato comercial');
  const valorAtual = roundCurrency(contrato.valor_total);
  const novoValorTotal = payload.novo_valor_total != null ? roundCurrency(payload.novo_valor_total) : valorAtual;
  const diferenca = roundCurrency(novoValorTotal - valorAtual);
  const dataEfetiva = payload.data_efetiva || getToday();
  const competenciaAjuste = payload.competencia_data || null;
  if (diferenca > 0 && !competenciaAjuste) {
    throw createHttpError(400, 'Competencia DRE do ajuste e obrigatoria quando a troca de unidade aumenta o valor do contrato.');
  }
  const observacoesTroca = mergeObservacoes(
    payload.observacoes,
    `Troca de unidade: ${vinculoOrigem.unidade?.codigo || unidadeOrigemId} -> ${unidadeDestino.codigo}`
  );

  const transaction = await sequelize.transaction();
  try {
    if (diferenca < 0) {
      await reduzirTitulosPorTrocaUnidade({
        parcelas: contrato.parcelas || [],
        diferenca,
        transaction,
        usuarioId: req.user?.id || null,
        observacoes: observacoesTroca
      });
    }

    const contratoDb = await ContratoComercial.findByPk(contrato.id, { transaction });

    if (diferenca > 0) {
      const sequencia = ((contrato.parcelas || []).reduce((max, parcela) => Math.max(max, Number(parcela.sequencia || 0)), 0)) + 1;
      const parcelaAjuste = {
        sequencia,
        descricao: `Ajuste por troca de unidade - ${unidadeDestino.codigo}`,
        tipo_parcela: 'OUTRA',
        forma_recebimento_prevista: 'OUTROS',
        reajuste_tipo: 'FIXA',
        data_vencimento: dataEfetiva,
        competencia_data: competenciaAjuste,
        valor: diferenca,
        observacoes: observacoesTroca
      };

      const tituloAjuste = await TituloFinanceiro.create(
        buildTituloContratoPayload({
          contrato: {
            ...contratoDb.toJSON(),
            obra_id: obraDestino.id,
            parceiro_id: contrato.parceiro_id,
            data_contrato: contrato.data_contrato
          },
          parcela: parcelaAjuste,
          categoriaFinanceiraId: contrato.categoria_financeira_id,
          empresaId: empresaDestinoId,
          usuarioId: req.user?.id || null
        }),
        { transaction }
      );

      await ContratoComercialParcela.create({
        contrato_comercial_id: contrato.id,
        titulo_financeiro_id: tituloAjuste.id,
        sequencia,
        tipo_parcela: parcelaAjuste.tipo_parcela,
        descricao: parcelaAjuste.descricao,
        forma_recebimento_prevista: parcelaAjuste.forma_recebimento_prevista,
        reajuste_tipo: parcelaAjuste.reajuste_tipo,
        data_vencimento: parcelaAjuste.data_vencimento,
        competencia_data: parcelaAjuste.competencia_data,
        valor_original: roundCurrency(parcelaAjuste.valor),
        observacoes: parcelaAjuste.observacoes
      }, { transaction });
    }

    const unidadePrincipalId = vinculoOrigem.principal
      ? unidadeDestino.id
      : contrato.unidade_comercial_id;
    const unidadesAtualizadas = unidadesContrato.map((item) => (
      Number(item.unidade_comercial_id) === unidadeOrigemId
        ? {
            unidade_comercial_id: unidadeDestino.id,
            ordem: item.ordem,
            principal: item.principal,
            valor_cadastro_referencia: unidadeDestino.valor_base_venda ?? unidadeDestino.valor_tabela ?? null,
            valor_atribuido: roundCurrency(Number(item.valor_atribuido || 0) + diferenca),
            unidade: unidadeDestino
          }
        : {
            unidade_comercial_id: item.unidade_comercial_id,
            ordem: item.ordem,
            principal: item.principal,
            valor_cadastro_referencia: item.valor_cadastro_referencia,
            valor_atribuido: roundCurrency(item.valor_atribuido),
            unidade: item.unidade
          }
    ));
    normalizarUnidadesContratoPayload(unidadesAtualizadas, unidadePrincipalId, novoValorTotal);
    await salvarUnidadesContrato({
      contratoId: contrato.id,
      unidades: unidadesAtualizadas,
      usuarioId: req.user?.id || null,
      transaction
    });

    await contratoDb.update({
      unidade_comercial_id: unidadePrincipalId,
      empreendimento_id: empreendimentoDestino.id,
      obra_id: obraDestino.id,
      valor_total: novoValorTotal,
      observacoes: mergeObservacoes(contrato.observacoes, observacoesTroca),
      atualizado_por: req.user?.id || null
    }, { transaction });

    await UnidadeComercial.update(
      {
        situacao: 'DISPONIVEL',
        parceiro_reserva_id: null,
        reservado_ate: null
      },
      {
        where: { id: unidadeOrigemId },
        transaction
      }
    );

    const contratoAtualizado = await ContratoComercial.findByPk(contrato.id, { transaction });
    const tituloComissao = await sincronizarTituloComissao({
      req,
      transaction,
      contrato: contratoAtualizado,
      corretorParceiro: contrato.corretorParceiro || null,
      categoriaFinanceiraComissaoId: contratoAtualizado.categoria_financeira_comissao_id,
      empresaId: empresaDestinoId
    });

    if (tituloComissao && Number(contratoAtualizado.titulo_financeiro_comissao_id || 0) !== Number(tituloComissao.id || 0)) {
      await contratoAtualizado.update({
        titulo_financeiro_comissao_id: tituloComissao.id,
        atualizado_por: req.user?.id || null
      }, { transaction });
    }

    await registrarEventoContratoComercial({
      transaction,
      contratoId: contrato.id,
      tipoEvento: 'TROCA_UNIDADE',
      dataEvento: dataEfetiva,
      descricao: `Troca da unidade ${vinculoOrigem.unidade?.codigo || unidadeOrigemId} para ${unidadeDestino.codigo}`,
      metadata: {
        unidade_origem_id: unidadeOrigemId,
        unidade_destino_id: unidadeDestino.id,
        valor_anterior: valorAtual,
        novo_valor_total: novoValorTotal,
        diferenca
      },
      usuarioId: req.user?.id || null
    });

    await sincronizarSituacaoUnidade(contratoAtualizado, transaction);
    await transaction.commit();

    return carregarContratoComercial(contrato.id);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function excluirContratoComercial(req, id) {
  if (!isSuperadminUser(req.user)) {
    throw createHttpError(403, 'Apenas SUPERADMIN pode excluir contratos comerciais.');
  }

  const contrato = await carregarContratoComercial(id);
  const possuiDocumentoAssinado = await contratoPossuiDocumentoAssinado(contrato.id);
  if (possuiDocumentoAssinado) {
    throw createHttpError(400, 'Nao e possivel excluir contrato com documento assinado digitalmente.');
  }

  const tituloIds = Array.from(new Set([
    ...(contrato.parcelas || [])
      .map((parcela) => Number(parcela.titulo_financeiro_id || parcela.tituloFinanceiro?.id || 0)),
    Number(contrato.titulo_financeiro_comissao_id || 0)
  ].filter((value) => value > 0)));

  if (tituloIds.length) {
    const tituloComBaixa = await TituloFinanceiro.findOne({
      where: {
        id: { [Op.in]: tituloIds },
        [Op.or]: [
          { valor_baixado: { [Op.gt]: 0 } },
          { status: { [Op.in]: ['BAIXADO', 'PAGO', 'QUITADO', 'CONCILIADO'] } }
        ]
      }
    });

    if (tituloComBaixa) {
      throw createHttpError(400, 'Nao e possivel excluir contrato com titulos financeiros baixados ou conciliados.');
    }
  }

  const transaction = await sequelize.transaction();
  try {
    const unidadeIdsContrato = await listarUnidadeIdsContrato(contrato, transaction);
    if (tituloIds.length) {
      await TituloFinanceiro.update(
        {
          status: 'CANCELADO',
          valor_saldo: 0,
          atualizado_por: req.user?.id || null
        },
        {
          where: { id: { [Op.in]: tituloIds } },
          transaction
        }
      );
    }

    await ContratoComercial.update(
      {
        status: 'EXCLUIDO',
        atualizado_por: req.user?.id || null
      },
      {
        where: { id: contrato.id },
        transaction
      }
    );

    for (const unidadeId of unidadeIdsContrato) {
      const contratoAtivoUnidade = await localizarContratoBloqueanteDaUnidade(unidadeId, contrato.id, transaction);
      if (!contratoAtivoUnidade) {
        await UnidadeComercial.update(
          { situacao: 'DISPONIVEL', parceiro_reserva_id: null, reservado_ate: null },
          { where: { id: unidadeId }, transaction }
        );
      }
    }

    await transaction.commit();

    await registrarEventoSeguranca({
      req,
      usuarioId: req.user?.id || null,
      tipoEvento: 'COMMERCIAL_CONTRACT_DELETED',
      recursoTipo: 'CONTRATO_COMERCIAL',
      recursoId: contrato.id,
      status: 'SUCCESS',
      descricao: 'Contrato comercial excluido por SUPERADMIN antes da assinatura digital',
      metadata: {
        numero: contrato.numero,
        empreendimento_id: contrato.empreendimento_id,
        unidade_comercial_id: contrato.unidade_comercial_id,
        unidades_comerciais_ids: unidadeIdsContrato,
        parceiro_id: contrato.parceiro_id,
        titulos_cancelados: tituloIds
      }
    });

    return { ok: true, softDelete: true };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

module.exports = {
  ativarTabelaPrecoComercial,
  atualizarContratoComercial,
  atualizarEmpreendimento,
  atualizarTabelaPrecoComercial,
  atualizarUnidadeComercial,
  carregarContratoComercial,
  criarContratoComercial,
  criarEmpreendimento,
  criarTabelaPrecoComercial,
  criarUnidadeComercial,
  distratarContratoComercial,
  excluirContratoComercial,
  excluirUnidadeComercial,
  listarCategoriasFinanceirasComercial,
  listarContratosComerciais,
  listarEmpreendimentos,
  listarObrasComerciais,
  listarTabelasPrecoComerciais,
  listarUnidadesComerciais,
  obterConfiguracaoUnidadesComerciais,
  atualizarConfiguracaoUnidadesComerciais,
  sincronizarContratoComercialPorTituloEditado,
  sincronizarStatusFinanceiroContratoComercial,
  trocarUnidadeContratoComercial
};
