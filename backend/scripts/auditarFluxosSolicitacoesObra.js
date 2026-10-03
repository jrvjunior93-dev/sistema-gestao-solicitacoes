process.env.DOTENV_CONFIG_QUIET = 'true';

const db = require('../src/models');
const { Op } = db.Sequelize;
const {
  applyTipoSolicitacaoModuleAvailability,
  normalizeTipoSolicitacaoBehavior,
  normalizeTipoSolicitacaoCodigo
} = require('../src/services/tipoSolicitacaoBehaviorService');
const {
  obterConfigCamposNovaSolicitacao,
  resolverCamposNovaSolicitacao
} = require('../src/services/novaSolicitacaoCamposConfig');
const {
  obterConfigAutomacaoDestinoNovaSolicitacao,
  obterRegraAutomacaoDestino
} = require('../src/services/novaSolicitacaoAutomacaoDestinoConfig');
const {
  obterConfiguracaoAutomacaoStatusSetor
} = require('../src/services/solicitacao/configuracoesVisibilidadeAutomacao');
const { getModuloConfig } = require('../src/services/moduleConfigService');
const {
  obterProvisionamentoFluxoConfig
} = require('../src/services/provisionamentoFluxoConfigService');
const { env } = require('../src/config/env');

const CONFIG_KEYS = [
  'AREAS_OBRA_VISIVEIS',
  'AREAS_POR_SETOR_ORIGEM',
  'TIPOS_SOLICITACAO_POR_SETOR',
  'NOVA_SOLICITACAO_CAMPOS_POR_TIPO',
  'NOVA_SOLICITACAO_AUTOMACAO_DESTINO',
  'TIPOS_COMPARTILHADOS_ENTRE_SETORES',
  'AUTOMACAO_STATUS_SETOR',
  'SETORES_SEM_ALTERACAO_STATUS',
  'SOLICITACOES_SLA_SETOR',
  'MODULOS_HABILITADOS',
  'PROVISIONAMENTO_FLUXO_CONFIG',
  'DIRETORIA_POR_CLASSIFICACAO_OBRA',
  'SETOR_DESTINO_APOS_APROVACAO_DIRETORIA'
];

function normalizeToken(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/^_+|_+$/g, '');
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

function parseArgs(argv = process.argv.slice(2)) {
  const defaults = new Date();
  defaults.setUTCFullYear(defaults.getUTCFullYear() - 2);
  const defaultSince = defaults.toISOString().slice(0, 10);
  const args = {
    desde: defaultSince,
    limiteSolicitacoes: 5000,
    incluirHistorico: true
  };

  argv.forEach((item) => {
    if (item.startsWith('--desde=')) {
      args.desde = item.slice('--desde='.length).trim();
    } else if (item.startsWith('--limite-solicitacoes=')) {
      const parsed = Number(item.slice('--limite-solicitacoes='.length));
      if (Number.isInteger(parsed) && parsed > 0) args.limiteSolicitacoes = parsed;
    } else if (item === '--sem-historico') {
      args.incluirHistorico = false;
    }
  });

  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.desde)) {
    throw new Error('Parametro --desde invalido. Use YYYY-MM-DD.');
  }
  return args;
}

function toPlain(model) {
  return model?.get ? model.get({ plain: true }) : model;
}

function unique(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).filter(Boolean)));
}

function sectorTokens(sector) {
  return unique([
    normalizeToken(sector?.codigo),
    normalizeToken(sector?.nome)
  ]);
}

function findConfigForSector(rules, sector) {
  for (const token of sectorTokens(sector)) {
    if (rules?.[token]) return rules[token];
  }
  return null;
}

function findListForOrigin(rules, originSectors) {
  const result = new Set();
  originSectors.forEach((sector) => {
    sectorTokens(sector).forEach((token) => {
      const values = rules?.[token];
      if (Array.isArray(values)) {
        values.forEach((value) => result.add(normalizeToken(value)));
      }
    });
  });
  return result;
}

function configLatestMap(rows) {
  const map = {};
  rows
    .map(toPlain)
    .sort((a, b) => Number(b.id) - Number(a.id))
    .forEach((item) => {
      if (map[item.chave]) return;
      map[item.chave] = {
        id: item.id,
        updated_at: item.updatedAt || null,
        valor: parseJson(item.valor, item.valor)
      };
    });
  return map;
}

function getConfigValue(configs, key, fallback = {}) {
  const value = configs?.[key]?.valor;
  return value && typeof value === 'object' ? value : fallback;
}

function stagesForSector(stages, sector) {
  const tokens = new Set(sectorTokens(sector));
  return stages
    .filter((stage) => tokens.has(normalizeToken(stage.setor)))
    .sort((a, b) => Number(a.ordem) - Number(b.ordem))
    .map((stage) => ({
      id: stage.id,
      nome: stage.nome,
      ordem: Number(stage.ordem),
      ativo: stage.ativo !== false
    }));
}

function summarizeFields(fields) {
  return Object.values(fields || {}).reduce((acc, field) => {
    if (field?.visivel) acc.visiveis.push(field.id);
    if (field?.obrigatorio) acc.obrigatorios.push(field.id);
    return acc;
  }, { visiveis: [], obrigatorios: [] });
}

function parseHistoricoMetadata(value) {
  return parseJson(value, {}) || {};
}

function parseEnvioTexto(value) {
  const match = String(value || '').trim().match(/^De\s+(.+?)\s+para\s+(.+)$/i);
  return match ? { origem: match[1].trim(), destino: match[2].trim() } : {};
}

function describeHistoryStep(history) {
  const action = normalizeToken(history?.acao) || 'ACAO_NAO_INFORMADA';
  const sector = normalizeToken(history?.setor);
  const status = normalizeToken(history?.status_novo);
  const metadata = parseHistoricoMetadata(history?.metadata);

  if (action === 'ENVIADA_SETOR') {
    const text = parseEnvioTexto(history?.observacao || history?.descricao);
    const origin = normalizeToken(
      metadata.setor_origem || metadata.setorOrigem || metadata.origem || text.origem
    );
    const destination = normalizeToken(
      metadata.setor_destino || metadata.setorDestino || metadata.destino || text.destino || history?.setor
    );
    return `ENVIO:${origin || '?'}>${destination || '?'}`;
  }

  const suffix = [sector && `SETOR=${sector}`, status && `STATUS=${status}`]
    .filter(Boolean)
    .join(',');
  return suffix ? `${action}(${suffix})` : action;
}

function chunk(values, size = 500) {
  const output = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }
  return output;
}

async function getObraUserIds(obraSectorIds) {
  if (obraSectorIds.length === 0) return [];
  const [primaryUsers, extraLinks] = await Promise.all([
    db.User.findAll({
      where: { setor_id: { [Op.in]: obraSectorIds } },
      attributes: ['id']
    }),
    db.UsuarioSetor.findAll({
      where: { setor_id: { [Op.in]: obraSectorIds } },
      attributes: ['user_id']
    })
  ]);
  return unique([
    ...primaryUsers.map((item) => Number(item.id)),
    ...extraLinks.map((item) => Number(item.user_id))
  ]).sort((a, b) => a - b);
}

async function loadHistoricalFlows({ userIds, since, limit }) {
  if (userIds.length === 0) {
    return { solicitacoes_analisadas: 0, caminhos: [], resumo_combinacoes: [] };
  }

  const requests = await db.Solicitacao.findAll({
    where: {
      criado_por: { [Op.in]: userIds },
      createdAt: { [Op.gte]: new Date(`${since}T00:00:00.000Z`) }
    },
    attributes: [
      'id',
      'tipo_solicitacao_id',
      'area_responsavel',
      'status_global',
      'cancelada',
      'fluxo_aprovacao_diretoria',
      'diretoria_fluxo_codigo',
      'setor_destino_pos_aprovacao',
      'obra_id',
      'createdAt'
    ],
    include: [
      { model: db.TipoSolicitacao, as: 'tipo', attributes: ['id', 'nome', 'codigo_interno'], required: false },
      { model: db.Obra, as: 'obra', attributes: ['id', 'classificacao', 'tipo_centro_custo'], required: false }
    ],
    order: [['createdAt', 'DESC']],
    limit
  });

  const plainRequests = requests.map(toPlain);
  const ids = plainRequests.map((item) => Number(item.id));
  const histories = [];
  for (const idsChunk of chunk(ids)) {
    const rows = await db.Historico.findAll({
      where: { solicitacao_id: { [Op.in]: idsChunk } },
      attributes: [
        'solicitacao_id',
        'setor',
        'acao',
        'status_anterior',
        'status_novo',
        'observacao',
        'descricao',
        'metadata',
        'createdAt'
      ],
      order: [['solicitacao_id', 'ASC'], ['createdAt', 'ASC'], ['id', 'ASC']]
    });
    histories.push(...rows.map(toPlain));
  }

  const creationEvents = [];
  for (const idsChunk of chunk(ids)) {
    const rows = await db.SecurityEventLog.findAll({
      where: {
        tipo_evento: 'SOLICITACAO_CREATED',
        recurso_tipo: 'SOLICITACAO',
        recurso_id: { [Op.in]: idsChunk.map(String) }
      },
      attributes: ['recurso_id', 'metadata', 'createdAt'],
      order: [['createdAt', 'ASC']]
    });
    creationEvents.push(...rows.map(toPlain));
  }

  const historiesByRequest = new Map();
  histories.forEach((item) => {
    const id = Number(item.solicitacao_id);
    if (!historiesByRequest.has(id)) historiesByRequest.set(id, []);
    historiesByRequest.get(id).push(item);
  });

  const creationByRequest = new Map();
  creationEvents.forEach((item) => {
    const id = Number(item.recurso_id);
    if (!creationByRequest.has(id)) creationByRequest.set(id, parseHistoricoMetadata(item.metadata));
  });

  const pathMap = new Map();
  const combinationMap = new Map();

  plainRequests.forEach((request) => {
    const creation = creationByRequest.get(Number(request.id)) || {};
    const typeCode = normalizeTipoSolicitacaoCodigo(request.tipo?.codigo_interno, request.tipo?.nome);
    const initialArea = normalizeToken(creation.area_responsavel) || 'NAO_RECUPERADA';
    const classification = normalizeToken(request.obra?.classificacao) || 'NAO_INFORMADA';
    const centerType = normalizeToken(request.obra?.tipo_centro_custo) || 'NAO_INFORMADO';
    const steps = (historiesByRequest.get(Number(request.id)) || []).map(describeHistoryStep);
    const path = steps.length > 0 ? steps.join(' -> ') : 'SEM_HISTORICO';
    const pathKey = [typeCode, initialArea, classification, path].join('|');
    const comboKey = [typeCode, initialArea, classification, centerType].join('|');

    if (!pathMap.has(pathKey)) {
      pathMap.set(pathKey, {
        tipo_codigo: typeCode,
        tipo_nome: request.tipo?.nome || null,
        area_inicial: initialArea,
        classificacao_obra: classification,
        caminho: path,
        ocorrencias: 0
      });
    }
    pathMap.get(pathKey).ocorrencias += 1;

    if (!combinationMap.has(comboKey)) {
      combinationMap.set(comboKey, {
        tipo_codigo: typeCode,
        tipo_nome: request.tipo?.nome || null,
        area_inicial: initialArea,
        classificacao_obra: classification,
        tipo_centro_custo: centerType,
        total: 0,
        canceladas: 0,
        com_fluxo_diretoria_legado: 0,
        status_finais: {}
      });
    }
    const combo = combinationMap.get(comboKey);
    combo.total += 1;
    if (Boolean(request.cancelada)) combo.canceladas += 1;
    if (Boolean(request.fluxo_aprovacao_diretoria)) combo.com_fluxo_diretoria_legado += 1;
    const finalStatus = normalizeToken(request.status_global) || 'NAO_INFORMADO';
    combo.status_finais[finalStatus] = (combo.status_finais[finalStatus] || 0) + 1;
  });

  return {
    desde: since,
    limite_aplicado: limit,
    solicitacoes_analisadas: plainRequests.length,
    caminhos: Array.from(pathMap.values())
      .sort((a, b) => b.ocorrencias - a.ocorrencias || a.tipo_codigo.localeCompare(b.tipo_codigo, 'pt-BR')),
    resumo_combinacoes: Array.from(combinationMap.values())
      .sort((a, b) => b.total - a.total || a.tipo_codigo.localeCompare(b.tipo_codigo, 'pt-BR'))
  };
}

async function run() {
  const args = parseArgs();
  await db.sequelize.authenticate();

  const [
    sectorRows,
    typeRows,
    subtypeRows,
    stageRows,
    configRows,
    modules,
    fieldsConfig,
    destinationConfig,
    statusAutomations,
    provisioningConfig
  ] = await Promise.all([
    db.Setor.findAll({
      attributes: [
        'id', 'codigo', 'nome', 'ativo', 'eh_setor_obra', 'eh_setor_financeiro',
        'eh_setor_compras', 'eh_setor_geo', 'eh_setor_administrativo'
      ],
      order: [['nome', 'ASC']]
    }),
    db.TipoSolicitacao.findAll({ order: [['nome', 'ASC']] }),
    db.TipoSubContrato.findAll({ order: [['tipo_macro_id', 'ASC'], ['nome', 'ASC']] }),
    db.EtapaSetor.findAll({ order: [['setor', 'ASC'], ['ordem', 'ASC']] }),
    db.ConfiguracaoSistema.findAll({
      where: { chave: { [Op.in]: CONFIG_KEYS } },
      attributes: ['id', 'chave', 'valor', 'updatedAt'],
      order: [['id', 'DESC']]
    }),
    getModuloConfig(),
    obterConfigCamposNovaSolicitacao(),
    obterConfigAutomacaoDestinoNovaSolicitacao(),
    obterConfiguracaoAutomacaoStatusSetor(),
    obterProvisionamentoFluxoConfig()
  ]);

  const sectors = sectorRows.map(toPlain);
  const types = typeRows.map(toPlain).map((type) => ({
    ...type,
    codigo_interno: normalizeTipoSolicitacaoCodigo(type.codigo_interno, type.nome),
    comportamento_normalizado: normalizeTipoSolicitacaoBehavior(type)
  }));
  const activeTypes = types.filter((type) => type.ativo !== false);
  const subtypes = subtypeRows.map(toPlain);
  const stages = stageRows.map(toPlain);
  const configs = configLatestMap(configRows);
  const obraSectors = sectors.filter((sector) => (
    sector.eh_setor_obra === true || sector.eh_setor_obra === 1 ||
    normalizeToken(sector.codigo) === 'OBRA' || normalizeToken(sector.nome) === 'OBRA'
  ));

  const areasObraConfig = getConfigValue(configs, 'AREAS_OBRA_VISIVEIS', { areas: [] });
  const areasByOriginConfig = getConfigValue(configs, 'AREAS_POR_SETOR_ORIGEM', { regras: {} });
  const typesBySectorConfig = getConfigValue(configs, 'TIPOS_SOLICITACAO_POR_SETOR', { regras: {} });
  const areasObraTokens = new Set(
    (Array.isArray(areasObraConfig.areas) ? areasObraConfig.areas : []).map(normalizeToken).filter(Boolean)
  );
  const areasByOriginTokens = findListForOrigin(areasByOriginConfig.regras || {}, obraSectors);

  let effectiveDestinationSectors = sectors.filter((sector) => sector.ativo !== false);
  if (areasByOriginTokens.size > 0) {
    effectiveDestinationSectors = effectiveDestinationSectors.filter((sector) => (
      sectorTokens(sector).some((token) => areasByOriginTokens.has(token))
    ));
  }
  if (areasObraTokens.size > 0) {
    effectiveDestinationSectors = effectiveDestinationSectors.filter((sector) => (
      sectorTokens(sector).some((token) => areasObraTokens.has(token))
    ));
  }

  const moduleMap = new Map(modules.map((item) => [item.key, Boolean(item.enabled)]));
  const combinations = [];

  effectiveDestinationSectors.forEach((sector) => {
    const typeRule = findConfigForSector(typesBySectorConfig.regras || {}, sector);
    const allowedIds = Array.isArray(typeRule?.tipos)
      ? typeRule.tipos.map(Number).filter((id) => Number.isInteger(id) && id > 0)
      : [];
    const allowedIdSet = new Set(allowedIds);
    const allowedTypes = allowedIdSet.size > 0
      ? activeTypes.filter((type) => allowedIdSet.has(Number(type.id)))
      : activeTypes;

    allowedTypes.forEach((type) => {
      const behavior = applyTipoSolicitacaoModuleAvailability(type.comportamento_normalizado, {
        contratos: moduleMap.get('CONTRATOS') !== false,
        apropriacoes: moduleMap.get('OBRAS') !== false
      });
      const fields = resolverCamposNovaSolicitacao(
        behavior,
        fieldsConfig,
        type.id,
        {
          apropriacoesDisponiveis: moduleMap.get('OBRAS') !== false,
          areaResponsavel: sector.codigo || sector.nome
        }
      );
      const configuredRedirect = obterRegraAutomacaoDestino(
        destinationConfig,
        sector.codigo || sector.nome,
        type.id
      );
      const isDirectPurchase = type.codigo_interno === 'COMPRA_DIRETA';
      const redirect = isDirectPurchase
        ? {
            ativo: true,
            destino: 'COMPRA_DIRETA',
            rota: '/solicitacoes-compra-direta/nova',
            preservar_obra: true,
            origem: 'REGRA_FIXA_FRONTEND'
          }
        : (configuredRedirect ? { ...configuredRedirect, origem: 'CONFIGURACAO_BANCO' } : null);

      combinations.push({
        area_responsavel: {
          id: sector.id,
          codigo: sector.codigo,
          nome: sector.nome
        },
        tipo_solicitacao: {
          id: type.id,
          codigo: type.codigo_interno,
          nome: type.nome
        },
        modo_recebimento: typeRule?.modos?.[String(type.id)] || 'TODOS_VISIVEIS',
        destino_inicial: redirect
          ? { tipo: 'REDIRECIONAMENTO_MODULO', ...redirect }
          : { tipo: 'SOLICITACAO_GERAL', rota: '/solicitacoes/:id', status_inicial: 'PENDENTE' },
        campos: summarizeFields(fields),
        subtipos_ativos: subtypes
          .filter((subtype) => Number(subtype.tipo_macro_id) === Number(type.id) && subtype.ativo !== false)
          .map((subtype) => ({ id: subtype.id, nome: subtype.nome })),
        status_disponiveis_setor: stagesForSector(stages, sector),
        automacoes_por_status: statusAutomations
          .filter((rule) => Number(rule.tipo_solicitacao_id) === Number(type.id))
          .map((rule) => ({ status: rule.status, setor_destino: rule.setor_destino })),
        exige_provisionamento: provisioningConfig.tipos_solicitacao_exigem_provisao
          .map(Number)
          .includes(Number(type.id))
      });
    });
  });

  const obraUserIds = args.incluirHistorico
    ? await getObraUserIds(obraSectors.map((sector) => Number(sector.id)))
    : [];
  const historical = args.incluirHistorico
    ? await loadHistoricalFlows({
        userIds: obraUserIds,
        since: args.desde,
        limit: args.limiteSolicitacoes
      })
    : { omitido: true };

  const report = {
    schema_version: '1.0.0',
    generated_at: new Date().toISOString(),
    environment: env.nodeEnv,
    database_name: env.dbName || null,
    read_only: true,
    privacy: 'Nao inclui nomes, e-mails, documentos, descricoes ou anexos de usuarios/solicitacoes.',
    objetivo: 'Mapear todas as combinacoes de solicitacao inicial disponiveis ao setor OBRA e validar os caminhos observados.',
    runtime_regras_fixadas_no_codigo: [
      'Nova solicitacao geral nasce no setor escolhido com status PENDENTE.',
      'Nova solicitacao nao ativa fluxo de aprovacao previa pela diretoria.',
      'Tipo COMPRA_DIRETA redireciona para /solicitacoes-compra-direta/nova.',
      'Em OBRA, status MERCADORIA_ENTREGUE nao movimenta a solicitacao por regra fixa; qualquer envio depende de AUTOMACAO_STATUS_SETOR.',
      'Status PENDENTE DE AJUSTE sempre devolve a solicitacao ao setor do usuario que a criou, antes de qualquer AUTOMACAO_STATUS_SETOR.',
      'Solicitacao devolvida para ajuste retorna ao setor anterior quando OBRA altera de PENDENTE_DE_AJUSTE/AGUARDANDO_AJUSTE para ATENDIDO.',
      'Outras mudancas automaticas de setor seguem AUTOMACAO_STATUS_SETOR.'
    ],
    setor_obra: obraSectors,
    setores_destino_efetivos: effectiveDestinationSectors.map((sector) => ({
      id: sector.id,
      codigo: sector.codigo,
      nome: sector.nome,
      capacidades: {
        obra: Boolean(sector.eh_setor_obra),
        financeiro: Boolean(sector.eh_setor_financeiro),
        compras: Boolean(sector.eh_setor_compras),
        geo: Boolean(sector.eh_setor_geo),
        administrativo: Boolean(sector.eh_setor_administrativo)
      }
    })),
    tipos_solicitacao_ativos: activeTypes.map((type) => ({
      id: type.id,
      codigo: type.codigo_interno,
      nome: type.nome,
      comportamento: type.comportamento_normalizado
    })),
    modulos_habilitados: modules.map((item) => ({ key: item.key, enabled: Boolean(item.enabled) })),
    configuracoes_relevantes: Object.fromEntries(
      Object.entries(configs).map(([key, item]) => [key, item.valor])
    ),
    combinacoes_nova_solicitacao_obra: combinations,
    total_combinacoes_configuradas: combinations.length,
    historico_agregado: historical,
    observacoes_para_desenho: [
      'As combinacoes configuradas definem o que o usuario pode iniciar hoje.',
      'O historico agregado serve para validar caminhos reais, mas nao substitui configuracoes sem uso recente.',
      'Configuracoes de diretoria sao exportadas apenas para identificar legado; novas solicitacoes persistem fluxo_aprovacao_diretoria=false.'
    ]
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

run()
  .catch((error) => {
    process.stderr.write(`${JSON.stringify({
      error: error.message,
      stack: error.stack,
      read_only: true
    }, null, 2)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.sequelize.close().catch(() => {});
  });
