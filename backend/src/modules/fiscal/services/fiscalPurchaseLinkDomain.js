'use strict';
const crypto = require('node:crypto');
function fail(message, statusCode = 400) { throw Object.assign(new Error(message), { statusCode }); }
function id(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) fail('Identificador fiscal invalido.');
  return n;
}
function cents(value) {
  const text = String(value ?? '').trim();
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(text)) fail('Informe o valor vinculado com ate duas casas decimais.');
  const [whole, fraction = ''] = text.split('.');
  const n = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (n <= 0 || !Number.isSafeInteger(n)) fail('O valor vinculado deve ser positivo.');
  return n;
}
function input(body = {}) {
  if(!body || typeof body!=='object' || Array.isArray(body)) fail('Conferencia fiscal invalida.');
  if (Object.keys(body).some(k => !['pedidos','motivo','revision'].includes(k))) fail('Campo de vinculo fiscal desconhecido.');
  if (!Number.isSafeInteger(body.revision) || body.revision < 0) fail('Atualize a conferencia dos vinculos antes de salvar.');
  if (!Array.isArray(body.pedidos) || !body.pedidos.length || body.pedidos.length > 30) fail('Selecione de 1 a 30 pedidos.');
  const pedidos = body.pedidos.map(p => {
    if (!p || Object.keys(p).some(k => !['pedido_id','valor','titulo_ids'].includes(k))) fail('Pedido fiscal invalido.');
    if (!Array.isArray(p.titulo_ids) || p.titulo_ids.length > 100) fail('Selecao de titulos invalida.');
    const titulo_ids = p.titulo_ids.map(id).sort((a,b) => a-b);
    if (new Set(titulo_ids).size !== titulo_ids.length) fail('Titulo repetido no mesmo pedido.');
    return { pedido_id: id(p.pedido_id), centavos: cents(p.valor), titulo_ids };
  }).sort((a,b) => a.pedido_id-b.pedido_id);
  if (new Set(pedidos.map(p => p.pedido_id)).size !== pedidos.length) fail('Pedido repetido na selecao.');
  if (pedidos.reduce((s,p)=>s+p.titulo_ids.length,0)>100) fail('Selecione no maximo 100 associacoes a titulos.');
  const motivo = typeof body.motivo === 'string' ? body.motivo.trim() : '';
  if (!motivo || motivo.length > 1000) fail('Informe uma observacao de conferencia de ate 1000 caracteres.');
  return { pedidos, motivo, revision:body.revision };
}
function key(value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '')) fail('Chave de idempotencia UUID obrigatoria.');
  return value.toLowerCase();
}
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const money = n => (n / 100).toFixed(2);
module.exports = { fail, id, cents, input, key, hash, money };
