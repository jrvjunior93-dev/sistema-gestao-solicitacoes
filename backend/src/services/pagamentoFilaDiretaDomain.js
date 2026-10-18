'use strict';
const crypto = require('node:crypto');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function versaoFilaDireta(titulo, fila) {
  return hash([Number(titulo.id), titulo.status, String(titulo.valor_saldo), String(titulo.valor_baixado),
    titulo.updatedAt ? new Date(titulo.updatedAt).toISOString() : null, titulo.bloqueio_pagamento_proprietario || null,
    Number(fila.id), fila.status, String(fila.valor_previsto), fila.selecionado_por || null,
    fila.updatedAt ? new Date(fila.updatedAt).toISOString() : null]);
}
function dadosDoTitulo(t) {
  return { titulo_id: Number(t.id), codigo: t.codigo, descricao: t.descricao, data_vencimento: t.data_vencimento,
    data_emissao: t.data_emissao, valor_saldo: Number(t.valor_saldo),
    credor: (t.favorecidoPagamento || t.parceiro) ? { nome: (t.favorecidoPagamento || t.parceiro).nome } : null,
    obra: t.obra ? { id: Number(t.obra.id), nome: t.obra.nome } : null,
    empresa: t.empresa ? { id: Number(t.empresa.id), nome: t.empresa.nome } : null,
    solicitacao: t.solicitacao ? { codigo: t.solicitacao.codigo, descricao: t.solicitacao.descricao } : null,
    forma_pagamento: t.formaPagamento ? { nome: t.formaPagamento.nome } : null };
}
module.exports = { versaoFilaDireta, dadosDoTitulo };
