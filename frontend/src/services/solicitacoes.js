import { API_URL, authHeaders } from './api';

export async function getSolicitacoes(params = '') {
  const res = await fetch(`${API_URL}/solicitacoes${params}`, {
    headers: authHeaders()
  });

  if (!res.ok) {
    throw new Error('Erro ao buscar solicitações');
  }

  return res.json();
}

export async function createSolicitacao(data) {
  const res = await fetch(`${API_URL}/solicitacoes`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  if (!res.ok) {
    throw new Error('Erro ao criar solicitação');
  }

  return res.json();
}

export async function getSolicitacaoById(id) {
  const res = await fetch(`${API_URL}/solicitacoes/${id}`, {
    headers: authHeaders()
  });

  if (!res.ok) {
    throw new Error('Erro ao buscar solicitação');
  }

  return res.json();
}

export async function updateStatusSolicitacao(id, status) {
  const res = await fetch(`${API_URL}/solicitacoes/${id}/status`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ status })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }

  return true;
}

export async function updateValorSolicitacao(id, valor) {
  const res = await fetch(`${API_URL}/solicitacoes/${id}/valor`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ valor })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }

  return true;
}


