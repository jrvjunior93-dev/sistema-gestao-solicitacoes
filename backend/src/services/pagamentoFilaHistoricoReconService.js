const crypto = require('crypto');
const { Op } = require('sequelize');
const { PagamentoManualFilaItem, TituloFinanceiro, User, SecurityEventLog, sequelize } = require('../models');
const { planejarComprovantesFilaNoHistorico, registrarComprovantesFilaNoHistorico } = require('./pagamentoFilaHistoricoService');

function validarIds(ids) {
  if (!Array.isArray(ids) || ids.length > 100 || ids.some(id => !Number.isSafeInteger(id) || id <= 0)
      || new Set(ids).size !== ids.length) throw new Error('Informe ate 100 IDs de fila positivos e distintos.');
  return [...ids].sort((a, b) => a - b);
}
function assinaturaPlanos(planos) {
  return crypto.createHash('sha256').update(JSON.stringify(planos)).digest('hex');
}
function resumir(planos) {
  return planos.flatMap(p => p.arquivos.map(a => ({ fila_id: p.fila_id, titulo_id: p.titulo_id,
    titulo_codigo: p.titulo_codigo, solicitacao_id: p.solicitacao_id, movimento_id: p.movimento_id,
    arquivo: a.nome, situacao: a.situacao })));
}

async function conferirHistoricoComprovantesFila({ filaIds = [], apos = 0, limite = 100 } = {}) {
  const ids = validarIds(filaIds);
  if (!Number.isSafeInteger(apos) || apos < 0 || !Number.isSafeInteger(limite) || limite < 1 || limite > 100) {
    throw new Error('Cursor invalido ou limite fora de 1 a 100.');
  }
  const rows = await PagamentoManualFilaItem.findAll({ where: {
    id: ids.length ? { [Op.in]: ids } : { [Op.gt]: apos },
    status: { [Op.in]: ['BAIXADO', 'DIVERGENTE', 'RESOLVIDO'] }, movimento_financeiro_id: { [Op.gt]: 0 }
  }, order: [['id', 'ASC']], limit: ids.length || limite });
  const planos = [];
  for (const row of rows) planos.push(await planejarComprovantesFilaNoHistorico(row));
  return { planos, confirmacao: assinaturaPlanos(planos), resumo: resumir(planos),
    filas: rows.map(r => r.id), proximo_cursor: rows.length ? rows[rows.length - 1].id : apos };
}

// Nunca chamado automaticamente pelo deploy. Requer recorte e assinatura
// revisados, opt-in operacional e identidade de superadmin ativo.
async function aplicarHistoricoComprovantesFila({ filaIds, confirmacao, usuarioId, habilitado = false } = {}) {
  const ids = validarIds(filaIds);
  if (!habilitado || !ids.length || !/^[a-f0-9]{64}$/.test(confirmacao || '')) {
    throw new Error('Aplicacao bloqueada: habilite explicitamente e informe IDs/assinatura da conferencia.');
  }
  if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) throw new Error('ID de superadmin invalido.');
  const usuario = await User.findByPk(usuarioId, { attributes: ['id', 'perfil', 'ativo'] });
  if (!usuario?.ativo || usuario.perfil !== 'SUPERADMIN') throw new Error('Superadmin ativo obrigatorio para reconciliacao.');
  const conferencia = await conferirHistoricoComprovantesFila({ filaIds: ids });
  if (conferencia.filas.length !== ids.length || conferencia.confirmacao !== confirmacao) {
    throw new Error('Conferencia divergente. Revise novamente o mesmo recorte somente leitura.');
  }
  return sequelize.transaction(async transaction => {
    await TituloFinanceiro.findAll({ where: { id: { [Op.in]: conferencia.planos.map(p => p.titulo_id) } },
      attributes: ['id'], order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
    const rows = await PagamentoManualFilaItem.findAll({ where: { id: { [Op.in]: ids } },
      order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
    const planos = [];
    for (const row of rows) planos.push(await planejarComprovantesFilaNoHistorico(row, transaction, { leituraCorrente: true }));
    if (assinaturaPlanos(planos) !== confirmacao) throw new Error('Dados mudaram durante a reconciliacao. Nenhum vinculo aplicado.');
    let quantidade = 0;
    for (const row of rows) quantidade += await registrarComprovantesFilaNoHistorico({ user: usuario }, row, transaction);
    await SecurityEventLog.create({ usuario_id: usuario.id, tipo_evento: 'MANUAL_PAYMENT_RECEIPTS_HISTORY_RECONCILED',
      recurso_tipo: 'PAGAMENTO_MANUAL_FILA', recurso_id: confirmacao, status: 'SUCCESS',
      descricao: 'Comprovantes existentes vinculados ao historico, sem alterar baixas.',
      metadata: { fila_ids: ids, confirmacao, quantidade }
    }, { transaction });
    return { quantidade, fila_ids: ids };
  });
}

module.exports = { conferirHistoricoComprovantesFila, aplicarHistoricoComprovantesFila };
