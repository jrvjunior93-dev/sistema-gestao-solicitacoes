const { Op, fn, col } = require('sequelize');
const { NotificacaoDestinatario, Notificacao } = require('../models');
const { filtrarNotificacoesRetornoParaDecisao } = require('../services/solicitacaoRetornoService');
const DEFAULT_NOTIFICACOES_LIMIT = 20;
const MAX_NOTIFICACOES_LIMIT = 50;

function normalizarTiposFiltro(value) {
  const itens = Array.isArray(value) ? value : String(value || '').split(',');
  return [
    ...new Set(
      itens
        .map(item => String(item || '').trim().toUpperCase())
        .filter(Boolean)
    )
  ];
}

module.exports = {
  async index(req, res) {
    try {
      const { nao_lidas, limit, page, tipos } = req.query;
      const retornosParaDecisao = String(req.query.retornos_para_decisao) === '1';
      const where = { usuario_id: req.user.id };
      const limite = Math.min(
        Number(limit) > 0 ? Number(limit) : DEFAULT_NOTIFICACOES_LIMIT,
        MAX_NOTIFICACOES_LIMIT
      );
      const pagina = Math.max(Number(page) > 0 ? Number(page) : 1, 1);
      const offset = (pagina - 1) * limite;
      const tiposFiltro = retornosParaDecisao ? ['RETORNO_SOLICITADO'] : normalizarTiposFiltro(tipos);
      const includeNotificacao = {
        model: Notificacao,
        as: 'notificacao',
        required: tiposFiltro.length > 0,
        where: tiposFiltro.length > 0
          ? {
              tipo: { [Op.in]: tiposFiltro }
            }
          : undefined
      };

      if (retornosParaDecisao || String(nao_lidas) === '1' || String(nao_lidas) === 'true') {
        where.lida_em = null;
      }

      const contagemGlobal = tiposFiltro.length === 0;
      const [contagem, totalItens, itens] = await Promise.all([
        contagemGlobal ? NotificacaoDestinatario.findAll({
          where: { usuario_id: req.user.id, lida_em: null },
          attributes: [[col('notificacao.tipo'), 'tipo'], [fn('COUNT', col('NotificacaoDestinatario.id')), 'total']],
          include: [{ ...includeNotificacao, attributes: [] }],
          group: ['notificacao.tipo'], raw: true
        }) : NotificacaoDestinatario.count({
          where: { usuario_id: req.user.id, lida_em: null },
          include: [includeNotificacao],
          distinct: true,
          col: 'id'
        }),
        NotificacaoDestinatario.count({
          where,
          include: [includeNotificacao],
          distinct: true,
          col: 'id'
        }),
        NotificacaoDestinatario.findAll({
          where,
          include: [includeNotificacao],
          order: [['createdAt', 'DESC']],
          limit: limite,
          offset
        })
      ]);
      const contadoresPorTipo = contagemGlobal ? Object.fromEntries(contagem.filter(r => r.tipo).map(r => [r.tipo, Number(r.total)])) : null;
      const totalNaoLidas = contagemGlobal ? contagem.reduce((n, r) => n + Number(r.total || 0), 0) : contagem;

      const notificacoes = itens.map(item => ({
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
      const resultado = retornosParaDecisao
        ? await filtrarNotificacoesRetornoParaDecisao(req, notificacoes)
        : notificacoes;

      return res.json({
        usuario_id: req.user.id,
        ...(contadoresPorTipo ? { contadores_por_tipo: contadoresPorTipo } : {}),
        total_nao_lidas: totalNaoLidas,
        itens: resultado,
        meta: {
          page: pagina,
          limit: limite,
          total: totalItens,
          has_more: offset + resultado.length < totalItens
        }
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
      const agora = new Date();
      const [marcadas] = await NotificacaoDestinatario.update(
        { lida_em: agora },
        {
          where: {
            usuario_id: req.user.id,
            lida_em: null
          }
        }
      );

      const totalNaoLidas = await NotificacaoDestinatario.count({
        where: {
          usuario_id: req.user.id,
          lida_em: null
        }
      });

      return res.json({
        marcadas,
        total_nao_lidas: totalNaoLidas
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao marcar todas como lidas' });
    }
  }
};
