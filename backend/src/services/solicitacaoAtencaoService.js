const { Op } = require('sequelize');
const {
  Historico,
  Setor,
  SolicitacaoAtencaoUsuario,
  User,
  UsuarioSetor
} = require('../models');

function token(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function destinatariosSetoresEnvolvidos(solicitacao) {
  const setoresHistorico = await Historico.findAll({
    where: { solicitacao_id: solicitacao.id, setor: { [Op.ne]: null } },
    attributes: ['setor'],
    group: ['setor'],
    raw: true
  });
  const tokens = new Set([
    token(solicitacao.area_responsavel),
    ...setoresHistorico.map((linha) => token(linha.setor))
  ].filter(Boolean));
  if (!tokens.size) return [];

  const setores = await Setor.findAll({ attributes: ['id', 'nome', 'codigo'], raw: true });
  const idsSetores = setores
    .filter((setor) => tokens.has(token(setor.id)) || tokens.has(token(setor.codigo)) || tokens.has(token(setor.nome)))
    .map((setor) => Number(setor.id));
  if (!idsSetores.length) return [];

  const [usuariosPrincipais, vinculos] = await Promise.all([
    User.findAll({ where: { ativo: true, setor_id: { [Op.in]: idsSetores } }, attributes: ['id'], raw: true }),
    UsuarioSetor.findAll({ where: { setor_id: { [Op.in]: idsSetores } }, attributes: ['user_id'], raw: true })
  ]);
  return [...usuariosPrincipais.map((row) => row.id), ...vinculos.map((row) => row.user_id)];
}

async function registrarAtencaoSolicitacao({ solicitacao, atorId, tipo, resumo, mencoes = [] }) {
  if (!solicitacao?.id) return [];
  const [participantes, destinatariosSetores] = await Promise.all([
    Historico.findAll({
      where: { solicitacao_id: solicitacao.id, usuario_responsavel_id: { [Op.ne]: null } },
      attributes: ['usuario_responsavel_id'],
      group: ['usuario_responsavel_id'], raw: true
    }),
    destinatariosSetoresEnvolvidos(solicitacao)
  ]);
  const ids = [...new Set([
    solicitacao.criado_por,
    ...participantes.map((linha) => linha.usuario_responsavel_id),
    ...destinatariosSetores,
    ...mencoes
  ]
    .map(Number).filter((id) => Number.isInteger(id) && id > 0 && id !== Number(atorId)))];
  if (!ids.length) return [];

  const ativos = await User.findAll({
    where: { id: { [Op.in]: ids }, ativo: true },
    attributes: ['id'], raw: true
  });
  const agora = new Date();
  await SolicitacaoAtencaoUsuario.bulkCreate(ativos.map(({ id }) => ({
    solicitacao_id: solicitacao.id,
    usuario_id: id,
    tipo: String(tipo || 'COMENTARIO').slice(0, 40),
    resumo: String(resumo || '').slice(0, 255) || null,
    evento_em: agora,
    lido_em: null
  })), {
    updateOnDuplicate: ['tipo', 'resumo', 'evento_em', 'lido_em', 'updatedAt']
  });
  return ativos.map(({ id }) => Number(id));
}

async function marcarAtencaoLida(solicitacaoId, usuarioId) {
  if (!Number(solicitacaoId) || !Number(usuarioId)) return;
  await SolicitacaoAtencaoUsuario.update(
    { lido_em: new Date() },
    { where: { solicitacao_id: solicitacaoId, usuario_id: usuarioId, lido_em: null } }
  );
}

module.exports = { registrarAtencaoSolicitacao, marcarAtencaoLida };
