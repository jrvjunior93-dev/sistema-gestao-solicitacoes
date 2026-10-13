'use strict';
const erro = (mensagem, statusCode = 400) => Object.assign(new Error(mensagem), { statusCode });
const token = valor => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
const TIPOS = new Set(['DESPESA_ADMINISTRATIVA', 'DESPESA_COMERCIAL', 'DESPESA_DE_MARKETING', 'DESPESAS_DE_MARKETING', 'DESPESA_MARKETING']);
function tipoPermiteAdiantamento(tipo) { return [tipo?.codigo_interno, tipo?.nome].some(v => TIPOS.has(token(v))); }
function centavos(valor) {
  if (!['string', 'number'].includes(typeof valor) || String(valor).trim() === '' || !/^\d+(\.\d{1,2})?$/.test(String(valor))) throw erro('Valor monetario invalido.');
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 0 || numero > 9999999999.99) throw erro('Valor monetario invalido.');
  return Math.round(numero * 100);
}
function saldoAdiantamento(pago, prestado, devolvido = 0) {
  const base = centavos(pago), despesa = centavos(prestado), devolucao = centavos(devolvido);
  if (despesa + devolucao > base) throw erro('Prestacao e devolucao nao podem exceder o valor pago.');
  return (base - despesa - devolucao) / 100;
}
function normalizarPrestacao(payload) {
  if (!Array.isArray(payload?.itens) || payload.itens.length > 50) throw erro('Informe ate 50 despesas da prestacao.');
  const itens = payload.itens.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw erro('Despesa invalida.');
    const valor = centavos(item.valor);
    const descricao = String(item.descricao || '').trim();
    if (!valor || !descricao || descricao.length > 255 || !Number.isInteger(Number(item.obra_id)) || Number(item.obra_id) <= 0) throw erro('Informe descricao, destino e valor maior que zero de cada despesa.');
    const apropriacao = item.apropriacao_id ? Number(item.apropriacao_id) : null;
    if (apropriacao !== null && (!Number.isInteger(apropriacao) || apropriacao <= 0)) throw erro('Apropriacao invalida.');
    return { obra_id: Number(item.obra_id), apropriacao_id: apropriacao, valor: valor / 100, descricao };
  });
  return { itens, valor: itens.reduce((soma, item) => soma + centavos(item.valor), 0) / 100, observacoes: String(payload.observacoes || '').trim().slice(0, 5000) };
}
module.exports = { erro, token, tipoPermiteAdiantamento, centavos, saldoAdiantamento, normalizarPrestacao };
