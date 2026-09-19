const { Op } = require('sequelize');
const {
  Contrato,
  Historico,
  Solicitacao,
  SolicitacaoPedidoRetorno,
  StatusArea,
  TituloFinanceiro
} = require('../models');
const {
  findSetorByCapability,
  resolveSetorPersistenciaValue
} = require('./setorCapabilityService');

const STATUS_SOLICITACAO_PAGA = 'PAGA';
const STATUS_SOLICITACAO_PAGAMENTO_PARCIAL = 'PARCIALMENTE PAGO';
const STATUS_SOLICITACAO_PAGAMENTO_PARCIAL_LEGADO = 'PAGAMENTO PARCIAL';
const STATUS_SOLICITACAO_TITULO_CADASTRADO = 'TITULO_CADASTRADO';
const STATUS_TITULOS_IGNORADOS = ['CANCELADO', 'CANCELADA', 'ESTORNADO', 'EXCLUIDO'];

function normalizarStatus(value) {
  return String(value || '').trim().toUpperCase();
}

function roundCurrency(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function tituloQuitado(titulo) {
  const status = normalizarStatus(titulo?.status);
  if (['QUITADO', 'BAIXADO', 'PAGO', 'PAGA', 'CONCILIADO'].includes(status)) return true;
  return roundCurrency(titulo?.valor_saldo) <= 0 && roundCurrency(titulo?.valor_baixado) > 0;
}

function tituloComBaixa(titulo) {
  const status = normalizarStatus(titulo?.status);
  if (['PARCIAL', 'QUITADO', 'BAIXADO', 'PAGO', 'PAGA', 'CONCILIADO'].includes(status)) return true;
  return roundCurrency(titulo?.valor_baixado) > 0;
}

function setoresEquivalentes(a, b) {
  const normalizar = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_');
  const esquerda = normalizar(a);
  const direita = normalizar(b);
  if (!esquerda || !direita) return false;
  if (esquerda === direita) return true;
  const aliasesGeo = new Set(['GEO', 'GERENCIA_DE_PROCESSOS', 'GERENCIA_PROCESSOS']);
  return aliasesGeo.has(esquerda) && aliasesGeo.has(direita);
}

async function encaminharSolicitacaoParaFinanceiroAoEnfileirar({ solicitacao, usuarioId, transaction }) {
  if (!solicitacao) return false;
  const setorFinanceiroModel = await findSetorByCapability('eh_setor_financeiro', { transaction });
  const setorFinanceiro = resolveSetorPersistenciaValue(setorFinanceiroModel, 'FINANCEIRO');
  const setorAnterior = solicitacao.area_responsavel || null;
  const statusAnterior = solicitacao.status_global || null;
  const mudouSetor = !setoresEquivalentes(setorAnterior, setorFinanceiro);
  const mudouStatus = normalizarStatus(statusAnterior) !== 'ENVIADO PARA PAGAMENTO';
  if (!mudouSetor && !mudouStatus) return false;

  await solicitacao.update({
    area_responsavel: setorFinanceiro,
    status_global: 'ENVIADO PARA PAGAMENTO'
  }, { transaction });
  if (mudouStatus) {
    await Historico.create({
      solicitacao_id: solicitacao.id,
      usuario_responsavel_id: usuarioId || null,
      setor: setorFinanceiro,
      acao: 'STATUS_ALTERADO',
      status_anterior: statusAnterior,
      status_novo: 'ENVIADO PARA PAGAMENTO',
      observacao: 'Titulo financeiro encaminhado para a fila de pagamentos.'
    }, { transaction });
    await StatusArea.create({
      solicitacao_id: solicitacao.id,
      setor: setorFinanceiro,
      status: 'ENVIADO PARA PAGAMENTO',
      observacao: 'Titulo financeiro encaminhado para a fila de pagamentos.'
    }, { transaction });
  }
  if (mudouSetor) {
    await Historico.create({
      solicitacao_id: solicitacao.id,
      usuario_responsavel_id: usuarioId || null,
      setor: setorFinanceiro,
      acao: 'ENVIADA_SETOR',
      observacao: `De ${setorAnterior || '-'} para ${setorFinanceiro}`,
      descricao: 'Solicitacao assumida pelo Financeiro porque um titulo entrou na fila de pagamentos.',
      metadata: JSON.stringify({
        origem: 'FILA_PAGAMENTOS',
        setor_origem: setorAnterior,
        setor_destino: setorFinanceiro
      })
    }, { transaction });
  }
  return true;
}

async function devolverAoSetorObraAposBaixa({ solicitacao, usuarioId, transaction, titulos = null }) {
  const titulosAtuais = Array.isArray(titulos) ? titulos : await TituloFinanceiro.findAll({
    where: {
      solicitacao_id: solicitacao.id,
      status: { [Op.notIn]: STATUS_TITULOS_IGNORADOS }
    },
    attributes: ['id', 'status', 'valor_saldo', 'valor_baixado'],
    transaction,
    lock: transaction?.LOCK?.UPDATE
  });
  if (!titulosAtuais.some(tituloComBaixa)) return false;

  const setorFinanceiroModel = await findSetorByCapability('eh_setor_financeiro', { transaction });
  const setorFinanceiro = resolveSetorPersistenciaValue(setorFinanceiroModel, 'FINANCEIRO');
  if (!setoresEquivalentes(solicitacao.area_responsavel, setorFinanceiro)) return false;

  const setorObraModel = await findSetorByCapability('eh_setor_obra', { transaction });
  const setorObra = resolveSetorPersistenciaValue(setorObraModel, 'OBRA');
  const setorAnterior = solicitacao.area_responsavel || null;
  const idsComBaixa = titulosAtuais.filter(tituloComBaixa).map((titulo) => Number(titulo.id)).filter(Boolean);
  const metadataRetorno = {
    retorno_automatico_baixa: true,
    setor_origem: setorAnterior,
    setor_destino: setorObra,
    titulos_com_baixa_ids: idsComBaixa
  };

  await solicitacao.update({ area_responsavel: setorObra }, { transaction });
  await Historico.create({
    solicitacao_id: solicitacao.id,
    usuario_responsavel_id: usuarioId || null,
    setor: setorObra,
    acao: 'ENVIADA_SETOR',
    observacao: `De ${setorAnterior || '-'} para ${setorObra}`,
    descricao: 'Retorno automatico para Obra apos baixa integral ou parcial de titulo financeiro.',
    metadata: JSON.stringify(metadataRetorno)
  }, { transaction });

  // A decisao de retorno usa a ordem de lock pedido -> solicitacao. Expirar os pedidos ainda
  // dentro desta transacao (que ja bloqueou solicitacao -> titulo) criaria ordem inversa e risco
  // de deadlock. A limpeza ocorre somente depois do commit da movimentacao financeira.
  const expirarPedidosPendentes = async () => {
    try {
      await SolicitacaoPedidoRetorno.update(
        {
          status: 'EXPIRADO',
          motivo_decisao: 'A solicitacao voltou automaticamente para Obra apos baixa de titulo.'
        },
        { where: { solicitacao_id: solicitacao.id, status: 'PENDENTE' } }
      );
    } catch (error) {
      console.error('Falha ao expirar pedidos de retorno apos baixa:', error);
    }
  };
  if (transaction && typeof transaction.afterCommit === 'function') {
    transaction.afterCommit(expirarPedidosPendentes);
  } else {
    await expirarPedidosPendentes();
  }
  return true;
}

function calcularStatusSolicitacaoPorTitulos(titulos = [], statusAtual = null) {
  const titulosValidos = titulos.filter((titulo) => !STATUS_TITULOS_IGNORADOS.includes(normalizarStatus(titulo?.status)));
  if (titulosValidos.length === 0) return null;

  if (titulosValidos.every(tituloQuitado)) {
    return STATUS_SOLICITACAO_PAGA;
  }

  if (titulosValidos.some(tituloComBaixa)) {
    return STATUS_SOLICITACAO_PAGAMENTO_PARCIAL;
  }

  const statusAtualNormalizado = normalizarStatus(statusAtual).replace(/_/g, ' ');
  if ([STATUS_SOLICITACAO_PAGA, STATUS_SOLICITACAO_PAGAMENTO_PARCIAL, STATUS_SOLICITACAO_PAGAMENTO_PARCIAL_LEGADO].includes(statusAtualNormalizado)) {
    return STATUS_SOLICITACAO_TITULO_CADASTRADO;
  }

  return null;
}

async function sincronizarStatusSolicitacaoPorBaixaTitulos({
  solicitacaoId,
  usuarioId = null,
  setor = null,
  transaction = null,
  observacao = null
} = {}) {
  const id = Number(solicitacaoId || 0);
  if (!Number.isInteger(id) || id <= 0) return null;

  const solicitacao = await Solicitacao.findByPk(id, {
    attributes: ['id', 'status_global', 'area_responsavel'],
    transaction,
    lock: transaction?.LOCK?.UPDATE
  });
  if (!solicitacao) return null;

  const titulos = await TituloFinanceiro.findAll({
    where: {
      solicitacao_id: id,
      status: { [Op.notIn]: STATUS_TITULOS_IGNORADOS }
    },
    attributes: ['id', 'status', 'valor_saldo', 'valor_baixado'],
    transaction,
    lock: transaction?.LOCK?.UPDATE
  });

  // DESVIO PARA A SOLICITACAO DE CONTRATO DO FLUXO NOVO (20/08).
  //
  // Ela nao segue a regra geral: e uma solicitacao so para o contrato inteiro, e o cliente definiu
  // NEC. DE MEDICAO / APROVADA / PAGA em vez de PARCIALMENTE PAGO. Ver
  // `medicaoContratoService.calcularStatusDaSolicitacaoDoContrato`.
  //
  // O desvio mora AQUI, e nao numa segunda funcao, porque esta e chamada por CINCO caminhos de
  // baixa (pagamento, cheque, boleto, fatura de cartao, conciliacao). Uma funcao paralela seria
  // esquecida em pelo menos um deles, e o status do contrato divergiria conforme a forma de pagar.
  const contratoDoFluxoNovo = await Contrato.findOne({
    where: { solicitacao_id: id, fluxo_novo: true },
    attributes: ['id'],
    transaction
  });
  if (contratoDoFluxoNovo) {
    const { sincronizarStatusDaSolicitacaoDoContrato } = require('./medicaoContratoService');
    const statusContrato = await sincronizarStatusDaSolicitacaoDoContrato(
      contratoDoFluxoNovo.id,
      { usuarioId, setor, motivo: observacao || 'Status atualizado apos baixa de titulo do contrato.' },
      transaction
    );
    await devolverAoSetorObraAposBaixa({ solicitacao, usuarioId, transaction, titulos });
    return statusContrato;
  }

  // Recarga de cartao encerra pelo valor efetivamente pago. Um titulo PARCIAL nao pode continuar
  // com saldo em aberto porque o ciclo da recarga terminou; o valor solicitado original permanece
  // na extensao auditavel do fluxo e a prestacao cobra somente o que efetivamente saiu do caixa.
  const { sincronizarCicloAposBaixa } = require('./recargaCartaoService');
  const statusRecarga = await sincronizarCicloAposBaixa({
    solicitacaoId: id,
    usuarioId,
    setor,
    transaction
  });
  if (statusRecarga) {
    await devolverAoSetorObraAposBaixa({ solicitacao, usuarioId, transaction, titulos });
    return statusRecarga;
  }

  const statusAnterior = solicitacao.status_global || null;
  const titulosEfetivos = await require('./tituloRenegociacaoVinculos').projetarOrigens(titulos, { transaction });
  const statusNovo = calcularStatusSolicitacaoPorTitulos(titulosEfetivos, statusAnterior);
  if (!statusNovo || normalizarStatus(statusAnterior) === normalizarStatus(statusNovo)) {
    await devolverAoSetorObraAposBaixa({ solicitacao, usuarioId, transaction, titulos: titulosEfetivos });
    return statusAnterior;
  }

  await solicitacao.update(
    { status_global: statusNovo },
    { transaction }
  );

  await Historico.create(
    {
      solicitacao_id: solicitacao.id,
      usuario_responsavel_id: usuarioId || null,
      setor: setor || solicitacao.area_responsavel || 'FINANCEIRO',
      acao: 'STATUS_ALTERADO',
      status_anterior: statusAnterior,
      status_novo: statusNovo,
      observacao: observacao || 'Status atualizado automaticamente apos baixa de titulo financeiro.'
    },
    { transaction }
  );

  await devolverAoSetorObraAposBaixa({ solicitacao, usuarioId, transaction, titulos: titulosEfetivos });

  return statusNovo;
}

module.exports = {
  STATUS_SOLICITACAO_PAGA,
  STATUS_SOLICITACAO_PAGAMENTO_PARCIAL,
  encaminharSolicitacaoParaFinanceiroAoEnfileirar,
  devolverAoSetorObraAposBaixa,
  sincronizarStatusSolicitacaoPorBaixaTitulos
};
