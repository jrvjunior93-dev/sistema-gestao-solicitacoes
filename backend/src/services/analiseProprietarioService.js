const { Op } = require('sequelize');
const { Historico, StatusArea, Solicitacao, TituloFinanceiro, PagamentoManualFilaItem, SecurityEventLog } = require('../models');

const STATUS_ANALISE_PROPRIETARIO = 'EM ANÁLISE DO PROPRIETÁRIO';
const STATUS_ENVIADO_PAGAMENTO = 'ENVIADO PARA PAGAMENTO';
const STATUS_AJUSTE_PAGAMENTO = 'AGUARDANDO AJUSTE DE PAGAMENTO';
const STATUS_INTERNOS_OPERACIONAIS = [STATUS_ANALISE_PROPRIETARIO, STATUS_ENVIADO_PAGAMENTO, STATUS_AJUSTE_PAGAMENTO];
const normalizar = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();
const emAnaliseProprietario = (value) => normalizar(value) === normalizar(STATUS_ANALISE_PROPRIETARIO);

function incluirStatusOperacionais(status = []) {
  const vistos = new Set();
  return [...STATUS_INTERNOS_OPERACIONAIS, ...status].filter((item) => {
    const chave = normalizar(item);
    if (!chave || vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}

// Chamadores mantem os titulos bloqueados na mesma transacao da operacao.
// Nao altera saldo, status financeiro, setor ou autorizacao nominal/passkey.
async function marcarAnaliseProprietario({ titulos, usuarioId, transaction, origem = 'PAPEL', loteId = null }) {
  for (const titulo of titulos) {
    if (titulo.tipo !== 'PAGAR' || !['ABERTO', 'PARCIAL'].includes(titulo.status) || !Number.isFinite(Number(titulo.valor_saldo)) || Number(titulo.valor_saldo) <= 0) {
      throw Object.assign(new Error(`O titulo ${titulo.codigo || titulo.id} nao possui saldo em aberto para analise.`), { statusCode: 409 });
    }
  }
  const emFila = await PagamentoManualFilaItem.findAll({
    where: { titulo_financeiro_id: { [Op.in]: titulos.map((titulo) => titulo.id) }, status: { [Op.in]: ['PENDENTE', 'NAO_PAGO', 'DIVERGENTE'] } },
    attributes: ['id'], transaction
  });
  if (emFila.length) throw Object.assign(new Error('Um ou mais titulos ja estao na fila de pagamentos.'), { statusCode: 409 });
  const alterados = titulos.filter((titulo) => !emAnaliseProprietario(titulo.status_interno_pagar));
  if (alterados.length) await TituloFinanceiro.update({ status_interno_pagar: STATUS_ANALISE_PROPRIETARIO }, {
    where: { id: { [Op.in]: alterados.map((titulo) => titulo.id) } }, transaction
  });
  const metadata = { origem, lote_id: loteId, titulo_ids: titulos.map((titulo) => Number(titulo.id)) };
  let mudouSolicitacao = false;
  const solicitacaoIds = [...new Set(titulos.map((titulo) => Number(titulo.solicitacao_id)).filter(Boolean))].sort((a, b) => a - b);
  for (const id of solicitacaoIds) {
    const solicitacao = await Solicitacao.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!solicitacao || ['PAGA', 'CANCELADA', 'CANCELADO', 'EXCLUIDA', 'EXCLUIDO', 'ARQUIVADA', 'ARQUIVADO'].includes(normalizar(solicitacao.status_global))) continue;
    const anterior = solicitacao.status_global;
    const mudouStatus = !emAnaliseProprietario(anterior);
    if (!mudouStatus && !alterados.some((titulo) => Number(titulo.solicitacao_id) === id)) continue;
    if (mudouStatus) {
      mudouSolicitacao = true;
      await solicitacao.update({ status_global: STATUS_ANALISE_PROPRIETARIO }, { transaction });
      await StatusArea.create({ solicitacao_id: id, setor: solicitacao.area_responsavel, status: STATUS_ANALISE_PROPRIETARIO,
        observacao: 'Titulo encaminhado para analise do proprietario; pagamento ainda nao autorizado.' }, { transaction });
    }
    await Historico.create({ solicitacao_id: id, usuario_responsavel_id: usuarioId || null, setor: solicitacao.area_responsavel,
      acao: 'STATUS_ALTERADO', status_anterior: anterior, status_novo: STATUS_ANALISE_PROPRIETARIO,
      observacao: `Titulo(s) em analise do proprietario (${origem === 'DIGITAL' ? 'dossie digital' : 'analise em papel'}). Esta marcacao nao autoriza nem quita o pagamento.`,
      metadata: JSON.stringify({ ...metadata, titulo_ids: titulos.filter((titulo) => Number(titulo.solicitacao_id) === id).map((titulo) => Number(titulo.id)) })
    }, { transaction });
  }
  // Auditoria obrigatoria/atomica, inclusive para titulos sem solicitacao.
  if (alterados.length || mudouSolicitacao) await SecurityEventLog.create({ usuario_id: usuarioId || null, tipo_evento: 'PAYMENT_OWNER_ANALYSIS_MARKED', recurso_tipo: 'TITULO_FINANCEIRO',
    recurso_id: loteId ? String(loteId) : null, status: 'SUCCESS', descricao: 'Titulos encaminhados para analise do proprietario', metadata }, { transaction });
}

async function atualizarAnaliseAoEnfileirar(titulos, transaction) {
  const ids = titulos.filter((titulo) => emAnaliseProprietario(titulo.status_interno_pagar)).map((titulo) => titulo.id);
  if (ids.length) await TituloFinanceiro.update({ status_interno_pagar: STATUS_ENVIADO_PAGAMENTO }, { where: { id: { [Op.in]: ids } }, transaction });
}

async function registrarAnaliseRecusada({ tituloId, usuarioId, motivo, resultado, transaction }) {
  const titulo = await TituloFinanceiro.findByPk(tituloId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!titulo || !emAnaliseProprietario(titulo.status_interno_pagar)) return;
  if (!['ABERTO', 'PARCIAL'].includes(titulo.status) || Number(titulo.valor_saldo) <= 0) {
    await titulo.update({ status_interno_pagar: null }, { transaction });
    return;
  }
  await titulo.update({ status_interno_pagar: STATUS_AJUSTE_PAGAMENTO }, { transaction });
  if (!titulo.solicitacao_id) return;
  const solicitacao = await Solicitacao.findByPk(titulo.solicitacao_id, { transaction, lock: transaction.LOCK.UPDATE });
  if (!solicitacao || !emAnaliseProprietario(solicitacao.status_global)) return;
  const anterior = solicitacao.status_global;
  await solicitacao.update({ status_global: 'AGUARDANDO AJUSTE' }, { transaction });
  const observacao = `Analise digital de pagamento ${resultado === 'INVALIDADO' ? 'invalidada' : 'rejeitada'}: ${motivo}`;
  await Historico.create({ solicitacao_id: solicitacao.id, usuario_responsavel_id: usuarioId, setor: solicitacao.area_responsavel,
    acao: 'STATUS_ALTERADO', status_anterior: anterior, status_novo: 'AGUARDANDO AJUSTE', observacao,
    metadata: JSON.stringify({ origem: 'AUTORIZACAO_DIGITAL', titulo_id: Number(tituloId), resultado }) }, { transaction });
  await StatusArea.create({ solicitacao_id: solicitacao.id, setor: solicitacao.area_responsavel,
    status: 'AGUARDANDO AJUSTE', observacao }, { transaction });
}

module.exports = { STATUS_ANALISE_PROPRIETARIO, STATUS_ENVIADO_PAGAMENTO, incluirStatusOperacionais, emAnaliseProprietario, marcarAnaliseProprietario, atualizarAnaliseAoEnfileirar, registrarAnaliseRecusada };
