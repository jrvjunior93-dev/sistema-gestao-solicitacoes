import { API_URL, authHeaders } from './api';
import { mensagemDeErro } from './erroDeResposta';

function handleJsonResponse(response, fallbackMessage) {
  return response.text().then((text) => {
    if (!response.ok) {
      throw new Error(mensagemDeErro(text, fallbackMessage, response.status));
    }

    return text ? JSON.parse(text) : null;
  });
}

export async function listarApropriacoes(params = {}) {
  const query = new URLSearchParams(params).toString();
  const url = query
    ? `${API_URL}/apropriacoes?${query}`
    : `${API_URL}/apropriacoes`;

  const response = await fetch(url, {
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao buscar apropriacoes');
}

export async function obterConfiguracaoMacrosApropriacao(obraId) {
  const response = await fetch(
    `${API_URL}/apropriacoes/macros-configuracao?obra_id=${encodeURIComponent(obraId)}`,
    { headers: authHeaders() }
  );
  return handleJsonResponse(response, 'Erro ao carregar etapas macro');
}

export async function salvarConfiguracaoMacrosApropriacao(obraId, apropriacaoIds) {
  const response = await fetch(`${API_URL}/apropriacoes/macros-configuracao`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ obra_id: Number(obraId), apropriacao_ids: apropriacaoIds })
  });
  return handleJsonResponse(response, 'Erro ao salvar etapas macro');
}

export async function baixarModeloApropriacoes() {
  const response = await fetch(`${API_URL}/apropriacoes/modelo-xlsx`, {
    headers: authHeaders()
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(mensagemDeErro(text, 'Erro ao baixar modelo de apropriacoes', response.status));
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get('Content-Disposition') || '';
  const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
  const filename = filenameMatch?.[1] || 'modelo-apropriacoes-obras.xlsx';
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export async function importarApropriacoesXlsx(file, obraId) {
  const formData = new FormData();
  formData.append('file', file);
  if (obraId) {
    formData.append('obra_id', obraId);
  }

  const response = await fetch(`${API_URL}/apropriacoes/importar-xlsx`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData
  });
  return handleJsonResponse(response, 'Erro ao importar apropriacoes');
}

export async function criarApropriacao(data) {
  const response = await fetch(`${API_URL}/apropriacoes`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao criar apropriacao');
}

export async function atualizarApropriacao(id, data) {
  const response = await fetch(`${API_URL}/apropriacoes/${id}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao atualizar apropriacao');
}

export async function deletarApropriacao(id) {
  const response = await fetch(`${API_URL}/apropriacoes/${id}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao deletar apropriacao');
}
