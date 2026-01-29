const db = require('../../models');
const gerarCodigo = require('./gerarCodigo');

module.exports = async function criarSolicitacao({
  obra_id,
  tipo_solicitacao_id,
  descricao,
  valor,
  usuario
}) {
  // 1. Verificar vínculo usuário-obra
  const vinculo = await db.UsuarioObra.findOne({
    where: {
      user_id: usuario.id,
      obra_id
    }
  });

  if (!vinculo && usuario.perfil !== 'ADMIN') {
    throw new Error('Usuário não possui vínculo com esta obra');
  }

  // 2. Gerar código
  const codigo = await gerarCodigo();

  // 3. Criar solicitação
  const solicitacao = await db.Solicitacao.create({
    codigo,
    obra_id,
    tipo_solicitacao_id,
    descricao,
    valor,
    status_global: 'Criada',
    area_responsavel: 'GEO',
    criado_por: usuario.id
  });

  // 4. Criar StatusArea inicial (GEO)
  await db.StatusArea.create({
    solicitacao_id: solicitacao.id,
    setor: 'GEO',
    status: 'Pendente de análise'
  });

  // 5. Criar histórico
  await db.Historico.create({
    solicitacao_id: solicitacao.id,
    usuario_responsavel_id: usuario_responsavel_id,
    setor: usuario.perfil,
    acao: 'Solicitação criada',
    status_novo: 'Criada'
  });

  return solicitacao;
};
