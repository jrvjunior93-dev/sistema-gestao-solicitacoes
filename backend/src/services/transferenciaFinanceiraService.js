const crypto = require('crypto');
const { Op } = require('sequelize');
const {
  ConciliacaoBancaria,
  ContaBancaria,
  EmpresaGrupo,
  TransferenciaFinanceira,
  User,
  sequelize
} = require('../models');
const { canAccessFinanceiro } = require('./authorizationService');
const { obterSessaoAbertaParaConta } = require('./financeiroCaixaSessionHelper');
const { registrarEventoSeguranca } = require('./securityLogService');
const { normalizeTipoIntercompany } = require('../constants/intercompany');

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function roundCurrency(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function parsePositiveInteger(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createHttpError(400, `${fieldName} invalido.`);
  }
  return parsed;
}

function parseMoney(value, fieldName) {
  const raw = String(value ?? '').trim().replace(/[R$\s]/gi, '');
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw createHttpError(400, `${fieldName} deve ser maior que zero.`);
  }
  return roundCurrency(parsed);
}

function parseDate(value, fieldName, fallback = today()) {
  const date = value || fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
    throw createHttpError(400, `${fieldName} invalida.`);
  }
  return String(date);
}

async function assertFinanceAccess(req) {
  const allowed = await canAccessFinanceiro(req.user);
  if (allowed) return;

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'AUTHZ_DENIED',
    recursoTipo: 'TRANSFERENCIA_FINANCEIRA',
    recursoId: req.originalUrl,
    status: 'DENIED',
    descricao: 'Usuario sem permissao para acessar transferencias financeiras'
  });

  throw createHttpError(403, 'Acesso negado para o modulo financeiro');
}

function includeTransferencia() {
  return [
    { model: EmpresaGrupo, as: 'empresa', attributes: ['id', 'codigo', 'nome', 'razao_social', 'cnpj'] },
    { model: EmpresaGrupo, as: 'empresaOrigem', attributes: ['id', 'codigo', 'nome', 'razao_social', 'cnpj'] },
    { model: EmpresaGrupo, as: 'empresaDestino', attributes: ['id', 'codigo', 'nome', 'razao_social', 'cnpj'] },
    { model: ContaBancaria, as: 'contaOrigem', attributes: ['id', 'nome', 'banco', 'agencia', 'conta', 'empresa_id', 'tipo_operacional'] },
    { model: ContaBancaria, as: 'contaDestino', attributes: ['id', 'nome', 'banco', 'agencia', 'conta', 'empresa_id', 'tipo_operacional'] },
    { model: ConciliacaoBancaria, as: 'conciliacaoOrigem', attributes: ['id', 'data_movimento', 'valor', 'status'] },
    { model: ConciliacaoBancaria, as: 'conciliacaoDestino', attributes: ['id', 'data_movimento', 'valor', 'status'] },
    { model: User, as: 'criadoPor', attributes: ['id', 'nome', 'email'] },
    { model: User, as: 'canceladoPor', attributes: ['id', 'nome', 'email'] }
  ];
}

async function carregarConta(contaId, { transaction = null } = {}) {
  const id = parsePositiveInteger(contaId, 'Conta');
  const conta = await ContaBancaria.findByPk(id, { transaction });
  if (!conta || conta.ativo === false) {
    throw createHttpError(400, 'Conta financeira invalida ou inativa.');
  }
  return conta;
}

async function montarPayloadTransferencia(
  req,
  payload = {},
  { transaction = null, permitirDataAnteriorSemVinculo = false } = {}
) {
  const [origem, destino] = await Promise.all([
    carregarConta(payload.conta_origem_id, { transaction }),
    carregarConta(payload.conta_destino_id, { transaction })
  ]);

  if (Number(origem.id) === Number(destino.id)) {
    throw createHttpError(400, 'A conta de origem deve ser diferente da conta de destino.');
  }

  const dataTransferencia = parseDate(payload.data_transferencia, 'Data da transferencia');
  const valor = parseMoney(payload.valor, 'Valor da transferencia');
  const opcoesSessao = { transaction, permitirDataAnteriorSemVinculo };
  const sessaoOrigem = await obterSessaoAbertaParaConta(origem, dataTransferencia, opcoesSessao);
  const sessaoDestino = await obterSessaoAbertaParaConta(destino, dataTransferencia, opcoesSessao);
  const empresaOrigemId = parsePositiveInteger(origem.empresa_id, 'Empresa da conta de origem');
  const empresaDestinoId = parsePositiveInteger(destino.empresa_id, 'Empresa da conta de destino');
  const empresasDiferentes = empresaOrigemId !== empresaDestinoId;
  const tipoTransferencia = String(payload.tipo_transferencia || '').trim().toUpperCase();
  const transferenciaEntreEmpresas = tipoTransferencia === 'ENTRE_EMPRESAS' || empresasDiferentes;
  const transferenciaMesmaTitularidade = tipoTransferencia === 'MESMA_TITULARIDADE' || !empresasDiferentes;

  if (tipoTransferencia === 'ENTRE_EMPRESAS' && !empresasDiferentes) {
    throw createHttpError(400, 'Transferencia entre empresas exige empresas diferentes nas contas de origem e destino.');
  }
  if (tipoTransferencia === 'MESMA_TITULARIDADE' && empresasDiferentes) {
    throw createHttpError(400, 'Transferencia de mesma titularidade exige contas da mesma empresa.');
  }

  const tipoIntercompany = transferenciaEntreEmpresas
    ? normalizeTipoIntercompany(payload.tipo_intercompany)
    : null;

  if (transferenciaEntreEmpresas && !tipoIntercompany) {
    throw createHttpError(400, 'Transferencia entre empresas exige tipo.');
  }

  const motivoIntercompany = transferenciaEntreEmpresas
    ? String(payload.motivo_intercompany || payload.descricao || '').trim().slice(0, 255)
    : null;

  if (transferenciaEntreEmpresas && !motivoIntercompany) {
    throw createHttpError(400, 'Transferencia entre empresas exige motivo.');
  }

  return {
    empresa_id: empresaOrigemId,
    intercompany_group_id: transferenciaEntreEmpresas
      ? (String(payload.intercompany_group_id || '').trim().slice(0, 80) || `IC-TRANSF-${crypto.randomUUID()}`)
      : null,
    empresa_origem_id: empresaOrigemId,
    empresa_destino_id: empresaDestinoId,
    conta_origem_id: origem.id,
    conta_destino_id: destino.id,
    caixa_sessao_origem_id: sessaoOrigem?.id || null,
    caixa_sessao_destino_id: sessaoDestino?.id || null,
    data_transferencia: dataTransferencia,
    valor,
    descricao: String(payload.descricao || '').trim().slice(0, 255) || null,
    tipo_intercompany: tipoIntercompany,
    motivo_intercompany: motivoIntercompany || null,
    elimina_consolidado: transferenciaEntreEmpresas && payload.elimina_consolidado !== false,
    transferencia_interna: transferenciaMesmaTitularidade || transferenciaEntreEmpresas,
    criado_por: req.user?.id || null
  };
}

async function criarTransferenciaFinanceira(
  req,
  payload = {},
  { transaction: externalTransaction = null, permitirDataAnteriorSemVinculo = false } = {}
) {
  await assertFinanceAccess(req);
  const ownTransaction = !externalTransaction;
  const transaction = externalTransaction || await sequelize.transaction();

  try {
    const data = await montarPayloadTransferencia(req, payload, {
      transaction,
      permitirDataAnteriorSemVinculo
    });
    const transferencia = await TransferenciaFinanceira.create({
      ...data,
      conciliacao_origem_id: payload.conciliacao_origem_id || null,
      conciliacao_destino_id: payload.conciliacao_destino_id || null,
      status: 'ATIVA'
    }, { transaction });

    const afterCommit = async () => {
      await registrarEventoSeguranca({
        req,
        usuarioId: req.user?.id || null,
        tipoEvento: 'FINANCIAL_TRANSFER_CREATED',
        recursoTipo: 'TRANSFERENCIA_FINANCEIRA',
        recursoId: transferencia.id,
        status: 'SUCCESS',
        descricao: 'Transferencia financeira registrada',
        metadata: {
          conta_origem_id: data.conta_origem_id,
          conta_destino_id: data.conta_destino_id,
          empresa_origem_id: data.empresa_origem_id,
          empresa_destino_id: data.empresa_destino_id,
          tipo_intercompany: data.tipo_intercompany,
          elimina_consolidado: data.elimina_consolidado,
          valor: data.valor,
          data_transferencia: data.data_transferencia
        }
      });
    };

    if (ownTransaction) {
      await transaction.commit();
      await afterCommit();
    }

    return {
      transferencia: await TransferenciaFinanceira.findByPk(transferencia.id, {
        include: includeTransferencia(),
        transaction: ownTransaction ? null : transaction
      }),
      afterCommit: ownTransaction ? null : afterCommit
    };
  } catch (error) {
    if (ownTransaction) await transaction.rollback();
    throw error;
  }
}

async function listarTransferenciasFinanceiras(req, filters = {}) {
  await assertFinanceAccess(req);
  const where = {};
  const andConditions = [];

  if (filters.empresa_id) {
    const empresaId = parsePositiveInteger(filters.empresa_id, 'Empresa do grupo');
    andConditions.push({
      [Op.or]: [
        { empresa_id: empresaId },
        { empresa_origem_id: empresaId },
        { empresa_destino_id: empresaId }
      ]
    });
  }
  if (filters.conta_bancaria_id) {
    const contaId = parsePositiveInteger(filters.conta_bancaria_id, 'Conta');
    andConditions.push({ [Op.or]: [{ conta_origem_id: contaId }, { conta_destino_id: contaId }] });
  }
  if (filters.status && String(filters.status).toUpperCase() !== 'TODOS') {
    where.status = String(filters.status).toUpperCase();
  }
  if (filters.data_inicial || filters.data_final) {
    where.data_transferencia = {};
    if (filters.data_inicial) where.data_transferencia[Op.gte] = filters.data_inicial;
    if (filters.data_final) where.data_transferencia[Op.lte] = filters.data_final;
  }
  if (andConditions.length > 0) {
    where[Op.and] = andConditions;
  }

  return TransferenciaFinanceira.findAll({
    where,
    include: includeTransferencia(),
    order: [['data_transferencia', 'DESC'], ['id', 'DESC']],
    limit: Math.min(Math.max(Number(filters.limit || 100), 1), 300)
  });
}

async function cancelarTransferenciaFinanceira(req, id, payload = {}) {
  await assertFinanceAccess(req);
  const transferencia = await TransferenciaFinanceira.findByPk(parsePositiveInteger(id, 'Transferencia'));
  if (!transferencia) {
    throw createHttpError(404, 'Transferencia financeira nao encontrada.');
  }
  if (String(transferencia.status || '').toUpperCase() !== 'ATIVA') {
    throw createHttpError(400, 'Somente transferencias ativas podem ser canceladas.');
  }
  if (transferencia.conciliacao_origem_id || transferencia.conciliacao_destino_id) {
    throw createHttpError(400, 'Nao e possivel cancelar uma transferencia ja conciliada.');
  }

  await transferencia.update({
    status: 'CANCELADA',
    cancelado_por: req.user?.id || null,
    cancelado_em: new Date(),
    observacoes_cancelamento: payload.observacoes || null
  });

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'FINANCIAL_TRANSFER_CANCELED',
    recursoTipo: 'TRANSFERENCIA_FINANCEIRA',
    recursoId: transferencia.id,
    status: 'SUCCESS',
    descricao: 'Transferencia financeira cancelada'
  });

  return TransferenciaFinanceira.findByPk(transferencia.id, { include: includeTransferencia() });
}

module.exports = {
  criarTransferenciaFinanceira,
  includeTransferencia,
  listarTransferenciasFinanceiras,
  cancelarTransferenciaFinanceira
};
