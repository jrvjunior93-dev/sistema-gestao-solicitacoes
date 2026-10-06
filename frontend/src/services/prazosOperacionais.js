import { API_URL, authHeaders } from './api';
async function requisicao(path, method = 'GET', body) {
  const response = await fetch(`${API_URL}${path}`, { method, headers: authHeaders(body ? { 'Content-Type': 'application/json' } : {}),
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Não foi possível consultar os prazos.');
  return data;
}
export const getEstadoPrazos = () => requisicao('/auth/prazos-operacionais');
export const getConfigPrazos = () => requisicao('/configuracoes/prazos-operacionais');
export const salvarConfigPrazos = (regra) => requisicao('/configuracoes/prazos-operacionais', 'PATCH', regra);
export const liberarPrazos = (body) => requisicao('/configuracoes/prazos-operacionais/liberacoes', 'POST', body);
