const { Op, col, where: sequelizeWhere } = require('sequelize');
const {
  CategoriaFinanceira,
  ConciliacaoBancaria,
  ContaBancaria,
  ContratoComercialParcela,
  EmpresaGrupo,
  MovimentoFinanceiro,
  ObraCustoHistorico,
  Obra,
  Parceiro,
  PedidoCompra,
  PedidoCompraFrete,
  PedidoCompraFreteRateio,
  sequelize,
  TransferenciaFinanceira,
  User,
  TituloFinanceiro
} = require('../models');
const {
  canAccessFinanceiro,
  getFinanceiroObraScopeIds
} = require('./authorizationService');
const { registrarEventoSeguranca } = require('./securityLogService');
const { isCategoriaRedutora } = require('../constants/dreCategorias');
const { columnExists, tableExists } = require('../database/schemaUtils');

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function toDateOnly(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDateOnly(dateString) {
  const [year, month, day] = String(dateString || '')
    .split('-')
    .map((value) => Number(value));

  return new Date(year, (month || 1) - 1, day || 1);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function addDays(date, days) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function diffInDays(start, end) {
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endUtc - startUtc) / (24 * 60 * 60 * 1000));
}

function formatBucketLabel(date, agrupamento) {
  if (agrupamento === 'MES') {
    return `${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
  }

  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
}

function getHoje() {
  return toDateOnly(new Date());
}

function getPeriodoDescricao(periodo, inicio, fim) {
  switch (periodo) {
    case 'HOJE':
      return 'Hoje';
    case '7_DIAS':
      return 'Proximos 7 dias';
    case '30_DIAS':
      return 'Proximos 30 dias';
    case '90_DIAS':
      return 'Proximos 90 dias';
    case 'MES_ATUAL':
      return 'Mes atual';
    case 'PROXIMO_MES':
      return 'Proximo mes';
    default:
      return `${inicio} ate ${fim}`;
  }
}

async function assertFinanceAccess(req) {
  const allowed = await canAccessFinanceiro(req.user);
  if (allowed) {
    return;
  }

  await registrarEventoSeguranca({
    req,
    usuarioId: req.user?.id || null,
    tipoEvento: 'AUTHZ_DENIED',
    recursoTipo: 'FINANCEIRO_RELATORIO',
    recursoId: req.originalUrl,
    status: 'DENIED',
    descricao: 'Usuario sem permissao para acessar relatorios financeiros'
  });

  throw createHttpError(403, 'Acesso negado para o modulo financeiro');
}

async function resolveObraScope(req, obraId) {
  await assertFinanceAccess(req);

  const obrasPermitidas = await getFinanceiroObraScopeIds(req.user);
  if (obrasPermitidas === null) {
    return obraId ? { obra_id: Number(obraId) } : {};
  }

  if (!obrasPermitidas.length) {
    if (obraId) {
      await registrarEventoSeguranca({
        req,
        usuarioId: req.user?.id || null,
        tipoEvento: 'AUTHZ_DENIED',
        recursoTipo: 'FINANCEIRO_RELATORIO',
        recursoId: String(obraId),
        status: 'DENIED',
        descricao: 'Usuario tentou acessar relatorio financeiro sem vinculo de obra',
        metadata: {
          obra_id: Number(obraId) || null
        }
      });
      throw createHttpError(403, 'Acesso negado para esta obra');
    }

    return null;
  }

  if (obraId) {
    const obraIdNumber = Number(obraId);
    if (!obrasPermitidas.includes(obraIdNumber)) {
      await registrarEventoSeguranca({
        req,
        usuarioId: req.user?.id || null,
        tipoEvento: 'AUTHZ_DENIED',
        recursoTipo: 'FINANCEIRO_RELATORIO',
        recursoId: String(obraIdNumber),
        status: 'DENIED',
        descricao: 'Usuario tentou acessar relatorio financeiro fora do seu escopo de obra',
        metadata: {
          obra_id: obraIdNumber
        }
      });
      throw createHttpError(403, 'Acesso negado para esta obra');
    }

    return { obra_id: obraIdNumber };
  }

  return {
    obra_id: {
      [Op.in]: obrasPermitidas
    }
  };
}

function resolvePeriodo(filters = {}, options = {}) {
  const maxDays = options.maxDays === undefined ? null : options.maxDays;
  const hoje = parseDateOnly(getHoje());
  const preset = String(filters.periodo || '').trim().toUpperCase();
  const hasCustomDates = Boolean(filters.data_inicial && filters.data_final);
  const periodo = hasCustomDates ? 'PERSONALIZADO' : (preset || 'MES_ATUAL');
  let inicio;
  let fim;

  if (periodo === 'PERSONALIZADO') {
    if (!filters.data_inicial || !filters.data_final) {
      throw createHttpError(400, 'Informe data inicial e data final para o periodo personalizado.');
    }

    inicio = parseDateOnly(filters.data_inicial);
    fim = parseDateOnly(filters.data_final);
  } else if (periodo === 'HOJE') {
    inicio = hoje;
    fim = hoje;
  } else if (periodo === '7_DIAS') {
    inicio = hoje;
    fim = addDays(hoje, 6);
  } else if (periodo === '30_DIAS') {
    inicio = hoje;
    fim = addDays(hoje, 29);
  } else if (periodo === '90_DIAS') {
    inicio = hoje;
    fim = addDays(hoje, 89);
  } else if (periodo === 'PROXIMO_MES') {
    inicio = startOfMonth(addMonths(hoje, 1));
    fim = endOfMonth(inicio);
  } else {
    inicio = startOfMonth(hoje);
    fim = endOfMonth(hoje);
  }

  const intervaloDias = diffInDays(inicio, fim);
  if (intervaloDias < 0) {
    throw createHttpError(400, 'Data inicial nao pode ser maior que a data final.');
  }

  if (maxDays && intervaloDias > maxDays) {
    throw createHttpError(400, `O periodo maximo do relatorio deve ser de ate ${maxDays} dias.`);
  }

  const agrupamento = intervaloDias > 62 ? 'MES' : 'DIA';

  return {
    periodo,
    data_inicial: toDateOnly(inicio),
    data_final: toDateOnly(fim),
    descricao: getPeriodoDescricao(periodo, toDateOnly(inicio), toDateOnly(fim)),
    agrupamento
  };
}

function createBuckets(periodo) {
  const buckets = [];
  const start = parseDateOnly(periodo.data_inicial);
  const end = parseDateOnly(periodo.data_final);

  if (periodo.agrupamento === 'MES') {
    let cursor = startOfMonth(start);
    const endCursor = startOfMonth(end);

    while (cursor <= endCursor) {
      const key = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}`;
      buckets.push({
        key,
        referencia: key,
        label: formatBucketLabel(cursor, 'MES'),
        entradas_previstas: 0,
        saidas_previstas: 0,
        saldo_previsto: 0,
        saldo_previsto_acumulado: 0,
        entradas_realizadas: 0,
        saidas_realizadas: 0,
        juros_realizados: 0,
        multa_realizada: 0,
        desconto_realizado: 0,
        saldo_realizado: 0,
        saldo_realizado_acumulado: 0
      });
      cursor = addMonths(cursor, 1);
    }

    return buckets;
  }

  let cursor = start;
  while (cursor <= end) {
    const key = toDateOnly(cursor);
    buckets.push({
      key,
      referencia: key,
      label: formatBucketLabel(cursor, 'DIA'),
      entradas_previstas: 0,
      saidas_previstas: 0,
      saldo_previsto: 0,
      saldo_previsto_acumulado: 0,
      entradas_realizadas: 0,
      saidas_realizadas: 0,
      juros_realizados: 0,
      multa_realizada: 0,
      desconto_realizado: 0,
      saldo_realizado: 0,
      saldo_realizado_acumulado: 0
    });
    cursor = addDays(cursor, 1);
  }

  return buckets;
}

function getBucketKey(dateString, agrupamento) {
  if (agrupamento === 'MES') {
    const date = parseDateOnly(dateString);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
  }

  return String(dateString);
}

function roundCurrency(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function isTituloComercialPermuta(titulo = {}) {
  const parcelas = Array.isArray(titulo?.parcelasComerciais)
    ? titulo.parcelasComerciais
    : [];
  return parcelas.some((parcela) => (
    String(parcela?.forma_recebimento_prevista || '').trim().toUpperCase() === 'PERMUTA'
    || String(parcela?.periodicidade || '').trim().toUpperCase() === 'PERMUTA'
  ));
}

function isFluxoCaixaPermuta(item = {}) {
  return String(item?.forma_recebimento || '').trim().toUpperCase() === 'PERMUTA'
    || Boolean(String(item?.tipo_permuta || '').trim())
    || isTituloComercialPermuta(item?.titulo || item);
}

function limitarDataFinalRealizados(periodo, hoje = getHoje()) {
  return String(periodo.data_final) < String(hoje) ? periodo.data_final : hoje;
}

async function carregarTitulosPrevistos(periodo, obraWhere) {
  if (obraWhere === null) {
    return [];
  }

  const where = applyIntercompanyExclusion({
    status: {
      [Op.in]: ['PREVISAO', 'ABERTO', 'PARCIAL']
    },
    valor_saldo: {
      [Op.gt]: 0
    },
    data_vencimento: {
      [Op.between]: [periodo.data_inicial, periodo.data_final]
    },
    ...obraWhere
  }, true);

  return TituloFinanceiro.findAll({
    attributes: ['id', 'tipo', 'data_vencimento', 'valor_saldo', 'intercompany', 'elimina_consolidado'],
    where,
    include: [{
      model: ContratoComercialParcela,
      as: 'parcelasComerciais',
      attributes: ['forma_recebimento_prevista', 'periodicidade'],
      required: false
    }]
  });
}

async function carregarMovimentosRealizados(periodo, obraWhere) {
  if (obraWhere === null) {
    return [];
  }

  const dataFinalRealizados = limitarDataFinalRealizados(periodo);
  if (String(periodo.data_inicial) > String(dataFinalRealizados)) {
    return [];
  }

  const tituloWhere = applyIntercompanyExclusion(
    obraWhere && obraWhere.obra_id ? { obra_id: obraWhere.obra_id } : {},
    true
  );

  return MovimentoFinanceiro.findAll({
    attributes: [
      'id',
      'data_movimento',
      'valor_quitacao',
      'juros',
      'multa',
      'desconto',
      'forma_recebimento',
      'tipo_permuta'
    ],
    where: {
      status: 'ATIVO',
      data_movimento: {
        [Op.between]: [periodo.data_inicial, dataFinalRealizados]
      }
    },
    include: [
      {
        model: TituloFinanceiro,
        as: 'titulo',
        attributes: ['id', 'tipo', 'intercompany', 'elimina_consolidado'],
        required: true,
        where: tituloWhere,
        include: [{
          model: ContratoComercialParcela,
          as: 'parcelasComerciais',
          attributes: ['forma_recebimento_prevista', 'periodicidade'],
          required: false
        }]
      }
    ],
    raw: false
  });
}

function acumularSerie({ buckets, previstos, realizados, agrupamento }) {
  const bucketsMap = new Map(buckets.map((item) => [item.key, item]));

  previstos.forEach((item) => {
    const key = getBucketKey(item.data_vencimento, agrupamento);
    const bucket = bucketsMap.get(key);
    if (!bucket) {
      return;
    }

    const valor = roundCurrency(item.valor_saldo);
    if (String(item.tipo || '').toUpperCase() === 'RECEBER') {
      bucket.entradas_previstas = roundCurrency(bucket.entradas_previstas + valor);
    } else {
      bucket.saidas_previstas = roundCurrency(bucket.saidas_previstas + valor);
    }
  });

  realizados.forEach((item) => {
    const key = getBucketKey(item.data_movimento, agrupamento);
    const bucket = bucketsMap.get(key);
    if (!bucket) {
      return;
    }

    const valor = roundCurrency(item.valor_quitacao);
    const juros = roundCurrency(item.juros);
    const multa = roundCurrency(item.multa);
    const desconto = roundCurrency(item.desconto);
    if (String(item.titulo?.tipo || '').toUpperCase() === 'RECEBER') {
      bucket.entradas_realizadas = roundCurrency(bucket.entradas_realizadas + valor);
    } else {
      bucket.saidas_realizadas = roundCurrency(bucket.saidas_realizadas + valor);
    }

    bucket.juros_realizados = roundCurrency(bucket.juros_realizados + juros);
    bucket.multa_realizada = roundCurrency(bucket.multa_realizada + multa);
    bucket.desconto_realizado = roundCurrency(bucket.desconto_realizado + desconto);
  });

  let saldoPrevistoAcumulado = 0;
  let saldoRealizadoAcumulado = 0;

  buckets.forEach((bucket) => {
    bucket.saldo_previsto = roundCurrency(bucket.entradas_previstas - bucket.saidas_previstas);
    bucket.saldo_realizado = roundCurrency(bucket.entradas_realizadas - bucket.saidas_realizadas);
    saldoPrevistoAcumulado = roundCurrency(saldoPrevistoAcumulado + bucket.saldo_previsto);
    saldoRealizadoAcumulado = roundCurrency(saldoRealizadoAcumulado + bucket.saldo_realizado);
    bucket.saldo_previsto_acumulado = saldoPrevistoAcumulado;
    bucket.saldo_realizado_acumulado = saldoRealizadoAcumulado;
  });

  return buckets;
}

function montarResumo({ previstos, realizados, serie }) {
  const resumo = {
    entradas_previstas: 0,
    saidas_previstas: 0,
    saldo_previsto: 0,
    entradas_realizadas: 0,
    saidas_realizadas: 0,
    juros_realizados: 0,
    multa_realizada: 0,
    desconto_realizado: 0,
    saldo_realizado: 0,
    titulos_previstos: previstos.length,
    movimentos_realizados: realizados.length
  };

  serie.forEach((item) => {
    resumo.entradas_previstas = roundCurrency(resumo.entradas_previstas + item.entradas_previstas);
    resumo.saidas_previstas = roundCurrency(resumo.saidas_previstas + item.saidas_previstas);
    resumo.entradas_realizadas = roundCurrency(resumo.entradas_realizadas + item.entradas_realizadas);
    resumo.saidas_realizadas = roundCurrency(resumo.saidas_realizadas + item.saidas_realizadas);
    resumo.juros_realizados = roundCurrency(resumo.juros_realizados + item.juros_realizados);
    resumo.multa_realizada = roundCurrency(resumo.multa_realizada + item.multa_realizada);
    resumo.desconto_realizado = roundCurrency(resumo.desconto_realizado + item.desconto_realizado);
  });

  resumo.saldo_previsto = roundCurrency(resumo.entradas_previstas - resumo.saidas_previstas);
  resumo.saldo_realizado = roundCurrency(resumo.entradas_realizadas - resumo.saidas_realizadas);
  resumo.variacao_realizado_vs_previsto = roundCurrency(resumo.saldo_realizado - resumo.saldo_previsto);

  return resumo;
}

async function gerarRelatorioFluxoCaixa(req, filters = {}) {
  const periodo = resolvePeriodo(filters);
  const obraWhere = await resolveObraScope(req, filters.obra_id);
  const [previstos, realizados] = await Promise.all([
    carregarTitulosPrevistos(periodo, obraWhere),
    carregarMovimentosRealizados(periodo, obraWhere)
  ]);
  const previstosMonetarios = previstos.filter((item) => !isFluxoCaixaPermuta(item));
  const realizadosMonetarios = realizados.filter((item) => !isFluxoCaixaPermuta(item));

  const serie = acumularSerie({
    buckets: createBuckets(periodo),
    previstos: previstosMonetarios,
    realizados: realizadosMonetarios,
    agrupamento: periodo.agrupamento
  });

  return {
    filtro: {
      periodo: periodo.periodo,
      descricao: periodo.descricao,
      data_inicial: periodo.data_inicial,
      data_final: periodo.data_final,
      agrupamento: periodo.agrupamento,
      obra_id: filters.obra_id ? Number(filters.obra_id) : null
    },
    resumo: montarResumo({
      previstos: previstosMonetarios,
      realizados: realizadosMonetarios,
      serie
    }),
    serie
  };
}

function buildFluxoCompanyWhere(filters = {}, empresas = []) {
  if (filters.empresa_id) {
    return { empresa_id: Number(filters.empresa_id) };
  }

  const empresaIdsHolding = getEmpresaIdsDaHolding(empresas, filters.holding_id);
  if (empresaIdsHolding) {
    return { empresa_id: { [Op.in]: empresaIdsHolding } };
  }

  return {};
}

function applyIntercompanyExclusion(where, excluirIntercompany) {
  if (excluirIntercompany === false) {
    return where;
  }

  const andConditions = Array.isArray(where[Op.and]) ? where[Op.and] : [];
  return {
    ...where,
    [Op.and]: [
      ...andConditions,
      {
        [Op.or]: [
          { intercompany: false },
          { elimina_consolidado: false }
        ]
      }
    ]
  };
}

function getEmpresaFluxoLabel(empresaId, empresasById, vazioLabel) {
  if (!empresaId) return vazioLabel;
  const empresa = empresasById.get(Number(empresaId));
  return empresa?.nome || empresa?.razao_social || `Empresa #${empresaId}`;
}

function emptyFluxoEmpresa(empresaId, empresasById, vazioLabel) {
  return {
    empresa_id: empresaId || null,
    empresa_nome: getEmpresaFluxoLabel(empresaId, empresasById, vazioLabel),
    entradas_previstas: 0,
    saidas_previstas: 0,
    saldo_previsto: 0,
    entradas_realizadas: 0,
    saidas_realizadas: 0,
    saldo_realizado: 0,
    titulos_previstos: 0,
    movimentos_realizados: 0
  };
}

function emptyFluxoObra(obraId, obrasById, vazioLabel) {
  const obra = obraId ? obrasById.get(Number(obraId)) : null;
  return {
    obra_id: obraId || null,
    obra_nome: obra?.nome || vazioLabel,
    obra_codigo: obra?.codigo || null,
    tipo_centro_custo: obra?.tipo_centro_custo || null,
    empresa_grupo_id: obra?.empresa_grupo_id || null,
    entradas_previstas: 0,
    saidas_previstas: 0,
    saldo_previsto: 0,
    entradas_realizadas: 0,
    saidas_realizadas: 0,
    saldo_realizado: 0,
    titulos_previstos: 0,
    movimentos_realizados: 0
  };
}

function addFluxoEmpresa(map, empresaId, empresasById, vazioLabel, tipo, valor, origem) {
  const key = empresaId ? String(empresaId) : vazioLabel;
  if (!map.has(key)) {
    map.set(key, emptyFluxoEmpresa(empresaId, empresasById, vazioLabel));
  }

  const item = map.get(key);
  const amount = roundCurrency(valor);
  const isReceber = String(tipo || '').toUpperCase() === 'RECEBER';

  if (origem === 'PREVISTO') {
    if (isReceber) {
      item.entradas_previstas = roundCurrency(item.entradas_previstas + amount);
    } else {
      item.saidas_previstas = roundCurrency(item.saidas_previstas + amount);
    }
    item.titulos_previstos += 1;
  } else {
    if (isReceber) {
      item.entradas_realizadas = roundCurrency(item.entradas_realizadas + amount);
    } else {
      item.saidas_realizadas = roundCurrency(item.saidas_realizadas + amount);
    }
    item.movimentos_realizados += 1;
  }

  item.saldo_previsto = roundCurrency(item.entradas_previstas - item.saidas_previstas);
  item.saldo_realizado = roundCurrency(item.entradas_realizadas - item.saidas_realizadas);

  return item;
}

function addFluxoObra(map, obraId, obrasById, vazioLabel, tipo, valor, origem) {
  const key = obraId ? String(obraId) : vazioLabel;
  if (!map.has(key)) {
    map.set(key, emptyFluxoObra(obraId, obrasById, vazioLabel));
  }

  const item = map.get(key);
  const amount = roundCurrency(valor);
  const isReceber = String(tipo || '').toUpperCase() === 'RECEBER';

  if (origem === 'PREVISTO') {
    if (isReceber) {
      item.entradas_previstas = roundCurrency(item.entradas_previstas + amount);
    } else {
      item.saidas_previstas = roundCurrency(item.saidas_previstas + amount);
    }
    item.titulos_previstos += 1;
  } else {
    if (isReceber) {
      item.entradas_realizadas = roundCurrency(item.entradas_realizadas + amount);
    } else {
      item.saidas_realizadas = roundCurrency(item.saidas_realizadas + amount);
    }
    item.movimentos_realizados += 1;
  }

  item.saldo_previsto = roundCurrency(item.entradas_previstas - item.saidas_previstas);
  item.saldo_realizado = roundCurrency(item.entradas_realizadas - item.saidas_realizadas);

  return item;
}

async function carregarTitulosFluxoConsolidado(periodo, tituloScopeWhere) {
  return TituloFinanceiro.findAll({
    attributes: [
      'id',
      'codigo',
      'tipo',
      'status',
      'empresa_id',
      'obra_id',
      'data_vencimento',
      'valor_saldo',
      'intercompany',
      'elimina_consolidado',
      'empresa_origem_id',
      'empresa_destino_id',
      'tipo_intercompany'
    ],
    where: {
      status: {
        [Op.in]: ['PREVISAO', 'ABERTO', 'PARCIAL']
      },
      valor_saldo: {
        [Op.gt]: 0
      },
      data_vencimento: {
        [Op.between]: [periodo.data_inicial, periodo.data_final]
      },
      ...tituloScopeWhere
    },
    raw: true
  });
}

async function carregarMovimentosFluxoConsolidado(periodo, tituloScopeWhere, movimentoScopeWhere = {}) {
  return MovimentoFinanceiro.findAll({
    attributes: ['id', 'empresa_id', 'data_movimento', 'valor_quitacao'],
    where: {
      status: 'ATIVO',
      data_movimento: {
        [Op.between]: [periodo.data_inicial, periodo.data_final]
      },
      ...movimentoScopeWhere
    },
    include: [
      {
        model: TituloFinanceiro,
        as: 'titulo',
        attributes: [
          'id',
          'tipo',
          'empresa_id',
          'obra_id',
          'intercompany',
          'elimina_consolidado',
          'empresa_origem_id',
          'empresa_destino_id',
          'tipo_intercompany'
        ],
        required: true,
        where: tituloScopeWhere
      }
    ],
    raw: false
  });
}

function summarizeFluxoObras({ previstos, realizados, obras }) {
  const obrasById = new Map(obras.map((obra) => [Number(obra.id), obra]));
  const obrasMap = new Map();
  const vazioTitulo = 'SEM_OBRA_TITULO';
  const vazioBaixa = 'SEM_OBRA_BAIXA';

  for (const titulo of previstos) {
    addFluxoObra(
      obrasMap,
      titulo.obra_id,
      obrasById,
      vazioTitulo,
      titulo.tipo,
      titulo.valor_saldo,
      'PREVISTO'
    );
  }

  for (const movimento of realizados) {
    const titulo = movimento.titulo || {};
    addFluxoObra(
      obrasMap,
      titulo.obra_id,
      obrasById,
      vazioBaixa,
      titulo.tipo,
      movimento.valor_quitacao,
      'REALIZADO'
    );
  }

  return Array.from(obrasMap.values())
    .map((item) => ({
      ...item,
      variacao_realizado_vs_previsto: roundCurrency(item.saldo_realizado - item.saldo_previsto)
    }))
    .sort((a, b) => Math.abs(Number(b.saldo_previsto || 0)) - Math.abs(Number(a.saldo_previsto || 0)));
}

function buildFluxoConsolidadoAlert({ codigo, severidade, titulo, descricao, valor = null, acao, rota = null }) {
  return {
    codigo,
    severidade,
    titulo,
    descricao,
    valor: valor == null ? null : roundCurrency(valor),
    acao,
    rota
  };
}

function summarizeFluxoConsolidadoInsights({ resumo, empresasResumo, obrasResumo, serie }) {
  const alertas = [];
  const piorPeriodo = serie.reduce((pior, item) => {
    if (!pior) return item;
    return Number(item.saldo_previsto_acumulado || 0) < Number(pior.saldo_previsto_acumulado || 0) ? item : pior;
  }, null);
  const necessidadeFuturaCaixa = piorPeriodo && Number(piorPeriodo.saldo_previsto_acumulado || 0) < 0
    ? Math.abs(roundCurrency(piorPeriodo.saldo_previsto_acumulado))
    : 0;
  const empresasNegativas = empresasResumo.filter((empresa) => Number(empresa.saldo_previsto || 0) < 0);
  const obrasNegativas = obrasResumo.filter((obra) => Number(obra.saldo_previsto || 0) < 0);
  const empresasSemVinculo = empresasResumo.filter((empresa) => !empresa.empresa_id);
  const obrasSemVinculo = obrasResumo.filter((obra) => !obra.obra_id);

  if (necessidadeFuturaCaixa > 0) {
    alertas.push(buildFluxoConsolidadoAlert({
      codigo: 'NECESSIDADE_FUTURA_CAIXA',
      severidade: 'ALTA',
      titulo: 'Necessidade futura de caixa no periodo',
      descricao: `O menor saldo previsto acumulado ocorre em ${piorPeriodo.label}.`,
      valor: necessidadeFuturaCaixa,
      acao: 'Revisar recebimentos previstos, pagamentos concentrados e necessidade de cobertura financeira real.'
    }));
  }

  if (empresasNegativas.length > 0) {
    const total = empresasNegativas.reduce((sum, empresa) => sum + Math.abs(Number(empresa.saldo_previsto || 0)), 0);
    alertas.push(buildFluxoConsolidadoAlert({
      codigo: 'EMPRESAS_SALDO_PREVISTO_NEGATIVO',
      severidade: empresasNegativas.length > 2 ? 'ALTA' : 'MEDIA',
      titulo: 'Empresas com saldo previsto negativo',
      descricao: `${empresasNegativas.length} empresa(s) apresentam mais saidas previstas do que entradas previstas no periodo.`,
      valor: total,
      acao: 'Abrir a tabela por empresa e confirmar se o descasamento sera coberto por caixa proprio ou movimentacao entre empresas formal.'
    }));
  }

  if (obrasNegativas.length > 0) {
    const total = obrasNegativas.reduce((sum, obra) => sum + Math.abs(Number(obra.saldo_previsto || 0)), 0);
    alertas.push(buildFluxoConsolidadoAlert({
      codigo: 'OBRAS_SALDO_PREVISTO_NEGATIVO',
      severidade: obrasNegativas.length > 3 ? 'ALTA' : 'MEDIA',
      titulo: 'Obras/Centros consumindo caixa previsto',
      descricao: `${obrasNegativas.length} obra(s) ou centro(s) apresentam saldo previsto negativo no periodo.`,
      valor: total,
      acao: 'Revisar cronograma de recebimentos, pedidos, contratos e pagamentos vinculados ao centro de custo.'
    }));
  }

  if (empresasSemVinculo.length > 0) {
    alertas.push(buildFluxoConsolidadoAlert({
      codigo: 'FLUXO_SEM_EMPRESA',
      severidade: 'ALTA',
      titulo: 'Fluxo com empresa ausente',
      descricao: 'Existem titulos ou baixas sem empresa explicita no fluxo consolidado.',
      acao: 'Corrigir empresa no titulo ou na baixa. O sistema nao deve deduzir empresa para relatorio executivo.'
    }));
  }

  if (obrasSemVinculo.length > 0) {
    alertas.push(buildFluxoConsolidadoAlert({
      codigo: 'FLUXO_SEM_OBRA_CENTRO_CUSTO',
      severidade: 'MEDIA',
      titulo: 'Fluxo sem obra/centro de custo',
      descricao: 'Existem titulos ou baixas sem obra/centro de custo vinculados.',
      acao: 'Revisar o cadastro quando a movimentacao precisar aparecer em relatorios por obra ou centro de custo.'
    }));
  }

  return {
    indicadores: {
      necessidade_futura_caixa: roundCurrency(necessidadeFuturaCaixa),
      pior_periodo_previsto: piorPeriodo ? {
        referencia: piorPeriodo.referencia,
        label: piorPeriodo.label,
        saldo_previsto_acumulado: roundCurrency(piorPeriodo.saldo_previsto_acumulado || 0)
      } : null,
      empresas_saldo_previsto_negativo: empresasNegativas.length,
      obras_saldo_previsto_negativo: obrasNegativas.length,
      empresas_sem_vinculo: empresasSemVinculo.length,
      obras_sem_vinculo: obrasSemVinculo.length
    },
    alertas
  };
}

function summarizeFluxoConsolidado({ previstos, realizados, empresas, obras, serie }) {
  const empresasById = new Map(empresas.map((empresa) => [Number(empresa.id), empresa]));
  const empresasMap = new Map();
  const vazioTitulo = 'SEM_EMPRESA_TITULO';
  const vazioBaixa = 'SEM_EMPRESA_BAIXA';
  const intercompany = {
    previsto_eliminado: 0,
    realizado_eliminado: 0,
    titulos_eliminados: 0,
    movimentos_eliminados: 0
  };

  for (const titulo of previstos) {
    const valor = roundCurrency(titulo.valor_saldo);
    addFluxoEmpresa(empresasMap, titulo.empresa_id, empresasById, vazioTitulo, titulo.tipo, valor, 'PREVISTO');

    if (titulo.intercompany === true && titulo.elimina_consolidado === true) {
      intercompany.previsto_eliminado = roundCurrency(intercompany.previsto_eliminado + valor);
      intercompany.titulos_eliminados += 1;
    }
  }

  for (const movimento of realizados) {
    const valor = roundCurrency(movimento.valor_quitacao);
    const titulo = movimento.titulo || {};
    addFluxoEmpresa(empresasMap, movimento.empresa_id, empresasById, vazioBaixa, titulo.tipo, valor, 'REALIZADO');

    if (titulo.intercompany === true && titulo.elimina_consolidado === true) {
      intercompany.realizado_eliminado = roundCurrency(intercompany.realizado_eliminado + valor);
      intercompany.movimentos_eliminados += 1;
    }
  }

  const empresasResumo = Array.from(empresasMap.values())
    .map((item) => ({
      ...item,
      variacao_realizado_vs_previsto: roundCurrency(item.saldo_realizado - item.saldo_previsto)
    }))
    .sort((a, b) => Math.abs(Number(b.saldo_previsto || 0)) - Math.abs(Number(a.saldo_previsto || 0)));

  const resumo = empresasResumo.reduce((acc, item) => ({
    entradas_previstas: roundCurrency(acc.entradas_previstas + item.entradas_previstas),
    saidas_previstas: roundCurrency(acc.saidas_previstas + item.saidas_previstas),
    saldo_previsto: roundCurrency(acc.saldo_previsto + item.saldo_previsto),
    entradas_realizadas: roundCurrency(acc.entradas_realizadas + item.entradas_realizadas),
    saidas_realizadas: roundCurrency(acc.saidas_realizadas + item.saidas_realizadas),
    saldo_realizado: roundCurrency(acc.saldo_realizado + item.saldo_realizado),
    titulos_previstos: acc.titulos_previstos + item.titulos_previstos,
    movimentos_realizados: acc.movimentos_realizados + item.movimentos_realizados
  }), {
    entradas_previstas: 0,
    saidas_previstas: 0,
    saldo_previsto: 0,
    entradas_realizadas: 0,
    saidas_realizadas: 0,
    saldo_realizado: 0,
    titulos_previstos: 0,
    movimentos_realizados: 0
  });

  resumo.variacao_realizado_vs_previsto = roundCurrency(resumo.saldo_realizado - resumo.saldo_previsto);
  const obrasResumo = summarizeFluxoObras({ previstos, realizados, obras });
  const insights = summarizeFluxoConsolidadoInsights({ resumo, empresasResumo, obrasResumo, serie });

  return {
    resumo: {
      ...resumo,
      ...insights.indicadores,
      empresas_com_movimento: empresasResumo.length,
      obras_com_movimento: obrasResumo.length,
      intercompany_previsto_eliminado: intercompany.previsto_eliminado,
      intercompany_realizado_eliminado: intercompany.realizado_eliminado,
      intercompany_titulos_eliminados: intercompany.titulos_eliminados,
      intercompany_movimentos_eliminados: intercompany.movimentos_eliminados
    },
    alertas: insights.alertas,
    empresas: empresasResumo,
    obras: obrasResumo
  };
}

async function gerarRelatorioFluxoConsolidado(req, filters = {}) {
  const periodo = resolvePeriodo(filters);
  const obraWhere = await resolveObraScope(req, filters.obra_id);
  const empresas = await EmpresaGrupo.findAll({
    attributes: ['id', 'codigo', 'nome', 'razao_social', 'tipo_empresa', 'tipo_gerencial', 'holding_id'],
    order: [['tipo_empresa', 'ASC'], ['nome', 'ASC']]
  });

  if (obraWhere === null) {
    return {
      filtro: {
        periodo: periodo.periodo,
        descricao: periodo.descricao,
        data_inicial: periodo.data_inicial,
        data_final: periodo.data_final,
        agrupamento: periodo.agrupamento,
        holding_id: filters.holding_id ? Number(filters.holding_id) : null,
        empresa_id: filters.empresa_id ? Number(filters.empresa_id) : null,
        obra_id: filters.obra_id ? Number(filters.obra_id) : null,
        excluir_intercompany: filters.excluir_intercompany !== false
      },
      resumo: {
        entradas_previstas: 0,
        saidas_previstas: 0,
        saldo_previsto: 0,
        entradas_realizadas: 0,
        saidas_realizadas: 0,
        saldo_realizado: 0,
        variacao_realizado_vs_previsto: 0,
        empresas_com_movimento: 0,
        titulos_previstos: 0,
        movimentos_realizados: 0,
        intercompany_previsto_eliminado: 0,
        intercompany_realizado_eliminado: 0,
        necessidade_futura_caixa: 0,
        pior_periodo_previsto: null,
        empresas_saldo_previsto_negativo: 0,
        obras_saldo_previsto_negativo: 0
      },
      alertas: [],
      serie: [],
      empresas: [],
      obras: []
    };
  }

  const companyScopeWhere = buildFluxoCompanyWhere(filters, empresas);
  const tituloScopeWhere = applyIntercompanyExclusion({
    ...obraWhere,
    ...companyScopeWhere
  }, filters.excluir_intercompany);
  const movimentoTituloScopeWhere = applyIntercompanyExclusion({
    ...obraWhere
  }, filters.excluir_intercompany);

  const [previstos, realizados] = await Promise.all([
    carregarTitulosFluxoConsolidado(periodo, tituloScopeWhere),
    carregarMovimentosFluxoConsolidado(periodo, movimentoTituloScopeWhere, companyScopeWhere)
  ]);

  const serie = acumularSerie({
    buckets: createBuckets(periodo),
    previstos,
    realizados,
    agrupamento: periodo.agrupamento
  });
  const obraIds = new Set();
  previstos.forEach((titulo) => {
    if (titulo.obra_id) obraIds.add(Number(titulo.obra_id));
  });
  realizados.forEach((movimento) => {
    const obraId = movimento.titulo?.obra_id;
    if (obraId) obraIds.add(Number(obraId));
  });
  const obras = obraIds.size
    ? await Obra.findAll({
        attributes: ['id', 'codigo', 'nome', 'tipo_centro_custo', 'empresa_grupo_id'],
        where: { id: { [Op.in]: Array.from(obraIds) } },
        raw: true
      })
    : [];

  return {
    filtro: {
      periodo: periodo.periodo,
      descricao: periodo.descricao,
      data_inicial: periodo.data_inicial,
      data_final: periodo.data_final,
      agrupamento: periodo.agrupamento,
      holding_id: filters.holding_id ? Number(filters.holding_id) : null,
      empresa_id: filters.empresa_id ? Number(filters.empresa_id) : null,
      obra_id: filters.obra_id ? Number(filters.obra_id) : null,
      excluir_intercompany: filters.excluir_intercompany !== false
    },
    ...summarizeFluxoConsolidado({ previstos, realizados, empresas, obras, serie }),
    serie
  };
}

async function gerarRelatorioAnalitico(req, filters = {}) {
  const obraWhere = await resolveObraScope(req, filters.obra_id);
  if (obraWhere === null) {
    return {
      filtros: filters,
      resumo: {
        quantidade_linhas: 0,
        titulos: 0,
        movimentos: 0,
        total_original: 0,
        total_saldo: 0,
        total_baixado: 0,
        total_quitacao: 0,
        total_juros: 0,
        total_multa: 0,
        total_desconto: 0
      },
      linhas: []
    };
  }

  const tituloWhere = {
    ...obraWhere
  };
  const movimentoWhere = {};

  if (filters.tipo) {
    tituloWhere.tipo = filters.tipo;
  }
  if (filters.status_titulo) {
    tituloWhere.status = filters.status_titulo;
  }
  if (filters.parceiro_id) {
    tituloWhere.parceiro_id = Number(filters.parceiro_id);
  }
  if (filters.categoria_financeira_id) {
    tituloWhere.categoria_financeira_id = Number(filters.categoria_financeira_id);
  }
  if (filters.vencimento_inicial || filters.vencimento_final) {
    tituloWhere.data_vencimento = {};
    if (filters.vencimento_inicial) {
      tituloWhere.data_vencimento[Op.gte] = filters.vencimento_inicial;
    }
    if (filters.vencimento_final) {
      tituloWhere.data_vencimento[Op.lte] = filters.vencimento_final;
    }
  }
  if (filters.q) {
    const term = String(filters.q).trim();
    tituloWhere[Op.or] = [
      { codigo: { [Op.like]: `%${term}%` } },
      { descricao: { [Op.like]: `%${term}%` } },
      { numero_documento: { [Op.like]: `%${term}%` } },
      { '$parceiro.nome$': { [Op.like]: `%${term}%` } },
      { '$parceiro.cpf_cnpj$': { [Op.like]: `%${term}%` } },
      { '$obra.nome$': { [Op.like]: `%${term}%` } },
      { '$obra.codigo$': { [Op.like]: `%${term}%` } }
    ];
  }

  const statusMovimento = String(filters.status_movimento || 'TODOS').toUpperCase();
  const buscarSemBaixa = statusMovimento === 'SEM_BAIXA';
  if (statusMovimento && !['TODOS', 'SEM_BAIXA'].includes(statusMovimento)) {
    movimentoWhere.status = statusMovimento;
  }
  if (filters.conta_bancaria_id) {
    movimentoWhere.conta_bancaria_id = Number(filters.conta_bancaria_id);
  }
  if (filters.data_inicial || filters.data_final) {
    movimentoWhere.data_movimento = {};
    if (filters.data_inicial) {
      movimentoWhere.data_movimento[Op.gte] = filters.data_inicial;
    }
    if (filters.data_final) {
      movimentoWhere.data_movimento[Op.lte] = filters.data_final;
    }
  }

  const hasMovimentoFilter = Object.keys(movimentoWhere).length > 0;
  const titulos = await TituloFinanceiro.findAll({
    where: tituloWhere,
    include: [
      {
        model: Obra,
        as: 'obra',
        attributes: ['id', 'nome', 'codigo']
      },
      {
        model: Parceiro,
        as: 'parceiro',
        attributes: ['id', 'nome', 'cpf_cnpj']
      },
      {
        model: CategoriaFinanceira,
        as: 'categoriaFinanceira',
        attributes: ['id', 'nome', 'tipo']
      },
      {
        model: MovimentoFinanceiro,
        as: 'movimentos',
        required: hasMovimentoFilter && !buscarSemBaixa,
        where: hasMovimentoFilter && !buscarSemBaixa ? movimentoWhere : undefined,
        include: [
          {
            model: ContaBancaria,
            as: 'contaBancaria',
            attributes: ['id', 'nome', 'banco', 'agencia', 'conta']
          },
          {
            model: User,
            as: 'criadoPor',
            attributes: ['id', 'nome', 'email']
          }
        ]
      }
    ],
    order: [
      ['data_vencimento', 'ASC'],
      ['createdAt', 'DESC'],
      [{ model: MovimentoFinanceiro, as: 'movimentos' }, 'data_movimento', 'DESC']
    ],
    limit: Number(filters.limit || 500),
    subQuery: false
  });

  const linhas = [];
  const tituloIds = new Set();
  let movimentos = 0;
  let totalOriginal = 0;
  let totalSaldo = 0;
  let totalBaixado = 0;
  let totalQuitacao = 0;
  let totalJuros = 0;
  let totalMulta = 0;
  let totalDesconto = 0;

  titulos.forEach((tituloInstance) => {
    const titulo = typeof tituloInstance.toJSON === 'function' ? tituloInstance.toJSON() : tituloInstance;
    const movimentosOriginais = Array.isArray(titulo.movimentos) ? titulo.movimentos : [];
    if (buscarSemBaixa && movimentosOriginais.length > 0) {
      return;
    }

    const movimentosFiltrados = movimentosOriginais.filter((movimento) => {
      if (buscarSemBaixa) return false;
      if (!hasMovimentoFilter) return true;
      if (movimentoWhere.status && String(movimento.status || '').toUpperCase() !== movimentoWhere.status) return false;
      if (movimentoWhere.conta_bancaria_id && Number(movimento.conta_bancaria_id) !== Number(movimentoWhere.conta_bancaria_id)) return false;
      if (movimentoWhere.data_movimento?.[Op.gte] && movimento.data_movimento < movimentoWhere.data_movimento[Op.gte]) return false;
      if (movimentoWhere.data_movimento?.[Op.lte] && movimento.data_movimento > movimentoWhere.data_movimento[Op.lte]) return false;
      return true;
    });

    tituloIds.add(titulo.id);
    totalOriginal = roundCurrency(totalOriginal + Number(titulo.valor_original || 0));
    totalSaldo = roundCurrency(totalSaldo + Number(titulo.valor_saldo || 0));
    totalBaixado = roundCurrency(totalBaixado + Number(titulo.valor_baixado || 0));

    if (!movimentosFiltrados.length) {
      if (hasMovimentoFilter && !buscarSemBaixa) {
        return;
      }

      linhas.push({
        id: `titulo-${titulo.id}`,
        titulo_id: titulo.id,
        titulo_codigo: titulo.codigo,
        tipo: titulo.tipo,
        status_titulo: titulo.status,
        numero_documento: titulo.numero_documento,
        descricao: titulo.descricao,
        parceiro_nome: titulo.parceiro?.nome || null,
        parceiro_cpf_cnpj: titulo.parceiro?.cpf_cnpj || null,
        obra_nome: titulo.obra?.nome || null,
        obra_codigo: titulo.obra?.codigo || null,
        categoria_nome: titulo.categoriaFinanceira?.nome || null,
        data_emissao: titulo.data_emissao,
        data_vencimento: titulo.data_vencimento,
        data_movimento: null,
        conta_bancaria_nome: null,
        valor_original: Number(titulo.valor_original || 0),
        valor_saldo: Number(titulo.valor_saldo || 0),
        valor_baixado: Number(titulo.valor_baixado || 0),
        movimento_id: null,
        status_movimento: 'SEM_BAIXA',
        valor_movimento: 0,
        juros: 0,
        multa: 0,
        desconto: 0,
        valor_quitacao: 0,
        usuario_baixa: null,
        origem: titulo.solicitacao_id ? 'SOLICITACAO' : 'MANUAL'
      });
      return;
    }

    movimentosFiltrados.forEach((movimento) => {
      movimentos += 1;
      totalQuitacao = roundCurrency(totalQuitacao + Number(movimento.valor_quitacao || 0));
      totalJuros = roundCurrency(totalJuros + Number(movimento.juros || 0));
      totalMulta = roundCurrency(totalMulta + Number(movimento.multa || 0));
      totalDesconto = roundCurrency(totalDesconto + Number(movimento.desconto || 0));

      linhas.push({
        id: `movimento-${movimento.id}`,
        titulo_id: titulo.id,
        titulo_codigo: titulo.codigo,
        tipo: titulo.tipo,
        status_titulo: titulo.status,
        numero_documento: titulo.numero_documento,
        descricao: titulo.descricao,
        parceiro_nome: titulo.parceiro?.nome || null,
        parceiro_cpf_cnpj: titulo.parceiro?.cpf_cnpj || null,
        obra_nome: titulo.obra?.nome || null,
        obra_codigo: titulo.obra?.codigo || null,
        categoria_nome: titulo.categoriaFinanceira?.nome || null,
        data_emissao: titulo.data_emissao,
        data_vencimento: titulo.data_vencimento,
        data_movimento: movimento.data_movimento,
        conta_bancaria_nome: movimento.contaBancaria?.nome || null,
        valor_original: Number(titulo.valor_original || 0),
        valor_saldo: Number(titulo.valor_saldo || 0),
        valor_baixado: Number(titulo.valor_baixado || 0),
        movimento_id: movimento.id,
        status_movimento: movimento.status,
        valor_movimento: Number(movimento.valor || 0),
        juros: Number(movimento.juros || 0),
        multa: Number(movimento.multa || 0),
        desconto: Number(movimento.desconto || 0),
        valor_quitacao: Number(movimento.valor_quitacao || 0),
        usuario_baixa: movimento.criadoPor?.nome || null,
        origem: titulo.solicitacao_id ? 'SOLICITACAO' : 'MANUAL'
      });
    });
  });

  return {
    filtros: filters,
    resumo: {
      quantidade_linhas: linhas.length,
      titulos: tituloIds.size,
      movimentos,
      total_original: totalOriginal,
      total_saldo: totalSaldo,
      total_baixado: totalBaixado,
      total_quitacao: totalQuitacao,
      total_juros: totalJuros,
      total_multa: totalMulta,
      total_desconto: totalDesconto
    },
    linhas
  };
}

function normalizeFinanceiroObrasAnalise(value) {
  const analise = String(value || 'REALIZADO').toUpperCase();
  if (['REALIZADO', 'COMPROMETIDO', 'A_REALIZAR'].includes(analise)) {
    return analise;
  }
  return 'REALIZADO';
}

function buildFinanceiroObrasTituloWhere(filters, obraWhere, periodo, analise) {
  const where = {
    ...obraWhere,
    status: { [Op.notIn]: ['CANCELADO', 'ESTORNADO'] }
  };

  if (filters.tipo) {
    where.tipo = filters.tipo;
  }
  if (filters.empresa_id) {
    where.empresa_id = Number(filters.empresa_id);
  }
  if (filters.parceiro_id) {
    where.parceiro_id = Number(filters.parceiro_id);
  }
  if (filters.categoria_financeira_id) {
    where.categoria_financeira_id = Number(filters.categoria_financeira_id);
  }

  if (analise === 'A_REALIZAR') {
    where.status = { [Op.in]: ['PREVISAO', 'ABERTO', 'PARCIAL'] };
    where.valor_saldo = { [Op.gt]: 0 };
  }

  if (analise !== 'REALIZADO') {
    where.data_vencimento = {
      [Op.between]: [periodo.data_inicial, periodo.data_final]
    };
  }

  if (filters.q) {
    const term = String(filters.q).trim();
    where[Op.or] = [
      { codigo: { [Op.like]: `%${term}%` } },
      { descricao: { [Op.like]: `%${term}%` } },
      { numero_documento: { [Op.like]: `%${term}%` } },
      { linha_digitavel: { [Op.like]: `%${term}%` } },
      { codigo_barras: { [Op.like]: `%${term}%` } }
    ];
  }

  return where;
}

function getFinanceiroObrasTituloIncludes() {
  return [
    {
      model: Obra,
      as: 'obra',
      attributes: ['id', 'nome', 'codigo', 'tipo_centro_custo', 'empresa_grupo_id']
    },
    {
      model: EmpresaGrupo,
      as: 'empresa',
      attributes: ['id', 'codigo', 'nome', 'razao_social', 'cnpj']
    },
    {
      model: Parceiro,
      as: 'parceiro',
      attributes: ['id', 'nome', 'cpf_cnpj']
    },
    {
      model: CategoriaFinanceira,
      as: 'categoriaFinanceira',
      attributes: ['id', 'nome', 'tipo', 'dre_grupo', 'dre_subgrupo']
    }
  ];
}

function getTituloParcelaLabel(titulo = {}) {
  const codigo = titulo.codigo || `TIT-${titulo.id}`;
  const numeroParcela = Number(titulo.numero_parcela || 0);
  const totalParcelas = Number(titulo.total_parcelas || 0);
  if (numeroParcela > 0 && totalParcelas > 0) {
    return `${codigo}/${numeroParcela}-${totalParcelas}`;
  }
  return codigo;
}

function getPlanoFinanceiroLabel(titulo = {}) {
  const categoria = titulo.categoriaFinanceira;
  if (!categoria) return 'Sem categoria';
  return categoria.nome;
}

function getCreditoDebitoFromTitulo(titulo, valor) {
  const amount = roundCurrency(valor);
  if (String(titulo.tipo || '').toUpperCase() === 'RECEBER') {
    return { credito: amount, debito: 0 };
  }
  return { credito: 0, debito: amount };
}

function buildFinanceiroObrasLinhaBase(titulo, analise) {
  return {
    titulo_id: titulo.id,
    // ITEM 22 (23/08): a linha precisa dizer QUAL solicitacao, porque e por ela que se chega aos
    // arquivos — nem `anexos` nem `comprovantes` apontam para o titulo. Nulo aqui significa titulo
    // sem solicitacao (importado do historico, lancado a mao), e a tela avisa em vez de abrir vazio.
    solicitacao_id: titulo.solicitacao_id || null,
    titulo_codigo: titulo.codigo,
    titulo_parcela: getTituloParcelaLabel(titulo),
    tipo: titulo.tipo,
    status_titulo: titulo.status,
    documento: titulo.numero_documento || titulo.linha_digitavel || titulo.codigo_barras || null,
    descricao: titulo.descricao,
    parceiro_nome: titulo.parceiro?.nome || null,
    parceiro_cpf_cnpj: titulo.parceiro?.cpf_cnpj || null,
    obra_id: titulo.obra_id,
    obra_nome: titulo.obra?.nome || null,
    obra_codigo: titulo.obra?.codigo || null,
    empresa_id: titulo.empresa_id,
    empresa_nome: titulo.empresa?.nome || titulo.empresa?.razao_social || null,
    empresa_cnpj: titulo.empresa?.cnpj || null,
    categoria_nome: titulo.categoriaFinanceira?.nome || null,
    plano_financeiro: getPlanoFinanceiroLabel(titulo),
    data_emissao: titulo.data_emissao,
    data_vencimento: titulo.data_vencimento,
    valor_original: Number(titulo.valor_original || 0),
    valor_baixado: Number(titulo.valor_baixado || 0),
    valor_saldo: Number(titulo.valor_saldo || 0),
    analise
  };
}

function buildFinanceiroObrasLinhaTitulo(titulo, analise) {
  const valorBase = analise === 'A_REALIZAR'
    ? Number(titulo.valor_saldo || 0)
    : Number(titulo.valor_original || 0);
  const { credito, debito } = getCreditoDebitoFromTitulo(titulo, valorBase);

  return {
    id: `titulo-${titulo.id}-${analise}`,
    ...buildFinanceiroObrasLinhaBase(titulo, analise),
    data_baixa: null,
    movimento_id: null,
    status_movimento: null,
    conta_bancaria_nome: null,
    credito,
    debito,
    saldo: 0
  };
}

function buildFinanceiroObrasLinhaMovimento(movimento) {
  const titulo = movimento.titulo || {};
  const valorBase = Number(movimento.valor_quitacao || movimento.valor || 0);
  const { credito, debito } = getCreditoDebitoFromTitulo(titulo, valorBase);

  return {
    id: `movimento-${movimento.id}`,
    ...buildFinanceiroObrasLinhaBase(titulo, 'REALIZADO'),
    data_baixa: movimento.data_movimento,
    movimento_id: movimento.id,
    status_movimento: movimento.status,
    conta_bancaria_nome: movimento.contaBancaria?.nome || null,
    credito,
    debito,
    saldo: 0
  };
}

function isHistoricoLegadoEnabled(filters = {}, analise) {
  if (analise !== 'REALIZADO') {
    return false;
  }

  if (filters.incluir_historico === false) {
    return false;
  }

  const value = String(filters.incluir_historico ?? '1').trim().toLowerCase();
  return !['0', 'false', 'nao', 'não'].includes(value);
}

function buildFinanceiroObrasHistoricoWhere(filters, obraWhere, periodo) {
  const where = {
    ...obraWhere,
    ativo: true,
    data_pagamento: {
      [Op.between]: [periodo.data_inicial, periodo.data_final]
    }
  };

  if (filters.tipo) {
    where.tipo = String(filters.tipo).toUpperCase();
  }
  if (filters.empresa_id) {
    where.empresa_id = Number(filters.empresa_id);
  }
  if (filters.parceiro_id) {
    where.parceiro_id = Number(filters.parceiro_id);
  }
  if (filters.categoria_financeira_id) {
    where.categoria_financeira_id = Number(filters.categoria_financeira_id);
  }

  if (filters.q) {
    const term = String(filters.q).trim();
    where[Op.or] = [
      { parceiro_nome: { [Op.like]: `%${term}%` } },
      { titulo_parcela: { [Op.like]: `%${term}%` } },
      { documento: { [Op.like]: `%${term}%` } },
      { plano_financeiro: { [Op.like]: `%${term}%` } },
      { descricao: { [Op.like]: `%${term}%` } }
    ];
  }

  return where;
}

function buildFinanceiroObrasLinhaHistorico(item) {
  const valor = Number(item.valor || 0);
  const tipo = String(item.tipo || 'PAGAR').toUpperCase() === 'RECEBER' ? 'RECEBER' : 'PAGAR';
  const credito = tipo === 'RECEBER' ? valor : 0;
  const debito = tipo === 'PAGAR' ? valor : 0;
  return {
    id: `historico-${item.id}`,
    titulo_id: null,
    titulo_codigo: null,
    titulo_parcela: item.titulo_parcela || `HIST-${item.id}`,
    tipo,
    status_titulo: 'HISTORICO',
    documento: item.documento || null,
    descricao: item.descricao || item.parceiro_nome || 'Historico legado',
    parceiro_nome: item.parceiro?.nome || item.parceiro_nome || null,
    parceiro_cpf_cnpj: item.parceiro?.cpf_cnpj || item.parceiro_documento || null,
    obra_id: item.obra_id,
    obra_nome: item.obra?.nome || null,
    obra_codigo: item.obra?.codigo || null,
    empresa_id: item.empresa_id,
    empresa_nome: item.empresa?.nome || item.empresa?.razao_social || null,
    empresa_cnpj: item.empresa?.cnpj || null,
    categoria_nome: item.categoriaFinanceira?.nome || null,
    plano_financeiro: item.categoriaFinanceira?.nome || item.plano_financeiro || 'Historico legado',
    data_emissao: null,
    data_vencimento: item.data_vencimento,
    valor_original: valor,
    valor_baixado: valor,
    valor_saldo: 0,
    analise: 'REALIZADO',
    data_baixa: item.data_pagamento,
    movimento_id: null,
    status_movimento: 'HISTORICO_LEGADO',
    conta_bancaria_nome: 'Historico legado',
    credito,
    debito,
    saldo: 0,
    origem_linha: 'HISTORICO_LEGADO'
  };
}

function getFinanceiroObrasFretePeriodoWhere(periodo) {
  const dataInicial = parseDateOnly(periodo.data_inicial);
  const dataFinal = parseDateOnly(periodo.data_final);
  dataFinal.setHours(23, 59, 59, 999);

  return {
    [Op.between]: [dataInicial, dataFinal]
  };
}

function buildFinanceiroObrasFreteWhere(filters, obraWhere, periodo, analise) {
  if (String(filters.tipo || '').toUpperCase() === 'RECEBER') {
    return null;
  }

  if (filters.categoria_financeira_id) {
    return null;
  }

  const where = {
    ...obraWhere
  };

  if (filters.parceiro_id) {
    where.parceiro_id = Number(filters.parceiro_id);
  }

  if (analise === 'REALIZADO') {
    where.tipo = 'EMBUTIDO';
    where.status_financeiro = 'NAO_GERA_TITULO';
    where.createdAt = getFinanceiroObrasFretePeriodoWhere(periodo);
  } else {
    where.tipo = 'TERCEIRO';
    where.status_financeiro = 'PENDENTE_TITULO';
    where.titulo_financeiro_id = null;
    where.data_vencimento = {
      [Op.between]: [periodo.data_inicial, periodo.data_final]
    };
  }

  if (filters.q) {
    const term = String(filters.q).trim();
    where[Op.or] = [
      { observacoes: { [Op.like]: `%${term}%` } },
      { '$pedido.id$': { [Op.like]: `%${term}%` } },
      { '$parceiro.nome$': { [Op.like]: `%${term}%` } },
      { '$parceiro.cpf_cnpj$': { [Op.like]: `%${term}%` } }
    ];
  }

  return where;
}

function getFinanceiroObrasFreteIncludes(filters = {}) {
  const obraInclude = {
    model: Obra,
    as: 'obra',
    attributes: ['id', 'nome', 'codigo', 'tipo_centro_custo', 'empresa_grupo_id']
  };

  if (filters.empresa_id) {
    obraInclude.where = { empresa_grupo_id: Number(filters.empresa_id) };
    obraInclude.required = true;
  }

  return [
    obraInclude,
    {
      model: PedidoCompra,
      as: 'pedido',
      attributes: ['id', 'status']
    },
    {
      model: Parceiro,
      as: 'parceiro',
      attributes: ['id', 'nome', 'cpf_cnpj']
    },
    {
      model: PedidoCompraFreteRateio,
      as: 'rateios',
      required: false,
      separate: true,
      attributes: ['id', 'valor_rateado']
    }
  ];
}

function getFinanceiroObrasFreteValor(frete) {
  const totalRateios = (frete.rateios || []).reduce(
    (sum, rateio) => roundCurrency(sum + Number(rateio.valor_rateado || 0)),
    0
  );
  return totalRateios > 0 ? totalRateios : roundCurrency(frete.valor_total || 0);
}

function buildFinanceiroObrasLinhaFrete(frete, analise) {
  const valor = getFinanceiroObrasFreteValor(frete);
  const pedidoCodigo = frete.pedido?.id ? `PC-${String(frete.pedido.id).padStart(5, '0')}` : null;
  const tipo = String(frete.tipo || '').toUpperCase();
  const freteLabel = tipo === 'EMBUTIDO' ? 'Frete embutido' : 'Frete de terceiro pendente';
  const dataBase = tipo === 'EMBUTIDO'
    ? toDateOnly(new Date(frete.createdAt || Date.now()))
    : frete.data_vencimento;

  return {
    id: `frete-${frete.id}-${analise}`,
    titulo_id: null,
    titulo_codigo: null,
    titulo_parcela: pedidoCodigo ? `${pedidoCodigo} / Frete` : `Frete #${frete.id}`,
    tipo: 'PAGAR',
    status_titulo: tipo === 'EMBUTIDO' ? 'FRETE_EMBUTIDO' : 'FRETE_PENDENTE',
    documento: pedidoCodigo,
    descricao: frete.observacoes || freteLabel,
    parceiro_nome: frete.parceiro?.nome || (tipo === 'EMBUTIDO' ? 'Fornecedor do pedido' : 'Transportador nao informado'),
    parceiro_cpf_cnpj: frete.parceiro?.cpf_cnpj || null,
    obra_id: frete.obra_id,
    obra_nome: frete.obra?.nome || null,
    obra_codigo: frete.obra?.codigo || null,
    empresa_id: frete.obra?.empresa_grupo_id || null,
    empresa_nome: null,
    empresa_cnpj: null,
    categoria_nome: null,
    plano_financeiro: freteLabel,
    data_emissao: dataBase,
    data_vencimento: tipo === 'EMBUTIDO' ? null : frete.data_vencimento,
    valor_original: valor,
    valor_baixado: tipo === 'EMBUTIDO' ? valor : 0,
    valor_saldo: tipo === 'EMBUTIDO' ? 0 : valor,
    analise,
    data_baixa: tipo === 'EMBUTIDO' ? dataBase : null,
    movimento_id: null,
    status_movimento: tipo === 'EMBUTIDO' ? 'FRETE_EMBUTIDO' : 'PENDENTE_TITULO',
    conta_bancaria_nome: null,
    credito: 0,
    debito: valor,
    saldo: 0,
    origem_linha: 'FRETE_PEDIDO'
  };
}

function applyFinanceiroObrasSaldo(linhas = []) {
  let saldo = 0;
  return linhas.map((linha) => {
    saldo = roundCurrency(saldo + Number(linha.credito || 0) - Number(linha.debito || 0));
    return { ...linha, saldo };
  });
}

function summarizeFinanceiroObras(linhas = []) {
  const credito = linhas.reduce((sum, linha) => roundCurrency(sum + Number(linha.credito || 0)), 0);
  const debito = linhas.reduce((sum, linha) => roundCurrency(sum + Number(linha.debito || 0)), 0);
  const titulosMap = new Map();
  linhas.forEach((linha) => {
    if (!linha.titulo_id || titulosMap.has(linha.titulo_id)) return;
    titulosMap.set(linha.titulo_id, linha);
  });
  const movimentoIds = new Set(linhas.map((linha) => linha.movimento_id).filter(Boolean));
  const historicos = linhas.filter((linha) => linha.origem_linha === 'HISTORICO_LEGADO').length;
  const fretes = linhas.filter((linha) => linha.origem_linha === 'FRETE_PEDIDO').length;
  const titulosUnicos = Array.from(titulosMap.values());

  return {
    quantidade_linhas: linhas.length,
    titulos: titulosMap.size,
    movimentos: movimentoIds.size,
    historicos,
    fretes,
    credito_total: credito,
    debito_total: debito,
    saldo_total: roundCurrency(credito - debito),
    valor_original_total: titulosUnicos.reduce((sum, linha) => roundCurrency(sum + Number(linha.valor_original || 0)), 0),
    valor_baixado_total: titulosUnicos.reduce((sum, linha) => roundCurrency(sum + Number(linha.valor_baixado || 0)), 0),
    valor_saldo_total: titulosUnicos.reduce((sum, linha) => roundCurrency(sum + Number(linha.valor_saldo || 0)), 0)
  };
}

async function listarLinhasFreteFinanceiroObras(filters, obraWhere, periodo, analise, limit) {
  const freteWhere = buildFinanceiroObrasFreteWhere(filters, obraWhere, periodo, analise);
  if (!freteWhere) {
    return [];
  }

  const fretes = await PedidoCompraFrete.findAll({
    where: freteWhere,
    include: getFinanceiroObrasFreteIncludes(filters),
    order: [
      [analise === 'REALIZADO' ? 'createdAt' : 'data_vencimento', 'ASC'],
      ['id', 'ASC']
    ],
    ...(limit ? { limit } : {}),
    subQuery: false
  });

  return fretes.map((freteInstance) => {
    const frete = typeof freteInstance.toJSON === 'function' ? freteInstance.toJSON() : freteInstance;
    return buildFinanceiroObrasLinhaFrete(frete, analise);
  });
}

async function gerarRelatorioFinanceiroObras(req, filters = {}) {
  const analise = normalizeFinanceiroObrasAnalise(filters.analise);
  const periodo = resolvePeriodo({
    data_inicial: filters.data_inicial,
    data_final: filters.data_final,
    periodo: filters.periodo || 'MES_ATUAL'
  }, { maxDays: null });
  const obraWhere = await resolveObraScope(req, filters.obra_id);

  if (obraWhere === null) {
    return {
      filtros: { ...filters, analise, ...periodo },
      resumo: summarizeFinanceiroObras([]),
      linhas: []
    };
  }

  const tituloWhere = buildFinanceiroObrasTituloWhere(filters, obraWhere, periodo, analise);
  // A consulta de Obras deve devolver o recorte completo. O antigo limite
  // silencioso de 1000/3000 cortava os lancamentos mais recentes e alterava
  // inclusive os totais do resumo. Preservamos limite explicito para clientes
  // legados, mas a tela atual nao envia este parametro.
  const requestedLimit = Number(filters.limit);
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.min(Math.floor(requestedLimit), 3000)
    : null;
  let linhas = [];

  if (analise === 'REALIZADO') {
    const movimentos = await MovimentoFinanceiro.findAll({
      where: {
        status: 'ATIVO',
        data_movimento: {
          [Op.between]: [periodo.data_inicial, periodo.data_final]
        }
      },
      include: [
        {
          model: TituloFinanceiro,
          as: 'titulo',
          required: true,
          where: tituloWhere,
          include: getFinanceiroObrasTituloIncludes()
        },
        {
          model: ContaBancaria,
          as: 'contaBancaria',
          attributes: ['id', 'nome', 'banco', 'agencia', 'conta']
        }
      ],
      order: [
        ['data_movimento', 'ASC'],
        [{ model: TituloFinanceiro, as: 'titulo' }, 'data_vencimento', 'ASC'],
        ['id', 'ASC']
      ],
      ...(limit ? { limit } : {}),
      subQuery: false
    });

    linhas = movimentos.map((movimentoInstance) => {
      const movimento = typeof movimentoInstance.toJSON === 'function' ? movimentoInstance.toJSON() : movimentoInstance;
      return buildFinanceiroObrasLinhaMovimento(movimento);
    });

    if (isHistoricoLegadoEnabled(filters, analise)) {
      const historicos = await ObraCustoHistorico.findAll({
        where: buildFinanceiroObrasHistoricoWhere(filters, obraWhere, periodo),
        include: [
          {
            model: Obra,
            as: 'obra',
            attributes: ['id', 'nome', 'codigo', 'tipo_centro_custo', 'empresa_grupo_id']
          },
          {
            model: EmpresaGrupo,
            as: 'empresa',
            attributes: ['id', 'codigo', 'nome', 'razao_social', 'cnpj']
          },
          {
            model: Parceiro,
            as: 'parceiro',
            attributes: ['id', 'nome', 'cpf_cnpj']
          },
          {
            model: CategoriaFinanceira,
            as: 'categoriaFinanceira',
            attributes: ['id', 'nome', 'tipo', 'dre_grupo', 'dre_subgrupo']
          }
        ],
        order: [
          ['data_pagamento', 'ASC'],
          ['id', 'ASC']
        ],
        ...(limit ? { limit } : {})
      });

      linhas = [
        ...linhas,
        ...historicos.map((itemInstance) => {
          const item = typeof itemInstance.toJSON === 'function' ? itemInstance.toJSON() : itemInstance;
          return buildFinanceiroObrasLinhaHistorico(item);
        })
      ];
    }

    const linhasFrete = await listarLinhasFreteFinanceiroObras(filters, obraWhere, periodo, analise, limit);
    linhas = [
      ...linhas,
      ...linhasFrete
    ].sort((a, b) => {
      const dateA = String(a.data_baixa || a.data_vencimento || '');
      const dateB = String(b.data_baixa || b.data_vencimento || '');
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      return String(a.id).localeCompare(String(b.id));
    });
    if (limit) linhas = linhas.slice(0, limit);
  } else {
    const titulos = await TituloFinanceiro.findAll({
      where: tituloWhere,
      include: getFinanceiroObrasTituloIncludes(),
      order: [
        ['data_vencimento', 'ASC'],
        ['id', 'ASC']
      ],
      ...(limit ? { limit } : {}),
      subQuery: false
    });

    linhas = titulos.map((tituloInstance) => {
      const titulo = typeof tituloInstance.toJSON === 'function' ? tituloInstance.toJSON() : tituloInstance;
      return buildFinanceiroObrasLinhaTitulo(titulo, analise);
    });

    const linhasFrete = await listarLinhasFreteFinanceiroObras(filters, obraWhere, periodo, analise, limit);
    linhas = [
      ...linhas,
      ...linhasFrete
    ].sort((a, b) => {
      const dateA = String(a.data_vencimento || a.data_baixa || '');
      const dateB = String(b.data_vencimento || b.data_baixa || '');
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      return String(a.id).localeCompare(String(b.id));
    });
    if (limit) linhas = linhas.slice(0, limit);
  }

  const linhasComSaldo = applyFinanceiroObrasSaldo(linhas);

  return {
    filtros: {
      ...filters,
      analise,
      periodo: periodo.periodo,
      descricao: periodo.descricao,
      data_inicial: periodo.data_inicial,
      data_final: periodo.data_final
    },
    resumo: summarizeFinanceiroObras(linhasComSaldo),
    linhas: linhasComSaldo
  };
}

function getCompetenciaWhere(periodo) {
  return {
    competencia_data: {
      [Op.between]: [periodo.data_inicial, periodo.data_final]
    }
  };
}

function getEmpresaIdsDaHolding(empresas = [], holdingId = null) {
  if (!holdingId) return null;

  const id = Number(holdingId);
  const ids = new Set([id]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const empresa of empresas) {
      if (empresa.holding_id && ids.has(Number(empresa.holding_id)) && !ids.has(Number(empresa.id))) {
        ids.add(Number(empresa.id));
        changed = true;
      }
    }
  }

  return Array.from(ids);
}

function getObraIncludeWhereFromTituloScope(tituloScope) {
  if (!tituloScope || !tituloScope.obra_id) {
    return {};
  }

  return {
    id: tituloScope.obra_id
  };
}

function emptyDreSummary() {
  const demonstrativo = buildDreDemonstrativo([]);

  return {
    resumo: {
      receitas: 0,
      despesas: 0,
      resultado: 0,
      margem_resultado: null,
      ...demonstrativo.metricas,
      empresas_com_movimento: 0,
      titulos_considerados: 0,
      movimentos_avulsos_considerados: 0
    },
    linhas: [],
    demonstrativo: demonstrativo.linhas,
    empresas: []
  };
}

function getLinhaDrePorCategoria(categoria, tipo) {
  const grupoCategoria = String(categoria?.dre_grupo || '').trim();

  if (!categoria || !grupoCategoria) {
    return {
      grupo: null,
      subgrupo: null,
      ordem: 999,
      considera_dre: false,
      motivo_exclusao: !categoria ? 'SEM_CATEGORIA' : 'CATEGORIA_SEM_GRUPO_DRE'
    };
  }

  return {
    grupo: grupoCategoria,
    subgrupo: categoria?.dre_subgrupo || null,
    ordem: categoria?.dre_ordem ?? 999,
    considera_dre: categoria?.considera_dre !== false
  };
}

function getLinhaDre(titulo) {
  return getLinhaDrePorCategoria(titulo.categoriaFinanceira, titulo.tipo);
}

function addToMap(map, key, seed, amount, countField = 'titulos') {
  if (!map.has(key)) {
    map.set(key, { ...seed, valor: 0, titulos: 0, movimentos: 0 });
  }
  const item = map.get(key);
  item.valor += amount;
  item[countField] = Number(item[countField] || 0) + 1;
  return item;
}

function getDreCategoriaKey(categoria = {}) {
  if (categoria.id !== null && categoria.id !== undefined) {
    return `ID:${categoria.id}`;
  }

  return `SEM_ID:${categoria.codigo || categoria.nome || 'SEM_CATEGORIA'}`;
}

function addDreCategoria(aggregate, categoria, linha, amount, countField = 'titulos') {
  if (!aggregate || !categoria) return;

  if (!(aggregate.__categorias instanceof Map)) {
    aggregate.__categorias = new Map();
  }

  const categoriaKey = getDreCategoriaKey(categoria);
  const item = addToMap(aggregate.__categorias, categoriaKey, {
    categoria_key: categoriaKey,
    categoria_id: categoria.id || null,
    codigo: categoria.codigo || null,
    nome: categoria.nome || 'Categoria sem nome',
    tipo: categoria.tipo || null,
    grupo: linha.grupo || null,
    subgrupo: linha.subgrupo || null,
    ordem: linha.ordem ?? 999
  }, amount, countField);

  item.valor = roundCurrency(item.valor);
}

function normalizeDreCategorias(categorias) {
  const values = categorias instanceof Map
    ? Array.from(categorias.values())
    : Array.isArray(categorias) ? categorias : [];

  return values
    .map((categoria) => ({
      ...categoria,
      valor: roundCurrency(categoria.valor || 0),
      titulos: Number(categoria.titulos || 0),
      movimentos: Number(categoria.movimentos || 0)
    }))
    .sort((a, b) => (
      Number(a.ordem || 999) - Number(b.ordem || 999) ||
      String(a.codigo || '').localeCompare(String(b.codigo || '')) ||
      String(a.nome || '').localeCompare(String(b.nome || ''))
    ));
}

function normalizeDreAggregate(item = {}) {
  const { __categorias, ...rest } = item;
  return {
    ...rest,
    valor: roundCurrency(rest.valor || 0),
    categorias: normalizeDreCategorias(__categorias || rest.categorias)
  };
}

function mergeDreCategorias(...listas) {
  const merged = new Map();

  for (const lista of listas) {
    for (const categoria of normalizeDreCategorias(lista)) {
      const key = categoria.categoria_key || getDreCategoriaKey(categoria);
      if (!merged.has(key)) {
        merged.set(key, {
          ...categoria,
          categoria_key: key,
          valor: 0,
          titulos: 0,
          movimentos: 0
        });
      }
      const target = merged.get(key);
      target.valor += Number(categoria.valor || 0);
      target.titulos += Number(categoria.titulos || 0);
      target.movimentos += Number(categoria.movimentos || 0);
    }
  }

  return normalizeDreCategorias(merged);
}

const DRE_NATUREZA_POR_GRUPO = {
  'Receita operacional bruta': 'receita_bruta',
  'Deducoes da receita bruta': 'deducoes_receita',
  'Custos das obras e servicos': 'custos',
  'Custos com pessoal': 'custos',
  'Custos com frota e equipamentos': 'custos',
  'Despesas comerciais': 'despesas_operacionais',
  'Despesas administrativas': 'despesas_operacionais',
  'Outras receitas operacionais': 'outras_operacionais',
  'Outras despesas operacionais': 'outras_operacionais',
  'Outras despesas': 'outras_operacionais',
  'Deducoes de custos e despesas': 'outras_operacionais',
  'Depreciacao e amortizacao': 'depreciacao_amortizacao',
  'Resultado financeiro': 'resultado_financeiro',
  'Impostos sobre o resultado': 'impostos_resultado',
  'Tributos e contribuicoes': 'outras_operacionais'
};

function getDreNatureza(linha = {}) {
  return DRE_NATUREZA_POR_GRUPO[String(linha.grupo || '').trim()] || 'outras_operacionais';
}

function sumDreNatureza(totais, naturezas = []) {
  return roundCurrency(naturezas.reduce((sum, natureza) => sum + Number(totais[natureza] || 0), 0));
}

function buildDreRow({ codigo, label, valor, tipo = 'grupo', ordem, categorias = [] }) {
  return {
    codigo,
    label,
    valor: roundCurrency(valor),
    tipo,
    ordem,
    categorias: normalizeDreCategorias(categorias)
  };
}

function buildDreDemonstrativo(linhas = []) {
  const totais = {
    receita_bruta: 0,
    deducoes_receita: 0,
    custos: 0,
    despesas_operacionais: 0,
    outras_operacionais: 0,
    depreciacao_amortizacao: 0,
    resultado_financeiro: 0,
    impostos_resultado: 0
  };
  const categoriasPorNatureza = new Map();

  for (const linha of linhas) {
    const natureza = getDreNatureza(linha);
    totais[natureza] = roundCurrency(Number(totais[natureza] || 0) + Number(linha.valor || 0));
    categoriasPorNatureza.set(
      natureza,
      mergeDreCategorias(categoriasPorNatureza.get(natureza), linha.categorias)
    );
  }

  const receitaBruta = sumDreNatureza(totais, ['receita_bruta']);
  const deducoesReceita = sumDreNatureza(totais, ['deducoes_receita']);
  const receitaLiquida = roundCurrency(receitaBruta + deducoesReceita);
  const custos = sumDreNatureza(totais, ['custos']);
  const lucroBruto = roundCurrency(receitaLiquida + custos);
  const despesasOperacionais = sumDreNatureza(totais, ['despesas_operacionais']);
  const outrasOperacionais = sumDreNatureza(totais, ['outras_operacionais']);
  const ebitda = roundCurrency(lucroBruto + despesasOperacionais + outrasOperacionais);
  const depreciacaoAmortizacao = sumDreNatureza(totais, ['depreciacao_amortizacao']);
  const ebit = roundCurrency(ebitda + depreciacaoAmortizacao);
  const resultadoFinanceiro = sumDreNatureza(totais, ['resultado_financeiro']);
  const resultadoAntesImpostos = roundCurrency(ebit + resultadoFinanceiro);
  const impostosResultado = sumDreNatureza(totais, ['impostos_resultado']);
  const lucroPrejuizoLiquido = roundCurrency(resultadoAntesImpostos + impostosResultado);
  const margemEbitda = receitaLiquida > 0 ? Number(((ebitda / receitaLiquida) * 100).toFixed(2)) : null;
  const margemLiquida = receitaLiquida > 0 ? Number(((lucroPrejuizoLiquido / receitaLiquida) * 100).toFixed(2)) : null;
  const categoriasReceitaBruta = categoriasPorNatureza.get('receita_bruta') || [];
  const categoriasDeducoesReceita = categoriasPorNatureza.get('deducoes_receita') || [];
  const categoriasReceitaLiquida = mergeDreCategorias(categoriasReceitaBruta, categoriasDeducoesReceita);
  const categoriasCustos = categoriasPorNatureza.get('custos') || [];
  const categoriasLucroBruto = mergeDreCategorias(categoriasReceitaLiquida, categoriasCustos);
  const categoriasDespesasOperacionais = categoriasPorNatureza.get('despesas_operacionais') || [];
  const categoriasOutrasOperacionais = categoriasPorNatureza.get('outras_operacionais') || [];
  const categoriasEbitda = mergeDreCategorias(
    categoriasLucroBruto,
    categoriasDespesasOperacionais,
    categoriasOutrasOperacionais
  );
  const categoriasDepreciacao = categoriasPorNatureza.get('depreciacao_amortizacao') || [];
  const categoriasEbit = mergeDreCategorias(categoriasEbitda, categoriasDepreciacao);
  const categoriasResultadoFinanceiro = categoriasPorNatureza.get('resultado_financeiro') || [];
  const categoriasResultadoAntesImpostos = mergeDreCategorias(categoriasEbit, categoriasResultadoFinanceiro);
  const categoriasImpostos = categoriasPorNatureza.get('impostos_resultado') || [];
  const categoriasResultadoLiquido = mergeDreCategorias(categoriasResultadoAntesImpostos, categoriasImpostos);

  return {
    linhas: [
      buildDreRow({ codigo: 'receita_bruta', label: 'Receita operacional bruta', valor: receitaBruta, ordem: 100, categorias: categoriasReceitaBruta }),
      buildDreRow({ codigo: 'deducoes_receita', label: '(-) Deducoes da receita bruta', valor: deducoesReceita, ordem: 120, categorias: categoriasDeducoesReceita }),
      buildDreRow({ codigo: 'receita_liquida', label: '= Receita liquida', valor: receitaLiquida, tipo: 'subtotal', ordem: 190, categorias: categoriasReceitaLiquida }),
      buildDreRow({ codigo: 'custos', label: '(-) Custos diretos e operacionais', valor: custos, ordem: 200, categorias: categoriasCustos }),
      buildDreRow({ codigo: 'lucro_bruto', label: '= Lucro bruto', valor: lucroBruto, tipo: 'subtotal', ordem: 290, categorias: categoriasLucroBruto }),
      buildDreRow({ codigo: 'despesas_operacionais', label: '(-) Despesas operacionais', valor: despesasOperacionais, ordem: 400, categorias: categoriasDespesasOperacionais }),
      buildDreRow({ codigo: 'outras_operacionais', label: '+/- Outras receitas e despesas operacionais', valor: outrasOperacionais, ordem: 650, categorias: categoriasOutrasOperacionais }),
      buildDreRow({ codigo: 'ebitda', label: '= EBITDA', valor: ebitda, tipo: 'subtotal', ordem: 690, categorias: categoriasEbitda }),
      buildDreRow({ codigo: 'depreciacao_amortizacao', label: '(-) Depreciacao e amortizacao', valor: depreciacaoAmortizacao, ordem: 695, categorias: categoriasDepreciacao }),
      buildDreRow({ codigo: 'ebit', label: '= Resultado operacional (EBIT)', valor: ebit, tipo: 'subtotal', ordem: 699, categorias: categoriasEbit }),
      buildDreRow({ codigo: 'resultado_financeiro', label: '+/- Resultado financeiro', valor: resultadoFinanceiro, ordem: 700, categorias: categoriasResultadoFinanceiro }),
      buildDreRow({ codigo: 'resultado_antes_impostos', label: '= Resultado antes de IRPJ/CSLL', valor: resultadoAntesImpostos, tipo: 'subtotal', ordem: 790, categorias: categoriasResultadoAntesImpostos }),
      buildDreRow({ codigo: 'impostos_resultado', label: '(-) IRPJ e CSLL', valor: impostosResultado, ordem: 850, categorias: categoriasImpostos }),
      buildDreRow({ codigo: 'lucro_prejuizo_liquido', label: '= Lucro/Prejuizo liquido', valor: lucroPrejuizoLiquido, tipo: 'total', ordem: 990, categorias: categoriasResultadoLiquido })
    ],
    metricas: {
      receita_bruta: receitaBruta,
      deducoes_receita: deducoesReceita,
      receita_liquida: receitaLiquida,
      custos,
      lucro_bruto: lucroBruto,
      despesas_operacionais: despesasOperacionais,
      outras_operacionais: outrasOperacionais,
      ebitda,
      depreciacao_amortizacao: depreciacaoAmortizacao,
      ebit,
      resultado_financeiro: resultadoFinanceiro,
      resultado_antes_impostos: resultadoAntesImpostos,
      impostos_resultado: impostosResultado,
      lucro_prejuizo_liquido: lucroPrejuizoLiquido,
      margem_ebitda: margemEbitda,
      margem_liquida: margemLiquida
    }
  };
}

function sortDreLinhas(linhas = []) {
  return Array.from(linhas).map(normalizeDreAggregate).sort((a, b) => (
    Number(a.ordem || 999) - Number(b.ordem || 999) ||
    String(a.grupo).localeCompare(String(b.grupo)) ||
    String(a.subgrupo || '').localeCompare(String(b.subgrupo || ''))
  ));
}

function summarizeDreRows(titulos = [], empresas = [], movimentosAvulsos = []) {
  const empresasById = new Map(empresas.map((empresa) => [Number(empresa.id), empresa]));
  const linhasMap = new Map();
  const empresasMap = new Map();
  const empresaLinhasMaps = new Map();

  function addDreValue({ linha, categoria, signedValue, empresaId, countField }) {
    const empresa = empresaId ? empresasById.get(empresaId) : null;
    const empresaKey = empresaId ? String(empresaId) : 'SEM_EMPRESA';
    const linhaKey = `${linha.grupo}::${linha.subgrupo || ''}`;
    const linhaResumo = addToMap(linhasMap, linhaKey, {
      linha_key: linhaKey,
      grupo: linha.grupo,
      subgrupo: linha.subgrupo,
      ordem: linha.ordem
    }, signedValue, countField);
    addDreCategoria(linhaResumo, categoria, linha, signedValue, countField);

    if (!empresaLinhasMaps.has(empresaKey)) {
      empresaLinhasMaps.set(empresaKey, new Map());
    }
    const empresaLinhaResumo = addToMap(empresaLinhasMaps.get(empresaKey), linhaKey, {
      linha_key: linhaKey,
      grupo: linha.grupo,
      subgrupo: linha.subgrupo,
      ordem: linha.ordem
    }, signedValue, countField);
    addDreCategoria(empresaLinhaResumo, categoria, linha, signedValue, countField);

    const empresaResumo = addToMap(empresasMap, empresaKey, {
      empresa_id: empresaId,
      empresa_nome: empresa?.nome || 'Sem empresa vinculada',
      tipo_empresa: empresa?.tipo_empresa || null,
      tipo_gerencial: empresa?.tipo_gerencial || null,
      empresa_caixa: empresa?.empresa_caixa === true,
      empresa_operacional: empresa?.empresa_operacional !== false,
      consolidar_no_grupo: empresa?.consolidar_no_grupo !== false,
      holding_id: empresa?.holding_id || null,
      receitas: 0,
      despesas: 0,
      resultado: 0
    }, 0, countField);
    addDreCategoria(empresaResumo, categoria, linha, signedValue, countField);

    if (signedValue >= 0) {
      empresaResumo.receitas += signedValue;
    } else {
      empresaResumo.despesas += Math.abs(signedValue);
    }
    empresaResumo.resultado += signedValue;
  }

  for (const titulo of titulos) {
    const linha = getLinhaDre(titulo);
    if (!linha.considera_dre || titulo.considera_dre === false) continue;

    const tipo = String(titulo.tipo || '').toUpperCase();
    const rawValue = Number(titulo.valor_original || 0);
    const baseSignedValue = tipo === 'RECEBER' ? rawValue : -rawValue;
    const signedValue = isCategoriaRedutora(titulo.categoriaFinanceira)
      ? baseSignedValue * -1
      : baseSignedValue;
    const empresaId = titulo.empresa_id ? Number(titulo.empresa_id) : null;

    addDreValue({
      linha,
      categoria: titulo.categoriaFinanceira,
      signedValue,
      empresaId,
      countField: 'titulos'
    });
  }

  for (const movimento of movimentosAvulsos) {
    const categoria = movimento.categoriaFinanceira;
    const linha = getLinhaDrePorCategoria(categoria, 'PAGAR');
    if (!linha.considera_dre || categoria?.considera_dre === false) continue;

    const rawValue = Number(movimento.valor_quitacao || movimento.valor || 0);
    const isEstornoTarifa = String(movimento.tipo_movimento || '').toUpperCase() === 'ESTORNO_TARIFA_BANCARIA';
    const baseSignedValue = isEstornoTarifa ? Math.abs(rawValue) : -Math.abs(rawValue);
    const signedValue = isCategoriaRedutora(categoria) ? baseSignedValue * -1 : baseSignedValue;
    const empresaId = movimento.empresa_id ? Number(movimento.empresa_id) : null;
    addDreValue({ linha, categoria, signedValue, empresaId, countField: 'movimentos' });
  }

  const linhas = sortDreLinhas(linhasMap.values());

  const empresasResumo = Array.from(empresasMap.entries())
    .map(([empresaKey, empresaResumo]) => {
      const empresaLinhas = sortDreLinhas((empresaLinhasMaps.get(empresaKey) || new Map()).values());
      const empresaDre = buildDreDemonstrativo(empresaLinhas);

      return {
        ...normalizeDreAggregate(empresaResumo),
        receitas: roundCurrency(empresaResumo.receitas),
        despesas: roundCurrency(empresaResumo.despesas),
        resultado: empresaDre.metricas.lucro_prejuizo_liquido,
        margem_resultado: empresaDre.metricas.margem_liquida,
        ...empresaDre.metricas,
        linhas: empresaLinhas,
        demonstrativo: empresaDre.linhas
      };
    })
    .sort((a, b) => String(a.empresa_nome).localeCompare(String(b.empresa_nome)));

  const receitas = empresasResumo.reduce((sum, item) => sum + Number(item.receitas || 0), 0);
  const despesas = empresasResumo.reduce((sum, item) => sum + Number(item.despesas || 0), 0);
  const demonstrativo = buildDreDemonstrativo(linhas);
  const resultado = demonstrativo.metricas.lucro_prejuizo_liquido;

  return {
    resumo: {
      receitas: roundCurrency(receitas),
      despesas: roundCurrency(despesas),
      resultado,
      margem_resultado: demonstrativo.metricas.margem_liquida,
      ...demonstrativo.metricas,
      empresas_com_movimento: empresasResumo.length,
      titulos_considerados: titulos.length,
      movimentos_avulsos_considerados: movimentosAvulsos.length
    },
    linhas,
    demonstrativo: demonstrativo.linhas,
    empresas: empresasResumo
  };
}

async function gerarDreGerencial(req, filters = {}) {
  await assertFinanceAccess(req);

  const periodo = resolvePeriodo(filters);
  const obraScopeWhere = await resolveObraScope(req, filters.obra_id);
  const empresas = await EmpresaGrupo.findAll({
    attributes: [
      'id',
      'codigo',
      'nome',
      'razao_social',
      'cnpj',
      'tipo_empresa',
      'tipo_gerencial',
      'empresa_caixa',
      'empresa_operacional',
      'consolidar_no_grupo',
      'elimina_intercompany',
      'holding_id',
      'ativo'
    ],
    order: [['tipo_empresa', 'ASC'], ['nome', 'ASC']]
  });
  const empresaIdsHolding = getEmpresaIdsDaHolding(empresas, filters.holding_id);

  if (obraScopeWhere === null) {
    return {
      filtro: {
        periodo: periodo.periodo,
        descricao: periodo.descricao,
        data_inicial: periodo.data_inicial,
        data_final: periodo.data_final,
        empresa_id: filters.empresa_id ? Number(filters.empresa_id) : null,
        holding_id: filters.holding_id ? Number(filters.holding_id) : null,
        obra_id: filters.obra_id ? Number(filters.obra_id) : null,
        excluir_intercompany: filters.excluir_intercompany !== false
      },
      ...emptyDreSummary()
    };
  }

  const tituloWhere = {
    considera_dre: true,
    ...obraScopeWhere,
    [Op.and]: [getCompetenciaWhere(periodo)]
  };

  if (filters.empresa_id) {
    tituloWhere.empresa_id = Number(filters.empresa_id);
  } else if (empresaIdsHolding) {
    tituloWhere.empresa_id = { [Op.in]: empresaIdsHolding };
  }

  if (filters.excluir_intercompany !== false) {
    tituloWhere[Op.and].push({
      [Op.or]: [
        { intercompany: false },
        { elimina_consolidado: false }
      ]
    });
  }

  const titulos = await TituloFinanceiro.findAll({
    where: tituloWhere,
    include: [
      {
        model: Obra,
        as: 'obra',
        attributes: ['id', 'codigo', 'nome', 'tipo_centro_custo', 'empresa_grupo_id'],
        required: false
      },
      {
        model: EmpresaGrupo,
        as: 'empresa',
        attributes: [
          'id',
          'codigo',
          'nome',
          'razao_social',
          'cnpj',
          'tipo_empresa',
          'tipo_gerencial',
          'empresa_caixa',
          'empresa_operacional',
          'consolidar_no_grupo',
          'holding_id'
        ],
        required: false
      },
      {
        model: CategoriaFinanceira,
        as: 'categoriaFinanceira',
        attributes: ['id', 'nome', 'tipo', 'dre_grupo', 'dre_subgrupo', 'dre_ordem', 'considera_dre'],
        required: false
      }
    ],
    order: [['data_emissao', 'ASC'], ['data_vencimento', 'ASC']]
  });

  const movimentoAvulsoWhere = {
    titulo_financeiro_id: null,
    status: 'ATIVO',
    tipo_movimento: { [Op.in]: ['TARIFA_BANCARIA', 'ESTORNO_TARIFA_BANCARIA'] },
    categoria_financeira_id: { [Op.ne]: null },
    data_movimento: {
      [Op.gte]: periodo.data_inicial,
      [Op.lte]: periodo.data_final
    }
  };

  if (filters.empresa_id) {
    movimentoAvulsoWhere.empresa_id = Number(filters.empresa_id);
  } else if (empresaIdsHolding) {
    movimentoAvulsoWhere.empresa_id = { [Op.in]: empresaIdsHolding };
  }

  if (filters.excluir_intercompany !== false) {
    movimentoAvulsoWhere[Op.or] = [
      { transferencia_interna: false },
      { elimina_consolidado: false }
    ];
  }

  const movimentosAvulsos = filters.obra_id
    ? []
    : await MovimentoFinanceiro.findAll({
        where: movimentoAvulsoWhere,
        include: [
          {
            model: EmpresaGrupo,
            as: 'empresa',
            attributes: ['id', 'codigo', 'nome', 'razao_social', 'tipo_empresa', 'tipo_gerencial', 'holding_id'],
            required: false
          },
          {
            model: CategoriaFinanceira,
            as: 'categoriaFinanceira',
            attributes: ['id', 'nome', 'tipo', 'dre_grupo', 'dre_subgrupo', 'dre_ordem', 'considera_dre'],
            required: true
          }
        ],
        order: [['data_movimento', 'ASC']]
      });

  const summary = summarizeDreRows(titulos, empresas, movimentosAvulsos);

  return {
    filtro: {
      periodo: periodo.periodo,
      descricao: periodo.descricao,
      data_inicial: periodo.data_inicial,
      data_final: periodo.data_final,
      empresa_id: filters.empresa_id ? Number(filters.empresa_id) : null,
      holding_id: filters.holding_id ? Number(filters.holding_id) : null,
      obra_id: filters.obra_id ? Number(filters.obra_id) : null,
      excluir_intercompany: filters.excluir_intercompany !== false
    },
    ...summary
  };
}

function getEmpresaNome(empresa) {
  return empresa?.nome || empresa?.razao_social || 'Sem empresa';
}

async function getExistingTableAttributes(tableName, attributes = []) {
  const exists = await tableExists(sequelize, tableName);
  if (!exists) {
    return [];
  }

  const checks = await Promise.all(attributes.map(async (attribute) => ({
    attribute,
    exists: await columnExists(sequelize, tableName, attribute)
  })));

  return checks
    .filter((item) => item.exists)
    .map((item) => item.attribute);
}

function getModelTableName(model) {
  const tableName = model?.getTableName?.();
  if (typeof tableName === 'string') {
    return tableName;
  }
  return tableName?.tableName || tableName?.toString?.() || null;
}

async function getMissingTableAttributes(tableName, attributes = []) {
  const exists = await tableExists(sequelize, tableName);
  if (!exists) {
    return attributes.map((attribute) => `${tableName}.${attribute}`);
  }

  const checks = await Promise.all(attributes.map(async (attribute) => ({
    attribute,
    exists: await columnExists(sequelize, tableName, attribute)
  })));

  return checks
    .filter((item) => !item.exists)
    .map((item) => `${tableName}.${item.attribute}`);
}

async function getIntercompanyReportSchema() {
  const empresaTable = getModelTableName(EmpresaGrupo) || 'empresas_grupo';
  const categoriaTable = getModelTableName(CategoriaFinanceira) || 'categorias_financeiras';
  const obraTable = getModelTableName(Obra) || 'Obras';
  const contaTable = getModelTableName(ContaBancaria) || 'contas_bancarias';
  const parceiroTable = getModelTableName(Parceiro) || 'parceiros';
  const tituloTable = getModelTableName(TituloFinanceiro) || 'titulos_financeiros';
  const transferenciaTable = getModelTableName(TransferenciaFinanceira) || 'transferencias_financeiras';

  const [
    empresaAttributes,
    categoriaAttributes,
    obraAttributes,
    contaAttributes,
    parceiroAttributes,
    tituloAttributes,
    tituloMissing,
    transferenciaAttributes,
    transferenciaMissing
  ] = await Promise.all([
    getExistingTableAttributes(empresaTable, [
      'id',
      'codigo',
      'nome',
      'razao_social',
      'tipo_empresa',
      'tipo_gerencial',
      'holding_id'
    ]),
    getExistingTableAttributes(categoriaTable, [
      'id',
      'nome',
      'tipo',
      'dre_grupo',
      'dre_subgrupo'
    ]),
    getExistingTableAttributes(obraTable, [
      'id',
      'codigo',
      'nome',
      'tipo_centro_custo'
    ]),
    getExistingTableAttributes(contaTable, [
      'id',
      'nome',
      'banco',
      'agencia',
      'conta',
      'empresa_id'
    ]),
    getExistingTableAttributes(parceiroTable, [
      'id',
      'nome',
      'razao_social'
    ]),
    getExistingTableAttributes(tituloTable, [
      'id',
      'codigo',
      'tipo',
      'status',
      'descricao',
      'numero_documento',
      'data_emissao',
      'data_vencimento',
      'competencia_data',
      'valor_original',
      'valor_saldo',
      'intercompany',
      'intercompany_group_id',
      'empresa_id',
      'empresa_origem_id',
      'empresa_destino_id',
      'tipo_intercompany',
      'motivo_intercompany',
      'elimina_consolidado',
      'transferencia_interna',
      'parceiro_id',
      'categoria_financeira_id',
      'obra_id'
    ]),
    getMissingTableAttributes(tituloTable, [
      'competencia_data',
      'intercompany',
      'empresa_origem_id',
      'empresa_destino_id',
      'tipo_intercompany',
      'elimina_consolidado',
      'transferencia_interna'
    ]),
    getExistingTableAttributes(transferenciaTable, [
      'id',
      'empresa_id',
      'intercompany_group_id',
      'empresa_origem_id',
      'empresa_destino_id',
      'conta_origem_id',
      'conta_destino_id',
      'data_transferencia',
      'valor',
      'descricao',
      'tipo_intercompany',
      'motivo_intercompany',
      'elimina_consolidado',
      'transferencia_interna',
      'status'
    ]),
    getMissingTableAttributes(transferenciaTable, [
      'empresa_id',
      'empresa_origem_id',
      'empresa_destino_id',
      'data_transferencia',
      'valor',
      'tipo_intercompany',
      'elimina_consolidado',
      'transferencia_interna',
      'status'
    ])
  ]);

  return {
    empresaAttributes: empresaAttributes.length ? empresaAttributes : ['id', 'nome'],
    categoriaAttributes: categoriaAttributes.length ? categoriaAttributes : ['id', 'nome'],
    obraAttributes: obraAttributes.length ? obraAttributes : ['id', 'nome'],
    contaAttributes: contaAttributes.length ? contaAttributes : ['id', 'nome'],
    parceiroAttributes: parceiroAttributes.length ? parceiroAttributes : ['id', 'nome'],
    tituloAttributes,
    tituloMissing,
    transferenciaAttributes,
    transferenciaMissing,
    pronto: tituloMissing.length === 0 && transferenciaMissing.length === 0
  };
}

async function getEndividamentoReportSchema() {
  const empresaTable = getModelTableName(EmpresaGrupo) || 'empresas_grupo';
  const categoriaTable = getModelTableName(CategoriaFinanceira) || 'categorias_financeiras';
  const obraTable = getModelTableName(Obra) || 'Obras';
  const parceiroTable = getModelTableName(Parceiro) || 'parceiros';
  const tituloTable = getModelTableName(TituloFinanceiro) || 'titulos_financeiros';

  const [
    empresaAttributes,
    categoriaAttributes,
    obraAttributes,
    parceiroAttributes,
    tituloAttributes,
    tituloMissing,
    categoriaMissing
  ] = await Promise.all([
    getExistingTableAttributes(empresaTable, [
      'id',
      'codigo',
      'nome',
      'razao_social',
      'tipo_empresa',
      'tipo_gerencial',
      'holding_id'
    ]),
    getExistingTableAttributes(categoriaTable, [
      'id',
      'nome',
      'tipo',
      'classificacao_gerencial',
      'dre_grupo',
      'dre_subgrupo'
    ]),
    getExistingTableAttributes(obraTable, [
      'id',
      'codigo',
      'nome',
      'tipo_centro_custo'
    ]),
    getExistingTableAttributes(parceiroTable, [
      'id',
      'nome',
      'razao_social'
    ]),
    getExistingTableAttributes(tituloTable, [
      'id',
      'codigo',
      'descricao',
      'numero_documento',
      'tipo',
      'status',
      'data_vencimento',
      'valor_original',
      'valor_baixado',
      'valor_saldo',
      'empresa_id',
      'categoria_financeira_id',
      'obra_id',
      'parceiro_id',
      'intercompany',
      'elimina_consolidado'
    ]),
    getMissingTableAttributes(tituloTable, [
      'tipo',
      'status',
      'data_vencimento',
      'valor_saldo',
      'empresa_id',
      'categoria_financeira_id',
      'intercompany',
      'elimina_consolidado'
    ]),
    getMissingTableAttributes(categoriaTable, [
      'classificacao_gerencial'
    ])
  ]);

  return {
    empresaAttributes: empresaAttributes.length ? empresaAttributes : ['id', 'nome'],
    categoriaAttributes: categoriaAttributes.length ? categoriaAttributes : ['id', 'nome'],
    obraAttributes: obraAttributes.length ? obraAttributes : ['id', 'nome'],
    parceiroAttributes: parceiroAttributes.length ? parceiroAttributes : ['id', 'nome'],
    tituloAttributes,
    tituloMissing,
    categoriaMissing,
    pronto: tituloMissing.length === 0 && categoriaMissing.length === 0
  };
}

function getIntercompanyTituloValor(titulo) {
  return roundCurrency(titulo.valor_original || titulo.valor_saldo || 0);
}

function getIntercompanyMovimentoValor(movimento) {
  return roundCurrency(movimento.valor_quitacao || movimento.valor || 0);
}

function getIntercompanyTransferenciaValor(transferencia) {
  return roundCurrency(transferencia.valor || 0);
}

function addIntercompanyResumo(map, key, seed, previsto, realizado, count = 1, countField = 'titulos') {
  if (!map.has(key)) {
    map.set(key, {
      ...seed,
      valor_previsto: 0,
      valor_realizado: 0,
      titulos: 0,
      transferencias: 0
    });
  }

  const item = map.get(key);
  item.valor_previsto = roundCurrency(item.valor_previsto + Number(previsto || 0));
  item.valor_realizado = roundCurrency(item.valor_realizado + Number(realizado || 0));
  item[countField] = Number(item[countField] || 0) + count;

  return item;
}

function mapIntercompanyTitulo(titulo) {
  const item = toPlain(titulo);
  const movimentos = Array.isArray(item.movimentos) ? item.movimentos : [];
  const valorRealizado = roundCurrency(movimentos.reduce((sum, movimento) => (
    sum + getIntercompanyMovimentoValor(movimento)
  ), 0));

  return {
    id: item.id,
    codigo: item.codigo,
    tipo: item.tipo,
    status: item.status,
    descricao: item.descricao,
    numero_documento: item.numero_documento,
    data_emissao: item.data_emissao,
    data_vencimento: item.data_vencimento,
    competencia_data: item.competencia_data,
    valor_previsto: getIntercompanyTituloValor(item),
    valor_realizado: valorRealizado,
    valor_saldo: roundCurrency(item.valor_saldo || 0),
    intercompany_group_id: item.intercompany_group_id,
    tipo_intercompany: item.tipo_intercompany,
    motivo_intercompany: item.motivo_intercompany,
    elimina_consolidado: item.elimina_consolidado === true,
    transferencia_interna: item.transferencia_interna === true,
    empresa_origem_id: item.empresa_origem_id,
    empresa_origem_nome: getEmpresaNome(item.empresaOrigem),
    empresa_destino_id: item.empresa_destino_id,
    empresa_destino_nome: getEmpresaNome(item.empresaDestino),
    empresa_titulo_id: item.empresa_id,
    empresa_titulo_nome: getEmpresaNome(item.empresa),
    parceiro_id: item.parceiro_id,
    parceiro_nome: item.parceiro?.nome || item.parceiro?.razao_social || null,
    categoria_id: item.categoria_financeira_id,
    categoria_nome: item.categoriaFinanceira?.nome || null,
    obra_id: item.obra_id,
    obra_nome: item.obra?.nome || null,
    movimentos: movimentos.map((movimento) => ({
      id: movimento.id,
      data_movimento: movimento.data_movimento,
      status: movimento.status,
      valor_quitacao: getIntercompanyMovimentoValor(movimento),
      empresa_id: movimento.empresa_id,
      conta_bancaria_id: movimento.conta_bancaria_id
    }))
  };
}

function mapIntercompanyTransferencia(transferencia) {
  const item = toPlain(transferencia);
  const valor = getIntercompanyTransferenciaValor(item);

  return {
    id: item.id,
    status: item.status,
    descricao: item.descricao,
    data_transferencia: item.data_transferencia,
    valor_realizado: valor,
    valor_previsto: 0,
    intercompany_group_id: item.intercompany_group_id,
    tipo_intercompany: item.tipo_intercompany,
    motivo_intercompany: item.motivo_intercompany,
    elimina_consolidado: item.elimina_consolidado === true,
    transferencia_interna: item.transferencia_interna === true,
    empresa_origem_id: item.empresa_origem_id,
    empresa_origem_nome: getEmpresaNome(item.empresaOrigem),
    empresa_destino_id: item.empresa_destino_id,
    empresa_destino_nome: getEmpresaNome(item.empresaDestino),
    conta_origem_id: item.conta_origem_id,
    conta_origem_nome: item.contaOrigem?.nome || null,
    conta_destino_id: item.conta_destino_id,
    conta_destino_nome: item.contaDestino?.nome || null
  };
}

function emptyEndividamentoResumo() {
  return {
    titulos: 0,
    saldo_total: 0,
    saldo_vencido: 0,
    saldo_periodo: 0,
    saldo_30_dias: 0,
    valor_original_total: 0,
    valor_baixado_total: 0,
    empresas_com_divida: 0,
    categorias_com_divida: 0,
    credito_rotativo_saldo: 0,
    credito_rotativo_liberado_periodo: 0,
    credito_rotativo_amortizado_periodo: 0,
    movimentos_credito_rotativo: 0
  };
}

function summarizeCreditoRotativo(movimentos = [], periodo) {
  const porEmpresa = new Map();
  let saldoAberto = 0;
  let liberadoPeriodo = 0;
  let amortizadoPeriodo = 0;

  for (const movimentoModel of movimentos) {
    const movimento = toPlain(movimentoModel);
    const tipo = String(movimento.tipo_movimento || '').toUpperCase();
    const valor = roundCurrency(movimento.valor_quitacao || movimento.valor || 0);
    const isLiberacao = tipo === 'LIBERACAO_CREDITO_ROTATIVO';
    const impacto = isLiberacao ? valor : -valor;
    const noPeriodo = movimento.data_movimento >= periodo.data_inicial
      && movimento.data_movimento <= periodo.data_final;
    const empresaId = movimento.empresa_id || null;
    const key = String(empresaId || 'SEM_EMPRESA');
    const empresa = porEmpresa.get(key) || {
      empresa_id: empresaId,
      empresa_nome: getEmpresaNome(movimento.empresa),
      saldo_aberto: 0,
      liberado_periodo: 0,
      amortizado_periodo: 0,
      movimentos: 0
    };

    saldoAberto = roundCurrency(saldoAberto + impacto);
    empresa.saldo_aberto = roundCurrency(empresa.saldo_aberto + impacto);
    empresa.movimentos += 1;
    if (noPeriodo && isLiberacao) {
      liberadoPeriodo = roundCurrency(liberadoPeriodo + valor);
      empresa.liberado_periodo = roundCurrency(empresa.liberado_periodo + valor);
    }
    if (noPeriodo && !isLiberacao) {
      amortizadoPeriodo = roundCurrency(amortizadoPeriodo + valor);
      empresa.amortizado_periodo = roundCurrency(empresa.amortizado_periodo + valor);
    }
    porEmpresa.set(key, empresa);
  }

  return {
    saldo_aberto: roundCurrency(Math.max(0, saldoAberto)),
    liberado_periodo: liberadoPeriodo,
    amortizado_periodo: amortizadoPeriodo,
    movimentos: movimentos.length,
    empresas: Array.from(porEmpresa.values())
      .map((item) => ({ ...item, saldo_aberto: roundCurrency(Math.max(0, item.saldo_aberto)) }))
      .sort((a, b) => Number(b.saldo_aberto || 0) - Number(a.saldo_aberto || 0)),
    movimentacoes: movimentos
      .map((movimentoModel) => {
        const movimento = toPlain(movimentoModel);
        const tipo = String(movimento.tipo_movimento || '').toUpperCase();
        return {
          id: movimento.id,
          data_movimento: movimento.data_movimento,
          natureza: tipo === 'LIBERACAO_CREDITO_ROTATIVO' ? 'LIBERACAO' : 'AMORTIZACAO',
          valor: roundCurrency(movimento.valor_quitacao || movimento.valor || 0),
          empresa_id: movimento.empresa_id || null,
          empresa_nome: getEmpresaNome(movimento.empresa),
          documento: movimento.documento_referencia || null,
          descricao: movimento.observacoes || null
        };
      })
      .sort((a, b) => String(b.data_movimento || '').localeCompare(String(a.data_movimento || '')))
  };
}

function addEndividamentoResumo(map, key, base, titulo, periodo, hoje, limite30) {
  const item = map.get(key) || {
    ...base,
    titulos: 0,
    saldo_total: 0,
    saldo_vencido: 0,
    saldo_periodo: 0,
    saldo_30_dias: 0,
    valor_original_total: 0,
    valor_baixado_total: 0
  };
  const saldo = roundCurrency(titulo.valor_saldo || 0);
  const original = roundCurrency(titulo.valor_original || 0);
  const baixado = roundCurrency(titulo.valor_baixado || 0);
  const vencimento = titulo.data_vencimento;

  item.titulos += 1;
  item.saldo_total = roundCurrency(item.saldo_total + saldo);
  item.valor_original_total = roundCurrency(item.valor_original_total + original);
  item.valor_baixado_total = roundCurrency(item.valor_baixado_total + baixado);

  if (vencimento && vencimento < hoje) {
    item.saldo_vencido = roundCurrency(item.saldo_vencido + saldo);
  }
  if (vencimento && vencimento >= periodo.data_inicial && vencimento <= periodo.data_final) {
    item.saldo_periodo = roundCurrency(item.saldo_periodo + saldo);
  }
  if (vencimento && vencimento >= hoje && vencimento <= limite30) {
    item.saldo_30_dias = roundCurrency(item.saldo_30_dias + saldo);
  }

  map.set(key, item);
  return item;
}

function mapTituloEndividamento(titulo, periodo, hoje, limite30) {
  const item = toPlain(titulo);
  const vencimento = item.data_vencimento;

  return {
    id: item.id,
    codigo: item.codigo,
    descricao: item.descricao,
    numero_documento: item.numero_documento,
    status: item.status,
    data_vencimento: vencimento,
    vencido: Boolean(vencimento && vencimento < hoje),
    vence_no_periodo: Boolean(vencimento && vencimento >= periodo.data_inicial && vencimento <= periodo.data_final),
    vence_30_dias: Boolean(vencimento && vencimento >= hoje && vencimento <= limite30),
    valor_original: roundCurrency(item.valor_original || 0),
    valor_baixado: roundCurrency(item.valor_baixado || 0),
    valor_saldo: roundCurrency(item.valor_saldo || 0),
    empresa_id: item.empresa_id,
    empresa_nome: getEmpresaNome(item.empresa),
    categoria_id: item.categoria_financeira_id,
    categoria_nome: item.categoriaFinanceira?.nome || 'Categoria sem nome',
    obra_id: item.obra_id,
    obra_nome: item.obra?.nome || null,
    parceiro_id: item.parceiro_id,
    parceiro_nome: item.parceiro?.nome || item.parceiro?.razao_social || null,
    intercompany: item.intercompany === true,
    elimina_consolidado: item.elimina_consolidado === true
  };
}

function summarizeEndividamento(titulos = [], periodo) {
  const resumo = emptyEndividamentoResumo();
  const porEmpresa = new Map();
  const porCategoria = new Map();
  const hoje = toDateOnly(new Date());
  const limite30Date = new Date();
  limite30Date.setDate(limite30Date.getDate() + 30);
  const limite30 = toDateOnly(limite30Date);

  for (const tituloModel of titulos) {
    const titulo = toPlain(tituloModel);
    const saldo = roundCurrency(titulo.valor_saldo || 0);
    const original = roundCurrency(titulo.valor_original || 0);
    const baixado = roundCurrency(titulo.valor_baixado || 0);
    const vencimento = titulo.data_vencimento;
    const empresaId = titulo.empresa_id || null;
    const categoriaId = titulo.categoria_financeira_id || null;

    resumo.titulos += 1;
    resumo.saldo_total = roundCurrency(resumo.saldo_total + saldo);
    resumo.valor_original_total = roundCurrency(resumo.valor_original_total + original);
    resumo.valor_baixado_total = roundCurrency(resumo.valor_baixado_total + baixado);

    if (vencimento && vencimento < hoje) {
      resumo.saldo_vencido = roundCurrency(resumo.saldo_vencido + saldo);
    }
    if (vencimento && vencimento >= periodo.data_inicial && vencimento <= periodo.data_final) {
      resumo.saldo_periodo = roundCurrency(resumo.saldo_periodo + saldo);
    }
    if (vencimento && vencimento >= hoje && vencimento <= limite30) {
      resumo.saldo_30_dias = roundCurrency(resumo.saldo_30_dias + saldo);
    }

    addEndividamentoResumo(
      porEmpresa,
      String(empresaId || 'SEM_EMPRESA'),
      {
        empresa_id: empresaId,
        empresa_nome: getEmpresaNome(titulo.empresa)
      },
      titulo,
      periodo,
      hoje,
      limite30
    );
    addEndividamentoResumo(
      porCategoria,
      String(categoriaId || 'SEM_CATEGORIA'),
      {
        categoria_id: categoriaId,
        categoria_nome: titulo.categoriaFinanceira?.nome || 'Categoria sem nome'
      },
      titulo,
      periodo,
      hoje,
      limite30
    );
  }

  const sortBySaldo = (items) => Array.from(items.values())
    .sort((a, b) => Number(b.saldo_total || 0) - Number(a.saldo_total || 0));

  const empresas = sortBySaldo(porEmpresa);
  const categorias = sortBySaldo(porCategoria);

  return {
    resumo: {
      ...resumo,
      empresas_com_divida: empresas.length,
      categorias_com_divida: categorias.length
    },
    empresas,
    categorias,
    titulos: titulos
      .map((titulo) => mapTituloEndividamento(titulo, periodo, hoje, limite30))
      .sort((a, b) => (
        String(a.data_vencimento || '').localeCompare(String(b.data_vencimento || '')) ||
        Number(b.valor_saldo || 0) - Number(a.valor_saldo || 0)
      ))
  };
}

async function gerarRelatorioEndividamento(req, filters = {}) {
  await assertFinanceAccess(req);

  const periodo = resolvePeriodo(filters);
  const obraScopeWhere = await resolveObraScope(req, filters.obra_id);
  const schema = await getEndividamentoReportSchema();
  const empresaOrder = [
    ...(schema.empresaAttributes.includes('tipo_empresa') ? [['tipo_empresa', 'ASC']] : []),
    ...(schema.empresaAttributes.includes('nome') ? [['nome', 'ASC']] : [['id', 'ASC']])
  ];
  const empresas = await EmpresaGrupo.findAll({
    attributes: schema.empresaAttributes,
    order: empresaOrder
  });

  const emptyReport = (extra = {}) => ({
    filtro: {
      periodo: periodo.periodo,
      descricao: periodo.descricao,
      data_inicial: periodo.data_inicial,
      data_final: periodo.data_final,
      holding_id: filters.holding_id ? Number(filters.holding_id) : null,
      empresa_id: filters.empresa_id ? Number(filters.empresa_id) : null,
      obra_id: filters.obra_id ? Number(filters.obra_id) : null,
      excluir_intercompany: filters.excluir_intercompany !== false,
      classificacao_gerencial: 'ENDIVIDAMENTO'
    },
    resumo: emptyEndividamentoResumo(),
    empresas: [],
    categorias: [],
    titulos: [],
    credito_rotativo: summarizeCreditoRotativo([], periodo),
    schema: {
      pronto: schema.pronto,
      pendencias: [
        ...schema.tituloMissing,
        ...schema.categoriaMissing
      ],
      ...extra
    }
  });

  if (obraScopeWhere === null) {
    return emptyReport();
  }

  if (!schema.pronto) {
    return emptyReport({
      mensagem: 'O relatorio de endividamento depende de migrations financeiras pendentes no banco.'
    });
  }

  const companyScopeWhere = buildFluxoCompanyWhere(filters, empresas);
  const where = applyIntercompanyExclusion({
    tipo: 'PAGAR',
    status: { [Op.in]: ['PREVISAO', 'ABERTO', 'PARCIAL'] },
    valor_saldo: { [Op.gt]: 0 },
    ...obraScopeWhere,
    ...companyScopeWhere
  }, filters.excluir_intercompany);

  const titulos = await TituloFinanceiro.findAll({
    where,
    attributes: schema.tituloAttributes,
    include: [
      {
        model: CategoriaFinanceira,
        as: 'categoriaFinanceira',
        attributes: schema.categoriaAttributes,
        required: true,
        where: { classificacao_gerencial: 'ENDIVIDAMENTO' }
      },
      {
        model: EmpresaGrupo,
        as: 'empresa',
        attributes: schema.empresaAttributes,
        required: false
      },
      {
        model: Obra,
        as: 'obra',
        attributes: schema.obraAttributes,
        required: false
      },
      {
        model: Parceiro,
        as: 'parceiro',
        attributes: schema.parceiroAttributes,
        required: false
      }
    ],
    order: [['data_vencimento', 'ASC'], ['id', 'ASC']],
    limit: filters.limit || 1000
  });

  const movimentosCreditoRotativo = filters.obra_id ? [] : await MovimentoFinanceiro.findAll({
    where: {
      status: 'ATIVO',
      tipo_movimento: {
        [Op.in]: ['LIBERACAO_CREDITO_ROTATIVO', 'AMORTIZACAO_CREDITO_ROTATIVO']
      },
      data_movimento: { [Op.lte]: periodo.data_final },
      ...companyScopeWhere
    },
    include: [{
      model: EmpresaGrupo,
      as: 'empresa',
      attributes: schema.empresaAttributes,
      required: false
    }],
    order: [['data_movimento', 'DESC'], ['id', 'DESC']]
  });

  const endividamentoTitulos = summarizeEndividamento(titulos, periodo);
  const creditoRotativo = summarizeCreditoRotativo(movimentosCreditoRotativo, periodo);
  endividamentoTitulos.resumo.saldo_total = roundCurrency(
    endividamentoTitulos.resumo.saldo_total + creditoRotativo.saldo_aberto
  );
  endividamentoTitulos.resumo.credito_rotativo_saldo = creditoRotativo.saldo_aberto;
  endividamentoTitulos.resumo.credito_rotativo_liberado_periodo = creditoRotativo.liberado_periodo;
  endividamentoTitulos.resumo.credito_rotativo_amortizado_periodo = creditoRotativo.amortizado_periodo;
  endividamentoTitulos.resumo.movimentos_credito_rotativo = creditoRotativo.movimentos;

  return {
    filtro: {
      periodo: periodo.periodo,
      descricao: periodo.descricao,
      data_inicial: periodo.data_inicial,
      data_final: periodo.data_final,
      holding_id: filters.holding_id ? Number(filters.holding_id) : null,
      empresa_id: filters.empresa_id ? Number(filters.empresa_id) : null,
      obra_id: filters.obra_id ? Number(filters.obra_id) : null,
      excluir_intercompany: filters.excluir_intercompany !== false,
      classificacao_gerencial: 'ENDIVIDAMENTO'
    },
    ...endividamentoTitulos,
    credito_rotativo: creditoRotativo,
    schema: {
      pronto: schema.pronto,
      pendencias: [
        ...schema.tituloMissing,
        ...schema.categoriaMissing
      ]
    }
  };
}

function getFluxoPisoPrevisto(serie = []) {
  if (!Array.isArray(serie) || serie.length === 0) {
    return 0;
  }

  return serie.reduce((min, item) => Math.min(min, Number(item.saldo_previsto || 0)), 0);
}

function diffInMonthsInclusive(start, end) {
  return ((end.getFullYear() - start.getFullYear()) * 12) + (end.getMonth() - start.getMonth()) + 1;
}

function buildDreComparativoPeriodos(filters = {}) {
  const periodoBase = resolvePeriodo(filters);
  const dataInicial = parseDateOnly(periodoBase.data_inicial);
  const dataFinal = parseDateOnly(periodoBase.data_final);
  const customMonths = diffInMonthsInclusive(startOfMonth(dataInicial), startOfMonth(dataFinal));
  const meses = Math.min(Math.max(Number(filters.meses || customMonths || 12), 1), 24);
  const endCursor = startOfMonth(dataFinal);
  const startCursor = filters.meses
    ? addMonths(endCursor, (meses - 1) * -1)
    : startOfMonth(dataInicial);
  const periodos = [];
  let cursor = startCursor;

  while (cursor <= endCursor && periodos.length < 24) {
    const inicio = startOfMonth(cursor);
    const fim = endOfMonth(inicio);
    const referencia = `${inicio.getFullYear()}-${pad(inicio.getMonth() + 1)}`;

    periodos.push({
      referencia,
      label: formatBucketLabel(inicio, 'MES'),
      data_inicial: toDateOnly(inicio),
      data_final: toDateOnly(fim)
    });

    cursor = addMonths(cursor, 1);
  }

  return periodos;
}

async function gerarDreComparativoMensal(req, filters = {}) {
  await assertFinanceAccess(req);

  const periodos = buildDreComparativoPeriodos(filters);
  let acumuladoResultado = 0;
  let acumuladoEbitda = 0;
  let acumuladoReceita = 0;
  const serie = [];

  for (const periodo of periodos) {
    const dre = await gerarDreGerencial(req, {
      ...filters,
      periodo: 'PERSONALIZADO',
      data_inicial: periodo.data_inicial,
      data_final: periodo.data_final
    });
    const resumo = dre?.resumo || {};
    const receitaLiquida = roundCurrency(resumo.receita_liquida || 0);
    const ebitda = roundCurrency(resumo.ebitda || 0);
    const lucroLiquido = roundCurrency(resumo.lucro_prejuizo_liquido ?? resumo.resultado ?? 0);

    acumuladoReceita = roundCurrency(acumuladoReceita + receitaLiquida);
    acumuladoEbitda = roundCurrency(acumuladoEbitda + ebitda);
    acumuladoResultado = roundCurrency(acumuladoResultado + lucroLiquido);

    serie.push({
      referencia: periodo.referencia,
      label: periodo.label,
      data_inicial: periodo.data_inicial,
      data_final: periodo.data_final,
      receita_liquida: receitaLiquida,
      ebitda,
      lucro_prejuizo_liquido: lucroLiquido,
      margem_ebitda: resumo.margem_ebitda ?? null,
      margem_liquida: resumo.margem_liquida ?? resumo.margem_resultado ?? null,
      acumulado_receita_liquida: acumuladoReceita,
      acumulado_ebitda: acumuladoEbitda,
      acumulado_lucro_prejuizo_liquido: acumuladoResultado,
      titulos_considerados: Number(resumo.titulos_considerados || 0),
      movimentos_avulsos_considerados: Number(resumo.movimentos_avulsos_considerados || 0)
    });
  }

  const margemEbitdaAcumulada = acumuladoReceita > 0 ? Number(((acumuladoEbitda / acumuladoReceita) * 100).toFixed(2)) : null;
  const margemLiquidaAcumulada = acumuladoReceita > 0 ? Number(((acumuladoResultado / acumuladoReceita) * 100).toFixed(2)) : null;

  return {
    filtro: {
      meses: serie.length,
      holding_id: filters.holding_id ? Number(filters.holding_id) : null,
      empresa_id: filters.empresa_id ? Number(filters.empresa_id) : null,
      obra_id: filters.obra_id ? Number(filters.obra_id) : null,
      excluir_intercompany: filters.excluir_intercompany !== false,
      data_inicial: serie[0]?.data_inicial || null,
      data_final: serie[serie.length - 1]?.data_final || null
    },
    resumo: {
      receita_liquida: acumuladoReceita,
      ebitda: acumuladoEbitda,
      lucro_prejuizo_liquido: acumuladoResultado,
      margem_ebitda: margemEbitdaAcumulada,
      margem_liquida: margemLiquidaAcumulada
    },
    serie
  };
}

function indexDreEmpresas(empresas = []) {
  return new Map(empresas.map((empresa) => [String(empresa.empresa_id || 'SEM_EMPRESA'), empresa]));
}

function buildDreComparativoCategorias(categoriasOperacionais = [], categoriasFinais = []) {
  const operacionais = new Map(
    normalizeDreCategorias(categoriasOperacionais).map((categoria) => [categoria.categoria_key, categoria])
  );
  const finais = new Map(
    normalizeDreCategorias(categoriasFinais).map((categoria) => [categoria.categoria_key, categoria])
  );
  const keys = new Set([...operacionais.keys(), ...finais.keys()]);

  return Array.from(keys)
    .map((key) => {
      const operacional = operacionais.get(key);
      const final = finais.get(key);
      const base = operacional || final;
      const resultadoOperacional = Number(operacional?.valor || 0);
      const resultadoFinal = Number(final?.valor || 0);

      return {
        categoria_key: key,
        categoria_id: base?.categoria_id || null,
        codigo: base?.codigo || null,
        nome: base?.nome || 'Categoria sem nome',
        tipo: base?.tipo || null,
        grupo: base?.grupo || null,
        subgrupo: base?.subgrupo || null,
        ordem: base?.ordem ?? 999,
        resultado_operacional_proprio: roundCurrency(resultadoOperacional),
        intercompany_liquido: roundCurrency(resultadoFinal - resultadoOperacional),
        resultado_final: roundCurrency(resultadoFinal),
        titulos_operacionais: Number(operacional?.titulos || 0),
        titulos_finais: Number(final?.titulos || 0),
        movimentos_operacionais: Number(operacional?.movimentos || 0),
        movimentos_finais: Number(final?.movimentos || 0)
      };
    })
    .sort((a, b) => (
      Number(a.ordem || 999) - Number(b.ordem || 999) ||
      String(a.codigo || '').localeCompare(String(b.codigo || '')) ||
      String(a.nome || '').localeCompare(String(b.nome || ''))
    ));
}

function buildDreEmpresaComparativoItem(empresa, finalPorEmpresa) {
  const key = String(empresa.empresa_id || 'SEM_EMPRESA');
  const finalEmpresa = finalPorEmpresa.get(key) || empresa;
  const resultadoOperacional = Number(empresa.lucro_prejuizo_liquido ?? empresa.resultado ?? 0);
  const resultadoFinal = Number(finalEmpresa.lucro_prejuizo_liquido ?? finalEmpresa.resultado ?? 0);
  const intercompanyLiquido = roundCurrency(resultadoFinal - resultadoOperacional);
  const receitaOperacional = roundCurrency(empresa.receita_liquida || 0);
  const dependenciaGrupo = receitaOperacional > 0 && intercompanyLiquido > 0
    ? Number(((intercompanyLiquido / receitaOperacional) * 100).toFixed(2))
    : 0;

  return {
    empresa_id: empresa.empresa_id || null,
    empresa_nome: empresa.empresa_nome,
    tipo_empresa: empresa.tipo_empresa || null,
    tipo_gerencial: empresa.tipo_gerencial || null,
    empresa_caixa: empresa.empresa_caixa === true,
    empresa_operacional: empresa.empresa_operacional !== false,
    consolidar_no_grupo: empresa.consolidar_no_grupo !== false,
    holding_id: empresa.holding_id || null,
    receita_liquida_operacional: receitaOperacional,
    ebitda_operacional: roundCurrency(empresa.ebitda || 0),
    resultado_operacional_proprio: roundCurrency(resultadoOperacional),
    margem_operacional: empresa.margem_liquida ?? empresa.margem_resultado ?? null,
    intercompany_liquido: intercompanyLiquido,
    resultado_final: roundCurrency(resultadoFinal),
    margem_final: finalEmpresa.margem_liquida ?? finalEmpresa.margem_resultado ?? null,
    dependencia_grupo: dependenciaGrupo,
    titulos_operacionais: Number(empresa.titulos || 0),
    titulos_finais: Number(finalEmpresa.titulos || 0),
    categorias: buildDreComparativoCategorias(empresa.categorias, finalEmpresa.categorias)
  };
}

async function gerarDreComparativoEmpresas(req, filters = {}) {
  await assertFinanceAccess(req);

  const filtrosBase = {
    ...filters,
    excluir_intercompany: true
  };
  const filtrosFinal = {
    ...filters,
    excluir_intercompany: false
  };
  const [dreOperacional, dreFinal] = await Promise.all([
    gerarDreGerencial(req, filtrosBase),
    gerarDreGerencial(req, filtrosFinal)
  ]);
  const finalPorEmpresa = indexDreEmpresas(dreFinal.empresas || []);
  const operacionalPorEmpresa = indexDreEmpresas(dreOperacional.empresas || []);
  const empresasKeys = new Set([
    ...operacionalPorEmpresa.keys(),
    ...finalPorEmpresa.keys()
  ]);
  const empresas = Array.from(empresasKeys)
    .map((key) => {
      const operacional = operacionalPorEmpresa.get(key);
      const final = finalPorEmpresa.get(key);
      return buildDreEmpresaComparativoItem(operacional || final, finalPorEmpresa);
    })
    .sort((a, b) => Math.abs(Number(b.resultado_final || 0)) - Math.abs(Number(a.resultado_final || 0)));

  const resumo = empresas.reduce((acc, empresa) => ({
    receita_liquida_operacional: roundCurrency(acc.receita_liquida_operacional + empresa.receita_liquida_operacional),
    ebitda_operacional: roundCurrency(acc.ebitda_operacional + empresa.ebitda_operacional),
    resultado_operacional_proprio: roundCurrency(acc.resultado_operacional_proprio + empresa.resultado_operacional_proprio),
    intercompany_liquido: roundCurrency(acc.intercompany_liquido + empresa.intercompany_liquido),
    resultado_final: roundCurrency(acc.resultado_final + empresa.resultado_final),
    empresas_com_movimento: acc.empresas_com_movimento + 1
  }), {
    receita_liquida_operacional: 0,
    ebitda_operacional: 0,
    resultado_operacional_proprio: 0,
    intercompany_liquido: 0,
    resultado_final: 0,
    empresas_com_movimento: 0
  });

  return {
    filtro: {
      ...dreOperacional.filtro,
      comparacao: 'EMPRESAS',
      regra_operacional_propria: 'DRE com movimentos entre empresas eliminados',
      regra_resultado_final: 'DRE com movimentos entre empresas mantidos'
    },
    resumo: {
      ...resumo,
      margem_operacional: resumo.receita_liquida_operacional > 0
        ? Number(((resumo.resultado_operacional_proprio / resumo.receita_liquida_operacional) * 100).toFixed(2))
        : null,
      margem_final: resumo.receita_liquida_operacional > 0
        ? Number(((resumo.resultado_final / resumo.receita_liquida_operacional) * 100).toFixed(2))
        : null
    },
    empresas
  };
}

function buildExecutiveRisk({ codigo, titulo, severidade, descricao, valor = null, acao, rota = null }) {
  return {
    codigo,
    titulo,
    severidade,
    descricao,
    valor,
    acao_recomendada: acao,
    rota
  };
}

function buildExecutiveRisks({ dre, fluxo, intercompany, endividamento, diagnostico }) {
  const riscos = [];
  const dreResumo = dre?.resumo || {};
  const fluxoResumo = fluxo?.resumo || {};
  const intercompanyResumo = intercompany?.resumo || {};
  const endividamentoResumo = endividamento?.resumo || {};
  const diagnosticoResumo = diagnostico?.resumo || {};
  const lucroLiquido = Number(dreResumo.lucro_prejuizo_liquido ?? dreResumo.resultado ?? 0);
  const ebitda = Number(dreResumo.ebitda || 0);
  const pisoPrevisto = getFluxoPisoPrevisto(fluxo?.serie);
  const necessidadeCaixa = Math.max(0, Math.abs(Math.min(0, pisoPrevisto)));
  const pendenciasCriticas = Number(diagnosticoResumo.pendencias_criticas || 0);
  const pendenciasAltas = Number(diagnosticoResumo.pendencias_altas || 0);
  const saldoVencidoEndividamento = Number(endividamentoResumo.saldo_vencido || 0);
  const intercompanyNaoEliminado = Number(intercompanyResumo.valor_nao_eliminado_consolidado || 0);

  if (lucroLiquido < 0) {
    riscos.push(buildExecutiveRisk({
      codigo: 'LUCRO_LIQUIDO_NEGATIVO',
      titulo: 'Prejuizo liquido no periodo',
      severidade: 'ALTA',
      descricao: 'A DRE gerencial indica consumo de patrimonio no periodo selecionado.',
      valor: roundCurrency(lucroLiquido),
      acao: 'Abra a DRE para localizar categorias e empresas que puxaram o resultado para baixo.',
      rota: '/financeiro/relatorios/dre'
    }));
  }

  if (ebitda < 0) {
    riscos.push(buildExecutiveRisk({
      codigo: 'EBITDA_NEGATIVO',
      titulo: 'EBITDA negativo',
      severidade: 'ALTA',
      descricao: 'A operacao principal nao esta cobrindo seus custos e despesas operacionais no periodo.',
      valor: roundCurrency(ebitda),
      acao: 'Revise receita liquida, custo de obras e despesas administrativas antes de analisar resultado financeiro.',
      rota: '/financeiro/relatorios/dre'
    }));
  }

  if (necessidadeCaixa > 0) {
    riscos.push(buildExecutiveRisk({
      codigo: 'NECESSIDADE_CAIXA',
      titulo: 'Necessidade futura de caixa',
      severidade: 'CRITICA',
      descricao: 'O fluxo previsto atinge saldo negativo dentro do periodo analisado.',
      valor: roundCurrency(necessidadeCaixa),
      acao: 'Abra o fluxo consolidado para ver quando o caixa fica negativo e quais pagamentos concentram o risco.',
      rota: '/financeiro/relatorios/fluxo-consolidado'
    }));
  }

  if (pendenciasCriticas > 0 || pendenciasAltas > 0) {
    riscos.push(buildExecutiveRisk({
      codigo: 'QUALIDADE_DADOS_DRE',
      titulo: 'Pendencias que afetam a confiabilidade gerencial',
      severidade: pendenciasCriticas > 0 ? 'CRITICA' : 'ALTA',
      descricao: 'Existem cadastros, titulos, baixas ou transferencias que impedem leitura totalmente confiavel.',
      valor: pendenciasCriticas + pendenciasAltas,
      acao: 'Execute o Diagnostico DRE e corrija os itens criticos antes de usar a tela em fechamento executivo.',
      rota: '/financeiro/relatorios/dre/diagnostico'
    }));
  }

  if (saldoVencidoEndividamento > 0) {
    riscos.push(buildExecutiveRisk({
      codigo: 'ENDIVIDAMENTO_VENCIDO',
      titulo: 'Endividamento vencido',
      severidade: 'ALTA',
      descricao: 'Ha titulos classificados como endividamento com vencimento anterior a hoje.',
      valor: roundCurrency(saldoVencidoEndividamento),
      acao: 'Abra o relatorio de endividamento e priorize renegociacao, quitacao ou reclassificacao quando o cadastro estiver errado.',
      rota: '/financeiro/relatorios/endividamento'
    }));
  }

  if (intercompanyNaoEliminado > 0) {
    riscos.push(buildExecutiveRisk({
      codigo: 'INTERCOMPANY_NAO_ELIMINADO',
      titulo: 'Movimento entre empresas nao eliminado no consolidado',
      severidade: 'MEDIA',
      descricao: 'Existem movimentos entre empresas marcados para permanecer no consolidado.',
      valor: roundCurrency(intercompanyNaoEliminado),
      acao: 'Confirme se esses movimentos realmente devem permanecer no resultado consolidado do grupo.',
      rota: '/financeiro/relatorios/intercompany'
    }));
  }

  if (Number(fluxoResumo.movimentos_realizados || 0) === 0 && Number(fluxoResumo.saldo_previsto || 0) !== 0) {
    riscos.push(buildExecutiveRisk({
      codigo: 'SEM_BAIXAS_PERIODO',
      titulo: 'Sem baixas realizadas no periodo',
      severidade: 'MEDIA',
      descricao: 'Ha fluxo previsto, mas nenhum movimento realizado para o periodo filtrado.',
      valor: Number(fluxoResumo.saldo_previsto || 0),
      acao: 'Confira se as baixas ainda nao foram registradas ou se o periodo escolhido e apenas projetado.',
      rota: '/financeiro/baixas'
    }));
  }

  return riscos.sort((a, b) => {
    const peso = { CRITICA: 0, ALTA: 1, MEDIA: 2, BAIXA: 3 };
    return (peso[a.severidade] ?? 9) - (peso[b.severidade] ?? 9);
  });
}

function buildExecutiveResumo({ dre, fluxo, intercompany, endividamento, diagnostico }) {
  const dreResumo = dre?.resumo || {};
  const fluxoResumo = fluxo?.resumo || {};
  const intercompanyResumo = intercompany?.resumo || {};
  const endividamentoResumo = endividamento?.resumo || {};
  const diagnosticoResumo = diagnostico?.resumo || {};
  const lucroLiquido = Number(dreResumo.lucro_prejuizo_liquido ?? dreResumo.resultado ?? 0);
  const pisoPrevisto = getFluxoPisoPrevisto(fluxo?.serie);
  const necessidadeCaixa = Math.max(0, Math.abs(Math.min(0, pisoPrevisto)));

  return {
    receita_liquida: roundCurrency(dreResumo.receita_liquida || dreResumo.receitas || 0),
    ebitda: roundCurrency(dreResumo.ebitda || 0),
    margem_ebitda: Number(dreResumo.margem_ebitda || 0),
    lucro_prejuizo_liquido: roundCurrency(lucroLiquido),
    margem_liquida: Number(dreResumo.margem_liquida ?? dreResumo.margem_resultado ?? 0),
    caixa_realizado: roundCurrency(fluxoResumo.saldo_realizado || 0),
    saldo_previsto: roundCurrency(fluxoResumo.saldo_previsto || 0),
    piso_caixa_previsto: roundCurrency(pisoPrevisto),
    necessidade_futura_caixa: roundCurrency(necessidadeCaixa),
    intercompany_eliminado: roundCurrency(intercompanyResumo.valor_eliminado_consolidado || 0),
    intercompany_nao_eliminado: roundCurrency(intercompanyResumo.valor_nao_eliminado_consolidado || 0),
    endividamento_aberto: roundCurrency(endividamentoResumo.saldo_total || 0),
    endividamento_vencido: roundCurrency(endividamentoResumo.saldo_vencido || 0),
    pendencias_dados: Number(diagnosticoResumo.total_pendencias || 0),
    pendencias_criticas: Number(diagnosticoResumo.pendencias_criticas || 0),
    pendencias_altas: Number(diagnosticoResumo.pendencias_altas || 0)
  };
}

async function gerarPainelExecutivoGrupo(req, filters = {}) {
  await assertFinanceAccess(req);

  const filtrosBase = {
    periodo: filters.periodo,
    data_inicial: filters.data_inicial,
    data_final: filters.data_final,
    holding_id: filters.holding_id,
    excluir_intercompany: filters.excluir_intercompany !== false
  };
  const intercompanyFilters = {
    periodo: filters.periodo,
    data_inicial: filters.data_inicial,
    data_final: filters.data_final,
    holding_id: filters.holding_id,
    elimina_consolidado: filters.excluir_intercompany !== false ? true : undefined
  };

  const [
    dre,
    fluxo,
    intercompany,
    endividamento,
    diagnostico
  ] = await Promise.all([
    gerarDreGerencial(req, filtrosBase),
    gerarRelatorioFluxoConsolidado(req, filtrosBase),
    gerarRelatorioIntercompany(req, intercompanyFilters),
    gerarRelatorioEndividamento(req, filtrosBase),
    gerarDiagnosticoDre(req)
  ]);

  const resumo = buildExecutiveResumo({
    dre,
    fluxo,
    intercompany,
    endividamento,
    diagnostico
  });
  const riscos = buildExecutiveRisks({
    dre,
    fluxo,
    intercompany,
    endividamento,
    diagnostico
  });

  return {
    gerado_em: new Date().toISOString(),
    filtro: {
      periodo: dre?.filtro?.periodo || fluxo?.filtro?.periodo || filters.periodo || 'MES_ATUAL',
      descricao: dre?.filtro?.descricao || fluxo?.filtro?.descricao || null,
      data_inicial: dre?.filtro?.data_inicial || fluxo?.filtro?.data_inicial || null,
      data_final: dre?.filtro?.data_final || fluxo?.filtro?.data_final || null,
      holding_id: filters.holding_id ? Number(filters.holding_id) : null,
      excluir_intercompany: filtrosBase.excluir_intercompany
    },
    resumo,
    riscos,
    fontes: {
      dre,
      fluxo,
      intercompany,
      endividamento,
      diagnostico
    }
  };
}

function summarizeIntercompany(titulos = [], transferencias = []) {
  const porTipo = new Map();
  const porOrigem = new Map();
  const porDestino = new Map();
  const relacoes = new Map();
  const grupos = new Map();

  const resumo = {
    titulos: titulos.length,
    transferencias: transferencias.length,
    valor_previsto: 0,
    valor_realizado: 0,
    valor_eliminado_consolidado: 0,
    valor_nao_eliminado_consolidado: 0,
    transferencias_internas: 0,
    grupos_intercompany: 0,
    relacoes_empresas: 0
  };

  for (const titulo of titulos) {
    const previsto = getIntercompanyTituloValor(titulo);
    const movimentos = Array.isArray(titulo.movimentos) ? titulo.movimentos : [];
    const realizado = roundCurrency(movimentos.reduce((sum, movimento) => (
      sum + getIntercompanyMovimentoValor(movimento)
    ), 0));
    const tipo = titulo.tipo_intercompany || 'SEM_TIPO';
    const origemId = titulo.empresa_origem_id || null;
    const destinoId = titulo.empresa_destino_id || null;
    const origemNome = getEmpresaNome(titulo.empresaOrigem);
    const destinoNome = getEmpresaNome(titulo.empresaDestino);
    const relacaoKey = `${origemId || 'SEM_ORIGEM'}:${destinoId || 'SEM_DESTINO'}`;

    resumo.valor_previsto = roundCurrency(resumo.valor_previsto + previsto);
    resumo.valor_realizado = roundCurrency(resumo.valor_realizado + realizado);
    if (titulo.elimina_consolidado === true) {
      resumo.valor_eliminado_consolidado = roundCurrency(resumo.valor_eliminado_consolidado + previsto);
    } else {
      resumo.valor_nao_eliminado_consolidado = roundCurrency(resumo.valor_nao_eliminado_consolidado + previsto);
    }
    if (titulo.transferencia_interna === true) {
      resumo.transferencias_internas += 1;
    }
    if (titulo.intercompany_group_id) {
      grupos.set(titulo.intercompany_group_id, true);
    }

    addIntercompanyResumo(porTipo, tipo, {
      tipo_intercompany: tipo
    }, previsto, realizado);

    addIntercompanyResumo(porOrigem, String(origemId || 'SEM_ORIGEM'), {
      empresa_id: origemId,
      empresa_nome: origemNome
    }, previsto, realizado);

    addIntercompanyResumo(porDestino, String(destinoId || 'SEM_DESTINO'), {
      empresa_id: destinoId,
      empresa_nome: destinoNome
    }, previsto, realizado);

    addIntercompanyResumo(relacoes, relacaoKey, {
      empresa_origem_id: origemId,
      empresa_origem_nome: origemNome,
      empresa_destino_id: destinoId,
      empresa_destino_nome: destinoNome
    }, previsto, realizado);
  }

  for (const transferencia of transferencias) {
    const valor = getIntercompanyTransferenciaValor(transferencia);
    const tipo = transferencia.tipo_intercompany || 'SEM_TIPO';
    const origemId = transferencia.empresa_origem_id || null;
    const destinoId = transferencia.empresa_destino_id || null;
    const origemNome = getEmpresaNome(transferencia.empresaOrigem);
    const destinoNome = getEmpresaNome(transferencia.empresaDestino);
    const relacaoKey = `${origemId || 'SEM_ORIGEM'}:${destinoId || 'SEM_DESTINO'}`;

    resumo.valor_realizado = roundCurrency(resumo.valor_realizado + valor);
    if (transferencia.elimina_consolidado === true) {
      resumo.valor_eliminado_consolidado = roundCurrency(resumo.valor_eliminado_consolidado + valor);
    } else {
      resumo.valor_nao_eliminado_consolidado = roundCurrency(resumo.valor_nao_eliminado_consolidado + valor);
    }
    if (transferencia.transferencia_interna === true) {
      resumo.transferencias_internas += 1;
    }
    if (transferencia.intercompany_group_id) {
      grupos.set(transferencia.intercompany_group_id, true);
    }

    addIntercompanyResumo(porTipo, tipo, {
      tipo_intercompany: tipo
    }, 0, valor, 1, 'transferencias');

    addIntercompanyResumo(porOrigem, String(origemId || 'SEM_ORIGEM'), {
      empresa_id: origemId,
      empresa_nome: origemNome
    }, 0, valor, 1, 'transferencias');

    addIntercompanyResumo(porDestino, String(destinoId || 'SEM_DESTINO'), {
      empresa_id: destinoId,
      empresa_nome: destinoNome
    }, 0, valor, 1, 'transferencias');

    addIntercompanyResumo(relacoes, relacaoKey, {
      empresa_origem_id: origemId,
      empresa_origem_nome: origemNome,
      empresa_destino_id: destinoId,
      empresa_destino_nome: destinoNome
    }, 0, valor, 1, 'transferencias');
  }

  resumo.grupos_intercompany = grupos.size;
  resumo.relacoes_empresas = relacoes.size;

  const sortByValue = (items) => Array.from(items.values())
    .map((item) => ({
      ...item,
      valor_previsto: roundCurrency(item.valor_previsto),
      valor_realizado: roundCurrency(item.valor_realizado)
    }))
    .sort((a, b) => Number(b.valor_previsto || 0) - Number(a.valor_previsto || 0));

  return {
    resumo,
    por_tipo: sortByValue(porTipo),
    por_origem: sortByValue(porOrigem),
    por_destino: sortByValue(porDestino),
    relacoes: sortByValue(relacoes)
  };
}

async function gerarRelatorioIntercompany(req, filters = {}) {
  await assertFinanceAccess(req);

  const tituloStatuses = ['PREVISAO', 'ABERTO', 'PARCIAL', 'QUITADO', 'CANCELADO', 'ESTORNADO'];
  const transferenciaStatuses = ['ATIVA', 'CANCELADA'];
  const periodo = resolvePeriodo(filters);
  const schema = await getIntercompanyReportSchema();
  const empresaOrder = [
    ...(schema.empresaAttributes.includes('tipo_empresa') ? [['tipo_empresa', 'ASC']] : []),
    ...(schema.empresaAttributes.includes('nome') ? [['nome', 'ASC']] : [['id', 'ASC']])
  ];
  const empresas = await EmpresaGrupo.findAll({
    attributes: schema.empresaAttributes,
    order: empresaOrder
  });
  const empresaIdsHolding = getEmpresaIdsDaHolding(empresas, filters.holding_id);
  const andConditions = [getCompetenciaWhere(periodo)];

  const emptyReport = (extra = {}) => ({
    filtro: {
      periodo: periodo.periodo,
      descricao: periodo.descricao,
      data_inicial: periodo.data_inicial,
      data_final: periodo.data_final,
      holding_id: filters.holding_id ? Number(filters.holding_id) : null,
      empresa_id: filters.empresa_id ? Number(filters.empresa_id) : null,
      tipo_intercompany: filters.tipo_intercompany || null,
      status: filters.status || null,
      elimina_consolidado: filters.elimina_consolidado ?? null,
      limit: filters.limit || 1000
    },
    ...summarizeIntercompany([], []),
    titulos: [],
    transferencias: [],
    schema: {
      pronto: schema.pronto,
      pendencias: [
        ...schema.tituloMissing,
        ...schema.transferenciaMissing
      ],
      ...extra
    }
  });

  if (schema.tituloMissing.length) {
    return emptyReport({
      mensagem: 'O relatorio Entre Empresas depende de migrations financeiras pendentes no banco.'
    });
  }

  if (filters.empresa_id) {
    const empresaId = Number(filters.empresa_id);
    andConditions.push({
      [Op.or]: [
        { empresa_id: empresaId },
        { empresa_origem_id: empresaId },
        { empresa_destino_id: empresaId }
      ]
    });
  } else if (empresaIdsHolding) {
    andConditions.push({
      [Op.or]: [
        { empresa_id: { [Op.in]: empresaIdsHolding } },
        { empresa_origem_id: { [Op.in]: empresaIdsHolding } },
        { empresa_destino_id: { [Op.in]: empresaIdsHolding } }
      ]
    });
  }

  const where = {
    intercompany: true,
    [Op.and]: andConditions
  };

  if (filters.tipo_intercompany) {
    where.tipo_intercompany = filters.tipo_intercompany;
  }
  if (filters.status) {
    where.status = tituloStatuses.includes(filters.status) ? filters.status : '__SEM_STATUS__';
  }
  if (filters.elimina_consolidado !== undefined) {
    where.elimina_consolidado = filters.elimina_consolidado;
  }

  const titulos = await TituloFinanceiro.findAll({
    where,
    attributes: schema.tituloAttributes,
    include: [
      {
        model: EmpresaGrupo,
        as: 'empresa',
        attributes: schema.empresaAttributes,
        required: false
      },
      {
        model: EmpresaGrupo,
        as: 'empresaOrigem',
        attributes: schema.empresaAttributes,
        required: false
      },
      {
        model: EmpresaGrupo,
        as: 'empresaDestino',
        attributes: schema.empresaAttributes,
        required: false
      },
      {
        model: Parceiro,
        as: 'parceiro',
        attributes: schema.parceiroAttributes,
        required: false
      },
      {
        model: CategoriaFinanceira,
        as: 'categoriaFinanceira',
        attributes: schema.categoriaAttributes,
        required: false
      },
      {
        model: Obra,
        as: 'obra',
        attributes: schema.obraAttributes,
        required: false
      },
      {
        model: MovimentoFinanceiro,
        as: 'movimentos',
        attributes: ['id', 'data_movimento', 'status', 'valor_quitacao', 'empresa_id', 'conta_bancaria_id'],
        required: false,
        where: {
          status: 'ATIVO',
          data_movimento: {
            [Op.between]: [periodo.data_inicial, periodo.data_final]
          }
        }
      }
    ],
    order: [['competencia_data', 'ASC'], ['data_vencimento', 'ASC'], ['id', 'ASC']],
    limit: filters.limit || 1000
  });

  const transferenciaAndConditions = [{
    data_transferencia: {
      [Op.between]: [periodo.data_inicial, periodo.data_final]
    }
  }];

  if (filters.empresa_id) {
    const empresaId = Number(filters.empresa_id);
    transferenciaAndConditions.push({
      [Op.or]: [
        { empresa_id: empresaId },
        { empresa_origem_id: empresaId },
        { empresa_destino_id: empresaId }
      ]
    });
  } else if (empresaIdsHolding) {
    transferenciaAndConditions.push({
      [Op.or]: [
        { empresa_id: { [Op.in]: empresaIdsHolding } },
        { empresa_origem_id: { [Op.in]: empresaIdsHolding } },
        { empresa_destino_id: { [Op.in]: empresaIdsHolding } }
      ]
    });
  }

  let transferencias = [];

  if (!schema.transferenciaMissing.length) {
    const whereTransferencias = {
      tipo_intercompany: { [Op.ne]: null },
      [Op.and]: transferenciaAndConditions
    };

    if (filters.tipo_intercompany) {
      whereTransferencias.tipo_intercompany = filters.tipo_intercompany;
    }
    if (filters.status) {
      whereTransferencias.status = transferenciaStatuses.includes(filters.status) ? filters.status : '__SEM_STATUS__';
    } else if (!filters.status) {
      whereTransferencias.status = 'ATIVA';
    }
    if (filters.elimina_consolidado !== undefined) {
      whereTransferencias.elimina_consolidado = filters.elimina_consolidado;
    }

    transferencias = await TransferenciaFinanceira.findAll({
      where: whereTransferencias,
      attributes: schema.transferenciaAttributes,
      include: [
        {
          model: EmpresaGrupo,
          as: 'empresaOrigem',
          attributes: schema.empresaAttributes,
          required: false
        },
        {
          model: EmpresaGrupo,
          as: 'empresaDestino',
          attributes: schema.empresaAttributes,
          required: false
        },
        {
          model: ContaBancaria,
          as: 'contaOrigem',
          attributes: schema.contaAttributes,
          required: false
        },
        {
          model: ContaBancaria,
          as: 'contaDestino',
          attributes: schema.contaAttributes,
          required: false
        }
      ],
      order: [['data_transferencia', 'ASC'], ['id', 'ASC']],
      limit: filters.limit || 1000
    });
  }

  return {
    filtro: {
      periodo: periodo.periodo,
      descricao: periodo.descricao,
      data_inicial: periodo.data_inicial,
      data_final: periodo.data_final,
      holding_id: filters.holding_id ? Number(filters.holding_id) : null,
      empresa_id: filters.empresa_id ? Number(filters.empresa_id) : null,
      tipo_intercompany: filters.tipo_intercompany || null,
      status: filters.status || null,
      elimina_consolidado: filters.elimina_consolidado ?? null,
      limit: filters.limit || 1000
    },
    ...summarizeIntercompany(titulos, transferencias),
    titulos: titulos.map(mapIntercompanyTitulo),
    transferencias: transferencias.map(mapIntercompanyTransferencia),
    schema: {
      pronto: schema.pronto,
      pendencias: [
        ...schema.tituloMissing,
        ...schema.transferenciaMissing
      ]
    }
  };
}

function toPlain(model) {
  return model?.get ? model.get({ plain: true }) : model;
}

function buildTituloDiagnosticoWhere(scopeWhere = {}, extraWhere = {}) {
  return {
    considera_dre: true,
    ...scopeWhere,
    ...extraWhere
  };
}

function getTituloDiagnosticoInclude(extraIncludes = []) {
  const hasCategoriaOverride = extraIncludes.some((include) => include?.as === 'categoriaFinanceira');

  return [
    {
      model: Obra,
      as: 'obra',
      attributes: ['id', 'codigo', 'nome', 'tipo_centro_custo', 'empresa_grupo_id'],
      required: true
    },
    {
      model: EmpresaGrupo,
      as: 'empresa',
      attributes: ['id', 'codigo', 'nome', 'tipo_empresa', 'holding_id'],
      required: false
    },
    !hasCategoriaOverride
      ? {
          model: CategoriaFinanceira,
          as: 'categoriaFinanceira',
          attributes: ['id', 'nome', 'tipo', 'dre_grupo', 'dre_subgrupo', 'dre_ordem', 'considera_dre'],
          required: false
        }
      : null,
    ...extraIncludes
  ].filter(Boolean);
}

function mapTituloDiagnostico(titulo) {
  const item = toPlain(titulo);
  return {
    id: item.id,
    codigo: item.codigo,
    tipo: item.tipo,
    status: item.status,
    descricao: item.descricao,
    valor_original: Number(item.valor_original || 0),
    data_emissao: item.data_emissao,
    data_vencimento: item.data_vencimento,
    competencia_data: item.competencia_data,
    empresa_id: item.empresa_id,
    empresa_nome: item.empresa?.nome || null,
    intercompany: item.intercompany,
    empresa_contraparte_id: item.empresa_contraparte_id,
    empresa_origem_id: item.empresa_origem_id,
    empresa_destino_id: item.empresa_destino_id,
    tipo_intercompany: item.tipo_intercompany,
    obra_id: item.obra_id,
    obra_nome: item.obra?.nome || null,
    obra_empresa_grupo_id: item.obra?.empresa_grupo_id || null,
    categoria_id: item.categoria_financeira_id,
    categoria_nome: item.categoriaFinanceira?.nome || null
  };
}

function mapObraDiagnostico(obra) {
  const item = toPlain(obra);
  return {
    id: item.id,
    codigo: item.codigo,
    nome: item.nome,
    tipo_centro_custo: item.tipo_centro_custo,
    empresa_grupo_id: item.empresa_grupo_id,
    empresa_nome: item.empresaGrupo?.nome || null
  };
}

function mapEmpresaDiagnostico(empresa) {
  const item = toPlain(empresa);
  return {
    id: item.id,
    codigo: item.codigo,
    nome: item.nome,
    tipo_empresa: item.tipo_empresa,
    tipo_gerencial: item.tipo_gerencial,
    empresa_caixa: item.empresa_caixa,
    empresa_operacional: item.empresa_operacional,
    consolidar_no_grupo: item.consolidar_no_grupo,
    holding_id: item.holding_id,
    holding_nome: item.holding?.nome || null
  };
}

function mapCategoriaDiagnostico(categoria) {
  const item = toPlain(categoria);
  return {
    id: item.id,
    nome: item.nome,
    tipo: item.tipo,
    dre_grupo: item.dre_grupo,
    dre_subgrupo: item.dre_subgrupo,
    dre_ordem: item.dre_ordem,
    considera_dre: item.considera_dre
  };
}

function getMovimentoDiagnosticoInclude(scopeWhere) {
  return [
    {
      model: TituloFinanceiro,
      as: 'titulo',
      attributes: ['id', 'codigo', 'descricao', 'tipo', 'status', 'empresa_id', 'obra_id', 'considera_dre'],
      where: buildTituloDiagnosticoWhere(scopeWhere),
      required: true,
      include: [
        {
          model: Obra,
          as: 'obra',
          attributes: ['id', 'codigo', 'nome', 'tipo_centro_custo', 'empresa_grupo_id'],
          required: false
        },
        {
          model: EmpresaGrupo,
          as: 'empresa',
          attributes: ['id', 'codigo', 'nome', 'tipo_empresa', 'holding_id'],
          required: false
        }
      ]
    },
    {
      model: EmpresaGrupo,
      as: 'empresa',
      attributes: ['id', 'codigo', 'nome', 'tipo_empresa', 'holding_id'],
      required: false
    },
    {
      model: EmpresaGrupo,
      as: 'empresaOrigem',
      attributes: ['id', 'codigo', 'nome'],
      required: false
    },
    {
      model: EmpresaGrupo,
      as: 'empresaDestino',
      attributes: ['id', 'codigo', 'nome'],
      required: false
    },
    {
      model: ContaBancaria,
      as: 'contaBancaria',
      attributes: ['id', 'nome', 'banco', 'agencia', 'conta'],
      required: false
    }
  ];
}

function mapMovimentoDiagnostico(movimento) {
  const item = toPlain(movimento);
  return {
    id: item.id,
    tipo: item.tipo_movimento,
    status: item.status,
    descricao: item.observacoes || item.titulo?.descricao || null,
    valor: Number(item.valor_quitacao || item.valor || 0),
    valor_quitacao: Number(item.valor_quitacao || 0),
    data_movimento: item.data_movimento,
    empresa_id: item.empresa_id,
    empresa_nome: item.empresa?.nome || null,
    titulo_id: item.titulo_financeiro_id,
    titulo_codigo: item.titulo?.codigo || null,
    titulo_descricao: item.titulo?.descricao || null,
    titulo_empresa_id: item.titulo?.empresa_id || null,
    titulo_empresa_nome: item.titulo?.empresa?.nome || null,
    obra_id: item.titulo?.obra_id || null,
    obra_nome: item.titulo?.obra?.nome || null,
    intercompany_group_id: item.intercompany_group_id,
    empresa_origem_id: item.empresa_origem_id,
    empresa_origem_nome: item.empresaOrigem?.nome || null,
    empresa_destino_id: item.empresa_destino_id,
    empresa_destino_nome: item.empresaDestino?.nome || null,
    tipo_intercompany: item.tipo_intercompany,
    transferencia_interna: item.transferencia_interna,
    elimina_consolidado: item.elimina_consolidado,
    conta_bancaria_nome: item.contaBancaria?.nome || null
  };
}

function getTransferenciaDiagnosticoInclude() {
  return [
    {
      model: EmpresaGrupo,
      as: 'empresa',
      attributes: ['id', 'codigo', 'nome', 'tipo_empresa', 'holding_id'],
      required: false
    },
    {
      model: EmpresaGrupo,
      as: 'empresaOrigem',
      attributes: ['id', 'codigo', 'nome', 'tipo_empresa', 'holding_id'],
      required: false
    },
    {
      model: EmpresaGrupo,
      as: 'empresaDestino',
      attributes: ['id', 'codigo', 'nome', 'tipo_empresa', 'holding_id'],
      required: false
    },
    {
      model: ContaBancaria,
      as: 'contaOrigem',
      attributes: ['id', 'nome', 'banco', 'agencia', 'conta'],
      required: false
    },
    {
      model: ContaBancaria,
      as: 'contaDestino',
      attributes: ['id', 'nome', 'banco', 'agencia', 'conta'],
      required: false
    }
  ];
}

function mapTransferenciaDiagnostico(transferencia) {
  const item = toPlain(transferencia);
  return {
    id: item.id,
    tipo: item.tipo_intercompany || 'TRANSFERENCIA',
    status: item.status,
    descricao: item.descricao || item.motivo_intercompany || null,
    valor: Number(item.valor || 0),
    data_transferencia: item.data_transferencia,
    empresa_id: item.empresa_id,
    empresa_nome: item.empresa?.nome || null,
    empresa_origem_id: item.empresa_origem_id,
    empresa_origem_nome: item.empresaOrigem?.nome || null,
    empresa_destino_id: item.empresa_destino_id,
    empresa_destino_nome: item.empresaDestino?.nome || null,
    tipo_intercompany: item.tipo_intercompany,
    motivo_intercompany: item.motivo_intercompany,
    intercompany_group_id: item.intercompany_group_id,
    transferencia_interna: item.transferencia_interna,
    elimina_consolidado: item.elimina_consolidado,
    conta_origem_nome: item.contaOrigem?.nome || null,
    conta_destino_nome: item.contaDestino?.nome || null
  };
}

function buildDiagnosticoItem({ codigo, titulo, severidade, descricao, total, acao, exemplos }) {
  return {
    codigo,
    titulo,
    severidade,
    descricao,
    total: Number(total || 0),
    acao_recomendada: acao,
    exemplos: exemplos || []
  };
}

async function countTitulosDiagnostico(scopeWhere, extraWhere = {}, extraIncludes = []) {
  return TituloFinanceiro.count({
    where: buildTituloDiagnosticoWhere(scopeWhere, extraWhere),
    include: getTituloDiagnosticoInclude(extraIncludes),
    distinct: true
  });
}

async function sampleTitulosDiagnostico(scopeWhere, extraWhere = {}, extraIncludes = []) {
  const titulos = await TituloFinanceiro.findAll({
    where: buildTituloDiagnosticoWhere(scopeWhere, extraWhere),
    include: getTituloDiagnosticoInclude(extraIncludes),
    order: [['id', 'DESC']],
    limit: 8
  });

  return titulos.map(mapTituloDiagnostico);
}

async function gerarDiagnosticoDre(req) {
  await assertFinanceAccess(req);

  const obraScopeWhere = await resolveObraScope(req);
  const tituloScopeWhere = obraScopeWhere || { id: -1 };
  const obraIncludeWhere = obraScopeWhere === null ? { id: -1 } : getObraIncludeWhereFromTituloScope(obraScopeWhere);
  const categoriaSemGrupoWhere = {
    ativo: true,
    considera_dre: true,
    [Op.or]: [{ dre_grupo: null }, { dre_grupo: '' }]
  };
  const movimentoEmpresaDivergenteWhere = {
    status: 'ATIVO',
    empresa_id: { [Op.ne]: null },
    [Op.and]: sequelizeWhere(col('MovimentoFinanceiro.empresa_id'), Op.ne, col('titulo.empresa_id')),
    [Op.or]: [
      { tipo_intercompany: null },
      { tipo_intercompany: '' },
      { empresa_origem_id: null },
      { empresa_destino_id: null }
    ]
  };
  const transferenciaIntercompanyIncompletaWhere = {
    status: 'ATIVA',
    [Op.or]: [
      { empresa_origem_id: null },
      { empresa_destino_id: null },
      {
        [Op.and]: [
          sequelizeWhere(col('TransferenciaFinanceira.empresa_origem_id'), Op.ne, col('TransferenciaFinanceira.empresa_destino_id')),
          {
            [Op.or]: [
              { tipo_intercompany: null },
              { tipo_intercompany: '' },
              { motivo_intercompany: null },
              { motivo_intercompany: '' }
            ]
          }
        ]
      }
    ]
  };
  const transferenciaInternaInconsistenteWhere = {
    status: 'ATIVA',
    [Op.and]: [
      sequelizeWhere(col('TransferenciaFinanceira.empresa_origem_id'), Op.eq, col('TransferenciaFinanceira.empresa_destino_id'))
    ],
    [Op.or]: [
      { transferencia_interna: false },
      { tipo_intercompany: { [Op.ne]: null } }
    ]
  };

  const [
    totalTitulosDre,
    totalEmpresas,
    totalHoldings,
    totalEmpresasCaixa,
    totalEmpresasOperacionaisSemHolding,
    totalObrasSemEmpresa,
    totalCategoriasSemDre,
    empresasOperacionaisSemHolding,
    obrasSemEmpresa,
    categoriasSemDre,
    titulosSemEmpresa,
    titulosSemCompetencia,
    titulosSemCategoria,
    titulosCategoriaSemDre,
    titulosEmpresaDivergente,
    titulosIntercompanyInconsistente,
    movimentosSemEmpresa,
    movimentosEmpresaDivergenteSemIntercompany,
    transferenciasIntercompanyIncompletas,
    transferenciasInternasInconsistentes
  ] = await Promise.all([
    countTitulosDiagnostico(tituloScopeWhere),
    EmpresaGrupo.count({ where: { ativo: true } }),
    EmpresaGrupo.count({ where: { ativo: true, tipo_empresa: 'HOLDING' } }),
    EmpresaGrupo.count({ where: { ativo: true, empresa_caixa: true } }),
    EmpresaGrupo.count({
      where: {
        ativo: true,
        tipo_empresa: { [Op.ne]: 'HOLDING' },
        holding_id: null
      }
    }),
    Obra.count({
      where: {
        ativo: true,
        empresa_grupo_id: null,
        ...obraIncludeWhere
      }
    }),
    CategoriaFinanceira.count({ where: categoriaSemGrupoWhere }),
    EmpresaGrupo.findAll({
      where: {
        ativo: true,
        tipo_empresa: { [Op.ne]: 'HOLDING' },
        holding_id: null
      },
      include: [{ model: EmpresaGrupo, as: 'holding', attributes: ['id', 'nome'], required: false }],
      order: [['nome', 'ASC']],
      limit: 8
    }),
    Obra.findAll({
      where: {
        ativo: true,
        empresa_grupo_id: null,
        ...obraIncludeWhere
      },
      include: [{ model: EmpresaGrupo, as: 'empresaGrupo', attributes: ['id', 'nome'], required: false }],
      order: [['nome', 'ASC']],
      limit: 8
    }),
    CategoriaFinanceira.findAll({
      where: categoriaSemGrupoWhere,
      order: [['tipo', 'ASC'], ['nome', 'ASC']],
      limit: 8
    }),
    countTitulosDiagnostico(tituloScopeWhere, { empresa_id: null }),
    countTitulosDiagnostico(tituloScopeWhere, { competencia_data: null }),
    countTitulosDiagnostico(tituloScopeWhere, { categoria_financeira_id: null }),
    countTitulosDiagnostico(tituloScopeWhere, {}, [
      {
        model: CategoriaFinanceira,
        as: 'categoriaFinanceira',
        attributes: ['id', 'nome', 'tipo', 'dre_grupo', 'dre_subgrupo', 'dre_ordem', 'considera_dre'],
        where: categoriaSemGrupoWhere,
        required: true
      }
    ]),
    TituloFinanceiro.count({
      where: {
        considera_dre: true,
        ...tituloScopeWhere,
        empresa_id: { [Op.ne]: null },
        [Op.and]: sequelizeWhere(col('TituloFinanceiro.empresa_id'), Op.ne, col('obra.empresa_grupo_id'))
      },
      include: [
        {
          model: Obra,
          as: 'obra',
          attributes: [],
          where: {
            empresa_grupo_id: { [Op.ne]: null }
          },
          required: true
        }
      ],
      distinct: true
    }),
    countTitulosDiagnostico(tituloScopeWhere, {
      [Op.or]: [
        { intercompany: true, empresa_contraparte_id: null },
        { intercompany: true, empresa_origem_id: null },
        { intercompany: true, empresa_destino_id: null },
        { intercompany: true, tipo_intercompany: null },
        { intercompany: true, tipo_intercompany: '' },
        { intercompany: false, empresa_contraparte_id: { [Op.ne]: null } }
      ]
    }),
    MovimentoFinanceiro.count({
      where: {
        status: 'ATIVO',
        empresa_id: null
      },
      include: getMovimentoDiagnosticoInclude(tituloScopeWhere),
      distinct: true
    }),
    MovimentoFinanceiro.count({
      where: movimentoEmpresaDivergenteWhere,
      include: getMovimentoDiagnosticoInclude(tituloScopeWhere),
      distinct: true
    }),
    TransferenciaFinanceira.count({
      where: transferenciaIntercompanyIncompletaWhere,
      distinct: true
    }),
    TransferenciaFinanceira.count({
      where: transferenciaInternaInconsistenteWhere,
      distinct: true
    })
  ]);

  const [
    exemplosTitulosSemEmpresa,
    exemplosTitulosSemCompetencia,
    exemplosTitulosSemCategoria,
    exemplosTitulosCategoriaSemDre,
    exemplosEmpresaDivergente,
    exemplosIntercompany,
    exemplosMovimentosSemEmpresa,
    exemplosMovimentosEmpresaDivergente,
    exemplosTransferenciasIntercompanyIncompletas,
    exemplosTransferenciasInternasInconsistentes
  ] = await Promise.all([
    sampleTitulosDiagnostico(tituloScopeWhere, { empresa_id: null }),
    sampleTitulosDiagnostico(tituloScopeWhere, { competencia_data: null }),
    sampleTitulosDiagnostico(tituloScopeWhere, { categoria_financeira_id: null }),
    sampleTitulosDiagnostico(tituloScopeWhere, {}, [
      {
        model: CategoriaFinanceira,
        as: 'categoriaFinanceira',
        attributes: ['id', 'nome', 'tipo', 'dre_grupo', 'dre_subgrupo', 'dre_ordem', 'considera_dre'],
        where: categoriaSemGrupoWhere,
        required: true
      }
    ]),
    TituloFinanceiro.findAll({
      where: {
        considera_dre: true,
        ...tituloScopeWhere,
        empresa_id: { [Op.ne]: null },
        [Op.and]: sequelizeWhere(col('TituloFinanceiro.empresa_id'), Op.ne, col('obra.empresa_grupo_id'))
      },
      include: getTituloDiagnosticoInclude(),
      order: [['id', 'DESC']],
      limit: 8
    }).then((items) => items.map(mapTituloDiagnostico)),
    sampleTitulosDiagnostico(tituloScopeWhere, {
      [Op.or]: [
        { intercompany: true, empresa_contraparte_id: null },
        { intercompany: true, empresa_origem_id: null },
        { intercompany: true, empresa_destino_id: null },
        { intercompany: true, tipo_intercompany: null },
        { intercompany: true, tipo_intercompany: '' },
        { intercompany: false, empresa_contraparte_id: { [Op.ne]: null } }
      ]
    }),
    MovimentoFinanceiro.findAll({
      where: {
        status: 'ATIVO',
        empresa_id: null
      },
      include: getMovimentoDiagnosticoInclude(tituloScopeWhere),
      order: [['id', 'DESC']],
      limit: 8
    }).then((items) => items.map(mapMovimentoDiagnostico)),
    MovimentoFinanceiro.findAll({
      where: movimentoEmpresaDivergenteWhere,
      include: getMovimentoDiagnosticoInclude(tituloScopeWhere),
      order: [['id', 'DESC']],
      limit: 8
    }).then((items) => items.map(mapMovimentoDiagnostico)),
    TransferenciaFinanceira.findAll({
      where: transferenciaIntercompanyIncompletaWhere,
      include: getTransferenciaDiagnosticoInclude(),
      order: [['id', 'DESC']],
      limit: 8
    }).then((items) => items.map(mapTransferenciaDiagnostico)),
    TransferenciaFinanceira.findAll({
      where: transferenciaInternaInconsistenteWhere,
      include: getTransferenciaDiagnosticoInclude(),
      order: [['id', 'DESC']],
      limit: 8
    }).then((items) => items.map(mapTransferenciaDiagnostico))
  ]);

  const itens = [
    buildDiagnosticoItem({
      codigo: 'EMPRESAS_SEM_HOLDING',
      titulo: 'Empresas operacionais sem holding',
      severidade: 'ALTA',
      descricao: 'Empresas operacionais sem holding deixam o consolidado da Holding incompleto.',
      total: totalEmpresasOperacionaisSemHolding,
      acao: 'Cadastre a Holding e vincule cada empresa operacional em Empresas do Grupo.',
      exemplos: empresasOperacionaisSemHolding.map(mapEmpresaDiagnostico)
    }),
    buildDiagnosticoItem({
      codigo: 'SEM_EMPRESA_CAIXA',
      titulo: 'Nenhuma empresa marcada como caixa/tesouraria',
      severidade: 'MEDIA',
      descricao: 'A visao consolidada de caixa precisa saber qual empresa centraliza ou suporta capital do grupo.',
      total: totalEmpresasCaixa > 0 ? 0 : 1,
      acao: 'Marque a empresa caixa/tesouraria em Empresas do Grupo quando existir uma concentradora de caixa.',
      exemplos: []
    }),
    buildDiagnosticoItem({
      codigo: 'OBRAS_SEM_EMPRESA',
      titulo: 'Obras/Centros de custo sem empresa',
      severidade: 'ALTA',
      descricao: 'Obras e centros de custo precisam apontar para a empresa operacional correta.',
      total: totalObrasSemEmpresa,
      acao: 'Edite o cadastro de Obras/Centros de Custo e informe a empresa do grupo.',
      exemplos: obrasSemEmpresa.map(mapObraDiagnostico)
    }),
    buildDiagnosticoItem({
      codigo: 'CATEGORIAS_SEM_DRE',
      titulo: 'Categorias financeiras sem grupo DRE',
      severidade: 'ALTA',
      descricao: 'Categorias sem grupo DRE nao entram no demonstrativo executivo ate serem classificadas.',
      total: totalCategoriasSemDre,
      acao: 'Classifique cada categoria em Cadastros Financeiros com grupo, subgrupo e ordem DRE.',
      exemplos: categoriasSemDre.map(mapCategoriaDiagnostico)
    }),
    buildDiagnosticoItem({
      codigo: 'TITULOS_SEM_EMPRESA',
      titulo: 'Titulos sem empresa',
      severidade: 'CRITICA',
      descricao: 'Titulos sem empresa nao sustentam DRE isolada por empresa nem consolidado confiavel.',
      total: titulosSemEmpresa,
      acao: 'Vincule a empresa do grupo no titulo ou corrija a obra/centro de custo para herdar a empresa.',
      exemplos: exemplosTitulosSemEmpresa
    }),
    buildDiagnosticoItem({
      codigo: 'TITULOS_SEM_COMPETENCIA',
      titulo: 'Titulos sem competencia DRE',
      severidade: 'ALTA',
      descricao: 'A DRE por competencia considera somente competencia_data. Titulos sem competencia nao entram na DRE ate serem corrigidos.',
      total: titulosSemCompetencia,
      acao: 'Informe competencia_data nos titulos importados/criados, preferencialmente pelo mes economico correto.',
      exemplos: exemplosTitulosSemCompetencia
    }),
    buildDiagnosticoItem({
      codigo: 'TITULOS_SEM_CATEGORIA',
      titulo: 'Titulos sem categoria financeira',
      severidade: 'ALTA',
      descricao: 'Sem categoria, o titulo nao entra no demonstrativo executivo da DRE.',
      total: titulosSemCategoria,
      acao: 'Classifique o titulo com uma categoria financeira apropriada.',
      exemplos: exemplosTitulosSemCategoria
    }),
    buildDiagnosticoItem({
      codigo: 'TITULOS_CATEGORIA_SEM_DRE',
      titulo: 'Titulos com categoria sem grupo DRE',
      severidade: 'ALTA',
      descricao: 'A categoria existe, mas nao informa onde o valor deve entrar na DRE; por isso o titulo fica fora do demonstrativo executivo.',
      total: titulosCategoriaSemDre,
      acao: 'Complete a classificacao DRE das categorias financeiras usadas nesses titulos.',
      exemplos: exemplosTitulosCategoriaSemDre
    }),
    buildDiagnosticoItem({
      codigo: 'EMPRESA_DIFERE_OBRA',
      titulo: 'Empresa do titulo diferente da empresa da obra/centro',
      severidade: 'MEDIA',
      descricao: 'Divergencias entre titulo e obra podem distorcer resultado por empresa e por centro de custo.',
      total: titulosEmpresaDivergente,
      acao: 'Revise se o titulo ou a obra/centro de custo estao vinculados a empresa correta.',
      exemplos: exemplosEmpresaDivergente
    }),
    buildDiagnosticoItem({
      codigo: 'INTERCOMPANY_INCONSISTENTE',
      titulo: 'Movimento entre empresas inconsistente',
      severidade: 'MEDIA',
      descricao: 'Transacoes entre empresas precisam de origem, destino, tipo, flag e contraparte consistentes para consolidacao.',
      total: titulosIntercompanyInconsistente,
      acao: 'Marque Entre Empresas apenas quando houver origem e destino reais, informe o tipo e a contraparte do grupo.',
      exemplos: exemplosIntercompany
    }),
    buildDiagnosticoItem({
      codigo: 'BAIXAS_SEM_EMPRESA',
      titulo: 'Baixas sem empresa pagadora/recebedora',
      severidade: 'CRITICA',
      descricao: 'Toda baixa precisa informar a empresa real que pagou ou recebeu. Sem isso, caixa por empresa e consolidado ficam incompletos.',
      total: movimentosSemEmpresa,
      acao: 'Corrija a baixa informando a empresa pagadora/recebedora real. Evite qualquer deducao por conta bancaria sem confirmacao operacional.',
      exemplos: exemplosMovimentosSemEmpresa
    }),
    buildDiagnosticoItem({
      codigo: 'BAIXAS_EMPRESA_DIVERGENTE_SEM_INTERCOMPANY',
      titulo: 'Baixas com empresa diferente sem Entre Empresas completo',
      severidade: 'ALTA',
      descricao: 'Quando a empresa da baixa e diferente da empresa do titulo, a operacao precisa ter origem, destino e tipo Entre Empresas.',
      total: movimentosEmpresaDivergenteSemIntercompany,
      acao: 'Revise a baixa e informe a classificacao Entre Empresas real ou corrija a empresa pagadora/recebedora.',
      exemplos: exemplosMovimentosEmpresaDivergente
    }),
    buildDiagnosticoItem({
      codigo: 'TRANSFERENCIAS_INTERCOMPANY_INCOMPLETAS',
      titulo: 'Transferencias entre empresas incompletas',
      severidade: 'ALTA',
      descricao: 'Transferencias entre empresas diferentes precisam de origem, destino, tipo e motivo para explicar quem financia quem.',
      total: transferenciasIntercompanyIncompletas,
      acao: 'Complete tipo e motivo nas transferencias entre empresas do grupo.',
      exemplos: exemplosTransferenciasIntercompanyIncompletas
    }),
    buildDiagnosticoItem({
      codigo: 'TRANSFERENCIAS_INTERNAS_INCONSISTENTES',
      titulo: 'Transferencias internas inconsistentes',
      severidade: 'MEDIA',
      descricao: 'Transferencias entre contas da mesma empresa devem ser tratadas como transferencia interna de caixa, sem Entre Empresas.',
      total: transferenciasInternasInconsistentes,
      acao: 'Marque como transferencia interna e remova classificacao Entre Empresas quando origem e destino forem a mesma empresa.',
      exemplos: exemplosTransferenciasInternasInconsistentes
    })
  ];

  const totalCriticas = itens
    .filter((item) => item.severidade === 'CRITICA')
    .reduce((sum, item) => sum + item.total, 0);
  const totalAltas = itens
    .filter((item) => item.severidade === 'ALTA')
    .reduce((sum, item) => sum + item.total, 0);
  const totalMedias = itens
    .filter((item) => item.severidade === 'MEDIA')
    .reduce((sum, item) => sum + item.total, 0);
  const totalPendencias = totalCriticas + totalAltas + totalMedias;

  return {
    gerado_em: new Date().toISOString(),
    resumo: {
      status: totalCriticas > 0 ? 'CRITICO' : totalAltas > 0 ? 'ATENCAO' : totalPendencias > 0 ? 'REVISAR' : 'OK',
      total_pendencias: totalPendencias,
      pendencias_criticas: totalCriticas,
      pendencias_altas: totalAltas,
      pendencias_medias: totalMedias,
      total_titulos_dre: totalTitulosDre,
      total_empresas: totalEmpresas,
      total_holdings: totalHoldings,
      total_empresas_caixa: totalEmpresasCaixa
    },
    itens
  };
}

function toNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapById(rows) {
  return new Map((rows || []).map((row) => [Number(row.id), row]));
}

function classifyMovimentoBancario(movimento, titulo) {
  const formaRecebimento = String(movimento.forma_recebimento || '').toUpperCase();
  const tipoPermuta = String(movimento.tipo_permuta || '').toUpperCase();
  if (formaRecebimento === 'PERMUTA' || tipoPermuta) {
    return 'PERMUTA';
  }

  const tipoMovimento = String(movimento.tipo_movimento || '').toUpperCase();
  if (tipoMovimento === 'TARIFA_BANCARIA') {
    return 'SAIDA';
  }
  if (tipoMovimento === 'ESTORNO_TARIFA_BANCARIA') {
    return 'ENTRADA';
  }
  if (tipoMovimento === 'ESTORNO_BANCARIO') {
    return String(titulo?.tipo || '').toUpperCase() === 'RECEBER' ? 'SAIDA' : 'ENTRADA';
  }
  if (tipoMovimento === 'DEPOSITO_CHEQUE_TERCEIRO') {
    return 'ENTRADA';
  }
  if (tipoMovimento === 'DEVOLUCAO_CHEQUE_TERCEIRO') {
    return 'SAIDA';
  }
  if (tipoMovimento === 'LIBERACAO_CREDITO_ROTATIVO') {
    return 'ENTRADA';
  }
  if (tipoMovimento === 'AMORTIZACAO_CREDITO_ROTATIVO') {
    return 'SAIDA';
  }

  if (tipoMovimento.includes('ENTRADA') || tipoMovimento.includes('RECEB')) {
    return 'ENTRADA';
  }

  if (tipoMovimento.includes('SAIDA') || tipoMovimento.includes('SAÍDA') || tipoMovimento.includes('PAG')) {
    return 'SAIDA';
  }

  const tipoTitulo = String(titulo?.tipo || '').toUpperCase();
  if (tipoTitulo === 'RECEBER') {
    return 'ENTRADA';
  }
  if (tipoTitulo === 'PAGAR') {
    return 'SAIDA';
  }

  return toNumber(movimento.valor_quitacao || movimento.valor) >= 0 ? 'ENTRADA' : 'SAIDA';
}

function buildContaLabel(conta) {
  if (!conta) return 'Conta nao informada';
  return [conta.nome, conta.banco, conta.agencia, conta.conta]
    .filter(Boolean)
    .join(' - ');
}

async function hydrateFinanceiroMaps({ movimentos = [], conciliacoes = [] }) {
  const contaIds = new Set();
  const tituloIds = new Set();
  const categoriaIds = new Set();
  const movimentoIds = new Set();
  const transferenciaIds = new Set();

  movimentos.forEach((movimento) => {
    if (movimento.conta_bancaria_id) contaIds.add(Number(movimento.conta_bancaria_id));
    if (movimento.titulo_financeiro_id) tituloIds.add(Number(movimento.titulo_financeiro_id));
    if (movimento.categoria_financeira_id) categoriaIds.add(Number(movimento.categoria_financeira_id));
  });

  conciliacoes.forEach((conciliacao) => {
    if (conciliacao.conta_bancaria_id) contaIds.add(Number(conciliacao.conta_bancaria_id));
    if (conciliacao.titulo_financeiro_id) tituloIds.add(Number(conciliacao.titulo_financeiro_id));
    if (conciliacao.movimento_financeiro_id) movimentoIds.add(Number(conciliacao.movimento_financeiro_id));
    if (conciliacao.transferencia_financeira_id) transferenciaIds.add(Number(conciliacao.transferencia_financeira_id));
  });

  const movimentosVinculados = movimentoIds.size
    ? await MovimentoFinanceiro.findAll({ where: { id: { [Op.in]: Array.from(movimentoIds) } }, raw: true })
    : [];
  const movimentosCompletos = Array.from(new Map(
    [...movimentos, ...movimentosVinculados].map((movimento) => [Number(movimento.id), movimento])
  ).values());

  movimentosCompletos.forEach((movimento) => {
    if (movimento.conta_bancaria_id) contaIds.add(Number(movimento.conta_bancaria_id));
    if (movimento.titulo_financeiro_id) tituloIds.add(Number(movimento.titulo_financeiro_id));
    if (movimento.categoria_financeira_id) categoriaIds.add(Number(movimento.categoria_financeira_id));
  });

  const transferencias = transferenciaIds.size
    ? await TransferenciaFinanceira.findAll({ where: { id: { [Op.in]: Array.from(transferenciaIds) } }, raw: true })
    : [];
  transferencias.forEach((transferencia) => {
    if (transferencia.conta_origem_id) contaIds.add(Number(transferencia.conta_origem_id));
    if (transferencia.conta_destino_id) contaIds.add(Number(transferencia.conta_destino_id));
  });

  const contas = contaIds.size
    ? await ContaBancaria.findAll({ where: { id: { [Op.in]: Array.from(contaIds) } }, raw: true })
    : [];

  const titulos = tituloIds.size
    ? await TituloFinanceiro.findAll({ where: { id: { [Op.in]: Array.from(tituloIds) } }, raw: true })
    : [];

  titulos.forEach((titulo) => {
    if (titulo.categoria_financeira_id) categoriaIds.add(Number(titulo.categoria_financeira_id));
  });

  const parceiroIds = new Set(titulos.map((titulo) => Number(titulo.parceiro_id)).filter(Boolean));
  const obraIds = new Set(titulos.map((titulo) => Number(titulo.obra_id)).filter(Boolean));

  const parceiros = parceiroIds.size
    ? await Parceiro.findAll({ where: { id: { [Op.in]: Array.from(parceiroIds) } }, raw: true })
    : [];

  const obras = obraIds.size
    ? await Obra.findAll({ where: { id: { [Op.in]: Array.from(obraIds) } }, raw: true })
    : [];

  const categorias = categoriaIds.size
    ? await CategoriaFinanceira.findAll({ where: { id: { [Op.in]: Array.from(categoriaIds) } }, raw: true })
    : [];

  return {
    contas: mapById(contas),
    titulos: mapById(titulos),
    parceiros: mapById(parceiros),
    obras: mapById(obras),
    categorias: mapById(categorias),
    movimentos: mapById(movimentosCompletos),
    transferencias: mapById(transferencias)
  };
}

function ensureSinteticoConta(sinteticoMap, conta) {
  const key = conta?.id ? Number(conta.id) : 0;
  if (!sinteticoMap.has(key)) {
    sinteticoMap.set(key, {
      conta_bancaria_id: conta?.id || null,
      conta: buildContaLabel(conta),
      entradas: 0,
      saidas: 0,
      permutas: 0,
      saldo_liquido: 0,
      movimentos: 0,
      conciliados: 0,
      pendentes: 0,
      ignorados: 0,
      removidos: 0
    });
  }
  return sinteticoMap.get(key);
}

async function gerarRelatorioMovimentacaoContas(req, filters = {}) {
  await assertFinanceAccess(req);
  const filtroPeriodo = resolvePeriodo(filters);
  const where = {
    data_movimento: {
      [Op.between]: [filtroPeriodo.data_inicial, filtroPeriodo.data_final]
    },
    [Op.or]: [
      { conta_bancaria_id: { [Op.ne]: null } },
      { forma_recebimento: 'PERMUTA' },
      { tipo_permuta: { [Op.ne]: null } }
    ]
  };

  if (filters.conta_bancaria_id) {
    where.conta_bancaria_id = Number(filters.conta_bancaria_id);
  }

  const movimentos = await MovimentoFinanceiro.findAll({
    where,
    raw: true,
    order: [
      ['data_movimento', 'ASC'],
      ['id', 'ASC']
    ]
  });

  const maps = await hydrateFinanceiroMaps({ movimentos });
  const sinteticoMap = new Map();
  const saldosPorConta = new Map();
  const analitico = movimentos.map((movimento) => {
    const conta = maps.contas.get(Number(movimento.conta_bancaria_id));
    const titulo = maps.titulos.get(Number(movimento.titulo_financeiro_id));
    const parceiro = maps.parceiros.get(Number(titulo?.parceiro_id));
    const obra = maps.obras.get(Number(titulo?.obra_id));
    const categoria = maps.categorias.get(Number(movimento.categoria_financeira_id || titulo?.categoria_financeira_id));
    const valor = Math.abs(toNumber(movimento.valor_quitacao || movimento.valor));
    const classe = classifyMovimentoBancario(movimento, titulo);
    const contaResumo = ensureSinteticoConta(sinteticoMap, conta);
    const contaKey = Number(movimento.conta_bancaria_id) || `sem-conta-${movimento.id}`;
    const saldoAnterior = toNumber(saldosPorConta.get(contaKey));
    let valorMovimento = 0;

    contaResumo.movimentos += 1;
    if (classe === 'ENTRADA') {
      contaResumo.entradas += valor;
      contaResumo.saldo_liquido += valor;
      valorMovimento = valor;
    } else if (classe === 'SAIDA') {
      contaResumo.saidas += valor;
      contaResumo.saldo_liquido -= valor;
      valorMovimento = -valor;
    } else {
      contaResumo.permutas += valor;
    }
    const saldoMovimento = roundCurrency(saldoAnterior + valorMovimento);
    saldosPorConta.set(contaKey, saldoMovimento);

    return {
      id: movimento.id,
      data_movimento: movimento.data_movimento,
      conta_bancaria_id: movimento.conta_bancaria_id,
      conta: buildContaLabel(conta),
      classe,
      tipo_movimento: movimento.tipo_movimento,
      status: movimento.status,
      valor,
      valor_movimento: roundCurrency(valorMovimento),
      saldo_movimento: saldoMovimento,
      valor_quitacao: toNumber(movimento.valor_quitacao || movimento.valor),
      juros: toNumber(movimento.juros),
      multa: toNumber(movimento.multa),
      desconto: toNumber(movimento.desconto),
      titulo_id: titulo?.id || null,
      titulo_codigo: titulo?.codigo || null,
      titulo_tipo: titulo?.tipo || null,
      documento: titulo?.numero_documento || movimento.documento_referencia || null,
      parceiro: parceiro?.nome || null,
      obra: obra?.nome || null,
      categoria: categoria ? `${categoria.codigo ? `${categoria.codigo} - ` : ''}${categoria.nome}` : null,
      observacoes: movimento.observacoes || null,
      permuta: classe === 'PERMUTA'
    };
  });

  const sintetico = Array.from(sinteticoMap.values()).map((item) => ({
    ...item,
    entradas: roundCurrency(item.entradas),
    saidas: roundCurrency(item.saidas),
    permutas: roundCurrency(item.permutas),
    saldo_liquido: roundCurrency(item.saldo_liquido)
  }));

  return {
    gerado_em: new Date().toISOString(),
    filtro: filtroPeriodo,
    resumo: {
      contas: sintetico.length,
      movimentos: analitico.length,
      entradas: roundCurrency(sintetico.reduce((sum, item) => sum + item.entradas, 0)),
      saidas: roundCurrency(sintetico.reduce((sum, item) => sum + item.saidas, 0)),
      permutas: roundCurrency(sintetico.reduce((sum, item) => sum + item.permutas, 0)),
      saldo_liquido: roundCurrency(sintetico.reduce((sum, item) => sum + item.saldo_liquido, 0))
    },
    sintetico,
    analitico
  };
}

async function gerarRelatorioConciliacaoContas(req, filters = {}) {
  await assertFinanceAccess(req);
  const filtroPeriodo = resolvePeriodo(filters);
  const statusFiltro = String(filters.status || 'TODOS').toUpperCase();
  const tipoFiltro = String(filters.tipo_conciliacao || 'TODOS').toUpperCase();
  const naturezaFiltro = String(filters.natureza || 'TODAS').toUpperCase();
  const busca = String(filters.busca || '').trim();
  const where = {
    data_movimento: {
      [Op.between]: [filtroPeriodo.data_inicial, filtroPeriodo.data_final]
    }
  };

  if (filters.conta_bancaria_id) {
    where.conta_bancaria_id = Number(filters.conta_bancaria_id);
  }
  if (statusFiltro === 'REMOVIDO') where.deleted_at = { [Op.ne]: null };
  else if (statusFiltro !== 'TODOS') {
    where.deleted_at = null;
    where.status = statusFiltro;
  }
  if (naturezaFiltro === 'ENTRADA') where.valor = { [Op.gte]: 0 };
  if (naturezaFiltro === 'SAIDA') where.valor = { [Op.lt]: 0 };
  if (busca) {
    where[Op.or] = [
      { descricao_banco: { [Op.like]: `%${busca}%` } },
      { documento: { [Op.like]: `%${busca}%` } },
      { ofx_uid: { [Op.like]: `%${busca}%` } }
    ];
  }

  const conciliacoes = await ConciliacaoBancaria.findAll({
    where,
    raw: true,
    paranoid: false,
    order: [
      ['data_movimento', 'ASC'],
      ['id', 'ASC']
    ]
  });

  const maps = await hydrateFinanceiroMaps({ conciliacoes });
  const analiticoCompleto = conciliacoes.map((conciliacao) => {
    const conta = maps.contas.get(Number(conciliacao.conta_bancaria_id));
    const titulo = maps.titulos.get(Number(conciliacao.titulo_financeiro_id));
    const movimento = maps.movimentos.get(Number(conciliacao.movimento_financeiro_id));
    const transferencia = maps.transferencias.get(Number(conciliacao.transferencia_financeira_id));
    const parceiro = maps.parceiros.get(Number(titulo?.parceiro_id));
    const obra = maps.obras.get(Number(titulo?.obra_id));
    const status = conciliacao.deleted_at ? 'REMOVIDO' : String(conciliacao.status || 'PENDENTE').toUpperCase();
    const valor = toNumber(conciliacao.valor);
    const tipoMovimento = String(movimento?.tipo_movimento || '').toUpperCase();
    const resolucaoTipo = String(conciliacao.resolucao_tipo || '').toUpperCase();
    const tipoConciliacao = transferencia
      ? 'TRANSFERENCIA'
      : conciliacao.fatura_cartao_id
        ? 'FATURA_CARTAO'
        : movimento && tipoMovimento === 'ESTORNO_BANCARIO'
          ? 'ESTORNO_BANCARIO'
        : resolucaoTipo === 'ESTORNO_TARIFA_BANCARIA'
          ? 'ESTORNO_TARIFA'
        : ['ESTORNO_BANCARIO', 'ESTORNADO_POR_OFX'].includes(resolucaoTipo)
          ? 'ESTORNO_BANCARIO'
        : titulo
          ? 'TITULO'
          : movimento && tipoMovimento === 'TARIFA_BANCARIA'
            ? 'TARIFA'
            : movimento && tipoMovimento === 'ESTORNO_TARIFA_BANCARIA'
              ? 'ESTORNO_TARIFA'
            : movimento && ['LIBERACAO_CREDITO_ROTATIVO', 'AMORTIZACAO_CREDITO_ROTATIVO'].includes(tipoMovimento)
              ? 'CREDITO_ROTATIVO'
            : movimento
              ? 'MOVIMENTO'
              : 'SEM_VINCULO';
    const contaOrigem = maps.contas.get(Number(transferencia?.conta_origem_id));
    const contaDestino = maps.contas.get(Number(transferencia?.conta_destino_id));

    return {
      id: conciliacao.id,
      data_movimento: conciliacao.data_movimento,
      conta_bancaria_id: conciliacao.conta_bancaria_id,
      conta: buildContaLabel(conta),
      status,
      valor,
      natureza: valor < 0 ? 'SAIDA' : 'ENTRADA',
      ofx_uid: conciliacao.ofx_uid || null,
      documento: conciliacao.documento || titulo?.numero_documento || null,
      descricao_banco: conciliacao.descricao_banco || null,
      titulo_id: titulo?.id || null,
      titulo_codigo: titulo?.codigo || null,
      movimento_financeiro_id: conciliacao.movimento_financeiro_id || null,
      fatura_cartao_id: conciliacao.fatura_cartao_id || null,
      transferencia_financeira_id: transferencia?.id || null,
      transferencia_status: transferencia?.status || null,
      transferencia_descricao: transferencia?.descricao || null,
      conta_origem: transferencia ? buildContaLabel(contaOrigem) : null,
      conta_destino: transferencia ? buildContaLabel(contaDestino) : null,
      tipo_conciliacao: tipoConciliacao,
      tipo_movimento: movimento?.tipo_movimento || null,
      estorno_conciliacao_origem_id: conciliacao.estorno_conciliacao_origem_id || null,
      parceiro: parceiro?.nome || null,
      obra: obra?.nome || null,
      confirmado_em: conciliacao.confirmado_em || null,
      removido_em: conciliacao.deleted_at || null
    };
  });

  const analitico = tipoFiltro === 'TODOS'
    ? analiticoCompleto
    : analiticoCompleto.filter((item) => item.tipo_conciliacao === tipoFiltro);

  const sinteticoMap = new Map();
  analitico.forEach((item) => {
    const conta = maps.contas.get(Number(item.conta_bancaria_id));
    const contaResumo = ensureSinteticoConta(sinteticoMap, conta);
    contaResumo.movimentos += 1;
    if (item.status === 'CONCILIADO') contaResumo.conciliados += 1;
    else if (item.status === 'IGNORADO') contaResumo.ignorados += 1;
    else if (item.status === 'REMOVIDO') contaResumo.removidos += 1;
    else contaResumo.pendentes += 1;
  });

  const sintetico = Array.from(sinteticoMap.values());

  return {
    gerado_em: new Date().toISOString(),
    filtro: {
      ...filtroPeriodo,
      conta_bancaria_id: filters.conta_bancaria_id || null,
      status: statusFiltro,
      tipo_conciliacao: tipoFiltro,
      natureza: naturezaFiltro,
      busca: busca || null
    },
    resumo: {
      contas: sintetico.length,
      movimentos: analitico.length,
      conciliados: sintetico.reduce((sum, item) => sum + item.conciliados, 0),
      pendentes: sintetico.reduce((sum, item) => sum + item.pendentes, 0),
      ignorados: sintetico.reduce((sum, item) => sum + item.ignorados, 0),
      removidos: sintetico.reduce((sum, item) => sum + item.removidos, 0),
      transferencias: analitico.filter((item) => item.tipo_conciliacao === 'TRANSFERENCIA').length,
      valor_total: roundCurrency(analitico.reduce((sum, item) => sum + Math.abs(item.valor), 0))
    },
    sintetico,
    analitico
  };
}

module.exports = {
  acumularSerie,
  isFluxoCaixaPermuta,
  limitarDataFinalRealizados,
  resolvePeriodo,
  gerarRelatorioAnalitico,
  gerarRelatorioConciliacaoContas,
  gerarRelatorioFinanceiroObras,
  gerarRelatorioFluxoCaixa,
  gerarRelatorioFluxoConsolidado,
  gerarRelatorioMovimentacaoContas,
  gerarPainelExecutivoGrupo,
  gerarDreComparativoMensal,
  gerarDreComparativoEmpresas,
  gerarRelatorioEndividamento,
  gerarRelatorioIntercompany,
  gerarDreGerencial,
  gerarDiagnosticoDre
};
