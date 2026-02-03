const db = require('../../models');

module.exports = async function gerarCodigoSolicitacao() {
  const ultima = await db.Solicitacao.findOne({
    where: {
      codigo: {
        [db.Sequelize.Op.like]: 'SOL-%'
      }
    },
    order: [['id', 'DESC']]
  });

  let sequencial = 1;

  if (ultima?.codigo) {
    const partes = String(ultima.codigo).split('-');
    const ultimoNumero = parseInt(partes[partes.length - 1], 10);
    if (!Number.isNaN(ultimoNumero)) {
      sequencial = ultimoNumero + 1;
    }
  }

  return `SOL-${sequencial}`;
};
