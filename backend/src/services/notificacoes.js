const { Op } = require('sequelize');
const {
  Notificacao,
  NotificacaoDestinatario,
  Historico,
  Solicitacao,
  User,
  Setor
} = require('../models');

async function resolverSetorPorArea(areaResponsavel) {
  if (!areaResponsavel) return null;
  const area = String(areaResponsavel).trim().toUpperCase();

  const setor = await Setor.findOne({
    where: {
      [Op.or]: [
        { codigo: area },
        { nome: area }
      ]
    },
    attributes: ['id', 'codigo', 'nome']
  });

  return setor;
}

async function obterParticipantes(solicitacaoId) {
  const solicitacao = await Solicitacao.findByPk(solicitacaoId, {
    attributes: ['id', 'criado_por', 'area_responsavel']
  });
  if (!solicitacao) return { solicitacao: null, participantes: [] };

  const historicos = await Historico.findAll({
    where: {
      solicitacao_id: solicitacaoId,
      usuario_responsavel_id: { [Op.ne]: null }
    },
    attributes: ['usuario_responsavel_id']
  });

  const participantes = new Set();
  if (solicitacao.criado_por) participantes.add(solicitacao.criado_por);
  for (const h of historicos) {
    participantes.add(h.usuario_responsavel_id);
  }

  return { solicitacao, participantes: Array.from(participantes) };
}

async function obterAdminsDoSetor(areaResponsavel) {
  const setor = await resolverSetorPorArea(areaResponsavel);
  if (!setor) return [];

  const admins = await User.findAll({
    where: {
      perfil: 'ADMIN',
      setor_id: setor.id
    },
    attributes: ['id']
  });

  return admins.map(a => a.id);
}

async function obterAdminsGEO() {
  const setor = await resolverSetorPorArea('GEO');
  if (!setor) return [];

  const admins = await User.findAll({
    where: {
      perfil: 'ADMIN',
      setor_id: setor.id
    },
    attributes: ['id']
  });

  return admins.map(a => a.id);
}

async function obterSuperadmins() {
  const superadmins = await User.findAll({
    where: { perfil: 'SUPERADMIN' },
    attributes: ['id']
  });
  return superadmins.map(a => a.id);
}

async function criarNotificacao({
  solicitacao_id,
  tipo,
  mensagem,
  metadata,
  created_by
}) {
  const { solicitacao, participantes } = await obterParticipantes(solicitacao_id);
  if (!solicitacao) return null;

  const destinatarios = new Set(participantes);

  const adminsSetor = await obterAdminsDoSetor(solicitacao.area_responsavel);
  adminsSetor.forEach(id => destinatarios.add(id));

  const adminsGEO = await obterAdminsGEO();
  adminsGEO.forEach(id => destinatarios.add(id));

  const superadmins = await obterSuperadmins();
  superadmins.forEach(id => destinatarios.add(id));

  if (created_by) destinatarios.delete(created_by);

  const notificacao = await Notificacao.create({
    solicitacao_id,
    tipo,
    mensagem,
    metadata: metadata ? JSON.stringify(metadata) : null,
    created_by: created_by || null
  });

  const linhas = Array.from(destinatarios).map(usuario_id => ({
    notificacao_id: notificacao.id,
    usuario_id
  }));

  if (linhas.length > 0) {
    await NotificacaoDestinatario.bulkCreate(linhas);
  }

  return notificacao;
}

module.exports = {
  criarNotificacao
};
