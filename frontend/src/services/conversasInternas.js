import { API_URL, authHeaders } from './api';

async function parseResponse(response, defaultError) {
  if (response.ok) {
    if (response.status === 204) return null;
    return response.json();
  }

  let message = defaultError;
  try {
    const data = await response.json();
    message = data?.error || message;
  } catch {
    // sem body json
  }
  throw new Error(message);
}

export async function getDestinatariosConversa(setorId) {
  const query = setorId ? `?setor_id=${Number(setorId)}` : '';
  const response = await fetch(`${API_URL}/conversas-internas/destinatarios${query}`, {
    headers: authHeaders()
  });
  return parseResponse(response, 'Erro ao buscar destinatarios');
}

export async function getCaixaEntrada() {
  const response = await fetch(`${API_URL}/conversas-internas/entrada`, {
    headers: authHeaders()
  });
  return parseResponse(response, 'Erro ao buscar caixa de entrada');
}

export async function getCaixaSaida() {
  const response = await fetch(`${API_URL}/conversas-internas/saida`, {
    headers: authHeaders()
  });
  return parseResponse(response, 'Erro ao buscar caixa de saida');
}

export async function criarConversa(payload) {
  const formData = new FormData();
  formData.append('destinatario_id', String(payload?.destinatario_id || ''));
  formData.append('assunto', String(payload?.assunto || ''));
  formData.append('mensagem', String(payload?.mensagem || ''));
  const files = Array.isArray(payload?.files) ? payload.files : [];
  for (const file of files) {
    formData.append('files', file);
  }

  const response = await fetch(`${API_URL}/conversas-internas`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData
  });
  return parseResponse(response, 'Erro ao criar conversa');
}

export async function getConversa(id) {
  const response = await fetch(`${API_URL}/conversas-internas/${id}`, {
    headers: authHeaders()
  });
  return parseResponse(response, 'Erro ao carregar conversa');
}

export async function enviarMensagemConversa(id, mensagem, files = []) {
  const formData = new FormData();
  formData.append('mensagem', String(mensagem || ''));
  for (const file of files) {
    formData.append('files', file);
  }

  const response = await fetch(`${API_URL}/conversas-internas/${id}/mensagens`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData
  });
  return parseResponse(response, 'Erro ao enviar mensagem');
}

export async function editarMensagemConversa(mensagemId, mensagem) {
  const response = await fetch(`${API_URL}/conversas-internas/mensagens/${mensagemId}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ mensagem })
  });
  return parseResponse(response, 'Erro ao editar mensagem');
}

export async function concluirConversa(id) {
  const response = await fetch(`${API_URL}/conversas-internas/${id}/concluir`, {
    method: 'PATCH',
    headers: authHeaders()
  });
  return parseResponse(response, 'Erro ao concluir conversa');
}

export async function reabrirConversa(id) {
  const response = await fetch(`${API_URL}/conversas-internas/${id}/reabrir`, {
    method: 'PATCH',
    headers: authHeaders()
  });
  return parseResponse(response, 'Erro ao reabrir conversa');
}
