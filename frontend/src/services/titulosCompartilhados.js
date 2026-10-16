import { API_URL, authHeaders } from './api';
import { mensagemDeErro } from './erroDeResposta';
async function consultar(path, options = {}) {
  const response = await fetch(`${API_URL}/titulos-compartilhados${path}`, options);
  const text = await response.text();
  if (!response.ok) throw new Error(mensagemDeErro(text, 'Não foi possível processar o lote compartilhado.', response.status));
  return text ? JSON.parse(text) : null;
}
export const buscarOrigensCompartilhadas = params => consultar(`/origens?${new URLSearchParams(params)}`, { headers: authHeaders() });
export const conferirLoteCompartilhado = body => consultar('/preview', { method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
export const criarLoteCompartilhado = (body, chave) => consultar('', { method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json', 'Idempotency-Key': chave }), body: JSON.stringify(body) });
export const cancelarLoteCompartilhado = (id, motivo) => consultar(`/${id}/cancelar`, { method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ motivo }) });
