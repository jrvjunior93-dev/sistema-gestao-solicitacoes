const {
  Anexo,
  ArquivoModelo,
  Comprovante,
  Contrato,
  ContratoAnexo,
  ConversaInterna,
  ConversaInternaAnexo,
  ConversaInternaParticipante,
  Historico,
  Notificacao,
  NotificacaoDestinatario,
  Solicitacao,
  SolicitacaoCompra,
  SolicitacaoCompraItem,
  SolicitacaoCompraItemManual
} = require('../models');
const { Op, col, fn, where: sequelizeWhere } = require('sequelize');
const {
  buildUserScopeTokens,
  canAccessComprovantes,
  getUserObraScopeIds,
  hasObraAccess,
  isBusinessAdmin
} = require('./authorizationService');
const { canViewArquivoModeloPage } = require('./arquivoModeloAccessService');
const { userHasSetorCapability } = require('./setorCapabilityService');
const { registrarEventoSeguranca } = require('./securityLogService');
const { podeVisualizarSolicitacaoPelaFila } = require('./solicitacaoFilaPagamentoAcessoService');

async function hasLegacyContractGlobalAccess(tokens, user) {
  return (
    isBusinessAdmin(user) ||
    tokens.includes('SUPERADMIN') ||
    (tokens.includes('ADMIN') && await userHasSetorCapability(user, 'eh_setor_geo'))
  );
}

async function hasLegacyCompraGlobalAccess(tokens, user) {
  return (
    tokens.includes('SUPERADMIN') ||
    tokens.includes('ADMIN') ||
    await userHasSetorCapability(user, 'eh_setor_compras') ||
    await userHasSetorCapability(user, 'eh_setor_geo')
  );
}

async function logFileDenied(req, resourceType, resourceId, descricao, metadata = null) {
  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'FILE_ACCESS_DENIED',
    recursoTipo: resourceType,
    recursoId: resourceId != null ? String(resourceId) : null,
    status: 'DENIED',
    descricao,
    metadata
  });
}

function normalizeAccessToken(value) {
  return String(value || '')
    .trim()
    .toUpperCase();
}

function normalizeComparableToken(value) {
  return normalizeAccessToken(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const AREA_ACCESS_ALIASES = {
  COMPRAS: ['COMPRAS', 'SETOR DE COMPRAS', 'DEPARTAMENTO DE COMPRAS'],
  GEO: ['GEO', 'GERENCIA DE PROCESSOS', 'GERÊNCIA DE PROCESSOS', 'GERENCIA_PROCESSOS'],
  FINANCEIRO: ['FINANCEIRO', 'SETOR FINANCEIRO'],
  OBRA: ['OBRA', 'OBRAS', 'SETOR OBRA', 'SETOR DE OBRA'],
  ADMINISTRATIVO: ['ADMINISTRATIVO', 'ADMIN'],
  MARKETING: ['MARKETING'],
  RH: ['RH', 'DP', 'RH/DP', 'RECURSOS HUMANOS'],
  FISCAL: ['FISCAL']
};

function buildAreaAccessCandidates(value) {
  const base = normalizeComparableToken(value);
  if (!base) return [];

  const candidates = new Set([base]);
  const compact = base.replace(/\s+/g, '_');
  candidates.add(compact);

  Object.entries(AREA_ACCESS_ALIASES).forEach(([key, aliases]) => {
    const comparableKey = normalizeComparableToken(key);
    const comparableAliases = aliases.map(normalizeComparableToken);
    if (comparableKey === base || comparableAliases.includes(base) || comparableAliases.includes(compact)) {
      comparableAliases.forEach((alias) => {
        candidates.add(alias);
        candidates.add(alias.replace(/\s+/g, '_'));
      });
    }
  });

  return Array.from(candidates).filter(Boolean);
}

function tokensContainValue(tokens, value) {
  const normalized = normalizeAccessToken(value);
  if (!normalized) return false;

  return (Array.isArray(tokens) ? tokens : [])
    .map(normalizeAccessToken)
    .filter(Boolean)
    .includes(normalized);
}

function tokensContainAreaValue(tokens, value) {
  const candidates = buildAreaAccessCandidates(value);
  if (!candidates.length) return false;

  const normalizedTokens = (Array.isArray(tokens) ? tokens : [])
    .flatMap((token) => {
      const comparable = normalizeComparableToken(token);
      if (!comparable) return [];
      return [comparable, comparable.replace(/\s+/g, '_')];
    });

  return candidates.some((candidate) => normalizedTokens.includes(candidate));
}

function parseHistoricoMetadata(metadata) {
  if (!metadata) return {};
  if (typeof metadata === 'object') return metadata;

  try {
    return JSON.parse(metadata);
  } catch (_) {
    return {};
  }
}

function parseObservacaoEnvioSetor(observacao) {
  const texto = String(observacao || '').trim();
  const match = texto.match(/^De\s+(.+?)\s+para\s+(.+)$/i);
  if (!match) return null;

  return {
    origem: String(match[1] || '').trim(),
    destino: String(match[2] || '').trim()
  };
}

function extrairSetoresEnvioHistorico(historico) {
  if (!historico || normalizeAccessToken(historico.acao) !== 'ENVIADA_SETOR') {
    return { origem: null, destino: null };
  }

  const metadata = parseHistoricoMetadata(historico.metadata);
  const envioTexto =
    parseObservacaoEnvioSetor(historico.observacao) ||
    parseObservacaoEnvioSetor(historico.descricao);

  return {
    origem:
      metadata.setor_origem ||
      metadata.setorOrigem ||
      metadata.origem ||
      envioTexto?.origem ||
      null,
    destino:
      metadata.setor_destino ||
      metadata.setorDestino ||
      metadata.destino ||
      envioTexto?.destino ||
      historico.setor ||
      null
  };
}

function historicoPertenceAoEscopoSetor(historico, tokens = []) {
  if (!historico || normalizeAccessToken(historico.acao) !== 'ENVIADA_SETOR') {
    return false;
  }

  const envio = extrairSetoresEnvioHistorico(historico);
  return (
    tokensContainAreaValue(tokens, envio.origem) ||
    tokensContainAreaValue(tokens, envio.destino)
  );
}

async function userSetorParticipatedInSolicitacao(user, solicitacaoId, tokens = null) {
  if (!solicitacaoId) return false;

  const userScopeTokens = Array.isArray(tokens)
    ? tokens
    : await buildUserScopeTokens(user);
  if (!userScopeTokens.length) return false;

  const historicos = await Historico.findAll({
    where: {
      solicitacao_id: solicitacaoId,
      acao: 'ENVIADA_SETOR'
    },
    attributes: ['acao', 'setor', 'observacao', 'descricao', 'metadata']
  });

  return historicos.some((historico) => (
    historicoPertenceAoEscopoSetor(historico, userScopeTokens)
  ));
}

async function userParticipatedInSolicitacao(user, solicitacaoId) {
  const usuarioId = Number(user?.id);
  if (!usuarioId || !solicitacaoId) return false;

  const historico = await Historico.findOne({
    where: {
      solicitacao_id: solicitacaoId,
      usuario_responsavel_id: usuarioId
    },
    attributes: ['id']
  });

  return Boolean(historico);
}

async function userMentionedInSolicitacao(user, solicitacaoId) {
  const usuarioId = Number(user?.id);
  if (!usuarioId || !solicitacaoId) return false;

  const mencao = await NotificacaoDestinatario.findOne({
    include: [
      {
        model: Notificacao,
        as: 'notificacao',
        required: true,
        where: {
          solicitacao_id: solicitacaoId,
          tipo: 'MENCAO_COMENTARIO'
        },
        attributes: ['id']
      }
    ],
    where: {
      usuario_id: usuarioId
    },
    attributes: ['id']
  });

  return Boolean(mencao);
}

async function canAccessContractResource(user, obraId) {
  const obrasPermitidas = await getUserObraScopeIds(user);
  if (obrasPermitidas === null) {
    return true;
  }

  if (obrasPermitidas.length > 0) {
    return obrasPermitidas.includes(Number(obraId));
  }

  const tokens = await buildUserScopeTokens(user);
  return hasLegacyContractGlobalAccess(tokens, user);
}

async function canAccessCompraResource(user, obraId) {
  const obrasPermitidas = await getUserObraScopeIds(user);
  if (obrasPermitidas === null) {
    return true;
  }

  if (obrasPermitidas.length > 0) {
    return obrasPermitidas.includes(Number(obraId));
  }

  const tokens = await buildUserScopeTokens(user);
  return hasLegacyCompraGlobalAccess(tokens, user);
}

async function canAccessConversa(req, conversaId) {
  const conversa = await ConversaInterna.findByPk(conversaId, {
    attributes: ['id', 'criado_por_id', 'destinatario_id']
  });

  if (!conversa) {
    return {
      allowed: false,
      status: 404,
      error: 'Conversa nao encontrada'
    };
  }

  const usuarioId = Number(req.user?.id);
  if (
    Number(conversa.criado_por_id) === usuarioId ||
    Number(conversa.destinatario_id) === usuarioId
  ) {
    return { allowed: true };
  }

  const participacao = await ConversaInternaParticipante.findOne({
    where: {
      conversa_id: conversa.id,
      usuario_id: usuarioId
    },
    attributes: ['id']
  });

  if (participacao) {
    return { allowed: true };
  }

  await logFileDenied(
    req,
    'CONVERSA',
    conversa.id,
    'Usuario tentou acessar anexo de conversa sem participacao',
    { conversa_id: conversa.id }
  );

  return {
    allowed: false,
    status: 403,
    error: 'Acesso negado ao anexo da conversa'
  };
}

async function canAccessSolicitacaoFile(req, solicitacaoId) {
  const solicitacao = await Solicitacao.findByPk(solicitacaoId, {
    attributes: ['id', 'obra_id', 'criado_por', 'area_responsavel']
  });

  if (!solicitacao) {
    return {
      allowed: false,
      status: 404,
      error: 'Solicitacao nao encontrada'
    };
  }

  if (isBusinessAdmin(req.user)) {
    return { allowed: true };
  }

  const usuarioId = Number(req.user?.id);
  if (usuarioId && Number(solicitacao.criado_por) === usuarioId) {
    return { allowed: true };
  }

  const hasObraScope = await hasObraAccess(req.user, solicitacao.obra_id);
  if (hasObraScope) {
    return { allowed: true };
  }

  const userScopeTokens = await buildUserScopeTokens(req.user);
  if (tokensContainAreaValue(userScopeTokens, solicitacao.area_responsavel)) {
    return { allowed: true };
  }

  if (await podeVisualizarSolicitacaoPelaFila(req.user, solicitacao.id)) {
    return { allowed: true };
  }

  const [setorParticipou, usuarioParticipou, usuarioMencionado] = await Promise.all([
    userSetorParticipatedInSolicitacao(req.user, solicitacao.id, userScopeTokens),
    userParticipatedInSolicitacao(req.user, solicitacao.id),
    userMentionedInSolicitacao(req.user, solicitacao.id)
  ]);

  if (setorParticipou || usuarioParticipou || usuarioMencionado) {
    return { allowed: true };
  }

  await logFileDenied(
    req,
    'SOLICITACAO',
    solicitacao.id,
    'Usuario sem acesso ao anexo da solicitacao',
    {
      obra_id: solicitacao.obra_id,
      criado_por: solicitacao.criado_por,
      area_responsavel: solicitacao.area_responsavel,
      usuario_area: req.user?.area || null,
      usuario_setor_id: req.user?.setor_id || null
    }
  );

  return {
    allowed: false,
    status: 403,
    error: 'Acesso negado ao anexo da solicitacao'
  };
}

async function canAccessContratoFile(req, contratoId) {
  const contrato = await Contrato.findByPk(contratoId, {
    attributes: ['id', 'obra_id']
  });

  if (!contrato) {
    return {
      allowed: false,
      status: 404,
      error: 'Contrato nao encontrado'
    };
  }

  const hasAdminFinanceLikeAccess =
    isBusinessAdmin(req.user) ||
    (String(req.user?.perfil || '').trim().toUpperCase() === 'ADMIN' &&
      await userHasSetorCapability(req.user, 'eh_setor_geo'));

  const hasScopeAccess = await canAccessContractResource(req.user, contrato.obra_id);
  if (hasAdminFinanceLikeAccess && hasScopeAccess) {
    return { allowed: true };
  }

  await logFileDenied(
    req,
    'CONTRATO',
    contrato.id,
    'Usuario sem permissao para acessar anexo de contrato',
    { obra_id: contrato.obra_id }
  );

  return {
    allowed: false,
    status: 403,
    error: 'Acesso negado ao anexo do contrato'
  };
}

async function canAccessComprovanteFile(req, comprovante) {
  if (comprovante?.solicitacao_id) {
    const acessoSolicitacao = await canAccessSolicitacaoFile(req, comprovante.solicitacao_id);
    if (acessoSolicitacao.allowed) {
      return acessoSolicitacao;
    }
  }

  const hasModuleAccess = await canAccessComprovantes(req.user);
  if (!hasModuleAccess) {
    await logFileDenied(
      req,
      'COMPROVANTE',
      comprovante.id,
      'Usuario sem permissao para acessar comprovante',
      { obra_id: comprovante.obra_id || null, solicitacao_id: comprovante.solicitacao_id || null }
    );
    return {
      allowed: false,
      status: 403,
      error: 'Acesso negado ao comprovante'
    };
  }

  return { allowed: true };
}

async function canAccessCompraFile(req, solicitacaoCompraId) {
  const solicitacaoCompra = await SolicitacaoCompra.findByPk(solicitacaoCompraId, {
    attributes: ['id', 'obra_id']
  });

  if (!solicitacaoCompra) {
    return {
      allowed: false,
      status: 404,
      error: 'Solicitacao de compra nao encontrada'
    };
  }

  const allowed = await canAccessCompraResource(req.user, solicitacaoCompra.obra_id);
  if (allowed) {
    return { allowed: true };
  }

  await logFileDenied(
    req,
    'SOLICITACAO_COMPRA',
    solicitacaoCompra.id,
    'Usuario sem acesso ao arquivo da solicitacao de compra',
    { obra_id: solicitacaoCompra.obra_id }
  );

  return {
    allowed: false,
    status: 403,
    error: 'Acesso negado ao arquivo da solicitacao de compra'
  };
}

function addCandidate(candidates, value) {
  const normalized = String(value || '').trim();
  if (!normalized) return;

  candidates.add(normalized);

  // URLs antigas do S3 e query strings podem alternar espacos entre "+" e
  // "%20"/espaco literal. Mantemos as variantes apenas para comparacao de
  // arquivos ja registrados, sem liberar acesso fora das regras existentes.
  if (normalized.includes('+')) {
    candidates.add(normalized.replace(/\+/g, ' '));
  }

  if (normalized.includes(' ')) {
    candidates.add(normalized.replace(/\s/g, '+'));
  }
}

function decodePathPart(value) {
  const rawValue = String(value || '').trim();
  if (!rawValue) return '';

  try {
    return decodeURIComponent(rawValue);
  } catch {
    const sanitizedValue = rawValue.replace(/%(?![0-9A-Fa-f]{2})/g, '%25');
    try {
      return decodeURIComponent(sanitizedValue);
    } catch {
      return rawValue;
    }
  }
}

function encodeStorageKey(value) {
  return String(value || '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function extractStorageKey(value) {
  const target = String(value || '').trim();
  if (!target) return '';

  try {
    const parsed = new URL(target);
    return decodePathPart(parsed.pathname.replace(/^\//, ''));
  } catch {
    return decodePathPart(target.replace(/^\/+/, ''));
  }
}

function buildFileTargetCandidates(alvo) {
  const candidates = new Set();
  const target = String(alvo || '').trim();
  addCandidate(candidates, target);

  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_REGION;
  const storageKey = extractStorageKey(target);

  try {
    const parsed = new URL(target);
    if (bucket && parsed.hostname.startsWith(`${bucket}.s3`)) {
      const rawKey = parsed.pathname.replace(/^\//, '');
      addCandidate(candidates, rawKey);
      addCandidate(candidates, decodePathPart(rawKey));

      if (region) {
        addCandidate(candidates, `https://${bucket}.s3.${region}.amazonaws.com/${rawKey}`);
        addCandidate(candidates, `https://${bucket}.s3.${region}.amazonaws.com/${encodeStorageKey(storageKey)}`);
        addCandidate(candidates, `https://${bucket}.s3.${region}.amazonaws.com/${storageKey}`);
      }
    }
  } catch {
    if (bucket && region && target && !target.startsWith('http')) {
      addCandidate(candidates, `https://${bucket}.s3.${region}.amazonaws.com/${target}`);
      addCandidate(candidates, `https://${bucket}.s3.${region}.amazonaws.com/${encodeStorageKey(storageKey)}`);
    }
  }

  addCandidate(candidates, storageKey);
  addCandidate(candidates, encodeStorageKey(storageKey));

  return Array.from(candidates);
}

function getRegisteredFilePath(target) {
  if (!target?.record) return null;

  if (target.kind === 'HISTORICO_SOLICITACAO_ARQUIVO') {
    return getMetadataFilePaths(target.record.metadata)[0] || null;
  }

  return (
    target.record.caminho_arquivo ||
    target.record.arquivo_url ||
    target.record.caminho ||
    null
  );
}

function parseMetadata(metadata) {
  if (!metadata) return null;
  if (typeof metadata === 'object') return metadata;

  try {
    return JSON.parse(metadata);
  } catch {
    return null;
  }
}

function getMetadataFilePaths(metadata) {
  const parsed = parseMetadata(metadata);
  if (!parsed) return [];

  return [
    parsed.caminho,
    parsed.caminho_arquivo,
    parsed.arquivo_url,
    parsed.url,
    parsed.file_url,
    parsed.download_url
  ].filter(Boolean);
}

function metadataPathMatches(metadata, candidates) {
  const candidateKeys = candidates.map(extractStorageKey).filter(Boolean);
  return getMetadataFilePaths(metadata).some((path) => {
    const pathCandidates = buildFileTargetCandidates(path);
    if (pathCandidates.some((candidate) => candidates.includes(candidate))) {
      return true;
    }

    const pathKey = extractStorageKey(path);
    return pathKey && candidateKeys.includes(pathKey);
  });
}

function isMissingColumnError(error, columnName) {
  const message = [
    error?.message,
    error?.parent?.message,
    error?.parent?.sqlMessage,
    error?.original?.message,
    error?.original?.sqlMessage
  ]
    .filter(Boolean)
    .join(' ');

  return (
    (error?.parent?.code === 'ER_BAD_FIELD_ERROR' || error?.original?.code === 'ER_BAD_FIELD_ERROR') &&
    message.includes(columnName)
  );
}

function isMissingTableError(error) {
  return (
    error?.parent?.code === 'ER_NO_SUCH_TABLE' ||
    error?.original?.code === 'ER_NO_SUCH_TABLE'
  );
}

async function findOneFileRecord(model, query) {
  try {
    return await model.findOne(query);
  } catch (error) {
    if (isMissingTableError(error)) {
      return null;
    }

    const hasDeletedAtFilter = Object.prototype.hasOwnProperty.call(query?.where || {}, 'deleted_at');
    if (!hasDeletedAtFilter || !isMissingColumnError(error, 'deleted_at')) {
      throw error;
    }

    const retryWhere = { ...query.where };
    delete retryWhere.deleted_at;
    return model.findOne({
      ...query,
      where: retryWhere
    });
  }
}

async function findHistoricoFileResource(fileCandidates) {
  const metadataPathFields = [
    '$.caminho',
    '$.caminho_arquivo',
    '$.arquivo_url',
    '$.url',
    '$.file_url',
    '$.download_url',
    '$.comprovante_pdf_url'
  ];

  try {
    const historico = await Historico.findOne({
      where: {
        [Op.or]: fileCandidates.flatMap((candidate) =>
          metadataPathFields.map((metadataPath) =>
            sequelizeWhere(
              fn('JSON_UNQUOTE', fn('JSON_EXTRACT', col('metadata'), metadataPath)),
              candidate
            )
          )
        )
      },
      attributes: ['id', 'solicitacao_id', 'metadata'],
      order: [['id', 'DESC']]
    });

    if (historico) {
      return historico;
    }
  } catch {
    // Alguns ambientes antigos mantem metadata como texto simples; se o banco
    // nao aceitar JSON_EXTRACT, fazemos uma varredura limitada nos historicos recentes.
  }

  const historicosRecentes = await Historico.findAll({
    attributes: ['id', 'solicitacao_id', 'metadata'],
    order: [['id', 'DESC']],
    limit: 1500
  });

  return historicosRecentes.find((historico) =>
    metadataPathMatches(historico.metadata, fileCandidates)
  ) || null;
}

async function resolveRegisteredFileResource(alvo) {
  const fileCandidates = buildFileTargetCandidates(alvo);
  const whereIn = { [Op.in]: fileCandidates };

  const anexo = await findOneFileRecord(Anexo, {
    where: { caminho_arquivo: whereIn, deleted_at: null },
    attributes: ['id', 'solicitacao_id', 'caminho_arquivo']
  });
  if (anexo) return { kind: 'SOLICITACAO_ANEXO', record: anexo };

  const contratoAnexo = await findOneFileRecord(ContratoAnexo, {
    where: { caminho_arquivo: whereIn },
    attributes: ['id', 'contrato_id', 'caminho_arquivo']
  });
  if (contratoAnexo) return { kind: 'CONTRATO_ANEXO', record: contratoAnexo };

  const comprovante = await findOneFileRecord(Comprovante, {
    where: { caminho_arquivo: whereIn, deleted_at: null },
    attributes: ['id', 'solicitacao_id', 'obra_id', 'caminho_arquivo']
  });
  if (comprovante) return { kind: 'COMPROVANTE', record: comprovante };

  const arquivoModelo = await findOneFileRecord(ArquivoModelo, {
    where: { arquivo_url: whereIn },
    attributes: ['id', 'pagina_codigo', 'arquivo_url', 'ativo']
  });
  if (arquivoModelo) return { kind: 'ARQUIVO_MODELO', record: arquivoModelo };

  const conversaAnexo = await findOneFileRecord(ConversaInternaAnexo, {
    where: { caminho: whereIn },
    attributes: ['id', 'conversa_id', 'caminho']
  });
  if (conversaAnexo) return { kind: 'CONVERSA_ANEXO', record: conversaAnexo };

  const compraItemArquivo = await findOneFileRecord(SolicitacaoCompraItem, {
    where: { arquivo_url: whereIn },
    attributes: ['id', 'solicitacao_compra_id', 'arquivo_url']
  });
  if (compraItemArquivo) return { kind: 'COMPRA_ITEM_ARQUIVO', record: compraItemArquivo };

  const compraItemManualArquivo = await findOneFileRecord(SolicitacaoCompraItemManual, {
    where: { arquivo_url: whereIn },
    attributes: ['id', 'solicitacao_compra_id', 'arquivo_url']
  });
  if (compraItemManualArquivo) {
    return { kind: 'COMPRA_ITEM_MANUAL_ARQUIVO', record: compraItemManualArquivo };
  }

  const historicoArquivo = await findHistoricoFileResource(fileCandidates);
  if (historicoArquivo) {
    return { kind: 'HISTORICO_SOLICITACAO_ARQUIVO', record: historicoArquivo };
  }

  return null;
}

async function assertRegisteredFileAccess(req, target) {
  if (!target?.kind || !target?.record) {
    return {
      allowed: false,
      status: 404,
      error: 'Arquivo nao encontrado'
    };
  }

  if (target.kind === 'SOLICITACAO_ANEXO') {
    return canAccessSolicitacaoFile(req, target.record.solicitacao_id);
  }

  if (target.kind === 'HISTORICO_SOLICITACAO_ARQUIVO') {
    return canAccessSolicitacaoFile(req, target.record.solicitacao_id);
  }

  if (target.kind === 'CONTRATO_ANEXO') {
    return canAccessContratoFile(req, target.record.contrato_id);
  }

  if (target.kind === 'COMPROVANTE') {
    return canAccessComprovanteFile(req, target.record);
  }

  if (target.kind === 'ARQUIVO_MODELO') {
    if (target.record.ativo === false) {
      return {
        allowed: false,
        status: 404,
        error: 'Arquivo nao encontrado'
      };
    }

    const allowed = await canViewArquivoModeloPage(req.user, target.record.pagina_codigo);
    if (allowed) {
      return { allowed: true };
    }

    await logFileDenied(
      req,
      'ARQUIVO_MODELO',
      target.record.id,
      'Usuario sem permissao para acessar arquivo modelo da pagina',
      { pagina_codigo: target.record.pagina_codigo }
    );

    return {
      allowed: false,
      status: 403,
      error: 'Acesso negado ao arquivo modelo'
    };
  }

  if (target.kind === 'CONVERSA_ANEXO') {
    return canAccessConversa(req, target.record.conversa_id);
  }

  if (target.kind === 'COMPRA_ITEM_ARQUIVO' || target.kind === 'COMPRA_ITEM_MANUAL_ARQUIVO') {
    return canAccessCompraFile(req, target.record.solicitacao_compra_id);
  }

  return {
    allowed: false,
    status: 403,
    error: 'Acesso negado ao arquivo'
  };
}

module.exports = {
  assertRegisteredFileAccess,
  canAccessSolicitacaoFile,
  getRegisteredFilePath,
  historicoPertenceAoEscopoSetor,
  resolveRegisteredFileResource
};
