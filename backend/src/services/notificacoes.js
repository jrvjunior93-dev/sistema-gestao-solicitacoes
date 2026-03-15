const { Op } = require('sequelize');
const {
  Notificacao,
  NotificacaoDestinatario,
  Historico,
  Solicitacao,
  User,
  Setor,
  SetorPermissao,
  ConfiguracaoSistema
} = require('../models');

const CHAVE_TIPOS_SOLICITACAO_POR_SETOR = 'TIPOS_SOLICITACAO_POR_SETOR';

function parseJsonOrDefault(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function construirTokensSetor(areaResponsavel) {
  const area = String(areaResponsavel || '').trim().toUpperCase();
  if (!area) return [];

  const tokens = new Set([area]);
  if (['GEO', 'GERENCIA DE PROCESSOS', 'GERENCIA_PROCESSOS'].includes(area)) {
    tokens.add('GEO');
    tokens.add('GERENCIA DE PROCESSOS');
    tokens.add('GERENCIA_PROCESSOS');
  }

  return Array.from(tokens);
}

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

async function obterModoRecebimentoSetor(tokensSetor = []) {
  if (!Array.isArray(tokensSetor) || tokensSetor.length === 0) {
    return 'TODOS_VISIVEIS';
  }

  const permissoes = await SetorPermissao.findAll({
    where: {
      setor: { [Op.in]: tokensSetor }
    },
    attributes: ['setor', 'modo_recebimento']
  });

  for (const token of tokensSetor) {
    const item = permissoes.find(
      permissao => String(permissao.setor || '').toUpperCase() === String(token).toUpperCase()
    );
    if (item?.modo_recebimento) {
      return String(item.modo_recebimento).toUpperCase();
    }
  }

  return 'TODOS_VISIVEIS';
}

async function obterModoRecebimentoPorSetorETipo(tokensSetor = [], tipoSolicitacaoId = null) {
  const tipoId = Number(tipoSolicitacaoId);
  if (Number.isInteger(tipoId) && tipoId > 0) {
    const item = await ConfiguracaoSistema.findOne({
      where: { chave: CHAVE_TIPOS_SOLICITACAO_POR_SETOR },
      order: [['id', 'DESC']]
    });
    const configuracao = parseJsonOrDefault(item?.valor, {});

    for (const token of tokensSetor) {
      const regraSetor = configuracao[String(token || '').trim().toUpperCase()];
      const modoPorTipo = regraSetor?.modos?.[String(tipoId)];
      if (modoPorTipo) {
        return String(modoPorTipo).toUpperCase();
      }
    }
  }

  return obterModoRecebimentoSetor(tokensSetor);
}

async function obterDestinatariosCriacaoSetor(solicitacao) {
  if (!solicitacao?.area_responsavel) return [];

  const setor = await resolverSetorPorArea(solicitacao.area_responsavel);
  if (!setor) return [];

  const tokensSetor = construirTokensSetor(solicitacao.area_responsavel);
  const modoRecebimento = await obterModoRecebimentoPorSetorETipo(
    tokensSetor,
    solicitacao.tipo_solicitacao_id
  );

  const whereUsuarios = {
    ativo: true,
    setor_id: setor.id
  };

  if (modoRecebimento !== 'TODOS_VISIVEIS') {
    whereUsuarios.perfil = 'ADMIN';
  }

  const usuariosSetor = await User.findAll({
    where: whereUsuarios,
    attributes: ['id']
  });

  return usuariosSetor.map(usuario => usuario.id);
}

async function criarNotificacao({
  solicitacao_id,
  tipo,
  mensagem,
  metadata,
  created_by,
  destinatarios,
  usarDestinatariosInformados = false
}) {
  const { solicitacao, participantes } = await obterParticipantes(solicitacao_id);
  if (!solicitacao) return null;

  const destinatariosSet = new Set();

  if (usarDestinatariosInformados && Array.isArray(destinatarios)) {
    destinatarios
      .map(usuarioId => Number(usuarioId))
      .filter(usuarioId => Number.isInteger(usuarioId) && usuarioId > 0)
      .forEach(usuarioId => destinatariosSet.add(usuarioId));
  } else {
    participantes.forEach(usuarioId => destinatariosSet.add(usuarioId));

    const adminsSetor = await obterAdminsDoSetor(solicitacao.area_responsavel);
    adminsSetor.forEach(id => destinatariosSet.add(id));

    const adminsGEO = await obterAdminsGEO();
    adminsGEO.forEach(id => destinatariosSet.add(id));

    const superadmins = await obterSuperadmins();
    superadmins.forEach(id => destinatariosSet.add(id));
  }

  if (created_by) destinatariosSet.delete(created_by);

  const notificacao = await Notificacao.create({
    solicitacao_id,
    tipo,
    mensagem,
    metadata: metadata ? JSON.stringify(metadata) : null,
    created_by: created_by || null
  });

  const linhas = Array.from(destinatariosSet).map(usuario_id => ({
    notificacao_id: notificacao.id,
    usuario_id
  }));

  if (linhas.length > 0) {
    await NotificacaoDestinatario.bulkCreate(linhas);
  }

  return notificacao;
}

module.exports = {
  criarNotificacao,
  obterDestinatariosCriacaoSetor
};
