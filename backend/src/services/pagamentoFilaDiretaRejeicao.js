'use strict';
const { Op } = require('sequelize');
const { versaoFilaDireta } = require('./pagamentoFilaDiretaDomain');
const erro = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode });
function normalizar(decisoes) {
  if (!Array.isArray(decisoes) || !decisoes.length || decisoes.length > 50) throw erro('Selecione entre 1 e 50 titulos diretos.', 400);
  const rows = decisoes.map(d => {
    if (!d || Object.keys(d).some(k => !['fila_id','titulo_id','versao','motivo'].includes(k))) throw erro('Dados de rejeicao direta invalidos.', 400);
    const row = { fila_id: Number(d.fila_id), titulo_id: Number(d.titulo_id), versao: d.versao,
      motivo: typeof d.motivo === 'string' ? d.motivo.trim() : '' };
    if (![row.fila_id,row.titulo_id].every(v => Number.isSafeInteger(v) && v > 0) || !/^[a-f0-9]{64}$/.test(row.versao || '')
      || !row.motivo || row.motivo.length > 500) throw erro('Informe titulo, fila, versao e motivo validos.', 400);
    return row;
  }).sort((a,b) => a.titulo_id-b.titulo_id);
  if (new Set(rows.map(d => d.titulo_id)).size !== rows.length || new Set(rows.map(d => d.fila_id)).size !== rows.length) throw erro('Titulos/filas repetidos.', 400);
  return rows;
}
async function conferir(db, decisoes, transaction = null) {
  const lock = transaction ? { transaction, lock: transaction.LOCK.UPDATE } : {};
  // Mesmo ordenamento dos demais fluxos: titulo -> autorizacoes -> fila/banco.
  const titles = await db.TituloFinanceiro.findAll({ where: { id: { [Op.in]: decisoes.map(d => d.titulo_id) } }, order: [['id','ASC']], ...lock });
  if (titles.length !== decisoes.length) throw erro('Titulo indisponivel. Atualize a lista.');
  const result = [];
  for (const d of decisoes) {
    const title = titles.find(t => Number(t.id) === d.titulo_id);
    if (title.tipo !== 'PAGAR' || !['ABERTO','PARCIAL'].includes(title.status) || title.renegociado_por_id
      || Number(title.valor_saldo) <= 0 || title.bloqueio_pagamento_proprietario) throw erro('Titulo sem saldo livre para rejeicao. Atualize a lista.');
    require('./rhPagamentoRevisaoPolicy').assertSemRevisaoDp(title);
    // Sem autorizacao anterior: nao converter um item digital em decisao direta.
    const digital = await db.PagamentoAutorizacaoItem.findOne({ where: { titulo_financeiro_id: title.id }, ...lock });
    if (digital) throw erro('Titulo possui autorizacao digital. Atualize e use o ciclo atual.');
    const fila = await db.PagamentoManualFilaItem.findOne({ where: { titulo_financeiro_id: title.id }, order: [['id','DESC']], ...lock });
    if (!fila || Number(fila.id) !== d.fila_id || !['PENDENTE','NAO_PAGO','DIVERGENTE'].includes(fila.status)
      || versaoFilaDireta(title, fila) !== d.versao) throw erro('Fila ou saldo alterado. Confira novamente antes de rejeitar.');
    const banco = await db.PaymentIntent.findOne({ where: { titulo_financeiro_id: title.id,
      status: { [Op.notIn]: ['CANCELADO','REJEITADO','REJEITADO_BANCO','FALHA_INTEGRACAO','BAIXADO'] } }, ...lock });
    if (banco) throw erro('Pagamento bancario em andamento: cancele esse fluxo antes de rejeitar.');
    result.push({ title, fila, decisao: d });
  }
  return result;
}
async function aplicar(db, req, decisaoConferida, transaction) {
  const { title, fila, decisao: d } = decisaoConferida, quando = new Date();
  // item_id=0 significa ausencia de decisao anterior. Nova autorizacao real
  // tera id positivo e podera liberar o bloqueio pelo fluxo ja existente.
  const bloqueio = { origem: 'FILA_DIRETA', item_id: 0, lote_id: null, fila_id: Number(fila.id),
    usuario_id: Number(req.user.id), motivo: d.motivo, em: quando.toISOString(),
    saldo: Number(title.valor_saldo), pago: Number(title.valor_baixado || 0) };
  await title.update({ bloqueio_pagamento_proprietario: bloqueio }, { transaction });
  const ativas = await db.PagamentoManualFilaItem.findAll({ where: { titulo_financeiro_id: title.id,
    status: { [Op.in]: ['PENDENTE','NAO_PAGO','DIVERGENTE','EM_EDICAO'] } }, order: [['id','ASC']], transaction, lock: transaction.LOCK.UPDATE });
  if (ativas.some(f => f.status === 'EM_EDICAO')) throw erro('Fila em revisao pelo DP. Finalize antes de rejeitar.');
  for (const row of ativas) await row.update({ status: 'RESOLVIDO', motivo: `Saldo rejeitado pelo proprietario: ${d.motivo}`,
    resolvido_por: req.user.id, resolvido_em: quando }, { transaction });
  // Auditoria obrigatoria e atomica; nao usar logger best-effort nem fabricar lote.
  await db.SecurityEventLog.create({ usuario_id: req.user.id, tipo_evento: 'PAYMENT_OWNER_DIRECT_QUEUE_REJECTED',
    recurso_tipo: 'PAGAMENTO_MANUAL_FILA', recurso_id: String(fila.id), status: 'SUCCESS',
    descricao: 'Proprietario rejeitou saldo enviado diretamente para a fila, confirmado por passkey',
    metadata: { ...bloqueio, titulo_id: Number(title.id), fila_ids: ativas.map(f => Number(f.id)) } }, { transaction });
  return { id: -Number(fila.id), fila_id: Number(fila.id), titulo_financeiro_id: Number(title.id), origem_painel: 'FILA_DIRETA', status: 'REJEITADO' };
}
module.exports = { normalizar, conferir, aplicar };
