import { API_URL, authHeaders } from './api';

export async function getSetores() {
  const res = await fetch(`${API_URL}/setores`, {
    headers: authHeaders()
  });
  return res.json();
}

export async function criarSetor(data) {
  const res = await fetch(`${API_URL}/setores`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return res.json();
}

export async function atualizarSetor(id, data) {
  const res = await fetch(`${API_URL}/setores/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return res.json();
}

export async function ativarSetor(id) {
  await fetch(`${API_URL}/setores/${id}/ativar`, {
    method: 'PATCH',
    headers: authHeaders()
  });
}

export async function desativarSetor(id) {
  await fetch(`${API_URL}/setores/${id}/desativar`, {
    method: 'PATCH',
    headers: authHeaders()
  });
}
