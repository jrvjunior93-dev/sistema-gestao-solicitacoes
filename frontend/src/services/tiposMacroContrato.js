import { API_URL, authHeaders } from './api';

export async function getTiposMacroContrato() {
  const res = await fetch(`${API_URL}/tipos-macro-contrato`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar tipos macro');
  return res.json();
}

export async function criarTipoMacroContrato(data) {
  const res = await fetch(`${API_URL}/tipos-macro-contrato`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Erro ao criar tipo macro');
  return res.json();
}

export async function atualizarTipoMacroContrato(id, data) {
  const res = await fetch(`${API_URL}/tipos-macro-contrato/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Erro ao atualizar tipo macro');
  return res.json();
}

export async function ativarTipoMacroContrato(id) {
  await fetch(`${API_URL}/tipos-macro-contrato/${id}/ativar`, {
    method: 'PATCH',
    headers: authHeaders()
  });
}

export async function desativarTipoMacroContrato(id) {
  await fetch(`${API_URL}/tipos-macro-contrato/${id}/desativar`, {
    method: 'PATCH',
    headers: authHeaders()
  });
}
