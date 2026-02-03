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
  if (!res.ok) throw new Error('Erro ao criar subtipo');
  return res.json();
}

export async function atualizarTipoSubContrato(id, data) {
  const res = await fetch(`${API_URL}/tipos-sub-contrato/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Erro ao atualizar subtipo');
  return res.json();
}

export async function ativarTipoSubContrato(id) {
  await fetch(`${API_URL}/tipos-sub-contrato/${id}/ativar`, {
    method: 'PATCH',
    headers: authHeaders()
  });
}

export async function desativarTipoSubContrato(id) {
  await fetch(`${API_URL}/tipos-sub-contrato/${id}/desativar`, {
    method: 'PATCH',
    headers: authHeaders()
  });
}
