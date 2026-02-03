import { API_URL, authHeaders } from './api';

export async function getTiposSolicitacao() {
  const res = await fetch(`${API_URL}/tipos-solicitacao`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar tipos');
  return res.json();
}

export async function criarTipoSolicitacao(data) {
  const res = await fetch(`${API_URL}/tipos-solicitacao`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  if (!res.ok) throw new Error('Erro ao criar tipo');
  return res.json();
}

export async function atualizarTipoSolicitacao(id, data) {
  const res = await fetch(`${API_URL}/tipos-solicitacao/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  if (!res.ok) throw new Error('Erro ao atualizar tipo');
  return res.json();
}

export async function ativarTipoSolicitacao(id) {
  await fetch(`${API_URL}/tipos-solicitacao/${id}/ativar`, {
    method: 'PATCH',
    headers: authHeaders()
  });
}

export async function desativarTipoSolicitacao(id) {
  await fetch(`${API_URL}/tipos-solicitacao/${id}/desativar`, {
    method: 'PATCH',
    headers: authHeaders()
  });
}
