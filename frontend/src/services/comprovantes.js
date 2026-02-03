import { API_URL, authHeaders } from './api';

export async function uploadComprovantes(files) {
  const formData = new FormData();

  for (const file of files) {
    formData.append('files', file);
  }

  const res = await fetch(`${API_URL}/comprovantes/upload-massa`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'Erro no upload');
  }

  return data;
}

export async function getComprovantesPendentes() {
  const res = await fetch(`${API_URL}/comprovantes/pendentes`, {
    headers: authHeaders()
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Erro ao buscar pendentes');
  }
  return res.json();
}

export async function buscarSolicitacoesParaComprovante(q = '') {
  const query = q ? `?q=${encodeURIComponent(q)}` : '';
  const res = await fetch(`${API_URL}/comprovantes/solicitacoes${query}`, {
    headers: authHeaders()
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Erro ao buscar solicitacoes');
  }
  return res.json();
}

export async function vincularComprovante(id, solicitacao_id) {
  const res = await fetch(`${API_URL}/comprovantes/${id}/vincular`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ solicitacao_id })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Erro ao vincular comprovante');
  }
  return res.json();
}
