'use strict';

const { Op } = require('sequelize');
const { Solicitacao, SolicitacaoInteracaoUsuario, sequelize } = require('../models');
const { destinatariosAtencao } = require('./solicitacaoAtencaoService');

function notificarLeituraOuInteracao(solicitacaoId, usuarios, action, atorId) {
  try {
    require('./liveUpdatesBroker').publishToUsers(usuarios, {
      event_type: 'SOLICITACAO', entity: 'SOLICITACAO', action,
      record_id: Number(solicitacaoId), actor: { id: Number(atorId) || null },
      occurred_at: new Date().toISOString()
    }, { topics: ['solicitacoes'] });
  } catch (error) { console.error('Falha no aviso de atualizacao das interacoes:', error); }
}

function metadata(linha) {
  try {
    const valor = typeof linha.metadata === 'string' ? JSON.parse(linha.metadata) : linha.metadata;
    return valor && typeof valor === 'object' && !Array.isArray(valor) ? valor : {};
  }
  catch { return {}; }
}

function tipoInteracao(linha) {
  if (linha.acao === 'COMENTARIO_ETAPA_COMPRA') {
    const escopo = metadata(linha).escopo;
    if (escopo === 'COTACAO') return 'COMENTARIO_COTACAO';
    if (escopo === 'PEDIDO') return 'COMENTARIO_PEDIDO';
  }
  return ({
    COMENTARIO: 'COMENTARIO',
    COMENTARIO_ETAPA_COMPRA: 'COMENTARIO_ITEM',
    ITEM_COMPRA_REJEITADO_GEO: 'COMENTARIO_ITEM',
    COTACAO_COMPRA_COMENTARIO: 'COMENTARIO_COTACAO',
    PEDIDO_COMPRA_COMENTARIO: 'COMENTARIO_PEDIDO',
    ANEXO_ADICIONADO: 'ANEXO',
    COMPROVANTE_ADICIONADO: 'ANEXO',
    RETORNO_DEVOLVIDO: 'RETORNO_DEVOLVIDO'
  })[linha.acao] || (linha.acao === 'ENVIADA_SETOR' && metadata(linha).envio_manual ? 'ENVIO_MANUAL' : null);
}

// Chamado pelo Historico somente apos commit: rollback nunca cria destaque.
// Chave usuario/historico impede replay e duplicidade entre etapas do mesmo item.
async function registrarInteracao(linha) {
  if (linha.acao === 'ANEXO_REMOVIDO') {
    const historicoId = Number(metadata(linha).historico_id);
    if (historicoId) await SolicitacaoInteracaoUsuario.update({ lido_em: new Date() }, {
      where: { solicitacao_id: linha.solicitacao_id, historico_id: historicoId, lido_em: null }
    });
    return;
  }
  const tipo = tipoInteracao(linha);
  if (!tipo || !Number(linha.id)) return;
  const solicitacao = await Solicitacao.findByPk(linha.solicitacao_id);
  if (!solicitacao) return;
  const mencionados = metadata(linha).mencoes;
  const mencoes = (Array.isArray(mencionados) ? mencionados : []).map((item) => item?.id || item);
  const ids = await destinatariosAtencao({ solicitacao, atorId: linha.usuario_responsavel_id, mencoes });
  if (!ids.length) return;
  await SolicitacaoInteracaoUsuario.bulkCreate(ids.sort((a, b) => a - b).map((id) => ({
    solicitacao_id: solicitacao.id, usuario_id: id, historico_id: linha.id,
    tipo, evento_em: linha.createdAt || new Date(), lido_em: null
  })), { ignoreDuplicates: true });
  // Sem texto/arquivo no evento. O destinatario deve recarregar a lista
  // autorizada inteira: a solicitacao pode ter estado em outra pagina.
  notificarLeituraOuInteracao(solicitacao.id, ids, 'INTERACTION_ADDED', linha.usuario_responsavel_id);
}

function sqlExistePendente(usuarioId, alias = 'Solicitacao') {
  return `EXISTS (SELECT 1 FROM solicitacao_interacoes_usuario siu
    JOIN historicos hi ON hi.id = siu.historico_id AND hi.solicitacao_id = siu.solicitacao_id
    WHERE siu.solicitacao_id = ${alias}.id AND siu.usuario_id = ${Number(usuarioId) || -1}
      AND siu.lido_em IS NULL AND hi.acao <> 'COMENTARIO_REMOVIDO')`;
}
function sqlUltimoPendente(usuarioId) {
  return `(SELECT MAX(siu.evento_em) FROM solicitacao_interacoes_usuario siu
    JOIN historicos hi ON hi.id = siu.historico_id AND hi.solicitacao_id = siu.solicitacao_id
    WHERE siu.solicitacao_id = Solicitacao.id AND siu.usuario_id = ${Number(usuarioId) || -1}
      AND siu.lido_em IS NULL AND hi.acao <> 'COMENTARIO_REMOVIDO')`;
}

async function listarInteracoes(solicitacaoIds, usuarioId) {
  const ids = [...new Set(solicitacaoIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length || !Number(usuarioId)) return new Map();
  const [linhas] = await sequelize.query(`SELECT siu.solicitacao_id, siu.historico_id, siu.tipo, siu.evento_em
    FROM solicitacao_interacoes_usuario siu
    JOIN historicos hi ON hi.id = siu.historico_id AND hi.solicitacao_id = siu.solicitacao_id
    WHERE siu.solicitacao_id IN (:ids) AND siu.usuario_id = :usuarioId
      AND siu.lido_em IS NULL AND hi.acao <> 'COMENTARIO_REMOVIDO'
    ORDER BY siu.historico_id DESC`, { replacements: { ids, usuarioId: Number(usuarioId) } });
  const mapa = new Map();
  for (const linha of linhas) {
    const id = Number(linha.solicitacao_id);
    if (!mapa.has(id)) mapa.set(id, []);
    const grupos = mapa.get(id);
    let grupo = grupos.find((item) => item.tipo === linha.tipo);
    if (!grupo) {
      grupo = { tipo: linha.tipo, quantidade: 0, historico_id: Number(linha.historico_id),
        historico_ids: [], evento_em: linha.evento_em };
      grupos.push(grupo);
    }
    grupo.quantidade++;
    // Janela de leitura: novos eventos nunca sao reconhecidos por uma tela antiga.
    if (grupo.historico_ids.length < 100) grupo.historico_ids.push(Number(linha.historico_id));
  }
  return mapa;
}

async function marcarInteracoesLidas({ solicitacaoId, usuarioId, historicoIds }) {
  if (!Array.isArray(historicoIds) || !historicoIds.length || historicoIds.length > 100
    || historicoIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    const error = new Error('Informe de 1 a 100 eventos validos para leitura.');
    error.statusCode = 400;
    throw error;
  }
  await SolicitacaoInteracaoUsuario.update({ lido_em: new Date() }, { where: {
    solicitacao_id: Number(solicitacaoId), usuario_id: Number(usuarioId),
    historico_id: { [Op.in]: [...new Set(historicoIds)] }, lido_em: null
  } });
  notificarLeituraOuInteracao(solicitacaoId, [Number(usuarioId)], 'INTERACTIONS_READ', usuarioId);
  return (await listarInteracoes([Number(solicitacaoId)], usuarioId)).get(Number(solicitacaoId)) || [];
}

module.exports = { tipoInteracao, registrarInteracao, listarInteracoes, marcarInteracoesLidas,
  sqlExistePendente, sqlUltimoPendente };
