import { API_URL, authHeaders } from './api';

function handleJsonResponse(response, fallbackMessage) {
  return response.text().then((text) => {
    if (!response.ok) {
      throw new Error(text || fallbackMessage);
    }

    return text ? JSON.parse(text) : null;
  });
}

export async function listarUnidades() {
  const response = await fetch(`${API_URL}/compras/unidades`, {
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao buscar unidades');
}

export async function criarUnidade(data) {
  const response = await fetch(`${API_URL}/compras/unidades`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao criar unidade');
}

export async function atualizarUnidade(id, data) {
  const response = await fetch(`${API_URL}/compras/unidades/${id}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao atualizar unidade');
}

export async function deletarUnidade(id) {
  const response = await fetch(`${API_URL}/compras/unidades/${id}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao deletar unidade');
}

export async function listarCategorias() {
  const response = await fetch(`${API_URL}/compras/categorias`, {
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao buscar categorias');
}

export async function criarCategoria(data) {
  const response = await fetch(`${API_URL}/compras/categorias`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao criar categoria');
}

export async function atualizarCategoria(id, data) {
  const response = await fetch(`${API_URL}/compras/categorias/${id}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao atualizar categoria');
}

export async function deletarCategoria(id) {
  const response = await fetch(`${API_URL}/compras/categorias/${id}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao deletar categoria');
}

export async function listarInsumos(params = {}) {
  const query = new URLSearchParams(params).toString();
  const url = query
    ? `${API_URL}/compras/insumos?${query}`
    : `${API_URL}/compras/insumos`;

  const response = await fetch(url, {
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao buscar insumos');
}

export async function criarInsumo(data) {
  const response = await fetch(`${API_URL}/compras/insumos`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao criar insumo');
}

export async function atualizarInsumo(id, data) {
  const response = await fetch(`${API_URL}/compras/insumos/${id}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao atualizar insumo');
}

export async function deletarInsumo(id) {
  const response = await fetch(`${API_URL}/compras/insumos/${id}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao deletar insumo');
}

export async function listarApropriacoes(params = {}) {
  const query = new URLSearchParams(params).toString();
  const url = query
    ? `${API_URL}/compras/apropriacoes?${query}`
    : `${API_URL}/compras/apropriacoes`;

  const response = await fetch(url, {
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao buscar apropriacoes');
}

export async function criarApropriacao(data) {
  const response = await fetch(`${API_URL}/compras/apropriacoes`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao criar apropriacao');
}

export async function atualizarApropriacao(id, data) {
  const response = await fetch(`${API_URL}/compras/apropriacoes/${id}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao atualizar apropriacao');
}

export async function deletarApropriacao(id) {
  const response = await fetch(`${API_URL}/compras/apropriacoes/${id}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao deletar apropriacao');
}

export async function listarSolicitacoesCompra(params = {}) {
  const query = new URLSearchParams(params).toString();
  const url = query
    ? `${API_URL}/compras/solicitacoes?${query}`
    : `${API_URL}/compras/solicitacoes`;

  const response = await fetch(url, {
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao buscar solicitacoes de compra');
}

export async function obterSolicitacaoCompra(id) {
  const response = await fetch(`${API_URL}/compras/solicitacoes/${id}`, {
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao buscar solicitacao de compra');
}

export async function criarSolicitacaoCompra(data) {
  const response = await fetch(`${API_URL}/compras/solicitacoes`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao criar solicitacao de compra');
}

export async function baixarPdfSolicitacaoCompra(id) {
  const response = await fetch(`${API_URL}/compras/solicitacoes/${id}/pdf`, {
    headers: authHeaders()
  });

  if (!response.ok) {
    throw new Error('Erro ao gerar PDF');
  }

  return response.blob();
}
