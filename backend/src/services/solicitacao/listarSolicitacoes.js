const db = require('../../models');

module.exports = async function listarSolicitacoes(usuario) {
  // ADMIN vê tudo
  if (usuario.perfil === 'ADMIN') {
    return db.Solicitacao.findAll({
      include: [
        db.Obra,
        db.User
      ],
      order: [['createdAt', 'DESC']]
    });
  }

  // Buscar obras vinculadas ao usuário
  const vinculos = await db.UsuarioObra.findAll({
    where: { user_id: usuario.id }
  });

  const obrasIds = vinculos.map(v => v.obra_id);

  return db.Solicitacao.findAll({
    where: {
      obra_id: obrasIds
    },
    include: [
      db.Obra,
      db.User
    ],
    order: [['createdAt', 'DESC']]
  });
};
