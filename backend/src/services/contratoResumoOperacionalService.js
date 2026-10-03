'use strict';

const { Op } = require('sequelize');
const {
  ContratoParcela,
  MedicaoParcela,
  ContratoMedicao,
  Solicitacao,
  SolicitacaoPagamento,
  TituloFinanceiro,
  Comprovante
} = require('../models');
const { projetarOrigens } = require('./tituloRenegociacaoVinculos');

const STATUS_RESCISAO = new Set(['RESCINDIDO', 'ENCERRADO']);
const STATUS_SOLICITACAO_CANCELADA = new Set([
  'CANCELADA', 'CANCELADO', 'REJEITADA', 'REJEITADO'
]);
const STATUS_TITULO_IGNORADO = new Set([
  'CANCELADO', 'CANCELADA', 'ESTORNADO', 'EXCLUIDO'
]);

function numero(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dinheiro(value) {
  return Math.round((numero(value) + Number.EPSILON) * 100) / 100;
}

function status(value) {
  return String(value || '').trim().toUpperCase();
}

function contratoFoiRescindido(contrato) {
  return STATUS_RESCISAO.has(status(contrato?.status_contrato)) || Boolean(contrato?.rescindido_em);
}

function classificarStatusOperacional({ contratado, medido, movimentado, rescindido }) {
  if (rescindido) return 'RESCINDIDO';
  const saldoContratual = Math.max(dinheiro(contratado - medido), 0);
  const saldoFinanceiro = Math.max(dinheiro(medido - movimentado), 0);
  if (saldoContratual > 0.009) return 'ATIVO';
  if (saldoFinanceiro > 0.009) return 'TOTALMENTE_MEDIDO';
  return 'CONCLUIDO';
}

function valoresBase(contrato) {
  const valorBase = dinheiro(contrato?.valor_total);
  const aditivos = dinheiro(contrato?.valor_aditivos);
  const ajustesLegados = dinheiro(contrato?.ajuste_solicitado);
  return {
    valor_base: valorBase,
    valor_aditivos: aditivos,
    ajustes_legados: ajustesLegados,
    contratado: dinheiro(valorBase + aditivos + ajustesLegados)
  };
}

function montarResumo({ contrato, medido, movimentado, solicitacoes, medicoes, titulos, alertas }) {
  const base = valoresBase(contrato);
  const rescindido = contratoFoiRescindido(contrato);
  const saldoContratualCalculado = Math.max(dinheiro(base.contratado - medido), 0);
  const saldoContratual = rescindido ? 0 : saldoContratualCalculado;
  const saldoFinanceiro = Math.max(dinheiro(medido - movimentado), 0);
  const statusOperacional = classificarStatusOperacional({
    contratado: base.contratado,
    medido,
    movimentado,
    rescindido
  });

  if (!rescindido && contrato?.ativo === false) {
    alertas.push({
      codigo: 'CADASTRO_INATIVO_SEM_RESCISAO',
      mensagem: 'Contrato inativo sem registro formal de rescisao; a classificacao continua baseada nos valores atuais.'
    });
  }
  if (medido > base.contratado + 0.009) {
    alertas.push({
      codigo: 'MEDICAO_ACIMA_DO_CONTRATADO',
      mensagem: 'O valor medido supera o valor contratado.'
    });
  }
  if (movimentado > medido + 0.009) {
    alertas.push({
      codigo: 'MOVIMENTADO_ACIMA_DO_MEDIDO',
      mensagem: 'O valor movimentado supera o valor medido.'
    });
  }

  return {
    ...base,
    fluxo: contrato?.fluxo_novo ? 'NOVO' : 'LEGADO',
    status_operacional: statusOperacional,
    medido: dinheiro(medido),
    movimentado: dinheiro(movimentado),
    saldo_contratual: dinheiro(saldoContratual),
    saldo_contratual_cancelado: rescindido
      ? dinheiro(contrato?.saldo_rescindido ?? saldoContratualCalculado)
      : 0,
    saldo_financeiro: dinheiro(saldoFinanceiro),
    total_solicitacoes: solicitacoes.length,
    total_medicoes: medicoes.length,
    total_titulos: titulos.length,
    solicitacoes,
    medicoes,
    titulos,
    alertas,
    rescisao: rescindido ? {
      motivo: contrato?.motivo_rescisao || null,
      rescindido_em: contrato?.rescindido_em || null,
      rescindido_por: contrato?.rescindido_por || null
    } : null,

    // Compatibilidade temporaria com consumidores antigos. A nomenclatura nova deve usar os
    // campos acima; os aliases evitam quebrar exportacoes e preferencias de coluna existentes.
    total_solicitado: base.contratado,
    total_pago: dinheiro(movimentado),
    total_a_pagar: dinheiro(saldoContratual),
    ajuste_solicitado: base.ajustes_legados,
    ajuste_pago: dinheiro(contrato?.ajuste_pago)
  };
}

function agruparPor(lista, chave) {
  const mapa = new Map();
  for (const item of lista) {
    const id = Number(item?.[chave]);
    if (!id) continue;
    if (!mapa.has(id)) mapa.set(id, []);
    mapa.get(id).push(item);
  }
  return mapa;
}

async function carregarDadosOperacionais(contratoIds, { transaction } = {}) {
  if (!contratoIds.length) {
    return { solicitacoesPorContrato: new Map(), parcelasPorContrato: new Map() };
  }

  const [solicitacoes, parcelas] = await Promise.all([
    Solicitacao.findAll({
      where: { contrato_id: { [Op.in]: contratoIds } },
      attributes: [
        'id', 'contrato_id', 'codigo', 'descricao', 'valor', 'valor_pago_acumulado',
        'status_global', 'data_inicio_medicao', 'data_fim_medicao', 'createdAt'
      ],
      include: [
        {
          model: SolicitacaoPagamento,
          as: 'pagamentos',
          attributes: ['id', 'valor', 'data_pagamento'],
          required: false
        },
        {
          model: TituloFinanceiro.unscoped(),
          as: 'titulosFinanceiros',
          attributes: [
            'id', 'codigo', 'status', 'valor_original', 'valor_baixado', 'valor_saldo',
            'data_vencimento', 'deleted_at', 'renegociado_por_id'
          ],
          required: false
        },
        {
          model: Comprovante,
          as: 'comprovantes',
          attributes: ['id', 'status'],
          required: false
        }
      ],
      order: [['createdAt', 'ASC']],
      transaction
    }),
    ContratoParcela.findAll({
      where: { contrato_id: { [Op.in]: contratoIds } },
      attributes: [
        'id', 'contrato_id', 'numero', 'valor', 'valor_previsto', 'data_vencimento',
        'status', 'titulo_financeiro_id'
      ],
      include: [
        {
          model: TituloFinanceiro.unscoped(),
          as: 'titulo',
          attributes: [
            'id', 'codigo', 'status', 'valor_original', 'valor_baixado', 'valor_saldo',
            'data_vencimento', 'deleted_at', 'renegociado_por_id'
          ],
          required: false
        },
        {
          model: MedicaoParcela,
          as: 'medicoes',
          attributes: ['id', 'medicao_id', 'valor_medido', 'devolvido_em'],
          required: false,
          include: [{
            model: ContratoMedicao,
            as: 'medicao',
            attributes: [
              'id', 'numero', 'periodo_inicio', 'periodo_fim', 'valor_total',
              'aprovada_em', 'createdAt'
            ],
            required: false
          }]
        }
      ],
      order: [['contrato_id', 'ASC'], ['numero', 'ASC']],
      transaction
    })
  ]);

  const titulosSolicitacoes = solicitacoes.flatMap(item => item.titulosFinanceiros || []);
  const titulosParcelas = parcelas.map(item => item.titulo).filter(Boolean);
  const titulosProjetados = await projetarOrigens(
    [...titulosSolicitacoes, ...titulosParcelas],
    { transaction }
  );
  const projecaoPorId = new Map(titulosProjetados.map(item => [Number(item.id), item]));

  for (const solicitacao of solicitacoes) {
    solicitacao.setDataValue('titulosFinanceiros', (solicitacao.titulosFinanceiros || [])
      .map(item => projecaoPorId.get(Number(item.id)) || item));
  }
  for (const parcela of parcelas) {
    if (!parcela.titulo) continue;
    parcela.setDataValue('titulo', projecaoPorId.get(Number(parcela.titulo.id)) || parcela.titulo);
  }

  return {
    solicitacoesPorContrato: agruparPor(solicitacoes, 'contrato_id'),
    parcelasPorContrato: agruparPor(parcelas, 'contrato_id')
  };
}

function resumirLegado(contrato, solicitacoes) {
  const alertas = [];
  const detalhesSolicitacoes = [];
  const detalhesTitulos = [];
  let medido = 0;
  let movimentado = dinheiro(contrato?.ajuste_pago);

  for (const solicitacao of solicitacoes) {
    const titulos = solicitacao.titulosFinanceiros || [];
    const titulosValidos = titulos.filter(item => (
      !item.deleted_at && !STATUS_TITULO_IGNORADO.has(status(item.status))
    ));
    const pagamentos = solicitacao.pagamentos || [];
    const valorPagamentos = dinheiro(pagamentos.reduce((acc, item) => acc + numero(item.valor), 0));
    const valorPagoAcumulado = dinheiro(solicitacao.valor_pago_acumulado);
    const valorPorTitulo = dinheiro(titulosValidos.reduce((acc, item) => acc + numero(item.valor_baixado), 0));
    const possuiEvidenciaFinanceira = titulosValidos.length > 0 || valorPagamentos > 0 || valorPagoAcumulado > 0;
    const cancelada = STATUS_SOLICITACAO_CANCELADA.has(status(solicitacao.status_global));
    const valorMedicao = dinheiro(solicitacao.valor);
    const considerarMedicao = !cancelada || possuiEvidenciaFinanceira;

    let valorMovimentado = 0;
    let fonteFinanceira = 'SEM_MOVIMENTO';
    if (titulosValidos.length > 0) {
      valorMovimentado = valorPorTitulo;
      fonteFinanceira = 'TITULOS';
    } else if (Math.max(valorPagamentos, valorPagoAcumulado) > 0) {
      valorMovimentado = Math.max(valorPagamentos, valorPagoAcumulado);
      fonteFinanceira = 'PAGAMENTOS_LEGADOS';
      if (Math.abs(valorPagamentos - valorPagoAcumulado) > 0.009 && valorPagamentos && valorPagoAcumulado) {
        alertas.push({
          codigo: 'PAGAMENTO_LEGADO_DIVERGENTE',
          solicitacao_id: solicitacao.id,
          mensagem: `Solicitacao ${solicitacao.codigo || solicitacao.id} tem divergencia entre pagamentos e acumulado.`
        });
      }
    } else if (status(solicitacao.status_global) === 'PAGA') {
      valorMovimentado = valorMedicao;
      fonteFinanceira = 'STATUS_HISTORICO';
      alertas.push({
        codigo: 'PAGAMENTO_SOMENTE_POR_STATUS',
        solicitacao_id: solicitacao.id,
        mensagem: `Solicitacao ${solicitacao.codigo || solicitacao.id} foi considerada paga apenas pelo status historico.`
      });
    }

    if (cancelada && possuiEvidenciaFinanceira) {
      alertas.push({
        codigo: 'SOLICITACAO_CANCELADA_COM_FINANCEIRO',
        solicitacao_id: solicitacao.id,
        mensagem: `Solicitacao ${solicitacao.codigo || solicitacao.id} esta cancelada, mas possui evidencia financeira.`
      });
    }

    if (considerarMedicao) medido += valorMedicao;
    movimentado += valorMovimentado;

    detalhesSolicitacoes.push({
      id: solicitacao.id,
      codigo: solicitacao.codigo || `SOL-${solicitacao.id}`,
      descricao: solicitacao.descricao,
      status: solicitacao.status_global,
      valor: valorMedicao,
      movimentado: dinheiro(valorMovimentado),
      fonte_financeira: fonteFinanceira,
      periodo_inicio: solicitacao.data_inicio_medicao,
      periodo_fim: solicitacao.data_fim_medicao,
      comprovantes: (solicitacao.comprovantes || []).length,
      considerada_na_medicao: considerarMedicao
    });
    for (const titulo of titulos) {
      detalhesTitulos.push({
        id: titulo.id,
        codigo: titulo.codigo,
        solicitacao_id: solicitacao.id,
        status: titulo.status,
        valor: dinheiro(titulo.valor_original),
        movimentado: dinheiro(titulo.valor_baixado),
        saldo: dinheiro(titulo.valor_saldo),
        vencimento: titulo.data_vencimento,
        cancelado: Boolean(titulo.deleted_at) || STATUS_TITULO_IGNORADO.has(status(titulo.status))
      });
    }
  }

  return montarResumo({
    contrato,
    medido: dinheiro(medido),
    movimentado: dinheiro(movimentado),
    solicitacoes: detalhesSolicitacoes,
    medicoes: detalhesSolicitacoes.filter(item => item.considerada_na_medicao),
    titulos: detalhesTitulos,
    alertas
  });
}

function resumirNovo(contrato, parcelas) {
  const alertas = [];
  const medicoesPorId = new Map();
  const detalhesTitulos = [];
  let medido = 0;
  let movimentado = 0;

  for (const parcela of parcelas) {
    const medicoesAtivas = (parcela.medicoes || []).filter(item => !item.devolvido_em);
    const valorMedidoParcela = dinheiro(medicoesAtivas.reduce((acc, item) => acc + numero(item.valor_medido), 0));
    medido += valorMedidoParcela;

    for (const vinculo of medicoesAtivas) {
      const medicao = vinculo.medicao;
      const id = Number(vinculo.medicao_id || medicao?.id || vinculo.id);
      if (!medicoesPorId.has(id)) {
        medicoesPorId.set(id, {
          id: medicao?.id || id,
          numero: medicao?.numero || null,
          periodo_inicio: medicao?.periodo_inicio || null,
          periodo_fim: medicao?.periodo_fim || null,
          valor: 0,
          aprovada_em: medicao?.aprovada_em || null,
          status: medicao?.aprovada_em ? 'APROVADA' : 'PENDENTE'
        });
      }
      const item = medicoesPorId.get(id);
      item.valor = dinheiro(item.valor + numero(vinculo.valor_medido));
    }

    const titulo = parcela.titulo;
    if (titulo) {
      const cancelado = Boolean(titulo.deleted_at) || STATUS_TITULO_IGNORADO.has(status(titulo.status));
      // Um titulo pode existir desde a aprovacao do contrato. So a parcela efetivamente medida
      // transforma sua baixa em movimento desta gestao operacional.
      if (valorMedidoParcela > 0 && !cancelado) {
        movimentado += Math.min(numero(titulo.valor_baixado), valorMedidoParcela);
      }
      detalhesTitulos.push({
        id: titulo.id,
        codigo: titulo.codigo,
        parcela: parcela.numero,
        status: titulo.status,
        valor: dinheiro(titulo.valor_original),
        movimentado: dinheiro(titulo.valor_baixado),
        saldo: dinheiro(titulo.valor_saldo),
        vencimento: titulo.data_vencimento,
        medido: valorMedidoParcela,
        cancelado
      });
    }
  }

  const solicitacoes = contrato?.solicitacao_id ? [{
    id: contrato.solicitacao_id,
    codigo: contrato?.solicitacaoContrato?.codigo || `SOL-${contrato.solicitacao_id}`,
    descricao: contrato?.solicitacaoContrato?.descricao || contrato.descricao,
    status: contrato?.solicitacaoContrato?.status_global || contrato.status_contrato,
    valor: dinheiro(medido),
    movimentado: dinheiro(movimentado),
    fonte_financeira: 'TITULOS_DAS_PARCELAS',
    considerada_na_medicao: true
  }] : [];

  return montarResumo({
    contrato,
    medido: dinheiro(medido),
    movimentado: dinheiro(movimentado),
    solicitacoes,
    medicoes: Array.from(medicoesPorId.values()).sort((a, b) => numero(a.numero) - numero(b.numero)),
    titulos: detalhesTitulos,
    alertas
  });
}

async function calcularResumosOperacionais(contratos, options = {}) {
  const lista = Array.isArray(contratos) ? contratos : [];
  const ids = lista.map(item => Number(item.id)).filter(Boolean);
  const { solicitacoesPorContrato, parcelasPorContrato } = await carregarDadosOperacionais(ids, options);
  const mapa = new Map();

  for (const contrato of lista) {
    const id = Number(contrato.id);
    const resumo = contrato.fluxo_novo
      ? resumirNovo(contrato, parcelasPorContrato.get(id) || [])
      : resumirLegado(contrato, solicitacoesPorContrato.get(id) || []);
    mapa.set(id, resumo);
  }
  return mapa;
}

async function calcularResumoOperacional(contrato, options = {}) {
  const mapa = await calcularResumosOperacionais([contrato], options);
  return mapa.get(Number(contrato.id));
}

module.exports = {
  STATUS_RESCISAO,
  calcularResumoOperacional,
  calcularResumosOperacionais,
  classificarStatusOperacional,
  contratoFoiRescindido,
  valoresBase
};
