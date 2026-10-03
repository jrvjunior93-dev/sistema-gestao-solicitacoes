import { API_URL, authHeaders } from './api';
import { mensagemDeErro } from './erroDeResposta';

/* A escolha da mensagem é do `erroDeResposta` — uma regra, um arquivo.
   Aqui ficava a mesma dança de try/JSON.parse/SyntaxError repetida em 30
   serviços, e o `text ||` do final era o que despejava HTML de servidor na
   tela (achado A2). */
async function parseJson(response, fallbackMessage) {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(mensagemDeErro(text, fallbackMessage, response.status));
  }

  return text ? JSON.parse(text) : null;
}

function buildQuery(params = {}) {
  return new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
}

export async function getEmpresasGrupo(params = {}) {
  const query = buildQuery(params);
  const url = query ? `${API_URL}/empresas-grupo?${query}` : `${API_URL}/empresas-grupo`;
  const response = await fetch(url, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao buscar empresas do grupo');
}

export async function criarEmpresaGrupo(data) {
  const response = await fetch(`${API_URL}/empresas-grupo`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return parseJson(response, 'Erro ao criar empresa do grupo');
}

export async function atualizarEmpresaGrupo(id, data) {
  const response = await fetch(`${API_URL}/empresas-grupo/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return parseJson(response, 'Erro ao atualizar empresa do grupo');
}
