import { API_URL, authHeaders } from './api';

export async function getObras(params = {}) {
  const query = new URLSearchParams(params).toString();
  const url = query ? `${API_URL}/obras?${query}` : `${API_URL}/obras`;
  const res = await fetch(url, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar obras');
  return res.json();
}

export async function getMinhasObras(params = {}) {
  const query = new URLSearchParams(params).toString();
  const url = query ? `${API_URL}/obras/minhas?${query}` : `${API_URL}/obras/minhas`;
  const res = await fetch(url, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar obras do usu????rio');
  return res.json();
}

export async function criarObra(data) {
  const res = await fetch(`${API_URL}/obras`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(text || 'Erro ao criar obra');
  }
  return text ? JSON.parse(text) : {};
}

export async function atualizarObra(id, data) {
  const res = await fetch(`${API_URL}/obras/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(text || 'Erro ao atualizar obra');
  }
  return text ? JSON.parse(text) : {};
}

export async function ativarObra(id) {
  return fetch(`${API_URL}/obras/${id}/ativar`, {
    method: 'PATCH',
    headers: authHeaders()
  });
}

export async function desativarObra(id) {
  return fetch(`${API_URL}/obras/${id}/desativar`, {
    method: 'PATCH',
    headers: authHeaders()
  });
}
