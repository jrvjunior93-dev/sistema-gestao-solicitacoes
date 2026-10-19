'use strict';
function erro(statusCode,message) { throw Object.assign(new Error(message),{statusCode}); }
function ehPermuta(forma) {
  return /\bPERMUTA\b/.test([forma?.tipo,forma?.codigo,forma?.nome].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase());
}
function aceitaComposicao(forma){return /\b(?:PIX|TRANSFERENCIA|BOLETO|DINHEIRO)\b/.test([forma?.tipo,forma?.codigo,forma?.nome].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase());}
function planoPermuta(valorPermuta,principal,totalPago,tipo) {
  if (valorPermuta == null || valorPermuta === '') return null;
  const n = Number(valorPermuta), centavos = Math.round(n*100);
  if (!Number.isFinite(n)||n<0||!Number.isSafeInteger(centavos)) erro(400,'Valor da permuta invalido.');
  if (!centavos) return null;
  if (tipo!=='CONTA') erro(400,'Para combinar permuta, use PIX, transferencia, boleto ou dinheiro na outra parte. Cartoes e cheques preservam o fluxo proprio.');
  const p = Math.round(Number(principal)*100), total = Math.round(Number(totalPago)*100);
  if (centavos>=p||centavos>=total) erro(400,'A parte em permuta deve ser menor que o principal e o total. Para baixa integral, selecione PERMUTA.');
  return {permuta:centavos/100,principal_monetario:(p-centavos)/100,total_monetario:(total-centavos)/100};
}
async function exigirPermissaoPermuta(req,acao='usar') {
  const auth = require('./authorizationService');
  if (!(await auth.canAccessFinanceiro(req.user)) || !(await auth.userHasStrictAreaPermission(req.user,[`financeiro.permutas.${acao}`]))) {
    erro(403,`Acesso negado para ${acao==='relatorio'?'consultar o relatorio de':acao==='cadastrar'?'cadastrar':'registrar'} permutas.`);
  }
}
function validarFormaPermuta(forma){
  if(ehPermuta(forma)&&['gera_fatura','gera_boleto','exige_cartao','exige_cheque'].some(k=>forma[k]))erro(400,'Permuta nao gera fatura/boleto e nao exige cartao/cheque.');
}
async function validarBaixaPermuta(req,payload,forma,formaCadastrada){
  if(forma!=='PERMUTA'&&!String(payload.tipo_permuta||'').trim()&&!ehPermuta(formaCadastrada))return;
  await exigirPermissaoPermuta(req);
  if(!['PERMUTA','BENS'].includes(forma))erro(400,'Tipo de permuta permitido somente para baixa em PERMUTA ou BENS.');
  if(payload.conta_bancaria_id||payload.cartao_id||payload.cheque_terceiro_id)erro(400,'Permuta nao utiliza conta bancaria, cartao ou cheque.');
}
module.exports = {ehPermuta,aceitaComposicao,planoPermuta,exigirPermissaoPermuta,validarFormaPermuta,validarBaixaPermuta};
