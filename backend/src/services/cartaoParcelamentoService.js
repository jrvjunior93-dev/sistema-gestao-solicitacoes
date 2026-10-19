'use strict';
const { CartaoBaixaParcela, FaturaCartaoFinanceiro, MovimentoFinanceiro } = require('../models');
const { obterOuCriarFaturaCartao, recalcularFaturaCartao } = require('./faturaCartaoFinanceiroService');
const { dividirEmCentavos } = require('./cartaoParcelamentoDomain');
const erro = message => { throw Object.assign(new Error(message), { statusCode: 409 }); };

async function conferirFatura(fatura, transaction) {
  if (!fatura || fatura.status !== 'ABERTA' || fatura.data_pagamento || fatura.pago_por || fatura.conciliacao_bancaria_id) {
    erro('Uma fatura do parcelamento ja esta fechada, paga ou processada. Confira o cartao e a data da compra.');
  }
  const pagamento = await MovimentoFinanceiro.findOne({ where: { fatura_cartao_id: fatura.id,
    tipo_movimento: 'PAGAMENTO_FATURA', status: 'ATIVO' }, transaction, lock: transaction.LOCK.UPDATE });
  if (pagamento) erro('Uma fatura do parcelamento ja possui pagamento. Reverta o processamento antes de alterar esta compra.');
}

async function prepararParcelas({ cartao, titulo, config, total, usuarioId, transaction }) {
  if (String(titulo.tipo).toUpperCase() !== 'PAGAR' || String(cartao.tipo).toUpperCase() !== 'CREDITO') erro('Parcelamento de compra permitido somente em titulos a pagar com cartao de credito.');
  if (titulo.fatura_cartao_id) erro('O titulo ainda possui uma fatura prevista. Regularize o vinculo da fatura antes de parcelar esta baixa.');
  for (const field of ['dia_fechamento', 'dia_vencimento']) if (!Number.isInteger(Number(cartao[field])) || Number(cartao[field]) < 1 || Number(cartao[field]) > 31) erro('Configure o fechamento e o vencimento do cartao antes de parcelar a baixa.');
  if (config.calendario && ['dia_fechamento', 'dia_vencimento'].some(field => Number(cartao[field]) !== config.calendario[field])) erro('O calendario do cartao mudou desde a consulta. Atualize o pagamento e confira novamente as parcelas.');
  const valores = dividirEmCentavos(total, config.quantidade_parcelas);
  const parcelas = [];
  for (const [index, valor] of valores.entries()) {
    const { fatura, datas } = await obterOuCriarFaturaCartao({ cartaoId: cartao.id, dataCompra: config.data_compra,
      parcelaOffset: index, usuarioId, transaction, novaCompraFila: true });
    await conferirFatura(fatura, transaction);
    if (String(fatura.data_vencimento) !== datas.data_vencimento || String(fatura.data_fechamento) !== datas.data_fechamento) erro('O calendario da fatura difere do cadastro atual do cartao. Confira as faturas antes da baixa.');
    parcelas.push({ fatura, valor, numero: index + 1 });
  }
  return parcelas;
}

async function registrarParcelas({ parcelas, config, titulo, movimento, usuarioId, transaction }) {
  for (const parte of parcelas) await CartaoBaixaParcela.create({ movimento_financeiro_id: movimento.id,
    titulo_financeiro_id: titulo.id, fatura_cartao_id: parte.fatura.id, numero_parcela: parte.numero,
    quantidade_parcelas: parcelas.length, data_compra: config.data_compra, valor: parte.valor,
    status: 'ATIVA', criado_por: usuarioId }, { transaction });
  for (const id of [...new Set(parcelas.map(item => item.fatura.id))]) await recalcularFaturaCartao(id, { transaction, leituraCorrente: true });
}

async function estornarParcelas({ movimento, usuarioId, transaction }) {
  const parcelas = await CartaoBaixaParcela.findAll({ where: { movimento_financeiro_id: movimento.id, status: 'ATIVA' },
    transaction, lock: transaction.LOCK.UPDATE, order: [['fatura_cartao_id', 'ASC']] });
  if (!parcelas.length || parcelas.length !== Number(parcelas[0].quantidade_parcelas)
    || parcelas.some(p => Number(p.quantidade_parcelas) !== parcelas.length)
    || [...parcelas].sort((a,b) => a.numero_parcela - b.numero_parcela).some((p,index) => Number(p.numero_parcela) !== index + 1)
    || Math.round(parcelas.reduce((sum, p) => sum + Number(p.valor), 0) * 100) !== Math.round(Number(movimento.valor_quitacao) * 100)) erro('Parcelamento incompleto. Confira as faturas antes de estornar a baixa.');
  const ids = [...new Set(parcelas.map(item => item.fatura_cartao_id))].sort((a, b) => a - b);
  for (const id of ids) {
    const fatura = await FaturaCartaoFinanceiro.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    await conferirFatura(fatura, transaction);
  }
  // Nenhuma parcela e alterada antes de conferir TODAS as faturas.
  for (const parcela of parcelas) await parcela.update({ status: 'ESTORNADA', estornado_por: usuarioId, estornado_em: new Date() }, { transaction });
  for (const id of ids) await recalcularFaturaCartao(id, { transaction, leituraCorrente: true });
}
module.exports = { prepararParcelas, registrarParcelas, estornarParcelas };
