const { Op } = require('sequelize');
const {
  FornecedorCompra,
  Historico,
  Obra,
  Parceiro,
  PedidoCompra,
  PedidoCompraFrete,
  PedidoCompraFreteRateio,
  PedidoCompraItem,
  SolicitacaoCompraAlocacao,
  Solicitacao,
  SolicitacaoCompra,
  TituloFinanceiro,
  User
} = require('../models');
const { registrarLogSolicitacaoCompra } = require('./comprasCotacao');
const {
  criarOuAtualizarFornecedorCentralizado,
  sincronizarFornecedorCompraComParceiro
} = require('./comprasFornecedorService');
const { isPedidoCompraStatusLocked } = require('./pedidoCompraStatusConfig');
const { sincronizarTotaisFretePedido } = require('./pedidoCompraTotaisService');

function asNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value) {
  return Number(asNumber(value).toFixed(2));
}

function normalizeToken(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
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

function serializeFrete(frete) {
  if (!frete) return null;
  const data = typeof frete.toJSON === 'function' ? frete.toJSON() : frete;
  return {
    ...data,
    valor_total: roundMoney(data.valor_total),
    dados_pagamento: safeJsonParse(data.dados_pagamento, data.dados_pagamento || null),
    pendente_financeiro: normalizeToken(data.status_financeiro) === 'PENDENTE_TITULO',
    rateios: (data.rateios || []).map((rateio) => ({
      ...rateio,
      valor_item_base: roundMoney(rateio.valor_item_base),
      valor_rateado: roundMoney(rateio.valor_rateado),
      percentual_rateio: Number(rateio.percentual_rateio || 0)
    }))
  };
}

async function listarFretesPedido(pedidoId, options = {}) {
  const fretes = await PedidoCompraFrete.findAll({
    where: { pedido_compra_id: Number(pedidoId) },
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
    ],
    order: [['createdAt', 'DESC'], [{ model: PedidoCompraFreteRateio, as: 'rateios' }, 'id', 'ASC']],
    transaction: options.transaction
  });

  return fretes.map(serializeFrete);
}

async function listarFretesPendentesFinanceiro(options = {}) {
  const limit = Math.min(Math.max(Number(options.limit || 20), 1), 100);

  const fretes = await PedidoCompraFrete.findAll({
    where: {
      tipo: 'TERCEIRO',
      status_financeiro: 'PENDENTE_TITULO',
      titulo_financeiro_id: null
    },
    include: [
      { model: PedidoCompra, as: 'pedido', attributes: ['id', 'status', 'valor_total'] },
      { model: SolicitacaoCompra, as: 'solicitacaoCompra', attributes: ['id', 'status', 'origem'] },
      { model: Solicitacao, as: 'solicitacaoPrincipal', attributes: ['id', 'codigo', 'status_global', 'area_responsavel'] },
      { model: Obra, as: 'obra', attributes: ['id', 'nome', 'codigo', 'empresa_grupo_id'] },
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
      { model: User, as: 'registradoPor', attributes: ['id', 'nome', 'email'] }
    ],
    order: [
      ['data_vencimento', 'ASC'],
      ['createdAt', 'ASC']
    ],
    limit
  });

  return fretes.map(serializeFrete);
}

function calcularRateiosProporcionais({ itens, valorTotal, pedido }) {
  const itensAtivos = itens.filter((item) => !item.removido);
  if (!itensAtivos.length) {
    throw new Error('O pedido nao possui itens ativos para ratear o frete.');
  }

  const totalBase = roundMoney(itensAtivos.reduce((sum, item) => sum + asNumber(item.valor_total), 0));
  const divisorIgual = itensAtivos.length;
  let acumulado = 0;

  return itensAtivos.map((item, index) => {
    const base = roundMoney(item.valor_total);
    const percentual = totalBase > 0 ? base / totalBase : 1 / divisorIgual;
    const isUltimo = index === itensAtivos.length - 1;
    const valorRateado = isUltimo ? roundMoney(valorTotal - acumulado) : roundMoney(valorTotal * percentual);
    acumulado = roundMoney(acumulado + valorRateado);

    return {
      pedido_compra_id: pedido.id,
      pedido_compra_item_id: item.id,
      solicitacao_compra_item_id: item.solicitacao_compra_item_id || null,
      solicitacao_compra_item_manual_id: item.solicitacao_compra_item_manual_id || null,
      obra_id: pedido.obra_id || null,
      valor_item_base: base,
      percentual_rateio: Number((percentual * 100).toFixed(6)),
      valor_rateado: valorRateado,
      manual: false
    };
  });
}

function calcularRateiosInformados({ itens, valorTotal, pedido, rateiosInformados }) {
  const itensAtivos = itens.filter((item) => !item.removido);
  const itensPorId = new Map(itensAtivos.map((item) => [Number(item.id), item]));
  const recebidos = Array.isArray(rateiosInformados) ? rateiosInformados : [];
  const rateios = recebidos
    .map((entry) => ({
      item: itensPorId.get(Number(entry?.pedido_compra_item_id || 0)),
      valor: roundMoney(entry?.valor_rateado)
    }))
    .filter((entry) => entry.item && entry.valor > 0);

  if (!rateios.length) {
    throw new Error('Informe ao menos um item com frete para realizar o rateio por item.');
  }
  const totalRateado = roundMoney(rateios.reduce((sum, entry) => sum + entry.valor, 0));
  if (Math.abs(totalRateado - valorTotal) > 0.01) {
    throw new Error('A soma do frete por item precisa ser igual ao valor total do frete.');
  }

  return rateios.map(({ item, valor }) => ({
    pedido_compra_id: pedido.id,
    pedido_compra_item_id: item.id,
    solicitacao_compra_item_id: item.solicitacao_compra_item_id || null,
    solicitacao_compra_item_manual_id: item.solicitacao_compra_item_manual_id || null,
    obra_id: pedido.obra_id || null,
    valor_item_base: roundMoney(item.valor_total),
    percentual_rateio: valorTotal > 0 ? Number(((valor / valorTotal) * 100).toFixed(6)) : 0,
    valor_rateado: valor,
    manual: true
  }));
}

async function resolverFornecedorFrete(payload, transaction, { permitirSemCredor = false } = {}) {
  if (Number(payload.fornecedor_compra_id || 0) > 0) {
    const fornecedor = await FornecedorCompra.findByPk(Number(payload.fornecedor_compra_id), { transaction });
    if (!fornecedor) {
      throw new Error('Fornecedor do frete nao encontrado.');
    }
    return fornecedor;
  }

  if (Number(payload.parceiro_id || 0) > 0) {
    const parceiro = await Parceiro.findByPk(Number(payload.parceiro_id), { transaction });
    if (!parceiro || parceiro.ativo === false) {
      throw new Error('Credor/transportador do frete nao encontrado ou inativo.');
    }

    return sincronizarFornecedorCompraComParceiro(parceiro, {
      contato: payload.contato || null
    }, { transaction });
  }

  const novoFornecedor = payload.novo_fornecedor || null;
  if (!novoFornecedor || typeof novoFornecedor !== 'object') {
    if (permitirSemCredor) {
      return null;
    }
    throw new Error('Informe o credor/transportador do frete.');
  }

  return criarOuAtualizarFornecedorCentralizado({
    nome: novoFornecedor.nome,
    cpf_cnpj: novoFornecedor.cpf_cnpj || novoFornecedor.cnpj,
    whatsapp: novoFornecedor.whatsapp || novoFornecedor.telefone,
    telefone: novoFornecedor.telefone || novoFornecedor.whatsapp,
    email: novoFornecedor.email,
    contato: novoFornecedor.contato,
    observacoes: novoFornecedor.observacoes
  }, { transaction });
}

async function registrarFretePedido({
  pedidoId,
  payload = {},
  usuarioId = null,
  idempotencyKey = null,
  permitirSemCredor = false,
  transaction
}) {
  const pedido = await PedidoCompra.findByPk(Number(pedidoId), {
    include: [
      { model: PedidoCompraItem, as: 'itens' },
      { model: FornecedorCompra, as: 'fornecedor', attributes: ['id', 'nome'] },
      { model: SolicitacaoCompra, as: 'solicitacao', attributes: ['id', 'solicitacao_principal_id', 'status'] }
    ],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined
  });

  if (!pedido) {
    throw new Error('Pedido de compra nao encontrado.');
  }
  if (normalizeToken(pedido.status) === 'CANCELADO') {
    throw new Error('Pedido cancelado nao aceita novos fretes.');
  }

  const key = idempotencyKey ? String(idempotencyKey).trim().slice(0, 120) : null;
  const origemCotacaoFornecedorId = Number(payload.origem_cotacao_fornecedor_id || 0) || null;
  let freteOrigemCancelado = null;
  if (origemCotacaoFornecedorId) {
    const existenteOrigem = await PedidoCompraFrete.findOne({
      where: {
        pedido_compra_id: pedido.id,
        origem_cotacao_fornecedor_id: origemCotacaoFornecedorId
      },
      transaction
    });
    if (existenteOrigem) {
      if (normalizeToken(existenteOrigem.status_financeiro) !== 'CANCELADO') {
        const fretes = await listarFretesPedido(existenteOrigem.pedido_compra_id, { transaction });
        return fretes.find((item) => Number(item.id) === Number(existenteOrigem.id)) || serializeFrete(existenteOrigem);
      }
      if (existenteOrigem.titulo_financeiro_id) {
        throw new Error('O frete cancelado desta cotacao ainda possui titulo financeiro vinculado. Regularize o titulo antes de gerar um novo pedido.');
      }
      freteOrigemCancelado = existenteOrigem;
    }
  }
  if (key) {
    const existente = await PedidoCompraFrete.findOne({
      where: { pedido_compra_id: pedido.id, idempotency_key: key },
      transaction
    });
    if (existente && Number(existente.id) !== Number(freteOrigemCancelado?.id || 0)) {
      const fretes = await listarFretesPedido(pedido.id, { transaction });
      return fretes.find((item) => Number(item.id) === Number(existente.id)) || serializeFrete(existente);
    }
  }

  const tipo = normalizeToken(payload.tipo || 'EMBUTIDO');
  const momento = normalizeToken(payload.momento || 'FECHAMENTO');
  const criterioRateio = normalizeToken(payload.criterio_rateio || 'VALOR_ITENS');
  const valorTotal = roundMoney(payload.valor_total);
  const dataVencimento = payload.data_vencimento || null;

  if (!['EMBUTIDO', 'TERCEIRO'].includes(tipo)) {
    throw new Error('Tipo de frete invalido.');
  }
  if (!['FECHAMENTO', 'POSTERIOR'].includes(momento)) {
    throw new Error('Momento do frete invalido.');
  }
  if (!['VALOR_ITENS', 'POR_ITEM'].includes(criterioRateio)) {
    throw new Error('Criterio de rateio ainda nao disponivel para este pedido.');
  }
  if (valorTotal <= 0) {
    throw new Error('Informe um valor de frete maior que zero.');
  }

  const edicaoBloqueadaPorStatus = await isPedidoCompraStatusLocked(pedido.status);
  if (tipo === 'EMBUTIDO' && edicaoBloqueadaPorStatus) {
    throw new Error('Pedido fechado aceita apenas frete pago a terceiro.');
  }
  if (momento === 'FECHAMENTO' && edicaoBloqueadaPorStatus) {
    throw new Error('Pedido fechado aceita apenas frete informado depois.');
  }
  if (tipo === 'TERCEIRO' && !dataVencimento) {
    throw new Error('Informe a data de vencimento do frete pago a terceiro.');
  }

  const fornecedor = tipo === 'TERCEIRO'
    ? await resolverFornecedorFrete(payload, transaction, { permitirSemCredor })
    : null;
  const dadosPagamento = payload.dados_pagamento && typeof payload.dados_pagamento === 'object'
    ? JSON.stringify(payload.dados_pagamento)
    : (payload.dados_pagamento ? JSON.stringify({ observacoes: String(payload.dados_pagamento) }) : null);
  const statusFinanceiro = tipo === 'TERCEIRO' ? 'PENDENTE_TITULO' : 'NAO_GERA_TITULO';
  const rateios = criterioRateio === 'POR_ITEM'
    ? calcularRateiosInformados({
        itens: pedido.itens || [],
        valorTotal,
        pedido,
        rateiosInformados: payload.rateios
      })
    : calcularRateiosProporcionais({
        itens: pedido.itens || [],
        valorTotal,
        pedido
      });

  const dadosFrete = {
      pedido_compra_id: pedido.id,
      solicitacao_compra_id: pedido.solicitacao_compra_id,
      origem_cotacao_fornecedor_id: origemCotacaoFornecedorId,
      solicitacao_id: pedido.solicitacao?.solicitacao_principal_id || null,
      obra_id: pedido.obra_id || null,
      tipo,
      momento,
      criterio_rateio: criterioRateio,
      status_financeiro: statusFinanceiro,
      valor_total: valorTotal,
      data_vencimento: tipo === 'TERCEIRO' ? dataVencimento : null,
      fornecedor_compra_id: fornecedor?.id || null,
      parceiro_id: fornecedor?.parceiro_id || null,
      dados_pagamento: dadosPagamento,
      observacoes: payload.observacoes || null,
      idempotency_key: key,
      registrado_por: usuarioId || null
  };
  const frete = freteOrigemCancelado
    ? await freteOrigemCancelado.update(dadosFrete, { transaction })
    : await PedidoCompraFrete.create(dadosFrete, { transaction });

  if (freteOrigemCancelado) {
    await PedidoCompraFreteRateio.destroy({ where: { frete_id: frete.id }, transaction });
  }

  await PedidoCompraFreteRateio.bulkCreate(
    rateios.map((rateio) => ({ ...rateio, frete_id: frete.id })),
    { transaction }
  );
  await sincronizarTotaisFretePedido(pedido.id, transaction);

  await registrarLogSolicitacaoCompra({
    solicitacaoCompraId: pedido.solicitacao_compra_id,
    usuarioId,
    fornecedorCompraId: fornecedor?.id || null,
    tipoAcao: freteOrigemCancelado ? 'FRETE_PEDIDO_REATIVADO' : 'FRETE_PEDIDO_REGISTRADO',
    descricao: freteOrigemCancelado
      ? `Frete da cotacao reativado para o pedido PC-${String(pedido.id).padStart(5, '0')}`
      : (tipo === 'TERCEIRO'
        ? `Frete de terceiro registrado para o pedido PC-${String(pedido.id).padStart(5, '0')}`
        : `Frete embutido registrado para o pedido PC-${String(pedido.id).padStart(5, '0')}`),
    metadados: {
      pedido_compra_id: pedido.id,
      frete_id: frete.id,
      tipo,
      momento,
      valor_total: valorTotal,
      origem_cotacao_fornecedor_id: origemCotacaoFornecedorId,
      status_financeiro: statusFinanceiro
    },
    transaction
  });

  if (tipo === 'TERCEIRO' && Number(pedido.solicitacao?.solicitacao_principal_id || 0) > 0) {
    await Historico.create(
      {
        solicitacao_id: pedido.solicitacao.solicitacao_principal_id,
        usuario_responsavel_id: usuarioId || null,
        setor: 'FINANCEIRO',
        acao: 'FRETE_PENDENTE_FINANCEIRO',
        observacao: `Frete de terceiro pendente de titulo: ${fornecedor?.nome || payload.dados_pagamento?.transportador_nome || 'credor a definir'} - R$ ${valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        descricao: `Pedido PC-${String(pedido.id).padStart(5, '0')} possui frete de terceiro pendente para o financeiro.`,
        metadata: JSON.stringify({
          tipo: 'FRETE_PEDIDO_COMPRA',
          pedido_compra_id: pedido.id,
          frete_id: frete.id,
          solicitacao_compra_id: pedido.solicitacao_compra_id,
          fornecedor_compra_id: fornecedor?.id || null,
          parceiro_id: fornecedor?.parceiro_id || null,
          valor_total: valorTotal,
          dados_pagamento: safeJsonParse(dadosPagamento, null)
        })
      },
      { transaction }
    );
  }

  const fretes = await listarFretesPedido(pedido.id, { transaction });
  return fretes.find((item) => Number(item.id) === Number(frete.id)) || serializeFrete(frete);
}

async function carregarPedidoFreteParaControle({ pedidoId, freteId, transaction }) {
  const pedido = await PedidoCompra.findByPk(Number(pedidoId), {
    include: [
      { model: PedidoCompraItem, as: 'itens' },
      { model: FornecedorCompra, as: 'fornecedor', attributes: ['id', 'nome'] },
      { model: SolicitacaoCompra, as: 'solicitacao', attributes: ['id', 'solicitacao_principal_id', 'status'] }
    ],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined
  });

  if (!pedido) {
    throw new Error('Pedido de compra nao encontrado.');
  }

  const frete = await PedidoCompraFrete.findOne({
    where: {
      id: Number(freteId),
      pedido_compra_id: pedido.id
    },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined
  });

  if (!frete) {
    throw new Error('Frete do pedido nao encontrado.');
  }

  return { pedido, frete };
}

function assertFretePodeSerAlterado(frete) {
  const status = normalizeToken(frete.status_financeiro);
  if (status === 'CANCELADO') {
    throw new Error('Frete cancelado nao pode ser alterado.');
  }
  if (frete.titulo_financeiro_id || status === 'TITULO_GERADO') {
    throw new Error('Frete com titulo financeiro gerado nao pode ser alterado. Estorne ou cancele o titulo antes de corrigir o frete.');
  }
}

async function registrarHistoricoControleFrete({
  pedido,
  frete,
  usuarioId,
  tipoAcao,
  descricao,
  observacao,
  metadados = {},
  transaction
}) {
  await registrarLogSolicitacaoCompra({
    solicitacaoCompraId: pedido.solicitacao_compra_id,
    usuarioId,
    fornecedorCompraId: frete.fornecedor_compra_id || null,
    tipoAcao,
    descricao,
    metadados: {
      pedido_compra_id: pedido.id,
      frete_id: frete.id,
      tipo: frete.tipo,
      status_financeiro: frete.status_financeiro,
      ...metadados
    },
    transaction
  });

  if (Number(pedido.solicitacao?.solicitacao_principal_id || 0) > 0) {
    await Historico.create(
      {
        solicitacao_id: pedido.solicitacao.solicitacao_principal_id,
        usuario_responsavel_id: usuarioId || null,
        setor: 'COMPRAS',
        acao: tipoAcao,
        observacao,
        descricao,
        metadata: JSON.stringify({
          tipo: 'FRETE_PEDIDO_COMPRA',
          pedido_compra_id: pedido.id,
          frete_id: frete.id,
          solicitacao_compra_id: pedido.solicitacao_compra_id,
          ...metadados
        })
      },
      { transaction }
    );
  }
}

async function salvarRateiosPreservandoRegistros(freteId, rateios, transaction) {
  const existentes = await PedidoCompraFreteRateio.findAll({ where: { frete_id: freteId }, transaction, lock: transaction?.LOCK?.UPDATE });
  const pendentes = new Map(rateios.map(r => [Number(r.pedido_compra_item_id), r]));
  for (const row of existentes) {
    const next = pendentes.get(Number(row.pedido_compra_item_id));
    await row.update(next ? {
      valor_item_base: next.valor_item_base, percentual_rateio: next.percentual_rateio,
      valor_rateado: next.valor_rateado, manual: next.manual
    } : { valor_item_base: 0, percentual_rateio: 0, valor_rateado: 0 }, { transaction });
    pendentes.delete(Number(row.pedido_compra_item_id));
  }
  if (pendentes.size) await PedidoCompraFreteRateio.bulkCreate([...pendentes.values()].map(r => ({ ...r, frete_id: freteId })), { transaction });
}

async function recalcularRateiosFrete({ pedido, frete, valorTotal, rateiosInformados, transaction, preservarRateios = false }) {
  const itensAtivos = (pedido.itens || []).filter((item) => !item.removido);
  let totalEfetivo = roundMoney(valorTotal);
  let rateios;

  if (Array.isArray(rateiosInformados) && rateiosInformados.length) {
    rateios = calcularRateiosInformados({
      itens: itensAtivos,
      valorTotal: totalEfetivo,
      pedido,
      rateiosInformados
    });
  } else if (normalizeToken(frete.criterio_rateio) === 'POR_ITEM' && frete.origem_cotacao_fornecedor_id) {
    const alocacoes = await SolicitacaoCompraAlocacao.findAll({
      where: {
        pedido_compra_id: pedido.id,
        status: 'ATIVA',
        frete_rateado: { [Op.gt]: 0 }
      },
      attributes: ['pedido_compra_item_id', 'frete_rateado'],
      transaction
    });
    const fretePorItem = new Map();
    for (const alocacao of alocacoes) {
      const itemId = Number(alocacao.pedido_compra_item_id || 0);
      fretePorItem.set(itemId, roundMoney((fretePorItem.get(itemId) || 0) + asNumber(alocacao.frete_rateado)));
    }
    const rateiosCotacao = itensAtivos
      .map((item) => ({
        pedido_compra_item_id: item.id,
        valor_rateado: fretePorItem.get(Number(item.id)) || 0
      }))
      .filter((item) => item.valor_rateado > 0);
    totalEfetivo = roundMoney(rateiosCotacao.reduce((sum, item) => sum + item.valor_rateado, 0));
    rateios = totalEfetivo > 0
      ? calcularRateiosInformados({
          itens: itensAtivos,
          valorTotal: totalEfetivo,
          pedido,
          rateiosInformados: rateiosCotacao
        })
      : [];
  } else if (normalizeToken(frete.criterio_rateio) === 'POR_ITEM') {
    const existentes = await PedidoCompraFreteRateio.findAll({
      where: { frete_id: frete.id },
      transaction
    });
    const idsAtivos = new Set(itensAtivos.map((item) => Number(item.id)));
    const preservados = existentes
      .filter((rateio) => idsAtivos.has(Number(rateio.pedido_compra_item_id)))
      .map((rateio) => ({
        pedido_compra_item_id: rateio.pedido_compra_item_id,
        valor_rateado: asNumber(rateio.valor_rateado)
      }));
    const rateiosPositivos = preservados.filter((item) => item.valor_rateado > 0);
    const basePreservada = rateiosPositivos.reduce((sum, item) => sum + item.valor_rateado, 0);
    const escalados = basePreservada > 0 ? rateiosPositivos.map((item, index) => ({
      pedido_compra_item_id: item.pedido_compra_item_id,
      valor_rateado: index === rateiosPositivos.length - 1
        ? roundMoney(totalEfetivo - rateiosPositivos.slice(0, -1).reduce(
            (sum, entry) => sum + roundMoney(totalEfetivo * entry.valor_rateado / basePreservada),
            0
          ))
        : roundMoney(totalEfetivo * item.valor_rateado / basePreservada)
    })) : [];
    rateios = escalados.length
      ? calcularRateiosInformados({
          itens: itensAtivos,
          valorTotal: totalEfetivo,
          pedido,
          rateiosInformados: escalados
        })
      : calcularRateiosProporcionais({ itens: itensAtivos, valorTotal: totalEfetivo, pedido });
  } else {
    rateios = calcularRateiosProporcionais({
      itens: itensAtivos,
      valorTotal: totalEfetivo,
      pedido
    });
  }

  if (preservarRateios) await salvarRateiosPreservandoRegistros(frete.id, rateios, transaction);
  else {
    await PedidoCompraFreteRateio.destroy({
      where: { frete_id: frete.id },
      transaction
    });

    await PedidoCompraFreteRateio.bulkCreate(
      rateios.map((rateio) => ({ ...rateio, frete_id: frete.id })),
      { transaction }
    );
  }
  if (roundMoney(frete.valor_total) !== totalEfetivo) {
    await frete.update({ valor_total: totalEfetivo }, { transaction });
  }
  return totalEfetivo;
}

async function sincronizarRateiosFretesPendentesPedido({
  pedidoId,
  usuarioId = null,
  motivo = 'Itens do pedido alterados',
  transaction,
  preservarRateios = false
}) {
  const pedido = await PedidoCompra.findByPk(Number(pedidoId), {
    include: [
      { model: PedidoCompraItem, as: 'itens' },
      { model: FornecedorCompra, as: 'fornecedor', attributes: ['id', 'nome'] },
      { model: SolicitacaoCompra, as: 'solicitacao', attributes: ['id', 'solicitacao_principal_id', 'status'] }
    ],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined
  });
  if (!pedido) {
    throw new Error('Pedido de compra nao encontrado para sincronizar o frete.');
  }

  const fretes = await PedidoCompraFrete.findAll({
    where: {
      pedido_compra_id: pedido.id,
      titulo_financeiro_id: null,
      [Op.or]: [
        { status_financeiro: { [Op.ne]: 'CANCELADO' } },
        { status_financeiro: null }
      ]
    },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined
  });
  const itensAtivos = (pedido.itens || []).filter((item) => !item.removido);

  for (const frete of fretes) {
    if (!itensAtivos.length) {
      await frete.update({ status_financeiro: 'CANCELADO' }, { transaction });
      if (preservarRateios) await salvarRateiosPreservandoRegistros(frete.id, [], transaction);
      else await PedidoCompraFreteRateio.destroy({ where: { frete_id: frete.id }, transaction });
      await registrarHistoricoControleFrete({
        pedido,
        frete,
        usuarioId,
        tipoAcao: 'FRETE_PEDIDO_CANCELADO_AUTOMATICAMENTE',
        descricao: `Frete do pedido PC-${String(pedido.id).padStart(5, '0')} cancelado apos remanejamento integral`,
        observacao: `${motivo}. O pedido ficou sem itens ativos.`,
        metadados: { motivo, automatico: true },
        transaction
      });
      continue;
    }

    await recalcularRateiosFrete({
      pedido: { ...pedido.toJSON(), itens: itensAtivos },
      frete,
      valorTotal: roundMoney(frete.valor_total),
      transaction,
      preservarRateios
    });
  }

  await sincronizarTotaisFretePedido(pedido.id, transaction);

  return fretes.length;
}

async function atualizarFretePedido({
  pedidoId,
  freteId,
  payload = {},
  usuarioId = null,
  transaction
}) {
  const { pedido, frete } = await carregarPedidoFreteParaControle({ pedidoId, freteId, transaction });
  assertFretePodeSerAlterado(frete);

  const tipo = normalizeToken(frete.tipo);
  const valorAnterior = roundMoney(frete.valor_total);
  const valorTotal = roundMoney(payload.valor_total);
  const dataVencimento = payload.data_vencimento || null;
  let fornecedor = null;

  if (valorTotal <= 0) {
    throw new Error('Informe um valor de frete maior que zero.');
  }

  if (tipo === 'TERCEIRO') {
    if (!dataVencimento) {
      throw new Error('Informe a data de vencimento do frete pago a terceiro.');
    }
    fornecedor = await resolverFornecedorFrete(payload, transaction);
  }

  const dadosPagamento = payload.dados_pagamento && typeof payload.dados_pagamento === 'object'
    ? JSON.stringify(payload.dados_pagamento)
    : (payload.dados_pagamento ? JSON.stringify({ observacoes: String(payload.dados_pagamento) }) : null);

  await frete.update(
    {
      valor_total: valorTotal,
      data_vencimento: tipo === 'TERCEIRO' ? dataVencimento : null,
      fornecedor_compra_id: tipo === 'TERCEIRO' ? fornecedor?.id || null : null,
      parceiro_id: tipo === 'TERCEIRO' ? fornecedor?.parceiro_id || null : null,
      dados_pagamento: tipo === 'TERCEIRO' ? dadosPagamento : null,
      observacoes: payload.observacoes || null
    },
    { transaction }
  );

  await recalcularRateiosFrete({
    pedido,
    frete,
    valorTotal,
    rateiosInformados: payload.rateios,
    transaction
  });
  await sincronizarTotaisFretePedido(pedido.id, transaction);

  await registrarHistoricoControleFrete({
    pedido,
    frete,
    usuarioId,
    tipoAcao: 'FRETE_PEDIDO_ATUALIZADO',
    descricao: `Frete do pedido PC-${String(pedido.id).padStart(5, '0')} atualizado`,
    observacao: `Frete do pedido atualizado de R$ ${valorAnterior.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} para R$ ${valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`,
    metadados: {
      valor_anterior: valorAnterior,
      valor_total: valorTotal,
      data_vencimento: tipo === 'TERCEIRO' ? dataVencimento : null,
      fornecedor_compra_id: tipo === 'TERCEIRO' ? fornecedor?.id || null : null,
      parceiro_id: tipo === 'TERCEIRO' ? fornecedor?.parceiro_id || null : null
    },
    transaction
  });

  const fretes = await listarFretesPedido(pedido.id, { transaction });
  return fretes.find((item) => Number(item.id) === Number(frete.id)) || serializeFrete(frete);
}

async function cancelarFretePedido({
  pedidoId,
  freteId,
  motivo,
  usuarioId = null,
  transaction
}) {
  const textoMotivo = String(motivo || '').trim();
  if (!textoMotivo) {
    throw new Error('Informe o motivo do cancelamento do frete.');
  }

  const { pedido, frete } = await carregarPedidoFreteParaControle({ pedidoId, freteId, transaction });
  assertFretePodeSerAlterado(frete);

  const valorAnterior = roundMoney(frete.valor_total);
  await frete.update(
    {
      status_financeiro: 'CANCELADO'
    },
    { transaction }
  );
  await sincronizarTotaisFretePedido(pedido.id, transaction);

  await registrarHistoricoControleFrete({
    pedido,
    frete,
    usuarioId,
    tipoAcao: 'FRETE_PEDIDO_CANCELADO',
    descricao: `Frete do pedido PC-${String(pedido.id).padStart(5, '0')} cancelado`,
    observacao: `Frete do pedido cancelado. Motivo: ${textoMotivo}`,
    metadados: {
      valor_total: valorAnterior,
      motivo: textoMotivo
    },
    transaction
  });

  const fretes = await listarFretesPedido(pedido.id, { transaction });
  return fretes.find((item) => Number(item.id) === Number(frete.id)) || serializeFrete(frete);
}

module.exports = {
  atualizarFretePedido,
  cancelarFretePedido,
  listarFretesPendentesFinanceiro,
  listarFretesPedido,
  registrarFretePedido,
  sincronizarRateiosFretesPendentesPedido
};
