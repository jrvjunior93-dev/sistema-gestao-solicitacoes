'use strict';

const {
  Obra,
  MovimentoFinanceiro,
  TituloFinanceiro,
  TituloFinanceiroRateio,
  ObraCustoHistorico,
  ContratoComercial
} = require('../models');
const { Op, fn, col, literal } = require('sequelize');
const { TIPO_CENTRO_CUSTO_OBRA } = require('../constants/centroCusto');
const { obterVgvEfetivoPorObras } = require('./obraVgvService');

function businessError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function normalizeDate(value, label) {
  if (value == null || value === '') return null;
  const normalized = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw businessError(400, 'RESULTADO_OBRAS_DATA_INVALIDA', `${label} invalida. Use AAAA-MM-DD.`);
  }
  const parsed = new Date(`${normalized}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw businessError(400, 'RESULTADO_OBRAS_DATA_INVALIDA', `${label} invalida.`);
  }
  return normalized;
}

function normalizeFilters(query = {}) {
  const dataInicial = normalizeDate(query.data_inicial, 'Data inicial');
  const dataFinal = normalizeDate(query.data_final, 'Data final');
  if ((dataInicial && !dataFinal) || (!dataInicial && dataFinal)) {
    throw businessError(400, 'RESULTADO_OBRAS_PERIODO_INCOMPLETO', 'Informe as datas inicial e final do periodo.');
  }
  if (dataInicial && dataInicial > dataFinal) {
    throw businessError(400, 'RESULTADO_OBRAS_PERIODO_INVALIDO', 'A data inicial nao pode ser posterior a data final.');
  }
  const classificacao = String(query.classificacao || '').trim().toUpperCase();
  if (classificacao && !['PUBLICA', 'PRIVADA'].includes(classificacao)) {
    throw businessError(400, 'RESULTADO_OBRAS_CLASSIFICACAO_INVALIDA', 'Classificacao deve ser PUBLICA ou PRIVADA.');
  }
  const obraId = query.obra_id == null || query.obra_id === '' ? null : Number(query.obra_id);
  if (obraId != null && (!Number.isInteger(obraId) || obraId <= 0)) {
    throw businessError(400, 'RESULTADO_OBRAS_OBRA_INVALIDA', 'Obra invalida.');
  }
  return { dataInicial, dataFinal, classificacao, obraId, comPeriodo: Boolean(dataInicial && dataFinal) };
}

function emptyTotals() {
  return { total_valor_original: 0, total_valor_baixado: 0, total_valor_saldo: 0, quantidade: 0 };
}

function addValue(map, obraId, tipo, value) {
  const id = Number(obraId);
  const key = String(tipo || '').toUpperCase();
  if (!id || !['PAGAR', 'RECEBER'].includes(key)) return;
  if (!map[id]) map[id] = { PAGAR: 0, RECEBER: 0 };
  map[id][key] += Number(value || 0);
}

function round(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

async function gerarResultadoObras({ query = {}, obraIdsEscopo = null } = {}) {
  const filters = normalizeFilters(query);
  const obraWhere = { ativo: true, tipo_centro_custo: TIPO_CENTRO_CUSTO_OBRA };
  if (filters.classificacao) obraWhere.classificacao = filters.classificacao;
  if (filters.obraId) obraWhere.id = filters.obraId;
  if (Array.isArray(obraIdsEscopo)) {
    if (!obraIdsEscopo.length) return [];
    obraWhere.id = filters.obraId
      ? { [Op.eq]: filters.obraId, [Op.in]: obraIdsEscopo }
      : { [Op.in]: obraIdsEscopo };
  }

  const obras = await Obra.findAll({ where: obraWhere, order: [['nome', 'ASC']] });
  const obraIds = obras.map((obra) => Number(obra.id));
  if (!obraIds.length) return [];

  const vgvPorObra = await obterVgvEfetivoPorObras(obras);
  const [agregados, rateiosRecarga, historicos, contratosVendidos] = await Promise.all([
    TituloFinanceiro.findAll({
      attributes: [
        'obra_id',
        'tipo',
        [fn('SUM', literal('CASE WHEN renegociado_por_id IS NULL THEN valor_original ELSE valor_baixado END')), 'total_valor_original'],
        [fn('SUM', col('valor_baixado')), 'total_valor_baixado'],
        [fn('SUM', col('valor_saldo')), 'total_valor_saldo'],
        [fn('COUNT', col('id')), 'quantidade']
      ],
      where: {
        obra_id: { [Op.in]: obraIds },
        renegociacao_id: null,
        status: { [Op.notIn]: ['CANCELADO', 'ESTORNADO'] }
      },
      group: ['obra_id', 'tipo'],
      raw: true
    }),
    TituloFinanceiroRateio.findAll({
      where: { obra_id: { [Op.in]: obraIds } },
      include: [{
        model: TituloFinanceiro,
        as: 'tituloFinanceiro',
        required: true,
        where: {
          origem_titulo: 'RECARGA_CARTAO',
          considera_dre: true,
          status: { [Op.notIn]: ['CANCELADO', 'ESTORNADO'] }
        },
        attributes: ['id', 'tipo', 'valor_original', 'valor_baixado', 'valor_saldo'],
        include: filters.comPeriodo ? [{
          model: MovimentoFinanceiro,
          as: 'movimentos',
          required: false,
          where: { status: 'ATIVO', data_movimento: { [Op.lte]: filters.dataFinal } },
          attributes: ['valor', 'valor_quitacao', 'data_movimento']
        }] : []
      }]
    }),
    ObraCustoHistorico.findAll({
      attributes: ['obra_id', 'tipo', 'valor', 'data_pagamento'],
      where: { obra_id: { [Op.in]: obraIds }, ativo: true },
      raw: true
    }),
    ContratoComercial.findAll({
      attributes: [
        'obra_id',
        [fn('SUM', col('valor_total')), 'valor_vendido'],
        [fn('COUNT', col('id')), 'quantidade_contratos']
      ],
      where: {
        obra_id: { [Op.in]: obraIds },
        status: { [Op.in]: ['ATIVO', 'INADIMPLENTE', 'QUITADO'] }
      },
      group: ['obra_id'],
      raw: true
    })
  ]);
  const vendasPorObra = new Map(contratosVendidos.map((row) => [Number(row.obra_id), {
    valor: Number(row.valor_vendido || 0),
    quantidade: Number(row.quantidade_contratos || 0)
  }]));

  const mapAgregados = {};
  agregados.forEach((row) => {
    const obraId = Number(row.obra_id);
    if (!mapAgregados[obraId]) mapAgregados[obraId] = {};
    mapAgregados[obraId][row.tipo] = {
      total_valor_original: Number(row.total_valor_original || 0),
      total_valor_baixado: Number(row.total_valor_baixado || 0),
      total_valor_saldo: Number(row.total_valor_saldo || 0),
      quantidade: Number(row.quantidade || 0)
    };
  });

  const movimentosPeriodo = {};
  const movimentosAcumulados = {};
  const historicosPeriodo = {};

  for (const rateio of rateiosRecarga) {
    const obraId = Number(rateio.obra_id);
    const titulo = rateio.tituloFinanceiro;
    const tipo = String(titulo?.tipo || 'PAGAR').toUpperCase();
    const valorRateio = Number(rateio.valor_rateio || 0);
    const valorOriginalTitulo = Number(titulo?.valor_original || 0);
    const proporcaoBaixada = valorOriginalTitulo > 0
      ? Math.min(Number(titulo?.valor_baixado || 0) / valorOriginalTitulo, 1)
      : 0;
    if (!mapAgregados[obraId]) mapAgregados[obraId] = {};
    const atual = mapAgregados[obraId][tipo] || emptyTotals();
    mapAgregados[obraId][tipo] = {
      total_valor_original: atual.total_valor_original + valorRateio,
      total_valor_baixado: atual.total_valor_baixado + (valorRateio * proporcaoBaixada),
      total_valor_saldo: atual.total_valor_saldo + (valorRateio * (1 - proporcaoBaixada)),
      quantidade: atual.quantidade + 1
    };

    if (filters.comPeriodo && valorOriginalTitulo > 0) {
      (titulo.movimentos || []).forEach((movimento) => {
        const movimentoValor = Math.abs(Number(movimento.valor_quitacao || movimento.valor || 0));
        const parcelaRateio = movimentoValor * (valorRateio / valorOriginalTitulo);
        addValue(movimentosAcumulados, obraId, tipo, parcelaRateio);
        if (movimento.data_movimento >= filters.dataInicial) {
          addValue(movimentosPeriodo, obraId, tipo, parcelaRateio);
        }
      });
    }
  }

  const parcelasNegociadas = await require('./tituloRenegociacaoLeitura').buscarTitulos({
    where: {
      obra_id: { [Op.in]: obraIds },
      renegociacao_id: { [Op.ne]: null },
      status: { [Op.notIn]: ['CANCELADO', 'ESTORNADO'] }
    },
    attributes: ['id', 'obra_id', 'tipo', 'valor_original', 'valor_baixado', 'valor_saldo']
  });
  parcelasNegociadas.forEach((titulo) => {
    const obraId = Number(titulo.obra_id);
    if (!mapAgregados[obraId]) mapAgregados[obraId] = {};
    const atual = mapAgregados[obraId][titulo.tipo] || emptyTotals();
    ['valor_original', 'valor_baixado', 'valor_saldo'].forEach((campo) => {
      atual[`total_${campo}`] = round(atual[`total_${campo}`] + Number(titulo[campo] || 0));
    });
    atual.quantidade += 1;
    mapAgregados[obraId][titulo.tipo] = atual;
  });

  const mapHistoricos = {};
  historicos.forEach((row) => {
    const obraId = Number(row.obra_id);
    const tipo = String(row.tipo || '').toUpperCase();
    const valor = Number(row.valor || 0);
    if (!obraIds.includes(obraId) || !['PAGAR', 'RECEBER'].includes(tipo) || !Number.isFinite(valor) || valor <= 0) return;
    const atual = mapAgregados[obraId]?.[tipo] || emptyTotals();
    if (!mapAgregados[obraId]) mapAgregados[obraId] = {};
    mapAgregados[obraId][tipo] = {
      ...atual,
      total_valor_original: atual.total_valor_original + valor,
      total_valor_baixado: atual.total_valor_baixado + valor,
      quantidade: atual.quantidade + 1
    };
    if (!mapHistoricos[obraId]) mapHistoricos[obraId] = {};
    const current = mapHistoricos[obraId][tipo] || { valor: 0, quantidade: 0 };
    mapHistoricos[obraId][tipo] = { valor: current.valor + valor, quantidade: current.quantidade + 1 };
    if (filters.comPeriodo && row.data_pagamento <= filters.dataFinal) {
      addValue(movimentosAcumulados, obraId, tipo, valor);
      if (row.data_pagamento >= filters.dataInicial) {
        addValue(historicosPeriodo, obraId, tipo, valor);
        addValue(movimentosPeriodo, obraId, tipo, valor);
      }
    }
  });

  if (filters.comPeriodo) {
    const directMovements = await MovimentoFinanceiro.findAll({
      where: { status: 'ATIVO', data_movimento: { [Op.lte]: filters.dataFinal } },
      attributes: ['valor', 'valor_quitacao', 'data_movimento'],
      include: [{
        model: TituloFinanceiro,
        as: 'titulo',
        required: true,
        where: {
          obra_id: { [Op.in]: obraIds },
          origem_titulo: { [Op.ne]: 'RECARGA_CARTAO' },
          status: { [Op.notIn]: ['CANCELADO', 'ESTORNADO'] }
        },
        attributes: ['obra_id', 'tipo']
      }]
    });
    directMovements.forEach((movimento) => {
      const valor = Math.abs(Number(movimento.valor_quitacao || movimento.valor || 0));
      const obraId = Number(movimento.titulo?.obra_id);
      const tipo = movimento.titulo?.tipo;
      addValue(movimentosAcumulados, obraId, tipo, valor);
      if (movimento.data_movimento >= filters.dataInicial) {
        addValue(movimentosPeriodo, obraId, tipo, valor);
      }
    });
  }

  return obras.map((obra) => {
    const pagar = mapAgregados[obra.id]?.PAGAR || emptyTotals();
    const receber = mapAgregados[obra.id]?.RECEBER || emptyTotals();
    const executado = filters.comPeriodo ? round(movimentosPeriodo[obra.id]?.PAGAR) : round(pagar.total_valor_baixado);
    const recebido = filters.comPeriodo ? round(movimentosPeriodo[obra.id]?.RECEBER) : round(receber.total_valor_baixado);
    const executadoAcumulado = filters.comPeriodo ? round(movimentosAcumulados[obra.id]?.PAGAR) : round(pagar.total_valor_baixado);
    const recebidoAcumulado = filters.comPeriodo ? round(movimentosAcumulados[obra.id]?.RECEBER) : round(receber.total_valor_baixado);
    const classificacao = String(obra.classificacao || '').trim().toUpperCase();
    const margem = Number(obra.margem_custo_esperada || 0);
    const vgvInfo = vgvPorObra.get(Number(obra.id));
    const valorReferencia = classificacao === 'PRIVADA'
      ? Number(vgvInfo?.valor || 0)
      : classificacao === 'PUBLICA'
        ? Number(obra.planilha_geral || 0)
        : 0;
    const orcamento = valorReferencia > 0 && margem > 0
      ? valorReferencia * (1 - margem / 100)
      : null;
    const faltaReceber = valorReferencia > 0
      ? valorReferencia - recebidoAcumulado
      : Math.max(Number(receber.total_valor_original || 0) - recebidoAcumulado, 0);
    const vendas = vendasPorObra.get(Number(obra.id)) || { valor: 0, quantidade: 0 };
    const faltaVender = classificacao === 'PRIVADA' && valorReferencia > 0
      ? Math.max(valorReferencia - vendas.valor, 0)
      : null;

    return {
      id: obra.id,
      codigo: obra.codigo,
      nome: obra.nome,
      cidade: obra.cidade,
      classificacao: obra.classificacao,
      vgv: obra.vgv != null ? Number(obra.vgv) : null,
      vgv_efetivo: vgvInfo?.valor ?? null,
      vgv_origem: vgvInfo?.origem ?? null,
      vgv_unidades_total: vgvInfo?.unidades_total ?? 0,
      vgv_unidades_sem_valor: vgvInfo?.unidades_sem_valor ?? 0,
      planilha_geral: obra.planilha_geral != null ? Number(obra.planilha_geral) : null,
      margem_custo_esperada: obra.margem_custo_esperada != null ? Number(obra.margem_custo_esperada) : null,
      orcamento,
      valor_referencia_resultado: valorReferencia || null,
      valor_total_resultado: valorReferencia || null,
      falta_receber: round(faltaReceber),
      valor_vendido: round(vendas.valor),
      falta_vender: faltaVender == null ? null : round(faltaVender),
      quantidade_contratos_venda: vendas.quantidade,
      lucro_prejuizo: round(recebido - executado),
      periodo: filters.comPeriodo ? { data_inicial: filters.dataInicial, data_final: filters.dataFinal } : null,
      pagar: {
        total: round(pagar.total_valor_original),
        executado,
        executado_acumulado_ate: executadoAcumulado,
        saldo: round(pagar.total_valor_saldo),
        quantidade: pagar.quantidade,
        historico: filters.comPeriodo
          ? { valor: round(historicosPeriodo[obra.id]?.PAGAR), quantidade: 0 }
          : mapHistoricos[obra.id]?.PAGAR || { valor: 0, quantidade: 0 }
      },
      receber: {
        total: round(receber.total_valor_original),
        recebido,
        recebido_acumulado_ate: recebidoAcumulado,
        saldo: round(receber.total_valor_saldo),
        quantidade: receber.quantidade,
        historico: filters.comPeriodo
          ? { valor: round(historicosPeriodo[obra.id]?.RECEBER), quantidade: 0 }
          : mapHistoricos[obra.id]?.RECEBER || { valor: 0, quantidade: 0 }
      }
    };
  });
}

module.exports = { gerarResultadoObras, normalizeFilters };
