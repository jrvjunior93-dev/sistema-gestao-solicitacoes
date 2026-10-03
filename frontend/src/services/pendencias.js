import { API_URL, authHeaders } from './api';

// Pendências acionáveis do usuário logado, exibidas no Hub Principal.
// Cada item vem de uma consulta nomeada no backend
// (backend/src/controllers/DashboardPendenciasController.js) com SQL de
// conferência documentado em docs/PENDENCIAS-SQL.md.
export async function getPendenciasUsuario() {
  const response = await fetch(`${API_URL}/dashboard/pendencias`, {
    headers: authHeaders()
  });
  if (!response.ok) {
    throw new Error('Erro ao carregar pendências');
  }
  return response.json();
}
