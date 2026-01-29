const db = require('../../models');

module.exports = async function atualizarStatus({
  solicitacao_id,
  novoStatus,
  observacao,
  usuario
}) {
  const solicitacao = await db.Solicitacao.findByPk(solicitacao_id);

  if (!solicitacao) {
    throw new Error('Solicitação não encontrada');
  }

  // Regra de permissão
  if (
    usuario.perfil !== 'ADMIN' &&
    usuario.perfil !== solicitacao.area_responsavel
  ) {
    throw new Error('Usuário não pode atualizar esta solicitação');
  }

  const statusAnterior = solicitacao.status_global;
  let novaArea = solicitacao.area_responsavel;
  let novoStatusGlobal = solicitacao.status_global;

  // ===== REGRAS DE TRANSIÇÃO =====
  if (usuario.perfil === 'GEO' && novoStatus === 'Encaminhada para Compras') {
    novaArea = 'COMPRAS';
    novoStatusGlobal = 'Em Compras';
  }

  if (usuario.perfil === 'GEO' && novoStatus === 'Encaminhada para Financeiro') {
    novaArea = 'FINANCEIRO';
    novoStatusGlobal = 'Em Financeiro';
  }

  if (usuario.perfil === 'COMPRAS' && novoStatus === 'Entregue') {
    novoStatusGlobal = 'Concluída';
  }

  if (usuario.perfil === 'FINANCEIRO' && novoStatus === 'Pago') {
    novoStatusGlobal = 'Concluída';
  }

  // 1. Atualizar StatusArea
  await db.StatusArea.create({
    solicitacao_id,
    setor: usuario.perfil,
    status: novoStatus,
    observacao
  });

  // 2. Atualizar solicitação
  await solicitacao.update({
    status_global: novoStatusGlobal,
    area_responsavel: novaArea
  });

  // 3. Criar histórico
  await db.Historico.create({
    solicitacao_id,
    usuario_responsavel_id: usuario_responsavel_id,
    setor: usuario.perfil,
    acao: 'Atualização de status',
    status_anterior: statusAnterior,
    status_novo: novoStatusGlobal,
    observacao
  });

  return solicitacao;
};
