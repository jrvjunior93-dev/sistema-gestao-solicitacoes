'use strict';
const STATUS_REVISAO_DP = 'EM EDICAO DP';
const emRevisaoDp = titulo => titulo?.origem_titulo === 'RH_DP'
  && String(titulo.status_interno_pagar || '').toUpperCase() === STATUS_REVISAO_DP;
function assertSemRevisaoDp(titulo) {
  if (!emRevisaoDp(titulo)) return;
  const error = new Error('Pagamento bloqueado: em edição pelo DP. Aguarde a conferência e o reenvio pela solicitação.');
  error.statusCode = 409;
  error.code = 'TITULO_EM_REVISAO_DP';
  throw error;
}
module.exports = { STATUS_REVISAO_DP, emRevisaoDp, assertSemRevisaoDp };
