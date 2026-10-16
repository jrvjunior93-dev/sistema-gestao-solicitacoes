'use strict';

// Resumo operacional do titulo REAL. Nao derivar status/saldo da parcela:
// renegociacao, baixa e fila precisam continuar impedindo um novo envio.
function resumoTituloEnvioMedicao(titulo, itensFila = []) {
  if (!titulo?.id) return null;
  return {
    id: titulo.id,
    tipo: titulo.tipo,
    status: titulo.renegociado_por_id ? 'RENEGOCIADO' : titulo.status,
    status_interno_pagar: titulo.status_interno_pagar || null,
    valor_saldo: Number(titulo.valor_saldo || 0),
    valor_original: Number(titulo.valor_original || 0),
    medicao_pagamento_origem_id: titulo.medicao_pagamento_origem_id || null,
    filaPagamentosManuais: itensFila.map(item => ({ id: item.id, status: item.status }))
  };
}

module.exports = { resumoTituloEnvioMedicao };
