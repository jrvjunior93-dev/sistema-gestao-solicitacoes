import { API_URL, authHeaders } from './api';

export async function getTiposSubContrato({ tipo_macro_id } = {}) {
  const params = tipo_macro_id ? `?tipo_macro_id=${tipo_macro_id}` : '';
  const res = await fetch(`${API_URL}/tipos-sub-contrato${params}`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar subtipos');
  return res.json();
}

export async function criarTipoSubContrato(data) {
  const res = await fetch(`${API_URL}/tipos-sub-contrato`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  const resposta = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(resposta?.error || 'Erro ao criar subtipo');
  return resposta;
}

export async function atualizarTipoSubContrato(id, data) {
  const res = await fetch(`${API_URL}/tipos-sub-contrato/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  const resposta = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(resposta?.error || 'Erro ao atualizar subtipo');
  return resposta;
}

export async function ativarTipoSubContrato(id) {
  const res = await fetch(`${API_URL}/tipos-sub-contrato/${id}/ativar`, {
    method: 'PATCH',
    headers: authHeaders()
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || 'Erro ao ativar subtipo');
  }
}

export async function desativarTipoSubContrato(id) {
  const res = await fetch(`${API_URL}/tipos-sub-contrato/${id}/desativar`, {
    method: 'PATCH',
    headers: authHeaders()
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || 'Erro ao desativar subtipo');
  }
}

export async function excluirTipoSubContrato(id) {
  const res = await fetch(`${API_URL}/tipos-sub-contrato/${id}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || 'Erro ao excluir subtipo');
  }
}
