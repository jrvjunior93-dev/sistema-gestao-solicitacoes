import { API_URL, authHeaders } from './api';

// Tela inicial escolhida pelo usuário — salva NO BANCO e validada no
// BACKEND contra a fonte única de navegação (permissão conferida no
// servidor). O valor validado também chega no payload de login/me em
// `user.tela_inicial` ({ id, to, label } ou null = Home).

async function parseResponse(response, defaultError) {
  if (response.ok) return response.json();
  let message = defaultError;
  try {
    const data = await response.json();
    message = data?.error || message;
  } catch {
    // sem body json
  }
  throw new Error(message);
}

// { tela_inicial: {id,to,label}|null, telas: [{id,label,to,moduleId,moduleLabel}] }
export async function getTelaInicial() {
  const response = await fetch(`${API_URL}/me/tela-inicial`, {
    headers: authHeaders()
  });
  return parseResponse(response, 'Erro ao carregar tela inicial');
}

export async function definirTelaInicial(id) {
  const response = await fetch(`${API_URL}/me/tela-inicial`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ id })
  });
  return parseResponse(response, 'Erro ao definir tela inicial');
}

export async function limparTelaInicial() {
  const response = await fetch(`${API_URL}/me/tela-inicial`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  return parseResponse(response, 'Erro ao limpar tela inicial');
}
