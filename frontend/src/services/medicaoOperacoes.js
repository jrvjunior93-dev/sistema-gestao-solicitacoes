import { API_URL, authHeaders } from './api';
async function request(path, method = 'GET', body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${API_URL}${path}`, { method, headers: authHeaders(body ? { 'Content-Type': 'application/json' } : {}), cache: 'no-store',
      signal: controller.signal, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) throw new Error(data?.error || 'Não foi possível concluir. Atualize e confira antes de tentar novamente.');
    return data;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('A consulta demorou. Atualize e confira o histórico antes de repetir a operação.');
    throw e;
  } finally { clearTimeout(timer); }
}
const path = (tipo, id) => tipo === 'medicao' ? `/contratos/medicoes/${id}` : `/financeiro/titulos/${id}`;
export const consultarFavorecido = (tipo, id) => request(`${path(tipo, id)}/favorecido`);
export const alterarFavorecido = (tipo, id, body) => request(`${path(tipo, id)}/favorecido`, 'PATCH', body);
export const consultarRejeicaoMedicao = id => request(`/contratos/medicoes/${id}/rejeicao`);
export const rejeitarMedicao = (id, body) => request(`/contratos/medicoes/${id}/rejeitar`, 'POST', body);
