// Apenas assinatura de concorrencia; nao e um snapshot de titulos autorizado.
export default function titulosWorkspaceRevision(titulos) {
  return JSON.stringify([...titulos].sort((a, b) => Number(a.id) - Number(b.id)).map(t => [
    t.id, t.tipo, t.status, t.valor_saldo, t.valor_baixado, t.juros, t.multa,
    t.empresa_id, t.parceiro_id, t.updatedAt, t.updated_at, t.fila_pagamento?.status
  ]));
}
