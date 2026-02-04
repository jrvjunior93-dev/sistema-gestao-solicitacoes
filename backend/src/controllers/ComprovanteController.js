const { Comprovante, Solicitacao, Obra, Historico, Sequelize } = require('../models');
const { Op } = require('sequelize');
const { uploadToS3 } = require('../services/s3');

function extrairInfo(nome) {
  const result = {
    solicitacao: null,
    obra: null,
    valor: null
  };

  const sol = nome.match(/SOL-\d+/i);
  if (sol) result.solicitacao = sol[0].toUpperCase();

  const obra = nome.match(/OBRA-([A-Za-z0-9]+)/i);
  if (obra) result.obra = obra[1];

  const valor = nome.match(/\d+([.,]\d{2})?/);
  if (valor) result.valor = valor[0].replace(',', '.');

  return result;
}

module.exports = {
  async uploadMassa(req, res) {
    try {
      const arquivos = req.files;
      const usuarioId = req.user?.id || null;
      const setor = req.user?.area || null;

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
          obra = await Obra.findOne({
            where: { codigo: String(info.obra).toUpperCase() }
          });
          if (!obra && String(info.obra).match(/^\d+$/)) {
            obra = await Obra.findByPk(info.obra);
          }
        }

        const url = await uploadToS3(file, 'comprovantes');

        const comprovante = await Comprovante.create({
          nome_original: file.originalname,
          caminho_arquivo: url,
          solicitacao_id: solicitacao?.id || null,
          obra_id: obra?.id || null,
          valor: info.valor || null,
          status: solicitacao ? 'VINCULADO' : 'PENDENTE'
        });

        if (solicitacao) {
          await Historico.create({
            solicitacao_id: solicitacao.id,
            usuario_responsavel_id: usuarioId,
            setor,
            acao: 'COMPROVANTE_ADICIONADO',
            descricao: file.originalname,
            metadata: JSON.stringify({
              comprovante_id: comprovante.id,
              valor: info.valor || null,
              caminho: comprovante.caminho_arquivo
            })
          });
        }
      }

      return res.json({ message: 'Upload concluido' });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro no upload' });
    }
  },

  async pendentes(req, res) {
    try {
      const pendentes = await Comprovante.findAll({
        where: { status: 'PENDENTE' },
        include: [
          { model: Solicitacao, as: 'solicitacao' },
          { model: Obra, as: 'obra' }
        ],
        order: [['createdAt', 'DESC']]
      });

      return res.json(pendentes);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar pendentes' });
    }
  }
  ,

  async vincular(req, res) {
    try {
      const { id } = req.params;
      const { solicitacao_id } = req.body;

      if (!solicitacao_id) {
        return res.status(400).json({ error: 'Solicitacao obrigatoria' });
      }

      const comprovante = await Comprovante.findByPk(id);
      if (!comprovante) {
        return res.status(404).json({ error: 'Comprovante nao encontrado' });
      }

      const solicitacao = await Solicitacao.findByPk(solicitacao_id);
      if (!solicitacao) {
        return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      }

      await comprovante.update({
        solicitacao_id: solicitacao.id,
        status: 'VINCULADO',
        obra_id: comprovante.obra_id || solicitacao.obra_id || null
      });

      await Historico.create({
        solicitacao_id: solicitacao.id,
        usuario_responsavel_id: req.user?.id || null,
        setor: req.user?.area || null,
        acao: 'COMPROVANTE_ADICIONADO',
        descricao: comprovante.nome_original,
        metadata: JSON.stringify({
          comprovante_id: comprovante.id,
          valor: comprovante.valor || null,
          caminho: comprovante.caminho_arquivo,
          vinculo: 'MANUAL'
        })
      });

      return res.json(comprovante);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao vincular comprovante' });
    }
  },

  async solicitacoes(req, res) {
    try {
      const { q } = req.query;
      const where = {
        cancelada: false
      };

      if (q && String(q).trim()) {
        const termo = `%${String(q).trim()}%`;
        where[Op.or] = [
          { codigo: { [Op.like]: termo } },
          { descricao: { [Op.like]: termo } }
        ];
      }

      const solicitacoes = await Solicitacao.findAll({
        where,
        attributes: ['id', 'codigo', 'descricao', 'obra_id'],
        include: [
          {
            model: Obra,
            as: 'obra',
            attributes: ['id', 'nome', 'codigo']
          }
        ],
        order: [['createdAt', 'DESC']],
        limit: 100
      });

      return res.json(solicitacoes);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar solicitacoes' });
    }
  }
};
