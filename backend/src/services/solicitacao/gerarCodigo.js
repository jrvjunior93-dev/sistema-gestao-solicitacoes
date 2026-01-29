const db = require('../../models');

module.exports = async function gerarCodigoSolicitacao() {
  const ano = new Date().getFullYear();

  const ultima = await db.Solicitacao.findOne({
    where: {
      codigo: {
        [db.Sequelize.Op.like]: `SOL-${ano}-%`
      }
    },
    order: [['createdAt', 'DESC']]
  });

  let sequencial = 1;

  if (ultima) {
    const ultimoNumero = parseInt(ultima.codigo.split('-')[2]);
    sequencial = ultimoNumero + 1;
  }

  return `SOL-${ano}-${String(sequencial).padStart(6, '0')}`;
};
