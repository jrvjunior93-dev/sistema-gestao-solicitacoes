const API_URL = 'http://localhost:3001';

export async function getSolicitacoes() {
  const response = await fetch(`${API_URL}/solicitacoes`);

  if (!response.ok) {
    throw new Error('Erro ao buscar solicitações');
  }

  return response.json();
}
