import { API_URL, authHeaders } from './api';

export async function getSetorPermissoes(params = {}) {
  const query = new URLSearchParams(params).toString();
  const url = query ? `${API_URL}/setor-permissoes?${query}` : `${API_URL}/setor-permissoes`;
  const res = await fetch(url, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar permissoes do setor');
  return res.json();
}

export async function salvarSetorPermissao(data) {
  const res = await fetch(`${API_URL}/setor-permissoes`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Erro ao salvar permissao do setor');
  return res.json();
}
