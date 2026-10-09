'use strict';
const { PagamentoManualFilaItem } = require('../models');
const { Op } = require('sequelize');
const { filaSemBaixaAtualizavel } = require('./pagamentoFilaValoresDomain');

// Chamado com titulo ja bloqueado. Mesma ordem titulo -> fila da baixa/aprovacao.
async function sincronizarSaldoFilaAposEdicao(titulo, transaction) {
  if (!transaction) throw new Error('Sincronizacao da fila exige transacao.');
  const itens = await PagamentoManualFilaItem.findAll({
    where: { titulo_financeiro_id: titulo.id, status: { [Op.in]: ['PENDENTE', 'NAO_PAGO', 'DIVERGENTE'] } },
    transaction, lock: transaction.LOCK.UPDATE, order: [['id', 'ASC']]
  });
  for (const item of itens) {
    if (!filaSemBaixaAtualizavel(item)) continue;
    await item.update({ valor_previsto: titulo.valor_saldo,
      juros: Number(titulo.juros || 0), multa: Number(titulo.multa || 0),
      data_vencimento_prevista: titulo.data_vencimento || null }, { transaction });
  }
}

module.exports = { sincronizarSaldoFilaAposEdicao };
