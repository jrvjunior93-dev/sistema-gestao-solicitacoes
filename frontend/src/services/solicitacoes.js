const API_URL = 'http://localhost:3001';

export async function getSolicitacoes(params = '') {
  const res = await fetch(`${API_URL}/solicitacoes${params}`);

  if (!res.ok) {
    throw new Error('Erro ao buscar solicitações');
  }

  return res.json();
}

export async function createSolicitacao(data) {
  const res = await fetch(`${API_URL}/solicitacoes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  if (!res.ok) {
    throw new Error('Erro ao criar solicitação');
  }

  return res.json();
}

export async function getSolicitacaoById(id) {
  const res = await fetch(`${API_URL}/solicitacoes/${id}`);

  if (!res.ok) {
    throw new Error('Erro ao buscar solicitação');
  }

  return res.json();
}

export async function updateStatusSolicitacao(id, status) {
  const res = await fetch(`${API_URL}/solicitacoes/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }

  return true;
}
