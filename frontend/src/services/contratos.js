import { API_URL, authHeaders } from './api';

export async function getContratos({ obra_id, ref } = {}) {
  const search = new URLSearchParams();
  if (obra_id) search.set('obra_id', obra_id);
  if (ref) search.set('ref', ref);
  const params = search.toString() ? `?${search.toString()}` : '';
  const res = await fetch(`${API_URL}/contratos${params}`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar contratos');
  return res.json();
}

export async function getContratosResumo() {
  const res = await fetch(`${API_URL}/contratos/resumo`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar resumo de contratos');
  return res.json();
}

export async function criarContrato(data) {
  const res = await fetch(`${API_URL}/contratos`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Erro ao criar contrato');
  return res.json();
}

export async function atualizarContrato(id, data) {
  const res = await fetch(`${API_URL}/contratos/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Erro ao atualizar contrato');
  return res.json();
}

export async function uploadContratoAnexos(id, files) {
  const formData = new FormData();
  files.forEach(file => formData.append('files', file));

  const res = await fetch(`${API_URL}/contratos/${id}/anexos`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData
  });
  if (!res.ok) throw new Error('Erro ao enviar anexos do contrato');
  return res.json();
}

export async function getContratoAnexos(id) {
  const res = await fetch(`${API_URL}/contratos/${id}/anexos`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar anexos do contrato');
  return res.json();
}
