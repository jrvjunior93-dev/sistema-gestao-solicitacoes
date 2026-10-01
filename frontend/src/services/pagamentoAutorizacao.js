import { API_URL, authHeaders } from './api';
import { mensagemDeErro } from './erroDeResposta';

async function parse(response, fallback) {
  const text = await response.text();
  if (!response.ok) throw new Error(mensagemDeErro(text, fallback, response.status));
  return text ? JSON.parse(text) : null;
}

async function request(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${API_URL}/financeiro/autorizacoes-pagamento${path}`, {
    method,
    headers: authHeaders(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    cache: method === 'GET' ? 'no-store' : undefined,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return parse(response, 'Não foi possível concluir a operação de autorização.');
}

export const listarAutorizacoesPagamento = () => request('');
export const obterAutorizacaoPagamento = (id) => request(`/${id}`);
export const criarAutorizacaoPagamento = (tituloIds, idempotencyKey, observacao = null) => request('', { method: 'POST', body: { titulo_ids: tituloIds, idempotency_key: idempotencyKey, observacao } });
export const obterOpcoesRegistroPasskey = () => request('/passkeys/registro/opcoes', { method: 'POST', body: {} });
export const confirmarRegistroPasskey = (credential, nomeDispositivo) => request('/passkeys/registro/verificar', { method: 'POST', body: { credential, nome_dispositivo: nomeDispositivo } });
export const listarPasskeysPagamento = () => request('/passkeys');
export const revogarPasskeyPagamento = (id) => request(`/passkeys/${id}`, { method: 'DELETE' });
export const assinarNotificacoesPagamento = (subscription) => request('/push/assinar', { method: 'POST', body: { subscription } });
export const removerNotificacoesPagamento = (endpoint) => request('/push/remover', { method: 'POST', body: { endpoint } });
export const obterOpcoesDecisaoPasskey = (id, decisoes) => request(`/${id}/autenticacao/opcoes`, { method: 'POST', body: { decisoes } });
export const decidirAutorizacaoPagamento = (id, decisoes, credential) => request(`/${id}/decidir`, { method: 'POST', body: { decisoes, credential } });
export const reenviarAutorizacaoParaFila = (id) => request(`/${id}/enfileirar`, { method: 'POST', body: {} });
export const listarAutorizadoresPagamento = () => request('/autorizadores');
export const salvarAutorizadorPagamento = (payload) => request('/autorizadores', { method: 'PUT', body: payload });
export const obterDocumentoAutorizacao = (id) => request(`/documentos/${id}`);
