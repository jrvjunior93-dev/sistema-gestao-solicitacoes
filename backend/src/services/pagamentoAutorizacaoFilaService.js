const { Op } = require('sequelize');
const { PagamentoAutorizacaoItem, PagamentoAutorizacaoLote } = require('../models');
const { recordEvent } = require('./pagamentoAutorizacaoEventosService');

// Chamador mantem os titulos bloqueados. Ordem comum: titulo -> lote -> item.
// Fila e dossie sao gravados na mesma transacao; nao fabrica decisao digital.
async function sincronizarDossiesComFila({ req, itensFila, transaction, origem }) {
  if (!itensFila.length) return;
  const filasPorTitulo = new Map(itensFila.map(item => [Number(item.titulo_financeiro_id), item]));
  const candidatos = await PagamentoAutorizacaoItem.findAll({
    where: { titulo_financeiro_id: { [Op.in]: [...filasPorTitulo.keys()] }, status: { [Op.in]: ['PENDENTE', 'AUTORIZADO'] } },
    attributes: ['lote_id'], transaction
  });
  const loteIds = [...new Set(candidatos.map(item => Number(item.lote_id)))].sort((a, b) => a - b);
  for (const loteId of loteIds) {
    const lote = await PagamentoAutorizacaoLote.findByPk(loteId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!lote || !['AGUARDANDO', 'AUTORIZADO'].includes(lote.status)) continue;
    // Leitura corrente com lock: COUNT sem lock poderia usar snapshot antigo
    // ao aguardar outro envio de um titulo diferente do mesmo lote.
    const todos = await PagamentoAutorizacaoItem.findAll({
      where: { lote_id: loteId },
      transaction, lock: transaction.LOCK.UPDATE, order: [['id', 'ASC']]
    });
    const itens = todos.filter(item => filasPorTitulo.has(Number(item.titulo_financeiro_id)) && ['PENDENTE', 'AUTORIZADO'].includes(item.status));
    for (const item of itens) {
      const fila = filasPorTitulo.get(Number(item.titulo_financeiro_id));
      const anterior = item.status;
      await item.update({ status: 'ENFILEIRADO', fila_item_id: fila.id }, { transaction });
      await recordEvent({ loteId, itemId: item.id, userId: req.user.id, type: 'ITEM_ENFILEIRADO',
        data: { fila_item_id: Number(fila.id), titulo_id: Number(item.titulo_financeiro_id), origem, status_anterior: anterior,
          ...(req.dev_user_switch ? { dev_user_switch: req.dev_user_switch } : {}) }, transaction });
    }
    const pending = todos.some(item => item.status === 'PENDENTE');
    const authorized = todos.some(item => item.status === 'AUTORIZADO');
    const enqueued = todos.some(item => item.status === 'ENFILEIRADO');
    const status = pending ? 'AGUARDANDO' : (authorized ? 'AUTORIZADO' : (enqueued ? 'CONCLUIDO' : 'REJEITADO'));
    if (lote.status !== status) await lote.update({ status }, { transaction });
  }
}

module.exports = { sincronizarDossiesComFila };
