import { API_URL, authHeaders } from './api';

export async function getNotificacoes({ nao_lidas = false, limit = 50, page = 1, tipos = [], retornos_para_decisao = false } = {}) {
  const params = new URLSearchParams();
  if (nao_lidas) params.set('nao_lidas', '1');
  if (retornos_para_decisao) params.set('retornos_para_decisao', '1');
  if (limit) params.set('limit', String(limit));
  if (page) params.set('page', String(page));
  if (Array.isArray(tipos) && tipos.length > 0) {
    params.set('tipos', tipos.join(','));
  }

  const res = await fetch(`${API_URL}/notificacoes?${params.toString()}`, {
    headers: authHeaders()
  });

  if (!res.ok) {
    throw new Error('Erro ao buscar notificacoes');
  }

  return res.json();
}

export async function marcarNotificacaoLida(destinatarioId) {
  const res = await fetch(`${API_URL}/notificacoes/${destinatarioId}/lida`, {
    method: 'PATCH',
    headers: authHeaders()
  });

  if (!res.ok) {
    throw new Error('Erro ao marcar notificacao como lida');
  }
}

export async function marcarTodasNotificacoesLidas() {
  const res = await fetch(`${API_URL}/notificacoes/lidas`, {
    method: 'PATCH',
    headers: authHeaders()
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || 'Erro ao marcar notificacoes como lidas');
  }

  return data;
}
