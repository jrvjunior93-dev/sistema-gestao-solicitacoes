const { Op } = require('sequelize');
const {
  Contrato,
  Historico,
  Solicitacao,
  SolicitacaoPedidoRetorno,
  TituloFinanceiro
} = require('../models');

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

function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

async function devolverAoSetorCriadorAposQuitacao({ solicitacao, usuarioId, transaction }) {
  const titulosQuitados = await TituloFinanceiro.findAll({
    where: {
      solicitacao_id: solicitacao.id,
      status: { [Op.notIn]: STATUS_TITULOS_IGNORADOS }
    },
    attributes: ['id', 'status', 'valor_saldo', 'valor_baixado'],
    transaction,
    lock: transaction?.LOCK?.UPDATE
  });
  const idsQuitados = (await require('./tituloRenegociacaoVinculos').projetarOrigens(titulosQuitados, { transaction }))
    .filter(tituloQuitado).map((titulo) => Number(titulo.id));
  if (idsQuitados.length === 0) return false;

  // Cada titulo quitado provoca no maximo um retorno automatico. Sem esta marca, um retry de
  // conciliacao poderia puxar novamente a solicitacao depois de um envio manual posterior.
  const movimentosAutomaticos = await Historico.findAll({
    where: {
      solicitacao_id: solicitacao.id,
      acao: { [Op.in]: ['ENVIADA_SETOR', 'TITULO_QUITADO_RETORNO_ORIGEM'] }
    },
    attributes: ['metadata'],
    transaction
  });
  const idsJaProcessados = new Set();
  movimentosAutomaticos.forEach((item) => {
    const metadata = parseMetadata(item.metadata);
    if (metadata?.retorno_automatico_quitacao !== true) return;
    (Array.isArray(metadata.titulos_quitados_ids) ? metadata.titulos_quitados_ids : [])
      .map(Number)
      .filter(Boolean)
      .forEach((id) => idsJaProcessados.add(id));
  });
  const idsNovos = idsQuitados.filter((id) => !idsJaProcessados.has(id));
  if (idsNovos.length === 0) return false;

  let historicoCriacao = await Historico.findOne({
    where: { solicitacao_id: solicitacao.id, acao: 'SOLICITACAO_CRIADA' },
    attributes: ['id', 'setor', 'metadata'],
    order: [['createdAt', 'ASC'], ['id', 'ASC']],
    transaction
  });
  // Solicitacoes legadas podem nao ter a acao padronizada. O primeiro evento com setor e o
  // melhor snapshot auditavel disponivel; nao usamos o setor atual do criador, que pode ter
  // mudado desde a abertura.
  if (!historicoCriacao) {
    historicoCriacao = await Historico.findOne({
      where: {
        solicitacao_id: solicitacao.id,
        setor: { [Op.ne]: null }
      },
      attributes: ['id', 'setor', 'metadata'],
      order: [['createdAt', 'ASC'], ['id', 'ASC']],
      transaction
    });
  }
  const metadataCriacao = parseMetadata(historicoCriacao?.metadata);
  const setorCriador = String(
    historicoCriacao?.setor || metadataCriacao?.area_responsavel || metadataCriacao?.setor_origem || ''
  ).trim();
  if (!setorCriador) return false;

  const setorAnterior = solicitacao.area_responsavel || null;
  const metadataRetorno = {
    retorno_automatico_quitacao: true,
    setor_origem: setorAnterior,
    setor_destino: setorCriador,
    titulos_quitados_ids: idsNovos
  };

  if (setoresEquivalentes(setorAnterior, setorCriador)) {
    await Historico.create({
      solicitacao_id: solicitacao.id,
      usuario_responsavel_id: usuarioId || null,
      setor: setorCriador,
      acao: 'TITULO_QUITADO_RETORNO_ORIGEM',
      descricao: `Quitacao confirmada; a solicitacao ja estava no setor criador ${setorCriador}.`,
      metadata: JSON.stringify(metadataRetorno)
    }, { transaction });
    return false;
  }

  await solicitacao.update({ area_responsavel: setorCriador }, { transaction });
  await Historico.create({
    solicitacao_id: solicitacao.id,
    usuario_responsavel_id: usuarioId || null,
    setor: setorCriador,
    acao: 'ENVIADA_SETOR',
    observacao: `De ${setorAnterior || '-'} para ${setorCriador}`,
    descricao: `Retorno automatico ao setor criador apos quitacao de titulo financeiro.`,
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
          motivo_decisao: 'A solicitacao voltou automaticamente ao setor criador apos quitacao de titulo.'
        },
        { where: { solicitacao_id: solicitacao.id, status: 'PENDENTE' } }
      );
    } catch (error) {
      console.error('Falha ao expirar pedidos de retorno apos quitacao:', error);
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
    await devolverAoSetorCriadorAposQuitacao({ solicitacao, usuarioId, transaction });
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
    await devolverAoSetorCriadorAposQuitacao({ solicitacao, usuarioId, transaction });
    return statusRecarga;
  }

  const statusAnterior = solicitacao.status_global || null;
  const titulosEfetivos = await require('./tituloRenegociacaoVinculos').projetarOrigens(titulos, { transaction });
  const statusNovo = calcularStatusSolicitacaoPorTitulos(titulosEfetivos, statusAnterior);
  if (!statusNovo || normalizarStatus(statusAnterior) === normalizarStatus(statusNovo)) {
    await devolverAoSetorCriadorAposQuitacao({ solicitacao, usuarioId, transaction });
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

  await devolverAoSetorCriadorAposQuitacao({ solicitacao, usuarioId, transaction });

  return statusNovo;
}

module.exports = {
  STATUS_SOLICITACAO_PAGA,
  STATUS_SOLICITACAO_PAGAMENTO_PARCIAL,
  devolverAoSetorCriadorAposQuitacao,
  sincronizarStatusSolicitacaoPorBaixaTitulos
};
