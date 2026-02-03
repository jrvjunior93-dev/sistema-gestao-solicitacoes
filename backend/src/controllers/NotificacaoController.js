const { NotificacaoDestinatario, Notificacao } = require('../models');

module.exports = {
  async index(req, res) {
    try {
      const { nao_lidas, limit } = req.query;
      const where = { usuario_id: req.user.id };
      if (String(nao_lidas) === '1' || String(nao_lidas) === 'true') {
        where.lida_em = null;
      }

      const totalNaoLidas = await NotificacaoDestinatario.count({
        where: { usuario_id: req.user.id, lida_em: null }
      });

      const itens = await NotificacaoDestinatario.findAll({
        where,
        include: [
          {
            model: Notificacao,
            as: 'notificacao'
          }
        ],
        order: [['createdAt', 'DESC']],
        limit: Number(limit) > 0 ? Number(limit) : 50
      });

      const resultado = itens.map(item => ({
        destinatario_id: item.id,
        lida_em: item.lida_em,
        createdAt: item.notificacao?.createdAt,
        tipo: item.notificacao?.tipo,
        mensagem: item.notificacao?.mensagem,
        solicitacao_id: item.notificacao?.solicitacao_id,
        metadata: item.notificacao?.metadata
          ? JSON.parse(item.notificacao.metadata)
          : null
      }));

      return res.json({
        total_nao_lidas: totalNaoLidas,
        itens: resultado
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar notificacoes' });
    }
  },

  async marcarLida(req, res) {
    try {
      const { id } = req.params;
      const destinatario = await NotificacaoDestinatario.findOne({
        where: {
          id,
          usuario_id: req.user.id
        }
      });

      if (!destinatario) {
        return res.status(404).json({ error: 'Notificacao nao encontrada' });
      }

      if (!destinatario.lida_em) {
        await destinatario.update({ lida_em: new Date() });
      }

      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao marcar como lida' });
    }
  },

  async marcarTodasLidas(req, res) {
    try {
      await NotificacaoDestinatario.update(
        { lida_em: new Date() },
        {
          where: {
            usuario_id: req.user.id,
            lida_em: null
          }
        }
      );

      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao marcar todas como lidas' });
    }
  }
};
