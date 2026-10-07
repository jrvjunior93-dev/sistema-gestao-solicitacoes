const crypto = require('crypto');
const { PagamentoAutorizacaoEvento } = require('../models');

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = stable(value[key]);
      return result;
    }, {});
  }
  return value;
}

function sha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

async function recordEvent({ loteId, itemId = null, userId = null, type, data = null, transaction }) {
  const previous = await PagamentoAutorizacaoEvento.findOne({
    where: { lote_id: loteId }, order: [['id', 'DESC']], transaction, lock: transaction?.LOCK?.UPDATE
  });
  const createdAt = new Date();
  const eventData = { lote_id: Number(loteId), item_id: itemId ? Number(itemId) : null, usuario_id: userId ? Number(userId) : null, tipo: type, dados: data, criado_em: createdAt.toISOString(), hash_anterior: previous?.evento_hash || null };
  return PagamentoAutorizacaoEvento.create({
    lote_id: loteId, item_id: itemId, usuario_id: userId, tipo: type, dados_json: data,
    hash_anterior: previous?.evento_hash || null, evento_hash: sha256(eventData),
    createdAt, updatedAt: createdAt
  }, { transaction });
}

module.exports = { sha256, recordEvent };
