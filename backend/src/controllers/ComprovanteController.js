const path = require('path');
const { Comprovante, Solicitacao, Obra } = require('../models');

function extrairInfo(nome) {

  const result = {
    solicitacao: null,
    obra: null,
    valor: null
  };

  const sol = nome.match(/SOL-\d+/i);
  if (sol) result.solicitacao = sol[0].toUpperCase();

  const obra = nome.match(/OBRA-\d+/i);
  if (obra) result.obra = obra[0].split('-')[1];

  const valor = nome.match(/\d+([.,]\d{2})?/);
  if (valor) result.valor = valor[0].replace(',', '.');

  return result;
}

module.exports = {

  async uploadMassa(req, res) {

    try {

      const arquivos = req.files;

      for (const file of arquivos) {

        const info = extrairInfo(file.originalname);

        let solicitacao = null;
        let obra = null;

        if (info.solicitacao) {
          solicitacao = await Solicitacao.findOne({
            where: { codigo: info.solicitacao }
          });
        }

        if (info.obra) {
          obra = await Obra.findByPk(info.obra);
        }

        await Comprovante.create({
          nome_original: file.originalname,
          caminho_arquivo: `/uploads/comprovantes/${file.filename}`,
          solicitacao_id: solicitacao?.id || null,
          obra_id: obra?.id || null,
          valor: info.valor || null,
          status: solicitacao ? 'VINCULADO' : 'PENDENTE'
        });

      }

      return res.json({ message: 'Upload concluído' });

    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro no upload' });
    }
  }

};
