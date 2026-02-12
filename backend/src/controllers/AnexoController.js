const {
  Anexo,
  Solicitacao,
  Historico,
  User
} = require('../models');
const { criarNotificacao } = require('../services/notificacoes');
const { uploadToS3, getPresignedUrl } = require('../services/s3');

class AnexoController {

  async upload(req, res) {
    try {

      const { solicitacao_id, tipo } = req.body;
      const usuario = await User.findByPk(req.user.id);

      if (!solicitacao_id) {
        return res.status(400).json({ error: 'solicitacao_id Ã© obrigatÃ³rio' });
      }

      if (!tipo) {
        return res.status(400).json({ error: 'tipo é obrigatório' });
      }

      const tiposPermitidos = [
        'ANEXO',
        'SOLICITACAO',
        'CONTRATO',
        'COMPROVANTE'
      ];

      const tipoNormalizado = String(tipo).toUpperCase();

      if (!tiposPermitidos.includes(tipoNormalizado)) {
        return res.status(400).json({ error: 'tipo inválido' });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado' });
      }

      const solicitacao = await Solicitacao.findByPk(solicitacao_id);

      if (!solicitacao) {
        return res.status(404).json({ error: 'SolicitaÃ§Ã£o nÃ£o encontrada' });
      }

      const codigo = solicitacao.codigo;

      const registros = [];

      for (const file of req.files) {
        const url = await uploadToS3(
          file,
          `anexos/${codigo}/${tipoNormalizado.toLowerCase()}`
        );

        const anexo = await Anexo.create({
          solicitacao_id,
          tipo: tipoNormalizado,
          nome_original: file.originalname,
          caminho_arquivo: url,
          uploaded_by: usuario.id,
          area_origem: usuario.setor_id
        });

        registros.push(anexo);

        // ??? HIST??RICO COM METADATA
        await Historico.create({
          solicitacao_id,
          usuario_responsavel_id: usuario.id,
          setor: usuario.setor_id,
          acao: 'ANEXO_ADICIONADO',
          descricao: file.originalname,
          metadata: JSON.stringify({
            anexo_id: anexo.id,
            caminho: url
          })
        });
      }


      await criarNotificacao({
        solicitacao_id,
        tipo: 'ANEXO_ADICIONADO',
        mensagem: `${usuario?.nome || 'Usuario'} anexou ${registros.length} arquivo(s) na solicitacao ${codigo}`,
        created_by: usuario.id,
        metadata: { total: registros.length }
      });

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

  async presign(req, res) {
    try {
      const { url, key } = req.query;
      const alvo = url || key;

      if (!alvo) {
        return res.status(400).json({ error: 'url obrigatoria' });
      }

      const signedUrl = await getPresignedUrl(alvo);
      return res.json({ url: signedUrl });
    } catch (error) {
      console.error('Erro ao gerar URL assinada:', error);
      return res.status(500).json({ error: 'Erro ao gerar URL assinada' });
    }
  }

  async remover(req, res) {
    try {
      const { historicoId } = req.params;
      const usuario = await User.findByPk(req.user.id);
      const setorUsuario = String(req.user.area || '').toUpperCase();

      if (setorUsuario !== 'COMPRAS') {
        return res.status(403).json({ error: 'Apenas usuarios do setor COMPRAS podem remover anexo.' });
      }

      const historico = await Historico.findByPk(historicoId);
      if (!historico) {
        return res.status(404).json({ error: 'Historico nao encontrado.' });
      }

      if (historico.acao !== 'ANEXO_ADICIONADO') {
        return res.status(400).json({ error: 'Somente anexos do historico podem ser removidos.' });
      }

      let metadata = {};
      try {
        metadata = historico.metadata ? JSON.parse(historico.metadata) : {};
      } catch {
        metadata = {};
      }

      const anexoId = metadata?.anexo_id;
      const caminho = metadata?.caminho;

      let anexo = null;
      if (anexoId) {
        anexo = await Anexo.findByPk(anexoId);
      }

      if (!anexo && caminho) {
        anexo = await Anexo.findOne({
          where: {
            solicitacao_id: historico.solicitacao_id,
            caminho_arquivo: caminho
          }
        });
      }

      if (anexo) {
        await anexo.destroy();
      }

      await historico.destroy();

      await Historico.create({
        solicitacao_id: historico.solicitacao_id,
        usuario_responsavel_id: usuario.id,
        setor: usuario.setor_id,
        acao: 'ANEXO_REMOVIDO',
        descricao: anexo?.nome_original || historico.descricao || 'Anexo removido',
        metadata: JSON.stringify({ caminho: caminho || null })
      });

      return res.json({ ok: true });
    } catch (error) {
      console.error('Erro remover anexo:', error);
      return res.status(500).json({ error: 'Erro ao remover anexo.' });
    }
  }

}

module.exports = new AnexoController();
