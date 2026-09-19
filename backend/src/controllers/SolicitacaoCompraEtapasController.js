const { Op } = require('sequelize');
const {
  Historico,
  Insumo,
  FornecedorCompra,
  Obra,
  PedidoCompra,
  PedidoCompraItem,
  PedidoCompraItemRecebimento,
  SolicitacaoCompra,
  SolicitacaoCompraFornecedor,
  SolicitacaoCompraFornecedorItem,
  SolicitacaoCompraItem,
  SolicitacaoCompraItemApropriacao,
  SolicitacaoCompraItemManual,
  SolicitacaoCompraItemManualApropriacao,
  SolicitacaoCompraRespostaItem,
  Unidade,
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
const { obterChavesItensEmCotacao } = require('../services/compraItensCotacaoService');
const { resolverCondicaoPagamentoPedido } = require('../services/pedidoCompraDocumentoUtils');
const {
  listarLeiturasComentarios,
  marcarLeituraComentario
} = require('../services/solicitacaoCompraComentarioLeituraService');

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

function revisaoGeoPendente(compra) {
  return String(compra?.origem || '').toUpperCase() !== 'COMPRA_DIRETA'
    && ['PENDENTE', 'ENVIADO', 'INTEGRADO_SIENGE'].includes(String(compra?.status || '').toUpperCase());
}

function compraEncaminhada(compra) {
  const status = String(compra?.status || '').toUpperCase();
  return String(compra?.origem || '').toUpperCase() !== 'COMPRA_DIRETA'
    && (['LIBERADO_PARA_COMPRA', 'LIBERADO', 'COTACAO', 'COTACAO_ENVIADA',
      'EM_COTACAO', 'FECHAMENTO_PARCIAL', 'ENCERRADO', 'FINALIZADA'].includes(status)
      || status.startsWith('PEDIDO_'));
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
      const [itens, manuais, pedidos, historicos, cotacoesFornecedor, leiturasComentarios] = await Promise.all([
        SolicitacaoCompraItem.findAll({
          where: { solicitacao_compra_id: compra.id },
          include: [
            { model: Insumo, as: 'insumo', attributes: ['id', 'nome', 'codigo'] },
            { model: Unidade, as: 'unidade', attributes: ['id', 'sigla'] },
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
          include: [
            { model: PedidoCompraItem, as: 'itens', required: false, include: [{
              model: SolicitacaoCompraRespostaItem, as: 'respostaItem', attributes: ['id', 'observacao'],
              include: [{ model: SolicitacaoCompraFornecedor, as: 'cotacaoFornecedor', attributes: ['id', 'condicao_pagamento'] }]
            }] },
            { model: FornecedorCompra, as: 'fornecedor', attributes: ['id', 'nome', 'contato', 'email', 'whatsapp', 'parceiro_id'] },
            { model: Obra, as: 'obra', attributes: ['id', 'codigo', 'nome', 'cno', 'endereco_logradouro', 'endereco_numero', 'endereco_complemento', 'endereco_bairro', 'endereco_cep', 'endereco_uf'] }
          ],
          order: [['id', 'DESC']]
        }),
        Historico.findAll({
          where: {
            solicitacao_id: solicitacao.id,
            acao: { [Op.in]: ['COMENTARIO_ETAPA_COMPRA', 'ITEM_COMPRA_REJEITADO_GEO'] }
          },
          include: [{ model: User, as: 'usuario', attributes: ['id', 'nome'] }],
          order: [['id', 'ASC']]
        }),
        SolicitacaoCompraFornecedor.findAll({
          where: { solicitacao_compra_id: compra.id },
          attributes: ['id', 'status'],
          include: [{
            model: SolicitacaoCompraFornecedorItem,
            as: 'itensSelecionados',
            attributes: ['item_tipo', 'solicitacao_compra_item_id', 'solicitacao_compra_item_manual_id']
          }]
        }),
        listarLeiturasComentarios(solicitacao.id, req.user.id)
      ]);
      const chavesEmCotacao = obterChavesItensEmCotacao(cotacoesFornecedor, itens, manuais);
      const idsPedidoItens = pedidos.flatMap((pedido) => pedido.itens.map((item) => item.id));
      const idsCadastrados = itens.map((item) => item.id);
      const idsManuais = manuais.map((item) => item.id);
      const filtrosCotacao = [];
      if (idsCadastrados.length) filtrosCotacao.push({ solicitacao_compra_item_id: { [Op.in]: idsCadastrados } });
      if (idsManuais.length) filtrosCotacao.push({ solicitacao_compra_item_manual_id: { [Op.in]: idsManuais } });
      const itensCotados = filtrosCotacao.length
        ? await SolicitacaoCompraFornecedorItem.findAll({
          where: { [Op.or]: filtrosCotacao },
          attributes: ['solicitacao_compra_item_id', 'solicitacao_compra_item_manual_id']
        }) : [];
      const chavesEmCompra = new Set();
      for (const item of [...itensCotados, ...pedidos.flatMap((pedido) => pedido.itens)]) {
        if (item.solicitacao_compra_item_id) chavesEmCompra.add(`CADASTRADO:${item.solicitacao_compra_item_id}`);
        if (item.solicitacao_compra_item_manual_id) chavesEmCompra.add(`MANUAL:${item.solicitacao_compra_item_manual_id}`);
      }
      const revisaoPendente = revisaoGeoPendente(compra);
      const encaminhada = compraEncaminhada(compra);
      const itemComReaproveitamento = (item, tipo, nome) => {
        const vinculadoCompra = chavesEmCompra.has(`${tipo}:${item.id}`);
        const status = item.status_aprovacao;
        const rejeicaoImplicita = encaminhada && !vinculadoCompra
          && (status === null || status === 'PENDENTE');
        return {
          ...item.toJSON(), item_tipo: tipo, nome,
          em_cotacao: chavesEmCotacao.has(`${tipo}:${item.id}`),
          vinculado_compra: vinculadoCompra,
          rejeicao_implicita: rejeicaoImplicita,
          reaproveitavel: !vinculadoCompra && (status === 'REJEITADO' || rejeicaoImplicita)
        };
      };
      const recebimentos = idsPedidoItens.length
        ? await PedidoCompraItemRecebimento.findAll({
          where: { pedido_compra_item_id: { [Op.in]: idsPedidoItens } },
          order: [['id', 'ASC']]
        }) : [];
      const recebimentosPorItem = new Map();
      const entregasPorItem = await require('../services/pedidoEntregaService').resumirPedidos(pedidos, recebimentos);
      recebimentos.forEach((linha) => {
        const id = Number(linha.pedido_compra_item_id);
        recebimentosPorItem.set(id, [...(recebimentosPorItem.get(id) || []), linha.toJSON()]);
      });
      return res.json({
        solicitacao_id: solicitacao.id,
        solicitacao_compra_id: compra.id,
        obra_id: compra.obra_id,
        status_compra: compra.status,
        revisao_geo_pendente: revisaoPendente,
        itens: [
          ...itens.map((item) => itemComReaproveitamento(item, 'CADASTRADO', item.insumo?.nome || item.descricao || `Item ${item.id}`)),
          ...manuais.map((item) => itemComReaproveitamento(item, 'MANUAL', item.nome_manual || `Item ${item.id}`))
        ],
        pedidos: pedidos.map((pedido) => ({
          ...pedido.toJSON(),
          condicao_pagamento: resolverCondicaoPagamentoPedido(pedido),
          itens: pedido.itens.map((item) => {
            const { respostaItem, ...dadosItem } = item.toJSON();
            return { ...dadosItem, observacoes: item.observacoes || respostaItem?.observacao || null,
              entrega: entregasPorItem.get(Number(item.id)), recebimentos: recebimentosPorItem.get(Number(item.id)) || [] };
          })
        })),
        comentarios: historicos.map((linha) => {
          const metadata = parseMetadata(linha.metadata);
          const motivoRejeicao = linha.acao === 'ITEM_COMPRA_REJEITADO_GEO';
          return {
            id: linha.id,
            descricao: motivoRejeicao
              ? `Motivo da rejeição: ${metadata.motivo || linha.descricao || 'Não informado'}`
              : linha.descricao,
            usuario: linha.usuario,
            createdAt: linha.createdAt,
            ...metadata,
            ...(motivoRejeicao ? {
              escopo: 'ITEM',
              referencia_id: metadata.item_id,
              item_tipo: metadata.item_tipo,
              tipo_registro: 'MOTIVO_REJEICAO'
            } : {})
          };
        }),
        leituras_comentarios: leiturasComentarios
      });
    } catch (error) { return responderErro(res, error); }
  },

  async decidirItem(req, res) {
    try {
      const { solicitacao, compra } = await buscarContexto(req, { interagir: true });
      await exigirSetor(req, 'eh_setor_geo');
      if (!revisaoGeoPendente(compra)) {
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
        const compraAtual = await SolicitacaoCompra.findByPk(compra.id, { transaction, lock: transaction.LOCK.UPDATE });
        if (!revisaoGeoPendente(compraAtual)) rejeitar('A revisão dos itens pelo GEO já foi encerrada.', 409);
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

  async aprovarItensEmLote(req, res) {
    try {
      const { solicitacao, compra } = await buscarContexto(req, { interagir: true });
      await exigirSetor(req, 'eh_setor_geo');
      if (!revisaoGeoPendente(compra)) rejeitar('A revisão dos itens pelo GEO já foi encerrada.', 409);
      const itensRecebidos = req.body?.itens;
      if (!Array.isArray(itensRecebidos) || !itensRecebidos.length || itensRecebidos.length > 1000) {
        rejeitar('Selecione de 1 a 1.000 itens pendentes para aprovar.');
      }
      const chaves = new Set();
      const idsPorTipo = { CADASTRADO: [], MANUAL: [] };
      for (const entrada of itensRecebidos) {
        const tipo = String(entrada?.item_tipo || '').toUpperCase();
        const id = Number(entrada?.id);
        if (!Object.hasOwn(idsPorTipo, tipo) || !Number.isInteger(id) || id <= 0) {
          rejeitar('A seleção contém um item inválido.');
        }
        const chave = `${tipo}:${id}`;
        if (chaves.has(chave)) continue;
        chaves.add(chave);
        idsPorTipo[tipo].push(id);
      }
      const transaction = await SolicitacaoCompra.sequelize.transaction();
      const aprovados = [];
      let jaAprovados = 0;
      try {
        const compraAtual = await SolicitacaoCompra.findByPk(compra.id, { transaction, lock: transaction.LOCK.UPDATE });
        if (!revisaoGeoPendente(compraAtual)) rejeitar('A revisão dos itens pelo GEO já foi encerrada.', 409);
        for (const [tipo, Model] of [['CADASTRADO', SolicitacaoCompraItem], ['MANUAL', SolicitacaoCompraItemManual]]) {
          const ids = idsPorTipo[tipo];
          if (!ids.length) continue;
          const registros = await Model.findAll({
            where: { id: { [Op.in]: ids }, solicitacao_compra_id: compra.id },
            order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE
          });
          if (registros.length !== ids.length) rejeitar('Um item selecionado não pertence a esta solicitação.', 404);
          const alterar = [];
          for (const item of registros) {
            if (item.status_aprovacao === 'APROVADO') { jaAprovados += 1; continue; }
            if (item.status_aprovacao === 'REJEITADO') rejeitar('Um item selecionado já foi rejeitado. Revise a seleção.', 409);
            if (item.status_aprovacao !== null && item.status_aprovacao !== 'PENDENTE') {
              rejeitar('Um item selecionado possui uma decisão não reconhecida.', 409);
            }
            alterar.push(item.id);
          }
          if (!alterar.length) continue;
          const campoVinculo = tipo === 'MANUAL'
            ? 'solicitacao_compra_item_manual_id' : 'solicitacao_compra_item_id';
          const cotacaoVinculada = await SolicitacaoCompraFornecedorItem.findOne({
            where: { [campoVinculo]: { [Op.in]: alterar } }, transaction
          });
          if (cotacaoVinculada) rejeitar('Um item selecionado já está em cotação.', 409);
          await Model.update({ status_aprovacao: 'APROVADO' }, {
            where: { id: { [Op.in]: alterar }, solicitacao_compra_id: compra.id }, transaction
          });
          aprovados.push(...alterar.map((id) => ({ item_tipo: tipo, id })));
        }
        if (aprovados.length) {
          await Historico.create({
            solicitacao_id: solicitacao.id,
            usuario_responsavel_id: req.user.id,
            setor: req.user.setor_id || solicitacao.area_responsavel,
            acao: 'ITENS_COMPRA_APROVADOS_GEO',
            descricao: `${aprovados.length} item(ns) aprovado(s) em lote pelo GEO.`,
            metadata: JSON.stringify({ solicitacao_compra_id: compra.id, itens: aprovados })
          }, { transaction });
        }
        await transaction.commit();
      } catch (error) {
        if (!transaction.finished) await transaction.rollback();
        throw error;
      }
      if (aprovados.length) {
        void publishSolicitacaoRealtimeEvent({
          action: 'PURCHASE_ITEMS_DECIDED', solicitacao, actor: { id: req.user.id }
        }).catch((error) => console.error('Aprovação em lote salva, mas atualização em tempo real falhou:', error));
      }
      return res.json({ aprovados: aprovados.length, ja_aprovados: jaAprovados, itens: aprovados });
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

  async marcarLeituraComentario(req, res) {
    try {
      const { solicitacao } = await buscarContexto(req);
      const leitura = await marcarLeituraComentario({
        solicitacaoId: solicitacao.id,
        usuarioId: req.user.id,
        alvoChave: req.body?.alvo_chave,
        historicoId: req.body?.historico_id
      });
      return res.json(leitura);
    } catch (error) { return responderErro(res, error); }
  },

  receberItem: require('./PedidoEntregaController').receberItem
};
