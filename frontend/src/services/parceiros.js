import { API_URL, authHeaders } from './api';
import { mensagemDeErro } from './erroDeResposta';

async function parseJson(response, fallbackMessage) {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(mensagemDeErro(text, fallbackMessage, response.status));
  }

  return text ? JSON.parse(text) : null;
}

function getFilenameFromDisposition(disposition, fallback) {
  const match = String(disposition || '').match(/filename="?([^"]+)"?/i);
  return match?.[1] || fallback;
}

async function downloadResponse(response, fallbackName, fallbackMessage) {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(mensagemDeErro(text, fallbackMessage, response.status));
  }

  const blob = await response.blob();
  const filename = getFilenameFromDisposition(response.headers.get('Content-Disposition'), fallbackName);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function buscarParceiros(params = {}, { signal } = {}) {
  const query = new URLSearchParams(params).toString();
  const url = query ? `${API_URL}/parceiros?${query}` : `${API_URL}/parceiros`;
  const response = await fetch(url, {
    headers: authHeaders(),
    signal
  });

  return parseJson(response, 'Erro ao buscar parceiros');
}

export async function buscarParceiroPorId(id, { signal } = {}) {
  const response = await fetch(`${API_URL}/parceiros/${id}`, {
    headers: authHeaders(),
    signal
  });

  return parseJson(response, 'Erro ao buscar os dados completos da pessoa');
}

export async function baixarModeloParceiros() {
  const response = await fetch(`${API_URL}/parceiros/modelo-xlsx`, {
    headers: authHeaders()
  });

  return downloadResponse(response, 'modelo-importacao-pessoas.xlsx', 'Erro ao baixar modelo de pessoas');
}

export async function exportarParceiros() {
  const response = await fetch(`${API_URL}/parceiros/exportar-xlsx`, {
    headers: authHeaders()
  });

  return downloadResponse(response, 'pessoas-cadastradas.xlsx', 'Erro ao exportar pessoas');
}

export async function importarParceiros(file) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_URL}/parceiros/importar-xlsx`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData
  });

  return parseJson(response, 'Erro ao importar pessoas');
}

export async function criarParceiro(data) {
  const response = await fetch(`${API_URL}/parceiros`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao criar parceiro');
}

export async function criarCredorNovaSolicitacao(data) {
  const response = await fetch(`${API_URL}/solicitacoes/credores`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao cadastrar credor');
}

export async function criarFavorecidoNovaSolicitacao(data, { idempotencyKey } = {}) {
  const response = await fetch(`${API_URL}/solicitacoes/favorecidos`, {
    method: 'POST',
    headers: authHeaders({
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
    }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao cadastrar favorecido');
}

export async function criarCredorCompraDireta(data) {
  const response = await fetch(`${API_URL}/compras/solicitacoes-diretas/credores`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao cadastrar credor da compra direta');
}

export async function atualizarParceiro(id, data) {
  const response = await fetch(`${API_URL}/parceiros/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao atualizar parceiro');
}

export async function listarCategoriasParceiro(params = {}) {
  const query = new URLSearchParams(params).toString();
  const url = query ? `${API_URL}/parceiros/categorias?${query}` : `${API_URL}/parceiros/categorias`;
  const response = await fetch(url, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar categorias de parceiro');
}

export async function criarCategoriaParceiro(data) {
  const response = await fetch(`${API_URL}/parceiros/categorias`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao criar categoria de parceiro');
}

export async function atualizarCategoriaParceiro(id, data) {
  const response = await fetch(`${API_URL}/parceiros/categorias/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao atualizar categoria de parceiro');
}

export async function desativarCategoriaParceiro(id) {
  const response = await fetch(`${API_URL}/parceiros/categorias/${id}`, {
    method: 'DELETE',
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao desativar categoria de parceiro');
}
