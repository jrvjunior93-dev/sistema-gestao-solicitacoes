'use strict';
const imutaveis = ['compartilhamento_id', 'obra_id', 'empresa_id', 'solicitacao_id', 'apropriacao_id', 'parceiro_id',
  'categoria_financeira_id', 'considera_dre', 'possui_rateio', 'valor_original', 'valor_bruto', 'valor_liquido', 'valor_impostos',
  'tipo', 'origem_titulo', 'renegociacao_id', 'renegociado_por_id', 'deleted_at'];
function validar(titulo, alteracoes, options = {}) {
  if (!titulo.compartilhamento_id || options.criandoCompartilhamento) return;
  if (options.cancelandoCompartilhamento && options.transaction && alteracoes.status === 'CANCELADO'
    && Number(alteracoes.valor_saldo) === 0 && Object.keys(alteracoes).every(c => ['status', 'valor_saldo', 'atualizado_por', 'updatedAt'].includes(c))) return;
  if (Object.keys(alteracoes).some(c => imutaveis.includes(c) && String(titulo[c] ?? '') !== String(alteracoes[c] ?? ''))
    || ['CANCELADO', 'ESTORNADO', 'PREVISAO', 'RENEGOCIADO'].includes(alteracoes.status)) {
    throw Object.assign(new Error('Título compartilhado: não é permitido alterar participações ou cancelar a dívida por uma origem isolada. Preserve o lote e o financeiro das demais origens.'), { statusCode: 409 });
  }
  if (['status', 'valor_baixado', 'valor_saldo'].some(c => c in alteracoes) && !options.transaction) throw Object.assign(new Error('A movimentação do título compartilhado exige transação financeira.'), { statusCode: 409 });
}
module.exports = { validar };
