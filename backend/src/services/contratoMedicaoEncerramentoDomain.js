'use strict';
function estado(contrato) {
  const dado = contrato?.medicao_encerramento;
  return { finalizado: dado?.finalizado === true, revisao: Number(dado?.revisao || 0),
    atualizado_em: dado?.atualizado_em || null, atualizado_por: dado?.atualizado_por || null,
    motivo: dado?.motivo || null };
}
function assertNovaMedicao(contrato) {
  if (estado(contrato).finalizado) throw Object.assign(
    new Error('Contrato marcado como totalmente medido pelo GEO. Solicite a reversao da marcacao antes de criar outra medicao.'),
    { statusCode: 409, code: 'CONTRATO_TOTALMENTE_MEDIDO_MANUAL' });
}
module.exports = { estado, assertNovaMedicao };
