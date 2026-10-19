'use strict';
function validarReferencia(ref) {
  if (!ref || typeof ref !== 'object' || Array.isArray(ref)
    || Object.keys(ref).some(k => !['tipo', 'id'].includes(k))
    || !['NEGOCIACAO', 'LOTE_COMPARTILHADO'].includes(ref.tipo)
    || typeof ref.id !== 'number' || !Number.isSafeInteger(ref.id) || ref.id <= 0) {
    throw Object.assign(new Error('Referência de substituição inválida.'), { statusCode: 400 });
  }
  return { tipo: ref.tipo, id: ref.id };
}
async function conferirReferencia(db, titulo, ref, transaction) {
  ref = validarReferencia(ref);
  const negar = () => { throw Object.assign(new Error('O substituto não possui obrigação vigente nesta solicitação. Confira a referência.'), { statusCode: 409 }); };
  if (!titulo.solicitacao_id || titulo.tipo !== 'PAGAR') negar();
  const lote = ref.tipo === 'LOTE_COMPARTILHADO';
  const linhas = await db[lote ? 'TituloCompartilhadoOrigem' : 'TituloRenegociacaoAlocacao'].findAll({
    where: { solicitacao_id: Number(titulo.solicitacao_id), [lote ? 'lote_id' : 'negociacao_id']: ref.id }, transaction });
  const ids = [...new Set(linhas.map(a => Number(a[lote ? 'titulo_financeiro_id' : 'titulo_destino_id'])))].sort((a, b) => a - b);
  if (!ids.length || ids.includes(Number(titulo.id))) negar();
  for (const id of ids) {
    const destino = await db.TituloFinanceiro.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!destino || destino.tipo !== 'PAGAR' || !titulo.parceiro_id || Number(destino.parceiro_id) !== Number(titulo.parceiro_id)
      || ['CANCELADO', 'ESTORNADO', 'RENEGOCIADO'].includes(destino.status)
      || Number(destino[lote ? 'compartilhamento_id' : 'renegociacao_id']) !== ref.id) negar();
  }
  return ref;
}
module.exports = { validarReferencia, conferirReferencia };
