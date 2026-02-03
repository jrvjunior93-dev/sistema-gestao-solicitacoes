import { API_URL, authHeaders } from './api';

export async function getTemaSistema() {
  const res = await fetch(`${API_URL}/configuracoes/tema`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar tema do sistema');
  return res.json();
}

export async function salvarTemaSistema(data) {
  const res = await fetch(`${API_URL}/configuracoes/tema`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Erro ao salvar tema do sistema');
  return res.json();
}
