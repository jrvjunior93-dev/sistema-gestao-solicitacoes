'use strict';
const { createHash } = require('node:crypto');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

// O controller deve manter o lock UPDATE da compra durante leitura, criacao e log.
function identidadeEnvio(compraId, usuarioId, payload) {
  const { chave_envio, ...dados } = payload;
  const fingerprint = hash(dados);
  return { fingerprint, descricao: 'Envio independente ' + hash([compraId, usuarioId, chave_envio || fingerprint]) };
}
function lerReplay(log, fingerprint) {
  if (!log) return null;
  const dados = typeof log.metadados === 'string' ? JSON.parse(log.metadados) : log.metadados;
  if (dados?.fingerprint !== fingerprint || !Array.isArray(dados?.fornecedores)) {
    throw Object.assign(new Error('Este envio ja foi utilizado com outros dados. Atualize a tela.'), { statusCode: 409 });
  }
  return dados.fornecedores;
}
function mapaDonosRespostas(solicitacao) {
  const mapa = new Map();
  for (const cotacao of solicitacao?.fornecedores || []) for (const r of cotacao.respostas || []) mapa.set(Number(r.id), Number(cotacao.id));
  for (const a of solicitacao?.alocacoes || []) {
    if (!(Number(a.resposta_item_id) > 0) || mapa.has(Number(a.resposta_item_id))) continue;
    const candidatas = (solicitacao?.fornecedores || []).filter(c => Number(c.fornecedor_compra_id) === Number(a.fornecedor_compra_id));
    if (candidatas.length === 1) mapa.set(Number(a.resposta_item_id), Number(candidatas[0].id));
  }
  return mapa;
}
function donoAlocacao(solicitacao, donos, a) {
  if (Number(a.resposta_item_id) > 0 && donos.has(Number(a.resposta_item_id))) return donos.get(Number(a.resposta_item_id));
  const candidatas = (solicitacao?.fornecedores || []).filter(c => Number(c.fornecedor_compra_id) === Number(a.fornecedor_compra_id));
  return candidatas.length === 1 ? Number(candidatas[0].id) : null;
}
function alocacoesDaCotacao(solicitacao, cotacao) {
  const donos = mapaDonosRespostas(solicitacao);
  return (solicitacao?.alocacoes || []).filter(a => donoAlocacao(solicitacao, donos, a) === Number(cotacao.id));
}
function cotacaoDoPedido(solicitacao, pedido) {
  const candidatas = (solicitacao?.fornecedores || []).filter(c => Number(c.fornecedor_compra_id) === Number(pedido.fornecedor_compra_id));
  if (candidatas.length === 1) return candidatas[0];
  const respostas = new Set((pedido.itens || []).map(i => Number(i.resposta_item_id)));
  const origens = candidatas.filter(c => (c.respostas || []).some(r => respostas.has(Number(r.id))));
  return origens.length === 1 ? origens[0] : null;
}
module.exports = { donoAlocacao, cotacaoDoPedido, identidadeEnvio, lerReplay, mapaDonosRespostas, alocacoesDaCotacao };
