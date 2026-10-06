import { API_URL, authHeaders } from './api';

export async function getEstadoControleDiarioCaixa() {
  const response = await fetch(`${API_URL}/auth/controle-diario-contas`, {
    headers: authHeaders(), cache: 'no-store'
  });
  if (!response.ok) throw new Error('Não foi possível verificar o controle diário. Tente novamente ou contate o administrador.');
  return response.json();
}
