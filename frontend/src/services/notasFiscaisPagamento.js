import {API_URL,authHeaders} from './api';
import {mensagemDeErro} from './erroDeResposta';
async function read(path,query,signal){
  const response=await fetch(API_URL+path+'?'+new URLSearchParams(query),{headers:authHeaders(),cache:'no-store',signal});
  const text=await response.text();
  if(!response.ok)throw Error(mensagemDeErro(text,'Não foi possível consultar a NF-e deste pagamento.',response.status));
  return text?JSON.parse(text):null;
}
export const contextoFiscalAutorizacao=item=>item.origem_painel==='FILA_DIRETA'?{fila_id:item.fila_id}:{item_id:item.id};
export const consultarNotasAutorizacao=(contexto,{signal}={})=>read('/financeiro/autorizacoes-pagamento/notas-fiscais',contexto,signal);
export const abrirNotaAutorizacao=(contexto,arquivo)=>read('/financeiro/autorizacoes-pagamento/notas-fiscais',{
  ...contexto,documento_id:arquivo.documento_id,tipo:arquivo.tipo
});
export const abrirNotaSolicitacaoFila=(solicitacaoId,arquivo)=>read('/financeiro/fila-pagamentos/solicitacoes/'+encodeURIComponent(solicitacaoId)+'/notas-fiscais',{
  documento_id:arquivo.fiscal_document_id,tipo:arquivo.arquivo_tipo
});
export function ehNotaFiscalFila(arquivo){
  return !arquivo?.deleted_at&&Number.isSafeInteger(Number(arquivo?.fiscal_document_id))&&Number(arquivo.fiscal_document_id)>0&&
    ((arquivo.tipo==='NFE_XML'&&arquivo.arquivo_tipo==='xml')||(arquivo.tipo==='NFE_DANFE'&&arquivo.arquivo_tipo==='pdf'));
}
