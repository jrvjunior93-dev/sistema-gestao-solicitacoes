'use strict';
const { LogExclusao, User } = require('../models');
const { Op } = require('sequelize');
// Trilha duravel ja usada para regularizacao/recuperacao. Entidade propria,
// sem Historico/autoria de solicitacao e sem retencao de security_event_logs.
const ENTIDADE = 'TITULO_DESVINCULACAO_FATURA';
const EVENTO = 'FINANCIAL_TITLE_CARD_FORECAST_UNLINKED';
function metadata(registro) {
  try {
    const value = JSON.parse(registro.payload_json);
    if (!value || typeof value !== 'object' || !value.idempotency_key || !value.request_hash) throw Error();
    return value;
  } catch { throw Object.assign(new Error('Trilha da desvinculacao inconsistente. Confira a auditoria antes de continuar.'), { statusCode: 409 }); }
}
async function recibos(tituloId, transaction, limite) {
  // O chamador de escrita ja travou o titulo. Nao travar a tabela generica de
  // logs; a primeira leitura consistente ocorre depois do lock do titulo.
  const rows = await LogExclusao.findAll({ where: { entidade: ENTIDADE, entidade_id: Number(tituloId) },
    transaction, order: [['id', 'DESC']], ...(limite ? { limit: limite } : {}) });
  return rows.map(row => ({ row, metadata: metadata(row) }));
}
async function buscarRecibo(tituloId, key, transaction) {
  return (await recibos(tituloId, transaction)).find(item => item.metadata.idempotency_key === key) || null;
}
async function registrarRecibo(req, tituloId, dados, transaction) {
  await LogExclusao.create({ entidade: ENTIDADE, entidade_id: Number(tituloId), solicitacao_id: null,
    usuario_id: req.user.id, perfil: String(req.user.perfil || 'USUARIO').slice(0, 50),
    setor: String(req.user.setor?.codigo || req.user.area || req.user.setor?.nome || '').slice(0, 100),
    motivo: dados.motivo.slice(0, 255), payload_json: JSON.stringify(dados)
  }, { transaction });
}
async function listarEventos(tituloId) {
  const items = await recibos(tituloId, undefined, 50);
  const ids = [...new Set(items.map(item => Number(item.row.usuario_id)))];
  const users = ids.length ? await User.findAll({ where: { id: { [Op.in]: ids } }, attributes: ['id', 'nome', 'email'] }) : [];
  return items.map(({ row, metadata: dados }) => ({ id: `DESVINCULACAO-${row.id}`, tipo_evento: EVENTO,
    status: 'SUCCESS', descricao: 'Previsao de cartao desvinculada antes da correcao do titulo',
    createdAt: row.createdAt, usuario: users.find(user => Number(user.id) === Number(row.usuario_id)) || { id: row.usuario_id }, metadata: dados }));
}
module.exports = { EVENTO, buscarRecibo, registrarRecibo, listarEventos };
