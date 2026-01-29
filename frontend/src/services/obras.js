const API_URL = 'http://localhost:3001/obras';

export async function getObras() {
  const res = await fetch(API_URL);
  if (!res.ok) throw new Error('Erro ao buscar obras');
  return res.json();
}

export async function criarObra(data) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  if (!res.ok) throw new Error('Erro ao criar obra');
  return res.json();
}

export async function atualizarObra(id, data) {
  const res = await fetch(`${API_URL}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  if (!res.ok) throw new Error('Erro ao atualizar obra');
  return res.json();
}

export async function ativarObra(id) {
  return fetch(`${API_URL}/${id}/ativar`, { method: 'PATCH' });
}

export async function desativarObra(id) {
  return fetch(`${API_URL}/${id}/desativar`, { method: 'PATCH' });
}
