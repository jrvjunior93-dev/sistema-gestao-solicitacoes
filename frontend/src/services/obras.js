import { API_URL, authHeaders, fileUrl } from './api';
import { mensagemDeErro } from './erroDeResposta';

export async function getObras(params = {}) {
  const query = new URLSearchParams(params).toString();
  const url = query ? `${API_URL}/obras?${query}` : `${API_URL}/obras`;
  const res = await fetch(url, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar obras');
  return res.json();
}

function handleJsonResponse(response, fallbackMessage) {
  return response.text().then((text) => {
    if (!response.ok) {
      throw new Error(mensagemDeErro(text, fallbackMessage, response.status));
    }

    return text ? JSON.parse(text) : null;
  });
}

export async function getObrasGestao() {
  const res = await fetch(`${API_URL}/obras/gestao`, {
    headers: authHeaders()
  });
  return handleJsonResponse(res, 'Erro ao buscar resumo de gestao das obras');
}

export async function getObraGestao(id) {
  const res = await fetch(`${API_URL}/obras/${id}/gestao`, {
    headers: authHeaders()
  });
  return handleJsonResponse(res, 'Erro ao buscar detalhes da obra');
}

export async function obterUrlArquivoObra(caminhoArquivo) {
  if (!caminhoArquivo) {
    return null;
  }

  if (!String(caminhoArquivo).startsWith('http')) {
    return fileUrl(caminhoArquivo);
  }

  const response = await fetch(
    `${API_URL}/anexos/presign?url=${encodeURIComponent(caminhoArquivo)}`,
    { headers: authHeaders() }
  );

  return handleJsonResponse(response, 'Erro ao obter link do arquivo').then((data) => data?.url || caminhoArquivo);
}

export async function getMinhasObras(params = {}) {
  const query = new URLSearchParams(params).toString();
  const url = query ? `${API_URL}/obras/minhas?${query}` : `${API_URL}/obras/minhas`;
  const res = await fetch(url, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar obras do usu????rio');
  return res.json();
}

export async function criarObra(data) {
  const res = await fetch(`${API_URL}/obras`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(mensagemDeErro(text, 'Erro ao criar obra', res.status));
  }
  return text ? JSON.parse(text) : {};
}

export async function atualizarObra(id, data) {
  const res = await fetch(`${API_URL}/obras/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(mensagemDeErro(text, 'Erro ao atualizar obra', res.status));
  }
  return text ? JSON.parse(text) : {};
}

export async function ativarObra(id) {
  return fetch(`${API_URL}/obras/${id}/ativar`, {
    method: 'PATCH',
    headers: authHeaders()
  });
}

export async function desativarObra(id) {
  return fetch(`${API_URL}/obras/${id}/desativar`, {
    method: 'PATCH',
    headers: authHeaders()
  });
}
