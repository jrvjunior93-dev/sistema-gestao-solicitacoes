'use strict';

const { Historico, sequelize } = require('../models');

function normalizarAlvoChave(valor) {
  const chave = String(valor || '').trim().toUpperCase();
  if (!/^[A-Z_]+:[A-Z_0-9]+:[0-9]+$/.test(chave) || chave.length > 100) {
    const error = new Error('Identificador de leitura do comentário inválido.');
    error.statusCode = 400;
    throw error;
  }
  return chave;
}

async function listarLeiturasComentarios(solicitacaoId, usuarioId) {
  const [linhas] = await sequelize.query(`SELECT alvo_chave, historico_id
    FROM solicitacao_compra_comentario_leituras
    WHERE solicitacao_id = :solicitacaoId AND usuario_id = :usuarioId`, {
    replacements: { solicitacaoId, usuarioId }
  });
  return Object.fromEntries(linhas.map((linha) => [linha.alvo_chave, Number(linha.historico_id || 0)]));
}

async function marcarLeituraComentario({ solicitacaoId, usuarioId, alvoChave, historicoId }) {
  const chave = normalizarAlvoChave(alvoChave);
  const ultimoHistoricoId = Number(historicoId);
  if (!Number.isInteger(ultimoHistoricoId) || ultimoHistoricoId <= 0) {
    const error = new Error('Comentário inválido para leitura.');
    error.statusCode = 400;
    throw error;
  }

  const historico = await Historico.findOne({
    where: { id: ultimoHistoricoId, solicitacao_id: solicitacaoId },
    attributes: ['id', 'acao']
  });
  if (!historico || !['COMENTARIO_ETAPA_COMPRA', 'ITEM_COMPRA_REJEITADO_GEO'].includes(historico.acao)) {
    const error = new Error('Comentário não pertence a esta solicitação.');
    error.statusCode = 404;
    throw error;
  }

  await sequelize.query(`INSERT INTO solicitacao_compra_comentario_leituras
    (solicitacao_id, usuario_id, alvo_chave, historico_id, createdAt, updatedAt)
    VALUES (:solicitacaoId, :usuarioId, :chave, :historicoId, NOW(), NOW())
    ON DUPLICATE KEY UPDATE
      historico_id = GREATEST(historico_id, VALUES(historico_id)),
      updatedAt = NOW()`, {
    replacements: { solicitacaoId, usuarioId, chave, historicoId: ultimoHistoricoId }
  });

  return { alvo_chave: chave, historico_id: ultimoHistoricoId };
}

module.exports = {
  listarLeiturasComentarios,
  marcarLeituraComentario,
  normalizarAlvoChave
};
