import { API_URL, authHeaders } from './api';

export async function getNotificacoes({ nao_lidas = false, limit = 50 } = {}) {
  const params = new URLSearchParams();
  if (nao_lidas) params.set('nao_lidas', '1');
  if (limit) params.set('limit', String(limit));

  const res = await fetch(`${API_URL}/notificacoes?${params.toString()}`, {
    headers: authHeaders()
  });

  if (!res.ok) {
    throw new Error('Erro ao buscar notificacoes');
  }

  return res.json();
}

export async function marcarNotificacaoLida(destinatarioId) {
  await fetch(`${API_URL}/notificacoes/${destinatarioId}/lida`, {
    method: 'PATCH',
    headers: authHeaders()
  });
}

export async function marcarTodasNotificacoesLidas() {
  await fetch(`${API_URL}/notificacoes/lidas`, {
    method: 'PATCH',
    headers: authHeaders()
  });
}
