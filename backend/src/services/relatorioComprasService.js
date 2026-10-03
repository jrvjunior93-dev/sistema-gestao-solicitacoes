const { Op } = require('sequelize');
const {
  Categoria,
  ConfiguracaoSistema,
  FornecedorCompra,
  Insumo,
  Obra,
  Parceiro,
  PedidoCompra,
  PedidoCompraItem,
  Solicitacao,
  SolicitacaoCompra,
  SolicitacaoCompraFornecedor,
  SolicitacaoCompraItem,
  SolicitacaoCompraItemManual,
  SolicitacaoCompraRespostaItem,
  Unidade,
  User,
  Apropriacao
} = require('../models');

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value) {
  return Math.round(toNumber(value) * 100) / 100;
}

function toDate(value) {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function diffHours(start, end) {
  const startedAt = toDate(start);
  const endedAt = toDate(end);
  if (!startedAt || !endedAt || endedAt < startedAt) {
    return null;
  }
  return Number(((endedAt.getTime() - startedAt.getTime()) / 36e5).toFixed(2));
}

function average(values) {
  const validValues = values.filter((value) => Number.isFinite(Number(value)));
  if (!validValues.length) {
    return null;
  }
  return Number((validValues.reduce((sum, value) => sum + Number(value), 0) / validValues.length).toFixed(2));
}

function minDate(values) {
  const dates = values.map(toDate).filter(Boolean);
  if (!dates.length) {
    return null;
  }
  return dates.reduce((min, date) => (date < min ? date : min), dates[0]);
}

function maxDate(values) {
  const dates = values.map(toDate).filter(Boolean);
  if (!dates.length) {
    return null;
  }
  return dates.reduce((max, date) => (date > max ? date : max), dates[0]);
}

function todayDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

function monthKeyFromDate(value) {
  const date = toDate(value);
  if (!date) {
    return 'SEM_DATA';
  }
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
}

function monthLabelFromKey(key) {
  if (!key || key === 'SEM_DATA') {
    return 'Sem data';
  }
  const [year, month] = String(key).split('-');
  return `${month}/${year}`;
}

function calculateRespostaValor(resposta) {
  if (!resposta || !resposta.disponivel || resposta.preco == null) {
    return 0;
  }

  const item = resposta.itemCadastrado || resposta.itemManual;
  const quantidade = toNumber(item?.quantidade);
  return roundMoney(toNumber(resposta.preco) * quantidade);
}

function buildDateWhere({ dataInicio, dataFim }) {
  const where = {};

  if (dataInicio || dataFim) {
    where.enviado_em = {};
    if (dataInicio) {
      where.enviado_em[Op.gte] = new Date(`${dataInicio}T00:00:00.000`);
    }
    if (dataFim) {
      where.enviado_em[Op.lte] = new Date(`${dataFim}T23:59:59.999`);
    }
  }

  return where;
}

function buildSolicitacaoWhere({ obraId, obraIds }) {
  const where = {};

  if (obraId) {
    where.obra_id = Number(obraId);
  }

  if (Array.isArray(obraIds)) {
    if (obraIds.length === 0) {
      where.id = { [Op.in]: [] };
    } else if (!obraId) {
      where.obra_id = { [Op.in]: obraIds };
    }
  }

  return where;
}

function buildSolicitacaoPeriodoWhere({ obraId, obraIds, dataInicio, dataFim }) {
  const where = buildSolicitacaoWhere({ obraId, obraIds });

  if (dataInicio || dataFim) {
    where.encerrado_em = {};
    if (dataInicio) {
      where.encerrado_em[Op.gte] = new Date(`${dataInicio}T00:00:00.000`);
    }
    if (dataFim) {
      where.encerrado_em[Op.lte] = new Date(`${dataFim}T23:59:59.999`);
    }
  }

  return where;
}

function buildSolicitacaoCriacaoWhere({ obraId, obraIds, dataInicio, dataFim }) {
  const where = buildSolicitacaoWhere({ obraId, obraIds });

  if (dataInicio || dataFim) {
    where.createdAt = {};
    if (dataInicio) {
      where.createdAt[Op.gte] = new Date(`${dataInicio}T00:00:00.000`);
    }
    if (dataFim) {
      where.createdAt[Op.lte] = new Date(`${dataFim}T23:59:59.999`);
    }
  }

  return where;
}

function buildCompraDiretaCriacaoWhere({
  obraId,
  obraIds,
  dataInicio,
  dataFim,
  solicitanteId,
  status
}) {
  const where = buildSolicitacaoCriacaoWhere({ obraId, obraIds, dataInicio, dataFim });
  where.origem = 'COMPRA_DIRETA';

  if (solicitanteId) {
    where.solicitante_id = Number(solicitanteId);
  }

  if (status) {
    where.status = String(status).trim();
  }

  return where;
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function includesSearch(value, search) {
  if (!search) {
    return true;
  }
  return normalizeSearchText(value).includes(search);
}

function addCompraDiretaRanking(map, key, label, compraId, quantidade, valor, extra = {}) {
  const mapKey = key || 'SEM_INFORMACAO';
  if (!map.has(mapKey)) {
    map.set(mapKey, {
      key: mapKey,
      label: label || 'Sem informacao',
      compras_ids: new Set(),
      itens: 0,
      quantidade_total: 0,
      valor_total: 0,
      ...extra
    });
  }

  const item = map.get(mapKey);
  if (compraId) {
    item.compras_ids.add(Number(compraId));
  }
  item.itens += 1;
  item.quantidade_total += toNumber(quantidade);
  item.valor_total = roundMoney(item.valor_total + toNumber(valor));
  return item;
}

function finalizeCompraDiretaRanking(map, labelKey = 'label') {
  return Array.from(map.values())
    .map((item) => ({
      ...item,
      compras: item.compras_ids?.size || 0,
      compras_ids: undefined,
      quantidade_total: Number(item.quantidade_total.toFixed(3)),
      valor_total: roundMoney(item.valor_total),
      ticket_medio: item.compras_ids?.size > 0
        ? roundMoney(item.valor_total / item.compras_ids.size)
        : 0
    }))
    .sort((a, b) => {
      if (Number(b.valor_total || 0) !== Number(a.valor_total || 0)) {
        return Number(b.valor_total || 0) - Number(a.valor_total || 0);
      }
      return String(a[labelKey] || a.label || '').localeCompare(String(b[labelKey] || b.label || ''), 'pt-BR');
    });
}

function buildPedidoCriacaoWhere({ obraId, obraIds, dataInicio, dataFim }) {
  const where = buildSolicitacaoWhere({ obraId, obraIds });

  if (dataInicio || dataFim) {
    where.createdAt = {};
    if (dataInicio) {
      where.createdAt[Op.gte] = new Date(`${dataInicio}T00:00:00.000`);
    }
    if (dataFim) {
      where.createdAt[Op.lte] = new Date(`${dataFim}T23:59:59.999`);
    }
  }

  return where;
}

function normalizeStatus(value) {
  return String(value || 'SEM_STATUS').trim().toUpperCase() || 'SEM_STATUS';
}

function formatStatusLabel(value) {
  return normalizeStatus(value)
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function incrementResumoMap(map, key, label, defaults = {}) {
  const mapKey = key || 'SEM_INFORMACAO';
  if (!map.has(mapKey)) {
    map.set(mapKey, {
      key: mapKey,
      label: label || formatStatusLabel(mapKey),
      total: 0,
      valor_total: 0,
      ...defaults
    });
  }
  const item = map.get(mapKey);
  item.total += 1;
  return item;
}

function finalizeResumoMap(map) {
  return Array.from(map.values())
    .map((item) => ({
      ...item,
      valor_total: roundMoney(item.valor_total)
    }))
    .sort((a, b) => {
      if (Number(b.total || 0) !== Number(a.total || 0)) {
        return Number(b.total || 0) - Number(a.total || 0);
      }
      return String(a.label || '').localeCompare(String(b.label || ''), 'pt-BR');
    });
}

function createCategoriaComprasResumo(categoria) {
  return {
    key: categoria?.id ? String(categoria.id) : 'SEM_CATEGORIA',
    categoria_id: categoria?.id || null,
    categoria_nome: categoria?.nome || 'Itens manuais/sem categoria',
    itens: 0,
    pedidos_ids: new Set(),
    quantidade_total: 0,
    valor_total: 0
  };
}

function createInsumoComprasResumo({ key, descricao, unidade, categoria }) {
  return {
    key,
    descricao,
    unidade: unidade || null,
    categoria_id: categoria?.id || null,
    categoria_nome: categoria?.nome || 'Itens manuais/sem categoria',
    itens: 0,
    pedidos_ids: new Set(),
    quantidade_total: 0,
    valor_total: 0
  };
}

function createPrecoInsumoResumo({ key, descricao, unidade, categoria, origem }) {
  return {
    key,
    descricao,
    unidade: unidade || null,
    categoria_id: categoria?.id || null,
    categoria_nome: categoria?.nome || 'Itens manuais/sem categoria',
    origem: origem || 'MANUAL',
    pedidos_ids: new Set(),
    fornecedores: new Map(),
    quantidade_total: 0,
    valor_total: 0
  };
}

function finalizeComprasResumo(item) {
  return {
    ...item,
    pedidos: item.pedidos_ids.size,
    pedidos_ids: undefined,
    quantidade_total: Number(toNumber(item.quantidade_total).toFixed(3)),
    valor_total: roundMoney(item.valor_total)
  };
}

async function getMinimoCotacoesConfig() {
  const registro = await ConfiguracaoSistema.findOne({
    where: { chave: 'COTACOES_MIN_COTACOES' },
    order: [['id', 'DESC']]
  });
  const minimo = Number(registro?.valor || 3);
  return Number.isFinite(minimo) && minimo > 0 ? minimo : 3;
}

function createFornecedorResumo(fornecedor) {
  return {
    fornecedor: {
      id: fornecedor?.id || null,
      nome: fornecedor?.nome || 'Fornecedor sem cadastro',
      cnpj: fornecedor?.cnpj || null,
      email: fornecedor?.email || null,
      whatsapp: fornecedor?.whatsapp || null,
      cidade: fornecedor?.cidade || null,
      estado: fornecedor?.estado || null,
      ativo: fornecedor?.ativo !== false
    },
    cotacoes_enviadas: 0,
    cotacoes_visualizadas: 0,
    cotacoes_respondidas: 0,
    itens_respondidos: 0,
    itens_vencedores: 0,
    valor_cotado: 0,
    valor_vencedor: 0,
    prazo_total_resposta_horas: 0,
    prazo_respostas_com_data: 0,
    ultima_cotacao: null,
    obras_map: new Map()
  };
}

function finalizeFornecedorResumo(resumo) {
  const taxaResposta = resumo.cotacoes_enviadas > 0
    ? (resumo.cotacoes_respondidas / resumo.cotacoes_enviadas) * 100
    : 0;
  const taxaVisualizacao = resumo.cotacoes_enviadas > 0
    ? (resumo.cotacoes_visualizadas / resumo.cotacoes_enviadas) * 100
    : 0;
  const prazoMedio = resumo.prazo_respostas_com_data > 0
    ? resumo.prazo_total_resposta_horas / resumo.prazo_respostas_com_data
    : null;
  const cotacoesSemResposta = Math.max(0, resumo.cotacoes_enviadas - resumo.cotacoes_respondidas);
  const classificacaoResposta = resumo.cotacoes_enviadas < 2
    ? 'SEM_AMOSTRA'
    : taxaResposta < 50
      ? 'BAIXA_RESPOSTA'
      : taxaResposta < 80
        ? 'ATENCAO'
        : 'RESPONSIVO';

  return {
    fornecedor: resumo.fornecedor,
    cotacoes_enviadas: resumo.cotacoes_enviadas,
    cotacoes_visualizadas: resumo.cotacoes_visualizadas,
    cotacoes_respondidas: resumo.cotacoes_respondidas,
    cotacoes_sem_resposta: cotacoesSemResposta,
    taxa_resposta: Number(taxaResposta.toFixed(2)),
    taxa_visualizacao: Number(taxaVisualizacao.toFixed(2)),
    classificacao_resposta: classificacaoResposta,
    prazo_medio_resposta_horas: prazoMedio != null ? Number(prazoMedio.toFixed(2)) : null,
    itens_respondidos: resumo.itens_respondidos,
    itens_vencedores: resumo.itens_vencedores,
    valor_cotado: roundMoney(resumo.valor_cotado),
    valor_vencedor: roundMoney(resumo.valor_vencedor),
    ultima_cotacao: resumo.ultima_cotacao,
    obras: Array.from(resumo.obras_map.values())
  };
}

async function relatorioFornecedoresCompras({ obraId, dataInicio, dataFim, obraIds } = {}) {
  const participacoes = await SolicitacaoCompraFornecedor.findAll({
    where: buildDateWhere({ dataInicio, dataFim }),
    include: [
      {
        model: FornecedorCompra,
        as: 'fornecedor',
        attributes: ['id', 'nome', 'cnpj', 'email', 'whatsapp', 'cidade', 'estado', 'ativo']
      },
      {
        model: SolicitacaoCompra,
        as: 'solicitacao',
        attributes: ['id', 'obra_id', 'titulo'],
        required: true,
        where: buildSolicitacaoWhere({ obraId, obraIds })
      },
      {
        model: SolicitacaoCompraRespostaItem,
        as: 'respostas',
        where: { deleted_at: null },
        required: false,
        attributes: ['id', 'disponivel', 'preco', 'vencedor'],
        include: [
          {
            model: SolicitacaoCompraItem,
            as: 'itemCadastrado',
            attributes: ['id', 'quantidade']
          },
          {
            model: SolicitacaoCompraItemManual,
            as: 'itemManual',
            attributes: ['id', 'quantidade']
          }
        ]
      }
    ],
    order: [['enviado_em', 'DESC'], ['id', 'DESC']]
  });

  const fornecedoresMap = new Map();
  const resumoGeral = {
    fornecedores: 0,
    cotacoes_enviadas: 0,
    cotacoes_visualizadas: 0,
    cotacoes_respondidas: 0,
    itens_respondidos: 0,
    itens_vencedores: 0,
    valor_cotado: 0,
    valor_vencedor: 0
  };

  participacoes.forEach((participacao) => {
    const fornecedorKey = participacao.fornecedor?.id || `sem-cadastro-${participacao.id}`;
    if (!fornecedoresMap.has(fornecedorKey)) {
      fornecedoresMap.set(fornecedorKey, createFornecedorResumo(participacao.fornecedor));
    }

    const resumo = fornecedoresMap.get(fornecedorKey);
    const enviadoEm = participacao.enviado_em ? new Date(participacao.enviado_em) : null;
    const respondidoEm = participacao.respondido_em ? new Date(participacao.respondido_em) : null;

    resumo.cotacoes_enviadas += 1;
    resumoGeral.cotacoes_enviadas += 1;

    if (participacao.visualizado_em) {
      resumo.cotacoes_visualizadas += 1;
      resumoGeral.cotacoes_visualizadas += 1;
    }

    if (participacao.respondido_em) {
      resumo.cotacoes_respondidas += 1;
      resumoGeral.cotacoes_respondidas += 1;

      if (enviadoEm && respondidoEm && respondidoEm >= enviadoEm) {
        resumo.prazo_total_resposta_horas += (respondidoEm.getTime() - enviadoEm.getTime()) / 36e5;
        resumo.prazo_respostas_com_data += 1;
      }
    }

    if (!resumo.ultima_cotacao || (enviadoEm && new Date(resumo.ultima_cotacao) < enviadoEm)) {
      resumo.ultima_cotacao = participacao.enviado_em || participacao.createdAt || null;
    }

    const obraIdParticipacao = participacao.solicitacao?.obra_id || null;
    if (obraIdParticipacao && !resumo.obras_map.has(obraIdParticipacao)) {
      resumo.obras_map.set(obraIdParticipacao, {
        id: obraIdParticipacao,
        cotacoes_enviadas: 0,
        cotacoes_respondidas: 0
      });
    }
    const obraResumo = obraIdParticipacao ? resumo.obras_map.get(obraIdParticipacao) : null;
    if (obraResumo) {
      obraResumo.cotacoes_enviadas += 1;
      if (participacao.respondido_em) {
        obraResumo.cotacoes_respondidas += 1;
      }
    }

    (participacao.respostas || []).forEach((resposta) => {
      if (!resposta.disponivel || resposta.preco == null) {
        return;
      }

      const valor = calculateRespostaValor(resposta);
      resumo.itens_respondidos += 1;
      resumo.valor_cotado = roundMoney(resumo.valor_cotado + valor);
      resumoGeral.itens_respondidos += 1;
      resumoGeral.valor_cotado = roundMoney(resumoGeral.valor_cotado + valor);

      if (resposta.vencedor) {
        resumo.itens_vencedores += 1;
        resumo.valor_vencedor = roundMoney(resumo.valor_vencedor + valor);
        resumoGeral.itens_vencedores += 1;
        resumoGeral.valor_vencedor = roundMoney(resumoGeral.valor_vencedor + valor);
      }
    });
  });

  const fornecedores = Array.from(fornecedoresMap.values())
    .map(finalizeFornecedorResumo)
    .sort((a, b) => {
      if (b.valor_vencedor !== a.valor_vencedor) {
        return b.valor_vencedor - a.valor_vencedor;
      }
      if (b.cotacoes_respondidas !== a.cotacoes_respondidas) {
        return b.cotacoes_respondidas - a.cotacoes_respondidas;
      }
      return String(a.fornecedor.nome).localeCompare(String(b.fornecedor.nome), 'pt-BR');
    });

  resumoGeral.fornecedores = fornecedores.length;
  resumoGeral.taxa_resposta = resumoGeral.cotacoes_enviadas > 0
    ? Number(((resumoGeral.cotacoes_respondidas / resumoGeral.cotacoes_enviadas) * 100).toFixed(2))
    : 0;
  resumoGeral.taxa_visualizacao = resumoGeral.cotacoes_enviadas > 0
    ? Number(((resumoGeral.cotacoes_visualizadas / resumoGeral.cotacoes_enviadas) * 100).toFixed(2))
    : 0;
  resumoGeral.cotacoes_sem_resposta = Math.max(0, resumoGeral.cotacoes_enviadas - resumoGeral.cotacoes_respondidas);
  resumoGeral.fornecedores_baixa_resposta = fornecedores.filter(
    (fornecedor) => fornecedor.classificacao_resposta === 'BAIXA_RESPOSTA'
  ).length;

  const fornecedoresBaixaResposta = fornecedores
    .filter((fornecedor) => fornecedor.cotacoes_enviadas >= 2)
    .sort((a, b) => {
      if (Number(a.taxa_resposta || 0) !== Number(b.taxa_resposta || 0)) {
        return Number(a.taxa_resposta || 0) - Number(b.taxa_resposta || 0);
      }
      if (Number(b.cotacoes_sem_resposta || 0) !== Number(a.cotacoes_sem_resposta || 0)) {
        return Number(b.cotacoes_sem_resposta || 0) - Number(a.cotacoes_sem_resposta || 0);
      }
      return String(a.fornecedor.nome).localeCompare(String(b.fornecedor.nome), 'pt-BR');
    })
    .slice(0, 20);

  return {
    filtros: {
      obra_id: obraId || null,
      data_inicio: dataInicio || null,
      data_fim: dataFim || null
    },
    resumo: resumoGeral,
    fornecedores,
    fornecedores_baixa_resposta: fornecedoresBaixaResposta
  };
}

async function relatorioDemandaPedidosCompras({ obraId, dataInicio, dataFim, obraIds } = {}) {
  const [solicitacoes, pedidos] = await Promise.all([
    SolicitacaoCompra.findAll({
      where: buildSolicitacaoCriacaoWhere({ obraId, obraIds, dataInicio, dataFim }),
      attributes: ['id', 'titulo', 'obra_id', 'status', 'createdAt', 'liberado_para_compra_em', 'encerrado_em'],
      include: [
        { model: Obra, as: 'obra', attributes: ['id', 'nome'] },
        { model: PedidoCompra, as: 'pedidos', attributes: ['id', 'status', 'valor_total', 'createdAt'] }
      ],
      order: [['createdAt', 'DESC'], ['id', 'DESC']]
    }),
    PedidoCompra.findAll({
      where: buildPedidoCriacaoWhere({ obraId, obraIds, dataInicio, dataFim }),
      attributes: ['id', 'obra_id', 'status', 'valor_total', 'createdAt', 'encerrado_em', 'solicitacao_compra_id'],
      include: [
        { model: Obra, as: 'obra', attributes: ['id', 'nome'] },
        { model: SolicitacaoCompra, as: 'solicitacao', attributes: ['id', 'titulo', 'status'] }
      ],
      order: [['createdAt', 'DESC'], ['id', 'DESC']]
    })
  ]);

  const solicitacoesPorStatus = new Map();
  const pedidosPorStatus = new Map();
  const solicitacoesPorObra = new Map();
  const pedidosPorObra = new Map();
  const linhasSolicitacoes = [];
  const linhasPedidos = [];

  solicitacoes.forEach((solicitacao) => {
    const plain = solicitacao.toJSON ? solicitacao.toJSON() : solicitacao;
    const statusKey = normalizeStatus(plain.status);
    const statusResumo = incrementResumoMap(solicitacoesPorStatus, statusKey, formatStatusLabel(statusKey));
    const valorPedidos = (plain.pedidos || []).reduce((sum, pedido) => sum + toNumber(pedido.valor_total), 0);
    statusResumo.valor_total = roundMoney(statusResumo.valor_total + valorPedidos);

    const obraKey = plain.obra_id ? String(plain.obra_id) : 'SEM_OBRA';
    const obraResumo = incrementResumoMap(solicitacoesPorObra, obraKey, plain.obra?.nome || 'Sem obra/centro');
    obraResumo.valor_total = roundMoney(obraResumo.valor_total + valorPedidos);

    linhasSolicitacoes.push({
      id: plain.id,
      titulo: plain.titulo || null,
      status: statusKey,
      status_label: formatStatusLabel(statusKey),
      obra: plain.obra ? { id: plain.obra.id, nome: plain.obra.nome } : null,
      criado_em: plain.createdAt || null,
      liberado_em: plain.liberado_para_compra_em || null,
      encerrado_em: plain.encerrado_em || null,
      pedidos: (plain.pedidos || []).length,
      valor_pedidos: roundMoney(valorPedidos)
    });
  });

  pedidos.forEach((pedido) => {
    const plain = pedido.toJSON ? pedido.toJSON() : pedido;
    const statusKey = normalizeStatus(plain.status);
    const valor = roundMoney(plain.valor_total);
    const statusResumo = incrementResumoMap(pedidosPorStatus, statusKey, formatStatusLabel(statusKey));
    statusResumo.valor_total = roundMoney(statusResumo.valor_total + valor);

    const obraKey = plain.obra_id ? String(plain.obra_id) : 'SEM_OBRA';
    const obraResumo = incrementResumoMap(pedidosPorObra, obraKey, plain.obra?.nome || 'Sem obra/centro');
    obraResumo.valor_total = roundMoney(obraResumo.valor_total + valor);

    linhasPedidos.push({
      id: plain.id,
      status: statusKey,
      status_label: formatStatusLabel(statusKey),
      obra: plain.obra ? { id: plain.obra.id, nome: plain.obra.nome } : null,
      solicitacao: plain.solicitacao ? {
        id: plain.solicitacao.id,
        titulo: plain.solicitacao.titulo || null,
        status: plain.solicitacao.status || null
      } : null,
      criado_em: plain.createdAt || null,
      encerrado_em: plain.encerrado_em || null,
      valor_total: valor
    });
  });

  const resumo = {
    solicitacoes: solicitacoes.length,
    solicitacoes_liberadas: solicitacoes.filter((item) => item.liberado_para_compra_em).length,
    solicitacoes_encerradas: solicitacoes.filter((item) => item.encerrado_em).length,
    pedidos: pedidos.length,
    pedidos_encerrados: pedidos.filter((item) => item.encerrado_em).length,
    valor_pedidos: roundMoney(pedidos.reduce((sum, pedido) => sum + toNumber(pedido.valor_total), 0))
  };

  resumo.ticket_medio_pedido = resumo.pedidos > 0
    ? roundMoney(resumo.valor_pedidos / resumo.pedidos)
    : 0;

  return {
    filtros: {
      obra_id: obraId || null,
      data_inicio: dataInicio || null,
      data_fim: dataFim || null
    },
    resumo,
    solicitacoes_por_status: finalizeResumoMap(solicitacoesPorStatus),
    pedidos_por_status: finalizeResumoMap(pedidosPorStatus),
    solicitacoes_por_obra: finalizeResumoMap(solicitacoesPorObra),
    pedidos_por_obra: finalizeResumoMap(pedidosPorObra),
    solicitacoes: linhasSolicitacoes.slice(0, 100),
    pedidos: linhasPedidos.slice(0, 100)
  };
}

async function relatorioComprasPorFornecedor({ obraId, dataInicio, dataFim, obraIds } = {}) {
  const pedidos = await PedidoCompra.findAll({
    where: buildPedidoCriacaoWhere({ obraId, obraIds, dataInicio, dataFim }),
    attributes: [
      'id',
      'obra_id',
      'fornecedor_compra_id',
      'solicitacao_compra_id',
      'status',
      'valor_total',
      'valor_minimo_pedido',
      'atingiu_pedido_minimo',
      'createdAt',
      'encerrado_em'
    ],
    include: [
      { model: FornecedorCompra, as: 'fornecedor', attributes: ['id', 'nome', 'cnpj', 'email', 'whatsapp', 'cidade', 'estado'] },
      { model: Obra, as: 'obra', attributes: ['id', 'nome'] },
      { model: SolicitacaoCompra, as: 'solicitacao', attributes: ['id', 'titulo', 'status'] },
      { model: PedidoCompraItem, as: 'itens', attributes: ['id', 'valor_total', 'quantidade_pedido', 'removido'] }
    ],
    order: [['createdAt', 'DESC'], ['id', 'DESC']]
  });

  const fornecedoresMap = new Map();
  const obrasMap = new Map();
  const statusMap = new Map();
  const linhasPedidos = [];

  pedidos.forEach((pedido) => {
    const plain = pedido.toJSON ? pedido.toJSON() : pedido;
    const fornecedor = plain.fornecedor || null;
    const fornecedorKey = fornecedor?.id ? String(fornecedor.id) : 'SEM_FORNECEDOR';
    const valor = roundMoney(plain.valor_total);
    const itensValidos = (plain.itens || []).filter((item) => !item.removido);
    const statusKey = normalizeStatus(plain.status);

    if (!fornecedoresMap.has(fornecedorKey)) {
      fornecedoresMap.set(fornecedorKey, {
        key: fornecedorKey,
        fornecedor_id: fornecedor?.id || null,
        fornecedor_nome: fornecedor?.nome || 'Sem fornecedor',
        cnpj: fornecedor?.cnpj || null,
        email: fornecedor?.email || null,
        whatsapp: fornecedor?.whatsapp || null,
        cidade: fornecedor?.cidade || null,
        estado: fornecedor?.estado || null,
        pedidos: 0,
        pedidos_encerrados: 0,
        pedidos_minimo_nao_atingido: 0,
        itens: 0,
        obras_ids: new Set(),
        obras_nomes: new Set(),
        status: new Map(),
        valor_total: 0,
        primeiro_pedido_em: null,
        ultimo_pedido_em: null
      });
    }

    const fornecedorResumo = fornecedoresMap.get(fornecedorKey);
    fornecedorResumo.pedidos += 1;
    fornecedorResumo.pedidos_encerrados += plain.encerrado_em ? 1 : 0;
    fornecedorResumo.pedidos_minimo_nao_atingido += plain.atingiu_pedido_minimo === false ? 1 : 0;
    fornecedorResumo.itens += itensValidos.length;
    fornecedorResumo.valor_total = roundMoney(fornecedorResumo.valor_total + valor);
    fornecedorResumo.primeiro_pedido_em = minDate([fornecedorResumo.primeiro_pedido_em, plain.createdAt].filter(Boolean));
    fornecedorResumo.ultimo_pedido_em = maxDate([fornecedorResumo.ultimo_pedido_em, plain.createdAt].filter(Boolean));

    if (plain.obra_id) {
      fornecedorResumo.obras_ids.add(Number(plain.obra_id));
      fornecedorResumo.obras_nomes.add(plain.obra?.nome || `Obra ${plain.obra_id}`);
    }

    fornecedorResumo.status.set(statusKey, (fornecedorResumo.status.get(statusKey) || 0) + 1);

    const statusResumo = incrementResumoMap(statusMap, statusKey, formatStatusLabel(statusKey));
    statusResumo.valor_total = roundMoney(statusResumo.valor_total + valor);

    const obraKey = plain.obra_id ? String(plain.obra_id) : 'SEM_OBRA';
    if (!obrasMap.has(obraKey)) {
      obrasMap.set(obraKey, {
        key: obraKey,
        obra_id: plain.obra_id || null,
        obra_nome: plain.obra?.nome || 'Sem obra/centro',
        fornecedores_ids: new Set(),
        pedidos: 0,
        itens: 0,
        valor_total: 0
      });
    }
    const obraResumo = obrasMap.get(obraKey);
    if (fornecedor?.id) {
      obraResumo.fornecedores_ids.add(Number(fornecedor.id));
    }
    obraResumo.pedidos += 1;
    obraResumo.itens += itensValidos.length;
    obraResumo.valor_total = roundMoney(obraResumo.valor_total + valor);

    linhasPedidos.push({
      id: plain.id,
      status: statusKey,
      status_label: formatStatusLabel(statusKey),
      fornecedor: fornecedor ? {
        id: fornecedor.id,
        nome: fornecedor.nome,
        cnpj: fornecedor.cnpj || null
      } : null,
      obra: plain.obra ? { id: plain.obra.id, nome: plain.obra.nome } : null,
      solicitacao: plain.solicitacao ? {
        id: plain.solicitacao.id,
        titulo: plain.solicitacao.titulo || null,
        status: plain.solicitacao.status || null
      } : null,
      criado_em: plain.createdAt || null,
      encerrado_em: plain.encerrado_em || null,
      itens: itensValidos.length,
      valor_total: valor,
      valor_minimo_pedido: plain.valor_minimo_pedido == null ? null : roundMoney(plain.valor_minimo_pedido),
      atingiu_pedido_minimo: plain.atingiu_pedido_minimo !== false
    });
  });

  const sortByValue = (a, b) => {
    if (Number(b.valor_total || 0) !== Number(a.valor_total || 0)) {
      return Number(b.valor_total || 0) - Number(a.valor_total || 0);
    }
    return String(a.fornecedor_nome || a.obra_nome || '').localeCompare(
      String(b.fornecedor_nome || b.obra_nome || ''),
      'pt-BR'
    );
  };

  const fornecedores = Array.from(fornecedoresMap.values())
    .map((item) => ({
      ...item,
      obras: item.obras_ids.size,
      obras_nomes: Array.from(item.obras_nomes).sort((a, b) => a.localeCompare(b, 'pt-BR')).slice(0, 5),
      ticket_medio: item.pedidos > 0 ? roundMoney(item.valor_total / item.pedidos) : 0,
      valor_total: roundMoney(item.valor_total),
      status: Array.from(item.status.entries()).map(([key, total]) => ({
        key,
        label: formatStatusLabel(key),
        total
      })).sort((a, b) => Number(b.total || 0) - Number(a.total || 0)),
      obras_ids: undefined
    }))
    .sort(sortByValue);

  const obras = Array.from(obrasMap.values())
    .map((item) => ({
      ...item,
      fornecedores: item.fornecedores_ids.size,
      fornecedores_ids: undefined,
      valor_total: roundMoney(item.valor_total),
      ticket_medio: item.pedidos > 0 ? roundMoney(item.valor_total / item.pedidos) : 0
    }))
    .sort(sortByValue);

  const valorTotal = roundMoney(pedidos.reduce((sum, pedido) => sum + toNumber(pedido.valor_total), 0));
  const top5Valor = fornecedores.slice(0, 5).reduce((sum, fornecedor) => sum + toNumber(fornecedor.valor_total), 0);
  const itensTotal = fornecedores.reduce((sum, fornecedor) => sum + Number(fornecedor.itens || 0), 0);

  return {
    filtros: {
      obra_id: obraId || null,
      data_inicio: dataInicio || null,
      data_fim: dataFim || null
    },
    resumo: {
      pedidos: pedidos.length,
      fornecedores: fornecedores.length,
      obras: obras.length,
      itens: itensTotal,
      valor_total: valorTotal,
      ticket_medio_pedido: pedidos.length > 0 ? roundMoney(valorTotal / pedidos.length) : 0,
      pedidos_minimo_nao_atingido: fornecedores.reduce((sum, fornecedor) => (
        sum + Number(fornecedor.pedidos_minimo_nao_atingido || 0)
      ), 0),
      concentracao_top5: valorTotal > 0 ? Number(((top5Valor / valorTotal) * 100).toFixed(2)) : 0
    },
    fornecedores,
    obras,
    status: finalizeResumoMap(statusMap),
    pedidos: linhasPedidos.slice(0, 100)
  };
}

async function relatorioComprasDiretas({
  obraId,
  dataInicio,
  dataFim,
  obraIds,
  solicitanteId,
  parceiroId,
  status,
  q,
  item,
  limit
} = {}) {
  const compras = await SolicitacaoCompra.findAll({
    where: buildCompraDiretaCriacaoWhere({
      obraId,
      obraIds,
      dataInicio,
      dataFim,
      solicitanteId,
      status
    }),
    attributes: [
      'id',
      'obra_id',
      'solicitante_id',
      'solicitacao_principal_id',
      'status',
      'observacoes',
      'necessario_para',
      'valor_fechado',
      'createdAt'
    ],
    include: [
      { model: Obra, as: 'obra', attributes: ['id', 'nome', 'codigo'] },
      { model: User, as: 'solicitante', attributes: ['id', 'nome', 'email'] },
      {
        model: Solicitacao,
        as: 'solicitacaoPrincipal',
        attributes: ['id', 'codigo', 'status_global', 'area_responsavel', 'parceiro_id', 'valor', 'data_vencimento'],
        include: [
          { model: Parceiro, as: 'parceiro', attributes: ['id', 'nome', 'documento'] }
        ]
      },
      {
        model: SolicitacaoCompraItem,
        as: 'itens',
        attributes: [
          'id',
          'insumo_id',
          'unidade_id',
          'unidade_sigla_manual',
          'apropriacao_id',
          'quantidade',
          'valor_unitario',
          'valor_total',
          'especificacao'
        ],
        include: [
          { model: Insumo, as: 'insumo', attributes: ['id', 'nome', 'codigo', 'categoria_id'] },
          { model: Unidade, as: 'unidade', attributes: ['id', 'nome', 'sigla'] },
          { model: Apropriacao, as: 'apropriacao', attributes: ['id', 'codigo', 'descricao'] }
        ]
      },
      {
        model: SolicitacaoCompraItemManual,
        as: 'itensManuais',
        attributes: [
          'id',
          'nome_manual',
          'unidade_sigla_manual',
          'apropriacao_id',
          'quantidade',
          'valor_unitario',
          'valor_total',
          'especificacao'
        ],
        include: [
          { model: Apropriacao, as: 'apropriacao', attributes: ['id', 'codigo', 'descricao'] }
        ]
      }
    ],
    order: [['createdAt', 'DESC'], ['id', 'DESC']]
  });

  const search = normalizeSearchText(q);
  const itemSearch = normalizeSearchText(item);
  const parceiroFiltro = parceiroId ? Number(parceiroId) : null;
  const limite = Math.min(Math.max(Number(limit) || 1000, 1), 5000);

  const solicitantesMap = new Map();
  const credoresMap = new Map();
  const itensMap = new Map();
  const obrasMap = new Map();
  const statusMap = new Map();
  const comprasIds = new Set();
  const linhas = [];

  compras.forEach((compra) => {
    const plain = compra.toJSON ? compra.toJSON() : compra;
    const solicitacao = plain.solicitacaoPrincipal || {};
    const credor = solicitacao.parceiro || null;
    const solicitante = plain.solicitante || null;
    const obra = plain.obra || null;
    const statusCompra = normalizeStatus(plain.status || solicitacao.status_global);
    const codigoCompra = `SC-${String(plain.id).padStart(5, '0')}`;
    const codigoSolicitacao = solicitacao.codigo || null;

    if (parceiroFiltro && Number(credor?.id || 0) !== parceiroFiltro) {
      return;
    }

    const itensNormais = (plain.itens || []).map((entry) => ({
      id: entry.id,
      tipo: 'INSUMO',
      descricao: entry.insumo?.nome || 'Insumo sem nome',
      codigo: entry.insumo?.codigo || null,
      unidade: entry.unidade?.sigla || entry.unidade_sigla_manual || entry.unidade?.nome || null,
      quantidade: toNumber(entry.quantidade),
      valor_unitario: roundMoney(entry.valor_unitario),
      valor_total: roundMoney(entry.valor_total),
      especificacao: entry.especificacao || null,
      apropriacao: entry.apropriacao ? {
        id: entry.apropriacao.id,
        codigo: entry.apropriacao.codigo,
        descricao: entry.apropriacao.descricao || null
      } : null
    }));

    const itensManuais = (plain.itensManuais || []).map((entry) => ({
      id: entry.id,
      tipo: 'MANUAL',
      descricao: entry.nome_manual || 'Item manual sem nome',
      codigo: null,
      unidade: entry.unidade_sigla_manual || null,
      quantidade: toNumber(entry.quantidade),
      valor_unitario: roundMoney(entry.valor_unitario),
      valor_total: roundMoney(entry.valor_total),
      especificacao: entry.especificacao || null,
      apropriacao: entry.apropriacao ? {
        id: entry.apropriacao.id,
        codigo: entry.apropriacao.codigo,
        descricao: entry.apropriacao.descricao || null
      } : null
    }));

    [...itensNormais, ...itensManuais].forEach((compraItem) => {
      const haystack = [
        codigoCompra,
        codigoSolicitacao,
        solicitante?.nome,
        solicitante?.email,
        obra?.nome,
        obra?.codigo,
        credor?.nome,
        credor?.documento,
        statusCompra,
        compraItem.descricao,
        compraItem.codigo,
        compraItem.especificacao,
        compraItem.apropriacao?.codigo,
        compraItem.apropriacao?.descricao
      ].join(' ');

      if (!includesSearch(haystack, search) || !includesSearch(compraItem.descricao, itemSearch)) {
        return;
      }

      comprasIds.add(Number(plain.id));

      const valor = roundMoney(compraItem.valor_total);
      addCompraDiretaRanking(
        solicitantesMap,
        solicitante?.id ? String(solicitante.id) : 'SEM_SOLICITANTE',
        solicitante?.nome || 'Sem solicitante',
        plain.id,
        compraItem.quantidade,
        valor,
        { solicitante_id: solicitante?.id || null, email: solicitante?.email || null }
      );
      addCompraDiretaRanking(
        credoresMap,
        credor?.id ? String(credor.id) : 'SEM_CREDOR',
        credor?.nome || 'Sem credor informado',
        plain.id,
        compraItem.quantidade,
        valor,
        { parceiro_id: credor?.id || null, documento: credor?.documento || null }
      );
      addCompraDiretaRanking(
        obrasMap,
        obra?.id ? String(obra.id) : 'SEM_OBRA',
        obra?.nome || 'Sem obra/centro',
        plain.id,
        compraItem.quantidade,
        valor,
        { obra_id: obra?.id || null, obra_codigo: obra?.codigo || null }
      );

      const itemKey = `${compraItem.tipo}:${normalizeSearchText(compraItem.codigo || compraItem.descricao)}:${normalizeSearchText(compraItem.unidade)}`;
      addCompraDiretaRanking(
        itensMap,
        itemKey,
        compraItem.descricao,
        plain.id,
        compraItem.quantidade,
        valor,
        { tipo: compraItem.tipo, codigo: compraItem.codigo || null, unidade: compraItem.unidade || null }
      );

      const statusResumo = incrementResumoMap(statusMap, statusCompra, formatStatusLabel(statusCompra));
      statusResumo.valor_total = roundMoney(statusResumo.valor_total + valor);

      linhas.push({
        compra_id: plain.id,
        compra_codigo: codigoCompra,
        solicitacao_id: solicitacao.id || null,
        solicitacao_codigo: codigoSolicitacao,
        status: statusCompra,
        status_label: formatStatusLabel(statusCompra),
        criado_em: plain.createdAt || null,
        vencimento: solicitacao.data_vencimento || plain.necessario_para || null,
        solicitante: solicitante ? {
          id: solicitante.id,
          nome: solicitante.nome,
          email: solicitante.email || null
        } : null,
        obra: obra ? {
          id: obra.id,
          nome: obra.nome,
          codigo: obra.codigo || null
        } : null,
        credor: credor ? {
          id: credor.id,
          nome: credor.nome,
          documento: credor.documento || null
        } : null,
        item: compraItem,
        quantidade: compraItem.quantidade,
        valor_unitario: compraItem.valor_unitario,
        valor_total: valor
      });
    });
  });

  linhas.sort((a, b) => {
    const dateDiff = new Date(b.criado_em || 0).getTime() - new Date(a.criado_em || 0).getTime();
    if (dateDiff !== 0) {
      return dateDiff;
    }
    return String(a.compra_codigo || '').localeCompare(String(b.compra_codigo || ''), 'pt-BR');
  });

  const valorTotal = roundMoney(linhas.reduce((sum, row) => sum + toNumber(row.valor_total), 0));
  const quantidadeTotal = Number(linhas.reduce((sum, row) => sum + toNumber(row.quantidade), 0).toFixed(3));

  return {
    filtros: {
      obra_id: obraId || null,
      data_inicio: dataInicio || null,
      data_fim: dataFim || null,
      solicitante_id: solicitanteId || null,
      parceiro_id: parceiroId || null,
      status: status || null,
      q: q || null,
      item: item || null,
      limit: limite
    },
    resumo: {
      compras: comprasIds.size,
      itens: linhas.length,
      solicitantes: solicitantesMap.size,
      credores: credoresMap.size,
      obras: obrasMap.size,
      quantidade_total: quantidadeTotal,
      valor_total: valorTotal,
      ticket_medio_compra: comprasIds.size > 0 ? roundMoney(valorTotal / comprasIds.size) : 0,
      ticket_medio_item: linhas.length > 0 ? roundMoney(valorTotal / linhas.length) : 0
    },
    solicitantes: finalizeCompraDiretaRanking(solicitantesMap),
    credores: finalizeCompraDiretaRanking(credoresMap),
    itens_ranking: finalizeCompraDiretaRanking(itensMap),
    obras: finalizeCompraDiretaRanking(obrasMap),
    status: finalizeResumoMap(statusMap),
    itens: linhas.slice(0, limite)
  };
}

async function relatorioPrecosInsumosFornecedores({ obraId, dataInicio, dataFim, obraIds } = {}) {
  const itens = await PedidoCompraItem.findAll({
    where: { removido: false },
    attributes: [
      'id',
      'pedido_compra_id',
      'descricao',
      'unidade',
      'quantidade_pedido',
      'preco_unitario',
      'valor_total',
      'item_tipo'
    ],
    include: [
      {
        model: PedidoCompra,
        as: 'pedido',
        attributes: ['id', 'obra_id', 'fornecedor_compra_id', 'status', 'createdAt'],
        required: true,
        where: buildPedidoCriacaoWhere({ obraId, obraIds, dataInicio, dataFim }),
        include: [
          { model: Obra, as: 'obra', attributes: ['id', 'nome'] },
          { model: FornecedorCompra, as: 'fornecedor', attributes: ['id', 'nome', 'cnpj', 'cidade', 'estado'] }
        ]
      },
      {
        model: SolicitacaoCompraItem,
        as: 'itemCadastrado',
        attributes: ['id', 'insumo_id'],
        include: [
          {
            model: Insumo,
            as: 'insumo',
            attributes: ['id', 'nome', 'codigo', 'categoria_id'],
            include: [
              { model: Categoria, as: 'categoria', attributes: ['id', 'nome'] }
            ]
          }
        ]
      },
      {
        model: SolicitacaoCompraItemManual,
        as: 'itemManual',
        attributes: ['id', 'nome_manual', 'insumo_catalogado_id'],
        include: [
          {
            model: Insumo,
            as: 'insumoCatalogado',
            attributes: ['id', 'nome', 'codigo', 'categoria_id'],
            include: [
              { model: Categoria, as: 'categoria', attributes: ['id', 'nome'] }
            ]
          }
        ]
      }
    ],
    order: [[{ model: PedidoCompra, as: 'pedido' }, 'createdAt', 'DESC'], ['id', 'DESC']]
  });

  const itensMap = new Map();
  const fornecedoresIds = new Set();
  const pedidosIds = new Set();
  const categoriasMap = new Map();

  itens.forEach((item) => {
    const plain = item.toJSON ? item.toJSON() : item;
    const pedido = plain.pedido || {};
    const fornecedor = pedido.fornecedor || null;
    const insumo = plain.itemCadastrado?.insumo || plain.itemManual?.insumoCatalogado || null;
    const categoria = insumo?.categoria || null;
    const descricao = insumo?.nome || plain.itemManual?.nome_manual || plain.descricao || 'Item sem descricao';
    const unidade = plain.unidade || null;
    const itemKey = insumo?.id
      ? `INSUMO:${insumo.id}`
      : `MANUAL:${String(descricao).trim().toUpperCase()}:${String(unidade || '').trim().toUpperCase()}`;
    const fornecedorKey = fornecedor?.id ? String(fornecedor.id) : 'SEM_FORNECEDOR';
    const quantidade = toNumber(plain.quantidade_pedido);
    const valor = roundMoney(plain.valor_total);
    const precoReferencia = quantidade > 0 ? roundMoney(valor / quantidade) : roundMoney(plain.preco_unitario);

    pedidosIds.add(Number(plain.pedido_compra_id));
    if (fornecedor?.id) {
      fornecedoresIds.add(Number(fornecedor.id));
    }

    if (!itensMap.has(itemKey)) {
      itensMap.set(itemKey, createPrecoInsumoResumo({
        key: itemKey,
        descricao,
        unidade,
        categoria,
        origem: insumo?.id ? 'INSUMO' : 'MANUAL'
      }));
    }

    const itemResumo = itensMap.get(itemKey);
    itemResumo.pedidos_ids.add(Number(plain.pedido_compra_id));
    itemResumo.quantidade_total += quantidade;
    itemResumo.valor_total = roundMoney(itemResumo.valor_total + valor);

    const categoriaKey = categoria?.id ? String(categoria.id) : 'SEM_CATEGORIA';
    if (!categoriasMap.has(categoriaKey)) {
      categoriasMap.set(categoriaKey, {
        key: categoriaKey,
        categoria_id: categoria?.id || null,
        categoria_nome: categoria?.nome || 'Itens manuais/sem categoria',
        itens: new Set(),
        fornecedores: new Set(),
        valor_total: 0
      });
    }
    const categoriaResumo = categoriasMap.get(categoriaKey);
    categoriaResumo.itens.add(itemKey);
    if (fornecedor?.id) {
      categoriaResumo.fornecedores.add(Number(fornecedor.id));
    }
    categoriaResumo.valor_total = roundMoney(categoriaResumo.valor_total + valor);

    if (!itemResumo.fornecedores.has(fornecedorKey)) {
      itemResumo.fornecedores.set(fornecedorKey, {
        key: fornecedorKey,
        fornecedor_id: fornecedor?.id || null,
        fornecedor_nome: fornecedor?.nome || 'Sem fornecedor',
        cnpj: fornecedor?.cnpj || null,
        cidade: fornecedor?.cidade || null,
        estado: fornecedor?.estado || null,
        pedidos_ids: new Set(),
        ocorrencias: 0,
        quantidade_total: 0,
        valor_total: 0,
        menor_preco_unitario: null,
        maior_preco_unitario: null,
        ultimo_preco_unitario: null,
        ultimo_pedido_em: null
      });
    }

    const fornecedorResumo = itemResumo.fornecedores.get(fornecedorKey);
    fornecedorResumo.pedidos_ids.add(Number(plain.pedido_compra_id));
    fornecedorResumo.ocorrencias += 1;
    fornecedorResumo.quantidade_total += quantidade;
    fornecedorResumo.valor_total = roundMoney(fornecedorResumo.valor_total + valor);
    fornecedorResumo.menor_preco_unitario = fornecedorResumo.menor_preco_unitario == null
      ? precoReferencia
      : Math.min(fornecedorResumo.menor_preco_unitario, precoReferencia);
    fornecedorResumo.maior_preco_unitario = fornecedorResumo.maior_preco_unitario == null
      ? precoReferencia
      : Math.max(fornecedorResumo.maior_preco_unitario, precoReferencia);

    const dataPedido = toDate(pedido.createdAt);
    const ultimoPedido = toDate(fornecedorResumo.ultimo_pedido_em);
    if (dataPedido && (!ultimoPedido || dataPedido >= ultimoPedido)) {
      fornecedorResumo.ultimo_pedido_em = pedido.createdAt;
      fornecedorResumo.ultimo_preco_unitario = precoReferencia;
    }
  });

  const itensResumo = [];
  const comparativo = [];

  itensMap.forEach((itemResumo) => {
    const fornecedores = Array.from(itemResumo.fornecedores.values())
      .map((fornecedor) => ({
        ...fornecedor,
        pedidos: fornecedor.pedidos_ids.size,
        pedidos_ids: undefined,
        quantidade_total: Number(toNumber(fornecedor.quantidade_total).toFixed(3)),
        valor_total: roundMoney(fornecedor.valor_total),
        preco_medio: fornecedor.quantidade_total > 0
          ? roundMoney(fornecedor.valor_total / fornecedor.quantidade_total)
          : 0,
        menor_preco_unitario: roundMoney(fornecedor.menor_preco_unitario),
        maior_preco_unitario: roundMoney(fornecedor.maior_preco_unitario),
        ultimo_preco_unitario: roundMoney(fornecedor.ultimo_preco_unitario)
      }))
      .sort((a, b) => {
        if (Number(a.preco_medio || 0) !== Number(b.preco_medio || 0)) {
          return Number(a.preco_medio || 0) - Number(b.preco_medio || 0);
        }
        return String(a.fornecedor_nome || '').localeCompare(String(b.fornecedor_nome || ''), 'pt-BR');
      });

    const precosValidos = fornecedores.map((fornecedor) => Number(fornecedor.preco_medio || 0)).filter((value) => value > 0);
    const menorPrecoMedio = precosValidos.length ? Math.min(...precosValidos) : 0;
    const melhorFornecedor = fornecedores.find((fornecedor) => Number(fornecedor.preco_medio || 0) === menorPrecoMedio) || null;

    itensResumo.push({
      key: itemResumo.key,
      descricao: itemResumo.descricao,
      unidade: itemResumo.unidade,
      categoria_id: itemResumo.categoria_id,
      categoria_nome: itemResumo.categoria_nome,
      origem: itemResumo.origem,
      fornecedores: fornecedores.length,
      pedidos: itemResumo.pedidos_ids.size,
      quantidade_total: Number(toNumber(itemResumo.quantidade_total).toFixed(3)),
      valor_total: roundMoney(itemResumo.valor_total),
      preco_medio_geral: itemResumo.quantidade_total > 0 ? roundMoney(itemResumo.valor_total / itemResumo.quantidade_total) : 0,
      menor_preco_medio: roundMoney(menorPrecoMedio),
      melhor_fornecedor: melhorFornecedor ? {
        id: melhorFornecedor.fornecedor_id,
        nome: melhorFornecedor.fornecedor_nome
      } : null
    });

    fornecedores.forEach((fornecedor) => {
      const diferenca = menorPrecoMedio > 0 ? roundMoney(fornecedor.preco_medio - menorPrecoMedio) : 0;
      comparativo.push({
        item_key: itemResumo.key,
        descricao: itemResumo.descricao,
        unidade: itemResumo.unidade,
        categoria_nome: itemResumo.categoria_nome,
        origem: itemResumo.origem,
        fornecedor_id: fornecedor.fornecedor_id,
        fornecedor_nome: fornecedor.fornecedor_nome,
        pedidos: fornecedor.pedidos,
        ocorrencias: fornecedor.ocorrencias,
        quantidade_total: fornecedor.quantidade_total,
        valor_total: fornecedor.valor_total,
        preco_medio: fornecedor.preco_medio,
        menor_preco_medio_item: roundMoney(menorPrecoMedio),
        diferenca_menor_preco_medio: diferenca,
        diferenca_percentual: menorPrecoMedio > 0 ? Number(((diferenca / menorPrecoMedio) * 100).toFixed(2)) : 0,
        menor_preco_unitario: fornecedor.menor_preco_unitario,
        maior_preco_unitario: fornecedor.maior_preco_unitario,
        ultimo_preco_unitario: fornecedor.ultimo_preco_unitario,
        ultimo_pedido_em: fornecedor.ultimo_pedido_em
      });
    });
  });

  const sortByValue = (a, b) => {
    if (Number(b.valor_total || 0) !== Number(a.valor_total || 0)) {
      return Number(b.valor_total || 0) - Number(a.valor_total || 0);
    }
    return String(a.descricao || a.categoria_nome || '').localeCompare(
      String(b.descricao || b.categoria_nome || ''),
      'pt-BR'
    );
  };

  const categorias = Array.from(categoriasMap.values())
    .map((item) => ({
      key: item.key,
      categoria_id: item.categoria_id,
      categoria_nome: item.categoria_nome,
      itens: item.itens.size,
      fornecedores: item.fornecedores.size,
      valor_total: roundMoney(item.valor_total)
    }))
    .sort(sortByValue);

  itensResumo.sort(sortByValue);
  comparativo.sort((a, b) => {
    if (Number(b.valor_total || 0) !== Number(a.valor_total || 0)) {
      return Number(b.valor_total || 0) - Number(a.valor_total || 0);
    }
    if (String(a.descricao || '') !== String(b.descricao || '')) {
      return String(a.descricao || '').localeCompare(String(b.descricao || ''), 'pt-BR');
    }
    return Number(a.preco_medio || 0) - Number(b.preco_medio || 0);
  });

  const valorTotal = roundMoney(itens.reduce((sum, item) => sum + toNumber(item.valor_total), 0));

  return {
    filtros: {
      obra_id: obraId || null,
      data_inicio: dataInicio || null,
      data_fim: dataFim || null
    },
    resumo: {
      itens_lancados: itens.length,
      itens_distintos: itensResumo.length,
      fornecedores: fornecedoresIds.size,
      pedidos: pedidosIds.size,
      categorias: categorias.length,
      valor_total: valorTotal,
      itens_com_mais_de_um_fornecedor: itensResumo.filter((item) => Number(item.fornecedores || 0) > 1).length
    },
    itens: itensResumo.slice(0, 100),
    comparativo: comparativo.slice(0, 150),
    categorias
  };
}

async function relatorioEvolucaoCompras({ obraId, dataInicio, dataFim, obraIds } = {}) {
  const pedidos = await PedidoCompra.findAll({
    where: buildPedidoCriacaoWhere({ obraId, obraIds, dataInicio, dataFim }),
    attributes: ['id', 'obra_id', 'fornecedor_compra_id', 'status', 'valor_total', 'createdAt', 'encerrado_em'],
    include: [
      { model: Obra, as: 'obra', attributes: ['id', 'nome'] },
      { model: FornecedorCompra, as: 'fornecedor', attributes: ['id', 'nome'] },
      { model: PedidoCompraItem, as: 'itens', attributes: ['id', 'valor_total', 'removido'] }
    ],
    order: [['createdAt', 'ASC'], ['id', 'ASC']]
  });

  const mesesMap = new Map();
  const obrasMap = new Map();
  const statusMap = new Map();
  const fornecedoresIds = new Set();

  pedidos.forEach((pedido) => {
    const plain = pedido.toJSON ? pedido.toJSON() : pedido;
    const mesKey = monthKeyFromDate(plain.createdAt);
    const statusKey = normalizeStatus(plain.status);
    const valor = roundMoney(plain.valor_total);
    const itensValidos = (plain.itens || []).filter((item) => !item.removido);

    if (plain.fornecedor?.id) {
      fornecedoresIds.add(Number(plain.fornecedor.id));
    }

    if (!mesesMap.has(mesKey)) {
      mesesMap.set(mesKey, {
        key: mesKey,
        mes: mesKey,
        label: monthLabelFromKey(mesKey),
        pedidos: 0,
        pedidos_encerrados: 0,
        fornecedores_ids: new Set(),
        obras_ids: new Set(),
        itens: 0,
        valor_total: 0,
        status: new Map()
      });
    }
    const mesResumo = mesesMap.get(mesKey);
    mesResumo.pedidos += 1;
    mesResumo.pedidos_encerrados += plain.encerrado_em ? 1 : 0;
    mesResumo.itens += itensValidos.length;
    mesResumo.valor_total = roundMoney(mesResumo.valor_total + valor);
    mesResumo.status.set(statusKey, (mesResumo.status.get(statusKey) || 0) + 1);
    if (plain.fornecedor?.id) {
      mesResumo.fornecedores_ids.add(Number(plain.fornecedor.id));
    }
    if (plain.obra_id) {
      mesResumo.obras_ids.add(Number(plain.obra_id));
    }

    const statusResumo = incrementResumoMap(statusMap, statusKey, formatStatusLabel(statusKey));
    statusResumo.valor_total = roundMoney(statusResumo.valor_total + valor);

    const obraKey = plain.obra_id ? String(plain.obra_id) : 'SEM_OBRA';
    if (!obrasMap.has(obraKey)) {
      obrasMap.set(obraKey, {
        key: obraKey,
        obra_id: plain.obra_id || null,
        obra_nome: plain.obra?.nome || 'Sem obra/centro',
        pedidos: 0,
        fornecedores_ids: new Set(),
        itens: 0,
        valor_total: 0,
        meses: new Map()
      });
    }
    const obraResumo = obrasMap.get(obraKey);
    obraResumo.pedidos += 1;
    obraResumo.itens += itensValidos.length;
    obraResumo.valor_total = roundMoney(obraResumo.valor_total + valor);
    if (plain.fornecedor?.id) {
      obraResumo.fornecedores_ids.add(Number(plain.fornecedor.id));
    }
    if (!obraResumo.meses.has(mesKey)) {
      obraResumo.meses.set(mesKey, { pedidos: 0, valor_total: 0 });
    }
    const obraMes = obraResumo.meses.get(mesKey);
    obraMes.pedidos += 1;
    obraMes.valor_total = roundMoney(obraMes.valor_total + valor);
  });

  const meses = Array.from(mesesMap.values())
    .map((item) => ({
      ...item,
      fornecedores: item.fornecedores_ids.size,
      obras: item.obras_ids.size,
      fornecedores_ids: undefined,
      obras_ids: undefined,
      valor_total: roundMoney(item.valor_total),
      ticket_medio: item.pedidos > 0 ? roundMoney(item.valor_total / item.pedidos) : 0,
      status: Array.from(item.status.entries()).map(([key, total]) => ({
        key,
        label: formatStatusLabel(key),
        total
      })).sort((a, b) => Number(b.total || 0) - Number(a.total || 0))
    }))
    .sort((a, b) => String(a.key).localeCompare(String(b.key)));

  const obras = Array.from(obrasMap.values())
    .map((item) => ({
      ...item,
      fornecedores: item.fornecedores_ids.size,
      fornecedores_ids: undefined,
      valor_total: roundMoney(item.valor_total),
      ticket_medio: item.pedidos > 0 ? roundMoney(item.valor_total / item.pedidos) : 0,
      meses: Array.from(item.meses.entries()).map(([key, value]) => ({
        mes: key,
        label: monthLabelFromKey(key),
        pedidos: value.pedidos,
        valor_total: roundMoney(value.valor_total)
      })).sort((a, b) => String(a.mes).localeCompare(String(b.mes)))
    }))
    .sort((a, b) => {
      if (Number(b.valor_total || 0) !== Number(a.valor_total || 0)) {
        return Number(b.valor_total || 0) - Number(a.valor_total || 0);
      }
      return String(a.obra_nome || '').localeCompare(String(b.obra_nome || ''), 'pt-BR');
    });

  const valorTotal = roundMoney(pedidos.reduce((sum, pedido) => sum + toNumber(pedido.valor_total), 0));
  const melhorMes = meses.reduce((best, item) => {
    if (!best || Number(item.valor_total || 0) > Number(best.valor_total || 0)) {
      return item;
    }
    return best;
  }, null);

  return {
    filtros: {
      obra_id: obraId || null,
      data_inicio: dataInicio || null,
      data_fim: dataFim || null
    },
    resumo: {
      pedidos: pedidos.length,
      meses: meses.length,
      fornecedores: fornecedoresIds.size,
      obras: obras.length,
      valor_total: valorTotal,
      ticket_medio: pedidos.length > 0 ? roundMoney(valorTotal / pedidos.length) : 0,
      maior_mes: melhorMes ? {
        mes: melhorMes.mes,
        label: melhorMes.label,
        valor_total: melhorMes.valor_total,
        pedidos: melhorMes.pedidos
      } : null
    },
    meses,
    obras,
    status: finalizeResumoMap(statusMap)
  };
}

async function relatorioCategoriasInsumosCompras({ obraId, dataInicio, dataFim, obraIds } = {}) {
  const itens = await PedidoCompraItem.findAll({
    where: { removido: false },
    attributes: [
      'id',
      'pedido_compra_id',
      'descricao',
      'unidade',
      'quantidade_pedido',
      'valor_total',
      'item_tipo'
    ],
    include: [
      {
        model: PedidoCompra,
        as: 'pedido',
        attributes: ['id', 'obra_id', 'status', 'createdAt'],
        required: true,
        where: buildPedidoCriacaoWhere({ obraId, obraIds, dataInicio, dataFim }),
        include: [
          { model: Obra, as: 'obra', attributes: ['id', 'nome'] }
        ]
      },
      {
        model: SolicitacaoCompraItem,
        as: 'itemCadastrado',
        attributes: ['id', 'insumo_id'],
        include: [
          {
            model: Insumo,
            as: 'insumo',
            attributes: ['id', 'nome', 'codigo', 'categoria_id'],
            include: [
              { model: Categoria, as: 'categoria', attributes: ['id', 'nome'] }
            ]
          }
        ]
      },
      {
        model: SolicitacaoCompraItemManual,
        as: 'itemManual',
        attributes: ['id', 'nome_manual', 'insumo_catalogado_id'],
        include: [
          {
            model: Insumo,
            as: 'insumoCatalogado',
            attributes: ['id', 'nome', 'codigo', 'categoria_id'],
            include: [
              { model: Categoria, as: 'categoria', attributes: ['id', 'nome'] }
            ]
          }
        ]
      }
    ],
    order: [['createdAt', 'DESC'], ['id', 'DESC']]
  });

  const categoriasMap = new Map();
  const insumosMap = new Map();
  const obrasMap = new Map();
  const pedidosIds = new Set();

  itens.forEach((item) => {
    const plain = item.toJSON ? item.toJSON() : item;
    const pedido = plain.pedido || {};
    const insumo = plain.itemCadastrado?.insumo || plain.itemManual?.insumoCatalogado || null;
    const categoria = insumo?.categoria || null;
    const categoriaKey = categoria?.id ? String(categoria.id) : 'SEM_CATEGORIA';
    const descricao = insumo?.nome || plain.itemManual?.nome_manual || plain.descricao || 'Item sem descricao';
    const insumoKey = insumo?.id ? `INSUMO:${insumo.id}` : `MANUAL:${String(descricao).toUpperCase()}`;
    const quantidade = toNumber(plain.quantidade_pedido);
    const valor = roundMoney(plain.valor_total);

    pedidosIds.add(Number(plain.pedido_compra_id));

    if (!categoriasMap.has(categoriaKey)) {
      categoriasMap.set(categoriaKey, createCategoriaComprasResumo(categoria));
    }
    const categoriaResumo = categoriasMap.get(categoriaKey);
    categoriaResumo.itens += 1;
    categoriaResumo.pedidos_ids.add(Number(plain.pedido_compra_id));
    categoriaResumo.quantidade_total += quantidade;
    categoriaResumo.valor_total = roundMoney(categoriaResumo.valor_total + valor);

    if (!insumosMap.has(insumoKey)) {
      insumosMap.set(insumoKey, createInsumoComprasResumo({
        key: insumoKey,
        descricao,
        unidade: plain.unidade,
        categoria
      }));
    }
    const insumoResumo = insumosMap.get(insumoKey);
    insumoResumo.itens += 1;
    insumoResumo.pedidos_ids.add(Number(plain.pedido_compra_id));
    insumoResumo.quantidade_total += quantidade;
    insumoResumo.valor_total = roundMoney(insumoResumo.valor_total + valor);

    const obraKey = pedido.obra_id ? String(pedido.obra_id) : 'SEM_OBRA';
    if (!obrasMap.has(obraKey)) {
      obrasMap.set(obraKey, {
        key: obraKey,
        obra_id: pedido.obra_id || null,
        obra_nome: pedido.obra?.nome || 'Sem obra/centro',
        itens: 0,
        pedidos_ids: new Set(),
        valor_total: 0
      });
    }
    const obraResumo = obrasMap.get(obraKey);
    obraResumo.itens += 1;
    obraResumo.pedidos_ids.add(Number(plain.pedido_compra_id));
    obraResumo.valor_total = roundMoney(obraResumo.valor_total + valor);
  });

  const sortByValue = (a, b) => {
    if (Number(b.valor_total || 0) !== Number(a.valor_total || 0)) {
      return Number(b.valor_total || 0) - Number(a.valor_total || 0);
    }
    return String(a.categoria_nome || a.descricao || a.obra_nome || '').localeCompare(
      String(b.categoria_nome || b.descricao || b.obra_nome || ''),
      'pt-BR'
    );
  };

  const categorias = Array.from(categoriasMap.values()).map(finalizeComprasResumo).sort(sortByValue);
  const insumos = Array.from(insumosMap.values()).map(finalizeComprasResumo).sort(sortByValue);
  const obras = Array.from(obrasMap.values())
    .map((item) => ({
      ...item,
      pedidos: item.pedidos_ids.size,
      pedidos_ids: undefined,
      valor_total: roundMoney(item.valor_total)
    }))
    .sort(sortByValue);

  const valorTotal = roundMoney(itens.reduce((sum, item) => sum + toNumber(item.valor_total), 0));

  return {
    filtros: {
      obra_id: obraId || null,
      data_inicio: dataInicio || null,
      data_fim: dataFim || null
    },
    resumo: {
      itens: itens.length,
      pedidos: pedidosIds.size,
      categorias: categorias.length,
      insumos: insumos.length,
      valor_total: valorTotal,
      ticket_medio_item: itens.length > 0 ? roundMoney(valorTotal / itens.length) : 0
    },
    categorias,
    insumos: insumos.slice(0, 100),
    obras
  };
}

async function relatorioPendenciasCotacoesCompras({ obraId, dataInicio, dataFim, obraIds } = {}) {
  const minimoCotacoes = await getMinimoCotacoesConfig();
  const hoje = todayDateOnly();
  const solicitacoes = await SolicitacaoCompra.findAll({
    where: buildSolicitacaoCriacaoWhere({ obraId, obraIds, dataInicio, dataFim }),
    attributes: ['id', 'titulo', 'obra_id', 'status', 'createdAt', 'encerrado_em'],
    include: [
      { model: Obra, as: 'obra', attributes: ['id', 'nome'] },
      {
        model: SolicitacaoCompraFornecedor,
        as: 'fornecedores',
        attributes: [
          'id',
          'fornecedor_compra_id',
          'status',
          'enviado_em',
          'visualizado_em',
          'respondido_em',
          'prazo_resposta'
        ],
        include: [
          { model: FornecedorCompra, as: 'fornecedor', attributes: ['id', 'nome'] }
        ]
      }
    ],
    order: [['createdAt', 'DESC'], ['id', 'DESC']]
  });

  const cotacoes = [];
  const fornecedoresVencidos = [];
  const obrasMap = new Map();
  const resumo = {
    cotacoes: 0,
    cotacoes_abertas: 0,
    cotacoes_sem_minimo: 0,
    cotacoes_com_prazo_vencido: 0,
    fornecedores_enviados: 0,
    fornecedores_respondidos: 0,
    fornecedores_sem_resposta: 0,
    fornecedores_vencidos_sem_resposta: 0,
    minimo_cotacoes: minimoCotacoes
  };

  solicitacoes.forEach((solicitacao) => {
    const plain = solicitacao.toJSON ? solicitacao.toJSON() : solicitacao;
    const fornecedores = plain.fornecedores || [];
    if (!fornecedores.length) {
      return;
    }

    const encerrada = Boolean(plain.encerrado_em) || String(plain.status || '').toUpperCase() === 'ENCERRADO';
    const respondidos = fornecedores.filter((fornecedor) => fornecedor.respondido_em).length;
    const semResposta = fornecedores.filter((fornecedor) => !fornecedor.respondido_em).length;
    const vencidosSemResposta = fornecedores.filter((fornecedor) => (
      !fornecedor.respondido_em &&
      fornecedor.prazo_resposta &&
      String(fornecedor.prazo_resposta).slice(0, 10) < hoje
    ));
    const semMinimo = respondidos < minimoCotacoes;
    const temPrazoVencido = vencidosSemResposta.length > 0;

    resumo.cotacoes += 1;
    resumo.fornecedores_enviados += fornecedores.length;
    resumo.fornecedores_respondidos += respondidos;
    resumo.fornecedores_sem_resposta += semResposta;
    resumo.fornecedores_vencidos_sem_resposta += vencidosSemResposta.length;

    if (!encerrada) {
      resumo.cotacoes_abertas += 1;
    }
    if (semMinimo) {
      resumo.cotacoes_sem_minimo += 1;
    }
    if (temPrazoVencido) {
      resumo.cotacoes_com_prazo_vencido += 1;
    }

    const obraKey = plain.obra_id ? String(plain.obra_id) : 'SEM_OBRA';
    if (!obrasMap.has(obraKey)) {
      obrasMap.set(obraKey, {
        key: obraKey,
        obra_id: plain.obra_id || null,
        obra_nome: plain.obra?.nome || 'Sem obra/centro',
        cotacoes: 0,
        sem_minimo: 0,
        vencidas: 0
      });
    }
    const obraResumo = obrasMap.get(obraKey);
    obraResumo.cotacoes += 1;
    if (semMinimo) {
      obraResumo.sem_minimo += 1;
    }
    if (temPrazoVencido) {
      obraResumo.vencidas += 1;
    }

    cotacoes.push({
      id: plain.id,
      titulo: plain.titulo || null,
      status: plain.status || null,
      obra: plain.obra ? { id: plain.obra.id, nome: plain.obra.nome } : null,
      criada_em: plain.createdAt || null,
      encerrada_em: plain.encerrado_em || null,
      encerrada,
      fornecedores_enviados: fornecedores.length,
      fornecedores_respondidos: respondidos,
      fornecedores_sem_resposta: semResposta,
      fornecedores_vencidos_sem_resposta: vencidosSemResposta.length,
      minimo_cotacoes: minimoCotacoes,
      sem_minimo: semMinimo,
      prazo_vencido: temPrazoVencido
    });

    vencidosSemResposta.forEach((fornecedor) => {
      fornecedoresVencidos.push({
        cotacao_id: plain.id,
        cotacao_titulo: plain.titulo || null,
        obra: plain.obra ? { id: plain.obra.id, nome: plain.obra.nome } : null,
        fornecedor_id: fornecedor.fornecedor?.id || fornecedor.fornecedor_compra_id || null,
        fornecedor_nome: fornecedor.fornecedor?.nome || 'Fornecedor sem cadastro',
        enviado_em: fornecedor.enviado_em || null,
        visualizado_em: fornecedor.visualizado_em || null,
        prazo_resposta: fornecedor.prazo_resposta || null
      });
    });
  });

  resumo.taxa_resposta = resumo.fornecedores_enviados > 0
    ? Number(((resumo.fornecedores_respondidos / resumo.fornecedores_enviados) * 100).toFixed(2))
    : 0;

  const obras = Array.from(obrasMap.values()).sort((a, b) => {
    if (Number(b.sem_minimo || 0) !== Number(a.sem_minimo || 0)) {
      return Number(b.sem_minimo || 0) - Number(a.sem_minimo || 0);
    }
    if (Number(b.vencidas || 0) !== Number(a.vencidas || 0)) {
      return Number(b.vencidas || 0) - Number(a.vencidas || 0);
    }
    return String(a.obra_nome || '').localeCompare(String(b.obra_nome || ''), 'pt-BR');
  });

  return {
    filtros: {
      obra_id: obraId || null,
      data_inicio: dataInicio || null,
      data_fim: dataFim || null
    },
    resumo,
    cotacoes: cotacoes
      .sort((a, b) => Number(b.prazo_vencido) - Number(a.prazo_vencido) || Number(b.sem_minimo) - Number(a.sem_minimo))
      .slice(0, 100),
    fornecedores_vencidos: fornecedoresVencidos.slice(0, 100),
    obras
  };
}

function buildItemKey(tipo, id) {
  return `${String(tipo || '').toUpperCase()}:${Number(id || 0)}`;
}

function getItemDescricao(item) {
  if (!item) {
    return '-';
  }
  return item.insumo?.nome || item.nome_manual || item.especificacao || '-';
}

function getItemUnidade(item) {
  if (!item) {
    return '-';
  }
  return item.unidade_sigla_manual || item.unidade?.sigla || '-';
}

function mapItensSolicitacao(solicitacao) {
  const mapa = new Map();

  (solicitacao.itens || []).forEach((item) => {
    mapa.set(buildItemKey('CADASTRADO', item.id), {
      item_tipo: 'CADASTRADO',
      item_referencia_id: item.id,
      descricao: getItemDescricao(item),
      unidade: getItemUnidade(item),
      quantidade: toNumber(item.quantidade)
    });
  });

  (solicitacao.itensManuais || []).forEach((item) => {
    mapa.set(buildItemKey('MANUAL', item.id), {
      item_tipo: 'MANUAL',
      item_referencia_id: item.id,
      descricao: getItemDescricao(item),
      unidade: getItemUnidade(item),
      quantidade: toNumber(item.quantidade)
    });
  });

  return mapa;
}

function getRespostaItemKey(resposta) {
  const itemReferenciaId = resposta.solicitacao_compra_item_id || resposta.solicitacao_compra_item_manual_id;
  return buildItemKey(resposta.item_tipo, itemReferenciaId);
}

function buildEconomiaLinha({ solicitacao, itemBase, respostas }) {
  const respostasValidas = respostas
    .filter((resposta) => resposta.disponivel && resposta.preco != null && toNumber(resposta.preco) > 0)
    .map((resposta) => {
      const precoUnitario = roundMoney(resposta.preco);
      return {
        resposta_item_id: resposta.id,
        fornecedor_id: resposta.fornecedor_info?.id || null,
        fornecedor_nome: resposta.fornecedor_info?.nome || 'Fornecedor sem cadastro',
        preco_unitario: precoUnitario,
        valor_total: roundMoney(precoUnitario * itemBase.quantidade),
        vencedor: Boolean(resposta.vencedor)
      };
    });

  if (!respostasValidas.length) {
    return null;
  }

  const menor = respostasValidas.reduce((acc, atual) => {
    if (!acc) {
      return atual;
    }
    return atual.preco_unitario < acc.preco_unitario ? atual : acc;
  }, null);
  const vencedor = respostasValidas.find((resposta) => resposta.vencedor) || null;
  if (!vencedor) {
    return null;
  }

  const diferencaVencedorMenor = roundMoney(vencedor.valor_total - menor.valor_total);
  const sobrepreco = diferencaVencedorMenor > 0 ? diferencaVencedorMenor : 0;
  const economia = diferencaVencedorMenor < 0 ? Math.abs(diferencaVencedorMenor) : 0;
  const selecionouMenorPreco = sobrepreco === 0;

  return {
    solicitacao: {
      id: solicitacao.id,
      titulo: solicitacao.titulo || null,
      obra_id: solicitacao.obra_id || null,
      encerrado_em: solicitacao.encerrado_em || null
    },
    item: itemBase,
    respostas_validas: respostasValidas.length,
    menor_preco: menor,
    vencedor,
    economia,
    sobrepreco,
    selecionou_menor_preco: selecionouMenorPreco
  };
}

async function relatorioEconomiaCotacoes({ obraId, dataInicio, dataFim, obraIds } = {}) {
  const solicitacoes = await SolicitacaoCompra.findAll({
    where: {
      ...buildSolicitacaoPeriodoWhere({ obraId, obraIds, dataInicio, dataFim }),
      status: 'ENCERRADO'
    },
    attributes: ['id', 'titulo', 'obra_id', 'status', 'encerrado_em'],
    include: [
      {
        model: SolicitacaoCompraItem,
        as: 'itens',
        attributes: ['id', 'quantidade', 'especificacao', 'unidade_sigla_manual'],
        include: [
          { model: Insumo, as: 'insumo', attributes: ['id', 'nome'] },
          { model: Unidade, as: 'unidade', attributes: ['id', 'sigla'] }
        ]
      },
      {
        model: SolicitacaoCompraItemManual,
        as: 'itensManuais',
        attributes: ['id', 'nome_manual', 'quantidade', 'especificacao', 'unidade_sigla_manual']
      },
      {
        model: SolicitacaoCompraFornecedor,
        as: 'fornecedores',
        attributes: ['id', 'fornecedor_compra_id'],
        include: [
          {
            model: FornecedorCompra,
            as: 'fornecedor',
            attributes: ['id', 'nome']
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
              'vencedor'
            ]
          }
        ]
      }
    ],
    order: [['encerrado_em', 'DESC'], ['id', 'DESC']]
  });

  const linhas = [];
  const resumo = {
    cotacoes_encerradas: solicitacoes.length,
    itens_com_vencedor: 0,
    itens_menor_preco: 0,
    itens_acima_menor_preco: 0,
    valor_menor_preco: 0,
    valor_vencedor: 0,
    economia_total: 0,
    sobrepreco_total: 0
  };

  solicitacoes.forEach((solicitacao) => {
    const itensMap = mapItensSolicitacao(solicitacao);
    const respostasPorItem = new Map();

    (solicitacao.fornecedores || []).forEach((fornecedorCotacao) => {
      (fornecedorCotacao.respostas || []).forEach((resposta) => {
        const key = getRespostaItemKey(resposta);
        if (!respostasPorItem.has(key)) {
          respostasPorItem.set(key, []);
        }
        const respostaJson = resposta.toJSON ? resposta.toJSON() : resposta;
        respostasPorItem.get(key).push({
          ...respostaJson,
          fornecedor_info: {
            id: fornecedorCotacao.fornecedor?.id || fornecedorCotacao.fornecedor_compra_id || null,
            nome: fornecedorCotacao.fornecedor?.nome || 'Fornecedor sem cadastro'
          }
        });
      });
    });

    itensMap.forEach((itemBase, key) => {
      const linha = buildEconomiaLinha({
        solicitacao,
        itemBase,
        respostas: respostasPorItem.get(key) || []
      });
      if (!linha) {
        return;
      }

      linhas.push(linha);
      resumo.itens_com_vencedor += 1;
      resumo.valor_menor_preco = roundMoney(resumo.valor_menor_preco + linha.menor_preco.valor_total);
      resumo.valor_vencedor = roundMoney(resumo.valor_vencedor + linha.vencedor.valor_total);

      if (linha.selecionou_menor_preco) {
        resumo.itens_menor_preco += 1;
      } else {
        resumo.itens_acima_menor_preco += 1;
        resumo.sobrepreco_total = roundMoney(resumo.sobrepreco_total + linha.sobrepreco);
      }

      resumo.economia_total = roundMoney(resumo.economia_total + linha.economia);
    });
  });

  resumo.percentual_menor_preco = resumo.itens_com_vencedor > 0
    ? Number(((resumo.itens_menor_preco / resumo.itens_com_vencedor) * 100).toFixed(2))
    : 0;

  return {
    filtros: {
      obra_id: obraId || null,
      data_inicio: dataInicio || null,
      data_fim: dataFim || null
    },
    resumo,
    itens: linhas
  };
}

function buildCicloLinha(solicitacao) {
  const criadoEm = toDate(solicitacao.createdAt);
  const liberadoEm = toDate(solicitacao.liberado_para_compra_em);
  const encerradoEm = toDate(solicitacao.encerrado_em);
  const fornecedores = solicitacao.fornecedores || [];
  const pedidos = solicitacao.pedidos || [];
  const primeiroEnvio = minDate(fornecedores.map((fornecedor) => fornecedor.enviado_em));
  const primeiraResposta = minDate(fornecedores.map((fornecedor) => fornecedor.respondido_em));
  const ultimaResposta = maxDate(fornecedores.map((fornecedor) => fornecedor.respondido_em));
  const primeiroPedido = minDate(pedidos.map((pedido) => pedido.createdAt));

  const tempos = {
    criacao_para_liberacao_horas: diffHours(criadoEm, liberadoEm),
    liberacao_para_envio_horas: diffHours(liberadoEm, primeiroEnvio),
    envio_para_primeira_resposta_horas: diffHours(primeiroEnvio, primeiraResposta),
    envio_para_ultima_resposta_horas: diffHours(primeiroEnvio, ultimaResposta),
    criacao_para_encerramento_horas: diffHours(criadoEm, encerradoEm),
    encerramento_para_pedido_horas: diffHours(encerradoEm, primeiroPedido),
    ciclo_total_ate_pedido_horas: diffHours(criadoEm, primeiroPedido)
  };

  return {
    solicitacao: {
      id: solicitacao.id,
      titulo: solicitacao.titulo || null,
      obra_id: solicitacao.obra_id || null,
      status: solicitacao.status,
      criado_em: solicitacao.createdAt || null,
      liberado_em: solicitacao.liberado_para_compra_em || null,
      primeiro_envio: primeiroEnvio,
      primeira_resposta: primeiraResposta,
      ultima_resposta: ultimaResposta,
      encerrado_em: solicitacao.encerrado_em || null,
      primeiro_pedido: primeiroPedido
    },
    contadores: {
      fornecedores_enviados: fornecedores.filter((fornecedor) => fornecedor.enviado_em).length,
      fornecedores_respondidos: fornecedores.filter((fornecedor) => fornecedor.respondido_em).length,
      pedidos_gerados: pedidos.length
    },
    tempos
  };
}

async function relatorioCicloCompras({ obraId, dataInicio, dataFim, obraIds } = {}) {
  const solicitacoes = await SolicitacaoCompra.findAll({
    where: buildSolicitacaoCriacaoWhere({ obraId, obraIds, dataInicio, dataFim }),
    attributes: [
      'id',
      'titulo',
      'obra_id',
      'status',
      'liberado_para_compra_em',
      'encerrado_em',
      'createdAt'
    ],
    include: [
      {
        model: SolicitacaoCompraFornecedor,
        as: 'fornecedores',
        attributes: ['id', 'enviado_em', 'respondido_em']
      },
      {
        model: PedidoCompra,
        as: 'pedidos',
        attributes: ['id', 'createdAt']
      }
    ],
    order: [['createdAt', 'DESC'], ['id', 'DESC']]
  });

  const linhas = solicitacoes.map(buildCicloLinha);
  const resumo = {
    solicitacoes: linhas.length,
    solicitacoes_liberadas: linhas.filter((linha) => linha.solicitacao.liberado_em).length,
    cotacoes_enviadas: linhas.filter((linha) => linha.solicitacao.primeiro_envio).length,
    cotacoes_com_resposta: linhas.filter((linha) => linha.solicitacao.primeira_resposta).length,
    cotacoes_encerradas: linhas.filter((linha) => linha.solicitacao.encerrado_em).length,
    solicitacoes_com_pedido: linhas.filter((linha) => linha.solicitacao.primeiro_pedido).length,
    fornecedores_enviados: linhas.reduce((sum, linha) => sum + linha.contadores.fornecedores_enviados, 0),
    fornecedores_respondidos: linhas.reduce((sum, linha) => sum + linha.contadores.fornecedores_respondidos, 0),
    tempo_medio_criacao_liberacao_horas: average(linhas.map((linha) => linha.tempos.criacao_para_liberacao_horas)),
    tempo_medio_liberacao_envio_horas: average(linhas.map((linha) => linha.tempos.liberacao_para_envio_horas)),
    tempo_medio_envio_primeira_resposta_horas: average(linhas.map((linha) => linha.tempos.envio_para_primeira_resposta_horas)),
    tempo_medio_criacao_encerramento_horas: average(linhas.map((linha) => linha.tempos.criacao_para_encerramento_horas)),
    tempo_medio_encerramento_pedido_horas: average(linhas.map((linha) => linha.tempos.encerramento_para_pedido_horas)),
    tempo_medio_ciclo_total_ate_pedido_horas: average(linhas.map((linha) => linha.tempos.ciclo_total_ate_pedido_horas))
  };

  resumo.taxa_resposta_fornecedor = resumo.fornecedores_enviados > 0
    ? Number(((resumo.fornecedores_respondidos / resumo.fornecedores_enviados) * 100).toFixed(2))
    : 0;

  return {
    filtros: {
      obra_id: obraId || null,
      data_inicio: dataInicio || null,
      data_fim: dataFim || null
    },
    resumo,
    solicitacoes: linhas
  };
}

module.exports = {
  relatorioCicloCompras,
  relatorioCategoriasInsumosCompras,
  relatorioComprasDiretas,
  relatorioComprasPorFornecedor,
  relatorioDemandaPedidosCompras,
  relatorioEconomiaCotacoes,
  relatorioEvolucaoCompras,
  relatorioFornecedoresCompras,
  relatorioPendenciasCotacoesCompras,
  relatorioPrecosInsumosFornecedores
};
