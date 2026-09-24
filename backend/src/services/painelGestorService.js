'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const { getAreaPermissionStateForUser } = require('./authorizationService');
const { TIPO_CENTRO_CUSTO_OBRA } = require('../constants/centroCusto');

const PERMISSIONS = Object.freeze({
  ACCESS: 'painel_gestor.acessar',
  ALL_WORKS: 'painel_gestor.escopo.todas_obras',
  RESULTADO: 'painel_gestor.resultado_obras.visualizar',
  CUSTOS: 'painel_gestor.custos_recebiveis.visualizar',
  SALDOS_VIEW: 'painel_gestor.saldos.visualizar',
  SALDOS_WRITE: 'painel_gestor.saldos.informar',
  SALDOS_CORRECT: 'painel_gestor.saldos.corrigir'
});

function businessError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function dateInSaoPaulo() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function normalizeDate(value, fallback = dateInSaoPaulo()) {
  const normalized = String(value || fallback).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw businessError(400, 'PAINEL_GESTOR_DATA_INVALIDA', 'Data invalida. Use AAAA-MM-DD.');
  }
  const parsed = new Date(`${normalized}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw businessError(400, 'PAINEL_GESTOR_DATA_INVALIDA', 'Data invalida.');
  }
  if (normalized > dateInSaoPaulo()) {
    throw businessError(422, 'PAINEL_GESTOR_DATA_FUTURA', 'Nao e permitido informar saldo para uma data futura.');
  }
  return normalized;
}

function normalizeMoney(value, field = 'Saldo') {
  const normalized = typeof value === 'string'
    ? value.trim().replace(/[R$\s]/gi, '').replace(/\./g, '').replace(',', '.')
    : value;
  const number = Number(normalized);
  if (!Number.isFinite(number) || Math.abs(number) > 9999999999999999.99) {
    throw businessError(400, 'PAINEL_GESTOR_VALOR_INVALIDO', `${field} invalido.`);
  }
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

async function getPermissionSet(user) {
  const state = await getAreaPermissionStateForUser(user);
  return {
    bypass: Boolean(state.bypass),
    permissions: new Set((state.permissions || []).map((item) => String(item).toLowerCase()))
  };
}

async function hasPermission(user, permission) {
  const state = await getPermissionSet(user);
  return state.bypass || state.permissions.has(String(permission).toLowerCase());
}

async function assertPermission(user, permission) {
  const state = await getPermissionSet(user);
  const hasAccess = state.bypass || state.permissions.has(PERMISSIONS.ACCESS);
  const hasResource = state.bypass || state.permissions.has(String(permission).toLowerCase());
  if (!hasAccess || !hasResource) {
    throw businessError(403, 'PAINEL_GESTOR_ACESSO_NEGADO', 'Acesso negado para esta area do Painel do Gestor.');
  }
}

async function resolverEscopo(user) {
  const state = await getPermissionSet(user);
  if (state.bypass || state.permissions.has(PERMISSIONS.ALL_WORKS)) {
    return { todas: true, obraIds: null, empresaIds: null };
  }

  const links = await db.UsuarioObra.findAll({
    where: { user_id: user?.id },
    attributes: ['obra_id'],
    raw: true
  });
  const obraIds = [...new Set(links.map((item) => Number(item.obra_id)).filter(Number.isInteger))];
  const obras = obraIds.length
    ? await db.Obra.findAll({
      where: { id: { [Op.in]: obraIds }, ativo: true },
      attributes: ['id', 'empresa_id'],
      raw: true
    })
    : [];
  const empresaIds = [...new Set(obras.map((item) => Number(item.empresa_id)).filter(Number.isInteger))];
  return { todas: false, obraIds, empresaIds };
}

async function listarObras(user) {
  const scope = await resolverEscopo(user);
  const where = { ativo: true, tipo_centro_custo: TIPO_CENTRO_CUSTO_OBRA };
  if (!scope.todas) where.id = { [Op.in]: scope.obraIds };
  return db.Obra.findAll({
    where,
    attributes: ['id', 'codigo', 'nome', 'cidade', 'classificacao', 'empresa_id'],
    include: [{ model: db.EmpresaGrupo, as: 'empresa', attributes: ['id', 'nome'] }],
    order: [['nome', 'ASC']]
  });
}

async function listarContasNoEscopo(user, transaction = null) {
  const scope = await resolverEscopo(user);
  const where = { ativo: true };
  if (!scope.todas) {
    if (!scope.empresaIds.length) return [];
    where.empresa_id = { [Op.in]: scope.empresaIds };
  }
  return db.ContaBancaria.findAll({
    where,
    attributes: ['id', 'nome', 'empresa_id', 'tipo_operacional', 'banco', 'agencia', 'conta'],
    include: [{ model: db.EmpresaGrupo, as: 'empresa', attributes: ['id', 'nome'] }],
    order: [[{ model: db.EmpresaGrupo, as: 'empresa' }, 'nome', 'ASC'], ['nome', 'ASC']],
    transaction
  });
}

function serializeConta(conta, saldo = null) {
  const plain = conta?.toJSON ? conta.toJSON() : conta;
  const saldoPlain = saldo?.toJSON ? saldo.toJSON() : saldo;
  return {
    id: plain.id,
    nome: plain.nome,
    tipo_operacional: plain.tipo_operacional,
    banco: plain.banco,
    agencia: plain.agencia,
    conta: plain.conta,
    empresa: plain.empresa || null,
    saldo: saldoPlain ? {
      id: saldoPlain.id,
      valor: Number(saldoPlain.saldo_disponivel || 0),
      corrigido: Boolean(saldoPlain.corrigido),
      informado_em: saldoPlain.createdAt,
      atualizado_em: saldoPlain.updatedAt,
      informado_por: saldoPlain.informadoPor || null,
      atualizado_por: saldoPlain.atualizadoPor || null
    } : null
  };
}

async function carregarSaldosDaData(user, dataValue, { incluirPendentes = false } = {}) {
  const data = normalizeDate(dataValue);
  const contas = await listarContasNoEscopo(user);
  const contaIds = contas.map((item) => Number(item.id));
  const saldos = contaIds.length ? await db.PainelGestorSaldoDiario.findAll({
    where: { conta_bancaria_id: { [Op.in]: contaIds }, data_referencia: data },
    include: [
      { model: db.User, as: 'informadoPor', attributes: ['id', 'nome'] },
      { model: db.User, as: 'atualizadoPor', attributes: ['id', 'nome'] }
    ],
    order: [['updatedAt', 'DESC']]
  }) : [];
  const saldoIds = saldos.map((item) => Number(item.id));
  const historico = saldoIds.length ? await db.PainelGestorSaldoHistorico.findAll({
    where: { saldo_diario_id: { [Op.in]: saldoIds } },
    attributes: [
      'id',
      'saldo_diario_id',
      'conta_bancaria_id',
      'saldo_anterior',
      'saldo_novo',
      'acao',
      'justificativa',
      'createdAt'
    ],
    include: [{ model: db.User, as: 'usuario', attributes: ['id', 'nome'] }],
    order: [['createdAt', 'DESC']],
    limit: 100
  }) : [];
  const saldoPorConta = new Map(saldos.map((item) => [Number(item.conta_bancaria_id), item]));
  const contaPorId = new Map(contas.map((item) => [Number(item.id), item]));
  const contasSerializadas = contas
    .map((conta) => serializeConta(conta, saldoPorConta.get(Number(conta.id))))
    .filter((item) => incluirPendentes || item.saldo);
  const informadas = contasSerializadas.filter((item) => item.saldo);
  const total = informadas.reduce((sum, item) => sum + Number(item.saldo.valor || 0), 0);
  const empresaMap = new Map();
  informadas.forEach((item) => {
    const key = Number(item.empresa?.id || 0);
    const current = empresaMap.get(key) || {
      id: item.empresa?.id || null,
      nome: item.empresa?.nome || 'Sem empresa vinculada',
      saldo: 0,
      contas_informadas: 0
    };
    current.saldo += Number(item.saldo.valor || 0);
    current.contas_informadas += 1;
    empresaMap.set(key, current);
  });

  return {
    data_referencia: data,
    hoje: dateInSaoPaulo(),
    resumo: {
      saldo_informado: Math.round((total + Number.EPSILON) * 100) / 100,
      contas_informadas: informadas.length,
      contas_total: contas.length,
      contas_pendentes: Math.max(contas.length - informadas.length, 0),
      completo: contas.length > 0 && informadas.length === contas.length,
      ultima_atualizacao: saldos[0]?.updatedAt || null
    },
    empresas: [...empresaMap.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    contas: contasSerializadas,
    historico: historico.map((item) => {
      const plain = item.toJSON ? item.toJSON() : item;
      const conta = contaPorId.get(Number(plain.conta_bancaria_id));
      return {
        id: plain.id,
        conta_bancaria_id: Number(plain.conta_bancaria_id),
        conta_nome: conta?.nome || 'Conta não identificada',
        saldo_anterior: plain.saldo_anterior == null ? null : Number(plain.saldo_anterior),
        saldo_novo: Number(plain.saldo_novo || 0),
        acao: plain.acao,
        justificativa: plain.justificativa || null,
        usuario: plain.usuario || null,
        realizado_em: plain.createdAt
      };
    })
  };
}

async function salvarSaldos(user, payload = {}) {
  const data = normalizeDate(payload.data_referencia);
  const hoje = dateInSaoPaulo();
  const itens = Array.isArray(payload.contas) ? payload.contas : [];
  if (!itens.length || itens.length > 100) {
    throw businessError(400, 'PAINEL_GESTOR_CONTAS_INVALIDAS', 'Informe entre 1 e 100 contas.');
  }
  const ids = itens.map((item) => Number(item.conta_bancaria_id));
  if (ids.some((id) => !Number.isInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
    throw businessError(400, 'PAINEL_GESTOR_CONTAS_INVALIDAS', 'A lista possui contas invalidas ou repetidas.');
  }
  const justificativa = String(payload.justificativa || '').trim();
  if (data < hoje) {
    if (!(await hasPermission(user, PERMISSIONS.SALDOS_CORRECT))) {
      throw businessError(403, 'PAINEL_GESTOR_CORRECAO_NEGADA', 'Voce nao possui permissao para corrigir saldos de dias anteriores.');
    }
    if (justificativa.length < 10) {
      throw businessError(422, 'PAINEL_GESTOR_JUSTIFICATIVA_OBRIGATORIA', 'Informe uma justificativa com pelo menos 10 caracteres para corrigir uma data anterior.');
    }
  }

  try {
    return await db.sequelize.transaction(async (transaction) => {
      const contas = await listarContasNoEscopo(user, transaction);
      const contaMap = new Map(contas.map((item) => [Number(item.id), item]));
      if (ids.some((id) => !contaMap.has(id))) {
        throw businessError(403, 'PAINEL_GESTOR_CONTA_FORA_ESCOPO', 'Uma ou mais contas nao pertencem ao seu escopo.');
      }

      let criados = 0;
      let atualizados = 0;
      let inalterados = 0;
      for (const item of itens) {
        const contaId = Number(item.conta_bancaria_id);
        const valor = normalizeMoney(item.saldo_disponivel, `Saldo da conta ${contaId}`);
        const conta = contaMap.get(contaId);
        let saldo = await db.PainelGestorSaldoDiario.findOne({
          where: { conta_bancaria_id: contaId, data_referencia: data },
          transaction,
          lock: transaction.LOCK.UPDATE
        });
        if (!saldo) {
          saldo = await db.PainelGestorSaldoDiario.create({
            conta_bancaria_id: contaId,
            empresa_id: conta.empresa_id || null,
            data_referencia: data,
            saldo_disponivel: valor,
            corrigido: data < hoje,
            ultima_justificativa: data < hoje ? justificativa : null,
            informado_por: user?.id || null,
            atualizado_por: user?.id || null
          }, { transaction });
          await db.PainelGestorSaldoHistorico.create({
            saldo_diario_id: saldo.id,
            conta_bancaria_id: contaId,
            data_referencia: data,
            saldo_anterior: null,
            saldo_novo: valor,
            acao: data < hoje ? 'CORRIGIDO' : 'CRIADO',
            justificativa: justificativa || null,
            usuario_id: user?.id || null
          }, { transaction });
          criados += 1;
          continue;
        }

        const anterior = Number(saldo.saldo_disponivel || 0);
        if (anterior === valor) {
          inalterados += 1;
          continue;
        }
        const correcao = data < hoje;
        await saldo.update({
          empresa_id: conta.empresa_id || null,
          saldo_disponivel: valor,
          corrigido: saldo.corrigido || correcao,
          ultima_justificativa: correcao ? justificativa : saldo.ultima_justificativa,
          atualizado_por: user?.id || null
        }, { transaction });
        await db.PainelGestorSaldoHistorico.create({
          saldo_diario_id: saldo.id,
          conta_bancaria_id: contaId,
          data_referencia: data,
          saldo_anterior: anterior,
          saldo_novo: valor,
          acao: correcao ? 'CORRIGIDO' : 'ATUALIZADO',
          justificativa: justificativa || null,
          usuario_id: user?.id || null
        }, { transaction });
        atualizados += 1;
      }

      return { data_referencia: data, criados, atualizados, inalterados };
    });
  } catch (error) {
    if (error?.name === 'SequelizeUniqueConstraintError') {
      throw businessError(
        409,
        'PAINEL_GESTOR_SALDO_CONCORRENTE',
        'Os saldos desta data foram atualizados por outra operacao. Recarregue a tela e confirme os valores.'
      );
    }
    throw error;
  }
}

module.exports = {
  PERMISSIONS,
  assertPermission,
  carregarSaldosDaData,
  dateInSaoPaulo,
  hasPermission,
  listarObras,
  normalizeDate,
  resolverEscopo,
  salvarSaldos
};
