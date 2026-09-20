const { PedidoCompra, SolicitacaoCompra, Solicitacao, User } = require('../models');
const { registrarAtencaoSolicitacao } = require('../services/solicitacaoAtencaoService');
const {
  adicionarRespostaAoPedido,
  atualizarPedidoItem,
  atualizarStatusPedido,
  atualizarStatusPedidosEmLote,
  anexarEspelhoFornecedorPedido,
  cancelarFluxoPedidoCompra,
  cancelarPedidoCompra,
  cancelarPedidoItens,
  criarPedidoParaFornecedor,
  delegarSolicitacaoCompra,
  listarAuditoriaItensPedido,
  listarPedidos,
  obterPedidoDetalhe,
  reabrirPedidoParaCotacao,
  registrarComentarioPedido,
  remanejarPedidoItem,
  removerPedidoItem
} = require('../services/pedidoCompraService');
const {
  atualizarFretePedido,
  cancelarFretePedido,
  listarFretesPendentesFinanceiro,
  registrarFretePedido
} = require('../services/pedidoCompraFreteService');
const {
  getUserObraScopeIds,
  canAccessSolicitacaoCompraByScope,
  canAnexarEspelhoComprasPedidos,
  canAlterarStatusComprasPedidos,
  canAuditComprasPedidos,
  canCancelarComprasPedidos,
  canCancelarFreteComprasPedidos,
  canEditarItensComprasPedidos,
  canManageComprasDelegacao,
  canManageComprasPedidos,
  canReabrirComprasPedidos,
  canRegistrarFreteComprasPedidos,
  canRemanejarComprasPedidos,
  canViewAllComprasScope,
  canViewComprasDelegacao,
  canViewComprasPedidos,
  canViewPedidoCompraFinanceiro,
  normalizeToken
} = require('../services/authorizationService');
const { renderPedidoCompraPdf } = require('../services/pedidoCompraPdf');
const { responderErroController } = require('../utils/controllerError');
const {
  generatePedidoCompraPdfBufferFromHtml,
  isPedidoCompraHtmlPdfAvailable
} = require('../services/pedidoCompraPdfPuppeteer');
const { canAccessSolicitacaoFile } = require('../services/fileAccessService');
const { listarUsuariosElegiveisDelegacaoCompras } = require('../services/comprasDelegacaoService');
const { publishComprasRealtimeEventSafe } = require('../services/comprasRealtimeService');

async function carregarUsuarioCompras(userId) {
  if (!userId) {
    return null;
  }

  return User.findByPk(userId, {
    attributes: ['id', 'nome', 'email', 'perfil', 'setor_id', 'pode_criar_solicitacao_compra']
  });
}

async function podeVisualizarPedidos(usuario) {
  return canViewComprasPedidos(usuario);
}

async function podeGerenciarPedidos(usuario) {
  return canManageComprasPedidos(usuario);
}

async function validarAcessoPedidos(req, res, options = {}) {
  const usuario = await carregarUsuarioCompras(req.user?.id);
  if (!usuario) {
    res.status(401).json({ error: 'Usuario nao autenticado' });
    return null;
  }

  const exigeGestao = options.gerenciar === true;
  const exigeAuditoria = options.auditoria === true;
  const exigeAnexarEspelho = options.anexarEspelho === true;
  let permitido = await podeVisualizarPedidos(usuario);
  if (exigeAuditoria) {
    permitido = await canAuditComprasPedidos(usuario);
  } else if (exigeAnexarEspelho) {
    permitido = await canAnexarEspelhoComprasPedidos(usuario);
  } else if (exigeGestao) {
    permitido = await podeGerenciarPedidos(usuario);
  }

  if (!permitido) {
    res.status(403).json({
      error: exigeAuditoria
        ? 'Acesso negado a auditoria dos pedidos de compra'
        : (exigeAnexarEspelho
          ? 'Acesso negado para anexar o espelho do pedido de compra'
        : (exigeGestao
          ? 'Apenas compras pode gerenciar pedidos de compra'
          : 'Acesso negado aos pedidos de compra'))
    });
    return null;
  }

  return usuario;
}

async function validarAcessoDelegacao(req, res) {
  const usuario = await carregarUsuarioCompras(req.user?.id);
  if (!usuario) {
    res.status(401).json({ error: 'Usuario nao autenticado' });
    return null;
  }

  if (!(await canViewComprasDelegacao(usuario))) {
    res.status(403).json({ error: 'Acesso negado para delegacao de compras' });
    return null;
  }

  return usuario;
}

async function buildHistoricoPrecoScope(req) {
  const obraIds = await getUserObraScopeIds(req.user);

  if (Array.isArray(obraIds) && obraIds.length === 0 && req.pedidoCompraResource?.obra_id) {
    return [Number(req.pedidoCompraResource.obra_id)];
  }

  return obraIds;
}

async function validarEscopoPedidoCompra(usuario, pedido, res) {
  if (
    await canViewPedidoCompraFinanceiro(usuario)
    || await canAccessSolicitacaoCompraByScope(usuario, pedido?.solicitacao)
  ) {
    return true;
  }

  res.status(403).json({ error: 'Acesso negado a este pedido de compra' });
  return false;
}

async function carregarPedidoCompraNoEscopo(req, res, usuario, pedidoId) {
  const recurso = req.pedidoCompraResource;
  let pedido;
  if (recurso && Number(recurso.id) === Number(pedidoId)) {
    const solicitacao = await SolicitacaoCompra.findByPk(recurso.solicitacao_compra_id, {
      attributes: ['id', 'comprador_responsavel_id', 'solicitante_id']
    });
    const recursoData = typeof recurso.toJSON === 'function' ? recurso.toJSON() : recurso;
    pedido = solicitacao ? { ...recursoData, solicitacao } : null;
  } else {
    pedido = await PedidoCompra.findByPk(pedidoId, {
      attributes: ['id', 'solicitacao_compra_id', 'obra_id'],
      include: [{
        model: SolicitacaoCompra,
        as: 'solicitacao',
        attributes: ['id', 'comprador_responsavel_id', 'solicitante_id']
      }]
    });
  }

  if (!pedido) {
    res.status(404).json({ error: 'Pedido de compra nao encontrado' });
    return null;
  }

  if (!(await validarEscopoPedidoCompra(usuario, pedido, res))) {
    return null;
  }

  return pedido;
}

async function enviarPdfPedidoCompra(res, pedido) {
  const filename = `pedido-compra-PC-${String(pedido.id).padStart(5, '0')}.pdf`;

  if (isPedidoCompraHtmlPdfAvailable()) {
    try {
      const pdfBuffer = await generatePedidoCompraPdfBufferFromHtml(pedido, {
        generatedAt: pedido.createdAt ? new Date(pedido.createdAt) : new Date()
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.end(pdfBuffer);
    } catch (error) {
      console.warn('[PedidoCompraController.pdf] Falha ao gerar PDF HTML. Aplicando fallback para pdfkit.');
      console.warn(error);
    }
  }

  let PDFDocument;
  try {
    PDFDocument = require('pdfkit');
  } catch (error) {
    return res.status(500).json({ error: 'Dependencias de PDF indisponiveis no backend' });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
  doc.pipe(res);
  await renderPedidoCompraPdf(doc, pedido);
  doc.end();
  return null;
}

module.exports = {
  async index(req, res) {
    try {
      const usuario = await validarAcessoPedidos(req, res);
      if (!usuario) {
        return;
      }

      const podeVerEscopoCompleto = (
        await canViewAllComprasScope(usuario)
        || await canViewPedidoCompraFinanceiro(usuario)
      );
      const pedidos = await listarPedidos({
        solicitacaoId: req.query?.solicitacao_id,
        obraId: req.query?.obra_id,
        status: req.query?.status,
        q: req.query?.q,
        visao: req.query?.visao,
        statusFinanceiro: req.query?.status_financeiro,
        obraIds: req.compraScopeObraIds,
        compradorResponsavelId: podeVerEscopoCompleto ? null : usuario.id,
        solicitanteId: podeVerEscopoCompleto ? null : usuario.id
      });

      return res.json(pedidos);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao listar pedidos de compra' });
    }
  },

  async auditoria(req, res) {
    try {
      const usuario = await validarAcessoPedidos(req, res, { auditoria: true });
      if (!usuario) {
        return;
      }

      const auditoria = await listarAuditoriaItensPedido({
        obraId: req.query?.obra_id,
        pedidoId: req.query?.pedido_id,
        itemId: req.query?.item_id,
        acao: req.query?.acao,
        q: req.query?.q,
        obraIds: req.compraScopeObraIds
      });

      return res.json(auditoria);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar auditoria dos itens do pedido' });
    }
  },

  async show(req, res) {
    try {
      const usuario = await validarAcessoPedidos(req, res);
      if (!usuario) {
        return;
      }

      const pedido = await obterPedidoDetalhe(req.params.id, {
        obraIdsHistoricoPreco: await buildHistoricoPrecoScope(req)
      });
      if (!pedido) {
        return res.status(404).json({ error: 'Pedido de compra nao encontrado' });
      }

      if (!(await validarEscopoPedidoCompra(usuario, pedido, res))) {
        return;
      }

      return res.json(pedido);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar pedido de compra' });
    }
  },

  async createFromSolicitacao(req, res) {
    const transaction = await PedidoCompra.sequelize.transaction();

    try {
      const usuario = await validarAcessoPedidos(req, res, { gerenciar: true });
      if (!usuario) {
        await transaction.rollback();
        return;
      }

      const solicitacaoCompra = req.solicitacaoCompraResource || await SolicitacaoCompra.findByPk(req.params.id, {
        transaction
      });

      if (!(await canAccessSolicitacaoCompraByScope(usuario, solicitacaoCompra))) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Acesso negado a esta solicitacao de compra' });
      }

      if (normalizeToken(solicitacaoCompra?.status) !== 'ENCERRADO') {
        await transaction.rollback();
        return res.status(400).json({
          error: 'A solicitacao precisa estar encerrada para gerar pedido adicional.'
        });
      }

      const pedido = await criarPedidoParaFornecedor({
        solicitacaoId: req.params.id,
        fornecedorCompraId: req.body?.fornecedor_compra_id,
        usuarioId: usuario.id,
        transaction
      });

      await transaction.commit();
      return res.status(201).json(pedido);
    } catch (error) {
      await transaction.rollback();
      console.error(error);
      return responderErroController(res, error, 'Erro ao criar pedido de compra', { status: 400 });
    }
  },

  async addItem(req, res) {
    const transaction = await PedidoCompra.sequelize.transaction();

    try {
      const usuario = await validarAcessoPedidos(req, res, { gerenciar: true });
      if (!usuario) {
        await transaction.rollback();
        return;
      }

      if (!(await canEditarItensComprasPedidos(usuario))) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Acesso negado para adicionar itens ao pedido de compra' });
      }

      if (!(await carregarPedidoCompraNoEscopo(req, res, usuario, req.params.id))) {
        await transaction.rollback();
        return;
      }

      await adicionarRespostaAoPedido({
        pedidoId: req.params.id,
        respostaItemId: req.body?.resposta_item_id,
        usuarioId: usuario.id,
        transaction
      });

      await transaction.commit();
      void publishComprasRealtimeEventSafe({
        action: 'PEDIDO_ITEM_ADICIONADO',
        pedidoId: req.params.id,
        actor: usuario
      });
      const pedido = await obterPedidoDetalhe(req.params.id, {
        obraIdsHistoricoPreco: await buildHistoricoPrecoScope(req)
      });
      return res.status(201).json(pedido);
    } catch (error) {
      await transaction.rollback();
      console.error(error);
      return responderErroController(res, error, 'Erro ao adicionar item ao pedido', { status: 400 });
    }
  },

  async updateStatus(req, res) {
    const transaction = await PedidoCompra.sequelize.transaction();

    try {
      const usuario = await validarAcessoPedidos(req, res, { gerenciar: true });
      if (!usuario) {
        await transaction.rollback();
        return;
      }

      if (!(await canAlterarStatusComprasPedidos(usuario))) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Acesso negado para alterar status de pedidos de compra' });
      }

      if (!(await carregarPedidoCompraNoEscopo(req, res, usuario, req.params.id))) {
        await transaction.rollback();
        return;
      }

      await atualizarStatusPedido({
        pedidoId: req.params.id,
        status: req.body?.status,
        usuarioId: usuario.id,
        transaction
      });

      await transaction.commit();
      void publishComprasRealtimeEventSafe({
        action: 'PEDIDO_STATUS_ATUALIZADO',
        pedidoId: req.params.id,
        actor: usuario
      });
      const pedido = await obterPedidoDetalhe(req.params.id, {
        obraIdsHistoricoPreco: await buildHistoricoPrecoScope(req)
      });
      return res.json(pedido);
    } catch (error) {
      await transaction.rollback();
      console.error(error);
      return responderErroController(res, error, 'Erro ao atualizar status do pedido', { status: 400 });
    }
  },

  async reabrirCotacao(req, res) {
    const transaction = await PedidoCompra.sequelize.transaction();

    try {
      const usuario = await validarAcessoPedidos(req, res, { gerenciar: true });
      if (!usuario) {
        await transaction.rollback();
        return;
      }

      if (!(await canReabrirComprasPedidos(usuario))) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Acesso negado para reabrir pedido de compra' });
      }

      if (!(await carregarPedidoCompraNoEscopo(req, res, usuario, req.params.id))) {
        await transaction.rollback();
        return;
      }

      await reabrirPedidoParaCotacao({
        pedidoId: req.params.id,
        usuarioId: usuario.id,
        motivo: req.body?.motivo,
        transaction
      });

      await transaction.commit();
      void publishComprasRealtimeEventSafe({
        action: 'PEDIDO_REABERTO',
        pedidoId: req.params.id,
        actor: usuario
      });
      const pedido = await obterPedidoDetalhe(req.params.id, {
        obraIdsHistoricoPreco: await buildHistoricoPrecoScope(req)
      });
      return res.json(pedido);
    } catch (error) {
      await transaction.rollback();
      console.error(error);
      return responderErroController(res, error, 'Erro ao reabrir pedido para cotacao', { status: 400 });
    }
  },

  async updateStatusBatch(req, res) {
    const transaction = await PedidoCompra.sequelize.transaction();

    try {
      const usuario = await validarAcessoPedidos(req, res, { gerenciar: true });
      if (!usuario) {
        await transaction.rollback();
        return;
      }

      if (!(await canAlterarStatusComprasPedidos(usuario))) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Acesso negado para alterar status de pedidos de compra' });
      }

      const ids = Array.isArray(req.body?.pedido_ids) ? req.body.pedido_ids : [];
      if (!(await canViewAllComprasScope(usuario))) {
        const pedidosPermitidos = await listarPedidos({
          compradorResponsavelId: usuario.id,
          solicitanteId: usuario.id
        });
        const idsPermitidos = new Set(pedidosPermitidos.map((pedido) => Number(pedido.id)));
        const foraDoEscopo = ids.some((id) => !idsPermitidos.has(Number(id)));
        if (foraDoEscopo) {
          await transaction.rollback();
          return res.status(403).json({ error: 'Acesso negado a um ou mais pedidos selecionados' });
        }
      }

      await atualizarStatusPedidosEmLote({
        pedidoIds: ids,
        status: req.body?.status,
        usuarioId: usuario.id,
        transaction
      });

      await transaction.commit();
      return res.json({ ok: true, atualizados: ids.length });
    } catch (error) {
      await transaction.rollback();
      console.error(error);
      return responderErroController(res, error, 'Erro ao atualizar pedidos em lote', { status: 400 });
    }
  },

  async updateItem(req, res) {
    const transaction = await PedidoCompra.sequelize.transaction();

    try {
      const usuario = await validarAcessoPedidos(req, res, { gerenciar: true });
      if (!usuario) {
        await transaction.rollback();
        return;
      }

      if (!(await canEditarItensComprasPedidos(usuario))) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Acesso negado para editar itens do pedido de compra' });
      }

      if (!(await carregarPedidoCompraNoEscopo(req, res, usuario, req.params.id))) {
        await transaction.rollback();
        return;
      }

      await atualizarPedidoItem({
        pedidoId: req.params.id,
        itemId: req.params.itemId,
        payload: req.body || {},
        usuarioId: usuario.id,
        transaction
      });

      await transaction.commit();
      void publishComprasRealtimeEventSafe({
        action: 'PEDIDO_ITEM_ATUALIZADO',
        pedidoId: req.params.id,
        actor: usuario
      });
      const pedido = await obterPedidoDetalhe(req.params.id, {
        obraIdsHistoricoPreco: await buildHistoricoPrecoScope(req)
      });
      return res.json(pedido);
    } catch (error) {
      await transaction.rollback();
      console.error(error);
      return responderErroController(res, error, 'Erro ao atualizar item do pedido', { status: 400 });
    }
  },

  async removeItem(req, res) {
    const transaction = await PedidoCompra.sequelize.transaction();

    try {
      const usuario = await validarAcessoPedidos(req, res, { gerenciar: true });
      if (!usuario) {
        await transaction.rollback();
        return;
      }

      if (!(await canEditarItensComprasPedidos(usuario))) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Acesso negado para remover itens do pedido de compra' });
      }

      if (!(await carregarPedidoCompraNoEscopo(req, res, usuario, req.params.id))) {
        await transaction.rollback();
        return;
      }

      await removerPedidoItem({
        pedidoId: req.params.id,
        itemId: req.params.itemId,
        usuarioId: usuario.id,
        transaction
      });

      await transaction.commit();
      void publishComprasRealtimeEventSafe({
        action: 'PEDIDO_ITEM_REMOVIDO',
        pedidoId: req.params.id,
        actor: usuario
      });
      const pedido = await obterPedidoDetalhe(req.params.id, {
        obraIdsHistoricoPreco: await buildHistoricoPrecoScope(req)
      });
      return res.json(pedido);
    } catch (error) {
      await transaction.rollback();
      console.error(error);
      return responderErroController(res, error, 'Erro ao remover item do pedido', { status: 400 });
    }
  },

  async cancel(req, res) {
    const transaction = await PedidoCompra.sequelize.transaction();

    try {
      const usuario = await validarAcessoPedidos(req, res, { gerenciar: true });
      if (!usuario) {
        await transaction.rollback();
        return;
      }

      if (!(await canCancelarComprasPedidos(usuario))) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Acesso negado para cancelar pedido de compra' });
      }

      if (!(await carregarPedidoCompraNoEscopo(req, res, usuario, req.params.id))) {
        await transaction.rollback();
        return;
      }

      const cancelarFluxo = Boolean(
        req.body?.cancelar_cotacao ||
        req.body?.cancelar_solicitacao_compra ||
        req.body?.cancelar_solicitacao_principal
      );

      await (cancelarFluxo ? cancelarFluxoPedidoCompra : cancelarPedidoCompra)({
        pedidoId: req.params.id,
        motivo: req.body?.motivo,
        usuarioId: usuario.id,
        cancelarCotacao: req.body?.cancelar_cotacao,
        cancelarSolicitacaoCompra: req.body?.cancelar_solicitacao_compra,
        cancelarSolicitacaoPrincipal: req.body?.cancelar_solicitacao_principal,
        transaction
      });

      await transaction.commit();
      void publishComprasRealtimeEventSafe({
        action: 'PEDIDO_CANCELADO',
        pedidoId: req.params.id,
        actor: usuario
      });
      const pedido = await obterPedidoDetalhe(req.params.id, {
        obraIdsHistoricoPreco: await buildHistoricoPrecoScope(req)
      });
      return res.json(pedido);
    } catch (error) {
      await transaction.rollback();
      console.error(error);
      return responderErroController(res, error, 'Erro ao cancelar pedido de compra', { status: 400 });
    }
  },

  async cancelItems(req, res) {
    const transaction = await PedidoCompra.sequelize.transaction();

    try {
      const usuario = await validarAcessoPedidos(req, res, { gerenciar: true });
      if (!usuario) {
        await transaction.rollback();
        return;
      }

      if (!(await canCancelarComprasPedidos(usuario))) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Acesso negado para cancelar itens do pedido de compra' });
      }

      if (!(await carregarPedidoCompraNoEscopo(req, res, usuario, req.params.id))) {
        await transaction.rollback();
        return;
      }

      await cancelarPedidoItens({
        pedidoId: req.params.id,
        itens: req.body?.itens || req.body?.item_ids,
        motivo: req.body?.motivo,
        usuarioId: usuario.id,
        transaction
      });

      await transaction.commit();
      const pedido = await obterPedidoDetalhe(req.params.id, {
        obraIdsHistoricoPreco: await buildHistoricoPrecoScope(req)
      });
      return res.json(pedido);
    } catch (error) {
      await transaction.rollback();
      console.error(error);
      return responderErroController(res, error, 'Erro ao cancelar itens do pedido', { status: 400 });
    }
  },

  async remanejarItem(req, res) {
    const transaction = await PedidoCompra.sequelize.transaction();

    try {
      const usuario = await validarAcessoPedidos(req, res, { gerenciar: true });
      if (!usuario) {
        await transaction.rollback();
        return;
      }

      if (!(await canRemanejarComprasPedidos(usuario))) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Acesso negado para remanejar itens do pedido de compra' });
      }

      if (!(await carregarPedidoCompraNoEscopo(req, res, usuario, req.params.id))) {
        await transaction.rollback();
        return;
      }

      await remanejarPedidoItem({
        pedidoId: req.params.id,
        itemId: req.params.itemId,
        respostaItemIdDestino: req.body?.resposta_item_id_destino,
        quantidade: req.body?.quantidade,
        motivo: req.body?.motivo,
        usuarioId: usuario.id,
        transaction
      });

      await transaction.commit();
      void publishComprasRealtimeEventSafe({
        action: 'PEDIDO_ITEM_REMANEJADO',
        pedidoId: req.params.id,
        actor: usuario
      });
      const pedido = await obterPedidoDetalhe(req.params.id, {
        obraIdsHistoricoPreco: await buildHistoricoPrecoScope(req)
      });
      return res.json(pedido);
    } catch (error) {
      await transaction.rollback();
      console.error(error);
      return responderErroController(res, error, 'Erro ao remanejar item do pedido', { status: 400 });
    }
  },

  async comentar(req, res) {
    const transaction = await PedidoCompra.sequelize.transaction();

    try {
      const usuario = await validarAcessoPedidos(req, res, { gerenciar: true });
      if (!usuario) {
        await transaction.rollback();
        return;
      }

      if (!(await canRegistrarFreteComprasPedidos(usuario))) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Acesso negado para registrar frete do pedido' });
      }

      if (!(await carregarPedidoCompraNoEscopo(req, res, usuario, req.params.id))) {
        await transaction.rollback();
        return;
      }

      await registrarComentarioPedido({
        pedidoId: req.params.id,
        comentario: req.body?.comentario,
        usuarioId: usuario.id,
        transaction
      });

      await transaction.commit();
      try {
        const pedido = await PedidoCompra.findByPk(req.params.id);
        const compra = pedido && await SolicitacaoCompra.findByPk(pedido.solicitacao_compra_id);
        const principal = compra?.solicitacao_principal_id
          ? await Solicitacao.findByPk(compra.solicitacao_principal_id) : null;
        if (principal) await registrarAtencaoSolicitacao({
          solicitacao: principal,
          atorId: usuario.id,
          tipo: 'COMENTARIO_PEDIDO',
          resumo: `${usuario.nome || 'Usuário'} comentou no pedido #${pedido.id}`
        });
      } catch (atencaoError) {
        console.error('Comentario do pedido salvo, mas destaque da solicitacao falhou:', atencaoError);
      }
      return res.json({ ok: true });
    } catch (error) {
      if (!transaction.finished) await transaction.rollback();
      console.error(error);
      return responderErroController(res, error, 'Erro ao comentar pedido', { status: 400 });
    }
  },

  async anexarEspelho(req, res) {
    const transaction = await PedidoCompra.sequelize.transaction();

    try {
      const usuario = await validarAcessoPedidos(req, res, { anexarEspelho: true });
      if (!usuario) {
        await transaction.rollback();
        return;
      }

      if (!(await carregarPedidoCompraNoEscopo(req, res, usuario, req.params.id))) {
        await transaction.rollback();
        return;
      }

      await anexarEspelhoFornecedorPedido({
        pedidoId: req.params.id,
        arquivoUrl: req.body?.arquivo_url,
        arquivoNome: req.body?.arquivo_nome_original || req.body?.arquivo_nome,
        usuarioId: usuario.id,
        transaction
      });

      await transaction.commit();
      const pedido = await obterPedidoDetalhe(req.params.id, {
        obraIdsHistoricoPreco: await buildHistoricoPrecoScope(req)
      });
      return res.json(pedido);
    } catch (error) {
      await transaction.rollback();
      console.error(error);
      return responderErroController(res, error, 'Erro ao anexar espelho do fornecedor', { status: 400 });
    }
  },

  async registrarFrete(req, res) {
    const transaction = await PedidoCompra.sequelize.transaction();

    try {
      const usuario = await validarAcessoPedidos(req, res, { gerenciar: true });
      if (!usuario) {
        await transaction.rollback();
        return;
      }

      if (!(await canRegistrarFreteComprasPedidos(usuario))) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Acesso negado para registrar frete do pedido' });
      }

      if (!(await carregarPedidoCompraNoEscopo(req, res, usuario, req.params.id))) {
        await transaction.rollback();
        return;
      }

      await registrarFretePedido({
        pedidoId: req.params.id,
        payload: req.body || {},
        usuarioId: usuario.id,
        idempotencyKey: req.get('Idempotency-Key'),
        transaction
      });

      await transaction.commit();
      const pedido = await obterPedidoDetalhe(req.params.id, {
        obraIdsHistoricoPreco: await buildHistoricoPrecoScope(req)
      });
      return res.status(201).json(pedido);
    } catch (error) {
      await transaction.rollback();
      console.error(error);
      return responderErroController(res, error, 'Erro ao registrar frete do pedido', { status: 400 });
    }
  },

  async atualizarFrete(req, res) {
    const transaction = await PedidoCompra.sequelize.transaction();

    try {
      const usuario = await validarAcessoPedidos(req, res, { gerenciar: true });
      if (!usuario) {
        await transaction.rollback();
        return;
      }

      if (!(await carregarPedidoCompraNoEscopo(req, res, usuario, req.params.id))) {
        await transaction.rollback();
        return;
      }

      await atualizarFretePedido({
        pedidoId: req.params.id,
        freteId: req.params.freteId,
        payload: req.body || {},
        usuarioId: usuario.id,
        transaction
      });

      await transaction.commit();
      const pedido = await obterPedidoDetalhe(req.params.id, {
        obraIdsHistoricoPreco: await buildHistoricoPrecoScope(req)
      });
      return res.json(pedido);
    } catch (error) {
      await transaction.rollback();
      console.error(error);
      return responderErroController(res, error, 'Erro ao atualizar frete do pedido', { status: 400 });
    }
  },

  async cancelarFrete(req, res) {
    const transaction = await PedidoCompra.sequelize.transaction();

    try {
      const usuario = await validarAcessoPedidos(req, res, { gerenciar: true });
      if (!usuario) {
        await transaction.rollback();
        return;
      }

      if (!(await carregarPedidoCompraNoEscopo(req, res, usuario, req.params.id))) {
        await transaction.rollback();
        return;
      }

      await cancelarFretePedido({
        pedidoId: req.params.id,
        freteId: req.params.freteId,
        motivo: req.body?.motivo,
        usuarioId: usuario.id,
        transaction
      });

      await transaction.commit();
      const pedido = await obterPedidoDetalhe(req.params.id, {
        obraIdsHistoricoPreco: await buildHistoricoPrecoScope(req)
      });
      return res.json(pedido);
    } catch (error) {
      await transaction.rollback();
      console.error(error);
      return responderErroController(res, error, 'Erro ao cancelar frete do pedido', { status: 400 });
    }
  },

  async fretesPendentesFinanceiro(req, res) {
    try {
      const fretes = await listarFretesPendentesFinanceiro({
        limit: req.query?.limit
      });
      return res.json(fretes);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao listar fretes pendentes do financeiro');
    }
  },

  async usuariosDelegacao(req, res) {
    try {
      const usuario = await validarAcessoDelegacao(req, res);
      if (!usuario) return;

      if (!(await canManageComprasDelegacao(usuario))) {
        return res.status(403).json({ error: 'Sem permissao para alterar a delegacao de compras.' });
      }

      const usuarios = await listarUsuariosElegiveisDelegacaoCompras();
      return res.json(usuarios);
    } catch (error) {
      console.error(error);
      return responderErroController(res, error, 'Erro ao listar usuarios para delegacao de compras');
    }
  },

  async delegarSolicitacao(req, res) {
    const transaction = await PedidoCompra.sequelize.transaction();

    try {
      const usuario = await validarAcessoDelegacao(req, res);
      if (!usuario) {
        await transaction.rollback();
        return;
      }

      const podeGerenciar = await canManageComprasDelegacao(usuario);
      const solicitacao = await SolicitacaoCompra.findByPk(req.params.id, { transaction });
      if (!solicitacao) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Solicitacao de compra nao encontrada' });
      }

      if (!podeGerenciar) {
        const responsavelAtual = solicitacao.comprador_responsavel_id
          ? Number(solicitacao.comprador_responsavel_id)
          : null;
        if (responsavelAtual !== Number(usuario.id)) {
          await transaction.rollback();
          return res.status(403).json({ error: 'Voce so pode informar motivo em solicitacoes atribuidas a voce.' });
        }
        if (req.body?.responsavel_id !== undefined || req.body?.prazo_compra !== undefined) {
          await transaction.rollback();
          return res.status(403).json({ error: 'Sem permissao para alterar responsavel ou prazo da delegacao.' });
        }
      }

      await delegarSolicitacaoCompra({
        solicitacaoId: req.params.id,
        responsavelId: req.body?.responsavel_id,
        prazoCompra: req.body?.prazo_compra,
        motivoAtraso: req.body?.motivo_atraso,
        motivoDelegacaoVencida: req.body?.motivo_delegacao_vencida,
        usuarioId: usuario.id,
        somenteMotivo: !podeGerenciar,
        transaction
      });

      await transaction.commit();
      void publishComprasRealtimeEventSafe({
        action: 'DELEGACAO_ATUALIZADA',
        solicitacaoCompraId: req.params.id,
        actor: usuario,
        extraUserIds: [req.body?.responsavel_id]
      });
      return res.json({ ok: true });
    } catch (error) {
      await transaction.rollback();
      console.error(error);
      return responderErroController(res, error, 'Erro ao delegar solicitacao de compra', { status: 400 });
    }
  },

  async pdf(req, res) {
    try {
      const usuario = await validarAcessoPedidos(req, res);
      if (!usuario) {
        return;
      }

      const pedido = await obterPedidoDetalhe(req.params.id, {
        obraIdsHistoricoPreco: await buildHistoricoPrecoScope(req)
      });
      if (!pedido) {
        return res.status(404).json({ error: 'Pedido de compra nao encontrado' });
      }

      if (!(await validarEscopoPedidoCompra(usuario, pedido, res))) {
        return;
      }

      return enviarPdfPedidoCompra(res, pedido);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao gerar PDF do pedido' });
    }
  },

  async pdfPorSolicitacao(req, res) {
    try {
      const solicitacaoId = Number(req.params.id);
      const pedidoId = Number(req.params.pedidoId);
      const acesso = await canAccessSolicitacaoFile(req, solicitacaoId);

      if (!acesso?.allowed) {
        return res.status(acesso?.status || 403).json({
          error: acesso?.error || 'Acesso negado ao arquivo da solicitacao'
        });
      }

      const pedido = await obterPedidoDetalhe(pedidoId, {
        obraIdsHistoricoPreco: await buildHistoricoPrecoScope(req)
      });
      if (!pedido) {
        return res.status(404).json({ error: 'Pedido de compra nao encontrado' });
      }

      const solicitacaoCompra = await SolicitacaoCompra.findByPk(pedido.solicitacao_compra_id, {
        attributes: ['id', 'solicitacao_principal_id']
      });

      if (Number(solicitacaoCompra?.solicitacao_principal_id || 0) !== solicitacaoId) {
        return res.status(403).json({ error: 'Pedido de compra nao pertence a solicitacao informada' });
      }

      return enviarPdfPedidoCompra(res, pedido);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao gerar PDF do pedido' });
    }
  }
};
