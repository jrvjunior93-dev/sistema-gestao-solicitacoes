'use strict';

const { sequelize } = require('../models');

// Chamar somente DEPOIS de aplicar o escopo de acesso. Não carrega dados de
// outras solicitações; cada leitura reconhece apenas o snapshot que foi exibido.
async function comAtividade(linhas, usuarioId) {
  if (!linhas.length) return linhas;
  const [eventos] = await sequelize.query(`SELECT h.solicitacao_id, MAX(h.id) AS ultimo,
    MAX(h.createdAt) AS atividade_em, COALESCE(MAX(l.historico_id), 0) AS lido
    FROM rh_solicitacao_historicos h
    LEFT JOIN rh_solicitacao_leituras l ON l.solicitacao_id=h.solicitacao_id AND l.usuario_id=:usuarioId
    WHERE h.solicitacao_id IN (:ids) GROUP BY h.solicitacao_id`,
  { replacements: { usuarioId, ids: linhas.map(s => Number(s.id)) } });
  const porId = new Map(eventos.map(e => [Number(e.solicitacao_id), e]));
  return linhas.map(s => {
    const e = porId.get(Number(s.id));
    return { ...s, ultimo_historico_id: Number(e?.ultimo || 0),
      atividade_em: e?.atividade_em || s.updatedAt || s.createdAt,
      nao_lida: Number(e?.ultimo || 0) > Number(e?.lido || 0) };
  }).sort((a, b) => new Date(b.atividade_em) - new Date(a.atividade_em)
    || b.ultimo_historico_id - a.ultimo_historico_id || b.id - a.id);
}

async function marcarLida(solicitacaoId, usuarioId, historicoId) {
  if (!historicoId) return;
  await sequelize.query(`INSERT INTO rh_solicitacao_leituras
    (solicitacao_id,usuario_id,historico_id,createdAt,updatedAt)
    VALUES (:solicitacaoId,:usuarioId,:historicoId,NOW(),NOW())
    ON DUPLICATE KEY UPDATE historico_id=GREATEST(historico_id,VALUES(historico_id)),updatedAt=NOW()`,
  { replacements: { solicitacaoId, usuarioId, historicoId } });
}

async function marcarListaLida(solicitacaoIds, usuarioId) {
  const ids = [...new Set((solicitacaoIds || []).map(Number).filter(Number.isSafeInteger))];
  if (!ids.length) return;
  await sequelize.query(`INSERT INTO rh_solicitacao_leituras
    (solicitacao_id,usuario_id,historico_id,createdAt,updatedAt)
    SELECT h.solicitacao_id,:usuarioId,MAX(h.id),NOW(),NOW()
    FROM rh_solicitacao_historicos h
    WHERE h.solicitacao_id IN (:ids)
    GROUP BY h.solicitacao_id
    ON DUPLICATE KEY UPDATE historico_id=GREATEST(historico_id,VALUES(historico_id)),updatedAt=NOW()`,
  { replacements: { ids, usuarioId } });
}

module.exports = { comAtividade, marcarLida, marcarListaLida };
