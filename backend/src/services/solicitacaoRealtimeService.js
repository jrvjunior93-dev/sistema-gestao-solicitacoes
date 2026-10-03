const { Op } = require('sequelize');
const {
  Historico,
  Solicitacao,
  User
} = require('../models');
const liveUpdatesBroker = require('./liveUpdatesBroker');
const { obterDestinatariosCriacaoSetor } = require('./notificacoes');

function toPositiveInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function sanitizeMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }

  return Object.entries(metadata).reduce((acc, [key, value]) => {
    if (value === undefined) {
      return acc;
    }

    acc[key] = value;
    return acc;
  }, {});
}

async function fetchSolicitacaoSnapshot(solicitacaoId) {
  const id = toPositiveInt(solicitacaoId);
  if (!id) return null;

  return Solicitacao.findByPk(id, {
    attributes: [
      'id',
      'codigo',
      'status_global',
      'area_responsavel',
      'tipo_solicitacao_id',
      'criado_por',
      'obra_id',
      'createdAt',
      'updatedAt'
    ]
  });
}

async function fetchParticipanteIds(solicitacaoId) {
  const rows = await Historico.findAll({
    where: {
      solicitacao_id: solicitacaoId,
      usuario_responsavel_id: { [Op.ne]: null }
    },
    attributes: ['usuario_responsavel_id']
  });

  return Array.from(
    new Set(
      rows
        .map((row) => toPositiveInt(row.usuario_responsavel_id))
        .filter(Boolean)
    )
  );
}

async function fetchSuperadminIds() {
  const users = await User.findAll({
    where: {
      perfil: 'SUPERADMIN',
      ativo: true
    },
    attributes: ['id']
  });

  return users
    .map((user) => toPositiveInt(user.id))
    .filter(Boolean);
}

async function resolveRecipientIds(solicitacao, extraUserIds = []) {
  const recipients = new Set(
    (Array.isArray(extraUserIds) ? extraUserIds : [extraUserIds])
      .map((item) => toPositiveInt(item))
      .filter(Boolean)
  );

  if (toPositiveInt(solicitacao?.criado_por)) {
    recipients.add(Number(solicitacao.criado_por));
  }

  const [participantes, destinatariosSetor, superadmins] = await Promise.all([
    fetchParticipanteIds(solicitacao.id),
    obterDestinatariosCriacaoSetor(solicitacao),
    fetchSuperadminIds()
  ]);

  participantes.forEach((id) => recipients.add(id));
  (Array.isArray(destinatariosSetor) ? destinatariosSetor : []).forEach((id) => {
    const parsed = toPositiveInt(id);
    if (parsed) recipients.add(parsed);
  });
  superadmins.forEach((id) => recipients.add(id));

  return Array.from(recipients);
}

function buildSolicitacaoRealtimePayload({
  action,
  solicitacao,
  actor,
  metadata
}) {
  const occurredAt = new Date().toISOString();

  return {
    event_type: 'SOLICITACAO',
    entity: 'SOLICITACAO',
    action: String(action || 'UPDATED').trim().toUpperCase(),
    record_id: Number(solicitacao.id),
    codigo: solicitacao.codigo || null,
    status: solicitacao.status_global || null,
    area_responsavel: solicitacao.area_responsavel || null,
    obra_id: toPositiveInt(solicitacao.obra_id),
    occurred_at: occurredAt,
    actor: actor?.id
      ? {
          id: Number(actor.id),
          nome: actor.nome || null
        }
      : null,
    metadata: sanitizeMetadata(metadata)
  };
}

async function publishSolicitacaoRealtimeEvent({
  action,
  solicitacao,
  solicitacaoId,
  actor = null,
  extraUserIds = [],
  metadata = {}
}) {
  const snapshot = solicitacao || await fetchSolicitacaoSnapshot(solicitacaoId);
  if (!snapshot?.id) {
    return null;
  }

  const recipientIds = await resolveRecipientIds(snapshot, extraUserIds);
  if (recipientIds.length === 0) {
    return null;
  }

  const payload = buildSolicitacaoRealtimePayload({
    action,
    solicitacao: snapshot,
    actor,
    metadata
  });

  liveUpdatesBroker.publishToUsers(recipientIds, payload, {
    topics: ['solicitacoes']
  });

  return payload;
}

module.exports = {
  fetchSolicitacaoSnapshot,
  resolveRecipientIds,
  publishSolicitacaoRealtimeEvent
};
