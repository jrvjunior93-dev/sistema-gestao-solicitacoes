const { Op, fn, col } = require('sequelize');
const {
  FornecedorCompra,
  Historico,
  Obra,
  Parceiro,
  PedidoCompra,
  PedidoCompraFrete,
  PedidoCompraFreteRateio,
  PedidoCompraItem,
  PedidoCompraItemRecebimento,
  PedidoCompraItemLog,
  PedidoCompraReabertura,
  PedidoCompraTitulo,
  Solicitacao,
  SolicitacaoCompra,
  SolicitacaoCompraAlocacao,
  SolicitacaoCompraFechamento,
  SolicitacaoCompraFornecedor,
  Insumo,
  SolicitacaoCompraItem,
  SolicitacaoCompraItemManual,
  SolicitacaoCompraRespostaItem,
  TituloFinanceiro,
  Unidade,
  User
} = require('../models');
const {
  isSolicitacaoCompraCancelada,
  normalizeText: normalizeCotacaoText,
  obterQuantidadeBaseFinanceiraCotacao,
  registrarLogSolicitacaoCompra
} = require('./comprasCotacao');
const {
  findPedidoCompraStatusConfig,
  getPedidoCompraStatusConfig,
  isPedidoCompraStatusLocked,
  normalizeStatusCode
} = require('./pedidoCompraStatusConfig');
const {
  registrarFretePedido,
  sincronizarRateiosFretesPendentesPedido
} = require('./pedidoCompraFreteService');
const { validarResponsavelElegivelDelegacaoCompras } = require('./comprasDelegacaoService');
const {
  sincronizarTotaisFretePedido,
  sincronizarValoresSolicitacaoCompra
} = require('./pedidoCompraTotaisService');
const {
  buildCompraFornecedorItemKey,
  calcularDisponibilidadeFornecedorItem,
  isOfertaSaldo,
  montarMapaAlocacoesAtivasPorFornecedorItem,
  montarMapaAlocacoesAtivasPorResposta
} = require('./comprasDisponibilidadeService');

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function normalizeOptionalText(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function asNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value) {
  return Number(asNumber(value).toFixed(2));
}

function roundQty(value) {
  return Number(asNumber(value).toFixed(3));
}

function roundPedidoQty(value) {
  return Number(asNumber(value).toFixed(3));
}

function calcularRateiosMonetarios(valorTotal, bases = [], { limitarAoTotalBase = true } = {}) {
  const valoresBase = bases.map((base) => Math.max(0, roundMoney(base)));
  const totalBase = roundMoney(valoresBase.reduce((sum, base) => sum + base, 0));
  const valorNormalizado = Math.max(0, roundMoney(valorTotal));
  const totalRatear = limitarAoTotalBase
    ? Math.min(valorNormalizado, totalBase)
    : valorNormalizado;

  if (!valoresBase.length || totalRatear <= 0 || totalBase <= 0) {
    return valoresBase.map(() => 0);
  }

  let acumulado = 0;
  return valoresBase.map((base, index) => {
    if (index === valoresBase.length - 1) {
      return roundMoney(totalRatear - acumulado);
    }

    const parcela = roundMoney((base / totalBase) * totalRatear);
    acumulado = roundMoney(acumulado + parcela);
    return parcela;
  });
}

function safeJsonParse(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function buildRespostaKey(itemTipo, itemReferenciaId) {
  return `${normalizeText(itemTipo)}:${Number(itemReferenciaId)}`;
}

function buildPedidoCodigo(id) {
  return `PC-${String(id).padStart(5, '0')}`;
}

function isDateOnlyPast(value) {
  if (!value) return false;
  const text = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const today = new Date();
  const todayText = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0')
  ].join('-');
  return text < todayText;
}

async function registrarHistoricoPedidoNaSolicitacaoPrincipal({
  solicitacao,
  pedido,
  usuarioId = null,
  acao,
  descricao,
  statusAnterior = null,
  statusNovo = null,
  metadados = {},
  transaction
}) {
  const solicitacaoPrincipalId = Number(solicitacao?.solicitacao_principal_id || 0);
  if (!solicitacaoPrincipalId || !pedido?.id || !acao || !descricao) {
    return null;
  }

  return Historico.create(
    {
      solicitacao_id: solicitacaoPrincipalId,
      usuario_responsavel_id: usuarioId || null,
      setor: 'COMPRAS',
      acao,
      status_anterior: statusAnterior || null,
      status_novo: statusNovo || null,
      observacao: descricao,
      descricao,
      metadata: JSON.stringify({
        tipo: 'PEDIDO_COMPRA',
        pedido_compra_id: pedido.id,
        pedido_compra_codigo: buildPedidoCodigo(pedido.id),
        solicitacao_compra_id: solicitacao.id,
        fornecedor_compra_id: pedido.fornecedor_compra_id,
        ...metadados
      })
    },
    { transaction }
  );
}

async function registrarHistoricoCompraNaSolicitacaoPrincipal({
  solicitacao,
  usuarioId = null,
  acao,
  descricao,
  statusAnterior = null,
  statusNovo = null,
  metadados = {},
  transaction
}) {
  const solicitacaoPrincipalId = Number(solicitacao?.solicitacao_principal_id || 0);
  if (!solicitacaoPrincipalId || !acao || !descricao) {
    return null;
  }

  return Historico.create(
    {
      solicitacao_id: solicitacaoPrincipalId,
      usuario_responsavel_id: usuarioId || null,
      setor: 'COMPRAS',
      acao,
      status_anterior: statusAnterior || null,
      status_novo: statusNovo || null,
      observacao: descricao,
      descricao,
      metadata: JSON.stringify({
        tipo: 'SOLICITACAO_COMPRA',
        solicitacao_compra_id: solicitacao.id,
        ...metadados
      })
    },
    { transaction }
  );
}

function getRespostaItemReferencia(resposta) {
  return {
    itemTipo: normalizeText(resposta?.item_tipo),
    itemReferenciaId:
      Number(resposta?.solicitacao_compra_item_id || 0) ||
      Number(resposta?.solicitacao_compra_item_manual_id || 0)
  };
}

function buildItemKeyFromResposta(resposta) {
  const { itemTipo, itemReferenciaId } = getRespostaItemReferencia(resposta);
  return buildRespostaKey(itemTipo, itemReferenciaId);
}

function buildItemKeyFromPedidoItem(item) {
  const itemReferenciaId =
    Number(item?.solicitacao_compra_item_id || 0) ||
    Number(item?.solicitacao_compra_item_manual_id || 0);
  return buildRespostaKey(item?.item_tipo, itemReferenciaId);
}

function fornecedorRespondeuCotacao(vinculacaoFornecedor) {
  const status = normalizeText(vinculacaoFornecedor?.status);
  return Boolean(vinculacaoFornecedor?.respondido_em) ||
    ['RESPONDIDO', 'FINALIZADA'].includes(status);
}

function isSolicitacaoCompraEncerrada(solicitacao) {
  return normalizeText(solicitacao?.status) === 'ENCERRADO' || Boolean(solicitacao?.encerrado_em);
}

function getQuantidadeBaseItem(solicitacao, resposta) {
  const baseItem = obterBaseItemPorResposta(solicitacao, resposta);
  return baseItem ? roundQty(baseItem.quantidade_solicitada) : 0;
}

async function buscarUltimosPrecosPorInsumo(insumoIds, obraIdsEscopo = null, solicitacaoCompraIdIgnorar = null) {
  const ids = [...new Set(
    (Array.isArray(insumoIds) ? insumoIds : [])
      .map((item) => Number(item))
      .filter((item) => item > 0)
  )];

  if (!ids.length) {
    return new Map();
  }

  const whereCompra = { status: { [Op.in]: ['ENCERRADO', 'FECHAMENTO_PARCIAL'] } };
  if (Number(solicitacaoCompraIdIgnorar) > 0) {
    whereCompra.id = { [Op.ne]: Number(solicitacaoCompraIdIgnorar) };
  }

  if (Array.isArray(obraIdsEscopo)) {
    if (!obraIdsEscopo.length) {
      return new Map();
    }
    whereCompra.obra_id = { [Op.in]: obraIdsEscopo.map((item) => Number(item)).filter((item) => item > 0) };
  }

  const respostas = await SolicitacaoCompraRespostaItem.findAll({
    where: {
      vencedor: true,
      preco: { [Op.not]: null },
      deleted_at: null
    },
    include: [{
      model: SolicitacaoCompraItem,
      as: 'itemCadastrado',
      required: true,
      attributes: ['id', 'insumo_id'],
      where: {
        insumo_id: { [Op.in]: ids }
      },
      include: [{
        model: SolicitacaoCompra,
        as: 'solicitacao',
        required: true,
        where: whereCompra,
        attributes: ['id', 'updatedAt']
      }]
    }],
    order: [
      [{ model: SolicitacaoCompraItem, as: 'itemCadastrado' }, 'insumo_id', 'ASC'],
      [
        { model: SolicitacaoCompraItem, as: 'itemCadastrado' },
        { model: SolicitacaoCompra, as: 'solicitacao' },
        'updatedAt',
        'DESC'
      ]
    ]
  });

  const mapaPrecos = new Map();
  for (const resposta of respostas) {
    const insumoId = Number(resposta?.itemCadastrado?.insumo_id || 0);
    if (!insumoId || mapaPrecos.has(insumoId)) {
      continue;
    }

    mapaPrecos.set(insumoId, roundMoney(resposta.preco));

    if (mapaPrecos.size >= ids.length) {
      break;
    }
  }

  return mapaPrecos;
}

async function carregarSolicitacaoPedidos(id, transaction, { incluirPedidos = true } = {}) {
  const include = [
    {
      model: Obra,
      as: 'obra',
      attributes: [
        'id',
        'nome',
        'codigo',
        'cno',
        'cidade',
        'endereco_logradouro',
        'endereco_numero',
        'endereco_complemento',
        'endereco_bairro',
        'endereco_cep',
        'endereco_uf'
      ]
    },
    {
      model: SolicitacaoCompraItem,
      as: 'itens',
      include: [
        { model: Insumo, as: 'insumo', attributes: ['id', 'nome', 'codigo'] },
        { model: Unidade, as: 'unidade', attributes: ['id', 'sigla'] }
      ]
    },
    {
      model: SolicitacaoCompraItemManual,
      as: 'itensManuais'
    },
    {
      model: SolicitacaoCompraFornecedor,
      as: 'fornecedores',
      include: [
        {
          model: FornecedorCompra,
          as: 'fornecedor',
          attributes: ['id', 'nome', 'email', 'whatsapp', 'contato']
        },
        {
          model: SolicitacaoCompraRespostaItem,
          as: 'respostas',
          where: { deleted_at: null },
          required: false,
          attributes: [
            'id',
            'item_tipo',
            'solicitacao_compra_item_id',
            'solicitacao_compra_item_manual_id',
            'disponivel',
            'preco',
            'prazo',
            'observacao',
            'quantidade_minima_item',
            'quantidade_disponivel',
            'escopo_disponibilidade',
            'ipi_valor',
            'icms_valor',
            'st_valor',
            'vencedor'
          ]
        }
      ]
    },
    {
      model: SolicitacaoCompraAlocacao,
      as: 'alocacoes',
      required: false
    }
  ];

  if (incluirPedidos) {
    include.push({
      model: PedidoCompra,
      as: 'pedidos',
      include: [
        {
          model: PedidoCompraItem,
          as: 'itens'
        },
        {
          model: FornecedorCompra,
          as: 'fornecedor',
          attributes: ['id', 'nome', 'email', 'whatsapp']
        }
      ]
    });
  }

  return SolicitacaoCompra.findByPk(id, {
    transaction,
    include
  });
}

function obterBaseItemPorResposta(solicitacao, resposta) {
  const itemReferenciaId =
    Number(resposta?.solicitacao_compra_item_id || 0) ||
    Number(resposta?.solicitacao_compra_item_manual_id || 0);
  const itemTipo = normalizeText(resposta?.item_tipo);

  if (itemTipo === 'CADASTRADO') {
    const item = (solicitacao?.itens || []).find((entry) => Number(entry.id) === itemReferenciaId);
    if (!item) return null;
    return {
      item_tipo: 'CADASTRADO',
      solicitacao_compra_item_id: item.id,
      solicitacao_compra_item_manual_id: null,
      descricao: item.insumo?.nome || `Item ${item.id}`,
      unidade: item.unidade_sigla_manual || item.unidade?.sigla || item.unidade?.nome || null,
      quantidade_solicitada: roundQty(item.quantidade)
    };
  }

  const item = (solicitacao?.itensManuais || []).find((entry) => Number(entry.id) === itemReferenciaId);
  if (!item) return null;
  return {
    item_tipo: 'MANUAL',
    solicitacao_compra_item_id: null,
    solicitacao_compra_item_manual_id: item.id,
    descricao: item.nome_manual || `Item manual ${item.id}`,
    unidade: item.unidade_sigla_manual || null,
    quantidade_solicitada: roundQty(item.quantidade)
  };
}

async function registrarLogPedidoItem({
  pedidoCompraId,
  pedidoCompraItemId,
  usuarioId = null,
  acao,
  descricao,
  dadosAnteriores = null,
  dadosNovos = null,
  transaction
}) {
  return PedidoCompraItemLog.create(
    {
      pedido_compra_id: pedidoCompraId,
      pedido_compra_item_id: pedidoCompraItemId,
      usuario_id: usuarioId,
      acao,
      descricao,
      dados_anteriores: dadosAnteriores ? JSON.stringify(dadosAnteriores) : null,
      dados_novos: dadosNovos ? JSON.stringify(dadosNovos) : null
    },
    { transaction }
  );
}

async function assertPedidoEditavel(pedidoOrId, transaction) {
  const pedido = typeof pedidoOrId === 'object' && pedidoOrId
    ? pedidoOrId
    : await PedidoCompra.findByPk(Number(pedidoOrId), { transaction, lock: transaction?.LOCK?.UPDATE });

  if (!pedido) {
    throw new Error('Pedido nao encontrado.');
  }

  const bloqueado = await isPedidoCompraStatusLocked(pedido.status);
  if (bloqueado) {
    throw new Error('O pedido esta com status bloqueado para edicao.');
  }

  return pedido;
}

async function recalcularPedidoPorId(pedidoId, transaction) {
  const pedido = await PedidoCompra.findByPk(pedidoId, {
    transaction,
    include: [{ model: PedidoCompraItem, as: 'itens' }]
  });

  if (!pedido) {
    throw new Error('Pedido nao encontrado.');
  }

  const itensAtivos = (pedido.itens || []).filter((item) => !item.removido);
  let valorTotal = 0;

  if (!itensAtivos.length) {
    await pedido.update(
      {
        status: 'CANCELADO',
        valor_total: 0,
        valor_mercadorias: 0,
        valor_tributos: 0,
        difal_total: 0,
        atingiu_pedido_minimo: true,
        cancelado_em: pedido.cancelado_em || new Date(),
        motivo_cancelamento: pedido.motivo_cancelamento || 'Pedido sem itens ativos apos atualizacao da cotacao',
        encerrado_em: pedido.encerrado_em || new Date()
      },
      { transaction }
    );

    await sincronizarValoresSolicitacaoCompra(pedido.solicitacao_compra_id, transaction);

    return PedidoCompra.findByPk(pedidoId, {
      transaction,
      include: [
        { model: PedidoCompraItem, as: 'itens' },
        { model: FornecedorCompra, as: 'fornecedor', attributes: ['id', 'nome', 'email', 'whatsapp'] },
        { model: SolicitacaoCompra, as: 'solicitacao', attributes: ['id', 'status'] }
      ]
    });
  }

  const valoresBrutos = itensAtivos.map((item) =>
    roundMoney(asNumber(item.quantidade_pedido) * asNumber(item.preco_unitario))
  );
  const descontosRateados = calcularRateiosMonetarios(pedido.desconto_total, valoresBrutos);
  let valorMercadorias = 0;
  let valorTributos = 0;
  let valorDifal = 0;

  for (const [index, item] of itensAtivos.entries()) {
    const descontoRateado = descontosRateados[index] || 0;
    const tributosItem = roundMoney(
      asNumber(item.ipi_valor) + asNumber(item.icms_valor) + asNumber(item.st_valor)
    );
    const difalItem = roundMoney(item.difal_rateado);
    const valorItem = roundMoney(
      Math.max(0, valoresBrutos[index] - descontoRateado) + tributosItem + difalItem
    );
    if (
      roundMoney(item.valor_total) !== valorItem ||
      roundMoney(item.desconto_rateado) !== descontoRateado ||
      roundMoney(item.valor_mercadoria) !== valoresBrutos[index]
    ) {
      await item.update(
        {
          valor_total: valorItem,
          desconto_rateado: descontoRateado,
          valor_mercadoria: valoresBrutos[index]
        },
        { transaction }
      );
    }
    valorMercadorias += valoresBrutos[index];
    valorTributos += tributosItem;
    valorDifal += difalItem;
    valorTotal += valorItem;
  }

  valorTotal = roundMoney(valorTotal);
  const valorMinimo = asNumber(pedido.valor_minimo_pedido);
  const atingiuPedidoMinimo = valorMinimo <= 0 ? true : valorTotal >= valorMinimo;

  await pedido.update(
    {
      valor_total: valorTotal,
      valor_mercadorias: roundMoney(valorMercadorias),
      valor_tributos: roundMoney(valorTributos),
      difal_total: roundMoney(valorDifal),
      atingiu_pedido_minimo: atingiuPedidoMinimo
    },
    { transaction }
  );

  await sincronizarTotaisFretePedido(pedido.id, transaction);

  return PedidoCompra.findByPk(pedidoId, {
    transaction,
    include: [
      { model: PedidoCompraItem, as: 'itens' },
      { model: FornecedorCompra, as: 'fornecedor', attributes: ['id', 'nome', 'email', 'whatsapp'] },
      { model: SolicitacaoCompra, as: 'solicitacao', attributes: ['id', 'status'] }
    ]
  });
}

async function inativarPedidoSemItensPorAtualizacao({ pedido, usuarioId, transaction, motivo }) {
  const pedidoCompleto = pedido.itens
    ? pedido
    : await PedidoCompra.findByPk(pedido.id, {
      transaction,
      include: [{ model: PedidoCompraItem, as: 'itens' }]
    });

  const agora = new Date();
  const itensAtivos = (pedidoCompleto.itens || []).filter((item) => !item.removido);
  for (const item of itensAtivos) {
    const anterior = item.toJSON();
    await item.update(
      {
        removido: true,
        quantidade_cancelada: item.quantidade_pedido,
        cancelado_por: usuarioId || null,
        cancelado_em: agora,
        motivo_cancelamento: motivo
      },
      { transaction }
    );

    await registrarLogPedidoItem({
      pedidoCompraId: pedidoCompleto.id,
      pedidoCompraItemId: item.id,
      usuarioId,
      acao: 'ITEM_REMOVIDO_DA_SELECAO',
      descricao: `Item ${item.descricao} removido porque deixou de ser vencedor da cotacao`,
      dadosAnteriores: {
        removido: anterior.removido,
        quantidade_pedido: anterior.quantidade_pedido,
        valor_total: anterior.valor_total
      },
      dadosNovos: {
        removido: true,
        quantidade_cancelada: item.quantidade_cancelada
      },
      transaction
    });
  }

  await pedidoCompleto.update(
    {
      status: 'CANCELADO',
      valor_total: 0,
      valor_mercadorias: 0,
      valor_tributos: 0,
      difal_total: 0,
      atingiu_pedido_minimo: true,
      cancelado_por: usuarioId || null,
      cancelado_em: pedidoCompleto.cancelado_em || agora,
      encerrado_em: pedidoCompleto.encerrado_em || agora,
      motivo_cancelamento: motivo
    },
    { transaction }
  );

  await registrarLogSolicitacaoCompra({
    solicitacaoCompraId: pedidoCompleto.solicitacao_compra_id,
    usuarioId,
    fornecedorCompraId: pedidoCompleto.fornecedor_compra_id,
    tipoAcao: 'PEDIDO_CANCELADO_AUTOMATICAMENTE',
    descricao: motivo,
    metadados: {
      pedido_compra_id: pedidoCompleto.id
    },
    transaction
  });

  return pedidoCompleto;
}

async function obterOuCriarPedidoPorFornecedor({
  solicitacao,
  vinculacaoFornecedor,
  usuarioId,
  transaction
}) {
  await require('./pedidoEntregaService').assertComprasPodeGerarPedido(transaction);
  let pedido = await PedidoCompra.findOne({
    where: {
      solicitacao_compra_id: solicitacao.id,
      fornecedor_compra_id: vinculacaoFornecedor.fornecedor_compra_id
    },
    transaction
  });

  if (pedido) {
    const condicaoPagamentoAnterior = normalizeOptionalText(pedido.condicao_pagamento);
    const atualizacaoPedido = {
      valor_minimo_pedido: vinculacaoFornecedor.valor_minimo_pedido || null,
      desconto_total: roundMoney(vinculacaoFornecedor.desconto_total),
      condicao_pagamento: normalizeOptionalText(vinculacaoFornecedor.condicao_pagamento)
    };
    const condicaoPagamentoAlterada =
      condicaoPagamentoAnterior !== atualizacaoPedido.condicao_pagamento;
    const statusAnterior = String(pedido.status || '');
    if (normalizeText(pedido.status) === 'CANCELADO') {
      await pedido.update(
        {
          ...atualizacaoPedido,
          status: 'ABERTO',
          cancelado_por: null,
          cancelado_em: null,
          motivo_cancelamento: null,
          encerrado_em: null
        },
        { transaction }
      );
    } else if (await isPedidoCompraStatusLocked(statusAnterior)) {
      const statusAberto = await getPedidoStatusAbertoConfig();
      await pedido.update(
        {
          ...atualizacaoPedido,
          status: statusAberto.codigo,
          encerrado_em: null
        },
        { transaction }
      );

      await registrarLogSolicitacaoCompra({
        solicitacaoCompraId: solicitacao.id,
        usuarioId,
        fornecedorCompraId: pedido.fornecedor_compra_id,
        tipoAcao: 'PEDIDO_REABERTO_PARA_REENCERRAMENTO',
        descricao: `${buildPedidoCodigo(pedido.id)} reaberto automaticamente para atualizar vencedores da cotacao`,
        metadados: {
          pedido_compra_id: pedido.id,
          status_anterior: statusAnterior || null,
          status_novo: statusAberto.codigo,
          origem: 'ENCERRAMENTO_COTACAO'
        },
        transaction
      });

      await registrarHistoricoPedidoNaSolicitacaoPrincipal({
        solicitacao,
        pedido,
        usuarioId,
        acao: 'PEDIDO_COMPRA_REABERTO_COTACAO',
        descricao: `${buildPedidoCodigo(pedido.id)} reaberto automaticamente para atualizar vencedores da cotacao`,
        statusAnterior: statusAnterior || null,
        statusNovo: statusAberto.codigo,
        metadados: {
          automatico: true,
          origem: 'ENCERRAMENTO_COTACAO'
        },
        transaction
      });
    } else if (
      roundMoney(pedido.desconto_total) !== atualizacaoPedido.desconto_total ||
      String(pedido.valor_minimo_pedido || '') !== String(atualizacaoPedido.valor_minimo_pedido || '') ||
      condicaoPagamentoAlterada
    ) {
      await pedido.update(atualizacaoPedido, { transaction });
    }

    if (condicaoPagamentoAlterada) {
      await registrarLogSolicitacaoCompra({
        solicitacaoCompraId: solicitacao.id,
        usuarioId,
        fornecedorCompraId: pedido.fornecedor_compra_id,
        tipoAcao: 'PEDIDO_CONDICAO_PAGAMENTO_ATUALIZADA',
        descricao: `Condicao de pagamento de ${buildPedidoCodigo(pedido.id)} atualizada ao reutilizar o pedido`,
        metadados: {
          pedido_compra_id: pedido.id,
          condicao_pagamento_anterior: condicaoPagamentoAnterior,
          condicao_pagamento_nova: atualizacaoPedido.condicao_pagamento,
          origem: 'COTACAO_FORNECEDOR'
        },
        transaction
      });
    }
    return pedido;
  }

  pedido = await PedidoCompra.create(
    {
      entrega_controle_obrigatorio: true,
      solicitacao_compra_id: solicitacao.id,
      obra_id: solicitacao.obra_id,
      fornecedor_compra_id: vinculacaoFornecedor.fornecedor_compra_id,
      criado_por: usuarioId || null,
      status: 'ABERTO',
      origem: 'COTACAO',
      valor_minimo_pedido: vinculacaoFornecedor.valor_minimo_pedido || null,
      condicao_pagamento: normalizeOptionalText(vinculacaoFornecedor.condicao_pagamento),
      desconto_total: roundMoney(vinculacaoFornecedor.desconto_total),
      atingiu_pedido_minimo: true,
      observacoes: null
    },
    { transaction }
  );

  await registrarLogSolicitacaoCompra({
    solicitacaoCompraId: solicitacao.id,
    usuarioId,
    fornecedorCompraId: vinculacaoFornecedor.fornecedor_compra_id,
    tipoAcao: 'PEDIDO_GERADO',
    descricao: `Pedido preliminar gerado para ${vinculacaoFornecedor.fornecedor?.nome || vinculacaoFornecedor.fornecedor_compra_id}`,
    metadados: {
      pedido_compra_id: pedido.id,
      condicao_pagamento: pedido.condicao_pagamento
    },
    transaction
  });

  await registrarHistoricoPedidoNaSolicitacaoPrincipal({
    solicitacao,
    pedido,
    usuarioId,
    acao: 'PEDIDO_COMPRA_GERADO',
    descricao: `${buildPedidoCodigo(pedido.id)} gerado para ${vinculacaoFornecedor.fornecedor?.nome || vinculacaoFornecedor.fornecedor_compra_id}`,
    statusNovo: pedido.status,
    metadados: {
      fornecedor_nome: vinculacaoFornecedor.fornecedor?.nome || null
    },
    transaction
  });

  return pedido;
}

async function adicionarRespostasAoPedido({
  pedido,
  solicitacao,
  vinculacaoFornecedor,
  respostaItemIds = [],
  quantidadesPorResposta = new Map(),
  somarQuantidadeExistente = false,
  sincronizarItensSelecionados = false,
  usuarioId,
  acaoLog = 'ITEM_ADICIONADO',
  descricaoLog = 'Item adicionado ao pedido',
  transaction
}) {
  await assertPedidoEditavel(pedido, transaction);

  const todasRespostasDisponiveis = (vinculacaoFornecedor?.respostas || []).filter(
    (resposta) => Boolean(resposta.disponivel) && asNumber(resposta.preco) > 0
  );

  const respostasSelecionadas = respostaItemIds.length
    ? todasRespostasDisponiveis.filter((resposta) => respostaItemIds.includes(Number(resposta.id)))
    : todasRespostasDisponiveis;

  const itensAtuais = await PedidoCompraItem.findAll({
    where: { pedido_compra_id: pedido.id },
    transaction
  });

  const itensAtuaisPorResposta = new Map(
    itensAtuais
      .filter((item) => !item.removido)
      .map((item) => [Number(item.resposta_item_id || 0), item])
      .filter(([id]) => id > 0)
  );

  if (sincronizarItensSelecionados && respostaItemIds.length) {
    const respostasSelecionadasIds = new Set(respostasSelecionadas.map((resposta) => Number(resposta.id)));
    const itensRemover = itensAtuais.filter((item) =>
      !item.removido &&
      Number(item.resposta_item_id || 0) > 0 &&
      !respostasSelecionadasIds.has(Number(item.resposta_item_id || 0))
    );

    for (const itemAtual of itensRemover) {
      const anterior = itemAtual.toJSON();
      await itemAtual.update(
        {
          removido: true,
          quantidade_cancelada: itemAtual.quantidade_pedido,
          cancelado_por: usuarioId || null,
          cancelado_em: new Date(),
          motivo_cancelamento: 'Item removido da selecao de vencedores da cotacao'
        },
        { transaction }
      );

      await registrarLogPedidoItem({
        pedidoCompraId: pedido.id,
        pedidoCompraItemId: itemAtual.id,
        usuarioId,
        acao: 'ITEM_REMOVIDO_DA_SELECAO',
        descricao: `Item ${itemAtual.descricao} removido da selecao de vencedores`,
        dadosAnteriores: {
          removido: anterior.removido,
          quantidade_pedido: anterior.quantidade_pedido,
          valor_total: anterior.valor_total
        },
        dadosNovos: {
          removido: true,
          quantidade_cancelada: itemAtual.quantidade_cancelada
        },
        transaction
      });
    }
  }

  for (const resposta of respostasSelecionadas) {
    const baseItem = obterBaseItemPorResposta(solicitacao, resposta);
    if (!baseItem) {
      continue;
    }

    const quantidadeInformada = quantidadesPorResposta instanceof Map
      ? quantidadesPorResposta.get(Number(resposta.id))
      : null;
    const quantidadePedido = roundPedidoQty(
      quantidadeInformada !== undefined && quantidadeInformada !== null
        ? quantidadeInformada
        : baseItem.quantidade_solicitada
    );

    if (quantidadePedido <= 0) {
      continue;
    }

    const itemExistente = itensAtuaisPorResposta.get(Number(resposta.id));
    if (itemExistente) {
      const anterior = itemExistente.toJSON();
      const proximaQuantidade = somarQuantidadeExistente
        ? roundPedidoQty(asNumber(itemExistente.quantidade_pedido) + quantidadePedido)
        : quantidadePedido;
      await itemExistente.update(
        {
          quantidade_pedido: proximaQuantidade,
          preco_unitario: roundMoney(resposta.preco),
          valor_total: roundMoney(proximaQuantidade * asNumber(resposta.preco)),
          quantidade_minima_item: resposta.quantidade_minima_item || null,
          observacoes: resposta.observacao || itemExistente.observacoes || null
        },
        { transaction }
      );

      await registrarLogPedidoItem({
        pedidoCompraId: pedido.id,
        pedidoCompraItemId: itemExistente.id,
        usuarioId,
        acao: 'ITEM_REALOCADO',
        descricao: `Quantidade do item ${itemExistente.descricao} atualizada pela cotacao`,
        dadosAnteriores: {
          quantidade_pedido: anterior.quantidade_pedido,
          preco_unitario: anterior.preco_unitario,
          valor_total: anterior.valor_total
        },
        dadosNovos: {
          quantidade_pedido: itemExistente.quantidade_pedido,
          preco_unitario: itemExistente.preco_unitario,
          valor_total: itemExistente.valor_total
        },
        transaction
      });
      continue;
    }

    const novoItem = await PedidoCompraItem.create(
      {
        pedido_compra_id: pedido.id,
        resposta_item_id: resposta.id,
        item_tipo: baseItem.item_tipo,
        solicitacao_compra_item_id: baseItem.solicitacao_compra_item_id,
        solicitacao_compra_item_manual_id: baseItem.solicitacao_compra_item_manual_id,
        descricao: baseItem.descricao,
        unidade: baseItem.unidade,
        quantidade_solicitada: baseItem.quantidade_solicitada,
        quantidade_minima_item: resposta.quantidade_minima_item || null,
        quantidade_pedido: quantidadePedido,
        preco_unitario: roundMoney(resposta.preco),
        valor_total: roundMoney(quantidadePedido * asNumber(resposta.preco)),
        removido: false,
        origem: 'COTACAO',
        observacoes: resposta.observacao || null
      },
      { transaction }
    );

    await registrarLogPedidoItem({
      pedidoCompraId: pedido.id,
      pedidoCompraItemId: novoItem.id,
      usuarioId,
      acao: acaoLog,
      descricao: `${descricaoLog}: ${novoItem.descricao}`,
      dadosNovos: {
        resposta_item_id: resposta.id,
        quantidade_pedido: novoItem.quantidade_pedido,
        preco_unitario: novoItem.preco_unitario
      },
      transaction
    });
  }

  return recalcularPedidoPorId(pedido.id, transaction);
}

function montarMapaSaldosSolicitacao(solicitacao) {
  const saldos = new Map();

  for (const item of solicitacao?.itens || []) {
    const key = buildRespostaKey('CADASTRADO', item.id);
    saldos.set(key, {
      item_key: key,
      item_tipo: 'CADASTRADO',
      item_referencia_id: Number(item.id),
      descricao: item.insumo?.nome || `Item ${item.id}`,
      unidade: item.unidade_sigla_manual || item.unidade?.sigla || item.unidade?.nome || null,
      quantidade_atual: roundQty(item.quantidade),
      quantidade_fechada: 0,
      saldo: 0
    });
  }

  for (const item of solicitacao?.itensManuais || []) {
    const key = buildRespostaKey('MANUAL', item.id);
    saldos.set(key, {
      item_key: key,
      item_tipo: 'MANUAL',
      item_referencia_id: Number(item.id),
      descricao: item.nome_manual || `Item manual ${item.id}`,
      unidade: item.unidade_sigla_manual || null,
      quantidade_atual: roundQty(item.quantidade),
      quantidade_fechada: 0,
      saldo: 0
    });
  }

  for (const alocacao of solicitacao?.alocacoes || []) {
    if (normalizeText(alocacao.status) !== 'ATIVA') continue;
    const itemReferenciaId = Number(
      alocacao.solicitacao_compra_item_id || alocacao.solicitacao_compra_item_manual_id || 0
    );
    const key = buildRespostaKey(alocacao.item_tipo, itemReferenciaId);
    const registro = saldos.get(key);
    if (!registro) continue;
    registro.quantidade_fechada = roundQty(
      registro.quantidade_fechada + asNumber(alocacao.quantidade_alocada)
    );
  }

  for (const registro of saldos.values()) {
    registro.saldo = roundQty(Math.max(0, registro.quantidade_atual - registro.quantidade_fechada));
  }

  return saldos;
}

async function obterSaldosSolicitacaoCompra(solicitacaoId, transaction) {
  const solicitacao = await carregarSolicitacaoPedidos(solicitacaoId, transaction, { incluirPedidos: false });
  if (!solicitacao) {
    throw new Error('Solicitacao de compra nao encontrada.');
  }
  return [...montarMapaSaldosSolicitacao(solicitacao).values()];
}

async function sincronizarStatusSolicitacaoCompraPorSaldo({
  solicitacaoId,
  usuarioId = null,
  forcarRevisao = false,
  transaction
}) {
  const solicitacao = await carregarSolicitacaoPedidos(solicitacaoId, transaction, { incluirPedidos: true });
  if (!solicitacao || isSolicitacaoCompraCancelada(solicitacao.status)) {
    return solicitacao;
  }

  const saldos = [...montarMapaSaldosSolicitacao(solicitacao).values()];
  const quantidadeFechada = roundQty(saldos.reduce((sum, item) => sum + item.quantidade_fechada, 0));
  const saldoRestante = roundQty(saldos.reduce((sum, item) => sum + item.saldo, 0));
  const pedidosAtivos = (solicitacao.pedidos || []).filter((pedido) => !isPedidoCancelado(pedido.status));
  const statusFechado = await getPedidoStatusFechadoFornecedorConfig();
  const todosPedidosFechados = pedidosAtivos.length > 0 && pedidosAtivos.every((pedido) => (
    isPedidoFechadoComFornecedorStatus(pedido.status, statusFechado)
  ));

  let proximoStatus = 'ENVIADO';
  let encerradoEm = null;
  if (quantidadeFechada > 0) {
    if (!forcarRevisao && saldoRestante <= 0.0001 && todosPedidosFechados) {
      proximoStatus = 'ENCERRADO';
      encerradoEm = solicitacao.encerrado_em || new Date();
    } else {
      proximoStatus = 'FECHAMENTO_PARCIAL';
    }
  }

  const encerramentoMudou = Boolean(solicitacao.encerrado_em) !== Boolean(encerradoEm);
  if (
    normalizeText(solicitacao.status) !== normalizeText(proximoStatus) ||
    encerramentoMudou
  ) {
    const statusAnterior = solicitacao.status;
    await solicitacao.update({ status: proximoStatus, encerrado_em: encerradoEm }, { transaction });
    await registrarLogSolicitacaoCompra({
      solicitacaoCompraId: solicitacao.id,
      usuarioId,
      tipoAcao: 'STATUS_SINCRONIZADO_POR_SALDO',
      descricao: `Status da compra sincronizado de ${statusAnterior || '-'} para ${proximoStatus}`,
      metadados: {
        status_anterior: statusAnterior || null,
        status_novo: proximoStatus,
        quantidade_fechada: quantidadeFechada,
        saldo_restante: saldoRestante,
        forcar_revisao: Boolean(forcarRevisao)
      },
      transaction
    });
  }

  return solicitacao;
}

async function sincronizarStatusCotacoesAposPedido({
  solicitacaoId,
  fornecedorCompraId = null,
  modo = 'STATUS_PEDIDO',
  usuarioId = null,
  transaction
}) {
  const solicitacao = await SolicitacaoCompra.findByPk(Number(solicitacaoId), {
    attributes: ['id', 'status'],
    transaction
  });
  if (!solicitacao || isSolicitacaoCompraCancelada(solicitacao.status)) {
    return solicitacao;
  }

  const statusSolicitacao = normalizeText(solicitacao.status);
  let atualizadas = 0;
  if (statusSolicitacao === 'ENCERRADO') {
    const [quantidade] = await SolicitacaoCompraFornecedor.update(
      { status: 'FINALIZADA' },
      {
        where: {
          solicitacao_compra_id: solicitacao.id,
          status: { [Op.notIn]: ['CANCELADA', 'CANCELADO', 'FINALIZADA'] }
        },
        transaction
      }
    );
    atualizadas += Number(quantidade || 0);
  } else {
    const [finalizadasReativadas] = await SolicitacaoCompraFornecedor.update(
      { status: 'RESPONDIDO' },
      {
        where: {
          solicitacao_compra_id: solicitacao.id,
          status: 'FINALIZADA',
          respondido_em: { [Op.ne]: null }
        },
        transaction
      }
    );
    atualizadas += Number(finalizadasReativadas || 0);

    if (Number(fornecedorCompraId || 0) > 0) {
      const statusFornecedor = normalizeText(modo) === 'REABERTURA' ? 'REABERTA' : 'RESPONDIDO';
      const [fornecedorAtualizado] = await SolicitacaoCompraFornecedor.update(
        { status: statusFornecedor },
        {
          where: {
            solicitacao_compra_id: solicitacao.id,
            fornecedor_compra_id: Number(fornecedorCompraId),
            status: { [Op.notIn]: ['CANCELADA', 'CANCELADO'] },
            respondido_em: { [Op.ne]: null }
          },
          transaction
        }
      );
      atualizadas += Number(fornecedorAtualizado || 0);
    }
  }

  if (atualizadas > 0) {
    await registrarLogSolicitacaoCompra({
      solicitacaoCompraId: solicitacao.id,
      usuarioId,
      fornecedorCompraId: Number(fornecedorCompraId || 0) || null,
      tipoAcao: 'STATUS_COTACOES_SINCRONIZADO_POR_PEDIDO',
      descricao: `Status das cotacoes sincronizado apos ${normalizeText(modo) === 'REABERTURA' ? 'reabertura' : 'alteracao'} do pedido`,
      metadados: {
        modo: normalizeText(modo),
        status_solicitacao: solicitacao.status,
        fornecedor_compra_id: Number(fornecedorCompraId || 0) || null,
        cotacoes_atualizadas: atualizadas
      },
      transaction
    });
  }

  return solicitacao;
}

async function sincronizarStatusFechamentoPorPedido(pedido, transaction) {
  const fechamentoId = Number(pedido?.fechamento_id || 0);
  if (!fechamentoId) return null;

  const fechamento = await SolicitacaoCompraFechamento.findByPk(fechamentoId, { transaction });
  if (!fechamento) return null;

  const [pedidos, totalAlocacoes, alocacoesAtivas] = await Promise.all([
    PedidoCompra.findAll({ where: { fechamento_id: fechamentoId }, transaction }),
    SolicitacaoCompraAlocacao.count({ where: { fechamento_id: fechamentoId }, transaction }),
    SolicitacaoCompraAlocacao.count({
      where: { fechamento_id: fechamentoId, status: 'ATIVA' },
      transaction
    })
  ]);
  const cancelados = pedidos.filter((item) => isPedidoCancelado(item.status)).length;
  const status = totalAlocacoes > 0 && alocacoesAtivas === 0
    ? 'CANCELADO'
    : (cancelados > 0 || alocacoesAtivas < totalAlocacoes)
      ? 'PARCIALMENTE_CANCELADO'
      : 'CONCLUIDO';
  if (normalizeText(fechamento.status) !== normalizeText(status)) {
    await fechamento.update({ status }, { transaction });
  }
  return fechamento;
}

function montarAlocacoesNormalizadas(solicitacao, vencedores = [], saldosAtuais = null, options = {}) {
  const todasRespostas = [];
  for (const vinculacaoFornecedor of solicitacao.fornecedores || []) {
    for (const resposta of vinculacaoFornecedor.respostas || []) {
      todasRespostas.push({
        resposta,
        vinculacaoFornecedor
      });
    }
  }

  const entradas = Array.isArray(vencedores) && vencedores.length
    ? vencedores
    : todasRespostas
      .filter(({ resposta }) => resposta.vencedor)
      .map(({ resposta }) => ({ resposta_item_id: resposta.id }));

  const mapaSaldos = saldosAtuais || montarMapaSaldosSolicitacao(solicitacao);
  const alocacoes = [];
  const totaisPorItem = new Map();
  const alocadoAnteriorPorFornecedorItem = montarMapaAlocacoesAtivasPorFornecedorItem(
    solicitacao?.alocacoes || []
  );
  const alocadoAnteriorPorResposta = montarMapaAlocacoesAtivasPorResposta(solicitacao?.alocacoes || []);
  const tributosAnterioresPorFornecedorItem = new Map();
  const fretesAnterioresPorFornecedorItem = new Map();
  const tributosAnterioresPorResposta = new Map();
  const fretesAnterioresPorResposta = new Map();
  for (const alocacao of solicitacao?.alocacoes || []) {
    if (normalizeText(alocacao.status) !== 'ATIVA') continue;
    const fornecedorItemKey = buildCompraFornecedorItemKey(alocacao.fornecedor_compra_id, alocacao);
    const atual = tributosAnterioresPorFornecedorItem.get(fornecedorItemKey) || { ipi: 0, icms: 0, st: 0 };
    tributosAnterioresPorFornecedorItem.set(fornecedorItemKey, {
      ipi: roundMoney(atual.ipi + asNumber(alocacao.ipi_rateado)),
      icms: roundMoney(atual.icms + asNumber(alocacao.icms_rateado)),
      st: roundMoney(atual.st + asNumber(alocacao.st_rateado))
    });
    fretesAnterioresPorFornecedorItem.set(
      fornecedorItemKey,
      roundMoney((fretesAnterioresPorFornecedorItem.get(fornecedorItemKey) || 0) + asNumber(alocacao.frete_rateado))
    );
    const respostaItemId = Number(alocacao.resposta_item_id || 0);
    if (respostaItemId) {
      const tributosResposta = tributosAnterioresPorResposta.get(respostaItemId) || { ipi: 0, icms: 0, st: 0 };
      tributosAnterioresPorResposta.set(respostaItemId, {
        ipi: roundMoney(tributosResposta.ipi + asNumber(alocacao.ipi_rateado)),
        icms: roundMoney(tributosResposta.icms + asNumber(alocacao.icms_rateado)),
        st: roundMoney(tributosResposta.st + asNumber(alocacao.st_rateado))
      });
      fretesAnterioresPorResposta.set(
        respostaItemId,
        roundMoney((fretesAnterioresPorResposta.get(respostaItemId) || 0) + asNumber(alocacao.frete_rateado))
      );
    }
  }
  const alocadoRodadaPorFornecedorItem = new Map();
  const alocadoRodadaPorResposta = new Map();
  const tributosRodadaPorFornecedorItem = new Map();
  const fretesRodadaPorFornecedorItem = new Map();

  for (const entrada of entradas) {
    const respostaItemId = Number(entrada?.resposta_item_id || entrada?.id || 0);
    if (!respostaItemId) {
      continue;
    }

    const registro = todasRespostas.find(({ resposta }) => Number(resposta.id) === respostaItemId);
    if (!registro) {
      throw new Error('Resposta vencedora invalida informada.');
    }

    const { resposta, vinculacaoFornecedor } = registro;
    if (!resposta.disponivel || asNumber(resposta.preco) <= 0) {
      throw new Error('Resposta vencedora precisa estar disponivel e possuir preco.');
    }

    const baseItem = obterBaseItemPorResposta(solicitacao, resposta);
    if (!baseItem) {
      throw new Error('Item da resposta vencedora nao foi encontrado.');
    }

    const itemKey = buildItemKeyFromResposta(resposta);
    const fornecedorItemKey = buildCompraFornecedorItemKey(
      vinculacaoFornecedor.fornecedor_compra_id,
      resposta
    );
    const quantidadeBase = roundQty(baseItem.quantidade_solicitada);
    const saldoItem = mapaSaldos.get(itemKey)?.saldo ?? quantidadeBase;
    const quantidadeEntrada =
      entrada?.quantidade_alocada ??
      entrada?.quantidade ??
      entrada?.quantidade_pedido ??
      saldoItem;
    const quantidadeAlocada = roundQty(quantidadeEntrada);

    if (quantidadeAlocada <= 0) {
      throw new Error('Quantidade alocada deve ser maior que zero.');
    }

    const quantidadeDisponivel = roundQty(
      resposta.quantidade_disponivel ?? (resposta.disponivel ? quantidadeBase : 0)
    );
    const ofertaSaldo = isOfertaSaldo(resposta);
    const quantidadeJaAlocadaFornecedorItem = roundQty(
      ofertaSaldo
        ? (alocadoAnteriorPorResposta.get(Number(resposta.id)) || 0)
          + (alocadoRodadaPorResposta.get(Number(resposta.id)) || 0)
        : (alocadoAnteriorPorFornecedorItem.get(fornecedorItemKey) || 0)
          + (alocadoRodadaPorFornecedorItem.get(fornecedorItemKey) || 0)
    );
    const disponibilidadeRestante = roundQty(Math.max(0, quantidadeDisponivel - quantidadeJaAlocadaFornecedorItem));
    if (quantidadeAlocada > disponibilidadeRestante) {
      throw new Error(
        `A quantidade definida para o fornecedor no item "${baseItem.descricao}" ultrapassa a quantidade disponivel. Disponivel na resposta: ${quantidadeDisponivel}. Ja comprada deste fornecedor para o item: ${quantidadeJaAlocadaFornecedorItem}. Saldo do fornecedor: ${disponibilidadeRestante}.`
      );
    }

    const totalAtual = roundQty((totaisPorItem.get(itemKey) || 0) + quantidadeAlocada);
    if (totalAtual > roundQty(saldoItem) && options.permitirExcedente !== true) {
      throw new Error(
        `A quantidade definida para comprar do item "${baseItem.descricao}" ultrapassa o saldo solicitado. Confirme o fechamento excedente e informe a justificativa. Quantidade atual: ${quantidadeBase}. Ja fechada: ${roundQty(quantidadeBase - saldoItem)}. Saldo: ${roundQty(saldoItem)}. Marcado nesta rodada: ${totalAtual}.`
      );
    }

    totaisPorItem.set(itemKey, totalAtual);
    alocadoRodadaPorFornecedorItem.set(
      fornecedorItemKey,
      roundQty((alocadoRodadaPorFornecedorItem.get(fornecedorItemKey) || 0) + quantidadeAlocada)
    );
    alocadoRodadaPorResposta.set(
      Number(resposta.id),
      roundQty((alocadoRodadaPorResposta.get(Number(resposta.id)) || 0) + quantidadeAlocada)
    );
    const tributosAnteriores = ofertaSaldo
      ? tributosAnterioresPorResposta.get(Number(resposta.id)) || { ipi: 0, icms: 0, st: 0 }
      : tributosAnterioresPorFornecedorItem.get(fornecedorItemKey) || { ipi: 0, icms: 0, st: 0 };
    const tributosRodada = tributosRodadaPorFornecedorItem.get(fornecedorItemKey) || { ipi: 0, icms: 0, st: 0 };
    const quantidadeBaseFinanceira = obterQuantidadeBaseFinanceiraCotacao({
      quantidadeSolicitada: quantidadeBase,
      quantidadeDisponivel,
      escopoDisponibilidade: resposta.escopo_disponibilidade
    });
    const percentualQuantidade = quantidadeBaseFinanceira > 0
      ? quantidadeAlocada / quantidadeBaseFinanceira
      : 0;
    const ratearTributo = (total, anterior, rodada) => roundMoney(Math.min(
      Math.max(0, asNumber(total) - anterior - rodada),
      asNumber(total) * percentualQuantidade
    ));
    const ipiRateado = ratearTributo(resposta.ipi_valor, tributosAnteriores.ipi, tributosRodada.ipi);
    const icmsRateado = ratearTributo(resposta.icms_valor, tributosAnteriores.icms, tributosRodada.icms);
    const stRateado = ratearTributo(resposta.st_valor, tributosAnteriores.st, tributosRodada.st);
    const freteItemRateado = normalizeText(vinculacaoFornecedor.frete_modo) === 'POR_ITEM'
      ? ratearTributo(
          resposta.frete_valor,
          ofertaSaldo
            ? fretesAnterioresPorResposta.get(Number(resposta.id)) || 0
            : fretesAnterioresPorFornecedorItem.get(fornecedorItemKey) || 0,
          fretesRodadaPorFornecedorItem.get(fornecedorItemKey) || 0
        )
      : 0;
    tributosRodadaPorFornecedorItem.set(fornecedorItemKey, {
      ipi: roundMoney(tributosRodada.ipi + ipiRateado),
      icms: roundMoney(tributosRodada.icms + icmsRateado),
      st: roundMoney(tributosRodada.st + stRateado)
    });
    fretesRodadaPorFornecedorItem.set(
      fornecedorItemKey,
      roundMoney((fretesRodadaPorFornecedorItem.get(fornecedorItemKey) || 0) + freteItemRateado)
    );
    const valorMercadoria = roundMoney(quantidadeAlocada * asNumber(resposta.preco));
    alocacoes.push({
      resposta,
      vinculacaoFornecedor,
      baseItem,
      itemKey,
      quantidade_alocada: quantidadeAlocada,
      quantidade_referencia: quantidadeBase,
      preco_unitario: roundMoney(resposta.preco),
      valor_mercadoria: valorMercadoria,
      ipi_rateado: ipiRateado,
      icms_rateado: icmsRateado,
      st_rateado: stRateado,
      difal_rateado: 0,
      frete_rateado: freteItemRateado,
      valor_total: roundMoney(valorMercadoria + ipiRateado + icmsRateado + stRateado)
    });
  }

  const porFornecedor = new Map();
  for (const alocacao of alocacoes) {
    const fornecedorId = Number(alocacao.vinculacaoFornecedor?.fornecedor_compra_id || 0);
    if (!porFornecedor.has(fornecedorId)) {
      porFornecedor.set(fornecedorId, []);
    }
    porFornecedor.get(fornecedorId).push(alocacao);
  }

  const descontosAtivosPorFornecedor = new Map();
  const difalAtivoPorFornecedor = new Map();
  const freteAtivoPorFornecedor = new Map();
  const descontosAtivosPorResposta = new Map();
  const difalAtivoPorResposta = new Map();
  const freteAtivoPorResposta = new Map();
  for (const alocacao of solicitacao?.alocacoes || []) {
    if (normalizeText(alocacao.status) !== 'ATIVA') continue;
    const fornecedorId = Number(alocacao.fornecedor_compra_id || 0);
    descontosAtivosPorFornecedor.set(
      fornecedorId,
      roundMoney((descontosAtivosPorFornecedor.get(fornecedorId) || 0) + asNumber(alocacao.desconto_rateado))
    );
    difalAtivoPorFornecedor.set(
      fornecedorId,
      roundMoney((difalAtivoPorFornecedor.get(fornecedorId) || 0) + asNumber(alocacao.difal_rateado))
    );
    freteAtivoPorFornecedor.set(
      fornecedorId,
      roundMoney((freteAtivoPorFornecedor.get(fornecedorId) || 0) + asNumber(alocacao.frete_rateado))
    );
    const respostaItemId = Number(alocacao.resposta_item_id || 0);
    if (respostaItemId) {
      descontosAtivosPorResposta.set(respostaItemId, roundMoney(
        (descontosAtivosPorResposta.get(respostaItemId) || 0) + asNumber(alocacao.desconto_rateado)
      ));
      difalAtivoPorResposta.set(respostaItemId, roundMoney(
        (difalAtivoPorResposta.get(respostaItemId) || 0) + asNumber(alocacao.difal_rateado)
      ));
      freteAtivoPorResposta.set(respostaItemId, roundMoney(
        (freteAtivoPorResposta.get(respostaItemId) || 0) + asNumber(alocacao.frete_rateado)
      ));
    }
  }

  for (const [fornecedorId, grupo] of porFornecedor.entries()) {
    const vinculacaoFornecedor = grupo[0]?.vinculacaoFornecedor;
    const respostaIdsGrupo = grupo.map((item) => Number(item.resposta?.id || 0)).filter(Boolean);
    const ofertaSaldoGrupo = grupo.every((item) => isOfertaSaldo(item.resposta));
    const somarPorRespostas = (mapa) => roundMoney(
      respostaIdsGrupo.reduce((total, respostaId) => total + asNumber(mapa.get(respostaId)), 0)
    );
    const difalCotacao = roundMoney(vinculacaoFornecedor?.difal_valor);
    const difalAnterior = ofertaSaldoGrupo
      ? somarPorRespostas(difalAtivoPorResposta)
      : roundMoney(difalAtivoPorFornecedor.get(fornecedorId) || 0);
    const difalRestante = roundMoney(Math.max(0, difalCotacao - difalAnterior));
    const baseCotada = roundMoney((vinculacaoFornecedor?.respostas || []).reduce((sum, resposta) => {
      if (!resposta.disponivel || asNumber(resposta.preco) <= 0) return sum;
      const baseItem = obterBaseItemPorResposta(solicitacao, resposta);
      const quantidadeBaseFinanceira = obterQuantidadeBaseFinanceiraCotacao({
        quantidadeSolicitada: baseItem?.quantidade_solicitada,
        quantidadeDisponivel: resposta.quantidade_disponivel,
        escopoDisponibilidade: resposta.escopo_disponibilidade
      });
      return sum + quantidadeBaseFinanceira * asNumber(resposta.preco);
    }, 0));
    const basesDifal = grupo.map((alocacao) => alocacao.valor_mercadoria);
    const difalDaRodada = baseCotada > 0
      ? roundMoney(Math.min(
          difalRestante,
          difalCotacao * (basesDifal.reduce((sum, valor) => sum + asNumber(valor), 0) / baseCotada)
        ))
      : 0;
    const difalRateadoItens = calcularRateiosMonetarios(difalDaRodada, basesDifal);
    grupo.forEach((alocacao, index) => {
      alocacao.difal_rateado = difalRateadoItens[index] || 0;
      alocacao.valor_total = roundMoney(asNumber(alocacao.valor_total) + alocacao.difal_rateado);
    });

    if (normalizeText(vinculacaoFornecedor?.frete_modo) !== 'POR_ITEM') {
      const freteCotacao = roundMoney(vinculacaoFornecedor?.frete_valor);
      const freteAnterior = ofertaSaldoGrupo
        ? somarPorRespostas(freteAtivoPorResposta)
        : roundMoney(freteAtivoPorFornecedor.get(fornecedorId) || 0);
      const freteRestante = roundMoney(Math.max(0, freteCotacao - freteAnterior));
      const basesFrete = grupo.map((alocacao) => alocacao.valor_mercadoria);
      const baseRodada = basesFrete.reduce((sum, valor) => sum + asNumber(valor), 0);
      const freteRodada = baseCotada > 0
        ? roundMoney(Math.min(freteRestante, freteCotacao * (baseRodada / baseCotada)))
        : 0;
      const fretesRateados = calcularRateiosMonetarios(freteRodada, basesFrete, {
        limitarAoTotalBase: false
      });
      grupo.forEach((alocacao, index) => {
        alocacao.frete_rateado = fretesRateados[index] || 0;
      });
    }

    const descontoCotacao = roundMoney(grupo[0]?.vinculacaoFornecedor?.desconto_total);
    const descontoAnterior = ofertaSaldoGrupo
      ? somarPorRespostas(descontosAtivosPorResposta)
      : roundMoney(descontosAtivosPorFornecedor.get(fornecedorId) || 0);
    const descontoTotal = roundMoney(Math.max(0, descontoCotacao - descontoAnterior));
    const bases = grupo.map((alocacao) => alocacao.valor_total);
    const descontos = calcularRateiosMonetarios(descontoTotal, bases);
    grupo.forEach((alocacao, index) => {
      const descontoRateado = descontos[index] || 0;
      alocacao.desconto_rateado = descontoRateado;
      alocacao.valor_total = roundMoney(Math.max(0, asNumber(alocacao.valor_total) - descontoRateado));
    });
  }

  return alocacoes;
}

async function persistirAlocacoesSolicitacao({ solicitacao, fechamento, alocacoes, usuarioId, transaction }) {
  const criadas = [];
  for (const alocacao of alocacoes) {
    const criada = await SolicitacaoCompraAlocacao.create(
      {
        solicitacao_compra_id: solicitacao.id,
        fechamento_id: fechamento?.id || null,
        resposta_item_id: alocacao.resposta.id,
        fornecedor_compra_id: alocacao.vinculacaoFornecedor.fornecedor_compra_id,
        item_tipo: alocacao.baseItem.item_tipo,
        solicitacao_compra_item_id: alocacao.baseItem.solicitacao_compra_item_id,
        solicitacao_compra_item_manual_id: alocacao.baseItem.solicitacao_compra_item_manual_id,
        quantidade_alocada: alocacao.quantidade_alocada,
        quantidade_referencia: alocacao.quantidade_referencia,
        preco_unitario: alocacao.preco_unitario,
        valor_total: alocacao.valor_total,
        desconto_rateado: alocacao.desconto_rateado || 0,
        ipi_rateado: alocacao.ipi_rateado || 0,
        icms_rateado: alocacao.icms_rateado || 0,
        st_rateado: alocacao.st_rateado || 0,
        difal_rateado: alocacao.difal_rateado || 0,
        frete_rateado: alocacao.frete_rateado || 0,
        status: 'ATIVA',
        criado_por: usuarioId || null
      },
      { transaction }
    );
    criadas.push({ ...alocacao, registro: criada });
  }

  return criadas;
}

async function criarPedidoPorFornecedorRodada({
  solicitacao,
  fechamento,
  vinculacaoFornecedor,
  descontoTotal,
  usuarioId,
  transaction
}) {
  await require('./pedidoEntregaService').assertComprasPodeGerarPedido(transaction);
  const pedido = await PedidoCompra.create(
    {
      entrega_controle_obrigatorio: true,
      solicitacao_compra_id: solicitacao.id,
      fechamento_id: fechamento.id,
      obra_id: solicitacao.obra_id,
      fornecedor_compra_id: vinculacaoFornecedor.fornecedor_compra_id,
      criado_por: usuarioId || null,
      status: 'ABERTO',
      origem: 'COTACAO',
      valor_minimo_pedido: vinculacaoFornecedor.valor_minimo_pedido || null,
      condicao_pagamento: normalizeOptionalText(vinculacaoFornecedor.condicao_pagamento),
      desconto_total: roundMoney(descontoTotal),
      prazo_entrega_dias: vinculacaoFornecedor.prazo_entrega_dias || null,
      prazo_entrega_tipo: vinculacaoFornecedor.prazo_entrega_tipo || null,
      frete_tipo_cotacao: vinculacaoFornecedor.frete_tipo || 'SEM_FRETE',
      frete_modo_cotacao: vinculacaoFornecedor.frete_modo || 'GLOBAL',
      frete_valor_cotacao: roundMoney(vinculacaoFornecedor.frete_valor),
      frete_data_vencimento: vinculacaoFornecedor.frete_data_vencimento || null,
      frete_transportador_nome: vinculacaoFornecedor.frete_transportador_nome || null,
      frete_transportador_cpf_cnpj: vinculacaoFornecedor.frete_transportador_cpf_cnpj || null,
      atingiu_pedido_minimo: true,
      observacoes: `Rodada ${fechamento.numero_rodada} - fechamento ${String(fechamento.tipo).toLowerCase()}`
    },
    { transaction }
  );

  await registrarLogSolicitacaoCompra({
    solicitacaoCompraId: solicitacao.id,
    usuarioId,
    fornecedorCompraId: vinculacaoFornecedor.fornecedor_compra_id,
    tipoAcao: 'PEDIDO_GERADO_RODADA',
    descricao: `${buildPedidoCodigo(pedido.id)} gerado na rodada ${fechamento.numero_rodada}`,
    metadados: {
      pedido_compra_id: pedido.id,
      fechamento_id: fechamento.id,
      numero_rodada: fechamento.numero_rodada,
      tipo_fechamento: fechamento.tipo,
      condicao_pagamento: pedido.condicao_pagamento
    },
    transaction
  });

  await registrarHistoricoPedidoNaSolicitacaoPrincipal({
    solicitacao,
    pedido,
    usuarioId,
    acao: 'PEDIDO_COMPRA_GERADO',
    descricao: `${buildPedidoCodigo(pedido.id)} gerado na rodada ${fechamento.numero_rodada} para ${vinculacaoFornecedor.fornecedor?.nome || vinculacaoFornecedor.fornecedor_compra_id}`,
    statusNovo: pedido.status,
    metadados: {
      fechamento_id: fechamento.id,
      numero_rodada: fechamento.numero_rodada,
      tipo_fechamento: fechamento.tipo,
      condicao_pagamento: pedido.condicao_pagamento
    },
    transaction
  });

  return pedido;
}

async function gerarPedidosDosVencedores({
  solicitacaoId,
  usuarioId,
  vencedores = [],
  idempotencyKey = null,
  justificativa = null,
  fechamentoParcialConfirmado = false,
  fechamentoExcedenteConfirmado = false,
  justificativaExcedente = null,
  previsaoEntrega = null,
  permitirParcial = false,
  permitirFinal = false,
  transaction
}) {
  const solicitacao = await carregarSolicitacaoPedidos(solicitacaoId, transaction);
  if (!solicitacao) {
    throw new Error('Solicitacao de compra nao encontrada.');
  }
  if (isSolicitacaoCompraCancelada(solicitacao.status) || normalizeCotacaoText(solicitacao.status) === 'RECUSADO') {
    throw new Error('Solicitacao de compra cancelada ou recusada nao permite gerar pedidos.');
  }
  const scopeIdempotencia = idempotencyKey
    ? `SC:${Number(solicitacaoId)}:${String(idempotencyKey).trim().slice(0, 140)}`
    : null;
  if (scopeIdempotencia) {
    const existente = await SolicitacaoCompraFechamento.findOne({
      where: { idempotency_key: scopeIdempotencia },
      transaction
    });
    if (existente) {
      const pedidosExistentes = await PedidoCompra.findAll({
        where: { fechamento_id: existente.id },
        transaction
      });
      const saldosAtuais = montarMapaSaldosSolicitacao(solicitacao);
      const saldoRestanteAtual = [...saldosAtuais.values()].reduce(
        (total, item) => roundQty(total + item.saldo),
        0
      );
      return {
        fechamento: existente,
        replay: true,
        pedidos: pedidosExistentes,
        saldo_restante: saldoRestanteAtual,
        final: normalizeText(existente.tipo) === 'FINAL'
      };
    }
  }

  if (['ENCERRADO', 'INATIVA'].includes(normalizeText(solicitacao.status))) {
    throw Object.assign(new Error('Solicitacao de compra encerrada nao permite gerar novos pedidos.'), {
      statusCode: 409,
      code: 'COMPRA_COTACAO_JA_ENCERRADA'
    });
  }

  const saldosAntes = montarMapaSaldosSolicitacao(solicitacao);
  const normalizadas = montarAlocacoesNormalizadas(solicitacao, vencedores, saldosAntes, {
    permitirExcedente: fechamentoExcedenteConfirmado === true
  });
  if (!normalizadas.length) {
    throw Object.assign(new Error('Selecione ao menos um item com quantidade para gerar os pedidos.'), {
      statusCode: 400,
      code: 'COMPRA_FECHAMENTO_SEM_ITENS'
    });
  }
  const selecionadoPorItem = new Map();
  normalizadas.forEach((alocacao) => {
    selecionadoPorItem.set(
      alocacao.itemKey,
      roundQty((selecionadoPorItem.get(alocacao.itemKey) || 0) + alocacao.quantidade_alocada)
    );
  });
  const quantidadeExcedente = roundQty([...selecionadoPorItem.entries()].reduce((total, [itemKey, quantidade]) => {
    const saldo = roundQty(saldosAntes.get(itemKey)?.saldo || 0);
    return total + Math.max(0, roundQty(quantidade - saldo));
  }, 0));
  if (quantidadeExcedente > 0) {
    if (!fechamentoExcedenteConfirmado) {
      throw Object.assign(new Error('Confirme o fechamento acima da quantidade solicitada.'), {
        statusCode: 409,
        code: 'COMPRA_FECHAMENTO_EXCEDENTE_REQUER_CONFIRMACAO',
        quantidade_excedente: quantidadeExcedente
      });
    }
    if (!String(justificativaExcedente || '').trim()) {
      throw Object.assign(new Error('Informe a justificativa para comprar acima da quantidade solicitada.'), {
        statusCode: 400,
        code: 'COMPRA_FECHAMENTO_EXCEDENTE_REQUER_JUSTIFICATIVA',
        quantidade_excedente: quantidadeExcedente
      });
    }
  }
  const saldoRestante = [...saldosAntes.values()].reduce((total, item) => (
    roundQty(total + Math.max(0, item.saldo - (selecionadoPorItem.get(item.item_key) || 0)))
  ), 0);
  const tipoFechamento = saldoRestante > 0.0001 ? 'PARCIAL' : 'FINAL';

  if (tipoFechamento === 'PARCIAL') {
    if (!permitirParcial) {
      throw Object.assign(new Error('Acesso negado para realizar fechamento parcial da cotacao.'), {
        statusCode: 403,
        code: 'COMPRA_FECHAMENTO_PARCIAL_SEM_PERMISSAO'
      });
    }
    if (!fechamentoParcialConfirmado) {
      throw Object.assign(new Error('Confirme o fechamento parcial para gerar somente os pedidos selecionados.'), {
        statusCode: 409,
        code: 'COMPRA_FECHAMENTO_PARCIAL_REQUER_CONFIRMACAO',
        saldo_restante: saldoRestante
      });
    }
    if (!String(justificativa || '').trim()) {
      throw Object.assign(new Error('Informe a justificativa do fechamento parcial.'), {
        statusCode: 400,
        code: 'COMPRA_FECHAMENTO_PARCIAL_REQUER_JUSTIFICATIVA'
      });
    }
  } else if (!permitirFinal) {
    throw Object.assign(new Error('Acesso negado para encerrar definitivamente a cotacao.'), {
      statusCode: 403,
      code: 'COMPRA_FECHAMENTO_FINAL_SEM_PERMISSAO'
    });
  }

  const ultimaRodada = await SolicitacaoCompraFechamento.findOne({
    where: { solicitacao_compra_id: solicitacao.id },
    order: [['numero_rodada', 'DESC']],
    transaction
  });
  const fechamento = await SolicitacaoCompraFechamento.create(
    {
      solicitacao_compra_id: solicitacao.id,
      numero_rodada: Number(ultimaRodada?.numero_rodada || 0) + 1,
      tipo: tipoFechamento,
      status: 'CONCLUIDO',
      idempotency_key: scopeIdempotencia,
      quantidade_total: roundQty(normalizadas.reduce((sum, item) => sum + item.quantidade_alocada, 0)),
      valor_total: roundMoney(normalizadas.reduce((sum, item) => sum + item.valor_total, 0)),
      justificativa: String(justificativa || '').trim() || null,
      quantidade_excedente: quantidadeExcedente,
      justificativa_excedente: quantidadeExcedente > 0
        ? String(justificativaExcedente || '').trim()
        : null,
      criado_por: usuarioId || null,
      fechado_em: new Date()
    },
    { transaction }
  );

  const alocacoes = await persistirAlocacoesSolicitacao({
    solicitacao,
    fechamento,
    alocacoes: normalizadas,
    usuarioId,
    transaction
  });

  const porFornecedor = new Map();
  for (const alocacao of alocacoes) {
    const fornecedorId = Number(alocacao.vinculacaoFornecedor.fornecedor_compra_id);
    if (!porFornecedor.has(fornecedorId)) {
      porFornecedor.set(fornecedorId, {
        vinculacaoFornecedor: alocacao.vinculacaoFornecedor,
        respostaItemIds: [],
        quantidadesPorResposta: new Map(),
        registrosAlocacao: []
      });
    }
    const grupo = porFornecedor.get(fornecedorId);
    grupo.respostaItemIds.push(Number(alocacao.resposta.id));
    grupo.quantidadesPorResposta.set(Number(alocacao.resposta.id), alocacao.quantidade_alocada);
    grupo.registrosAlocacao.push(alocacao.registro);
  }

  const pedidosCriados = [];
  for (const grupo of porFornecedor.values()) {
    if (!grupo.respostaItemIds.length) continue;

    const pedido = await criarPedidoPorFornecedorRodada({
      solicitacao,
      fechamento,
      vinculacaoFornecedor: grupo.vinculacaoFornecedor,
      descontoTotal: grupo.registrosAlocacao.reduce((sum, registro) => sum + asNumber(registro.desconto_rateado), 0),
      usuarioId,
      transaction
    });

    const pedidoAtualizado = await adicionarRespostasAoPedido({
      pedido,
      solicitacao,
      vinculacaoFornecedor: grupo.vinculacaoFornecedor,
      respostaItemIds: grupo.respostaItemIds,
      quantidadesPorResposta: grupo.quantidadesPorResposta,
      usuarioId,
      acaoLog: 'GERADO_DA_COTACAO',
      descricaoLog: 'Item gerado a partir da cotacao encerrada',
      sincronizarItensSelecionados: false,
      transaction
    });
    const itensPorResposta = new Map(
      (pedidoAtualizado?.itens || [])
        .map((item) => [Number(item.resposta_item_id || 0), item])
        .filter(([id]) => id > 0)
    );

    const { dataValida, hojeBrasil } = require('./pedidoEntregaDomain');
    if (!dataValida(previsaoEntrega) || previsaoEntrega < hojeBrasil()) {
      throw Object.assign(new Error('Confirme a data prevista de entrega dos pedidos (hoje ou futura).'), { statusCode: 400 });
    }
    await require('../models').PedidoCompraEntrega.bulkCreate((pedidoAtualizado.itens || []).map((item) => ({
      pedido_compra_item_id: item.id, pedido_compra_id: pedido.id, previsao: previsaoEntrega, estado: 'OBRA', versao: 1
    })), { transaction });
    await registrarHistoricoPedidoNaSolicitacaoPrincipal({ solicitacao, pedido, usuarioId,
      acao: 'PEDIDO_PREVISAO_CONFIRMADA', descricao: `Previsão inicial de entrega do pedido #${pedido.id}: ${previsaoEntrega}`,
      metadados: { pedido_id: pedido.id, previsao: previsaoEntrega, itens: (pedidoAtualizado.itens || []).map((item) => item.id) }, transaction });

    for (const registro of grupo.registrosAlocacao) {
      const itemPedido = itensPorResposta.get(Number(registro.resposta_item_id || 0));
      await registro.update(
        {
          pedido_compra_id: pedido.id,
          pedido_compra_item_id: itemPedido?.id || null
        },
        { transaction }
      );
      if (itemPedido) {
        await itemPedido.update(
          {
            valor_mercadoria: roundMoney(registro.quantidade_alocada * registro.preco_unitario),
            ipi_valor: roundMoney(registro.ipi_rateado),
            icms_valor: roundMoney(registro.icms_rateado),
            st_valor: roundMoney(registro.st_rateado),
            difal_rateado: roundMoney(registro.difal_rateado),
            frete_rateado: roundMoney(registro.frete_rateado)
          },
          { transaction }
        );
      }
    }

    await recalcularPedidoPorId(pedido.id, transaction);
    const valorFreteRodada = roundMoney(
      grupo.registrosAlocacao.reduce((sum, registro) => sum + asNumber(registro.frete_rateado), 0)
    );
    if (
      ['EMBUTIDO', 'TERCEIRO'].includes(normalizeText(grupo.vinculacaoFornecedor.frete_tipo))
      && valorFreteRodada > 0
    ) {
      const rateiosFrete = grupo.registrosAlocacao.map((registro) => {
        const itemPedido = itensPorResposta.get(Number(registro.resposta_item_id || 0));
        return {
          pedido_compra_item_id: itemPedido?.id || null,
          valor_rateado: roundMoney(registro.frete_rateado)
        };
      }).filter((item) => item.pedido_compra_item_id && item.valor_rateado > 0);
      await registrarFretePedido({
        pedidoId: pedido.id,
        payload: {
          tipo: normalizeText(grupo.vinculacaoFornecedor.frete_tipo),
          momento: 'FECHAMENTO',
          criterio_rateio: 'POR_ITEM',
          rateios: rateiosFrete,
          valor_total: valorFreteRodada,
          data_vencimento: grupo.vinculacaoFornecedor.frete_data_vencimento,
          origem_cotacao_fornecedor_id: grupo.vinculacaoFornecedor.id,
          dados_pagamento: {
            transportador_nome: grupo.vinculacaoFornecedor.frete_transportador_nome || null,
            transportador_cpf_cnpj: grupo.vinculacaoFornecedor.frete_transportador_cpf_cnpj || null,
            origem: 'COTACAO_FORNECEDOR'
          },
          observacoes: `Frete informado na cotacao do fornecedor ${grupo.vinculacaoFornecedor.fornecedor?.nome || grupo.vinculacaoFornecedor.fornecedor_compra_id}`
        },
        usuarioId,
        idempotencyKey: `COTACAO:${grupo.vinculacaoFornecedor.id}:FECHAMENTO:${fechamento.id}:FRETE`,
        permitirSemCredor: true,
        transaction
      });
    }
    await sincronizarRateiosFretesPendentesPedido({
      pedidoId: pedido.id,
      usuarioId,
      motivo: 'Sincronizacao da rodada de fechamento da cotacao',
      transaction
    });
    pedidosCriados.push(await recalcularPedidoPorId(pedido.id, transaction));
  }

  return {
    fechamento,
    replay: false,
    pedidos: pedidosCriados,
    saldo_restante: saldoRestante,
    final: tipoFechamento === 'FINAL'
  };
}

async function encerrarSaldoSolicitacaoCompraSemPedido({
  solicitacaoId,
  usuarioId,
  idempotencyKey = null,
  justificativa,
  transaction
}) {
  const solicitacao = await carregarSolicitacaoPedidos(solicitacaoId, transaction, { incluirPedidos: true });
  if (!solicitacao) {
    throw Object.assign(new Error('Solicitacao de compra nao encontrada.'), {
      statusCode: 404,
      code: 'COMPRA_SOLICITACAO_NAO_ENCONTRADA'
    });
  }

  const scopeIdempotencia = idempotencyKey
    ? `SC:${Number(solicitacaoId)}:SEM_PEDIDO:${String(idempotencyKey).trim().slice(0, 120)}`
    : null;
  const saldos = [...montarMapaSaldosSolicitacao(solicitacao).values()]
    .filter((item) => item.saldo > 0.0001);
  const saldoTotal = roundQty(saldos.reduce((total, item) => total + item.saldo, 0));
  const itensSaldo = saldos.map((item) => ({
    item_tipo: item.item_tipo,
    item_referencia_id: item.item_referencia_id,
    descricao: item.descricao,
    unidade: item.unidade || null,
    quantidade_solicitada: item.quantidade_atual,
    quantidade_comprada: item.quantidade_fechada,
    quantidade_nao_comprada: item.saldo
  }));
  const pedidosPreservados = (solicitacao.pedidos || []).filter(
    (pedido) => !isPedidoCancelado(pedido.status)
  ).length;

  if (scopeIdempotencia) {
    const existente = await SolicitacaoCompraFechamento.findOne({
      where: { idempotency_key: scopeIdempotencia },
      transaction
    });
    if (existente) {
      return {
        fechamento: existente,
        itens_saldo: itensSaldo,
        quantidade_nao_comprada: roundQty(existente.quantidade_nao_comprada),
        pedidos_preservados: pedidosPreservados,
        replay: true
      };
    }
  }

  if (normalizeText(solicitacao.origem) === 'COMPRA_DIRETA') {
    throw Object.assign(new Error('Compra direta nao utiliza encerramento de cotacao sem pedido.'), {
      statusCode: 400,
      code: 'COMPRA_DIRETA_FORA_COTACAO'
    });
  }

  const statusAtual = normalizeText(solicitacao.status);
  if (['CANCELADA', 'CANCELADO', 'INATIVA', 'RECUSADO', 'ENCERRADO'].includes(statusAtual)) {
    throw Object.assign(new Error(`Solicitacao de compra ${statusAtual || 'sem status'} nao permite encerramento sem pedido.`), {
      statusCode: statusAtual === 'ENCERRADO' ? 409 : 400,
      code: statusAtual === 'ENCERRADO' ? 'COMPRA_COTACAO_JA_ENCERRADA' : 'COMPRA_COTACAO_STATUS_INVALIDO'
    });
  }

  const cotacoesAtivas = (solicitacao.fornecedores || []).filter(
    (cotacao) => !['CANCELADA', 'CANCELADO', 'FINALIZADA'].includes(normalizeText(cotacao.status))
  );
  if (!cotacoesAtivas.length) {
    throw Object.assign(new Error('Nao existe cotacao ativa para encerrar sem pedido.'), {
      statusCode: 400,
      code: 'COMPRA_COTACAO_ATIVA_NAO_ENCONTRADA'
    });
  }

  if (saldoTotal <= 0.0001) {
    throw Object.assign(new Error('Nao existe saldo restante para encerrar sem pedido.'), {
      statusCode: 409,
      code: 'COMPRA_COTACAO_SEM_SALDO'
    });
  }

  const ultimaRodada = await SolicitacaoCompraFechamento.findOne({
    where: { solicitacao_compra_id: solicitacao.id },
    order: [['numero_rodada', 'DESC']],
    transaction
  });
  const agora = new Date();
  const statusAnterior = solicitacao.status;
  const fechamento = await SolicitacaoCompraFechamento.create(
    {
      solicitacao_compra_id: solicitacao.id,
      numero_rodada: Number(ultimaRodada?.numero_rodada || 0) + 1,
      tipo: 'SEM_PEDIDO',
      status: 'CONCLUIDO',
      idempotency_key: scopeIdempotencia,
      quantidade_total: 0,
      quantidade_nao_comprada: saldoTotal,
      valor_total: 0,
      justificativa: String(justificativa || '').trim(),
      quantidade_excedente: 0,
      justificativa_excedente: null,
      criado_por: usuarioId || null,
      fechado_em: agora
    },
    { transaction }
  );

  await solicitacao.update(
    { status: 'ENCERRADO', encerrado_em: agora },
    { transaction }
  );

  await SolicitacaoCompraFornecedor.update(
    { status: 'FINALIZADA' },
    {
      where: {
        solicitacao_compra_id: solicitacao.id,
        status: { [Op.notIn]: ['CANCELADA', 'CANCELADO'] }
      },
      transaction
    }
  );

  await registrarLogSolicitacaoCompra({
    solicitacaoCompraId: solicitacao.id,
    usuarioId,
    tipoAcao: 'ENCERRAMENTO_SEM_PEDIDO',
    descricao: `Cotacao encerrada sem novos pedidos. Saldo nao comprado: ${saldoTotal}.`,
    metadados: {
      fechamento_id: fechamento.id,
      numero_rodada: fechamento.numero_rodada,
      tipo_fechamento: fechamento.tipo,
      status_anterior: statusAnterior,
      status_novo: 'ENCERRADO',
      quantidade_nao_comprada: saldoTotal,
      pedidos_preservados: pedidosPreservados,
      justificativa: fechamento.justificativa,
      itens: itensSaldo
    },
    transaction
  });

  await registrarHistoricoCompraNaSolicitacaoPrincipal({
    solicitacao,
    usuarioId,
    acao: 'COTACAO_ENCERRADA_SEM_PEDIDO',
    descricao: `Cotacao encerrada sem gerar novos pedidos. Saldo nao comprado: ${saldoTotal}.`,
    statusAnterior,
    statusNovo: 'ENCERRADO',
    metadados: {
      fechamento_id: fechamento.id,
      numero_rodada: fechamento.numero_rodada,
      quantidade_nao_comprada: saldoTotal,
      pedidos_preservados: pedidosPreservados,
      justificativa: fechamento.justificativa,
      itens: itensSaldo
    },
    transaction
  });

  return {
    fechamento,
    itens_saldo: itensSaldo,
    quantidade_nao_comprada: saldoTotal,
    pedidos_preservados: pedidosPreservados,
    replay: false
  };
}

async function getPedidoStatusFechadoFornecedorConfig() {
  const statusList = await getPedidoCompraStatusConfig();
  const ativo = (statusList || []).filter((item) => item?.ativo !== false);
  const exato = ativo.find((item) => item.codigo === 'FECHADO_FORNECEDOR');
  if (exato) return exato;

  const porNome = ativo.find((item) => {
    const texto = normalizeText(`${item.codigo || ''} ${item.nome || ''}`);
    return texto.includes('FECHADO') && texto.includes('FORNECEDOR');
  });
  if (porNome) return porNome;

  return {
    codigo: 'FECHADO_FORNECEDOR',
    nome: 'Fechado com o fornecedor',
    cor: '#16a34a',
    bloqueia_edicao: true,
    ativo: true
  };
}

async function getPedidoStatusAbertoConfig() {
  const statusList = await getPedidoCompraStatusConfig();
  const ativo = (statusList || []).filter((item) => item?.ativo !== false);
  const aberto = ativo.find((item) => item.codigo === 'ABERTO');
  if (aberto) return aberto;

  const editavel = ativo.find((item) => !item.bloqueia_edicao);
  if (editavel) return editavel;

  return {
    codigo: 'ABERTO',
    nome: 'Aberto',
    cor: '#2563eb',
    bloqueia_edicao: false,
    ativo: true
  };
}

function isPedidoCancelado(status) {
  return normalizeText(status) === 'CANCELADO';
}

function getPedidoStatusValue(pedido) {
  return pedido?.status ?? pedido?.get?.('status') ?? '';
}

function isPedidoFechadoComFornecedorStatus(status, statusFechado) {
  const normalized = normalizeText(status);
  const normalizedConfig = normalizeText(statusFechado?.codigo);
  return (
    normalized === normalizedConfig ||
    normalized === 'FECHADO_FORNECEDOR' ||
    (normalized.includes('FECHADO') && normalized.includes('FORNECEDOR'))
  );
}

async function fecharPedidosDaSolicitacaoCompraAutomaticamente({
  solicitacaoId,
  pedidoIds = null,
  usuarioId,
  transaction
}) {
  const statusFechado = await getPedidoStatusFechadoFornecedorConfig();
  const idsNormalizados = Array.isArray(pedidoIds)
    ? [...new Set(pedidoIds.map(Number).filter((id) => id > 0))]
    : null;
  const pedidos = await PedidoCompra.findAll({
    where: {
      solicitacao_compra_id: Number(solicitacaoId),
      ...(idsNormalizados ? { id: { [Op.in]: idsNormalizados.length ? idsNormalizados : [0] } } : {})
    },
    transaction
  });

  const solicitacao = await SolicitacaoCompra.findByPk(Number(solicitacaoId), {
    transaction,
    attributes: ['id', 'solicitacao_principal_id']
  });

  for (const pedido of pedidos) {
    const statusAnterior = String(pedido.status || '');
    if (statusAnterior === statusFechado.codigo || isPedidoCancelado(statusAnterior)) {
      continue;
    }

    await require('./pedidoEntregaService').assertPrevisaoConfirmada(pedido, transaction);

    await pedido.update(
      {
        status: statusFechado.codigo,
        encerrado_em: new Date()
      },
      { transaction }
    );

    await registrarLogSolicitacaoCompra({
      solicitacaoCompraId: Number(solicitacaoId),
      usuarioId,
      fornecedorCompraId: pedido.fornecedor_compra_id,
      tipoAcao: 'PEDIDO_FECHADO_AUTOMATICAMENTE',
      descricao: `${buildPedidoCodigo(pedido.id)} fechado automaticamente apos encerramento da cotacao`,
      metadados: {
        pedido_compra_id: pedido.id,
        status_anterior: statusAnterior || null,
        status_novo: statusFechado.codigo,
        origem: 'ENCERRAMENTO_COTACAO'
      },
      transaction
    });

    await registrarHistoricoPedidoNaSolicitacaoPrincipal({
      solicitacao,
      pedido,
      usuarioId,
      acao: 'PEDIDO_COMPRA_ENCERRADO',
      descricao: `${buildPedidoCodigo(pedido.id)} fechado automaticamente apos encerramento da cotacao`,
      statusAnterior: statusAnterior || null,
      statusNovo: statusFechado.codigo,
      metadados: {
        automatico: true,
        origem: 'ENCERRAMENTO_COTACAO'
      },
      transaction
    });

    const { sincronizarPedidoFinanceiroAoFechar } = require('./pedidoCompraFinanceiroService');
    await sincronizarPedidoFinanceiroAoFechar({ pedido, usuarioId, transaction });
  }
}

async function isSolicitacaoCompraComPedidosFechadosComFornecedor(solicitacao) {
  if (normalizeText(solicitacao?.status) === 'FECHAMENTO_PARCIAL') {
    return false;
  }
  const statusFechado = await getPedidoStatusFechadoFornecedorConfig();
  const pedidos = Array.isArray(solicitacao?.pedidos)
    ? solicitacao.pedidos
    : await PedidoCompra.findAll({
        where: { solicitacao_compra_id: Number(solicitacao?.id || 0) },
        attributes: ['id', 'status']
      });

  const ativos = pedidos.filter((pedido) => !isPedidoCancelado(getPedidoStatusValue(pedido)));
  return ativos.length > 0 && ativos.every((pedido) => (
    isPedidoFechadoComFornecedorStatus(getPedidoStatusValue(pedido), statusFechado)
  ));
}

async function reabrirPedidoParaCotacao({ pedidoId, usuarioId, motivo, aprovacaoGeoId = null, transaction }) {
  const motivoNormalizado = String(motivo || '').trim();
  if (!motivoNormalizado) {
    throw new Error('Informe o motivo da reabertura.');
  }

  const pedido = await PedidoCompra.findByPk(Number(pedidoId), {
    transaction,
    lock: transaction?.LOCK?.UPDATE
  });
  if (!pedido) {
    throw new Error('Pedido nao encontrado.');
  }

  const statusAnterior = String(pedido.status || '');
  if (isPedidoCancelado(statusAnterior)) {
    throw new Error('Pedido cancelado nao pode ser reaberto.');
  }

  if (aprovacaoGeoId) {
    const aprovacao = await PedidoCompraReabertura.findOne({
      where: {
        id: Number(aprovacaoGeoId),
        pedido_compra_id: pedido.id,
        status: 'APROVADA'
      },
      transaction
    });
    if (!aprovacao) {
      const error = new Error('A aprovacao do GEO para esta reabertura nao foi encontrada.');
      error.statusCode = 409;
      error.code = 'APROVACAO_GEO_INVALIDA';
      throw error;
    }
  } else {
    await assertPedidoPodeReabrirDiretamente(pedido.id, transaction);
  }

  const solicitacao = await SolicitacaoCompra.findByPk(pedido.solicitacao_compra_id, {
    transaction,
    lock: transaction?.LOCK?.UPDATE,
    attributes: ['id', 'status', 'encerrado_em', 'solicitacao_principal_id']
  });

  const bloqueado = await isPedidoCompraStatusLocked(statusAnterior);
  const statusAberto = await getPedidoStatusAbertoConfig();
  const pedidoAberto = !bloqueado && normalizeText(statusAnterior) === normalizeText(statusAberto.codigo);
  const cotacaoEncerrada = isSolicitacaoCompraEncerrada(solicitacao);

  if (pedidoAberto && !cotacaoEncerrada) {
    return pedido;
  }

  if (!pedidoAberto) {
    await pedido.update(
      {
        status: statusAberto.codigo,
        encerrado_em: null,
        ...(pedido.financeiro_fluxo_versao
          ? { status_financeiro: 'NAO_INICIADO', financeiro_atualizado_em: new Date() }
          : {})
      },
      { transaction }
    );
  }

  if (solicitacao && cotacaoEncerrada) {
    await solicitacao.update(
      {
        status: 'FECHAMENTO_PARCIAL',
        encerrado_em: null
      },
      { transaction }
    );
  }

  await registrarLogSolicitacaoCompra({
    solicitacaoCompraId: pedido.solicitacao_compra_id,
    usuarioId,
    fornecedorCompraId: pedido.fornecedor_compra_id,
    tipoAcao: 'PEDIDO_REABERTO_COTACAO',
    descricao: `${buildPedidoCodigo(pedido.id)} reaberto para ajustes na cotacao`,
    metadados: {
      pedido_compra_id: pedido.id,
      status_anterior: statusAnterior || null,
      status_novo: statusAberto.codigo,
      cotacao_reaberta: cotacaoEncerrada,
      motivo: motivoNormalizado
    },
    transaction
  });

  await registrarHistoricoPedidoNaSolicitacaoPrincipal({
    solicitacao,
    pedido,
    usuarioId,
    acao: 'PEDIDO_COMPRA_REABERTO',
    descricao: `${buildPedidoCodigo(pedido.id)} reaberto para ajustes na cotacao. Motivo: ${motivoNormalizado}`,
    statusAnterior: statusAnterior || null,
    statusNovo: statusAberto.codigo,
    metadados: {
      motivo: motivoNormalizado,
      origem: 'REABERTURA_COTACAO',
      cotacao_reaberta: cotacaoEncerrada
    },
    transaction
  });

  await sincronizarStatusSolicitacaoCompraPorSaldo({
    solicitacaoId: pedido.solicitacao_compra_id,
    usuarioId,
    forcarRevisao: true,
    transaction
  });
  await sincronizarStatusCotacoesAposPedido({
    solicitacaoId: pedido.solicitacao_compra_id,
    fornecedorCompraId: pedido.fornecedor_compra_id,
    modo: 'REABERTURA',
    usuarioId,
    transaction
  });

  return pedido;
}

async function criarPedidoParaFornecedor({ solicitacaoId, fornecedorCompraId, usuarioId, transaction }) {
  const solicitacao = await carregarSolicitacaoPedidos(solicitacaoId, transaction);
  if (!solicitacao) {
    throw new Error('Solicitacao de compra nao encontrada.');
  }
  if (isSolicitacaoCompraCancelada(solicitacao.status) || normalizeCotacaoText(solicitacao.status) === 'RECUSADO') {
    throw new Error('Solicitacao de compra cancelada ou recusada nao permite gerar pedidos.');
  }

  const vinculacaoFornecedor = (solicitacao.fornecedores || []).find(
    (item) => Number(item.fornecedor_compra_id) === Number(fornecedorCompraId)
  );

  if (!vinculacaoFornecedor) {
    throw new Error('Fornecedor nao possui cotacao vinculada a esta solicitacao.');
  }

  const pedido = await obterOuCriarPedidoPorFornecedor({
    solicitacao,
    vinculacaoFornecedor,
    usuarioId,
    transaction
  });

  await adicionarRespostasAoPedido({
    pedido,
    solicitacao,
    vinculacaoFornecedor,
    respostaItemIds: [],
    usuarioId,
    acaoLog: 'ITEM_ADICIONADO_FORNECEDOR',
    descricaoLog: 'Item incluido ao criar pedido do fornecedor',
    transaction
  });

  return PedidoCompra.findByPk(pedido.id, {
    transaction,
    include: [
      { model: FornecedorCompra, as: 'fornecedor', attributes: ['id', 'nome', 'email', 'whatsapp'] },
      { model: PedidoCompraItem, as: 'itens' }
    ]
  });
}

async function listarPedidos({
  solicitacaoId,
  obraId,
  status,
  q,
  obraIds = null,
  compradorResponsavelId = null,
  solicitanteId = null,
  visao = null,
  statusFinanceiro = null
} = {}) {
  const where = {};

  if (solicitacaoId) {
    where.solicitacao_compra_id = Number(solicitacaoId);
  }

  if (obraId) {
    where.obra_id = Number(obraId);
  } else if (Array.isArray(obraIds)) {
    where.obra_id = {
      [Op.in]: obraIds.length ? obraIds.map((item) => Number(item)) : [0]
    };
  }

  if (status) {
    where.status = String(status).trim().toUpperCase();
  } else {
    where.status = { [Op.ne]: 'CANCELADO' };
  }

  const solicitacaoScope = [];
  if (Number(compradorResponsavelId || 0) > 0) {
    solicitacaoScope.push({ comprador_responsavel_id: Number(compradorResponsavelId) });
  }
  if (Number(solicitanteId || 0) > 0) {
    solicitacaoScope.push({ solicitante_id: Number(solicitanteId) });
  }

  const solicitacaoWhere = {};
  if (solicitacaoScope.length === 1) {
    Object.assign(solicitacaoWhere, solicitacaoScope[0]);
  } else if (solicitacaoScope.length > 1) {
    solicitacaoWhere[Op.or] = solicitacaoScope;
  }

  const visaoResumo = String(visao || '').trim().toLowerCase() === 'resumo';
  const includes = [
    { model: FornecedorCompra, as: 'fornecedor', attributes: ['id', 'nome', 'email', 'whatsapp'] },
    {
      model: SolicitacaoCompra,
      as: 'solicitacao',
      attributes: ['id', 'status', 'numero_sienge', 'comprador_responsavel_id', 'solicitante_id'],
      where: solicitacaoWhere,
      required: solicitacaoScope.length > 0
    },
    { model: Obra, as: 'obra', attributes: ['id', 'nome', 'codigo'] }
  ];
  if (!visaoResumo) {
    includes.push({
      model: PedidoCompraItem,
      as: 'itens',
      attributes: ['id', 'descricao', 'valor_total', 'removido']
    });
  }

  const pedidos = await PedidoCompra.findAll({
    where,
    include: includes,
    order: [['updatedAt', 'DESC']]
  });

  const filtro = String(q || '').trim().toLowerCase();
  const pedidosFiltrados = pedidos.filter((pedido) => {
    if (!filtro) return true;
    const haystack = [
      buildPedidoCodigo(pedido.id),
      pedido.fornecedor?.nome,
      pedido.solicitacao?.numero_sienge,
      pedido.obra?.nome,
      pedido.id
    ]
      .map((value) => String(value || '').toLowerCase())
      .join(' ');
    return haystack.includes(filtro);
  });

  const { aplicarResumoFinanceiroPedidos } = require('./pedidoCompraFinanceiroService');
  const pedidosComFinanceiro = await aplicarResumoFinanceiroPedidos(pedidosFiltrados);
  const statusFinanceiroNormalizado = normalizeText(statusFinanceiro);
  const pedidosFinais = statusFinanceiroNormalizado
    ? pedidosComFinanceiro.filter((pedido) => normalizeText(pedido.financeiro?.status) === statusFinanceiroNormalizado)
    : pedidosComFinanceiro;

  if (!visaoResumo || pedidosFinais.length === 0) {
    return pedidosFinais;
  }

  const ids = pedidosFinais.map((pedido) => Number(pedido.id));
  const contagens = await PedidoCompraItem.findAll({
    where: {
      pedido_compra_id: { [Op.in]: ids },
      removido: false
    },
    attributes: [
      'pedido_compra_id',
      [fn('COUNT', col('id')), 'total']
    ],
    group: ['pedido_compra_id'],
    raw: true
  });
  const mapaContagens = new Map(
    contagens.map((row) => [Number(row.pedido_compra_id), Number(row.total || 0)])
  );

  return pedidosFinais.map((pedido) => ({
    ...pedido,
    itens_ativos_count: Number(mapaContagens.get(Number(pedido.id)) || 0)
  }));
}

async function listarAuditoriaItensPedido({ obraId, pedidoId, itemId, acao, q, obraIds = null } = {}) {
  const where = {};
  const pedidoWhere = {};

  if (pedidoId) {
    where.pedido_compra_id = Number(pedidoId);
  }

  if (itemId) {
    where.pedido_compra_item_id = Number(itemId);
  }

  if (acao) {
    where.acao = String(acao).trim().toUpperCase();
  }

  if (obraId) {
    pedidoWhere.obra_id = Number(obraId);
  } else if (Array.isArray(obraIds)) {
    pedidoWhere.obra_id = {
      [Op.in]: obraIds.length ? obraIds.map((entry) => Number(entry)) : [0]
    };
  }

  const logs = await PedidoCompraItemLog.findAll({
    where,
    include: [
      {
        model: PedidoCompra,
        as: 'pedido',
        where: pedidoWhere,
        required: true,
        attributes: ['id', 'obra_id', 'solicitacao_compra_id', 'status', 'updatedAt'],
        include: [
          { model: FornecedorCompra, as: 'fornecedor', attributes: ['id', 'nome'] },
          { model: Obra, as: 'obra', attributes: ['id', 'nome', 'codigo'] },
          { model: SolicitacaoCompra, as: 'solicitacao', attributes: ['id', 'numero_sienge'] }
        ]
      },
      {
        model: PedidoCompraItem,
        as: 'item',
        attributes: ['id', 'descricao', 'origem', 'unidade', 'quantidade_pedido', 'preco_unitario', 'removido']
      },
      { model: User, as: 'usuario', attributes: ['id', 'nome'] }
    ],
    order: [['createdAt', 'DESC']]
  });

  const filtro = String(q || '').trim().toLowerCase();
  const logsFiltrados = !filtro
    ? logs
    : logs.filter((log) => {
        const haystack = [
          log.descricao,
          log.acao,
          log.pedido?.fornecedor?.nome,
          log.pedido?.obra?.nome,
          log.pedido?.obra?.codigo,
          log.item?.descricao,
          log.usuario?.nome,
          buildPedidoCodigo(log.pedido?.id)
        ]
          .map((value) => String(value || '').toLowerCase())
          .join(' ');

        return haystack.includes(filtro);
      });

  return logsFiltrados.map((log) => ({
    id: log.id,
    acao: log.acao,
    descricao: log.descricao,
    createdAt: log.createdAt,
    dados_anteriores: log.dados_anteriores,
    dados_novos: log.dados_novos,
    usuario: log.usuario ? { id: log.usuario.id, nome: log.usuario.nome } : null,
    pedido: log.pedido
      ? {
          id: log.pedido.id,
          codigo: buildPedidoCodigo(log.pedido.id),
          status: log.pedido.status,
          fornecedor: log.pedido.fornecedor || null,
          obra: log.pedido.obra || null,
          solicitacao: log.pedido.solicitacao || null
        }
      : null,
    item: log.item
      ? {
          id: log.item.id,
          descricao: log.item.descricao,
          origem: log.item.origem,
          unidade: log.item.unidade,
          quantidade_pedido: log.item.quantidade_pedido,
          preco_unitario: log.item.preco_unitario,
          removido: Boolean(log.item.removido)
        }
      : null
  }));
}

async function obterPedidoDetalhe(id, { obraIdsHistoricoPreco = null } = {}) {
  const pedido = await PedidoCompra.findByPk(id, {
    include: [
      { model: FornecedorCompra, as: 'fornecedor', attributes: ['id', 'nome', 'email', 'whatsapp', 'contato', 'parceiro_id'] },
      {
        model: Obra,
        as: 'obra',
        attributes: [
          'id',
          'nome',
          'codigo',
          'cno',
          'endereco_logradouro',
          'endereco_numero',
          'endereco_complemento',
          'endereco_bairro',
          'endereco_cep',
          'endereco_uf'
        ]
      },
      { model: User, as: 'criador', attributes: ['id', 'nome', 'email'] },
      { model: User, as: 'responsavel', attributes: ['id', 'nome', 'email'] },
      {
        model: SolicitacaoCompraFechamento,
        as: 'fechamento',
        attributes: [
          'id',
          'numero_rodada',
          'tipo',
          'status',
          'justificativa',
          'quantidade_excedente',
          'justificativa_excedente'
        ],
        required: false
      },
        {
          model: SolicitacaoCompra,
          as: 'solicitacao',
          attributes: [
            'id',
            'status',
            'obra_id',
            'origem',
            'solicitacao_principal_id',
            'numero_sienge',
            'necessario_para',
            'comprador_responsavel_id',
            'solicitante_id',
            'encerrado_em'
          ]
        },
      {
        model: PedidoCompraItem,
        as: 'itens',
        include: [
          {
            model: SolicitacaoCompraItem,
            as: 'itemCadastrado',
            attributes: ['id', 'insumo_id']
          },
          {
            model: SolicitacaoCompraRespostaItem,
            as: 'respostaItem',
            include: [
              {
                model: SolicitacaoCompraFornecedor,
                as: 'cotacaoFornecedor',
                include: [{ model: FornecedorCompra, as: 'fornecedor', attributes: ['id', 'nome'] }]
              }
            ]
          },
          {
            model: PedidoCompraItemLog,
            as: 'logs',
            include: [{ model: User, as: 'usuario', attributes: ['id', 'nome'] }]
          }
        ]
      },
      {
        model: PedidoCompraFrete,
        as: 'fretes',
        include: [
          {
            model: FornecedorCompra,
            as: 'fornecedor',
            attributes: ['id', 'nome', 'cnpj', 'email', 'whatsapp', 'contato', 'parceiro_id'],
            required: false
          },
          {
            model: Parceiro,
            as: 'parceiro',
            attributes: ['id', 'nome', 'cpf_cnpj', 'fornecedor', 'ativo'],
            required: false
          },
          {
            model: TituloFinanceiro,
            as: 'tituloFinanceiro',
            attributes: ['id', 'codigo', 'status', 'valor_original', 'data_vencimento'],
            required: false
          },
          { model: User, as: 'registradoPor', attributes: ['id', 'nome', 'email'] },
          {
            model: PedidoCompraFreteRateio,
            as: 'rateios',
            include: [{ model: PedidoCompraItem, as: 'item', attributes: ['id', 'descricao', 'unidade', 'quantidade_pedido', 'valor_total'] }]
          }
        ]
      }
    ]
  });

  if (!pedido) {
    return null;
  }

  const statusConfig = await findPedidoCompraStatusConfig(pedido.status);
  const bloqueadoPorStatus = Boolean(statusConfig?.bloqueia_edicao);
  const cotacaoEncerradaMinima = isSolicitacaoCompraEncerrada(pedido.solicitacao);
  const precisaSolicitacaoOperacional = !bloqueadoPorStatus && !cotacaoEncerradaMinima;
  const solicitacao = precisaSolicitacaoOperacional
    ? await carregarSolicitacaoPedidos(pedido.solicitacao_compra_id, null, { incluirPedidos: false })
    : pedido.solicitacao;
  const cotacaoEncerrada = cotacaoEncerradaMinima || isSolicitacaoCompraEncerrada(solicitacao);
  const edicaoBloqueada = Boolean(statusConfig?.bloqueia_edicao || cotacaoEncerrada);
  const respostaIdsAtuais = new Set(
    (pedido.itens || [])
      .filter((item) => !item.removido)
      .map((item) => Number(item.resposta_item_id || 0))
      .filter((idAtual) => idAtual > 0)
  );

  const vinculacaoFornecedor = (solicitacao?.fornecedores || []).find(
    (item) => Number(item.fornecedor_compra_id) === Number(pedido.fornecedor_compra_id)
  );
  const mapaAlocacoesFornecedorItem = montarMapaAlocacoesAtivasPorFornecedorItem(
    solicitacao?.alocacoes || []
  );
  const mapaAlocacoesResposta = montarMapaAlocacoesAtivasPorResposta(solicitacao?.alocacoes || []);

  const candidatos = edicaoBloqueada
    ? []
    : (vinculacaoFornecedor?.respostas || [])
      .filter((resposta) => Boolean(resposta.disponivel) && asNumber(resposta.preco) > 0)
      .filter((resposta) => !respostaIdsAtuais.has(Number(resposta.id)))
      .map((resposta) => {
        const baseItem = obterBaseItemPorResposta(solicitacao, resposta);
        return {
          resposta_item_id: resposta.id,
          descricao: baseItem?.descricao || 'Item',
          unidade: baseItem?.unidade || null,
          quantidade_solicitada: baseItem?.quantidade_solicitada || 0,
          quantidade_minima_item: resposta.quantidade_minima_item || null,
          preco_unitario: resposta.preco,
          prazo: resposta.prazo || '',
          observacao: resposta.observacao || ''
        };
      });

  const candidatosRemanejamento = edicaoBloqueada
    ? []
    : (solicitacao?.fornecedores || [])
      .flatMap((fornecedor) => (fornecedor.respostas || []).map((resposta) => ({ fornecedor, resposta })))
      .filter(({ fornecedor, resposta }) => (
        fornecedorRespondeuCotacao(fornecedor) &&
        Number(fornecedor.fornecedor_compra_id) !== Number(pedido.fornecedor_compra_id) &&
        Boolean(resposta.disponivel) &&
        asNumber(resposta.preco) > 0
      ))
      .map(({ fornecedor, resposta }) => {
        const baseItem = obterBaseItemPorResposta(solicitacao, resposta);
        const disponibilidade = calcularDisponibilidadeFornecedorItem({
          fornecedorCompraId: fornecedor.fornecedor_compra_id,
          item: resposta,
          quantidadeDisponivel: resposta.quantidade_disponivel ?? baseItem?.quantidade_solicitada,
          mapaAlocacoesFornecedorItem,
          mapaAlocacoesResposta
        });
        return {
          resposta_item_id: resposta.id,
          fornecedor_id: fornecedor.fornecedor_compra_id,
          fornecedor_nome: fornecedor.fornecedor?.nome || fornecedor.nome || 'Fornecedor',
          item_tipo: baseItem?.item_tipo || normalizeText(resposta.item_tipo),
          solicitacao_compra_item_id: baseItem?.solicitacao_compra_item_id || null,
          solicitacao_compra_item_manual_id: baseItem?.solicitacao_compra_item_manual_id || null,
          item_key: buildItemKeyFromResposta(resposta),
          descricao: baseItem?.descricao || 'Item',
          unidade: baseItem?.unidade || null,
          quantidade_solicitada: baseItem?.quantidade_solicitada || 0,
          quantidade_minima_item: resposta.quantidade_minima_item || null,
          quantidade_disponivel: disponibilidade.quantidade_disponivel,
          quantidade_alocada: disponibilidade.quantidade_alocada,
          saldo_disponivel_fornecedor: disponibilidade.saldo_disponivel,
          preco_unitario: resposta.preco,
          prazo: resposta.prazo || '',
          observacao: resposta.observacao || ''
        };
      })
      .filter((candidato) => candidato.saldo_disponivel_fornecedor > 0);

  const ultimoPrecoPorInsumo = await buscarUltimosPrecosPorInsumo(
    (pedido.itens || []).map((item) => item.itemCadastrado?.insumo_id),
    obraIdsHistoricoPreco,
    pedido.solicitacao_compra_id
  );

  const itens = (pedido.itens || []).map((item) => {
    const itemJson = item.toJSON();
    const { itemCadastrado, ...itemData } = itemJson;
    const insumoId = Number(itemCadastrado?.insumo_id || 0) || null;

    return {
      ...itemData,
      contexto_preco: {
        insumo_id: insumoId,
        preco_cotado: itemJson.respostaItem?.preco != null ? roundMoney(itemJson.respostaItem.preco) : null,
        ultimo_preco_compra: insumoId ? (ultimoPrecoPorInsumo.get(insumoId) ?? null) : null
      }
    };
  });
  const fretes = (pedido.fretes || []).map((frete) => {
    const data = typeof frete.toJSON === 'function' ? frete.toJSON() : frete;
    return {
      ...data,
      valor_total: roundMoney(data.valor_total),
      dados_pagamento: safeJsonParse(data.dados_pagamento, data.dados_pagamento || null),
      pendente_financeiro: normalizeText(data.status_financeiro) === 'PENDENTE_TITULO',
      rateios: (data.rateios || []).map((rateio) => ({
        ...rateio,
        valor_item_base: roundMoney(rateio.valor_item_base),
        valor_rateado: roundMoney(rateio.valor_rateado),
        percentual_rateio: Number(rateio.percentual_rateio || 0)
      }))
    };
  });

  const { obterResumoFinanceiroPedido } = require('./pedidoCompraFinanceiroService');
  const financeiro = await obterResumoFinanceiroPedido(pedido, { incluirDetalhes: true });

  return {
    ...pedido.toJSON(),
    itens,
    fretes,
    status_configuracao: statusConfig,
    edicao_bloqueada: edicaoBloqueada,
    edicao_bloqueada_motivo: edicaoBloqueada && cotacaoEncerrada && !statusConfig?.bloqueia_edicao
      ? 'COTACAO_ENCERRADA'
      : null,
    candidatos_adicao: candidatos,
    candidatos_remanejamento: candidatosRemanejamento,
    financeiro
  };
}

async function atualizarPedidoItem({ pedidoId, itemId, payload, usuarioId, transaction }) {
  await assertPedidoEditavel(pedidoId, transaction);
  if (payload.quantidade_pedido !== undefined) await assertItensSemRecebimento([Number(itemId)], transaction);

  const item = await PedidoCompraItem.findOne({
    where: {
      id: Number(itemId),
      pedido_compra_id: Number(pedidoId)
    },
    transaction
  });

  if (!item) {
    throw new Error('Item do pedido nao encontrado.');
  }

  const anterior = item.toJSON();
  const quantidadePedido = payload.quantidade_pedido !== undefined
    ? roundPedidoQty(payload.quantidade_pedido)
    : roundPedidoQty(item.quantidade_pedido);
  const precoUnitario = payload.preco_unitario !== undefined
    ? roundMoney(payload.preco_unitario)
    : roundMoney(item.preco_unitario);

  await item.update(
    {
      quantidade_pedido: quantidadePedido,
      preco_unitario: precoUnitario,
      valor_total: roundMoney(quantidadePedido * precoUnitario),
      observacoes: payload.observacoes !== undefined ? (payload.observacoes || null) : item.observacoes
    },
    { transaction }
  );

  await registrarLogPedidoItem({
    pedidoCompraId: Number(pedidoId),
    pedidoCompraItemId: item.id,
    usuarioId,
    acao: 'AJUSTE_MANUAL',
    descricao: `Item ${item.descricao} ajustado manualmente`,
    dadosAnteriores: {
      quantidade_pedido: anterior.quantidade_pedido,
      preco_unitario: anterior.preco_unitario,
      observacoes: anterior.observacoes
    },
    dadosNovos: {
      quantidade_pedido: item.quantidade_pedido,
      preco_unitario: item.preco_unitario,
      observacoes: item.observacoes
    },
    transaction
  });

  return recalcularPedidoPorId(pedidoId, transaction);
}

async function removerPedidoItem({ pedidoId, itemId, usuarioId, transaction }) {
  await assertPedidoEditavel(pedidoId, transaction);
  await assertItensSemRecebimento([Number(itemId)], transaction);

  const item = await PedidoCompraItem.findOne({
    where: {
      id: Number(itemId),
      pedido_compra_id: Number(pedidoId)
    },
    transaction
  });

  if (!item) {
    throw new Error('Item do pedido nao encontrado.');
  }

  if (!item.removido) {
    await item.update({ removido: true }, { transaction });
    await registrarLogPedidoItem({
      pedidoCompraId: Number(pedidoId),
      pedidoCompraItemId: item.id,
      usuarioId,
      acao: 'REMOVIDO',
      descricao: `Item ${item.descricao} removido do pedido`,
      dadosAnteriores: {
        removido: false,
        quantidade_pedido: item.quantidade_pedido,
        preco_unitario: item.preco_unitario
      },
      dadosNovos: {
        removido: true
      },
      transaction
    });
  }

  return recalcularPedidoPorId(pedidoId, transaction);
}

async function adicionarRespostaAoPedido({ pedidoId, respostaItemId, usuarioId, transaction }) {
  const pedido = await PedidoCompra.findByPk(pedidoId, { transaction });
  if (!pedido) {
    throw new Error('Pedido nao encontrado.');
  }

  await assertPedidoEditavel(pedido, transaction);

  const solicitacao = await carregarSolicitacaoPedidos(pedido.solicitacao_compra_id, transaction);
  const vinculacaoFornecedor = (solicitacao?.fornecedores || []).find(
    (item) => Number(item.fornecedor_compra_id) === Number(pedido.fornecedor_compra_id)
  );

  if (!vinculacaoFornecedor) {
    throw new Error('Fornecedor do pedido nao esta vinculado a cotacao.');
  }

  return adicionarRespostasAoPedido({
    pedido,
    solicitacao,
    vinculacaoFornecedor,
    respostaItemIds: [Number(respostaItemId)],
    usuarioId,
    acaoLog: 'ITEM_ADICIONADO_MANUAL',
    descricaoLog: 'Item adicionado manualmente ao pedido',
    transaction
  });
}

async function atualizarStatusPedido({ pedidoId, status, usuarioId, transaction }) {
  const pedido = await PedidoCompra.findByPk(Number(pedidoId), { transaction });
  if (!pedido) {
    throw new Error('Pedido nao encontrado.');
  }

  const statusList = await getPedidoCompraStatusConfig();
  const normalizedStatus = normalizeStatusCode(status);
  const statusConfig = statusList.find(
    (item) => item.codigo === normalizedStatus && item.ativo !== false
  );

  if (!statusConfig) {
    throw new Error('Status do pedido invalido ou inativo.');
  }

  const statusAnterior = String(pedido.status || '');
  if (statusAnterior === statusConfig.codigo) {
    return pedido;
  }
  if (isPedidoCancelado(statusAnterior)) {
    throw new Error('Pedido cancelado nao pode ter o status alterado.');
  }

  if (statusConfig.codigo === 'FECHADO_FORNECEDOR') {
    await require('./pedidoEntregaService').assertPrevisaoConfirmada(pedido, transaction);
  }

  await pedido.update(
    {
      status: statusConfig.codigo,
      encerrado_em: statusConfig.bloqueia_edicao ? new Date() : null
    },
    { transaction }
  );

  await registrarLogSolicitacaoCompra({
    solicitacaoCompraId: pedido.solicitacao_compra_id,
    usuarioId,
    fornecedorCompraId: pedido.fornecedor_compra_id,
    tipoAcao: 'PEDIDO_STATUS_ALTERADO',
    descricao: `${buildPedidoCodigo(pedido.id)} alterado de ${statusAnterior || '-'} para ${statusConfig.codigo}`,
    metadados: {
      pedido_compra_id: pedido.id,
      status_anterior: statusAnterior || null,
      status_novo: statusConfig.codigo,
      bloqueia_edicao: statusConfig.bloqueia_edicao
    },
    transaction
  });

  const solicitacao = await SolicitacaoCompra.findByPk(pedido.solicitacao_compra_id, {
    transaction,
    attributes: ['id', 'solicitacao_principal_id']
  });
  const isStatusFinal = Boolean(statusConfig.bloqueia_edicao) || ['ENCERRADO', 'CANCELADO'].includes(statusConfig.codigo);
  const statusSolicitacaoCompra = `PEDIDO_${statusConfig.codigo}`;

  if (solicitacao && !pedido.fechamento_id) {
    await SolicitacaoCompra.update(
      { status: statusSolicitacaoCompra },
      { where: { id: solicitacao.id }, transaction }
    );

    if (Number(solicitacao.solicitacao_principal_id || 0) > 0) {
      await Solicitacao.update(
        { status_global: statusSolicitacaoCompra },
        { where: { id: solicitacao.solicitacao_principal_id }, transaction }
      );
    }
  } else if (solicitacao) {
    await sincronizarStatusSolicitacaoCompraPorSaldo({
      solicitacaoId: solicitacao.id,
      usuarioId,
      forcarRevisao: !statusConfig.bloqueia_edicao,
      transaction
    });
  }
  if (solicitacao) {
    await sincronizarStatusCotacoesAposPedido({
      solicitacaoId: solicitacao.id,
      fornecedorCompraId: pedido.fornecedor_compra_id,
      modo: 'STATUS_PEDIDO',
      usuarioId,
      transaction
    });
  }

  await registrarHistoricoPedidoNaSolicitacaoPrincipal({
    solicitacao,
    pedido,
    usuarioId,
    acao: isStatusFinal ? 'PEDIDO_COMPRA_ENCERRADO' : 'PEDIDO_COMPRA_STATUS_ALTERADO',
    descricao: `${buildPedidoCodigo(pedido.id)} ${isStatusFinal ? 'finalizado' : 'alterado'} de ${statusAnterior || '-'} para ${statusConfig.codigo}`,
    statusAnterior: statusAnterior || null,
    statusNovo: statusConfig.codigo,
    metadados: {
      status_anterior: statusAnterior || null,
      status_novo: statusConfig.codigo,
      bloqueia_edicao: statusConfig.bloqueia_edicao
    },
    transaction
  });

  if (statusConfig.codigo === 'FECHADO_FORNECEDOR') {
    const { sincronizarPedidoFinanceiroAoFechar } = require('./pedidoCompraFinanceiroService');
    await sincronizarPedidoFinanceiroAoFechar({ pedido, usuarioId, transaction });
  }

  return pedido;
}

async function assertPedidoPodeReabrirDiretamente(pedidoId, transaction) {
  const pedidoCompraId = Number(pedidoId);
  const [vinculosNovos, alocacoesHistoricas, fretesHistoricos] = await Promise.all([
    PedidoCompraTitulo.count({ where: { pedido_compra_id: pedidoCompraId }, transaction }),
    SolicitacaoCompraAlocacao.count({
      where: { pedido_compra_id: pedidoCompraId, titulo_financeiro_id: { [Op.ne]: null } },
      transaction
    }),
    PedidoCompraFrete.count({
      where: { pedido_compra_id: pedidoCompraId, titulo_financeiro_id: { [Op.ne]: null } },
      transaction
    })
  ]);

  if (vinculosNovos > 0 || alocacoesHistoricas > 0 || fretesHistoricos > 0) {
    const error = new Error('Este pedido possui historico financeiro. Solicite a aprovacao do GEO para reabri-lo.');
    error.statusCode = 409;
    error.code = 'REABERTURA_EXIGE_APROVACAO_GEO';
    throw error;
  }
}

async function assertPedidoSemVinculoFinanceiroParaCancelamento(pedidoId, transaction) {
  const pedidoCompraId = Number(pedidoId);
  const [alocacoesComTitulo, fretesComTitulo, titulosNovoFluxoAtivos] = await Promise.all([
    SolicitacaoCompraAlocacao.count({
      where: {
        pedido_compra_id: pedidoCompraId,
        titulo_financeiro_id: { [Op.ne]: null },
        [Op.or]: [
          { status: { [Op.ne]: 'CANCELADA' } },
          { status: null }
        ]
      },
      transaction
    }),
    PedidoCompraFrete.count({
      where: {
        pedido_compra_id: pedidoCompraId,
        [Op.and]: [
          {
            [Op.or]: [
              { status_financeiro: { [Op.ne]: 'CANCELADO' } },
              { status_financeiro: null }
            ]
          },
          {
            [Op.or]: [
              { titulo_financeiro_id: { [Op.ne]: null } },
              { status_financeiro: 'TITULO_GERADO' }
            ]
          }
        ]
      },
      transaction
    }),
    PedidoCompraTitulo.count({
      where: { pedido_compra_id: pedidoCompraId },
      include: [{
        model: TituloFinanceiro,
        as: 'titulo',
        required: true,
        where: { status: { [Op.notIn]: ['CANCELADO', 'ESTORNADO'] } }
      }],
      transaction
    })
  ]);

  if (alocacoesComTitulo > 0 || fretesComTitulo > 0 || titulosNovoFluxoAtivos > 0) {
    throw new Error('Este pedido possui titulo financeiro vinculado. Estorne ou cancele o financeiro antes de alterar o pedido.');
  }
}

async function assertItensPedidoSemVinculoFinanceiroParaCancelamento(itemIds = [], transaction) {
  const ids = [...new Set((Array.isArray(itemIds) ? itemIds : [itemIds])
    .map(Number)
    .filter((itemId) => itemId > 0))];
  if (!ids.length) return;

  const alocacoesComTitulo = await SolicitacaoCompraAlocacao.count({
    where: {
      pedido_compra_item_id: { [Op.in]: ids },
      titulo_financeiro_id: { [Op.ne]: null },
      status: 'ATIVA'
    },
    transaction
  });

  if (alocacoesComTitulo > 0) {
    throw new Error('Um ou mais itens selecionados possuem titulo financeiro vinculado. Trate o financeiro antes de cancelar ou remanejar.');
  }
}

async function cancelarFretesPendentesSemTituloDoPedido(pedidoId, transaction) {
  const [fretesCancelados] = await PedidoCompraFrete.update(
    { status_financeiro: 'CANCELADO' },
    {
      where: {
        pedido_compra_id: Number(pedidoId),
        titulo_financeiro_id: null,
        [Op.or]: [
          { status_financeiro: { [Op.ne]: 'CANCELADO' } },
          { status_financeiro: null }
        ]
      },
      transaction
    }
  );
  return Number(fretesCancelados || 0);
}

async function cancelarPedidoCompra({ pedidoId, motivo, usuarioId, transaction }) {
  const pedido = await PedidoCompra.findByPk(Number(pedidoId), {
    transaction,
    lock: transaction?.LOCK?.UPDATE
  });
  if (!pedido) {
    throw new Error('Pedido de compra nao encontrado.');
  }
  if (isPedidoCancelado(pedido.status)) {
    throw new Error('Pedido de compra ja esta cancelado.');
  }
  const motivoNormalizado = String(motivo || '').trim();
  if (!motivoNormalizado) {
    throw new Error('Informe o motivo do cancelamento do pedido.');
  }

  await assertPedidoSemVinculoFinanceiroParaCancelamento(pedido.id, transaction);

  const itensComEntrega = await PedidoCompraItem.findAll({ where: { pedido_compra_id: pedido.id }, attributes: ['id'], transaction });
  await assertItensSemRecebimento(itensComEntrega.map((i) => i.id), transaction);

  const statusAnterior = pedido.status;

  await pedido.update(
    {
      status: 'CANCELADO',
      cancelado_por: usuarioId || null,
      cancelado_em: new Date(),
      encerrado_em: new Date(),
      motivo_cancelamento: motivoNormalizado
    },
    { transaction }
  );

  const itens = await PedidoCompraItem.findAll({
    where: { pedido_compra_id: pedido.id, removido: false },
    transaction
  });

  for (const item of itens) {
    await item.update(
      {
        removido: true,
        quantidade_cancelada: item.quantidade_pedido,
        cancelado_por: usuarioId || null,
        cancelado_em: new Date(),
        motivo_cancelamento: motivoNormalizado
      },
      { transaction }
    );

    await registrarLogPedidoItem({
      pedidoCompraId: pedido.id,
      pedidoCompraItemId: item.id,
      usuarioId,
      acao: 'PEDIDO_CANCELADO',
      descricao: `Item ${item.descricao} cancelado junto com o pedido`,
      dadosAnteriores: { removido: false, quantidade_pedido: item.quantidade_pedido },
      dadosNovos: { removido: true, motivo: motivoNormalizado },
      transaction
    });
  }

  await SolicitacaoCompraAlocacao.update(
    {
      status: 'CANCELADA',
      cancelado_por: usuarioId || null,
      cancelado_em: new Date(),
      motivo_cancelamento: motivoNormalizado
    },
    { where: { pedido_compra_id: pedido.id, status: 'ATIVA' }, transaction }
  );

  const fretesCancelados = await cancelarFretesPendentesSemTituloDoPedido(pedido.id, transaction);

  await registrarLogSolicitacaoCompra({
    solicitacaoCompraId: pedido.solicitacao_compra_id,
    usuarioId,
    fornecedorCompraId: pedido.fornecedor_compra_id,
    tipoAcao: 'PEDIDO_CANCELADO',
    descricao: `${buildPedidoCodigo(pedido.id)} cancelado: ${motivoNormalizado}`,
    metadados: {
      pedido_compra_id: pedido.id,
      motivo: motivoNormalizado,
      fretes_cancelados: Number(fretesCancelados || 0)
    },
    transaction
  });

  const solicitacao = await SolicitacaoCompra.findByPk(pedido.solicitacao_compra_id, { transaction });
  await registrarHistoricoPedidoNaSolicitacaoPrincipal({
    solicitacao,
    pedido,
    usuarioId,
    acao: 'PEDIDO_COMPRA_CANCELADO',
    descricao: `${buildPedidoCodigo(pedido.id)} cancelado: ${motivoNormalizado}`,
    statusAnterior,
    statusNovo: 'CANCELADO',
    metadados: {
      motivo: motivoNormalizado,
      fretes_cancelados: Number(fretesCancelados || 0)
    },
    transaction
  });

  await sincronizarStatusFechamentoPorPedido(pedido, transaction);
  await sincronizarStatusSolicitacaoCompraPorSaldo({
    solicitacaoId: pedido.solicitacao_compra_id,
    usuarioId,
    transaction
  });
  await sincronizarStatusCotacoesAposPedido({
    solicitacaoId: pedido.solicitacao_compra_id,
    fornecedorCompraId: pedido.fornecedor_compra_id,
    modo: 'STATUS_PEDIDO',
    usuarioId,
    transaction
  });

  return recalcularPedidoPorId(pedido.id, transaction);
}

async function cancelarFluxoPedidoCompra({
  pedidoId,
  motivo,
  usuarioId,
  cancelarCotacao = false,
  cancelarSolicitacaoCompra = false,
  cancelarSolicitacaoPrincipal = false,
  transaction
}) {
  const motivoNormalizado = String(motivo || '').trim();
  if (!motivoNormalizado) {
    throw new Error('Informe o motivo do cancelamento do pedido.');
  }

  const pedidoCancelado = await cancelarPedidoCompra({
    pedidoId,
    motivo: motivoNormalizado,
    usuarioId,
    transaction
  });

  const solicitacaoCompra = await SolicitacaoCompra.findByPk(Number(pedidoCancelado.solicitacao_compra_id), {
    transaction,
    lock: transaction?.LOCK?.UPDATE
  });

  if (!solicitacaoCompra) {
    return pedidoCancelado;
  }

  if (cancelarCotacao) {
    await SolicitacaoCompraFornecedor.update(
      {
        status: 'CANCELADA'
      },
      {
        where: {
          solicitacao_compra_id: solicitacaoCompra.id,
          status: { [Op.notIn]: ['CANCELADA', 'CANCELADO'] }
        },
        transaction
      }
    );

    await registrarLogSolicitacaoCompra({
      solicitacaoCompraId: solicitacaoCompra.id,
      usuarioId,
      tipoAcao: 'COTACAO_CANCELADA',
      descricao: `Cotacao cancelada junto com ${buildPedidoCodigo(pedidoCancelado.id)}: ${motivoNormalizado}`,
      metadados: {
        pedido_compra_id: pedidoCancelado.id,
        motivo: motivoNormalizado
      },
      transaction
    });

    await registrarHistoricoCompraNaSolicitacaoPrincipal({
      solicitacao: solicitacaoCompra,
      usuarioId,
      acao: 'COTACAO_COMPRA_CANCELADA',
      descricao: `Cotacao da ${solicitacaoCompra.codigo || `SC-${String(solicitacaoCompra.id).padStart(5, '0')}`} cancelada: ${motivoNormalizado}`,
      statusAnterior: solicitacaoCompra.status,
      statusNovo: cancelarSolicitacaoCompra ? 'CANCELADA' : solicitacaoCompra.status,
      metadados: {
        pedido_compra_id: pedidoCancelado.id,
        motivo: motivoNormalizado
      },
      transaction
    });
  }

  if (cancelarSolicitacaoCompra) {
    const statusAnteriorCompra = solicitacaoCompra.status;
    await solicitacaoCompra.update(
      {
        status: 'CANCELADA',
        encerrado_em: new Date()
      },
      { transaction }
    );

    await registrarLogSolicitacaoCompra({
      solicitacaoCompraId: solicitacaoCompra.id,
      usuarioId,
      tipoAcao: 'SOLICITACAO_COMPRA_CANCELADA',
      descricao: `${solicitacaoCompra.codigo || `SC-${String(solicitacaoCompra.id).padStart(5, '0')}`} cancelada junto com ${buildPedidoCodigo(pedidoCancelado.id)}: ${motivoNormalizado}`,
      metadados: {
        pedido_compra_id: pedidoCancelado.id,
        motivo: motivoNormalizado
      },
      transaction
    });

    await registrarHistoricoCompraNaSolicitacaoPrincipal({
      solicitacao: solicitacaoCompra,
      usuarioId,
      acao: 'SOLICITACAO_COMPRA_CANCELADA',
      descricao: `${solicitacaoCompra.codigo || `SC-${String(solicitacaoCompra.id).padStart(5, '0')}`} cancelada: ${motivoNormalizado}`,
      statusAnterior: statusAnteriorCompra,
      statusNovo: 'CANCELADA',
      metadados: {
        pedido_compra_id: pedidoCancelado.id,
        motivo: motivoNormalizado
      },
      transaction
    });
  }

  if (cancelarSolicitacaoPrincipal) {
    const solicitacaoPrincipalId = Number(solicitacaoCompra.solicitacao_principal_id || 0);
    if (solicitacaoPrincipalId) {
      const titulosAtivos = await TituloFinanceiro.count({
        where: {
          solicitacao_id: solicitacaoPrincipalId,
          deleted_at: null
        },
        transaction
      });

      if (titulosAtivos > 0) {
        throw new Error('A solicitacao principal possui titulo financeiro vinculado. Cancele apenas o pedido/compra ou trate o financeiro antes.');
      }

      const solicitacaoPrincipal = await Solicitacao.findByPk(solicitacaoPrincipalId, {
        transaction,
        lock: transaction?.LOCK?.UPDATE
      });

      if (solicitacaoPrincipal && normalizeText(solicitacaoPrincipal.status_global) !== 'CANCELADA') {
        const statusAnteriorPrincipal = solicitacaoPrincipal.status_global;
        await solicitacaoPrincipal.update(
          {
            status_global: 'CANCELADA'
          },
          { transaction }
        );

        await Historico.create(
          {
            solicitacao_id: solicitacaoPrincipal.id,
            usuario_responsavel_id: usuarioId || null,
            setor: 'COMPRAS',
            acao: 'SOLICITACAO_CANCELADA_POR_COMPRA',
            status_anterior: statusAnteriorPrincipal || null,
            status_novo: 'CANCELADA',
            observacao: `Solicitacao cancelada junto com ${buildPedidoCodigo(pedidoCancelado.id)}: ${motivoNormalizado}`,
            descricao: `Solicitacao cancelada junto com ${buildPedidoCodigo(pedidoCancelado.id)}: ${motivoNormalizado}`,
            metadata: JSON.stringify({
              tipo: 'CANCELAMENTO_FLUXO_COMPRA',
              pedido_compra_id: pedidoCancelado.id,
              solicitacao_compra_id: solicitacaoCompra.id,
              motivo: motivoNormalizado
            })
          },
          { transaction }
        );
      }
    }
  }

  return recalcularPedidoPorId(pedidoCancelado.id, transaction);
}

async function cancelarPedidoItens({ pedidoId, itens = [], motivo, usuarioId, transaction }) {
  await assertPedidoEditavel(pedidoId, transaction);
  const ids = [...new Set((Array.isArray(itens) ? itens : [itens])
    .map((item) => Number(item?.item_id || item?.id || item))
    .filter((item) => item > 0))];

  if (!ids.length) {
    throw new Error('Selecione ao menos um item para cancelar.');
  }

  const motivoNormalizado = String(motivo || '').trim();
  const pedido = await PedidoCompra.findByPk(Number(pedidoId), {
    transaction,
    lock: transaction?.LOCK?.UPDATE
  });
  const itensAtivosAntes = await PedidoCompraItem.findAll({
    where: { pedido_compra_id: Number(pedidoId), removido: false },
    attributes: ['id'],
    transaction,
    lock: transaction?.LOCK?.UPDATE
  });
  const itensPedido = await PedidoCompraItem.findAll({
    where: { pedido_compra_id: Number(pedidoId), id: { [Op.in]: ids }, removido: false },
    transaction,
    lock: transaction?.LOCK?.UPDATE
  });

  if (!itensPedido.length) {
    throw new Error('Nenhum item ativo selecionado foi encontrado no pedido.');
  }

  const idsSelecionados = itensPedido.map((item) => Number(item.id));
  await assertItensSemRecebimento(idsSelecionados, transaction);
  const cancelaPedidoInteiro = itensAtivosAntes.length > 0 && idsSelecionados.length === itensAtivosAntes.length;
  if (cancelaPedidoInteiro) {
    await assertPedidoSemVinculoFinanceiroParaCancelamento(pedidoId, transaction);
  } else {
    await assertItensPedidoSemVinculoFinanceiroParaCancelamento(idsSelecionados, transaction);
  }

  for (const item of itensPedido) {
    if (item.removido) continue;

    await item.update(
      {
        removido: true,
        quantidade_cancelada: item.quantidade_pedido,
        cancelado_por: usuarioId || null,
        cancelado_em: new Date(),
        motivo_cancelamento: motivoNormalizado || null
      },
      { transaction }
    );

    await SolicitacaoCompraAlocacao.update(
      {
        status: 'CANCELADA',
        cancelado_por: usuarioId || null,
        cancelado_em: new Date(),
        motivo_cancelamento: motivoNormalizado || null
      },
      { where: { pedido_compra_item_id: item.id, status: 'ATIVA' }, transaction }
    );

    await registrarLogPedidoItem({
      pedidoCompraId: Number(pedidoId),
      pedidoCompraItemId: item.id,
      usuarioId,
      acao: 'ITEM_CANCELADO',
      descricao: motivoNormalizado
        ? `Item ${item.descricao} cancelado: ${motivoNormalizado}`
        : `Item ${item.descricao} cancelado`,
      dadosAnteriores: { removido: false, quantidade_pedido: item.quantidade_pedido },
      dadosNovos: { removido: true, motivo: motivoNormalizado || null },
      transaction
    });
  }

  if (pedido && itensPedido.length) {
    const itensAtivosRestantes = await PedidoCompraItem.count({
      where: { pedido_compra_id: Number(pedidoId), removido: false },
      transaction
    });
    if (itensAtivosRestantes === 0) {
      await pedido.update(
        {
          status: 'CANCELADO',
          cancelado_por: usuarioId || null,
          cancelado_em: new Date(),
          encerrado_em: new Date(),
          motivo_cancelamento: motivoNormalizado || null
        },
        { transaction }
      );
    }
    const fretesCancelados = itensAtivosRestantes === 0
      ? await cancelarFretesPendentesSemTituloDoPedido(pedidoId, transaction)
      : 0;
    const solicitacao = await SolicitacaoCompra.findByPk(pedido.solicitacao_compra_id, { transaction });
    await registrarHistoricoPedidoNaSolicitacaoPrincipal({
      solicitacao,
      pedido,
      usuarioId,
      acao: 'PEDIDO_COMPRA_ITENS_CANCELADOS',
      descricao: motivoNormalizado
        ? `${buildPedidoCodigo(pedido.id)} teve item(ns) cancelado(s): ${motivoNormalizado}`
        : `${buildPedidoCodigo(pedido.id)} teve item(ns) cancelado(s)`,
      metadados: {
        itens_ids: itensPedido.map((item) => item.id),
        motivo: motivoNormalizado || null,
        pedido_sem_itens_ativos: itensAtivosRestantes === 0,
        status_pedido: itensAtivosRestantes === 0 ? 'CANCELADO' : pedido.status,
        fretes_cancelados: fretesCancelados
      },
      transaction
    });

    await sincronizarStatusFechamentoPorPedido(pedido, transaction);
    await sincronizarStatusSolicitacaoCompraPorSaldo({
      solicitacaoId: pedido.solicitacao_compra_id,
      usuarioId,
      transaction
    });
    await sincronizarStatusCotacoesAposPedido({
      solicitacaoId: pedido.solicitacao_compra_id,
      fornecedorCompraId: pedido.fornecedor_compra_id,
      modo: 'STATUS_PEDIDO',
      usuarioId,
      transaction
    });
  }

  return recalcularPedidoPorId(pedidoId, transaction);
}

async function registrarComentarioPedido({ pedidoId, comentario, usuarioId, transaction }) {
  const pedido = await PedidoCompra.findByPk(Number(pedidoId), { transaction });
  if (!pedido) {
    throw new Error('Pedido nao encontrado.');
  }

  const texto = String(comentario || '').trim();
  if (!texto) {
    throw new Error('Informe um comentario.');
  }

  await registrarLogSolicitacaoCompra({
    solicitacaoCompraId: pedido.solicitacao_compra_id,
    usuarioId,
    fornecedorCompraId: pedido.fornecedor_compra_id,
    tipoAcao: 'COMENTARIO_PEDIDO',
    descricao: texto,
    metadados: { pedido_compra_id: pedido.id },
    transaction
  });

  const solicitacao = await SolicitacaoCompra.findByPk(pedido.solicitacao_compra_id, { transaction });
  await registrarHistoricoPedidoNaSolicitacaoPrincipal({
    solicitacao,
    pedido,
    usuarioId,
    acao: 'PEDIDO_COMPRA_COMENTARIO',
    descricao: texto,
    metadados: { comentario: texto },
    transaction
  });

  return true;
}

async function anexarEspelhoFornecedorPedido({ pedidoId, arquivoUrl, arquivoNome, usuarioId, transaction }) {
  const pedido = await PedidoCompra.findByPk(Number(pedidoId), { transaction });
  if (!pedido) {
    throw new Error('Pedido nao encontrado.');
  }

  const url = String(arquivoUrl || '').trim();
  if (!url) {
    throw new Error('Informe o arquivo do espelho do fornecedor.');
  }

  await pedido.update(
    {
      espelho_fornecedor_url: url,
      espelho_fornecedor_nome: String(arquivoNome || '').trim() || null,
      espelho_fornecedor_em: new Date()
    },
    { transaction }
  );

  await registrarLogSolicitacaoCompra({
    solicitacaoCompraId: pedido.solicitacao_compra_id,
    usuarioId,
    fornecedorCompraId: pedido.fornecedor_compra_id,
    tipoAcao: 'ESPELHO_PEDIDO_ANEXADO',
    descricao: `${buildPedidoCodigo(pedido.id)} recebeu espelho do pedido do fornecedor`,
    metadados: {
      pedido_compra_id: pedido.id,
      arquivo_url: url,
      arquivo_nome: arquivoNome || null
    },
    transaction
  });

  const solicitacao = await SolicitacaoCompra.findByPk(pedido.solicitacao_compra_id, { transaction });
  await registrarHistoricoPedidoNaSolicitacaoPrincipal({
    solicitacao,
    pedido,
    usuarioId,
    acao: 'PEDIDO_COMPRA_ESPELHO_ANEXADO',
    descricao: `${buildPedidoCodigo(pedido.id)} recebeu espelho do pedido do fornecedor`,
    metadados: {
      arquivo_url: url,
      arquivo_nome: arquivoNome || null
    },
    transaction
  });

  return pedido;
}

async function delegarSolicitacaoCompra({
  solicitacaoId,
  responsavelId,
  prazoCompra,
  motivoAtraso,
  motivoDelegacaoVencida,
  usuarioId,
  somenteMotivo = false,
  transaction
}) {
  const solicitacao = await SolicitacaoCompra.findByPk(Number(solicitacaoId), { transaction });
  if (!solicitacao) {
    throw new Error('Solicitacao de compra nao encontrada.');
  }
  if (normalizeText(solicitacao.origem) === 'COMPRA_DIRETA') {
    throw new Error('Compra Direta segue pelo fluxo da solicitacao principal e nao deve ser delegada no modulo de Compras.');
  }

  const motivoNormalizado = motivoAtraso ? String(motivoAtraso).trim() : '';
  const motivoDelegacaoVencidaNormalizado = motivoDelegacaoVencida ? String(motivoDelegacaoVencida).trim() : '';

  if (somenteMotivo) {
    if (!motivoNormalizado) {
      throw new Error('Informe o motivo do atraso.');
    }

    await solicitacao.update(
      {
        motivo_atraso: motivoNormalizado,
        motivo_atraso_em: new Date()
      },
      { transaction }
    );

    await PedidoCompra.update(
      {
        motivo_atraso: motivoNormalizado,
        motivo_atraso_em: new Date()
      },
      { where: { solicitacao_compra_id: solicitacao.id }, transaction }
    );

    await registrarLogSolicitacaoCompra({
      solicitacaoCompraId: solicitacao.id,
      usuarioId,
      tipoAcao: 'MOTIVO_ATRASO_COMPRA',
      descricao: 'Motivo de atraso informado pelo responsavel da compra',
      metadados: {
        motivo_atraso: motivoNormalizado
      },
      transaction
    });

    return solicitacao;
  }

  if (isDateOnlyPast(prazoCompra) && !motivoDelegacaoVencidaNormalizado) {
    throw new Error('Informe o motivo para delegar uma solicitacao com prazo ja vencido.');
  }

  const responsavelElegivel = await validarResponsavelElegivelDelegacaoCompras(responsavelId, { transaction });
  const responsavelNormalizado = responsavelElegivel?.id || null;
  const responsavelNome = responsavelNormalizado
    ? (String(responsavelElegivel?.nome || responsavelElegivel?.email || '').trim() || 'Usuario de Compras')
    : null;

  await solicitacao.update(
    {
      comprador_responsavel_id: responsavelNormalizado,
      prazo_compra: prazoCompra || null,
      delegado_por: usuarioId || null,
      delegado_em: new Date(),
      motivo_atraso: motivoNormalizado || solicitacao.motivo_atraso,
      motivo_atraso_em: motivoNormalizado ? new Date() : solicitacao.motivo_atraso_em,
      motivo_delegacao_vencida: motivoDelegacaoVencidaNormalizado || solicitacao.motivo_delegacao_vencida,
      motivo_delegacao_vencida_em: motivoDelegacaoVencidaNormalizado
        ? new Date()
        : solicitacao.motivo_delegacao_vencida_em
    },
    { transaction }
  );

  const pedidoUpdate = {
    atribuido_a: responsavelNormalizado,
    prazo_finalizacao: prazoCompra || null,
    delegado_por: usuarioId || null,
    delegado_em: new Date()
  };
  if (motivoNormalizado) {
    pedidoUpdate.motivo_atraso = motivoNormalizado;
    pedidoUpdate.motivo_atraso_em = new Date();
  }
  if (motivoDelegacaoVencidaNormalizado) {
    pedidoUpdate.motivo_delegacao_vencida = motivoDelegacaoVencidaNormalizado;
    pedidoUpdate.motivo_delegacao_vencida_em = new Date();
  }

  await PedidoCompra.update(pedidoUpdate, { where: { solicitacao_compra_id: solicitacao.id }, transaction });

  await registrarLogSolicitacaoCompra({
    solicitacaoCompraId: solicitacao.id,
    usuarioId,
    tipoAcao: 'DELEGACAO_COMPRA',
    descricao: responsavelNormalizado
      ? `Solicitacao atribuida a ${responsavelNome}`
      : 'Responsavel de compras removido da solicitacao',
    metadados: {
      responsavel_id: responsavelNormalizado,
      responsavel_nome: responsavelNome,
      prazo_compra: prazoCompra || null,
      motivo_atraso: motivoNormalizado || null,
      motivo_delegacao_vencida: motivoDelegacaoVencidaNormalizado || null
    },
    transaction
  });

  await registrarHistoricoCompraNaSolicitacaoPrincipal({
    solicitacao,
    usuarioId,
    acao: 'SOLICITACAO_COMPRA_DELEGADA',
    descricao: responsavelNormalizado
      ? `Compras atribuiu a solicitacao a ${responsavelNome}${prazoCompra ? ` com prazo ${prazoCompra}` : ''}`
      : 'Compras removeu o responsavel da solicitacao',
    metadados: {
      responsavel_id: responsavelNormalizado,
      responsavel_nome: responsavelNome,
      prazo_compra: prazoCompra || null,
      motivo_atraso: motivoNormalizado || null,
      motivo_delegacao_vencida: motivoDelegacaoVencidaNormalizado || null
    },
    transaction
  });

  return solicitacao;
}

async function atualizarStatusPedidosEmLote({ pedidoIds = [], status, usuarioId, transaction }) {
  const ids = [...new Set((Array.isArray(pedidoIds) ? pedidoIds : [])
    .map((item) => Number(item))
    .filter((item) => item > 0))];

  if (!ids.length) {
    throw new Error('Selecione ao menos um pedido.');
  }

  const atualizados = [];
  for (const pedidoId of ids) {
    await atualizarStatusPedido({ pedidoId, status, usuarioId, transaction });
    atualizados.push(pedidoId);
  }

  return atualizados;
}

async function reduzirAlocacoesAtivasDoItem({ pedidoItemId, quantidade, usuarioId, motivo, transaction }) {
  let restante = roundQty(quantidade);
  const custosRemovidos = {
    desconto_rateado: 0,
    ipi_rateado: 0,
    icms_rateado: 0,
    st_rateado: 0,
    difal_rateado: 0,
    frete_rateado: 0,
    valor_total: 0
  };
  const alocacoes = await SolicitacaoCompraAlocacao.findAll({
    where: {
      pedido_compra_item_id: Number(pedidoItemId),
      status: 'ATIVA'
    },
    order: [['id', 'ASC']],
    transaction
  });

  for (const alocacao of alocacoes) {
    if (restante <= 0) break;
    const quantidadeAtual = roundQty(alocacao.quantidade_alocada);
    const reduzir = Math.min(quantidadeAtual, restante);
    const proximaQuantidade = roundQty(quantidadeAtual - reduzir);
    restante = roundQty(restante - reduzir);
    const percentualReducao = quantidadeAtual > 0 ? reduzir / quantidadeAtual : 0;
    const removidosAlocacao = Object.keys(custosRemovidos).reduce((acc, campo) => {
      acc[campo] = proximaQuantidade <= 0
        ? roundMoney(alocacao[campo])
        : roundMoney(asNumber(alocacao[campo]) * percentualReducao);
      custosRemovidos[campo] = roundMoney(custosRemovidos[campo] + acc[campo]);
      return acc;
    }, {});

    if (proximaQuantidade <= 0) {
      await alocacao.update(
        {
          status: 'CANCELADA',
          cancelado_por: usuarioId || null,
          cancelado_em: new Date(),
          motivo_cancelamento: motivo || 'Item remanejado para outro fornecedor'
        },
        { transaction }
      );
    } else {
      await alocacao.update(
        {
          quantidade_alocada: proximaQuantidade,
          desconto_rateado: roundMoney(asNumber(alocacao.desconto_rateado) - removidosAlocacao.desconto_rateado),
          ipi_rateado: roundMoney(asNumber(alocacao.ipi_rateado) - removidosAlocacao.ipi_rateado),
          icms_rateado: roundMoney(asNumber(alocacao.icms_rateado) - removidosAlocacao.icms_rateado),
          st_rateado: roundMoney(asNumber(alocacao.st_rateado) - removidosAlocacao.st_rateado),
          difal_rateado: roundMoney(asNumber(alocacao.difal_rateado) - removidosAlocacao.difal_rateado),
          frete_rateado: roundMoney(asNumber(alocacao.frete_rateado) - removidosAlocacao.frete_rateado),
          valor_total: roundMoney(asNumber(alocacao.valor_total) - removidosAlocacao.valor_total)
        },
        { transaction }
      );
    }
  }

  if (restante > 0.0001) {
    throw new Error('As alocacoes ativas do item nao cobrem a quantidade solicitada para remanejamento.');
  }

  return custosRemovidos;
}

async function sincronizarDescontoPedidoPorAlocacoes(pedidoId, transaction) {
  const alocacoes = await SolicitacaoCompraAlocacao.findAll({
    where: {
      pedido_compra_id: Number(pedidoId),
      status: 'ATIVA'
    },
    attributes: ['desconto_rateado'],
    transaction
  });
  const descontoTotal = roundMoney(
    alocacoes.reduce((total, alocacao) => total + asNumber(alocacao.desconto_rateado), 0)
  );
  await PedidoCompra.update(
    { desconto_total: descontoTotal },
    { where: { id: Number(pedidoId) }, transaction }
  );
  return descontoTotal;
}

async function remanejarPedidoItem({ pedidoId, itemId, respostaItemIdDestino, quantidade, motivo, usuarioId, transaction }) {
  const pedidoOrigemTravado = await PedidoCompra.findByPk(Number(pedidoId), {
    transaction,
    lock: transaction?.LOCK?.UPDATE
  });
  const pedidoOrigem = await assertPedidoEditavel(pedidoOrigemTravado, transaction);
  const itemOrigem = await PedidoCompraItem.findOne({
    where: { id: Number(itemId), pedido_compra_id: Number(pedidoId), removido: false },
    transaction,
    lock: transaction?.LOCK?.UPDATE
  });
  if (!itemOrigem) {
    throw new Error('Item de origem nao encontrado.');
  }

  const quantidadeRemanejada = roundPedidoQty(quantidade || itemOrigem.quantidade_pedido);
  await assertItensSemRecebimento([itemOrigem.id], transaction);
  if (quantidadeRemanejada <= 0 || quantidadeRemanejada > roundPedidoQty(itemOrigem.quantidade_pedido)) {
    throw new Error('Quantidade remanejada invalida para o item de origem.');
  }

  await assertPedidoSemVinculoFinanceiroParaCancelamento(pedidoOrigem.id, transaction);

  await SolicitacaoCompra.findByPk(pedidoOrigem.solicitacao_compra_id, {
    transaction,
    lock: transaction?.LOCK?.UPDATE,
    attributes: ['id']
  });

  const solicitacao = await carregarSolicitacaoPedidos(pedidoOrigem.solicitacao_compra_id, transaction);
  const respostaDestino = (solicitacao?.fornecedores || [])
    .flatMap((fornecedor) => (fornecedor.respostas || []).map((resposta) => ({ fornecedor, resposta })))
    .find(({ resposta }) => Number(resposta.id) === Number(respostaItemIdDestino));

  if (!respostaDestino) {
    throw new Error('Resposta de destino nao encontrada na cotacao.');
  }

  if (!fornecedorRespondeuCotacao(respostaDestino.fornecedor)) {
    throw new Error('Fornecedor de destino ainda nao respondeu esta cotacao.');
  }

  if (Number(respostaDestino.fornecedor.fornecedor_compra_id) === Number(pedidoOrigem.fornecedor_compra_id)) {
    throw new Error('Selecione um fornecedor de destino diferente do fornecedor atual.');
  }

  if (buildItemKeyFromResposta(respostaDestino.resposta) !== buildItemKeyFromPedidoItem(itemOrigem)) {
    throw new Error('Resposta de destino nao pertence ao mesmo item do pedido.');
  }

  if (!respostaDestino.resposta.disponivel || asNumber(respostaDestino.resposta.preco) <= 0) {
    throw new Error('Resposta de destino precisa estar disponivel e possuir preco.');
  }

  const [alocacaoDestino] = montarAlocacoesNormalizadas(
    solicitacao,
    [{
      resposta_item_id: Number(respostaItemIdDestino),
      quantidade_alocada: quantidadeRemanejada
    }],
    null,
    { permitirExcedente: true }
  );
  if (!alocacaoDestino) {
    throw new Error('Nao foi possivel calcular a alocacao do fornecedor de destino.');
  }

  const fornecedorDestino = respostaDestino.fornecedor;
  const pedidoDestinoExistente = await PedidoCompra.findOne({
    where: {
      solicitacao_compra_id: solicitacao.id,
      fornecedor_compra_id: fornecedorDestino.fornecedor_compra_id
    },
    transaction,
    lock: transaction?.LOCK?.UPDATE
  });
  if (pedidoDestinoExistente) {
    await assertPedidoSemVinculoFinanceiroParaCancelamento(pedidoDestinoExistente.id, transaction);
  }
  const pedidoDestino = await obterOuCriarPedidoPorFornecedor({
    solicitacao,
    vinculacaoFornecedor: fornecedorDestino,
    usuarioId,
    transaction
  });

  await adicionarRespostasAoPedido({
    pedido: pedidoDestino,
    solicitacao,
    vinculacaoFornecedor: fornecedorDestino,
    respostaItemIds: [Number(respostaItemIdDestino)],
    quantidadesPorResposta: new Map([[Number(respostaItemIdDestino), quantidadeRemanejada]]),
    somarQuantidadeExistente: true,
    usuarioId,
    acaoLog: 'ITEM_REMANEJADO_ENTRADA',
    descricaoLog: 'Item recebido por remanejamento',
    transaction
  });

  const pedidoDestinoAtualizado = await recalcularPedidoPorId(pedidoDestino.id, transaction);
  const itemDestino = (pedidoDestinoAtualizado?.itens || []).find(
    (item) => Number(item.resposta_item_id || 0) === Number(respostaItemIdDestino)
  );
  const baseDestino = obterBaseItemPorResposta(solicitacao, respostaDestino.resposta);
  if (itemDestino && baseDestino) {
    await SolicitacaoCompraAlocacao.create(
      {
        solicitacao_compra_id: solicitacao.id,
        resposta_item_id: Number(respostaItemIdDestino),
        fornecedor_compra_id: fornecedorDestino.fornecedor_compra_id,
        item_tipo: baseDestino.item_tipo,
        solicitacao_compra_item_id: baseDestino.solicitacao_compra_item_id,
        solicitacao_compra_item_manual_id: baseDestino.solicitacao_compra_item_manual_id,
        quantidade_alocada: quantidadeRemanejada,
        quantidade_referencia: alocacaoDestino.quantidade_referencia,
        preco_unitario: alocacaoDestino.preco_unitario,
        valor_total: alocacaoDestino.valor_total,
        desconto_rateado: alocacaoDestino.desconto_rateado || 0,
        ipi_rateado: alocacaoDestino.ipi_rateado || 0,
        icms_rateado: alocacaoDestino.icms_rateado || 0,
        st_rateado: alocacaoDestino.st_rateado || 0,
        difal_rateado: alocacaoDestino.difal_rateado || 0,
        frete_rateado: alocacaoDestino.frete_rateado || 0,
        pedido_compra_id: pedidoDestino.id,
        pedido_compra_item_id: itemDestino.id,
        status: 'ATIVA',
        criado_por: usuarioId || null
      },
      { transaction }
    );
    await itemDestino.update(
      {
        ipi_valor: roundMoney(asNumber(itemDestino.ipi_valor) + asNumber(alocacaoDestino.ipi_rateado)),
        icms_valor: roundMoney(asNumber(itemDestino.icms_valor) + asNumber(alocacaoDestino.icms_rateado)),
        st_valor: roundMoney(asNumber(itemDestino.st_valor) + asNumber(alocacaoDestino.st_rateado)),
        difal_rateado: roundMoney(asNumber(itemDestino.difal_rateado) + asNumber(alocacaoDestino.difal_rateado)),
        frete_rateado: roundMoney(asNumber(itemDestino.frete_rateado) + asNumber(alocacaoDestino.frete_rateado))
      },
      { transaction }
    );
  }

  const quantidadeRestante = roundPedidoQty(asNumber(itemOrigem.quantidade_pedido) - quantidadeRemanejada);
  const custosRemovidos = await reduzirAlocacoesAtivasDoItem({
    pedidoItemId: itemOrigem.id,
    quantidade: quantidadeRemanejada,
    usuarioId,
    motivo: String(motivo || '').trim() || 'Item remanejado para outro fornecedor',
    transaction
  });
  await itemOrigem.update(
    {
      quantidade_pedido: quantidadeRestante,
      valor_total: roundMoney(quantidadeRestante * asNumber(itemOrigem.preco_unitario)),
      ipi_valor: roundMoney(Math.max(0, asNumber(itemOrigem.ipi_valor) - custosRemovidos.ipi_rateado)),
      icms_valor: roundMoney(Math.max(0, asNumber(itemOrigem.icms_valor) - custosRemovidos.icms_rateado)),
      st_valor: roundMoney(Math.max(0, asNumber(itemOrigem.st_valor) - custosRemovidos.st_rateado)),
      difal_rateado: roundMoney(Math.max(0, asNumber(itemOrigem.difal_rateado) - custosRemovidos.difal_rateado)),
      frete_rateado: roundMoney(Math.max(0, asNumber(itemOrigem.frete_rateado) - custosRemovidos.frete_rateado)),
      removido: quantidadeRestante <= 0,
      quantidade_cancelada: roundPedidoQty(asNumber(itemOrigem.quantidade_cancelada) + quantidadeRemanejada),
      motivo_cancelamento: String(motivo || '').trim() || itemOrigem.motivo_cancelamento || null
    },
    { transaction }
  );

  await registrarLogPedidoItem({
    pedidoCompraId: pedidoOrigem.id,
    pedidoCompraItemId: itemOrigem.id,
    usuarioId,
    acao: 'ITEM_REMANEJADO_SAIDA',
    descricao: `Remanejados ${quantidadeRemanejada} de ${itemOrigem.descricao} para outro fornecedor`,
    dadosNovos: {
      quantidade_remanejada: quantidadeRemanejada,
      resposta_item_destino_id: respostaItemIdDestino,
      fornecedor_destino_id: fornecedorDestino.fornecedor_compra_id,
      custos_origem_reduzidos: custosRemovidos,
      custos_destino_aplicados: {
        desconto_rateado: alocacaoDestino.desconto_rateado || 0,
        ipi_rateado: alocacaoDestino.ipi_rateado || 0,
        icms_rateado: alocacaoDestino.icms_rateado || 0,
        st_rateado: alocacaoDestino.st_rateado || 0,
        difal_rateado: alocacaoDestino.difal_rateado || 0
      },
      motivo: motivo || null
    },
    transaction
  });

  await sincronizarDescontoPedidoPorAlocacoes(pedidoOrigem.id, transaction);
  await sincronizarDescontoPedidoPorAlocacoes(pedidoDestino.id, transaction);
  await recalcularPedidoPorId(pedidoDestino.id, transaction);
  await recalcularPedidoPorId(pedidoOrigem.id, transaction);

  await sincronizarRateiosFretesPendentesPedido({
    pedidoId: pedidoOrigem.id,
    usuarioId,
    motivo: 'Remanejamento de item para outro fornecedor',
    transaction
  });

  if (
    ['EMBUTIDO', 'TERCEIRO'].includes(normalizeText(fornecedorDestino.frete_tipo))
    && roundMoney(alocacaoDestino.frete_rateado) > 0
  ) {
    await registrarFretePedido({
      pedidoId: pedidoDestino.id,
      payload: {
        tipo: normalizeText(fornecedorDestino.frete_tipo),
        momento: 'REMANEJAMENTO',
        criterio_rateio: 'POR_ITEM',
        valor_total: roundMoney(alocacaoDestino.frete_rateado),
        rateios: [{
          pedido_compra_item_id: itemDestino.id,
          valor_rateado: roundMoney(alocacaoDestino.frete_rateado)
        }],
        data_vencimento: fornecedorDestino.frete_data_vencimento,
        origem_cotacao_fornecedor_id: fornecedorDestino.id,
        dados_pagamento: {
          transportador_nome: fornecedorDestino.frete_transportador_nome || null,
          transportador_cpf_cnpj: fornecedorDestino.frete_transportador_cpf_cnpj || null,
          origem: 'COTACAO_FORNECEDOR'
        },
        observacoes: `Frete informado na cotacao do fornecedor ${fornecedorDestino.fornecedor?.nome || fornecedorDestino.fornecedor_compra_id}`
      },
      usuarioId,
      idempotencyKey: `COTACAO:${fornecedorDestino.id}:FRETE`,
      permitirSemCredor: true,
      transaction
    });
  }
  await sincronizarRateiosFretesPendentesPedido({
    pedidoId: pedidoDestino.id,
    usuarioId,
    motivo: 'Remanejamento recebido de outro fornecedor',
    transaction
  });
  await sincronizarStatusCotacoesAposPedido({
    solicitacaoId: solicitacao.id,
    fornecedorCompraId: fornecedorDestino.fornecedor_compra_id,
    modo: 'REABERTURA',
    usuarioId,
    transaction
  });

  return recalcularPedidoPorId(pedidoOrigem.id, transaction);
}

async function assertItensSemRecebimento(ids, transaction) {
  if (!ids.length) return;
  const recebido = Number(await PedidoCompraItemRecebimento.sum('quantidade', {
    where: { pedido_compra_item_id: { [Op.in]: ids } }, transaction
  }) || 0);
  if (recebido > 0) throw Object.assign(new Error('Há recebimentos registrados. Preserve a entrega e use Cancelar saldo não entregue no acompanhamento da solicitação.'), { statusCode: 409 });
}

async function cancelarSaldoNaoRecebido({ pedido, item, recebido, motivo, usuarioId, transaction }) {
  // O recebimento permanece intocado. Cancelamento financeiro requer tratamento previo.
  await assertPedidoSemVinculoFinanceiroParaCancelamento(pedido.id, transaction);
  const anterior = item.toJSON();
  const saldo = roundQty(asNumber(item.quantidade_pedido) - asNumber(item.quantidade_cancelada) - recebido);
  if (saldo <= 0) throw Object.assign(new Error('Não há saldo pendente para cancelar.'), { statusCode: 409 });
  const alocacoes = await SolicitacaoCompraAlocacao.count({ where: { pedido_compra_item_id: item.id, status: 'ATIVA' }, transaction });
  const custos = alocacoes ? await reduzirAlocacoesAtivasDoItem({ pedidoItemId: item.id, quantidade: saldo, usuarioId, motivo, transaction }) : {};
  const proporcao = recebido / Math.max(1e-3, asNumber(item.quantidade_pedido));
  await item.update({ quantidade_pedido: recebido, quantidade_cancelada: 0, removido: recebido === 0,
    cancelado_por: usuarioId, cancelado_em: new Date(), motivo_cancelamento: motivo,
    ipi_valor: roundMoney(alocacoes ? asNumber(item.ipi_valor) - (custos.ipi_rateado || 0) : asNumber(item.ipi_valor) * proporcao),
    icms_valor: roundMoney(alocacoes ? asNumber(item.icms_valor) - (custos.icms_rateado || 0) : asNumber(item.icms_valor) * proporcao),
    st_valor: roundMoney(alocacoes ? asNumber(item.st_valor) - (custos.st_rateado || 0) : asNumber(item.st_valor) * proporcao),
    difal_rateado: roundMoney(alocacoes ? asNumber(item.difal_rateado) - (custos.difal_rateado || 0) : asNumber(item.difal_rateado) * proporcao)
  }, { transaction });
  await registrarLogPedidoItem({ pedidoCompraId: pedido.id, pedidoCompraItemId: item.id, usuarioId,
    acao: 'SALDO_NAO_ENTREGUE_CANCELADO', descricao: motivo, dadosAnteriores: anterior,
    dadosNovos: { ...item.toJSON(), quantidade_cancelada_nesta_operacao: saldo }, transaction });
  if (alocacoes) await sincronizarDescontoPedidoPorAlocacoes(pedido.id, transaction);
  await recalcularPedidoPorId(pedido.id, transaction);
  await sincronizarRateiosFretesPendentesPedido({ pedidoId: pedido.id, usuarioId, motivo, transaction });
}

module.exports = {
  cancelarSaldoNaoRecebido,
  atualizarPedidoItem,
  atualizarStatusPedido,
  atualizarStatusPedidosEmLote,
  anexarEspelhoFornecedorPedido,
  cancelarFluxoPedidoCompra,
  cancelarPedidoCompra,
  cancelarPedidoItens,
  criarPedidoParaFornecedor,
  delegarSolicitacaoCompra,
  encerrarSaldoSolicitacaoCompraSemPedido,
  fecharPedidosDaSolicitacaoCompraAutomaticamente,
  gerarPedidosDosVencedores,
  isSolicitacaoCompraComPedidosFechadosComFornecedor,
  listarAuditoriaItensPedido,
  listarPedidos,
  obterSaldosSolicitacaoCompra,
  obterPedidoDetalhe,
  reabrirPedidoParaCotacao,
  registrarComentarioPedido,
  remanejarPedidoItem,
  removerPedidoItem,
  adicionarRespostaAoPedido,
  calcularRateiosMonetarios
};
