import { API_URL, authHeaders } from './api';

// Layout em blocos por setor (camada do admin) — `tela` escolhe o
// catálogo: 'detalhe-solicitacao' (padrão) ou 'home'. A camada do
// usuário usa usuario_lista_preferencias (mesmas chaves).

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

export async function getDetalheLayouts(setor, tela = 'detalhe-solicitacao') {
  const params = new URLSearchParams();
  if (setor) params.set('setor', setor);
  if (tela) params.set('tela', tela);
  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`${API_URL}/configuracoes/detalhe-layout${query}`, {
    headers: authHeaders()
  });
  const data = await parseResponse(response, 'Erro ao carregar layouts do detalhe');
  return Array.isArray(data) ? data : [];
}

export async function salvarDetalheLayout(setor, config, tela = 'detalhe-solicitacao') {
  const response = await fetch(`${API_URL}/configuracoes/detalhe-layout/${encodeURIComponent(setor)}?tela=${encodeURIComponent(tela)}`, {
    method: 'PUT',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ config })
  });
  return parseResponse(response, 'Erro ao salvar layout do detalhe');
}

export async function excluirDetalheLayout(setor, tela = 'detalhe-solicitacao') {
  const response = await fetch(`${API_URL}/configuracoes/detalhe-layout/${encodeURIComponent(setor)}?tela=${encodeURIComponent(tela)}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  return parseResponse(response, 'Erro ao excluir layout do detalhe');
}
