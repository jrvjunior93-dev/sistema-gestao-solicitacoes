import { API_URL, authHeaders } from './api';

export async function getStatusSetor({ setor } = {}) {
  const params = setor ? `?setor=${setor}` : '';
  const res = await fetch(`${API_URL}/status-setor${params}`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar status');
  return res.json();
}

export async function criarStatusSetor(data) {
  const res = await fetch(`${API_URL}/status-setor`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Erro ao criar status');
  return res.json();
}

export async function atualizarStatusSetor(id, data) {
  const res = await fetch(`${API_URL}/status-setor/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Erro ao atualizar status');
  return res.json();
}

export async function ativarStatusSetor(id) {
  await fetch(`${API_URL}/status-setor/${id}/ativar`, {
    method: 'PATCH',
    headers: authHeaders()
  });
}

export async function desativarStatusSetor(id) {
  await fetch(`${API_URL}/status-setor/${id}/desativar`, {
    method: 'PATCH',
    headers: authHeaders()
  });
}
