const { Op } = require('sequelize');
const {
  Historico,
  Insumo,
  PedidoCompra,
  PedidoCompraItem,
  PedidoCompraItemRecebimento,
  SolicitacaoCompra,
  SolicitacaoCompraFornecedorItem,
  SolicitacaoCompraItem,
  SolicitacaoCompraItemApropriacao,
  SolicitacaoCompraItemManual,
  SolicitacaoCompraItemManualApropriacao,
  User
} = require('../models');
const {
  assertPodeInteragirSolicitacao,
  assertPodeVisualizarSolicitacao
} = require('../services/solicitacaoRetornoService');
const { userHasSetorCapability } = require('../services/setorCapabilityService');
const { registrarAtencaoSolicitacao } = require('../services/solicitacaoAtencaoService');
const { publishSolicitacaoRealtimeEvent } = require('../services/solicitacaoRealtimeService');
const { criarNotificacao } = require('../services/notificacoes');

function responderErro(res, error) {
  if (!error.statusCode) console.error(error);
  return res.status(error.statusCode || 500).json({
    error: error.statusCode ? error.message : 'Erro ao processar itens da solicitação.'
  });
}

function rejeitar(mensagem, statusCode = 400) {
  const error = new Error(mensagem);
  error.statusCode = statusCode;
  throw error;
}

async function buscarContexto(req, { interagir = false } = {}) {
  const { solicitacao } = interagir
    ? await assertPodeInteragirSolicitacao(req, req.params.id)
    : await assertPodeVisualizarSolicitacao(req, req.params.id);
  const compra = await SolicitacaoCompra.findOne({
    where: { solicitacao_principal_id: solicitacao.id },
    order: [['id', 'DESC']]
  });
  if (!compra) rejeitar('Esta solicitação não possui compra estruturada.', 404);
  return { solicitacao, compra };
}

async function exigirSetor(req, capability) {
  if (String(req.user?.perfil || '').toUpperCase() === 'SUPERADMIN') return;
  if (!(await userHasSetorCapability(req.user, capability))) {
    rejeitar('Esta ação pertence ao setor responsável.', 403);
  }
}

function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}

async function localizarReferencia(compra, escopo, referenciaId, itemTipo) {
  if (!Number.isInteger(referenciaId) || referenciaId <= 0) rejeitar('Referência inválida.');
  if (escopo === 'ITEM' || escopo === 'ITEM_APROVADO') {
    if (!['CADASTRADO', 'MANUAL'].includes(itemTipo)) rejeitar('Tipo de item inválido.');
    const Model = itemTipo === 'CADASTRADO' ? SolicitacaoCompraItem : SolicitacaoCompraItemManual;
    const item = await Model.findOne({ where: { id: referenciaId, solicitacao_compra_id: compra.id } });
    if (!item) rejeitar('Item não pertence a esta solicitação.', 404);
    return { tipo: itemTipo, item };
  }
  if (escopo === 'COTACAO') {
    if (referenciaId !== Number(compra.id)) rejeitar('Cotação não pertence a esta solicitação.', 404);
    return {};
  }
  if (escopo === 'PEDIDO') {
    const pedido = await PedidoCompra.findOne({ where: { id: referenciaId, solicitacao_compra_id: compra.id } });
    if (!pedido) rejeitar('Pedido não pertence a esta solicitação.', 404);
    return { pedido };
  }
  if (escopo === 'PEDIDO_ITEM' || escopo === 'ENTREGA') {
    const item = await PedidoCompraItem.findByPk(referenciaId, {
      include: [{ model: PedidoCompra, as: 'pedido', attributes: ['id', 'solicitacao_compra_id'] }]
    });
    if (!item || Number(item.pedido?.solicitacao_compra_id) !== Number(compra.id)) {
      rejeitar('Item do pedido não pertence a esta solicitação.', 404);
    }
    return { item };
  }
  rejeitar('Etapa de comentário inválida.');
}

module.exports = {
  async listar(req, res) {
    try {
      const { solicitacao, compra } = await buscarContexto(req);
      const [itens, manuais, pedidos, historicos] = await Promise.all([
        SolicitacaoCompraItem.findAll({
          where: { solicitacao_compra_id: compra.id },
          include: [
            { model: Insumo, as: 'insumo', attributes: ['id', 'nome', 'codigo'] },
            { model: SolicitacaoCompraItemApropriacao, as: 'apropriacoes' }
          ],
          order: [['id', 'ASC']]
        }),
        SolicitacaoCompraItemManual.findAll({
          where: { solicitacao_compra_id: compra.id },
          include: [{ model: SolicitacaoCompraItemManualApropriacao, as: 'apropriacoes' }],
          order: [['id', 'ASC']]
        }),
        PedidoCompra.findAll({
          where: { solicitacao_compra_id: compra.id },
          include: [{ model: PedidoCompraItem, as: 'itens', required: false }],
          order: [['id', 'DESC']]
        }),
        Historico.findAll({
          where: { solicitacao_id: solicitacao.id, acao: 'COMENTARIO_ETAPA_COMPRA' },
          include: [{ model: User, as: 'usuario', attributes: ['id', 'nome'] }],
          order: [['id', 'ASC']]
        })
      ]);
      const idsPedidoItens = pedidos.flatMap((pedido) => pedido.itens.map((item) => item.id));
      const recebimentos = idsPedidoItens.length
        ? await PedidoCompraItemRecebimento.findAll({
          where: { pedido_compra_item_id: { [Op.in]: idsPedidoItens } },
          order: [['id', 'ASC']]
        }) : [];
      const recebimentosPorItem = new Map();
      recebimentos.forEach((linha) => {
        const id = Number(linha.pedido_compra_item_id);
        recebimentosPorItem.set(id, [...(recebimentosPorItem.get(id) || []), linha.toJSON()]);
      });
      return res.json({
        solicitacao_id: solicitacao.id,
        solicitacao_compra_id: compra.id,
        obra_id: compra.obra_id,
        status_compra: compra.status,
        itens: [
          ...itens.map((item) => ({ ...item.toJSON(), item_tipo: 'CADASTRADO', nome: item.insumo?.nome || item.descricao || `Item ${item.id}` })),
          ...manuais.map((item) => ({ ...item.toJSON(), item_tipo: 'MANUAL', nome: item.nome_manual || `Item ${item.id}` }))
        ],
        pedidos: pedidos.map((pedido) => ({
          ...pedido.toJSON(),
          itens: pedido.itens.map((item) => ({ ...item.toJSON(), recebimentos: recebimentosPorItem.get(Number(item.id)) || [] }))
        })),
        comentarios: historicos.map((linha) => ({
          id: linha.id,
          descricao: linha.descricao,
          usuario: linha.usuario,
          createdAt: linha.createdAt,
          ...parseMetadata(linha.metadata)
        }))
      });
    } catch (error) { return responderErro(res, error); }
  },

  async decidirItem(req, res) {
    try {
      const { solicitacao, compra } = await buscarContexto(req, { interagir: true });
      await exigirSetor(req, 'eh_setor_geo');
      if (compra.origem === 'COMPRA_DIRETA') rejeitar('Compra direta não usa aprovação de itens.');
      if (!['PENDENTE', 'ENVIADO', 'INTEGRADO_SIENGE'].includes(String(compra.status || '').toUpperCase())) {
        rejeitar('A revisão dos itens pelo GEO já foi encerrada.', 409);
      }
      const itemTipo = String(req.params.tipo || '').toUpperCase();
      const itemId = Number(req.params.itemId);
      if (!Number.isInteger(itemId) || itemId <= 0) rejeitar('Item inválido.');
      const Model = itemTipo === 'MANUAL' ? SolicitacaoCompraItemManual
        : itemTipo === 'CADASTRADO' ? SolicitacaoCompraItem : null;
      if (!Model) rejeitar('Tipo de item inválido.');
      const decisao = String(req.body?.decisao || '').toUpperCase();
      if (!['APROVADO', 'REJEITADO'].includes(decisao)) rejeitar('Decisão inválida.');
      const motivo = String(req.body?.motivo || '').trim();
      if (decisao === 'REJEITADO' && !motivo) rejeitar('Informe o motivo da rejeição.');
      const transaction = await Model.sequelize.transaction();
      let item;
      try {
        item = await Model.findOne({
          where: { id: itemId, solicitacao_compra_id: compra.id },
          transaction, lock: transaction.LOCK.UPDATE
        });
        if (!item) rejeitar('Item não encontrado nesta solicitação.', 404);
        if (item.status_aprovacao === decisao) {
          await transaction.commit();
          return res.json({ item_id: item.id, status_aprovacao: decisao, repetida: true });
        }
        const cotacaoVinculada = await SolicitacaoCompraFornecedorItem.findOne({
          where: itemTipo === 'MANUAL'
            ? { solicitacao_compra_item_manual_id: item.id }
            : { solicitacao_compra_item_id: item.id },
          transaction
        });
        if (cotacaoVinculada) rejeitar('O item já está em cotação e não pode ter a decisão alterada.', 409);
        await item.update({ status_aprovacao: decisao }, { transaction });
        await Historico.create({
          solicitacao_id: solicitacao.id,
          usuario_responsavel_id: req.user.id,
          setor: req.user.setor_id,
          acao: decisao === 'APROVADO' ? 'ITEM_COMPRA_APROVADO_GEO' : 'ITEM_COMPRA_REJEITADO_GEO',
          descricao: `Item ${itemTipo.toLowerCase()} #${item.id} ${decisao.toLowerCase()} pelo GEO${motivo ? `: ${motivo}` : ''}`,
          metadata: JSON.stringify({ solicitacao_compra_id: compra.id, item_tipo: itemTipo, item_id: item.id, motivo })
        }, { transaction });
        await transaction.commit();
      } catch (error) {
        if (!transaction.finished) await transaction.rollback();
        throw error;
      }
      await publishSolicitacaoRealtimeEvent({ action: 'PURCHASE_ITEM_DECIDED', solicitacao, actor: { id: req.user.id } });
      return res.json({ item_id: item.id, status_aprovacao: decisao });
    } catch (error) { return responderErro(res, error); }
  },

  async comentar(req, res) {
    try {
      const { solicitacao, compra } = await buscarContexto(req);
      const descricao = String(req.body?.descricao || '').trim();
      const escopo = String(req.body?.escopo || '').toUpperCase();
      const itemTipo = String(req.body?.item_tipo || '').toUpperCase();
      const referenciaId = Number(req.body?.referencia_id);
      if (!descricao || descricao.length > 5000) rejeitar('Informe um comentário de até 5.000 caracteres.');
      const referencia = await localizarReferencia(compra, escopo, referenciaId, itemTipo);
      if (escopo === 'ITEM_APROVADO' && referencia.item?.status_aprovacao !== 'APROVADO'
        && referencia.item?.status_aprovacao !== null) rejeitar('O item ainda não foi aprovado.');
      if (escopo === 'ENTREGA') {
        const recebida = await PedidoCompraItemRecebimento.count({ where: { pedido_compra_item_id: referenciaId } });
        if (!recebida) rejeitar('Este item ainda não possui entrega registrada.');
      }
      const idsMencionados = [...new Set((Array.isArray(req.body?.mencoes) ? req.body.mencoes : [])
        .map(Number).filter((id) => Number.isInteger(id) && id > 0 && id !== Number(req.user.id)))];
      const mencionados = idsMencionados.length ? await User.findAll({
        where: { id: { [Op.in]: idsMencionados }, ativo: true },
        attributes: ['id', 'nome']
      }) : [];
      const historico = await Historico.create({
        solicitacao_id: solicitacao.id,
        usuario_responsavel_id: req.user.id,
        setor: req.user.setor_id,
        acao: 'COMENTARIO_ETAPA_COMPRA',
        descricao,
        metadata: JSON.stringify({
          escopo, referencia_id: referenciaId, item_tipo: itemTipo || null,
          solicitacao_compra_id: compra.id,
          mencoes: mencionados.map((usuario) => ({ id: usuario.id, nome: usuario.nome }))
        })
      });
      try {
        await registrarAtencaoSolicitacao({
          solicitacao, atorId: req.user.id, tipo: 'COMENTARIO_ITEM',
          resumo: `Novo comentário em ${escopo === 'ENTREGA' ? 'item entregue' : escopo.toLowerCase().replace('_', ' ')}`,
          mencoes: mencionados.map((usuario) => usuario.id)
        });
      } catch (atencaoError) {
        console.error('Comentario do item salvo, mas destaque da solicitacao falhou:', atencaoError);
      }
      for (const usuario of mencionados) {
        await criarNotificacao({
          solicitacao_id: solicitacao.id,
          tipo: 'MENCAO_COMENTARIO',
          mensagem: `Você foi mencionado em um comentário de ${escopo.toLowerCase()} na solicitação ${solicitacao.codigo}.`,
          created_by: req.user.id,
          destinatarios: [usuario.id],
          usarDestinatariosInformados: true
        });
      }
      await publishSolicitacaoRealtimeEvent({ action: 'COMMENT_ADDED', solicitacao, actor: { id: req.user.id } });
      return res.status(201).json({ id: historico.id });
    } catch (error) { return responderErro(res, error); }
  },

  async receberItem(req, res) {
    try {
      const { solicitacao, compra } = await buscarContexto(req, { interagir: true });
      await exigirSetor(req, 'eh_setor_obra');
      const pedido = await PedidoCompra.findOne({ where: { id: req.params.pedidoId, solicitacao_compra_id: compra.id } });
      if (!pedido || String(pedido.status || '').toUpperCase() === 'CANCELADO') rejeitar('Pedido indisponível.', 404);
      const quantidade = Number(req.body?.quantidade);
      const chave = String(req.body?.idempotency_key || '').trim();
      const pedidoItemId = Number(req.params.itemId);
      if (!Number.isInteger(pedidoItemId) || pedidoItemId <= 0) rejeitar('Item do pedido inválido.');
      if (!Number.isFinite(quantidade) || quantidade <= 0) rejeitar('Quantidade inválida.');
      if (!/^[A-Za-z0-9_-]{8,120}$/.test(chave)) rejeitar('Chave de envio inválida.');
      const transaction = await PedidoCompraItem.sequelize.transaction();
      let recebimento;
      const responderRepetido = (linha) => {
        if (Number(linha.pedido_compra_item_id) !== pedidoItemId || Math.abs(Number(linha.quantidade) - quantidade) > 0.0001) {
          rejeitar('Esta chave de envio já foi usada para outra entrega.', 409);
        }
        return res.json({ ...linha.toJSON(), repetido: true });
      };
      try {
        const item = await PedidoCompraItem.findOne({
          where: { id: pedidoItemId, pedido_compra_id: pedido.id, removido: false },
          transaction, lock: transaction.LOCK.UPDATE
        });
        if (!item) rejeitar('Item não encontrado no pedido.', 404);
        const repetido = await PedidoCompraItemRecebimento.findOne({ where: { idempotency_key: chave }, transaction });
        if (repetido) {
          await transaction.commit();
          return responderRepetido(repetido);
        }
        const totalRecebido = Number(await PedidoCompraItemRecebimento.sum('quantidade', {
          where: { pedido_compra_item_id: item.id }, transaction
        }) || 0);
        const quantidadePedido = Number(item.quantidade_pedido || 0) - Number(item.quantidade_cancelada || 0);
        if (totalRecebido + quantidade > quantidadePedido + 0.0001) rejeitar('A entrega excede o saldo do item.', 409);
        recebimento = await PedidoCompraItemRecebimento.create({
          pedido_compra_item_id: item.id,
          quantidade,
          recebido_em: new Date(),
          usuario_id: req.user.id,
          observacao: String(req.body?.observacao || '').trim() || null,
          idempotency_key: chave
        }, { transaction });
        await Historico.create({
          solicitacao_id: solicitacao.id,
          usuario_responsavel_id: req.user.id,
          setor: req.user.setor_id,
          acao: 'ITEM_PEDIDO_RECEBIDO',
          descricao: `Recebidas ${quantidade} unidade(s) do item #${item.id} do pedido #${pedido.id}.`,
          metadata: JSON.stringify({ pedido_id: pedido.id, pedido_item_id: item.id, quantidade, recebimento_id: recebimento.id })
        }, { transaction });
        await transaction.commit();
      } catch (error) {
        if (!transaction.finished) await transaction.rollback();
        if (error.name === 'SequelizeUniqueConstraintError') {
          const repetido = await PedidoCompraItemRecebimento.findOne({ where: { idempotency_key: chave } });
          if (repetido) return responderRepetido(repetido);
        }
        throw error;
      }
      await publishSolicitacaoRealtimeEvent({ action: 'PURCHASE_ITEM_RECEIVED', solicitacao, actor: { id: req.user.id } });
      return res.status(201).json(recebimento);
    } catch (error) { return responderErro(res, error); }
  }
};
