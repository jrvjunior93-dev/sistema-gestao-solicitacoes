import { API_URL, authHeaders } from './api';

// Busca universal (Ctrl+K). O backend devolve grupos prontos, cada um
// já filtrado pela MESMA regra de visibilidade da tela correspondente.
export async function buscarUniversal(q, { signal } = {}) {
  const response = await fetch(`${API_URL}/busca?q=${encodeURIComponent(q)}`, {
    headers: authHeaders(),
    signal
  });
  if (!response.ok) throw new Error('Erro na busca');
  const data = await response.json();
  return Array.isArray(data?.grupos) ? data.grupos : [];
}
