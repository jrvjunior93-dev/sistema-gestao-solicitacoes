import { API_URL, authHeaders } from './api';

export async function getCargos() {
  const res = await fetch(`${API_URL}/cargos`, {
    headers: authHeaders()
  });
  return res.json();
}

export async function criarCargo(data) {
  const res = await fetch(`${API_URL}/cargos`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function atualizarCargo(id, data) {
  const res = await fetch(`${API_URL}/cargos/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function ativarCargo(id) {
  await fetch(`${API_URL}/cargos/${id}/ativar`, {
    method: 'PATCH',
    headers: authHeaders()
  });
}

export async function desativarCargo(id) {
  await fetch(`${API_URL}/cargos/${id}/desativar`, {
    method: 'PATCH',
    headers: authHeaders()
  });
}
