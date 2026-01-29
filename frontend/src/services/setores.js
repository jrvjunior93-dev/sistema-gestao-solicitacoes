const API_URL = 'http://localhost:3001';

export async function getSetores() {
  const res = await fetch(`${API_URL}/setores`);
  return res.json();
}

export async function criarSetor(data) {
  const res = await fetch(`${API_URL}/setores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  return res.json();
}

export async function ativarSetor(id) {
  await fetch(`${API_URL}/setores/${id}/ativar`, {
    method: 'PATCH'
  });
}

export async function desativarSetor(id) {
  await fetch(`${API_URL}/setores/${id}/desativar`, {
    method: 'PATCH'
  });
}
