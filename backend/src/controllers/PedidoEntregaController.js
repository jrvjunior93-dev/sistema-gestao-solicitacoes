const { SolicitacaoCompra, UsuarioObra, Setor, User, UsuarioSetor } = require('../models');
const { Op } = require('sequelize');
const { assertPodeVisualizarSolicitacao } = require('../services/solicitacaoRetornoService');
const { userHasSetorCapability } = require('../services/setorCapabilityService');
const { operarEntrega } = require('../services/pedidoEntregaService');
const { publishSolicitacaoRealtimeEvent } = require('../services/solicitacaoRealtimeService');

module.exports = {
  async operar(req, res) {
    try {
      const { solicitacao } = await assertPodeVisualizarSolicitacao(req, req.params.id);
      const compra = await SolicitacaoCompra.findOne({ where: { solicitacao_principal_id: solicitacao.id }, order: [['id', 'DESC']] });
      if (!compra) return res.status(404).json({ error: 'Compra não encontrada.' });
      const recebimento = ['RECEBER', 'NAO_ENTREGUE'].includes(req.body?.acao);
      const admin = req.user?.perfil === 'SUPERADMIN';
      if (!admin && !(await userHasSetorCapability(req.user, recebimento ? 'eh_setor_obra' : 'eh_setor_compras'))) {
        return res.status(403).json({ error: 'Ação restrita ao setor responsável pela entrega.' });
      }
      if (recebimento && !admin && !(await UsuarioObra.findOne({ where: { user_id: req.user.id, obra_id: compra.obra_id } }))) {
        return res.status(403).json({ error: 'Somente usuários vinculados à obra podem informar a entrega.' });
      }
      const resultado = await operarEntrega({ pedidoId: Number(req.params.pedidoId), compraId: compra.id,
        solicitacaoId: solicitacao.id, usuarioId: req.user.id, payload: req.body });
      // Falha de publicação não transforma uma transação já salva em aparente fracasso.
      try {
        const setores = await Setor.findAll({ attributes: ['id', 'codigo', 'nome', 'eh_setor_compras'] });
        const ids = setores.filter((s) => require('../services/setorCapabilityService').hasSetorCapability(s, 'eh_setor_compras')).map((s) => s.id);
        const principais = ids.length ? await User.findAll({ where: { ativo: true, setor_id: { [Op.in]: ids } }, attributes: ['id'] }) : [];
        const secundarios = ids.length ? await UsuarioSetor.findAll({ where: { setor_id: { [Op.in]: ids } }, attributes: ['user_id'] }) : [];
        const obra = await UsuarioObra.findAll({ where: { obra_id: compra.obra_id }, attributes: ['user_id'] });
        await publishSolicitacaoRealtimeEvent({ action: 'PURCHASE_DELIVERY_UPDATED', solicitacao, actor: { id: req.user.id },
          extraUserIds: [...principais.map((u) => u.id), ...secundarios.map((v) => v.user_id), ...obra.map((v) => v.user_id)] });
      }
      catch (error) { console.error('Entrega salva; publicação de atualização falhou:', error); }
      return res.json({ itens: resultado });
    } catch (error) {
      if (!error.statusCode) console.error(error);
      return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Não foi possível registrar a entrega.' });
    }
  },
  async receberItem(req, res) {
    req.body = { acao: 'RECEBER', idempotency_key: req.body?.idempotency_key, motivo: req.body?.observacao,
      itens: [{ id: Number(req.params.itemId), quantidade: req.body?.quantidade, versao: req.body?.versao }] };
    return module.exports.operar(req, res);
  }
};
