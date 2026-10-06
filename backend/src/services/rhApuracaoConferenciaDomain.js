const { createHash } = require('node:crypto');

function revisaoItem(item) {
  const plain = typeof item?.toJSON === 'function' ? item.toJSON() : item;
  return createHash('sha256').update(JSON.stringify([
    plain.id, plain.status, Number(plain.ajuste_credito_manual || 0),
    Number(plain.ajuste_debito_manual || 0), plain.observacoes || '',
    plain.detalhes_json || {}, plain.updatedAt || null
  ])).digest('hex');
}

function alteraConferencia(item, data) {
  return ['ajuste_credito_manual', 'ajuste_debito_manual'].some((key) => (
    data[key] !== undefined && Number(data[key] || 0) !== Number(item[key] || 0)
  )) || (data.observacoes !== undefined && String(data.observacoes || '') !== String(item.observacoes || ''))
    || (data.chave_pix_titulo !== undefined
      && String(data.chave_pix_titulo || '') !== String(item.detalhes_json?.pagamento?.chave_pix_titulo || ''));
}

module.exports = { revisaoItem, alteraConferencia };
