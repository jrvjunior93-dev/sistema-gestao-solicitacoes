const API_URL = 'http://localhost:3001';

export async function getUsuarios() {
  const res = await fetch(`${API_URL}/usuarios`);
  return res.json();
}

export async function criarUsuario(data) {
  const res = await fetch(`${API_URL}/usuarios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function atualizarUsuario(id, data) {
  const res = await fetch(`${API_URL}/usuarios/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function ativarUsuario(id) {
  await fetch(`${API_URL}/usuarios/${id}/ativar`, { method: 'PATCH' });
}

export async function desativarUsuario(id) {
  await fetch(`${API_URL}/usuarios/${id}/desativar`, { method: 'PATCH' });
}
