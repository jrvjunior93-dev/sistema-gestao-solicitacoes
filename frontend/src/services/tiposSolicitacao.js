const API_URL = 'http://localhost:3001/tipos-solicitacao';

export async function getTiposSolicitacao() {
  const res = await fetch(API_URL);
  if (!res.ok) throw new Error('Erro ao buscar tipos');
  return res.json();
}

export async function criarTipoSolicitacao(data) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  if (!res.ok) throw new Error('Erro ao criar tipo');
  return res.json();
}
