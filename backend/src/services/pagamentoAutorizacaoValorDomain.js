'use strict';
// Limite do desembolso desta autorizacao, nunca alteracao do valor do titulo.
const erro = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
function centavos(value) {
  if (!['number', 'string'].includes(typeof value) || !/^\d{1,12}(\.\d{1,2})?$/.test(String(value))) erro('Informe um valor autorizado valido, com no maximo duas casas decimais.');
  const result = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(result) || result <= 0) erro('O valor autorizado deve ser maior que zero.');
  return result;
}
function valorDecisao(item, proposto) {
  if (!item) erro('Item da autorizacao mudou. Atualize o dossie.', 409);
  const original = centavos(item.valor_snapshot);
  const valor = proposto === undefined ? original : centavos(proposto);
  if (valor > original) erro('O valor autorizado nao pode ultrapassar o valor conferido no dossie.');
  const s = item.snapshot_json || {};
  if (valor <= Math.round((Number(s.juros || 0) + Number(s.multa || 0)) * 100)) erro('O valor autorizado deve cobrir os encargos e uma parte do principal.');
  return valor / 100;
}
function auditoria(item, proposto, usuarioId) {
  const valor = valorDecisao(item, proposto);
  if (valor === Number(item.valor_snapshot)) return null; // Legado integral preservado.
  return { versao: 1, valor_original: Number(item.valor_snapshot), valor_autorizado: valor,
    limite: valor, usuario_id: Number(usuarioId), autorizado_em: new Date().toISOString(),
    observacao: 'Valor editado pelo proprietario' };
}
function limite(fila) {
  const a = fila.autorizacao_valor_json;
  if (a == null) return null;
  if (a.versao !== 1 || centavos(a.limite) > centavos(a.valor_autorizado)) erro('Limite da autorizacao indisponivel. Atualize a fila.', 409);
  return centavos(a.limite) / 100;
}
function conferirPagamento(fila, pago) {
  const maximo = limite(fila);
  if (maximo !== null && centavos(pago) > Math.round(maximo * 100)) erro('O pagamento ultrapassa o valor autorizado pelo proprietario. Solicite nova autorizacao para o saldo restante.', 409);
}
function principalPrevisto(fila, titulo) {
  const maximo = limite(fila);
  if (maximo === null) return Number(titulo.valor_saldo);
  const juros = Number(titulo.valor_baixado || 0) > 0 ? 0 : Number(fila.juros || 0);
  const multa = Number(titulo.valor_baixado || 0) > 0 ? 0 : Number(fila.multa || 0);
  return Math.max(0, Math.min(Number(titulo.valor_saldo), Math.round((maximo - juros - multa) * 100) / 100));
}
function paraRetorno(fila, estorno = false) {
  if (limite(fila) === null) return null;
  // Uma fila so registra uma baixa. Reabertura transfere APENAS o orcamento
  // nao consumido; estorno restaura o limite daquela baixa, nao o titulo inteiro.
  const usado = !estorno && fila.movimento_financeiro_id ? Number(fila.valor_informado || 0) : 0;
  const restante = Math.round((limite(fila) - usado) * 100) / 100;
  if (restante <= 0) erro('Valor autorizado consumido. O saldo do titulo exige uma nova autorizacao.', 409);
  return { ...fila.autorizacao_valor_json, limite: restante };
}
module.exports = { centavos, valorDecisao, auditoria, limite, conferirPagamento, principalPrevisto, paraRetorno };
