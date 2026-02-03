import { API_URL, authHeaders } from './api';

export async function getUsuarios() {
  const res = await fetch(`${API_URL}/usuarios`, {
    headers: authHeaders()
  });
  return res.json();
}

export async function getUsuario(id) {
  const res = await fetch(`${API_URL}/usuarios/${id}`, {
    headers: authHeaders()
  });
  if (!res.ok) {
    throw new Error('Erro ao buscar usuario');
  }
  return res.json();
}

export async function criarUsuario(data) {
  const res = await fetch(`${API_URL}/usuarios`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function atualizarUsuario(id, data) {
  const res = await fetch(`${API_URL}/usuarios/${id}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function ativarUsuario(id) {
  await fetch(`${API_URL}/usuarios/${id}/ativar`, {
    method: 'PATCH',
    headers: authHeaders()
  });
}

export async function desativarUsuario(id) {
  await fetch(`${API_URL}/usuarios/${id}/desativar`, {
    method: 'PATCH',
    headers: authHeaders()
  });
}

export async function alterarSenhaAtual({ senha_atual, senha_nova }) {
  const res = await fetch(`${API_URL}/usuarios/me/senha`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ senha_atual, senha_nova })
  });

  if (!res.ok) {
    let data = null;
    try {
      data = await res.json();
    } catch {}
    throw new Error(data?.error || 'Erro ao alterar senha');
  }
}
