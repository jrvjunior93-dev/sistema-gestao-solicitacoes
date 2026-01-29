const path = require('path');
const fs = require('fs');

const {
  Anexo,
  Solicitacao,
  Historico,
  User
} = require('../models');

class AnexoController {

  async upload(req, res) {
    try {

      const { solicitacao_id, tipo } = req.body;
      const usuario = await User.findByPk(req.user.id);

      if (!solicitacao_id) {
        return res.status(400).json({ error: 'solicitacao_id é obrigatório' });
      }

      if (!tipo) {
        return res.status(400).json({ error: 'tipo é obrigatório' });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado' });
      }

      const solicitacao = await Solicitacao.findByPk(solicitacao_id);

      if (!solicitacao) {
        return res.status(404).json({ error: 'Solicitação não encontrada' });
      }

      const codigo = solicitacao.codigo;

      const pastaDestino = path.join(
        __dirname,
        '../../uploads/solicitacoes',
        codigo,
        tipo.toLowerCase()
      );

      if (!fs.existsSync(pastaDestino)) {
        fs.mkdirSync(pastaDestino, { recursive: true });
      }

      const registros = [];

      for (const file of req.files) {

        const destinoFinal = path.join(
          pastaDestino,
          file.originalname
        );

        fs.renameSync(file.path, destinoFinal);

        const caminhoRelativo = destinoFinal
          .replace(path.join(__dirname, '../../'), '')
          .replace(/\\/g, '/');

        const anexo = await Anexo.create({
          solicitacao_id,
          tipo,
          nome_original: file.originalname,
          caminho_arquivo: caminhoRelativo,
          uploaded_by: usuario.id,
          area_origem: usuario.setor_id
        });

        registros.push(anexo);

        // ✅ HISTÓRICO COM METADATA
        await Historico.create({
          solicitacao_id,
          usuario_responsavel_id: usuario.id,
          setor: usuario.setor_id,
          acao: 'ANEXO_ADICIONADO',
          descricao: file.originalname,
          metadata: JSON.stringify({
            caminho: caminhoRelativo
          })
        });
      }

      return res.status(201).json(registros);

    } catch (error) {
      console.error('Erro upload anexo:', error);
      return res.status(500).json({ error: 'Erro ao salvar anexos' });
    }
  }

  async listarPorSolicitacao(req, res) {
    try {

      const { id } = req.params;
      const { tipo } = req.query;

      const where = { solicitacao_id: id };

      if (tipo) where.tipo = tipo;

      const anexos = await Anexo.findAll({
        where,
        order: [['createdAt', 'DESC']]
      });

      return res.json(anexos);

    } catch (error) {
      console.error('Erro listar anexos:', error);
      return res.status(500).json({ error: 'Erro ao listar anexos' });
    }
  }

}

module.exports = new AnexoController();
