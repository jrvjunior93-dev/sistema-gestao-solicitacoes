const { createHash } = require('node:crypto');
const { CartaoRecarga, CartaoRecargaPrestacao, CartaoRecargaPrestacaoRateio,
  CartaoRecargaSaldoAjuste, SolicitacaoRecargaCartao, TituloFinanceiro } = require('../models');

const centavos = valor => Math.round(Number(valor || 0) * 100);
const erro = (statusCode, message) => Object.assign(new Error(message), { statusCode });

// Nao materializa nem reescreve o passado. Pagamentos estornados deixam de ser
// credito; despesas ja declaradas continuam visiveis (inclusive saldo negativo).
async function obterSaldo(cartaoId, { transaction = null, excluirPrestacaoId = null } = {}) {
  const recargas = await SolicitacaoRecargaCartao.findAll({
    where: { cartao_recarga_id: Number(cartaoId) }, transaction,
    include: [
      { model: TituloFinanceiro, as: 'titulo', attributes: ['id', 'status', 'valor_baixado'] },
      { model: CartaoRecargaPrestacao, as: 'prestacao', required: false,
        include: [{ model: CartaoRecargaPrestacaoRateio, as: 'rateios', required: false }] }
    ]
  });
  const ajustes = await CartaoRecargaSaldoAjuste.findAll({ where: { cartao_recarga_id: Number(cartaoId) }, transaction });
  let creditos = 0, validadas = 0, pendentes = 0;
  for (const recarga of recargas) {
    const titulo = recarga.titulo;
    if (titulo && !['CANCELADO', 'ESTORNADO'].includes(titulo.status)) creditos += centavos(titulo.valor_baixado);
    const prestacao = recarga.prestacao;
    if (!prestacao || Number(prestacao.id) === Number(excluirPrestacaoId)) continue;
    const despesas = (prestacao.rateios || []).reduce((soma, r) => soma + centavos(r.valor_rateio), 0);
    if (prestacao.status === 'VALIDADA') validadas += despesas;
    // Rejeicao devolve para corrigir, nao libera novamente dinheiro ja gasto.
    else if (['ENVIADA', 'REJEITADA', 'VALIDANDO', 'ENVIANDO'].includes(prestacao.status)) pendentes += despesas;
  }
  const ajuste = ajustes.reduce((soma, item) => soma + centavos(item.valor_ajuste), 0);
  const disponivel = creditos + ajuste - validadas - pendentes;
  return {
    creditos_efetivos: creditos / 100, ajustes: ajuste / 100,
    despesas_validadas: validadas / 100, despesas_pendentes: pendentes / 100,
    saldo_validado: (creditos + ajuste - validadas) / 100,
    saldo_disponivel: disponivel / 100,
    revisao: createHash('sha256').update(`${cartaoId}:${creditos}:${ajuste}:${validadas + pendentes}`).digest('hex')
  };
}

async function bloquearCartao(cartaoId, transaction) {
  const cartao = await CartaoRecarga.findByPk(cartaoId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!cartao) throw erro(404, 'Cartao nao encontrado.');
  return cartao;
}

function conferirDespesas(saldo, total, revisao) {
  if (revisao && revisao !== saldo.revisao) throw erro(409, 'O saldo do cartao mudou. Atualize o contexto e confira os gastos novamente.');
  if (!Number.isSafeInteger(centavos(total)) || total < 0 || centavos(total) > centavos(saldo.saldo_disponivel)) {
    throw erro(400, 'Os gastos excedem o saldo disponivel do cartao. Confira as recargas, prestacoes e o extrato.');
  }
}

module.exports = { obterSaldo, bloquearCartao, conferirDespesas, centavos };
