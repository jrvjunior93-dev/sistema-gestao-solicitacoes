const crypto = require('crypto');
const { Op, fn, col } = require('sequelize');
const {
  ConciliacaoBancaria,
  ConciliacaoBancariaImportacao,
  ContaBancaria,
  CategoriaFinanceira,
  FaturaCartaoFinanceiro,
  CartaoFinanceiro,
  MovimentoFinanceiro,
  Obra,
  Parceiro,
  sequelize,
  TituloFinanceiro,
  TransferenciaFinanceira,
  User
} = require('../models');
const {
  canAccessFinanceiro,
  getFinanceiroObraScopeIds
} = require('./authorizationService');
const { registrarEventoSeguranca } = require('./securityLogService');
const { baixarFaturaCartao } = require('./faturaCartaoFinanceiroService');
const { obterSessaoAbertaParaConta } = require('./financeiroCaixaSessionHelper');
const { listarTarifasBancariasConfig } = require('./financeiroCadastroService');
const {
  criarTituloManualComBaixaAtomica,
  estornarMovimentoTitulo
} = require('./tituloFinanceiroService');
const { criarTransferenciaFinanceira } = require('./transferenciaFinanceiraService');
const {
  classifyBankReversal,
  datesWithinReversalWindow,
  hasOppositeExactAmount,
  scoreReversalCandidate
} = require('./conciliacaoEstornoBancarioService');
const {
  hasSameConciliacaoDate,
  hasSameConciliacaoValue,
  isExactOppositeBankTransfer,
  isExactConciliacaoMatch
} = require('../utils/conciliacaoMatch');

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function roundCurrency(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function normalizeConfigCode(value) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function parseInteger(value, fieldName) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw createHttpError(400, `${fieldName} invalido.`);
  }
  return normalized;
}

function normalizePositiveNumber(value, fallback = undefined) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const normalized = typeof value === 'number'
    ? value
    : Number(String(value)
      .trim()
      .replace(/\s+/g, '')
      .replace(/^R\$/i, '')
      .replace(/\./g, '')
      .replace(',', '.'));
  if (!Number.isFinite(normalized) || normalized < 0) {
    return fallback;
  }

  return normalized;
}

function hasExplicitFilterValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function resolveValueBounds(filters = {}) {
  const hasInitial = hasExplicitFilterValue(filters.valor_inicial);
  const hasFinal = hasExplicitFilterValue(filters.valor_final);
  if (!hasInitial && !hasFinal) {
    return { shouldFilter: false, lower: null, upper: null };
  }

  const initial = normalizePositiveNumber(filters.valor_inicial, undefined);
  const final = normalizePositiveNumber(filters.valor_final, undefined);
  const lower = Number(initial ?? final ?? 0);
  const upper = Number(final ?? initial ?? lower);

  return {
    shouldFilter: Number.isFinite(lower) || Number.isFinite(upper),
    lower: Math.min(lower, upper),
    upper: Math.max(lower, upper)
  };
}

const CLASSIFICACOES_INCOMPATIVEIS_COM_TARIFA = new Set([
  'ENDIVIDAMENTO',
  'INVESTIMENTO',
  'PATRIMONIAL',
  'INTERCOMPANY',
  'TRANSFERENCIA_INTERNA'
]);

function categoriaFinanceiraAptaParaTarifa(categoria) {
  if (!categoria || categoria.ativo === false) return false;
  const tipo = String(categoria.tipo || '').trim().toUpperCase();
  if (!['PAGAR', 'AMBOS'].includes(tipo)) return false;
  if (categoria.considera_dre === false || !String(categoria.dre_grupo || '').trim()) return false;
  const classificacao = String(categoria.classificacao_gerencial || '').trim().toUpperCase();
  return !CLASSIFICACOES_INCOMPATIVEIS_COM_TARIFA.has(classificacao);
}

function categoriaFinanceiraPareceTarifa(categoria) {
  const text = normalizeText([
    categoria?.nome,
    categoria?.descricao,
    categoria?.dre_grupo,
    categoria?.dre_subgrupo
  ].filter(Boolean).join(' '));
  return ['TARIFA', 'TAXA BANCARIA', 'DESPESA BANCARIA', 'DESPESAS BANCARIAS', 'RESULTADO FINANCEIRO'].some((term) => text.includes(term));
}

async function resolveCategoriaTarifaBancaria(tarifa, { transaction = null } = {}) {
  const categoriaId = Number(tarifa?.categoria_financeira_id || 0);
  if (Number.isInteger(categoriaId) && categoriaId > 0) {
    const categoria = await CategoriaFinanceira.findByPk(categoriaId, { transaction });
    if (!categoria) {
      throw createHttpError(400, 'Categoria financeira configurada para a tarifa bancaria nao foi encontrada.');
    }
    if (!categoriaFinanceiraAptaParaTarifa(categoria)) {
      throw createHttpError(400, 'Categoria financeira da tarifa bancaria deve estar ativa, ser PAGAR ou AMBOS e estar classificada para DRE.');
    }
    return categoria;
  }

  const categorias = await CategoriaFinanceira.findAll({
    where: {
      ativo: true,
      tipo: {
        [Op.in]: ['PAGAR', 'AMBOS']
      }
    },
    transaction,
    order: [['nome', 'ASC']]
  });

  const aptas = categorias.filter(categoriaFinanceiraAptaParaTarifa);
  const categoria = aptas.find(categoriaFinanceiraPareceTarifa) || aptas[0];
  if (!categoria) {
    throw createHttpError(400, 'Configure uma categoria financeira de tarifa bancaria em Financeiro > Cadastros para conciliar este atalho.');
  }

  return categoria;
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
    recursoTipo: 'CONCILIACAO_BANCARIA',
    recursoId: req.originalUrl,
    status: 'DENIED',
    descricao: 'Usuario sem permissao para acessar conciliacao bancaria'
  });

  throw createHttpError(403, 'Acesso negado para o modulo financeiro');
}

async function validarContaBancaria(contaBancariaId) {
  const conta = await ContaBancaria.findByPk(contaBancariaId);
  if (!conta || conta.ativo === false) {
    throw createHttpError(400, 'Conta bancaria invalida.');
  }
  return conta;
}

async function validarEmpresaConciliacaoComConta(conciliacao, { transaction = null } = {}) {
  const conta = await ContaBancaria.findByPk(conciliacao.conta_bancaria_id, { transaction });
  if (!conta || conta.ativo === false) {
    throw createHttpError(400, 'Conta bancaria da conciliacao invalida ou inativa.');
  }

  const empresaConciliacaoId = conciliacao.empresa_id ? Number(conciliacao.empresa_id) : null;
  const empresaContaId = conta.empresa_id ? Number(conta.empresa_id) : null;
  if (!empresaConciliacaoId) {
    throw createHttpError(400, 'Lancamento bancario sem empresa vinculada. Reimporte o OFX apos corrigir a conta bancaria.');
  }
  if (!empresaContaId) {
    throw createHttpError(400, 'Conta bancaria da conciliacao sem empresa vinculada.');
  }
  if (empresaConciliacaoId !== empresaContaId) {
    throw createHttpError(400, 'A empresa do lancamento bancario deve ser a mesma vinculada a conta bancaria.');
  }

  return { conta, empresaId: empresaConciliacaoId };
}

function decodeOfxBuffer(buffer) {
  const headerSnippet = buffer.toString('latin1', 0, Math.min(buffer.length, 2048));
  const encoding = (headerSnippet.match(/ENCODING:([^\r\n]+)/i)?.[1] || '').trim().toUpperCase();
  const charset = (headerSnippet.match(/CHARSET:([^\r\n]+)/i)?.[1] || '').trim().toUpperCase();

  if (encoding === 'UTF-8' || encoding === 'UNICODE') {
    return buffer.toString('utf8');
  }

  if (charset === '1252' || encoding === 'USASCII' || encoding === 'ASCII') {
    return buffer.toString('latin1');
  }

  const utf8Text = buffer.toString('utf8');
  if (/<OFX>|<STMTTRN>|<BANKTRANLIST>/i.test(utf8Text)) {
    return utf8Text;
  }

  return buffer.toString('latin1');
}

function extractTagValue(block, tagName) {
  const regex = new RegExp(`<${tagName}>([^<\\r\\n]*)`, 'i');
  const match = block.match(regex);
  return match ? String(match[1] || '').trim() : '';
}

function parseOfxDate(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 8) {
    return null;
  }

  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function parseOfxAmount(value) {
  const raw = String(value || '').trim().replace(/\s+/g, '').replace(',', '.');
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return roundCurrency(parsed);
}

function buildStableTransactionId({
  fitId,
  dataMovimento,
  valor,
  documento,
  descricao,
  tipoMovimento
}) {
  return crypto
    .createHash('sha1')
    .update(`${fitId || ''}|${dataMovimento}|${valor}|${documento || ''}|${descricao || ''}|${tipoMovimento || ''}`)
    .digest('hex');
}

function normalizeOfxIdentifier(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '';
  }

  if (/^0+$/.test(normalized.replace(/\D/g, ''))) {
    return '';
  }

  return normalized;
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function stripLeadingZeros(value) {
  return onlyDigits(value).replace(/^0+/, '') || '0';
}

function normalizeBankIdentifier(value) {
  const text = normalizeText(value);
  const digits = onlyDigits(value);
  if (digits) {
    return stripLeadingZeros(digits).padStart(3, '0');
  }
  if (text.includes('BANCO DO BRASIL') || text === 'BB') return '001';
  if (text.includes('CAIXA') || text.includes('CEF')) return '104';
  if (text.includes('BRADESCO')) return '237';
  if (text.includes('ITAU')) return '341';
  if (text.includes('SANTANDER')) return '033';
  if (text.includes('SICREDI')) return '748';
  if (text.includes('BANESTES') || text.includes('BANCO DO ESTADO DO ESPIRITO SANTO')) return '021';
  return text;
}

function bankAccountIdentifierMatches(left, right) {
  const a = stripLeadingZeros(left);
  const b = stripLeadingZeros(right);
  if (!a || !b || a === '0' || b === '0') {
    return false;
  }
  if (a === b) {
    return true;
  }
  if (a.length > 2 && b.length > 2 && a.slice(0, -1) === b) {
    return true;
  }
  if (a.length > 2 && b.length > 2 && b.slice(0, -1) === a) {
    return true;
  }
  return false;
}

function extractOfxAccountInfo(fileBuffer) {
  const rawText = decodeOfxBuffer(fileBuffer).replace(/\r/g, '\n');
  const normalizedText = rawText.replace(/>\s+</g, '><');
  return {
    bankId: extractTagValue(normalizedText, 'BANKID'),
    branchId: extractTagValue(normalizedText, 'BRANCHID'),
    accountId: extractTagValue(normalizedText, 'ACCTID'),
    accountType: extractTagValue(normalizedText, 'ACCTTYPE')
  };
}

function accountMatchesOfx(conta, ofxInfo) {
  if (!conta.ofx_account_id || !bankAccountIdentifierMatches(ofxInfo.accountId, conta.ofx_account_id)) {
    return false;
  }

  if (ofxInfo.branchId && conta.ofx_branch_id && !bankAccountIdentifierMatches(ofxInfo.branchId, conta.ofx_branch_id)) {
    return false;
  }

  const ofxBank = normalizeBankIdentifier(ofxInfo.bankId);
  if (ofxInfo.bankId && conta.ofx_bank_id && normalizeBankIdentifier(conta.ofx_bank_id) !== ofxBank) {
    return false;
  }

  return true;
}

async function resolveContaBancariaFromOfx(fileBuffer, { contaBancariaId = null } = {}) {
  if (contaBancariaId) {
    return validarContaBancaria(contaBancariaId);
  }

  const ofxInfo = extractOfxAccountInfo(fileBuffer);
  const contas = await ContaBancaria.findAll({
    where: { ativo: true },
    attributes: ['id', 'nome', 'banco', 'agencia', 'conta', 'ofx_bank_id', 'ofx_branch_id', 'ofx_account_id', 'empresa_id']
  });
  const matches = contas.filter((conta) => accountMatchesOfx(conta, ofxInfo));

  if (matches.length === 1) {
    return matches[0];
  }

  const identificacao = [
    ofxInfo.bankId ? `banco ${ofxInfo.bankId}` : null,
    ofxInfo.branchId ? `agencia ${ofxInfo.branchId}` : null,
    ofxInfo.accountId ? `conta ${ofxInfo.accountId}` : null
  ].filter(Boolean).join(', ') || 'sem identificacao bancaria no arquivo';

  if (matches.length > 1) {
    throw createHttpError(400, `Mais de uma conta cadastrada combina com este OFX (${identificacao}). Revise a Identificacao OFX das contas ou selecione a conta manualmente e importe novamente.`);
  }

  throw createHttpError(400, `Conta bancaria nao encontrada para este OFX (${identificacao}). Cadastre a Identificacao OFX na conta bancaria antes de importar automaticamente.`);
}

function parseOfxTransactions(fileBuffer) {
  const rawText = decodeOfxBuffer(fileBuffer).replace(/\r/g, '\n');
  const normalizedText = rawText.replace(/>\s+</g, '><');
  const blocks = normalizedText.match(/<STMTTRN>[\s\S]*?(?=<STMTTRN>|<\/BANKTRANLIST>|$)/gi) || [];

  if (!blocks.length) {
    throw createHttpError(400, 'Nenhum lancamento OFX encontrado no arquivo.');
  }

  const occurrences = new Map();

  return blocks.map((block, index) => {
    const dataMovimento = parseOfxDate(extractTagValue(block, 'DTPOSTED'));
    const valor = parseOfxAmount(extractTagValue(block, 'TRNAMT'));
    const fitId = normalizeOfxIdentifier(extractTagValue(block, 'FITID'));
    const checknum = normalizeOfxIdentifier(extractTagValue(block, 'CHECKNUM'));
    const refnum = normalizeOfxIdentifier(extractTagValue(block, 'REFNUM'));
    const docnum = normalizeOfxIdentifier(extractTagValue(block, 'DOCNUM'));
    const name = String(extractTagValue(block, 'NAME') || '').trim();
    const memo = String(extractTagValue(block, 'MEMO') || '').trim();
    const nameAsDocument = normalizeOfxIdentifier(name);
    const documento = checknum || refnum || docnum || nameAsDocument || null;
    const descricao = [memo || null, name && name !== documento ? name : null]
      .filter(Boolean)
      .join(' - ')
      .slice(0, 255);
    const tipoMovimento = normalizeText(extractTagValue(block, 'TRNTYPE'));

    if (!dataMovimento || valor == null) {
      throw createHttpError(400, `Lancamento OFX invalido na posicao ${index + 1}.`);
    }

    const baseUid = buildStableTransactionId({
      fitId,
      dataMovimento,
      valor,
      documento,
      descricao: descricao || memo || name || 'Lancamento bancario',
      tipoMovimento
    });
    const occurrence = (occurrences.get(baseUid) || 0) + 1;
    occurrences.set(baseUid, occurrence);

    return {
      ofx_uid: occurrence === 1 ? baseUid : `${baseUid}:${occurrence}`,
      documento: documento || null,
      descricao_banco: descricao || memo || name || 'Lancamento bancario',
      valor,
      data_movimento: dataMovimento,
      tipo_movimento: tipoMovimento || null
    };
  });
}

function buildImportFingerprint(transacoes = []) {
  const payload = transacoes.map((item) => ({
    ofx_uid: item.ofx_uid,
    data_movimento: item.data_movimento,
    valor: item.valor,
    documento: item.documento || null,
    descricao_banco: item.descricao_banco || null
  }));

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
}

function getSignalByValue(value) {
  return Number(value || 0) >= 0 ? 'RECEBER' : 'PAGAR';
}

function subtractDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function calculateDiffDays(dateA, dateB) {
  const a = new Date(`${dateA}T00:00:00`);
  const b = new Date(`${dateB}T00:00:00`);
  const diff = Math.abs(a.getTime() - b.getTime());
  return Math.round(diff / (24 * 60 * 60 * 1000));
}

function normalizeStatusFilter(status) {
  const normalized = String(status || '').trim().toUpperCase();
  return normalized || 'PENDENTE';
}

function normalizePageSize(value) {
  const allowed = new Set([25, 50, 100, 200, 500, 1000]);
  const parsed = Number(value || 100);
  if (!allowed.has(parsed)) {
    return 100;
  }
  return parsed;
}

function normalizeSearchLimit(value, fallback = 30) {
  const parsed = Number(value || fallback);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, 200);
}

function buildConciliacaoInclude() {
  return [
    {
      model: ContaBancaria,
      as: 'contaBancaria',
      required: false,
      attributes: ['id', 'nome', 'banco', 'agencia', 'conta', 'empresa_id', 'tipo_operacional']
    },
    {
      model: TituloFinanceiro,
      as: 'titulo',
      required: false,
      attributes: ['id', 'tipo', 'descricao', 'numero_documento', 'obra_id'],
      include: [
        {
          model: Parceiro,
          as: 'parceiro',
          required: false,
          attributes: ['id', 'nome', 'cpf_cnpj']
        },
        {
          model: Obra,
          as: 'obra',
          required: false,
          attributes: ['id', 'codigo', 'nome', 'tipo_centro_custo']
        }
      ]
    },
    {
      model: MovimentoFinanceiro,
      as: 'movimento',
      required: false,
      attributes: ['id', 'tipo_movimento', 'valor', 'valor_quitacao', 'data_movimento', 'status', 'observacoes', 'documento_referencia'],
      include: [
        {
          model: ContaBancaria,
          as: 'contaBancaria',
          required: false,
          attributes: ['id', 'nome']
        }
      ]
    },
    {
      model: FaturaCartaoFinanceiro,
      as: 'faturaCartao',
      required: false,
      include: [
        {
          model: CartaoFinanceiro,
          as: 'cartao',
          required: false,
          attributes: ['id', 'nome', 'titular', 'bandeira', 'ultimos_digitos']
        }
      ]
    },
    {
      model: TransferenciaFinanceira,
      as: 'transferencia',
      required: false,
      include: [
        {
          model: ContaBancaria,
          as: 'contaOrigem',
          required: false,
          attributes: ['id', 'nome', 'banco', 'agencia', 'conta']
        },
        {
          model: ContaBancaria,
          as: 'contaDestino',
          required: false,
          attributes: ['id', 'nome', 'banco', 'agencia', 'conta']
        }
      ]
    },
    {
      model: User,
      as: 'confirmadoPor',
      required: false,
      attributes: ['id', 'nome', 'email']
    }
  ];
}

function buildConciliacaoWhere(filters = {}, { forcePending = false } = {}) {
  const where = {
    deleted_at: null
  };
  const status = forcePending ? 'PENDENTE' : normalizeStatusFilter(filters.status);

  if (status !== 'TODOS') {
    where.status = status;
  }

  if (filters.conta_bancaria_id) {
    where.conta_bancaria_id = parseInteger(filters.conta_bancaria_id, 'Conta bancaria');
  }

  if (filters.data_inicial || filters.data_final) {
    where.data_movimento = {};
    if (filters.data_inicial) {
      where.data_movimento[Op.gte] = filters.data_inicial;
    }
    if (filters.data_final) {
      where.data_movimento[Op.lte] = filters.data_final;
    }
  }

  return where;
}

async function importSingleOfxFile(req, file, payload = {}) {
  if (!file?.buffer || !file?.originalname) {
    throw createHttpError(400, 'Arquivo OFX e obrigatorio.');
  }

  const contaBancariaId = payload.conta_bancaria_id
    ? parseInteger(payload.conta_bancaria_id, 'Conta bancaria')
    : null;
  const contaBancaria = await resolveContaBancariaFromOfx(file.buffer, { contaBancariaId });
  const contaFinalId = Number(contaBancaria.id);
  const empresaContaId = contaBancaria.empresa_id ? Number(contaBancaria.empresa_id) : null;
  if (!empresaContaId) {
    throw createHttpError(
      400,
      `A conta bancaria ${contaBancaria.nome || `#${contaFinalId}`} precisa estar vinculada a uma empresa antes de importar OFX.`
    );
  }

  const transacoes = parseOfxTransactions(file.buffer);
  const arquivoHash = buildImportFingerprint(transacoes);
  const importacaoExistente = await ConciliacaoBancariaImportacao.findOne({
    where: {
      conta_bancaria_id: contaFinalId,
      arquivo_hash: arquivoHash
    },
    attributes: ['id', 'arquivo_nome', 'createdAt', 'importados', 'ignorados']
  });

  if (importacaoExistente) {
    throw createHttpError(
      409,
      `Este arquivo/remessa ja foi importado em ${new Date(importacaoExistente.createdAt).toLocaleString('pt-BR')}.`
    );
  }

  const batchSeen = new Set();
  const imported = [];
  const skipped = [];

  for (const transacao of transacoes) {
    const uniqueKey = `${contaFinalId}:${transacao.ofx_uid}`;
    if (batchSeen.has(uniqueKey)) {
      skipped.push({
        ofx_uid: transacao.ofx_uid,
        motivo: 'Duplicado no arquivo importado'
      });
      continue;
    }
    batchSeen.add(uniqueKey);

    const existing = await ConciliacaoBancaria.findOne({
      where: {
        conta_bancaria_id: contaFinalId,
        ofx_uid: transacao.ofx_uid
      },
      attributes: ['id', 'status']
    });

    if (existing) {
      skipped.push({
        id: existing.id,
        ofx_uid: transacao.ofx_uid,
        motivo: `Lancamento ja importado com status ${existing.status}`
      });
      continue;
    }

    const created = await ConciliacaoBancaria.create({
      conta_bancaria_id: contaFinalId,
      empresa_id: empresaContaId,
      titulo_financeiro_id: null,
      movimento_financeiro_id: null,
      ofx_uid: transacao.ofx_uid,
      documento: transacao.documento,
      descricao_banco: transacao.descricao_banco,
      valor: transacao.valor,
      data_movimento: transacao.data_movimento,
      status: 'PENDENTE',
      confirmado_por: null,
      confirmado_em: null,
      criado_por: req.user?.id || null
    });

    imported.push(created);
  }

  if (imported.length === 0 && skipped.length === transacoes.length) {
    throw createHttpError(409, 'Todos os lancamentos deste arquivo ja foram importados anteriormente.');
  }

  const alertasEstorno = [];
  for (const conciliacao of imported) {
    try {
      const estorno = await registrarClassificacaoEstornoBancario(conciliacao);
      if (!estorno) {
        await registrarClassificacaoInicialMatch(req, conciliacao);
      } else {
        alertasEstorno.push({
          conciliacao_id: conciliacao.id,
          tipo: estorno.tipo,
          valor: Number(conciliacao.valor || 0),
          data_movimento: conciliacao.data_movimento,
          total_candidatos: estorno.total_candidatos
        });
      }
    } catch (error) {
      // A classificacao e analitica e nao pode invalidar uma importacao OFX valida.
      console.error(`Falha ao classificar match inicial da conciliacao #${conciliacao.id}:`, error.message);
    }
  }

  const importacao = await ConciliacaoBancariaImportacao.create({
    conta_bancaria_id: contaFinalId,
    empresa_id: empresaContaId,
    arquivo_hash: arquivoHash,
    arquivo_nome: file.originalname,
    total_lidos: transacoes.length,
    importados: imported.length,
    ignorados: skipped.length,
    criado_por: req.user?.id || null
  });

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'FINANCIAL_OFX_IMPORTED',
    recursoTipo: 'CONCILIACAO_BANCARIA',
    recursoId: contaBancariaId,
    status: 'SUCCESS',
    descricao: 'Arquivo OFX importado para conciliacao bancaria',
    metadata: {
      conta_bancaria_id: contaFinalId,
      importacao_id: importacao.id,
      arquivo_hash: arquivoHash,
      arquivo: file.originalname,
      importados: imported.length,
      ignorados: skipped.length,
      alertas_estorno: alertasEstorno.length
    }
  });

  return {
    importacao_id: importacao.id,
    conta_bancaria_id: contaFinalId,
    conta_bancaria_nome: contaBancaria.nome || null,
    arquivo: file.originalname,
    arquivo_hash: arquivoHash,
    importados: imported.length,
    ignorados: skipped.length,
    alertas_estorno: alertasEstorno.length,
    estornos_detectados: alertasEstorno,
    total_lidos: transacoes.length,
    itens_importados: imported.map((item) => ({
      id: item.id,
      data_movimento: item.data_movimento,
      valor: Number(item.valor || 0),
      descricao_banco: item.descricao_banco
    })),
    itens_ignorados: skipped
  };
}

async function importOfx(req, payload = {}) {
  await assertFinanceAccess(req);

  const files = [
    ...(Array.isArray(req.files?.file) ? req.files.file : []),
    ...(Array.isArray(req.files?.files) ? req.files.files : [])
  ].filter((file) => file?.buffer && file?.originalname);

  if (!files.length && req.file?.buffer) {
    files.push(req.file);
  }

  if (!files.length) {
    throw createHttpError(400, 'Selecione ao menos um arquivo OFX.');
  }

  const resultados = [];
  for (const file of files) {
    try {
      const resultado = await importSingleOfxFile(req, file, payload);
      resultados.push({
        status: 'IMPORTADO',
        sucesso: true,
        ...resultado
      });
    } catch (error) {
      resultados.push({
        status: 'NAO_IMPORTADO',
        sucesso: false,
        arquivo: file.originalname,
        mensagem: error?.message || 'Nao foi possivel importar este OFX.'
      });
    }
  }

  const resumo = resultados.reduce((acc, item) => {
    acc.arquivos_total += 1;
    if (item.sucesso) {
      acc.arquivos_importados += 1;
      acc.importados += Number(item.importados || 0);
      acc.ignorados += Number(item.ignorados || 0);
      acc.total_lidos += Number(item.total_lidos || 0);
      acc.alertas_estorno += Number(item.alertas_estorno || 0);
    } else {
      acc.arquivos_nao_importados += 1;
    }
    return acc;
  }, {
    arquivos_total: 0,
    arquivos_importados: 0,
    arquivos_nao_importados: 0,
    total_lidos: 0,
    alertas_estorno: 0,
    importados: 0,
    ignorados: 0
  });

  return {
    ...resumo,
    arquivo: resultados.length === 1 ? resultados[0].arquivo : null,
    resultados
  };
}

async function buildTituloWhere(req, conciliacao) {
  const tituloWhere = {
    tipo: getSignalByValue(conciliacao.valor)
  };

  const obraIds = await getFinanceiroObraScopeIds(req.user);
  if (obraIds === null) {
    return tituloWhere;
  }

  if (!obraIds.length) {
    return null;
  }

  tituloWhere.obra_id = {
    [Op.in]: obraIds
  };

  return tituloWhere;
}

async function loadUnavailableMovementIds(movimentoIds = [], exceptConciliacaoId = null) {
  const ids = [...new Set(movimentoIds.map((item) => Number(item || 0)).filter(Boolean))];
  if (!ids.length) {
    return new Set();
  }

  const where = {
    movimento_financeiro_id: {
      [Op.in]: ids
    },
    status: 'CONCILIADO'
  };

  if (exceptConciliacaoId) {
    where.id = {
      [Op.ne]: Number(exceptConciliacaoId)
    };
  }

  const rows = await ConciliacaoBancaria.findAll({
    where,
    attributes: ['movimento_financeiro_id'],
    raw: true
  });

  const whereVinculados = {
    id: { [Op.in]: ids },
    conciliacao_bancaria_id: { [Op.ne]: null }
  };
  if (exceptConciliacaoId) {
    whereVinculados[Op.and] = [
      { conciliacao_bancaria_id: { [Op.ne]: null } },
      { conciliacao_bancaria_id: { [Op.ne]: Number(exceptConciliacaoId) } }
    ];
    delete whereVinculados.conciliacao_bancaria_id;
  }

  const vinculados = await MovimentoFinanceiro.findAll({
    where: whereVinculados,
    attributes: ['id'],
    raw: true
  });

  return new Set([
    ...rows.map((item) => Number(item.movimento_financeiro_id || 0)).filter(Boolean),
    ...vinculados.map((item) => Number(item.id || 0)).filter(Boolean)
  ]);
}

async function queryMovimentoCandidates(req, conciliacao, searchFilters = {}) {
  const tituloWhere = await buildTituloWhere(req, conciliacao);
  if (!tituloWhere) {
    return [];
  }

  const defaultDateInitial = subtractDays(conciliacao.data_movimento, 5);
  const defaultDateFinal = addDays(conciliacao.data_movimento, 5);

  const dataInicial = searchFilters.data_inicial || defaultDateInitial;
  const dataFinal = searchFilters.data_final || defaultDateFinal;
  const valueBounds = resolveValueBounds(searchFilters);
  const documentoPesquisa = normalizeText(searchFilters.documento);
  const numeroDocumentoPesquisa = normalizeText(searchFilters.numero_documento);
  const limit = normalizeSearchLimit(searchFilters.limit, 40);
  const exactMatchOnly = searchFilters.exact_match === true;

  const whereMovimento = {
    status: 'ATIVO',
    conta_bancaria_id: conciliacao.conta_bancaria_id,
    data_movimento: {
      [Op.between]: [dataInicial, dataFinal]
    }
  };

  const items = await MovimentoFinanceiro.findAll({
    where: whereMovimento,
    include: [
      {
        model: TituloFinanceiro,
        as: 'titulo',
        required: true,
        where: tituloWhere,
        attributes: ['id', 'tipo', 'descricao', 'numero_documento', 'obra_id'],
        include: [
          {
            model: Parceiro,
            as: 'parceiro',
            attributes: ['id', 'nome', 'cpf_cnpj']
          },
          {
            model: CategoriaFinanceira,
            as: 'categoriaFinanceira',
            attributes: ['id', 'nome', 'tipo']
          },
          {
            model: Obra,
            as: 'obra',
            required: false,
            attributes: ['id', 'codigo', 'nome', 'tipo_centro_custo']
          }
        ]
      },
      {
        model: ContaBancaria,
        as: 'contaBancaria',
        attributes: ['id', 'nome']
      }
    ],
    order: [['data_movimento', 'DESC'], ['createdAt', 'DESC']]
  });

  const unavailableIds = await loadUnavailableMovementIds(
    items.map((item) => item.id),
    conciliacao.id
  );

  const filtered = items.filter((item) => {
    if (unavailableIds.has(Number(item.id || 0))) {
      return false;
    }

    if (exactMatchOnly && !isExactConciliacaoMatch({
      bankDate: conciliacao.data_movimento,
      bankValue: conciliacao.valor,
      movementDate: item.data_movimento,
      movementValue: item.valor_quitacao
    })) {
      return false;
    }

    if (valueBounds.shouldFilter) {
      const movementValue = Math.abs(Number(item.valor_quitacao || 0));
      const lowerBound = Number(valueBounds.lower || 0);
      const upperBound = Number(valueBounds.upper || lowerBound);

      if (lowerBound === upperBound && Math.abs(movementValue - lowerBound) > 0.1) {
        return false;
      }
      if (lowerBound !== upperBound && (movementValue < lowerBound || movementValue > upperBound)) {
        return false;
      }
    }

    if (numeroDocumentoPesquisa) {
      const numeroDocumento = normalizeText(item.titulo?.numero_documento);
      if (!numeroDocumento || !numeroDocumento.includes(numeroDocumentoPesquisa)) {
        return false;
      }
    }

    if (documentoPesquisa) {
      const haystack = [
        item.titulo?.descricao,
        item.titulo?.numero_documento,
        item.titulo?.parceiro?.nome,
        item.observacoes
      ]
        .map((value) => normalizeText(value))
        .join(' ');

      if (!haystack.includes(documentoPesquisa)) {
        return false;
      }
    }

    return true;
  });

  return filtered.slice(0, limit);
}

function scoreSuggestion(conciliacao, movimento) {
  const motivos = [];
  let score = 0;
  const concValor = Math.abs(Number(conciliacao.valor || 0));
  const movValor = Math.abs(Number(movimento.valor_quitacao || 0));
  const diffValor = Math.abs(concValor - movValor);

  if (diffValor <= 0.01) {
    score += 50;
    motivos.push('Valor exato');
  } else if (diffValor <= 0.1) {
    score += 30;
    motivos.push('Valor muito proximo');
  }

  const diffDias = calculateDiffDays(conciliacao.data_movimento, movimento.data_movimento);
  if (diffDias === 0) {
    score += 30;
    motivos.push('Mesma data');
  } else if (diffDias <= 2) {
    score += 20;
    motivos.push('Data proxima');
  } else if (diffDias <= 5) {
    score += 10;
    motivos.push('Janela de conciliacao');
  }

  const documentoBanco = normalizeText(conciliacao.documento);
  const documentoTitulo = normalizeText(movimento.titulo?.numero_documento);
  if (documentoBanco && documentoTitulo && documentoBanco === documentoTitulo) {
    score += 25;
    motivos.push('Documento coincide');
  }

  const descricaoBanco = normalizeText(conciliacao.descricao_banco);
  const parceiroNome = normalizeText(movimento.titulo?.parceiro?.nome);
  if (
    descricaoBanco &&
    parceiroNome &&
    descricaoBanco.includes(parceiroNome.slice(0, Math.min(parceiroNome.length, 12)))
  ) {
    score += 15;
    motivos.push('Parceiro identificado');
  }

  return {
    score,
    motivos,
    diff_dias: diffDias,
    diff_valor: roundCurrency(diffValor)
  };
}

function serializeSuggestion(movimento, ranking) {
  return {
    movimento_financeiro_id: movimento.id,
    titulo_financeiro_id: movimento.titulo?.id || null,
    titulo_descricao: movimento.titulo?.descricao || `Titulo #${movimento.titulo?.id || '-'}`,
    tipo: movimento.titulo?.tipo || null,
    parceiro_nome: movimento.titulo?.parceiro?.nome || '-',
    categoria_financeira_id: movimento.titulo?.categoriaFinanceira?.id || null,
    categoria_financeira_nome: movimento.titulo?.categoriaFinanceira?.nome || null,
    obra_id: movimento.titulo?.obra?.id || movimento.titulo?.obra_id || null,
    obra_codigo: movimento.titulo?.obra?.codigo || null,
    obra_nome: movimento.titulo?.obra?.nome || null,
    obra_tipo_centro_custo: movimento.titulo?.obra?.tipo_centro_custo || null,
    documento: movimento.titulo?.numero_documento || null,
    data_movimento: movimento.data_movimento,
    valor_quitacao: Number(movimento.valor_quitacao || 0),
    conta_bancaria_nome: movimento.contaBancaria?.nome || '-',
    score: ranking.score,
    motivos: ranking.motivos,
    diff_dias: ranking.diff_dias,
    diff_valor: ranking.diff_valor
  };
}

async function analyzeSuggestions(req, conciliacao, options = {}) {
  const maxSuggestions = Math.max(Number(options.maxSuggestions || 3), 1);
  const candidates = await queryMovimentoCandidates(req, conciliacao, {
    data_inicial: conciliacao.data_movimento,
    data_final: conciliacao.data_movimento,
    exact_match: true,
    limit: Math.max(maxSuggestions * 3, 20)
  });

  const ranked = candidates
    .map((item) => ({
      item,
      ranking: scoreSuggestion(conciliacao, item)
    }))
    .filter((entry) => entry.ranking.diff_dias === 0 && entry.ranking.diff_valor === 0)
    .sort((a, b) => {
      if (b.ranking.score !== a.ranking.score) {
        return b.ranking.score - a.ranking.score;
      }

      const aDate = String(a.item.data_movimento || '');
      const bDate = String(b.item.data_movimento || '');
      if (bDate !== aDate) {
        return bDate.localeCompare(aDate);
      }

      return Number(b.item.id || 0) - Number(a.item.id || 0);
    });

  const sameDaySameValue = ranked;

  const sameTopScore = ranked.length > 1 && ranked[0].ranking.score === ranked[1].ranking.score;
  const associacaoManualRecomendada = sameDaySameValue.length > 1 || sameTopScore;
  const sugestaoAutomatica = ranked.length > 0 && !associacaoManualRecomendada
    ? serializeSuggestion(ranked[0].item, ranked[0].ranking)
    : null;
  const limiteSugestoesVisiveis = associacaoManualRecomendada
    ? Math.max(maxSuggestions, 20)
    : maxSuggestions;
  const sugestoesVisiveis = ranked
    .slice(0, limiteSugestoesVisiveis)
    .map((entry) => serializeSuggestion(entry.item, entry.ranking));

  return {
    sugestoes: sugestoesVisiveis,
    sugestao_automatica: sugestaoAutomatica,
    total_candidatos: ranked.length,
    total_candidatos_exatos_mesmo_dia: sameDaySameValue.length,
    associacao_manual_recomendada: associacaoManualRecomendada,
    conciliacao_em_lote_disponivel: Boolean(sugestaoAutomatica)
  };
}

async function registrarClassificacaoInicialMatch(req, conciliacao) {
  const analise = await analyzeSuggestions(req, conciliacao, { maxSuggestions: 20 });
  const tipo = analise.sugestao_automatica
    ? 'AUTO_UNICO'
    : analise.total_candidatos > 1
      ? 'AMBIGUO'
      : 'SEM_MATCH';

  await conciliacao.update({
    match_inicial_tipo: tipo,
    match_inicial_candidatos: Number(analise.total_candidatos || 0),
    match_inicial_movimento_id: analise.sugestao_automatica?.movimento_financeiro_id || null,
    match_inicial_avaliado_em: new Date()
  });

  return tipo;
}

async function analisarPossivelEstornoBancario(conciliacao, { transaction = null, lock = false } = {}) {
  const classificacao = classifyBankReversal(conciliacao);
  if (!classificacao) return null;

  const dataInicial = subtractDays(conciliacao.data_movimento, classificacao.janela_dias);
  const query = {
    where: {
      id: { [Op.ne]: conciliacao.id },
      conta_bancaria_id: conciliacao.conta_bancaria_id,
      valor: roundCurrency(-Number(conciliacao.valor || 0)),
      data_movimento: { [Op.between]: [dataInicial, conciliacao.data_movimento] },
      status: { [Op.in]: ['PENDENTE', 'CONCILIADO'] },
      deleted_at: null
    },
    order: [['data_movimento', 'DESC'], ['id', 'DESC']],
    transaction
  };
  if (lock && transaction) query.lock = transaction.LOCK.UPDATE;

  const candidatasEncontradas = await ConciliacaoBancaria.findAll(query);
  const candidatas = candidatasEncontradas.filter((candidata) => (
    !classifyBankReversal(candidata)
    && hasOppositeExactAmount(conciliacao.valor, candidata.valor)
    && datesWithinReversalWindow({
      reversalDate: conciliacao.data_movimento,
      originalDate: candidata.data_movimento,
      windowDays: classificacao.janela_dias
    })
  ));

  // Sem contraparte no extrato, o estorno de tarifa continua disponivel no atalho manual.
  if (classificacao.tipo === 'ESTORNO_TARIFA_BANCARIA' && candidatas.length === 0) {
    return null;
  }

  const movimentoIds = [...new Set(candidatas.map((item) => Number(item.movimento_financeiro_id || 0)).filter(Boolean))];
  const tituloIds = [...new Set(candidatas.map((item) => Number(item.titulo_financeiro_id || 0)).filter(Boolean))];
  const [movimentos, titulos] = await Promise.all([
    movimentoIds.length
      ? MovimentoFinanceiro.findAll({
          where: { id: { [Op.in]: movimentoIds } },
          attributes: ['id', 'titulo_financeiro_id', 'tipo_movimento', 'status', 'valor', 'valor_quitacao', 'data_movimento'],
          transaction
        })
      : [],
    tituloIds.length
      ? TituloFinanceiro.findAll({
          where: { id: { [Op.in]: tituloIds } },
          attributes: ['id', 'codigo', 'tipo', 'descricao', 'numero_documento', 'status', 'valor_original', 'valor_saldo', 'parceiro_id'],
          include: [{ model: Parceiro, as: 'parceiro', attributes: ['id', 'nome', 'cpf_cnpj'] }],
          transaction
        })
      : []
  ]);
  const movimentoMap = new Map(movimentos.map((item) => [Number(item.id), item.toJSON()]));
  const tituloMap = new Map(titulos.map((item) => [Number(item.id), item.toJSON()]));

  const candidatos = candidatas.map((candidata) => {
    const json = candidata.toJSON();
    const ranking = scoreReversalCandidate(conciliacao, candidata);
    const movimento = movimentoMap.get(Number(json.movimento_financeiro_id || 0)) || null;
    const titulo = tituloMap.get(Number(json.titulo_financeiro_id || movimento?.titulo_financeiro_id || 0)) || null;
    return {
      conciliacao_id: json.id,
      data_movimento: json.data_movimento,
      valor: Number(json.valor || 0),
      documento: json.documento || null,
      descricao_banco: json.descricao_banco || null,
      status: json.status,
      score: ranking.score,
      motivos: ranking.motivos,
      movimento: movimento
        ? {
            id: movimento.id,
            tipo_movimento: movimento.tipo_movimento,
            status: movimento.status,
            valor_quitacao: Number(movimento.valor_quitacao || 0)
          }
        : null,
      titulo: titulo
        ? {
            id: titulo.id,
            codigo: titulo.codigo,
            tipo: titulo.tipo,
            descricao: titulo.descricao,
            numero_documento: titulo.numero_documento,
            status: titulo.status,
            valor_original: Number(titulo.valor_original || 0),
            valor_saldo: Number(titulo.valor_saldo || 0),
            parceiro_nome: titulo.parceiro?.nome || null,
            parceiro_documento: titulo.parceiro?.cpf_cnpj || null
          }
        : null
    };
  }).sort((a, b) => b.score - a.score || Number(b.conciliacao_id) - Number(a.conciliacao_id));

  const selectedOriginId = Number(conciliacao.estorno_conciliacao_origem_id || 0);
  return {
    detectado: true,
    tipo: classificacao.tipo,
    status: conciliacao.estorno_status || 'ALERTA',
    janela_dias: classificacao.janela_dias,
    total_candidatos: candidatos.length,
    exige_confirmacao_manual: String(conciliacao.estorno_status || '').toUpperCase() !== 'CONFIRMADO',
    ambiguo: candidatos.length !== 1,
    conciliacao_origem_id: selectedOriginId || null,
    candidatos
  };
}

async function registrarClassificacaoEstornoBancario(conciliacao) {
  const analise = await analisarPossivelEstornoBancario(conciliacao);
  if (!analise) return null;
  await conciliacao.update({
    evento_bancario_tipo: analise.tipo,
    estorno_status: conciliacao.estorno_status || 'ALERTA',
    estorno_candidatos: analise.total_candidatos,
    estorno_avaliado_em: new Date(),
    match_inicial_tipo: 'ESTORNO_ALERTA',
    match_inicial_candidatos: analise.total_candidatos,
    match_inicial_movimento_id: null,
    match_inicial_avaliado_em: new Date()
  });
  return analise;
}

function assertSemAlertaEstornoBancario(conciliacao) {
  // Protege somente operacoes que descartariam o lancamento sem classifica-lo
  // (ignorar/remover). Acoes manuais explicitas — tarifa, titulo, movimento,
  // fatura ou transferencia — sao formas validas de resolver um falso positivo.
  if (
    String(conciliacao.match_inicial_tipo || '').toUpperCase() === 'ESTORNO_ALERTA'
    && String(conciliacao.estorno_status || '').toUpperCase() !== 'CONFIRMADO'
  ) {
    throw createHttpError(
      409,
      'Este lancamento possui alerta de estorno bancario. Confirme a devolucao ou selecione o lancamento original antes de outra conciliacao.'
    );
  }
}

function inferirResolucaoConciliacao(conciliacao, movimentoId, { batch = false } = {}) {
  if (batch) return 'AUTO_LOTE';
  if (
    String(conciliacao?.match_inicial_tipo || '').toUpperCase() === 'AUTO_UNICO'
    && Number(conciliacao?.match_inicial_movimento_id || 0) === Number(movimentoId || 0)
  ) return 'AUTO_CONFIRMADO';
  return 'MANUAL_EXISTENTE';
}

function isConciliacaoLivreParaTransferencia(conciliacao) {
  return String(conciliacao?.status || '').toUpperCase() === 'PENDENTE'
    && !conciliacao?.deleted_at
    && !conciliacao?.transferencia_financeira_id
    && !conciliacao?.movimento_financeiro_id
    && !conciliacao?.titulo_financeiro_id
    && !conciliacao?.fatura_cartao_id;
}

function isContraparteTransferenciaExata(conciliacao, candidata) {
  return Number(candidata?.id || 0) !== Number(conciliacao?.id || 0)
    && Number(candidata?.conta_bancaria_id || 0) !== Number(conciliacao?.conta_bancaria_id || 0)
    && isExactOppositeBankTransfer({
      currentDate: conciliacao?.data_movimento,
      currentValue: conciliacao?.valor,
      counterpartDate: candidata?.data_movimento,
      counterpartValue: candidata?.valor
    })
    && isConciliacaoLivreParaTransferencia(candidata);
}

async function carregarContrapartesTransferenciaExatas(conciliacoes = [], options = {}) {
  const itens = conciliacoes.filter(isConciliacaoLivreParaTransferencia);
  if (!itens.length) return new Map();

  const paresUnicos = new Map();
  itens.forEach((item) => {
    const key = `${item.data_movimento}:${roundCurrency(-Number(item.valor || 0))}`;
    paresUnicos.set(key, {
      data_movimento: item.data_movimento,
      valor: roundCurrency(-Number(item.valor || 0))
    });
  });

  const where = {
    status: 'PENDENTE',
    deleted_at: null,
    transferencia_financeira_id: null,
    movimento_financeiro_id: null,
    titulo_financeiro_id: null,
    fatura_cartao_id: null,
    [Op.or]: [...paresUnicos.values()]
  };

  if (options.contaContraparteId) {
    where.conta_bancaria_id = Number(options.contaContraparteId);
  }

  const query = {
    where,
    attributes: [
      'id',
      'conta_bancaria_id',
      'empresa_id',
      'data_movimento',
      'valor',
      'descricao_banco',
      'documento',
      'status',
      'deleted_at',
      'transferencia_financeira_id',
      'movimento_financeiro_id',
      'titulo_financeiro_id',
      'fatura_cartao_id'
    ],
    include: [
      {
        model: ContaBancaria,
        as: 'contaBancaria',
        required: true,
        attributes: [],
        where: { ativo: true }
      }
    ],
    transaction: options.transaction || null
  };

  if (options.lock && options.transaction) {
    query.lock = options.transaction.LOCK.UPDATE;
  }

  const candidatas = await ConciliacaoBancaria.findAll(query);
  const resultado = new Map();

  itens.forEach((item) => {
    resultado.set(
      Number(item.id),
      candidatas.filter((candidata) => isContraparteTransferenciaExata(item, candidata))
    );
  });

  return resultado;
}

async function listarConciliacoes(req, filters = {}) {
  await assertFinanceAccess(req);

  const where = buildConciliacaoWhere(filters);
  const pageSize = normalizePageSize(filters.page_size);
  const currentPage = Math.max(Number(filters.page || 1), 1);
  const offset = (currentPage - 1) * pageSize;

  const agrupadosResumo = await ConciliacaoBancaria.findAll({
    attributes: [
      'status',
      [fn('COUNT', col('id')), 'total'],
      [fn('SUM', col('valor')), 'valor_total'],
      [fn('SUM', fn('ABS', col('valor'))), 'valor_absoluto_total']
    ],
    where,
    group: ['status'],
    raw: true
  });

  const totalRegistros = await ConciliacaoBancaria.count({ where });

  const itens = await ConciliacaoBancaria.findAll({
    where,
    order: [['data_movimento', 'ASC'], ['createdAt', 'ASC']],
    limit: pageSize,
    offset
  });

  const contaIds = [...new Set(itens.map((item) => Number(item.conta_bancaria_id || 0)).filter(Boolean))];
  const tituloIds = [...new Set(itens.map((item) => Number(item.titulo_financeiro_id || 0)).filter(Boolean))];
  const movimentoIds = [...new Set(itens.map((item) => Number(item.movimento_financeiro_id || 0)).filter(Boolean))];
  const faturaIds = [...new Set(itens.map((item) => Number(item.fatura_cartao_id || 0)).filter(Boolean))];
  const usuarioIds = [...new Set(itens.map((item) => Number(item.confirmado_por || 0)).filter(Boolean))];

  const [
    contas,
    titulos,
    movimentos,
    faturas,
    usuarios
  ] = await Promise.all([
    contaIds.length
      ? ContaBancaria.findAll({
          where: { id: { [Op.in]: contaIds } },
          attributes: ['id', 'nome', 'banco', 'agencia', 'conta', 'empresa_id', 'tipo_operacional']
        })
      : [],
    tituloIds.length
      ? TituloFinanceiro.findAll({
          where: { id: { [Op.in]: tituloIds } },
          attributes: ['id', 'tipo', 'descricao', 'numero_documento', 'obra_id'],
          include: [
            {
              model: Parceiro,
              as: 'parceiro',
              attributes: ['id', 'nome', 'cpf_cnpj']
            },
            {
              model: CategoriaFinanceira,
              as: 'categoriaFinanceira',
              attributes: ['id', 'nome', 'tipo']
            },
            {
              model: Obra,
              as: 'obra',
              required: false,
              attributes: ['id', 'codigo', 'nome', 'tipo_centro_custo']
            }
          ]
        })
      : [],
    movimentoIds.length
      ? MovimentoFinanceiro.findAll({
          where: { id: { [Op.in]: movimentoIds } },
          attributes: ['id', 'tipo_movimento', 'valor', 'valor_quitacao', 'data_movimento', 'status', 'observacoes', 'documento_referencia', 'conta_bancaria_id'],
          include: [
            {
              model: ContaBancaria,
              as: 'contaBancaria',
              attributes: ['id', 'nome']
            }
          ]
        })
      : [],
    faturaIds.length
      ? FaturaCartaoFinanceiro.findAll({
          where: { id: { [Op.in]: faturaIds } },
          include: [
            {
              model: CartaoFinanceiro,
              as: 'cartao',
              attributes: ['id', 'nome', 'titular', 'bandeira', 'ultimos_digitos']
            }
          ]
        })
      : [],
    usuarioIds.length
      ? User.findAll({
          where: { id: { [Op.in]: usuarioIds } },
          attributes: ['id', 'nome', 'email']
        })
      : []
  ]);

  const contaMap = new Map(contas.map((item) => [Number(item.id), item.toJSON()]));
  const tituloMap = new Map(titulos.map((item) => [Number(item.id), item.toJSON()]));
  const movimentoMap = new Map(movimentos.map((item) => [Number(item.id), item.toJSON()]));
  const faturaMap = new Map(faturas.map((item) => [Number(item.id), item.toJSON()]));
  const usuarioMap = new Map(usuarios.map((item) => [Number(item.id), item.toJSON()]));
  const contrapartesTransferenciaMap = await carregarContrapartesTransferenciaExatas(itens);

  const rows = await Promise.all(itens.map(async (item) => {
    const json = item.toJSON();
    const contaBancaria = contaMap.get(Number(json.conta_bancaria_id || 0));
    const titulo = tituloMap.get(Number(json.titulo_financeiro_id || 0));
    const movimento = movimentoMap.get(Number(json.movimento_financeiro_id || 0));
    const faturaCartao = faturaMap.get(Number(json.fatura_cartao_id || 0));
    const confirmadoPor = usuarioMap.get(Number(json.confirmado_por || 0));
    const contrapartesTransferencia = contrapartesTransferenciaMap.get(Number(json.id)) || [];
    const contraparteTransferenciaAutomatica = contrapartesTransferencia.length === 1
      ? contrapartesTransferencia[0]
      : null;
    const estornoBancario = await analisarPossivelEstornoBancario(item);
    const analise = String(item.status || '').toUpperCase() === 'PENDENTE' && !estornoBancario
      ? await analyzeSuggestions(req, item)
      : {
          sugestoes: [],
          sugestao_automatica: null,
          total_candidatos: 0,
          total_candidatos_exatos_mesmo_dia: 0,
          associacao_manual_recomendada: false,
          conciliacao_em_lote_disponivel: false
        };

    return {
      id: json.id,
      conta_bancaria_id: json.conta_bancaria_id,
      conta_bancaria_nome: contaBancaria?.nome || '-',
      ofx_uid: json.ofx_uid,
      documento: json.documento,
      descricao_banco: json.descricao_banco,
      valor: Number(json.valor || 0),
      data_movimento: json.data_movimento,
      status: json.status,
      confirmado_em: json.confirmado_em,
      confirmado_por: confirmadoPor
        ? {
            id: confirmadoPor.id,
            nome: confirmadoPor.nome,
            email: confirmadoPor.email
          }
        : null,
      titulo: titulo
        ? {
            id: titulo.id,
            tipo: titulo.tipo,
            descricao: titulo.descricao,
            numero_documento: titulo.numero_documento,
            parceiro_nome: titulo.parceiro?.nome || '-',
            categoria_financeira_id: titulo.categoriaFinanceira?.id || null,
            categoria_financeira_nome: titulo.categoriaFinanceira?.nome || null,
            obra_id: titulo.obra?.id || titulo.obra_id || null,
            obra_codigo: titulo.obra?.codigo || null,
            obra_nome: titulo.obra?.nome || null,
            obra_tipo_centro_custo: titulo.obra?.tipo_centro_custo || null
          }
        : null,
      movimento: movimento
        ? {
            id: movimento.id,
            tipo_movimento: movimento.tipo_movimento,
            valor: Number(movimento.valor || 0),
            valor_quitacao: Number(movimento.valor_quitacao || 0),
            data_movimento: movimento.data_movimento,
            status: movimento.status,
            observacoes: movimento.observacoes || null,
            documento_referencia: movimento.documento_referencia || null
          }
        : null,
      fatura_cartao: faturaCartao
        ? {
            id: faturaCartao.id,
            competencia: faturaCartao.competencia,
            status: faturaCartao.status,
            valor_total: Number(faturaCartao.valor_total || 0),
            data_vencimento: faturaCartao.data_vencimento,
            cartao_nome: faturaCartao.cartao?.nome || '-',
            cartao_final: faturaCartao.cartao?.ultimos_digitos || null
          }
        : null,
      sugestoes: analise.sugestoes,
      sugestao_automatica: analise.sugestao_automatica,
      total_candidatos: analise.total_candidatos,
      total_candidatos_exatos_mesmo_dia: analise.total_candidatos_exatos_mesmo_dia,
      associacao_manual_recomendada: analise.associacao_manual_recomendada,
      conciliacao_em_lote_disponivel: analise.conciliacao_em_lote_disponivel,
      transferencia_contraparte_automatica: contraparteTransferenciaAutomatica
        ? {
            conciliacao_id: contraparteTransferenciaAutomatica.id,
            conta_bancaria_id: contraparteTransferenciaAutomatica.conta_bancaria_id,
            empresa_id: contraparteTransferenciaAutomatica.empresa_id,
            data_movimento: contraparteTransferenciaAutomatica.data_movimento,
            valor: Number(contraparteTransferenciaAutomatica.valor || 0),
            descricao_banco: contraparteTransferenciaAutomatica.descricao_banco || null,
            documento: contraparteTransferenciaAutomatica.documento || null
          }
        : null,
      transferencia_contrapartes_exatas: contrapartesTransferencia.length,
      transferencia_contraparte_ambigua: contrapartesTransferencia.length > 1,
      estorno_bancario: estornoBancario
    };
  }));

  const resumo = agrupadosResumo.reduce((acc, item) => {
    const statusItem = String(item.status || '').toUpperCase();
    const total = Number(item.total || 0);
    const valor = Number(item.valor_total || 0);
    acc.total += total;
    acc.valor_total += valor;
    acc.valor_absoluto_total += Number(item.valor_absoluto_total || 0);
    if (statusItem === 'PENDENTE') acc.pendentes += total;
    if (statusItem === 'CONCILIADO') acc.conciliados += total;
    if (statusItem === 'IGNORADO') acc.ignorados += total;
    return acc;
  }, {
    total: 0,
    pendentes: 0,
    conciliados: 0,
    ignorados: 0,
    valor_total: 0,
    valor_absoluto_total: 0
  });

  resumo.valor_total = roundCurrency(resumo.valor_total);
  resumo.valor_absoluto_total = roundCurrency(resumo.valor_absoluto_total);

  return {
    resumo,
    meta: {
      total_disponivel: resumo.total,
      total_listado: rows.length,
      current_page: currentPage,
      page_size: pageSize,
      total_pages: Math.max(Math.ceil(totalRegistros / pageSize), 1)
    },
    itens: rows
  };
}

async function listarImportacoes(req, filters = {}) {
  await assertFinanceAccess(req);

  const where = {};
  if (filters.conta_bancaria_id) {
    where.conta_bancaria_id = parseInteger(filters.conta_bancaria_id, 'Conta bancaria');
  }

  if (filters.data_inicial || filters.data_final) {
    where.createdAt = {};
    if (filters.data_inicial) {
      where.createdAt[Op.gte] = new Date(`${filters.data_inicial}T00:00:00.000Z`);
    }
    if (filters.data_final) {
      where.createdAt[Op.lte] = new Date(`${filters.data_final}T23:59:59.999Z`);
    }
  }

  const limit = Math.min(Math.max(Number(filters.limit || 8), 1), 50);
  const itens = await ConciliacaoBancariaImportacao.findAll({
    where,
    include: [
      {
        model: ContaBancaria,
        as: 'contaBancaria',
        attributes: ['id', 'nome', 'banco', 'agencia', 'conta', 'empresa_id', 'tipo_operacional']
      },
      {
        model: User,
        as: 'criadoPor',
        attributes: ['id', 'nome', 'email']
      }
    ],
    order: [['createdAt', 'DESC']],
    limit
  });

  const resumo = itens.reduce((acc, item) => {
    acc.total_importacoes += 1;
    acc.total_lidos += Number(item.total_lidos || 0);
    acc.total_importados += Number(item.importados || 0);
    acc.total_ignorados += Number(item.ignorados || 0);
    return acc;
  }, {
    total_importacoes: 0,
    total_lidos: 0,
    total_importados: 0,
    total_ignorados: 0
  });

  return {
    resumo,
    itens: itens.map((item) => ({
      id: item.id,
      conta_bancaria_id: item.conta_bancaria_id,
      conta_bancaria_nome: item.contaBancaria?.nome || '-',
      banco: item.contaBancaria?.banco || '-',
      arquivo_nome: item.arquivo_nome,
      arquivo_hash: item.arquivo_hash,
      total_lidos: Number(item.total_lidos || 0),
      importados: Number(item.importados || 0),
      ignorados: Number(item.ignorados || 0),
      criado_em: item.createdAt,
      criado_por: item.criadoPor
        ? {
            id: item.criadoPor.id,
            nome: item.criadoPor.nome,
            email: item.criadoPor.email
          }
        : null
    }))
  };
}

async function loadConciliacaoById(req, conciliacaoId) {
  await assertFinanceAccess(req);
  const id = parseInteger(conciliacaoId, 'Conciliacao bancaria');
  const conciliacao = await ConciliacaoBancaria.findOne({
    where: {
      id,
      deleted_at: null
    }
  });

  if (!conciliacao) {
    throw createHttpError(404, 'Lancamento de conciliacao nao encontrado.');
  }

  await conciliacao.reload({
    include: buildConciliacaoInclude()
  });

  return conciliacao;
}

async function resolveMovimentoForConciliacao(req, conciliacao, movimentoId, options = {}) {
  const validarValor = options.validarValor !== false;
  const parsedMovimentoId = parseInteger(movimentoId, 'Movimento financeiro');
  const movimento = await MovimentoFinanceiro.findByPk(parsedMovimentoId, {
    include: [
      {
        model: TituloFinanceiro,
        as: 'titulo',
        include: [
          {
            model: Parceiro,
            as: 'parceiro',
            attributes: ['id', 'nome']
          }
        ]
      },
      {
        model: ContaBancaria,
        as: 'contaBancaria',
        attributes: ['id', 'nome']
      }
    ]
  });

  if (!movimento) {
    throw createHttpError(
      400,
      'O movimento selecionado nao existe ou nao esta mais disponivel para conciliacao. Atualize as sugestoes e tente novamente.'
    );
  }

  if (String(movimento.status || '').toUpperCase() !== 'ATIVO') {
    throw createHttpError(400, 'Somente movimentos ativos podem ser conciliados.');
  }

  const obraIds = await getFinanceiroObraScopeIds(req.user);
  if (obraIds !== null && (!obraIds.length || !obraIds.includes(Number(movimento.titulo?.obra_id || 0)))) {
    throw createHttpError(403, 'Acesso negado para o titulo vinculado a este movimento.');
  }

  if (Number(movimento.conta_bancaria_id || 0) !== Number(conciliacao.conta_bancaria_id || 0)) {
    throw createHttpError(400, 'O movimento selecionado pertence a outra conta bancaria.');
  }

  const empresaConciliacaoId = conciliacao.empresa_id ? Number(conciliacao.empresa_id) : null;
  const empresaMovimentoId = movimento.empresa_id ? Number(movimento.empresa_id) : null;
  if (!empresaConciliacaoId) {
    throw createHttpError(400, 'Lancamento bancario sem empresa vinculada. Reimporte o OFX apos corrigir a conta bancaria.');
  }
  if (!empresaMovimentoId) {
    throw createHttpError(400, 'Movimento financeiro sem empresa vinculada. Corrija o movimento antes de conciliar.');
  }
  if (empresaConciliacaoId !== empresaMovimentoId) {
    throw createHttpError(400, 'A empresa do movimento financeiro deve ser a mesma empresa do lancamento bancario.');
  }

  if (String(movimento.titulo?.tipo || '').toUpperCase() !== getSignalByValue(conciliacao.valor)) {
    throw createHttpError(400, 'O tipo do titulo nao e compativel com o sinal do lancamento bancario.');
  }

  if (!hasSameConciliacaoDate(conciliacao.data_movimento, movimento.data_movimento)) {
    throw createHttpError(400, 'A data do movimento deve ser igual a data do lancamento bancario importado.');
  }

  if (validarValor) {
    if (!hasSameConciliacaoValue(conciliacao.valor, movimento.valor_quitacao)) {
      throw createHttpError(400, 'O valor do movimento nao confere com o lancamento bancario importado.');
    }
  }

  const jaConciliado = await ConciliacaoBancaria.findOne({
    where: {
      movimento_financeiro_id: movimento.id,
      status: 'CONCILIADO',
      id: {
        [Op.ne]: conciliacao.id
      }
    },
    attributes: ['id']
  });

  if (jaConciliado) {
    throw createHttpError(400, 'Este movimento financeiro ja foi usado em outra conciliacao.');
  }

  if (movimento.conciliacao_bancaria_id && Number(movimento.conciliacao_bancaria_id) !== Number(conciliacao.id)) {
    throw createHttpError(400, 'Este movimento financeiro ja esta vinculado a outra conciliacao.');
  }

  return movimento;
}

async function listarFaturasAssociacao(req, conciliacaoId, filters = {}) {
  const conciliacao = await loadConciliacaoById(req, conciliacaoId);
  const valorBancoAbsoluto = Math.abs(Number(conciliacao.valor || 0));
  const valueBounds = resolveValueBounds(filters);
  const dataInicial = filters.data_inicial || subtractDays(conciliacao.data_movimento, 7);
  const dataFinal = filters.data_final || addDays(conciliacao.data_movimento, 7);
  const limit = normalizeSearchLimit(filters.limit, 30);
  const dataRange = {
    [Op.between]: [dataInicial, dataFinal]
  };

  const faturas = await FaturaCartaoFinanceiro.findAll({
    where: {
      status: {
        [Op.in]: ['ABERTA', 'FECHADA', 'PARCIAL', 'PAGA', 'PAGO', 'QUITADA', 'BAIXADA']
      },
      [Op.or]: [
        { data_vencimento: dataRange },
        { data_pagamento: dataRange },
        { data_fechamento: dataRange }
      ]
    },
    include: [
      {
        model: CartaoFinanceiro,
        as: 'cartao',
        attributes: ['id', 'nome', 'titular', 'bandeira', 'ultimos_digitos']
      },
      {
        model: TituloFinanceiro,
        as: 'titulos',
        attributes: ['id'],
        required: false
      }
    ],
    order: [['data_vencimento', 'DESC'], ['id', 'DESC']]
  });

  const search = normalizeText(filters.documento || filters.busca || '');
  const itens = faturas
    .filter((fatura) => {
      if (!valueBounds.shouldFilter) return true;
      const valor = Math.abs(Number(fatura.valor_total || 0));
      if (valueBounds.lower === valueBounds.upper) return Math.abs(valor - valueBounds.lower) <= 0.1;
      return valor >= valueBounds.lower && valor <= valueBounds.upper;
    })
    .filter((fatura) => {
      if (!search) return true;
      const haystack = normalizeText([
        fatura.competencia,
        fatura.cartao?.nome,
        fatura.cartao?.titular,
        fatura.cartao?.bandeira,
        fatura.cartao?.ultimos_digitos
      ].filter(Boolean).join(' '));
      return haystack.includes(search);
    })
    .slice(0, limit)
    .map((fatura) => {
      const dataReferencia = fatura.data_pagamento || fatura.data_vencimento || fatura.data_fechamento;
      return {
        id: fatura.id,
        fatura_cartao_id: fatura.id,
        cartao: fatura.cartao
          ? {
              id: fatura.cartao.id,
              nome: fatura.cartao.nome,
              titular: fatura.cartao.titular,
              bandeira: fatura.cartao.bandeira,
              ultimos_digitos: fatura.cartao.ultimos_digitos
            }
          : null,
        cartao_nome: fatura.cartao?.nome || '-',
        cartao_final: fatura.cartao?.ultimos_digitos || null,
        competencia: fatura.competencia,
        status: fatura.status,
        data_fechamento: fatura.data_fechamento,
        data_vencimento: fatura.data_vencimento,
        valor_total: Number(fatura.valor_total || 0),
        total_titulos: Array.isArray(fatura.titulos) ? fatura.titulos.length : 0,
        diff_valor: roundCurrency(Math.abs(Math.abs(Number(fatura.valor_total || 0)) - valorBancoAbsoluto)),
        diff_dias: calculateDiffDays(conciliacao.data_movimento, dataReferencia)
      };
    });

  return {
    conciliacao: {
      id: conciliacao.id,
      conta_bancaria_id: conciliacao.conta_bancaria_id,
      conta_bancaria_nome: conciliacao.contaBancaria?.nome || '-',
      data_movimento: conciliacao.data_movimento,
      valor: Number(conciliacao.valor || 0),
      documento: conciliacao.documento,
      descricao_banco: conciliacao.descricao_banco
    },
    meta: { total: itens.length, limit },
    itens
  };
}

async function confirmarConciliacaoFatura(req, conciliacaoId, payload = {}) {
  await assertFinanceAccess(req);
  const transaction = await sequelize.transaction();
  try {
    const conciliacao = await ConciliacaoBancaria.findByPk(conciliacaoId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!conciliacao) throw createHttpError(404, 'Lancamento de conciliacao nao encontrado.');
    if (String(conciliacao.status || '').toUpperCase() !== 'PENDENTE') {
      throw createHttpError(400, 'Somente conciliacoes pendentes podem ser confirmadas.');
    }

    const faturaId = parseInteger(payload.fatura_cartao_id, 'Fatura de cartao');
    const fatura = await FaturaCartaoFinanceiro.findByPk(faturaId, { transaction });
    if (!fatura) throw createHttpError(400, 'Fatura de cartao invalida.');
    const statusFatura = String(fatura.status || '').toUpperCase();

    const valorConciliacao = Math.abs(Number(conciliacao.valor || 0));
    const valorFatura = Math.abs(Number(fatura.valor_total || 0));
    if (Math.abs(valorConciliacao - valorFatura) > 0.1) {
      throw createHttpError(400, 'O valor da fatura nao confere com o lancamento bancario.');
    }

    if (!['PAGA', 'PAGO', 'QUITADA', 'BAIXADA'].includes(statusFatura)) {
      await baixarFaturaCartao(req, fatura.id, {
        conta_bancaria_id: conciliacao.conta_bancaria_id,
        data_movimento: conciliacao.data_movimento,
        observacoes: `Baixa conciliada pelo lancamento bancario #${conciliacao.id}`
      }, { transaction });
    }

    await conciliacao.update({
      fatura_cartao_id: fatura.id,
      movimento_financeiro_id: null,
      titulo_financeiro_id: null,
      status: 'CONCILIADO',
      confirmado_por: req.user?.id || null,
      confirmado_em: new Date()
    }, { transaction });

    await fatura.update({
      conciliacao_bancaria_id: conciliacao.id
    }, { transaction });

    await transaction.commit();

    await registrarEventoSeguranca({
      req,
      usuarioId: req.user?.id || null,
      tipoEvento: 'FINANCIAL_BANK_RECONCILED_CARD_STATEMENT',
      recursoTipo: 'CONCILIACAO_BANCARIA',
      recursoId: conciliacao.id,
      status: 'SUCCESS',
      descricao: 'Lancamento bancario conciliado com fatura de cartao',
      metadata: {
        fatura_cartao_id: fatura.id,
        valor_fatura: valorFatura
      }
    });

    return loadConciliacaoById(req, conciliacao.id);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function confirmarConciliacaoTransferencia(req, conciliacaoId, payload = {}) {
  await assertFinanceAccess(req);
  const transaction = await sequelize.transaction();

  try {
    const conciliacao = await ConciliacaoBancaria.findByPk(conciliacaoId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!conciliacao) throw createHttpError(404, 'Lancamento de conciliacao nao encontrado.');
    if (String(conciliacao.status || '').toUpperCase() !== 'PENDENTE') {
      throw createHttpError(400, 'Somente conciliacoes pendentes podem ser confirmadas.');
    }

    const contaAtualId = parseInteger(conciliacao.conta_bancaria_id, 'Conta do lancamento bancario');
    const contaContraparteId = parseInteger(payload.conta_contraparte_id, 'Conta contraparte');
    if (contaAtualId === contaContraparteId) {
      throw createHttpError(400, 'A conta contraparte deve ser diferente da conta do lancamento bancario.');
    }
    await validarEmpresaConciliacaoComConta(conciliacao, { transaction });

    const valor = roundCurrency(Math.abs(Number(conciliacao.valor || 0)));
    if (valor <= 0) {
      throw createHttpError(400, 'Valor do lancamento bancario invalido para transferencia.');
    }

    const isSaidaDaContaAtual = Number(conciliacao.valor || 0) < 0;
    const contrapartesMap = await carregarContrapartesTransferenciaExatas([conciliacao], {
      contaContraparteId,
      transaction,
      lock: true
    });
    const contrapartesExatas = contrapartesMap.get(Number(conciliacao.id)) || [];
    const conciliacaoContraparte = contrapartesExatas.length === 1
      ? contrapartesExatas[0]
      : null;
    const payloadTransferencia = {
      conta_origem_id: isSaidaDaContaAtual ? contaAtualId : contaContraparteId,
      conta_destino_id: isSaidaDaContaAtual ? contaContraparteId : contaAtualId,
      tipo_transferencia: payload.tipo_transferencia,
      data_transferencia: conciliacao.data_movimento,
      valor,
      descricao: payload.descricao || `Transferencia conciliada pelo lancamento bancario #${conciliacao.id}`,
      tipo_intercompany: payload.tipo_intercompany || null,
      motivo_intercompany: payload.motivo_intercompany || null,
      elimina_consolidado: payload.elimina_consolidado === false ? false : true,
      conciliacao_origem_id: isSaidaDaContaAtual ? conciliacao.id : conciliacaoContraparte?.id || null,
      conciliacao_destino_id: isSaidaDaContaAtual ? conciliacaoContraparte?.id || null : conciliacao.id
    };

    const { transferencia, afterCommit } = await criarTransferenciaFinanceira(
      req,
      payloadTransferencia,
      { transaction }
    );

    await conciliacao.update({
      transferencia_financeira_id: transferencia.id,
      movimento_financeiro_id: null,
      titulo_financeiro_id: null,
      fatura_cartao_id: null,
      status: 'CONCILIADO',
      confirmado_por: req.user?.id || null,
      confirmado_em: new Date()
    }, { transaction });

    if (conciliacaoContraparte) {
      await conciliacaoContraparte.update({
        transferencia_financeira_id: transferencia.id,
        movimento_financeiro_id: null,
        titulo_financeiro_id: null,
        fatura_cartao_id: null,
        status: 'CONCILIADO',
        confirmado_por: req.user?.id || null,
        confirmado_em: new Date()
      }, { transaction });
    }

    await transaction.commit();
    if (afterCommit) await afterCommit();

    await registrarEventoSeguranca({
      req,
      usuarioId: req.user?.id || null,
      tipoEvento: 'FINANCIAL_BANK_RECONCILED_TRANSFER',
      recursoTipo: 'CONCILIACAO_BANCARIA',
      recursoId: conciliacao.id,
      status: 'SUCCESS',
      descricao: 'Lancamento bancario conciliado como transferencia entre contas',
      metadata: {
        transferencia_financeira_id: transferencia.id,
        conta_origem_id: payloadTransferencia.conta_origem_id,
        conta_destino_id: payloadTransferencia.conta_destino_id,
        empresa_origem_id: transferencia.empresa_origem_id,
        empresa_destino_id: transferencia.empresa_destino_id,
        tipo_intercompany: transferencia.tipo_intercompany,
        elimina_consolidado: transferencia.elimina_consolidado,
        conciliacao_contraparte_id: conciliacaoContraparte?.id || null,
        contraparte_localizada_automaticamente: Boolean(conciliacaoContraparte),
        contrapartes_exatas_encontradas: contrapartesExatas.length,
        valor
      }
    });

    return loadConciliacaoById(req, conciliacao.id);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function estornarConciliacaoTransferencia(req, conciliacaoId, payload = {}) {
  await assertFinanceAccess(req);
  const motivo = String(payload.motivo || '').trim();
  if (!motivo) throw createHttpError(400, 'Informe o motivo do estorno da transferencia.');

  const transaction = await sequelize.transaction();
  let transferencia;
  let conciliacoesVinculadas = [];

  try {
    const conciliacao = await ConciliacaoBancaria.findByPk(conciliacaoId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!conciliacao) throw createHttpError(404, 'Lancamento de conciliacao nao encontrado.');
    if (String(conciliacao.status || '').toUpperCase() !== 'CONCILIADO' || !conciliacao.transferencia_financeira_id) {
      throw createHttpError(400, 'O lancamento nao possui uma transferencia conciliada ativa para estorno.');
    }

    transferencia = await TransferenciaFinanceira.findByPk(conciliacao.transferencia_financeira_id, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!transferencia) throw createHttpError(404, 'Transferencia financeira conciliada nao encontrada.');
    if (String(transferencia.status || '').toUpperCase() !== 'ATIVA') {
      throw createHttpError(409, 'A transferencia financeira ja foi cancelada ou nao esta ativa.');
    }

    const conciliacaoIds = [
      Number(conciliacao.id),
      Number(transferencia.conciliacao_origem_id),
      Number(transferencia.conciliacao_destino_id)
    ].filter(Boolean);

    conciliacoesVinculadas = await ConciliacaoBancaria.findAll({
      where: {
        [Op.or]: [
          { transferencia_financeira_id: transferencia.id },
          { id: { [Op.in]: conciliacaoIds } }
        ]
      },
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!conciliacoesVinculadas.length) {
      throw createHttpError(409, 'Nenhum lancamento OFX vinculado a transferencia foi encontrado.');
    }

    const vinculoIncompativel = conciliacoesVinculadas.find((item) => (
      item.movimento_financeiro_id || item.titulo_financeiro_id || item.fatura_cartao_id
    ));
    if (vinculoIncompativel) {
      throw createHttpError(409, 'A transferencia possui conciliacao com outro vinculo financeiro e exige revisao manual.');
    }

    await transferencia.update({
      status: 'CANCELADA',
      cancelado_por: req.user?.id || null,
      cancelado_em: new Date(),
      observacoes_cancelamento: motivo,
      conciliacao_origem_id: null,
      conciliacao_destino_id: null
    }, { transaction });

    await ConciliacaoBancaria.update({
      status: 'PENDENTE',
      transferencia_financeira_id: null,
      movimento_financeiro_id: null,
      titulo_financeiro_id: null,
      fatura_cartao_id: null,
      confirmado_por: null,
      confirmado_em: null
    }, {
      where: { id: { [Op.in]: conciliacoesVinculadas.map((item) => item.id) } },
      transaction
    });

    await transaction.commit();

    await registrarEventoSeguranca({
      req,
      usuarioId: req.user?.id || null,
      tipoEvento: 'FINANCIAL_BANK_RECONCILIATION_TRANSFER_REVERSED',
      recursoTipo: 'TRANSFERENCIA_FINANCEIRA',
      recursoId: transferencia.id,
      status: 'SUCCESS',
      descricao: 'Transferencia conciliada estornada e lancamentos OFX reabertos',
      metadata: {
        motivo,
        conciliacao_ids: conciliacoesVinculadas.map((item) => item.id),
        conta_origem_id: transferencia.conta_origem_id,
        conta_destino_id: transferencia.conta_destino_id,
        valor: Number(transferencia.valor || 0)
      }
    });

    return loadConciliacaoById(req, conciliacaoId);
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
}

async function estornarConciliacao(req, conciliacaoId, payload = {}) {
  await assertFinanceAccess(req);
  const motivo = String(payload.motivo || '').trim();
  if (!motivo) throw createHttpError(400, 'Informe o motivo do estorno da conciliacao.');

  const referencia = await loadConciliacaoById(req, conciliacaoId);
  if (String(referencia.resolucao_tipo || '').toUpperCase() === 'ESTORNO_BANCARIO') {
    throw createHttpError(409, 'O desfazimento de um estorno bancario confirmado exige fluxo operacional especifico e nao pode ser feito pelo estorno generico.');
  }
  if (referencia.transferencia_financeira_id) {
    return estornarConciliacaoTransferencia(req, conciliacaoId, payload);
  }

  const transaction = await sequelize.transaction();
  let tipoEstorno = 'VINCULO_FINANCEIRO';
  let movimentosVinculados = [];
  let fatura = null;

  try {
    const conciliacao = await ConciliacaoBancaria.findOne({
      where: {
        id: parseInteger(conciliacaoId, 'Conciliacao bancaria'),
        deleted_at: null
      },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!conciliacao) throw createHttpError(404, 'Lancamento de conciliacao nao encontrado.');
    if (String(conciliacao.status || '').toUpperCase() !== 'CONCILIADO') {
      throw createHttpError(409, 'Somente lancamentos conciliados podem ser estornados.');
    }
    if (conciliacao.transferencia_financeira_id) {
      throw createHttpError(409, 'A conciliacao passou a representar uma transferencia. Atualize o relatorio e tente novamente.');
    }

    const movimentoPrincipalId = Number(conciliacao.movimento_financeiro_id || 0) || null;
    movimentosVinculados = await MovimentoFinanceiro.findAll({
      where: {
        [Op.or]: [
          { conciliacao_bancaria_id: conciliacao.id },
          ...(movimentoPrincipalId ? [{ id: movimentoPrincipalId }] : [])
        ]
      },
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    const movimentoComOutroVinculo = movimentosVinculados.find((movimento) => (
      movimento.conciliacao_bancaria_id
      && Number(movimento.conciliacao_bancaria_id) !== Number(conciliacao.id)
    ));
    if (movimentoComOutroVinculo) {
      throw createHttpError(409, 'Um movimento financeiro ja esta vinculado a outra conciliacao e exige revisao manual.');
    }

    const tiposAvulsosEstornaveis = new Set([
      'TARIFA_BANCARIA',
      'ESTORNO_TARIFA_BANCARIA',
      'LIBERACAO_CREDITO_ROTATIVO',
      'AMORTIZACAO_CREDITO_ROTATIVO'
    ]);
    const movimentoAvulso = movimentosVinculados.find((movimento) => (
      tiposAvulsosEstornaveis.has(String(movimento.tipo_movimento || '').toUpperCase())
    ));
    if (movimentoAvulso) {
      if (String(movimentoAvulso.status || '').toUpperCase() !== 'ATIVO') {
        throw createHttpError(409, 'O movimento avulso ja foi estornado ou nao esta ativo.');
      }
      const tipoMovimentoAvulso = String(movimentoAvulso.tipo_movimento || '').toUpperCase();
      if (tipoMovimentoAvulso === 'TARIFA_BANCARIA') {
        const estornoBancarioAtivo = await MovimentoFinanceiro.findOne({
          where: {
            movimento_origem_id: movimentoAvulso.id,
            tipo_movimento: 'ESTORNO_TARIFA_BANCARIA',
            status: 'ATIVO'
          },
          transaction,
          lock: transaction.LOCK.UPDATE
        });
        if (estornoBancarioAtivo) {
          throw createHttpError(409, 'A tarifa possui estorno bancario vinculado. Estorne primeiro a conciliacao do credito de devolucao.');
        }
      }
      tipoEstorno = tipoMovimentoAvulso === 'TARIFA_BANCARIA'
        ? 'TARIFA_BANCARIA'
        : tipoMovimentoAvulso === 'ESTORNO_TARIFA_BANCARIA'
          ? 'ESTORNO_TARIFA_BANCARIA'
          : 'CREDITO_ROTATIVO';
      await movimentoAvulso.update({
        status: 'ESTORNADO',
        conciliacao_bancaria_id: null,
        observacoes: `${String(movimentoAvulso.observacoes || '').trim()}\nEstorno da conciliacao: ${motivo}`.trim(),
        estornado_por: req.user?.id || null,
        estornado_em: new Date()
      }, { transaction });
    }

    for (const movimento of movimentosVinculados) {
      if (movimentoAvulso && Number(movimento.id) === Number(movimentoAvulso.id)) continue;
      await movimento.update({ conciliacao_bancaria_id: null }, { transaction });
    }

    if (conciliacao.fatura_cartao_id) {
      fatura = await FaturaCartaoFinanceiro.findByPk(conciliacao.fatura_cartao_id, {
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!fatura) throw createHttpError(409, 'A fatura vinculada a conciliacao nao foi encontrada.');
      if (
        fatura.conciliacao_bancaria_id
        && Number(fatura.conciliacao_bancaria_id) !== Number(conciliacao.id)
      ) {
        throw createHttpError(409, 'A fatura ja esta vinculada a outra conciliacao e exige revisao manual.');
      }
      await fatura.update({ conciliacao_bancaria_id: null }, { transaction });
      tipoEstorno = 'FATURA_CARTAO';
    } else if (conciliacao.titulo_financeiro_id) {
      tipoEstorno = 'TITULO_FINANCEIRO';
    } else if (movimentosVinculados.length && !['TARIFA_BANCARIA', 'ESTORNO_TARIFA_BANCARIA', 'CREDITO_ROTATIVO'].includes(tipoEstorno)) {
      tipoEstorno = 'MOVIMENTO_FINANCEIRO';
    }

    await conciliacao.update({
      status: 'PENDENTE',
      transferencia_financeira_id: null,
      movimento_financeiro_id: null,
      titulo_financeiro_id: null,
      fatura_cartao_id: null,
      caixa_sessao_id: null,
      confirmado_por: null,
      confirmado_em: null
    }, { transaction });

    await transaction.commit();

    await registrarEventoSeguranca({
      req,
      usuarioId: req.user?.id || null,
      tipoEvento: 'FINANCIAL_BANK_RECONCILIATION_REVERSED',
      recursoTipo: 'CONCILIACAO_BANCARIA',
      recursoId: conciliacao.id,
      status: 'SUCCESS',
      descricao: 'Conciliacao bancaria estornada e lancamento OFX reaberto',
      metadata: {
        motivo,
        tipo_estorno: tipoEstorno,
        movimento_financeiro_ids: movimentosVinculados.map((movimento) => movimento.id),
        titulo_financeiro_id: conciliacao.titulo_financeiro_id || null,
        fatura_cartao_id: fatura?.id || null,
        conta_bancaria_id: conciliacao.conta_bancaria_id,
        valor: Number(conciliacao.valor || 0)
      }
    });

    return loadConciliacaoById(req, conciliacao.id);
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
}

async function confirmarConciliacaoTarifa(req, conciliacaoId, payload = {}) {
  await assertFinanceAccess(req);

  const codigoTarifa = normalizeConfigCode(payload.codigo);
  if (!codigoTarifa) {
    throw createHttpError(400, 'Selecione a tarifa bancaria.');
  }

  const atalhos = await listarTarifasBancariasConfig(req);
  const tarifa = atalhos.find((item) => normalizeConfigCode(item.codigo) === codigoTarifa && item.ativo !== false);
  if (!tarifa) {
    throw createHttpError(400, 'Tarifa bancaria inativa ou nao configurada.');
  }

  const transaction = await sequelize.transaction();
  try {
    const conciliacao = await ConciliacaoBancaria.findByPk(conciliacaoId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!conciliacao) throw createHttpError(404, 'Lancamento de conciliacao nao encontrado.');
    const statusConciliacao = String(conciliacao.status || '').toUpperCase();
    if (statusConciliacao !== 'PENDENTE') {
      const movimentoExistente = statusConciliacao === 'CONCILIADO' && conciliacao.movimento_financeiro_id
        ? await MovimentoFinanceiro.findByPk(conciliacao.movimento_financeiro_id, { transaction })
        : null;
      const observacoesMovimento = String(movimentoExistente?.observacoes || '').trim().toUpperCase();
      const mesmaTarifa = movimentoExistente
        && String(movimentoExistente.tipo_movimento || '').toUpperCase() === 'TARIFA_BANCARIA'
        && observacoesMovimento.startsWith(`[${String(tarifa.codigo || '').trim().toUpperCase()}]`);

      if (mesmaTarifa) {
        await transaction.commit();
        return {
          ...conciliacao.toJSON(),
          movimento: movimentoExistente.toJSON(),
          idempotente: true
        };
      }

      throw createHttpError(400, 'Somente conciliacoes pendentes podem ser confirmadas.');
    }

    const valorBanco = Number(conciliacao.valor || 0);
    if (valorBanco >= 0) {
      throw createHttpError(400, 'Tarifas bancarias devem ser conciliadas em lancamentos de saida da conta.');
    }

    const { conta, empresaId: empresaConciliacaoId } = await validarEmpresaConciliacaoComConta(conciliacao, { transaction });

    const valor = roundCurrency(Math.abs(valorBanco));
    if (valor <= 0) {
      throw createHttpError(400, 'Valor do lancamento bancario invalido para tarifa.');
    }
    const categoria = await resolveCategoriaTarifaBancaria(tarifa, { transaction });

    const sessao = await obterSessaoAbertaParaConta(conta, conciliacao.data_movimento, { transaction });
    const descricao = String(payload.descricao || conciliacao.descricao_banco || tarifa.nome || '').trim().slice(0, 255);
    const movimento = await MovimentoFinanceiro.create({
      titulo_financeiro_id: null,
      categoria_financeira_id: categoria.id,
      conta_bancaria_id: conta.id,
      empresa_id: empresaConciliacaoId,
      caixa_sessao_id: sessao?.id || null,
      conciliacao_bancaria_id: conciliacao.id,
      tipo_movimento: 'TARIFA_BANCARIA',
      status: 'ATIVO',
      valor,
      juros: 0,
      multa: 0,
      desconto: 0,
      valor_quitacao: valor,
      data_movimento: conciliacao.data_movimento,
      documento_referencia: conciliacao.documento || tarifa.codigo,
      observacoes: `[${tarifa.codigo}] ${descricao || tarifa.nome}`,
      criado_por: req.user?.id || null
    }, { transaction });

    await conciliacao.update({
      transferencia_financeira_id: null,
      movimento_financeiro_id: movimento.id,
      titulo_financeiro_id: null,
      fatura_cartao_id: null,
      empresa_id: empresaConciliacaoId,
      caixa_sessao_id: sessao?.id || null,
      status: 'CONCILIADO',
      confirmado_por: req.user?.id || null,
      confirmado_em: new Date()
    }, { transaction });

    await transaction.commit();

    try {
      await registrarEventoSeguranca({
        req,
        usuarioId: req.user?.id || null,
        tipoEvento: 'FINANCIAL_BANK_RECONCILED_FEE',
        recursoTipo: 'CONCILIACAO_BANCARIA',
        recursoId: conciliacao.id,
        status: 'SUCCESS',
        descricao: 'Lancamento bancario conciliado como tarifa bancaria',
        metadata: {
          movimento_financeiro_id: movimento.id,
          conta_bancaria_id: conta.id,
          categoria_financeira_id: categoria.id,
          codigo_tarifa: tarifa.codigo,
          valor
        }
      });
    } catch (auditError) {
      console.error('Falha ao registrar auditoria da conciliacao de tarifa bancaria:', auditError);
    }

    return {
      ...conciliacao.toJSON(),
      movimento: movimento.toJSON(),
      idempotente: false
    };
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }
    throw error;
  }
}

async function listarTarifasParaEstorno(req, conciliacaoId) {
  await assertFinanceAccess(req);

  const conciliacao = await loadConciliacaoById(req, conciliacaoId);
  if (String(conciliacao.status || '').toUpperCase() !== 'PENDENTE') {
    throw createHttpError(409, 'Somente lancamentos pendentes podem ser associados a um estorno de tarifa.');
  }

  const valorBanco = Number(conciliacao.valor || 0);
  if (!Number.isFinite(valorBanco) || valorBanco <= 0) {
    throw createHttpError(400, 'O estorno de tarifa deve ser um lancamento de entrada da conta.');
  }

  const valor = roundCurrency(Math.abs(valorBanco));
  const tarifas = await MovimentoFinanceiro.findAll({
    where: {
      conta_bancaria_id: conciliacao.conta_bancaria_id,
      empresa_id: conciliacao.empresa_id,
      tipo_movimento: 'TARIFA_BANCARIA',
      status: 'ATIVO',
      data_movimento: { [Op.lte]: conciliacao.data_movimento },
      [Op.or]: [
        { valor_quitacao: valor },
        { valor }
      ]
    },
    include: [
      {
        model: CategoriaFinanceira,
        as: 'categoriaFinanceira',
        attributes: ['id', 'codigo', 'nome'],
        required: false
      },
      {
        model: ConciliacaoBancaria,
        as: 'conciliacaoBancaria',
        attributes: ['id', 'descricao_banco', 'documento', 'data_movimento'],
        required: false
      }
    ],
    order: [['data_movimento', 'DESC'], ['id', 'DESC']],
    limit: 50
  });

  const ids = tarifas.map((item) => Number(item.id));
  const estornosAtivos = ids.length
    ? await MovimentoFinanceiro.findAll({
        attributes: ['movimento_origem_id'],
        where: {
          movimento_origem_id: { [Op.in]: ids },
          tipo_movimento: 'ESTORNO_TARIFA_BANCARIA',
          status: 'ATIVO'
        },
        raw: true
      })
    : [];
  const jaEstornadas = new Set(estornosAtivos.map((item) => Number(item.movimento_origem_id)));

  return {
    conciliacao: {
      id: conciliacao.id,
      conta_bancaria_id: conciliacao.conta_bancaria_id,
      empresa_id: conciliacao.empresa_id,
      data_movimento: conciliacao.data_movimento,
      valor
    },
    itens: tarifas
      .filter((item) => !jaEstornadas.has(Number(item.id)))
      .map((item) => ({
        id: item.id,
        data_movimento: item.data_movimento,
        valor: Number(item.valor_quitacao || item.valor || 0),
        documento: item.documento_referencia || null,
        observacoes: item.observacoes || null,
        categoria: item.categoriaFinanceira
          ? {
              id: item.categoriaFinanceira.id,
              codigo: item.categoriaFinanceira.codigo,
              nome: item.categoriaFinanceira.nome
            }
          : null,
        conciliacao_origem: item.conciliacaoBancaria
          ? {
              id: item.conciliacaoBancaria.id,
              descricao_banco: item.conciliacaoBancaria.descricao_banco,
              documento: item.conciliacaoBancaria.documento,
              data_movimento: item.conciliacaoBancaria.data_movimento
            }
          : null
      }))
  };
}

async function confirmarConciliacaoEstornoTarifa(req, conciliacaoId, payload = {}) {
  await assertFinanceAccess(req);
  const codigoTarifa = normalizeConfigCode(payload.codigo);
  const movimentoTarifaIdLegado = payload.movimento_tarifa_id
    ? parseInteger(payload.movimento_tarifa_id, 'Movimento da tarifa')
    : null;

  let tarifa = null;
  if (codigoTarifa) {
    const atalhos = await listarTarifasBancariasConfig(req);
    tarifa = atalhos.find((item) => normalizeConfigCode(item.codigo) === codigoTarifa && item.ativo !== false);
    if (!tarifa) {
      throw createHttpError(400, 'Tarifa bancaria inativa ou nao configurada.');
    }
  }

  const transaction = await sequelize.transaction();
  try {
    const conciliacao = await ConciliacaoBancaria.findOne({
      where: { id: parseInteger(conciliacaoId, 'Conciliacao bancaria'), deleted_at: null },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!conciliacao) throw createHttpError(404, 'Lancamento de conciliacao nao encontrado.');

    const statusConciliacao = String(conciliacao.status || '').toUpperCase();
    if (statusConciliacao !== 'PENDENTE') {
      const movimentoExistente = statusConciliacao === 'CONCILIADO' && conciliacao.movimento_financeiro_id
        ? await MovimentoFinanceiro.findByPk(conciliacao.movimento_financeiro_id, { transaction })
        : null;
      if (
        movimentoExistente
        && String(movimentoExistente.tipo_movimento || '').toUpperCase() === 'ESTORNO_TARIFA_BANCARIA'
      ) {
        await transaction.commit();
        return { ...conciliacao.toJSON(), movimento: movimentoExistente.toJSON(), idempotente: true };
      }
      throw createHttpError(409, 'Somente conciliacoes pendentes podem ser confirmadas.');
    }

    const valorBanco = Number(conciliacao.valor || 0);
    if (!Number.isFinite(valorBanco) || valorBanco <= 0) {
      throw createHttpError(400, 'O estorno de tarifa deve ser um lancamento de entrada da conta.');
    }

    const valor = roundCurrency(Math.abs(valorBanco));
    const { conta, empresaId: empresaConciliacaoId } = await validarEmpresaConciliacaoComConta(conciliacao, { transaction });

    // Compatibilidade temporaria com telas em cache que ainda enviam o id da tarifa.
    // O registro e usado somente para descobrir a classificacao; o novo estorno nao fica vinculado a ele.
    if (!tarifa && movimentoTarifaIdLegado) {
      const tarifaLegada = await MovimentoFinanceiro.findOne({
        where: { id: movimentoTarifaIdLegado, tipo_movimento: 'TARIFA_BANCARIA' },
        transaction
      });
      if (!tarifaLegada) throw createHttpError(404, 'Tarifa bancaria informada nao foi encontrada.');
      tarifa = {
        codigo: 'ESTORNO_TARIFA',
        nome: 'Estorno de tarifa bancaria',
        categoria_financeira_id: tarifaLegada.categoria_financeira_id
      };
    }
    if (!tarifa) throw createHttpError(400, 'Selecione o tipo de tarifa bancaria para classificar o estorno.');

    const categoria = await resolveCategoriaTarifaBancaria(tarifa, { transaction });

    const sessao = await obterSessaoAbertaParaConta(conta, conciliacao.data_movimento, { transaction });
    const descricao = String(payload.descricao || conciliacao.descricao_banco || 'Estorno de tarifa bancaria')
      .trim()
      .slice(0, 255);
    const movimento = await MovimentoFinanceiro.create({
      titulo_financeiro_id: null,
      categoria_financeira_id: categoria.id,
      conta_bancaria_id: conta.id,
      empresa_id: empresaConciliacaoId,
      caixa_sessao_id: sessao?.id || null,
      conciliacao_bancaria_id: conciliacao.id,
      movimento_origem_id: null,
      tipo_movimento: 'ESTORNO_TARIFA_BANCARIA',
      status: 'ATIVO',
      valor,
      juros: 0,
      multa: 0,
      desconto: 0,
      valor_quitacao: valor,
      data_movimento: conciliacao.data_movimento,
      documento_referencia: conciliacao.documento || tarifa.codigo,
      observacoes: `[ESTORNO_TARIFA:${tarifa.codigo}] ${descricao}`,
      criado_por: req.user?.id || null
    }, { transaction });

    await conciliacao.update({
      transferencia_financeira_id: null,
      movimento_financeiro_id: movimento.id,
      titulo_financeiro_id: null,
      fatura_cartao_id: null,
      empresa_id: empresaConciliacaoId,
      caixa_sessao_id: sessao?.id || null,
      status: 'CONCILIADO',
      confirmado_por: req.user?.id || null,
      confirmado_em: new Date()
    }, { transaction });

    await transaction.commit();

    await registrarEventoSeguranca({
      req,
      usuarioId: req.user?.id || null,
      tipoEvento: 'FINANCIAL_BANK_RECONCILED_FEE_REVERSAL',
      recursoTipo: 'CONCILIACAO_BANCARIA',
      recursoId: conciliacao.id,
      status: 'SUCCESS',
      descricao: 'Credito bancario conciliado como estorno de tarifa',
      metadata: {
        movimento_financeiro_id: movimento.id,
        conta_bancaria_id: conta.id,
        categoria_financeira_id: categoria.id,
        codigo_tarifa: tarifa.codigo,
        lancamento_independente: true,
        valor
      }
    });

    return { ...conciliacao.toJSON(), movimento: movimento.toJSON(), idempotente: false };
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
}

async function confirmarConciliacaoEstornoBancario(req, conciliacaoId, payload = {}) {
  await assertFinanceAccess(req);
  const origemId = parseInteger(payload.conciliacao_origem_id, 'Lancamento bancario original');
  const motivo = String(payload.motivo || '').trim();
  if (!motivo) throw createHttpError(400, 'Informe a justificativa para confirmar o estorno bancario.');

  let estorno = await ConciliacaoBancaria.findByPk(conciliacaoId);
  if (!estorno) throw createHttpError(404, 'Lancamento de estorno nao encontrado.');
  if (
    String(estorno.estorno_status || '').toUpperCase() === 'CONFIRMADO'
    && Number(estorno.estorno_conciliacao_origem_id) === origemId
  ) {
    return loadConciliacaoById(req, estorno.id);
  }
  if (String(estorno.status || '').toUpperCase() !== 'PENDENTE') {
    throw createHttpError(409, 'Somente um alerta pendente pode ser confirmado como estorno bancario.');
  }

  const analise = await analisarPossivelEstornoBancario(estorno);
  if (!analise) throw createHttpError(409, 'O lancamento nao possui indicios de estorno bancario.');
  const candidato = analise.candidatos.find((item) => Number(item.conciliacao_id) === origemId);
  if (!candidato) {
    throw createHttpError(409, 'O lancamento original selecionado nao e compativel com este estorno.');
  }

  let origem = await ConciliacaoBancaria.findByPk(origemId);
  if (!origem || origem.deleted_at) throw createHttpError(404, 'Lancamento bancario original nao encontrado.');
  let movimentoOriginalId = Number(origem.movimento_financeiro_id || 0) || null;
  let tituloOriginalId = Number(origem.titulo_financeiro_id || 0) || null;
  let tipoMovimentoOriginal = null;
  let origemSemBaixa = false;
  const movimentosOrigem = await MovimentoFinanceiro.findAll({
    where: {
      conciliacao_bancaria_id: origem.id,
      tipo_movimento: 'BAIXA',
      status: { [Op.in]: ['ATIVO', 'ESTORNADO'] }
    },
    order: [['id', 'ASC']]
  });
  if (movimentosOrigem.length > 1) {
    throw createHttpError(
      409,
      'A saida original esta conciliada com multiplas baixas. Estorne os titulos individualmente antes de concluir a devolucao bancaria.'
    );
  }
  if (!movimentoOriginalId && movimentosOrigem.length === 1) {
    movimentoOriginalId = Number(movimentosOrigem[0].id);
    tituloOriginalId = Number(movimentosOrigem[0].titulo_financeiro_id || 0) || null;
  }

  if (movimentoOriginalId) {
    const movimentoOriginal = await MovimentoFinanceiro.findByPk(movimentoOriginalId);
    if (!movimentoOriginal) throw createHttpError(409, 'Movimento financeiro original nao encontrado.');
    tipoMovimentoOriginal = String(movimentoOriginal.tipo_movimento || '').toUpperCase();
    if (!movimentoOriginal.conciliacao_bancaria_id) {
      await movimentoOriginal.update({ conciliacao_bancaria_id: origem.id });
    } else if (Number(movimentoOriginal.conciliacao_bancaria_id) !== Number(origem.id)) {
      throw createHttpError(409, 'O movimento original esta vinculado a outro lancamento bancario.');
    }

    if (tipoMovimentoOriginal === 'BAIXA') {
      if (!tituloOriginalId || Number(movimentoOriginal.titulo_financeiro_id) !== tituloOriginalId) {
        throw createHttpError(409, 'O vinculo entre o titulo e a baixa original esta inconsistente.');
      }
      if (String(movimentoOriginal.status || '').toUpperCase() === 'ATIVO') {
        await estornarMovimentoTitulo(req, tituloOriginalId, movimentoOriginalId, {
          observacoes: `Estorno bancario confirmado pelo OFX #${estorno.id}: ${motivo}`
        });
      } else if (String(movimentoOriginal.status || '').toUpperCase() !== 'ESTORNADO') {
        throw createHttpError(409, 'A baixa original nao esta ativa nem estornada para concluir esta devolucao.');
      }
    } else if (tipoMovimentoOriginal === 'TARIFA_BANCARIA') {
      tituloOriginalId = null;
      if (String(movimentoOriginal.status || '').toUpperCase() !== 'ATIVO') {
        throw createHttpError(409, 'A tarifa bancaria original nao esta ativa para concluir esta devolucao.');
      }
    } else {
      throw createHttpError(409, 'O movimento original nao corresponde a uma baixa ou tarifa bancaria estornavel.');
    }
  } else if (
    String(origem.status || '').toUpperCase() === 'PENDENTE'
    && !tituloOriginalId
    && !origem.transferencia_financeira_id
    && !origem.fatura_cartao_id
  ) {
    origemSemBaixa = true;
  } else {
    throw createHttpError(
      409,
      'O lancamento original possui vinculos incompatíveis com a confirmacao desta devolucao.'
    );
  }

  const transaction = await sequelize.transaction();
  try {
    estorno = await ConciliacaoBancaria.findByPk(conciliacaoId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    origem = await ConciliacaoBancaria.findByPk(origemId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!estorno || !origem) throw createHttpError(404, 'Um dos lancamentos bancarios nao foi encontrado.');

    if (
      String(estorno.estorno_status || '').toUpperCase() === 'CONFIRMADO'
      && Number(estorno.estorno_conciliacao_origem_id) === origemId
    ) {
      await transaction.commit();
      return loadConciliacaoById(req, estorno.id);
    }
    if (String(estorno.status || '').toUpperCase() !== 'PENDENTE') {
      throw createHttpError(409, 'O lancamento de devolucao recebeu outra conciliacao antes da confirmacao.');
    }
    if (origem.deleted_at || Number(estorno.conta_bancaria_id) !== Number(origem.conta_bancaria_id)) {
      throw createHttpError(409, 'A contraparte selecionada nao pertence mais ao mesmo extrato bancario.');
    }
    if (!hasOppositeExactAmount(estorno.valor, origem.valor)) {
      throw createHttpError(409, 'Os valores bancarios deixaram de ser compativeis para estorno.');
    }
    const classificacao = classifyBankReversal(estorno);
    if (!classificacao || !datesWithinReversalWindow({
      reversalDate: estorno.data_movimento,
      originalDate: origem.data_movimento,
      windowDays: classificacao.janela_dias
    })) {
      throw createHttpError(409, 'O lancamento original esta fora da janela permitida para o estorno.');
    }

    let movimentoOriginal = null;
    let movimentoEstorno = null;
    if (!origemSemBaixa) {
      movimentoOriginal = await MovimentoFinanceiro.findByPk(movimentoOriginalId, {
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!movimentoOriginal) {
        throw createHttpError(409, 'O movimento financeiro original nao foi encontrado durante a confirmacao.');
      }

      if (tipoMovimentoOriginal === 'BAIXA') {
        if (String(movimentoOriginal.status || '').toUpperCase() !== 'ESTORNADO') {
          throw createHttpError(409, 'A baixa original precisa estar estornada antes de vincular a devolucao bancaria.');
        }
        movimentoEstorno = await MovimentoFinanceiro.findOne({
          where: {
            movimento_origem_id: movimentoOriginal.id,
            tipo_movimento: 'ESTORNO_BANCARIO',
            status: 'ATIVO'
          },
          transaction,
          lock: transaction.LOCK.UPDATE
        });
        if (!movimentoEstorno) {
          movimentoEstorno = await MovimentoFinanceiro.create({
            titulo_financeiro_id: tituloOriginalId,
            conta_bancaria_id: estorno.conta_bancaria_id,
            empresa_id: estorno.empresa_id,
            conciliacao_bancaria_id: estorno.id,
            movimento_origem_id: movimentoOriginal.id,
            forma_pagamento_id: movimentoOriginal.forma_pagamento_id || null,
            forma_recebimento: movimentoOriginal.forma_recebimento || null,
            documento_referencia: estorno.documento || movimentoOriginal.documento_referencia || null,
            tipo_movimento: 'ESTORNO_BANCARIO',
            status: 'ATIVO',
            valor: roundCurrency(Math.abs(Number(estorno.valor || 0))),
            juros: 0,
            multa: 0,
            desconto: 0,
            valor_quitacao: roundCurrency(Math.abs(Number(estorno.valor || 0))),
            data_movimento: estorno.data_movimento,
            observacoes: `[ESTORNO_BANCARIO:${movimentoOriginal.id}] ${motivo}`,
            criado_por: req.user?.id || null
          }, { transaction });
        }
      } else if (tipoMovimentoOriginal === 'TARIFA_BANCARIA') {
        if (String(movimentoOriginal.status || '').toUpperCase() !== 'ATIVO') {
          throw createHttpError(409, 'A tarifa bancaria original deixou de estar ativa.');
        }
        movimentoEstorno = await MovimentoFinanceiro.findOne({
          where: {
            conciliacao_bancaria_id: estorno.id,
            tipo_movimento: 'ESTORNO_TARIFA_BANCARIA',
            status: 'ATIVO'
          },
          transaction,
          lock: transaction.LOCK.UPDATE
        });
        if (!movimentoEstorno) {
          movimentoEstorno = await MovimentoFinanceiro.create({
            titulo_financeiro_id: null,
            categoria_financeira_id: movimentoOriginal.categoria_financeira_id || null,
            conta_bancaria_id: estorno.conta_bancaria_id,
            empresa_id: estorno.empresa_id,
            caixa_sessao_id: movimentoOriginal.caixa_sessao_id || null,
            conciliacao_bancaria_id: estorno.id,
            movimento_origem_id: null,
            documento_referencia: estorno.documento || movimentoOriginal.documento_referencia || null,
            tipo_movimento: 'ESTORNO_TARIFA_BANCARIA',
            status: 'ATIVO',
            valor: roundCurrency(Math.abs(Number(estorno.valor || 0))),
            juros: 0,
            multa: 0,
            desconto: 0,
            valor_quitacao: roundCurrency(Math.abs(Number(estorno.valor || 0))),
            data_movimento: estorno.data_movimento,
            observacoes: `[ESTORNO_TARIFA:OFX-${origem.id}] ${motivo}`,
            criado_por: req.user?.id || null
          }, { transaction });
        }
      }
    } else if (
      String(origem.status || '').toUpperCase() !== 'PENDENTE'
      || origem.movimento_financeiro_id
      || origem.titulo_financeiro_id
      || origem.transferencia_financeira_id
      || origem.fatura_cartao_id
    ) {
      throw createHttpError(409, 'A saida original recebeu outro vinculo antes da confirmacao. Atualize a conciliacao e tente novamente.');
    }

    const confirmadoEm = new Date();
    await origem.update({
      status: 'CONCILIADO',
      movimento_financeiro_id: movimentoOriginal?.id || null,
      titulo_financeiro_id: tituloOriginalId || null,
      resolucao_tipo: 'ESTORNADO_POR_OFX',
      confirmado_por: req.user?.id || null,
      confirmado_em: confirmadoEm
    }, { transaction });
    await estorno.update({
      evento_bancario_tipo: classificacao.tipo,
      estorno_status: 'CONFIRMADO',
      estorno_conciliacao_origem_id: origem.id,
      estorno_candidatos: analise.total_candidatos,
      estorno_avaliado_em: confirmadoEm,
      movimento_financeiro_id: movimentoEstorno?.id || null,
      titulo_financeiro_id: tituloOriginalId || null,
      resolucao_tipo: classificacao.tipo === 'ESTORNO_TARIFA_BANCARIA'
        ? 'ESTORNO_TARIFA_BANCARIA'
        : 'ESTORNO_BANCARIO',
      status: 'CONCILIADO',
      confirmado_por: req.user?.id || null,
      confirmado_em: confirmadoEm
    }, { transaction });

    await transaction.commit();

    await registrarEventoSeguranca({
      req,
      usuarioId: req.user?.id || null,
      tipoEvento: 'FINANCIAL_BANK_REVERSAL_CONFIRMED',
      recursoTipo: 'CONCILIACAO_BANCARIA',
      recursoId: estorno.id,
      status: 'SUCCESS',
      descricao: origemSemBaixa
        ? 'Estorno bancario confirmado pelo par de movimentos do extrato, sem baixa de titulo'
        : 'Estorno bancario confirmado e vinculado ao lancamento original',
      metadata: {
        conciliacao_origem_id: origem.id,
        titulo_financeiro_id: tituloOriginalId || null,
        movimento_origem_id: movimentoOriginal?.id || null,
        movimento_estorno_id: movimentoEstorno?.id || null,
        evento_bancario_tipo: classificacao.tipo,
        pareado_sem_baixa: origemSemBaixa,
        valor: Math.abs(Number(estorno.valor || 0)),
        motivo
      }
    });

    return loadConciliacaoById(req, estorno.id);
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
}

async function confirmarConciliacaoCreditoRotativo(req, conciliacaoId, payload = {}) {
  await assertFinanceAccess(req);

  const transaction = await sequelize.transaction();
  try {
    const conciliacao = await ConciliacaoBancaria.findByPk(conciliacaoId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!conciliacao) throw createHttpError(404, 'Lancamento de conciliacao nao encontrado.');
    const valorBanco = Number(conciliacao.valor || 0);
    if (!Number.isFinite(valorBanco) || valorBanco === 0) {
      throw createHttpError(400, 'Valor do lancamento bancario invalido para credito rotativo.');
    }

    const tipoMovimento = valorBanco > 0
      ? 'LIBERACAO_CREDITO_ROTATIVO'
      : 'AMORTIZACAO_CREDITO_ROTATIVO';
    const natureza = valorBanco > 0 ? 'LIBERACAO' : 'AMORTIZACAO';
    const statusConciliacao = String(conciliacao.status || '').toUpperCase();

    if (statusConciliacao !== 'PENDENTE') {
      const movimentoExistente = statusConciliacao === 'CONCILIADO' && conciliacao.movimento_financeiro_id
        ? await MovimentoFinanceiro.findByPk(conciliacao.movimento_financeiro_id, { transaction })
        : null;
      if (String(movimentoExistente?.tipo_movimento || '').toUpperCase() === tipoMovimento) {
        await transaction.commit();
        return {
          ...conciliacao.toJSON(),
          movimento: movimentoExistente.toJSON(),
          natureza,
          idempotente: true
        };
      }
      throw createHttpError(409, 'Somente conciliacoes pendentes podem ser registradas como credito rotativo.');
    }

    const { conta, empresaId } = await validarEmpresaConciliacaoComConta(conciliacao, { transaction });
    const valor = roundCurrency(Math.abs(valorBanco));
    const sessao = await obterSessaoAbertaParaConta(conta, conciliacao.data_movimento, { transaction });
    const descricaoPadrao = natureza === 'LIBERACAO'
      ? 'Liberacao de credito rotativo'
      : 'Amortizacao de credito rotativo';
    const descricao = String(payload.descricao || conciliacao.descricao_banco || descricaoPadrao).trim().slice(0, 255);

    const movimento = await MovimentoFinanceiro.create({
      titulo_financeiro_id: null,
      categoria_financeira_id: null,
      conta_bancaria_id: conta.id,
      empresa_id: empresaId,
      caixa_sessao_id: sessao?.id || null,
      conciliacao_bancaria_id: conciliacao.id,
      tipo_movimento: tipoMovimento,
      status: 'ATIVO',
      valor,
      juros: 0,
      multa: 0,
      desconto: 0,
      valor_quitacao: valor,
      data_movimento: conciliacao.data_movimento,
      documento_referencia: conciliacao.documento || `CR-${conciliacao.id}`,
      observacoes: `[CREDITO_ROTATIVO:${natureza}] ${descricao}`,
      criado_por: req.user?.id || null
    }, { transaction });

    await conciliacao.update({
      transferencia_financeira_id: null,
      movimento_financeiro_id: movimento.id,
      titulo_financeiro_id: null,
      fatura_cartao_id: null,
      empresa_id: empresaId,
      caixa_sessao_id: sessao?.id || null,
      status: 'CONCILIADO',
      confirmado_por: req.user?.id || null,
      confirmado_em: new Date()
    }, { transaction });

    await transaction.commit();

    try {
      await registrarEventoSeguranca({
        req,
        usuarioId: req.user?.id || null,
        tipoEvento: 'FINANCIAL_BANK_RECONCILED_REVOLVING_CREDIT',
        recursoTipo: 'CONCILIACAO_BANCARIA',
        recursoId: conciliacao.id,
        status: 'SUCCESS',
        descricao: natureza === 'LIBERACAO'
          ? 'Liberacao de credito rotativo conciliada'
          : 'Amortizacao de credito rotativo conciliada',
        metadata: {
          movimento_financeiro_id: movimento.id,
          conta_bancaria_id: conta.id,
          empresa_id: empresaId,
          natureza,
          valor
        }
      });
    } catch (auditError) {
      console.error('Falha ao registrar auditoria de credito rotativo:', auditError);
    }

    return {
      ...conciliacao.toJSON(),
      movimento: movimento.toJSON(),
      natureza,
      idempotente: false
    };
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
}

async function finalizarConciliacao(req, conciliacao, movimento, { batch = false } = {}) {
  await movimento.update({
    conciliacao_bancaria_id: conciliacao.id
  });

  await conciliacao.update({
    movimento_financeiro_id: movimento.id,
    titulo_financeiro_id: movimento.titulo?.id || null,
    status: 'CONCILIADO',
    confirmado_por: req.user?.id || null,
    confirmado_em: new Date(),
    resolucao_tipo: inferirResolucaoConciliacao(conciliacao, movimento.id, { batch })
  });

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: batch ? 'FINANCIAL_BANK_RECONCILED_BATCH' : 'FINANCIAL_BANK_RECONCILED',
    recursoTipo: 'CONCILIACAO_BANCARIA',
    recursoId: conciliacao.id,
    status: 'SUCCESS',
    descricao: batch
      ? 'Lancamento bancario conciliado em lote a partir de sugestao'
      : 'Lancamento bancario conciliado manualmente',
    metadata: {
      movimento_financeiro_id: movimento.id,
      titulo_financeiro_id: movimento.titulo?.id || null
    }
  });
}

async function confirmarConciliacao(req, conciliacaoId, payload = {}) {
  const conciliacao = await loadConciliacaoById(req, conciliacaoId);
  if (String(conciliacao.status || '').toUpperCase() !== 'PENDENTE') {
    throw createHttpError(400, 'Somente conciliacoes pendentes podem ser confirmadas.');
  }

  const movimentoIds = Array.isArray(payload.movimento_financeiro_ids)
    ? [...new Set(payload.movimento_financeiro_ids.map((id) => Number(id)).filter(Boolean))]
    : [];

  if (!movimentoIds.length && payload.movimento_financeiro_id) {
    movimentoIds.push(Number(payload.movimento_financeiro_id));
  }

  if (!movimentoIds.length) {
    throw createHttpError(400, 'Selecione ao menos um movimento financeiro para confirmar a conciliacao.');
  }

  const isAssociacaoMultipla = movimentoIds.length > 1;
  const movimentos = [];
  for (const movimentoId of movimentoIds) {
    movimentos.push(await resolveMovimentoForConciliacao(req, conciliacao, movimentoId, {
      validarValor: !isAssociacaoMultipla
    }));
  }

  if (isAssociacaoMultipla) {
    const valorConciliacao = roundCurrency(Math.abs(Number(conciliacao.valor || 0)));
    const valorMovimentos = roundCurrency(movimentos.reduce((total, movimento) => (
      total + Math.abs(Number(movimento.valor_quitacao || 0))
    ), 0));

    if (valorMovimentos > valorConciliacao) {
      throw createHttpError(400, 'A soma dos movimentos selecionados e maior que o valor do lancamento bancario.');
    }

    if (valorConciliacao !== valorMovimentos) {
      throw createHttpError(400, 'A soma dos movimentos selecionados precisa fechar com o valor do lancamento bancario.');
    }
  }

  const movimentoPrincipal = movimentos[0];
  await Promise.all(movimentos.map((movimento) => movimento.update({
    conciliacao_bancaria_id: conciliacao.id
  })));

  await conciliacao.update({
    movimento_financeiro_id: movimentoPrincipal.id,
    titulo_financeiro_id: movimentoPrincipal.titulo?.id || null,
    status: 'CONCILIADO',
    confirmado_por: req.user?.id || null,
    confirmado_em: new Date(),
    resolucao_tipo: inferirResolucaoConciliacao(conciliacao, movimentoPrincipal.id)
  });

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: isAssociacaoMultipla ? 'FINANCIAL_BANK_RECONCILED_MULTIPLE' : 'FINANCIAL_BANK_RECONCILED',
    recursoTipo: 'CONCILIACAO_BANCARIA',
    recursoId: conciliacao.id,
    status: 'SUCCESS',
    descricao: isAssociacaoMultipla
      ? 'Lancamento bancario conciliado manualmente com multiplos movimentos'
      : 'Lancamento bancario conciliado manualmente',
    metadata: {
      movimento_financeiro_id: movimentoPrincipal.id,
      movimento_financeiro_ids: movimentos.map((movimento) => movimento.id),
      titulo_financeiro_id: movimentoPrincipal.titulo?.id || null,
      titulo_financeiro_ids: movimentos.map((movimento) => movimento.titulo?.id || null).filter(Boolean)
    }
  });

  return loadConciliacaoById(req, conciliacao.id);
}

async function criarTituloEConciliar(req, conciliacaoId, payload = {}) {
  await assertFinanceAccess(req);

  const transaction = await sequelize.transaction();
  try {
    const conciliacao = await ConciliacaoBancaria.findByPk(conciliacaoId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!conciliacao) {
      throw createHttpError(404, 'Lancamento de conciliacao nao encontrado.');
    }
    if (String(conciliacao.status || '').toUpperCase() !== 'PENDENTE') {
      throw createHttpError(400, 'Somente conciliacoes pendentes podem receber criacao rapida de titulo.');
    }

    const tipoEsperado = getSignalByValue(conciliacao.valor);
    const tipoPayload = String(payload.tipo || '').trim().toUpperCase();
    if (tipoPayload && tipoPayload !== tipoEsperado) {
      throw createHttpError(400, 'O tipo do titulo nao e compativel com o sinal do lancamento bancario.');
    }

    const valorConciliacao = roundCurrency(Math.abs(Number(conciliacao.valor || 0)));
    const valorPayload = roundCurrency(payload.valor);
    if (Math.abs(valorPayload - valorConciliacao) > 0.1) {
      throw createHttpError(400, 'O valor informado deve ser igual ao valor do lancamento bancario para este fluxo rapido.');
    }

    const contaConciliacaoId = Number(conciliacao.conta_bancaria_id || 0);
    const contaPayloadId = Number(payload.conta_bancaria_id || 0);
    if (contaPayloadId && contaPayloadId !== contaConciliacaoId) {
      throw createHttpError(400, 'A conta bancaria do titulo rapido deve ser a mesma conta do lancamento conciliado.');
    }

    const { titulo, movimento, afterCommit } = await criarTituloManualComBaixaAtomica(
      req,
      {
        ...payload,
        tipo: tipoEsperado,
        valor: valorConciliacao,
        conta_bancaria_id: contaConciliacaoId
      },
      { transaction }
    );

    await conciliacao.update({
      movimento_financeiro_id: movimento.id,
      titulo_financeiro_id: titulo.id,
      status: 'CONCILIADO',
      confirmado_por: req.user?.id || null,
      confirmado_em: new Date(),
      resolucao_tipo: 'TITULO_CRIADO'
    }, { transaction });

    await transaction.commit();

    if (afterCommit) {
      await afterCommit();
    }

    await registrarEventoSeguranca({
      req,
      usuarioId: req.user?.id || null,
      tipoEvento: 'FINANCIAL_BANK_RECONCILED',
      recursoTipo: 'CONCILIACAO_BANCARIA',
      recursoId: conciliacao.id,
      status: 'SUCCESS',
      descricao: 'Lancamento bancario conciliado manualmente via criacao rapida de titulo',
      metadata: {
        movimento_financeiro_id: movimento.id,
        titulo_financeiro_id: titulo.id
      }
    });

    return {
      conciliacao: await loadConciliacaoById(req, conciliacao.id),
      titulo_financeiro_id: titulo.id,
      movimento_financeiro_id: movimento.id
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function conciliarSugeridos(req, filters = {}) {
  await assertFinanceAccess(req);

  const where = buildConciliacaoWhere(filters, { forcePending: true });
  const conciliacoes = await ConciliacaoBancaria.findAll({
    where,
    order: [['data_movimento', 'DESC'], ['createdAt', 'DESC']]
  });

  const resumo = {
    total_avaliadas: conciliacoes.length,
    total_conciliadas: 0,
    sem_sugestao: 0,
    associacao_manual: 0,
    falhas: 0
  };
  const erros = [];

  for (const conciliacao of conciliacoes) {
    const estornoBancario = await analisarPossivelEstornoBancario(conciliacao);
    if (estornoBancario) {
      resumo.associacao_manual += 1;
      continue;
    }
    const analise = await analyzeSuggestions(req, conciliacao, { maxSuggestions: 5 });

    if (!analise.sugestoes.length) {
      resumo.sem_sugestao += 1;
      continue;
    }

    if (!analise.conciliacao_em_lote_disponivel || !analise.sugestao_automatica) {
      resumo.associacao_manual += 1;
      continue;
    }

    try {
      const movimento = await resolveMovimentoForConciliacao(
        req,
        conciliacao,
        analise.sugestao_automatica.movimento_financeiro_id
      );
      await finalizarConciliacao(req, conciliacao, movimento, { batch: true });
      resumo.total_conciliadas += 1;
    } catch (error) {
      resumo.falhas += 1;
      erros.push({
        conciliacao_id: conciliacao.id,
        mensagem: error?.message || 'Erro ao conciliar em lote'
      });
    }
  }

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'FINANCIAL_BANK_RECONCILIATION_BATCH_EXECUTED',
    recursoTipo: 'CONCILIACAO_BANCARIA',
    recursoId: where.conta_bancaria_id || 'FILTRO',
    status: 'SUCCESS',
    descricao: 'Execucao de conciliacao em lote por sugestoes',
    metadata: resumo
  });

  return {
    resumo,
    erros
  };
}

async function listarMovimentosAssociacao(req, conciliacaoId, filters = {}) {
  const conciliacao = await loadConciliacaoById(req, conciliacaoId);

  const items = await queryMovimentoCandidates(req, conciliacao, filters);
  const ranked = items
    .map((item) => ({
      item,
      ranking: scoreSuggestion(conciliacao, item)
    }))
    .sort((a, b) => {
      if (b.ranking.score !== a.ranking.score) {
        return b.ranking.score - a.ranking.score;
      }
      return String(b.item.data_movimento || '').localeCompare(String(a.item.data_movimento || ''));
    });

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'FINANCIAL_BANK_RECONCILIATION_SEARCH',
    recursoTipo: 'CONCILIACAO_BANCARIA',
    recursoId: conciliacao.id,
    status: 'SUCCESS',
    descricao: 'Consulta de movimentos para associacao manual na conciliacao bancaria',
    metadata: {
      total_encontrados: ranked.length
    }
  });

  return {
    conciliacao: {
      id: conciliacao.id,
      conta_bancaria_id: conciliacao.conta_bancaria_id,
      conta_bancaria_nome: conciliacao.contaBancaria?.nome || '-',
      data_movimento: conciliacao.data_movimento,
      valor: Number(conciliacao.valor || 0),
      documento: conciliacao.documento,
      descricao_banco: conciliacao.descricao_banco
    },
    meta: {
      total: ranked.length,
      limit: normalizeSearchLimit(filters.limit, 30)
    },
    itens: ranked.map((entry) => serializeSuggestion(entry.item, entry.ranking))
  };
}

async function ignorarConciliacao(req, conciliacaoId) {
  const conciliacao = await loadConciliacaoById(req, conciliacaoId);
  assertSemAlertaEstornoBancario(conciliacao);
  if (String(conciliacao.status || '').toUpperCase() !== 'PENDENTE') {
    throw createHttpError(400, 'Somente conciliacoes pendentes podem ser ignoradas.');
  }

  await conciliacao.update({
    status: 'IGNORADO',
    confirmado_por: req.user?.id || null,
    confirmado_em: new Date()
  });

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'FINANCIAL_BANK_RECONCILIATION_IGNORED',
    recursoTipo: 'CONCILIACAO_BANCARIA',
    recursoId: conciliacao.id,
    status: 'SUCCESS',
    descricao: 'Lancamento bancario marcado como ignorado'
  });

  return loadConciliacaoById(req, conciliacao.id);
}

async function corrigirContaConciliacao(req, conciliacaoId, payload = {}) {
  await assertFinanceAccess(req);

  const contaBancariaId = parseInteger(payload.conta_bancaria_id, 'Conta bancaria');
  const motivo = String(payload.motivo || '').replace(/\s+/g, ' ').trim();
  if (motivo.length < 10) {
    throw createHttpError(400, 'Informe uma justificativa com pelo menos 10 caracteres.');
  }

  const transaction = await sequelize.transaction();
  let auditoria = null;
  try {
    const conciliacao = await ConciliacaoBancaria.findOne({
      where: { id: parseInteger(conciliacaoId, 'Conciliacao bancaria'), deleted_at: null },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!conciliacao) {
      throw createHttpError(404, 'Lancamento de conciliacao nao encontrado.');
    }
    if (String(conciliacao.status || '').toUpperCase() !== 'PENDENTE') {
      throw createHttpError(409, 'Estorne primeiro a baixa vinculada. Somente lancamentos pendentes podem trocar de conta.');
    }
    if (
      conciliacao.movimento_financeiro_id
      || conciliacao.titulo_financeiro_id
      || conciliacao.fatura_cartao_id
      || conciliacao.transferencia_financeira_id
      || conciliacao.caixa_sessao_id
    ) {
      throw createHttpError(409, 'O lancamento ainda possui vinculos financeiros. Estorne a operacao antes de corrigir a conta.');
    }

    const contaAnteriorId = Number(conciliacao.conta_bancaria_id || 0) || null;
    if (contaAnteriorId === contaBancariaId) {
      throw createHttpError(400, 'Selecione uma conta diferente da conta atual.');
    }

    const [contaAnterior, contaNova] = await Promise.all([
      contaAnteriorId
        ? ContaBancaria.findByPk(contaAnteriorId, { transaction })
        : null,
      ContaBancaria.findByPk(contaBancariaId, { transaction, lock: transaction.LOCK.UPDATE })
    ]);
    if (!contaNova || contaNova.ativo === false) {
      throw createHttpError(400, 'A nova conta bancaria e invalida ou esta inativa.');
    }
    if (!contaNova.empresa_id) {
      throw createHttpError(400, 'A nova conta bancaria precisa estar vinculada a uma empresa.');
    }

    const duplicateWhere = {
      id: { [Op.ne]: conciliacao.id },
      conta_bancaria_id: contaNova.id,
      deleted_at: null
    };
    if (conciliacao.ofx_uid) {
      duplicateWhere.ofx_uid = conciliacao.ofx_uid;
    } else {
      duplicateWhere.data_movimento = conciliacao.data_movimento;
      duplicateWhere.valor = conciliacao.valor;
      duplicateWhere.documento = conciliacao.documento || null;
    }
    const duplicada = await ConciliacaoBancaria.findOne({
      where: duplicateWhere,
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (duplicada) {
      throw createHttpError(409, `A conta selecionada ja possui este lancamento no extrato (conciliacao #${duplicada.id}).`);
    }

    auditoria = {
      conta_anterior_id: contaAnteriorId,
      conta_anterior_nome: contaAnterior?.nome || null,
      empresa_anterior_id: Number(conciliacao.empresa_id || 0) || null,
      conta_nova_id: contaNova.id,
      conta_nova_nome: contaNova.nome,
      empresa_nova_id: Number(contaNova.empresa_id),
      motivo
    };

    await conciliacao.update({
      conta_bancaria_id: contaNova.id,
      empresa_id: contaNova.empresa_id,
      confirmado_por: null,
      confirmado_em: null
    }, { transaction });

    await transaction.commit();

    await registrarEventoSeguranca({
      req,
      usuarioId: req.user?.id || null,
      tipoEvento: 'FINANCIAL_BANK_RECONCILIATION_ACCOUNT_CORRECTED',
      recursoTipo: 'CONCILIACAO_BANCARIA',
      recursoId: conciliacao.id,
      status: 'SUCCESS',
      descricao: 'Conta bancaria do lancamento OFX corrigida apos estorno',
      metadata: auditoria
    });

    return loadConciliacaoById(req, conciliacao.id);
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
}

async function removerConciliacao(req, conciliacaoId, payload = {}) {
  const conciliacao = await loadConciliacaoById(req, conciliacaoId);
  assertSemAlertaEstornoBancario(conciliacao);
  const status = String(conciliacao.status || '').toUpperCase();
  if (status !== 'PENDENTE' && status !== 'IGNORADO') {
    throw createHttpError(400, 'Somente lancamentos pendentes ou ignorados podem ser removidos do extrato.');
  }

  const motivo = String(payload.motivo || payload.observacao || '').trim() || 'Remocao manual na conciliacao bancaria';
  await conciliacao.update({
    deleted_at: new Date(),
    deleted_by: req.user?.id || null,
    deleted_reason: motivo
  });

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'FINANCIAL_BANK_RECONCILIATION_REMOVED',
    recursoTipo: 'CONCILIACAO_BANCARIA',
    recursoId: conciliacao.id,
    status: 'SUCCESS',
    descricao: 'Lancamento bancario removido logicamente do extrato',
    metadata: {
      motivo,
      status_anterior: conciliacao.status,
      conta_bancaria_id: conciliacao.conta_bancaria_id,
      valor: Number(conciliacao.valor || 0),
      data_movimento: conciliacao.data_movimento
    }
  });

  return {
    id: conciliacao.id,
    removed: true,
    deleted_at: conciliacao.deleted_at,
    deleted_reason: motivo
  };
}

module.exports = {
  conciliarSugeridos,
  corrigirContaConciliacao,
  confirmarConciliacao,
  confirmarConciliacaoCreditoRotativo,
  confirmarConciliacaoEstornoBancario,
  confirmarConciliacaoFatura,
  confirmarConciliacaoEstornoTarifa,
  confirmarConciliacaoTarifa,
  confirmarConciliacaoTransferencia,
  estornarConciliacao,
  estornarConciliacaoTransferencia,
  criarTituloEConciliar,
  ignorarConciliacao,
  importOfx,
  listarImportacoes,
  listarConciliacoes,
  listarFaturasAssociacao,
  listarTarifasParaEstorno,
  listarMovimentosAssociacao,
  removerConciliacao,
  parseOfxTransactions
};
