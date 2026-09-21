const { Op } = require('sequelize');
const {
  FormaPagamentoFinanceira,
  FornecedorCompra,
  Historico,
  PedidoCompra,
  PedidoCompraDocumentoFinanceiro,
  PedidoCompraFrete,
  PedidoCompraReabertura,
  PedidoCompraTitulo,
  Setor,
  SolicitacaoCompra,
  SolicitacaoCompraAlocacao,
  TituloFinanceiro,
  User
} = require('../models');
const { criarTituloManual } = require('./tituloFinanceiroService');
const { criarNotificacao } = require('./notificacoes');
const {
  obterConfiguracaoCategoriasTituloPedido,
  validarCategoriaTituloPedido
} = require('./pedidoCompraTituloConfigService');

const STATUS_FLUXO = Object.freeze({
  AGUARDANDO_GEO: 'AGUARDANDO_GEO',
  AGUARDANDO_PREVISAO: 'AGUARDANDO_PREVISAO',
  PREVISAO_CRIADA: 'PREVISAO_CRIADA',
  PARCIALMENTE_LIBERADO: 'PARCIALMENTE_LIBERADO',
  LIBERADO_FINANCEIRO: 'LIBERADO_FINANCEIRO',
  PAGO_PARCIALMENTE: 'PAGO_PARCIALMENTE',
  CONCLUIDO: 'CONCLUIDO',
  LEGADO_PENDENTE_REVISAO: 'LEGADO_PENDENTE_REVISAO',
  CORRECAO_SOLICITADA: 'CORRECAO_SOLICITADA',
  NAO_GERA_TITULO: 'NAO_GERA_TITULO',
  CANCELADO: 'CANCELADO'
});

const STATUS_TITULO_ENCERRADO = new Set(['CANCELADO', 'ESTORNADO']);
const STATUS_TITULO_PAGO = new Set(['QUITADO']);
const STATUS_TITULO_LIBERADO = new Set(['ABERTO', 'PARCIAL', 'QUITADO']);
const STATUS_PEDIDO_FECHADO = new Set(['FECHADO_FORNECEDOR', 'ENCERRADO']);

function normalize(value) {
  return String(value || '').trim().toUpperCase();
}

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function httpError(statusCode, message, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

function buildPedidoCodigo(id) {
  return `PC-${String(id).padStart(5, '0')}`;
}

async function obterDestinatariosGeo(transaction) {
  const setor = await Setor.findOne({
    where: {
      [Op.or]: [
        { codigo: { [Op.in]: ['GEO', 'GERENCIA_PROCESSOS'] } },
        { nome: { [Op.in]: ['GEO', 'GERENCIA DE PROCESSOS'] } }
      ]
    },
    attributes: ['id'],
    transaction
  });
  if (!setor) return [];

  const usuarios = await User.findAll({
    where: { setor_id: setor.id, ativo: true },
    attributes: ['id'],
    transaction
  });
  return usuarios.map((usuario) => Number(usuario.id));
}

async function notificarGeo({ pedido, solicitacao, tipo, mensagem, usuarioId, metadata = {}, transaction }) {
  const solicitacaoPrincipalId = Number(solicitacao?.solicitacao_principal_id || 0);
  if (!solicitacaoPrincipalId) return;
  const destinatarios = await obterDestinatariosGeo(transaction);
  if (!destinatarios.length) return;

  await criarNotificacao({
    solicitacao_id: solicitacaoPrincipalId,
    tipo,
    mensagem,
    metadata: {
      pedido_compra_id: pedido.id,
      pedido_compra_codigo: buildPedidoCodigo(pedido.id),
      solicitacao_compra_id: pedido.solicitacao_compra_id,
      ...metadata
    },
    created_by: usuarioId || null,
    destinatarios,
    usarDestinatariosInformados: true,
    transaction
  });
}

async function registrarHistorico({ pedido, solicitacao, usuarioId, acao, descricao, metadata = {}, transaction }) {
  const solicitacaoPrincipalId = Number(solicitacao?.solicitacao_principal_id || 0);
  if (!solicitacaoPrincipalId) return;
  await Historico.create({
    solicitacao_id: solicitacaoPrincipalId,
    usuario_responsavel_id: usuarioId || null,
    setor: String(acao || '').includes('_GEO') ? 'GEO' : 'COMPRAS',
    acao,
    observacao: descricao,
    descricao,
    metadata: JSON.stringify({
      tipo: 'PEDIDO_COMPRA_FINANCEIRO',
      pedido_compra_id: pedido.id,
      pedido_compra_codigo: buildPedidoCodigo(pedido.id),
      solicitacao_compra_id: pedido.solicitacao_compra_id,
      ...metadata
    })
  }, { transaction });
}

async function buscarIdsTitulosLegados(pedidoId, transaction) {
  const [alocacoes, fretes] = await Promise.all([
    SolicitacaoCompraAlocacao.findAll({
      where: {
        pedido_compra_id: Number(pedidoId),
        titulo_financeiro_id: { [Op.ne]: null }
      },
      attributes: ['titulo_financeiro_id'],
      transaction,
      raw: true
    }),
    PedidoCompraFrete.findAll({
      where: {
        pedido_compra_id: Number(pedidoId),
        titulo_financeiro_id: { [Op.ne]: null }
      },
      attributes: ['titulo_financeiro_id'],
      transaction,
      raw: true
    })
  ]);
  return [...new Set([...alocacoes, ...fretes]
    .map((item) => Number(item.titulo_financeiro_id || 0))
    .filter((id) => id > 0))];
}

async function buscarTitulosPedido(pedidoId, { transaction, incluirLegados = true } = {}) {
  const vinculos = await PedidoCompraTitulo.findAll({
    where: { pedido_compra_id: Number(pedidoId) },
    include: [{
      model: TituloFinanceiro,
      as: 'titulo',
      required: true,
      attributes: [
        'id', 'codigo', 'status', 'descricao', 'valor_original', 'valor_saldo', 'valor_baixado',
        'data_emissao', 'data_vencimento', 'forma_pagamento_id', 'categoria_financeira_id'
      ]
    }],
    transaction,
    lock: transaction?.LOCK?.UPDATE,
    order: [['numero_parcela', 'ASC'], ['id', 'ASC']]
  });
  await require('./tituloRenegociacaoVinculos').projetarAssociacoes(vinculos, 'titulo', { transaction });
  const resultado = vinculos.map((vinculo) => ({
    vinculo_id: vinculo.id,
    origem: vinculo.origem,
    status_liberacao: vinculo.status_liberacao,
    numero_parcela: vinculo.numero_parcela,
    total_parcelas: vinculo.total_parcelas,
    titulo: vinculo.titulo?.toJSON ? vinculo.titulo.toJSON() : vinculo.titulo
  }));

  if (!incluirLegados) return resultado;
  const conhecidos = new Set(resultado.map((item) => Number(item.titulo?.id || 0)));
  const idsLegados = (await buscarIdsTitulosLegados(pedidoId, transaction)).filter((id) => !conhecidos.has(id));
  if (!idsLegados.length) return resultado;

  const titulosLegados = await TituloFinanceiro.findAll({
    where: { id: { [Op.in]: idsLegados } },
    attributes: [
      'id', 'codigo', 'status', 'descricao', 'valor_original', 'valor_saldo', 'valor_baixado',
      'data_emissao', 'data_vencimento', 'forma_pagamento_id', 'categoria_financeira_id'
    ],
    transaction,
    lock: transaction?.LOCK?.UPDATE,
    order: [['data_vencimento', 'ASC'], ['id', 'ASC']]
  });
  const legadosEfetivos = await require('./tituloRenegociacaoVinculos').projetarOrigens(titulosLegados, { transaction });
  return resultado.concat(legadosEfetivos.map((titulo) => ({
    vinculo_id: null,
    origem: 'LEGADO_DETECTADO',
    status_liberacao: normalize(titulo.status) === 'PREVISAO' ? 'PREVISAO' : 'LIBERADO',
    numero_parcela: titulo.numero_parcela,
    total_parcelas: titulo.total_parcelas,
    titulo: titulo.toJSON ? titulo.toJSON() : titulo
  })));
}

function derivarStatusFinanceiro(pedido, titulos = []) {
  if (normalize(pedido.status) === 'CANCELADO') return STATUS_FLUXO.CANCELADO;
  const ativos = titulos.filter((item) => !STATUS_TITULO_ENCERRADO.has(normalize(item.titulo?.status)));
  if (ativos.some((item) => STATUS_TITULO_PAGO.has(normalize(item.titulo?.status))
    || normalize(item.titulo?.status) === 'PARCIAL' || Number(item.titulo?.valor_baixado || 0) > 0)) {
    return ativos.every((item) => STATUS_TITULO_PAGO.has(normalize(item.titulo?.status)))
      ? STATUS_FLUXO.CONCLUIDO
      : STATUS_FLUXO.PAGO_PARCIALMENTE;
  }
  const liberados = ativos.filter((item) => STATUS_TITULO_LIBERADO.has(normalize(item.titulo?.status)));
  const previsoes = ativos.filter((item) => normalize(item.titulo?.status) === 'PREVISAO');
  if (liberados.length && previsoes.length) return STATUS_FLUXO.PARCIALMENTE_LIBERADO;
  if (liberados.length) return STATUS_FLUXO.LIBERADO_FINANCEIRO;
  if (previsoes.length) return STATUS_FLUXO.PREVISAO_CRIADA;

  if (!pedido.financeiro_fluxo_versao) {
    return STATUS_PEDIDO_FECHADO.has(normalize(pedido.status))
      ? STATUS_FLUXO.LEGADO_PENDENTE_REVISAO
      : 'NAO_INICIADO';
  }
  return pedido.status_financeiro || (
    STATUS_PEDIDO_FECHADO.has(normalize(pedido.status))
      ? STATUS_FLUXO.AGUARDANDO_PREVISAO
      : 'NAO_INICIADO'
  );
}

async function obterResumoFinanceiroPedido(pedido, { transaction, incluirDetalhes = false } = {}) {
  const titulos = await buscarTitulosPedido(pedido.id, { transaction, incluirLegados: true });
  const status = derivarStatusFinanceiro(pedido, titulos);
  const reabertura = await PedidoCompraReabertura.findOne({
    where: { pedido_compra_id: Number(pedido.id) },
    include: [
      { model: User, as: 'solicitante', attributes: ['id', 'nome'] },
      { model: User, as: 'decididoPor', attributes: ['id', 'nome'] }
    ],
    order: [['id', 'DESC']],
    transaction
  });
  const resumo = {
    status,
    fluxo_versao: pedido.financeiro_fluxo_versao || null,
    legado: !pedido.financeiro_fluxo_versao,
    quantidade_titulos: titulos.length,
    possui_titulo: titulos.length > 0,
    reabertura_exige_geo: titulos.length > 0,
    reabertura: reabertura ? reabertura.toJSON() : null
  };
  if (!incluirDetalhes) return resumo;

  const [documentos, categoriasConfig, formasPagamento] = await Promise.all([
    PedidoCompraDocumentoFinanceiro.findAll({
      where: { pedido_compra_id: Number(pedido.id) },
      include: [{ model: User, as: 'criadoPor', attributes: ['id', 'nome'] }],
      order: [['id', 'DESC']],
      transaction
    }),
    obterConfiguracaoCategoriasTituloPedido({ transaction }),
    FormaPagamentoFinanceira.findAll({
      where: { ativo: true, exige_cartao: false },
      attributes: ['id', 'nome', 'codigo', 'tipo', 'permite_parcelamento', 'exige_cartao'],
      order: [['nome', 'ASC']],
      transaction
    })
  ]);
  return {
    ...resumo,
    titulos,
    documentos: documentos.map((documento) => documento.toJSON()),
    opcoes: {
      categorias: categoriasConfig.categorias,
      categoria_padrao_id: categoriasConfig.categoria_padrao_id,
      categorias_configuradas: categoriasConfig.configurada,
      formas_pagamento: formasPagamento.map((item) => item.toJSON())
    }
  };
}

async function aplicarResumoFinanceiroPedidos(pedidos = [], options = {}) {
  if (options.incluirDetalhes) {
    return Promise.all((pedidos || []).map(async (pedido) => ({
      ...(pedido?.toJSON ? pedido.toJSON() : { ...pedido }),
      financeiro: await obterResumoFinanceiroPedido(pedido, options)
    })));
  }

  const registros = (pedidos || []).map((pedido) => ({
    model: pedido,
    plain: pedido?.toJSON ? pedido.toJSON() : { ...pedido }
  }));
  const ids = registros.map(({ plain }) => Number(plain.id)).filter((id) => id > 0);
  if (!ids.length) return [];

  const [vinculos, alocacoes, fretes, reaberturas] = await Promise.all([
    PedidoCompraTitulo.findAll({
      where: { pedido_compra_id: { [Op.in]: ids } },
      include: [{
        model: TituloFinanceiro,
        as: 'titulo',
        required: true,
        attributes: ['id', 'status', 'valor_original']
      }],
      transaction: options.transaction
    }),
    SolicitacaoCompraAlocacao.findAll({
      where: {
        pedido_compra_id: { [Op.in]: ids },
        titulo_financeiro_id: { [Op.ne]: null }
      },
      attributes: ['pedido_compra_id', 'titulo_financeiro_id'],
      transaction: options.transaction,
      raw: true
    }),
    PedidoCompraFrete.findAll({
      where: {
        pedido_compra_id: { [Op.in]: ids },
        titulo_financeiro_id: { [Op.ne]: null }
      },
      attributes: ['pedido_compra_id', 'titulo_financeiro_id'],
      transaction: options.transaction,
      raw: true
    }),
    PedidoCompraReabertura.findAll({
      where: { pedido_compra_id: { [Op.in]: ids } },
      order: [['id', 'DESC']],
      transaction: options.transaction
    })
  ]);

  await require('./tituloRenegociacaoVinculos').projetarAssociacoes(vinculos, 'titulo', { transaction: options.transaction });
  const titulosPorPedido = new Map(ids.map((id) => [id, []]));
  const tituloIdsExplicitamenteVinculados = new Set();
  for (const vinculo of vinculos) {
    const pedidoId = Number(vinculo.pedido_compra_id);
    const titulo = vinculo.titulo?.toJSON ? vinculo.titulo.toJSON() : vinculo.titulo;
    tituloIdsExplicitamenteVinculados.add(Number(titulo?.id));
    titulosPorPedido.get(pedidoId)?.push({ vinculo_id: vinculo.id, origem: vinculo.origem, titulo });
  }

  const legadosPorPedido = new Map(ids.map((id) => [id, new Set()]));
  for (const item of [...alocacoes, ...fretes]) {
    const pedidoId = Number(item.pedido_compra_id);
    const tituloId = Number(item.titulo_financeiro_id);
    if (tituloId > 0 && !tituloIdsExplicitamenteVinculados.has(tituloId)) {
      legadosPorPedido.get(pedidoId)?.add(tituloId);
    }
  }
  const idsTitulosLegados = [...new Set([...legadosPorPedido.values()].flatMap((set) => [...set]))];
  const titulosLegados = idsTitulosLegados.length
    ? await TituloFinanceiro.findAll({
        where: { id: { [Op.in]: idsTitulosLegados } },
        attributes: ['id', 'status', 'valor_original'],
        transaction: options.transaction,
        raw: true
      })
    : [];
  const legadosEfetivos = await require('./tituloRenegociacaoVinculos').projetarOrigens(titulosLegados, { transaction: options.transaction });
  const mapaTitulosLegados = new Map(legadosEfetivos.map((titulo) => [Number(titulo.id), titulo]));
  for (const [pedidoId, tituloIds] of legadosPorPedido.entries()) {
    for (const tituloId of tituloIds) {
      const titulo = mapaTitulosLegados.get(tituloId);
      if (titulo) titulosPorPedido.get(pedidoId)?.push({ vinculo_id: null, origem: 'LEGADO_DETECTADO', titulo });
    }
  }

  const reaberturaPorPedido = new Map();
  for (const reabertura of reaberturas) {
    const pedidoId = Number(reabertura.pedido_compra_id);
    if (!reaberturaPorPedido.has(pedidoId)) reaberturaPorPedido.set(pedidoId, reabertura.toJSON());
  }

  return registros.map(({ model, plain }) => {
    const titulos = titulosPorPedido.get(Number(plain.id)) || [];
    return {
      ...plain,
      financeiro: {
        status: derivarStatusFinanceiro(model, titulos),
        fluxo_versao: plain.financeiro_fluxo_versao || null,
        legado: !plain.financeiro_fluxo_versao,
        quantidade_titulos: titulos.length,
        possui_titulo: titulos.length > 0,
        reabertura_exige_geo: titulos.length > 0,
        reabertura: reaberturaPorPedido.get(Number(plain.id)) || null
      }
    };
  });
}

async function sincronizarStatusFinanceiroPedidos(pedidoIds = [], transaction) {
  const ids = [...new Set((Array.isArray(pedidoIds) ? pedidoIds : [pedidoIds])
    .map(Number)
    .filter((id) => id > 0))];
  for (const pedidoId of ids) {
    const pedido = await PedidoCompra.findByPk(pedidoId, { transaction });
    if (!pedido) continue;
    const titulos = await buscarTitulosPedido(pedido.id, { transaction, incluirLegados: true });
    await pedido.update({
      status_financeiro: derivarStatusFinanceiro(pedido, titulos),
      financeiro_atualizado_em: new Date()
    }, { transaction });
  }
}

async function sincronizarPedidoFinanceiroAoFechar({ pedido, usuarioId, transaction }) {
  if (!pedido || !STATUS_PEDIDO_FECHADO.has(normalize(pedido.status))) return pedido;
  if (pedido.financeiro_fluxo_versao && normalize(pedido.status_financeiro) !== 'NAO_INICIADO') {
    return pedido;
  }

  const agora = new Date();
  await pedido.update({
    financeiro_fluxo_versao: pedido.financeiro_fluxo_versao || 1,
    status_financeiro: STATUS_FLUXO.AGUARDANDO_PREVISAO,
    financeiro_encaminhado_em: agora,
    financeiro_atualizado_em: agora
  }, { transaction });

  const solicitacao = await SolicitacaoCompra.findByPk(pedido.solicitacao_compra_id, {
    attributes: ['id', 'solicitacao_principal_id'],
    transaction
  });
  await registrarHistorico({
    pedido,
    solicitacao,
    usuarioId,
    acao: 'PEDIDO_COMPRA_AGUARDANDO_TITULOS_COMPRAS',
    descricao: `${buildPedidoCodigo(pedido.id)} fechado com o fornecedor e mantido em Compras para geracao dos titulos.`,
    metadata: { setor_responsavel: 'COMPRAS' },
    transaction
  });
  return pedido;
}

async function adotarPedidoLegado({ pedidoId, usuarioId, transaction }) {
  const pedido = await PedidoCompra.findByPk(Number(pedidoId), {
    transaction,
    lock: transaction?.LOCK?.UPDATE
  });
  if (!pedido) throw httpError(404, 'Pedido de compra nao encontrado.');
  if (pedido.financeiro_fluxo_versao) return pedido;
  if (!STATUS_PEDIDO_FECHADO.has(normalize(pedido.status))) {
    throw httpError(409, 'Somente pedidos fechados podem entrar na gestao de titulos de Compras.');
  }

  const idsLegados = await buscarIdsTitulosLegados(pedido.id, transaction);
  const titulos = idsLegados.length
    ? await TituloFinanceiro.findAll({ where: { id: { [Op.in]: idsLegados } }, transaction })
    : [];
  for (const titulo of titulos) {
    await PedidoCompraTitulo.findOrCreate({
      where: { pedido_compra_id: pedido.id, titulo_financeiro_id: titulo.id },
      defaults: {
        numero_parcela: titulo.numero_parcela,
        total_parcelas: titulo.total_parcelas,
        valor: titulo.valor_original,
        data_vencimento: titulo.data_vencimento,
        status_liberacao: normalize(titulo.status) === 'PREVISAO' ? 'PREVISAO' : 'LIBERADO',
        origem: 'LEGADO_CONFIRMADO',
        criado_por: usuarioId || null
      },
      transaction
    });
  }

  const agora = new Date();
  const status = derivarStatusFinanceiro(pedido, titulos.map((titulo) => ({ titulo })));
  await pedido.update({
    financeiro_fluxo_versao: 1,
    status_financeiro: status === STATUS_FLUXO.LEGADO_PENDENTE_REVISAO
      ? STATUS_FLUXO.AGUARDANDO_PREVISAO
      : status,
    financeiro_encaminhado_em: pedido.financeiro_encaminhado_em || agora,
    financeiro_atualizado_em: agora
  }, { transaction });
  const solicitacao = await SolicitacaoCompra.findByPk(pedido.solicitacao_compra_id, {
    attributes: ['id', 'solicitacao_principal_id'],
    transaction
  });
  await registrarHistorico({
    pedido,
    solicitacao,
    usuarioId,
    acao: 'PEDIDO_COMPRA_LEGADO_ADOTADO_COMPRAS',
    descricao: `${buildPedidoCodigo(pedido.id)} legado revisado e adotado na gestao de titulos de Compras.`,
    metadata: { titulos_ids: titulos.map((titulo) => titulo.id) },
    transaction
  });
  return pedido;
}

function normalizarParcelas(parcelas, valorPedido) {
  if (!Array.isArray(parcelas) || !parcelas.length) {
    throw httpError(400, 'Informe ao menos uma parcela da previsao.');
  }
  const normalizadas = parcelas.map((parcela, index) => {
    const valor = roundMoney(parcela?.valor);
    const dataVencimento = String(parcela?.data_vencimento || '').slice(0, 10);
    if (valor <= 0) throw httpError(400, `Informe um valor valido para a parcela ${index + 1}.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataVencimento)) {
      throw httpError(400, `Informe o vencimento da parcela ${index + 1}.`);
    }
    return { valor, data_vencimento: dataVencimento };
  });
  const total = roundMoney(normalizadas.reduce((soma, parcela) => soma + parcela.valor, 0));
  if (Math.abs(total - roundMoney(valorPedido)) >= 0.01) {
    throw httpError(400, 'A soma das parcelas precisa ser igual ao total devido ao fornecedor.');
  }
  return normalizadas;
}

async function criarPrevisoesPedido({ req, pedidoId, payload, idempotencyKey, transaction }) {
  const pedido = await PedidoCompra.findByPk(Number(pedidoId), {
    include: [
      { model: FornecedorCompra, as: 'fornecedor', attributes: ['id', 'nome', 'parceiro_id'] },
      { model: SolicitacaoCompra, as: 'solicitacao', attributes: ['id', 'solicitacao_principal_id'] }
    ],
    transaction,
    lock: transaction?.LOCK?.UPDATE
  });
  if (!pedido) throw httpError(404, 'Pedido de compra nao encontrado.');
  if (!pedido.financeiro_fluxo_versao) {
    throw httpError(409, 'O pedido legado precisa ser revisado antes de Compras gerar os titulos.');
  }
  if (!STATUS_PEDIDO_FECHADO.has(normalize(pedido.status))) {
    throw httpError(409, 'O pedido precisa estar fechado com o fornecedor para gerar os titulos.');
  }
  if (!pedido.fornecedor?.parceiro_id) {
    throw httpError(409, 'O fornecedor do pedido precisa estar vinculado a um parceiro antes de gerar o titulo.');
  }

  const chave = String(idempotencyKey || '').trim();
  if (!chave) throw httpError(400, 'Chave de idempotencia obrigatoria.');
  const existenteChave = await PedidoCompraTitulo.findOne({
    where: { idempotency_key: `PEDIDO:${pedido.id}:${chave}:1` },
    transaction
  });
  if (existenteChave) return obterResumoFinanceiroPedido(pedido, { transaction, incluirDetalhes: true });

  const existentes = await buscarTitulosPedido(pedido.id, { transaction, incluirLegados: true });
  if (existentes.some((item) => !STATUS_TITULO_ENCERRADO.has(normalize(item.titulo?.status)))) {
    throw httpError(409, 'Este pedido ja possui titulo financeiro ativo.', 'PEDIDO_JA_POSSUI_TITULO');
  }

  const valorPedido = roundMoney(pedido.valor_total_fornecedor ?? pedido.valor_total);
  const parcelas = normalizarParcelas(payload?.parcelas, valorPedido);
  const categoriaId = await validarCategoriaTituloPedido(
    payload?.categoria_financeira_id,
    { transaction }
  );

  const resultado = await criarTituloManual(req, {
    solicitacao_id: Number(pedido.solicitacao?.solicitacao_principal_id || 0) || null,
    obra_id: pedido.obra_id,
    parceiro_id: pedido.fornecedor.parceiro_id,
    categoria_financeira_id: categoriaId,
    tipo: 'PAGAR',
    // Compras cria o titulo ja operacional. A autorizacao do pagamento acontece depois,
    // quando o GEO seleciona o titulo no Contas a Pagar e o envia para a fila.
    status: 'ABERTO',
    valor: valorPedido,
    descricao: String(payload?.descricao || `Pedido ${buildPedidoCodigo(pedido.id)} - ${pedido.fornecedor.nome}`).trim(),
    numero_documento: buildPedidoCodigo(pedido.id),
    data_emissao: hoje(),
    competencia_data: hoje(),
    data_vencimento: parcelas[0].data_vencimento,
    quantidade_parcelas: parcelas.length,
    parcelas
  }, {
    transaction,
    origemTitulo: 'PEDIDO_COMPRA',
    pularAcessoFinanceiro: true,
    registrarSeguranca: false,
    retornarTitulosCriados: true,
    permitirFormaPagamentoPendente: true
  });
  const titulosCriados = [...new Map((resultado.titulos || [])
    .map((titulo) => [Number(titulo.id), titulo])).values()];
  for (const [index, titulo] of titulosCriados.entries()) {
    await PedidoCompraTitulo.create({
      pedido_compra_id: pedido.id,
      titulo_financeiro_id: titulo.id,
      numero_parcela: parcelas.length > 1 ? index + 1 : null,
      total_parcelas: parcelas.length > 1 ? parcelas.length : null,
      valor: titulo.valor_original,
      data_vencimento: titulo.data_vencimento,
      status_liberacao: 'LIBERADO',
      origem: 'NOVO_FLUXO',
      idempotency_key: `PEDIDO:${pedido.id}:${chave}:${index + 1}`,
      criado_por: req.user?.id || null
    }, { transaction });
  }
  const comprovacao = payload?.comprovacao
    ? await registrarDocumentoFinanceiro({
      pedidoId: pedido.id,
      payload: payload.comprovacao,
      usuarioId: req.user?.id,
      idempotencyKey: `${chave}:comprovacao`,
      transaction
    })
    : null;
  await pedido.update({
    status_financeiro: STATUS_FLUXO.LIBERADO_FINANCEIRO,
    financeiro_atualizado_em: new Date()
  }, { transaction });
  await registrarHistorico({
    pedido,
    solicitacao: pedido.solicitacao,
    usuarioId: req.user?.id,
    acao: 'PEDIDO_COMPRA_TITULOS_CRIADOS_COMPRAS',
    descricao: `${titulosCriados.length} titulo(s) financeiro(s) criado(s) por Compras para ${buildPedidoCodigo(pedido.id)}.`,
    metadata: {
      titulos_ids: titulosCriados.map((titulo) => titulo.id),
      valor_total: valorPedido,
      comprovacao_id: comprovacao?.id || null
    },
    transaction
  });
  return obterResumoFinanceiroPedido(pedido, { transaction, incluirDetalhes: true });
}

async function reparcelarPrevisoesPedido({ req, pedidoId, payload, idempotencyKey, transaction }) {
  const pedido = await PedidoCompra.findByPk(Number(pedidoId), {
    include: [
      { model: FornecedorCompra, as: 'fornecedor', attributes: ['id', 'nome', 'parceiro_id'] },
      { model: SolicitacaoCompra, as: 'solicitacao', attributes: ['id', 'solicitacao_principal_id'] }
    ],
    transaction,
    lock: transaction?.LOCK?.UPDATE
  });
  if (!pedido) throw httpError(404, 'Pedido de compra nao encontrado.');
  if (!pedido.financeiro_fluxo_versao) {
    throw httpError(409, 'O pedido legado precisa ser revisado pelo GEO antes de alterar as previsoes.');
  }
  if (!STATUS_PEDIDO_FECHADO.has(normalize(pedido.status))) {
    throw httpError(409, 'O pedido precisa estar fechado com o fornecedor para alterar as previsoes.');
  }

  const chave = String(idempotencyKey || '').trim();
  if (!chave) throw httpError(400, 'Chave de idempotencia obrigatoria.');
  const existenteChave = await PedidoCompraTitulo.findOne({
    where: { idempotency_key: `PEDIDO:${pedido.id}:${chave}:1` },
    transaction
  });
  if (existenteChave) return obterResumoFinanceiroPedido(pedido, { transaction, incluirDetalhes: true });

  const titulos = await buscarTitulosPedido(pedido.id, { transaction, incluirLegados: true });
  const ativos = titulos.filter((item) => !STATUS_TITULO_ENCERRADO.has(normalize(item.titulo?.status)));
  if (!ativos.length) {
    throw httpError(409, 'Este pedido nao possui previsoes ativas para reparticionar.');
  }
  if (ativos.some((item) => normalize(item.titulo?.status) !== 'PREVISAO')) {
    throw httpError(409, 'Somente previsoes ainda nao liberadas podem ser reparticionadas.', 'PREVISAO_JA_LIBERADA');
  }
  if (ativos.some((item) => item.origem !== 'NOVO_FLUXO' || !item.vinculo_id)) {
    throw httpError(409, 'Previsoes legadas precisam ser regularizadas antes do reparticionamento.');
  }

  const valorPedido = roundMoney(pedido.valor_total_fornecedor ?? pedido.valor_total);
  normalizarParcelas(payload?.parcelas, valorPedido);

  const agora = new Date();
  const titulosAnteriores = [];
  for (const item of ativos) {
    const [quantidadeAtualizada] = await TituloFinanceiro.update({
      status: 'CANCELADO',
      valor_saldo: 0,
      atualizado_por: req.user?.id || null
    }, {
      where: { id: item.titulo.id, status: 'PREVISAO' },
      transaction
    });
    if (quantidadeAtualizada !== 1) {
      throw httpError(409, 'As previsoes mudaram durante o reparticionamento. Atualize a tela e tente novamente.');
    }
    await PedidoCompraTitulo.update({
      status_liberacao: 'CANCELADO',
      cancelado_por: req.user?.id || null,
      cancelado_em: agora,
      motivo_cancelamento: 'Substituida por novo parcelamento antes da liberacao financeira.'
    }, {
      where: { id: item.vinculo_id },
      transaction
    });
    titulosAnteriores.push(Number(item.titulo.id));
  }

  const resumo = await criarPrevisoesPedido({
    req,
    pedidoId: pedido.id,
    payload,
    idempotencyKey: chave,
    transaction
  });
  const novosTitulos = (resumo?.titulos || [])
    .filter((item) => item.origem === 'NOVO_FLUXO' && normalize(item.titulo?.status) === 'PREVISAO')
    .map((item) => Number(item.titulo.id));

  await registrarHistorico({
    pedido,
    solicitacao: pedido.solicitacao,
    usuarioId: req.user?.id,
    acao: 'PEDIDO_COMPRA_PREVISOES_REPARCELADAS',
    descricao: `Previsoes de ${buildPedidoCodigo(pedido.id)} substituidas por ${novosTitulos.length} parcela(s).`,
    metadata: {
      titulos_cancelados_ids: titulosAnteriores,
      titulos_novos_ids: novosTitulos,
      valor_total: valorPedido
    },
    transaction
  });

  return resumo;
}

async function registrarDocumentoFinanceiro({ pedidoId, payload, usuarioId, idempotencyKey, transaction }) {
  const pedido = await PedidoCompra.findByPk(Number(pedidoId), { transaction });
  if (!pedido) throw httpError(404, 'Pedido de compra nao encontrado.');
  if (!pedido.financeiro_fluxo_versao) {
    throw httpError(409, 'O pedido legado precisa ser revisado pelo GEO antes de receber documentos financeiros.');
  }
  if (!STATUS_PEDIDO_FECHADO.has(normalize(pedido.status))) {
    throw httpError(409, 'O pedido precisa estar fechado com o fornecedor para receber a comprovacao da compra.');
  }
  const chave = String(idempotencyKey || '').trim();
  if (!chave) throw httpError(400, 'Chave de idempotencia obrigatoria.');
  const chaveDocumento = `PEDIDO:${pedido.id}:${chave}`;
  const existente = await PedidoCompraDocumentoFinanceiro.findOne({
    where: { idempotency_key: chaveDocumento },
    transaction
  });
  if (existente) return existente;
  const tipo = normalize(payload?.tipo);
  if (!['NOTA_FISCAL', 'COMPROVANTE_COMPRA', 'OUTRA_CONFIRMACAO'].includes(tipo)) {
    throw httpError(400, 'Tipo de comprovacao invalido.');
  }
  const arquivoUrl = String(payload?.arquivo_url || '').trim() || null;
  const numeroDocumento = String(payload?.numero_documento || '').trim() || null;
  const observacoes = String(payload?.observacoes || '').trim() || null;
  if (!arquivoUrl && !numeroDocumento && !observacoes) {
    throw httpError(400, 'Informe o numero, anexe um arquivo ou descreva a comprovacao da compra.');
  }
  return PedidoCompraDocumentoFinanceiro.create({
    pedido_compra_id: pedido.id,
    tipo,
    numero_documento: numeroDocumento,
    arquivo_url: arquivoUrl,
    arquivo_nome: String(payload?.arquivo_nome || '').trim() || null,
    observacoes,
    idempotency_key: chaveDocumento,
    criado_por: usuarioId
  }, { transaction });
}

async function liberarTitulosPedido({ pedidoId, tituloIds, formaPagamentoId, usuarioId, transaction }) {
  const pedido = await PedidoCompra.findByPk(Number(pedidoId), {
    include: [{ model: SolicitacaoCompra, as: 'solicitacao', attributes: ['id', 'solicitacao_principal_id'] }],
    transaction,
    lock: transaction?.LOCK?.UPDATE
  });
  if (!pedido) throw httpError(404, 'Pedido de compra nao encontrado.');
  const forma = await FormaPagamentoFinanceira.findOne({
    where: { id: Number(formaPagamentoId), ativo: true, exige_cartao: false },
    transaction
  });
  if (!forma) throw httpError(400, 'Selecione uma forma de pagamento ativa.');

  const ids = [...new Set((Array.isArray(tituloIds) ? tituloIds : [])
    .map(Number)
    .filter((id) => id > 0))];
  if (!ids.length) throw httpError(400, 'Selecione ao menos uma previsao para liberar.');
  const vinculos = await PedidoCompraTitulo.findAll({
    where: { pedido_compra_id: pedido.id, titulo_financeiro_id: { [Op.in]: ids } },
    include: [{ model: TituloFinanceiro, as: 'titulo', required: true }],
    transaction,
    lock: transaction?.LOCK?.UPDATE
  });
  if (vinculos.length !== ids.length || vinculos.some((item) => normalize(item.titulo?.status) !== 'PREVISAO')) {
    throw httpError(409, 'Uma ou mais previsoes selecionadas nao pertencem ao pedido ou ja foram liberadas.');
  }

  const agora = new Date();
  for (const vinculo of vinculos) {
    await vinculo.titulo.update({
      status: 'ABERTO',
      forma_pagamento_id: forma.id,
      atualizado_por: usuarioId
    }, { transaction });
    await vinculo.update({
      status_liberacao: 'LIBERADO',
      liberado_por: usuarioId,
      liberado_em: agora
    }, { transaction });
  }
  const restantes = await PedidoCompraTitulo.count({
    where: { pedido_compra_id: pedido.id, status_liberacao: 'PREVISAO' },
    transaction
  });
  await pedido.update({
    status_financeiro: restantes ? STATUS_FLUXO.PARCIALMENTE_LIBERADO : STATUS_FLUXO.LIBERADO_FINANCEIRO,
    financeiro_atualizado_em: agora
  }, { transaction });
  await registrarHistorico({
    pedido,
    solicitacao: pedido.solicitacao,
    usuarioId,
    acao: 'PEDIDO_COMPRA_TITULOS_LIBERADOS',
    descricao: `${vinculos.length} titulo(s) de ${buildPedidoCodigo(pedido.id)} liberado(s) para pagamento.`,
    metadata: { titulos_ids: ids, forma_pagamento_id: forma.id },
    transaction
  });
  return obterResumoFinanceiroPedido(pedido, { transaction, incluirDetalhes: true });
}

async function solicitarReaberturaGeo({ pedidoId, motivo, usuarioId, idempotencyKey, transaction }) {
  const pedido = await PedidoCompra.findByPk(Number(pedidoId), {
    include: [{ model: SolicitacaoCompra, as: 'solicitacao', attributes: ['id', 'solicitacao_principal_id'] }],
    transaction,
    lock: transaction?.LOCK?.UPDATE
  });
  if (!pedido) throw httpError(404, 'Pedido de compra nao encontrado.');
  if (normalize(pedido.status) === 'CANCELADO') throw httpError(409, 'Pedido cancelado nao pode ser reaberto.');
  const texto = String(motivo || '').trim();
  if (!texto) throw httpError(400, 'Informe o motivo da reabertura.');
  const titulos = await buscarTitulosPedido(pedido.id, { transaction, incluirLegados: true });
  if (!titulos.length) {
    throw httpError(409, 'Este pedido nao possui titulo vinculado e pode ser reaberto diretamente por COMPRAS.', 'REABERTURA_GEO_NAO_NECESSARIA');
  }
  const pendente = await PedidoCompraReabertura.findOne({
    where: { pedido_compra_id: pedido.id, status: 'PENDENTE' },
    transaction
  });
  if (pendente) return pendente;

  const chave = String(idempotencyKey || '').trim();
  if (!chave) throw httpError(400, 'Chave de idempotencia obrigatoria.');
  const reabertura = await PedidoCompraReabertura.create({
    pedido_compra_id: pedido.id,
    status: 'PENDENTE',
    motivo: texto,
    status_pedido_snapshot: pedido.status,
    status_financeiro_snapshot: pedido.status_financeiro,
    financeiro_snapshot: titulos.map((item) => ({
      titulo_id: item.titulo?.id,
      status: item.titulo?.status,
      valor: item.titulo?.valor_original
    })),
    solicitado_por: usuarioId,
    solicitado_em: new Date(),
    idempotency_key: `PEDIDO:${pedido.id}:${chave}`
  }, { transaction });
  await pedido.update({
    status_financeiro: STATUS_FLUXO.CORRECAO_SOLICITADA,
    financeiro_atualizado_em: new Date()
  }, { transaction });
  await notificarGeo({
    pedido,
    solicitacao: pedido.solicitacao,
    tipo: 'PEDIDO_COMPRA_REABERTURA_SOLICITADA',
    mensagem: `COMPRAS solicitou ao GEO a reabertura de ${buildPedidoCodigo(pedido.id)}.`,
    usuarioId,
    metadata: { reabertura_id: reabertura.id, motivo: texto },
    transaction
  });
  return reabertura;
}

async function decidirReaberturaGeo({ pedidoId, reaberturaId, decisao, motivo, usuarioId, transaction }) {
  const pedido = await PedidoCompra.findByPk(Number(pedidoId), {
    include: [{ model: SolicitacaoCompra, as: 'solicitacao', attributes: ['id', 'solicitacao_principal_id'] }],
    transaction,
    lock: transaction?.LOCK?.UPDATE
  });
  if (!pedido) throw httpError(404, 'Pedido de compra nao encontrado.');
  const reabertura = await PedidoCompraReabertura.findOne({
    where: { id: Number(reaberturaId), pedido_compra_id: pedido.id },
    transaction,
    lock: transaction?.LOCK?.UPDATE
  });
  if (!reabertura) throw httpError(404, 'Pedido de reabertura nao encontrado.');
  if (normalize(reabertura.status) !== 'PENDENTE') return reabertura;
  const decisaoNormalizada = normalize(decisao);
  if (!['APROVAR', 'REJEITAR'].includes(decisaoNormalizada)) {
    throw httpError(400, 'Decisao de reabertura invalida.');
  }
  const motivoNormalizado = String(motivo || '').trim();
  if (!motivoNormalizado) throw httpError(400, 'Informe a justificativa da decisao.');

  const titulos = await buscarTitulosPedido(pedido.id, { transaction, incluirLegados: true });
  if (decisaoNormalizada === 'APROVAR') {
    const impeditivos = titulos.filter((item) => !['PREVISAO', 'CANCELADO', 'ESTORNADO'].includes(normalize(item.titulo?.status)));
    if (impeditivos.length) {
      throw httpError(
        409,
        'A reabertura nao pode ser aprovada enquanto houver titulo aberto, parcial ou quitado. O Financeiro precisa regularizar esses titulos primeiro.',
        'TRATAMENTO_FINANCEIRO_NECESSARIO'
      );
    }
    const agora = new Date();
    for (const item of titulos.filter((registro) => normalize(registro.titulo?.status) === 'PREVISAO')) {
      const [quantidadeAtualizada] = await TituloFinanceiro.update({
        status: 'CANCELADO',
        valor_saldo: 0,
        atualizado_por: usuarioId
      }, { where: { id: item.titulo.id, status: 'PREVISAO' }, transaction });
      if (quantidadeAtualizada !== 1) {
        throw httpError(409, 'O estado financeiro do pedido mudou durante a analise. Atualize a tela e revise novamente.');
      }
      if (item.vinculo_id) {
        await PedidoCompraTitulo.update({
          status_liberacao: 'CANCELADO',
          cancelado_por: usuarioId,
          cancelado_em: agora,
          motivo_cancelamento: motivoNormalizado
        }, { where: { id: item.vinculo_id }, transaction });
      }
    }
    await reabertura.update({
      status: 'APROVADA',
      decidido_por: usuarioId,
      decidido_em: agora,
      motivo_decisao: motivoNormalizado
    }, { transaction });
    const { reabrirPedidoParaCotacao } = require('./pedidoCompraService');
    await reabrirPedidoParaCotacao({
      pedidoId: pedido.id,
      usuarioId,
      motivo: `Aprovado pelo GEO: ${motivoNormalizado}`,
      aprovacaoGeoId: reabertura.id,
      transaction
    });
    await pedido.update({
      status_financeiro: 'NAO_INICIADO',
      financeiro_atualizado_em: agora
    }, { transaction });
  } else {
    await reabertura.update({
      status: 'REJEITADA',
      decidido_por: usuarioId,
      decidido_em: new Date(),
      motivo_decisao: motivoNormalizado
    }, { transaction });
    await pedido.update({
      status_financeiro: reabertura.status_financeiro_snapshot || derivarStatusFinanceiro(
        { ...pedido.toJSON(), status_financeiro: null },
        titulos
      ),
      financeiro_atualizado_em: new Date()
    }, { transaction });
  }
  await registrarHistorico({
    pedido,
    solicitacao: pedido.solicitacao,
    usuarioId,
    acao: decisaoNormalizada === 'APROVAR'
      ? 'PEDIDO_COMPRA_REABERTURA_APROVADA_GEO'
      : 'PEDIDO_COMPRA_REABERTURA_REJEITADA_GEO',
    descricao: `Reabertura de ${buildPedidoCodigo(pedido.id)} ${decisaoNormalizada === 'APROVAR' ? 'aprovada' : 'rejeitada'} pelo GEO. Motivo: ${motivoNormalizado}`,
    metadata: { reabertura_id: reabertura.id },
    transaction
  });
  const solicitacaoPrincipalId = Number(pedido.solicitacao?.solicitacao_principal_id || 0);
  if (solicitacaoPrincipalId && reabertura.solicitado_por) {
    await criarNotificacao({
      solicitacao_id: solicitacaoPrincipalId,
      tipo: 'PEDIDO_COMPRA_REABERTURA_DECIDIDA',
      mensagem: `GEO ${decisaoNormalizada === 'APROVAR' ? 'aprovou' : 'rejeitou'} a reabertura de ${buildPedidoCodigo(pedido.id)}.`,
      metadata: {
        pedido_compra_id: pedido.id,
        reabertura_id: reabertura.id,
        decisao: decisaoNormalizada,
        motivo: motivoNormalizado
      },
      created_by: usuarioId,
      destinatarios: [Number(reabertura.solicitado_por)],
      usarDestinatariosInformados: true,
      transaction
    });
  }
  return reabertura;
}

module.exports = {
  STATUS_FLUXO,
  adotarPedidoLegado,
  aplicarResumoFinanceiroPedidos,
  buscarTitulosPedido,
  criarPrevisoesPedido,
  reparcelarPrevisoesPedido,
  decidirReaberturaGeo,
  derivarStatusFinanceiro,
  liberarTitulosPedido,
  obterResumoFinanceiroPedido,
  registrarDocumentoFinanceiro,
  sincronizarStatusFinanceiroPedidos,
  sincronizarPedidoFinanceiroAoFechar,
  solicitarReaberturaGeo
};
