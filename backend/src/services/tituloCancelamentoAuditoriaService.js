'use strict';
const { LogExclusao } = require('../models');
// Mesma trilha permanente de regularizacao financeira ja usada pela
// desvinculacao de fatura. Nao exclui nada nem amplia ACL via Historico.
const ENTIDADE = 'TITULO_CANCELAMENTO';
const EVENTO = 'FINANCIAL_TITLE_CANCELLED';
async function buscarCancelamento(tituloId, transaction) {
  const row = await LogExclusao.findOne({ where: { entidade: ENTIDADE, entidade_id: Number(tituloId) },
    order: [['id', 'DESC']], transaction });
  if (!row) return null;
  let dados;
  try { dados = JSON.parse(row.payload_json); } catch { /* falha fechada abaixo */ }
  if (!dados?.idempotency_key || !dados?.request_hash || !dados?.motivo || !dados?.usuario?.id || !dados?.cancelado_em) {
    throw Object.assign(Error('Historico de cancelamento inconsistente. Confira a auditoria financeira.'), { statusCode: 409 });
  }
  return dados;
}
async function registrarCancelamento(req, tituloId, dados, transaction) {
  await LogExclusao.create({ entidade: ENTIDADE, entidade_id: Number(tituloId), solicitacao_id: null,
    usuario_id: req.user.id, perfil: String(req.user.perfil || 'USUARIO').slice(0, 50),
    setor: String(req.user.setor?.codigo || req.user.area || '').slice(0, 100),
    motivo: dados.motivo.slice(0, 255), payload_json: JSON.stringify(dados)
  }, { transaction });
}
async function resumoCancelamento(tituloId) {
  const dados = await buscarCancelamento(tituloId);
  return dados ? { motivo: dados.motivo, cancelado_em: dados.cancelado_em, usuario: dados.usuario } : null;
}
async function listarEventos(tituloId) {
  const dados = await buscarCancelamento(tituloId);
  return dados ? [{ id: `CANCELAMENTO-${tituloId}`, tipo_evento: EVENTO, status: 'SUCCESS',
    descricao: 'Titulo cancelado sem excluir registros ou registrar pagamento', createdAt: dados.cancelado_em,
    usuario: dados.usuario, metadata: dados }] : [];
}
module.exports = { EVENTO, buscarCancelamento, registrarCancelamento, resumoCancelamento, listarEventos };
