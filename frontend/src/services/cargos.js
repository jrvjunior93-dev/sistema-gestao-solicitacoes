const API_URL = 'http://localhost:3001';

export async function getCargos() {
  const res = await fetch(`${API_URL}/cargos`);
  return res.json();
}

export async function criarCargo(data) {
  const res = await fetch(`${API_URL}/cargos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function ativarCargo(id) {
  await fetch(`${API_URL}/cargos/${id}/ativar`, { method: 'PATCH' });
}

export async function desativarCargo(id) {
  await fetch(`${API_URL}/cargos/${id}/desativar`, { method: 'PATCH' });
}
