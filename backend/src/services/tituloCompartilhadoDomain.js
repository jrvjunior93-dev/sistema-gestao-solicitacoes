'use strict';
const { centavos, dinheiro, ratear, validarData } = require('./tituloRenegociacaoDomain');
const falhar = mensagem => { throw Object.assign(new Error(mensagem), { statusCode: 400 }); };
const id = (v, nome) => {
  if (!Number.isSafeInteger(v) || v < 1) falhar(`${nome} inválido.`);
  return v;
};
const apenas = (o, campos) => {
  if (!o || typeof o !== 'object' || Array.isArray(o) || Object.keys(o).some(c => !campos.includes(c))) falhar('Campos não permitidos no lote compartilhado.');
};
function validar(body) {
  apenas(body, ['origens', 'parcelas', 'parceiro_id', 'categoria_financeira_id', 'forma_pagamento_id',
    'favorecido_pagamento_id', 'descricao', 'observacoes', 'chave_pix', 'preview_hash']);
  if (!Array.isArray(body.origens) || body.origens.length < 2 || body.origens.length > 100) falhar('Selecione entre 2 e 100 origens.');
  const chaves = new Set();
  const origens = body.origens.map(o => {
    apenas(o, ['solicitacao_id', 'pedido_compra_id', 'valor']);
    const solicitacao_id = id(o.solicitacao_id, 'Solicitação');
    const pedido_compra_id = o.pedido_compra_id == null ? null : id(o.pedido_compra_id, 'Pedido');
    const chave = `${solicitacao_id}:${pedido_compra_id || 0}`;
    if (chaves.has(chave)) falhar('A mesma origem não pode aparecer duas vezes.');
    chaves.add(chave);
    const valor = centavos(o.valor, 'Participação da origem');
    if (!valor) falhar('Todas as origens precisam de participação positiva.');
    return { solicitacao_id, pedido_compra_id, valor: dinheiro(valor) };
  }).sort((a, b) => a.solicitacao_id - b.solicitacao_id || (a.pedido_compra_id || 0) - (b.pedido_compra_id || 0));
  if (origens.some(o => !o.pedido_compra_id && origens.some(p => p.solicitacao_id === o.solicitacao_id && p.pedido_compra_id))) falhar('Selecione a solicitação ou seus pedidos, sem sobrepor as origens.');
  const total = origens.reduce((s, o) => s + centavos(o.valor), 0);
  dinheiro(total);
  if (!Array.isArray(body.parcelas) || !body.parcelas.length || body.parcelas.length > 120) falhar('Informe entre 1 e 120 parcelas.');
  const parcelas = body.parcelas.map(p => {
    apenas(p, ['valor', 'data_vencimento']);
    const valor = centavos(p.valor, 'Parcela');
    if (!valor) falhar('Cada parcela precisa ter valor positivo.');
    return { valor: dinheiro(valor), data_vencimento: validarData(p.data_vencimento) };
  });
  if (parcelas.reduce((s, p) => s + centavos(p.valor), 0) !== total) falhar('A soma das parcelas precisa ser igual à soma das participações.');
  if (parcelas.some((p, i) => i && p.data_vencimento < parcelas[i - 1].data_vencimento)) falhar('Informe os vencimentos em ordem crescente.');
  const descricao = String(body.descricao || '').trim();
  if (!descricao || descricao.length > 200) falhar('Informe uma descrição de até 200 caracteres.');
  const observacoes = String(body.observacoes || '').trim();
  if (observacoes.length > 2000) falhar('As instruções devem ter até 2.000 caracteres.');
  const chave_pix = String(body.chave_pix || '').trim();
  if (chave_pix.length > require('../utils/pix').PIX_TEXTO_MAX) falhar('A chave ou o código PIX excede o tamanho permitido.');
  return { origens, parcelas, valor: dinheiro(total), descricao, observacoes, chave_pix,
    parceiro_id: id(body.parceiro_id, 'Credor'), categoria_financeira_id: id(body.categoria_financeira_id, 'Categoria'),
    forma_pagamento_id: id(body.forma_pagamento_id, 'Forma de pagamento'),
    favorecido_pagamento_id: id(body.favorecido_pagamento_id, 'Favorecido') };
}
// Matriz em centavos: soma por coluna = participação; soma por linha = parcela.
// A última parcela absorve resíduos sem inflar nenhuma origem.
function alocar(origens, parcelas) {
  const restantes = origens.map(o => centavos(o.valor));
  return parcelas.map(p => {
    const valores = ratear(centavos(p.valor), restantes);
    valores.forEach((v, i) => { restantes[i] -= v; });
    return valores.map(dinheiro);
  });
}
module.exports = { validar, alocar };
