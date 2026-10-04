export function destinoSolicitacaoContratoCriado(resposta) {
  const id = Number(resposta?.solicitacao?.id ?? resposta?.contrato?.solicitacao_id);
  return Number.isSafeInteger(id) && id > 0 ? `/solicitacoes/${id}` : null;
}
