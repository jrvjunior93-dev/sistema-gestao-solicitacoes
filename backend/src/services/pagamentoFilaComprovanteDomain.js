const { Op } = require('sequelize');

const STATUS_PAGAMENTO_REGISTRADO = ['BAIXADO', 'DIVERGENTE', 'RESOLVIDO'];

// Metadados do primeiro PDF sao mantidos na fila por ambos os caminhos de upload.
function temComprovanteFila(item) {
  return Boolean(item?.comprovante_hash && item?.comprovante_url);
}

function pendenteComprovanteFila(item) {
  return STATUS_PAGAMENTO_REGISTRADO.includes(item?.status) &&
    Number(item?.movimento_financeiro_id) > 0 && !temComprovanteFila(item);
}

function wherePendenteComprovante() {
  return {
    status: { [Op.in]: STATUS_PAGAMENTO_REGISTRADO },
    movimento_financeiro_id: { [Op.gt]: 0 },
    [Op.or]: [{ comprovante_hash: null }, { comprovante_url: null },
      { comprovante_hash: '' }, { comprovante_url: '' }]
  };
}

function podeAnexarComprovanteFila(item) {
  if (!item || item.somente_consulta) return false;
  if (['PENDENTE', 'DIVERGENTE'].includes(item.status)) return true;
  return ['BAIXADO', 'RESOLVIDO'].includes(item.status) &&
    (Number(item.movimento_financeiro_id) > 0 || temComprovanteFila(item));
}

module.exports = { temComprovanteFila, pendenteComprovanteFila, wherePendenteComprovante, podeAnexarComprovanteFila };
